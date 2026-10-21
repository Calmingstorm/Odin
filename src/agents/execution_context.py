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


class JobOrigin(NamedTuple):
    """The agent that started a background job, kept on the job's record."""

    agent_id: str
    root_id: str


# Transferred explicitly by the executor into the handler task of a
# dispatching agent's call (the executor runs handlers in a child task, where
# the dispatch binding above deliberately does not match). Fenced to that one
# task, so work the handler spawns does not inherit it.
_job_origin: ContextVar[tuple | None] = ContextVar("agent_job_origin", default=None)


def capture_job_origin() -> JobOrigin | None:
    """The dispatching agent as a job origin; call in the dispatching task."""
    dispatch = current_agent_dispatch()
    if dispatch is None:
        return None
    agent = dispatch.agent
    agent_id = str(getattr(agent, "id", "") or "")
    if not agent_id:
        return None
    return JobOrigin(agent_id, str(getattr(agent, "root_id", None) or agent_id))


@contextmanager
def bound_job_origin(origin: JobOrigin | None) -> Iterator[None]:
    token = _job_origin.set((asyncio.current_task(), origin))
    try:
        yield
    finally:
        _job_origin.reset(token)


def current_job_origin() -> JobOrigin | None:
    """The job origin transferred to this exact handler task, if any."""
    bound = _job_origin.get()
    if bound is None:
        return None
    try:
        task = asyncio.current_task()
    except RuntimeError:
        return None
    return bound[1] if bound[0] is task and task is not None else None
