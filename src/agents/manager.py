"""Agent manager — spawn, track, and coordinate autonomous agents.

Each agent runs as an independent asyncio task with its own LLM session,
isolated message history, and full tool access. Agents may spawn sub-agents
up to a configurable nesting depth (default 2).
"""

from __future__ import annotations

import asyncio
import builtins
import time
import uuid
from collections import deque
from collections.abc import Awaitable, Callable
from copy import deepcopy
from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol

from ..discord.tool_loop_helpers import _scrub_tool_input_for_storage
from ..error_presentation import format_user_facing_error
from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger
from ..tools.result_validator import ToolResult
from .trajectory import AgentTrajectorySaver, AgentTrajectoryTurn
from .wait_deadlines import (
    WAIT_FOR_AGENTS_NESTED_GRACE_SECONDS,
    wait_for_agents_wrapper_timeout,
)

log = get_logger("agents")

# --- Constants ---
MAX_CONCURRENT_AGENTS = 5  # per channel
MAX_AGENT_LIFETIME = 3600  # 1 hour
MAX_AGENT_ITERATIONS = 120  # LLM turns per agent (default, overridable via config/spawn)
STALE_WARN_SECONDS = 120  # 2 min no activity → log warning
CLEANUP_DELAY = 300  # 5 min after terminal state → remove
WAIT_DEFAULT_TIMEOUT = 300  # default timeout for wait_for_agents
WAIT_POLL_INTERVAL = 2  # poll interval for wait_for_agents
ITERATION_CB_TIMEOUT = 120  # 2 min timeout per LLM call
TOOL_EXEC_TIMEOUT = 300  # 5 min timeout per tool execution
# (The manager-level MAX_RECOVERY_ATTEMPTS retry ladder was removed
# 2026-07-30: transient-failure recovery now lives inside the iteration
# callback via src/llm/recovery.py. AgentInfo.recovery_attempts remains for
# API/trajectory shape compatibility and stays 0.)
MAX_NESTING_DEPTH = 2  # default max sub-agent depth (root=0)
MAX_CHILDREN_PER_AGENT = 3  # fallback direct-child limit (config overrides at spawn)
TREE_MAX_AGENTS = 25  # hard ceiling on agents in one tree's lifetime —
# breadth x depth must never compound into a
# geometric invoice, whatever config says

# --- Agent context-overflow recovery (design settled with Odin, 2026-08-09;
# per-model budgets since the context-budget campaign, 2026-08-17) ---
# Targets and rescue ladders come from the shared per-model resolver
# (src/llm/context_budget.py): each logical generation resolves the
# EFFECTIVE agent model's snapshot via the spawn-provided callback, so a
# sol-class agent works a sol-class budget while gpt-5.5 keeps the proven
# 272K-class math. When no provider is wired (legacy/direct construction,
# non-codex paths) the unknown-model snapshot reproduces the pre-campaign
# conservative budget behavior. The old private constants are gone: their
# "never config" rationale was retired by this recovery machinery itself —
# wrong-high is one rejected request plus an in-flight rescue, not a
# terminal failure.


def _fallback_budget_snapshot():
    from ..llm.context_budget import resolve_context_budget

    return resolve_context_budget(None)


def _is_context_overflow(exc: BaseException) -> bool:
    """Structural check for the provider-reported context overflow class."""
    from ..llm.errors import LLMRequestError

    return (
        isinstance(exc, LLMRequestError) and getattr(exc, "code", None) == "context_length_exceeded"
    )


# Agent-management tools — allowed or blocked based on nesting depth
AGENT_MANAGEMENT_TOOLS = frozenset(
    {
        "spawn_agent",
        "send_to_agent",
        "list_agents",
        "kill_agent",
        "get_agent_results",
        "wait_for_agents",
    }
)

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


class AgentState(str, Enum):  # noqa: UP042 — str(member) output differs under StrEnum; deferred to a typed-verification pass
    """Typed lifecycle states for agent workers."""

    SPAWNING = "spawning"
    READY = "ready"
    EXECUTING = "executing"
    RECOVERING = "recovering"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    KILLED = "killed"


TERMINAL_STATES = frozenset(
    {
        AgentState.COMPLETED,
        AgentState.FAILED,
        AgentState.TIMEOUT,
        AgentState.KILLED,
    }
)

ACTIVE_STATES = frozenset(
    {
        AgentState.SPAWNING,
        AgentState.READY,
        AgentState.EXECUTING,
        AgentState.RECOVERING,
    }
)

VALID_TRANSITIONS: dict[AgentState, frozenset[AgentState]] = {
    AgentState.SPAWNING: frozenset(
        {
            AgentState.READY,
            AgentState.KILLED,
            AgentState.FAILED,
            AgentState.TIMEOUT,
        }
    ),
    AgentState.READY: frozenset(
        {
            AgentState.EXECUTING,
            AgentState.COMPLETED,
            AgentState.KILLED,
            AgentState.TIMEOUT,
        }
    ),
    AgentState.EXECUTING: frozenset(
        {
            AgentState.READY,
            AgentState.RECOVERING,
            AgentState.COMPLETED,
            AgentState.FAILED,
            AgentState.KILLED,
            AgentState.TIMEOUT,
        }
    ),
    AgentState.RECOVERING: frozenset(
        {
            AgentState.EXECUTING,
            AgentState.FAILED,
            AgentState.KILLED,
            AgentState.TIMEOUT,
        }
    ),
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


class InvalidStateTransition(Exception):  # noqa: N818 — established public exception name; rename is an API break
    """Raised when an invalid state transition is attempted."""

    def __init__(self, from_state: AgentState, to_state: AgentState) -> None:
        self.from_state = from_state
        self.to_state = to_state
        super().__init__(f"Invalid state transition: {from_state.value} → {to_state.value}")


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
class IterationCallback(Protocol):
    """Required callback contract for one logical agent generation.

    ``generation_state`` is a manager-owned, per-generation channel reused by
    every physical attempt and emergency rescue retry. Three-argument
    callbacks are no longer supported: silently omitting this channel would
    make request identity and context-budget snapshots impossible to freeze.
    """

    def __call__(
        self,
        messages: list[dict],
        sys_prompt: str,
        tool_defs: list[dict],
        *,
        generation_state: dict,
    ) -> Awaitable[dict]: ...


# tool_executor_callback preserves ToolResult structured failure/audit state.
ToolExecutorCallback = Callable[
    [str, dict],
    Awaitable[str | ToolResult],
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
    # Context-overflow recovery (agent-local, lifetime-only): after the first
    # real overflow, the ceiling latches to the size that SUCCEEDED so later
    # iterations compact BEFORE sending instead of paying a doomed 400. Never
    # persisted, never config — dies with the agent.
    context_char_ceiling: int | None = None
    context_recoveries: list[dict] = field(default_factory=list)
    _accepted_usage_facts: dict = field(default_factory=dict, repr=False)
    # Snapshotted at spawn — a live config change never shortens (or extends)
    # an already-running agent's deadline or per-call budget.
    iteration_timeout: float = ITERATION_CB_TIMEOUT
    max_lifetime: float = MAX_AGENT_LIFETIME
    # Per-spawn LLM overrides (the parent explicitly chose a model/effort for
    # THIS agent). None = inherit the configured agent defaults. Recorded on
    # the trajectory so an override is distinguishable from an inherited value;
    # the actual request policy is resolved by the iteration callback.
    model_override: str | None = None
    reasoning_effort_override: str | None = None
    # LAST EXECUTED provenance, stamped from each LLM response (the same
    # values the trajectory records). Empty until the first generation
    # completes — operator surfaces must then qualify what they show as the
    # REQUESTED policy rather than presenting it as execution truth.
    last_provider: str = ""
    last_model: str = ""
    last_reasoning_effort: str | None = None
    # Set once a generation has actually completed, INDEPENDENT of whether the
    # response carried provenance: a missing model must read as "executed,
    # provider didn't say" rather than "never ran" (which would let a display
    # fall back to live config and present it as history).
    has_executed: bool = False
    # The iteration cap this agent actually runs under, snapshotted at spawn
    # (chat/scheduled/hard limits differ) so progress can be computed honestly
    # instead of against a hardcoded guess.
    max_iterations: int = MAX_AGENT_ITERATIONS
    # Lifetime direct-child and depth limits, snapshotted from config when
    # the ROOT of the tree was spawned. Every descendant inherits the root's
    # values, so a live config change never changes the rules under a running
    # tree. The agent's own prompt advertises these same effective limits.
    max_children: int = MAX_CHILDREN_PER_AGENT
    max_depth: int = MAX_NESTING_DEPTH
    # Root of this agent's tree (self for roots) — the unit the tree-lifetime
    # agent cap is enforced against.
    root_id: str = ""
    depth: int = 0
    parent_id: str | None = None
    # Originating main-turn identity. Children inherit it; channel/requester
    # are intentionally not used because they span unrelated turns.
    turn_id: str | None = None
    children_ids: list[str] = field(default_factory=list)
    _task: asyncio.Task | None = field(default=None, repr=False)
    _cancel_event: asyncio.Event | None = field(default=None, repr=False)
    _inbox: asyncio.Queue | None = field(default=None, repr=False)
    _sm: AgentStateMachine = field(default_factory=AgentStateMachine)

    def __post_init__(self) -> None:
        """Create event-loop-bound primitives at runtime, not at class-def time."""
        if self._cancel_event is None:
            self._cancel_event = asyncio.Event()
        if self._inbox is None:
            self._inbox = asyncio.Queue()

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
            self.id,
            self.label,
            record.from_state.value,
            record.to_state.value,
            f" ({reason})" if reason else "",
        )
        return record


class AgentManager:
    """Manages autonomous agent lifecycle — spawn, message, list, kill, cleanup."""

    def __init__(
        self,
        max_concurrent_agents_provider: Callable[[], int | None] | None = None,
    ) -> None:
        self._agents: dict[str, AgentInfo] = {}
        # Admission reads this provider for every spawn. The callable is bound
        # to the bot's live config root in production, so a save affects new
        # spawns without changing agents already admitted. None preserves the
        # historical constant for standalone/test managers.
        self._max_concurrent_agents_provider = max_concurrent_agents_provider
        self._cleanup_tasks: dict[str, asyncio.Task] = {}
        # Lifetime spawn count per tree, keyed by root id. Deliberately NOT
        # derived from the registry: cleanup removes finished agents, and a
        # registry count would let a tree spend its budget in waves forever.
        # Entries are pruned only when the tree has no registered members
        # left (nothing can spawn into it again — parents must exist).
        self._tree_spawn_counts: dict[str, int] = {}
        # Installed by the composition root once the observer exists. Only
        # used to release a finished agent's workload-local calibration; the
        # manager never reads calibration itself.
        self._window_observer: object | None = None

    def set_calibration_observer(self, observer: object | None) -> None:
        """Install the window observer so finished agents release their scope."""
        self._window_observer = observer

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
        tools: builtins.list[dict] | None = None,
        system_prompt: str = "",
        tool_timeouts: dict[str, int] | None = None,
        trajectory_saver: AgentTrajectorySaver | None = None,
        parent_id: str | None = None,
        max_depth: int = MAX_NESTING_DEPTH,
        max_children: int | None = None,
        max_iterations: int | None = None,
        budget_warnings: builtins.list[int] | None = None,
        iteration_timeout: float | None = None,
        max_lifetime: float | None = None,
        model_override: str | None = None,
        reasoning_effort_override: str | None = None,
        context_compression_enabled: bool = False,
        max_context_chars: int = 750000,
        keep_recent_iterations: int = 30,
        budget_snapshot_provider: Callable | None = None,
        generation_plan_provider: Callable | None = None,
        evidence_recorder: Callable | None = None,
        density_recorder: Callable | None = None,
        turn_id: str | None = None,
    ) -> str:
        """Spawn a new agent. Returns agent_id on success, or 'Error: ...' string.

        ``generation_plan_provider`` captures the authoritative serving
        identity and ContextBudgetSnapshot once before pre-send compaction;
        that exact plan is threaded through every physical attempt and rescue.
        ``budget_snapshot_provider`` remains a compatibility fallback for
        standalone callers that do not own a full serving identity. The
        iteration callback must implement the required ``generation_state=``
        channel.
        """
        # Check the live per-channel admission limit. Existing agents are
        # never evicted when the setting falls; only subsequent spawns see it.
        configured_limit = (
            self._max_concurrent_agents_provider()
            if self._max_concurrent_agents_provider is not None
            else None
        )
        concurrent_limit = (
            configured_limit if configured_limit is not None else MAX_CONCURRENT_AGENTS
        )
        channel_count = sum(
            1 for a in self._agents.values() if a.channel_id == channel_id and a._sm.is_active
        )
        if channel_count >= concurrent_limit:
            return (
                f"Error: Maximum concurrent agents ({concurrent_limit}) reached for this channel."
            )

        if not label or not goal:
            return "Error: Both 'label' and 'goal' are required."

        # Compute depth from parent
        depth = 0
        if parent_id:
            parent = self._agents.get(parent_id)
            if not parent:
                return f"Error: Parent agent '{parent_id}' not found."
            depth = parent.depth + 1
            # The root's depth snapshot governs every descendant. The
            # caller-supplied max_depth is only meaningful when starting a
            # new root; rereading live config here would split one tree across
            # two different limits.
            if depth > parent.max_depth:
                return (
                    f"Error: Maximum nesting depth ({parent.max_depth}) exceeded. "
                    f"Parent '{parent_id}' is at depth {parent.depth}."
                )
            # The PARENT's snapshot governs — taken from config when its
            # tree's root spawned. A live config change applies to the next
            # tree, never to one already running. Counts children ever
            # spawned (lifetime), not merely concurrent.
            if len(parent.children_ids) >= parent.max_children:
                return (
                    f"Error: Parent agent '{parent_id}' has reached the "
                    f"maximum of {parent.max_children} children."
                )
            tree_root = parent.root_id or parent.id
            # Lifetime counter, never the registry: cleanup shrinks the
            # registry, and counting it would let a tree respawn its whole
            # budget every cleanup cycle — the exact geometric invoice the
            # cap exists to prevent.
            tree_spawned = self._tree_spawn_counts.get(tree_root, 0)
            if tree_spawned >= TREE_MAX_AGENTS:
                return (
                    f"Error: This agent tree has reached the lifetime "
                    f"maximum of {TREE_MAX_AGENTS} agents."
                )

        agent_id = uuid.uuid4().hex[:8]
        agent = AgentInfo(
            id=agent_id,
            label=label,
            goal=goal,
            channel_id=channel_id,
            requester_id=requester_id,
            requester_name=requester_name,
            turn_id=(self._agents[parent_id].turn_id if parent_id else turn_id),
            depth=depth,
            parent_id=parent_id,
            iteration_timeout=iteration_timeout or ITERATION_CB_TIMEOUT,
            max_lifetime=max_lifetime or MAX_AGENT_LIFETIME,
            model_override=model_override,
            reasoning_effort_override=reasoning_effort_override,
            max_iterations=max_iterations or MAX_AGENT_ITERATIONS,
            max_children=(
                self._agents[parent_id].max_children
                if parent_id and parent_id in self._agents
                else (max_children or MAX_CHILDREN_PER_AGENT)
            ),
            max_depth=(
                self._agents[parent_id].max_depth
                if parent_id and parent_id in self._agents
                else max_depth
            ),
            root_id=(
                (self._agents[parent_id].root_id or parent_id)
                if parent_id and parent_id in self._agents
                else ""
            ),
        )
        if not agent.root_id:
            agent.root_id = agent_id

        # Register as child of parent
        if parent_id and parent_id in self._agents:
            self._agents[parent_id].children_ids.append(agent_id)

        # Build agent system prompt
        agent_system = system_prompt
        if agent_system:
            agent_system += "\n\n"
        else:
            agent_system = ""

        can_nest = depth < agent.max_depth
        if can_nest:
            remaining = agent.max_depth - depth
            agent_system += (
                f"AGENT CONTEXT: You are agent '{label}' (depth {depth}). "
                f"You may spawn up to {agent.max_children} sub-agents "
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
        filtered_tools = filter_agent_tools(tools or [], depth=depth, max_depth=agent.max_depth)

        # Seed messages with the goal
        agent.messages = [{"role": "user", "content": goal}]

        # Start the async task. The cap the worker enforces IS the value
        # snapshotted on the agent — one source, so a progress display can
        # never drift from the limit actually in force.
        effective_max_iter = agent.max_iterations
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
                max_iterations=effective_max_iter,
                budget_warnings=budget_warnings or [20, 10, 5, 1],
                context_compression_enabled=context_compression_enabled,
                max_context_chars=max_context_chars,
                keep_recent_iterations=keep_recent_iterations,
                budget_snapshot_provider=budget_snapshot_provider,
                generation_plan_provider=generation_plan_provider,
                evidence_recorder=evidence_recorder,
                density_recorder=density_recorder,
            )
        )
        agent._task = task
        # Schedule cleanup when the agent task finishes (any exit path)
        task.add_done_callback(lambda _t: self._schedule_cleanup(agent_id))
        self._agents[agent_id] = agent
        self._tree_spawn_counts[agent.root_id] = self._tree_spawn_counts.get(agent.root_id, 0) + 1

        log.info(
            "Spawned agent %s (%s) depth=%d for channel %s by %s: %s",
            agent_id,
            label,
            depth,
            channel_id,
            requester_name,
            goal[:100],
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

        agent._inbox.put_nowait(message)  # type: ignore[union-attr]  # __post_init__ always sets it
        log.info("Sent message to agent %s (%s): %s", agent_id, agent.label, message[:80])
        return f"Message delivered to agent '{agent.label}'."

    def list(self, channel_id: str | None = None) -> list[dict]:
        """List agents, optionally filtered by channel."""
        result = []
        for agent in self._agents.values():
            if channel_id and agent.channel_id != channel_id:
                continue
            runtime = (agent.ended_at or time.time()) - agent.created_at
            result.append(
                {
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
                }
            )
        return result

    @staticmethod
    def _force_cancel(agent: AgentInfo) -> None:
        """Signal cooperative stop AND cancel the task.

        The cancel event alone is only checked between iterations, so an
        agent stuck in a long tool call ignored a "kill" for up to
        TOOL_EXEC_TIMEOUT (300s) — the log said "killed" while the agent ran
        on. Cancelling the task interrupts the in-flight await; the agent
        run's `except CancelledError` + `finally` still finalize the
        trajectory cleanly.
        """
        agent._cancel_event.set()  # type: ignore[union-attr]  # __post_init__ always sets it
        task = getattr(agent, "_task", None)
        if task is not None and not task.done():
            task.cancel()

    def kill_for_turn(self, turn_id: str) -> builtins.list[str]:
        """Cancel exactly the active agents spawned by one main tool-loop turn."""
        killed: builtins.list[str] = []
        for agent in tuple(self._agents.values()):
            if agent.turn_id == turn_id and agent._sm.is_active:
                self._force_cancel(agent)
                killed.append(agent.id)
        if killed:
            log.info("Killed %d agent(s) for stopped turn %s", len(killed), turn_id)
        return killed

    def kill(self, agent_id: str, cascade: bool = True) -> str:
        """Cancel a running agent. If cascade=True, also kill all descendants."""
        agent = self._agents.get(agent_id)
        if not agent:
            return f"Error: Agent '{agent_id}' not found."
        if agent._sm.is_terminal:
            return f"Agent '{agent_id}' already in terminal state: {agent.status}."

        killed_ids = [agent_id]
        self._force_cancel(agent)

        if cascade:
            for desc_id in self.get_descendants(agent_id):
                desc = self._agents.get(desc_id)
                if desc and desc._sm.is_active:
                    self._force_cancel(desc)
                    killed_ids.append(desc_id)

        log.info(
            "Kill signal sent to agent %s (%s) and %d descendants",
            agent_id,
            agent.label,
            len(killed_ids) - 1,
        )
        if len(killed_ids) == 1:
            return f"Kill signal sent to agent '{agent.label}'."
        return f"Kill signal sent to agent '{agent.label}' and {len(killed_ids) - 1} descendant(s)."

    @staticmethod
    def _serialize_result(agent: AgentInfo) -> dict:
        """Serialize an already-owned agent reference without a registry lookup."""
        runtime = (agent.ended_at or time.time()) - agent.created_at
        return {
            "id": agent.id,
            "label": agent.label,
            "status": agent.status,
            "state": agent.state.value,
            "result": agent.result,
            "error": agent.error,
            "iteration_count": agent.iteration_count,
            "tools_used": list(agent.tools_used),
            "runtime_seconds": round(runtime, 1),
            "goal": agent.goal,
            "recovery_attempts": agent.recovery_attempts,
            **(
                {
                    "context_char_ceiling": agent.context_char_ceiling,
                    "context_recoveries": deepcopy(agent.context_recoveries),
                }
                if agent.context_recoveries
                else {}
            ),
            "state_history": agent._sm.history_as_dicts(),
            "depth": agent.depth,
            "parent_id": agent.parent_id,
            "turn_id": agent.turn_id,
            "children_ids": list(agent.children_ids),
        }

    def get_results(self, agent_id: str) -> dict | None:
        """Get structured results of an agent retained in the live registry."""
        agent = self._agents.get(agent_id)
        if not agent:
            return None
        return self._serialize_result(agent)

    def get_children(self, agent_id: str) -> builtins.list[dict]:
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

    def get_lineage(self, agent_id: str) -> builtins.list[str]:
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

    def get_descendants(self, agent_id: str) -> builtins.list[str]:
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
        agent_ids: builtins.list[str],
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
        captured: dict[str, dict] = {}
        pending = set(agent_ids)
        while True:
            # Once this wait observes a terminal outcome, that snapshot belongs
            # to the wait. Registry cleanup must not retroactively erase it.
            any_active = False
            for aid in tuple(pending):
                agent = self._agents.get(aid)
                if agent is None:
                    continue
                if agent._sm.is_terminal:
                    captured[aid] = self._serialize_result(agent)
                    pending.remove(aid)
                elif agent._sm.is_active:
                    any_active = True

            if not any_active:
                break
            remaining = deadline - time.time()
            if remaining <= 0:
                break
            await asyncio.sleep(min(poll_interval, remaining))

        # Captured terminal observations are never re-queried. Resolve only
        # still-pending IDs against the live registry at the deadline.
        results: dict[str, dict] = {}
        for aid in agent_ids:
            if aid in captured:
                results[aid] = captured[aid]
                continue
            r = self.get_results(aid)
            if r:
                results[aid] = r
            else:
                results[aid] = {
                    "id": aid,
                    "status": "not_found",
                    "error": f"Agent '{aid}' not found.",
                }

        still_running = [aid for aid, r in results.items() if r.get("status") == "running"]
        if still_running:
            log.warning(
                "wait_for_agents timed out with %d still running: %s",
                len(still_running),
                still_running,
            )

        return results

    def spawn_group(
        self,
        tasks: builtins.list[dict],
        channel_id: str,
        requester_id: str,
        requester_name: str,
        iteration_callback: IterationCallback,
        tool_executor_callback: ToolExecutorCallback,
        announce_callback: AnnounceCallback | None = None,
        tools: builtins.list[dict] | None = None,
        system_prompt: str = "",
        tool_timeouts: dict[str, int] | None = None,
        trajectory_saver: AgentTrajectorySaver | None = None,
        max_depth: int = MAX_NESTING_DEPTH,
        max_iterations: int | None = None,
        budget_warnings: builtins.list[int] | None = None,
        iteration_timeout: float | None = None,
        max_lifetime: float | None = None,
        context_compression_enabled: bool = False,
        max_context_chars: int = 750000,
        keep_recent_iterations: int = 30,
        turn_id: str | None = None,
    ) -> builtins.list[str]:
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
                tool_timeouts=tool_timeouts,
                trajectory_saver=trajectory_saver,
                max_depth=max_depth,
                max_iterations=max_iterations,
                budget_warnings=budget_warnings,
                iteration_timeout=iteration_timeout,
                max_lifetime=max_lifetime,
                context_compression_enabled=context_compression_enabled,
                max_context_chars=max_context_chars,
                keep_recent_iterations=keep_recent_iterations,
                turn_id=turn_id,
            )
            ids.append(aid)
        return ids

    async def cleanup(self) -> int:
        """Remove agents that have been in terminal state for > CLEANUP_DELAY. Returns count
        removed.
        """
        now = time.time()
        to_remove = []
        for agent_id, agent in self._agents.items():
            if agent._sm.is_terminal:
                if agent.ended_at and (now - agent.ended_at) > CLEANUP_DELAY:
                    to_remove.append(agent_id)

        removed = sum(1 for aid in to_remove if self._remove_agent(aid, source="periodic_cleanup"))
        if removed:
            log.info("Cleaned up %d finished agents", removed)
        return removed

    def _remove_agent(self, agent_id: str, source: str = "") -> bool:
        """Single removal point for agents. Returns True if actually removed."""
        agent = self._agents.pop(agent_id, None)
        ct = self._cleanup_tasks.pop(agent_id, None)
        if ct and not ct.done():
            ct.cancel()
        if agent:
            # The single removal point owns release. Periodic cleanup may race
            # and cancel the delayed cleanup task; release-before-pop in that
            # task was therefore not a lifecycle guarantee.
            self._release_calibration(agent_id)
            root = agent.root_id or agent_id
            if not any((a.root_id or a.id) == root for a in self._agents.values()):
                # Last member gone: nothing can ever spawn into this tree
                # again (a parent must exist), so the lifetime counter can go.
                self._tree_spawn_counts.pop(root, None)
            log.debug("Removed agent %s (%s) via %s", agent_id, agent.label, source or "cleanup")
            return True
        return False

    def _schedule_cleanup(self, agent_id: str) -> None:
        """Schedule cleanup of an agent after CLEANUP_DELAY."""

        async def _delayed_cleanup():
            await asyncio.sleep(CLEANUP_DELAY)
            self._remove_agent(agent_id, source="delayed_cleanup")

        task = asyncio.ensure_future(_delayed_cleanup())
        self._cleanup_tasks[agent_id] = task

    def _release_calibration(self, agent_id: str) -> None:
        """Return this agent's workload calibration to the fixed prior.

        Owner-bound lifetime: calibration describes THIS agent's payloads and
        has no meaning once it is gone. Total — a cleanup failure must never
        raise on an agent that already finished; the observer's bounded
        eviction is the backstop if this never runs.
        """
        observer = getattr(self, "_window_observer", None)
        if observer is None:
            return
        try:
            from ..llm.context_budget import WorkloadScope

            observer.release_workload(WorkloadScope("agent", str(agent_id)))
        except Exception:
            log.exception("agent calibration release failed (non-fatal)")

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
            if elapsed > agent.max_lifetime:
                # Actually force-cancel the task — setting the cancel event
                # alone left an agent stuck in a long tool call running for up
                # to TOOL_EXEC_TIMEOUT while the log claimed "Force-killed".
                self._force_cancel(agent)
                killed += 1
                log.warning(
                    "Force-killed stuck agent %s (%s): lifetime exceeded (%ds)",
                    agent.id,
                    agent.label,
                    int(elapsed),
                )
            elif idle > STALE_WARN_SECONDS:
                stale += 1
                log.warning(
                    "Agent %s (%s) appears stale: %ds idle",
                    agent.id,
                    agent.label,
                    int(idle),
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
    max_iterations: int = MAX_AGENT_ITERATIONS,
    budget_warnings: list[int] | None = None,
    context_compression_enabled: bool = False,
    max_context_chars: int = 750000,
    keep_recent_iterations: int = 30,
    budget_snapshot_provider: Callable | None = None,
    generation_plan_provider: Callable | None = None,
    evidence_recorder: Callable | None = None,
    density_recorder: Callable | None = None,
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
        iteration_timeout=agent.iteration_timeout,
        max_lifetime=agent.max_lifetime,
        model_override=agent.model_override,
        reasoning_effort_override=agent.reasoning_effort_override,
    )
    agent_start = time.time()

    def _budget_observation(state: dict) -> tuple[int | None, str, int | None]:
        plan = state.get("plan")
        snapshot = plan.get("snapshot") if isinstance(plan, dict) else None
        if snapshot is None:
            return None, "unknown", None
        density = getattr(snapshot, "density_milli", None)
        primary = getattr(snapshot, "primary_chars", None)
        return (
            density if type(density) is int else None,
            str(getattr(snapshot, "density_source", "") or "unknown"),
            primary if type(primary) is int else None,
        )

    def _check_kill() -> bool:
        if agent._cancel_event.is_set():  # type: ignore[union-attr]  # __post_init__ always sets it
            if agent._sm.is_terminal:
                return True
            try:
                agent.transition(AgentState.KILLED, "cancel signal")
                agent.ended_at = time.time()
                log.info(
                    "Agent %s (%s) killed after %ds",
                    agent.id,
                    agent.label,
                    int(time.time() - agent.created_at),
                )
            except InvalidStateTransition:
                log.info(
                    "Agent %s already in terminal state %s when kill arrived",
                    agent.id,
                    agent._sm.state.value,
                )
            return True
        return False

    def _check_lifetime() -> bool:
        if _remaining_lifetime(agent) <= 0:
            _lifetime_timeout(agent)
            return True
        return False

    try:
        # Transition from SPAWNING → READY
        agent.transition(AgentState.READY, "initialization complete")

        _budget_warn_set = set(budget_warnings or [])

        for iteration in range(max_iterations):
            if _check_kill():
                return
            if _check_lifetime():
                return

            # Check inbox for injected messages
            while not agent._inbox.empty():  # type: ignore[union-attr]  # __post_init__ always sets it
                try:
                    msg = agent._inbox.get_nowait()  # type: ignore[union-attr]  # __post_init__ always sets it
                    agent.messages.append(
                        {
                            "role": "user",
                            "content": f"[Message from parent] {msg}",
                        }
                    )
                    log.debug("Agent %s received inbox message", agent.id)
                except asyncio.QueueEmpty:
                    break

            # ONE authoritative plan is captured before any compaction for
            # this logical generation. Its serving identity and budget snapshot
            # then govern the soft pass, latch pass, physical request, and every
            # rescue rung. Live config reaches only the next generation.
            generation_state: dict = {}
            budget_snapshot = None
            if generation_plan_provider is not None:
                try:
                    plan = generation_plan_provider()
                    generation_state["plan"] = plan
                    budget_snapshot = plan.get("snapshot") if isinstance(plan, dict) else None
                except Exception:
                    log.exception(
                        "agent generation plan provider failed (non-fatal); using fallback targets"
                    )
            elif budget_snapshot_provider is not None:
                try:
                    budget_snapshot = budget_snapshot_provider()
                except Exception:
                    log.exception(
                        "agent budget snapshot provider failed (non-fatal); using fallback targets"
                    )
            soft_target_chars = (
                budget_snapshot.primary_chars if budget_snapshot is not None else max_context_chars
            )

            # Context compression: summarize older tool iterations when context grows too large
            if context_compression_enabled and iteration > 0:
                try:
                    from ..llm.context_compressor import (
                        compress_tool_context,
                        estimate_message_chars,
                    )

                    if estimate_message_chars(agent.messages) > soft_target_chars:
                        agent.messages, saved = compress_tool_context(
                            agent.messages,
                            max_context_chars=soft_target_chars,
                            keep_recent=keep_recent_iterations,
                        )
                        log.info(
                            "agent context_compressor: agent=%s "
                            "compressed %d older tool iterations",
                            agent.id,
                            saved,
                        )
                except Exception:
                    log.exception(
                        "agent context_compressor failed (non-fatal); continuing with full context"
                    )

            # Budget warning: inject remaining-iterations notice before LLM call
            remaining = max_iterations - iteration
            if remaining in _budget_warn_set:
                if remaining == 1:
                    warn_text = "[Agent budget: FINAL iteration. Produce your final summary NOW.]"
                elif remaining <= 5:
                    warn_text = (
                        f"[Agent budget: {remaining} iterations remaining. Commit any "
                        f"changes, run validation, and produce your final summary.]"
                    )
                else:
                    warn_text = (
                        f"[Agent budget: {remaining} iterations remaining. "
                        "Begin wrapping up — finish the smallest useful change, "
                        "validate, and prepare your final summary.]"
                    )
                agent.messages.append({"role": "user", "content": warn_text})

            # Transition READY → EXECUTING for LLM call
            agent.transition(AgentState.EXECUTING, f"iteration {iteration + 1}")
            agent.last_activity = time.time()
            agent.iteration_count = iteration + 1
            iter_start = time.time()

            # Overflow-latch compaction (agent-local, lifetime-only): once an
            # emergency recovery has proven a survivable size, compact BEFORE
            # sending whenever the payload crosses it — an already-proven
            # scraper must not pay a doomed 400 on every later iteration.
            # Independent of context_compression_enabled: this is recovery
            # machinery, not the config feature.
            if agent.context_char_ceiling is not None:
                try:
                    from ..llm.context_compressor import (
                        emergency_compress_for_window,
                        estimate_message_chars,
                    )

                    # The latch is capability evidence; the snapshot's primary
                    # is policy. Compact to whichever is LOWER — a live budget
                    # drop must not be out-waited by a stale larger latch.
                    latch_target = min(agent.context_char_ceiling, soft_target_chars)
                    if estimate_message_chars(agent.messages) > latch_target:
                        agent.messages, latch_report = emergency_compress_for_window(
                            agent.messages,
                            target_chars=latch_target,
                        )
                        latch_report["attempt"] = 0
                        latch_report["trigger"] = "latch"
                        agent.context_recoveries.append(latch_report)
                        log.info(
                            "agent overflow-latch: agent=%s compacted to %d chars",
                            agent.id,
                            latch_report["compressed_chars"],
                        )
                except Exception:
                    log.exception("agent overflow-latch compaction failed (non-fatal)")

            # Call LLM with recovery support using the plan captured before
            # compaction (when one is available).
            response = await _call_llm_with_recovery(
                agent,
                iteration_callback,
                system_prompt,
                tools,
                rescue_ladder=(budget_snapshot.ladder if budget_snapshot is not None else None),
                generation_state=generation_state,
                evidence_recorder=evidence_recorder,
                density_recorder=density_recorder,
            )
            if response is None:
                # Terminal state already set by recovery logic
                return

            # Retain the LATEST execution provenance in memory (it already
            # rides every trajectory record). Operator surfaces can then show
            # what actually ran without reading trajectory files during page
            # rendering, and stay truthful when live config changes mid-agent.
            agent.has_executed = True
            agent.last_provider = response.get("provider", "") or ""
            agent.last_model = response.get("model", "") or ""
            agent.last_reasoning_effort = response.get("reasoning_effort")
            usage_facts = agent._accepted_usage_facts
            agent._accepted_usage_facts = {}
            usage_response = {**response, **usage_facts}

            text = response.get("text", "")
            tool_calls = response.get("tool_calls", [])
            context_density, context_density_source, context_primary_chars = (
                _budget_observation(generation_state)
            )

            # Append assistant response to messages
            agent.messages.append({"role": "assistant", "content": text})

            # No tool calls = agent is done
            if not tool_calls:
                trajectory.add_iteration(
                    iteration=iteration + 1,
                    llm_text=text,
                    duration_ms=int((time.time() - iter_start) * 1000),
                    input_tokens=usage_response.get("input_tokens", 0) or 0,
                    output_tokens=usage_response.get("output_tokens", 0) or 0,
                    server_input_tokens=usage_response.get("server_input_tokens"),
                    server_output_tokens=usage_response.get("server_output_tokens"),
                    estimated_input_tokens=usage_response.get("estimated_input_tokens"),
                    input_token_provenance=usage_response.get("input_token_provenance", ""),
                    output_token_provenance=usage_response.get("output_token_provenance", ""),
                    cached_tokens=usage_response.get("cached_tokens"),
                    cache_write_tokens=usage_response.get("cache_write_tokens"),
                    provider=response.get("provider", ""),
                    model=response.get("model", ""),
                    reasoning_effort=response.get("reasoning_effort"),
                    context_density_milli=context_density,
                    context_density_source=context_density_source,
                    context_primary_chars=context_primary_chars,
                )
                agent.transition(AgentState.COMPLETED, "no more tool calls")
                agent.result = text
                agent.ended_at = time.time()
                elapsed = time.time() - agent.created_at
                log.info(
                    "Agent %s (%s) completed in %ds, %d tool calls",
                    agent.id,
                    agent.label,
                    int(elapsed),
                    len(agent.tools_used),
                )
                return

            # Execute tool calls
            iter_tool_calls: list[dict] = []
            iter_tool_results: list[dict] = []
            for tc in tool_calls:
                tool_name = tc.get("name", "")
                tool_input = tc.get("input", {})

                # Hard deadline BETWEEN tools too: without this an expired
                # agent still got a fresh (floored) budget per remaining
                # tool call and ran seconds past its lifetime.
                lifetime_left = _remaining_lifetime(agent)
                if lifetime_left <= 0:
                    trajectory.add_iteration(
                        iteration=iteration + 1,
                        tool_calls=iter_tool_calls,
                        tool_results=iter_tool_results,
                        llm_text=text,
                        duration_ms=int((time.time() - iter_start) * 1000),
                        input_tokens=usage_response.get("input_tokens", 0) or 0,
                        output_tokens=usage_response.get("output_tokens", 0) or 0,
                        server_input_tokens=usage_response.get("server_input_tokens"),
                        server_output_tokens=usage_response.get("server_output_tokens"),
                        estimated_input_tokens=usage_response.get("estimated_input_tokens"),
                        input_token_provenance=usage_response.get("input_token_provenance", ""),
                        output_token_provenance=usage_response.get("output_token_provenance", ""),
                        cached_tokens=usage_response.get("cached_tokens"),
                        cache_write_tokens=usage_response.get("cache_write_tokens"),
                        provider=response.get("provider", ""),
                        model=response.get("model", ""),
                        reasoning_effort=response.get("reasoning_effort"),
                        context_density_milli=context_density,
                        context_density_source=context_density_source,
                        context_primary_chars=context_primary_chars,
                    )
                    _lifetime_timeout(agent)
                    return

                if tool_name not in agent.tools_used:
                    agent.tools_used.append(tool_name)

                agent.last_activity = time.time()
                iter_tool_calls.append(
                    {
                        "name": tool_name,
                        "input": _scrub_tool_input_for_storage(tool_name, tool_input),
                    }
                )

                tool_timeout: float = (tool_timeouts or {}).get(tool_name, TOOL_EXEC_TIMEOUT)
                # A nested wait has its own handler deadline. Give it room to
                # collect and render the progress snapshot before retaining the
                # lifetime-capped outer backstop for a genuinely wedged handler.
                tool_timeout = wait_for_agents_wrapper_timeout(
                    tool_name,
                    tool_input,
                    tool_timeout,
                    grace_seconds=WAIT_FOR_AGENTS_NESTED_GRACE_SECONDS,
                )
                # Cap at the POSITIVE remainder so the lifetime deadline holds
                # inside a long tool call — never floored to a bonus second.
                tool_timeout = min(tool_timeout, lifetime_left)
                try:
                    raw_result = await asyncio.wait_for(
                        tool_executor_callback(tool_name, tool_input),
                        timeout=tool_timeout,
                    )
                    structured = raw_result if isinstance(raw_result, ToolResult) else None
                    result = scrub_output_secrets(str(raw_result))
                    if (
                        structured is not None
                        and not structured.ok
                        and not result.lstrip().startswith(
                            ("Error", "Command failed", "Script failed", "Denied")
                        )
                    ):
                        result = f"Error (tool reported failure):\n{result}"
                except TimeoutError:
                    structured = None
                    result = f"Error: Tool '{tool_name}' timed out after {tool_timeout}s"
                    log.warning("Agent %s tool %s timed out", agent.id, tool_name)
                except Exception as e:
                    structured = None
                    result = f"Error: {e}"
                    log.warning("Agent %s tool %s failed: %s", agent.id, tool_name, e)

                stored_result: dict = {"name": tool_name, "result": result}
                if structured is not None:
                    stored_result["ok"] = structured.ok
                    if structured.audit_metadata:
                        stored_result["audit_metadata"] = structured.audit_metadata
                iter_tool_results.append(stored_result)

                # Append tool result to messages
                agent.messages.append(
                    {
                        "role": "user",
                        "content": f"[Tool result: {tool_name}]\n{result}",
                    }
                )

            trajectory.add_iteration(
                iteration=iteration + 1,
                tool_calls=iter_tool_calls,
                tool_results=iter_tool_results,
                llm_text=text,
                duration_ms=int((time.time() - iter_start) * 1000),
                input_tokens=usage_response.get("input_tokens", 0) or 0,
                output_tokens=usage_response.get("output_tokens", 0) or 0,
                server_input_tokens=usage_response.get("server_input_tokens"),
                server_output_tokens=usage_response.get("server_output_tokens"),
                estimated_input_tokens=usage_response.get("estimated_input_tokens"),
                input_token_provenance=usage_response.get("input_token_provenance", ""),
                output_token_provenance=usage_response.get("output_token_provenance", ""),
                cached_tokens=usage_response.get("cached_tokens"),
                cache_write_tokens=usage_response.get("cache_write_tokens"),
                provider=response.get("provider", ""),
                model=response.get("model", ""),
                reasoning_effort=response.get("reasoning_effort"),
                context_density_milli=context_density,
                context_density_source=context_density_source,
                context_primary_chars=context_primary_chars,
            )

            # Post-tool deadline check: expiry during the FINAL tool call of
            # the FINAL iteration must terminate as TIMEOUT here — falling
            # through would mislabel it COMPLETED ("max iterations reached").
            if _check_lifetime():
                return

            # Back to READY for next iteration
            agent.transition(AgentState.READY, "tools complete")

            # Check stale warning
            if time.time() - agent.last_activity > STALE_WARN_SECONDS:
                log.warning(
                    "Agent %s (%s) has been idle for >%ds",
                    agent.id,
                    agent.label,
                    STALE_WARN_SECONDS,
                )

        # Exhausted iterations — transition from READY → COMPLETED
        agent.transition(AgentState.COMPLETED, f"max iterations ({max_iterations}) reached")
        agent.result = _get_last_progress(agent)
        if agent.result == "(no output)":
            agent.result = _synthesize_fallback(agent, max_iterations)
        agent.ended_at = time.time()
        elapsed = time.time() - agent.created_at
        log.info(
            "Agent %s (%s) completed in %ds after %d iterations (max reached), %d tool calls",
            agent.id,
            agent.label,
            int(elapsed),
            max_iterations,
            len(agent.tools_used),
        )

    except asyncio.CancelledError:
        if not agent._sm.is_terminal:
            agent.transition(AgentState.KILLED, "task cancelled")
        agent.ended_at = time.time()
        log.info("Agent %s (%s) was cancelled", agent.id, agent.label)

    except Exception as e:
        # agent.error and the state-transition reason both surface through
        # the agent API, the WebUI detail modal, collect results, and the
        # saved trajectory (error + state_history) — store one bounded
        # formatter summary everywhere; the traceback stays in the journal.
        err_msg = format_user_facing_error(e)
        if not agent._sm.is_terminal:
            agent.transition(AgentState.FAILED, f"unhandled: {err_msg}")
        agent.error = err_msg
        agent.ended_at = time.time()
        log.error("Agent %s (%s) crashed: %s", agent.id, agent.label, err_msg, exc_info=e)

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
            context_recoveries=agent.context_recoveries,
            context_char_ceiling=agent.context_char_ceiling,
        )
        if trajectory_saver:
            try:
                await trajectory_saver.save(trajectory)
            except Exception as save_err:
                log.error("Failed to save agent trajectory for %s: %s", agent.id, save_err)


def _remaining_lifetime(agent: AgentInfo) -> float:
    """Seconds until this agent's hard deadline (negative once exceeded)."""
    return agent.max_lifetime - (time.time() - agent.created_at)


def _lifetime_timeout(agent: AgentInfo) -> None:
    """Transition an agent to TIMEOUT for lifetime exhaustion."""
    elapsed = time.time() - agent.created_at
    agent.transition(AgentState.TIMEOUT, f"lifetime exceeded ({int(elapsed)}s)")
    agent.result = _get_last_progress(agent)
    agent.ended_at = time.time()
    log.warning(
        "Agent %s (%s) timed out after %ds, %d iterations",
        agent.id,
        agent.label,
        int(elapsed),
        agent.iteration_count,
    )


def _measure_payload(messages: list[dict]) -> tuple[int, int]:
    """(chars, wire-real images) for the payload about to be sent."""
    from ..llm.context_compressor import estimate_message_chars, estimate_message_images

    return estimate_message_chars(messages), estimate_message_images(messages)


def _attempt_facts(
    messages: list[dict], snapshot, *, is_codex: bool, workload_scope: object
) -> object | None:
    """Freeze everything this agent attempt's fit verdict rests on, or None.

    One structured unit rather than a loose bool beside loose numbers, so the
    verdict and its evidence cannot drift apart before clamp qualification.
    """
    from ..llm.context_budget import WorkloadScope

    if (
        is_codex is not True
        or type(workload_scope) is not WorkloadScope
        or not workload_scope.is_valid()
    ):
        return None
    if snapshot is None or getattr(snapshot, "base_source", None) == "persisted":
        return None
    effective = getattr(snapshot, "effective_budget", 0)
    if not isinstance(effective, int) or effective <= 0:
        return None
    try:
        from ..llm.context_budget import RejectedAttemptFacts, estimate_request_tokens

        density = getattr(snapshot, "density_milli", 2500)
        chars, images = _measure_payload(messages)
        estimated = estimate_request_tokens(chars, images, density_milli=density)
        return RejectedAttemptFacts(
            chars=chars,
            images=images,
            density_milli=density,
            estimated_tokens=estimated,
            effective_budget=effective,
            believed_within=estimated <= effective,
            workload_scope=workload_scope,
        )
    except Exception:
        log.exception("attempt fact capture failed; recording belief as unknown")
        return None


def _believed_within_effective_budget(messages: list[dict], snapshot) -> bool | None:
    """Whether THIS payload is believed to fit the believed physical window.

    Returns None when no belief can honestly be formed (no snapshot, or a
    persisted reconstruction whose budget fields are not real). ``None`` is
    never treated as "within" downstream — it cannot qualify a clamp.

    Compares against ``effective_budget`` deliberately: utilization is quality
    POLICY and overflow is PHYSICS. Judging admission against the policy
    target would both convert an operator's compaction preference into a hard
    wall and make an aggressive policy setting indistinguishable from a real
    window shrink.
    """
    if snapshot is None or getattr(snapshot, "base_source", None) == "persisted":
        return None
    effective = getattr(snapshot, "effective_budget", 0)
    if not isinstance(effective, int) or effective <= 0:
        return None
    try:
        from ..llm.context_budget import estimate_request_tokens

        chars, images = _measure_payload(messages)
        estimated = estimate_request_tokens(
            chars, images, density_milli=getattr(snapshot, "density_milli", 2500)
        )
        return estimated <= effective
    except Exception:
        log.exception("belief estimation failed; recording belief as unknown")
        return None


def _predictive_presend_descent(agent: AgentInfo, snapshot, ladder: tuple[int, ...]) -> int:
    """Descend rescue rungs BEFORE sending a payload believed not to fit.

    Returns the number of rungs consumed, which the post-rejection loop skips
    so one total ladder is shared rather than two independent budgets.

    Fail-OPEN by contract: any estimator or compactor failure leaves the
    payload untouched and lets the provider be the authority. Accepted-latch
    enforcement elsewhere stays fail-closed; this is prediction, not proof.
    Rungs are adopted only when they genuinely shrink the payload, and an
    exhausted ladder still sends the smallest valid result.
    """
    consumed = 0
    try:
        from ..llm.context_compressor import emergency_compress_for_window

        while consumed < len(ladder):
            if _believed_within_effective_budget(agent.messages, snapshot) is not False:
                break
            target = ladder[consumed]
            compressed, report = emergency_compress_for_window(
                agent.messages, target_chars=target
            )
            consumed += 1
            report["attempt"] = 0
            report["trigger"] = "predictive"
            agent.context_recoveries.append(report)
            # A character no-op is not a terminator: image surcharge may
            # still leave the payload over its token window, and a lower rung
            # may shrink it. An enlarging result is never adopted.
            if report["compressed_chars"] > report["original_chars"]:
                break
            if report["compressed_chars"] == report["original_chars"]:
                continue
            agent.messages = compressed
            log.info(
                "agent predictive pre-send: agent=%s rung %d compacted %d -> %d chars",
                agent.id,
                consumed,
                report["original_chars"],
                report["compressed_chars"],
            )
    except Exception:
        log.exception("agent predictive pre-send failed (non-fatal); sending as-is")
    return consumed


async def _call_llm_with_recovery(
    agent: AgentInfo,
    iteration_callback: IterationCallback,
    system_prompt: str,
    tools: list[dict],
    rescue_ladder: tuple[int, ...] | None = None,
    generation_state: dict | None = None,
    evidence_recorder: Callable | None = None,
    density_recorder: Callable | None = None,
) -> dict | None:
    """Call the LLM for one agent iteration.

    Transient-failure recovery (capacity/transport/breaker waits) lives
    INSIDE the iteration callback via the shared deadline-based policy
    (``src/llm/recovery.py``) — the old manager-level bare-``except`` single
    retry ladder retried programming defects and is deliberately gone
    (design settled with Odin, 2026-07-30). What remains here is the wall:
    the agent's snapshotted iteration_timeout capped at remaining lifetime
    hard-bounds the callback INCLUDING any recovery waits.

    Production callbacks always receive the manager-created state channel.
    ``generation_state=None`` remains only a helper-level convenience for
    direct recovery tests; it creates the channel, it does not revive the
    retired three-argument callback contract.

    Returns the LLM response dict, or None if agent reached terminal state.
    """
    # The advisory rescue ladder is optional; an absent advisory source uses
    # unknown-model math. Once the callback publishes an authoritative plan,
    # its snapshot wins even when its ladder is empty (for example a zero
    # observed clamp): empty means honest terminal failure, never fallback.
    if rescue_ladder is None:
        rescue_ladder = _fallback_budget_snapshot().ladder
    if generation_state is None:
        generation_state = {}
    emergency_passes = 0
    # Published only after a provider ACCEPTS the compacted payload: a local
    # "fits" proves a character target was met, not that the server took it
    # (R2: the latch comes from the size that actually received a successful
    # response).
    pending_ceiling: int | None = None
    # ONE monotonic deadline bounds the whole logical iteration — the initial
    # attempt, any emergency compaction, and every retry share it (Odin's
    # adversarial repro: per-attempt timeouts let one iteration consume ~3x
    # its configured budget).
    remaining = _remaining_lifetime(agent)
    if remaining <= 0:
        _lifetime_timeout(agent)
        return None
    call_timeout = min(agent.iteration_timeout, remaining)
    iteration_deadline = time.monotonic() + call_timeout
    first_attempt = True
    last_overflow: BaseException | None = None
    # Belief about the attempt that was actually REJECTED — paired with the
    # overflow it belongs to, never reconstructed later from messages that
    # rescue has already mutated.
    last_overflow_facts: object | None = None

    _plan = generation_state.get("plan")
    _plan_snapshot = _plan.get("snapshot") if isinstance(_plan, dict) else None
    _is_codex = bool(_plan.get("is_codex")) if isinstance(_plan, dict) else False
    _workload_scope = _plan.get("workload_scope") if isinstance(_plan, dict) else None
    # Predictive descent runs AFTER soft compaction and mandatory latch
    # enforcement (both already applied by the caller) and only for Codex
    # serving identities: other providers supply no accepted-token evidence
    # contract, so there is nothing to predict against.
    if _is_codex and _plan_snapshot is not None:
        presend_ladder = tuple(getattr(_plan_snapshot, "ladder", ()) or ())
        if presend_ladder:
            emergency_passes = _predictive_presend_descent(agent, _plan_snapshot, presend_ladder)
    while True:
        if _remaining_lifetime(agent) <= 0:
            _lifetime_timeout(agent)
            return None
        # The first attempt gets the exact configured budget (bit-identical
        # to the pre-recovery behavior); only retries pay the deadline
        # arithmetic for time already burned by failed attempts and
        # compaction.
        if first_attempt:
            attempt_budget = call_timeout
            first_attempt = False
        else:
            attempt_budget = iteration_deadline - time.monotonic()
        if attempt_budget <= 0:
            err_desc = f"LLM timeout after {int(call_timeout)}s"
            log.error("Agent %s LLM call failed: %s", agent.id, err_desc)
            agent.transition(AgentState.FAILED, err_desc)
            agent.error = err_desc
            agent.ended_at = time.time()
            return None
        # Captured BEFORE awaiting the provider, from the exact payload this
        # attempt sends. Recomputed every pass, so a rescue-compacted retry
        # carries its own belief rather than inheriting the rejected one.
        attempt_chars, attempt_images = _measure_payload(agent.messages)
        attempt_facts = _attempt_facts(
            agent.messages,
            _plan_snapshot,
            is_codex=_is_codex,
            workload_scope=_workload_scope,
        )
        try:
            response = await asyncio.wait_for(
                iteration_callback(
                    agent.messages,
                    system_prompt,
                    tools,
                    generation_state=generation_state,
                ),
                timeout=attempt_budget,
            )
            try:
                from ..usage.provenance import accepted_usage_fields

                usage = accepted_usage_fields(
                    response,
                    chars_sent=attempt_chars,
                    images_sent=attempt_images,
                    snapshot=_plan_snapshot,
                )
                if isinstance(response, dict) and any(
                    value is not None
                    for key, value in usage.items()
                    if key.endswith("_tokens")
                ):
                    # Private metadata preserves the callback's public response
                    # shape. The manager consumes it when persisting the
                    # trajectory; callers and tests never see synthetic keys.
                    agent._accepted_usage_facts = usage
            except Exception:
                log.exception("agent usage capture failed (non-fatal)")
            if density_recorder is not None:
                try:
                    density_recorder(response, attempt_chars, attempt_images)
                except Exception:
                    log.exception("agent density recording failed (non-fatal)")
            if pending_ceiling is not None:
                # The rescue rung is now server-accepted evidence.
                agent.context_char_ceiling = pending_ceiling
                accepted_is_codex = (
                    _is_codex
                    and isinstance(response, dict)
                    and response.get("provider") == "codex"
                )
                if (
                    evidence_recorder is not None
                    and last_overflow is not None
                    and accepted_is_codex
                ):
                    try:
                        # Phase 5: the overflow→acceptance pair feeds the
                        # window observer. Total — evidence never fails the
                        # iteration that just succeeded. The belief carried
                        # here is the REJECTED attempt's, which is what
                        # qualifies (or disqualifies) a window clamp.
                        await evidence_recorder(
                            last_overflow,
                            response,
                            last_overflow_facts,
                            attempt_chars,
                            attempt_images,
                            workload_scope=_workload_scope,
                        )
                    except Exception:
                        log.exception("agent window-evidence recording failed (non-fatal)")
            return response
        except TimeoutError:
            if _remaining_lifetime(agent) <= 0:
                # The wait was lifetime-capped and the deadline has passed:
                # this is lifetime exhaustion, not a stuck LLM call.
                _lifetime_timeout(agent)
                return None
            # str(asyncio.TimeoutError()) is EMPTY — always store the
            # formatted description, never the bare exception string.
            err_desc = f"LLM timeout after {int(call_timeout)}s"
            log.error("Agent %s LLM call failed: %s", agent.id, err_desc)
            agent.transition(AgentState.FAILED, err_desc)
            agent.error = err_desc
            agent.ended_at = time.time()
            return None
        except Exception as exc:
            if _remaining_lifetime(agent) <= 0:
                # Lifetime exhaustion wins over failure classification (the
                # v3.59.0 rule: exhaustion is TIMEOUT, never FAILED).
                _lifetime_timeout(agent)
                return None
            if _is_context_overflow(exc):
                # Window overflow: deterministic for THIS payload, so a plain
                # retry is doomed — but a smaller payload is not. Bound the
                # entire message list (recent iterations by SIZE, single huge
                # results truncated, task preserved) and retry within the SAME
                # agent iteration. Never counted as provider health — the
                # provider raised a fast-fail request error precisely so no
                # breaker/rotation machinery engaged. Bounded passes, no loop.
                from ..llm.context_compressor import emergency_compress_for_window

                plan = generation_state.get("plan")
                plan_snapshot = plan.get("snapshot") if isinstance(plan, dict) else None
                # The ladder of the request that ACTUALLY overflowed: the
                # generation plan captured by the callback at send time.
                # Spawn-provider advisory only when no authoritative plan
                # snapshot exists. An authoritative EMPTY (or malformed-
                # missing) ladder is a real terminal outcome and must not
                # silently widen through the unknown-model fallback.
                active_ladder = (
                    tuple(getattr(plan_snapshot, "ladder", ()) or ())
                    if plan_snapshot is not None
                    else rescue_ladder
                )
                if emergency_passes < len(active_ladder):
                    target = active_ladder[emergency_passes]
                    emergency_passes += 1
                    compressed, report = emergency_compress_for_window(
                        agent.messages, target_chars=target
                    )
                    report["attempt"] = emergency_passes
                    report["trigger"] = "overflow"
                    agent.context_recoveries.append(report)
                    if report["fits"]:
                        agent.messages = compressed
                        last_overflow = exc
                        last_overflow_facts = attempt_facts
                        # Latch candidate: held until the retry actually
                        # succeeds (the provider is the authority on
                        # survivable size).
                        pending_ceiling = report["compressed_chars"]
                        log.warning(
                            "Agent %s context overflow: emergency pass %d "
                            "compressed %d -> %d chars; retrying iteration",
                            agent.id,
                            emergency_passes,
                            report["original_chars"],
                            report["compressed_chars"],
                        )
                        continue
                    log.error(
                        "Agent %s context overflow: payload cannot be bounded "
                        "under %d chars (prefix %d); failing",
                        agent.id,
                        target,
                        report["prefix_chars"],
                    )
                else:
                    log.error(
                        "Agent %s context overflow: rescue ladder exhausted "
                        "after %d passes; failing",
                        agent.id,
                        emergency_passes,
                    )
            # Typed fast-fail (auth / malformed request / quota-exhausted
            # after rotation) or a programming defect: neither earns a
            # manager-level retry — transient classes were already retried
            # inside the callback for up to the generation deadline. The
            # formatter handles empty-str exceptions via its type-name
            # fallback, and keeps upstream text out of agent.error /
            # state_history (both API- and trajectory-visible).
            err_desc = f"LLM error: {format_user_facing_error(exc)}"
            log.error("Agent %s LLM call failed (no retry): %s", agent.id, err_desc, exc_info=exc)
            agent.transition(AgentState.FAILED, err_desc)
            agent.error = err_desc
            agent.ended_at = time.time()
            return None


def _get_last_progress(agent: AgentInfo) -> str:
    """Extract the last meaningful text from agent messages."""
    for msg in reversed(agent.messages):
        if msg["role"] == "assistant" and msg.get("content"):
            return msg["content"]
    return "(no output)"


def _synthesize_fallback(agent: AgentInfo, max_iterations: int) -> str:
    """Build a summary from tool activity when the agent produced no text output."""
    parts = [f"Agent reached max iterations ({max_iterations}) without producing a final response."]
    if agent.tools_used:
        parts.append(f"Tools used: {', '.join(agent.tools_used)}")
    # Extract last few tool results from messages
    tool_results = []
    for msg in reversed(agent.messages):
        content = msg.get("content", "")
        if msg["role"] == "user" and content.startswith("[Tool result:"):
            tool_results.append(content[:300])
            if len(tool_results) >= 3:
                break
    if tool_results:
        parts.append("Last tool results:")
        for tr in reversed(tool_results):
            parts.append(f"  {tr}")
    return "\n".join(parts)
