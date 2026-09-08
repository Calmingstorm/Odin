"""Cancellation/GC behaviour without a desktop, native input, or source assertions."""

import asyncio
import gc
import logging
import weakref

import pytest

from src.computer import controller as lifetime
from src.computer.controller import ComputerController
from src.computer.models import RequestContext
from src.computer.store import ComputerStore
from tests.test_computer_contract_r1 import Stub


@pytest.fixture
async def rig(tmp_path):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = Stub()
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("owner", "channel", "turn", "host")
    try:
        yield controller, backend, context
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("owned", [False, True])
async def test_pending_waiter_gc_requires_external_task_owner(monkeypatch, caplog, owned):
    """The unowned control really emits asyncio's pending-destruction warning."""
    monkeypatch.setattr(lifetime, "_CANCEL_SETTLE_SECONDS", 0.01)
    caplog.set_level(logging.WARNING, logger=lifetime.__name__)
    loop = asyncio.get_running_loop()
    errors = []
    original = loop.get_exception_handler()
    loop.set_exception_handler(lambda _loop, context: errors.append(context["message"]))
    entered, cancelled = asyncio.Event(), asyncio.Event()
    refs = {}

    async def primitive():
        refs["task"] = weakref.ref(asyncio.current_task())
        entered.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            waiter = loop.create_future()
            refs["waiter"] = weakref.ref(waiter)
            cancelled.set()
            await waiter

    try:
        if owned:
            with pytest.raises(TimeoutError):
                await lifetime._bounded(primitive(), 0.01)
        else:
            task = asyncio.create_task(primitive())
            await entered.wait()
            task.cancel()
            # Exactly the old ownership model: this callback cannot root task.
            task.add_done_callback(lambda done: None if done.cancelled() else done.exception())
            del task
        await cancelled.wait()
        # Expire the diagnostic handle too: it must not be the sole strong root.
        await asyncio.sleep(0.03)
        gc.collect()
        await asyncio.sleep(0)
        if owned:
            assert refs["task"]() is not None
            assert not errors
            assert "retaining ownership until completion" in caplog.text
            refs["waiter"]().set_result(None)
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            gc.collect()
            assert refs["task"]() is None
        else:
            assert refs["task"]() is None
            assert any("Task was destroyed but it is pending" in error for error in errors)
    finally:
        if refs.get("task") and refs["task"]() is not None:
            task = refs["task"]()
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        loop.set_exception_handler(original)


@pytest.mark.parametrize("interrupt", ["timeout", "caller_cancel"])
async def test_resistant_primitive_does_not_extend_return_deadline(monkeypatch, interrupt):
    monkeypatch.setattr(lifetime, "_CANCEL_SETTLE_SECONDS", 0.2)
    entered, cancelled, release = asyncio.Event(), asyncio.Event(), asyncio.Event()

    async def primitive():
        entered.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            cancelled.set()
            await release.wait()
            raise RuntimeError("late primitive failure")

    task = asyncio.create_task(
        lifetime._bounded(primitive(), 0.01 if interrupt == "timeout" else 60)
    )
    await entered.wait()
    started = asyncio.get_running_loop().time()
    if interrupt == "caller_cancel":
        task.cancel()
    try:
        with pytest.raises(TimeoutError if interrupt == "timeout" else asyncio.CancelledError):
            await asyncio.wait_for(task, 0.15)
        assert asyncio.get_running_loop().time() - started < 0.15
        await cancelled.wait()
        assert not release.is_set()
    finally:
        release.set()
        await asyncio.sleep(0)
        await asyncio.sleep(0)


async def test_cooperative_cancellation_settles_without_diagnostic(monkeypatch, caplog):
    monkeypatch.setattr(lifetime, "_CANCEL_SETTLE_SECONDS", 0.01)
    finished = asyncio.Event()

    async def primitive():
        try:
            await asyncio.Future()
        finally:
            finished.set()

    with pytest.raises(TimeoutError):
        await lifetime._bounded(primitive(), 0.001)
    await asyncio.wait_for(finished.wait(), 0.1)
    await asyncio.sleep(0.02)
    assert "cancellation did not settle" not in caplog.text


async def test_late_exception_is_consumed_and_completed_task_owner_released():
    loop = asyncio.get_running_loop()
    original = loop.get_exception_handler()
    errors, refs = [], {}
    loop.set_exception_handler(lambda _loop, context: errors.append(context["message"]))
    release = asyncio.Event()

    async def primitive():
        refs["task"] = weakref.ref(asyncio.current_task())
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            await release.wait()
            raise RuntimeError("late failure after timeout")

    try:
        with pytest.raises(TimeoutError):
            await lifetime._bounded(primitive(), 0.001)
        release.set()
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        gc.collect()
        assert refs["task"]() is None
        assert not errors
    finally:
        release.set()
        loop.set_exception_handler(original)


async def test_stop_drains_cancelled_watchdog_before_return(rig):
    controller, backend, context = rig
    grant = await controller.session(context, {"operation": "start", "app": "profile"})
    sid = grant["session_id"]
    timer = controller._watchdogs[sid]
    result = await controller._stop(sid, "closed")
    assert timer.done() and timer.cancelled()
    assert sid not in controller._watchdogs and sid not in controller._stops
    assert result["state"] == "closed" and backend.stopped


async def test_firing_watchdog_does_not_join_its_own_stop(rig):
    controller, backend, context = rig
    grant = await controller.session(context, {"operation": "start", "app": "profile"})
    sid = grant["session_id"]
    old = controller._watchdogs.pop(sid)
    old.cancel()
    await asyncio.gather(old, return_exceptions=True)
    timer = asyncio.create_task(controller._deadline(sid, 0))
    controller._watchdogs[sid] = timer
    await asyncio.wait_for(timer, 0.5)
    assert not timer.cancelled()
    assert sid not in controller._watchdogs and sid not in controller._stops
    assert controller.store.get_session(sid).state == "cancelled"
    assert backend.stopped


async def test_stop_without_live_adapter_still_drains_watchdog(rig):
    controller, _backend, context = rig
    grant = controller.store.create_session(context, "profile")
    timer = asyncio.create_task(controller._deadline(grant.session_id, 60))
    controller._watchdogs[grant.session_id] = timer
    result = await controller._stop(grant.session_id, "closed")
    assert timer.done() and timer.cancelled()
    assert grant.session_id not in controller._watchdogs
    assert result["state"] == "quarantined"


async def test_resistant_watchdog_does_not_block_stop(rig, monkeypatch, caplog):
    monkeypatch.setattr(lifetime, "_CANCEL_SETTLE_SECONDS", 0.01)
    controller, backend, context = rig
    grant = await controller.session(context, {"operation": "start", "app": "profile"})
    sid = grant["session_id"]
    old = controller._watchdogs.pop(sid)
    old.cancel()
    await asyncio.gather(old, return_exceptions=True)
    entered, release = asyncio.Event(), asyncio.Event()

    async def resistant_timer():
        entered.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            await release.wait()

    timer = asyncio.create_task(resistant_timer())
    controller._watchdogs[sid] = timer
    await entered.wait()
    try:
        result = await asyncio.wait_for(controller._stop(sid, "closed"), 0.5)
        assert result["state"] == "closed" and backend.stopped
        assert not timer.done()
        assert "cancellation did not settle" in caplog.text
    finally:
        release.set()
        await timer


@pytest.mark.parametrize("cancel_twice", [False, True])
async def test_cancelled_stop_caller_returns_bounded_but_cleanup_remains_owned(
    rig, monkeypatch, cancel_twice
):
    monkeypatch.setattr(lifetime, "_CANCEL_SETTLE_SECONDS", 0.01)
    controller, backend, context = rig
    grant = await controller.session(context, {"operation": "start", "app": "profile"})
    sid = grant["session_id"]
    entered, release = asyncio.Event(), asyncio.Event()

    async def stop():
        entered.set()
        await release.wait()
        return {"stopped": False}

    backend.stop = stop
    caller = asyncio.create_task(controller._stop(sid, "closed"))
    await entered.wait()
    worker = controller._stops[sid]
    caller.cancel()
    if cancel_twice:
        await asyncio.sleep(0)
        caller.cancel()
    try:
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(caller, 0.1)
        assert not worker.done()
        assert controller.store.get_session(sid).state == "quarantined"
    finally:
        release.set()
        await worker
    # Settlement is not success. The failed receipt must still retain quarantine.
    assert controller.store.get_session(sid).state == "quarantined"
    assert not controller.store.cleanup(sid)["complete"]
    assert sid not in controller._stops
