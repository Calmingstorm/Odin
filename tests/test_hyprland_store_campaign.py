import sqlite3

import pytest

from src.computer.models import ComputerError, RequestContext
from src.computer.store import ComputerStore


def identity():
    return {"pid": 42, "uid": 1000, "start_ticks": 9, "exe": "/usr/bin/xed", "exe_identity": [1, 2]}


def source_id():
    return "backend-issued-opaque-source-7"


def test_one_shipped_schema_and_output_grant_lifecycle(tmp_path):
    store = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    try:
        assert store.db.execute("PRAGMA user_version").fetchone()[0] == 1
        context = RequestContext("o", "c", "t", "h")
        grant = store.create_session(
            context,
            platform="wayland",
            environment="existing_session",
            backend="hyprland",
        )
        old = store.record_hyprland_output_grant(
            grant, output_name="DP-1", source_id=source_id(), application_identity=identity()
        )
        assert store.hyprland_output_grants(grant.session_id) == (old,)
        assert old.source_id == source_id()
        paused = store.begin_hyprland_handoff(
            grant, old_grant_id=old.grant_id, recovery_generation=1, stop_epoch=0
        )
        with pytest.raises(ComputerError, match="hyprland_handoff_not_safe"):
            store.advance_hyprland_output_grant(
                paused,
                old_grant_id=old.grant_id,
                output_name="DP-2",
                source_id="opaque-successor-8",
                application_identity=identity(),
            )
        store.record_cleanup(
            grant.session_id,
            {
                "stopped": True,
                "released": True,
                "applications_preserved": True,
                "input_revoked": True,
                "capture_revoked": True,
                "owned_devices": "hyprland_owned_connections_closed",
                "hyprland_owned_connections_closed": True,
                "receiver_release_verified": False,
            },
            clean=True,
        )
        new = store.advance_hyprland_output_grant(
            paused, old_grant_id=old.grant_id, output_name="DP-2",
            source_id="opaque-successor-8", application_identity=identity()
        )
        assert new.parent_grant_id == old.grant_id
        assert new.source_id == "opaque-successor-8"
        assert store.get_session(grant.session_id).state == "paused"
        assert (new.generation, new.consent_generation) == (
            paused.generation,
            paused.consent_generation,
        )
        assert store.get_recovery_pending(grant.session_id) is None
    finally:
        store.close()


def test_recovery_pending_cas_is_fenced_by_generations(tmp_path):
    store = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    try:
        grant = store.create_session(
            RequestContext("o", "c", "t", "h"),
            app="drawing",
            platform="wayland",
            environment="existing_session",
            backend="hyprland",
        )
        pending = store.set_recovery_pending(
            grant,
            recovery_generation=1,
            stop_epoch=0,
            phase="probe",
            reason="lost",
            attempt=0,
            next_retry_at=None,
            old_grant={"id": 1},
        )
        assert store.get_recovery_pending(grant.session_id) == pending
        changed = store.transition_recovery_pending(
            grant.session_id,
            recovery_generation=1,
            grant_generation=grant.generation,
            stop_epoch=0,
            phase="retry",
            reason="lost",
            attempt=1,
            next_retry_at=2.0,
        )
        assert changed.phase == "retry"
        assert not store.clear_recovery_pending(
            grant.session_id, recovery_generation=2, grant_generation=grant.generation, stop_epoch=0
        )
        assert store.clear_recovery_pending(
            grant.session_id, recovery_generation=1, grant_generation=grant.generation, stop_epoch=0
        )
    finally:
        store.close()


def test_existing_unversioned_database_is_upgraded_once(tmp_path):
    db = tmp_path / "state.db"
    sqlite3.connect(db).close()
    db.chmod(0o600)
    store = ComputerStore(db, tmp_path / "evidence")
    try:
        assert store.db.execute("PRAGMA user_version").fetchone()[0] == 1
        assert (
            store.db.execute("SELECT name FROM sqlite_master WHERE name='store_schema'").fetchone()
            is None
        )
    finally:
        store.close()


@pytest.mark.parametrize(
    "source,application",
    [("", identity()), ("x" * 257, identity()), (source_id(), {**identity(), "unexpected": 1})],
)
def test_output_grant_requires_opaque_source_and_exact_application_identity(
    tmp_path, source, application
):
    store = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    try:
        grant = store.create_session(
            RequestContext("o", "c", "t", "h"), platform="wayland",
            environment="existing_session", backend="hyprland",
        )
        with pytest.raises(ComputerError):
            store.record_hyprland_output_grant(
                grant, output_name="DP-1", source_id=source, application_identity=application
            )
    finally:
        store.close()
