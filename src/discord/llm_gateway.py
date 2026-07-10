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
        self.inflight_requests = 0
        self.switching = False

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
        async def _llm_compaction(messages: list[dict], system: str) -> str:
            client = self.active_client
            if not client:
                raise RuntimeError("No LLM provider configured")
            return await client.chat(messages=messages, system=system, max_tokens=1500)

        async def _llm_reflection(messages: list[dict], system: str) -> str:
            client = self.active_client
            if not client:
                raise RuntimeError("No LLM provider configured")
            return await client.chat(messages=messages, system=system, max_tokens=2000)

        self.sessions.set_compaction_fn(_llm_compaction)
        self.reflector.set_text_fn(_llm_reflection)

    # ---------- live reloads -------------------------------------------------

    async def reload_codex_inner(self) -> dict:
        """Inner reload — caller must hold provider_lock."""
        config = self.get_config()
        if not config.openai_codex.enabled:
            self.codex_client = None
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
        log.info("Codex client created via live reload (model: %s)", config.openai_codex.model)
        return {"configured": True, "created": True, "accounts": len(auth._accounts)}

    async def reload_codex(self) -> dict:
        """Reload Codex credentials and create the client if it was missing at boot."""
        async with self.provider_lock:
            return await self.reload_codex_inner()

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

    async def switch_provider(self, provider: str) -> dict:
        """Switch the active LLM provider at runtime."""
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
            finally:
                self.switching = False

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
        if (
            user_message
            and active == "codex"
            and self.model_router is not None
            and self.auxiliary_llm_client is not None
        ):
            try:
                decision = await self.model_router.route(user_message)
                if not decision.use_strong:
                    client = self.auxiliary_llm_client
                    log.debug(
                        "model_router: routing to cheap model (intent=%s, conf=%.2f)",
                        decision.intent.value,
                        decision.confidence,
                    )
            except Exception:
                log.exception("model_router.route failed; using strong model (non-fatal)")

        try:
            try:
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
                    active_model = getattr(client, "model", "unknown")
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
