"""Best-effort steering receipts, independent of turns and Discord transport.

Like audit observers, tasks have strong ownership and their exceptions are
consumed. Nothing is scheduled until an item has a terminal mailbox outcome.
These receipts are not execution, model compliance or durability guarantees.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Literal

SteerOutcome = Literal["consumed", "closed"]
SteerNotifier = Callable[[int, SteerOutcome], Awaitable[None]]
NOTIFY_TIMEOUT_SECONDS = 10.0
SHUTDOWN_TIMEOUT_SECONDS = 5.0
_pending_observers: set[asyncio.Task] = set()


def notify_steer(item: dict, outcome: SteerOutcome) -> None:
    """Detach one item-owned receipt; never run transport in the caller.

    No notifier means no coroutine or task. Even task-admission failure must
    not escape into a turn's consumption/cleanup path.
    """
    notifier = item.get("notifier")
    if notifier is None:
        return
    sequence = item["sequence"]

    async def observe() -> None:
        try:
            # Keep transport detached even with an eager task factory.
            await asyncio.sleep(0)
            async with asyncio.timeout(NOTIFY_TIMEOUT_SECONDS):
                await notifier(sequence, outcome)
        except (Exception, asyncio.CancelledError):
            # Expired tokens, network failures and cancellation are terminal.
            # No logging of interaction tokens, retries or user-visible errors.
            pass

    coroutine = observe()
    try:
        task = asyncio.create_task(coroutine)
    except (Exception, asyncio.CancelledError):
        coroutine.close()
        return
    _pending_observers.add(task)

    def settled(done: asyncio.Task) -> None:
        _pending_observers.discard(done)
        if not done.cancelled():
            done.exception()

    task.add_done_callback(settled)


async def finish_steer_notifications() -> None:
    """Graceful shutdown only: a shared deadline before Discord disconnects.

    Normal turns never await their observers. No-steer shutdown is also a
    no-op. A hard process loss cannot deliver process-local notifications.
    """
    loop = asyncio.get_running_loop()
    tasks = {task for task in _pending_observers if task.get_loop() is loop}
    if not tasks:
        return
    try:
        await asyncio.wait(tasks, timeout=SHUTDOWN_TIMEOUT_SECONDS)
    finally:
        pending = []
        for task in tasks:
            if not task.done():
                task.cancel()
                pending.append(task)
        if pending:
            # The notifier contract is cooperative cancellation. Finish its
            # cleanup before Discord's HTTP session closes; never on a turn.
            await asyncio.gather(*pending, return_exceptions=True)
