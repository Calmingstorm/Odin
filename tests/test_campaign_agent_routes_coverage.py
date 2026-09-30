"""Malformed agent-policy writes are rejected before persistence or spawning."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config
from src.web.api import agents_loops


async def test_invalid_json_agent_policy_never_persists(monkeypatch):
    persist = AsyncMock(side_effect=AssertionError("no config mutation"))
    monkeypatch.setattr(agents_loops, "persist_config_paths_locked", persist)
    routes = web.RouteTableDef()
    agents_loops.register_agents(routes, SimpleNamespace(config=Config(discord={"token": "test"})))
    app = web.Application()
    app.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.put("/api/agents/model", data="{")
        assert response.status == 400
        assert "error" in await response.json()
    persist.assert_not_awaited()
