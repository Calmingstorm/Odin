"""R4-1: real HTTP/WebSocket sessions are scoped to their issuing token."""

import base64
import json
from types import SimpleNamespace

import pytest
from aiohttp import WSMsgType, web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, WebConfig
from src.health.server import SessionManager, _make_admin_middleware, _make_auth_middleware
from src.permissions.token_manager import ApiTokenManager
from src.web.api.security import register_api_tokens, register_auth
from src.web.websocket import setup_websocket


async def status(_request):
    return web.json_response({"ok": True})


def app_for(sessions, config, tokens):
    bot = SimpleNamespace(config=SimpleNamespace(web=config), api_token_manager=tokens, name="odin")
    routes = web.RouteTableDef()
    register_auth(routes, bot)
    register_api_tokens(routes, bot)
    app = web.Application(middlewares=[
        _make_auth_middleware(config, sessions), _make_admin_middleware(config),
    ])
    app["session_manager"] = sessions
    app["token_manager"] = tokens
    app.add_routes(routes)
    app.router.add_get("/api/status", status)
    setup_websocket(app, bot, web_config=config)
    return app


def sessions_for(tmp_path, config, tokens, persisted):
    if not persisted:
        return SessionManager()
    return SessionManager(0, store_path=tmp_path / "sessions.json", config=lambda: config,
                          snapshot=tokens.auth_snapshot)


async def login(client, raw, persist):
    response = await client.post("/api/auth/login", json={"token": raw, "persist": persist})
    assert response.status == 200
    return (await response.json())["session_id"]


def headers(sid):
    return {"Authorization": f"Bearer {sid}"}


async def assert_status(client, sid, expected):
    response = await client.get("/api/status", headers=headers(sid))
    assert response.status == expected


async def subscribe(ws):
    await ws.send_json({"subscribe": "events"})
    assert await ws.receive_json(timeout=5) == {"type": "subscribed", "channel": "events"}


async def fixture_credentials(tmp_path):
    tokens = ApiTokenManager(str(tmp_path / "tokens.json"))
    raw = {uid: (await tokens.create_token(uid, tier="admin")).token for uid in ("a", "b", "c")}
    config = WebConfig(api_tokens=[ApiTokenIdentity(token="fixture-static", user_id="static")])
    return tokens, raw, config


# Every identity/policy field changes, not just label. Create after delete also
# proves that a reused user_id cannot resurrect an old issuance.
CHANGES = [
    ("label", "PUT", "/api/tokens/b", {"label": "changed"}, 200),
    ("username", "PUT", "/api/tokens/b", {"username": "changed"}, 200),
    ("tier", "PUT", "/api/tokens/b", {"tier": "user"}, 200),
    ("tools", "PUT", "/api/tokens/b", {"allowed_tools": ["read_file"]}, 200),
    ("hosts", "PUT", "/api/tokens/b", {"allowed_hosts": ["localhost"]}, 200),
    ("default", "PUT", "/api/tokens/b",
     {"allowed_hosts": ["localhost"], "default_host": "localhost"}, 200),
    ("rotate", "POST", "/api/tokens/b/regenerate", None, 200),
    ("delete", "DELETE", "/api/tokens/b", None, 200),
    ("create", "POST", "/api/tokens", {"user_id": "new", "tier": "admin"}, 201),
    ("recreate", "POST", "/api/tokens", {"user_id": "b", "tier": "admin"}, 201),
]


@pytest.mark.parametrize("persisted", [False, True], ids=["memory", "disk"])
@pytest.mark.parametrize("change,method,path,body,expected", CHANGES, ids=[c[0] for c in CHANGES])
async def test_routes_revoke_only_changed_token(
    tmp_path, persisted, change, method, path, body, expected,
):
    tokens, raw, config = await fixture_credentials(tmp_path)
    sessions = sessions_for(tmp_path, config, tokens, persisted)
    async with TestClient(TestServer(app_for(sessions, config, tokens))) as client:
        sids = {(uid, persist): await login(client, credential, persist)
                for uid, credential in {**raw, "static": "fixture-static"}.items()
                for persist in (False, True)}
        actor = headers(sids["a", True])
        if change == "recreate":
            response = await client.delete("/api/tokens/b", headers=actor)
            assert response.status == 200
        response = await client.request(method, path, json=body, headers=actor)
        assert response.status == expected
        for (uid, _persist), sid in sids.items():
            await assert_status(client, sid, 401 if uid == "b" and change != "create" else 200)
        if persisted:
            # A fresh manager restores only ticked sessions with current policy.
            restored_tokens = ApiTokenManager(str(tmp_path / "tokens.json"))
            restored = sessions_for(tmp_path, config, restored_tokens, True)
            restored_app = app_for(restored, config, restored_tokens)
            async with TestClient(TestServer(restored_app)) as restarted:
                for (uid, persist), sid in sids.items():
                    valid = persist and (uid != "b" or change == "create")
                    await assert_status(restarted, sid, 200 if valid else 401)


@pytest.mark.parametrize("persisted", [False, True])
@pytest.mark.parametrize(
    "change,method,path,body,expected", CHANGES[:8], ids=[c[0] for c in CHANGES[:8]],
)
async def test_changing_own_token_revokes_actor_and_other_own_sessions(
    tmp_path, persisted, change, method, path, body, expected,
):
    tokens, raw, config = await fixture_credentials(tmp_path)
    sessions = sessions_for(tmp_path, config, tokens, persisted)
    async with TestClient(TestServer(app_for(sessions, config, tokens))) as client:
        own = [await login(client, raw["b"], persist) for persist in (False, True)]
        other = await login(client, raw["a"], True)
        response = await client.request(method, path, json=body, headers=headers(own[1]))
        assert response.status == expected
        for sid in own:
            await assert_status(client, sid, 401)
        await assert_status(client, other, 200)


@pytest.mark.parametrize("persisted", [False, True])
@pytest.mark.parametrize("persist", [False, True])
async def test_open_socket_survives_other_changes_but_closes_on_own_delete(
    tmp_path, persisted, persist,
):
    tokens, raw, config = await fixture_credentials(tmp_path)
    sessions = sessions_for(tmp_path, config, tokens, persisted)
    async with TestClient(TestServer(app_for(sessions, config, tokens))) as client:
        sid = await login(client, raw["a"], persist)
        other = await login(client, raw["c"], True)
        proto = "odin.bearer." + base64.urlsafe_b64encode(sid.encode()).decode().rstrip("=")
        async with client.ws_connect("/api/ws", protocols=[proto]) as ws:
            await subscribe(ws)
            for change, method, path, body, expected in CHANGES:
                response = await client.request(method, path, json=body, headers=headers(sid))
                assert response.status == expected
                await subscribe(ws)
                await assert_status(client, sid, 200)
            response = await client.delete("/api/tokens/a", headers=headers(other))
            assert response.status == 200
            message = await ws.receive(timeout=5)
            assert message.type in (WSMsgType.CLOSE, WSMsgType.CLOSED)
            await assert_status(client, sid, 401)
            await assert_status(client, other, 200)


@pytest.mark.parametrize("persisted", [False, True])
async def test_external_edits_preserve_unchanged_sessions_and_fence_changed_issuance(
    tmp_path, persisted,
):
    tokens, raw, config = await fixture_credentials(tmp_path)
    sessions = sessions_for(tmp_path, config, tokens, persisted)
    store = tmp_path / "tokens.json"
    async with TestClient(TestServer(app_for(sessions, config, tokens))) as client:
        sids = {uid: await login(client, credential, True)
                for uid, credential in {**raw, "static": "fixture-static"}.items()}
        issued = tokens.resolve(raw["a"])
        forged = [issued.model_copy(deep=True), ApiTokenIdentity(**issued.model_dump())]
        original = json.loads(store.read_text())
        changed = json.loads(store.read_text())
        changed[1]["label"] = "external"
        replacement = tmp_path / "replacement.json"
        replacement.write_text(json.dumps(changed))
        replacement.replace(store)
        for uid, sid in sids.items():
            await assert_status(client, sid, 401 if uid == "b" else 200)
        assert tokens.identity_is_current(issued)
        assert tokens.auth_snapshot().identity_is_current(issued)
        for identity in forged:
            assert not tokens.identity_is_current(identity)
            assert not tokens.auth_snapshot().identity_is_current(identity)
        # Observing deletion, even with exact content later restored, is terminal.
        store.write_text(json.dumps([row for row in original if row["user_id"] != "a"]))
        assert not tokens.identity_is_current(issued)
        store.write_text(json.dumps(original))
        assert not tokens.identity_is_current(issued)
        await assert_status(client, sids["a"], 401)
        await assert_status(client, sids["b"], 401)
        await assert_status(client, sids["c"], 200)
        await assert_status(client, sids["static"], 200)
