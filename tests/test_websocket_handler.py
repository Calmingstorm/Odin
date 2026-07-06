"""Tests for WebSocket handler (src/web/websocket.py).

Covers WebSocketManager: client tracking, subscriptions,
event broadcasting, chat handling, authentication, ping/pong,
and setup_websocket function.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.web.websocket import _LOG_TAIL_LINES, WebSocketManager, setup_websocket

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ws(*, closed=False):
    ws = AsyncMock()
    ws.closed = closed
    ws.send_json = AsyncMock()
    ws.close = AsyncMock()
    type(ws).__hash__ = lambda self: id(self)
    type(ws).__eq__ = lambda self, other: self is other
    return ws


def _make_bot():
    bot = MagicMock()
    bot.sessions = MagicMock()
    return bot


# ---------------------------------------------------------------------------
# WebSocketManager init
# ---------------------------------------------------------------------------

class TestWebSocketManagerInit:
    def test_defaults(self):
        bot = _make_bot()
        mgr = WebSocketManager(bot)
        assert mgr.client_count == 0
        assert mgr._api_token == ""

    def test_with_token(self):
        bot = _make_bot()
        mgr = WebSocketManager(bot, api_token="secret123")
        assert mgr._api_token == "secret123"


# ---------------------------------------------------------------------------
# Client count
# ---------------------------------------------------------------------------

class TestClientCount:
    def test_empty(self):
        mgr = WebSocketManager(_make_bot())
        assert mgr.client_count == 0

    def test_with_clients(self):
        mgr = WebSocketManager(_make_bot())
        mgr._clients.add(_make_ws())
        mgr._clients.add(_make_ws())
        assert mgr.client_count == 2


# ---------------------------------------------------------------------------
# Broadcast events
# ---------------------------------------------------------------------------

class TestBroadcastEvent:
    @pytest.mark.asyncio
    async def test_broadcast_no_subscribers(self):
        mgr = WebSocketManager(_make_bot())
        await mgr.broadcast_event({"action": "test"})
        # No error, no subscribers

    @pytest.mark.asyncio
    async def test_broadcast_to_subscribers(self):
        mgr = WebSocketManager(_make_bot())
        ws = _make_ws()
        mgr._event_subscribers.add(ws)
        await mgr.broadcast_event({"action": "test"})
        ws.send_json.assert_called_once()
        payload = ws.send_json.call_args[0][0]
        assert payload["type"] == "event"
        assert payload["payload"]["action"] == "test"

    @pytest.mark.asyncio
    async def test_broadcast_removes_dead_client(self):
        mgr = WebSocketManager(_make_bot())
        ws = _make_ws()
        ws.send_json = AsyncMock(side_effect=ConnectionError("gone"))
        mgr._event_subscribers.add(ws)
        mgr._clients.add(ws)
        await mgr.broadcast_event({"action": "test"})
        assert ws not in mgr._event_subscribers
        assert ws not in mgr._clients

    @pytest.mark.asyncio
    async def test_broadcast_runtime_error_cleans_up(self):
        mgr = WebSocketManager(_make_bot())
        ws = _make_ws()
        ws.send_json = AsyncMock(side_effect=RuntimeError("closed"))
        mgr._event_subscribers.add(ws)
        mgr._clients.add(ws)
        await mgr.broadcast_event({"action": "test"})
        assert ws not in mgr._event_subscribers


# ---------------------------------------------------------------------------
# Chat handling
# ---------------------------------------------------------------------------

class TestHandleChat:
    @pytest.mark.asyncio
    async def test_empty_content(self):
        mgr = WebSocketManager(_make_bot())
        ws = _make_ws()
        await mgr._handle_chat(ws, {"content": ""})
        ws.send_json.assert_called_once()
        resp = ws.send_json.call_args[0][0]
        assert resp["type"] == "chat_error"
        assert "required" in resp["error"]

    @pytest.mark.asyncio
    async def test_content_too_long(self):
        mgr = WebSocketManager(_make_bot())
        ws = _make_ws()
        await mgr._handle_chat(ws, {"content": "x" * 33000})
        resp = ws.send_json.call_args[0][0]
        assert resp["type"] == "chat_error"
        assert "exceeds" in resp["error"]

    @pytest.mark.asyncio
    async def test_successful_chat(self):
        mgr = WebSocketManager(_make_bot())
        ws = _make_ws()
        mock_result = {
            "response": "Hello!",
            "tools_used": [],
            "is_error": False,
            "files": [],
        }
        with patch(
            "src.web.websocket.process_web_chat",
            new_callable=AsyncMock,
            return_value=mock_result,
        ):
            await mgr._handle_chat(ws, {"content": "hi", "channel_id": "ch1"})
        resp = ws.send_json.call_args[0][0]
        assert resp["type"] == "chat_response"
        assert resp["content"] == "Hello!"

    @pytest.mark.asyncio
    async def test_chat_with_files(self):
        mgr = WebSocketManager(_make_bot())
        ws = _make_ws()
        mock_result = {
            "response": "Image generated",
            "tools_used": ["generate_image"],
            "is_error": False,
            "files": [{"filename": "img.png", "data": "base64data"}],
        }
        with patch(
            "src.web.websocket.process_web_chat",
            new_callable=AsyncMock,
            return_value=mock_result,
        ):
            await mgr._handle_chat(ws, {"content": "make image"})
        resp = ws.send_json.call_args[0][0]
        assert "files" in resp
        assert len(resp["files"]) == 1

    @pytest.mark.asyncio
    async def test_chat_exception(self):
        mgr = WebSocketManager(_make_bot())
        ws = _make_ws()
        with patch(
            "src.web.websocket.process_web_chat",
            new_callable=AsyncMock,
            side_effect=RuntimeError("boom"),
        ):
            await mgr._handle_chat(ws, {"content": "hello"})
        resp = ws.send_json.call_args[0][0]
        assert resp["type"] == "chat_error"

    @pytest.mark.asyncio
    async def test_chat_uses_identity_scoped_channel_id(self):
        mgr = WebSocketManager(_make_bot())
        ws = _make_ws()
        ws._odin_identity = MagicMock(
            user_id="ci-bot",
            username="CI",
            tier="admin",
            allowed_tools=[],
            allowed_hosts=[],
        )
        mock_result = {"response": "ok", "tools_used": [], "is_error": False}
        with patch(
            "src.web.websocket.process_web_chat",
            new_callable=AsyncMock,
            return_value=mock_result,
        )as mock_fn:
            await mgr._handle_chat(ws, {"content": "hi"})
        call_args = mock_fn.call_args
        assert call_args[0][2] == "ci-bot"

    @pytest.mark.asyncio
    async def test_chat_defaults_to_web_user_without_identity(self):
        mgr = WebSocketManager(_make_bot())
        ws = _make_ws()
        ws._odin_identity = None
        mock_result = {"response": "ok", "tools_used": [], "is_error": False}
        with patch(
            "src.web.websocket.process_web_chat",
            new_callable=AsyncMock,
            return_value=mock_result,
        )as mock_fn:
            await mgr._handle_chat(ws, {"content": "hi"})
        call_args = mock_fn.call_args
        assert call_args[0][2] == "web-user"


# ---------------------------------------------------------------------------
# setup_websocket
# ---------------------------------------------------------------------------

class TestSetupWebsocket:
    def test_registers_route(self):
        app = MagicMock()
        bot = _make_bot()
        router = MagicMock()
        app.router = router
        mgr = setup_websocket(app, bot, api_token="tok")
        assert isinstance(mgr, WebSocketManager)
        router.add_get.assert_called_once()
        call_args = router.add_get.call_args
        assert call_args[0][0] == "/api/ws"

    def test_returns_manager(self):
        app = MagicMock()
        bot = _make_bot()
        app.router = MagicMock()
        mgr = setup_websocket(app, bot)
        assert isinstance(mgr, WebSocketManager)
        assert mgr._api_token == ""


# ---------------------------------------------------------------------------
# WebSocket revocation
# ---------------------------------------------------------------------------

class TestCloseByUserId:
    @pytest.mark.asyncio
    async def test_closes_matching_user_only(self):
        bot = _make_bot()
        mgr = WebSocketManager(bot, api_token="tok")
        ws_target = _make_ws()
        ws_target._odin_identity = MagicMock(user_id="ci-bot")
        ws_other = _make_ws()
        ws_other._odin_identity = MagicMock(user_id="admin")
        ws_none = _make_ws()
        ws_none._odin_identity = None
        mgr._clients = {ws_target, ws_other, ws_none}
        mgr._log_subscribers = {ws_target, ws_other}
        mgr._event_subscribers = {ws_target}

        closed = await mgr.close_by_user_id("ci-bot")

        assert closed == 1
        ws_target.close.assert_awaited_once()
        ws_other.close.assert_not_awaited()
        ws_none.close.assert_not_awaited()
        assert ws_target not in mgr._clients
        assert ws_target not in mgr._log_subscribers
        assert ws_target not in mgr._event_subscribers
        assert ws_other in mgr._clients
        assert ws_none in mgr._clients

    @pytest.mark.asyncio
    async def test_closes_multiple_connections_same_user(self):
        bot = _make_bot()
        mgr = WebSocketManager(bot, api_token="tok")
        ws1 = _make_ws()
        ws1._odin_identity = MagicMock(user_id="ci-bot")
        ws2 = _make_ws()
        ws2._odin_identity = MagicMock(user_id="ci-bot")
        mgr._clients = {ws1, ws2}

        closed = await mgr.close_by_user_id("ci-bot")

        assert closed == 2
        ws1.close.assert_awaited_once()
        ws2.close.assert_awaited_once()
        assert len(mgr._clients) == 0

    @pytest.mark.asyncio
    async def test_no_match_returns_zero(self):
        bot = _make_bot()
        mgr = WebSocketManager(bot, api_token="tok")
        ws = _make_ws()
        ws._odin_identity = MagicMock(user_id="admin")
        mgr._clients = {ws}

        closed = await mgr.close_by_user_id("nonexistent")

        assert closed == 0
        ws.close.assert_not_awaited()
        assert ws in mgr._clients

    @pytest.mark.asyncio
    async def test_close_exception_does_not_propagate(self):
        bot = _make_bot()
        mgr = WebSocketManager(bot, api_token="tok")
        ws = _make_ws()
        ws._odin_identity = MagicMock(user_id="ci-bot")
        ws.close = AsyncMock(side_effect=ConnectionError("already closed"))
        mgr._clients = {ws}

        closed = await mgr.close_by_user_id("ci-bot")

        assert closed == 1
        assert ws not in mgr._clients


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_log_tail_lines(self):
        assert _LOG_TAIL_LINES == 50
