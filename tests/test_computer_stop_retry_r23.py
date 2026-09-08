"""Stop persistence faults: explicit retries and in-flight completions stay fenced."""

import asyncio
from unittest.mock import Mock

import pytest

from src.computer.models import ComputerError
from tests import test_computer_stop_store_failure_r23 as faults

rig = faults.rig
fail_write = faults.fail_write


async def test_waiting_explicit_close_retries_failed_stop(rig, monkeypatch):
    store, backend, controller, context, grant, _ = rig
    entered, finish = asyncio.Event(), asyncio.Event()
    calls = 0

    async def detach():
        nonlocal calls
        calls += 1
        if calls == 1:
            entered.set()
            await finish.wait()
        return backend.detach.return_value

    backend.detach.side_effect = detach
    set_state = store.set_state
    state_calls = 0

    def fail_first(*args, **kwargs):
        nonlocal state_calls
        state_calls += 1
        if state_calls == 1:
            fail_write()
        return set_state(*args, **kwargs)

    monkeypatch.setattr(store, "set_state", fail_first)
    first = asyncio.create_task(controller._stop(grant.session_id, "cancelled"))
    await asyncio.wait_for(entered.wait(), 1)
    second = asyncio.create_task(
        controller.session(context, {"operation": "close", "session_id": grant.session_id})
    )
    try:
        await asyncio.sleep(0)  # The second caller joins the still-running first stop.
        finish.set()
        with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
            await first
        result = await second
        assert result["state"] == "closed" and calls == 2
        assert grant.session_id not in controller._live
    finally:
        finish.set()
        await asyncio.gather(first, second, return_exceptions=True)


async def test_public_close_retries_terminal_write_with_failed_readback(rig, monkeypatch):
    store, backend, controller, context, grant, live = rig
    set_state = store.set_state

    def fail_after_commit(sid, state, **kwargs):
        result = set_state(sid, state, **kwargs)
        if state == "closed":
            fail_write()
        return result

    with monkeypatch.context() as patch:
        patch.setattr(store, "set_state", fail_after_commit)
        with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
            await controller.session(context, {"operation": "close"})
    assert store.get_session(grant.session_id).state == "closed"
    assert controller._live[grant.session_id] is live and live.revoked
    result = await controller.session(context, {"operation": "close"})
    assert result["state"] == "closed"
    assert backend.detach.await_count == 2 and grant.session_id not in controller._live


async def test_failed_stop_blocks_inflight_capture_delivery(rig, monkeypatch):
    store, backend, controller, _, grant, live = rig
    entered, finish = asyncio.Event(), asyncio.Event()
    observe = backend.observe

    async def capture():
        entered.set()
        await finish.wait()
        return await observe()

    backend.observe = capture
    task = asyncio.create_task(controller._capture(grant))
    try:
        await asyncio.wait_for(entered.wait(), 1)
        with monkeypatch.context() as patch:
            patch.setattr(store, "set_state", fail_write)
            with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
                await controller._stop(grant.session_id, "closed")
            finish.set()
            with pytest.raises(ComputerError, match="grant_revoked"):
                await task
        assert live.revoked and not live.observations
    finally:
        finish.set()
        await asyncio.gather(task, return_exceptions=True)
        await controller.close()


async def test_fenced_runtime_callback_cannot_record_new_launch(rig, monkeypatch):
    store, backend, controller, _, grant, _ = rig
    backend.startup_descriptor = Mock(return_value={})
    record = Mock()
    monkeypatch.setattr(store, "record_runtime", record)
    controller._prepare_runtime(grant, backend)
    record.assert_called_once()
    controller._fence(grant.session_id)
    with pytest.raises(ComputerError, match="grant_revoked"):
        backend.runtime_identity_callback({"launch_pending": True})
    record.assert_called_once()
    await controller.close()


async def test_inflight_action_stops_without_new_frame_or_replay(tmp_path, monkeypatch):
    from tests.test_computer_actions_r4 import setup

    async with setup(tmp_path) as (controller, backend, context, action):
        entered, finish = asyncio.Event(), asyncio.Event()

        async def dispatch(payload):
            entered.set()
            await finish.wait()
            return backend.result(payload)

        backend.hook = dispatch
        task = asyncio.create_task(controller.act(context, action))
        try:
            await asyncio.wait_for(entered.wait(), 1)
            with monkeypatch.context() as patch:
                patch.setattr(controller.store, "set_state", fail_write)
                with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
                    await controller._stop(action["session_id"], "closed")
                assert backend.stopped
                finish.set()
                result = await task
            assert "next_observation" not in result
            assert not controller._live[action["session_id"]].observations
            assert await controller.act(context, action) == result
            assert len(backend.calls) == 1  # Receipt replay issues no native input.
        finally:
            finish.set()
            await asyncio.gather(task, return_exceptions=True)
