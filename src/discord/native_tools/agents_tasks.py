"""Agents/tasks/loops native tool handlers (RFC-001 P5c, RFC-002 P3).

The fifth handler domain: background-task delegation, autonomous-loop
start/stop, agent spawn/collect, and the loop-agent bridge. These
handlers orchestrate the loop pipeline itself, so they take the
ToolLoopRunner directly (constructed before them in
``wiring.build_components``). Narrow-deps since RFC-002 P3: ``get_config``
and ``get_knowledge_store`` are provider callables (config is hot-reload
replaced; the knowledge store is swappable via reload), the LLM surface
is the gateway, and the compression config object is read live through
``get_context_compressor`` (the chat pipeline reads it the same way).
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

import discord

from ...agents.manager import AGENT_BLOCKED_TOOLS, filter_agent_tools
from ...async_utils import fire_and_forget
from ...odin_log import get_logger
from ..background_task import MAX_STEPS, BackgroundTask, create_task_id, run_background_task
from ..tool_loop import _LoopMessageProxy

if TYPE_CHECKING:
    from ...agents.loop_bridge import LoopAgentBridge
    from ...agents.manager import AgentManager
    from ...agents.trajectory import AgentTrajectorySaver
    from ...audit.logger import AuditLogger
    from ...search.embedder import LocalEmbedder
    from ...tools.autonomous_loop import LoopManager
    from ...tools.executor import ToolExecutor
    from ...tools.skill_manager import SkillManager
    from ..channel_state import ChannelStateRegistry
    from ..llm_gateway import LLMGateway
    from ..prompts import PromptBuilder
    from ..tool_catalog import ToolCatalog
    from ..tool_loop import ToolLoopRunner
    from ..turn_recorder import TurnRecorder

log = get_logger("discord")


@dataclass(frozen=True)
class AgentTaskDeps:
    """The true dependency surface of the agents/tasks/loops handlers."""

    get_config: Callable  # live root — replaced by config hot-reload
    llm_gateway: LLMGateway  # owns the swappable provider clients
    channel_state: ChannelStateRegistry  # background-task registry + caps
    tool_executor: ToolExecutor
    skill_manager: SkillManager
    get_knowledge_store: Callable  # swappable via bot.knowledge reloads
    embedder: LocalEmbedder | None
    audit: AuditLogger
    agent_manager: AgentManager
    loop_manager: LoopManager
    loop_agent_bridge: LoopAgentBridge
    agent_trajectory_saver: AgentTrajectorySaver | None
    get_context_compressor: Callable  # live read — tests swap it on the bot
    tool_loop: ToolLoopRunner  # loop iterations + tool dispatch
    turn_recorder: TurnRecorder  # lifecycle webhook emission
    prompt_builder: PromptBuilder
    tool_catalog: ToolCatalog


class AgentTaskTools:
    def __init__(self, deps: AgentTaskDeps) -> None:
        self._get_config = deps.get_config
        self._llm_gateway = deps.llm_gateway
        self._channel_state = deps.channel_state
        self._tool_executor = deps.tool_executor
        self._skill_manager = deps.skill_manager
        self._get_knowledge_store = deps.get_knowledge_store
        self._embedder = deps.embedder
        self._audit = deps.audit
        self._agent_manager = deps.agent_manager
        self._loop_manager = deps.loop_manager
        self._loop_agent_bridge = deps.loop_agent_bridge
        self._agent_trajectory_saver = deps.agent_trajectory_saver
        self._get_context_compressor = deps.get_context_compressor
        self._tool_loop = deps.tool_loop
        self._turn_recorder = deps.turn_recorder
        self._prompt_builder = deps.prompt_builder
        self._tool_catalog = deps.tool_catalog

    # --- Background task delegation ---

    async def _handle_delegate_task(self, message: discord.Message, inp: dict) -> str:
        """Create and start a background task."""
        description = inp.get("description", "Background task")
        steps = inp.get("steps", [])

        if not steps or not isinstance(steps, list):
            return "No steps provided."
        if len(steps) > MAX_STEPS:
            return f"Too many steps ({len(steps)}). Maximum is {MAX_STEPS}."

        # Validate all steps have tool_name and required tool_input fields
        required_fields = {
            "run_command": "command",
            "run_script": "script",
        }
        for i, step in enumerate(steps):
            if not isinstance(step, dict) or "tool_name" not in step:
                return f"Step {i}: must have 'tool_name'."
            tn = step["tool_name"]
            req = required_fields.get(tn)
            if req:
                tool_input = step.get("tool_input", {})
                if req not in tool_input:
                    return (
                        f"Step {i + 1} ({tn}): missing '{req}' in tool_input. "
                        f"Each {tn} step MUST include tool_input with "
                        f"'{req}': 'your_shell_command'. "
                        f"Rebuild the steps with proper tool_input and retry."
                    )

        task = BackgroundTask(
            task_id=create_task_id(),
            description=description,
            steps=steps,
            channel=message.channel,
            requester=str(message.author),
            requester_id=str(message.author.id),
        )

        # Prune old completed tasks
        completed = [
            tid
            for tid, t in self._channel_state.background_tasks.items()
            if t.status in ("completed", "failed", "cancelled")
        ]
        while len(completed) > self._channel_state.background_tasks_max:
            old = completed.pop(0)
            del self._channel_state.background_tasks[old]

        self._channel_state.background_tasks[task.task_id] = task

        # Build Codex callback for conversational follow-up
        codex_cb = None
        if self._llm_gateway.active_client:

            async def _codex_followup(messages: list[dict], system: str, max_tokens: int) -> str:
                return await self._llm_gateway.active_client.chat(
                    messages=messages,
                    system=system,
                    max_tokens=max_tokens,
                )

            codex_cb = _codex_followup

        # Launch in background
        async def _run():
            try:
                await run_background_task(
                    task,
                    self._tool_executor,
                    self._skill_manager,
                    knowledge_store=self._get_knowledge_store(),
                    embedder=self._embedder,
                    audit_logger=self._audit,
                    codex_callback=codex_cb,
                )
            except Exception as e:
                log.error("Background task %s crashed: %s", task.task_id, e, exc_info=True)
                task.status = "failed"

        task._asyncio_task = asyncio.create_task(_run())

        return (
            f"Background task started (ID: `{task.task_id}`): **{description}** "
            f"({len(steps)} steps). Progress will be posted to this channel."
        )

    def _handle_list_tasks(self, inp: dict | None = None) -> str:
        """List background tasks, or get detailed results for a specific task."""
        if not self._channel_state.background_tasks:
            return "No background tasks."

        task_id = (inp or {}).get("task_id")

        # Detailed view for a specific task
        if task_id:
            task = self._channel_state.background_tasks.get(task_id)
            if not task:
                return f"No task found with ID `{task_id}`."
            lines = [
                f"**{task.description}** [{task.status}]",
                f"ID: `{task.task_id}` | {len(task.results)}/{len(task.steps)} steps",
                "",
            ]
            for r in task.results:
                icon = {"ok": "+", "error": "!", "skipped": "-", "cancelled": "x"}.get(
                    r.status, "?"
                )
                lines.append(
                    f"[{icon}] **Step {r.index + 1} ({r.description})** ({r.elapsed_ms}ms):"
                )
                lines.append(r.output if r.output else "(no output)")
                lines.append("")
            text = "\n".join(lines)
            if len(text) > 3800:
                text = (
                    text[:3800]
                    + "\n... (truncated, full results were posted in the progress message)"
                )
            return text

        # Overview of all tasks
        lines = []
        for tid, t in self._channel_state.background_tasks.items():
            done = len(t.results)
            total = len(t.steps)
            ok = sum(1 for r in t.results if r.status == "ok")
            errors = sum(1 for r in t.results if r.status == "error")
            lines.append(
                f"- `{tid}` [{t.status}] **{t.description}** "
                f"({done}/{total} steps, {ok} ok, {errors} errors)"
            )
        return "\n".join(lines)

    def _handle_cancel_task(self, inp: dict) -> str:
        """Cancel a running background task."""
        task_id = inp.get("task_id", "")
        task = self._channel_state.background_tasks.get(task_id)
        if not task:
            return f"No task found with ID `{task_id}`."
        if task.status != "running":
            return f"Task `{task_id}` is not running (status: {task.status})."
        task.cancel()
        return f"Cancellation requested for task `{task_id}`."

    def _handle_start_loop(self, message: discord.Message, inp: dict) -> str:
        """Start an autonomous loop."""
        goal = inp.get("goal", "")
        if not goal:
            return "A 'goal' is required to start a loop."

        interval = inp.get("interval_seconds", 60)
        mode = inp.get("mode", "notify")
        stop_condition = inp.get("stop_condition")
        max_iterations = inp.get("max_iterations", 50)

        # Build iteration callback that runs through Codex with tools
        async def _iteration_cb(
            prompt: str,
            channel: object,
            prev_context: str | None,
        ) -> str:
            return await self._tool_loop.run_autonomous(
                prompt,
                channel,
                prev_context,
                str(message.author.id),
            )

        result = self._loop_manager.start_loop(
            goal=goal,
            channel=message.channel,
            requester_id=str(message.author.id),
            requester_name=str(message.author),
            iteration_callback=_iteration_cb,
            interval_seconds=interval,
            mode=mode,
            stop_condition=stop_condition,
            max_iterations=max_iterations,
        )

        # If result is a loop ID (short hex), format success message
        if result.startswith("Error"):
            return result
        # Lifecycle webhook: loop.started
        fire_and_forget(
            self._turn_recorder._emit_lifecycle_event(
                "loop.started",
                {
                    "loop_id": result,
                    "goal": goal[:200],
                    "interval_seconds": interval,
                    "mode": mode,
                    "max_iterations": max_iterations,
                    "channel_id": str(getattr(message.channel, "id", "")),
                    "requester_id": str(message.author.id),
                },
            ),
            name="lifecycle:loop.started",
        )
        return (
            f"Loop started (ID: `{result}`): **{goal[:100]}** "
            f"(every {max(10, interval)}s, mode={mode}, max {max_iterations} iterations)"
        )

    def _handle_stop_loop(self, inp: dict) -> str:
        """Stop an autonomous loop."""
        loop_id = inp.get("loop_id", "")
        if not loop_id:
            return "A 'loop_id' is required."
        result = self._loop_manager.stop_loop(loop_id)
        # Lifecycle webhook: loop.stopped
        fire_and_forget(
            self._turn_recorder._emit_lifecycle_event(
                "loop.stopped",
                {
                    "loop_id": loop_id,
                    "result": result,
                },
            ),
            name="lifecycle:loop.stopped",
        )
        return result

    def _handle_list_loops(self) -> str:
        """List all autonomous loops."""
        return self._loop_manager.list_loops()

    # --- Agent tool handlers ---

    async def _handle_spawn_agent(self, message: object, inp: dict) -> str:
        """Spawn an autonomous agent for a sub-task.

        Supports nested spawning up to ``AgentsConfig.max_nesting_depth``
        (default 2). The caller can pass ``parent_id`` in ``inp`` to nest
        under a parent; child agents inherit an elevated depth via
        AgentManager.spawn(). Each spawned agent's tool_executor_callback
        captures the agent's own id, so if the child itself calls spawn_agent
        the grandchild is correctly nested.
        """
        label = inp.get("label", "")
        goal = inp.get("goal", "")
        parent_id_arg = inp.get("parent_id")
        if not label or not goal:
            return "Both 'label' and 'goal' are required."

        if not self._llm_gateway.active_client:
            return "Error: LLM provider not available."

        channel = getattr(message, "channel", message)
        author = getattr(message, "author", None)
        user_id = str(getattr(author, "id", "0"))
        user_name = str(author) if author else "agent"

        system_prompt = self._prompt_builder.build_full_prompt(channel=channel, user_id=user_id)
        all_tools = (
            self._tool_catalog.merged_definitions() if self._get_config().tools.enabled else []
        )
        # Depth-aware filter: root spawn uses depth 0; nested spawns compute
        # the expected child depth from the parent so terminal children don't
        # even see spawn_agent in their tool list.
        parent_depth = 0
        if parent_id_arg:
            parent = self._agent_manager._agents.get(parent_id_arg)
            if parent is not None:
                parent_depth = parent.depth + 1
        max_depth = getattr(
            getattr(self._get_config(), "agents", None),
            "max_nesting_depth",
            2,
        )
        tools = filter_agent_tools(all_tools, depth=parent_depth, max_depth=max_depth)

        # Iteration callback — wraps Codex chat_with_tools, returns dict
        async def _iteration_cb(
            messages: list[dict],
            sys_prompt: str,
            tool_defs: list[dict],
        ) -> dict:
            resp = await self._llm_gateway.active_client.chat_with_tools(
                messages=messages,
                system=sys_prompt,
                tools=tool_defs,
            )
            return {
                "text": resp.text,
                "tool_calls": [{"name": tc.name, "input": tc.input} for tc in resp.tool_calls],
                "stop_reason": resp.stop_reason,
            }

        msg_proxy = _LoopMessageProxy(channel, user_id, user_name)

        # Mutable container so the callback can learn its own agent_id
        # AFTER agent_manager.spawn() returns and use it as parent_id when
        # this agent itself calls spawn_agent.
        _self_id: dict[str, str | None] = {"id": None}

        async def _tool_exec_cb(tool_name: str, tool_input: dict) -> str:
            if tool_name == "spawn_agent":
                # Nested spawn — forward this agent's id so AgentManager.spawn
                # enforces max_nesting_depth and children linkage.
                if _self_id["id"] and not tool_input.get("parent_id"):
                    tool_input = {**tool_input, "parent_id": _self_id["id"]}
            elif tool_name in AGENT_BLOCKED_TOOLS:
                # Other agent-management tools (kill/send_to/wait_for/get_results/
                # list) remain available from within a parent, because they
                # operate on already-spawned agents and aren't the same as
                # spawning new ones.
                pass
            result = await self._tool_loop.dispatch_loop_tool(
                tool_name,
                tool_input,
                msg_proxy,
                user_id,
            )
            return str(result) if result is not None else ""

        # Determine iteration cap from config — scheduled spawns get a higher budget
        agents_cfg = getattr(self._get_config(), "agents", None)
        hard_max = getattr(agents_cfg, "hard_max_iterations", 300) if agents_cfg else 300
        if inp.get("_scheduled"):
            iter_cap = min(
                getattr(agents_cfg, "scheduled_max_iterations", 180) if agents_cfg else 180,
                hard_max,
            )
        else:
            iter_cap = min(
                getattr(agents_cfg, "max_iterations", 120) if agents_cfg else 120, hard_max
            )
        warnings = (
            list(getattr(agents_cfg, "final_warning_iterations", [20, 10, 5, 1]))
            if agents_cfg
            else [20, 10, 5, 1]
        )

        agent_id = self._agent_manager.spawn(
            label=label,
            goal=goal,
            channel_id=str(getattr(channel, "id", "0")),
            requester_id=user_id,
            requester_name=user_name,
            iteration_callback=_iteration_cb,
            tool_executor_callback=_tool_exec_cb,
            tools=tools,
            system_prompt=system_prompt,
            parent_id=parent_id_arg,
            max_depth=max_depth,
            tool_timeouts=self._get_config().tools.tool_timeouts,
            trajectory_saver=self._agent_trajectory_saver,
            max_iterations=iter_cap,
            budget_warnings=warnings,
            context_compression_enabled=bool(self._get_context_compressor()),
            max_context_chars=self._get_context_compressor().max_context_chars
            if self._get_context_compressor()
            else 750000,
            keep_recent_iterations=self._get_context_compressor().keep_recent_iterations
            if self._get_context_compressor()
            else 30,
        )

        if agent_id.startswith("Error"):
            return agent_id
        _self_id["id"] = agent_id
        depth_note = f" (depth {parent_depth})" if parent_id_arg else ""
        return f"Agent '{label}' spawned (ID: `{agent_id}`){depth_note}. Working on: {goal[:100]}"

    async def _collect_agent_result(
        self,
        agent_id: str,
        timeout: float = 3660,
    ) -> tuple[str, dict]:
        """Wait for an agent to complete and return (formatted_text, raw_data).

        The raw_data dict contains status, error, result, and empty_result
        so callers can make ok/fail decisions based on structured state
        rather than parsing markdown.
        """
        results = await self._agent_manager.wait_for_agents([agent_id], timeout=timeout)
        r = results.get(agent_id, {})
        status = r.get("status", "unknown")
        label = r.get("label", agent_id)
        runtime = r.get("runtime_seconds", 0)
        iterations = r.get("iteration_count", 0)
        tools_used = r.get("tools_used", [])
        result_text = r.get("result", "")
        error_text = r.get("error", "")

        parts = [f"**Agent: {label}** ({status})", f"Runtime: {runtime}s, Iterations: {iterations}"]
        if tools_used:
            parts.append(f"Tools: {', '.join(tools_used[:15])}")
        if result_text:
            if len(result_text) > 1500:
                result_text = result_text[:1500] + "..."
            parts.append(f"Result:\n{result_text}")
        if error_text:
            parts.append(f"Error: {error_text}")

        raw = {
            "status": status,
            "error": error_text,
            "result": r.get("result", ""),
            "empty_result": not r.get("result"),
        }
        return "\n".join(parts), raw

    def _handle_send_to_agent(self, inp: dict) -> str:
        """Send a message to a running agent."""
        agent_id = inp.get("agent_id", "")
        message = inp.get("message", "")
        if not agent_id:
            return "'agent_id' is required."
        if not message:
            return "'message' is required."
        return self._agent_manager.send(agent_id, message)

    def _handle_list_agents(self, message: object) -> str:
        """List all agents, optionally filtered by channel."""
        channel = getattr(message, "channel", message)
        channel_id = str(getattr(channel, "id", "0"))
        agents = self._agent_manager.list(channel_id)
        if not agents:
            return "No agents running."
        lines = []
        for a in agents:
            lines.append(
                f"`{a['id']}` | **{a['label']}** | {a['status']} | "
                f"{a['iteration_count']} iters | {a['runtime_seconds']}s"
            )
        return f"**Agents ({len(agents)}):**\n" + "\n".join(lines)

    def _handle_kill_agent(self, inp: dict) -> str:
        """Kill a running agent."""
        agent_id = inp.get("agent_id", "")
        if not agent_id:
            return "'agent_id' is required."
        return self._agent_manager.kill(agent_id)

    def _handle_get_agent_results(self, inp: dict) -> str:
        """Get results of a completed agent."""
        agent_id = inp.get("agent_id", "")
        if not agent_id:
            return "'agent_id' is required."
        results = self._agent_manager.get_results(agent_id)
        if results is None:
            return f"Agent '{agent_id}' not found."
        if results["status"] == "running":
            return (
                f"Agent '{results['label']}' is still running "
                f"({results['iteration_count']} iterations, "
                f"{results['runtime_seconds']}s elapsed)."
            )
        parts = [
            f"**Agent: {results['label']}** ({results['status']})",
            f"Runtime: {results['runtime_seconds']}s, Iterations: {results['iteration_count']}",
        ]
        if results["tools_used"]:
            parts.append(f"Tools: {', '.join(results['tools_used'])}")
        if results["result"]:
            result_text = results["result"]
            if len(result_text) > 1500:
                result_text = result_text[:1500] + "..."
            parts.append(f"Result:\n{result_text}")
        if results["error"]:
            parts.append(f"Error: {results['error']}")
        return "\n".join(parts)

    async def _handle_wait_for_agents(self, inp: dict) -> str:
        """Wait for agents to complete and return collected results."""
        agent_ids = inp.get("agent_ids", [])
        timeout = inp.get("timeout", 300)
        if not agent_ids:
            return "'agent_ids' list is required."
        if not isinstance(agent_ids, list):
            return "'agent_ids' must be a list of agent ID strings."

        results = await self._agent_manager.wait_for_agents(
            agent_ids,
            timeout=float(timeout),
        )

        lines: list[str] = []
        for aid in agent_ids:
            r = results.get(aid, {})
            status = r.get("status", "unknown")
            label = r.get("label", aid)
            result_text = r.get("result", "")
            error_text = r.get("error", "")
            content = result_text or error_text or "(no output)"
            if len(content) > 800:
                content = content[:800] + "..."
            lines.append(f"**{label}** (`{aid}`): {status}\n{content}")

        return "\n\n".join(lines) if lines else "No results."

    # --- Loop-Agent bridge tool handlers ---

    async def _handle_spawn_loop_agents(self, message: object, inp: dict) -> str:
        """Spawn agents from within a loop iteration via the loop-agent bridge."""
        loop_id = inp.get("loop_id", "")
        tasks = inp.get("tasks", [])
        if not loop_id:
            return "A 'loop_id' is required."
        if not tasks:
            return "A 'tasks' list is required."

        # Validate the loop exists
        loop_info = self._loop_manager._loops.get(loop_id)
        if not loop_info:
            return f"Error: Loop '{loop_id}' not found."
        if loop_info.status != "running":
            return f"Error: Loop '{loop_id}' is not running (status: {loop_info.status})."

        if not self._llm_gateway.active_client:
            return "Error: LLM provider not available."

        channel = getattr(message, "channel", message)
        channel_id = str(getattr(channel, "id", "0"))

        # Build system prompt and tools for the agents (no agent tools — prevents nesting)
        system_prompt = self._prompt_builder.build_full_prompt(
            channel=channel,
            user_id=loop_info.requester_id,
        )
        all_tools = (
            self._tool_catalog.merged_definitions() if self._get_config().tools.enabled else []
        )
        tools = filter_agent_tools(all_tools)

        # Build iteration/tool callbacks (same pattern as _handle_spawn_agent)
        async def _iteration_cb(messages, sys, tool_defs):
            resp = await self._llm_gateway.active_client.chat_with_tools(
                messages=messages,
                system=sys,
                tools=tool_defs,
            )
            return {
                "text": resp.text or "",
                "tool_calls": [
                    {"name": tc.name, "input": tc.input} for tc in (resp.tool_calls or [])
                ],
                "stop_reason": resp.stop_reason or "end_turn",
            }

        async def _tool_cb(tool_name, tool_input):
            return await self._tool_loop.dispatch_loop_tool(
                tool_name,
                tool_input,
                _LoopMessageProxy(channel, loop_info.requester_id, loop_info.requester_name),
                loop_info.requester_id,
            )

        # The compression config object (None when disabled) — read live via
        # the provider; config.context_compression never existed, and the old
        # attribute access raised AttributeError on EVERY spawn_loop_agents
        # call since the tool shipped (soak round-2 finding, 2026-07-05). Same
        # pattern as _handle_spawn_agent above.
        cc = self._get_context_compressor()
        agent_ids = self._loop_agent_bridge.spawn_agents_for_loop(
            loop_id=loop_id,
            iteration=loop_info.iteration_count,
            loop_goal=loop_info.goal,
            tasks=tasks,
            channel_id=channel_id,
            requester_id=loop_info.requester_id,
            requester_name=loop_info.requester_name,
            iteration_callback=_iteration_cb,
            tool_executor_callback=_tool_cb,
            tools=tools,
            system_prompt=system_prompt,
            tool_timeouts=self._get_config().tools.tool_timeouts,
            # Honor the configured agent iteration cap; without this the
            # bridge passed None and agents fell back to the module default,
            # ignoring agents.max_iterations.
            max_iterations=self._get_config().agents.max_iterations,
            context_compression_enabled=bool(cc),
            max_context_chars=cc.max_context_chars if cc else 750000,
            keep_recent_iterations=cc.keep_recent_iterations if cc else 30,
        )

        # Format response
        errors = [a for a in agent_ids if a.startswith("Error")]
        successes = [a for a in agent_ids if not a.startswith("Error")]

        parts = []
        if successes:
            parts.append(f"Spawned {len(successes)} agent(s): {', '.join(successes)}")
        if errors:
            parts.append(f"Errors: {'; '.join(errors)}")
        return "\n".join(parts) or "No agents spawned."

    async def _handle_collect_loop_agents(self, inp: dict) -> str:
        """Collect results from agents spawned by a loop."""
        loop_id = inp.get("loop_id", "")
        agent_ids = inp.get("agent_ids", None)
        timeout = inp.get("timeout", 300)
        if not loop_id:
            return "A 'loop_id' is required."

        # Validate the loop exists
        if loop_id not in self._loop_manager._loops:
            return f"Error: Loop '{loop_id}' not found."

        results = await self._loop_agent_bridge.wait_and_collect(
            loop_id=loop_id,
            agent_ids=agent_ids if isinstance(agent_ids, list) else None,
            timeout=float(timeout),
        )

        if not results:
            return "No agents to collect for this loop."

        return self._loop_agent_bridge.format_agent_results_for_context(results)
