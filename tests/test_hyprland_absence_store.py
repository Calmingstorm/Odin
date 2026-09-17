"""Strict durable admission of backend-verified absence, not native qualification."""

import asyncio
import json
from dataclasses import replace

import pytest

from src.computer.models import ComputerError, RequestContext
from src.computer.provisioning import ComputerProvisioningError
from src.computer.runtime.hyprland_recovery import HyprlandRecoveryResult
from src.computer.runtime.hyprland_scope import owner_handle_from_record, owner_handle_to_record
from src.computer.store import ComputerStore, canonical_hash
from tests.test_hyprland_durable_reconnect import durable as durable
from tests.test_hyprland_recovery_controller import owner_descriptor
from tests.test_hyprland_recovery_controller import rig as rig

COMMAND = "a" * 32


def absence(owner, command=COMMAND):
    predecessor = (owner_handle_from_record(owner).compositor.digest
                   if owner.get("version") == 2 else owner["compositor"]["digest"])
    return {
        "protocol": "hyprland-resource-absence-v1",
        "resource_model": "wayland-process-local-v1",
        "owner_digest": canonical_hash(owner),
        "predecessor_digest": predecessor,
        "successor_digest": "b" * 64,
        "command_id": command,
        "inventory_digest": "c" * 64,
        "native_certificate_digest": "d" * 64,
        "original_compositor_exited": True,
        "original_guardian_exited": True,
        "local_resources_closed": True,
        "receiver_release_verified": False,
    }


@pytest.fixture(params=[1, 2])
def pending(tmp_path, durable, request):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    context = RequestContext("owner", "channel", "turn", "host")
    grant = store.create_session(context, platform="wayland", environment="existing_session",
                                 backend="hyprland")
    owner = owner_descriptor()
    owner["compositor"]["digest"] = "e" * 64
    if request.param == 2:
        owner = owner_handle_to_record(durable[1])
    store.record_hyprland_owner(grant, owner)
    grant = store.set_state(grant.session_id, "active")
    grant = store.begin_hyprland_reconciliation(
        grant, phase="unknown_release", reason="unknown_release",
        old_grant={"generation": grant.generation,
                   "consent_generation": grant.consent_generation,
                   "task_hints": {"goal": "finish drawing"}, "authorizes_input": False,
                   "recovery_command_id": COMMAND})
    store.record_cleanup(grant.session_id, {"released": False, "unknown_release": True},
                         clean=False)
    yield store, context, grant, owner
    store.close()


def record(store, grant, owner, **changes):
    args = dict(state="fresh_target_required", released=False, resources_retired=True,
                runtime_qualified=True, recovery_generation=grant.generation,
                retirement_evidence=absence(owner))
    args.update(changes)
    store.record_hyprland_recovery_assessment(grant, **args)


def test_absence_survives_reopen_and_only_allows_new_session(pending, tmp_path):
    store, context, grant, owner = pending
    cleanup = store.cleanup(grant.session_id)
    record(store, grant, owner)
    reopened = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    try:
        status = reopened.recovery_status(grant.session_id)
        assert status["runtime_qualified"] and status["resources_retired"]
        assert status["unknown_release"] and not status["released"]
        assert not status["complete"] and not status["receiver_release_verified"]
        assert reopened.get_session(grant.session_id).state == "quarantined"
        successor = reopened.create_session(
            context, platform="wayland", environment="existing_session", backend="hyprland",
            recovery_session_id=grant.session_id, recovery_generation=grant.generation)
        assert successor.session_id != grant.session_id and successor.state == "starting"
        assert reopened.get_session(grant.session_id).state == "closed"
        assert reopened.recovery_status(grant.session_id)["status"] == "native_reconciled"
        assert reopened.cleanup(grant.session_id) == cleanup
        assert reopened.hyprland_task_lineage(successor.session_id)["task_hints"] == {
            "goal": "finish drawing"}
        reopened._validate_current_schema()
    finally:
        reopened.close()
    reopened = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    try:
        assert not reopened.recovery_status(grant.session_id)["receiver_release_verified"]
    finally:
        reopened.close()


@pytest.mark.parametrize("changes", [
    {"retirement_evidence": None}, {"retirement_evidence": {}},
    {"released": True}, {"released": 0}, {"resources_retired": False},
    {"runtime_qualified": 1}, {"runtime_qualified": False},
    {"recovery_generation": None}, {"recovery_generation": 1},
    {"recovery_generation": True}, {"state": "operator_release_required"},
])
def test_boolean_and_generation_bypass_rejected(pending, changes):
    store, _, grant, owner = pending
    with pytest.raises(ComputerError, match="invalid_recovery_pending"):
        record(store, grant, owner, **changes)
    assert not (store.recovery_status(grant.session_id) or {}).get("runtime_qualified")


@pytest.mark.parametrize("key,value", [
    ("protocol", "unknown"), ("resource_model", "global-device"),
    ("owner_digest", "f" * 64), ("predecessor_digest", "f" * 64),
    ("successor_digest", "e" * 64), ("inventory_digest", "bad"),
    ("native_certificate_digest", None), ("command_id", "f" * 32),
    ("original_compositor_exited", False), ("original_guardian_exited", 1),
    ("local_resources_closed", False), ("receiver_release_verified", True),
    ("extra", True),
])
def test_forged_or_malformed_binding_rejected(pending, key, value):
    store, _, grant, owner = pending
    evidence = absence(owner)
    if key == "successor_digest":
        value = evidence["predecessor_digest"]
    evidence[key] = value
    with pytest.raises(ComputerError, match="invalid_recovery_pending"):
        record(store, grant, owner, retirement_evidence=evidence)


@pytest.mark.parametrize("field,value", [
    ("released", True), ("release_ack", True), ("receiver_release_verified", True),
    ("unknown_release", False), ("complete", True), ("recovery_generation", 99),
    ("retirement_evidence", {}), ("runtime_qualified", False),
    ("status", "absence_verified"), ("original_outcome", "executed"),
])
def test_tampered_persisted_assessment_rejected_on_reopen(pending, tmp_path, field, value):
    store, _, grant, owner = pending
    record(store, grant, owner)
    row = store._hyprland_recovery_record(grant.session_id)
    row[field] = value
    store.db.execute("UPDATE session_recovery SET result=? WHERE session_id=?",
                     (json.dumps(row), grant.session_id))
    with pytest.raises(ComputerProvisioningError) as error:
        ComputerStore(tmp_path / "db", tmp_path / "evidence")
    assert error.value.code == "storage_schema_unsupported"


def test_cancellation_and_stale_grant_do_not_restore_continuation(pending):
    store, context, grant, owner = pending
    with pytest.raises(ComputerError, match="grant_revoked"):
        record(store, replace(grant, generation=grant.generation + 1), owner)
    record(store, grant, owner)
    store.cancel_hyprland_continuation(grant.session_id)
    with pytest.raises(ComputerError, match="hyprland_reconciliation_required"):
        store.create_session(context, platform="wayland", environment="existing_session",
                             backend="hyprland", recovery_session_id=grant.session_id,
                             recovery_generation=grant.generation)


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", ["unknown_release", "native_continuity_lost"])
@pytest.mark.parametrize("fault", [None, "binding", "receiver", "outcome", "boolean", "command",
                                   "epoch", "guardian_process_reaped", "scope_connection_closed",
                                   "local_resources_closed"])
async def test_controller_admits_only_bounded_unknown_absence(rig, fault, phase):
    controller, store, _, grant, live, committed, _ = rig
    owner = owner_descriptor()
    owner["compositor"]["digest"] = "e" * 64
    store.record_hyprland_owner(grant, owner)

    async def recover(**kwargs):
        evidence = absence(owner, kwargs["command_id"])
        cleanup = {"released": False, "release_ack": False, "unknown_release": True,
                   "resources_retired": True, "receiver_release_verified": False,
                   "guardian_process_reaped": True, "scope_connection_closed": True,
                   "local_resources_closed": True,
                   "retirement_basis": "native_resource_absence",
                   "retirement_evidence": evidence}
        result = HyprlandRecoveryResult("fresh_target_required", None, cleanup, "test",
                                       runtime_qualified=True)
        if fault == "binding":
            result = replace(result, binding={"source_id": "forged"})
        elif fault == "receiver":
            result = replace(result, receiver_release_verified=True)
        elif fault == "outcome":
            result = replace(result, original_outcome="executed")
        elif fault == "boolean":
            result = replace(result, cleanup={"resources_retired": True})
        elif fault == "command":
            evidence["command_id"] = "f" * 32
        elif fault == "epoch":
            controller._fence(grant.session_id)
        elif fault in {"guardian_process_reaped", "scope_connection_closed",
                       "local_resources_closed"}:
            cleanup[fault] = False
        return result

    live.backend.recover_native_authority = recover
    if fault:
        with pytest.raises((ComputerError, asyncio.CancelledError)):
            await controller._quarantine_hyprland(grant, live, phase=phase)
    else:
        await controller._quarantine_hyprland(grant, live, phase=phase)
        status = store.recovery_status(grant.session_id)
        assert status["status"] == "fresh_target_required" and status["unknown_release"]
        assert not status["released"] and not status["complete"]
        assert grant.session_id not in controller._live
    assert not committed and store.get_session(grant.session_id).state == "quarantined"


@pytest.mark.parametrize("missing", sorted(absence({"compositor": {"digest": "e" * 64}})))
def test_each_evidence_field_is_mandatory(pending, missing):
    store, _, grant, owner = pending
    evidence = absence(owner)
    del evidence[missing]
    with pytest.raises(ComputerError, match="invalid_recovery_pending"):
        record(store, grant, owner, retirement_evidence=evidence)
