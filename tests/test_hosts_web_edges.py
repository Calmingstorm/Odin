"""Hermetic route-edge coverage for dedicated managed-host ownership.

The generic Config route must not mutate host configuration owned by the Hosts
API, and every host-access policy route must enforce the shared admin gate.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config
from src.permissions.host_access import HostAccessManager
from src.web.api.config_admin import register_discord_config
from src.web.api.security import register_host_access


def _config_bot() -> MagicMock:
    bot = MagicMock()
    bot.config = Config(discord={"token": "test-token"})
    return bot


def _host_access_bot(tmp_path) -> MagicMock:
    bot = _config_bot()
    bot.host_access_manager = HostAccessManager(
        path=str(tmp_path / "host-access.json"), available_hosts=["alpha"]
    )
    return bot


def _app(registrar, bot, *, identity=None) -> web.Application:
    routes = web.RouteTableDef()
    registrar(routes, bot)

    @web.middleware
    async def inject_identity(request, handler):
        if identity is not None:
            request.__dict__["_api_identity"] = identity
        return await handler(request)

    app = web.Application(middlewares=[inject_identity])
    app.router.add_routes(routes)
    return app


def test_hosts_page_renders_structured_delete_references():
    source = (
        __import__("pathlib").Path(__file__).parents[1] / "ui/js/pages/hosts.js"
    ).read_text()
    assert "pendingReferences.value=Array.isArray(e.data?.pending_references)" in source
    assert 'v-for="item in pendingReferences"' in source
    assert "item.kind" in source and "item.location" in source


@pytest.mark.asyncio
async def test_generic_config_rejects_all_dedicated_managed_host_fields():
    """The generic PUT reports every host-owned field and changes no runtime state."""
    bot = _config_bot()
    before = bot.config.model_dump()["tools"]
    app = _app(register_discord_config, bot)

    async with TestClient(TestServer(app)) as client:
        response = await client.put(
            "/api/config",
            json={
                "tools": {
                    "hosts": {"new-host": {"address": "192.0.2.10"}},
                    "default_host": "new-host",
                    "allow_host_tofu": True,
                }
            },
        )
        body = await response.json()

    assert response.status == 409
    assert body == {
        "error": "managed-host fields are read-only on this route",
        "detail": "Use the Hosts management API and panel.",
        "fields": ["allow_host_tofu", "default_host", "hosts"],
    }
    assert bot.config.model_dump()["tools"] == before


@pytest.mark.asyncio
async def test_host_access_routes_deny_non_admin_before_read_or_mutation(tmp_path):
    """Every host-access route rejects a user-tier API identity at the route edge."""
    bot = _host_access_bot(tmp_path)
    app = _app(
        register_host_access,
        bot,
        identity=SimpleNamespace(tier="user", user_id="ordinary-user"),
    )

    requests = (
        ("GET", "/api/host-access", None),
        ("PUT", "/api/host-access/user/ordinary-user", {"allowed_hosts": ["alpha"]}),
        ("DELETE", "/api/host-access/user/ordinary-user", None),
        ("PUT", "/api/host-access/default-policy", {"allowed_hosts": ["alpha"]}),
    )
    async with TestClient(TestServer(app)) as client:
        for method, path, payload in requests:
            response = await client.request(method, path, json=payload)
            assert response.status == 403
            assert await response.json() == {"error": "admin access required"}

    assert bot.host_access_manager.list_users() == {}
    assert bot.host_access_manager.default_policy.to_dict() == {
        "allowed_hosts": None,
        "default_host": "",
    }
