"""Coverage for src/discord/llm_gateway.py (RFC-006 P11, safe tier-1).

LLMGateway owns provider resolution, live reloads, runtime switching, and the
guarded call_with_tools path. SAFE by construction: the provider client classes
(CodexChatClient/OllamaClient/KimiClient/CodexAuthPool) are patched so reloads
build fakes — no real tokens, no network, no health-check calls hit a server.
The deferred-close call_later is stubbed so nothing is scheduled on a live loop.
"""
from __future__ import annotations

import asyncio
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
        guard=None, router=None, aux=None, cost=None):
    return LLMGateway(
        get_config=lambda: config if config is not None else _cfg(),
        codex_client=codex, ollama_client=ollama, kimi_client=kimi,
        subsystem_guard=guard, model_router=router, auxiliary_llm_client=aux,
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

    async def test_model_router_cheap_path(self):
        strong = SimpleNamespace(chat_with_tools=AsyncMock(), model="gpt-5.5")
        aux_resp = SimpleNamespace(input_tokens=1, output_tokens=1)
        aux = SimpleNamespace(chat_with_tools=AsyncMock(return_value=aux_resp), model="cheap")
        router = MagicMock()
        router.route = AsyncMock(return_value=SimpleNamespace(
            use_strong=False, intent=SimpleNamespace(value="chat"), confidence=0.9))
        gw = _gw(codex=strong, router=router, aux=aux)
        out = await gw.call_with_tools(messages=[], system="s", tools=[], user_message="hi")
        assert out is aux_resp  # routed to the cheap auxiliary client
        aux.chat_with_tools.assert_awaited_once()

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

    async def test_router_exception_uses_strong(self):
        resp = SimpleNamespace(input_tokens=0, output_tokens=0)
        strong = SimpleNamespace(chat_with_tools=AsyncMock(return_value=resp), model="gpt-5.5")
        router = MagicMock()
        router.route = AsyncMock(side_effect=RuntimeError("route boom"))
        gw = _gw(codex=strong, router=router, aux=SimpleNamespace())
        out = await gw.call_with_tools(messages=[], system="s", tools=[], user_message="hi")
        assert out is resp  # router failure is non-fatal → strong client used
