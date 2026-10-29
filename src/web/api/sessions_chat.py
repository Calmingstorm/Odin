"""Chat, sessions and trajectory route registrars (RFC-003 P4 — carved verbatim from api/__init__).

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Awaitable
from dataclasses import dataclass
from typing import TypeVar

from aiohttp import BodyPartReader, web
from aiohttp.http_exceptions import HttpProcessingError

from ...credential_redaction import check_for_secrets
from ...odin_log import get_logger
from ...search.errors import InvalidSearchQuery
from ...sessions.manager import SessionManager
from ..api_common import (
    _SESSION_ID_RE,
    _safe_filename,
    _safe_int_param,
    _scoped_chat_channel,
    admin_gate,
)
from ..chat import (
    INVALID_MESSAGE_ID,
    MAX_CHAT_CONTENT_LEN,
    ChatMessageIdError,
    WebTurn,
    push_to_owner,
    steer_authority,
    valid_message_id,
    web_turn,
)
from ..uploads import (
    INVALID_ATTACHMENTS,
    UPLOAD_SECONDS,
    WEB_UPLOADS,
    UploadError,
    valid_attachments,
)

log = get_logger("web.api")

_T = TypeVar("_T")

# What aiohttp's multipart reader raises for a body it can't parse: some of its
# framing checks are assertions, and an RFC 2231 parameter can name an unknown
# charset. Caught only around the reader's own steps (_parsed, _FilePart), never
# around the handler's code.
_MULTIPART_PARSE_ERRORS = (ValueError, LookupError, AssertionError, HttpProcessingError)


class MalformedMultipartError(Exception):
    """aiohttp's multipart reader refused the request body: the client's error."""


async def _parsed(step: Awaitable[_T]) -> _T:
    """One step of aiohttp's multipart reader, its refusal of the body the client's."""
    try:
        return await step
    except _MULTIPART_PARSE_ERRORS as exc:
        raise MalformedMultipartError(type(exc).__name__) from exc


class _FilePart:
    """A multipart part as the upload store reads it: its header fields read
    once and its reads parsed as by _parsed."""

    def __init__(self, part: BodyPartReader) -> None:
        self._part = part
        try:
            self.name, self.filename = part.name, part.filename
        except _MULTIPART_PARSE_ERRORS as exc:
            raise MalformedMultipartError(type(exc).__name__) from exc
        self.headers = part.headers

    async def read_chunk(self, size: int) -> bytes:
        return await _parsed(self._part.read_chunk(size))


#: Longest a steering request may wait for its message's outcome.
STEER_MAX_WAIT_SECONDS = 60
#: How long a stop request waits for the turn to settle unless told otherwise,
#: as Discord /stop does.
STOP_DEFAULT_WAIT_SECONDS = 10


@dataclass(frozen=True)
class _ChatCaller:
    """The authenticated caller's chat identity and policy, as /api/chat applies it."""

    user_id: str
    username: str
    tier: str | None
    tools: list[str] | None
    hosts: list[str] | None
    default_host: str


def _chat_caller(request: web.Request) -> _ChatCaller:
    identity = getattr(request, "_api_identity", None)
    return _ChatCaller(
        user_id=identity.user_id if identity else "web-user",
        username=identity.username if identity else "WebUser",
        tier=identity.tier if identity else None,
        tools=identity.allowed_tools if identity and identity.allowed_tools else None,
        hosts=(
            identity.allowed_hosts
            if identity and isinstance(getattr(identity, "allowed_hosts", None), list)
            else None
        ),
        default_host=getattr(identity, "default_host", "") if identity else "",
    )


#: HTTP status for each refused steering admission (``SteerAdmission.status``).
_STEER_REFUSAL_STATUS = {
    "no_turn": 409, "stopping": 409, "limit": 409,
    "denied": 403, "empty": 400, "too_long": 400,
}


async def _pkg_process_web_chat(*args, **kwargs):
    """Resolve ``process_web_chat`` through the package attribute at call
    time, so the historical patch seam —
    ``patch("src.web.api.process_web_chat", ...)`` — keeps governing the
    real handlers after the carve (RFC-003 R1 import-surface promise).
    """
    from . import process_web_chat as pwc

    request = kwargs.pop("_request", None)
    if request is None:
        return await pwc(*args, **kwargs)
    from ...tools.output_authorization import web_output_scope

    with web_output_scope(args[0], request):
        if getattr(request, "path", None) == "/api/chat":
            from ..computer_binding import browser_binding

            binding = browser_binding(args[0], request)
            if binding is not None:
                kwargs["computer_binding"] = binding
        return await pwc(*args, **kwargs)

def register_chat(routes: web.RouteTableDef, bot) -> None:
    """Chat (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Chat
    # ------------------------------------------------------------------

    @routes.post("/api/chat")
    async def chat(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        content = (data.get("content") or "").strip()
        attachments = data.get("attachments")
        if attachments is not None and not valid_attachments(attachments):
            return web.json_response({"error": INVALID_ATTACHMENTS}, status=400)
        if not content and not attachments:
            return web.json_response({"error": "content is required"}, status=400)
        if len(content) > MAX_CHAT_CONTENT_LEN:
            return web.json_response(
                {"error": f"content exceeds {MAX_CHAT_CONTENT_LEN} chars"}, status=400
            )

        caller = _chat_caller(request)
        user_id = caller.user_id
        username = caller.username
        tier = caller.tier
        token_tools = caller.tools
        token_hosts = caller.hosts
        token_default_host = caller.default_host

        # Optional caller-supplied session id for multi-request chat continuity.
        # Omitted -> historical behavior (one history per identity). Supplied -> validated
        # and namespaced UNDER the authenticated identity. It only controls conversation
        # continuity + lock serialization; permissions, tier, tools/hosts, memory, and
        # audit identity all stay keyed to the authenticated token, never the session id.
        channel_id = user_id
        session_id = data.get("session_id")
        if session_id is not None:
            session_id = session_id.strip() if isinstance(session_id, str) else ""
            if not _SESSION_ID_RE.match(session_id):
                return web.json_response(
                    {"error": "invalid session_id (expected 1-128 chars of [A-Za-z0-9._:-])"},
                    status=400,
                )
            channel_id = _scoped_chat_channel(user_id, session_id)

        # Optional: the caller's id for its question, so it can match the
        # stored copy (GET /api/sessions/{id}) with its own.
        message_id = data.get("message_id")
        if message_id is not None and not valid_message_id(message_id):
            return web.json_response({"error": INVALID_MESSAGE_ID}, status=400)
        try:
            result = await _pkg_process_web_chat(
                bot, content, channel_id,
                user_id=user_id, username=username,
                allowed_tools=token_tools, tier=tier,
                token_allowed_hosts=token_hosts,
                token_default_host=token_default_host,
                _request=request,
                **({"message_id": message_id} if message_id is not None else {}),
                **({"attachments": attachments, "upload_store": request.app.get(WEB_UPLOADS)}
                   if attachments else {}),
            )
        except ChatMessageIdError as e:
            return web.json_response({"error": str(e)}, status=409)
        except UploadError as e:
            return web.json_response({"error": str(e)}, status=e.status)

        # Scoped-session locks are cached like the default per-identity lock. We do NOT
        # clean them up per-request: that races a waiter and can split one session across
        # two lock objects (concurrent _do_process_web_chat). Bounding _web_channel_locks
        # via a TTL/max-size sweep is a deliberate follow-up; correct serialization first.
        status = 200 if not result["is_error"] else 502
        resp = {
            "response": result["response"],
            "tools_used": result["tools_used"],
            "is_error": result["is_error"],
        }
        if session_id is not None:
            resp["session_id"] = session_id
        files = result.get("files", [])
        if files:
            resp["files"] = files
        # The stored ids of the question and the reply, each while stored.
        for key in ("question_id", "reply_id"):
            if result.get(key):
                resp[key] = result[key]
        return web.json_response(resp, status=status)

    def _control_target(
        request: web.Request, data: dict, caller: _ChatCaller,
    ) -> tuple[str, web.Response | None] | web.Response:
        """The chat a steering or stop request names, with its admin refusal.

        The caller's own ``/api/chat`` turn, chosen like ``/api/chat`` chooses
        its conversation (the identity, or ``session_id`` under it). An admin
        may name any turn's ``channel_id`` instead, a Discord channel included.
        Returns ``(channel_id, denied)``, ``denied`` being None for an admin,
        or the response refusing the request.
        """
        session_id = data.get("session_id")
        target = data.get("channel_id")
        # The routes are self-service; only an admin may name another turn or
        # act past the credential checks. The gate is built per request rather
        # than captured by the handler, which would document the route admin-only.
        denied = admin_gate(bot)(request)
        if target is not None:
            if session_id is not None:
                return web.json_response(
                    {"error": "send session_id or channel_id, not both"}, status=400
                )
            if denied is not None:
                return denied
            if not isinstance(target, str) or not target.strip():
                return web.json_response({"error": "invalid channel_id"}, status=400)
            return target.strip(), denied
        channel_id = caller.user_id
        if session_id is not None:
            session_id = session_id.strip() if isinstance(session_id, str) else ""
            if not _SESSION_ID_RE.match(session_id):
                return web.json_response(
                    {"error": "invalid session_id (expected 1-128 chars of "
                              "[A-Za-z0-9._:-])"},
                    status=400,
                )
            channel_id = _scoped_chat_channel(caller.user_id, session_id)
        return channel_id, denied

    def _running_turn(
        channel_id: str, message_id: str | None,
    ) -> tuple[WebTurn | None, web.Response | None]:
        """The web turn a control acts on, or its refusal.

        Without ``message_id``: the channel's web turn once it runs, if any.
        With one: only the turn that question started, once it runs; never a
        later turn in the same chat. Checked with no await before acting.
        """
        turn = web_turn(channel_id)
        active = (turn is not None
                  and bot.channel_state.active_requests.get(channel_id) == turn.request_id)
        if message_id is None:
            return (turn if active else None), None
        if turn is None or turn.question_id != message_id:
            return None, web.json_response(
                {"error": "That question's turn is not running.", "status": "stale"},
                status=409,
            )
        if not active:
            return None, web.json_response(
                {"error": "That turn is still starting; try again in a moment.",
                 "status": "not_started"},
                status=409,
            )
        return turn, None

    def _message_id(data: dict) -> str | None | web.Response:
        message_id = data.get("message_id")
        if message_id is not None and not valid_message_id(message_id):
            return web.json_response({"error": INVALID_MESSAGE_ID}, status=400)
        return message_id

    @routes.post("/api/chat/steer")
    async def chat_steer(request: web.Request) -> web.Response:
        """Queue a correction for a running chat turn (docs/chat-steering.md).

        It reaches the caller's own ``/api/chat`` turn, chosen like ``/api/chat``
        chooses its conversation (the identity, or ``session_id`` under it). An
        admin may name any turn's ``channel_id`` instead, a Discord channel
        included. With ``message_id``, only the web turn that question started.
        Admission, limits and consumption are Discord ``/steer``'s; a web turn's
        owner is also sent the outcome as a ``chat_control`` push.
        """
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        if not isinstance(data, dict):
            return web.json_response({"error": "invalid JSON"}, status=400)
        content = data.get("content")
        if not isinstance(content, str):
            return web.json_response({"error": "content is required"}, status=400)
        # Never echo or queue a credential, as /steer refuses one.
        if check_for_secrets(content):
            return web.json_response({
                "error": "A secret/credential was detected. Remove it and send the "
                         "steering message again.",
            }, status=400)
        wait_seconds = data.get("wait_seconds", 0)
        if (isinstance(wait_seconds, bool) or not isinstance(wait_seconds, int | float)
                or not 0 <= wait_seconds <= STEER_MAX_WAIT_SECONDS):
            return web.json_response({
                "error": f"wait_seconds must be a number from 0 to {STEER_MAX_WAIT_SECONDS}",
            }, status=400)
        message_id = _message_id(data)
        if isinstance(message_id, web.Response):
            return message_id

        caller = _chat_caller(request)
        user_id = caller.user_id
        chosen = _control_target(request, data, caller)
        if isinstance(chosen, web.Response):
            return chosen
        channel_id, denied = chosen
        bound, refusal = _running_turn(channel_id, message_id)
        if refusal is not None:
            return refusal

        outcome: asyncio.Future[str] = asyncio.get_running_loop().create_future()

        async def notify(sequence: int, result: str) -> None:
            if not outcome.done():
                outcome.set_result(result)
            if bound is not None:
                push_to_owner(bot, bound.owner_id, {
                    "type": "chat_control", "kind": "steer", "channel_id": channel_id,
                    "question_id": bound.question_id, "sequence": sequence,
                    "status": "consumed" if result == "consumed" else "not_consumed",
                })

        admission = bot.channel_state.admit_steer(
            channel_id, content, user_id=user_id,
            # Admins may steer any turn, as with Discord /steer. Anyone else must
            # be the turn's requester AND present the credential policy the turn
            # runs with: a narrower credential sharing the user ID is refused.
            is_admin=denied is None,
            authority=steer_authority(caller.tier, caller.tools, caller.hosts,
                                      caller.default_host),
            notifier=notify if wait_seconds or bound is not None else None,
        )
        if not admission.queued:
            return web.json_response(
                {"error": admission.message, "status": admission.status},
                status=_STEER_REFUSAL_STATUS[admission.status],
            )
        sequence = admission.sequence
        if wait_seconds:
            try:
                result = await asyncio.wait_for(outcome, timeout=wait_seconds)
            except TimeoutError:
                pass
            else:
                if result == "consumed":
                    return web.json_response({
                        "status": "consumed", "sequence": sequence,
                        "message": f"Message consumed (sequence {sequence}).",
                    })
                return web.json_response({
                    "status": "not_consumed", "sequence": sequence,
                    "message": f"Turn ended without consuming this message (sequence {sequence}).",
                })
        return web.json_response(
            {"status": "queued", "sequence": sequence, "message": admission.message},
            status=202,
        )

    def _stop_receipt(turn: WebTurn):
        """The owner's ``chat_control`` push once the turn's stop settles."""

        def receipt(waiter: asyncio.Future) -> None:
            if waiter.cancelled() or waiter.exception() is not None:
                return
            push_to_owner(bot, turn.owner_id, {
                "type": "chat_control", "kind": "stop", "channel_id": turn.channel_id,
                "question_id": turn.question_id,
                "status": "stopped" if getattr(waiter.result(), "confirmed", False)
                else "finished",
            })

        return receipt

    @routes.post("/api/chat/stop")
    async def chat_stop(request: web.Request) -> web.Response:
        """Stop a running chat turn cooperatively (docs/chat-steering.md).

        The turn is chosen as for ``/api/chat/steer``, and as with Discord
        /stop a tool call in progress settles first. A non-admin may stop only
        a web turn it started, presenting the credential policy it runs with.
        Waits up to ``wait_seconds`` (default 10) for the turn to settle; a
        web turn's owner is also sent the final state as a ``chat_control`` push.
        """
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        if not isinstance(data, dict):
            return web.json_response({"error": "invalid JSON"}, status=400)
        wait_seconds = data.get("wait_seconds", STOP_DEFAULT_WAIT_SECONDS)
        if (isinstance(wait_seconds, bool) or not isinstance(wait_seconds, int | float)
                or not 0 <= wait_seconds <= STEER_MAX_WAIT_SECONDS):
            return web.json_response({
                "error": f"wait_seconds must be a number from 0 to {STEER_MAX_WAIT_SECONDS}",
            }, status=400)
        message_id = _message_id(data)
        if isinstance(message_id, web.Response):
            return message_id

        caller = _chat_caller(request)
        chosen = _control_target(request, data, caller)
        if isinstance(chosen, web.Response):
            return chosen
        channel_id, denied = chosen
        turn, refusal = _running_turn(channel_id, message_id)
        if refusal is not None:
            return refusal
        no_turn = web.json_response(
            {"error": "No running chat turn in this channel.", "status": "no_turn"}, status=409,
        )
        if denied is not None:
            # Stopping only ends work, but an interruption is still an effect:
            # the turn's requester with its own credential policy, as for steering.
            if turn is None:
                return no_turn
            authority = steer_authority(
                caller.tier, caller.tools, caller.hosts, caller.default_host)
            if turn.owner_id != caller.user_id or turn.authority != authority:
                return web.json_response({
                    "error": "Access denied. Only the turn's requester or an admin may stop it.",
                    "status": "denied",
                }, status=403)
        target = bot.channel_state.request_stop(channel_id)
        if target is None:
            return no_turn
        request_id, waiter = target
        if turn is not None and request_id == turn.request_id:
            waiter.add_done_callback(_stop_receipt(turn))
        if not waiter.done() and wait_seconds:
            try:
                # Shielded: the waiter belongs to the turn and to everyone
                # waiting on it, never to this request or its timeout.
                await asyncio.wait_for(asyncio.shield(waiter), timeout=wait_seconds)
            except TimeoutError:
                pass
        if waiter.done() and not waiter.cancelled():
            result = waiter.result()
            return web.json_response({
                "status": "stopped" if getattr(result, "confirmed", False) else "finished",
                "message": str(result),
            })
        return web.json_response({
            "status": "stop_requested",
            "message": "Stop requested; the step in progress finishes first.",
        }, status=202)

    @routes.post("/api/chat/uploads")
    async def chat_upload(request: web.Request) -> web.Response:
        """Stage one file for a chat question (multipart, one ``file`` part).

        Returns its ``upload_id`` for the question's ``attachments``. The file
        belongs to the caller, is used once, and expires unused after a day.
        """
        store = request.app.get(WEB_UPLOADS)
        if store is None:
            return web.json_response({"error": "uploads are unavailable"}, status=503)
        if not (request.content_type or "").startswith("multipart/form-data"):
            return web.json_response(
                {"error": "send the file as multipart/form-data"}, status=400)
        caller = _chat_caller(request)
        upload = None
        accepted = False
        try:
            async with asyncio.timeout(UPLOAD_SECONDS):
                reader = await _parsed(request.multipart())
                part = await _parsed(reader.next())
                file = _FilePart(part) if isinstance(part, BodyPartReader) else None
                if file is None or file.name != "file" or not file.filename:
                    return web.json_response(
                        {"error": "send exactly one part named 'file', with a filename"},
                        status=400)
                upload = await store.receive(caller.user_id, file)
                if await _parsed(reader.next()) is not None:
                    return web.json_response({"error": "send one file per upload"}, status=400)
                accepted = True
        except TimeoutError:
            return web.json_response({"error": "the upload took too long"}, status=408)
        except UploadError as e:
            return web.json_response({"error": str(e)}, status=e.status)
        except MalformedMultipartError:
            return web.json_response({"error": "malformed multipart body"}, status=400)
        finally:
            # A file whose id never reached the caller is not kept: whatever
            # ended the request after it was staged (a deadline, a malformed or
            # extra part, a dropped connection).
            if upload is not None and not accepted:
                store.discard(upload)
        return web.json_response(upload.public(), status=201)

    @routes.post("/api/execute")
    async def execute(request: web.Request) -> web.Response:
        """Stateless prompt execution — no session history, no persistence.

        Designed for CLI tools, scripts, CI/CD pipelines, and automation.
        Each request gets a unique ephemeral channel_id that is discarded
        after the response is returned.
        """
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        content = (data.get("prompt") or data.get("content") or "").strip()
        if data.get("attachments") is not None:
            return web.json_response(
                {"error": "attachments are accepted only by /api/chat and the WebSocket chat"},
                status=400,
            )
        if not content:
            return web.json_response({"error": "prompt is required"}, status=400)
        if len(content) > MAX_CHAT_CONTENT_LEN:
            return web.json_response(
                {"error": f"prompt exceeds {MAX_CHAT_CONTENT_LEN} chars"}, status=400
            )

        channel_id = f"api-{uuid.uuid4().hex}"

        # Resolve identity from middleware or fallback
        identity = getattr(request, "_api_identity", None)
        if identity is None:
            auth_header = request.headers.get("Authorization", "")
            bearer_token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
            tm = getattr(bot, "api_token_manager", None)
            identity = tm.resolve(bearer_token) if tm else None
            if identity is None:
                identity = bot.config.web.resolve_api_identity(bearer_token)
        user_id = identity.user_id if identity else "api-user"
        username = identity.username if identity else "API"
        token_tools = identity.allowed_tools if identity and identity.allowed_tools else None
        tier = identity.tier if identity else None
        token_hosts = (
            identity.allowed_hosts
            if identity and isinstance(getattr(identity, "allowed_hosts", None), list)
            else None
        )
        token_default_host = getattr(identity, "default_host", "") if identity else ""

        with bot.sessions.ephemeral(channel_id):
            result = await _pkg_process_web_chat(
                bot, content, channel_id,
                user_id=user_id, username=username,
                allowed_tools=token_tools, tier=tier,
                token_allowed_hosts=token_hosts,
                token_default_host=token_default_host,
                persist_channel_lock=False,  # no lock to cache or leak
                ephemeral=True,  # nothing it starts may store this channel later
                _request=request,
            )

        status = 200 if not result["is_error"] else 502
        resp = {
            "response": result["response"],
            "tools_used": result["tools_used"],
            "is_error": result["is_error"],
            "source": "web_api",
        }
        if identity and identity.label:
            resp["token_label"] = identity.label
        files = result.get("files", [])
        if files:
            resp["files"] = files
        return web.json_response(resp, status=status)


def register_sessions(routes: web.RouteTableDef, bot) -> None:
    """Sessions (verbatim from the monolith)."""
    _require_admin = admin_gate(bot)

    # ------------------------------------------------------------------
    # Sessions
    # ------------------------------------------------------------------

    @routes.get("/api/sessions")
    async def list_sessions(request: web.Request) -> web.Response:
        identity = getattr(request, "_api_identity", None)
        is_admin = not identity or getattr(identity, "tier", "admin") == "admin"
        own_id = identity.user_id if identity else None
        sessions = []
        for cid, session in bot.sessions.items_snapshot():
            if not is_admin and cid != own_id and not cid.startswith(f"web:{own_id}:session:"):
                continue
            # Build preview from last 2 messages
            preview = []
            for m in session.messages[-2:]:
                text = m.content or ""
                if len(text) > 120:
                    text = text[:120] + "..."
                preview.append({"role": m.role, "content": text})
            # Recorded origin first: an identity-keyed API chat (no session_id)
            # has no web prefix. Older sessions fall back to the id's prefix.
            source = getattr(session, "source", None) or (
                "web" if cid.startswith(("web-", "web:")) else "discord"
            )
            sessions.append({
                "channel_id": cid,
                "message_count": len(session.messages),
                "estimated_tokens": session.estimated_tokens,
                "last_active": session.last_active,
                "created_at": session.created_at,
                "has_summary": session.has_summary,
                "preview": preview,
                "source": source,
                "last_user_id": session.last_user_id,
            })
        sessions.sort(key=lambda s: s["last_active"], reverse=True)
        return web.json_response(sessions)

    @routes.get("/api/sessions/token-usage")
    async def session_token_usage(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        usage = bot.sessions.get_session_token_usage()
        return web.json_response(usage)

    @routes.get("/api/sessions/activity")
    async def session_activity(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        activity = bot.sessions.get_activity_metrics()
        return web.json_response(activity)

    @routes.get("/api/sessions/search")
    async def search_sessions(request: web.Request) -> web.Response:
        query = request.query.get("q", "").strip()
        if not query:
            return web.json_response({"error": "q parameter required"}, status=400)
        identity = getattr(request, "_api_identity", None)
        is_admin = not identity or getattr(identity, "tier", "admin") == "admin"
        limit = _safe_int_param(request, "limit", 20, hi=50)
        channel_id = request.query.get("channel_id") or None
        if not is_admin:
            if channel_id:
                denied = _check_session_access(request, channel_id)
                if denied is not None:
                    return denied
        user_id = request.query.get("user_id") or None
        after: float | None = None
        before: float | None = None
        if request.query.get("after"):
            try:
                after = float(request.query["after"])
            except ValueError:
                pass
        if request.query.get("before"):
            try:
                before = float(request.query["before"])
            except ValueError:
                pass
        try:
            if not is_admin and not channel_id:
                # Unscoped searches cover default and currently owned scoped
                # conversations. Explicit scopes also reach archived channels.
                own_id = identity.user_id  # type: ignore[union-attr]
                channels = {own_id}
                channels.update(cid for cid, _ in bot.sessions.items_snapshot()
                                if cid.startswith(f"web:{own_id}:session:"))
                results = []
                for cid in sorted(channels):
                    results.extend(await bot.sessions.search_history(
                        query, limit=limit, channel_id=cid,
                        user_id=user_id, after=after, before=before,
                    ))
                results.sort(key=lambda r: r.get("timestamp", 0), reverse=True)
                results = results[:limit]
            else:
                results = await bot.sessions.search_history(
                    query, limit=limit, channel_id=channel_id,
                    user_id=user_id, after=after, before=before,
                )
        except InvalidSearchQuery:
            return web.json_response({"error": "invalid query"}, status=400)
        except Exception:
            log.exception("Session search failed")
            return web.json_response({"error": "search failed"}, status=500)
        return web.json_response({"query": query, "results": results, "count": len(results)})

    def _check_session_access(request: web.Request, channel_id: str) -> web.Response | None:
        """Non-admin identities can only access their own session."""
        identity = getattr(request, "_api_identity", None)
        if not identity:
            return None
        if getattr(identity, "tier", "admin") == "admin":
            return None
        own_prefix = f"web:{identity.user_id}:session:"
        if identity.user_id != channel_id and not channel_id.startswith(own_prefix):
            return web.json_response({"error": "access denied"}, status=403)
        return None

    @routes.get("/api/sessions/{channel_id}")
    async def get_session(request: web.Request) -> web.Response:
        cid = request.match_info["channel_id"]
        denied = _check_session_access(request, cid)
        if denied:
            return denied
        session = bot.sessions.get(cid)
        if not session:
            return web.json_response({"error": "session not found"}, status=404)
        messages = [
            {
                "role": m.role,
                "content": m.content,
                "timestamp": m.timestamp,
                "user_id": m.user_id,
                # A web chat's own id for the message (Discord: its message id).
                "message_id": m.message_id,
            }
            for m in session.messages
        ]
        return web.json_response({
            "channel_id": cid,
            "messages": messages,
            # Later posts (a loop's, a background task's), outside the history.
            "posts": [
                {"content": p.content, "timestamp": p.timestamp}
                for p in getattr(session, "posts", [])
            ],
            "summary": SessionManager._render_context_summary(session),
            "created_at": session.created_at,
            "last_active": session.last_active,
            "estimated_tokens": session.estimated_tokens,
            "token_budget": bot.sessions.token_budget,
        })

    @routes.get("/api/sessions/{channel_id}/export")
    async def export_session(request: web.Request) -> web.Response:
        cid = request.match_info["channel_id"]
        denied = _check_session_access(request, cid)
        if denied:
            return denied
        session = bot.sessions.get(cid)
        if not session:
            return web.json_response({"error": "session not found"}, status=404)
        fmt = request.query.get("format", "json")
        messages = [
            {
                "role": m.role,
                "content": m.content,
                "timestamp": m.timestamp,
                "user_id": m.user_id,
            }
            for m in session.messages
        ]
        safe_cid = _safe_filename(cid)
        if fmt == "text":
            lines = []
            # Every stored segment, not the prompt's five-segment window: the
            # first compaction folds the legacy summary into these segments.
            summary_text = SessionManager._render_context_summary(
                session, max_segments=max(1, len(session.summary_segments))
            )
            if summary_text:
                lines.append(f"=== Summary ===\n{summary_text}\n")
            lines.append(f"=== Messages ({len(messages)}) ===")
            for m in messages:
                ts = (
                    time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(m["timestamp"]))
                    if m["timestamp"]
                    else "?"
                )
                role = m["role"].upper()
                uid = f" ({m['user_id']})" if m.get("user_id") else ""
                lines.append(f"\n[{ts}] {role}{uid}:\n{m['content']}")
            body = "\n".join(lines)
            return web.Response(
                text=body,
                content_type="text/plain",
                headers={"Content-Disposition": f'attachment; filename="session-{safe_cid}.txt"'},
            )
        # Default: JSON
        export = {
            "channel_id": cid,
            "messages": messages,
            "summary": session.summary,
            "summary_segments": list(session.summary_segments),
            "posts": [
                {"content": p.content, "timestamp": p.timestamp}
                for p in getattr(session, "posts", [])
            ],
            "created_at": session.created_at,
            "last_active": session.last_active,
            "exported_at": time.time(),
        }
        return web.json_response(
            export,
            headers={"Content-Disposition": f'attachment; filename="session-{safe_cid}.json"'},
        )

    @routes.delete("/api/sessions/{channel_id}")
    async def delete_session(request: web.Request) -> web.Response:
        cid = request.match_info["channel_id"]
        denied = _check_session_access(request, cid)
        if denied:
            return denied
        if not bot.sessions.exists(cid):
            return web.json_response({"error": "session not found"}, status=404)
        bot.sessions.reset(cid)
        return web.json_response({"status": "cleared"})

    @routes.post("/api/sessions/clear-bulk")
    async def clear_bulk_sessions(request: web.Request) -> web.Response:
        denied = _require_admin(request)
        if denied:
            return denied
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        channel_ids = data.get("channel_ids", [])
        if not isinstance(channel_ids, list) or not channel_ids:
            return web.json_response(
                {"error": "channel_ids must be a non-empty list"}, status=400
            )
        cleared = bot.sessions.reset_many(channel_ids)
        return web.json_response({"status": "cleared", "count": cleared})


def register_trajectories(routes: web.RouteTableDef, bot) -> None:
    """Trajectories (verbatim from the monolith)."""
    _require_admin = admin_gate(bot)

    # ------------------------------------------------------------------
    # Trajectories
    # ------------------------------------------------------------------

    @routes.get("/api/trajectories")
    async def list_trajectory_files(_request: web.Request) -> web.Response:
        saver = getattr(bot, "trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "trajectory saving not available"}, status=503)
        files = await saver.list_files()
        return web.json_response({"files": files, "count": saver.count})

    @routes.get("/api/trajectories/{filename}")
    async def get_trajectory_file(request: web.Request) -> web.Response:
        saver = getattr(bot, "trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "trajectory saving not available"}, status=503)
        filename = request.match_info["filename"]
        if (
            not filename.endswith(".jsonl")
            or "/" in filename
            or "\\" in filename
            or ".." in filename
        ):
            return web.json_response({"error": "invalid filename"}, status=400)
        safe_path = (saver.directory / filename).resolve()
        if not safe_path.is_relative_to(saver.directory.resolve()):
            return web.json_response({"error": "invalid filename"}, status=400)
        limit = _safe_int_param(request, "limit", 100, hi=500)
        filters: dict = {
            key: request.query[key] for key in ("channel_id", "user_id", "tool_name")
            if request.query.get(key)
        }
        if request.query.get("errors_only", "").lower() in ("1", "true"):
            filters["errors_only"] = True
        entries = await saver.read_file(filename, limit=limit, **filters)
        return web.json_response({"entries": entries, "count": len(entries)})

    @routes.get("/api/trajectories/message/{message_id}")
    async def get_trajectory_by_message(request: web.Request) -> web.Response:
        saver = getattr(bot, "trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "trajectory saving not available"}, status=503)
        message_id = request.match_info["message_id"]
        entry = await saver.find_by_message_id(message_id)
        if entry is None:
            return web.json_response({"error": "trajectory not found"}, status=404)
        return web.json_response({"entry": entry})

    @routes.get("/api/trajectories/search/query")
    async def search_trajectories(request: web.Request) -> web.Response:
        saver = getattr(bot, "trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "trajectory saving not available"}, status=503)
        channel_id = request.query.get("channel_id")
        user_id = request.query.get("user_id")
        tool_name = request.query.get("tool_name")
        errors_only = request.query.get("errors_only", "").lower() in ("1", "true")
        limit = _safe_int_param(request, "limit", 50, hi=500)
        results = await saver.search(
            channel_id=channel_id,
            user_id=user_id,
            tool_name=tool_name,
            errors_only=errors_only,
            limit=limit,
        )
        return web.json_response({"results": results, "count": len(results)})




def register_agent_trajectories(routes: web.RouteTableDef, bot) -> None:
    """Agent trajectories (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Agent trajectories
    # ------------------------------------------------------------------

    @routes.get("/api/agent-trajectories")
    async def list_agent_trajectory_files(_request: web.Request) -> web.Response:
        saver = getattr(bot, "agent_trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "agent trajectory saving not available"}, status=503)
        files = await saver.list_files()
        return web.json_response({"files": files, "count": saver.count})

    @routes.get("/api/agent-trajectories/agent/{agent_id}")
    async def get_agent_trajectory(request: web.Request) -> web.Response:
        saver = getattr(bot, "agent_trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "agent trajectory saving not available"}, status=503)
        agent_id = request.match_info["agent_id"]
        entry = await saver.find_by_agent_id(agent_id)
        if entry is None:
            return web.json_response({"error": "agent trajectory not found"}, status=404)
        return web.json_response({"entry": entry})

    @routes.get("/api/agent-trajectories/search/query")
    async def search_agent_trajectories(request: web.Request) -> web.Response:
        saver = getattr(bot, "agent_trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "agent trajectory saving not available"}, status=503)
        channel_id = request.query.get("channel_id")
        requester_id = request.query.get("requester_id")
        tool_name = request.query.get("tool_name")
        state = request.query.get("state")
        limit = _safe_int_param(request, "limit", 50, hi=500)
        results = await saver.search(
            channel_id=channel_id,
            requester_id=requester_id,
            tool_name=tool_name,
            state=state,
            limit=limit,
        )
        return web.json_response({"results": results, "count": len(results)})

    @routes.get("/api/agent-trajectories/{filename}")
    async def get_agent_trajectory_file(request: web.Request) -> web.Response:
        saver = getattr(bot, "agent_trajectory_saver", None)
        if saver is None:
            return web.json_response({"error": "agent trajectory saving not available"}, status=503)
        filename = request.match_info["filename"]
        if (
            not filename.endswith(".jsonl")
            or "/" in filename
            or "\\" in filename
            or ".." in filename
        ):
            return web.json_response({"error": "invalid filename"}, status=400)
        safe_path = (saver.directory / filename).resolve()
        if not safe_path.is_relative_to(saver.directory.resolve()):
            return web.json_response({"error": "invalid filename"}, status=400)
        limit = _safe_int_param(request, "limit", 100, hi=500)
        entries = await saver.read_file(filename, limit=limit)
        return web.json_response({"entries": entries, "count": len(entries)})
