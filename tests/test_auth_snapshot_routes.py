from __future__ import annotations

import base64
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import WebConfig
from src.health.server import (
    HealthServer,
    SessionManager,
    _make_admin_middleware,
    _make_auth_middleware,
)
from src.permissions.token_manager import ApiTokenManager
from src.web.api.security import register_auth
from src.web.websocket import setup_websocket


def protocol(token: str) -> str:
    return "odin.bearer." + base64.urlsafe_b64encode(token.encode()).decode().rstrip("=")


class CorruptAfterSnapshot(ApiTokenManager):
    calls = 0
    corrupt = False

    def auth_snapshot(self):
        self.calls += 1
        result = super().auth_snapshot()
        if self.corrupt:
            self.corrupt = False
            self._path.write_text("{broken")
        return result


def login_app(manager):
    bot = SimpleNamespace(config=SimpleNamespace(web=WebConfig()), api_token_manager=manager)
    routes = web.RouteTableDef()
    register_auth(routes, bot)
    app = web.Application()
    app["session_manager"] = SessionManager()
    app.add_routes(routes)
    return app


async def test_external_empty_denies_http_login_and_websocket(tmp_path):
    manager = ApiTokenManager(str(tmp_path / "tokens.json"))
    await manager.create_token("admin")
    manager._path.write_text("[]")
    app = web.Application(
        middlewares=[
            _make_auth_middleware(WebConfig(), SessionManager()),
            _make_admin_middleware(WebConfig()),
        ]
    )
    app["token_manager"] = manager
    app.router.add_get("/api/config", lambda request: web.Response())
    async with TestClient(TestServer(app)) as client:
        assert (await client.get("/api/config")).status == 403
    async with TestClient(TestServer(login_app(manager))) as client:
        assert (await client.post("/api/auth/login", json={"token": "x"})).status == 403
    bot = SimpleNamespace(
        config=SimpleNamespace(web=WebConfig()), api_token_manager=manager, name="odin"
    )
    app = web.Application()
    app["token_manager"] = manager
    setup_websocket(app, bot, web_config=bot.config.web)
    async with TestClient(TestServer(app)) as client:
        async with client.ws_connect("/api/ws") as ws:
            await ws.receive()
            assert ws.closed and ws.close_code == 4001


async def test_http_admin_share_one_snapshot_during_corruption(tmp_path):
    manager = CorruptAfterSnapshot(str(tmp_path / "tokens.json"))
    await manager.create_token("admin")
    manager.calls, manager.corrupt = 0, True
    app = web.Application(
        middlewares=[
            _make_auth_middleware(WebConfig(), SessionManager()),
            _make_admin_middleware(WebConfig()),
        ]
    )
    app["token_manager"] = manager
    app.router.add_get("/api/config", lambda request: web.Response())
    async with TestClient(TestServer(app)) as client:
        assert (await client.get("/api/config")).status == 401
    assert manager.calls == 1


async def test_authenticated_guest_cannot_skip_admin_after_corruption(tmp_path):
    manager = CorruptAfterSnapshot(str(tmp_path / "tokens.json"))
    guest = await manager.create_token("guest", tier="guest")
    manager.calls, manager.corrupt = 0, True
    app = web.Application(middlewares=[
        _make_auth_middleware(WebConfig(), SessionManager()),
        _make_admin_middleware(WebConfig()),
    ])
    app["token_manager"] = manager
    app.router.add_get("/api/config", lambda request: web.Response())
    async with TestClient(TestServer(app)) as client:
        response = await client.get(
            "/api/config", headers={"Authorization": f"Bearer {guest.token}"},
        )
        assert response.status == 403
        assert (await response.json())["error"] == "admin access required"
    assert manager.calls == 1


@pytest.mark.parametrize("host,allowed", [("127.0.0.1", True), ("::1", True), ("0.0.0.0", False)])
async def test_last_removal_uses_actual_listener_guard(tmp_path, host, allowed):
    manager = ApiTokenManager(str(tmp_path / "tokens.json"))
    token = await manager.create_token("admin")
    health = HealthServer.__new__(HealthServer)
    health._listener_sockets = [SimpleNamespace(getsockname=lambda: (host, 8080))]
    health._effective_bind_host = host
    manager.set_last_credential_guard(health.may_remove_credential_inventory)
    if allowed:
        assert await manager.delete_token("admin")
        assert not manager.credential_store_auth_required
        app = web.Application(middlewares=[_make_auth_middleware(WebConfig(), SessionManager())])
        app["token_manager"] = manager
        app.router.add_get("/api/config", lambda request: web.Response())
        async with TestClient(TestServer(app)) as client:
            assert (await client.get("/api/config")).status == 200
    else:
        with pytest.raises(PermissionError):
            await manager.delete_token("admin")
        assert manager.resolve(token.token)


@pytest.mark.parametrize("replacement", ["[]", "{broken"])
async def test_active_websocket_denies_external_empty_or_corrupt_store(tmp_path, replacement):
    manager = ApiTokenManager(str(tmp_path / "tokens.json"))
    created = await manager.create_token("admin")
    bot = SimpleNamespace(
        config=SimpleNamespace(web=WebConfig()), api_token_manager=manager, name="odin",
    )
    app = web.Application()
    app["token_manager"] = manager
    setup_websocket(app, bot, web_config=bot.config.web)
    async with TestClient(TestServer(app)) as client:
        async with client.ws_connect("/api/ws", protocols=[protocol(created.token)]) as ws:
            await ws.send_json({"type": "ping", "ts": 1})
            assert (await ws.receive_json())["type"] == "pong"
            manager._path.write_text(replacement)
            await ws.send_json({"type": "chat", "message": "must not execute"})
            assert await ws.receive_json() == {
                "type": "chat_error", "error": "authorization changed; reconnect",
            }
            await ws.send_json({"subscribe": "events"})
            assert await ws.receive_json() == {
                "error": "admin access required", "channel": "events",
            }


async def test_login_and_websocket_snapshot_lookup(tmp_path):
    manager = CorruptAfterSnapshot(str(tmp_path / "tokens.json"))
    created = await manager.create_token("admin")
    manager.calls, manager.corrupt = 0, True
    async with TestClient(TestServer(login_app(manager))) as client:
        assert (await client.post("/api/auth/login", json={"token": created.token})).status == 200
    assert manager.calls == 1

    manager = CorruptAfterSnapshot(str(tmp_path / "tokens2.json"))
    created = await manager.create_token("admin")
    manager.calls = 0
    bot = SimpleNamespace(
        config=SimpleNamespace(web=WebConfig()), api_token_manager=manager, name="odin"
    )
    app = web.Application()
    app["token_manager"] = manager
    setup_websocket(app, bot, web_config=bot.config.web)
    async with TestClient(TestServer(app)) as client:
        async with client.ws_connect("/api/ws", protocols=[protocol(created.token)]) as ws:
            await ws.send_json({"type": "ping", "ts": 1})
            assert (await ws.receive_json())["type"] == "pong"
    assert manager.calls >= 1
