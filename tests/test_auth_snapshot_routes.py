from __future__ import annotations

import base64
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, WebConfig
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


def login_app(manager, web_config=None):
    bot = SimpleNamespace(
        config=SimpleNamespace(web=web_config or WebConfig()), api_token_manager=manager,
    )
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


async def test_static_login_survives_corrupt_dynamic_store_without_anonymous_fallback(tmp_path):
    manager = ApiTokenManager(str(tmp_path / "tokens.json"))
    dynamic = await manager.create_token("dynamic")
    manager._path.write_text("{broken")
    static = WebConfig(api_token="static-secret")

    async with TestClient(TestServer(login_app(manager, static))) as client:
        assert (
            await client.post("/api/auth/login", json={"token": "static-secret"})
        ).status == 200
        assert (
            await client.post("/api/auth/login", json={"token": dynamic.token})
        ).status == 403
        assert (
            await client.post("/api/auth/login", json={"token": "anything"})
        ).status == 403


async def test_static_websocket_survives_corrupt_dynamic_store(tmp_path):
    manager = ApiTokenManager(str(tmp_path / "tokens.json"))
    await manager.create_token("dynamic")
    manager._path.write_text("{broken")
    web_config = WebConfig(api_token="static-secret")
    bot = SimpleNamespace(
        config=SimpleNamespace(web=web_config), api_token_manager=manager, name="odin",
    )
    app = web.Application()
    app["token_manager"] = manager
    setup_websocket(app, bot, web_config=web_config)

    async with TestClient(TestServer(app)) as client:
        async with client.ws_connect(
            "/api/ws", protocols=[protocol("static-secret")],
        ) as ws:
            await ws.send_json({"type": "ping", "ts": 1})
            assert (await ws.receive_json())["type"] == "pong"


@pytest.mark.parametrize("static_token", ["", "static-secret"])
async def test_invalid_only_store_never_enables_anonymous_login(tmp_path, static_token):
    path = tmp_path / "tokens.json"
    path.write_text('[{"user_id": "broken"}]')
    manager = ApiTokenManager(str(path))
    config = WebConfig(api_token=static_token)

    async with TestClient(TestServer(login_app(manager, config))) as client:
        response = await client.post("/api/auth/login", json={"token": "anything"})
        assert response.status == 403


def recovery_app(manager, web_config):
    sessions = SessionManager()
    bot = SimpleNamespace(
        config=SimpleNamespace(web=web_config), api_token_manager=manager, name="odin",
    )
    routes = web.RouteTableDef()
    register_auth(routes, bot)
    app = web.Application(middlewares=[_make_auth_middleware(web_config, sessions)])
    app["session_manager"] = sessions
    app["token_manager"] = manager
    app.add_routes(routes)
    app.router.add_get("/api/protected", lambda request: web.json_response({
        "user_id": getattr(getattr(request, "_api_identity", None), "user_id", None),
    }))
    setup_websocket(app, bot, web_config=web_config)
    return app, sessions


async def test_static_browser_session_and_websocket_survive_dynamic_recovery(tmp_path):
    manager = ApiTokenManager(str(tmp_path / "tokens.json"))
    await manager.create_token("dynamic")
    static = ApiTokenIdentity(token="static-secret", user_id="static-admin")
    app, _sessions = recovery_app(manager, WebConfig(api_tokens=[static]))

    async with TestClient(TestServer(app)) as client:
        login = await client.post("/api/auth/login", json={"token": "static-secret"})
        sid = (await login.json())["session_id"]
        manager._path.write_text("{broken")
        response = await client.get(
            "/api/protected", headers={"Authorization": f"Bearer {sid}"},
        )
        assert response.status == 200
        assert (await response.json())["user_id"] == "static-admin"
        async with client.ws_connect(
            "/api/ws", headers={"Authorization": f"Bearer {sid}"},
        ) as ws:
            await ws.send_json({"type": "ping", "ts": 1})
            assert (await ws.receive_json())["type"] == "pong"


async def test_dynamic_api_admin_session_and_old_anonymous_session_fail_recovery(tmp_path):
    manager = ApiTokenManager(str(tmp_path / "tokens.json"))
    dynamic = await manager.create_token("api-admin")
    app, sessions = recovery_app(manager, WebConfig())

    async with TestClient(TestServer(app)) as client:
        login = await client.post("/api/auth/login", json={"token": dynamic.token})
        dynamic_sid = (await login.json())["session_id"]
        anonymous_sid, _ = sessions.create()
        manager._path.write_text("{broken")
        for sid in (dynamic_sid, anonymous_sid):
            response = await client.get(
                "/api/protected", headers={"Authorization": f"Bearer {sid}"},
            )
            assert response.status == 403
