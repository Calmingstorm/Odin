"""Terminal fallback recovery must remain readable after a real store reopen."""

from contextlib import ExitStack, closing
from dataclasses import replace

import pytest

from src.computer.controller import ComputerController
from src.computer.models import ComputerError, RequestContext
from src.computer.runtime import recovery
from src.computer.store import ComputerStore
from tests.test_computer_recovery_r5 import descriptor
from tests.test_hyprland_durable_recovery import durable as durable
from tests.test_hyprland_durable_recovery import recovered as recovered


@pytest.fixture
def interrupted(tmp_path):
    path = tmp_path / "state.db"
    evidence = tmp_path / "evidence"
    store = ComputerStore(path, evidence)
    context = RequestContext("owner", "channel", "before-crash", "host", surface="webui")
    grant = store.create_session(context, platform="wayland", environment="existing_session",
                                 backend="hyprland")
    # A daemon may die after recording the runtime, before native-owner persistence.
    store.record_runtime(grant, descriptor(grant.session_id))
    grant = store.set_state(grant.session_id, "active")
    store.persist_hyprland_task(grant, {"goal": "retain the document"})
    store.begin_action(grant, "interrupted-action", "payload", 10)
    store.record_cleanup(grant.session_id, {"released": False, "unknown_release": True},
                         clean=False)
    controller = ComputerController(store, None, lambda _: True, enabled=True)
    grant = store.get_session(grant.session_id)
    assert grant.state == "quarantined"
    assert store.hyprland_owner(grant.session_id) is None
    with ExitStack() as resources:
        resources.callback(store.close)
        yield controller, store, grant, context, path, evidence, resources


def reopen(resources, path, evidence):
    resources.close()
    return resources.enter_context(closing(ComputerStore(path, evidence)))


@pytest.mark.parametrize("mode", ["administrator_ack", "absence_verified"])
async def test_terminal_fallback_reopens_with_resolution_and_history(
    interrupted, monkeypatch, mode,
):
    controller, store, grant, context, path, evidence, resources = interrupted
    sid = grant.session_id
    pending = store.get_recovery_pending(sid)
    prior = store._hyprland_recovery_record(sid)
    failed_cleanup = store.cleanup(sid)

    async def inspect(value):
        assert value == descriptor(sid)
        return {"status": "attestation_eligible" if mode == "administrator_ack"
                else "absence_verified", "reason": "owned_runtime_gone"}

    if mode == "administrator_ack":
        monkeypatch.setattr(recovery, "verify_reconciliation_prerequisites", inspect)
        result = await controller.operator_reconcile(
            replace(context, turn_id="web-operator"), sid, grant.generation,
            f"ACKNOWLEDGE UNVERIFIED CLEANUP {sid}")
    else:
        monkeypatch.setattr(recovery, "verify_absence", inspect)
        result = await controller.reconcile_recovery(context, sid, grant.generation)
    assert result["state"] == "closed"
    clean = mode == "absence_verified"
    expected_status = "absence_verified" if clean else "operator_acknowledged_unverified"
    assert result["recovery"]["status"] == expected_status
    assert result["recovery"]["complete"] is clean

    reopened = reopen(resources, path, evidence)
    try:
        closed = reopened.get_session(sid)
        assert closed.state == "closed"
        assert closed.generation == grant.generation + 1
        assert closed.consent_generation == grant.consent_generation + 1
        assert reopened.get_recovery_pending(sid) == pending
        record = reopened._hyprland_recovery_record(sid)
        assert record["status"] == expected_status
        assert record["complete"] is clean
        assert record["last_inspection"]["status"] == expected_status
        assert record["last_inspection"]["complete"] is clean
        assert record["pre_recovery_status"] == {
            "status": prior.get("status"), "complete": prior.get("complete")}
        assert all(record[key] == value for key, value in prior.items()
                   if key not in {"status", "complete"})
        assert reopened.receipt(sid, "interrupted-action", "payload")["status"] == "unknown"
        assert record.get("receiver_release_verified") is not True
        assert record.get("runtime_qualified") is not True
        if not clean:
            assert reopened.cleanup(sid) == failed_cleanup
            assert record.get("released") is not True
        assert reopened.create_session(context, platform="wayland",
            environment="existing_session", backend="hyprland").state == "starting"
    finally:
        resources.close()


@pytest.mark.parametrize("reason", ["owned_input_release_unproven", "inspection_timeout",
                                   "process_inspection_unavailable"])
async def test_unknown_inspection_keeps_fence_and_admission_blocked(
    interrupted, monkeypatch, reason,
):
    controller, store, grant, context, path, evidence, resources = interrupted
    pending = store.get_recovery_pending(grant.session_id)
    prior = store._hyprland_recovery_record(grant.session_id)
    failed_cleanup = store.cleanup(grant.session_id)

    async def inspect(value):
        return {"status": "unknown", "reason": reason}

    monkeypatch.setattr(recovery, "verify_absence", inspect)
    result = await controller.reconcile_recovery(context, grant.session_id, grant.generation)
    assert result["state"] == "quarantined"
    reopened = reopen(resources, path, evidence)
    try:
        assert reopened.get_session(grant.session_id) == grant
        assert reopened.get_recovery_pending(grant.session_id) == pending
        assert reopened.cleanup(grant.session_id) == failed_cleanup
        assert reopened._hyprland_recovery_record(grant.session_id) == {
            **prior, "last_inspection": {"status": "unknown", "reason": reason, "complete": False}}
        with pytest.raises(ComputerError, match="session_busy"):
            reopened.create_session(context, platform="wayland",
                environment="existing_session", backend="hyprland")
    finally:
        resources.close()


@pytest.mark.parametrize("acknowledged", [False, True])
def test_resolution_and_close_roll_back_together(interrupted, monkeypatch, acknowledged):
    _, store, grant, _, path, evidence, resources = interrupted
    prior = store._hyprland_recovery_record(grant.session_id)
    cleanup = store.cleanup(grant.session_id)
    pending = store.get_recovery_pending(grant.session_id)
    set_state = store.set_state

    def fail_after_state_write(*args, **kwargs):
        set_state(*args, **kwargs)
        raise OSError("injected close failure")

    monkeypatch.setattr(store, "set_state", fail_after_state_write)
    with pytest.raises(OSError, match="injected close failure"):
        store.finish_recovery(grant, {
            "status": "operator_acknowledged_unverified" if acknowledged else "absence_verified",
            "reason": ("operator_verified_external_cleanup" if acknowledged
                       else "owned_runtime_gone"),
            "operator_id": "admin", "recorded_processes_absent": True}, acknowledged=acknowledged)
    reopened = reopen(resources, path, evidence)
    try:
        assert reopened.get_session(grant.session_id) == grant
        assert reopened.get_recovery_pending(grant.session_id) == pending
        assert reopened._hyprland_recovery_record(grant.session_id) == prior
        assert reopened.cleanup(grant.session_id) == cleanup
    finally:
        resources.close()


def test_absence_resolution_preserves_native_unknown_release_history(recovered, tmp_path):
    controller, store, grant, context, *_ = recovered
    sid = grant.session_id
    pending = store.get_recovery_pending(sid)
    pending = store.transition_recovery_pending(
        sid, recovery_generation=pending.recovery_generation,
        grant_generation=pending.grant_generation, stop_epoch=pending.stop_epoch,
        phase="unknown_release", reason="unknown_release", attempt=0, next_retry_at=None)
    store.record_hyprland_recovery_assessment(
        grant, state="operator_release_required", released=False, resources_retired=False)
    prior = store._hyprland_recovery_record(sid)
    closed = store.finish_recovery(grant, {"status": "absence_verified",
                                         "reason": "owned_runtime_gone"})
    assert closed.state == "closed"
    store.close()
    # The recovered fixture closes controller.store, now the reopened instance.
    controller.store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    reopened = controller.store
    record = reopened._hyprland_recovery_record(sid)
    assert record["status"] == "absence_verified"
    assert record["complete"] is True
    assert record["pre_recovery_status"] == {"status": "operator_release_required",
                                             "complete": False}
    assert all(record[key] == value for key, value in prior.items()
               if key not in {"status", "complete"})
    assert record["released"] is False
    assert record["resources_retired"] is False
    assert record["receiver_release_verified"] is False
    assert record["runtime_qualified"] is False
    assert reopened.get_recovery_pending(sid) == pending
    with pytest.raises(ComputerError, match="hyprland_reconciliation_required"):
        reopened.create_session(context, platform="wayland", environment="existing_session",
            backend="hyprland", recovery_session_id=sid, recovery_generation=closed.generation)
