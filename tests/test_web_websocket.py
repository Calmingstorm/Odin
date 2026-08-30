"""Coverage for web/websocket.py (RFC-006 P4-continuation, CONT-1 optional).

Odin green-lit websocket "only if tractable with real websocket client tests" —
aiohttp's ws test client makes the ``handle`` message loop and ``_handle_chat``
paths fully drivable end-to-end. The broadcast / close / tail helpers are
exercised directly on the manager with fake sockets. ``process_web_chat`` (the
one real external boundary) is patched; a chdir(tmp_path) autouse fixture keeps
``_tail_logs``' relative ./data/audit.jsonl read isolated.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import aiohttp
import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.web.websocket import WebSocketManager, setup_websocket


@pytest.fixture(autouse=True)
def _isolate_cwd(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)


def _bot():
    return SimpleNamespace(name="odin")


def _client(*, api_token="", web_config=None, session_manager=None):
    app = web.Application()
    if session_manager is not None:
        app["session_manager"] = session_manager
    manager = setup_websocket(app, _bot(), api_token=api_token, web_config=web_config)
    return TestClient(TestServer(app)), manager


CHAT_RESULT = {"response": "hi there", "tools_used": ["grep"], "is_error": False}


# --------------------------------------------------------------------------- #
# handle() — the real message loop
# --------------------------------------------------------------------------- #
class TestHandleLoop:
    async def test_subscribe_unsubscribe_ping_unknown(self):
        client, _ = _client()
        async with client:
            async with client.ws_connect("/api/ws") as ws:
                await ws.send_json({"subscribe": "events"})
                assert (await ws.receive_json())["channel"] == "events"
                await ws.send_json({"unsubscribe": "events"})
                assert (await ws.receive_json())["type"] == "unsubscribed"
                await ws.send_json({"type": "ping", "ts": 42})
                pong = await ws.receive_json()
                assert pong["type"] == "pong" and pong["ts"] == 42
                await ws.send_json({"whatever": 1})
                assert "unknown command" in (await ws.receive_json())["error"]

    async def test_invalid_json(self):
        client, _ = _client()
        async with client:
            async with client.ws_connect("/api/ws") as ws:
                await ws.send_str("{not json")
                assert "invalid JSON" in (await ws.receive_json())["error"]

    async def test_subscribe_logs_streams_tail(self):
        # _tail_logs reads ./data/audit.jsonl (relative → isolated by chdir)
        from pathlib import Path
        data = Path("data")
        data.mkdir()
        (data / "audit.jsonl").write_text('{"a":1}\n{"a":2}\n')
        client, _ = _client()
        async with client:
            async with client.ws_connect("/api/ws") as ws:
                await ws.send_json({"subscribe": "logs"})
                # tail lines + the subscribed confirmation arrive (order not fixed)
                seen = {(await ws.receive_json())["type"] for _ in range(3)}
                assert "log" in seen and "subscribed" in seen
                await ws.send_json({"unsubscribe": "logs"})


class TestAuth:
    async def test_rejects_without_token(self):
        client, _ = _client(api_token="s3cret")
        async with client:
            async with client.ws_connect("/api/ws") as ws:
                await ws.receive()  # server closes with code 4001
                assert ws.closed

    async def test_accepts_matching_token(self):
        client, _ = _client(api_token="s3cret")
        async with client:
            async with client.ws_connect(
                "/api/ws", protocols=[TestBearerSubprotocolAuth._proto("s3cret")]
            ) as ws:
                await ws.send_json({"type": "ping", "ts": 1})
                assert (await ws.receive_json())["type"] == "pong"

    async def test_accepts_session_manager_token(self):
        # web_config present (auth on), api_token empty → session_manager validates
        sm = SimpleNamespace(validate=lambda t: t == "good", get_identity=lambda t: None)
        client, _ = _client(web_config=SimpleNamespace(), session_manager=sm)
        async with client:
            async with client.ws_connect(
                "/api/ws", protocols=[TestBearerSubprotocolAuth._proto("good")]
            ) as ws:
                await ws.send_json({"type": "ping", "ts": 1})
                assert (await ws.receive_json())["type"] == "pong"


# --------------------------------------------------------------------------- #
# _handle_chat — validation, rate limit, delegation, error shaping
# --------------------------------------------------------------------------- #
class TestChat:
    async def test_chat_success(self):
        client, _ = _client()
        with patch("src.web.websocket.process_web_chat",
                   new=AsyncMock(return_value=CHAT_RESULT)):
            async with client:
                async with client.ws_connect("/api/ws") as ws:
                    await ws.send_json({"type": "chat", "content": "hello"})
                    resp = await ws.receive_json()
                    assert resp["type"] == "chat_response"
                    assert resp["content"] == "hi there" and resp["tools_used"] == ["grep"]

    async def test_chat_with_files(self):
        result = {**CHAT_RESULT, "files": [{"name": "out.txt"}]}
        client, _ = _client()
        with patch("src.web.websocket.process_web_chat",
                   new=AsyncMock(return_value=result)):
            async with client:
                async with client.ws_connect("/api/ws") as ws:
                    await ws.send_json({"type": "chat", "content": "make a file"})
                    resp = await ws.receive_json()
                    assert resp["files"] == [{"name": "out.txt"}]

    async def test_chat_empty_and_too_long(self):
        client, _ = _client()
        async with client:
            async with client.ws_connect("/api/ws") as ws:
                await ws.send_json({"type": "chat", "content": "   "})
                assert (await ws.receive_json())["type"] == "chat_error"
                await ws.send_json({"type": "chat", "content": "x" * 40000})
                assert (await ws.receive_json())["type"] == "chat_error"

    async def test_chat_rate_limit(self):
        client, _ = _client()
        with patch("src.web.websocket.process_web_chat",
                   new=AsyncMock(return_value=CHAT_RESULT)):
            async with client:
                async with client.ws_connect("/api/ws") as ws:
                    last: dict = {}
                    for _ in range(11):
                        await ws.send_json({"type": "chat", "content": "ping"})
                        last = await ws.receive_json()
                    assert last["type"] == "chat_error" and "rate limit" in last["error"]

    async def test_natural_timeout_error_formatted_ordinarily(self):
        # The 300s outer wall is gone; a TimeoutError raised naturally by the
        # chat itself is presented like any other failure — never the old
        # "timed out after Ns / may still be running" outer-timeout text.
        client, _ = _client()
        with patch("src.web.websocket.process_web_chat",
                   new=AsyncMock(side_effect=TimeoutError())):
            async with client:
                async with client.ws_connect("/api/ws") as ws:
                    await ws.send_json({"type": "chat", "content": "slow"})
                    resp = await ws.receive_json()
                    assert resp["type"] == "chat_error"
                    assert resp["error"] == "TimeoutError"
                    assert "may still be running" not in resp["error"]

    async def test_chat_generic_error_formatted_and_bounded(self):
        client, _ = _client()
        with patch("src.web.websocket.process_web_chat",
                   new=AsyncMock(side_effect=RuntimeError("kaboom"))):
            async with client:
                async with client.ws_connect("/api/ws") as ws:
                    await ws.send_json({"type": "chat", "content": "boom"})
                    resp = await ws.receive_json()
                    assert resp["type"] == "chat_error"
                    assert resp["error"] == "RuntimeError: kaboom"

    async def test_ping_is_answered_while_chat_turn_is_still_running(self):
        release = asyncio.Event()

        async def _blocked_chat(*args, **kwargs):
            await release.wait()
            return CHAT_RESULT

        client, manager = _client()
        with patch("src.web.websocket.process_web_chat", new=_blocked_chat):
            async with client:
                async with client.ws_connect("/api/ws") as ws:
                    await ws.send_json({"type": "chat", "content": "long task"})
                    for _ in range(20):
                        if manager._chat_tasks:
                            break
                        await asyncio.sleep(0.005)
                    assert len(manager._chat_tasks) == 1
                    await ws.send_json({"type": "ping", "ts": 99})
                    pong = await asyncio.wait_for(ws.receive_json(), timeout=0.25)
                    assert pong == {"type": "pong", "ts": 99}
                    release.set()
                    response = await asyncio.wait_for(ws.receive_json(), timeout=0.25)
                    assert response["type"] == "chat_response"

    async def test_busy_chat_rejection_creates_no_background_send_task(self, monkeypatch):
        manager = WebSocketManager(_bot())
        in_flight = asyncio.get_running_loop().create_future()
        ws = SimpleNamespace(_odin_chat_task=in_flight, send_json=AsyncMock())
        created = []
        real_create_task = asyncio.create_task

        def capture_task(coro, *args, **kwargs):
            created.append(coro)
            return real_create_task(coro, *args, **kwargs)

        monkeypatch.setattr("src.web.websocket.asyncio.create_task", capture_task)
        await manager._start_chat(ws, {"type": "chat", "content": "duplicate"})
        assert created == []
        assert manager._chat_tasks == set()
        ws.send_json.assert_awaited_once_with({
            "type": "chat_error",
            "error": "a chat turn is already in progress",
        })
        in_flight.cancel()

    async def test_busy_chat_rejections_are_bounded_and_rate_limited(self):
        release = asyncio.Event()

        async def _blocked_chat(*args, **kwargs):
            await release.wait()
            return CHAT_RESULT

        client, manager = _client()
        with patch("src.web.websocket.process_web_chat", new=_blocked_chat):
            async with client:
                async with client.ws_connect("/api/ws") as ws:
                    await ws.send_json({"type": "chat", "content": "long task"})
                    for _ in range(20):
                        if manager._chat_tasks:
                            break
                        await asyncio.sleep(0.005)
                    assert len(manager._chat_tasks) == 1

                    replies = []
                    for _ in range(10):
                        await ws.send_json({"type": "chat", "content": "duplicate"})
                        replies.append(await asyncio.wait_for(ws.receive_json(), 0.25))

                    assert len(manager._chat_tasks) == 1
                    assert all(reply["type"] == "chat_error" for reply in replies)
                    assert replies[-1]["error"] == "rate limit exceeded (10/min)"
                    release.set()
                    response = await asyncio.wait_for(ws.receive_json(), 0.25)
                    assert response["type"] == "chat_response"

    async def test_delayed_chat_completes_without_any_wall(self):
        async def _slow_chat(*args, **kwargs):
            await asyncio.sleep(0.3)
            return CHAT_RESULT

        client, _ = _client()
        with patch("src.web.websocket.process_web_chat", new=_slow_chat):
            async with client:
                async with client.ws_connect("/api/ws") as ws:
                    await ws.send_json({"type": "chat", "content": "long task"})
                    resp = await ws.receive_json()
                    assert resp["type"] == "chat_response"
                    assert resp["content"] == "hi there"

    async def test_html_bearing_exception_never_reaches_client(self):
        html = "<html><body>Internal Server Error<script>cf()</script></body></html>"
        client, _ = _client()
        with patch("src.web.websocket.process_web_chat",
                   new=AsyncMock(side_effect=RuntimeError(html))):
            async with client:
                async with client.ws_connect("/api/ws") as ws:
                    await ws.send_json({"type": "chat", "content": "boom"})
                    resp = await ws.receive_json()
                    assert resp["type"] == "chat_error"
                    assert "<html" not in resp["error"]
                    assert resp["error"] == "RuntimeError"

    async def test_secretful_exception_scrubbed(self):
        client, _ = _client()
        secret = "sk-" + "a" * 24
        with patch("src.web.websocket.process_web_chat",
                   new=AsyncMock(side_effect=RuntimeError(f"auth failed for {secret}"))):
            async with client:
                async with client.ws_connect("/api/ws") as ws:
                    await ws.send_json({"type": "chat", "content": "boom"})
                    resp = await ws.receive_json()
                    assert secret not in resp["error"]
                    assert "[REDACTED]" in resp["error"]

    async def test_cancellation_is_not_swallowed_into_chat_error(self):
        client, manager = _client()
        with patch("src.web.websocket.process_web_chat",
                   new=AsyncMock(side_effect=asyncio.CancelledError())):
            async with client:
                async with client.ws_connect("/api/ws") as ws:
                    await ws.send_json({"type": "chat", "content": "x"})
                    for _ in range(20):
                        if not manager._chat_tasks:
                            await asyncio.sleep(0.005)
                            continue
                        break
                    # Cancellation terminates the child task and emits no
                    # chat_error; the receive loop itself remains healthy.
                    await ws.send_json({"type": "ping", "ts": 7})
                    assert await ws.receive_json() == {"type": "pong", "ts": 7}


# --------------------------------------------------------------------------- #
# broadcast / close / identity helpers — direct with fake sockets
# --------------------------------------------------------------------------- #
class _FakeWS:
    """A hashable (identity) stand-in socket for the broadcast/close/tail helpers.

    (SimpleNamespace can't be used — it defines __eq__ so it's unhashable and
    the manager keeps sockets in sets.)
    """

    def __init__(self, **kw):
        self.closed = False
        self.send_json = AsyncMock()
        self.close = AsyncMock()
        for k, v in kw.items():
            setattr(self, k, v)


def _fake_ws(**kw):
    return _FakeWS(**kw)


class TestBroadcastAndClose:
    async def test_broadcast_event_to_subscribers(self):
        mgr = WebSocketManager(_bot())
        good = _fake_ws()
        dead = _fake_ws()
        dead.send_json = AsyncMock(side_effect=ConnectionError())
        mgr._event_subscribers.update({good, dead})
        mgr._clients.update({good, dead})
        await mgr.broadcast_event({"kind": "test"})
        good.send_json.assert_awaited_once()
        # a socket that errors on send is pruned from the subscriber set
        assert dead not in mgr._event_subscribers

    async def test_broadcast_no_subscribers_is_noop(self):
        mgr = WebSocketManager(_bot())
        await mgr.broadcast_event({"kind": "test"})  # no raise, early return

    async def test_close_by_session_id_is_exact_not_user_wide(self):
        mgr = WebSocketManager(_bot())
        first = _fake_ws(
            _odin_session_id="s1", _odin_identity=SimpleNamespace(user_id="same-user"),
        )
        second = _fake_ws(
            _odin_session_id="s2", _odin_identity=SimpleNamespace(user_id="same-user"),
        )
        mgr._clients.update({first, second})
        mgr._event_subscribers.update({first, second})
        assert await mgr.close_by_session_id("s1") == 1
        first.close.assert_awaited_once()
        second.close.assert_not_awaited()
        assert first not in mgr._clients and second in mgr._clients

    async def test_close_by_user_id(self):
        mgr = WebSocketManager(_bot())
        match = _fake_ws(_odin_identity=SimpleNamespace(user_id="u1"))
        other = _fake_ws(_odin_identity=SimpleNamespace(user_id="u2"))
        mgr._clients.update({match, other})
        closed = await mgr.close_by_user_id("u1")
        assert closed == 1
        match.close.assert_awaited_once()
        assert match not in mgr._clients and other in mgr._clients

    async def test_close_by_user_id_none_match(self):
        mgr = WebSocketManager(_bot())
        mgr._clients.add(_fake_ws(_odin_identity=SimpleNamespace(user_id="uX")))
        assert await mgr.close_by_user_id("nobody") == 0

    async def test_close_by_user_id_swallows_close_error(self):
        mgr = WebSocketManager(_bot())
        ws = _fake_ws(_odin_identity=SimpleNamespace(user_id="u1"))
        ws.close = AsyncMock(side_effect=RuntimeError("already closed"))
        mgr._clients.add(ws)
        assert await mgr.close_by_user_id("u1") == 1  # error swallowed, still pruned
        assert ws not in mgr._clients

    def test_client_count(self):
        mgr = WebSocketManager(_bot())
        mgr._clients.update({_fake_ws(), _fake_ws()})
        assert mgr.client_count == 2


class TestTailLogs:
    async def test_tail_sends_existing_lines(self):
        from pathlib import Path
        data = Path("data")
        data.mkdir()
        (data / "audit.jsonl").write_text('{"a":1}\n{"a":2}\n{"a":3}\n')
        mgr = WebSocketManager(_bot())
        ws = _fake_ws()
        # ws is not in _log_subscribers → the poll loop exits after the tail send
        await mgr._tail_logs(ws)
        assert ws.send_json.await_count == 3

    async def test_tail_no_file_is_safe(self):
        mgr = WebSocketManager(_bot())
        ws = _fake_ws()
        await mgr._tail_logs(ws)  # ./data/audit.jsonl absent → no send, no raise
        ws.send_json.assert_not_awaited()

    def test_resolve_identity_via_session_manager(self):
        ident = SimpleNamespace(user_id="u1")
        sm = SimpleNamespace(validate=lambda t: True, get_identity=lambda t: ident)
        mgr = WebSocketManager(_bot(), session_manager=sm)
        assert mgr._resolve_identity("tok") is ident

    def test_resolve_identity_via_token_manager(self):
        ident = SimpleNamespace(user_id="u1")
        tm = SimpleNamespace(resolve=lambda t: ident)
        request = SimpleNamespace(app={"token_manager": tm})
        mgr = WebSocketManager(_bot())
        assert mgr._resolve_identity("tok", request) is ident

    def test_resolve_identity_via_web_config(self):
        ident = SimpleNamespace(user_id="u2")
        wc = SimpleNamespace(resolve_api_identity=lambda t: ident)
        mgr = WebSocketManager(_bot(), web_config=wc)
        assert mgr._resolve_identity("tok") is ident

    def test_resolve_identity_returns_none(self):
        mgr = WebSocketManager(_bot())
        assert mgr._resolve_identity("tok") is None


class TestSessionTerminalTeardown:
    async def test_idle_managed_socket_expires_without_inbound_traffic(self):
        from src.health.server import SessionManager

        sessions = SessionManager(timeout_minutes=1 / 6000)
        sid, _ = sessions.create(SimpleNamespace(user_id="u1", tier="admin"))
        config = SimpleNamespace(
            api_token="configured",
            api_tokens=[],
            resolve_api_identity=lambda _token: None,
        )
        client, manager = TestProductionMiddlewareBearerAuth._stack(
            session_manager=sessions,
            web_config=config,
        )
        async with client:
            ws = await client.ws_connect(
                "/api/ws", protocols=[TestBearerSubprotocolAuth._proto(sid)]
            )
            await ws.send_json({"subscribe": "events"})
            assert (await ws.receive_json())["type"] == "subscribed"
            # No ping, command, unrelated login, or manual validate call.  The
            # manager-owned deadline must discover expiry and close exactly it.
            msg = await asyncio.wait_for(ws.receive(), timeout=0.5)
            assert msg.type == aiohttp.WSMsgType.CLOSE
            assert msg.data == 4002
            assert not sessions.contains(sid)
            assert not manager._clients
            assert not manager._session_expiry_tasks

    async def test_expiry_closes_only_the_exact_session_socket(self, monkeypatch):
        from src.health.server import SessionManager

        clock = [100.0]
        monkeypatch.setattr("src.health.server.time.monotonic", lambda: clock[0])
        sessions = SessionManager(timeout_minutes=1)
        sid, _ = sessions.create(SimpleNamespace(user_id="u1", tier="admin"))
        other_sid, _ = sessions.create(SimpleNamespace(user_id="u2", tier="admin"))
        manager = WebSocketManager(_bot(), session_manager=sessions)
        class Socket:
            pass

        first = Socket()
        first._odin_session_id = sid
        first.close = AsyncMock()
        other = Socket()
        other._odin_session_id = other_sid
        other.close = AsyncMock()
        manager._clients.update({first, other})
        sessions.set_destroy_callback(manager.schedule_close_by_session_id)

        clock[0] += 61
        # Refresh the unrelated lease, then expire only the first session.
        sessions._sessions[other_sid] = clock[0]
        assert sessions.validate(sid, touch=False) is False
        await asyncio.sleep(0)
        await asyncio.gather(*list(manager._session_close_tasks))

        first.close.assert_awaited_once()
        other.close.assert_not_awaited()
        assert first not in manager._clients
        assert other in manager._clients
        assert not sessions.contains(sid)
        assert sessions.contains(other_sid)


# --------------------------------------------------------------------------- #
# Bearer-subprotocol auth (audit 3.1: the token must never ride the URL)
# --------------------------------------------------------------------------- #
class TestBearerSubprotocolAuth:
    @staticmethod
    def _proto(token: str) -> str:
        import base64

        return "odin.bearer." + base64.urlsafe_b64encode(token.encode()).decode().rstrip("=")

    async def test_subprotocol_token_authenticates_and_echoes(self):
        client, _ = _client(api_token="sekrit-tok")
        async with client:
            ws = await client.ws_connect("/api/ws", protocols=[self._proto("sekrit-tok")])
            assert ws.protocol == self._proto("sekrit-tok")
            await ws.send_json({"type": "ping", "ts": 1})
            reply = await ws.receive_json()
            assert reply["type"] == "pong"
            await ws.close()

    async def test_query_token_rejected_even_when_valid(self):
        """A valid token in the URL must REJECT, not authenticate — query
        strings land in access journals, and journals ride backups."""
        client, _ = _client(api_token="sekrit-tok")
        async with client:
            ws = await client.ws_connect("/api/ws?token=sekrit-tok")
            msg = await ws.receive()
            assert msg.type == aiohttp.WSMsgType.CLOSE
            assert msg.data == 4001

    async def test_bad_subprotocol_rejected(self):
        client, _ = _client(api_token="sekrit-tok")
        async with client:
            ws = await client.ws_connect("/api/ws", protocols=[self._proto("wrong")])
            msg = await ws.receive()
            assert msg.type == aiohttp.WSMsgType.CLOSE
            assert msg.data == 4001

    async def test_malformed_subprotocol_payload_rejected(self):
        client, _ = _client(api_token="sekrit-tok")
        async with client:
            ws = await client.ws_connect("/api/ws", protocols=["odin.bearer.!!!not-b64!!!"])
            msg = await ws.receive()
            assert msg.type == aiohttp.WSMsgType.CLOSE
            assert msg.data == 4001

# --------------------------------------------------------------------------- #
# Production auth boundary — these install the REAL middleware before the WS
# route. Bare route-table tests cannot catch a handshake rejected upstream.
# --------------------------------------------------------------------------- #
class TestProductionMiddlewareBearerAuth:
    @staticmethod
    def _stack(*, session_manager, web_config):
        from src.health.server import _make_auth_middleware

        # This is the deployed auth middleware itself, not a handler-only app.
        app = web.Application(middlewares=[
            _make_auth_middleware(web_config, session_manager),
        ])
        app["session_manager"] = session_manager
        manager = setup_websocket(app, _bot(), web_config=web_config)
        return TestClient(TestServer(app)), manager

    async def test_session_subprotocol_reaches_handler_and_binds_exact_session(self):
        identity = SimpleNamespace(user_id="u1", tier="admin")
        sm = SimpleNamespace(
            validate=MagicMock(side_effect=lambda token, **_kw: token == "session-one"),
            get_identity=MagicMock(return_value=identity),
        )
        config = SimpleNamespace(
            api_token="configured-so-auth-is-on",
            api_tokens=[],
            resolve_api_identity=lambda _token: None,
        )
        client, manager = self._stack(session_manager=sm, web_config=config)
        async with client:
            ws = await client.ws_connect(
                "/api/ws", protocols=[TestBearerSubprotocolAuth._proto("session-one")]
            )
            await ws.send_json({"type": "ping", "ts": 9})
            assert (await ws.receive_json())["type"] == "pong"
            server_ws = next(iter(manager._clients))
            assert server_ws._odin_session_id == "session-one"
            await ws.close()

    @pytest.mark.parametrize("query", ["token=", "token=&token=valid", "token=valid&token="])
    async def test_any_query_token_presence_rejected_before_validation(self, query):
        sm = SimpleNamespace(
            validate=MagicMock(return_value=True),
            get_identity=MagicMock(return_value=SimpleNamespace(user_id="u1")),
        )
        config = SimpleNamespace(
            api_token="configured-so-auth-is-on",
            api_tokens=[],
            resolve_api_identity=lambda _token: None,
        )
        client, _manager = self._stack(session_manager=sm, web_config=config)
        # The handler is a spy so this pin proves the MIDDLEWARE's early
        # presence branch is what forwarded the request; handler-level query
        # rejection alone is insufficient evidence.
        forwarded = 0
        original_handle = _manager.handle
        async def counted(request):
            nonlocal forwarded
            forwarded += 1
            return await original_handle(request)
        route = next(
            route for route in client.server.app.router.routes()
            if route.resource.canonical == "/api/ws" and route.method == "GET"
        )
        route._handler = counted
        async with client:
            ws = await client.ws_connect(
                f"/api/ws?{query}",
                protocols=[TestBearerSubprotocolAuth._proto("valid")],
            )
            msg = await ws.receive()
            assert msg.type == aiohttp.WSMsgType.CLOSE
            assert msg.data == 4001
        assert forwarded == 1
        sm.validate.assert_not_called()

    async def test_missing_subprotocol_is_http_unauthorized_in_real_stack(self):
        sm = SimpleNamespace(validate=MagicMock(return_value=False), get_identity=MagicMock())
        config = SimpleNamespace(
            api_token="configured", api_tokens=[], resolve_api_identity=lambda _token: None,
        )
        client, _manager = self._stack(session_manager=sm, web_config=config)
        async with client:
            with pytest.raises(aiohttp.WSServerHandshakeError) as exc:
                await client.ws_connect("/api/ws")
            assert exc.value.status == 401
