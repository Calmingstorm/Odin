"""The transaction encloses the deciding recovery read, not only its writes."""

import sqlite3

import pytest

from src.computer.models import RequestContext
from src.computer.store import ComputerStore
from tests.test_hyprland_store_campaign import identity


def test_hyprland_state_read_always_occurs_inside_savepoint(tmp_path, monkeypatch):
    store = ComputerStore(tmp_path / "state", tmp_path / "evidence")
    try:
        grant = store.create_session(RequestContext("owner", "channel", "turn", "host"),
                                     platform="wayland", environment="existing_session",
                                     backend="hyprland")
        original = store.get_recovery_pending
        reads = []

        def checked(session_id):
            reads.append(store.db.in_transaction)
            return original(session_id)

        monkeypatch.setattr(store, "get_recovery_pending", checked)
        store.set_state(grant.session_id, "active")
        assert reads == [True]
        assert not store.db.in_transaction
    finally:
        store.close()


def test_failed_session_fence_rolls_back_pending_lineage(tmp_path):
    store = ComputerStore(tmp_path / "state", tmp_path / "evidence")
    try:
        grant = store.create_session(RequestContext("owner", "channel", "turn", "host"),
                                     platform="wayland", environment="existing_session",
                                     backend="hyprland")
        output = store.record_hyprland_output_grant(
            grant, output_name="DP-1", source_id="source", application_identity=identity())
        grant = store.set_state(grant.session_id, "active")
        paused = store.begin_hyprland_handoff(
            grant, old_grant_id=output.grant_id, recovery_generation=2, stop_epoch=1)
        pending = store.get_recovery_pending(grant.session_id)
        store.db.execute("CREATE TRIGGER fail_fence BEFORE UPDATE ON sessions "
                         "BEGIN SELECT RAISE(ABORT, 'injected session failure'); END")
        with pytest.raises(sqlite3.IntegrityError, match="injected session failure"):
            store.set_state(grant.session_id, "cancelled", revoke=True)
        assert store.get_session(grant.session_id) == paused
        assert store.get_recovery_pending(grant.session_id) == pending
        assert not store.db.in_transaction
    finally:
        store.close()
