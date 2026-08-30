"""WebSocket handler for live log/event streaming and web chat.

Endpoint: /api/ws
- Client sends: {"subscribe": "logs"} or {"subscribe": "events"}
- Server sends: {"type": "log", "line": "..."} or {"type": "event", ...}
- Client sends: {"type": "chat", "content": "..."}
- Server sends: {"type": "chat_response", "content": "...", "tool_calls": [...]}
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import hmac
import json
from pathlib import Path
from typing import TYPE_CHECKING

import aiohttp
from aiohttp import WSCloseCode, web

from ..error_presentation import format_user_facing_error
from ..odin_log import get_logger
from .chat import MAX_CHAT_CONTENT_LEN, process_web_chat

if TYPE_CHECKING:
    from ..discord.client import OdinBot

log = get_logger("web.ws")

# WebSocket bearer credential carrier: browsers cannot set an Authorization
# header on a WebSocket, so the token rides a subprotocol as
# ``odin.bearer.<base64url(token, unpadded)>`` — header-borne, never logged
# by access journals, echoed back in the handshake per RFC 6455.
BEARER_SUBPROTOCOL_PREFIX = "odin.bearer."


def _bearer_subprotocol(request: web.Request) -> str | None:
    """The client-offered odin bearer subprotocol, verbatim (for echo)."""
    header = request.headers.get("Sec-WebSocket-Protocol", "")
    for offered in header.split(","):
        candidate = offered.strip()
        if candidate.startswith(BEARER_SUBPROTOCOL_PREFIX):
            return candidate
    return None


def _decode_bearer_subprotocol(offered: str | None) -> str:
    """Decode the token from the offered subprotocol; '' when absent/bad."""
    if not offered:
        return ""
    payload = offered[len(BEARER_SUBPROTOCOL_PREFIX) :]
    padding = "=" * (-len(payload) % 4)
    try:
        return base64.urlsafe_b64decode(payload + padding).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return ""

# How many lines to send from the end of the log when a client first subscribes
_LOG_TAIL_LINES = 50
# Poll interval for checking new log lines
_LOG_POLL_INTERVAL = 1.0


_WS_CHAT_RATE_LIMIT = 10
_WS_CHAT_RATE_WINDOW = 60.0


class WebSocketManager:
    """Manages WebSocket connections and broadcasts events."""

    def __init__(
        self,
        bot: OdinBot,
        *,
        api_token: str = "",
        session_manager=None,
        web_config=None,
    ) -> None:
        self._bot = bot
        self._api_token = api_token
        self._session_manager = session_manager
        self._web_config = web_config
        self._clients: set[web.WebSocketResponse] = set()
        self._log_subscribers: set[web.WebSocketResponse] = set()
        self._event_subscribers: set[web.WebSocketResponse] = set()
        # Chat turns outlive browser disconnects by design.  Keep explicit
        # ownership so their terminal exceptions are always consumed without
        # blocking the socket receive loop (which must remain free for pings).
        self._chat_tasks: set[asyncio.Task[None]] = set()
        self._session_close_tasks: set[asyncio.Task[int]] = set()
        # One deadline watcher per managed browser session.  Session expiry is
        # otherwise only discovered by later HTTP/WS traffic; an idle socket
        # could retain privileged subscriptions forever without this owner.
        self._session_expiry_tasks: dict[str, asyncio.Task[None]] = {}
        self._shutting_down = False

    @staticmethod
    def _consume_task(task: asyncio.Task) -> None:
        try:
            task.result()
        except asyncio.CancelledError:
            pass
        except Exception:
            log.exception("WebSocket background task failed")

    def schedule_close_by_session_id(self, session_id: str) -> None:
        """Enter the exact-session close contract from synchronous expiry.

        SessionManager invokes callbacks synchronously inside auth middleware;
        the manager owns and observes the bounded asynchronous socket close.
        """
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # No running event loop means no live aiohttp socket can exist.
            return
        expiry_task = self._session_expiry_tasks.pop(session_id, None)
        current = asyncio.current_task()
        if expiry_task is not None and expiry_task is not current:
            expiry_task.cancel()
        task = loop.create_task(
            self.close_by_session_id(session_id),
            name=f"ws-session-close-{session_id[:8]}",
        )
        self._session_close_tasks.add(task)
        task.add_done_callback(self._session_close_tasks.discard)
        task.add_done_callback(self._consume_task)

    def _session_is_valid(self, ws: web.WebSocketResponse, *, touch: bool) -> bool:
        if not getattr(ws, "_odin_session_managed", False):
            return True
        session_id = getattr(ws, "_odin_session_id", "")
        return bool(
            session_id
            and self._session_manager is not None
            and self._session_manager.validate(session_id, touch=touch)
        )

    def _ensure_session_expiry_watch(self, session_id: str) -> None:
        if not session_id or self._session_manager is None:
            return
        remaining = getattr(self._session_manager, "seconds_until_expiry", None)
        if remaining is None or session_id in self._session_expiry_tasks:
            return
        task = asyncio.create_task(
            self._watch_session_expiry(session_id),
            name=f"ws-session-expiry-{session_id[:8]}",
        )
        self._session_expiry_tasks[session_id] = task
        task.add_done_callback(self._consume_task)

    async def _watch_session_expiry(self, session_id: str) -> None:
        """Discover inactivity expiry without requiring another request.

        The session manager remains the sole lease authority and terminal
        teardown owner.  This task only sleeps to its current deadline and
        asks ``validate(touch=False)`` to perform the canonical removal.
        """
        current = asyncio.current_task()
        try:
            while not self._shutting_down:
                remaining = self._session_manager.seconds_until_expiry(session_id)
                if remaining is None:
                    return
                if remaining > 0:
                    await asyncio.sleep(remaining)
                if not self._session_manager.validate(session_id, touch=False):
                    return
        finally:
            if self._session_expiry_tasks.get(session_id) is current:
                self._session_expiry_tasks.pop(session_id, None)

    @staticmethod
    def _chat_rate_limited(ws: web.WebSocketResponse) -> bool:
        """Count every chat frame, including rejections while one is busy."""
        import time as _time

        now = _time.monotonic()
        window_start = getattr(ws, "_chat_window_start", None)
        if (window_start is None or not isinstance(window_start, (int, float))
                or now - window_start > _WS_CHAT_RATE_WINDOW):
            ws._chat_window_start = now  # type: ignore[attr-defined]  # sanctioned dynamic attr
            ws._chat_count = 0  # type: ignore[attr-defined]  # sanctioned dynamic attr
        chat_count = getattr(ws, "_chat_count", None)
        ws._chat_count = (chat_count + 1) if isinstance(chat_count, int) else 1  # type: ignore[attr-defined]  # sanctioned dynamic attr
        return ws._chat_count > _WS_CHAT_RATE_LIMIT  # type: ignore[attr-defined]  # sanctioned dynamic attr

    async def _start_chat(self, ws: web.WebSocketResponse, data: dict) -> None:
        if self._chat_rate_limited(ws):
            await ws.send_json({"type": "chat_error", "error": "rate limit exceeded (10/min)"})
            return
        existing = getattr(ws, "_odin_chat_task", None)
        if existing is not None and not existing.done():
            # Rejection is handled inline by the receive loop: do not create an
            # unbounded task/concurrent-write path while one turn is running.
            await ws.send_json({
                "type": "chat_error",
                "error": "a chat turn is already in progress",
            })
            return
        task = asyncio.create_task(self._handle_chat(ws, data), name="ws-chat-turn")
        ws._odin_chat_task = task  # type: ignore[attr-defined]  # sanctioned dynamic attr
        self._chat_tasks.add(task)
        task.add_done_callback(self._chat_tasks.discard)
        task.add_done_callback(self._consume_task)

    @property
    def client_count(self) -> int:
        return len(self._clients)

    def _resolve_identity(self, token: str, request=None):
        """Resolve an ApiTokenIdentity from a raw token string."""
        if self._session_manager:
            if self._session_manager.validate(token):
                identity = self._session_manager.get_identity(token)
                if identity is not None:
                    return identity
        tm = request.app.get("token_manager") if request else None
        if tm:
            identity = tm.resolve(token)
            if identity is not None:
                return identity
        if self._web_config and hasattr(self._web_config, "resolve_api_identity"):
            identity = self._web_config.resolve_api_identity(token)
            if identity is not None:
                return identity
        return None

    async def handle(self, request: web.Request) -> web.WebSocketResponse:
        """Handle a WebSocket connection at /api/ws.

        Authentication rides the ``Sec-WebSocket-Protocol`` header (the one
        place browser WebSocket clients can carry a credential), never the
        URL: query strings land verbatim in access journals — and journals
        ride backups — so a ``?token=`` is REJECTED outright rather than
        merely ignored (audit 3.1)."""
        identity = getattr(request, "_api_identity", None)
        offered_protocol = _bearer_subprotocol(request)
        if request.query.getall("token", []):
            ws = web.WebSocketResponse()
            await ws.prepare(request)
            await ws.close(
                code=4001,
                message=b"token in URL is not accepted; use the bearer subprotocol",
            )
            return ws
        if self._api_token or self._web_config:
            token = _decode_bearer_subprotocol(offered_protocol)
            valid = bool(identity)
            if not valid and self._api_token and token:
                valid = hmac.compare_digest(token, self._api_token)
            if not valid and self._session_manager and token:
                valid = self._session_manager.validate(token)
            if not valid and token:
                resolved = self._resolve_identity(token, request)
                if resolved is not None:
                    identity = resolved
                    valid = True
            if not valid:
                ws = web.WebSocketResponse()
                await ws.prepare(request)
                await ws.close(code=4001, message=b"unauthorized")
                return ws
            if identity is None and token:
                identity = self._resolve_identity(token, request)

        # A client that OFFERED subprotocols requires the server to select
        # one, or the browser fails the handshake.
        ws = web.WebSocketResponse(
            heartbeat=30.0,
            protocols=(offered_protocol,) if offered_protocol else (),
        )
        await ws.prepare(request)
        self._clients.add(ws)
        ws._odin_session_id = getattr(request, "_session_id", None) or "ws-anon"  # type: ignore[attr-defined]  # sanctioned dynamic attr
        ws._odin_session_managed = bool(getattr(request, "_session_managed", False))  # type: ignore[attr-defined]  # sanctioned dynamic attr
        ws._odin_identity = identity  # type: ignore[attr-defined]  # sanctioned dynamic attr
        if ws._odin_session_managed:  # type: ignore[attr-defined]
            self._ensure_session_expiry_watch(ws._odin_session_id)  # type: ignore[attr-defined]
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

                    is_ping = data.get("type") == "ping"
                    # Revalidate the exact browser session before accepting
                    # every command. Pings detect expiry but never refresh it;
                    # substantive traffic retains normal inactivity semantics.
                    if not self._session_is_valid(ws, touch=not is_ping):
                        break

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
                        await self._start_chat(ws, data)
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

        identity = getattr(ws, "_odin_identity", None)
        user_id = identity.user_id if identity else "web-user"
        channel_id = user_id
        username = identity.username if identity else "WebUser"
        tier = identity.tier if identity else None
        allowed_tools = identity.allowed_tools if identity and identity.allowed_tools else None
        token_hosts = (identity.allowed_hosts
            if identity and isinstance(getattr(identity, "allowed_hosts", None), list) else None)
        token_default_host = getattr(identity, "default_host", "") if identity else ""

        log.info("WebSocket chat from %s (tier=%s): %s", username, tier or "default", content[:80])
        try:
            # No outer wall — parity with REST /api/chat. The real bounds
            # are the tool loop's own guards (iteration caps, LLM request
            # timeout, per-tool timeouts). The old 300s wait_for cancelled
            # healthy long turns mid-flight (the last of the arbitrary-wall
            # family). Honest caveat: a browser disconnect does NOT cancel
            # this await — the turn runs to completion under those guards
            # and its result lands in session history.
            result = await process_web_chat(
                self._bot, content, channel_id,
                user_id=user_id, username=username,
                allowed_tools=allowed_tools, tier=tier,
                token_allowed_hosts=token_hosts,
                token_default_host=token_default_host,
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
            if not ws.closed:
                await ws.send_json(resp)
        except Exception as e:
            # A naturally raised TimeoutError lands here and is formatted
            # like any other failure. Never send raw str(e): exception
            # text carries HTTP bodies (HTML pages), control bytes, and
            # secrets — the shared formatter bounds and scrubs it.
            log.error("WebSocket chat error: %s", format_user_facing_error(e), exc_info=True)
            if not ws.closed:
                await ws.send_json({
                    "type": "chat_error",
                    "error": format_user_facing_error(e),
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

    async def close_all(self) -> int:
        """Close every connected client — the app.on_shutdown hook.

        ``AppRunner.cleanup()`` runs this after the listener stops accepting
        (so a browser cannot reconnect behind the snapshot) and before
        remaining handlers are cancelled. Closes run CONCURRENTLY with a 1s
        per-client bound: ``ws.close()`` alone waits up to its own 10s
        peer-handshake timeout, so serial unbounded closes would reinvent
        the shutdown hang once per client. Subscriber sets are cleared in
        guaranteed cleanup even when individual closes fail.
        """
        self._shutting_down = True
        expiry_tasks = list(self._session_expiry_tasks.values())
        for task in expiry_tasks:
            task.cancel()
        if expiry_tasks:
            await asyncio.gather(*expiry_tasks, return_exceptions=True)
        self._session_expiry_tasks.clear()
        snapshot = list(self._clients)

        async def _close_one(ws: web.WebSocketResponse) -> None:
            try:
                await asyncio.wait_for(
                    ws.close(code=WSCloseCode.GOING_AWAY, message=b"server shutdown"),
                    timeout=1.0,
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.debug("WebSocket close failed (non-fatal): %s", type(exc).__name__)

        try:
            if snapshot:
                await asyncio.gather(*(_close_one(ws) for ws in snapshot))
        finally:
            self._clients.clear()
            self._log_subscribers.clear()
            self._event_subscribers.clear()
        chat_tasks = list(self._chat_tasks)
        for task in chat_tasks:
            task.cancel()
        if chat_tasks:
            await asyncio.gather(*chat_tasks, return_exceptions=True)
        close_tasks = list(self._session_close_tasks)
        if close_tasks:
            await asyncio.gather(*close_tasks, return_exceptions=True)
        if snapshot:
            log.info("Closed %d WebSocket client(s) at shutdown", len(snapshot))
        return len(snapshot)

    async def close_by_session_id(self, session_id: str) -> int:
        """Close only sockets authenticated by one exact browser session."""
        to_close = [
            ws for ws in list(self._clients)
            if getattr(ws, "_odin_session_id", None) == session_id
        ]
        for ws in to_close:
            try:
                await asyncio.wait_for(
                    ws.close(code=4002, message=b"session ended"), timeout=1.0,
                )
            except Exception:
                pass
            self._clients.discard(ws)
            self._log_subscribers.discard(ws)
            self._event_subscribers.discard(ws)
        if to_close:
            log.info(
                "Closed %d WebSocket connection(s) for ended session",
                len(to_close),
            )
        return len(to_close)

    async def close_by_user_id(self, user_id: str) -> int:
        """Close all WebSocket connections for a given user_id."""
        to_close = []
        for ws in list(self._clients):
            identity = getattr(ws, "_odin_identity", None)
            if identity and getattr(identity, "user_id", None) == user_id:
                to_close.append(ws)
        for ws in to_close:
            try:
                await ws.close(code=4002, message=b"token revoked")
            except Exception:
                pass
            self._clients.discard(ws)
            self._log_subscribers.discard(ws)
            self._event_subscribers.discard(ws)
        if to_close:
            log.info(
                "Closed %d WebSocket connection(s) for revoked user_id=%s",
                len(to_close),
                user_id,
            )
        return len(to_close)

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
                with open(log_path) as f:
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
    manager = WebSocketManager(
        bot,
        api_token=api_token,
        session_manager=session_manager,
        web_config=web_config,
    )
    app.router.add_get("/api/ws", manager.handle)
    if session_manager is not None:
        register_destroy = getattr(session_manager, "set_destroy_callback", None)
        if register_destroy is not None:
            register_destroy(manager.schedule_close_by_session_id)

    # The manager owns its shutdown: aiohttp runs on_shutdown between
    # stopping the listener and cancelling remaining handlers, which is the
    # only race-free point to close live sockets (closing before cleanup
    # lets a browser reconnect behind the snapshot). Without this, an open
    # WebSocket held AppRunner.cleanup() until systemd's stop timeout
    # SIGKILLed every shutdown with a WebUI tab open (found 2026-07-16).
    async def _close_websockets_on_shutdown(_app: web.Application) -> None:
        await manager.close_all()

    app.on_shutdown.append(_close_websockets_on_shutdown)
    log.info("WebSocket endpoint registered at /api/ws")
    return manager
