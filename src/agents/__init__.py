"""Multi-agent orchestration — spawn autonomous agents for parallel sub-tasks."""
from __future__ import annotations

from .loop_bridge import LoopAgentBridge
from .manager import (
    AGENT_BLOCKED_TOOLS,
    AGENT_MANAGEMENT_TOOLS,
    ITERATION_CB_TIMEOUT,
    MAX_CHILDREN_PER_AGENT,
    MAX_NESTING_DEPTH,
    TOOL_EXEC_TIMEOUT,
    ACTIVE_STATES,
    TERMINAL_STATES,
    VALID_TRANSITIONS,
    AgentInfo,
    AgentManager,
    AgentState,
    AgentStateMachine,
    InvalidStateTransition,
    StateTransition,
    filter_agent_tools,
)
from .trajectory import AgentTrajectorySaver, AgentTrajectoryTurn

__all__ = [
    "AGENT_BLOCKED_TOOLS",
    "AGENT_MANAGEMENT_TOOLS",
    "ITERATION_CB_TIMEOUT",
    "MAX_CHILDREN_PER_AGENT",
    "MAX_NESTING_DEPTH",
    "TOOL_EXEC_TIMEOUT",
    "ACTIVE_STATES",
    "TERMINAL_STATES",
    "VALID_TRANSITIONS",
    "AgentInfo",
    "AgentManager",
    "AgentState",
    "AgentStateMachine",
    "AgentTrajectorySaver",
    "AgentTrajectoryTurn",
    "InvalidStateTransition",
    "LoopAgentBridge",
    "StateTransition",
    "filter_agent_tools",
]
