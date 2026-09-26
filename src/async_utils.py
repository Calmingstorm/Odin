"""Async utilities shared across modules."""
from __future__ import annotations

import asyncio
import functools
from collections.abc import Callable
from typing import Any, TypeVar

from .odin_log import get_logger

_T = TypeVar("_T")

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


async def _settle_executor_call(call: Callable[[], Any]) -> tuple[asyncio.Future, bool]:
    """Run ``call`` on the default executor and wait until it has physically finished.

    The wait survives any number of caller cancellations: each one is recorded
    and the executor future is awaited again through ``asyncio.shield``. An
    executor future is not a ``Task``, so the shutdown drain that cancels
    ``asyncio.all_tasks()`` cannot cancel it either.
    Returns ``(done_future, was_cancelled)``.
    """
    loop = asyncio.get_running_loop()
    fut = loop.run_in_executor(None, call)
    was_cancelled = False
    while not fut.done():
        try:
            await asyncio.shield(fut)
        except asyncio.CancelledError:
            was_cancelled = True
        except Exception:
            break  # worker raised; fut.done() is now True
    return fut, was_cancelled


async def run_persist_settled(
    persist_sync: Callable[[], Any],
) -> tuple[BaseException | None, bool]:
    """Run a sync write to settlement; never raise. Returns ``(exc, was_cancelled)``.

    The caller commits or restores its own state, then re-raises
    cancellation when ``was_cancelled`` is true.
    """
    fut, was_cancelled = await _settle_executor_call(persist_sync)
    return fut.exception(), was_cancelled


async def to_thread_settled(func: Callable[..., _T], /, *args: Any, **kwargs: Any) -> _T:
    """``asyncio.to_thread`` for work done while an ``asyncio.Lock`` is held.

    Cancelling ``asyncio.to_thread`` releases the caller's lock while the
    worker keeps running. This keeps the caller (and so the lock) until the
    worker has finished, then re-raises the cancellation. Without a
    cancellation it returns the result or raises the worker's exception,
    exactly like ``asyncio.to_thread``.
    """
    fut, was_cancelled = await _settle_executor_call(functools.partial(func, *args, **kwargs))
    if was_cancelled:
        fut.exception()  # retrieve, so a worker error is never "never retrieved"
        raise asyncio.CancelledError
    return fut.result()
