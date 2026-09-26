"""Contract of the shared settle helpers extracted from LLMGateway.run_persist_settled."""
from __future__ import annotations

import asyncio
import threading

import pytest

from src.async_utils import run_persist_settled, to_thread_settled


async def test_to_thread_settled_returns_result_and_raises_worker_error():
    assert await to_thread_settled(lambda a, b=0: a + b, 2, b=3) == 5
    with pytest.raises(OSError, match="disk full"):
        await to_thread_settled(lambda: (_ for _ in ()).throw(OSError("disk full")))


async def test_cancellation_waits_for_worker_then_reraises():
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()

    def work():
        entered.set()
        release.wait(5)
        finished.set()
        return "written"

    task = asyncio.create_task(to_thread_settled(work))
    await asyncio.to_thread(entered.wait, 5)
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    for _ in range(20):
        await asyncio.sleep(0)
    assert not task.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert finished.is_set()


async def test_shutdown_drain_cannot_release_the_lock_early():
    """src/__main__.py cancels every task in asyncio.all_tasks() at shutdown."""
    lock = asyncio.Lock()
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()

    def work():
        entered.set()
        release.wait(5)
        finished.set()

    async def owner():
        async with lock:
            await to_thread_settled(work)

    task = asyncio.create_task(owner())
    await asyncio.to_thread(entered.wait, 5)
    me = asyncio.current_task()
    for _ in range(2):
        for other in asyncio.all_tasks():
            if other is not me:
                other.cancel()
        for _ in range(20):
            await asyncio.sleep(0)
    assert lock.locked() and not finished.is_set()
    release.set()
    await asyncio.gather(task, return_exceptions=True)
    assert finished.is_set() and not lock.locked()


async def test_run_persist_settled_contract_unchanged():
    exc, cancelled = await run_persist_settled(lambda: None)
    assert (exc, cancelled) == (None, False)
    exc, cancelled = await run_persist_settled(lambda: (_ for _ in ()).throw(OSError("x")))
    assert isinstance(exc, OSError) and cancelled is False
