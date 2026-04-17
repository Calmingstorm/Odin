"""Agent manager — spawn, track, and coordinate autonomous agents.

Each agent runs as an independent asyncio task with its own LLM session,
isolated message history, and full tool access. Agents may spawn sub-agents
up to a configurable nesting depth (default 2).
"""
from __future__ import annotations

import asyncio
import time
import uuid
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger
from .trajectory import AgentTrajectorySaver, AgentTrajectoryTurn

log = get_logger("agents")

# --- Constants ---
MAX_CONCURRENT_AGENTS = 5        # per channel
MAX_AGENT_LIFETIME = 3600        # 1 hour
MAX_AGENT_ITERATIONS = 30        # LLM turns per agent
STALE_WARN_SECONDS = 120         # 2 min no activity → log warning
CLEANUP_DELAY = 300              # 5 min after terminal state → remove
WAIT_DEFAULT_TIMEOUT = 300       # default timeout for wait_for_agents
WAIT_POLL_INTERVAL = 2           # poll interval for wait_for_agents
ITERATION_CB_TIMEOUT = 120       # 2 min timeout per LLM call
TOOL_EXEC_TIMEOUT = 300          # 5 min timeout per tool execution
MAX_RECOVERY_ATTEMPTS = 1        # retries before transitioning to FAILED
MAX_NESTING_DEPTH = 2            # default max sub-agent depth (root=0)
MAX_CHILDREN_PER_AGENT = 3       # max direct children one agent can spawn

# Agent-management tools — allowed or blocked based on nesting depth
AGENT_MANAGEMENT_TOOLS = frozenset({
    "spawn_agent",
    "send_to_agent",
    "list_agents",
    "kill_agent",
    "get_agent_results",
    "wait_for_agents",
})

# Legacy alias for backward compatibility
AGENT_BLOCKED_TOOLS = AGENT_MANAGEMENT_TOOLS


def filter_agent_tools(
    tools: list[dict],
    depth: int = 0,
    max_depth: int = MAX_NESTING_DEPTH,
) -> list[dict]:
    """Filter agent-management tools based on nesting depth.

    Agents below max_depth keep agent tools (can spawn children).
    Agents at or above max_depth have agent tools removed.
    """
    if depth < max_depth:
        return list(tools)
    return [t for t in tools if t.get("name") not in AGENT_MANAGEMENT_TOOLS]


# --- Agent State Machine ---


class AgentState(str, Enum):
    """Typed lifecycle states for agent workers."""
    SPAWNING = "spawning"
    READY = "ready"
    EXECUTING = "executing"
    RECOVERING = "recovering"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    KILLED = "killed"


TERMINAL_STATES = frozenset({
    AgentState.COMPLETED, AgentState.FAILED,
    AgentState.TIMEOUT, AgentState.KILLED,
})

ACTIVE_STATES = frozenset({
    AgentState.SPAWNING, AgentState.READY,
    AgentState.EXECUTING, AgentState.RECOVERING,
})

VALID_TRANSITIONS: dict[AgentState, frozenset[AgentState]] = {
    AgentState.SPAWNING: frozenset({
        AgentState.READY, AgentState.KILLED,
        AgentState.FAILED, AgentState.TIMEOUT,
    }),
    AgentState.READY: frozenset({
        AgentState.EXECUTING, AgentState.COMPLETED,
        AgentState.KILLED, AgentState.TIMEOUT,
    }),
    AgentState.EXECUTING: frozenset({
        AgentState.READY, AgentState.RECOVERING,
        AgentState.COMPLETED, AgentState.FAILED,
        AgentState.KILLED, AgentState.TIMEOUT,
    }),
    AgentState.RECOVERING: frozenset({
        AgentState.EXECUTING, AgentState.FAILED,
        AgentState.KILLED, AgentState.TIMEOUT,
    }),
    AgentState.COMPLETED: frozenset(),
    AgentState.FAILED: frozenset(),
    AgentState.TIMEOUT: frozenset(),
    AgentState.KILLED: frozenset(),
}

# Legacy status strings for backward compatibility
_TERMINAL_STATUSES = frozenset({"completed", "failed", "timeout", "killed"})

_STATE_TO_LEGACY = {
    AgentState.SPAWNING: "running",
    AgentState.READY: "running",
    AgentState.EXECUTING: "running",
    AgentState.RECOVERING: "running",
    AgentState.COMPLETED: "completed",
    AgentState.FAILED: "failed",
    AgentState.TIMEOUT: "timeout",
    AgentState.KILLED: "killed",
}


class InvalidStateTransition(Exception):
    """Raised when an invalid state transition is attempted."""
    def __init__(self, from_state: AgentState, to_state: AgentState) -> None:
        self.from_state = from_state
        self.to_state = to_state
        super().__init__(
            f"Invalid state transition: {from_state.value} → {to_state.value}"
        )


@dataclass
class StateTransition:
    """Record of a single state transition."""
    from_state: AgentState
    to_state: AgentState
    timestamp: float
    reason: str = ""


class AgentStateMachine:
    """Enforced state machine for agent lifecycle.

    Validates transitions against VALID_TRANSITIONS, records full history
    with timestamps and reasons.
    """

    def __init__(self, initial: AgentState = AgentState.SPAWNING) -> None:
        self._state = initial
        self._history: list[StateTransition] = []
        self._entered_at = time.time()

    @property
    def state(self) -> AgentState:
        return self._state

    @property
    def is_terminal(self) -> bool:
        return self._state in TERMINAL_STATES

    @property
    def is_active(self) -> bool:
        return self._state in ACTIVE_STATES

    @property
    def status(self) -> str:
        """Legacy status string for backward compatibility."""
        return _STATE_TO_LEGACY.get(self._state, "running")

    @property
    def time_in_state(self) -> float:
        """Seconds spent in the current state."""
        return time.time() - self._entered_at

    def can_transition(self, to: AgentState) -> bool:
        return to in VALID_TRANSITIONS.get(self._state, frozenset())

    def transition(self, to: AgentState, reason: str = "") -> StateTransition:
        """Transition to a new state. Raises InvalidStateTransition if invalid."""
        if not self.can_transition(to):
            raise InvalidStateTransition(self._state, to)
        old = self._state
        now = time.time()
        record = StateTransition(old, to, now, reason)
        self._state = to
        self._entered_at = now
        self._history.append(record)
        return record

    @property
    def history(self) -> list[StateTransition]:
        return list(self._history)

    @property
    def transition_count(self) -> int:
        return len(self._history)

    def history_as_dicts(self) -> list[dict]:
        """Serialize transition history for API responses."""
        return [
            {
                "from": t.from_state.value,
                "to": t.to_state.value,
                "timestamp": t.timestamp,
                "reason": t.reason,
            }
            for t in self._history
        ]


# Callback types
# iteration_callback: (messages, system_prompt, tools) → LLMResponse-like dict
#   dict with keys: "text" (str), "tool_calls" (list[dict]), "stop_reason" (str)
IterationCallback = Callable[
    [list[dict], str, list[dict]],
    Awaitable[dict],
]

# tool_executor_callback: (tool_name, tool_input) → result string
ToolExecutorCallback = Callable[
    [str, dict],
    Awaitable[str],
]

# announce_callback: DEPRECATED — agents no longer post directly to Discord.
# Kept as optional parameter for API compat (loop_bridge passes it through).
AnnounceCallback = Callable[
    [str, str],
    Awaitable[None],
]


@dataclass
class AgentInfo:
    """Metadata and state for a running agent."""
    id: str
    label: str
    goal: str
    channel_id: str
    requester_id: str
    requester_name: str
    created_at: float = field(default_factory=time.time)
    ended_at: float | None = None
    result: str = ""
    error: str = ""
    messages: list[dict] = field(default_factory=list)
    tools_used: list[str] = field(default_factory=list)
    iteration_count: int = 0
    last_activity: float = field(default_factory=time.time)
    recovery_attempts: int = 0
    depth: int = 0
    parent_id: str | None = None
    children_ids: list[str] = field(default_factory=list)
    _task: asyncio.Task | None = field(default=None, repr=False)
    _cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    _inbox: asyncio.Queue = field(default_factory=asyncio.Queue)
    _sm: AgentStateMachine = field(default_factory=AgentStateMachine)

    @property
    def status(self) -> str:
        """Legacy status string: running/completed/failed/timeout/killed."""
        return self._sm.status

    @property
    def state(self) -> AgentState:
        """Current typed state."""
        return self._sm.state

    @property
    def state_history(self) -> list[StateTransition]:
        return self._sm.history

    def transition(self, to: AgentState, reason: str = "") -> StateTransition:
        """Transition agent state. Logs the transition."""
        record = self._sm.transition(to, reason)
        log.debug(
            "Agent %s (%s): %s → %s%s",
            self.id, self.label,
            record.from_state.value, record.to_state.value,
            f" ({reason})" if reason else "",
        )
        return record


class AgentManager:
    """Manages autonomous agent lifecycle — spawn, message, list, kill, cleanup."""

    def __init__(self) -> None:
        self._agents: dict[str, AgentInfo] = {}
        self._cleanup_tasks: dict[str, asyncio.Task] = {}

    def spawn(
        self,
        label: str,
        goal: str,
        channel_id: str,
        requester_id: str,
        requester_name: str,
        iteration_callback: IterationCallback,
        tool_executor_callback: ToolExecutorCallback,
        announce_callback: AnnounceCallback | None = None,
        tools: list[dict] | None = None,
        system_prompt: str = "",
        tool_timeouts: dict[str, int] | None = None,
        trajectory_saver: AgentTrajectorySaver | None = None,
        parent_id: str | None = None,
        max_depth: int = MAX_NESTING_DEPTH,
    ) -> str:
        """Spawn a new agent. Returns agent_id on success, or 'Error: ...' string."""
        # Check per-channel limit
        channel_count = sum(
            1 for a in self._agents.values()
            if a.channel_id == channel_id and a._sm.is_active
        )
        if channel_count >= MAX_CONCURRENT_AGENTS:
            return f"Error: Maximum concurrent agents ({MAX_CONCURRENT_AGENTS}) reached for this channel."

        if not label or not goal:
            return "Error: Both 'label' and 'goal' are required."

        # Compute depth from parent
        depth = 0
        if parent_id:
            parent = self._agents.get(parent_id)
            if not parent:
                return f"Error: Parent agent '{parent_id}' not found."
            depth = parent.depth + 1
            if depth > max_depth:
                return (
                    f"Error: Maximum nesting depth ({max_depth}) exceeded. "
                    f"Parent '{parent_id}' is at depth {parent.depth}."
                )
            if len(parent.children_ids) >= MAX_CHILDREN_PER_AGENT:
                return (
                    f"Error: Parent agent '{parent_id}' has reached the "
                    f"maximum of {MAX_CHILDREN_PER_AGENT} children."
                )

        agent_id = uuid.uuid4().hex[:8]
        agent = AgentInfo(
            id=agent_id,
            label=label,
            goal=goal,
            channel_id=channel_id,
            requester_id=requester_id,
            requester_name=requester_name,
            depth=depth,
            parent_id=parent_id,
        )

        # Register as child of parent
        if parent_id and parent_id in self._agents:
            self._agents[parent_id].children_ids.append(agent_id)

        # Build agent system prompt
        agent_system = system_prompt
        if agent_system:
            agent_system += "\n\n"
        else:
            agent_system = ""

        can_nest = depth < max_depth
        if can_nest:
            remaining = max_depth - depth
            agent_system += (
                f"AGENT CONTEXT: You are agent '{label}' (depth {depth}). "
                f"You may spawn up to {MAX_CHILDREN_PER_AGENT} sub-agents "
                f"({remaining} nesting level{'s' if remaining != 1 else ''} remaining). "
                f"When done, provide a clear summary of results."
            )
        else:
            agent_system += (
                f"AGENT CONTEXT: You are agent '{label}' (depth {depth}). "
                f"You are at the maximum nesting depth — do NOT spawn sub-agents. "
                f"When done, provide a clear summary of results."
            )

        # Filter tools based on depth
        filtered_tools = filter_agent_tools(tools or [], depth=depth, max_depth=max_depth)

        # Seed messages with the goal
        agent.messages = [{"role": "user", "content": goal}]

        # Start the async task
        task = asyncio.ensure_future(
            _run_agent(
                agent=agent,
                system_prompt=agent_system,
                tools=filtered_tools,
                iteration_callback=iteration_callback,
                tool_executor_callback=tool_executor_callback,
                announce_callback=announce_callback,
                tool_timeouts=tool_timeouts or {},
                trajectory_saver=trajectory_saver,
            )
        )
        agent._task = task
        # Schedule cleanup when the agent task finishes (any exit path)
        task.add_done_callback(lambda _t: self._schedule_cleanup(agent_id))
        self._agents[agent_id] = agent

        log.info(
            "Spawned agent %s (%s) depth=%d for channel %s by %s: %s",
            agent_id, label, depth, channel_id, requester_name, goal[:100],
        )
        return agent_id

    def send(self, agent_id: str, message: str) -> str:
        """Inject a message into a running agent's inbox."""
        agent = self._agents.get(agent_id)
        if not agent:
            return f"Error: Agent '{agent_id}' not found."
        if agent._sm.is_terminal:
            return f"Error: Agent '{agent_id}' is not running (status: {agent.status})."
        if not message:
            return "Error: Message cannot be empty."

        agent._inbox.put_nowait(message)
        log.info("Sent message to agent %s (%s): %s", agent_id, agent.label, message[:80])
        return f"Message delivered to agent '{agent.label}'."

    def list(self, channel_id: str | None = None) -> list[dict]:
        """List agents, optionally filtered by channel."""
        result = []
        for agent in self._agents.values():
            if channel_id and agent.channel_id != channel_id:
                continue
            runtime = (agent.ended_at or time.time()) - agent.created_at
            result.append({
                "id": agent.id,
                "label": agent.label,
                "status": agent.status,
                "state": agent.state.value,
                "iteration_count": agent.iteration_count,
                "runtime_seconds": round(runtime, 1),
                "tools_used": len(agent.tools_used),
                "goal": agent.goal[:100],
                "depth": agent.depth,
                "parent_id": agent.parent_id,
                "children_count": len(agent.children_ids),
            })
        return result

    def kill(self, agent_id: str, cascade: bool = True) -> str:
        """Cancel a running agent. If cascade=True, also kill all descendants."""
        agent = self._agents.get(agent_id)
        if not agent:
            return f"Error: Agent '{agent_id}' not found."
        if agent._sm.is_terminal:
            return f"Agent '{agent_id}' already in terminal state: {agent.status}."

        killed_ids = [agent_id]
        agent._cancel_event.set()

        if cascade:
            for desc_id in self.get_descendants(agent_id):
                desc = self._agents.get(desc_id)
                if desc and desc._sm.is_active:
                    desc._cancel_event.set()
                    killed_ids.append(desc_id)

        log.info(
            "Kill signal sent to agent %s (%s) and %d descendants",
            agent_id, agent.label, len(killed_ids) - 1,
        )
        if len(killed_ids) == 1:
            return f"Kill signal sent to agent '{agent.label}'."
        return (
            f"Kill signal sent to agent '{agent.label}' "
            f"and {len(killed_ids) - 1} descendant(s)."
        )

    def get_results(self, agent_id: str) -> dict | None:
        """Get structured results of an agent."""
        agent = self._agents.get(agent_id)
        if not agent:
            return None

        runtime = (agent.ended_at or time.time()) - agent.created_at
        return {
            "id": agent.id,
            "label": agent.label,
            "status": agent.status,
            "state": agent.state.value,
            "result": agent.result,
            "error": agent.error,
            "iteration_count": agent.iteration_count,
            "tools_used": agent.tools_used,
            "runtime_seconds": round(runtime, 1),
            "goal": agent.goal,
            "recovery_attempts": agent.recovery_attempts,
            "state_history": agent._sm.history_as_dicts(),
            "depth": agent.depth,
            "parent_id": agent.parent_id,
            "children_ids": list(agent.children_ids),
        }

    def get_children(self, agent_id: str) -> list[dict]:
        """Get results of all direct children of an agent."""
        agent = self._agents.get(agent_id)
        if not agent:
            return []
        results = []
        for child_id in agent.children_ids:
            r = self.get_results(child_id)
            if r:
                results.append(r)
        return results

    def get_lineage(self, agent_id: str) -> list[str]:
        """Get the chain of parent IDs from root to this agent (inclusive)."""
        lineage: list[str] = []
        current = agent_id
        visited: set[str] = set()
        while current and current not in visited:
            visited.add(current)
            lineage.append(current)
            agent = self._agents.get(current)
            if not agent or not agent.parent_id:
                break
            current = agent.parent_id
        lineage.reverse()
        return lineage

    def get_descendants(self, agent_id: str) -> list[str]:
        """Get all descendant agent IDs (children, grandchildren, etc.)."""
        agent = self._agents.get(agent_id)
        if not agent:
            return []
        descendants: list[str] = []
        queue = deque(agent.children_ids)
        visited: set[str] = set()
        while queue:
            child_id = queue.popleft()
            if child_id in visited:
                continue
            visited.add(child_id)
            descendants.append(child_id)
            child = self._agents.get(child_id)
            if child:
                queue.extend(child.children_ids)
        return descendants

    async def wait_for_agents(
        self,
        agent_ids: list[str],
        timeout: float = WAIT_DEFAULT_TIMEOUT,
        poll_interval: float = WAIT_POLL_INTERVAL,
    ) -> dict[str, dict]:
        """Wait for all specified agents to reach terminal state.

        Returns {agent_id: results_dict} for each agent. Agents not found
        are reported as {"status": "not_found", "error": "..."}.
        """
        if not agent_ids:
            return {}

        deadline = time.time() + timeout
        while time.time() < deadline:
            all_done = True
            for aid in agent_ids:
                agent = self._agents.get(aid)
                if agent and agent._sm.is_active:
                    all_done = False
                    break
            if all_done:
                break
            remaining = deadline - time.time()
            if remaining <= 0:
                break
            await asyncio.sleep(min(poll_interval, remaining))

        # Collect results
        results: dict[str, dict] = {}
        for aid in agent_ids:
            r = self.get_results(aid)
            if r:
                results[aid] = r
            else:
                results[aid] = {
                    "id": aid,
                    "status": "not_found",
                    "error": f"Agent '{aid}' not found.",
                }

        still_running = [
            aid for aid, r in results.items() if r.get("status") == "running"
        ]
        if still_running:
            log.warning(
                "wait_for_agents timed out with %d still running: %s",
                len(still_running), still_running,
            )

        return results

    def spawn_group(
        self,
        tasks: list[dict],
        channel_id: str,
        requester_id: str,
        requester_name: str,
        iteration_callback: IterationCallback,
        tool_executor_callback: ToolExecutorCallback,
        announce_callback: AnnounceCallback | None = None,
        tools: list[dict] | None = None,
        system_prompt: str = "",
    ) -> list[str]:
        """Spawn multiple agents at once. Returns list of agent_ids (or error strings).

        Each task dict must have 'label' and 'goal' keys.
        """
        ids: list[str] = []
        for task in tasks:
            label = task.get("label", "")
            goal = task.get("goal", "")
            aid = self.spawn(
                label=label,
                goal=goal,
                channel_id=channel_id,
                requester_id=requester_id,
                requester_name=requester_name,
                iteration_callback=iteration_callback,
                tool_executor_callback=tool_executor_callback,
                announce_callback=announce_callback,
                tools=tools,
                system_prompt=system_prompt,
            )
            ids.append(aid)
        return ids

    async def cleanup(self) -> int:
        """Remove agents that have been in terminal state for > CLEANUP_DELAY. Returns count removed."""
        now = time.time()
        to_remove = []
        for agent_id, agent in self._agents.items():
            if agent._sm.is_terminal:
                if agent.ended_at and (now - agent.ended_at) > CLEANUP_DELAY:
                    to_remove.append(agent_id)

        for agent_id in to_remove:
            del self._agents[agent_id]
            # Cancel cleanup task if one exists
            ct = self._cleanup_tasks.pop(agent_id, None)
            if ct and not ct.done():
                ct.cancel()

        if to_remove:
            log.info("Cleaned up %d finished agents", len(to_remove))
        return len(to_remove)

    def _schedule_cleanup(self, agent_id: str) -> None:
        """Schedule cleanup of an agent after CLEANUP_DELAY."""
        async def _delayed_cleanup():
            await asyncio.sleep(CLEANUP_DELAY)
            agent = self._agents.pop(agent_id, None)
            self._cleanup_tasks.pop(agent_id, None)
            if agent:
                log.debug("Auto-cleaned agent %s (%s)", agent_id, agent.label)

        task = asyncio.ensure_future(_delayed_cleanup())
        self._cleanup_tasks[agent_id] = task

    def check_health(self) -> dict:
        """Check agent health: force-kill stuck agents, log stale ones.

        Safety net for agents stuck in long tool calls that bypass the
        per-iteration lifetime check. Returns {"killed": N, "stale": N}.
        """
        now = time.time()
        killed = 0
        stale = 0
        for agent in list(self._agents.values()):
            if agent._sm.is_terminal:
                continue
            elapsed = now - agent.created_at
            idle = now - agent.last_activity
            if elapsed > MAX_AGENT_LIFETIME:
                agent._cancel_event.set()
                killed += 1
                log.warning(
                    "Force-killed stuck agent %s (%s): lifetime exceeded (%ds)",
                    agent.id, agent.label, int(elapsed),
                )
            elif idle > STALE_WARN_SECONDS:
                stale += 1
                log.warning(
                    "Agent %s (%s) appears stale: %ds idle",
                    agent.id, agent.label, int(idle),
                )
        return {"killed": killed, "stale": stale}

    @property
    def active_count(self) -> int:
        return sum(1 for a in self._agents.values() if a._sm.is_active)

    @property
    def total_count(self) -> int:
        return len(self._agents)


async def _run_agent(
    agent: AgentInfo,
    system_prompt: str,
    tools: list[dict],
    iteration_callback: IterationCallback,
    tool_executor_callback: ToolExecutorCallback,
    announce_callback: AnnounceCallback | None = None,
    tool_timeouts: dict[str, int] | None = None,
    trajectory_saver: AgentTrajectorySaver | None = None,
) -> None:
    """Execute an agent's tool loop until completion, error, or timeout.

    Uses the AgentStateMachine to enforce valid lifecycle transitions:
    SPAWNING → READY → EXECUTING → READY (loop) or → terminal.
    On transient LLM errors, transitions through RECOVERING for one retry.
    """
    trajectory = AgentTrajectoryTurn(
        agent_id=agent.id,
        label=agent.label,
        goal=agent.goal,
        channel_id=agent.channel_id,
        requester_id=agent.requester_id,
        requester_name=agent.requester_name,
        depth=agent.depth,
        parent_id=agent.parent_id,
        system_prompt_length=len(system_prompt),
    )
    agent_start = time.time()

    def _check_kill() -> bool:
        if agent._cancel_event.is_set():
            if agent._sm.is_terminal:
                return True
            try:
                agent.transition(AgentState.KILLED, "cancel signal")
            except InvalidStateTransition:
                log.warning("Agent %s: kill during state %s, forcing terminal", agent.id, agent._sm.state.value)
                agent._sm._state = AgentState.KILLED
            agent.ended_at = time.time()
            log.info("Agent %s (%s) killed after %ds", agent.id, agent.label, int(time.time() - agent.created_at))
            return True
        return False

    def _check_lifetime() -> bool:
        elapsed = time.time() - agent.created_at
        if elapsed > MAX_AGENT_LIFETIME:
            agent.transition(AgentState.TIMEOUT, f"lifetime exceeded ({int(elapsed)}s)")
            agent.result = _get_last_progress(agent)
            agent.ended_at = time.time()
            log.warning("Agent %s (%s) timed out after %ds, %d iterations", agent.id, agent.label, int(elapsed), agent.iteration_count)
            return True
        return False

    try:
        # Transition from SPAWNING → READY
        agent.transition(AgentState.READY, "initialization complete")

        for iteration in range(MAX_AGENT_ITERATIONS):
            if _check_kill():
                return
            if _check_lifetime():
                return

            # Check inbox for injected messages
            while not agent._inbox.empty():
                try:
                    msg = agent._inbox.get_nowait()
                    agent.messages.append({
                        "role": "user",
                        "content": f"[Message from parent] {msg}",
                    })
                    log.debug("Agent %s received inbox message", agent.id)
                except asyncio.QueueEmpty:
                    break

            # Transition READY → EXECUTING for LLM call
            agent.transition(AgentState.EXECUTING, f"iteration {iteration + 1}")
            agent.last_activity = time.time()
            agent.iteration_count = iteration + 1
            agent.recovery_attempts = 0  # per-iteration recovery budget
            iter_start = time.time()

            # Call LLM with recovery support
            response = await _call_llm_with_recovery(
                agent, iteration_callback, system_prompt, tools,
            )
            if response is None:
                # Terminal state already set by recovery logic
                return

            text = response.get("text", "")
            tool_calls = response.get("tool_calls", [])

            # Append assistant response to messages
            agent.messages.append({"role": "assistant", "content": text})

            # No tool calls = agent is done
            if not tool_calls:
                trajectory.add_iteration(
                    iteration=iteration + 1,
                    llm_text=text,
                    duration_ms=int((time.time() - iter_start) * 1000),
                )
                agent.transition(AgentState.COMPLETED, "no more tool calls")
                agent.result = text
                agent.ended_at = time.time()
                elapsed = time.time() - agent.created_at
                log.info("Agent %s (%s) completed in %ds, %d tool calls", agent.id, agent.label, int(elapsed), len(agent.tools_used))
                return

            # Execute tool calls
            iter_tool_calls: list[dict] = []
            iter_tool_results: list[dict] = []
            for tc in tool_calls:
                tool_name = tc.get("name", "")
                tool_input = tc.get("input", {})

                if tool_name not in agent.tools_used:
                    agent.tools_used.append(tool_name)

                agent.last_activity = time.time()
                iter_tool_calls.append({"name": tool_name, "input": tool_input})

                tool_timeout = (tool_timeouts or {}).get(tool_name, TOOL_EXEC_TIMEOUT)
                try:
                    result = await asyncio.wait_for(
                        tool_executor_callback(tool_name, tool_input),
                        timeout=tool_timeout,
                    )
                    result = scrub_output_secrets(str(result))
                except asyncio.TimeoutError:
                    result = f"Error: Tool '{tool_name}' timed out after {tool_timeout}s"
                    log.warning("Agent %s tool %s timed out", agent.id, tool_name)
                except Exception as e:
                    result = f"Error: {e}"
                    log.warning("Agent %s tool %s failed: %s", agent.id, tool_name, e)

                iter_tool_results.append({"name": tool_name, "result": result})

                # Append tool result to messages
                agent.messages.append({
                    "role": "user",
                    "content": f"[Tool result: {tool_name}]\n{result}",
                })

            trajectory.add_iteration(
                iteration=iteration + 1,
                tool_calls=iter_tool_calls,
                tool_results=iter_tool_results,
                llm_text=text,
                duration_ms=int((time.time() - iter_start) * 1000),
            )

            # Back to READY for next iteration
            agent.transition(AgentState.READY, "tools complete")

            # Check stale warning
            if time.time() - agent.last_activity > STALE_WARN_SECONDS:
                log.warning(
                    "Agent %s (%s) has been idle for >%ds",
                    agent.id, agent.label, STALE_WARN_SECONDS,
                )

        # Exhausted iterations — transition from READY → COMPLETED
        agent.transition(AgentState.COMPLETED, f"max iterations ({MAX_AGENT_ITERATIONS}) reached")
        agent.result = _get_last_progress(agent)
        agent.ended_at = time.time()
        elapsed = time.time() - agent.created_at
        log.info("Agent %s (%s) completed in %ds after %d iterations (max reached), %d tool calls", agent.id, agent.label, int(elapsed), MAX_AGENT_ITERATIONS, len(agent.tools_used))

    except asyncio.CancelledError:
        if not agent._sm.is_terminal:
            agent.transition(AgentState.KILLED, "task cancelled")
        agent.ended_at = time.time()
        log.info("Agent %s (%s) was cancelled", agent.id, agent.label)

    except Exception as e:
        if not agent._sm.is_terminal:
            agent.transition(AgentState.FAILED, f"unhandled: {e}")
        agent.error = str(e)
        agent.ended_at = time.time()
        log.error("Agent %s (%s) crashed: %s", agent.id, agent.label, e)

    finally:
        trajectory.finalize(
            final_state=agent.state.value,
            result=agent.result,
            error=agent.error,
            tools_used=list(agent.tools_used),
            iteration_count=agent.iteration_count,
            recovery_attempts=agent.recovery_attempts,
            state_history=agent._sm.history_as_dicts(),
            total_duration_ms=int((time.time() - agent_start) * 1000),
        )
        if trajectory_saver:
            try:
                await trajectory_saver.save(trajectory)
            except Exception as save_err:
                log.error("Failed to save agent trajectory for %s: %s", agent.id, save_err)


async def _call_llm_with_recovery(
    agent: AgentInfo,
    iteration_callback: IterationCallback,
    system_prompt: str,
    tools: list[dict],
) -> dict | None:
    """Call LLM with single-retry recovery on transient errors.

    On first failure: EXECUTING → RECOVERING → EXECUTING (retry).
    On second failure: EXECUTING → FAILED.
    Returns the LLM response dict, or None if agent reached terminal state.
    """
    try:
        return await asyncio.wait_for(
            iteration_callback(agent.messages, system_prompt, tools),
            timeout=ITERATION_CB_TIMEOUT,
        )
    except (asyncio.TimeoutError, Exception) as first_err:
        is_timeout = isinstance(first_err, asyncio.TimeoutError)
        err_desc = f"LLM {'timeout' if is_timeout else 'error'}: {first_err}" if not is_timeout else f"LLM timeout after {ITERATION_CB_TIMEOUT}s"

        if agent.recovery_attempts < MAX_RECOVERY_ATTEMPTS:
            agent.recovery_attempts += 1
            agent.transition(AgentState.RECOVERING, err_desc)
            log.warning("Agent %s recovering (attempt %d): %s", agent.id, agent.recovery_attempts, err_desc)

            # Brief pause before retry
            await asyncio.sleep(1)

            agent.transition(AgentState.EXECUTING, "retry after recovery")

            try:
                return await asyncio.wait_for(
                    iteration_callback(agent.messages, system_prompt, tools),
                    timeout=ITERATION_CB_TIMEOUT,
                )
            except (asyncio.TimeoutError, Exception) as retry_err:
                retry_desc = f"retry failed: {retry_err}"
                log.error("Agent %s recovery failed: %s", agent.id, retry_desc)
                agent.transition(AgentState.FAILED, retry_desc)
                agent.error = str(retry_err)
                agent.ended_at = time.time()
                return None
        else:
            log.error("Agent %s LLM call failed (no retries left): %s", agent.id, err_desc)
            agent.transition(AgentState.FAILED, err_desc)
            agent.error = str(first_err)
            agent.ended_at = time.time()
            return None


def _get_last_progress(agent: AgentInfo) -> str:
    """Extract the last meaningful text from agent messages."""
    for msg in reversed(agent.messages):
        if msg["role"] == "assistant" and msg.get("content"):
            return msg["content"]
    return "(no output)"
