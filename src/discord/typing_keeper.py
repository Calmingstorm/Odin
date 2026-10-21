"""One background typing indicator per turn, never on the turn's critical path.

Waiting for Discord's typing POST before every model call and every tool batch
cost each Discord step ~150 ms (and up to 1 s on a slow endpoint). The keeper
sends the POST from its own task and refreshes it, so the indicator stays on
for the whole scope while the work runs without waiting on it.
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar

from ..odin_log import get_logger

log = get_logger("discord")

# Discord shows an indicator for 10 s per POST. Refreshing every 8 s, plus at
# most one bounded POST, keeps it continuous with fewer calls than 5 s would.
TYPING_REFRESH_SECONDS = 8.0
# Per-POST ceiling, as the per-step wrapper used (a dead endpoint once burned
# discord.py's ~17 s 5xx retry per attempt).
TYPING_ATTEMPT_TIMEOUT = 1.0
# Bounded join when the scope ends; the keeper is already cancelled by then.
_STOP_JOIN_SECONDS = 2.0

_keeper_active: ContextVar[bool] = ContextVar("turn_typing_keeper_active", default=False)


def turn_typing_active() -> bool:
    """Whether a keeper owns the indicator in the current context."""
    return _keeper_active.get()


def _summary(exc: BaseException) -> str:
    text = str(exc).strip().splitlines()
    detail = text[0][:160] if text else ""
    return f"{type(exc).__name__}: {detail}" if detail else type(exc).__name__


async def _keep_typing(channel) -> None:
    warned = False
    keeper = asyncio.current_task()
    while True:
        try:
            pending = channel.typing()
            if not hasattr(pending, "__await__"):
                # Web and API channels have no indicator to keep.
                return
            await asyncio.wait_for(pending, timeout=TYPING_ATTEMPT_TIMEOUT)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — cosmetic; never reaches the turn
            if not warned:
                warned = True
                log.warning("Typing indicator refresh failed (non-fatal): %s", _summary(exc))
        if keeper is not None and keeper.cancelling():
            return  # a POST swallowed this keeper's cancellation: stop now
        await asyncio.sleep(TYPING_REFRESH_SECONDS)


def _retrieve(task: asyncio.Task) -> None:
    if not task.cancelled():
        task.exception()


# Keepers still finishing after their scope ended (a POST that delays its own
# cancellation). Held here until they finish, so none is ever abandoned.
_unsettled: set[asyncio.Task] = set()


def _own(task: asyncio.Task) -> None:
    if task.done():
        return
    _unsettled.add(task)
    task.add_done_callback(_unsettled.discard)


@asynccontextmanager
async def turn_typing(channel) -> AsyncIterator[None]:
    """Keep the typing indicator on in the background for the wrapped scope.

    The wrapped work never waits on Discord. While the scope runs, the
    per-step typing wrapper defers to this keeper. On every exit the keeper is
    cancelled. When the scope raised, nothing more is awaited, so its own
    exception is what propagates; otherwise the keeper is joined, bounded. A
    keeper that has not finished by then is held until it does. A typing
    failure is logged once per scope.
    """
    if channel is None:
        # A turn with no channel (synthetic or minimal state) has no indicator.
        yield
        return
    token = _keeper_active.set(True)
    task: asyncio.Task | None = None
    try:
        task = asyncio.get_running_loop().create_task(_keep_typing(channel))
        task.add_done_callback(_retrieve)
    except Exception as exc:  # noqa: BLE001 — the work runs without an indicator
        log.warning("Typing indicator could not start (non-fatal): %s", _summary(exc))
    try:
        yield
    except BaseException:
        _keeper_active.reset(token)
        if task is not None:
            task.cancel()
            _own(task)
        raise
    _keeper_active.reset(token)
    if task is not None:
        task.cancel()
        try:
            await asyncio.wait({task}, timeout=_STOP_JOIN_SECONDS)
        finally:
            # Unfinished after the deadline, or this scope was cancelled while
            # joining: the keeper is held until it finishes.
            if not task.done():
                log.warning("Typing indicator refresh did not stop within %.0f s; "
                            "it is tracked until it does", _STOP_JOIN_SECONDS)
            _own(task)
