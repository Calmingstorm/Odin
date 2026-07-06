"""Observability and metadata route registrars (RFC-003 P2 — carved verbatim from api/__init__).

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

import asyncio

from aiohttp import web

from ...odin_log import get_logger
from ...tools.registry import get_tool_definitions
from ..api_common import (
    _safe_int_param,
)

log = get_logger("web.api")

def register_tools_meta(routes: web.RouteTableDef, bot) -> None:
    """Tools (verbatim from the monolith)."""
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
                "is_core": tool.get("is_core", False),
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
                        {"error": f"invalid timeout for '{k}': must be a positive number"},
                        status=400,
                    )
            bot.config.tools.tool_timeouts = {k: int(v) for k, v in overrides.items()}
        default = body.get("default_timeout")
        if default is not None:
            if not isinstance(default, (int, float)) or default <= 0:
                return web.json_response(
                    {"error": "default_timeout must be a positive number"}, status=400
                )
            bot.config.tools.command_timeout_seconds = int(default)
        return web.json_response({
            "default_timeout": bot.config.tools.command_timeout_seconds,
            "overrides": bot.config.tools.tool_timeouts,
        })


def register_bulkheads(routes: web.RouteTableDef, bot) -> None:
    """Bulkhead isolation status (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Bulkhead isolation status
    # ------------------------------------------------------------------

    @routes.get("/api/tools/bulkheads")
    async def get_bulkheads(_request: web.Request) -> web.Response:
        executor = getattr(bot, "executor", None)
        if executor is None or not hasattr(executor, "bulkheads"):
            return web.json_response({"error": "bulkheads not available"}, status=503)
        return web.json_response(executor.bulkheads.get_all_metrics())


def register_aggregates(routes: web.RouteTableDef, bot) -> None:
    """Observability aggregates — passive exposure only (no alert delivery) (verbatim from the
    monolith)."""
    # ------------------------------------------------------------------
    # Observability aggregates — passive exposure only (no alert delivery)
    # ------------------------------------------------------------------

    def _obs_window(request: web.Request) -> int:
        try:
            return max(1, min(int(request.query.get("window", "24")), 24 * 14))
        except ValueError:
            return 24

    @routes.get("/api/observability/context")
    async def get_observability_context(request: web.Request) -> web.Response:
        obs_cfg = getattr(bot.config, "observability", None)
        if obs_cfg is not None and not obs_cfg.prompt_budget_accounting:
            return web.json_response({"error": "prompt budget accounting disabled"}, status=503)
        from ...observability.aggregates import context_aggregates
        directory = getattr(bot.config.tools, "trajectory_path", "./data/trajectories")
        data = await asyncio.to_thread(
            context_aggregates, directory, _obs_window(request),
        )
        return web.json_response(data)

    @routes.get("/api/observability/failures")
    async def get_observability_failures(request: web.Request) -> web.Response:
        from ...observability.aggregates import failure_aggregates
        audit_path = getattr(bot.config.tools, "audit_log_path", "./data/audit.jsonl")
        data = await asyncio.to_thread(
            failure_aggregates, audit_path, _obs_window(request),
        )
        return web.json_response(data)

    @routes.get("/api/usage/totals")
    async def get_usage_totals(_request: web.Request) -> web.Response:
        tracker = getattr(bot, "cost_tracker", None)
        if tracker is None:
            return web.json_response({"error": "cost tracking not available"}, status=503)
        return web.json_response(tracker.get_totals())


def register_audit_log(routes: web.RouteTableDef, bot) -> None:
    """Audit log (verbatim from the monolith)."""
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


def register_log_search(routes: web.RouteTableDef, bot) -> None:
    """Log search (server-side filtered log queries) (verbatim from the monolith)."""
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


def register_risk_classification(routes: web.RouteTableDef, bot) -> None:
    """Risk classification (observability) (verbatim from the monolith)."""
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

    @routes.get("/api/governor/stats")
    async def governor_stats(_request: web.Request) -> web.Response:
        executor = getattr(bot, "tool_executor", None)
        if not executor or not getattr(executor, "command_governor", None):
            return web.json_response({"error": "command governor not available"}, status=503)
        return web.json_response(executor.command_governor.stats.get_summary())

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


def register_recovery_stats(routes: web.RouteTableDef, bot) -> None:
    """Recovery stats (observability) (verbatim from the monolith)."""
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


def register_branch_freshness(routes: web.RouteTableDef, bot) -> None:
    """Branch freshness stats (observability) (verbatim from the monolith)."""
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


def register_validation_stats(routes: web.RouteTableDef, bot) -> None:
    """Tool result validation stats (observability) (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Tool result validation stats (observability)
    # ------------------------------------------------------------------

    @routes.get("/api/validation/stats")
    async def validation_stats(_request: web.Request) -> web.Response:
        executor = getattr(bot, "tool_executor", None)
        if not executor:
            return web.json_response({"error": "executor not available"}, status=503)
        return web.json_response(executor.validation_stats.as_dict())


def register_affordances(routes: web.RouteTableDef, bot) -> None:
    """Tool affordances (cost/risk/latency metadata) (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Tool affordances (cost/risk/latency metadata)
    # ------------------------------------------------------------------

    @routes.get("/api/affordances")
    async def affordances(_request: web.Request) -> web.Response:
        from ...tools.affordances import all_affordances
        return web.json_response({"affordances": all_affordances()})


def register_compression_stats(routes: web.RouteTableDef, bot) -> None:
    """Context compression stats (observability) (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Context compression stats (observability)
    # ------------------------------------------------------------------

    @routes.get("/api/compression/stats")
    async def compression_stats(_request: web.Request) -> web.Response:
        tracker = getattr(bot, "compression_stats", None)
        if tracker is None:
            return web.json_response({"error": "compression stats not available"}, status=503)
        return web.json_response(tracker.as_dict())


def register_routing_stats(routes: web.RouteTableDef, bot) -> None:
    """Model routing stats (observability) (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Model routing stats (observability)
    # ------------------------------------------------------------------

    @routes.get("/api/routing/stats")
    async def routing_stats(_request: web.Request) -> web.Response:
        router = getattr(bot, "model_router", None)
        if router is None:
            return web.json_response({"error": "model router not available"}, status=503)
        return web.json_response(router.get_metrics())




def register_usage_cost(routes: web.RouteTableDef, bot) -> None:
    """Usage / cost tracking (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Usage / cost tracking
    # ------------------------------------------------------------------

    @routes.get("/api/usage")
    async def get_usage(_request: web.Request) -> web.Response:
        tracker = getattr(bot, "cost_tracker", None)
        if tracker is None:
            return web.json_response({"error": "cost tracking not available"}, status=503)
        return web.json_response(tracker.get_summary())


def register_degradation(routes: web.RouteTableDef, bot) -> None:
    """Subsystem degradation status (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Subsystem degradation status
    # ------------------------------------------------------------------

    @routes.get("/api/subsystems/status")
    async def subsystem_status(_request: web.Request) -> web.Response:
        guard = getattr(bot, "subsystem_guard", None)
        if guard is None:
            return web.json_response({"error": "subsystem guard not available"}, status=503)
        return web.json_response(guard.get_status())
