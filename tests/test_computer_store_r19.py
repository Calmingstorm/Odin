"""Durable no-replay and rollback against real temporary SQLite and files."""

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from threading import Barrier
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.controller import ComputerController
from src.computer.models import BackendCapabilities, ComputerError, LiveSession, RequestContext
from src.computer.runtime.x11_attached import X11AttachedBackend
from src.computer.store import ComputerStore, canonical_hash


@pytest.fixture
def rig(tmp_path):
    now = [1000.0]
    store = ComputerStore(tmp_path / "state.db", tmp_path / "evidence", clock=lambda: now[0])
    context = RequestContext("owner", "channel", "turn", "localhost")
    grant = store.create_session(context, environment="existing_session")
    grant = store.set_state(grant.session_id, "active")
    yield store, grant, context, now
    store.close()


def provenance():
    return {
        "pid": 123,
        "uid": 1000,
        "start_ticks": 456,
        "exe_basename": "drawing",
        "exe_identity": [1, 2],
        "cmdline_digest": "a" * 64,
        "trusted_executable": True,
        "wm_class": "Drawing",
        "script_identity": None,
    }


def test_sequence_reservation_survives_reopen_without_replaying(tmp_path, rig):
    store, grant, _, _ = rig
    identity = provenance()
    steps = [("first", "h1"), ("second", "h2")]
    assert store.begin_sequence(grant, "plan", "hash", steps, 2, provenance=identity) is None
    identity["exe_identity"][0] = 999
    completed = store.finish_action(grant.session_id, "first", {"status": "verified"})
    assert completed["application_provenance"] == provenance()
    with pytest.raises(ComputerError, match="grant_revoked_or_limit"):
        store.begin_action(grant, "extra", "extra-hash", 2)
    reopened = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    try:
        receipt = reopened.begin_sequence(grant, "plan", "hash", steps, 2)
        assert receipt["status"] == "unknown"
        assert receipt["reason"] == "pending_no_replay"
        assert receipt["verification"]["steps"][0] == completed
        assert receipt["verification"]["steps"][1]["reason"] == "pending_no_replay"
        assert reopened.get_session(grant.session_id).actions == 2
        reopened.recover()
        recovered = reopened.get_session(grant.session_id)
        assert recovered.state == "quarantined"
        assert (recovered.generation, recovered.consent_generation) == (2, 2)
        receipt = reopened.begin_sequence(grant, "plan", "hash", steps, 0)
        assert receipt["reason"] == "controller_lost"
        assert receipt["verification"]["steps"][0] == completed
        assert receipt["verification"]["steps"][1]["reason"] == "controller_lost"
        assert reopened.get_session(grant.session_id).actions == 2
        reopened.recover()
        assert reopened.get_session(grant.session_id) == recovered
    finally:
        reopened.close()


@pytest.mark.parametrize(
    "steps", [[], [("plan", "h")], [("a", "h"), ("a", "h2")], [(str(i), "h") for i in range(9)]]
)
def test_invalid_sequence_does_not_spend_budget_or_reserve_ids(rig, steps):
    store, grant, _, _ = rig
    with pytest.raises(ComputerError, match="invalid_sequence"):
        store.begin_sequence(grant, "plan", "hash", steps, 100)
    assert store.get_session(grant.session_id).actions == 0
    assert store.db.execute("SELECT COUNT(*) FROM receipts").fetchone()[0] == 0
    assert not store.db.in_transaction


@pytest.mark.parametrize("invalidity", ["generation", "paused", "expiry", "budget"])
def test_sequence_admission_is_atomic(rig, invalidity):
    store, grant, _, now = rig
    maximum = 2
    if invalidity == "generation":
        grant = replace(grant, generation=999)
    elif invalidity == "paused":
        store.set_state(grant.session_id, "paused")
    elif invalidity == "expiry":
        now[0] = grant.expires_at
    else:
        maximum = 1
    with pytest.raises(ComputerError, match="grant_revoked_or_limit"):
        store.begin_sequence(grant, "plan", "hash", [("a", "1"), ("b", "2")], maximum)
    assert store.get_session(grant.session_id).actions == 0
    assert store.receipt(grant.session_id, "plan", "hash") is None
    assert store.receipt(grant.session_id, "a", "1") is None


def test_reserved_step_and_envelope_conflicts_cannot_alias_input(rig):
    store, grant, _, _ = rig
    store.begin_action(grant, "taken", "original", 10)
    with pytest.raises(ComputerError, match="action_id_conflict"):
        store.begin_sequence(grant, "plan", "hash", [("fresh", "f"), ("taken", "t")], 10)
    assert store.receipt(grant.session_id, "fresh", "f") is None
    assert store.get_session(grant.session_id).actions == 1
    assert store.begin_action(grant, "taken", "original", 1)["reason"] == "pending_no_replay"
    with pytest.raises(ComputerError, match="action_id_conflict"):
        store.begin_sequence(grant, "taken", "changed", [("fresh", "f")], 10)
    assert store.get_session(grant.session_id).actions == 1


def test_failed_second_insert_rolls_back_envelope_first_step_and_budget(rig):
    store, grant, _, _ = rig
    store.db.execute("""CREATE TRIGGER reject_second BEFORE INSERT ON receipts
        WHEN NEW.action_id='second' BEGIN SELECT RAISE(ABORT, 'injected'); END""")
    with pytest.raises(sqlite3.IntegrityError, match="injected"):
        store.begin_sequence(grant, "plan", "hash", [("first", "1"), ("second", "2")], 2)
    assert not store.db.in_transaction
    assert store.db.execute("SELECT COUNT(*) FROM receipts").fetchone()[0] == 0
    assert store.get_session(grant.session_id).actions == 0
    store.db.execute("DROP TRIGGER reject_second")
    assert store.begin_sequence(grant, "plan", "hash", [("first", "1"), ("second", "2")], 2) is None


def test_two_connections_reserve_shared_step_once(tmp_path, rig):
    store, grant, _, _ = rig
    other = ComputerStore(tmp_path / "state.db", tmp_path / "evidence", clock=store.clock)
    barrier = Barrier(2)

    def reserve(connection, action):
        barrier.wait(timeout=5)
        try:
            return connection.begin_sequence(grant, action, action, [("shared", "s")], 10)
        except ComputerError as exc:
            return str(exc)

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(reserve, connection, action)
                for connection, action in [(store, "left"), (other, "right")]
            ]
            outcomes = [future.result(timeout=10) for future in futures]
        assert outcomes.count(None) == 1
        assert outcomes.count("action_id_conflict") == 1
        assert store.get_session(grant.session_id).actions == 1
        assert store.db.execute("SELECT COUNT(*) FROM receipts").fetchone()[0] == 2
    finally:
        other.close()


@pytest.mark.parametrize("method", ["begin_action", "begin_sequence"])
@pytest.mark.parametrize("value", [{}, {"exe_basename": "/private/untrusted"}, "invalid"])
def test_invalid_provenance_never_enters_receipt_or_spends_budget(rig, method, value):
    store, grant, _, _ = rig
    arguments = [grant, "plan", "hash"]
    if method == "begin_sequence":
        arguments.append([("step", "step-hash")])
    with pytest.raises(ComputerError, match="invalid_application_provenance"):
        getattr(store, method)(*arguments, 10, provenance=value)
    assert store.get_session(grant.session_id).actions == 0
    assert store.receipt(grant.session_id, "plan", "hash") is None


def test_recovery_rollback_does_not_publish_partial_unknown_receipts(rig):
    store, grant, _, _ = rig
    store.begin_action(grant, "a", "h", 10)
    store.db.execute("""CREATE TRIGGER reject_recovery BEFORE UPDATE ON sessions
        WHEN NEW.state='quarantined' BEGIN SELECT RAISE(ABORT, 'recovery fault'); END""")
    with pytest.raises(sqlite3.IntegrityError, match="recovery fault"):
        store.recover()
    assert store.get_session(grant.session_id) == replace(grant, actions=1)
    assert store.receipt(grant.session_id, "a", "h")["reason"] == "pending_no_replay"
    assert store.db.execute("SELECT status FROM receipts").fetchone()[0] == "pending"
    store.db.execute("DROP TRIGGER reject_recovery")
    store.recover()
    assert store.receipt(grant.session_id, "a", "h")["reason"] == "controller_lost"


@pytest.mark.parametrize("value", [{"x": float("nan")}, {"x": object()}, {"x": "\ud800"}])
def test_canonical_hash_rejects_non_json_values(value):
    with pytest.raises(ComputerError, match="invalid_arguments"):
        canonical_hash(value)


def test_canonical_hash_is_order_independent_and_bounded():
    assert canonical_hash({"b": 2, "a": 1}) == canonical_hash({"a": 1, "b": 2})
    with pytest.raises(ComputerError, match="arguments_too_large"):
        canonical_hash({"large": "a" * 65536})


async def test_native_shared_cleanup_roundtrips_through_controller_store_and_reopen(rig, tmp_path):
    store, grant, _, _ = rig
    controller = ComputerController(store, None, lambda _: True, enabled=True)
    grant = store.set_state(grant.session_id, "active")
    backend = X11AttachedBackend(enabled=True, display_name=":991", monitor_names=["fixture"])
    backend._device_state = "not_created"
    backend._device_identity = (1, 2)
    backend._shared_cleanup_identity = (1, 2)
    capabilities = BackendCapabilities(
        "x11", "existing_session", "unknown", "unknown", "unknown", "verified"
    )
    controller._live[grant.session_id] = LiveSession(
        backend, grant.expires_at, capabilities=capabilities
    )
    # No native start, capture or input: exercise the real idle adapter's detach.
    result = await controller._stop(grant.session_id, "closed")
    assert result["state"] == "closed"
    assert grant.session_id not in controller._live
    cleanup = result["cleanup"]
    assert cleanup["complete"] is True and cleanup["released"] is True
    assert cleanup["no_inflight_input"] is True
    assert cleanup["physical_slaves_restored"] is None
    assert cleanup["no_active_grabs"] is None
    assert cleanup["owned_masters_removed"] is None
    assert cleanup["cleanup_checks"] == {
        "physical_slaves_restored": "not_applicable_no_owned_masters",
        "no_inflight_input": "measured_owned_worker_fence",
        "no_active_grabs": "unsupported_shared_server_probe",
        "owned_masters_removed": "not_applicable_no_owned_masters",
    }
    reopened = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    try:
        assert reopened.cleanup(grant.session_id) == cleanup
    finally:
        reopened.close()


@pytest.mark.parametrize(
    "failed",
    [
        "no_inflight_input",
        "no_active_grabs",
        "physical_slaves_restored",
        "owned_masters_removed",
        "portal_connection_closed",
    ],
)
async def test_explicit_negative_measurement_quarantines_even_if_backend_claims_clean(rig, failed):
    store, grant, _, _ = rig
    controller = ComputerController(store, None, lambda _: True, enabled=True)
    grant = store.set_state(grant.session_id, "active")
    native = {
        "stopped": True,
        "released": True,
        "applications_preserved": True,
        "input_revoked": True,
        "capture_revoked": True,
        "owned_devices": "not_created",
        failed: False,
    }
    backend = SimpleNamespace(creates_devices=False, detach=AsyncMock(return_value=native))
    capabilities = BackendCapabilities(
        "x11", "existing_session", "unknown", "unknown", "unknown", "verified"
    )
    live = LiveSession(backend, grant.expires_at, capabilities=capabilities)
    controller._live[grant.session_id] = live
    result = await controller._stop(grant.session_id, "closed")
    assert result["state"] == "quarantined"
    assert result["cleanup"]["complete"] is False
    assert result["cleanup"][failed] is False
    assert controller._live[grant.session_id] is live
    backend.detach.assert_awaited_once()
    native[failed] = True
    result = await controller._stop(grant.session_id, "closed")
    assert result["state"] == "closed" and result["cleanup"]["complete"] is True
    assert grant.session_id not in controller._live


@pytest.mark.parametrize(
    "checks",
    [
        None,
        [],
        "secret",
        {
            "no_active_grabs": "/private/secret",
            "unknown": "secret",
            "physical_slaves_restored": "unsupported_shared_server_probe",
            "no_inflight_input": "measured_owned_worker_fence",
        },
    ],
)
def test_cleanup_rationales_are_allowlisted_and_cannot_launder_false_evidence(rig, checks):
    store, grant, _, _ = rig
    store.record_cleanup(
        grant.session_id,
        {
            "stopped": True,
            "released": True,
            "owned_devices": "not_created",
            "no_inflight_input": False,
            "cleanup_checks": checks,
        },
        clean=True,
    )
    receipt = store.cleanup(grant.session_id)
    assert receipt["complete"] is False
    assert "cleanup_checks" not in receipt


def test_recovery_acknowledgment_preserves_failed_cleanup(rig):
    store, grant, _, _ = rig
    store.record_cleanup(
        grant.session_id,
        {"stopped": False, "released": False, "owned_devices": "retained_inactive"},
        clean=True,
    )
    before = store.cleanup(grant.session_id)
    assert before["complete"] is False
    store.recover()
    assert store.recovery_status(grant.session_id)["reason"] == "legacy_runtime_identity_missing"
    current = store.get_session(grant.session_id)
    with pytest.raises(ComputerError, match="stale_generation"):
        store.finish_recovery(grant, {"status": "absence_verified"})
    assert store.finish_recovery(current, {"status": "inspection_failed"}) == current
    closed = store.finish_recovery(
        current, {"status": "operator_acknowledged_unverified"}, acknowledged=True
    )
    assert closed.state == "closed"
    assert store.cleanup(grant.session_id) == before
    assert store.recovery_status(grant.session_id)["complete"] is False


def test_evidence_sql_failure_removes_new_file_and_rolls_back(rig):
    store, grant, context, _ = rig
    existing = store.put_evidence(grant.session_id, b"keep")
    store.db.execute("""CREATE TRIGGER reject_evidence BEFORE INSERT ON evidence
        BEGIN SELECT RAISE(ABORT, 'evidence fault'); END""")
    with pytest.raises(sqlite3.IntegrityError, match="evidence fault"):
        store.put_evidence(grant.session_id, b"discard")
    assert not store.db.in_transaction
    assert [p.name for p in store.evidence_path.iterdir()] == [existing]
    assert store.read_evidence(context, existing)[0] == b"keep"
    store.db.execute("DROP TRIGGER reject_evidence")
    assert store.put_evidence(grant.session_id, b"new") != existing


def test_runtime_identity_is_append_only_and_recovery_requires_current_generation(rig):
    store, grant, _, _ = rig
    assert store.runtime_descriptor(grant.session_id) is None
    assert store.recovery_status(grant.session_id) is None
    with pytest.raises(ComputerError, match="invalid_runtime_identity"):
        store.record_runtime(grant, {})
    identity = {
        "version": 1,
        "session_id": grant.session_id,
        "boot_id": "12345678-1234-1234-1234-123456789abc",
        "kind": "processes",
        "launch_pending": True,
        "processes": [{"pid": 90000, "start_ticks": 100}],
        "no_persistent_devices": False,
        "input_was_enabled": True,
    }
    store.record_runtime(grant, identity)
    extended = {
        **identity,
        "launch_pending": False,
        "processes": [*identity["processes"], {"pid": 90001, "start_ticks": 101}],
    }
    store.record_runtime(grant, extended)
    with pytest.raises(ComputerError, match="runtime_identity_changed"):
        store.record_runtime(grant, identity)
    assert store.runtime_descriptor(grant.session_id) == extended
    store.recover()
    assert store.recovery_status(grant.session_id) == {
        "status": "operator_reconciliation_required",
        "reason": "controller_lost",
        "complete": False,
    }
    with pytest.raises(ComputerError, match="grant_revoked"):
        store.record_runtime(grant, extended)
    current = store.get_session(grant.session_id)
    closed = store.finish_recovery(current, {"status": "absence_verified"})
    assert closed.state == "closed" and closed.generation == current.generation + 1
    assert store.cleanup(grant.session_id)["complete"] is True
    assert store.recovery_status(grant.session_id) == {
        "status": "absence_verified",
        "complete": True,
    }


@pytest.mark.parametrize("tamper", ["content", "mode", "missing", "symlink", "hardlink"])
def test_evidence_tampering_never_returns_bytes(rig, tamper, tmp_path):
    store, grant, context, _ = rig
    evidence_id = store.put_evidence(grant.session_id, b"original")
    path = store.evidence_path / evidence_id
    if tamper == "content":
        path.write_bytes(b"modified")
    elif tamper == "mode":
        path.chmod(0o644)
    elif tamper == "hardlink":
        (tmp_path / "alias").hardlink_to(path)
    else:
        path.unlink()
        if tamper == "symlink":
            path.symlink_to(tmp_path / "not-evidence")
    with pytest.raises(ComputerError, match="evidence_(changed|unavailable)"):
        store.read_evidence(context, evidence_id)
