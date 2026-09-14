import json
from dataclasses import replace
import pytest
from src.computer.models import ComputerError
from src.computer.runtime.local_recovery import local_cleanup_verified
from tests.test_hyprland_durable_recovery import recovered, durable


@pytest.fixture
def evidence():
    return dict(released=True, complete=False, status="operator_acknowledged_unverified",
        recovery_generation=2, recovery_command_id="a" * 32,
        external_cleanup_attestation=dict(status="operator_acknowledged_unverified",
            complete=False, reason="operator_verified_external_cleanup", operator_id="owner",
            acknowledged_at=100, acknowledgment="ACKNOWLEDGE UNVERIFIED CLEANUP sid",
            scope_ledger_empty=True, physical_devices_empty=True, scope_disarmed=True,
            recorded_processes_absent=True, receiver_release_verified=False))


def valid(record):
    return local_cleanup_verified(record, session_id="sid", generation=2,
                                  command_id="a" * 32, now=200)


def test_local_not_receiver(evidence):
    assert valid(evidence)
    assert evidence["external_cleanup_attestation"]["receiver_release_verified"] is False


@pytest.mark.parametrize("key", ["released", "scope_ledger_empty", "physical_devices_empty",
                                "scope_disarmed", "recorded_processes_absent"])
@pytest.mark.parametrize("value", [False, None, 1, "true", "missing"])
def test_safety_fields(evidence, key, value):
    target = evidence if key == "released" else evidence["external_cleanup_attestation"]
    if value == "missing":
        target.pop(key)
    else:
        target[key] = value
    assert not valid(evidence)


@pytest.mark.parametrize("key,value", [("recovery_generation", True),
    ("recovery_generation", 3), ("recovery_command_id", "b" * 32)])
def test_identity(evidence, key, value):
    evidence[key] = value
    assert not valid(evidence)


@pytest.mark.parametrize("key,value", [("acknowledgment", "wrong"),
    ("acknowledged_at", True), ("acknowledged_at", 201),
    ("acknowledged_at", float("nan")), ("operator_id", ""),
    ("reason", "untrusted")])
def test_provenance(evidence, key, value):
    evidence["external_cleanup_attestation"][key] = value
    assert not valid(evidence)


@pytest.mark.asyncio
async def test_closed_store_and_controller(recovered, evidence):
    controller, store, grant, context, *_ = recovered
    pending = store.get_recovery_pending(grant.session_id)
    prior = store._hyprland_recovery_record(grant.session_id)
    evidence["recovery_generation"] = pending.grant_generation
    evidence["recovery_command_id"] = pending.old_grant["recovery_command_id"]
    evidence["external_cleanup_attestation"]["acknowledgment"] = (
        f"ACKNOWLEDGE UNVERIFIED CLEANUP {grant.session_id}")
    prior.update(evidence)
    store.db.execute("UPDATE session_recovery SET result=? WHERE session_id=?",
                     (json.dumps(prior), grant.session_id))
    grant = store.set_state(grant.session_id, "closed", revoke=True)
    for field in ("owner_id", "channel_id", "host_id"):
        with pytest.raises(ComputerError, match="not_found"):
            await controller.reconcile_hyprland_owner(
                replace(context, **{field: "wrong"}), grant.session_id, grant.generation)
    with pytest.raises(ComputerError, match="stale_generation"):
        await controller.reconcile_hyprland_owner(context, grant.session_id, grant.generation - 1)
    for field in ("scope_ledger_empty", "physical_devices_empty", "scope_disarmed",
                  "recorded_processes_absent"):
        prior["external_cleanup_attestation"][field] = False
        store.db.execute("UPDATE session_recovery SET result=? WHERE session_id=?",
                         (json.dumps(prior), grant.session_id))
        with pytest.raises(ComputerError, match="recovery_unavailable"):
            store.resolve_closed_local_recovery(grant)
        assert store.get_recovery_pending(grant.session_id) == pending
        prior["external_cleanup_attestation"][field] = True
    store.db.execute("UPDATE session_recovery SET result=? WHERE session_id=?",
                     (json.dumps(prior), grant.session_id))
    result = await controller.session(context, {"operation": "reconcile",
        "session_id": grant.session_id, "generation": grant.generation})
    assert result["state"] == "closed"
    operator = replace(context, surface="webui", turn_id="web-operator")
    reconciled = await controller.operator_reconcile(
        operator, grant.session_id, grant.generation,
        f"ACKNOWLEDGE UNVERIFIED CLEANUP {grant.session_id}")
    assert reconciled["state"] == "closed"
    assert reconciled["recovery"]["admission_blocked"] is False
    updated = store._hyprland_recovery_record(grant.session_id)
    assert updated.pop("local_recovery_status") == "locally_released"
    archive = updated.pop("resolved_recovery_pending")
    assert archive["status"] == "locally_released"
    assert json.loads(archive["historical_record"]["old_grant"]) == pending.old_grant
    assert updated == prior
    assert store.get_recovery_pending(grant.session_id) is None
    assert controller._pending_reconciliation(grant) is None
    assert store.resolve_closed_local_recovery(grant) == grant
    assert "resolved_recovery_pending" not in store.recovery_status(grant.session_id)
    assert store.recovery_status(grant.session_id)["admission_blocked"] is False
    assert store.create_session(context, environment="existing_session").state == "starting"


def test_future_cancelled_locally_released_cleanup_settles_immediately(recovered, evidence):
    _, store, grant, context, *_ = recovered
    store.cancel_hyprland_continuation(grant.session_id)
    grant = store.get_session(grant.session_id)
    pending = store.get_recovery_pending(grant.session_id)
    prior = store._hyprland_recovery_record(grant.session_id)
    prior.update(released=True, receiver_release_verified=False,
                 recovery_generation=pending.grant_generation,
                 recovery_command_id=pending.old_grant["recovery_command_id"])
    store.db.execute("UPDATE session_recovery SET result=? WHERE session_id=?",
                     (json.dumps(prior), grant.session_id))
    attestation = evidence["external_cleanup_attestation"]
    attestation["acknowledgment"] = f"ACKNOWLEDGE UNVERIFIED CLEANUP {grant.session_id}"
    closed = store.finish_recovery(grant, attestation, acknowledged=True)
    assert closed.state == "closed"
    assert store.get_recovery_pending(grant.session_id) is None
    assert store.recovery_status(grant.session_id)["local_cleanup_complete"] is True
    assert store.recovery_status(grant.session_id)["receiver_release_verified"] is False
    assert store.create_session(context, platform="wayland", environment="existing_session",
                                backend="hyprland").state == "starting"
