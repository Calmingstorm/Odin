"""Real middleware, detached token persistence, policy routes and WS transport."""
import asyncio
import base64
from types import SimpleNamespace
from unittest.mock import AsyncMock

import aiohttp
import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity
from src.permissions.token_manager import ApiTokenManager
from tests.test_web_campaign_authorization import production_server


def carrier_options(token, wire):
    if wire == "header":
        return {"headers": {"Authorization": f"Bearer {token}"}}
    protocol = "odin.bearer." + base64.urlsafe_b64encode(token.encode()).decode().rstrip("=")
    return {"protocols": [protocol]}


@pytest.mark.asyncio
@pytest.mark.parametrize("wire", ["header", "subprotocol"])
@pytest.mark.parametrize("deleted", [False, True])
async def test_static_session_never_inherits_same_id_dynamic_admin(
    tmp_path, monkeypatch, wire, deleted,
):
    server, _, _, actor = await dynamic_stack(tmp_path)
    static = ApiTokenIdentity(token="synthetic-static", user_id=actor.user_id, tier="user")
    server._web_config.api_tokens = [static]
    chat = AsyncMock(return_value={"response": "synthetic", "tools_used": [], "is_error": False})
    monkeypatch.setattr("src.web.websocket.process_web_chat", chat)
    async with TestClient(TestServer(server._app)) as client:
        response = await client.post("/api/auth/login", json={"token": static.token})
        sid = (await response.json())["session_id"]
        if deleted:
            server._web_config.api_tokens = []
        ws = await client.ws_connect("/api/ws", **carrier_options(sid, wire))
        await ws.send_json({"type": "chat", "content": "synthetic"})
        result = await ws.receive_json(timeout=1)
        if deleted:
            assert "error" in result
            chat.assert_not_awaited()
        else:
            assert result["type"] == "chat_response"
            assert chat.call_args.kwargs["tier"] == "user"
            await ws.send_json({"subscribe": "events"})
            assert "error" in await ws.receive_json(timeout=1)
        await ws.close()


async def mutate(client, uid, change):
    headers = {"Authorization": "Bearer synthetic-admin"}
    path = f"/api/tokens/{uid}"
    if change == "delete":
        response = await client.delete(path, headers=headers)
    elif change == "regenerate":
        response = await client.post(path + "/regenerate", headers=headers)
    else:
        values = {"tier": "user", "allowed_tools": ["search_history"],
                  "allowed_hosts": [], "default_host": "example"}
        response = await client.put(path, json={change: values[change]}, headers=headers)
    assert response.status == 200, await response.text()
    await response.read()


async def dynamic_stack(tmp_path):
    server, bot = production_server()
    tm = ApiTokenManager(str(tmp_path / "tokens.json"))
    actor = await tm.create_token(user_id="actor", label="actor", tier="admin")
    bot.api_token_manager = tm
    bot.host_access_manager = SimpleNamespace(available_hosts={"example": object()})
    server._app["token_manager"] = tm
    return server, bot, tm, actor


@pytest.mark.asyncio
@pytest.mark.parametrize("wire", ["header", "subprotocol"])
@pytest.mark.parametrize("session", [False, True])
@pytest.mark.parametrize("change", ["tier", "delete", "regenerate", "allowed_hosts",
                                   "allowed_tools", "default_host"])
async def test_prepare_revocation_cannot_register_stale_identity(
    tmp_path, monkeypatch, wire, session, change,
):
    server, _, tm, actor = await dynamic_stack(tmp_path)
    entered, release = asyncio.Event(), asyncio.Event()
    original = web.WebSocketResponse.prepare

    async def paused_prepare(ws, request):
        result = await original(ws, request)
        if request.path == "/api/ws" and not entered.is_set():
            entered.set()
            await release.wait()
        return result

    monkeypatch.setattr(web.WebSocketResponse, "prepare", paused_prepare)
    chat = AsyncMock(return_value={"response": "synthetic", "tools_used": [], "is_error": False})
    monkeypatch.setattr("src.web.websocket.process_web_chat", chat)
    async with TestClient(TestServer(server._app)) as client:
        token = actor.token
        if session:
            response = await client.post("/api/auth/login", json={"token": token})
            assert response.status == 200
            token = (await response.json())["session_id"]
        ws = await client.ws_connect("/api/ws", **carrier_options(token, wire))
        await asyncio.wait_for(entered.wait(), 1)
        try:
            await mutate(client, actor.user_id, change)
            assert tm.get(actor.user_id) is not actor
        finally:
            release.set()
        # Both new chat and operational subscriptions must be inert. The error
        # frame precedes the close, so the original external reproducer can also
        # observe rejection without assuming a particular close handshake.
        await ws.send_json({"type": "chat", "content": "synthetic"})
        await ws.send_json({"subscribe": "events"})
        assert "error" in await ws.receive_json(timeout=1)
        assert (await ws.receive(timeout=1)).type == aiohttp.WSMsgType.CLOSE
        assert not server._ws_manager._clients
        assert not server._ws_manager._event_subscribers
        chat.assert_not_awaited()
        await ws.close()
    assert not server._ws_manager._session_expiry_tasks
    assert not server._ws_manager._session_close_tasks


@pytest.mark.asyncio
@pytest.mark.parametrize("wire", ["header", "subprotocol"])
@pytest.mark.parametrize("source", ["legacy", "static", "dynamic", "session"])
@pytest.mark.parametrize("stream", ["events", "logs"])
async def test_healthy_admin_carriers_preserve_delivery_and_chat(
    tmp_path, monkeypatch, wire, source, stream,
):
    server, _, _, actor = await dynamic_stack(tmp_path)
    path = SimpleNamespace(exists=lambda: True, read_text=lambda: "synthetic-row\n",
                           stat=lambda: SimpleNamespace(st_size=14))
    monkeypatch.setattr("src.web.websocket.Path", lambda _: path)
    chat = AsyncMock(return_value={"response": "synthetic", "tools_used": [], "is_error": False})
    monkeypatch.setattr("src.web.websocket.process_web_chat", chat)
    async with TestClient(TestServer(server._app)) as client:
        token = actor.token
        if source == "legacy":
            token = "synthetic-admin"
        elif source == "static":
            token = "synthetic-static"
            server._web_config.api_tokens = [ApiTokenIdentity(token=token, user_id="static")]
        elif source == "session":
            response = await client.post("/api/auth/login", json={"token": token})
            token = (await response.json())["session_id"]
        ws = await client.ws_connect("/api/ws", **carrier_options(token, wire))
        if wire == "subprotocol":
            assert ws.protocol == carrier_options(token, wire)["protocols"][0]
        await ws.send_json({"subscribe": stream})
        assert (await ws.receive_json(timeout=1))["type"] == "subscribed"
        if stream == "events":
            await server._ws_manager.broadcast_event({"synthetic": True})
        expected = "event" if stream == "events" else "log"
        assert (await ws.receive_json(timeout=1))["type"] == expected
        await ws.send_json({"type": "chat", "content": "synthetic"})
        assert (await ws.receive_json(timeout=1))["type"] == "chat_response"
        assert chat.call_args.kwargs["tier"] == "admin"
        await ws.close()
    manager = server._ws_manager
    assert not manager._clients and not manager._event_subscribers and not manager._log_subscribers
    assert not manager._chat_tasks and not manager._session_expiry_tasks


@pytest.mark.asyncio
@pytest.mark.parametrize("wire", ["header", "subprotocol"])
@pytest.mark.parametrize("change", ["tier", "delete", "regenerate", "allowed_hosts",
                                   "allowed_tools", "default_host"])
async def test_new_frames_and_delivery_denied_before_transport_teardown(
    tmp_path, monkeypatch, wire, change,
):
    server, _, _, actor = await dynamic_stack(tmp_path)
    manager = server._ws_manager
    teardown_entered, release = asyncio.Event(), asyncio.Event()
    original_close = manager.close_by_user_id

    async def paused_close(uid):
        teardown_entered.set()
        await release.wait()
        return await original_close(uid)

    monkeypatch.setattr(manager, "close_by_user_id", paused_close)
    chat = AsyncMock(return_value={"response": "synthetic", "tools_used": [], "is_error": False})
    monkeypatch.setattr("src.web.websocket.process_web_chat", chat)
    async with TestClient(TestServer(server._app)) as client:
        ws = await client.ws_connect("/api/ws", **carrier_options(actor.token, wire))
        await ws.send_json({"subscribe": "events"})
        assert (await ws.receive_json(timeout=1))["type"] == "subscribed"
        server_ws = next(iter(manager._clients))
        mutation = asyncio.create_task(mutate(client, actor.user_id, change))
        await asyncio.wait_for(teardown_entered.wait(), 1)
        try:
            assert not await manager._send_stream(server_ws, "events", {"forbidden": True})
            await ws.send_json({"type": "chat", "content": "synthetic"})
            assert (await ws.receive_json(timeout=1))["type"] == "chat_error"
            await ws.send_json({"subscribe": "events"})
            assert "error" in await ws.receive_json(timeout=1)
            chat.assert_not_awaited()
        finally:
            release.set()
            await ws.close()
            await asyncio.wait_for(mutation, 2)


@pytest.mark.asyncio
async def test_running_chat_finishes_effects_but_revoked_delivery_is_suppressed(
    tmp_path, monkeypatch,
):
    server, _, _, actor = await dynamic_stack(tmp_path)
    manager = server._ws_manager
    entered, release, finished = asyncio.Event(), asyncio.Event(), asyncio.Event()
    teardown_entered, teardown_release = asyncio.Event(), asyncio.Event()
    original_close = manager.close_by_user_id

    async def chat(*args, **kwargs):
        entered.set()
        await release.wait()
        finished.set()  # stand-in for the executor's durable/session side effect
        return {"response": "private-result", "tools_used": [], "is_error": False}

    async def paused_close(uid):
        teardown_entered.set()
        await teardown_release.wait()
        return await original_close(uid)

    monkeypatch.setattr("src.web.websocket.process_web_chat", chat)
    monkeypatch.setattr(manager, "close_by_user_id", paused_close)
    async with TestClient(TestServer(server._app)) as client:
        ws = await client.ws_connect("/api/ws", **carrier_options(actor.token, "header"))
        await ws.send_json({"type": "chat", "content": "synthetic"})
        await asyncio.wait_for(entered.wait(), 1)
        task = next(iter(manager._chat_tasks))
        mutation = asyncio.create_task(mutate(client, actor.user_id, "tier"))
        await asyncio.wait_for(teardown_entered.wait(), 1)
        release.set()
        await asyncio.wait_for(asyncio.shield(task), 1)
        assert finished.is_set() and not task.cancelled()
        # Ping is an ordering sentinel: no private result can precede it.
        await ws.send_json({"type": "ping"})
        assert (await ws.receive_json(timeout=1))["type"] == "pong"
        teardown_release.set()
        await ws.close()
        await asyncio.wait_for(mutation, 2)


@pytest.mark.asyncio
@pytest.mark.parametrize("wire", ["header", "subprotocol"])
@pytest.mark.parametrize("source", ["static", "dynamic", "session"])
@pytest.mark.parametrize("tier", ["user", "guest"])
@pytest.mark.parametrize("stream", ["events", "logs"])
async def test_nonadmin_carrier_matrix(tmp_path, monkeypatch, wire, source, tier, stream):
    server, _, tm, actor = await dynamic_stack(tmp_path)
    await tm.update_token(actor.user_id, tier=tier)
    chat = AsyncMock(return_value={"response": "synthetic", "tools_used": [], "is_error": False})
    monkeypatch.setattr("src.web.websocket.process_web_chat", chat)
    async with TestClient(TestServer(server._app)) as client:
        token = actor.token
        if source == "static":
            token = "synthetic-static"
            server._web_config.api_tokens = [
                ApiTokenIdentity(token=token, user_id="static", tier=tier),
            ]
        elif source == "session":
            response = await client.post("/api/auth/login", json={"token": token})
            token = (await response.json())["session_id"]
        ws = await client.ws_connect("/api/ws", **carrier_options(token, wire))
        await ws.send_json({"subscribe": stream})
        assert (await ws.receive_json(timeout=1))["error"] == "admin access required"
        await ws.send_json({"type": "chat", "content": "synthetic"})
        assert (await ws.receive_json(timeout=1))["type"] == "chat_response"
        assert chat.call_args.kwargs["tier"] == tier
        await ws.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("source,change", [(source, change)
    for source in ("legacy", "static", "dynamic", "session")
    for change in ("rotate", "tier", "allowed_hosts", "allowed_tools")
    if (source != "legacy" or change == "rotate")
    and (source != "session" or change != "rotate")])
async def test_delivery_and_chat_recheck_store_without_teardown(
    tmp_path, monkeypatch, source, change,
):
    server, _, tm, actor = await dynamic_stack(tmp_path)
    chat = AsyncMock(return_value={"response": "synthetic", "tools_used": [], "is_error": False})
    monkeypatch.setattr("src.web.websocket.process_web_chat", chat)
    async with TestClient(TestServer(server._app)) as client:
        token = actor.token
        if source == "legacy":
            token = "synthetic-admin"
        elif source == "static":
            token = "synthetic-static"
            server._web_config.api_tokens = [ApiTokenIdentity(token=token, user_id="static")]
        elif source == "session":
            response = await client.post("/api/auth/login", json={"token": token})
            token = (await response.json())["session_id"]
        ws = await client.ws_connect("/api/ws", **carrier_options(token, "subprotocol"))
        await ws.send_json({"subscribe": "events"})
        assert (await ws.receive_json(timeout=1))["type"] == "subscribed"
        manager = server._ws_manager
        server_ws = next(iter(manager._clients))
        fingerprint = server_ws._odin_credential_policy.fingerprint
        # Exercise current-store checking independently of route generations.
        if source == "legacy":
            server._web_config.api_token = "synthetic-replacement"
        elif source == "static":
            values = {"rotate": ("token", "synthetic-replacement"), "tier": ("tier", "user"),
                      "allowed_hosts": ("allowed_hosts", []),
                      "allowed_tools": ("allowed_tools", ["search_history"])}
            key, value = values[change]
            setattr(server._web_config.api_tokens[0], key, value)
        elif change == "rotate":
            await tm.regenerate_token(actor.user_id)
        else:
            values = {"tier": "user", "allowed_hosts": [], "allowed_tools": ["search_history"]}
            await tm.update_token(actor.user_id, **{change: values[change]})
        assert server_ws._odin_credential_policy.fingerprint == fingerprint
        assert not await manager._send_stream(server_ws, "events", {"forbidden": True})
        await ws.send_json({"type": "chat", "content": "synthetic"})
        assert (await ws.receive_json(timeout=1))["type"] == "chat_error"
        chat.assert_not_awaited()
        await ws.close()
