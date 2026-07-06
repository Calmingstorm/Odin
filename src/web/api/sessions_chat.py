"""Chat, sessions and trajectory route registrars (RFC-003 P4 — carved verbatim from api/__init__).

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

import time
import uuid

from aiohttp import web

from ...odin_log import get_logger
from ..api_common import (
    _SESSION_ID_RE,
    _safe_filename,
    _safe_int_param,
    _scoped_chat_channel,
    admin_gate,
)
from ..chat import MAX_CHAT_CONTENT_LEN

log = get_logger("web.api")


async def _pkg_process_web_chat(*args, **kwargs):
    """Resolve ``process_web_chat`` through the package attribute at call
    time, so the historical patch seam —
    ``patch("src.web.api.process_web_chat", ...)`` — keeps governing the
    real handlers after the carve (RFC-003 R1 import-surface promise).
    """
    from . import process_web_chat as pwc

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
        if not content:
            return web.json_response({"error": "content is required"}, status=400)
        if len(content) > MAX_CHAT_CONTENT_LEN:
            return web.json_response(
                {"error": f"content exceeds {MAX_CHAT_CONTENT_LEN} chars"}, status=400
            )

        identity = getattr(request, "_api_identity", None)
        user_id = identity.user_id if identity else "web-user"
        username = identity.username if identity else "WebUser"
        tier = identity.tier if identity else None
        token_tools = identity.allowed_tools if identity and identity.allowed_tools else None
        token_hosts = (
            identity.allowed_hosts
            if identity and isinstance(getattr(identity, "allowed_hosts", None), list)
            else None
        )
        token_default_host = getattr(identity, "default_host", "") if identity else ""

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

        result = await _pkg_process_web_chat(
            bot, content, channel_id,
            user_id=user_id, username=username,
            allowed_tools=token_tools, tier=tier,
            token_allowed_hosts=token_hosts,
            token_default_host=token_default_host,
        )

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
        return web.json_response(resp, status=status)

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
        if not content:
            return web.json_response({"error": "prompt is required"}, status=400)
        if len(content) > MAX_CHAT_CONTENT_LEN:
            return web.json_response(
                {"error": f"prompt exceeds {MAX_CHAT_CONTENT_LEN} chars"}, status=400
            )

        channel_id = f"api-{uuid.uuid4().hex[:12]}"

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

        result = await _pkg_process_web_chat(
            bot, content, channel_id,
            user_id=user_id, username=username,
            allowed_tools=token_tools, tier=tier,
            token_allowed_hosts=token_hosts,
            token_default_host=token_default_host,
            persist_channel_lock=False,  # ephemeral per-request channel — no lock to cache or leak
        )

        bot.sessions.reset(channel_id)

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
            # Determine source type
            source = "web" if cid.startswith(("web-", "web:")) else "discord"
            sessions.append({
                "channel_id": cid,
                "message_count": len(session.messages),
                "estimated_tokens": session.estimated_tokens,
                "last_active": session.last_active,
                "created_at": session.created_at,
                "has_summary": bool(session.summary),
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
            # is_admin is only False when identity was truthy (see above).
            channel_id = identity.user_id  # type: ignore[union-attr]
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
        results = await bot.sessions.search_history(
            query, limit=limit, channel_id=channel_id,
            user_id=user_id, after=after, before=before,
        )
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
            }
            for m in session.messages
        ]
        return web.json_response({
            "channel_id": cid,
            "messages": messages,
            "summary": session.summary,
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
            if session.summary:
                lines.append(f"=== Summary ===\n{session.summary}\n")
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
        entries = await saver.read_file(filename, limit=limit)
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
