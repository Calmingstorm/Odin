"""REST API for Odin web management UI.

All endpoints are prefixed with /api/ and require Bearer token auth
(unless api_token is empty in config, which disables auth for dev mode).
"""
from __future__ import annotations

import asyncio
import re
import time
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml
from aiohttp import web
from croniter import croniter

from ..config.schema import Config
from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger
from ..setup_wizard import (
    build_config,
    build_env,
    is_setup_needed,
    validate_token_format,
    write_env_file,
)
from ..tools.registry import get_tool_definitions
from ..version import get_version
from .chat import MAX_CHAT_CONTENT_LEN, process_web_chat

if TYPE_CHECKING:
    from ..discord.client import OdinBot

log = get_logger("web.api")

# Sensitive config fields that should be redacted in API responses
_SENSITIVE_FIELDS = frozenset({
    "token", "api_token", "secret", "ssh_key_path", "credentials_path",
    "api_key", "password",
})


# Input validation limits
_MAX_NAME_LEN = 100
_MAX_CODE_LEN = 50_000
_MAX_CONTENT_LEN = 500_000
_MAX_GOAL_LEN = 2000
_MAX_DESCRIPTION_LEN = 500


def _validate_string(value: str, field: str, max_len: int) -> str | None:
    """Validate a string field. Returns error message or None."""
    if len(value) > max_len:
        return f"{field} exceeds maximum length ({max_len} chars)"
    return None


# Regex: keep only ASCII alphanumeric, hyphen, underscore, period
_SAFE_FILENAME_RE = re.compile(r"[^a-zA-Z0-9_.\-]")


def _safe_filename(name: str, max_len: int = 80) -> str:
    """Sanitize a string for use in Content-Disposition filename."""
    return _SAFE_FILENAME_RE.sub("_", name)[:max_len] or "export"


def _sanitize_error(msg: str) -> str:
    """Scrub secrets from error messages before returning to clients."""
    return scrub_output_secrets(str(msg))


def _safe_int_param(request: web.Request, name: str, default: int, lo: int = 1, hi: int = 500) -> int:
    """Parse an integer query parameter, clamping to [lo, hi]. Falls back to *default*."""
    raw = request.query.get(name)
    if raw is None:
        return min(max(default, lo), hi)
    try:
        return min(max(int(raw), lo), hi)
    except (ValueError, TypeError):
        return min(max(default, lo), hi)


def _contains_blocked_fields(d: dict, blocked: frozenset[str], *, _depth: int = 0) -> bool:
    """Recursively check if any keys in *d* are in *blocked*."""
    if _depth > 10:
        return False
    for key, value in d.items():
        if key in blocked:
            return True
        if isinstance(value, dict) and _contains_blocked_fields(value, blocked, _depth=_depth + 1):
            return True
    return False


def _deep_merge(base: dict, updates: dict, *, _depth: int = 0) -> None:
    """Recursively merge *updates* into *base* in-place."""
    if _depth > 10:
        return
    for key, value in updates.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value, _depth=_depth + 1)
        else:
            base[key] = value


def _redact_config(obj: Any, *, _depth: int = 0) -> Any:
    """Recursively redact sensitive fields from config dicts."""
    if _depth > 10:
        return "..."
    if isinstance(obj, dict):
        return {
            k: "••••••••" if k in _SENSITIVE_FIELDS and isinstance(v, str) and v
            else _redact_config(v, _depth=_depth + 1)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_redact_config(v, _depth=_depth + 1) for v in obj]
    return obj


def _write_config(path: Path, data: dict) -> None:
    """Write config dict to YAML file."""
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False)


def _write_env_file(path: Path, content: str) -> None:
    """Write .env file with restricted permissions.

    Delegates to the shared ``write_env_file`` from ``setup_wizard``.
    """
    write_env_file(path, content)


def create_api_routes(bot: OdinBot) -> web.RouteTableDef:
    """Create all API route handlers bound to the given bot instance."""
    routes = web.RouteTableDef()

    # ------------------------------------------------------------------
    # Auth (login / logout / session check)
    # ------------------------------------------------------------------

    @routes.post("/api/auth/login")
    async def auth_login(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        token = (data.get("token") or "").strip()
        if not token:
            return web.json_response({"error": "token is required"}, status=400)

        api_token = bot.config.web.api_token
        if not api_token:
            # No auth configured — dev mode, issue session anyway
            sm = request.app.get("session_manager")
            if sm:
                sid, timeout = sm.create()
                return web.json_response({
                    "session_id": sid,
                    "timeout_seconds": timeout,
                })
            return web.json_response({"error": "no session manager"}, status=500)

        import hmac as _hmac
        if not _hmac.compare_digest(token, api_token):
            return web.json_response({"error": "invalid token"}, status=401)

        sm = request.app.get("session_manager")
        if not sm:
            return web.json_response({"error": "no session manager"}, status=500)

        sid, timeout = sm.create()
        return web.json_response({
            "session_id": sid,
            "timeout_seconds": timeout,
        })

    @routes.post("/api/auth/logout")
    async def auth_logout(request: web.Request) -> web.Response:
        sm = request.app.get("session_manager")
        if not sm:
            return web.json_response({"status": "ok"})

        # Extract session ID from Authorization header
        auth_header = request.headers.get("Authorization", "")
        bearer_prefix = "Bearer "
        if auth_header.startswith(bearer_prefix):
            sid = auth_header[len(bearer_prefix):]
            sm.destroy(sid)

        return web.json_response({"status": "logged_out"})

    @routes.get("/api/auth/session")
    async def auth_session(request: web.Request) -> web.Response:
        sm = request.app.get("session_manager")
        timeout = sm.timeout_seconds if sm else 0
        return web.json_response({
            "authenticated": True,
            "timeout_seconds": timeout,
            "active_sessions": sm.active_count if sm else 0,
        })

    # ------------------------------------------------------------------
    # Setup wizard (first-boot, no auth required)
    # ------------------------------------------------------------------

    @routes.get("/api/setup/status")
    async def setup_status(_request: web.Request) -> web.Response:
        """Check whether first-boot setup is needed."""
        config_path = Path("config.yml")
        env_path = Path(".env")
        needed = is_setup_needed(config_path, env_path)
        return web.json_response({"needed": needed})

    @routes.post("/api/setup/complete")
    async def setup_complete(request: web.Request) -> web.Response:
        """Receive wizard data, write config files, signal restart."""
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        # Validate required fields
        discord_token = (data.get("discord_token") or "").strip()
        if not discord_token:
            return web.json_response(
                {"error": "discord_token is required"}, status=400
            )
        if not validate_token_format(discord_token):
            return web.json_response(
                {"error": "discord_token format is invalid"}, status=400
            )

        # Extract optional fields
        hosts: dict[str, dict[str, str]] = {}
        raw_hosts = data.get("hosts")
        if isinstance(raw_hosts, dict):
            for name, info in raw_hosts.items():
                if isinstance(info, dict) and info.get("address"):
                    hosts[str(name)] = {
                        "address": str(info["address"]),
                        "ssh_user": str(info.get("ssh_user", "root")),
                    }

        features: dict[str, bool] = {}
        raw_features = data.get("features")
        if isinstance(raw_features, dict):
            for key in ("browser", "voice", "comfyui"):
                if key in raw_features:
                    features[key] = bool(raw_features[key])

        web_api_token = str(data.get("web_api_token", "")).strip()
        claude_code_host = str(data.get("claude_code_host", "")).strip()
        timezone = str(data.get("timezone", "UTC")).strip() or "UTC"

        # Build config and env content
        cfg = build_config(
            timezone=timezone,
            hosts=hosts,
            features=features,
            web_api_token=web_api_token,
            claude_code_host=claude_code_host,
        )
        env_content = build_env(discord_token)

        # Write files
        config_path = Path("config.yml")
        env_path = Path(".env")
        try:
            await asyncio.to_thread(_write_config, config_path, cfg)
            await asyncio.to_thread(_write_env_file, env_path, env_content)
        except Exception as e:
            log.error("Setup wizard failed to write config: %s", e)
            return web.json_response(
                {"error": f"Failed to write config: {_sanitize_error(e)}"},
                status=500,
            )

        log.info("Setup wizard completed — config files written")

        # Schedule a delayed process exit to allow the HTTP response to be sent.
        # Under systemd (Restart=on-failure) or Docker (restart: unless-stopped),
        # the process will be restarted automatically with the new config.
        import os as _os
        import signal as _signal
        loop = asyncio.get_event_loop()
        loop.call_later(2.0, _os.kill, _os.getpid(), _signal.SIGTERM)

        return web.json_response({
            "status": "ok",
            "message": "Configuration saved. Odin is restarting...",
            "restart_scheduled": True,
        })

    # ------------------------------------------------------------------
    # Status & info
    # ------------------------------------------------------------------

    @routes.get("/api/status")
    async def get_status(_request: web.Request) -> web.Response:
        guilds = [
            {"id": str(g.id), "name": g.name, "member_count": g.member_count or 0}
            for g in bot.guilds
        ]
        user_count = sum(g.member_count or 0 for g in bot.guilds)
        tools = bot._merged_tool_definitions()
        uptime = time.monotonic() - bot._start_time if hasattr(bot, "_start_time") else 0

        # Agent counts
        try:
            agent_agents = bot.agent_manager._agents
            if not isinstance(agent_agents, dict):
                raise AttributeError
            agent_count = len(agent_agents)
            agent_running = sum(
                1 for a in agent_agents.values() if a.status == "running"
            )
        except (AttributeError, TypeError):
            agent_count = 0
            agent_running = 0

        # Process counts
        try:
            proc_procs = bot.tool_executor._process_registry._processes
            if not isinstance(proc_procs, dict):
                raise AttributeError
            process_count = len(proc_procs)
            process_running = sum(
                1 for p in proc_procs.values() if p.status == "running"
            )
        except (AttributeError, TypeError):
            process_count = 0
            process_running = 0

        # Monitoring status
        _default_mon = {
            "enabled": False, "checks": 0, "running": 0, "active_alerts": 0,
        }
        try:
            watcher = bot.infra_watcher
            if watcher is None:
                raise AttributeError
            result = watcher.get_status()
            monitoring = result if isinstance(result, dict) else _default_mon
        except (AttributeError, TypeError):
            monitoring = _default_mon

        return web.json_response({
            "version": get_version(),
            "status": "online" if bot.is_ready() else "starting",
            "uptime_seconds": round(uptime, 1),
            "guilds": guilds,
            "guild_count": len(guilds),
            "user_count": user_count,
            "tool_count": len(tools),
            "skill_count": len(bot.skill_manager.list_skills()),
            "session_count": len(bot.sessions._sessions),
            "loop_count": bot.loop_manager.active_count,
            "schedule_count": len(bot.scheduler.list_all()),
            "agent_count": agent_count,
            "agent_running": agent_running,
            "process_count": process_count,
            "process_running": process_running,
            "monitoring": monitoring,
        })

    @routes.get("/api/health/components")
    async def get_health_components(_request: web.Request) -> web.Response:
        from ..health.checker import check_all
        return web.json_response(check_all(bot))

    @routes.get("/api/resource-usage")
    async def get_resource_usage(_request: web.Request) -> web.Response:
        from ..monitoring.resource_usage import collect_all
        return web.json_response(collect_all(bot))

    @routes.get("/api/tool-streams")
    async def get_tool_streams(_request: web.Request) -> web.Response:
        executor = getattr(bot, "tool_executor", None)
        streamer = getattr(executor, "output_streamer", None) if executor else None
        if streamer is None:
            return web.json_response({"enabled": False, "streams": []})
        return web.json_response({
            "enabled": True,
            "enabled_tools": sorted(streamer.enabled_tools),
            "active_streams": streamer.get_active_streams(),
        })

    @routes.get("/api/config")
    async def get_config(_request: web.Request) -> web.Response:
        raw = bot.config.model_dump()
        return web.json_response(_redact_config(raw))

    @routes.put("/api/config")
    async def update_config(request: web.Request) -> web.Response:
        try:
            updates = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        if not isinstance(updates, dict):
            return web.json_response({"error": "expected JSON object"}, status=400)

        # Block sensitive field updates
        if _contains_blocked_fields(updates, _SENSITIVE_FIELDS):
            return web.json_response(
                {"error": "Cannot update sensitive fields via API"}, status=403
            )

        # Snapshot before state for diff
        before_config = _redact_config(bot.config.model_dump())

        # Deep merge updates into current config
        current = bot.config.model_dump()
        _deep_merge(current, updates)

        # Validate by reconstructing the config model
        try:
            new_config = Config(**current)
        except Exception as e:
            return web.json_response({"error": f"Invalid config: {e}"}, status=400)

        # Apply to bot
        bot.config = new_config

        # Write to disk
        config_path = Path("config.yml")
        if config_path.exists():
            try:
                await asyncio.to_thread(_write_config, config_path, current)
            except Exception:
                log.warning("Config applied in memory but failed to persist to %s", config_path, exc_info=True)

        # Compute config diff and record in audit log
        after_config = _redact_config(new_config.model_dump())
        try:
            from ..audit.diff_tracker import compute_dict_diff
            config_diff = compute_dict_diff(before_config, after_config, label="config.yml")
        except Exception:
            config_diff = None

        # Store diff on request for the audit middleware
        request["_config_diff"] = config_diff

        return web.json_response(after_config)

    # ------------------------------------------------------------------
    # Quick actions
    # ------------------------------------------------------------------

    @routes.post("/api/sessions/clear-all")
    async def clear_all_sessions(_request: web.Request) -> web.Response:
        channel_ids = list(bot.sessions._sessions.keys())
        for cid in channel_ids:
            bot.sessions.reset(cid)
        return web.json_response({"status": "cleared", "count": len(channel_ids)})

    @routes.post("/api/reload")
    async def reload_config(_request: web.Request) -> web.Response:
        bot.context_loader.reload()
        bot._invalidate_prompt_caches()
        bot._system_prompt = bot._build_system_prompt()
        return web.json_response({"status": "reloaded"})

    @routes.post("/api/loops/stop-all")
    async def stop_all_loops(_request: web.Request) -> web.Response:
        result = bot.loop_manager.stop_loop("all")
        return web.json_response({"result": result})

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

        channel_id = data.get("channel_id") or "web-default"
        user_id = data.get("user_id") or "web-user"
        username = data.get("username") or "WebUser"

        result = await process_web_chat(
            bot, content, channel_id,
            user_id=user_id, username=username,
        )
        status = 200 if not result["is_error"] else 502
        resp = {
            "response": result["response"],
            "tools_used": result["tools_used"],
            "is_error": result["is_error"],
        }
        files = result.get("files", [])
        if files:
            resp["files"] = files
        return web.json_response(resp, status=status)

    # ------------------------------------------------------------------
    # Sessions
    # ------------------------------------------------------------------

    @routes.get("/api/sessions")
    async def list_sessions(_request: web.Request) -> web.Response:
        sessions = []
        for cid, session in bot.sessions._sessions.items():
            # Build preview from last 2 messages
            preview = []
            for m in session.messages[-2:]:
                text = m.content or ""
                if len(text) > 120:
                    text = text[:120] + "..."
                preview.append({"role": m.role, "content": text})
            # Determine source type
            source = "web" if cid.startswith("web-") else "discord"
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

    @routes.get("/api/sessions/{channel_id}")
    async def get_session(request: web.Request) -> web.Response:
        cid = request.match_info["channel_id"]
        session = bot.sessions._sessions.get(cid)
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
        session = bot.sessions._sessions.get(cid)
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
                ts = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(m["timestamp"])) if m["timestamp"] else "?"
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
        if cid not in bot.sessions._sessions:
            return web.json_response({"error": "session not found"}, status=404)
        bot.sessions.reset(cid)
        return web.json_response({"status": "cleared"})

    @routes.post("/api/sessions/clear-bulk")
    async def clear_bulk_sessions(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        channel_ids = data.get("channel_ids", [])
        if not isinstance(channel_ids, list) or not channel_ids:
            return web.json_response(
                {"error": "channel_ids must be a non-empty list"}, status=400
            )
        cleared = 0
        for cid in channel_ids:
            if cid in bot.sessions._sessions:
                bot.sessions.reset(cid)
                cleared += 1
        return web.json_response({"status": "cleared", "count": cleared})

    @routes.get("/api/sessions/token-usage")
    async def session_token_usage(_request: web.Request) -> web.Response:
        usage = bot.sessions.get_session_token_usage()
        return web.json_response(usage)

    @routes.get("/api/sessions/activity")
    async def session_activity(_request: web.Request) -> web.Response:
        activity = bot.sessions.get_activity_metrics()
        return web.json_response(activity)

    @routes.get("/api/sessions/search")
    async def search_sessions(request: web.Request) -> web.Response:
        query = request.query.get("q", "").strip()
        if not query:
            return web.json_response({"error": "q parameter required"}, status=400)
        limit = _safe_int_param(request, "limit", 20, hi=50)
        channel_id = request.query.get("channel_id") or None
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

    # ------------------------------------------------------------------
    # Tools
    # ------------------------------------------------------------------

    @routes.get("/api/tools")
    async def list_tools(_request: web.Request) -> web.Response:
        all_tools = get_tool_definitions()
        tools_config = bot.config.tools
        result = [
            {
                "name": tool["name"],
                "description": tool["description"],
                "timeout": tools_config.get_tool_timeout(tool["name"]),
            }
            for tool in all_tools
        ]
        return web.json_response(result)

    @routes.get("/api/tools/stats")
    async def tool_stats(_request: web.Request) -> web.Response:
        counts = await bot.audit.count_by_tool()
        return web.json_response(counts)

    @routes.get("/api/tools/timeouts")
    async def get_tool_timeouts(_request: web.Request) -> web.Response:
        tools_config = bot.config.tools
        return web.json_response({
            "default_timeout": tools_config.command_timeout_seconds,
            "overrides": tools_config.tool_timeouts,
        })

    @routes.put("/api/tools/timeouts")
    async def set_tool_timeouts(request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "expected JSON object"}, status=400)
        overrides = body.get("overrides")
        if overrides is not None:
            if not isinstance(overrides, dict):
                return web.json_response({"error": "overrides must be a dict"}, status=400)
            for k, v in overrides.items():
                if not isinstance(k, str) or not isinstance(v, (int, float)) or v <= 0:
                    return web.json_response(
                        {"error": f"invalid timeout for '{k}': must be a positive number"}, status=400,
                    )
            bot.config.tools.tool_timeouts = {k: int(v) for k, v in overrides.items()}
        default = body.get("default_timeout")
        if default is not None:
            if not isinstance(default, (int, float)) or default <= 0:
                return web.json_response({"error": "default_timeout must be a positive number"}, status=400)
            bot.config.tools.command_timeout_seconds = int(default)
        return web.json_response({
            "default_timeout": bot.config.tools.command_timeout_seconds,
            "overrides": bot.config.tools.tool_timeouts,
        })

    # ------------------------------------------------------------------
    # Bulkhead isolation status
    # ------------------------------------------------------------------

    @routes.get("/api/tools/bulkheads")
    async def get_bulkheads(_request: web.Request) -> web.Response:
        executor = getattr(bot, "executor", None)
        if executor is None or not hasattr(executor, "bulkheads"):
            return web.json_response({"error": "bulkheads not available"}, status=503)
        return web.json_response(executor.bulkheads.get_all_metrics())

    # ------------------------------------------------------------------
    # Connection pool status
    # ------------------------------------------------------------------

    @routes.get("/api/pools/ssh")
    async def get_ssh_pool(_request: web.Request) -> web.Response:
        executor = getattr(bot, "executor", None)
        if executor is None or not hasattr(executor, "ssh_pool") or executor.ssh_pool is None:
            return web.json_response({"error": "SSH pool not available"}, status=503)
        return web.json_response(executor.ssh_pool.get_metrics())

    @routes.get("/api/pools/http")
    async def get_http_pool(_request: web.Request) -> web.Response:
        codex = getattr(bot, "codex", None)
        if codex is None or not hasattr(codex, "get_pool_metrics"):
            return web.json_response({"error": "HTTP pool not available"}, status=503)
        return web.json_response(codex.get_pool_metrics())

    @routes.post("/api/pools/ssh/close")
    async def close_ssh_pool_host(request: web.Request) -> web.Response:
        executor = getattr(bot, "executor", None)
        if executor is None or not hasattr(executor, "ssh_pool") or executor.ssh_pool is None:
            return web.json_response({"error": "SSH pool not available"}, status=503)
        try:
            data = await request.json()
        except Exception:
            data = {}
        host = data.get("host")
        if host:
            ssh_user = data.get("ssh_user", "root")
            closed = await executor.ssh_pool.close_host(host, ssh_user)
            return web.json_response({"closed": closed, "host": host})
        count = await executor.ssh_pool.close_all()
        return web.json_response({"closed_count": count})

    # ------------------------------------------------------------------
    # Usage / cost tracking
    # ------------------------------------------------------------------

    @routes.get("/api/usage")
    async def get_usage(_request: web.Request) -> web.Response:
        tracker = getattr(bot, "cost_tracker", None)
        if tracker is None:
            return web.json_response({"error": "cost tracking not available"}, status=503)
        return web.json_response(tracker.get_summary())

    @routes.get("/api/usage/totals")
    async def get_usage_totals(_request: web.Request) -> web.Response:
        tracker = getattr(bot, "cost_tracker", None)
        if tracker is None:
            return web.json_response({"error": "cost tracking not available"}, status=503)
        return web.json_response(tracker.get_totals())

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
        if not filename.endswith(".jsonl") or "/" in filename or "\\" in filename:
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

    # ------------------------------------------------------------------
    # Skills
    # ------------------------------------------------------------------

    @routes.get("/api/skills")
    async def list_skills(_request: web.Request) -> web.Response:
        skills = bot.skill_manager.list_skills()
        # Get usage counts from audit log
        counts = await bot.audit.count_by_tool()
        # Add source code and execution stats for each skill
        for skill_info in skills:
            name = skill_info["name"]
            skill_info["code"] = None
            loaded = bot.skill_manager._skills.get(name)
            if loaded and loaded.file_path.exists():
                try:
                    skill_info["code"] = loaded.file_path.read_text()
                except OSError:
                    pass
            skill_info["execution_count"] = counts.get(name, 0)
        return web.json_response(skills)

    @routes.post("/api/skills")
    async def create_skill(request: web.Request) -> web.Response:
        data = await request.json()
        name = data.get("name", "").strip()
        code = data.get("code", "").strip()
        if not name or not code:
            return web.json_response(
                {"error": "name and code are required"}, status=400
            )
        for err in (
            _validate_string(name, "name", _MAX_NAME_LEN),
            _validate_string(code, "code", _MAX_CODE_LEN),
        ):
            if err:
                return web.json_response({"error": err}, status=400)
        result = bot.skill_manager.create_skill(name, code)
        bot._cached_merged_tools = None
        bot._cached_skills_text = None
        is_error = "error" in result.lower() or "failed" in result.lower()
        return web.json_response(
            {"result": result},
            status=400 if is_error else 201,
        )

    @routes.put("/api/skills/{name}")
    async def update_skill(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        data = await request.json()
        code = data.get("code", "").strip()
        if not code:
            return web.json_response({"error": "code is required"}, status=400)
        err = _validate_string(code, "code", _MAX_CODE_LEN)
        if err:
            return web.json_response({"error": err}, status=400)
        result = bot.skill_manager.edit_skill(name, code)
        bot._cached_merged_tools = None
        bot._cached_skills_text = None
        is_error = "error" in result.lower() or "failed" in result.lower()
        return web.json_response(
            {"result": result},
            status=400 if is_error else 200,
        )

    @routes.post("/api/skills/{name}/test")
    async def test_skill(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        if not bot.skill_manager.has_skill(name):
            return web.json_response({"error": "skill not found"}, status=404)
        try:
            result = await bot.skill_manager.execute(name, {})
            is_error = result.startswith("Skill error:") or result.startswith("Skill '")
            return web.json_response({
                "result": result,
                "is_error": is_error,
            })
        except Exception as e:
            return web.json_response({"result": _sanitize_error(e), "is_error": True}, status=500)

    @routes.delete("/api/skills/{name}")
    async def delete_skill(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        result = bot.skill_manager.delete_skill(name)
        bot._cached_merged_tools = None
        bot._cached_skills_text = None
        is_error = "error" in result.lower() or "not found" in result.lower()
        return web.json_response(
            {"result": result},
            status=404 if is_error else 200,
        )

    @routes.get("/api/skills/{name}")
    async def get_skill_detail(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        info = bot.skill_manager.get_skill_info(name)
        if not info:
            return web.json_response({"error": "skill not found"}, status=404)
        return web.json_response(info)

    @routes.post("/api/skills/validate")
    async def validate_skill(request: web.Request) -> web.Response:
        data = await request.json()
        code = data.get("code", "").strip()
        if not code:
            return web.json_response({"error": "code is required"}, status=400)
        err = _validate_string(code, "code", _MAX_CODE_LEN)
        if err:
            return web.json_response({"error": err}, status=400)
        report = bot.skill_manager.validate_skill_code(code)
        return web.json_response(report)

    @routes.post("/api/skills/{name}/enable")
    async def enable_skill(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        result = bot.skill_manager.enable_skill(name)
        if "not found" in result.lower():
            return web.json_response({"result": result}, status=404)
        bot._cached_merged_tools = None
        bot._cached_skills_text = None
        return web.json_response({"result": result})

    @routes.post("/api/skills/{name}/disable")
    async def disable_skill_api(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        result = bot.skill_manager.disable_skill(name)
        if "not found" in result.lower():
            return web.json_response({"result": result}, status=404)
        bot._cached_merged_tools = None
        bot._cached_skills_text = None
        return web.json_response({"result": result})

    @routes.get("/api/skills/{name}/config")
    async def get_skill_config(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        if not bot.skill_manager.has_skill(name):
            return web.json_response({"error": "skill not found"}, status=404)
        info = bot.skill_manager.get_skill_info(name)
        return web.json_response({
            "config": bot.skill_manager.get_skill_config(name),
            "schema": info["metadata"]["config_schema"] if info else {},
        })

    @routes.put("/api/skills/{name}/config")
    async def set_skill_config(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        if not bot.skill_manager.has_skill(name):
            return web.json_response({"error": "skill not found"}, status=404)
        data = await request.json()
        values = data.get("config", {})
        if not isinstance(values, dict):
            return web.json_response({"error": "config must be a dict"}, status=400)
        errors = bot.skill_manager.set_skill_config(name, values)
        if errors:
            return web.json_response({"errors": errors}, status=400)
        return web.json_response({"config": bot.skill_manager.get_skill_config(name)})

    # ------------------------------------------------------------------
    # MCP servers
    # ------------------------------------------------------------------

    @routes.get("/api/mcp/servers")
    async def list_mcp_servers(_request: web.Request) -> web.Response:
        mgr = getattr(bot, "mcp_manager", None)
        if mgr is None:
            return web.json_response({"error": "MCP not enabled"}, status=503)
        return web.json_response({"servers": mgr.get_status()})

    @routes.get("/api/mcp/servers/{name}/tools")
    async def list_mcp_server_tools(request: web.Request) -> web.Response:
        mgr = getattr(bot, "mcp_manager", None)
        if mgr is None:
            return web.json_response({"error": "MCP not enabled"}, status=503)
        name = request.match_info["name"]
        conn = mgr.get_server(name)
        if conn is None:
            return web.json_response({"error": "server not found"}, status=404)
        from ..tools.mcp_client import make_tool_name
        tools = [
            {
                "name": make_tool_name(name, t["name"]),
                "original_name": t["name"],
                "description": t.get("description", ""),
            }
            for t in conn.tools
        ]
        return web.json_response({"server": name, "tools": tools})

    @routes.post("/api/mcp/servers")
    async def add_mcp_server(request: web.Request) -> web.Response:
        mgr = getattr(bot, "mcp_manager", None)
        if mgr is None:
            return web.json_response({"error": "MCP not enabled"}, status=503)
        data = await request.json()
        name = data.get("name", "").strip()
        transport = data.get("transport", "stdio")
        if not name:
            return web.json_response({"error": "name is required"}, status=400)
        try:
            info = await mgr.add_server(
                name, transport,
                command=data.get("command", ""),
                args=data.get("args", []),
                url=data.get("url", ""),
                headers=data.get("headers", {}),
                env=data.get("env", {}),
                timeout=data.get("timeout"),
            )
            bot._cached_merged_tools = None
            return web.json_response(info, status=201)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)

    @routes.delete("/api/mcp/servers/{name}")
    async def remove_mcp_server(request: web.Request) -> web.Response:
        mgr = getattr(bot, "mcp_manager", None)
        if mgr is None:
            return web.json_response({"error": "MCP not enabled"}, status=503)
        name = request.match_info["name"]
        try:
            await mgr.remove_server(name)
            bot._cached_merged_tools = None
            return web.json_response({"status": "removed", "server": name})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=404)

    # ------------------------------------------------------------------
    # Slack notifications
    # ------------------------------------------------------------------

    @routes.get("/api/slack/status")
    async def slack_status(_request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        notifier = getattr(hs, "slack_notifier", None) if hs else None
        if notifier is None:
            return web.json_response({"enabled": False})
        return web.json_response({"enabled": True, **notifier.get_status()})

    @routes.post("/api/slack/test")
    async def slack_test(request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        notifier = getattr(hs, "slack_notifier", None) if hs else None
        if notifier is None:
            return web.json_response({"error": "Slack not enabled"}, status=503)
        try:
            data = await request.json()
        except Exception:
            data = {}
        channel = data.get("channel")
        message = data.get("message", "Test message from Odin")
        ok = await notifier.send(str(message)[:500], channel=channel)
        return web.json_response({"sent": ok})

    @routes.post("/api/slack/send")
    async def slack_send(request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        notifier = getattr(hs, "slack_notifier", None) if hs else None
        if notifier is None:
            return web.json_response({"error": "Slack not enabled"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        text = data.get("text", "")
        if not text:
            return web.json_response({"error": "text is required"}, status=400)
        channel = data.get("channel")
        severity = data.get("severity")
        if severity:
            ok = await notifier.send_formatted(
                title=str(data.get("title", "Odin"))[:150],
                message=str(text)[:3000],
                severity=str(severity),
                source=str(data.get("source", "odin"))[:50],
                channel=channel,
            )
        else:
            ok = await notifier.send(str(text)[:3000], channel=channel)
        return web.json_response({"sent": ok})

    # ------------------------------------------------------------------
    # Issue tracker (Linear / Jira)
    # ------------------------------------------------------------------

    @routes.get("/api/issues/status")
    async def issue_tracker_status(_request: web.Request) -> web.Response:
        client = getattr(bot, "_issue_tracker_client", None)
        if client is None:
            return web.json_response({"enabled": False})
        return web.json_response({"enabled": True, **client.get_status()})

    @routes.post("/api/issues/execute")
    async def issue_tracker_execute(request: web.Request) -> web.Response:
        client = getattr(bot, "_issue_tracker_client", None)
        if client is None:
            return web.json_response({"error": "Issue tracker not enabled"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        action = data.get("action", "")
        if not action:
            return web.json_response({"error": "action is required"}, status=400)
        try:
            from ..notifications.issue_tracker import IssueTrackerError
            result = await client.execute(action, data)
            return web.json_response({"ok": True, "result": result})
        except (ValueError, IssueTrackerError) as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.post("/api/issues/create")
    async def issue_tracker_create(request: web.Request) -> web.Response:
        client = getattr(bot, "_issue_tracker_client", None)
        if client is None:
            return web.json_response({"error": "Issue tracker not enabled"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        title = data.get("title", "")
        if not title:
            return web.json_response({"error": "title is required"}, status=400)
        try:
            from ..notifications.issue_tracker import IssueTrackerError
            result = await client.execute("create_issue", data)
            return web.json_response({"ok": True, "issue": result}, status=201)
        except (ValueError, IssueTrackerError) as exc:
            return web.json_response({"error": str(exc)}, status=400)

    # ------------------------------------------------------------------
    # Grafana alerts
    # ------------------------------------------------------------------

    @routes.get("/api/grafana-alerts/status")
    async def grafana_alerts_status(_request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        handler = getattr(hs, "grafana_handler", None) if hs else None
        if handler is None:
            return web.json_response({"enabled": False})
        return web.json_response({"enabled": True, **handler.get_status()})

    @routes.get("/api/grafana-alerts/history")
    async def grafana_alerts_history(request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        handler = getattr(hs, "grafana_handler", None) if hs else None
        if handler is None:
            return web.json_response({"error": "Grafana alert handler not available"}, status=503)
        limit = _safe_int_param(request, "limit", 50, hi=200)
        history = handler.alert_history[-limit:]
        return web.json_response({"alerts": history, "total": len(handler.alert_history)})

    @routes.get("/api/grafana-alerts/rules")
    async def grafana_alerts_rules(_request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        handler = getattr(hs, "grafana_handler", None) if hs else None
        if handler is None:
            return web.json_response({"error": "Grafana alert handler not available"}, status=503)
        return web.json_response({"rules": handler.get_rules_list()})

    @routes.post("/api/grafana-alerts/rules")
    async def grafana_alerts_add_rule(request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        handler = getattr(hs, "grafana_handler", None) if hs else None
        if handler is None:
            return web.json_response({"error": "Grafana alert handler not available"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        rule_id = data.get("id", "")
        name_pattern = data.get("name_pattern", "")
        if not rule_id or not name_pattern:
            return web.json_response({"error": "id and name_pattern are required"}, status=400)
        try:
            from ..health.grafana_alerts import RemediationRule
            rule = RemediationRule(
                id=rule_id,
                name_pattern=name_pattern,
                label_matchers=data.get("label_matchers", {}),
                severity_filter=data.get("severity_filter", []),
                remediation_goal=data.get("remediation_goal", ""),
                mode=data.get("mode", "notify"),
                interval_seconds=data.get("interval_seconds", 30),
                max_iterations=data.get("max_iterations", 10),
                cooldown_seconds=data.get("cooldown_seconds", 300),
                enabled=data.get("enabled", True),
            )
            handler.add_rule(rule)
            return web.json_response({"ok": True, "rule": rule_id}, status=201)
        except ValueError as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.delete("/api/grafana-alerts/rules/{rule_id}")
    async def grafana_alerts_delete_rule(request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        handler = getattr(hs, "grafana_handler", None) if hs else None
        if handler is None:
            return web.json_response({"error": "Grafana alert handler not available"}, status=503)
        rule_id = request.match_info["rule_id"]
        if handler.remove_rule(rule_id):
            return web.json_response({"ok": True})
        return web.json_response({"error": f"Rule '{rule_id}' not found"}, status=404)

    @routes.get("/api/grafana-alerts/remediations")
    async def grafana_alerts_remediations(_request: web.Request) -> web.Response:
        hs = getattr(bot, "health_server", None)
        handler = getattr(hs, "grafana_handler", None) if hs else None
        if handler is None:
            return web.json_response({"error": "Grafana alert handler not available"}, status=503)
        return web.json_response({"remediations": handler.get_remediations_list()})

    # ------------------------------------------------------------------
    # Knowledge
    # ------------------------------------------------------------------

    @routes.get("/api/knowledge")
    async def list_knowledge(_request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        return web.json_response(await asyncio.to_thread(store.list_sources))

    @routes.post("/api/knowledge")
    async def ingest_knowledge(request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        data = await request.json()
        source = data.get("source", "").strip()
        content = data.get("content", "").strip()
        if not source or not content:
            return web.json_response(
                {"error": "source and content are required"}, status=400
            )
        for err in (
            _validate_string(source, "source", _MAX_NAME_LEN),
            _validate_string(content, "content", _MAX_CONTENT_LEN),
        ):
            if err:
                return web.json_response({"error": err}, status=400)
        chunks = await store.ingest(content, source, embedder=bot._embedder, uploader="web-api")
        return web.json_response({"source": source, "chunks": chunks}, status=201)

    @routes.delete("/api/knowledge/{source}")
    async def delete_knowledge(request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        deleted = await asyncio.to_thread(store.delete_source, source)
        if deleted == 0:
            return web.json_response({"error": "source not found"}, status=404)
        return web.json_response({"status": "deleted", "chunks_removed": deleted})

    @routes.post("/api/knowledge/{source}/reingest")
    async def reingest_knowledge(request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        content = await asyncio.to_thread(store.get_source_content, source)
        if content is None:
            return web.json_response({"error": "source not found"}, status=404)
        chunks = await store.ingest(content, source, embedder=bot._embedder, uploader="web-reingest")
        return web.json_response({"source": source, "chunks": chunks})

    @routes.get("/api/knowledge/search")
    async def search_knowledge(request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        query = request.query.get("q", "").strip()
        if not query:
            return web.json_response({"error": "q parameter required"}, status=400)
        try:
            limit = _safe_int_param(request, "limit", 10, hi=50)
        except ValueError:
            return web.json_response({"error": "limit must be an integer"}, status=400)
        results = await store.search_hybrid(query, embedder=bot._embedder, limit=limit)
        return web.json_response(results)

    @routes.get("/api/knowledge/{source}/chunks")
    async def list_knowledge_chunks(request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        chunks = await asyncio.to_thread(store.get_source_chunks, source)
        if not chunks:
            return web.json_response({"error": "source not found or empty"}, status=404)
        return web.json_response(chunks)

    # Knowledge dedup
    # ------------------------------------------------------------------

    @routes.get("/api/knowledge/duplicates")
    async def list_knowledge_duplicates(_request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        exact = await asyncio.to_thread(store.find_duplicates)
        threshold = 0.5
        try:
            threshold = float(_request.query.get("threshold", "0.5"))
        except ValueError:
            pass
        near = await asyncio.to_thread(store.find_near_duplicates, threshold)
        return web.json_response({"exact": exact, "near": near})

    @routes.post("/api/knowledge/merge")
    async def merge_knowledge(request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        keep = data.get("keep_source", "").strip()
        remove = data.get("remove_source", "").strip()
        if not keep or not remove:
            return web.json_response(
                {"error": "keep_source and remove_source are required"}, status=400
            )
        removed = await asyncio.to_thread(store.merge_sources, keep, remove)
        if removed == 0:
            return web.json_response(
                {"error": "keep_source not found or nothing to merge"}, status=404
            )
        return web.json_response(
            {"status": "merged", "kept": keep, "removed": remove, "chunks_removed": removed}
        )

    # Knowledge versioning
    # ------------------------------------------------------------------

    @routes.get("/api/knowledge/{source}/versions")
    async def list_knowledge_versions(request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        versions = await asyncio.to_thread(store.get_versions, source)
        return web.json_response(versions)

    @routes.get("/api/knowledge/{source}/versions/{version:\\d+}")
    async def get_knowledge_version(request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        version = int(request.match_info["version"])
        ver = await asyncio.to_thread(store.get_version, source, version)
        if not ver:
            return web.json_response({"error": "version not found"}, status=404)
        return web.json_response(ver)

    @routes.post("/api/knowledge/{source}/versions/{version:\\d+}/restore")
    async def restore_knowledge_version(request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        version = int(request.match_info["version"])
        ver = await asyncio.to_thread(store.get_version, source, version)
        if not ver:
            return web.json_response({"error": "version not found"}, status=404)
        if not ver.get("content"):
            return web.json_response(
                {"error": "version has no content snapshot (delete version)"}, status=400
            )
        chunks = await store.restore_version(source, version, embedder=bot._embedder)
        return web.json_response(
            {"status": "restored", "source": source, "version": version, "chunks": chunks}
        )

    @routes.get("/api/knowledge/{source}/versions/{v1:\\d+}/diff/{v2:\\d+}")
    async def diff_knowledge_versions(request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        source = request.match_info["source"]
        v1 = int(request.match_info["v1"])
        v2 = int(request.match_info["v2"])
        diff = await asyncio.to_thread(store.get_version_diff, source, v1, v2)
        if not diff:
            return web.json_response({"error": "one or both versions not found"}, status=404)
        return web.json_response(diff)

    # Knowledge bulk import
    # ------------------------------------------------------------------

    @routes.post("/api/knowledge/import")
    async def import_knowledge(request: web.Request) -> web.Response:
        store = bot._knowledge_store
        if not store or not store.available:
            return web.json_response({"error": "knowledge store not available"}, status=503)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        items = data.get("items")
        if not items or not isinstance(items, list):
            return web.json_response({"error": "items (array) is required"}, status=400)
        from ..knowledge.importer import BulkImporter
        importer = BulkImporter(store, bot._embedder)
        batch = await importer.import_batch(items, uploader="web-api")
        return web.json_response({
            "total": batch.total,
            "succeeded": batch.succeeded,
            "failed": batch.failed,
            "skipped": batch.skipped,
            "results": batch.results,
        })

    # ------------------------------------------------------------------
    # Schedules
    # ------------------------------------------------------------------

    @routes.get("/api/schedules")
    async def list_schedules(_request: web.Request) -> web.Response:
        return web.json_response(bot.scheduler.list_all())

    @routes.post("/api/schedules")
    async def create_schedule(request: web.Request) -> web.Response:
        data = await request.json()
        description = data.get("description", "").strip()
        action = data.get("action", "reminder")
        channel_id = data.get("channel_id", "").strip()
        if not description or not channel_id:
            return web.json_response(
                {"error": "description and channel_id are required"}, status=400
            )
        err = _validate_string(description, "description", _MAX_DESCRIPTION_LEN)
        if err:
            return web.json_response({"error": err}, status=400)
        try:
            schedule = await bot.scheduler.add(
                description=description,
                action=action,
                channel_id=channel_id,
                cron=data.get("cron"),
                run_at=data.get("run_at"),
                message=data.get("message"),
                tool_name=data.get("tool_name"),
                tool_input=data.get("tool_input"),
                steps=data.get("steps"),
                trigger=data.get("trigger"),
                max_retries=data.get("max_retries"),
                retry_backoff_seconds=data.get("retry_backoff_seconds"),
            )
            return web.json_response(schedule, status=201)
        except (ValueError, TypeError) as e:
            return web.json_response({"error": _sanitize_error(e)}, status=400)

    @routes.put("/api/schedules/{schedule_id}")
    async def update_schedule(request: web.Request) -> web.Response:
        sid = request.match_info["schedule_id"]
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        if not isinstance(data, dict) or not data:
            return web.json_response({"error": "request body must be a non-empty object"}, status=400)
        desc = data.get("description")
        if desc is not None:
            err = _validate_string(desc, "description", _MAX_DESCRIPTION_LEN)
            if err:
                return web.json_response({"error": err}, status=400)
        try:
            updated = await bot.scheduler.update(
                sid,
                description=data.get("description"),
                cron=data.get("cron"),
                run_at=data.get("run_at"),
                message=data.get("message"),
                tool_name=data.get("tool_name"),
                tool_input=data.get("tool_input"),
                steps=data.get("steps"),
                trigger=data.get("trigger"),
                channel_id=data.get("channel_id"),
                max_retries=data.get("max_retries"),
                retry_backoff_seconds=data.get("retry_backoff_seconds"),
            )
        except (ValueError, TypeError) as e:
            return web.json_response({"error": _sanitize_error(e)}, status=400)
        if updated is None:
            return web.json_response({"error": "schedule not found"}, status=404)
        return web.json_response(updated)

    @routes.delete("/api/schedules/{schedule_id}")
    async def delete_schedule(request: web.Request) -> web.Response:
        sid = request.match_info["schedule_id"]
        if await bot.scheduler.delete(sid):
            return web.json_response({"status": "deleted"})
        return web.json_response({"error": "schedule not found"}, status=404)

    @routes.post("/api/schedules/{schedule_id}/run")
    async def run_schedule_now(request: web.Request) -> web.Response:
        sid = request.match_info["schedule_id"]
        schedule = None
        for s in bot.scheduler._schedules:
            if s["id"] == sid:
                schedule = s
                break
        if not schedule:
            return web.json_response({"error": "schedule not found"}, status=404)
        if not bot.scheduler._callback:
            return web.json_response(
                {"error": "scheduler callback not configured"}, status=503
            )
        try:
            schedule["last_run"] = datetime.now().isoformat()
            await bot.scheduler._callback(schedule)
            return web.json_response({"status": "triggered", "schedule_id": sid})
        except Exception as e:
            return web.json_response({"error": _sanitize_error(e)}, status=500)

    @routes.post("/api/schedules/{schedule_id}/reset-failures")
    async def reset_schedule_failures(request: web.Request) -> web.Response:
        sid = request.match_info["schedule_id"]
        result = await bot.scheduler.reset_failures(sid)
        if result is None:
            return web.json_response({"error": "schedule not found"}, status=404)
        return web.json_response(result)

    @routes.get("/api/schedules/history")
    async def schedule_history_all(request: web.Request) -> web.Response:
        """Global schedule execution history (most recent first)."""
        limit = _safe_int_param(request, "limit", 50, hi=200)
        status_filter = request.query.get("status")
        entries = await bot.scheduler.history.query(
            status=status_filter, limit=limit,
        )
        return web.json_response(entries)

    @routes.get("/api/schedules/{schedule_id}/history")
    async def schedule_history(request: web.Request) -> web.Response:
        """Execution history for a specific schedule."""
        sid = request.match_info["schedule_id"]
        limit = _safe_int_param(request, "limit", 50, hi=200)
        status_filter = request.query.get("status")
        entries = await bot.scheduler.history.query(
            sid, status=status_filter, limit=limit,
        )
        return web.json_response(entries)

    @routes.get("/api/schedules/{schedule_id}/stats")
    async def schedule_stats(request: web.Request) -> web.Response:
        """Summary stats for a specific schedule."""
        sid = request.match_info["schedule_id"]
        stats = await bot.scheduler.history.stats(sid)
        return web.json_response(stats)

    @routes.post("/api/schedules/validate-cron")
    async def validate_cron(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        expr = data.get("expression", "").strip()
        if not expr:
            return web.json_response({"error": "expression is required"}, status=400)
        if not croniter.is_valid(expr):
            return web.json_response({"valid": False, "error": "Invalid cron expression"})
        # Return next 5 run times
        now = datetime.now()
        cr = croniter(expr, now)
        next_runs = [cr.get_next(datetime).isoformat() for _ in range(5)]
        return web.json_response({"valid": True, "next_runs": next_runs})

    # ------------------------------------------------------------------
    # Autonomous loops
    # ------------------------------------------------------------------

    @routes.get("/api/loops")
    async def list_loops(_request: web.Request) -> web.Response:
        loops = []
        for lid, info in bot.loop_manager._loops.items():
            # Include last 5 iteration history entries
            history = list(info._iteration_history[-5:]) if info._iteration_history else []
            loops.append({
                "id": lid,
                "goal": info.goal,
                "mode": info.mode,
                "interval_seconds": info.interval_seconds,
                "stop_condition": info.stop_condition,
                "max_iterations": info.max_iterations,
                "channel_id": info.channel_id,
                "requester_id": info.requester_id,
                "requester_name": info.requester_name,
                "iteration_count": info.iteration_count,
                "last_trigger": info.last_trigger,
                "created_at": info.created_at,
                "status": info.status,
                "iteration_history": history,
            })
        return web.json_response(loops)

    @routes.post("/api/loops")
    async def start_loop(request: web.Request) -> web.Response:
        data = await request.json()
        goal = data.get("goal", "").strip()
        if not goal:
            return web.json_response({"error": "goal is required"}, status=400)
        err = _validate_string(goal, "goal", _MAX_GOAL_LEN)
        if err:
            return web.json_response({"error": err}, status=400)
        channel_id = data.get("channel_id", "").strip()
        if not channel_id:
            return web.json_response(
                {"error": "channel_id is required"}, status=400
            )
        # Find the Discord channel to post to
        try:
            channel = bot.get_channel(int(channel_id))
        except (ValueError, TypeError):
            channel = None
        if not channel:
            return web.json_response({"error": "channel not found"}, status=404)

        requester_id = data.get("requester_id", "web-api")

        # Build iteration callback (same pattern as _handle_start_loop)
        async def _iteration_cb(
            prompt: str, ch: object, prev_context: str | None,
        ) -> str:
            return await bot._run_loop_iteration(
                prompt, ch, prev_context, requester_id,
            )

        result = bot.loop_manager.start_loop(
            goal=goal,
            channel=channel,
            requester_id=requester_id,
            requester_name=data.get("requester_name", "Web API"),
            iteration_callback=_iteration_cb,
            interval_seconds=data.get("interval_seconds", 60),
            mode=data.get("mode", "notify"),
            stop_condition=data.get("stop_condition"),
            max_iterations=data.get("max_iterations", 50),
        )
        if result.startswith("Error"):
            return web.json_response({"error": result}, status=400)
        return web.json_response({"loop_id": result}, status=201)

    @routes.delete("/api/loops/{loop_id}")
    async def stop_loop(request: web.Request) -> web.Response:
        lid = request.match_info["loop_id"]
        result = bot.loop_manager.stop_loop(lid)
        is_error = "not found" in result.lower() or "not running" in result.lower()
        return web.json_response(
            {"result": result}, status=404 if is_error else 200
        )

    @routes.post("/api/loops/{loop_id}/restart")
    async def restart_loop(request: web.Request) -> web.Response:
        lid = request.match_info["loop_id"]
        info = bot.loop_manager._loops.get(lid)
        if not info:
            return web.json_response({"error": "loop not found"}, status=404)

        # Capture config before stopping
        goal = info.goal
        mode = info.mode
        interval_seconds = info.interval_seconds
        stop_condition = info.stop_condition
        max_iterations = info.max_iterations
        channel_id = info.channel_id
        requester_id = info.requester_id
        requester_name = info.requester_name

        # Stop if running
        if info.status == "running":
            bot.loop_manager.stop_loop(lid)

        # Find the channel
        try:
            channel = bot.get_channel(int(channel_id))
        except (ValueError, TypeError):
            channel = None
        if not channel:
            return web.json_response({"error": "channel not found"}, status=404)

        # Build callback
        async def _iteration_cb(
            prompt: str, ch: object, prev_context: str | None,
        ) -> str:
            return await bot._run_loop_iteration(
                prompt, ch, prev_context, requester_id,
            )

        new_id = bot.loop_manager.start_loop(
            goal=goal,
            channel=channel,
            requester_id=requester_id,
            requester_name=requester_name,
            iteration_callback=_iteration_cb,
            interval_seconds=interval_seconds,
            mode=mode,
            stop_condition=stop_condition,
            max_iterations=max_iterations,
        )
        if new_id.startswith("Error"):
            return web.json_response({"error": new_id}, status=400)
        return web.json_response({"old_id": lid, "new_id": new_id}, status=201)

    # ------------------------------------------------------------------
    # Agents
    # ------------------------------------------------------------------

    @routes.get("/api/agents")
    async def list_agents(_request: web.Request) -> web.Response:
        try:
            agent_agents = bot.agent_manager._agents
            if not isinstance(agent_agents, dict):
                return web.json_response([])
        except (AttributeError, TypeError):
            return web.json_response([])
        agents = []
        now = time.time()
        for aid, info in agent_agents.items():
            runtime = (info.ended_at or now) - info.created_at
            agents.append({
                "id": aid,
                "label": info.label,
                "goal": info.goal[:200],
                "status": info.status,
                "state": info.state.value if hasattr(info, "state") else info.status,
                "channel_id": info.channel_id,
                "requester_name": info.requester_name,
                "iteration_count": info.iteration_count,
                "tools_used": info.tools_used[-10:],
                "runtime_seconds": round(runtime, 1),
                "created_at": info.created_at,
                "result": (info.result[:200] if info.result else ""),
                "error": (info.error[:200] if info.error else ""),
                "recovery_attempts": getattr(info, "recovery_attempts", 0),
                "state_history": info._sm.history_as_dicts() if hasattr(info, "_sm") else [],
                "depth": getattr(info, "depth", 0),
                "parent_id": getattr(info, "parent_id", None),
                "children_ids": list(getattr(info, "children_ids", [])),
            })
        return web.json_response(agents)

    @routes.delete("/api/agents/{agent_id}")
    async def kill_agent(request: web.Request) -> web.Response:
        try:
            if not isinstance(bot.agent_manager._agents, dict):
                raise AttributeError
        except (AttributeError, TypeError):
            return web.json_response({"error": "no agent manager"}, status=404)
        agent_id = request.match_info["agent_id"]
        result = bot.agent_manager.kill(agent_id)
        return web.json_response(
            {"result": result}, status=404 if "not found" in result.lower() else 200
        )

    @routes.get("/api/agents/{agent_id}/children")
    async def get_agent_children(request: web.Request) -> web.Response:
        try:
            mgr = bot.agent_manager
        except (AttributeError, TypeError):
            return web.json_response({"error": "no agent manager"}, status=503)
        agent_id = request.match_info["agent_id"]
        children = mgr.get_children(agent_id)
        return web.json_response(children)

    @routes.get("/api/agents/{agent_id}/lineage")
    async def get_agent_lineage(request: web.Request) -> web.Response:
        try:
            mgr = bot.agent_manager
        except (AttributeError, TypeError):
            return web.json_response({"error": "no agent manager"}, status=503)
        agent_id = request.match_info["agent_id"]
        lineage = mgr.get_lineage(agent_id)
        return web.json_response({"lineage": lineage})

    @routes.get("/api/agents/{agent_id}/descendants")
    async def get_agent_descendants(request: web.Request) -> web.Response:
        try:
            mgr = bot.agent_manager
        except (AttributeError, TypeError):
            return web.json_response({"error": "no agent manager"}, status=503)
        agent_id = request.match_info["agent_id"]
        descendants = mgr.get_descendants(agent_id)
        return web.json_response({"descendants": descendants})

    # ------------------------------------------------------------------
    # Processes
    # ------------------------------------------------------------------

    @routes.get("/api/processes")
    async def list_processes(_request: web.Request) -> web.Response:
        registry = getattr(bot.tool_executor, "_process_registry", None)
        if not registry:
            return web.json_response([])
        processes = []
        now = time.time()
        for pid, info in sorted(registry._processes.items()):
            # Last 3 lines of output for inline preview
            output_lines = list(info.output_buffer)
            preview = [line.rstrip("\n") for line in output_lines[-3:]]
            processes.append({
                "pid": pid,
                "command": info.command,
                "host": info.host,
                "status": info.status,
                "exit_code": info.exit_code,
                "uptime_seconds": round(now - info.start_time, 1),
                "start_time": info.start_time,
                "output_preview": preview,
            })
        return web.json_response(processes)

    @routes.delete("/api/processes/{pid}")
    async def kill_process(request: web.Request) -> web.Response:
        registry = getattr(bot.tool_executor, "_process_registry", None)
        if not registry:
            return web.json_response({"error": "no process registry"}, status=404)
        try:
            pid = int(request.match_info["pid"])
        except ValueError:
            return web.json_response({"error": "invalid PID"}, status=400)
        result = await registry.kill(pid)
        is_error = "no process" in result.lower()
        return web.json_response(
            {"result": result}, status=404 if is_error else 200
        )

    # ------------------------------------------------------------------
    # Audit log
    # ------------------------------------------------------------------

    @routes.get("/api/audit")
    async def search_audit(request: web.Request) -> web.Response:
        tool_name = request.query.get("tool") or None
        user = request.query.get("user") or None
        host = request.query.get("host") or None
        keyword = request.query.get("q") or None
        date = request.query.get("date") or None
        error_only = request.query.get("error_only", "").lower() in ("1", "true", "yes")
        try:
            limit = _safe_int_param(request, "limit", 50, hi=200)
        except ValueError:
            return web.json_response({"error": "limit must be an integer"}, status=400)
        results = await bot.audit.search(
            tool_name=tool_name,
            user=user,
            host=host,
            keyword=keyword,
            date=date,
            limit=limit,
        )
        if error_only:
            results = [r for r in results if r.get("error")]
        return web.json_response(results)

    @routes.get("/api/audit/diffs")
    async def search_audit_diffs(request: web.Request) -> web.Response:
        tool_name = request.query.get("tool") or None
        user = request.query.get("user") or None
        date = request.query.get("date") or None
        try:
            limit = _safe_int_param(request, "limit", 20, hi=100)
        except ValueError:
            return web.json_response({"error": "limit must be an integer"}, status=400)
        results = await bot.audit.search_diffs(
            tool_name=tool_name, user=user, date=date, limit=limit,
        )
        return web.json_response({"entries": results, "count": len(results)})

    @routes.get("/api/audit/verify")
    async def verify_audit_integrity(request: web.Request) -> web.Response:
        result = await bot.audit.verify_integrity()
        status = 200 if result["valid"] else 409
        return web.json_response(result, status=status)

    # ------------------------------------------------------------------
    # Log search (server-side filtered log queries)
    # ------------------------------------------------------------------

    @routes.get("/api/logs/search")
    async def search_logs(request: web.Request) -> web.Response:
        level = request.query.get("level") or None
        if level and level not in ("error", "info", "all"):
            return web.json_response(
                {"error": "level must be 'error', 'info', or 'all'"}, status=400
            )
        start_time = request.query.get("start") or None
        end_time = request.query.get("end") or None
        keyword = request.query.get("q") or None
        tool_name = request.query.get("tool") or None
        try:
            limit = _safe_int_param(request, "limit", 100, hi=500)
        except ValueError:
            return web.json_response(
                {"error": "limit must be an integer"}, status=400
            )
        results = await bot.audit.search_logs(
            level=level,
            start_time=start_time,
            end_time=end_time,
            keyword=keyword,
            tool_name=tool_name,
            limit=limit,
        )
        return web.json_response({"entries": results, "count": len(results)})

    @routes.get("/api/logs/stats")
    async def log_stats(_request: web.Request) -> web.Response:
        stats = await bot.audit.get_log_stats()
        return web.json_response(stats)

    # ------------------------------------------------------------------
    # Memory (persistent notes — global + per-user scopes)
    # ------------------------------------------------------------------

    @routes.get("/api/memory")
    async def list_memory(_request: web.Request) -> web.Response:
        all_mem = await asyncio.to_thread(
            bot.tool_executor._load_all_memory
        )
        result = {}
        for scope, entries in all_mem.items():
            result[scope] = {
                "keys": list(entries.keys()),
                "count": len(entries),
            }
        return web.json_response(result)

    @routes.get("/api/memory/{scope}/{key}")
    async def get_memory(request: web.Request) -> web.Response:
        scope = request.match_info["scope"]
        key = request.match_info["key"]
        all_mem = await asyncio.to_thread(
            bot.tool_executor._load_all_memory
        )
        section = all_mem.get(scope, {})
        if key not in section:
            return web.json_response({"error": "key not found"}, status=404)
        return web.json_response({"scope": scope, "key": key, "value": section[key]})

    @routes.put("/api/memory/{scope}/{key}")
    async def set_memory(request: web.Request) -> web.Response:
        scope = request.match_info["scope"]
        key = request.match_info["key"]
        data = await request.json()
        value = data.get("value")
        if value is None:
            return web.json_response({"error": "value is required"}, status=400)
        all_mem = await asyncio.to_thread(
            bot.tool_executor._load_all_memory
        )
        if scope not in all_mem:
            all_mem[scope] = {}
        all_mem[scope][key] = str(value)
        await asyncio.to_thread(bot.tool_executor._save_all_memory, all_mem)
        return web.json_response({"status": "saved", "scope": scope, "key": key})

    @routes.delete("/api/memory/{scope}/{key}")
    async def delete_memory(request: web.Request) -> web.Response:
        scope = request.match_info["scope"]
        key = request.match_info["key"]
        all_mem = await asyncio.to_thread(
            bot.tool_executor._load_all_memory
        )
        section = all_mem.get(scope, {})
        if key not in section:
            return web.json_response({"error": "key not found"}, status=404)
        del all_mem[scope][key]
        await asyncio.to_thread(bot.tool_executor._save_all_memory, all_mem)
        return web.json_response({"status": "deleted", "scope": scope, "key": key})

    @routes.post("/api/memory/bulk-delete")
    async def bulk_delete_memory(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        entries = data.get("entries", [])
        if not isinstance(entries, list) or not entries:
            return web.json_response(
                {"error": "entries must be a non-empty list of {scope, key}"}, status=400
            )
        all_mem = await asyncio.to_thread(
            bot.tool_executor._load_all_memory
        )
        deleted = 0
        for entry in entries:
            scope = entry.get("scope")
            key = entry.get("key")
            if scope and key and scope in all_mem and key in all_mem[scope]:
                del all_mem[scope][key]
                deleted += 1
        if deleted:
            await asyncio.to_thread(bot.tool_executor._save_all_memory, all_mem)
        return web.json_response({"status": "deleted", "count": deleted})

    # ------------------------------------------------------------------
    # Risk classification (observability)
    # ------------------------------------------------------------------

    @routes.get("/api/risk/stats")
    async def risk_stats(_request: web.Request) -> web.Response:
        executor = getattr(bot, "tool_executor", None)
        if not executor:
            return web.json_response({"error": "executor not available"}, status=503)
        return web.json_response(executor.risk_stats.get_summary())

    @routes.get("/api/risk/recent")
    async def risk_recent(request: web.Request) -> web.Response:
        executor = getattr(bot, "tool_executor", None)
        if not executor:
            return web.json_response({"error": "executor not available"}, status=503)
        try:
            limit = _safe_int_param(request, "limit", 20, hi=100)
        except ValueError:
            return web.json_response({"error": "limit must be an integer"}, status=400)
        return web.json_response({"entries": executor.risk_stats.get_recent(limit)})

    @routes.get("/api/audit/risk")
    async def audit_by_risk(request: web.Request) -> web.Response:
        risk_level = request.query.get("level") or None
        tool_name = request.query.get("tool") or None
        try:
            limit = _safe_int_param(request, "limit", 20, hi=100)
        except ValueError:
            return web.json_response({"error": "limit must be an integer"}, status=400)
        results = await bot.audit.search_by_risk(
            risk_level=risk_level, tool_name=tool_name, limit=limit,
        )
        return web.json_response({"entries": results, "count": len(results)})

    # ------------------------------------------------------------------
    # Permissions / RBAC
    # ------------------------------------------------------------------

    @routes.get("/api/permissions/tiers")
    async def list_tiers(_request: web.Request) -> web.Response:
        pm = getattr(bot, "permission_manager", None)
        if not pm:
            return web.json_response({"error": "permission manager not available"}, status=503)
        from ..permissions.manager import VALID_TIERS, USER_TIER_TOOLS
        config_tiers = dict(pm._config_tiers)
        overrides = dict(pm._overrides)
        return web.json_response({
            "valid_tiers": list(VALID_TIERS),
            "default_tier": pm._default_tier,
            "config_tiers": config_tiers,
            "overrides": overrides,
            "user_tier_tools": sorted(USER_TIER_TOOLS),
        })

    @routes.get("/api/permissions/user/{user_id}")
    async def get_user_tier(request: web.Request) -> web.Response:
        pm = getattr(bot, "permission_manager", None)
        if not pm:
            return web.json_response({"error": "permission manager not available"}, status=503)
        uid = request.match_info["user_id"]
        tier = pm.get_tier(uid)
        allowed = pm.allowed_tool_names(uid)
        return web.json_response({
            "user_id": uid,
            "tier": tier,
            "allowed_tools": sorted(allowed) if allowed is not None else None,
        })

    @routes.put("/api/permissions/user/{user_id}")
    async def set_user_tier(request: web.Request) -> web.Response:
        pm = getattr(bot, "permission_manager", None)
        if not pm:
            return web.json_response({"error": "permission manager not available"}, status=503)
        uid = request.match_info["user_id"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        tier = body.get("tier", "")
        if not tier or not isinstance(tier, str):
            return web.json_response({"error": "tier is required"}, status=400)
        try:
            pm.set_tier(uid, tier)
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)
        return web.json_response({"user_id": uid, "tier": tier, "status": "updated"})

    @routes.delete("/api/permissions/user/{user_id}")
    async def delete_user_tier(request: web.Request) -> web.Response:
        pm = getattr(bot, "permission_manager", None)
        if not pm:
            return web.json_response({"error": "permission manager not available"}, status=503)
        uid = request.match_info["user_id"]
        if uid in pm._overrides:
            del pm._overrides[uid]
            pm._save_overrides()
            return web.json_response({"user_id": uid, "status": "override_removed"})
        return web.json_response({"error": "no override found for user"}, status=404)

    # ------------------------------------------------------------------
    # Recovery stats (observability)
    # ------------------------------------------------------------------

    @routes.get("/api/recovery/stats")
    async def recovery_stats(_request: web.Request) -> web.Response:
        executor = getattr(bot, "tool_executor", None)
        if not executor:
            return web.json_response({"error": "executor not available"}, status=503)
        return web.json_response(executor.recovery_stats.get_summary())

    @routes.get("/api/recovery/recent")
    async def recovery_recent(request: web.Request) -> web.Response:
        executor = getattr(bot, "tool_executor", None)
        if not executor:
            return web.json_response({"error": "executor not available"}, status=503)
        limit = _safe_int_param(request, "limit", 20, hi=100)
        return web.json_response({"entries": executor.recovery_stats.get_recent(limit)})

    # ------------------------------------------------------------------
    # Branch freshness stats (observability)
    # ------------------------------------------------------------------

    @routes.get("/api/freshness/stats")
    async def freshness_stats(_request: web.Request) -> web.Response:
        executor = getattr(bot, "tool_executor", None)
        if not executor:
            return web.json_response({"error": "executor not available"}, status=503)
        return web.json_response(executor.freshness_stats.get_summary())

    @routes.get("/api/freshness/recent")
    async def freshness_recent(request: web.Request) -> web.Response:
        executor = getattr(bot, "tool_executor", None)
        if not executor:
            return web.json_response({"error": "executor not available"}, status=503)
        limit = _safe_int_param(request, "limit", 10, hi=50)
        return web.json_response({"entries": executor.freshness_stats.get_recent(limit)})

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
        if not filename.endswith(".jsonl") or "/" in filename or "\\" in filename:
            return web.json_response({"error": "invalid filename"}, status=400)
        limit = _safe_int_param(request, "limit", 100, hi=500)
        entries = await saver.read_file(filename, limit=limit)
        return web.json_response({"entries": entries, "count": len(entries)})

    return routes


def setup_api(app: web.Application, bot: OdinBot) -> None:
    """Register all API routes on the given aiohttp application."""
    routes = create_api_routes(bot)
    app.router.add_routes(routes)
    log.info("Web API endpoints registered")
