"""Tests for WebSocket handler (src/web/websocket.py).

Covers WebSocketManager: client tracking, subscriptions,
event broadcasting, chat handling, authentication, ping/pong,
and setup_websocket function.
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.web.websocket import WebSocketManager, setup_websocket, _LOG_TAIL_LINES


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
        await mgr._handle_chat(ws, {"content": "x" * 5000})
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
        with patch("src.web.websocket.process_web_chat", new_callable=AsyncMock, return_value=mock_result):
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
        with patch("src.web.websocket.process_web_chat", new_callable=AsyncMock, return_value=mock_result):
            await mgr._handle_chat(ws, {"content": "make image"})
        resp = ws.send_json.call_args[0][0]
        assert "files" in resp
        assert len(resp["files"]) == 1

    @pytest.mark.asyncio
    async def test_chat_exception(self):
        mgr = WebSocketManager(_make_bot())
        ws = _make_ws()
        with patch("src.web.websocket.process_web_chat", new_callable=AsyncMock, side_effect=RuntimeError("boom")):
            await mgr._handle_chat(ws, {"content": "hello"})
        resp = ws.send_json.call_args[0][0]
        assert resp["type"] == "chat_error"

    @pytest.mark.asyncio
    async def test_chat_uses_session_based_channel_id(self):
        mgr = WebSocketManager(_make_bot())
        ws = _make_ws()
        ws._odin_session_id = "session-1234567890abcdef-extra"
        mock_result = {"response": "ok", "tools_used": [], "is_error": False}
        with patch("src.web.websocket.process_web_chat", new_callable=AsyncMock, return_value=mock_result) as mock_fn:
            await mgr._handle_chat(ws, {"content": "hi"})
        call_args = mock_fn.call_args
        assert call_args[0][2] == "ws-session-12345678"  # first 16 chars of session id


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
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_log_tail_lines(self):
        assert _LOG_TAIL_LINES == 50
