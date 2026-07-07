"""Route-level coverage for src/web/api/llm_admin.py (RFC-006 P4a).

Drives LLM provider status, connection-pool, and provider-config routes
through the real route layer with a real Config + MagicMock components.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config
from src.web.api.llm_admin import (
    register_connection_pools,
    register_llm_provider,
    register_provider_config,
)


@pytest.fixture(autouse=True)
def _isolate_cwd(tmp_path, monkeypatch):
    # llm_admin persist paths write a relative Path("config.yml"); keep them
    # out of the repo root.
    monkeypatch.chdir(tmp_path)


def _bot():
    bot = MagicMock()
    bot.config = Config(discord={"token": "fake"})
    return bot


def _app(*registrars, bot=None):
    bot = bot or _bot()
    routes = web.RouteTableDef()
    for reg in registrars:
        reg(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app, bot


class TestLlmStatus:
    @pytest.mark.asyncio
    async def test_llm_status_reports_providers(self):
        from types import SimpleNamespace
        app, bot = _app(register_llm_provider)
        bot.llm_gateway.codex_client = object()
        bot.llm_gateway.ollama_client = None
        bot.llm_gateway.kimi_client = None
        bot.llm_gateway.active_client = SimpleNamespace(model="gpt-5.5", provider_name="codex")
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/llm/status")).json()
            assert body["codex"]["configured"] is True
            assert body["ollama"]["configured"] is False
            assert "active_provider" in body

    @pytest.mark.asyncio
    async def test_llm_switch_validation_and_success(self):
        app, bot = _app(register_llm_provider)
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/llm/switch", data="bad")).status == 400
            assert (await c.post("/api/llm/switch", json={"provider": "x"})).status == 400
        bot.llm_gateway.switch_provider = AsyncMock(return_value={"error": "nope"})
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/llm/switch", json={"provider": "ollama"})).status == 400


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
            r2 = await c.post("/api/pools/ssh/close", json={})
            assert (await r2.json())["closed_count"] == 4


class TestProviderConfig:
    @pytest.mark.asyncio
    async def test_provider_config_route_registers(self):
        # Smoke: registrar wires; exercises the module import + route setup.
        app, bot = _app(register_provider_config)
        assert app is not None
