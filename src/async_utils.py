"""Async utilities shared across modules."""
from __future__ import annotations

import asyncio

from .odin_log import get_logger

_log = get_logger("async_utils")


def fire_and_forget(coro, *, name: str = "") -> asyncio.Task:
    """Create a task that logs exceptions instead of silently dropping them."""
    task = asyncio.create_task(coro)

    def _done_cb(t: asyncio.Task) -> None:
        if t.cancelled():
            return
        exc = t.exception()
        if exc is not None:
            label = name or t.get_name()
            _log.error("Background task %s failed: %s", label, exc, exc_info=exc)

    task.add_done_callback(_done_cb)
    return task
