"""WebSocket handler for live log/event streaming and web chat.

Endpoint: /api/ws
- Client sends: {"subscribe": "logs"} or {"subscribe": "events"}
- Server sends: {"type": "log", "line": "..."} or {"type": "event", ...}
- Client sends: {"type": "chat", "content": "..."}
- Server sends: {"type": "chat_response", "content": "...", "tool_calls": [...]}
"""
from __future__ import annotations

import asyncio
import hmac
import json
from pathlib import Path
from typing import TYPE_CHECKING

import aiohttp
from aiohttp import web

from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger
from .chat import MAX_CHAT_CONTENT_LEN, process_web_chat

if TYPE_CHECKING:
    from ..discord.client import OdinBot

log = get_logger("web.ws")

# How many lines to send from the end of the log when a client first subscribes
_LOG_TAIL_LINES = 50
# Poll interval for checking new log lines
_LOG_POLL_INTERVAL = 1.0


_WS_CHAT_RATE_LIMIT = 10
_WS_CHAT_RATE_WINDOW = 60.0
_WS_CHAT_TIMEOUT = 300.0


class WebSocketManager:
    """Manages WebSocket connections and broadcasts events."""

    def __init__(self, bot: OdinBot, *, api_token: str = "", session_manager=None, web_config=None) -> None:
        self._bot = bot
        self._api_token = api_token
        self._session_manager = session_manager
        self._web_config = web_config
        self._clients: set[web.WebSocketResponse] = set()
        self._log_subscribers: set[web.WebSocketResponse] = set()
        self._event_subscribers: set[web.WebSocketResponse] = set()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    def _resolve_identity(self, token: str):
        """Resolve an ApiTokenIdentity from a raw token string."""
        if self._session_manager:
            if self._session_manager.validate(token):
                identity = self._session_manager.get_identity(token)
                if identity is not None:
                    return identity
        if self._web_config and hasattr(self._web_config, "resolve_api_identity"):
            identity = self._web_config.resolve_api_identity(token)
            if identity is not None:
                return identity
        return None

    async def handle(self, request: web.Request) -> web.WebSocketResponse:
        """Handle a WebSocket connection at /api/ws."""
        identity = getattr(request, "_api_identity", None)
        if self._api_token:
            token = request.query.get("token", "")
            valid = hmac.compare_digest(token, self._api_token)
            if not valid and self._session_manager:
                valid = self._session_manager.validate(token)
            if not valid:
                ws = web.WebSocketResponse()
                await ws.prepare(request)
                await ws.close(code=4001, message=b"unauthorized")
                return ws
            if identity is None:
                identity = self._resolve_identity(token)

        ws = web.WebSocketResponse(heartbeat=30.0)
        await ws.prepare(request)
        self._clients.add(ws)
        ws._odin_session_id = getattr(request, "_session_id", None) or "ws-anon"
        ws._odin_identity = identity
        log.info("WebSocket client connected (%d total)", len(self._clients))

        log_task: asyncio.Task | None = None

        try:
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                    except json.JSONDecodeError:
                        await ws.send_json({"error": "invalid JSON"})
                        continue

                    sub = data.get("subscribe")
                    unsub = data.get("unsubscribe")

                    if sub == "logs":
                        self._log_subscribers.add(ws)
                        # Start tailing the log file for this client
                        if log_task is None or log_task.done():
                            log_task = asyncio.create_task(
                                self._tail_logs(ws)
                            )
                        await ws.send_json({"type": "subscribed", "channel": "logs"})
                    elif sub == "events":
                        self._event_subscribers.add(ws)
                        await ws.send_json({"type": "subscribed", "channel": "events"})
                    elif unsub == "logs":
                        self._log_subscribers.discard(ws)
                        await ws.send_json({"type": "unsubscribed", "channel": "logs"})
                    elif unsub == "events":
                        self._event_subscribers.discard(ws)
                        await ws.send_json({"type": "unsubscribed", "channel": "events"})
                    elif data.get("type") == "ping":
                        await ws.send_json({
                            "type": "pong",
                            "ts": data.get("ts"),
                        })
                    elif data.get("type") == "chat":
                        await self._handle_chat(ws, data)
                    else:
                        await ws.send_json({"error": "unknown command"})

                elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSE):
                    break
        finally:
            if log_task and not log_task.done():
                log_task.cancel()
                try:
                    await log_task
                except asyncio.CancelledError:
                    pass
            self._clients.discard(ws)
            self._log_subscribers.discard(ws)
            self._event_subscribers.discard(ws)
            log.info("WebSocket client disconnected (%d remaining)", len(self._clients))

        return ws

    async def _handle_chat(self, ws: web.WebSocketResponse, data: dict) -> None:
        """Handle an incoming chat message from a WebSocket client."""
        content = (data.get("content") or "").strip()
        if not content:
            await ws.send_json({"type": "chat_error", "error": "content is required"})
            return
        if len(content) > MAX_CHAT_CONTENT_LEN:
            await ws.send_json({
                "type": "chat_error",
                "error": f"content exceeds {MAX_CHAT_CONTENT_LEN} chars",
            })
            return

        import time as _time
        now = _time.monotonic()
        window_start = getattr(ws, "_chat_window_start", None)
        if window_start is None or not isinstance(window_start, (int, float)) or now - window_start > _WS_CHAT_RATE_WINDOW:
            ws._chat_window_start = now
            ws._chat_count = 0
        chat_count = getattr(ws, "_chat_count", None)
        ws._chat_count = (chat_count + 1) if isinstance(chat_count, int) else 1
        if ws._chat_count > _WS_CHAT_RATE_LIMIT:
            await ws.send_json({"type": "chat_error", "error": "rate limit exceeded (10/min)"})
            return

        channel_id = (data.get("channel_id") or "").strip()
        if not channel_id:
            ws_session_id = getattr(ws, "_odin_session_id", "ws-anon")
            channel_id = f"ws-{ws_session_id[:16]}"

        identity = getattr(ws, "_odin_identity", None)
        user_id = identity.user_id if identity else "web-user"
        username = identity.username if identity else "WebUser"
        tier = identity.tier if identity else None
        allowed_tools = identity.allowed_tools if identity and identity.allowed_tools else None
        token_hosts = identity.allowed_hosts if identity and identity.allowed_hosts else None

        log.info("WebSocket chat from %s (tier=%s): %s", username, tier or "default", content[:80])
        try:
            result = await asyncio.wait_for(
                process_web_chat(
                    self._bot, content, channel_id,
                    user_id=user_id, username=username,
                    allowed_tools=allowed_tools, tier=tier,
                    token_allowed_hosts=token_hosts,
                ),
                timeout=_WS_CHAT_TIMEOUT,
            )
            resp = {
                "type": "chat_response",
                "content": result["response"],
                "tools_used": result["tools_used"],
                "is_error": result["is_error"],
            }
            files = result.get("files", [])
            if files:
                resp["files"] = files
            await ws.send_json(resp)
        except asyncio.TimeoutError:
            await ws.send_json({
                "type": "chat_error",
                "error": f"Request timed out after {int(_WS_CHAT_TIMEOUT)}s. The operation may still be running.",
            })
        except Exception as e:
            log.error("WebSocket chat error: %s", e, exc_info=True)
            await ws.send_json({
                "type": "chat_error",
                "error": scrub_output_secrets(str(e)),
            })

    async def broadcast_event(self, event: dict) -> None:
        """Broadcast an event to all subscribed WebSocket clients."""
        if not self._event_subscribers:
            return
        payload = {"type": "event", "payload": event}
        dead: list[web.WebSocketResponse] = []
        for ws in list(self._event_subscribers):
            try:
                await ws.send_json(payload)
            except (ConnectionError, RuntimeError):
                dead.append(ws)
        for ws in dead:
            self._event_subscribers.discard(ws)
            self._clients.discard(ws)

    async def _tail_logs(self, ws: web.WebSocketResponse) -> None:
        """Tail the audit log file and stream new lines to a client."""
        log_path = Path("./data/audit.jsonl")
        last_pos = 0

        # Send tail of existing log
        if log_path.exists():
            try:
                content = log_path.read_text()
                lines = content.strip().split("\n") if content.strip() else []
                tail = lines[-_LOG_TAIL_LINES:]
                for line in tail:
                    if ws.closed:
                        return
                    await ws.send_json({"type": "log", "line": line})
                last_pos = log_path.stat().st_size
            except OSError:
                pass

        # Poll for new lines
        while not ws.closed and ws in self._log_subscribers:
            try:
                await asyncio.sleep(_LOG_POLL_INTERVAL)
                if not log_path.exists():
                    continue
                current_size = log_path.stat().st_size
                if current_size <= last_pos:
                    if current_size < last_pos:
                        last_pos = 0  # File was truncated/rotated
                    continue
                with open(log_path, "r") as f:
                    f.seek(last_pos)
                    new_data = f.read()
                    last_pos = f.tell()
                for line in new_data.strip().split("\n"):
                    if line and not ws.closed:
                        await ws.send_json({"type": "log", "line": line})
            except asyncio.CancelledError:
                break
            except (OSError, ConnectionError, RuntimeError):
                break


def setup_websocket(
    app: web.Application, bot: OdinBot, *, api_token: str = "", web_config=None,
) -> WebSocketManager:
    """Register the WebSocket endpoint and return the manager."""
    session_manager = app.get("session_manager")
    manager = WebSocketManager(bot, api_token=api_token, session_manager=session_manager, web_config=web_config)
    app.router.add_get("/api/ws", manager.handle)
    log.info("WebSocket endpoint registered at /api/ws")
    return manager
