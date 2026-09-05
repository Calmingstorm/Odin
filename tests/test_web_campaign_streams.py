"""Subscription and delivery matrices through real sockets and policy routes."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity
from tests.test_web_campaign_authorization import production_server


@pytest.mark.asyncio
@pytest.mark.parametrize("tier", ["admin", "user", "guest"])
@pytest.mark.parametrize("stream", ["events", "logs"])
async def test_subscription_matrix(tier, stream, monkeypatch):
    server, _ = production_server()
    identity = ApiTokenIdentity(token="", user_id="actor", tier=tier)
    token, _ = server._session_manager.create(identity=identity)
    # Audit filesystem is synthetic; subscription and delivery are production.
    path = SimpleNamespace(exists=lambda: True, read_text=lambda: "synthetic-row\n",
                           stat=lambda: SimpleNamespace(st_size=14))
    monkeypatch.setattr("src.web.websocket.Path", lambda _: path)
    async with TestClient(TestServer(server._app)) as client:
        ws = await client.ws_connect("/api/ws", headers={"Authorization": f"Bearer {token}"})
        await ws.send_json({"subscribe": stream})
        response = await ws.receive_json(timeout=1)
        if tier != "admin":
            assert response["error"] == "admin access required"
            assert not server._ws_manager._event_subscribers
            assert not server._ws_manager._log_subscribers
        else:
            assert response["type"] == "subscribed"
            if stream == "events":
                await server._ws_manager.broadcast_event({"synthetic": True})
            response = await ws.receive_json(timeout=1)
            assert response["type"] == ("event" if stream == "events" else "log")
        await ws.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["tier", "allowed_tools", "allowed_hosts", "default_host",
                                   "delete", "regenerate", "expiry"])
@pytest.mark.parametrize("stream", ["events", "logs"])
async def test_delivery_revalidates_policy(change, stream):
    server, bot = production_server()
    original = ApiTokenIdentity(token="", user_id="actor", tier="admin")
    current = original.model_copy(deep=True)
    bot.api_token_manager = SimpleNamespace(get=lambda _: current)
    manager = server._ws_manager
    ws = SimpleNamespace()
    # A minimal transport, not an authorization mock. Drive the real send seam.
    class Socket:
        _odin_identity = original
        _odin_policy_source = "dynamic"
        _odin_session_managed = False
        send_json = AsyncMock()
    ws = Socket()
    subscribers = manager._event_subscribers if stream == "events" else manager._log_subscribers
    subscribers.add(ws)
    assert await manager._send_stream(ws, stream, {"before": True})
    if change == "tier":
        current.tier = "user"
    elif change == "allowed_tools":
        current.allowed_tools = ["search_history"]
    elif change == "allowed_hosts":
        current.allowed_hosts = []
    elif change == "default_host":
        current.default_host = "example"
    elif change in ("delete", "regenerate"):
        manager._clients.add(ws)
        async with manager.policy_change("actor"):
            current = None
    else:
        ws._odin_session_managed = True
        ws._odin_session_id = "expired"
    assert not await manager._send_stream(ws, stream, {"after": True})
    assert ws.send_json.await_count == 1
    assert ws not in subscribers


@pytest.mark.asyncio
async def test_policy_publication_fenced_against_inflight_delivery():
    server, bot = production_server()
    identity = ApiTokenIdentity(token="synthetic-target", user_id="actor", tier="admin")
    published = asyncio.Event()
    entered = asyncio.Event()
    release = asyncio.Event()

    async def update(*args, **kwargs):
        published.set()
        return identity.model_copy(update={"tier": "user"})

    tm = SimpleNamespace(get=lambda _: identity, resolve=lambda _: identity,
                         list_tokens=lambda: [identity], update_token=update)
    bot.api_token_manager = tm
    server._app["token_manager"] = tm
    manager = server._ws_manager

    class Socket:
        _odin_identity = identity
        _odin_session_managed = False

        async def send_json(self, payload):
            entered.set()
            await release.wait()

        async def close(self, **kwargs):
            pass

    ws = Socket()
    manager._clients.add(ws)
    manager._event_subscribers.add(ws)
    async with TestClient(TestServer(server._app)) as client:
        delivery = asyncio.create_task(manager.broadcast_event({"before": True}))
        await entered.wait()
        mutation = asyncio.create_task(client.put(
            "/api/tokens/actor", json={"tier": "user"},
            headers={"Authorization": "Bearer synthetic-admin"},
        ))
        await asyncio.sleep(0.02)
        assert not published.is_set()
        release.set()
        await delivery
        response = await mutation
        assert response.status == 200
        assert published.is_set()
        assert ws not in manager._event_subscribers
        assert not await manager._send_stream(ws, "events", {"after": True})


@pytest.mark.parametrize("revoke", [False, True])
async def test_incremental_log_delivery_checks_current_policy(tmp_path, monkeypatch, revoke):
    server, bot = production_server()
    original = ApiTokenIdentity(token="", user_id="actor", tier="admin")
    current = original.model_copy(deep=True)
    bot.api_token_manager = SimpleNamespace(get=lambda _: current)
    path = tmp_path / "audit.jsonl"
    path.write_text("")
    manager = server._ws_manager
    monkeypatch.setattr("src.web.websocket.Path", lambda _: path)
    entered, release = asyncio.Event(), asyncio.Event()

    async def poll_tick(_delay):
        entered.set()
        await release.wait()

    monkeypatch.setattr("src.web.websocket.asyncio.sleep", poll_tick)

    class Socket:
        _odin_identity = original
        _odin_policy_source = "dynamic"
        _odin_session_managed = False
        closed = False
        received = []

        async def send_json(self, payload):
            self.received.append(payload)
            self.closed = True

    socket = Socket()
    manager._log_subscribers.add(socket)
    tail = asyncio.create_task(manager._tail_logs(socket))
    await entered.wait()
    with path.open("a") as stream:
        stream.write("new synthetic row\n")
    if revoke:
        current.tier = "user"
    release.set()
    await asyncio.wait_for(tail, 1)
    assert socket.received == ([] if revoke else [{"type": "log", "line": "new synthetic row"}])
    if revoke:
        assert socket not in manager._log_subscribers
