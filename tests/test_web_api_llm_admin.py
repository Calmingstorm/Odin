"""Route-level coverage for src/web/api/llm_admin.py (RFC-006 P4a + CONT-2).

Drives LLM provider status, connection-pool, provider-config, and the Ollama /
Kimi admin routes through the real route layer with a real Config + faked
components. Network is never touched: aiohttp sessions are faked, provider
reloads are AsyncMocks, and `_persist_config` is stubbed so no test writes disk.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config
from src.web.api.llm_admin import (
    _parse_int,
    _persist_llm_sections_sync,
    _safe_secret,
    _ui_set_secrets,
    _validate_ollama_url,
    register_connection_pools,
    register_kimi_admin,
    register_llm_provider,
    register_ollama_admin,
    register_provider_config,
)


@pytest.fixture(autouse=True)
def _isolate_cwd(tmp_path, monkeypatch):
    # llm_admin persist writes the ACTIVE config path (recorded at load_config
    # time), not a CWD-relative guess. Point both the CWD and the active path at
    # the isolated tmp dir so nothing touches the repo root.
    monkeypatch.chdir(tmp_path)
    from src.config import schema
    monkeypatch.setattr(schema, "_ACTIVE_CONFIG_PATH", tmp_path / "config.yml")


@pytest.fixture(autouse=True)
def _no_persist(monkeypatch):
    # Stub the SYNC inner (not the async _persist_config wrapper) so route tests
    # still exercise _persist_config's to_thread hop without writing config.yml,
    # while the direct-import references in TestPersistHelpers keep the real one.
    monkeypatch.setattr("src.web.api.llm_admin._persist_llm_sections_sync", MagicMock())


def _bot():
    bot = MagicMock()
    bot.config = Config(discord={"token": "fake"})
    # Real gateways default this to None; without it the MagicMock
    # auto-attr makes _auxiliary_status read a non-serializable mock.
    bot.llm_gateway.auxiliary_llm_client = None
    return bot


def _gw(bot):
    """Wire llm_gateway with a real provider lock + AsyncMock reload hooks."""
    gw = bot.llm_gateway
    gw.provider_lock = asyncio.Lock()
    gw.reload_codex_inner = AsyncMock()
    gw.reload_ollama_inner = AsyncMock()
    gw.reload_kimi_inner = AsyncMock()
    # Settle-safe persist runner (real gateway method): default = clean write.
    gw.run_persist_settled = AsyncMock(return_value=(None, False))
    return gw


def _app(*registrars, bot=None):
    bot = bot or _bot()
    routes = web.RouteTableDef()
    for reg in registrars:
        reg(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app, bot


# --------------------------------------------------------------------------- #
# Fake aiohttp + provider clients
# --------------------------------------------------------------------------- #
class _FakeResp:
    def __init__(self, status=200, data=None):
        self.status = status
        self._data = data if data is not None else {}

    async def json(self):
        return self._data

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _FakeSession:
    def __init__(self, resp):
        self._resp = resp

    def get(self, *a, **k):
        return self._resp

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


def _provider_client(models=None, healthy=True):
    client = SimpleNamespace(model="m1", base_url="http://localhost:11434")
    client.health_check = AsyncMock(
        return_value={"healthy": healthy, "models": models or []})
    client.pool_stats = lambda: {"active": 1}
    client._headers = lambda: {}
    client._get_session = AsyncMock(
        return_value=_FakeSession(_FakeResp(200, {"models": models or []})))
    return client


# --------------------------------------------------------------------------- #
# LLM provider status / switch
# --------------------------------------------------------------------------- #
class TestLlmStatus:
    @pytest.mark.asyncio
    async def test_llm_status_reports_providers(self):
        app, bot = _app(register_llm_provider)
        bot.llm_gateway.codex_client = object()
        bot.llm_gateway.ollama_client = None
        bot.llm_gateway.kimi_client = None
        bot.llm_gateway.active_client = SimpleNamespace(model="gpt-5.5", provider_name="codex")
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/llm/status")).json()
            assert body["codex"]["configured"] is True
            assert body["codex"]["reasoning_effort"] == "medium"
            assert body["codex"]["active_reasoning_effort"] is None  # object() has no attr
            assert body["ollama"]["configured"] is False
            assert body["active_model"] == "gpt-5.5"

    @pytest.mark.asyncio
    async def test_llm_status_agent_effort_fields(self):
        app, bot = _app(register_llm_provider)
        bot.llm_gateway.codex_client = SimpleNamespace(reasoning_effort="high")
        bot.llm_gateway.ollama_client = None
        bot.llm_gateway.kimi_client = None
        bot.llm_gateway.active_client = None
        async with TestClient(TestServer(app)) as c:
            # inherit (default): effective mirrors the live client's effort
            body = await (await c.get("/api/llm/status")).json()
            assert body["codex"]["agent_reasoning_effort"] is None
            assert body["codex"]["effective_agent_reasoning_effort"] == "high"
            # override set: effective is the override
            bot.config.openai_codex.agent_reasoning_effort = "low"
            body = await (await c.get("/api/llm/status")).json()
            assert body["codex"]["agent_reasoning_effort"] == "low"
            assert body["codex"]["effective_agent_reasoning_effort"] == "low"

    @pytest.mark.asyncio
    async def test_llm_status_agent_axes_auto_resolves_to_main(self):
        app, bot = _app(register_llm_provider)
        bot.llm_gateway.codex_client = SimpleNamespace(reasoning_effort="high")
        bot.llm_gateway.ollama_client = None
        bot.llm_gateway.kimi_client = None
        bot.llm_gateway.active_client = None
        bot.config.openai_codex.model = "gpt-5.6-sol"
        bot.config.openai_codex.agent_model = "auto"
        bot.config.openai_codex.agent_reasoning_effort = "auto"
        async with TestClient(TestServer(app)) as c:
            codex = (await (await c.get("/api/llm/status")).json())["codex"]
            # configured shows the sentinel; effective_* resolves to the
            # inherited MAIN setting and NEVER surfaces "auto".
            assert codex["agent_model"] == "auto"
            assert codex["agent_reasoning_effort"] == "auto"
            assert codex["effective_agent_model"] == "gpt-5.6-sol"
            assert codex["effective_agent_reasoning_effort"] == "high"
            assert codex["effective_agent_model"] != "auto"
            assert codex["effective_agent_reasoning_effort"] != "auto"

    @pytest.mark.asyncio
    async def test_llm_status_auxiliary_configured_vs_effective(self):
        app, bot = _app(register_llm_provider)
        bot.llm_gateway.codex_client = object()
        bot.llm_gateway.ollama_client = None
        bot.llm_gateway.kimi_client = None
        bot.llm_gateway.active_client = None
        bot.llm_gateway.auxiliary_llm_client = None
        bot.config.openai_codex.auxiliary.enabled = True
        bot.config.openai_codex.auxiliary.model = "gpt-5.6-terra"
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/llm/status")).json()
            aux = body["auxiliary"]
            # configured reflects persisted config
            assert aux["enabled"] is True
            assert aux["model"] == "gpt-5.6-terra"
            # enabled config but no live client → unavailable + effective off
            assert aux["effective_enabled"] is False
            assert aux["unavailable_reason"]
            # per-task configuration is gone — no task keys on the status block
            assert "tasks" not in aux
            assert "known_tasks" not in aux
            assert "consumer_backed_tasks" not in aux
            assert "effective_tasks" not in aux
            # a live wrapper flips effective_* on
            bot.llm_gateway.auxiliary_llm_client = SimpleNamespace(
                aux_client=SimpleNamespace(model="gpt-5.6-terra"),
            )
            body = await (await c.get("/api/llm/status")).json()
            aux = body["auxiliary"]
            assert aux["effective_enabled"] is True
            assert aux["effective_model"] == "gpt-5.6-terra"
            assert aux["unavailable_reason"] is None

    @pytest.mark.asyncio
    async def test_llm_status_agent_model_fields(self):
        """Codex-scoped configuration status: effective = agent_model ??
        model, deliberately independent of whichever provider is active."""
        app, bot = _app(register_llm_provider)
        bot.llm_gateway.codex_client = SimpleNamespace(reasoning_effort="high")
        bot.llm_gateway.ollama_client = None
        bot.llm_gateway.kimi_client = None
        bot.llm_gateway.active_client = None
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/llm/status")).json()
            assert body["codex"]["agent_model"] is None
            assert body["codex"]["effective_agent_model"] == bot.config.openai_codex.model
            bot.config.openai_codex.agent_model = "gpt-5.6-luna"
            body = await (await c.get("/api/llm/status")).json()
            assert body["codex"]["agent_model"] == "gpt-5.6-luna"
            assert body["codex"]["effective_agent_model"] == "gpt-5.6-luna"

    @pytest.mark.asyncio
    async def test_llm_status_no_active_client(self):
        app, bot = _app(register_llm_provider)
        bot.llm_gateway.codex_client = None
        bot.llm_gateway.ollama_client = None
        bot.llm_gateway.kimi_client = None
        bot.llm_gateway.active_client = None
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/llm/status")).json()
            assert "active_model" not in body

    @pytest.mark.asyncio
    async def test_llm_switch_validation_and_error(self):
        app, bot = _app(register_llm_provider)
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/llm/switch", data="bad")).status == 400
            assert (await c.post("/api/llm/switch", json={"provider": "x"})).status == 400
        bot.llm_gateway.switch_provider = AsyncMock(return_value={"error": "nope"})
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/llm/switch", json={"provider": "ollama"})).status == 400

    @pytest.mark.asyncio
    async def test_llm_switch_success(self):
        app, bot = _app(register_llm_provider)
        _gw(bot)
        bot.llm_gateway.switch_provider = AsyncMock(return_value={"provider": "ollama", "ok": True})
        async with TestClient(TestServer(app)) as c:
            r = await c.post("/api/llm/switch", json={"provider": "ollama"})
            assert r.status == 200 and (await r.json())["provider"] == "ollama"

    @pytest.mark.asyncio
    async def test_llm_switch_passes_persist_into_switch_provider(self):
        # The route hands switch_provider a persist callable so mutation +
        # persistence share ONE lock ownership — it no longer persists itself.
        app, bot = _app(register_llm_provider)
        _gw(bot)
        captured = {}

        async def _switch(provider, persist=None):
            captured["persist"] = persist
            persist()  # SYNC persist callable — switch runs it under its lock
            return {"active_provider": provider}

        bot.llm_gateway.switch_provider = _switch
        ran = []
        with patch("src.web.api.llm_admin._persist_llm_sections_sync",
                   new=lambda _b: ran.append(True)):
            async with TestClient(TestServer(app)) as c:
                assert (await c.post("/api/llm/switch", json={"provider": "codex"})).status == 200
        assert captured["persist"] is not None
        assert ran == [True]

    @pytest.mark.asyncio
    async def test_llm_switch_persist_failure_500(self):
        # switch_provider reports a persist failure as {"error": "persist
        # failed"} → the route 500s (not 400).
        app, bot = _app(register_llm_provider)
        _gw(bot)
        bot.llm_gateway.switch_provider = AsyncMock(
            return_value={"error": "persist failed"})
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/llm/switch", json={"provider": "codex"})).status == 500


# --------------------------------------------------------------------------- #
# Connection pools (existing coverage retained)
# --------------------------------------------------------------------------- #
class TestConnectionPools:
    @pytest.mark.asyncio
    async def test_ssh_pool_unavailable(self):
        app, bot = _app(register_connection_pools)
        bot.executor = None
        async with TestClient(TestServer(app)) as c:
            assert (await c.get("/api/pools/ssh")).status == 503

    @pytest.mark.asyncio
    async def test_ssh_pool_metrics(self):
        app, bot = _app(register_connection_pools)
        bot.executor.ssh_pool.get_metrics.return_value = {"connections": 3}
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/pools/ssh")).json()
            assert body["connections"] == 3

    @pytest.mark.asyncio
    async def test_http_pools(self):
        app, bot = _app(register_connection_pools)
        bot.llm_gateway.codex_client.get_pool_metrics.return_value = {"active": 2}
        bot.llm_gateway.ollama_client = None
        bot.llm_gateway.kimi_client = None
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/pools/http")).json()
            assert body["codex"]["active"] == 2

    @pytest.mark.asyncio
    async def test_http_pools_none_available(self):
        app, bot = _app(register_connection_pools)
        bot.llm_gateway.codex_client = None
        bot.llm_gateway.ollama_client = None
        bot.llm_gateway.kimi_client = None
        async with TestClient(TestServer(app)) as c:
            assert (await c.get("/api/pools/http")).status == 503

    @pytest.mark.asyncio
    async def test_ssh_close_host_and_all(self):
        app, bot = _app(register_connection_pools)
        bot.executor.ssh_pool.close_host = AsyncMock(return_value=True)
        bot.executor.ssh_pool.close_all = AsyncMock(return_value=4)
        async with TestClient(TestServer(app)) as c:
            r = await c.post("/api/pools/ssh/close", json={"host": "server"})
            assert (await r.json())["closed"] is True
            # a non-JSON body defaults to {} → close_all
            r2 = await c.post("/api/pools/ssh/close", data="bad")
            assert (await r2.json())["closed_count"] == 4

    @pytest.mark.asyncio
    async def test_http_pools_all_providers(self):
        app, bot = _app(register_connection_pools)
        bot.llm_gateway.codex_client.get_pool_metrics.return_value = {"active": 1}
        bot.llm_gateway.ollama_client = SimpleNamespace(pool_stats=lambda: {"o": 1})
        bot.llm_gateway.kimi_client = SimpleNamespace(pool_stats=lambda: {"k": 1})
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/pools/http")).json()
            assert body["ollama"] == {"o": 1} and body["kimi"] == {"k": 1}

    @pytest.mark.asyncio
    async def test_ssh_close_unavailable(self):
        app, bot = _app(register_connection_pools)
        bot.executor = None
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/pools/ssh/close", json={})).status == 503


# --------------------------------------------------------------------------- #
# Provider config PUTs
# --------------------------------------------------------------------------- #
class TestProviderConfig:
    @pytest.mark.asyncio
    async def test_codex_config(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        async with TestClient(TestServer(app)) as c:
            assert (await c.put("/api/llm/codex/config", data="bad")).status == 400
            r = await c.put("/api/llm/codex/config",
                            json={"enabled": True, "model": "gpt-5.5", "max_tokens": 8000,
                                  "reasoning_effort": "high"})
            rbody = await r.json()
            assert r.status == 200 and rbody["status"] == "updated"
            assert rbody["reasoning_effort"] == "high"
            assert bot.config.openai_codex.reasoning_effort == "high"
            bot.llm_gateway.reload_codex_inner.assert_awaited()
            # invalid max_tokens → ValueError → 400
            assert (await c.put("/api/llm/codex/config",
                                json={"max_tokens": "nope"})).status == 400

    @pytest.mark.asyncio
    async def test_codex_config_accepts_agent_axis_auto(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        bot.tool_catalog = MagicMock()
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"agent_reasoning_effort": "auto", "agent_model": "auto"})
            rbody = await r.json()
            assert r.status == 200 and rbody["status"] == "updated"
            assert bot.config.openai_codex.agent_reasoning_effort == "auto"
            assert bot.config.openai_codex.agent_model == "auto"
            # changing an agent axis rebuilds the tool catalog
            bot.tool_catalog.invalidate.assert_called()
            # an invalid (non-auto) agent effort value is still rejected
            assert (await c.put("/api/llm/codex/config",
                                json={"agent_reasoning_effort": "ultra"})).status == 400

    @pytest.mark.asyncio
    async def test_codex_config_no_lock_503(self):
        app, bot = _app(register_provider_config)
        bot.llm_gateway.provider_lock = None
        async with TestClient(TestServer(app)) as c:
            assert (await c.put("/api/llm/codex/config", json={"enabled": True})).status == 503

    @pytest.mark.asyncio
    async def test_codex_config_invalid_reasoning_rejected_before_mutation(self):
        """Literal does not validate assignment — the handler must 400 an
        invalid reasoning_effort BEFORE touching config or the live client."""
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"enabled": False, "model": "changed-model",
                                  "reasoning_effort": "banana"})
            assert r.status == 400
            assert "reasoning_effort" in (await r.json())["error"]
            # "minimal" is grammar-valid upstream but unsupported by every
            # model on this auth path — the PUT layer rejects it too
            assert (await c.put("/api/llm/codex/config",
                                json={"reasoning_effort": "minimal"})).status == 400
        # nothing mutated, nothing reloaded
        assert bot.config.openai_codex.reasoning_effort == "medium"
        assert bot.config.openai_codex.model != "changed-model"
        bot.llm_gateway.reload_codex_inner.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_auxiliary_config_enable_terra(self):
        # The PUT passes an IMMUTABLE desired spec to reload_auxiliary and does
        # NOT mutate config itself (reload commits it atomically under lock).
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        bot.llm_gateway.reload_auxiliary = AsyncMock(
            return_value={"committed": True, "effective_enabled": True,
                          "model": "gpt-5.6-terra"}
        )
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/auxiliary/config",
                            json={"enabled": True, "model": "gpt-5.6-terra"})
            assert r.status == 200
            desired = bot.llm_gateway.reload_auxiliary.call_args.args[0]
            assert desired["enabled"] is True
            assert desired["model"] == "gpt-5.6-terra"
            assert "tasks" not in desired

    @pytest.mark.asyncio
    async def test_auxiliary_config_invokes_persist_callable(self):
        # The route hands reload_auxiliary a persist callable; when the reload
        # invokes it (its locked transaction), _persist_config runs.
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        ran = []

        async def _reload(desired=None, persist=None):
            persist()  # SYNC persist callable — exercise the route's closure
            return {"committed": True, "effective_enabled": True,
                    "model": desired["model"]}

        bot.llm_gateway.reload_auxiliary = _reload
        with patch("src.web.api.llm_admin._persist_llm_sections_sync",
                   new=lambda _b: ran.append(True)):
            async with TestClient(TestServer(app)) as c:
                r = await c.put("/api/llm/auxiliary/config",
                                json={"enabled": True, "model": "gpt-5.6-terra"})
                assert r.status == 200
        assert ran == [True]

    @pytest.mark.asyncio
    async def test_auxiliary_config_guards(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.reload_auxiliary = AsyncMock()
        async with TestClient(TestServer(app)) as c:
            # invalid JSON → 400, reload never consulted
            assert (await c.put("/api/llm/auxiliary/config", data="bad")).status == 400
            bot.llm_gateway.reload_auxiliary.assert_not_awaited()
            # reload raising → 500
            bot.llm_gateway.reload_auxiliary = AsyncMock(side_effect=RuntimeError("boom"))
            assert (await c.put("/api/llm/auxiliary/config",
                                json={"enabled": True})).status == 500

    @pytest.mark.asyncio
    async def test_auxiliary_config_generation_reject_409(self):
        # A committed=False result with a "concurrent" reason → 409, no persist.
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.reload_auxiliary = AsyncMock(
            return_value={"committed": False, "effective_enabled": False,
                          "reason": "concurrent reload; retry"})
        with patch("src.web.api.llm_admin._persist_config", new=AsyncMock()) as persist:
            async with TestClient(TestServer(app)) as c:
                r = await c.put("/api/llm/auxiliary/config", json={"enabled": False})
                assert r.status == 409
            persist.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_auxiliary_config_persist_failure_500_via_transaction(self):
        # Persistence now runs INSIDE reload_auxiliary's locked transaction:
        # a persist failure comes back as committed=False reason="persist
        # failed" → the route 500s. The route passes a persist callable and
        # does NOT run a second probed reload.
        app, bot = _app(register_provider_config)
        _gw(bot)
        captured = {}

        async def _reload(desired=None, persist=None):
            captured["persist"] = persist
            return {"committed": False, "effective_enabled": False,
                    "reason": "persist failed: disk full"}

        bot.llm_gateway.reload_auxiliary = _reload
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/auxiliary/config",
                            json={"enabled": True, "model": "gpt-5.6-terra"})
            assert r.status == 500
            assert "persist failed" in (await r.json())["error"]
        assert captured["persist"] is not None  # persist folded into the reload

    @pytest.mark.asyncio
    async def test_auxiliary_config_persist_error_reason_has_no_secrets(self):
        # A persist failure surfaced through the route must carry only the
        # generic reason — never raw config/secret material.
        app, bot = _app(register_provider_config)
        _gw(bot)

        async def _reload(desired=None, persist=None):
            return {"committed": False, "effective_enabled": False,
                    "reason": "persist failed"}

        bot.llm_gateway.reload_auxiliary = _reload
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/auxiliary/config", json={"enabled": True})
            assert r.status == 500
            body = await r.json()
            assert body["error"] == "persist failed"
            assert "SECRET" not in body["error"] and "token" not in body["error"].lower()

    @pytest.mark.asyncio
    async def test_auxiliary_config_unavailable_503(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.config.openai_codex.auxiliary = None
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/auxiliary/config", json={"enabled": True})
            assert r.status == 503

    @pytest.mark.asyncio
    async def test_auxiliary_config_rolls_back_on_enable_failure(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.config.openai_codex.auxiliary.enabled = False
        bot.config.openai_codex.auxiliary.model = "gpt-5.6-luna"
        bot.llm_gateway.reload_auxiliary = AsyncMock(
            return_value={"effective_enabled": False, "reason": "credentials missing"}
        )
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/auxiliary/config",
                            json={"enabled": True, "model": "gpt-5.6-terra"})
            assert r.status == 400
            assert "credentials" in (await r.json())["error"]
        # config NOT committed (reload never committed on failure) — the PUT
        # no longer pre-mutates config, so the prior state simply stands.
        assert bot.config.openai_codex.auxiliary.enabled is False
        assert bot.config.openai_codex.auxiliary.model == "gpt-5.6-luna"

    @pytest.mark.asyncio
    async def test_codex_agent_effort_set_persists_without_reload(self):
        """agent_reasoning_effort is read at call time by the agent callbacks
        — an agent-only change must persist but NOT reload the codex client
        (a reload needlessly refreshes the auth pool)."""
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"agent_reasoning_effort": "low"})
            body = await r.json()
            assert r.status == 200 and body["agent_reasoning_effort"] == "low"
            assert bot.config.openai_codex.agent_reasoning_effort == "low"
            bot.llm_gateway.reload_codex_inner.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_codex_agent_effort_null_and_empty_mean_inherit(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        bot.config.openai_codex.agent_reasoning_effort = "high"
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"agent_reasoning_effort": None})
            assert r.status == 200
            assert (await r.json())["agent_reasoning_effort"] is None
            assert bot.config.openai_codex.agent_reasoning_effort is None
            # "" (the UI's inherit sentinel) behaves like null
            bot.config.openai_codex.agent_reasoning_effort = "high"
            r = await c.put("/api/llm/codex/config",
                            json={"agent_reasoning_effort": ""})
            assert r.status == 200
            assert bot.config.openai_codex.agent_reasoning_effort is None

    @pytest.mark.asyncio
    async def test_codex_agent_effort_missing_key_untouched(self):
        """Absent key ≠ explicit null — a PUT without the field must not
        reset an existing override."""
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        bot.config.openai_codex.agent_reasoning_effort = "high"
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config", json={"max_tokens": 5000})
            assert r.status == 200
            assert bot.config.openai_codex.agent_reasoning_effort == "high"

    @pytest.mark.asyncio
    async def test_codex_agent_effort_invalid_rejected_before_mutation(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"model": "changed-model",
                                  "agent_reasoning_effort": "banana"})
            assert r.status == 400
            assert "agent_reasoning_effort" in (await r.json())["error"]
        assert bot.config.openai_codex.agent_reasoning_effort is None
        assert bot.config.openai_codex.model != "changed-model"
        bot.llm_gateway.reload_codex_inner.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_codex_agent_model_set_persists_without_reload(self):
        """agent_model is read at call time by the agent callbacks — an
        agent-only change must persist but NOT reload the codex client, and
        it must appear immediately in configured + effective status."""
        app, bot = _app(register_provider_config, register_llm_provider)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        bot.llm_gateway.ollama_client = None
        bot.llm_gateway.kimi_client = None
        bot.llm_gateway.active_client = None
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"agent_model": "gpt-5.6-luna"})
            body = await r.json()
            assert r.status == 200 and body["agent_model"] == "gpt-5.6-luna"
            assert bot.config.openai_codex.agent_model == "gpt-5.6-luna"
            bot.llm_gateway.reload_codex_inner.assert_not_awaited()
            status = await (await c.get("/api/llm/status")).json()
            assert status["codex"]["agent_model"] == "gpt-5.6-luna"
            assert status["codex"]["effective_agent_model"] == "gpt-5.6-luna"

    @pytest.mark.asyncio
    async def test_codex_agent_model_null_empty_whitespace_inherit(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        async with TestClient(TestServer(app)) as c:
            for inherit_value in (None, "", "   "):
                bot.config.openai_codex.agent_model = "gpt-5.6-luna"
                r = await c.put("/api/llm/codex/config",
                                json={"agent_model": inherit_value})
                assert r.status == 200
                assert (await r.json())["agent_model"] is None
                assert bot.config.openai_codex.agent_model is None
        bot.llm_gateway.reload_codex_inner.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_codex_agent_model_free_string_and_stripping(self):
        """Free string like model — unknown values round-trip (the dropdown
        is the UI constraint); surrounding whitespace is normalized."""
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"agent_model": "  gpt-9-future  "})
            assert r.status == 200
            assert bot.config.openai_codex.agent_model == "gpt-9-future"

    @pytest.mark.asyncio
    async def test_codex_agent_model_missing_key_untouched(self):
        """Absent key ≠ explicit null — a PUT without the field must not
        reset an existing override."""
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        bot.config.openai_codex.agent_model = "gpt-5.6-luna"
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config", json={"max_tokens": 5000})
            assert r.status == 200
            assert bot.config.openai_codex.agent_model == "gpt-5.6-luna"

    @pytest.mark.asyncio
    async def test_codex_combined_model_and_agent_model_reloads_once(self):
        """The agent-only no-reload optimization must not suppress the reload
        a base-model change requires."""
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"model": "gpt-5.6-sol",
                                  "agent_model": "gpt-5.6-luna"})
            assert r.status == 200
        assert bot.config.openai_codex.model == "gpt-5.6-sol"
        assert bot.config.openai_codex.agent_model == "gpt-5.6-luna"
        assert bot.llm_gateway.reload_codex_inner.await_count == 1

    @pytest.mark.asyncio
    async def test_codex_mixed_change_still_reloads(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.codex_client = object()
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"reasoning_effort": "high",
                                  "agent_reasoning_effort": "low"})
            assert r.status == 200
            bot.llm_gateway.reload_codex_inner.assert_awaited()
            assert bot.config.openai_codex.reasoning_effort == "high"
            assert bot.config.openai_codex.agent_reasoning_effort == "low"

    @pytest.mark.asyncio
    async def test_ollama_config(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.ollama_client = object()
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/ollama/config", json={
                "enabled": True, "base_url": "http://localhost:11434",
                "model": "qwen3", "max_tokens": 4096, "api_key": "k", "timeout": 120})
            assert r.status == 200 and (await r.json())["base_url"] == "http://localhost:11434"
            bot.llm_gateway.reload_ollama_inner.assert_awaited()
            # SSRF-blocked public url → 400
            assert (await c.put("/api/llm/ollama/config",
                                json={"base_url": "http://8.8.8.8"})).status == 400

    @pytest.mark.asyncio
    async def test_kimi_config(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.kimi_client = object()
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/kimi/config", json={
                "enabled": True, "api_key": "k", "model": "kimi-k2",
                "max_tokens": 8000, "timeout": 120})
            assert r.status == 200 and (await r.json())["status"] == "updated"
            bot.llm_gateway.reload_kimi_inner.assert_awaited()
            assert (await c.put("/api/llm/kimi/config", data="bad")).status == 400


# --------------------------------------------------------------------------- #
# Ollama admin
# --------------------------------------------------------------------------- #
class TestOllamaAdmin:
    @pytest.mark.asyncio
    async def test_status(self):
        app, bot = _app(register_ollama_admin)
        bot.llm_gateway.ollama_client = None
        async with TestClient(TestServer(app)) as c:
            assert (await (await c.get("/api/ollama/status")).json())["configured"] is False
        bot.llm_gateway.ollama_client = _provider_client()
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/ollama/status")).json()
            assert body["configured"] is True and body["model"] == "m1"

    @pytest.mark.asyncio
    async def test_reload(self):
        app, bot = _app(register_ollama_admin)
        bot.llm_gateway.reload_ollama = AsyncMock(return_value={"configured": True})
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/ollama/reload")).status == 200
        bot.llm_gateway.reload_ollama = AsyncMock(return_value={"configured": False})
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/ollama/reload")).status == 503

    @pytest.mark.asyncio
    async def test_probe_models(self):
        app, bot = _app(register_ollama_admin)
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/ollama/probe-models", data="bad")).status == 400
            assert (await c.post("/api/ollama/probe-models",
                                 json={"base_url": "http://8.8.8.8"})).status == 400  # SSRF
            with patch("aiohttp.ClientSession",
                       return_value=_FakeSession(_FakeResp(200, {"models": [{"name": "q"}]}))):
                r = await c.post("/api/ollama/probe-models",
                                 json={"base_url": "http://localhost:11434"})
                assert r.status == 200 and (await r.json())["models"][0]["name"] == "q"
            with patch("aiohttp.ClientSession",
                       return_value=_FakeSession(_FakeResp(500))):
                r = await c.post("/api/ollama/probe-models",
                                 json={"base_url": "http://localhost:11434"})
                assert r.status == 502

    @pytest.mark.asyncio
    async def test_models(self):
        app, bot = _app(register_ollama_admin)
        bot.llm_gateway.ollama_client = None
        async with TestClient(TestServer(app)) as c:
            assert (await c.get("/api/ollama/models")).status == 503
        bot.llm_gateway.ollama_client = _provider_client(models=[{"name": "q"}])
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/ollama/models")).json()
            assert body["active_model"] == "m1" and body["models"][0]["name"] == "q"

    @pytest.mark.asyncio
    async def test_set_model(self):
        app, bot = _app(register_ollama_admin)
        _gw(bot)
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/ollama/model", data="bad")).status == 400
            assert (await c.post("/api/ollama/model", json={})).status == 400  # no model
            bot.llm_gateway.ollama_client = None
            assert (await c.post("/api/ollama/model", json={"model": "q"})).status == 503
            bot.llm_gateway.ollama_client = _provider_client(models=["q:7b"])
            # requested model not in the pulled set → 400
            assert (await c.post("/api/ollama/model", json={"model": "zzz"})).status == 400
            r = await c.post("/api/ollama/model", json={"model": "q:7b"})
            assert r.status == 200 and (await r.json())["model"] == "q:7b"

    @pytest.mark.asyncio
    async def test_set_model_no_lock(self):
        app, bot = _app(register_ollama_admin)
        bot.llm_gateway.provider_lock = None
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/ollama/model", json={"model": "q"})).status == 503


# --------------------------------------------------------------------------- #
# Kimi admin
# --------------------------------------------------------------------------- #
class TestKimiAdmin:
    @pytest.mark.asyncio
    async def test_status(self):
        app, bot = _app(register_kimi_admin)
        bot.llm_gateway.kimi_client = None
        async with TestClient(TestServer(app)) as c:
            assert (await (await c.get("/api/kimi/status")).json())["configured"] is False
        bot.llm_gateway.kimi_client = _provider_client()
        async with TestClient(TestServer(app)) as c:
            assert (await (await c.get("/api/kimi/status")).json())["configured"] is True

    @pytest.mark.asyncio
    async def test_reload(self):
        app, bot = _app(register_kimi_admin)
        bot.llm_gateway.reload_kimi = AsyncMock(return_value={"configured": True})
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/kimi/reload")).status == 200
        bot.llm_gateway.reload_kimi = AsyncMock(return_value={"configured": False})
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/kimi/reload")).status == 503

    @pytest.mark.asyncio
    async def test_models(self):
        app, bot = _app(register_kimi_admin)
        bot.llm_gateway.kimi_client = None
        async with TestClient(TestServer(app)) as c:
            assert (await c.get("/api/kimi/models")).status == 503
        bot.llm_gateway.kimi_client = _provider_client(models=[{"id": "kimi-k2"}])
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/kimi/models")).json()
            assert body["models"][0]["id"] == "kimi-k2"
        # unhealthy → 502
        bad = _provider_client(healthy=False)
        bad.health_check = AsyncMock(return_value={"healthy": False, "error": "down"})
        bot.llm_gateway.kimi_client = bad
        async with TestClient(TestServer(app)) as c:
            assert (await c.get("/api/kimi/models")).status == 502

    @pytest.mark.asyncio
    async def test_set_model(self):
        app, bot = _app(register_kimi_admin)
        _gw(bot)
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/kimi/model", data="bad")).status == 400
            assert (await c.post("/api/kimi/model", json={})).status == 400
            bot.llm_gateway.kimi_client = None
            assert (await c.post("/api/kimi/model", json={"model": "k"})).status == 503
            bot.llm_gateway.kimi_client = _provider_client(models=["kimi-k2"])
            assert (await c.post("/api/kimi/model", json={"model": "other"})).status == 400
            r = await c.post("/api/kimi/model", json={"model": "kimi-k2"})
            assert r.status == 200 and (await r.json())["model"] == "kimi-k2"

    @pytest.mark.asyncio
    async def test_kimi_set_model_no_lock(self):
        app, bot = _app(register_kimi_admin)
        bot.llm_gateway.provider_lock = None
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/kimi/model", json={"model": "k"})).status == 503


# --------------------------------------------------------------------------- #
# Provider-config + admin error branches
# --------------------------------------------------------------------------- #
class TestErrorBranches:
    @pytest.mark.asyncio
    async def test_ollama_config_bad_json_and_no_lock(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        async with TestClient(TestServer(app)) as c:
            assert (await c.put("/api/llm/ollama/config", data="bad")).status == 400
        bot.llm_gateway.provider_lock = None
        async with TestClient(TestServer(app)) as c:
            assert (await c.put("/api/llm/ollama/config", json={"enabled": True})).status == 503

    @pytest.mark.asyncio
    async def test_kimi_config_no_lock_and_invalid(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.llm_gateway.kimi_client = object()
        async with TestClient(TestServer(app)) as c:
            assert (await c.put("/api/llm/kimi/config",
                                json={"max_tokens": "nope"})).status == 400
        bot.llm_gateway.provider_lock = None
        async with TestClient(TestServer(app)) as c:
            assert (await c.put("/api/llm/kimi/config", json={"enabled": True})).status == 503

    @pytest.mark.asyncio
    async def test_ollama_models_http_error_and_exception(self):
        app, bot = _app(register_ollama_admin)
        # HTTP non-200 → 502
        client = _provider_client()
        client._get_session = AsyncMock(return_value=_FakeSession(_FakeResp(500)))
        bot.llm_gateway.ollama_client = client
        async with TestClient(TestServer(app)) as c:
            assert (await c.get("/api/ollama/models")).status == 502
        # session raises → 502
        client2 = _provider_client()
        client2._get_session = AsyncMock(side_effect=RuntimeError("boom"))
        bot.llm_gateway.ollama_client = client2
        async with TestClient(TestServer(app)) as c:
            assert (await c.get("/api/ollama/models")).status == 502

    @pytest.mark.asyncio
    async def test_probe_models_exception(self):
        app, bot = _app(register_ollama_admin)
        with patch("aiohttp.ClientSession", side_effect=RuntimeError("net down")):
            async with TestClient(TestServer(app)) as c:
                r = await c.post("/api/ollama/probe-models",
                                 json={"base_url": "http://localhost:11434"})
                assert r.status == 502


# --------------------------------------------------------------------------- #
# Helper units — SSRF validation, int parsing, config persistence
# --------------------------------------------------------------------------- #
class TestValidateOllamaUrl:
    def test_scheme_required(self):
        with pytest.raises(ValueError):
            _validate_ollama_url("ftp://localhost")

    def test_allowed_host_and_private_ip(self):
        assert _validate_ollama_url("http://localhost:11434").startswith("http")
        assert _validate_ollama_url("http://10.0.0.1:11434").startswith("http")

    def test_link_local_and_public_rejected(self):
        with pytest.raises(ValueError):
            _validate_ollama_url("http://169.254.1.1")
        with pytest.raises(ValueError):
            _validate_ollama_url("http://8.8.8.8")

    def test_hostname_resolves_private(self):
        with patch("socket.getaddrinfo",
                   return_value=[(2, 1, 6, "", ("10.1.2.3", 0))]):
            assert _validate_ollama_url("http://ollama.local").startswith("http")

    def test_hostname_resolves_public_rejected(self):
        with patch("socket.getaddrinfo",
                   return_value=[(2, 1, 6, "", ("1.2.3.4", 0))]):
            with pytest.raises(ValueError):
                _validate_ollama_url("http://evil.example")

    def test_hostname_unresolvable_rejected(self):
        with patch("socket.getaddrinfo", side_effect=OSError("no dns")):
            with pytest.raises(ValueError):
                _validate_ollama_url("http://nope.invalid")

    def test_hostname_resolves_empty_rejected(self):
        with patch("socket.getaddrinfo", return_value=[]):
            with pytest.raises(ValueError):
                _validate_ollama_url("http://empty.example")

    def test_hostname_resolves_link_local_rejected(self):
        with patch("socket.getaddrinfo",
                   return_value=[(2, 1, 6, "", ("169.254.9.9", 0))]):
            with pytest.raises(ValueError):
                _validate_ollama_url("http://ll.example")


class TestParseInt:
    def test_valid_and_errors(self):
        assert _parse_int("50", "x", 1, 100) == 50
        with pytest.raises(ValueError):
            _parse_int("abc", "x")
        with pytest.raises(ValueError):
            _parse_int(999, "x", 1, 100)  # out of range


class TestPersistHelpers:
    def test_safe_secret_branches(self):
        _ui_set_secrets.discard("t.key")
        # env-var placeholder preserved when not UI-set
        assert _safe_secret("t.key", "${ENV_VAR}", "real") == "${ENV_VAR}"
        # plain existing value → memory value wins
        assert _safe_secret("t.key", "old", "real") == "real"
        # explicitly UI-set → memory value
        _ui_set_secrets.add("t.key")
        try:
            assert _safe_secret("t.key", "${ENV_VAR}", "real") == "real"
        finally:
            _ui_set_secrets.discard("t.key")

    def test_persist_no_file_raises(self):
        # A mutation endpoint must not claim success when nothing persisted —
        # missing config.yml is now a loud failure, not a silent no-op.
        from pathlib import Path

        from src.web.api.llm_admin import PersistError
        Path("config.yml").unlink(missing_ok=True)  # active path set, file absent
        with pytest.raises(PersistError, match="does not exist"):
            _persist_llm_sections_sync(_bot())

    def test_persist_refuses_when_no_active_config_path(self, monkeypatch):
        # THE guard against the config-wipe class: a fabricated Config (never
        # loaded from disk, so no active path) must NOT fall back to a
        # CWD-relative config.yml and clobber whatever lives there. This is the
        # exact shape of the review repro that overwrote the live config.
        from pathlib import Path

        from src.config import schema
        from src.web.api.llm_admin import PersistError
        monkeypatch.setattr(schema, "_ACTIVE_CONFIG_PATH", None)
        Path("config.yml").write_text("discord:\n  token: real-do-not-touch\n")
        with pytest.raises(PersistError, match="not loaded from disk"):
            _persist_llm_sections_sync(_bot())
        # The bystander config.yml in the CWD was left untouched.
        assert Path("config.yml").read_text() == "discord:\n  token: real-do-not-touch\n"

    def test_persist_round_trips_config(self):
        from pathlib import Path
        Path("config.yml").write_text("discord:\n  token: fake\n")
        bot = _bot()
        bot.config.openai_codex.model = "gpt-5.5"
        bot.config.openai_codex.reasoning_effort = "xhigh"
        bot.config.ollama.model = "qwen3"
        _persist_llm_sections_sync(bot)
        written = Path("config.yml").read_text()
        assert "openai_codex" in written and "gpt-5.5" in written
        assert "reasoning_effort" in written and "xhigh" in written
        assert "ollama" in written and "kimi" in written and "llm_provider" in written

    def test_persist_strips_removed_keys(self):
        # A legacy config carrying the removed knobs (auxiliary tasks/
        # max_tokens/credentials_path, openai_codex.model_routing) must be
        # CLEANED on the next save — not left to linger on disk.
        from pathlib import Path

        from ruamel.yaml import YAML
        Path("config.yml").write_text(
            "discord:\n  token: fake\n"
            "openai_codex:\n"
            "  model_routing:\n    enabled: true\n"
            "  auxiliary:\n    enabled: true\n    model: gpt-5.6-terra\n"
            "    tasks: [compaction]\n    max_tokens: 2048\n    credentials_path: /x\n"
        )
        bot = _bot()
        bot.config.openai_codex.auxiliary.enabled = True
        bot.config.openai_codex.auxiliary.model = "gpt-5.6-terra"
        _persist_llm_sections_sync(bot)
        oc = YAML().load(Path("config.yml").read_text())["openai_codex"]
        assert "model_routing" not in oc  # removed-feature block gone
        assert set(oc["auxiliary"]) == {"enabled", "model"}  # only the 2 real knobs
        assert oc["auxiliary"]["model"] == "gpt-5.6-terra"

    def test_persist_preserves_file_mode(self):
        # os.replace of a mkstemp(0600) temp must NOT silently chmod the live
        # 0664 config — the original mode is restored before replace.
        import os
        from pathlib import Path
        p = Path("config.yml")
        p.write_text("discord:\n  token: fake\n")
        os.chmod(p, 0o664)
        _persist_llm_sections_sync(_bot())
        assert (os.stat(p).st_mode & 0o777) == 0o664

    def test_persist_dir_fsync_failure_is_nonfatal_disk_committed(self, monkeypatch):
        # os.replace is THE commit point; a post-replace directory fsync
        # failure must NOT raise (that would split disk-new vs runtime-old).
        import os
        from pathlib import Path
        Path("config.yml").write_text("discord:\n  token: fake\n")
        bot = _bot()
        bot.config.openai_codex.model = "gpt-5.6-sol"
        real_open = os.open

        def _open(path, *a, **k):
            if os.path.isdir(path):
                raise OSError("dir fsync open failed")
            return real_open(path, *a, **k)

        monkeypatch.setattr(os, "open", _open)
        _persist_llm_sections_sync(bot)  # must NOT raise
        assert "gpt-5.6-sol" in Path("config.yml").read_text()  # disk committed

    def test_persist_malformed_error_has_no_secret_values(self):
        # A ruamel duplicate-key error echoes both conflicting VALUES; those
        # are secrets in this file. The raised message must be generic.
        from pathlib import Path

        from src.web.api.llm_admin import PersistError
        Path("config.yml").write_text(
            "discord:\n  token: SECRET_TOKEN_AAA\n  token: SECRET_TOKEN_BBB\n")
        try:
            _persist_llm_sections_sync(_bot())
            raise AssertionError("expected PersistError")
        except PersistError as e:
            assert "SECRET_TOKEN" not in str(e)
            assert str(e) == "config.yml unreadable or malformed"

    def test_persist_atomic_write_failure_cleans_temp_and_original_intact(self, monkeypatch):
        # An os.replace failure must clean the temp file and NOT corrupt the
        # existing config.yml (atomic replace: original stays whole).
        import glob
        import os
        from pathlib import Path
        Path("config.yml").write_text("discord:\n  token: fake\n")
        bot = _bot()
        bot.config.openai_codex.model = "gpt-5.6-sol"
        monkeypatch.setattr(os, "replace", MagicMock(side_effect=OSError("disk full")))
        with pytest.raises(OSError, match="disk full"):
            _persist_llm_sections_sync(bot)
        # original untouched, no leaked temp files
        assert Path("config.yml").read_text() == "discord:\n  token: fake\n"
        assert glob.glob("*.yml.tmp") == []

    def test_persist_includes_agent_reasoning_effort(self):
        """The YAML allowlist writes the field explicitly — without it, UI
        saves of the agent effort would silently never persist."""
        from pathlib import Path
        Path("config.yml").write_text("discord:\n  token: fake\n")
        bot = _bot()
        bot.config.openai_codex.agent_reasoning_effort = "low"
        _persist_llm_sections_sync(bot)
        written = Path("config.yml").read_text()
        assert "agent_reasoning_effort: low" in written
        # null (inherit) round-trips as an explicit empty value
        bot.config.openai_codex.agent_reasoning_effort = None
        _persist_llm_sections_sync(bot)
        written = Path("config.yml").read_text()
        assert "agent_reasoning_effort" in written
        assert "agent_reasoning_effort: low" not in written

    def test_persist_includes_agent_model(self):
        """Same allowlist requirement as agent_reasoning_effort — without the
        explicit write, UI saves of the agent model would never persist."""
        from pathlib import Path
        Path("config.yml").write_text("discord:\n  token: fake\n")
        bot = _bot()
        bot.config.openai_codex.agent_model = "gpt-5.6-luna"
        _persist_llm_sections_sync(bot)
        written = Path("config.yml").read_text()
        assert "agent_model: gpt-5.6-luna" in written
        bot.config.openai_codex.agent_model = None
        _persist_llm_sections_sync(bot)
        written = Path("config.yml").read_text()
        assert "agent_model" in written
        assert "agent_model: gpt-5.6-luna" not in written

    def test_persist_empty_file_raises(self):
        from pathlib import Path

        from src.web.api.llm_admin import PersistError
        Path("config.yml").write_text("")  # ry.load → None
        with pytest.raises(PersistError, match="empty"):
            _persist_llm_sections_sync(_bot())

    def test_persist_malformed_yaml_raises(self):
        from pathlib import Path

        from src.web.api.llm_admin import PersistError
        Path("config.yml").write_text("discord: {token: 'unterminated")  # ry.load raises
        with pytest.raises(PersistError, match="unreadable or malformed"):
            _persist_llm_sections_sync(_bot())


class TestLegacyPersistConfig:
    """The fail-soft `_persist_config` shared by the sibling provider routes
    (Codex/Ollama/Kimi config + model-set). The filesystem worker settles via
    the gateway's run_persist_settled; PersistError is swallowed (master's
    silent no-op), a genuine write error propagates (500), and a cancellation
    that arrived mid-write is re-raised — never swallowed."""

    @pytest.mark.asyncio
    async def test_persist_error_swallowed_fail_soft(self):
        from src.web.api.llm_admin import PersistError, _persist_config
        bot = _bot()
        bot.llm_gateway.run_persist_settled = AsyncMock(
            return_value=(PersistError("config.yml does not exist"), False))
        await _persist_config(bot)  # must NOT raise — legacy no-op

    @pytest.mark.asyncio
    async def test_genuine_write_error_propagates(self):
        from src.web.api.llm_admin import _persist_config
        bot = _bot()
        bot.llm_gateway.run_persist_settled = AsyncMock(
            return_value=(OSError("disk full"), False))
        with pytest.raises(OSError, match="disk full"):
            await _persist_config(bot)

    @pytest.mark.asyncio
    async def test_cancellation_reraised_never_swallowed(self):
        from src.web.api.llm_admin import _persist_config
        bot = _bot()
        bot.llm_gateway.run_persist_settled = AsyncMock(return_value=(None, True))
        with pytest.raises(asyncio.CancelledError):
            await _persist_config(bot)


class TestCodexMaxEffortPairValidation:
    """Merged-desired-state boundary: the PUT accepts partial bodies, so an
    incompatible model/effort pair must be caught on the RESULT of the update
    — in either direction, on both axes, before any mutation or reload."""

    @pytest.mark.asyncio
    async def test_max_accepted_on_capable_model(self):
        app, bot = _app(register_provider_config)
        gw = _gw(bot)
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"model": "gpt-5.6-sol", "reasoning_effort": "max"})
            assert r.status == 200
        assert bot.config.openai_codex.reasoning_effort == "max"
        gw.reload_codex_inner.assert_awaited()

    @pytest.mark.asyncio
    async def test_effort_direction_rejected_with_allowed_list(self):
        app, bot = _app(register_provider_config)
        gw = _gw(bot)
        bot.config.openai_codex.model = "gpt-5.5"
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config", json={"reasoning_effort": "max"})
            assert r.status == 400
            data = await r.json()
            assert "gpt-5.5" in data["error"] and "'max'" in data["error"]
            assert "max" not in data["allowed"] and "xhigh" in data["allowed"]
        # nothing mutated, nothing reloaded
        assert bot.config.openai_codex.reasoning_effort == "medium"
        gw.reload_codex_inner.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_model_direction_rejected(self):
        """Changing ONLY the model under a persisted max is the same 400."""
        app, bot = _app(register_provider_config)
        gw = _gw(bot)
        bot.config.openai_codex.model = "gpt-5.6-sol"
        bot.config.openai_codex.reasoning_effort = "max"
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config", json={"model": "gpt-5.5"})
            assert r.status == 400
        assert bot.config.openai_codex.model == "gpt-5.6-sol"
        gw.reload_codex_inner.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_agent_model_direction_rejected(self):
        """Agent axes inheriting the main max: fixing agent_model to gpt-5.5
        breaks the effective agent pair even though neither field is 'wrong'
        alone."""
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.config.openai_codex.model = "gpt-5.6-sol"
        bot.config.openai_codex.reasoning_effort = "max"
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config", json={"agent_model": "gpt-5.5"})
            assert r.status == 400
            assert "agent settings" in (await r.json())["error"]
        assert bot.config.openai_codex.agent_model is None

    @pytest.mark.asyncio
    async def test_agent_effort_direction_rejected(self):
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.config.openai_codex.agent_model = "gpt-5.5"
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"agent_reasoning_effort": "max"})
            assert r.status == 400
        assert bot.config.openai_codex.agent_reasoning_effort is None

    @pytest.mark.asyncio
    async def test_combined_valid_switch_in_one_put_accepted(self):
        """Leaving a bad-pair state by changing BOTH fields at once must work
        (the merged result is what's validated, not the transition)."""
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.config.openai_codex.model = "gpt-5.6-sol"
        bot.config.openai_codex.reasoning_effort = "max"
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"model": "gpt-5.5", "reasoning_effort": "xhigh"})
            assert r.status == 200
        assert bot.config.openai_codex.model == "gpt-5.5"
        assert bot.config.openai_codex.reasoning_effort == "xhigh"

    @pytest.mark.asyncio
    async def test_auto_axis_exempt(self):
        """'auto' on an agent axis defers pair validation to the spawn and
        request-construction boundaries."""
        app, bot = _app(register_provider_config)
        _gw(bot)
        bot.config.openai_codex.model = "gpt-5.5"
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/llm/codex/config",
                            json={"agent_model": "auto", "agent_reasoning_effort": "max"})
            assert r.status == 200
        assert bot.config.openai_codex.agent_reasoning_effort == "max"
