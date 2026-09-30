"""Real SQLite reconnect fencing and rollback, without native input or GUI IO."""

import copy
from dataclasses import replace

import pytest

from src.computer.models import ComputerError, RequestContext
from src.computer.runtime.hyprland_scope import owner_handle_to_record
from src.computer.store import ComputerStore
from tests.test_hyprland_durable_reconnect import durable as durable


@pytest.fixture
def reconnect_store(tmp_path, durable):
    store = ComputerStore(tmp_path / "state", tmp_path / "evidence")
    grant = store.create_session(RequestContext("owner", "channel", "turn", "host"),
                                 platform="wayland", environment="existing_session",
                                 backend="hyprland")
    descriptor = owner_handle_to_record(durable[1])
    store.record_hyprland_owner(grant, descriptor)
    grant = store.set_state(grant.session_id, "active")
    grant = store.begin_hyprland_reconciliation(
        grant, phase="unknown_release", reason="unknown_release",
        old_grant={"generation": grant.generation,
                   "consent_generation": grant.consent_generation,
                   "task_hints": {"goal": "finish the document"},
                   "authorizes_input": False, "recovery_command_id": "a" * 32})
    yield store, grant, descriptor
    store.close()


def adopted_owner(descriptor, command):
    adopted = copy.deepcopy(descriptor)
    successor = command["successor"]
    adopted["owner"].update(recovery_pid=successor["pid"], recovery_uid=successor["uid"],
                            recovery_start_ticks=str(successor["start_ticks"]))
    return adopted


def test_reconnect_phases_are_ordered_and_retry_is_query_only(reconnect_store):
    store, grant, descriptor = reconnect_store
    command, query = store.prepare_hyprland_reconnect(grant)
    assert query is False
    retry, query = store.prepare_hyprland_reconnect(grant)
    assert retry == command and query is True
    store.persist_hyprland_reconnected_owner(
        grant, command["command_id"], adopted_owner(descriptor, command))
    with pytest.raises(ComputerError, match="invalid_recovery_pending"):
        store.prepare_hyprland_reconnect_phase(grant, command["command_id"], "retire")
    assert not store.db.in_transaction
    assert store.prepare_hyprland_reconnect_phase(
        grant, command["command_id"], "reconcile") is False
    assert store.prepare_hyprland_reconnect_phase(grant, command["command_id"], "reconcile") is True
    assert store.prepare_hyprland_reconnect_phase(grant, command["command_id"], "retire") is False
    assert store.get_session(grant.session_id) == grant


@pytest.mark.parametrize("method", ["prepare", "phase", "persist", "task", "owner"])
def test_stale_grant_cannot_publish_reconnect_or_authority(reconnect_store, method):
    store, grant, descriptor = reconnect_store
    stale = replace(grant, generation=grant.generation + 1)
    calls = {
        "prepare": lambda: store.prepare_hyprland_reconnect(stale),
        "phase": lambda: store.prepare_hyprland_reconnect_phase(stale, "wrong", "reconcile"),
        "persist": lambda: store.persist_hyprland_reconnected_owner(stale, "wrong", descriptor),
        "task": lambda: store.persist_hyprland_task(stale, {"goal": "forged"}),
        "owner": lambda: store.record_hyprland_owner(stale, descriptor),
    }
    with pytest.raises(ComputerError, match="grant_revoked"):
        calls[method]()
    assert not store.db.in_transaction
    assert store.get_session(grant.session_id) == grant
    assert store.hyprland_owner(grant.session_id) == descriptor


def test_reconnect_requires_adoption_before_any_recovery_phase(reconnect_store):
    store, grant, descriptor = reconnect_store
    command, _ = store.prepare_hyprland_reconnect(grant)
    with pytest.raises(ComputerError, match="grant_revoked"):
        store.prepare_hyprland_reconnect_phase(grant, command["command_id"], "reconcile")
    with pytest.raises(ComputerError, match="grant_revoked"):
        store.persist_hyprland_reconnected_owner(grant, "different-command", descriptor)
    with pytest.raises(ComputerError, match="invalid_recovery_pending"):
        store.prepare_hyprland_reconnect_phase(grant, command["command_id"], "unsafe-phase")
    assert not store.db.in_transaction
    store.persist_hyprland_reconnected_owner(
        grant, command["command_id"], adopted_owner(descriptor, command))
    assert store.prepare_hyprland_reconnect_phase(
        grant, command["command_id"], "reconcile") is False


def test_second_crash_reconnect_requires_saved_adopted_owner(reconnect_store, monkeypatch):
    store, grant, descriptor = reconnect_store
    command, _ = store.prepare_hyprland_reconnect(grant)
    import src.computer.runtime.hyprland_identity as identity

    original = identity._proc_start
    monkeypatch.setattr(identity, "_proc_start", lambda *args: original(*args) + 1)
    with pytest.raises(ComputerError, match="hyprland_reconnect_outcome_unknown"):
        store.prepare_hyprland_reconnect(grant)
    assert not store.db.in_transaction
    adopted = adopted_owner(descriptor, command)
    store.persist_hyprland_reconnected_owner(grant, command["command_id"], adopted)
    successor, query = store.prepare_hyprland_reconnect(grant)
    assert not query and successor["command_id"] != command["command_id"]
    assert successor["owner"] == adopted
    # Once release phases were attempted, even a saved handle cannot authorize
    # a new adoption after a second crash.
    store.persist_hyprland_reconnected_owner(
        grant, successor["command_id"], adopted_owner(adopted, successor))
    store.prepare_hyprland_reconnect_phase(grant, successor["command_id"], "reconcile")
    monkeypatch.setattr(identity, "_proc_start", lambda *args: original(*args) + 2)
    with pytest.raises(ComputerError, match="hyprland_reconnect_outcome_unknown"):
        store.prepare_hyprland_reconnect(grant)
    assert store.get_session(grant.session_id).state == "quarantined"


def test_legacy_owner_cannot_be_adopted(reconnect_store):
    from tests.test_hyprland_recovery_controller import owner_descriptor

    store, grant, _ = reconnect_store
    receipt = copy.deepcopy(store._hyprland_recovery_record(grant.session_id))
    receipt["native_owner"] = owner_descriptor()
    receipt["recovery_owner"] = owner_descriptor()
    import json

    store.db.execute("UPDATE session_recovery SET result=? WHERE session_id=?",
                     (json.dumps(receipt), grant.session_id))
    with pytest.raises(ComputerError, match="hyprland_durable_owner_required"):
        store.prepare_hyprland_reconnect(grant)
    assert not store.db.in_transaction
