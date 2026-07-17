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

from ..llm import CodexChatClient, KimiClient, OllamaClient
from ..llm.codex_auth import CodexAuthPool
from ..odin_log import get_logger

log = get_logger("discord")


class LLMGateway:
    def __init__(
        self,
        *,
        get_config: Callable,
        codex_client: CodexChatClient | None,
        ollama_client: OllamaClient | None,
        kimi_client: KimiClient | None,
        subsystem_guard,
        model_router,
        auxiliary_llm_client,
        cost_tracker,
        sessions,
        reflector,
    ) -> None:
        self.get_config = get_config
        self.codex_client = codex_client
        self.ollama_client = ollama_client
        self.kimi_client = kimi_client
        self.subsystem_guard = subsystem_guard
        self.model_router = model_router
        self.auxiliary_llm_client = auxiliary_llm_client
        self.cost_tracker = cost_tracker
        self.sessions = sessions
        self.reflector = reflector
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
            if aux is not None and active == "codex" and aux.is_enabled(task):
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
                if self.model_router is not None:
                    self.model_router.aux_client = None
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
        aux_cfg.tasks = list(desired["tasks"])

    def _build_aux_candidate(self, desired: dict, primary):
        """Construct a candidate wrapper from an IMMUTABLE desired spec bound
        to ``primary`` — no live config read, so a concurrent config change
        can't leak into this candidate."""
        from ..llm.auxiliary import AuxiliaryLLMClient

        config = self.get_config()
        aux_creds = desired["credentials_path"] or config.openai_codex.credentials_path
        aux_auth = CodexAuthPool(aux_creds)
        if not aux_auth.is_configured():
            return None, None
        candidate_client = CodexChatClient(
            auth=aux_auth,
            model=desired["model"],
            max_tokens=desired["max_tokens"],
            max_retries=config.openai_codex.retry.max_retries,
            retry_base_delay=config.openai_codex.retry.base_delay,
            retry_max_delay=config.openai_codex.retry.max_delay,
            pool_max_connections=config.openai_codex.connection_pool.max_connections,
            pool_keepalive_timeout=config.openai_codex.connection_pool.keepalive_timeout,
            request_timeout=config.openai_codex.request_timeout_seconds,
            stream_stall_timeout=config.openai_codex.stream_stall_timeout_seconds,
        )
        candidate = AuxiliaryLLMClient(
            aux_client=candidate_client,
            primary_client=primary,
            enabled_tasks=set(desired["tasks"]),
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
        return {
            "enabled": aux_cfg.enabled, "model": aux_cfg.model,
            "tasks": list(aux_cfg.tasks),
            "credentials_path": aux_cfg.credentials_path,
            "max_tokens": aux_cfg.max_tokens,
        }

    async def reload_auxiliary(self, desired: dict | None = None, persist=None) -> dict:
        """Transactional live reload of the auxiliary wrapper.

        Self-locking — must NOT be called under ``provider_lock``. ``desired``
        is an IMMUTABLE spec; when None the current config is snapshotted. The
        candidate is built and compatibility-probed OUTSIDE the lock. UNDER the
        lock, ONE transaction: verify primary + reload generation, apply
        candidate pointers/config, then — if ``persist`` is given — run it as
        part of the same transaction; a persist failure restores the EXACT
        prior pointers/config before the lock releases (never a fresh probed
        reload). The retired wrapper drains only AFTER a successful persist;
        the candidate drains on any non-install exit. Nothing changes on disk
        or in runtime unless the whole transaction commits.
        """
        if desired is None:
            desired = self._snapshot_aux_config()
        gen_at_build = self._aux_reload_gen

        # --- disabled: retire + persist as one locked transaction ---
        if not desired["enabled"]:
            committed = False
            was_cancelled = False
            prior_aux = None
            async with self.provider_lock:
                if self._aux_reload_gen != gen_at_build:
                    return {"committed": False, "effective_enabled": False,
                            "reason": "concurrent reload; retry"}
                prior_cfg = self._snapshot_aux_config()
                prior_aux = self.auxiliary_llm_client
                prior_router = self.model_router.aux_client if self.model_router else None
                self.auxiliary_llm_client = None
                if self.model_router is not None:
                    self.model_router.aux_client = None
                self._apply_aux_desired(desired)
                self._aux_reload_gen += 1
                if persist is not None:
                    persist_exc, was_cancelled = await self.run_persist_settled(persist)
                    if persist_exc is not None:
                        # EXACT restore — no probed reload; disk unchanged.
                        self.auxiliary_llm_client = prior_aux
                        if self.model_router is not None:
                            self.model_router.aux_client = prior_router
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

        primary_at_build = self.codex_client
        if primary_at_build is None:
            return {"committed": False, "effective_enabled": False,
                    "reason": "no primary Codex client to bind"}

        # --- phase 1: build + probe OUTSIDE the lock ---
        try:
            candidate, candidate_client = self._build_aux_candidate(desired, primary_at_build)
        except Exception as exc:
            log.exception("Auxiliary reload: candidate build failed")
            return {"committed": False, "effective_enabled": False,
                    "reason": f"build failed: {exc}"}
        if candidate is None:
            return {"committed": False, "effective_enabled": False,
                    "reason": "auxiliary credentials missing"}

        # A single ``finally`` retires the candidate on EVERY non-install exit —
        # probe failure, generation rejection, persist failure, and cancellation
        # during the probe or while awaiting the lock — so an uninstalled session
        # can't leak. Cancellation stays authoritative (re-raised after drain).
        installed = False
        retired = None
        was_cancelled = False
        try:
            probe_reason = await self._probe_aux(candidate_client)
            if probe_reason is not None:
                return {"committed": False, "effective_enabled": False,
                        "reason": probe_reason}
            async with self.provider_lock:
                if self.codex_client is not primary_at_build:
                    return {"committed": False, "effective_enabled": False,
                            "reason": "primary changed during reload"}
                if self._aux_reload_gen != gen_at_build:
                    return {"committed": False, "effective_enabled": False,
                            "reason": "concurrent reload; retry"}
                prior_cfg = self._snapshot_aux_config()
                prior_aux = self.auxiliary_llm_client
                prior_router = self.model_router.aux_client if self.model_router else None
                self.auxiliary_llm_client = candidate
                if self.model_router is not None:
                    self.model_router.aux_client = candidate
                self._apply_aux_desired(desired)
                self._aux_reload_gen += 1
                if persist is not None:
                    persist_exc, was_cancelled = await self.run_persist_settled(persist)
                    if persist_exc is not None:
                        # EXACT restore of the prior generation, then drain the
                        # candidate (installed stays False → finally handles it).
                        self.auxiliary_llm_client = prior_aux
                        if self.model_router is not None:
                            self.model_router.aux_client = prior_router
                        self._apply_aux_desired(prior_cfg)
                        self._aux_reload_gen += 1
                        log.warning("Auxiliary enable persist failed (restored prior)")
                        if not was_cancelled:
                            return {"committed": False, "effective_enabled": False,
                                    "reason": "persist failed"}
                        # cancelled + restored → candidate drains via finally,
                        # cancellation re-raised after the lock.
                    else:
                        retired = prior_aux
                        installed = True
                else:
                    retired = prior_aux
                    installed = True
            # Post-lock: drain the retired generation on commit; a cancellation
            # that arrived during persistence is re-raised now (coherent state).
            if installed:
                self._schedule_drain(retired)
            if was_cancelled:
                raise asyncio.CancelledError
            log.info(
                "Auxiliary reloaded (model: %s, tasks: %s)",
                desired["model"], ", ".join(desired["tasks"]) or "none",
            )
            return {"committed": True, "effective_enabled": True,
                    "model": desired["model"], "tasks": list(desired["tasks"])}
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
        user_message: str = "",
        user_id: str = "",
        channel_id: str = "",
        tools_used: list[str] | None = None,
        **kwargs,
    ):
        """Wrap chat_with_tools with cost / subsystem / routing wiring.

        - subsystem_guard.check() short-circuits if the provider is UNAVAILABLE
        - model_router (when enabled and user_message given) picks cheap vs
          strong model; cheap path uses auxiliary_llm_client when available
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
        # Auxiliary cheap-model routing is Codex-only (the aux client is always a
        # CodexChatClient). When the operator has switched the active provider to
        # ollama/kimi, do NOT divert "cheap" turns back to Codex — that defeats the
        # provider switch and fails if Codex isn't authed. Let the active provider
        # handle everything.
        route_cheap = False
        if (
            user_message
            and active == "codex"
            and self.model_router is not None
            and self.auxiliary_llm_client is not None
        ):
            try:
                decision = await self.model_router.route(user_message)
                if not decision.use_strong:
                    route_cheap = True
                    log.debug(
                        "model_router: routing to cheap model (intent=%s, conf=%.2f)",
                        decision.intent.value,
                        decision.confidence,
                    )
            except Exception:
                log.exception("model_router.route failed; using strong model (non-fatal)")

        try:
            try:
                if route_cheap and self.auxiliary_llm_client is not None:
                    # Whole-turn cheap routing goes through the UNGATED routed
                    # path (the router already decided) — not chat_with_tools,
                    # which would consult the classification checkbox.
                    resp = await self.auxiliary_llm_client.chat_with_tools_routed(
                        messages, system, tools
                    )
                else:
                    resp = await client.chat_with_tools(
                        messages=messages, system=system, tools=tools, **kwargs
                    )
            except Exception as exc:
                if self.subsystem_guard is not None:
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
