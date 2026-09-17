"""F8/F12 gate diagnostics and fail-closed HTTP enforcement."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import WebConfig
from src.health.server import SessionManager, _make_auth_middleware, _make_bootstrap_gate_middleware
from src.permissions.token_manager import ApiTokenManager


async def test_malformed_dynamic_store_does_not_disable_http_auth(tmp_path):
    path = tmp_path / "tokens.json"
    path.write_text("{broken")
    app = web.Application(middlewares=[_make_auth_middleware(WebConfig(), SessionManager())])
    app["token_manager"] = ApiTokenManager(str(path))
    app.router.add_get("/api/private", lambda request: web.json_response({"private": True}))
    async with TestClient(TestServer(app)) as client:
        response = await client.get("/api/private")
        assert response.status == 403


async def test_malformed_store_cannot_create_development_login(tmp_path):
    from src.web.api.security import register_auth

    path = tmp_path / "tokens.json"
    path.write_text("{broken")
    bot = SimpleNamespace(
        config=SimpleNamespace(web=WebConfig()), api_token_manager=ApiTokenManager(str(path))
    )
    app = web.Application()
    app["session_manager"] = SessionManager()
    routes = web.RouteTableDef()
    register_auth(routes, bot)
    app.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/auth/login", json={"token": "anything"})
        assert response.status == 403


async def test_runtime_corruption_revokes_anonymous_websocket(tmp_path):
    from src.web.websocket import setup_websocket

    path = tmp_path / "tokens.json"
    bot = SimpleNamespace(
        config=SimpleNamespace(web=WebConfig()), api_token_manager=ApiTokenManager(str(path)),
        name="odin",
    )
    app = web.Application()
    setup_websocket(app, bot, web_config=bot.config.web)
    async with TestClient(TestServer(app)) as client:
        async with client.ws_connect("/api/ws") as ws:
            await ws.send_json({"type": "ping", "ts": 1})
            assert (await ws.receive_json())["type"] == "pong"
            path.write_text("{broken")
            await ws.send_json({"type": "ping", "ts": 2})
            await ws.receive()
            assert ws.closed


async def test_gate_logs_exception_reason_once_without_exception_secrets(monkeypatch):
    from src.health import server

    warning = []
    monkeypatch.setattr(server.log, "warning", lambda *args: warning.append(args))
    app = web.Application(middlewares=[_make_bootstrap_gate_middleware()])
    app["onboarding"] = SimpleNamespace(state=AsyncMock(side_effect=OSError("SECRET")))
    app.router.add_get("/api/private", lambda request: web.Response())
    async with TestClient(TestServer(app)) as client:
        assert (await client.get("/api/private")).status == 403
        assert (await client.get("/api/private")).status == 403
    assert len(warning) == 1
    assert "OSError" in str(warning)
    assert "SECRET" not in str(warning)


@pytest.mark.parametrize("token,available,expected", [
    ("configured", False, 503), ("configured", True, 200), ("", False, 200)
])
async def test_ready_tracks_configured_gateway(token, available, expected):
    from src.health.server import HealthServer

    health = HealthServer.__new__(HealthServer)
    health._ready = True
    health._components = {}
    health._config_owner = SimpleNamespace(
        config=SimpleNamespace(discord=SimpleNamespace(token=token)),
        connection_supervisor=SimpleNamespace(
            connection_availability=lambda: SimpleNamespace(available=available)
        ),
    )
    assert (await health._health_ready(None)).status == expected
