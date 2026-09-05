"""Agents, loops and process route registrars (RFC-003 P4 — carved verbatim from api/__init__).

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

import asyncio
import time

from aiohttp import web

from ...odin_log import get_logger
from ..api_common import (
    _MAX_GOAL_LEN,
    _safe_int_param,
    _validate_string,
)
from ._agent_display import agent_display_policy

log = get_logger("web.api")

def register_loops(routes: web.RouteTableDef, bot) -> None:
    """Autonomous loops (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Autonomous loops
    # ------------------------------------------------------------------

    @routes.get("/api/loops")
    async def list_loops(_request: web.Request) -> web.Response:
        loops = []
        for lid, info in bot.loop_manager._loops.items():
            # Manager previews are the bounded prompt-context buffer, not an
            # operator history. Keep them on the list only as a latest hint.
            history = list(info._iteration_history)[-5:] if info._iteration_history else []
            last_trigger_age_seconds = (
                max(0.0, time.monotonic() - info.last_trigger)
                if info.last_trigger is not None else None
            )
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
                "last_trigger_age_seconds": last_trigger_age_seconds,
                "created_at": info.created_at,
                "status": info.status,
                "iteration_history": history,
            })
        return web.json_response(loops)

    @routes.get("/api/loops/{loop_id}")
    async def loop_detail(request: web.Request) -> web.Response:
        """Full loop configuration plus its durable iteration history.

        The manager's six-entry deque is deliberately only the next-prompt
        context buffer. Operator history comes from trajectory JSONL records,
        where responses, tools, tokens, duration, errors and execution
        provenance survive after the deque rolls over.
        """
        lid = request.match_info["loop_id"]
        info = bot.loop_manager._loops.get(lid)
        if info is None:
            return web.json_response({"error": "loop not found"}, status=404)

        saver = getattr(bot, "trajectory_saver", None)
        history_reader = getattr(saver, "find_by_loop_id", None)
        history_available = callable(history_reader)
        limit = _safe_int_param(request, "limit", 100, hi=1000)
        iterations: list[dict] = []
        if callable(history_reader):
            try:
                iterations = await history_reader(lid, limit=limit + 1)
            except Exception:
                # The active-loop record is still useful if durable storage is
                # temporarily unreadable; expose that distinction truthfully.
                history_available = False
                log.exception("Failed to read trajectory history for loop %s", lid)

        history_rows = []
        for turn in iterations[:limit]:
            generations = turn.get("iterations", [])
            last_generation = generations[-1] if generations else {}
            history_rows.append({
                "message_id": turn.get("message_id", ""),
                "timestamp": turn.get("timestamp", ""),
                "loop_iteration": turn.get("loop_iteration", 0),
                "final_response": turn.get("final_response", ""),
                "tools_used": turn.get("tools_used", []),
                "is_error": bool(turn.get("is_error", False)),
                "total_input_tokens": turn.get("total_input_tokens", 0),
                "total_output_tokens": turn.get("total_output_tokens", 0),
                "total_duration_ms": turn.get("total_duration_ms", 0),
                "provider": last_generation.get("provider", ""),
                "model": last_generation.get("model", ""),
                "reasoning_effort": last_generation.get("reasoning_effort"),
            })

        last_trigger_age_seconds = (
            max(0.0, time.monotonic() - info.last_trigger)
            if info.last_trigger is not None else None
        )
        return web.json_response({
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
            "last_trigger_age_seconds": last_trigger_age_seconds,
            "created_at": info.created_at,
            "status": info.status,
            "history_available": history_available,
            "history_limit": limit,
            "history_truncated": len(iterations) > limit,
            "iterations": history_rows,
            # Explicitly NOT an audit log: these are the manager's bounded,
            # write-truncated prompt-context previews. They remain useful for
            # a just-upgraded loop whose older trajectory turns predate loop_id.
            "context_history": list(info._iteration_history),
        })

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

        requester_id = "web-api"

        # Build iteration callback (same pattern as _handle_start_loop)
        async def _iteration_cb(
            prompt: str, ch: object, prev_context: str | None,
            cancel_event: asyncio.Event,
        ) -> str:
            return await bot.tool_loop.run_autonomous(
                prompt, ch, prev_context, requester_id,
                cancel_event=cancel_event,
            )

        result = bot.loop_manager.start_loop(
            goal=goal,
            channel=channel,
            requester_id=requester_id,
            requester_name="Web API",
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
        result = await bot.loop_manager.stop_loop(lid)
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
            await bot.loop_manager.stop_loop(lid)

        # Find the channel
        try:
            channel = bot.get_channel(int(channel_id))
        except (ValueError, TypeError):
            channel = None
        if not channel:
            return web.json_response({"error": "channel not found"}, status=404)

        # Build iteration callback (same shape as the create route: the loop
        # manager invokes it with the loop's cancel event, and run_autonomous
        # needs that event for cooperative stop to reach a restarted loop).
        async def _iteration_cb(
            prompt: str, ch: object, prev_context: str | None,
            cancel_event: asyncio.Event,
        ) -> str:
            return await bot.tool_loop.run_autonomous(
                prompt, ch, prev_context, requester_id,
                cancel_event=cancel_event,
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


def register_agents(routes: web.RouteTableDef, bot) -> None:
    """Agents (verbatim from the monolith)."""
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
                # The FULL count — tools_used above is a preview slice, and
                # reporting its length understated every agent past ten tools.
                "tools_used_count": len(info.tools_used),
                # The cap actually in force for this agent (chat/scheduled/
                # hard limits differ), so progress is computed honestly.
                "max_iterations": getattr(info, "max_iterations", 0),
                **agent_display_policy(info, bot),
                "runtime_seconds": round(runtime, 1),
                "created_at": info.created_at,
                "result": (info.result[:200] if info.result else ""),
                "error": (info.error[:200] if info.error else ""),
                "recovery_attempts": getattr(info, "recovery_attempts", 0),
                "state_history": info._sm.history_as_dicts() if hasattr(info, "_sm") else [],
                "depth": getattr(info, "depth", 0),
                "parent_id": getattr(info, "parent_id", None),
                "children_ids": list(getattr(info, "children_ids", [])),
                **(info.activity() if callable(getattr(info, "activity", None)) else {}),
            })
        return web.json_response(agents)

    @routes.get("/api/agents/{agent_id}")
    async def agent_detail(request: web.Request) -> web.Response:
        """Full record for ONE agent — the modal's source.

        The list endpoint stays lean and truncated on purpose; untruncated
        goals and results are fetched only for the agent actually opened.
        """
        try:
            agent_agents = bot.agent_manager._agents
            if not isinstance(agent_agents, dict):
                raise AttributeError
        except (AttributeError, TypeError):
            return web.json_response({"error": "no agent manager"}, status=404)
        info = agent_agents.get(request.match_info["agent_id"])
        if info is None:
            return web.json_response({"error": "agent not found"}, status=404)
        runtime = (info.ended_at or time.time()) - info.created_at
        return web.json_response({
            "id": request.match_info["agent_id"],
            "label": info.label,
            # Untruncated — this is why the detail endpoint exists.
            "goal": info.goal,
            "result": info.result or "",
            "error": info.error or "",
            "status": info.status,
            "state": info.state.value if hasattr(info, "state") else info.status,
            "channel_id": info.channel_id,
            "requester_name": info.requester_name,
            "iteration_count": info.iteration_count,
            "max_iterations": getattr(info, "max_iterations", 0),
            "tools_used": list(info.tools_used),
            "tools_used_count": len(info.tools_used),
            "runtime_seconds": round(runtime, 1),
            "created_at": info.created_at,
            "ended_at": info.ended_at,
            "recovery_attempts": getattr(info, "recovery_attempts", 0),
            "depth": getattr(info, "depth", 0),
            "parent_id": getattr(info, "parent_id", None),
            "children_ids": list(getattr(info, "children_ids", [])),
            **(info.activity() if callable(getattr(info, "activity", None)) else {}),
            # Spawn-time policy, distinct from what executed.
            "model_override": getattr(info, "model_override", None),
            "reasoning_effort_override": getattr(info, "reasoning_effort_override", None),
            "last_provider": getattr(info, "last_provider", ""),
            "has_executed": bool(getattr(info, "has_executed", False)),
            **agent_display_policy(info, bot),
            # Diagnostics: available for a future surface, not rendered as
            # primary modal content.
            "state_history": info._sm.history_as_dicts() if hasattr(info, "_sm") else [],
        })

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


def register_processes(routes: web.RouteTableDef, bot) -> None:
    """Processes (verbatim from the monolith)."""
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
            from ...observability.diagnostics import safe_text

            # Scrub the complete bounded buffer before selecting lines: PEM
            # credentials can span more than the preview's three lines.
            output = "".join(output_lines)
            preview = [
                line[:1000] for line in safe_text(output, limit=len(output)).splitlines()[-3:]
            ]
            processes.append({
                "pid": pid,
                "command": safe_text(info.command),
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


