"""Real middleware, login and live tool admission with disposable credentials."""
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, WebConfig
from src.health.server import SessionManager, _make_auth_middleware
from src.permissions.token_manager import ApiTokenManager
from src.tools.output_authorization import request_host_authorizer, web_output_scope
from src.web.api.security import register_auth
from src.web.websocket import WebSocketManager, _CredentialPolicy, _policy_fingerprint


def composition(config, tokens=None):
    bot = SimpleNamespace(config=SimpleNamespace(web=config), api_token_manager=tokens)
    sm = SessionManager(timeout_minutes=1)
    app = web.Application(middlewares=[_make_auth_middleware(lambda: bot.config.web, sm)])
    app["session_manager"] = sm
    if tokens is not None:
        app["token_manager"] = tokens
    routes = web.RouteTableDef()
    register_auth(routes, bot)

    @routes.get("/api/probe")
    async def probe(request):
        identity = getattr(request, "_api_identity", None)
        with web_output_scope(bot, request):
            hosts = request_host_authorizer.get()
            return web.json_response({"user": getattr(identity, "user_id", None),
                                      "host": hosts("dynamic-only") if hosts else None})

    app.add_routes(routes)
    return bot, sm, app


async def login(client, token):
    response = await client.post("/api/auth/login", json={"token": token})
    assert response.status == 200
    return (await response.json())["session_id"]


@pytest.mark.asyncio
@pytest.mark.parametrize("source", ["static", "legacy", "dynamic"])
async def test_sessions_die_after_origin_rotation(tmp_path, source):
    tm = ApiTokenManager(str(tmp_path / "tokens.json"))
    raw = "original"
    config = WebConfig(api_token="other")
    if source == "static":
        config.api_tokens = [ApiTokenIdentity(token=raw, user_id="same")]
    elif source == "legacy":
        config.api_token = raw
    else:
        raw = (await tm.create_token(user_id="one", username="One", tier="admin")).token
    bot, sm, app = composition(config, tm)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, raw)
        response = await client.get("/api/probe", headers={"Authorization": f"Bearer {sid}"})
        assert response.status == 200
        if source == "static":
            config.api_tokens[0].token = "replacement"
        elif source == "legacy":
            config.api_token = "replacement"
        else:
            await tm.regenerate_token(sm.get_identity(sid).user_id)
        response = await client.get("/api/probe", headers={"Authorization": f"Bearer {sid}"})
        assert response.status == 401
        assert not sm.contains(sid)


@pytest.mark.asyncio
async def test_development_session_invalid_after_auth_enabled():
    config = WebConfig()
    _, sm, app = composition(config)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, "development")
        config.api_token = "enabled"
        response = await client.get("/api/probe", headers={"Authorization": f"Bearer {sid}"})
        assert response.status == 401
        assert not sm.contains(sid)


@pytest.mark.asyncio
async def test_static_session_scope_never_adopts_same_id_dynamic_token(tmp_path):
    tm = ApiTokenManager(str(tmp_path / "tokens.json"))
    dynamic = await tm.create_token(
        user_id="one", username="One", tier="admin", allowed_hosts=["dynamic-only"],
    )
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="static", user_id=dynamic.user_id,
                                                    allowed_hosts=["static-only"])])
    _, _, app = composition(config, tm)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, "static")
        response = await client.get("/api/probe", headers={"Authorization": f"Bearer {sid}"})
        assert (await response.json())["host"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [[], None, 42, {"token": 42}, {"token": []}])
async def test_login_invalid_json_shapes_are_bad_requests(body):
    _, _, app = composition(WebConfig(api_token="valid"))
    async with TestClient(TestServer(app)) as client:
        assert (await client.post("/api/auth/login", json=body)).status == 400


@pytest.mark.asyncio
async def test_unicode_and_whitespace_credentials_preserve_exact_bytes():
    _, _, app = composition(WebConfig(api_token=" café "))
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, " café ")
        for value in [sid, " café "]:
            response = await client.get("/api/probe", headers={"Authorization": f"Bearer {value}"})
            assert response.status == 200
        assert (await client.post("/api/auth/login", json={"token": "café"})).status == 401
        response = await client.get("/api/probe", headers={"Authorization": "Bearer 无效"})
        assert response.status == 401


@pytest.mark.asyncio
async def test_invalid_static_tier_loads_but_is_never_admitted():
    config = WebConfig(
        api_token="collision", api_tokens=[ApiTokenIdentity(token="collision", tier="usr")],
    )
    _, _, app = composition(config)
    async with TestClient(TestServer(app)) as client:
        assert (await client.post("/api/auth/login", json={"token": "collision"})).status == 401
        response = await client.get("/api/probe", headers={"Authorization": "Bearer collision"})
        assert response.status == 401


@pytest.mark.asyncio
async def test_legacy_collision_same_identity_on_login_http_and_websocket():
    config = WebConfig(api_token="collision", api_tokens=[
        ApiTokenIdentity(token="collision", user_id="static", tier="user"),
    ])
    bot, sm, app = composition(config)
    ws_manager = WebSocketManager(bot, session_manager=sm, web_config=config)
    app.router.add_get("/api/ws", ws_manager.handle)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, "collision")
        assert sm.get_identity(sid).user_id == "static"
        response = await client.get("/api/probe", headers={"Authorization": "Bearer collision"})
        assert (await response.json())["user"] == "static"
        ws = await client.ws_connect("/api/ws", headers={"Authorization": "Bearer collision"})
        server_ws = next(iter(ws_manager._clients))
        assert server_ws._odin_identity.user_id == "static"
        assert server_ws._odin_credential_policy.source == "static"
        await ws.close()
    await ws_manager.close_all()


def test_second_static_credential_same_id_remains_ws_authorized():
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="first", user_id="same"),
                                  ApiTokenIdentity(token="second", user_id="same")])
    bot, _, _ = composition(config)
    manager = WebSocketManager(bot, web_config=config)
    identity = config.api_tokens[1]
    ws = SimpleNamespace(_odin_identity=identity, _odin_credential_policy=_CredentialPolicy(
        "static", "same", _policy_fingerprint(identity), 0))
    assert manager._policy_authorized(ws)


@pytest.mark.asyncio
async def test_dynamic_session_ws_generation_fenced(tmp_path):
    tm = ApiTokenManager(str(tmp_path / "tokens.json"))
    raw = (await tm.create_token(user_id="one", username="One", tier="admin")).token
    config = WebConfig()
    bot, sm, app = composition(config, tm)
    manager = WebSocketManager(bot, session_manager=sm, web_config=config)
    app.router.add_get("/api/ws", manager.handle)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, raw)
        ws = await client.ws_connect("/api/ws", headers={"Authorization": f"Bearer {sid}"})
        server_ws = next(iter(manager._clients))
        assert manager._policy_authorized(server_ws)
        await tm.regenerate_token(sm.get_identity(sid).user_id)
        assert not manager._policy_authorized(server_ws)
        await ws.close()
    await manager.close_all()


def test_http_only_session_count_prunes_expired(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr("src.health.server.time.monotonic", lambda: clock[0])
    sm = SessionManager(timeout_minutes=1)
    sid, _ = sm.create(ApiTokenIdentity(token="one"))
    sm.set_auth_source(sid, "static")
    clock[0] = 60
    assert sm.active_count == 0
    assert sm.get_identity(sid) is None
    assert sm.get_auth_source(sid) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["redirect", "forbidden", "notfound", "json", "returned"])
async def test_security_headers_on_all_responses(kind):
    import json

    from src.health.server import _make_security_headers_middleware
    app = web.Application(middlewares=[_make_security_headers_middleware()])

    async def response(_request):
        if kind == "redirect":
            raise web.HTTPFound("/other")
        if kind == "forbidden":
            raise web.HTTPForbidden()
        if kind == "notfound":
            raise web.HTTPNotFound()
        if kind == "json":
            raise json.JSONDecodeError("bad", "x", 0)
        return web.json_response({"ok": True})

    app.router.add_get("/", response)
    async with TestClient(TestServer(app)) as client:
        result = await client.get("/", allow_redirects=False)
        for header in ["Content-Security-Policy", "X-Frame-Options", "Referrer-Policy"]:
            assert header in result.headers


@pytest.mark.asyncio
async def test_missing_ui_build_refuses_raw_source(monkeypatch):
    from pathlib import Path

    from tests.test_web_campaign_authorization import production_server
    original = Path.is_file
    monkeypatch.setattr(Path, "is_file", lambda path: False if path.name == "index.html"
                        and path.parent.name == "dist" else original(path))
    server, _ = production_server()
    async with TestClient(TestServer(server._app)) as client:
        for path in ["/", "/ui", "/ui/js/app.js"]:
            response = await client.get(path)
            assert response.status == 503
            assert "npm run build" in await response.text()


def test_chat_limit_shared_across_reconnects_and_concurrent_sockets(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr("src.web.websocket.time.monotonic", lambda: clock[0])
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="one", user_id="same")])
    bot, _, _ = composition(config)
    manager = WebSocketManager(bot)
    sockets = [SimpleNamespace(_odin_identity=config.api_tokens[0], _odin_client_ip="client")
               for _ in range(12)]
    for ws in sockets[:10]:
        assert not manager._chat_rate_limited(ws)
    assert manager._chat_rate_limited(sockets[10])
    assert manager._chat_rate_limited(sockets[11])
    clock[0] = 60
    assert not manager._chat_rate_limited(sockets[0])
    assert len(manager._chat_buckets) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("message,status,outcome", [
    ("Failed to kill PID 123: permission denied", 409, "failed"),
    ("Error: retained process evidence is read-only.", 409, "failed"),
    ("No process with PID 123.", 404, "failed"),
    ("Process 123 already exited; poll to collect its outcome.", 200, "already_stopped"),
    ("Process 123 killed.", 200, "killed"),
])
async def test_process_kill_reports_acknowledged_outcome(message, status, outcome):
    from unittest.mock import AsyncMock

    from src.web.api.agents_loops import register_processes
    bot = SimpleNamespace(tool_executor=SimpleNamespace(
        _process_registry=SimpleNamespace(kill=AsyncMock(return_value=message))))
    routes = web.RouteTableDef()
    register_processes(routes, bot)
    app = web.Application()
    app.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.delete("/api/processes/123")
        assert response.status == status
        data = await response.json()
        assert data["outcome"] == outcome
        assert data["success"] == (status == 200)
