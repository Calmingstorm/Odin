"""LLM provider management (RFC-001 Phase 4).

``LLMGateway`` owns the provider clients (Codex/Ollama/Kimi), the
active-provider resolution, live reloads, runtime provider switching, and
the guarded ``call_with_tools`` path (provider lock, subsystem-guard
health, model routing to the auxiliary cheap client, cost tracking).
Bodies are verbatim moves from ``OdinBot``.

Since RFC-002 P7 the gateway IS the public LLM surface: the web layer,
tests, and every component read/replace the provider clients here
(``bot.llm_gateway.codex_client`` …) — the old bot property shims are
retired.

Deliberately NOT routed through here: the autonomous loop's LLM calls —
it calls ``active_client.chat_with_tools`` directly, bypassing cost
tracking / routing / the subsystem guard. That asymmetry is intentional
and pinned (RFC-001 §4.3); do not "fix" it in this phase.

``get_config`` is a provider callable (the web API's config hot-reload
replaces the config object).
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass

from ..config.persistence import config_transaction
from ..llm import CodexChatClient, KimiClient, OllamaClient
from ..llm.circuit_breaker import CircuitOpenError
from ..llm.codex_auth import CodexAuthPool
from ..llm.errors import LLMCapacityError
from ..llm.model_breaker import ModelBreakerRegistry, ModelCapacityBreaker
from ..llm.recovery import RecoveryPolicy
from ..odin_log import get_logger

log = get_logger("discord")


@dataclass(frozen=True)
class _AuxBuildInputs:
    """Immutable config consumed while constructing an auxiliary candidate."""

    max_tokens: int
    retry_max_retries: int
    retry_base_delay: float
    retry_max_delay: float
    pool_max_connections: int
    pool_keepalive_timeout: int
    request_timeout: int
    stream_stall_timeout: int


@dataclass(frozen=True)
class _AuxReloadPlan:
    """State captured atomically before a network probe.

    The probe may take arbitrarily long. Commit compares this evidence under
    the config lock and provider lock so a candidate can never overwrite newer
    config or bind to a retired primary generation.
    """

    desired_enabled: bool
    desired_model: str
    prior_enabled: bool
    prior_model: str
    build: _AuxBuildInputs
    primary: object | None
    generation: int

    @property
    def desired(self) -> dict:
        return {"enabled": self.desired_enabled, "model": self.desired_model}


class LLMGateway:
    def __init__(
        self,
        *,
        get_config: Callable,
        codex_client: CodexChatClient | None,
        ollama_client: OllamaClient | None,
        kimi_client: KimiClient | None,
        subsystem_guard,
        auxiliary_llm_client,
        cost_tracker,
        sessions,
        reflector,
        model_breakers: ModelBreakerRegistry | None = None,
        recovery_policy_source: Callable[[], RecoveryPolicy] | None = None,
    ) -> None:
        self.get_config = get_config
        self.codex_client = codex_client
        self.ollama_client = ollama_client
        self.kimi_client = kimi_client
        self.subsystem_guard = subsystem_guard
        self.auxiliary_llm_client = auxiliary_llm_client
        self.cost_tracker = cost_tracker
        self.sessions = sessions
        self.reflector = reflector
        # Capacity-breaker registry: BotServices-owned in production so state
        # survives client rebuilds/live reloads; a private default keeps
        # existing constructions (tests) working.
        self.model_breakers = model_breakers or ModelBreakerRegistry()
        self._recovery_policy_source = recovery_policy_source or RecoveryPolicy
        self.provider_lock = asyncio.Lock()
        # Auxiliary live-reload state: a monotonic generation guards against a
        # candidate built under a config a concurrent reload has since
        # changed; _aux_drains tracks background drains of retired wrappers.
        self._aux_reload_gen = 0
        self._aux_drains: set = set()
        self.inflight_requests = 0
        self.switching = False
        # Called after a provider switch settles — wiring points it at the tool
        # catalog's invalidate() so provider-gated tools (e.g. native image gen,
        # available only on Codex) reappear/disappear on the next request.
        self.on_provider_switch: Callable[[], None] | None = None

    # ---------- provider resolution ----------------------------------------

    @property
    def active_client(self):
        """Return whichever LLM provider is currently active."""
        provider_cfg = getattr(self.get_config(), "llm_provider", None)
        active = provider_cfg.active_provider if provider_cfg else "codex"
        if active == "ollama" and self.ollama_client is not None:
            return self.ollama_client
        if active == "kimi" and self.kimi_client is not None:
            return self.kimi_client
        return self.codex_client

    def recovery_policy(self) -> RecoveryPolicy:
        """The live recovery policy (config-backed via wiring)."""
        return self._recovery_policy_source()

    def capacity_breaker_for(self, model: str | None = None) -> ModelCapacityBreaker:
        """Model-scoped capacity breaker for the active provider.

        ``model`` must be the EFFECTIVE model of the request when the caller
        overrides it (agents); defaults to the active client's model.
        """
        provider_cfg = getattr(self.get_config(), "llm_provider", None)
        active = provider_cfg.active_provider if provider_cfg else "codex"
        effective = model
        if not effective:
            client = self.active_client
            effective = getattr(client, "model", None) if client is not None else None
        return self.model_breakers.for_model(active, str(effective or "unknown"))

    def notify_generation_success(self, provider: str | None) -> None:
        """Success signal from a path that bypasses ``call_with_tools``
        (agents, autonomous loops).

        This is the production ``mark_available`` wiring: a latched
        ``llm_*`` guard key can never see a gateway success (check() blocks
        the call), but bypass-path successes prove the subsystem is fine.

        ``provider`` MUST come from the response's immutable provenance
        (``provenance_provider``) — never from whichever provider is active
        after the await. Missing provenance is a no-op, never a guess.
        """
        if self.subsystem_guard is None or not provider:
            return
        self.subsystem_guard.record_success(f"llm_{provider}")

    def wire_callbacks(self) -> None:
        """Attach LLM-backed compaction and reflection callbacks using the active provider."""

        # Compaction emits a segment of up to ~2500 chars (≈625 tokens) plus
        # structured header lines; reflection emits multi-lesson JSON. The old
        # 300/500 caps guaranteed mid-output truncation on providers that honor
        # max_tokens (Ollama/Kimi) — truncated reflection JSON parsed to [] and
        # silently dropped lessons. (Codex ignores max_tokens entirely.)
        # These callbacks resolve the auxiliary pointer at CALL TIME, not wire
        # time — capturing aux.make_chat_fn() here would pin the wrapper and
        # break the live reload swap. When a named task is enabled on the
        # CURRENT auxiliary wrapper (and Codex is the active provider), it
        # routes cheap (with the wrapper's own primary fallback); otherwise
        # the active client handles it, preserving today's token limits.
        async def _named_task(
            task: str, messages: list[dict], system: str, max_tokens: int
        ) -> str:
            aux = self.auxiliary_llm_client
            provider_cfg = getattr(self.get_config(), "llm_provider", None)
            active = provider_cfg.active_provider if provider_cfg else "codex"
            if aux is not None and active == "codex":
                return await aux.chat(messages, system, task=task, max_tokens=max_tokens)
            client = self.active_client
            if not client:
                raise RuntimeError("No LLM provider configured")
            return await client.chat(messages=messages, system=system, max_tokens=max_tokens)

        async def _llm_compaction(messages: list[dict], system: str) -> str:
            return await _named_task("compaction", messages, system, 1500)

        async def _llm_reflection(messages: list[dict], system: str) -> str:
            return await _named_task("reflection", messages, system, 2000)

        async def _llm_consolidation(messages: list[dict], system: str) -> str:
            return await _named_task("consolidation", messages, system, 2000)

        self.sessions.set_compaction_fn(_llm_compaction)
        self.reflector.set_text_fn(_llm_reflection)
        self.reflector.set_consolidation_fn(_llm_consolidation)

    # ---------- live reloads -------------------------------------------------

    def _reconcile_auxiliary_primary(self) -> None:
        """Keep the auxiliary wrapper consistent with the primary Codex client
        after a primary lifecycle change (caller holds provider_lock).

        Primary gone → retire auxiliary (its fallback would be a dead client).
        Primary recreated with a live wrapper → rebind its fallback to the new
        primary. Primary created while configured auxiliary is ABSENT (startup
        credential miss, or after a disable→re-enable) → schedule the full
        generation-safe reload_auxiliary OUTSIDE this lock so it builds and
        probes the configured wrapper.
        """
        aux = self.auxiliary_llm_client
        if self.codex_client is None:
            if aux is not None:
                self.auxiliary_llm_client = None
                self._schedule_drain(aux)
            return
        if aux is not None:
            if getattr(aux, "primary_client", None) is not self.codex_client:
                aux.primary_client = self.codex_client
            return
        # Primary present, no live wrapper: build it if configured+enabled.
        # reload_auxiliary is self-locking — schedule it so it runs AFTER this
        # reload releases provider_lock (the task blocks on the lock meanwhile).
        aux_cfg = getattr(self.get_config().openai_codex, "auxiliary", None)
        if aux_cfg is not None and aux_cfg.enabled:
            task = asyncio.ensure_future(self.reload_auxiliary())
            self._aux_drains.add(task)
            task.add_done_callback(self._aux_drains.discard)

    async def reload_codex_inner(self) -> dict:
        """Inner reload — caller must hold provider_lock."""
        config = self.get_config()
        if not config.openai_codex.enabled:
            self.codex_client = None
            self._reconcile_auxiliary_primary()
            return {"configured": False, "reason": "openai_codex disabled in config"}

        if self.codex_client is not None:
            auth = getattr(self.codex_client, "auth", None)
            if isinstance(auth, CodexAuthPool):
                count = await auth.reload_async()
                # Config changes (model/max_tokens) must land on the live
                # client too — it reads self.model per request, and without
                # this a WebUI model switch only took effect after a restart.
                if self.codex_client.model != config.openai_codex.model:
                    log.info(
                        "Codex model updated via live reload: %s -> %s",
                        self.codex_client.model,
                        config.openai_codex.model,
                    )
                if (
                    getattr(self.codex_client, "reasoning_effort", None)
                    != config.openai_codex.reasoning_effort
                ):
                    log.info(
                        "Codex reasoning effort updated via live reload: %s -> %s",
                        getattr(self.codex_client, "reasoning_effort", None),
                        config.openai_codex.reasoning_effort,
                    )
                self.codex_client.model = config.openai_codex.model
                self.codex_client.max_tokens = config.openai_codex.max_tokens
                self.codex_client.reasoning_effort = config.openai_codex.reasoning_effort
                # Per-request transport values apply live; pool sizing is
                # session-construction state and needs a client rebuild.
                self.codex_client.request_timeout = config.openai_codex.request_timeout_seconds
                self.codex_client.stream_stall_timeout = (
                    config.openai_codex.stream_stall_timeout_seconds
                )
                self.codex_client.max_retries = config.openai_codex.retry.max_retries
                self.codex_client.retry_base_delay = config.openai_codex.retry.base_delay
                self.codex_client.retry_max_delay = config.openai_codex.retry.max_delay
                return {"configured": True, "reloaded": True, "accounts": count}

        auth = CodexAuthPool(config.openai_codex.credentials_path)
        if not auth.is_configured():
            return {"configured": False, "reason": "credentials file missing or empty"}

        self.codex_client = CodexChatClient(
            auth=auth,
            model=config.openai_codex.model,
            max_tokens=config.openai_codex.max_tokens,
            reasoning_effort=config.openai_codex.reasoning_effort,
            max_retries=config.openai_codex.retry.max_retries,
            retry_base_delay=config.openai_codex.retry.base_delay,
            retry_max_delay=config.openai_codex.retry.max_delay,
            pool_max_connections=config.openai_codex.connection_pool.max_connections,
            pool_keepalive_timeout=config.openai_codex.connection_pool.keepalive_timeout,
            request_timeout=config.openai_codex.request_timeout_seconds,
            stream_stall_timeout=config.openai_codex.stream_stall_timeout_seconds,
        )
        self.wire_callbacks()
        # The primary was just (re)created — rebind the auxiliary fallback to
        # it rather than leave the wrapper pointing at the old/absent primary.
        self._reconcile_auxiliary_primary()
        log.info("Codex client created via live reload (model: %s)", config.openai_codex.model)
        return {"configured": True, "created": True, "accounts": len(auth._accounts)}

    async def reload_codex(self) -> dict:
        """Reload Codex credentials and create the client if it was missing at boot."""
        async with self.provider_lock:
            return await self.reload_codex_inner()

    def _schedule_drain(self, wrapper) -> None:
        """Retire a wrapper generation via a TRACKED background drain — it
        waits for the lease count to reach zero (no wall-clock cut) then
        closes, entirely outside provider_lock. Tracked so it isn't GC'd and
        so shutdown can await outstanding drains."""
        if wrapper is None:
            return
        task = asyncio.ensure_future(wrapper.drain_and_close())
        self._aux_drains.add(task)
        task.add_done_callback(self._aux_drains.discard)

    def _apply_aux_desired(self, desired: dict) -> None:
        """Commit a validated auxiliary spec onto live config (under lock)."""
        aux_cfg = self.get_config().openai_codex.auxiliary
        aux_cfg.enabled = desired["enabled"]
        aux_cfg.model = desired["model"]

    def _snapshot_aux_build_inputs(self) -> _AuxBuildInputs:
        config = self.get_config().openai_codex
        return _AuxBuildInputs(
            max_tokens=config.max_tokens,
            retry_max_retries=config.retry.max_retries,
            retry_base_delay=config.retry.base_delay,
            retry_max_delay=config.retry.max_delay,
            pool_max_connections=config.connection_pool.max_connections,
            pool_keepalive_timeout=config.connection_pool.keepalive_timeout,
            request_timeout=config.request_timeout_seconds,
            stream_stall_timeout=config.stream_stall_timeout_seconds,
        )

    def prepare_auxiliary_reload(self, desired: dict | None = None) -> _AuxReloadPlan:
        """Capture every dependency for a reload while the caller holds the
        global config transaction.

        This method is synchronous, so its reads cannot interleave on the event
        loop. The returned plan is immutable and safe to carry across the live
        network probe; reload_auxiliary CAS-checks it before publishing.
        """
        aux = self.get_config().openai_codex.auxiliary
        wanted = desired or {"enabled": aux.enabled, "model": aux.model}
        return _AuxReloadPlan(
            desired_enabled=bool(wanted["enabled"]),
            desired_model=str(wanted["model"]),
            prior_enabled=aux.enabled,
            prior_model=aux.model,
            build=self._snapshot_aux_build_inputs(),
            primary=self.codex_client,
            generation=self._aux_reload_gen,
        )

    def _aux_plan_is_current(self, plan: _AuxReloadPlan) -> str | None:
        """Return a retry reason if a reload plan lost its compare-and-swap."""
        aux = self.get_config().openai_codex.auxiliary
        if (aux.enabled, aux.model) != (plan.prior_enabled, plan.prior_model):
            return "concurrent auxiliary config change; retry"
        if self._aux_reload_gen != plan.generation:
            return "concurrent reload; retry"
        if plan.desired_enabled:
            if self.codex_client is not plan.primary:
                return "concurrent reload: primary changed; retry"
            if self._snapshot_aux_build_inputs() != plan.build:
                return "concurrent Codex config change; retry"
        return None

    def _build_aux_candidate(self, desired: dict, primary, build: _AuxBuildInputs):
        """Construct a candidate solely from an immutable pre-probe plan.

        The auth pool is SHARED with the captured primary client. No live config
        is read here: every construction input is CAS-checked at commit.
        """
        from ..llm.auxiliary import AuxiliaryLLMClient

        aux_auth = primary.auth
        if not aux_auth.is_configured():
            return None, None
        candidate_client = CodexChatClient(
            auth=aux_auth,
            model=desired["model"],
            max_tokens=build.max_tokens,
            max_retries=build.retry_max_retries,
            retry_base_delay=build.retry_base_delay,
            retry_max_delay=build.retry_max_delay,
            pool_max_connections=build.pool_max_connections,
            pool_keepalive_timeout=build.pool_keepalive_timeout,
            request_timeout=build.request_timeout,
            stream_stall_timeout=build.stream_stall_timeout,
        )
        candidate = AuxiliaryLLMClient(
            aux_client=candidate_client,
            primary_client=primary,
            cost_tracker=self.cost_tracker,
        )
        return candidate, candidate_client

    async def _probe_aux(self, client) -> str | None:
        """Compatibility-probe a candidate's aux client OUTSIDE the lock: a
        minimal request that fails fast on an unsupported model. Returns None
        on success, else a reason string. A free-string model that the auth
        path rejects is caught HERE, before install/persist."""
        try:
            await client.chat([{"role": "user", "content": "ok"}], "", max_tokens=1)
            return None
        except Exception as exc:
            return f"model probe failed: {type(exc).__name__}"

    async def run_persist_settled(self, persist_sync):
        """Run the SYNC ``persist_sync`` write to settlement under the caller's
        held lock, cancellation-SAFE — for EVERY LLM-config persistence path.

        The write runs on an EXECUTOR future (``run_in_executor``), not an
        ``asyncio.to_thread`` task: an executor future is not a ``Task``, so
        the repository's ``asyncio.all_tasks()`` shutdown drain can't cancel
        it, and the filesystem worker always runs to completion. We wait on
        that future — repeatedly re-shielding through any caller cancellation
        — so the lock is never released while the write is still in flight.
        ``fut.exception()`` reflects the ACTUAL thread result: a cancelled
        caller is NEVER mistaken for a successful write.

        Returns ``(persist_exc_or_None, was_cancelled)``. The caller commits
        or exactly-restores, then re-raises cancellation, once state is
        coherent.
        """
        loop = asyncio.get_running_loop()
        fut = loop.run_in_executor(None, persist_sync)
        was_cancelled = False
        while not fut.done():
            try:
                await asyncio.shield(fut)
            except asyncio.CancelledError:
                was_cancelled = True
            except Exception:
                break  # worker raised; fut.done() is now True
        exc = fut.exception()
        return exc, was_cancelled

    def _snapshot_aux_config(self) -> dict:
        aux_cfg = self.get_config().openai_codex.auxiliary
        return {"enabled": aux_cfg.enabled, "model": aux_cfg.model}

    async def reload_auxiliary(
        self,
        desired: dict | None = None,
        persist=None,
        *,
        plan: _AuxReloadPlan | None = None,
    ) -> dict:
        """Transactional auxiliary reload using prepare/probe/CAS-commit.

        Preparation snapshots the merge base, candidate construction inputs,
        primary identity, and auxiliary generation under the global config
        lock. Candidate construction and the compatibility probe run with NO
        config/provider lock held. Commit reacquires config_transaction() OUTER
        and provider_lock inner, verifies the immutable plan, then swaps and
        persists atomically. A stale plan returns a retry result instead of
        overwriting newer state.
        """
        if plan is None:
            async with config_transaction():
                plan = self.prepare_auxiliary_reload(desired)
        elif desired is not None and plan.desired != desired:
            raise ValueError("auxiliary reload plan does not match desired state")
        desired = plan.desired

        # --- disabled: retire + persist as one locked transaction ---
        if not desired["enabled"]:
            committed = False
            was_cancelled = False
            prior_aux = None
            async with config_transaction(), self.provider_lock:
                stale_reason = self._aux_plan_is_current(plan)
                if stale_reason is not None:
                    return {"committed": False, "effective_enabled": False,
                            "reason": stale_reason}
                prior_cfg = self._snapshot_aux_config()
                prior_aux = self.auxiliary_llm_client
                self.auxiliary_llm_client = None
                self._apply_aux_desired(desired)
                self._aux_reload_gen += 1
                if persist is not None:
                    persist_exc, was_cancelled = await self.run_persist_settled(persist)
                    if persist_exc is not None:
                        # EXACT restore — no probed reload; disk unchanged.
                        self.auxiliary_llm_client = prior_aux
                        self._apply_aux_desired(prior_cfg)
                        self._aux_reload_gen += 1
                        log.warning("Auxiliary disable persist failed (restored prior)")
                        if not was_cancelled:
                            return {"committed": False, "effective_enabled": False,
                                    "reason": "persist failed"}
                    else:
                        committed = True
                else:
                    committed = True
            # Post-lock: drain prior on commit, then re-raise a cancellation
            # that arrived during persistence (state is now coherent).
            if committed:
                self._schedule_drain(prior_aux)
            if was_cancelled:
                raise asyncio.CancelledError
            return {"committed": True, "effective_enabled": False,
                    "reason": "auxiliary disabled"}

        primary_at_build = plan.primary
        if primary_at_build is None:
            return {"committed": False, "effective_enabled": False,
                    "reason": "no primary Codex client to bind"}
        # Reject already-stale plans before constructing or probing a client.
        # Commit repeats this check because state may change while the network
        # request is in flight.
        stale_reason = self._aux_plan_is_current(plan)
        if stale_reason is not None:
            return {"committed": False, "effective_enabled": False,
                    "reason": stale_reason}

        # --- phase 1: build + probe with neither mutation lock held ---
        try:
            candidate, candidate_client = self._build_aux_candidate(
                desired, primary_at_build, plan.build
            )
        except Exception as exc:
            log.exception("Auxiliary reload: candidate build failed")
            return {"committed": False, "effective_enabled": False,
                    "reason": f"build failed: {exc}"}
        if candidate is None:
            return {"committed": False, "effective_enabled": False,
                    "reason": "auxiliary credentials missing"}

        # A single finally retires the candidate on EVERY non-install exit —
        # probe failure, CAS rejection, persist failure, and cancellation while
        # probing or waiting for either lock.
        installed = False
        retired = None
        was_cancelled = False
        try:
            probe_reason = await self._probe_aux(candidate_client)
            if probe_reason is not None:
                return {"committed": False, "effective_enabled": False,
                        "reason": probe_reason}
            async with config_transaction(), self.provider_lock:
                stale_reason = self._aux_plan_is_current(plan)
                if stale_reason is not None:
                    return {"committed": False, "effective_enabled": False,
                            "reason": stale_reason}
                prior_cfg = self._snapshot_aux_config()
                prior_aux = self.auxiliary_llm_client
                self.auxiliary_llm_client = candidate
                self._apply_aux_desired(desired)
                self._aux_reload_gen += 1
                if persist is not None:
                    persist_exc, was_cancelled = await self.run_persist_settled(persist)
                    if persist_exc is not None:
                        self.auxiliary_llm_client = prior_aux
                        self._apply_aux_desired(prior_cfg)
                        self._aux_reload_gen += 1
                        log.warning("Auxiliary enable persist failed (restored prior)")
                        if not was_cancelled:
                            return {"committed": False, "effective_enabled": False,
                                    "reason": "persist failed"}
                    else:
                        retired = prior_aux
                        installed = True
                else:
                    retired = prior_aux
                    installed = True
            if installed:
                self._schedule_drain(retired)
            if was_cancelled:
                raise asyncio.CancelledError
            log.info("Auxiliary reloaded (model: %s)", desired["model"])
            return {"committed": True, "effective_enabled": True,
                    "model": desired["model"]}
        finally:
            if not installed:
                self._schedule_drain(candidate)

    async def reload_ollama_inner(self) -> dict:
        """Inner reload — caller must hold provider_lock."""
        ollama_cfg = getattr(self.get_config(), "ollama", None)
        if not ollama_cfg or not ollama_cfg.enabled:
            old = self.ollama_client
            self.ollama_client = None
            if old:
                asyncio.get_event_loop().call_later(
                    5, lambda: asyncio.ensure_future(old.close())  # type: ignore[union-attr]  # deferred close inside if old:
                )
            return {"configured": False, "reason": "ollama disabled in config"}

        old = self.ollama_client
        self.ollama_client = OllamaClient(
            base_url=ollama_cfg.base_url,
            model=ollama_cfg.model,
            max_tokens=ollama_cfg.max_tokens,
            timeout=ollama_cfg.timeout,
            api_key=ollama_cfg.api_key,
        )
        if old:
            asyncio.get_event_loop().call_later(5, lambda: asyncio.ensure_future(old.close()))
        self.wire_callbacks()
        log.info(
            "Ollama client reloaded (model: %s, url: %s)", ollama_cfg.model, ollama_cfg.base_url
        )
        return {"configured": True}

    async def reload_ollama(self) -> dict:
        """Reload Ollama client from current config."""
        async with self.provider_lock:
            result = await self.reload_ollama_inner()
        if result.get("configured") and self.ollama_client:
            result["health"] = await self.ollama_client.health_check()
        return result

    async def reload_kimi_inner(self) -> dict:
        """Inner reload — caller must hold provider_lock."""
        kimi_cfg = getattr(self.get_config(), "kimi", None)
        if not kimi_cfg or not kimi_cfg.enabled:
            old = self.kimi_client
            self.kimi_client = None
            if old:
                asyncio.get_event_loop().call_later(
                    5, lambda: asyncio.ensure_future(old.close())  # type: ignore[union-attr]  # deferred close inside if old:
                )
            return {"configured": False, "reason": "kimi disabled in config"}
        if not kimi_cfg.api_key:
            return {"configured": False, "reason": "kimi api_key not set"}

        old = self.kimi_client
        self.kimi_client = KimiClient(
            api_key=kimi_cfg.api_key,
            model=kimi_cfg.model,
            max_tokens=kimi_cfg.max_tokens,
            timeout=kimi_cfg.timeout,
        )
        if old:
            asyncio.get_event_loop().call_later(5, lambda: asyncio.ensure_future(old.close()))
        self.wire_callbacks()
        log.info("Kimi client reloaded (model: %s)", kimi_cfg.model)
        return {"configured": True}

    async def reload_kimi(self) -> dict:
        """Reload Kimi client from current config."""
        async with self.provider_lock:
            result = await self.reload_kimi_inner()
        if result.get("configured") and self.kimi_client:
            result["health"] = await self.kimi_client.health_check()
        return result

    async def switch_provider(self, provider: str, persist=None) -> dict:
        """Switch the active LLM provider at runtime.

        Mutation AND persistence happen under ONE uninterrupted provider_lock
        ownership: on a persist failure the prior provider is restored before
        the lock releases, so the live switch and its disk state never split.
        """
        if provider not in ("codex", "ollama", "kimi"):
            return {"error": f"Unknown provider: {provider}"}

        async with self.provider_lock:
            if provider == "codex" and not self.codex_client:
                return {"error": "Codex not configured — authenticate first"}
            if provider == "ollama" and not self.ollama_client:
                return {"error": "Ollama not configured — enable and set base_url first"}
            if provider == "kimi" and not self.kimi_client:
                return {"error": "Kimi not configured — set api_key first"}

            self.switching = True
            prior_provider = self.get_config().llm_provider.active_provider
            was_cancelled = False
            try:
                if self.inflight_requests > 0:
                    log.warning(
                        "Provider switch while %d request(s) in-flight — waiting",
                        self.inflight_requests,
                    )
                    for _ in range(50):
                        if self.inflight_requests == 0:
                            break
                        await asyncio.sleep(0.1)

                self.get_config().llm_provider.active_provider = provider
                self.wire_callbacks()
                if self.on_provider_switch is not None:
                    self.on_provider_switch()

                if persist is not None:
                    persist_exc, was_cancelled = await self.run_persist_settled(persist)
                    if persist_exc is not None and not was_cancelled:
                        # Restore the prior provider under the same lock so the
                        # live switch never outruns the (unchanged) disk state.
                        self.get_config().llm_provider.active_provider = prior_provider
                        self.wire_callbacks()
                        if self.on_provider_switch is not None:
                            self.on_provider_switch()
                        log.warning("Provider-switch persist failed (restored %s)", prior_provider)
                        return {"error": "persist failed"}
                    if persist_exc is not None:
                        # cancelled + persist failed → restore, then re-raise.
                        self.get_config().llm_provider.active_provider = prior_provider
                        self.wire_callbacks()
                        if self.on_provider_switch is not None:
                            self.on_provider_switch()
            finally:
                self.switching = False

        # Post-lock: re-raise a cancellation that arrived during persistence
        # (runtime/disk state is coherent — committed on success, restored on
        # failure — before the cancellation propagates).
        if was_cancelled:
            raise asyncio.CancelledError
        client = self.active_client
        model = getattr(client, "model", "unknown") if client else "none"
        log.info("LLM provider switched to %s (model: %s)", provider, model)
        return {"active_provider": provider, "model": model}

    # ---------- guarded call --------------------------------------------------

    async def call_with_tools(
        self,
        *,
        messages: list,
        system: str,
        tools: list,
        user_id: str = "",
        channel_id: str = "",
        tools_used: list[str] | None = None,
        **kwargs,
    ):
        """Wrap chat_with_tools with cost / subsystem wiring.

        - subsystem_guard.check() short-circuits if the provider is UNAVAILABLE
        - cost_tracker.record() captures token usage on every successful call
        - subsystem_guard.record_success / record_failure tracks provider health
        """
        async with self.provider_lock:
            if self.switching:
                raise RuntimeError("LLM provider switch in progress — retry shortly")
            client = self.active_client
            if client is None:
                raise RuntimeError("No LLM provider configured")
            self.inflight_requests += 1
            provider_cfg = getattr(self.get_config(), "llm_provider", None)
            active = provider_cfg.active_provider if provider_cfg else "codex"

        guard_key = f"llm_{active}"
        if self.subsystem_guard is not None:
            err = self.subsystem_guard.check(guard_key)
            if err:
                self.inflight_requests -= 1
                raise RuntimeError(f"LLM subsystem unavailable: {err}")

        try:
            try:
                resp = await client.chat_with_tools(
                    messages=messages, system=system, tools=tools, **kwargs
                )
            except Exception as exc:
                if self.subsystem_guard is not None:
                    if isinstance(exc, (LLMCapacityError, CircuitOpenError)):
                        # Capacity (and the client breaker's echoes of it)
                        # never feeds the sticky failure counter — the
                        # model-scoped breaker owns capacity admission, and
                        # counting both was the double penalty that let an
                        # outage latch the guard UNAVAILABLE until restart.
                        # Visibility only: transient DEGRADED, self-expiring.
                        self.subsystem_guard.mark_degraded_transient(
                            guard_key, str(exc)[:200], expires_in=120.0
                        )
                    else:
                        self.subsystem_guard.record_failure(guard_key, str(exc))
                raise
            if self.subsystem_guard is not None:
                self.subsystem_guard.record_success(guard_key)
            if self.cost_tracker is not None:
                try:
                    # Single cost owner: prefer the response's truthful
                    # provenance model (the routed wrapper has no .model);
                    # fall back to the client's model for direct calls.
                    active_model = (
                        getattr(resp, "provenance_model", None)
                        or getattr(client, "model", "unknown")
                    )
                    self.cost_tracker.record(
                        int(getattr(resp, "input_tokens", 0) or 0),
                        int(getattr(resp, "output_tokens", 0) or 0),
                        model=active_model,
                        user_id=user_id,
                        channel_id=channel_id,
                        tools_used=tools_used or [],
                    )
                except Exception:
                    log.exception("CostTracker.record failed (non-fatal)")
            return resp
        finally:
            self.inflight_requests -= 1
