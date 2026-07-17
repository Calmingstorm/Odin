"""Coverage for src/discord/llm_gateway.py (RFC-006 P11, safe tier-1).

LLMGateway owns provider resolution, live reloads, runtime switching, and the
guarded call_with_tools path. SAFE by construction: the provider client classes
(CodexChatClient/OllamaClient/KimiClient/CodexAuthPool) are patched so reloads
build fakes — no real tokens, no network, no health-check calls hit a server.
The deferred-close call_later is stubbed so nothing is scheduled on a live loop.
"""
from __future__ import annotations

import asyncio
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.discord.llm_gateway import LLMGateway


def _cfg(active="codex", codex_enabled=True, ollama_enabled=False,
         kimi_enabled=False, kimi_key=""):
    return SimpleNamespace(
        llm_provider=SimpleNamespace(active_provider=active),
        openai_codex=SimpleNamespace(enabled=codex_enabled, credentials_path="/creds",
                                     model="gpt-5.5", max_tokens=8000,
                                     reasoning_effort="medium",
                                     request_timeout_seconds=3600,
                                     stream_stall_timeout_seconds=180,
                                     retry=SimpleNamespace(max_retries=3, base_delay=1.0,
                                                           max_delay=30.0),
                                     connection_pool=SimpleNamespace(max_connections=10,
                                                                     keepalive_timeout=30)),
        ollama=SimpleNamespace(enabled=ollama_enabled, base_url="http://localhost:11434",
                               model="qwen", max_tokens=4096, timeout=300, api_key=""),
        kimi=SimpleNamespace(enabled=kimi_enabled, api_key=kimi_key,
                             model="kimi-k2", max_tokens=4096, timeout=300),
    )


def _gw(config=None, codex=None, ollama=None, kimi=None,
        guard=None, aux=None, cost=None):
    return LLMGateway(
        get_config=lambda: config if config is not None else _cfg(),
        codex_client=codex, ollama_client=ollama, kimi_client=kimi,
        subsystem_guard=guard, auxiliary_llm_client=aux,
        cost_tracker=cost, sessions=MagicMock(), reflector=MagicMock(),
    )


class TestActiveClientAndCallbacks:
    def test_active_client_resolution(self):
        codex, ollama, kimi = object(), object(), object()
        assert _gw(_cfg("codex"), codex, ollama, kimi).active_client is codex
        assert _gw(_cfg("ollama"), codex, ollama, kimi).active_client is ollama
        assert _gw(_cfg("kimi"), codex, ollama, kimi).active_client is kimi
        # ollama active but not configured → falls back to codex
        assert _gw(_cfg("ollama"), codex, None, kimi).active_client is codex

    def test_wire_callbacks(self):
        gw = _gw(codex=object())
        gw.wire_callbacks()
        gw.sessions.set_compaction_fn.assert_called_once()
        gw.reflector.set_text_fn.assert_called_once()

    async def test_callbacks_execute(self):
        client = SimpleNamespace(chat=AsyncMock(return_value="summary"))
        gw = _gw(codex=client)
        gw.wire_callbacks()
        compaction_fn = gw.sessions.set_compaction_fn.call_args.args[0]
        assert await compaction_fn([{"role": "user", "content": "x"}], "sys") == "summary"
        reflection_fn = gw.reflector.set_text_fn.call_args.args[0]
        assert await reflection_fn([], "sys") == "summary"

    async def test_switch_provider_fires_on_provider_switch(self):
        # The hook wiring points at the tool catalog's invalidate() so a live
        # switch rebuilds the registry (native image gen is Codex-only).
        gw = _gw(_cfg("kimi"), codex=object())
        fired: list[bool] = []
        gw.on_provider_switch = lambda: fired.append(True)
        result = await gw.switch_provider("codex")
        assert result["active_provider"] == "codex"
        assert fired == [True]

    async def test_callbacks_raise_without_client(self):
        gw = _gw(codex=None)  # no active client
        gw.wire_callbacks()
        compaction = gw.sessions.set_compaction_fn.call_args.args[0]
        reflection = gw.reflector.set_text_fn.call_args.args[0]
        with pytest.raises(RuntimeError, match="No LLM provider"):
            await compaction([], "s")
        with pytest.raises(RuntimeError, match="No LLM provider"):
            await reflection([], "s")


class TestReloadCodex:
    async def test_disabled(self):
        gw = _gw(_cfg(codex_enabled=False), codex=object())
        r = await gw.reload_codex_inner()
        assert r["configured"] is False and gw.codex_client is None

    async def test_existing_auth_pool_reloads(self):
        from src.discord.llm_gateway import CodexAuthPool
        pool = MagicMock(spec=CodexAuthPool)
        pool.reload_async = AsyncMock(return_value=3)
        client = SimpleNamespace(auth=pool, model="gpt-5.5", max_tokens=8000,
                                 reasoning_effort="medium")
        gw = _gw(codex=client)
        r = await gw.reload_codex_inner()
        assert r["reloaded"] is True and r["accounts"] == 3

    async def test_existing_client_gets_model_and_max_tokens_from_config(self):
        """Regression: a reload after a config PUT must land model/max_tokens
        on the LIVE client. The auth-pool branch used to return early without
        applying them, so WebUI model switches silently no-opped until the
        next restart while /api/llm/status kept reporting the old model."""
        from src.discord.llm_gateway import CodexAuthPool
        pool = MagicMock(spec=CodexAuthPool)
        pool.reload_async = AsyncMock(return_value=3)
        client = SimpleNamespace(auth=pool, model="gpt-5.5", max_tokens=8000,
                                 reasoning_effort="medium")
        cfg = _cfg()
        cfg.openai_codex.model = "gpt-5.6-terra"
        cfg.openai_codex.max_tokens = 4096
        cfg.openai_codex.reasoning_effort = "xhigh"
        gw = _gw(cfg, codex=client)
        r = await gw.reload_codex_inner()
        assert r["reloaded"] is True
        # same client object — auth pool, breaker, and session are preserved
        assert gw.codex_client is client
        assert client.model == "gpt-5.6-terra"
        assert client.max_tokens == 4096
        assert client.reasoning_effort == "xhigh"

    async def test_existing_client_gets_transport_values_from_config(self):
        """Companion to the model/max_tokens reload fix: the per-request
        transport values (timeouts, retry policy) must land on the LIVE
        client too, so a config change applies without a restart."""
        from src.discord.llm_gateway import CodexAuthPool
        pool = MagicMock(spec=CodexAuthPool)
        pool.reload_async = AsyncMock(return_value=3)
        client = SimpleNamespace(auth=pool, model="gpt-5.5", max_tokens=8000,
                                 reasoning_effort="medium",
                                 request_timeout=3600, stream_stall_timeout=180,
                                 max_retries=3, retry_base_delay=1.0,
                                 retry_max_delay=30.0)
        cfg = _cfg()
        cfg.openai_codex.request_timeout_seconds = 7200
        cfg.openai_codex.stream_stall_timeout_seconds = 90
        cfg.openai_codex.retry = SimpleNamespace(max_retries=5, base_delay=0.5,
                                                 max_delay=10.0)
        gw = _gw(cfg, codex=client)
        r = await gw.reload_codex_inner()
        assert r["reloaded"] is True
        assert client.request_timeout == 7200
        assert client.stream_stall_timeout == 90
        assert client.max_retries == 5
        assert client.retry_base_delay == 0.5
        assert client.retry_max_delay == 10.0

    async def test_created_client_receives_transport_kwargs(self):
        """A freshly created client must be constructed from the config's
        transport values — the retry/connection_pool config sections were
        previously documented but never plumbed (ctor defaults happened to
        match, so the gap was invisible)."""
        pool = MagicMock()
        pool.is_configured.return_value = True
        pool._accounts = [1]
        captured = {}

        def _fake_client(**kwargs):
            captured.update(kwargs)
            return MagicMock()

        with patch("src.discord.llm_gateway.CodexAuthPool", return_value=pool), \
             patch("src.discord.llm_gateway.CodexChatClient", side_effect=_fake_client):
            gw = _gw(codex=None)
            r = await gw.reload_codex_inner()
        assert r["created"] is True
        assert captured["request_timeout"] == 3600
        assert captured["stream_stall_timeout"] == 180
        assert captured["max_retries"] == 3
        assert captured["retry_base_delay"] == 1.0
        assert captured["retry_max_delay"] == 30.0
        assert captured["pool_max_connections"] == 10
        assert captured["pool_keepalive_timeout"] == 30

    async def test_creates_new_client(self):
        pool = MagicMock()
        pool.is_configured.return_value = True
        pool._accounts = [1, 2]
        with patch("src.discord.llm_gateway.CodexAuthPool", return_value=pool), \
             patch("src.discord.llm_gateway.CodexChatClient", return_value=MagicMock()):
            gw = _gw(codex=None)
            r = await gw.reload_codex_inner()
        assert r["created"] is True and r["accounts"] == 2

    async def test_credentials_missing(self):
        pool = MagicMock()
        pool.is_configured.return_value = False
        with patch("src.discord.llm_gateway.CodexAuthPool", return_value=pool):
            r = await _gw(codex=None).reload_codex_inner()
        assert r["configured"] is False and "credentials" in r["reason"]

    async def test_reload_wrapper_holds_lock(self):
        gw = _gw(_cfg(codex_enabled=False), codex=object())
        assert (await gw.reload_codex())["configured"] is False


class TestReloadOllamaKimi:
    async def test_ollama_disabled_closes_old(self):
        old = SimpleNamespace(close=AsyncMock())
        gw = _gw(_cfg(ollama_enabled=False), ollama=old)
        loop = asyncio.get_running_loop()
        with patch.object(loop, "call_later") as cl:  # record deferred close, don't schedule
            r = await gw.reload_ollama_inner()
        assert r["configured"] is False and gw.ollama_client is None
        assert cl.called  # old client's close was scheduled

    async def test_ollama_constructs(self):
        with patch("src.discord.llm_gateway.OllamaClient",
                   return_value=SimpleNamespace(health_check=AsyncMock(return_value={"ok": 1}),
                                                close=AsyncMock())):
            gw = _gw(_cfg(ollama_enabled=True))
            r = await gw.reload_ollama_inner()
            assert r["configured"] is True
            wrapped = await gw.reload_ollama()  # wrapper adds health
            assert wrapped["health"] == {"ok": 1}

    async def test_kimi_disabled_and_no_key(self):
        gw = _gw(_cfg(kimi_enabled=False))
        assert (await gw.reload_kimi_inner())["configured"] is False
        gw2 = _gw(_cfg(kimi_enabled=True, kimi_key=""))
        r = await gw2.reload_kimi_inner()
        assert r["configured"] is False and "api_key" in r["reason"]

    async def test_kimi_disabled_closes_old(self):
        old = SimpleNamespace(close=AsyncMock())
        gw = _gw(_cfg(kimi_enabled=False), kimi=old)
        loop = asyncio.get_running_loop()
        with patch.object(loop, "call_later") as cl:
            r = await gw.reload_kimi_inner()
        assert r["configured"] is False and gw.kimi_client is None and cl.called

    async def test_kimi_constructs(self):
        with patch("src.discord.llm_gateway.KimiClient",
                   return_value=SimpleNamespace(health_check=AsyncMock(return_value={"h": 1}),
                                                close=AsyncMock())):
            gw = _gw(_cfg(kimi_enabled=True, kimi_key="k"))
            assert (await gw.reload_kimi_inner())["configured"] is True
            assert (await gw.reload_kimi())["health"] == {"h": 1}


class TestSwitchProvider:
    async def test_unknown_and_unconfigured(self):
        gw = _gw()
        assert "error" in await gw.switch_provider("bogus")
        assert "Codex not configured" in (await _gw(codex=None).switch_provider("codex"))["error"]
        assert "Ollama not configured" in (
            await _gw(codex=object()).switch_provider("ollama"))["error"]
        assert "Kimi not configured" in (
            await _gw(codex=object()).switch_provider("kimi"))["error"]

    async def test_switch_success(self):
        cfg = _cfg("codex", ollama_enabled=True)
        gw = _gw(cfg, codex=object(), ollama=SimpleNamespace(model="qwen"))
        r = await gw.switch_provider("ollama")
        assert r["active_provider"] == "ollama" and r["model"] == "qwen"
        assert cfg.llm_provider.active_provider == "ollama"

    async def test_switch_waits_for_inflight(self):
        cfg = _cfg("codex", ollama_enabled=True)
        gw = _gw(cfg, codex=object(), ollama=SimpleNamespace(model="qwen"))
        gw.inflight_requests = 1  # never drops → loop runs its full budget
        with patch("asyncio.sleep", new=AsyncMock()):
            r = await gw.switch_provider("ollama")
        assert r["active_provider"] == "ollama"


class TestCallWithTools:
    async def test_no_client_and_switching(self):
        gw = _gw(codex=None)
        with pytest.raises(RuntimeError, match="No LLM provider"):
            await gw.call_with_tools(messages=[], system="s", tools=[])
        gw2 = _gw(codex=object())
        gw2.switching = True
        with pytest.raises(RuntimeError, match="switch in progress"):
            await gw2.call_with_tools(messages=[], system="s", tools=[])

    async def test_subsystem_guard_blocks(self):
        guard = MagicMock()
        guard.check.return_value = "circuit open"
        gw = _gw(codex=object(), guard=guard)
        with pytest.raises(RuntimeError, match="subsystem unavailable"):
            await gw.call_with_tools(messages=[], system="s", tools=[])

    async def test_success_records_cost(self):
        resp = SimpleNamespace(input_tokens=10, output_tokens=5)
        client = SimpleNamespace(chat_with_tools=AsyncMock(return_value=resp), model="gpt-5.5")
        guard = MagicMock()
        guard.check.return_value = None
        cost = MagicMock()
        gw = _gw(codex=client, guard=guard, cost=cost)
        out = await gw.call_with_tools(messages=[], system="s", tools=[], user_id="u")
        assert out is resp
        guard.record_success.assert_called_once()
        cost.record.assert_called_once()
        assert gw.inflight_requests == 0  # decremented in finally

    async def test_failure_records_and_raises(self):
        client = SimpleNamespace(chat_with_tools=AsyncMock(side_effect=RuntimeError("api")))
        guard = MagicMock()
        guard.check.return_value = None
        gw = _gw(codex=client, guard=guard)
        with pytest.raises(RuntimeError, match="api"):
            await gw.call_with_tools(messages=[], system="s", tools=[])
        guard.record_failure.assert_called_once()
        assert gw.inflight_requests == 0

    async def test_call_with_tools_preserves_provenance(self):
        """The gateway wrapper returns the child response's provenance
        unchanged — never overwritten with active_client/gateway identity."""
        from src.llm.types import LLMResponse
        resp = LLMResponse(text="ok", provenance_provider="codex",
                           provenance_model="gpt-5.6-sol",
                           provenance_reasoning_effort="xhigh")
        client = SimpleNamespace(chat_with_tools=AsyncMock(return_value=resp), model="gpt-5.5")
        gw = _gw(codex=client)
        out = await gw.call_with_tools(messages=[], system="s", tools=[])
        assert out is resp
        assert out.provenance_provider == "codex"
        assert out.provenance_model == "gpt-5.6-sol"
        assert out.provenance_reasoning_effort == "xhigh"

    async def test_cost_record_exception_non_fatal(self):
        resp = SimpleNamespace(input_tokens=1, output_tokens=1)
        client = SimpleNamespace(chat_with_tools=AsyncMock(return_value=resp), model="m")
        guard = MagicMock()
        guard.check.return_value = None
        cost = MagicMock()
        cost.record.side_effect = RuntimeError("cost boom")
        gw = _gw(codex=client, guard=guard, cost=cost)
        # cost tracking failure must not break the call
        assert await gw.call_with_tools(messages=[], system="s", tools=[]) is resp


class TestAuxiliaryRouting:
    """wire_callbacks resolves the aux pointer at CALL time (a live reload
    swap must be honored). Named jobs route through the wrapper whenever it is
    present and Codex is the active provider — there is no per-task gate."""

    async def test_named_task_routes_through_current_aux(self):
        aux = SimpleNamespace(chat=AsyncMock(return_value="cheap summary"))
        client = SimpleNamespace(chat=AsyncMock(return_value="strong summary"))
        gw = _gw(codex=client, aux=aux)
        gw.wire_callbacks()
        compaction_fn = gw.sessions.set_compaction_fn.call_args.args[0]
        assert await compaction_fn([], "s") == "cheap summary"
        aux.chat.assert_awaited_once()
        client.chat.assert_not_called()

    async def test_consolidation_wired_to_its_own_fn(self):
        aux = SimpleNamespace(chat=AsyncMock(return_value="cheap consolidation"))
        client = SimpleNamespace(chat=AsyncMock(return_value="strong"))
        gw = _gw(codex=client, aux=aux)
        gw.wire_callbacks()
        gw.reflector.set_consolidation_fn.assert_called_once()
        consolidation_fn = gw.reflector.set_consolidation_fn.call_args.args[0]
        assert await consolidation_fn([], "s") == "cheap consolidation"
        aux.chat.assert_awaited_once()

    async def test_named_task_uses_active_when_provider_not_codex(self):
        # Aux routing is Codex-only; on an ollama switch the named job must
        # stay on the active provider.
        aux = SimpleNamespace(chat=AsyncMock(return_value="cheap"))
        client = SimpleNamespace(chat=AsyncMock(return_value="ollama out"))
        gw = _gw(_cfg("ollama"), codex=object(), ollama=client, aux=aux)
        gw.wire_callbacks()
        compaction_fn = gw.sessions.set_compaction_fn.call_args.args[0]
        assert await compaction_fn([], "s") == "ollama out"
        aux.chat.assert_not_called()


class TestReloadAuxiliary:
    def _aux_cfg(self, enabled=True, model="gpt-5.6-terra"):
        cfg = _cfg()
        cfg.openai_codex.auxiliary = SimpleNamespace(enabled=enabled, model=model)
        return cfg

    @staticmethod
    async def _flush_drains(gw):
        # Retirement drains are TRACKED background tasks (never awaited under
        # the lock) — let them finish so drain assertions are deterministic.
        if gw._aux_drains:
            await asyncio.gather(*list(gw._aux_drains))

    @staticmethod
    def _patch_probe_ok(pool_cls, client_cls):
        pool_cls.return_value.is_configured.return_value = True
        client_cls.return_value.chat = AsyncMock(return_value="ok")

    async def test_disabled_retires_current_wrapper(self):
        old = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(self._aux_cfg(enabled=False), codex=object(), aux=old)
        r = await gw.reload_auxiliary()
        await self._flush_drains(gw)
        assert r["effective_enabled"] is False
        assert gw.auxiliary_llm_client is None
        old.drain_and_close.assert_awaited_once()

    async def test_enable_builds_swaps_and_drains(self):
        old = SimpleNamespace(drain_and_close=AsyncMock())
        candidate = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(self._aux_cfg(), codex=object(), aux=old)
        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls, \
             patch("src.discord.llm_gateway.CodexChatClient") as client_cls, \
             patch("src.llm.auxiliary.AuxiliaryLLMClient", return_value=candidate):
            self._patch_probe_ok(pool_cls, client_cls)
            r = await gw.reload_auxiliary()
        await self._flush_drains(gw)
        assert r["effective_enabled"] is True
        assert gw.auxiliary_llm_client is candidate
        old.drain_and_close.assert_awaited_once()  # retired one drained

    async def test_unsupported_model_probe_rolls_back(self):
        # An unsupported free-string model fails the probe BEFORE install —
        # the prior wrapper and config stay put; the candidate is drained.
        old = SimpleNamespace(drain_and_close=AsyncMock())
        candidate = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(self._aux_cfg(model="gpt-bogus"), codex=object(), aux=old)
        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls, \
             patch("src.discord.llm_gateway.CodexChatClient") as client_cls, \
             patch("src.llm.auxiliary.AuxiliaryLLMClient", return_value=candidate):
            pool_cls.return_value.is_configured.return_value = True
            client_cls.return_value.chat = AsyncMock(side_effect=RuntimeError("400 model"))
            r = await gw.reload_auxiliary()
        await self._flush_drains(gw)
        assert r["effective_enabled"] is False
        assert "probe" in r["reason"]
        assert gw.auxiliary_llm_client is old  # unchanged
        candidate.drain_and_close.assert_awaited_once()

    async def test_stale_generation_rejected(self):
        # A candidate built while another reload committed (generation moved)
        # is rejected under the lock and drained — never installed.
        candidate = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(self._aux_cfg(), codex=object(), aux=None)

        def _build(*a, **k):
            gw._aux_reload_gen += 1  # simulate a concurrent commit
            return candidate

        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls, \
             patch("src.discord.llm_gateway.CodexChatClient") as client_cls, \
             patch("src.llm.auxiliary.AuxiliaryLLMClient", side_effect=_build):
            self._patch_probe_ok(pool_cls, client_cls)
            r = await gw.reload_auxiliary()
        await self._flush_drains(gw)
        assert r["effective_enabled"] is False
        assert "concurrent" in r["reason"]
        assert gw.auxiliary_llm_client is None
        candidate.drain_and_close.assert_awaited_once()

    async def test_enable_with_no_prior_wrapper(self):
        # retired is None → _schedule_drain(None) is a quiet no-op.
        candidate = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(self._aux_cfg(), codex=object(), aux=None)
        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls, \
             patch("src.discord.llm_gateway.CodexChatClient") as client_cls, \
             patch("src.llm.auxiliary.AuxiliaryLLMClient", return_value=candidate):
            self._patch_probe_ok(pool_cls, client_cls)
            r = await gw.reload_auxiliary()
        await self._flush_drains(gw)
        assert r["effective_enabled"] is True
        assert gw.auxiliary_llm_client is candidate

    async def test_disabled_path_concurrent_reload_rejected(self):
        old = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(self._aux_cfg(enabled=False), codex=object(), aux=old)
        real_lock = gw.provider_lock

        class _BumpingLock:
            async def __aenter__(self):
                gw._aux_reload_gen += 1  # a concurrent reload commits first
                await real_lock.acquire()

            async def __aexit__(self, *a):
                real_lock.release()

        gw.provider_lock = _BumpingLock()
        r = await gw.reload_auxiliary()
        assert r["effective_enabled"] is False
        assert "concurrent" in r["reason"]
        assert gw.auxiliary_llm_client is old  # not retired

    async def test_no_primary_client(self):
        gw = _gw(self._aux_cfg(), codex=None)
        r = await gw.reload_auxiliary()
        assert r["effective_enabled"] is False
        assert "no primary" in r["reason"].lower()

    async def test_build_exception_leaves_prior_untouched(self):
        old = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(self._aux_cfg(), codex=object(), aux=old)
        with patch("src.discord.llm_gateway.CodexAuthPool", side_effect=RuntimeError("boom")):
            r = await gw.reload_auxiliary()
        assert r["effective_enabled"] is False
        assert "build failed" in r["reason"]
        assert gw.auxiliary_llm_client is old

    async def test_primary_changed_during_reload_aborts(self):
        candidate = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(self._aux_cfg(), codex=object(), aux=None)

        def _build(*a, **k):
            gw.codex_client = object()  # primary recreated during build
            return candidate

        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls, \
             patch("src.discord.llm_gateway.CodexChatClient") as client_cls, \
             patch("src.llm.auxiliary.AuxiliaryLLMClient", side_effect=_build):
            self._patch_probe_ok(pool_cls, client_cls)
            r = await gw.reload_auxiliary()
        await self._flush_drains(gw)
        assert r["effective_enabled"] is False
        assert "primary changed" in r["reason"]
        assert gw.auxiliary_llm_client is None
        candidate.drain_and_close.assert_awaited_once()

    async def test_missing_credentials_leaves_prior_untouched(self):
        old = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(self._aux_cfg(), codex=object(), aux=old)
        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls:
            pool_cls.return_value.is_configured.return_value = False
            r = await gw.reload_auxiliary()
        assert r["effective_enabled"] is False
        assert gw.auxiliary_llm_client is old  # unchanged
        old.drain_and_close.assert_not_called()


class TestPrimaryLifecycleReconcile:
    """reload_codex_inner must retire/rebind auxiliary when the primary
    changes, and the flat handle follows via the client property."""

    def _cfg_codex_disabled(self):
        cfg = _cfg()
        cfg.openai_codex.enabled = False
        return cfg

    async def test_primary_disabled_retires_auxiliary(self):
        aux = SimpleNamespace(drain_and_close=AsyncMock(), primary_client=object())
        gw = _gw(self._cfg_codex_disabled(), codex=object(), aux=aux)
        await gw.reload_codex_inner()
        assert gw.codex_client is None
        assert gw.auxiliary_llm_client is None  # retired

    async def test_primary_recreated_rebinds_auxiliary_fallback(self):
        old_primary = object()
        aux = SimpleNamespace(drain_and_close=AsyncMock(), primary_client=old_primary)
        gw = _gw(_cfg(), codex=None, aux=aux)  # primary absent at boot
        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls, \
             patch("src.discord.llm_gateway.CodexChatClient", return_value=object()):
            pool_cls.return_value.is_configured.return_value = True
            pool_cls.return_value._accounts = [object()]
            await gw.reload_codex_inner()
        # aux fallback rebound to the newly-created primary, not the old one
        assert aux.primary_client is gw.codex_client
        assert aux.primary_client is not old_primary


class TestPrimaryCreatesAuxiliary:
    """Blocker 1: primary absent→created must build the CONFIGURED auxiliary,
    not just rebind an already-present wrapper."""

    def _cfg_aux_enabled(self):
        cfg = _cfg()
        cfg.openai_codex.auxiliary = SimpleNamespace(
            enabled=True, model="gpt-5.6-terra")
        return cfg

    async def test_primary_created_schedules_aux_build(self):
        gw = _gw(self._cfg_aux_enabled(), codex=None, aux=None)  # aux absent at boot
        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls, \
             patch("src.discord.llm_gateway.CodexChatClient", return_value=object()):
            pool_cls.return_value.is_configured.return_value = True
            pool_cls.return_value._accounts = [object()]
            # reload_auxiliary is scheduled by the reconcile — stub it to a flag
            called = {}
            async def _fake_reload(desired=None):
                called["yes"] = True
                return {"committed": True, "effective_enabled": True}
            gw.reload_auxiliary = _fake_reload
            await gw.reload_codex_inner()
            # let the scheduled task run
            await asyncio.gather(*list(gw._aux_drains))
        assert called.get("yes") is True


class TestPersistAndConcurrency:
    def _aux_cfg(self, enabled=True):
        cfg = _cfg()
        cfg.openai_codex.auxiliary = SimpleNamespace(
            enabled=enabled, model="gpt-5.6-terra")
        return cfg

    async def test_disable_generation_reject_is_not_committed(self):
        # A losing concurrent disable must return committed=False (so the
        # route 409s and never persists), not a success.
        old = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(self._aux_cfg(enabled=False), codex=object(), aux=old)
        real_lock = gw.provider_lock

        class _BumpingLock:
            async def __aenter__(self):
                gw._aux_reload_gen += 1
                await real_lock.acquire()
            async def __aexit__(self, *a):
                real_lock.release()

        gw.provider_lock = _BumpingLock()
        r = await gw.reload_auxiliary()
        assert r["committed"] is False
        assert gw.auxiliary_llm_client is old

    async def test_cancellation_during_probe_drains_candidate(self):
        candidate = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(self._aux_cfg(), codex=object(), aux=None)

        async def _hang_probe(_client):
            await asyncio.Event().wait()  # cancelled here

        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls, \
             patch("src.discord.llm_gateway.CodexChatClient") as client_cls, \
             patch("src.llm.auxiliary.AuxiliaryLLMClient", return_value=candidate):
            pool_cls.return_value.is_configured.return_value = True
            client_cls.return_value.chat = AsyncMock()
            gw._probe_aux = _hang_probe
            task = asyncio.create_task(gw.reload_auxiliary())
            await asyncio.sleep(0.02)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            await asyncio.gather(*list(gw._aux_drains))
        # the uninstalled candidate was drained, never installed
        assert gw.auxiliary_llm_client is None
        candidate.drain_and_close.assert_awaited_once()


class TestPersistTransaction:
    """Persistence is folded into reload_auxiliary's locked transaction:
    persist-failure EXACTLY restores the prior generation (no probed reload)."""

    def _aux_cfg(self, enabled=True, model="gpt-5.6-terra"):
        cfg = _cfg()
        cfg.openai_codex.auxiliary = SimpleNamespace(
            enabled=enabled, model=model)
        return cfg

    async def test_enable_persist_failure_exactly_restores_prior(self):
        cfg = self._aux_cfg(enabled=False, model="gpt-5.6-luna")
        old = SimpleNamespace(drain_and_close=AsyncMock())
        candidate = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(cfg, codex=object(), aux=old)

        def _persist_fail():
            raise OSError("disk full")

        desired = {"enabled": True, "model": "gpt-5.6-terra"}
        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls, \
             patch("src.discord.llm_gateway.CodexChatClient") as client_cls, \
             patch("src.llm.auxiliary.AuxiliaryLLMClient", return_value=candidate):
            pool_cls.return_value.is_configured.return_value = True
            client_cls.return_value.chat = AsyncMock(return_value="ok")
            r = await gw.reload_auxiliary(desired, persist=_persist_fail)
            await asyncio.gather(*list(gw._aux_drains))
        assert r["committed"] is False
        assert "persist failed" in r["reason"]
        # EXACT prior wrapper/pointers/config restored — the prior was NOT drained
        assert gw.auxiliary_llm_client is old
        assert cfg.openai_codex.auxiliary.enabled is False
        assert cfg.openai_codex.auxiliary.model == "gpt-5.6-luna"
        old.drain_and_close.assert_not_called()   # prior survives
        candidate.drain_and_close.assert_awaited_once()  # candidate drained

    async def test_disable_persist_failure_restores_enabled_wrapper(self):
        cfg = self._aux_cfg(enabled=True, model="gpt-5.6-terra")
        old = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(cfg, codex=object(), aux=old)

        def _persist_fail():
            raise OSError("disk full")

        desired = {"enabled": False, "model": "gpt-5.6-terra"}
        r = await gw.reload_auxiliary(desired, persist=_persist_fail)
        assert r["committed"] is False
        # the enabled wrapper is restored, not drained
        assert gw.auxiliary_llm_client is old
        assert cfg.openai_codex.auxiliary.enabled is True
        old.drain_and_close.assert_not_called()

    async def test_persist_success_drains_prior_after_commit(self):
        cfg = self._aux_cfg(enabled=True)
        old = SimpleNamespace(drain_and_close=AsyncMock())
        candidate = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(cfg, codex=object(), aux=old)
        persisted = []

        def _persist_ok():
            persisted.append(True)

        desired = {"enabled": True, "model": "gpt-5.6-terra"}
        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls, \
             patch("src.discord.llm_gateway.CodexChatClient") as client_cls, \
             patch("src.llm.auxiliary.AuxiliaryLLMClient", return_value=candidate):
            pool_cls.return_value.is_configured.return_value = True
            client_cls.return_value.chat = AsyncMock(return_value="ok")
            r = await gw.reload_auxiliary(desired, persist=_persist_ok)
            await asyncio.gather(*list(gw._aux_drains))
        assert r["committed"] is True
        assert persisted == [True]
        assert gw.auxiliary_llm_client is candidate
        old.drain_and_close.assert_awaited_once()  # prior drained only after persist


class TestCancellationDuringPersist:
    """Cancellation while persistence is blocked must NOT split live/disk/
    ownership: the worker settles, then state commits or restores coherently
    and cancellation is re-raised."""

    def _aux_cfg(self, enabled=True, model="gpt-5.6-terra"):
        cfg = _cfg()
        cfg.openai_codex.auxiliary = SimpleNamespace(
            enabled=enabled, model=model)
        return cfg

    async def test_enable_cancel_during_persist_success_commits(self):
        cfg = self._aux_cfg(enabled=False, model="gpt-5.6-luna")
        old = SimpleNamespace(drain_and_close=AsyncMock())
        candidate = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(cfg, codex=object(), aux=old)
        gate = threading.Event()
        started = threading.Event()

        def _slow_persist():
            started.set()
            gate.wait()  # blocks in the executor thread; cancel arrives meanwhile

        desired = {"enabled": True, "model": "gpt-5.6-terra"}
        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls, \
             patch("src.discord.llm_gateway.CodexChatClient") as client_cls, \
             patch("src.llm.auxiliary.AuxiliaryLLMClient", return_value=candidate):
            pool_cls.return_value.is_configured.return_value = True
            client_cls.return_value.chat = AsyncMock(return_value="ok")
            task = asyncio.create_task(gw.reload_auxiliary(desired, persist=_slow_persist))
            while not started.is_set():
                await asyncio.sleep(0.005)
            task.cancel()
            gate.set()  # let the shielded persist worker settle (succeeds)
            with pytest.raises(asyncio.CancelledError):
                await task
            await asyncio.gather(*list(gw._aux_drains))
        # persist settled successfully → candidate stays live (committed), the
        # prior is drained, and the candidate is NOT drained.
        assert gw.auxiliary_llm_client is candidate
        old.drain_and_close.assert_awaited_once()
        candidate.drain_and_close.assert_not_called()

    async def test_disable_cancel_during_persist_failure_restores(self):
        cfg = self._aux_cfg(enabled=True, model="gpt-5.6-terra")
        old = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(cfg, codex=object(), aux=old)
        gate = threading.Event()
        started = threading.Event()

        def _slow_fail():
            started.set()
            gate.wait()
            raise OSError("disk full")

        desired = {"enabled": False, "model": "gpt-5.6-terra"}
        task = asyncio.create_task(gw.reload_auxiliary(desired, persist=_slow_fail))
        while not started.is_set():
            await asyncio.sleep(0.005)
        task.cancel()
        gate.set()  # persist worker settles with failure
        with pytest.raises(asyncio.CancelledError):
            await task
        # exact restore: the enabled wrapper survives, config re-enabled
        assert gw.auxiliary_llm_client is old
        assert cfg.openai_codex.auxiliary.enabled is True
        old.drain_and_close.assert_not_called()


class TestSwitchProviderTransaction:
    def _cfg_ready(self, active="ollama"):
        cfg = _cfg(active=active)
        return cfg

    async def test_switch_persist_failure_restores_prior_provider(self):
        cfg = self._cfg_ready(active="codex")
        gw = _gw(cfg, codex=object(), ollama=object())
        gw.wire_callbacks = lambda: None
        gw.on_provider_switch = lambda: None  # exercise the restore callback

        def _persist_fail():
            raise OSError("disk full")

        r = await gw.switch_provider("ollama", persist=_persist_fail)
        assert r.get("error") == "persist failed"
        # prior provider restored under the same lock — live never outran disk
        assert cfg.llm_provider.active_provider == "codex"

    async def test_switch_waits_for_inflight_then_switches(self):
        cfg = self._cfg_ready(active="codex")
        gw = _gw(cfg, codex=object(), ollama=object())
        gw.wire_callbacks = lambda: None
        gw.inflight_requests = 1  # a request is in flight at switch time
        import src.discord.llm_gateway as gwmod
        real_sleep = gwmod.asyncio.sleep

        async def _sleep(_d):
            gw.inflight_requests = 0  # it drains during the wait
            await real_sleep(0)

        with patch.object(gwmod.asyncio, "sleep", _sleep):
            r = await gw.switch_provider("ollama")
        assert r["active_provider"] == "ollama"

    async def test_switch_persist_success_commits(self):
        cfg = self._cfg_ready(active="codex")
        gw = _gw(cfg, codex=object(), ollama=object())
        gw.wire_callbacks = lambda: None
        persisted = []

        def _persist_ok():
            persisted.append(True)

        r = await gw.switch_provider("ollama", persist=_persist_ok)
        assert r["active_provider"] == "ollama"
        assert persisted == [True]
        assert cfg.llm_provider.active_provider == "ollama"


class TestCancellationBranchesComplete:
    """Cover the symmetric cancel×persist-result branches."""

    def _aux_cfg(self, enabled=True, model="gpt-5.6-terra"):
        cfg = _cfg()
        cfg.openai_codex.auxiliary = SimpleNamespace(
            enabled=enabled, model=model)
        return cfg

    async def test_disable_cancel_during_persist_success_commits(self):
        cfg = self._aux_cfg(enabled=True)
        old = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(cfg, codex=object(), aux=old)
        gate = threading.Event()
        started = threading.Event()

        def _slow_ok():
            started.set()
            gate.wait()

        desired = {"enabled": False, "model": "gpt-5.6-terra"}
        task = asyncio.create_task(gw.reload_auxiliary(desired, persist=_slow_ok))
        while not started.is_set():
            await asyncio.sleep(0.005)
        task.cancel()
        gate.set()  # persist worker settles OK
        with pytest.raises(asyncio.CancelledError):
            await task
        await asyncio.gather(*list(gw._aux_drains))
        # disable committed → prior drained, config disabled
        assert gw.auxiliary_llm_client is None
        assert cfg.openai_codex.auxiliary.enabled is False
        old.drain_and_close.assert_awaited_once()

    async def test_enable_cancel_during_persist_failure_restores(self):
        cfg = self._aux_cfg(enabled=False, model="gpt-5.6-luna")
        old = SimpleNamespace(drain_and_close=AsyncMock())
        candidate = SimpleNamespace(drain_and_close=AsyncMock())
        gw = _gw(cfg, codex=object(), aux=old)
        gate = threading.Event()
        started = threading.Event()

        def _slow_fail():
            started.set()
            gate.wait()
            raise OSError("disk full")

        desired = {"enabled": True, "model": "gpt-5.6-terra"}
        with patch("src.discord.llm_gateway.CodexAuthPool") as pool_cls, \
             patch("src.discord.llm_gateway.CodexChatClient") as client_cls, \
             patch("src.llm.auxiliary.AuxiliaryLLMClient", return_value=candidate):
            pool_cls.return_value.is_configured.return_value = True
            client_cls.return_value.chat = AsyncMock(return_value="ok")
            task = asyncio.create_task(gw.reload_auxiliary(desired, persist=_slow_fail))
            while not started.is_set():
                await asyncio.sleep(0.005)
            task.cancel()
            gate.set()
            with pytest.raises(asyncio.CancelledError):
                await task
            await asyncio.gather(*list(gw._aux_drains))
        # persist failed → exact restore (prior stays, config disabled), candidate drained
        assert gw.auxiliary_llm_client is old
        assert cfg.openai_codex.auxiliary.enabled is False
        candidate.drain_and_close.assert_awaited_once()
        old.drain_and_close.assert_not_called()

    async def test_switch_cancel_during_persist_success_commits(self):
        cfg = _cfg(active="codex")
        gw = _gw(cfg, codex=object(), ollama=object())
        gw.wire_callbacks = lambda: None
        gate = threading.Event()
        started = threading.Event()

        def _slow_ok():
            started.set()
            gate.wait()

        task = asyncio.create_task(gw.switch_provider("ollama", persist=_slow_ok))
        while not started.is_set():
            await asyncio.sleep(0.005)
        task.cancel()
        gate.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert cfg.llm_provider.active_provider == "ollama"  # committed

    async def test_switch_cancel_during_persist_failure_restores(self):
        cfg = _cfg(active="codex")
        gw = _gw(cfg, codex=object(), ollama=object())
        gw.wire_callbacks = lambda: None
        gw.on_provider_switch = lambda: None  # exercise the restore callback
        gate = threading.Event()
        started = threading.Event()

        def _slow_fail():
            started.set()
            gate.wait()
            raise OSError("disk full")

        task = asyncio.create_task(gw.switch_provider("ollama", persist=_slow_fail))
        while not started.is_set():
            await asyncio.sleep(0.005)
        task.cancel()
        gate.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert cfg.llm_provider.active_provider == "codex"  # restored


class TestPersistWorkerAlwaysSettles:
    """Blocker-3: run_persist_settled runs the write on an EXECUTOR future, so
    the shutdown drain's asyncio.all_tasks() cancellation can't cancel the
    child, and a cancelled caller is never mistaken for a successful write —
    the lock is held until the real filesystem worker settles."""

    async def test_direct_cancel_waits_for_real_worker(self):
        gw = _gw(_cfg())
        gate = threading.Event()
        started = threading.Event()
        finished = threading.Event()

        def _blocking_write():
            started.set()
            gate.wait()          # a real blocked executor worker
            finished.set()

        async def _drive():
            return await gw.run_persist_settled(_blocking_write)

        task = asyncio.create_task(_drive())
        while not started.is_set():
            await asyncio.sleep(0.005)
        task.cancel()            # cancel the CALLER (as the shutdown drain would)
        await asyncio.sleep(0.02)
        # the worker is still running — settle has NOT returned
        assert not task.done()
        assert not finished.is_set()
        gate.set()               # let the real worker finish
        exc, was_cancelled = None, None
        try:
            exc, was_cancelled = await task
        except asyncio.CancelledError:
            pass
        assert finished.is_set()  # the write actually completed before return
        # the settle observed the cancellation but only after the worker settled
        assert was_cancelled is True
        assert exc is None
