"""Audit-only attribution; never consulted by execution or permission policy."""
from __future__ import annotations

import asyncio
from contextlib import contextmanager
from contextvars import ContextVar

from ..observability.diagnostics import safe_text

_agent_call: ContextVar[tuple | None] = ContextVar("audit_agent_call", default=None)
_pending_observers: set[asyncio.Task] = set()


def start_observer(coroutine) -> asyncio.Task:
    """Own an audit task without placing storage latency on the tool's deadline."""
    task = asyncio.create_task(coroutine)
    _pending_observers.add(task)

    def settled(task):
        _pending_observers.discard(task)
        if not task.cancelled():
            task.exception()

    task.add_done_callback(settled)
    return task


async def observe_terminal(coroutine, *, wait: bool = True) -> None:
    """Complete audit independently when the caller stops; never delay /stop.

    Strong ownership and result consumption avoid lost tasks/unhandled faults.
    Agent start/terminal pairs are ordered in their observer tasks, never on the
    agent's dispatch deadline. Existing autonomous-loop auditing still waits on
    normal completion. No observer can restart or retry the underlying tool.
    """
    task = start_observer(coroutine)
    if not wait:
        return
    caller = asyncio.current_task()
    if caller is not None and caller.cancelling():
        return
    try:
        await asyncio.shield(task)
    except asyncio.CancelledError:
        if caller is not None and caller.cancelling():
            raise
    except Exception:
        pass


@contextmanager
def agent_tool_context(agent, call):
    # Owner fencing prevents spawned loops/children inheriting a parent's call.
    token = _agent_call.set((asyncio.current_task(), agent, call))
    try:
        yield
    finally:
        _agent_call.reset(token)


def get_agent_tool_context() -> dict | None:
    context = _agent_call.get()
    if context is None or context[0] is not asyncio.current_task():
        return None
    _, agent, call = context
    return {
        "agent_id": safe_text(agent.id, limit=128),
        "agent_label": safe_text(agent.label, limit=200),
        "parent_agent_id": safe_text(agent.parent_id, limit=128) if agent.parent_id else None,
        "root_agent_id": safe_text(agent.root_id or agent.id, limit=128),
        "originating_turn_id": safe_text(agent.turn_id, limit=128) if agent.turn_id else None,
        "iteration": agent.iteration_count,
        "call_id": safe_text(call["id"], limit=200),
    }
