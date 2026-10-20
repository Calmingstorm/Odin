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

# Discord shows an indicator for ~10 s per POST; discord.py refreshes every 5 s.
TYPING_REFRESH_SECONDS = 5.0
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
        await asyncio.sleep(TYPING_REFRESH_SECONDS)


def _retrieve(task: asyncio.Task) -> None:
    if not task.cancelled():
        task.exception()


@asynccontextmanager
async def turn_typing(channel) -> AsyncIterator[None]:
    """Keep the typing indicator on in the background for the wrapped scope.

    The wrapped work never waits on Discord. While the scope runs, the
    per-step typing wrapper defers to this keeper. The keeper is cancelled
    and joined (bounded) on every exit; a typing failure is logged once per
    scope and never replaces the scope's own exception.
    """
    token = _keeper_active.set(True)
    task: asyncio.Task | None = None
    try:
        try:
            task = asyncio.get_running_loop().create_task(_keep_typing(channel))
            task.add_done_callback(_retrieve)
        except Exception as exc:  # noqa: BLE001 — the work runs without an indicator
            log.warning("Typing indicator could not start (non-fatal): %s", _summary(exc))
        yield
    finally:
        _keeper_active.reset(token)
        if task is not None:
            task.cancel()
            try:
                await asyncio.wait({task}, timeout=_STOP_JOIN_SECONDS)
            except asyncio.CancelledError:
                # The scope itself is being cancelled; the keeper already is.
                raise
            except Exception:  # noqa: BLE001
                pass
