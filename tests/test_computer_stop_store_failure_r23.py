"""Safe storage fault injection must never keep native desktop authority alive."""

import asyncio
import sqlite3
from unittest.mock import AsyncMock

import pytest

from src.computer.controller import ComputerController
from src.computer.models import BackendCapabilities, ComputerError, LiveSession, RequestContext
from src.computer.store import ComputerStore
from tests.test_computer_contract_r1 import Stub


@pytest.fixture
def rig(tmp_path):
    store = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    backend = Stub()
    backend.creates_devices = False
    backend.capabilities = BackendCapabilities(
        "x11", "existing_session", "shared", "shared", "verified", "verified"
    )
    backend.input_supported = True
    backend.detach = AsyncMock(
        return_value={
            "stopped": True,
            "released": True,
            "applications_preserved": True,
            "input_revoked": True,
            "capture_revoked": True,
            "owned_devices": "not_created",
        }
    )
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("owner", "channel", "turn", "host")
    grant = store.create_session(context, environment="existing_session")
    grant = store.set_state(grant.session_id, "active")
    live = LiveSession(backend, controller.monotonic() + 60, capabilities=backend.capabilities)
    controller._live[grant.session_id] = live
    yield store, backend, controller, context, grant, live
    store.close()


def fail_write(*args, **kwargs):
    raise sqlite3.OperationalError("stubbed unavailable persistence")


@pytest.mark.parametrize("operation", ["stop", "cancel", "close", "pause", "disable"])
async def test_write_failure_fences_authority_and_still_detaches(rig, monkeypatch, operation):
    store, backend, controller, context, grant, live = rig
    sid = grant.session_id
    observed, _ = await controller._capture(grant)
    await controller.validate_observation_delivery(
        context, observed.frame_metadata, observed.image_sha256
    )

    # Check the synchronous controller fence inside the mocked native detach,
    # not just dictionary clearing after the cleanup operation has finished.
    async def detach():
        assert live.revoked and not live.observations
        assert sid not in controller._delivered_observations
        with pytest.raises(ComputerError, match="grant_revoked"):
            controller._active(grant)
        return backend.detach.return_value

    backend.detach.side_effect = detach
    with monkeypatch.context() as patch:
        patch.setattr(store, "set_state", fail_write)
        patch.setattr(store, "record_cleanup", fail_write)
        with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
            if operation == "disable":
                await controller.set_enabled(False)
            else:
                await controller.session(context, {"operation": operation, "session_id": sid})
        backend.detach.assert_awaited_once()
        assert store.get_session(sid).state == "active"  # Failure really did persist.
        assert live.revoked and not live.observations
        assert not controller._public_session(grant)["input_supported"]
        with pytest.raises(ComputerError, match="grant_revoked"):
            await controller._capture(grant)
        controller.enabled = True
        with pytest.raises(ComputerError, match="grant_revoked"):
            await controller.validate_observation_delivery(
                context, observed.frame_metadata, observed.image_sha256
            )
    # An explicit cleanup retry may persist closure, never revive the old grant.
    closed = await controller._stop(sid, "closed")
    assert closed["state"] == "closed" and closed["cleanup"]["complete"] is True
    assert sid not in controller._live


@pytest.mark.parametrize("fault", ["record_cleanup", "cleanup", "terminal_state", "get_session"])
async def test_persistence_failure_keeps_fenced_adapter_for_cleanup_retry(rig, monkeypatch, fault):
    store, backend, controller, _, grant, live = rig
    set_state = store.set_state

    def fail_terminal(sid, state, **kwargs):
        if state == "closed":
            fail_write()
        return set_state(sid, state, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(
            store,
            "set_state" if fault == "terminal_state" else fault,
            fail_terminal if fault == "terminal_state" else fail_write,
        )
        with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
            await controller._stop(grant.session_id, "closed")
        backend.detach.assert_awaited_once()
        assert live.revoked and controller._live[grant.session_id] is live
        with pytest.raises(ComputerError, match="grant_revoked"):
            controller._active(grant)
    result = await controller._stop(grant.session_id, "closed")
    assert result["state"] == "closed"


async def test_failed_stop_cannot_resume_stored_paused_grant(rig, monkeypatch):
    store, backend, controller, context, grant, live = rig
    grant = store.set_state(grant.session_id, "paused")
    backend.resume = AsyncMock()
    with monkeypatch.context() as patch:
        patch.setattr(store, "set_state", fail_write)
        with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
            await controller._stop(grant.session_id, "closed")
    with pytest.raises(ComputerError, match="resume_unavailable"):
        await controller.session(
            context,
            {"operation": "resume", "session_id": grant.session_id, "generation": grant.generation},
        )
    backend.resume.assert_not_awaited()
    assert live.revoked
    await controller.close()


async def test_detach_failure_and_store_failure_never_restore_authority(rig, monkeypatch):
    store, backend, controller, _, grant, live = rig
    backend.detach.side_effect = RuntimeError("stubbed native failure")
    with monkeypatch.context() as patch:
        patch.setattr(store, "set_state", fail_write)
        with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
            await controller._stop(grant.session_id, "closed")
    backend.detach.assert_awaited_once()
    assert live.revoked and controller._live[grant.session_id] is live
    backend.detach.side_effect = None
    await controller.close()


async def test_stop_fence_interrupts_inflight_authority_before_detach_finishes(rig, monkeypatch):
    store, backend, controller, _, grant, live = rig
    entered, finish = asyncio.Event(), asyncio.Event()

    async def detach():
        entered.set()
        await finish.wait()
        return backend.detach.return_value

    backend.detach.side_effect = detach
    with monkeypatch.context() as patch:
        patch.setattr(store, "set_state", fail_write)
        task = asyncio.create_task(controller._stop(grant.session_id, "closed"))
        try:
            await asyncio.wait_for(entered.wait(), 1)
            assert live.revoked and not task.done()
            with pytest.raises(ComputerError, match="grant_revoked"):
                controller._active(grant)
        finally:
            finish.set()
            with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
                await task
    await controller.close()


async def test_no_live_adapter_write_failure_still_forgets_delivered_authority(rig, monkeypatch):
    store, _, controller, _, grant, _ = rig
    controller._live.pop(grant.session_id)
    controller._delivered_observations[grant.session_id] = "old-frame"
    with monkeypatch.context() as patch:
        patch.setattr(store, "set_state", fail_write)
        with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
            await controller._stop(grant.session_id, "closed")
    assert grant.session_id not in controller._delivered_observations


async def test_pause_single_write_failure_still_closes_native_path(rig, monkeypatch):
    store, backend, controller, _, grant, live = rig
    set_state = store.set_state

    def fail_pause(sid, state, **kwargs):
        if state == "paused":
            fail_write()
        return set_state(sid, state, **kwargs)

    monkeypatch.setattr(store, "set_state", fail_pause)
    with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
        await controller._pause(grant.session_id)
    assert live.revoked
    backend.detach.assert_awaited_once()
    assert store.get_session(grant.session_id).state == "cancelled"


@pytest.mark.parametrize("phase", ["start", "start_authorization", "resume_authorization"])
async def test_failed_stop_cannot_be_overwritten_by_inflight_activation(rig, monkeypatch, phase):
    store, backend, controller, context, grant, _ = rig
    # Reuse the safe backend, not the pre-created fixture session.
    await controller._stop(grant.session_id, "closed")
    entered, finish = asyncio.Event(), asyncio.Event()
    calls = 0

    async def authorize(_):
        nonlocal calls
        calls += 1
        if phase != "start" and calls == 2:
            entered.set()
            await finish.wait()
        return True

    async def start(sid):
        entered.set()
        await finish.wait()

    operation = {"operation": "start"}
    if phase == "resume_authorization":
        grant = store.create_session(context, environment="existing_session")
        grant = store.set_state(grant.session_id, "paused")
        controller._live[grant.session_id] = LiveSession(
            backend, controller.monotonic() + 60, capabilities=backend.capabilities
        )
        backend.resume = AsyncMock()
        operation = {
            "operation": "resume",
            "session_id": grant.session_id,
            "generation": grant.generation,
        }
    elif phase == "start":
        backend.start = start
    controller.authorize = authorize
    task = asyncio.create_task(controller.session(context, operation))
    try:
        await asyncio.wait_for(entered.wait(), 1)
        current = store.find_session(context)
        with monkeypatch.context() as patch:
            patch.setattr(store, "set_state", fail_write)
            with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
                await controller._stop(current.session_id, "closed")
            finish.set()
            with pytest.raises(ComputerError):
                await task
            assert store.get_session(current.session_id).state in {"starting", "paused"}
            assert controller._live[current.session_id].revoked
            assert current.session_id not in controller._watchdogs
    finally:
        finish.set()
        await asyncio.gather(task, return_exceptions=True)
        await controller.close()


async def test_no_live_adapter_read_failure_cannot_preserve_delivery(rig, monkeypatch):
    store, _, controller, _, grant, _ = rig
    controller._live.pop(grant.session_id)
    controller._delivered_observations[grant.session_id] = "old-frame"
    monkeypatch.setattr(store, "get_session", fail_write)
    with pytest.raises(ComputerError, match="cleanup_persistence_failed"):
        await controller._stop(grant.session_id, "closed")
    assert grant.session_id not in controller._delivered_observations
