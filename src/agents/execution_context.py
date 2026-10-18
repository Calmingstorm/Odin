"""Trusted agent execution context. Never populated from tool arguments."""

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import TYPE_CHECKING, NamedTuple

if TYPE_CHECKING:
    from .manager import AgentInfo

waiting_agent: ContextVar["AgentInfo | None"] = ContextVar("waiting_agent", default=None)


class AgentDispatch(NamedTuple):
    """The agent whose own tool cycle is dispatching a call, and that call."""

    agent: "AgentInfo"
    call: dict


# Bound by the agent's tool cycle around its real callback and fenced to the
# dispatching task: a loop, background task or child agent started during the
# call inherits a copy but never matches. Execution-side identity only; audit
# attribution (src/audit/tool_context.py) stays audit-only.
_agent_dispatch: ContextVar[tuple | None] = ContextVar("agent_dispatch", default=None)


@contextmanager
def agent_dispatch(agent: "AgentInfo", call: dict) -> Iterator[None]:
    token = _agent_dispatch.set((asyncio.current_task(), AgentDispatch(agent, call)))
    try:
        yield
    finally:
        _agent_dispatch.reset(token)


def current_agent_dispatch() -> AgentDispatch | None:
    """The dispatching agent, only inside its own call's task."""
    bound = _agent_dispatch.get()
    if bound is None:
        return None
    try:
        task = asyncio.current_task()
    except RuntimeError:
        return None
    return bound[1] if bound[0] is task and task is not None else None
