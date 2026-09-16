from __future__ import annotations

from types import SimpleNamespace

import pytest
from aiohttp import WSServerHandshakeError, web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, WebConfig
from src.health.server import SessionManager, _make_auth_middleware
from src.permissions.token_manager import ApiTokenManager
from src.web.api.security import register_auth
from src.web.websocket import setup_websocket


def _app(manager: ApiTokenManager, bot, sessions: SessionManager) -> web.Application:
    routes = web.RouteTableDef()
    register_auth(routes, bot)
    app = web.Application(middlewares=[_make_auth_middleware(lambda: bot.config.web, sessions)])
    app["session_manager"] = sessions
    app["token_manager"] = manager
    app.add_routes(routes)
    app.router.add_get(
        "/api/protected",
        lambda request: web.json_response(
            {"user_id": getattr(getattr(request, "_api_identity", None), "user_id", None)}
        ),
    )
    setup_websocket(app, bot, web_config=bot.config.web)
    return app


async def _login(client: TestClient, token: str) -> str:
    response = await client.post("/api/auth/login", json={"token": token})
    assert response.status == 200
    return (await response.json())["session_id"]


@pytest.mark.parametrize("replacement", [None, "rotated-static"])
async def test_recovery_does_not_revive_revoked_or_rotated_static_session(
    tmp_path, replacement
):
    manager = ApiTokenManager(str(tmp_path / "tokens.json"))
    await manager.create_token("dynamic")
    original = ApiTokenIdentity(token="original-static", user_id="static-admin")
    bot = SimpleNamespace(
        config=SimpleNamespace(web=WebConfig(api_tokens=[original])),
        api_token_manager=manager,
        name="odin",
    )
    sessions = SessionManager()

    async with TestClient(TestServer(_app(manager, bot, sessions))) as client:
        sid = await _login(client, original.token)
        bot.config.web = WebConfig(
            api_tokens=(
                [ApiTokenIdentity(token=replacement, user_id=original.user_id)]
                if replacement
                else []
            )
        )
        manager._path.write_text("{broken")

        response = await client.get(
            "/api/protected", headers={"Authorization": f"Bearer {sid}"}
        )
        assert response.status == 403

        with pytest.raises(WSServerHandshakeError) as exc:
            await client.ws_connect(
                "/api/ws", headers={"Authorization": f"Bearer {sid}"}
            )
        assert exc.value.status == 403


async def test_recovery_keeps_exact_static_session_and_rejects_other_sources(tmp_path):
    manager = ApiTokenManager(str(tmp_path / "tokens.json"))
    dynamic = await manager.create_token("api-admin")
    static = ApiTokenIdentity(token="static-secret", user_id="static-admin")
    bot = SimpleNamespace(
        config=SimpleNamespace(web=WebConfig(api_tokens=[static])),
        api_token_manager=manager,
        name="odin",
    )
    sessions = SessionManager()

    async with TestClient(TestServer(_app(manager, bot, sessions))) as client:
        static_sid = await _login(client, static.token)
        dynamic_sid = await _login(client, dynamic.token)
        identityless_sid, _ = sessions.create()
        manager._path.write_text("{broken")

        accepted = await client.get(
            "/api/protected", headers={"Authorization": f"Bearer {static_sid}"}
        )
        assert accepted.status == 200
        assert (await accepted.json())["user_id"] == static.user_id
        async with client.ws_connect(
            "/api/ws", headers={"Authorization": f"Bearer {static_sid}"}
        ) as ws:
            await ws.send_json({"type": "ping", "ts": 1})
            assert await ws.receive_json() == {"type": "pong", "ts": 1}

        for sid in (dynamic_sid, identityless_sid):
            denied = await client.get(
                "/api/protected", headers={"Authorization": f"Bearer {sid}"}
            )
            assert denied.status == 403
