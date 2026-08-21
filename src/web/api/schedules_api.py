"""Schedules route registrars (RFC-003 P3 — carved verbatim from api/__init__).

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

from datetime import UTC, datetime

from aiohttp import web
from croniter import croniter

from ...odin_log import get_logger
from ..api_common import (
    _MAX_DESCRIPTION_LEN,
    _safe_int_param,
    _sanitize_error,
    _validate_string,
)

log = get_logger("web.api")


def register_schedules(routes: web.RouteTableDef, bot) -> None:
    """Schedules (verbatim from the monolith)."""
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
        # Web API schedule creation is gated by the admin web token (auth
        # middleware), so schedules created here carry system/admin authority:
        # requester_id is intentionally left empty, so scheduled execution runs
        # with user_id=None (unrestricted), matching the admin nature of the
        # dashboard. Discord-created schedules instead persist the creator's id
        # for per-user host/tier scoping. The API token identity is NOT a
        # Discord-user-scoped principal, so passing it through would not map onto
        # the permission/host-access namespace.
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
                cron_timezone=data.get("cron_timezone"),
                report_format=data.get("report_format"),
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
            return web.json_response(
                {"error": "request body must be a non-empty object"}, status=400
            )
        desc = data.get("description")
        if desc is not None:
            err = _validate_string(desc, "description", _MAX_DESCRIPTION_LEN)
            if err:
                return web.json_response({"error": err}, status=400)
        paused = data.get("paused")
        if paused is not None and not isinstance(paused, bool):
            return web.json_response({"error": "'paused' must be a boolean"}, status=400)
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
                paused=paused,
                cron_timezone=data.get("cron_timezone"),
                report_format=data.get("report_format"),
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
        try:
            result = await bot.scheduler.run_now(sid)
            return web.json_response(result)
        except ValueError as e:
            err = str(e)
            if "not found" in err:
                return web.json_response({"error": err}, status=404)
            return web.json_response({"error": err}, status=503)
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
        # Return next 5 run times, on the SAME clock the scheduler fires on.
        # This used to build them from a naive datetime.now() — server-local —
        # and serialize without an offset, while the real next_run comes from
        # _cron_next_run in UTC. The browser then parsed the offset-less string
        # as local time, so the preview an operator trusts before clicking
        # Create was wrong by the server/browser offset.
        from ...scheduler.scheduler import _utc_iso

        now = datetime.now(UTC)
        cr = croniter(expr, now)
        next_runs = [_utc_iso(cr.get_next(datetime)) for _ in range(5)]
        return web.json_response({"valid": True, "next_runs": next_runs})


