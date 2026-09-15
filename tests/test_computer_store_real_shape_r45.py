"""Sanitized pins for the production X11 store shape exercised by migration R45."""

from __future__ import annotations

import json
import sqlite3

import pytest

from src.computer.models import ComputerError, RequestContext
from src.computer.provisioning import ComputerProvisioningError
from src.computer.store import ComputerStore

REAL_SHAPE_DDL = (
    "CREATE TABLE sessions (session_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, "
    "channel_id TEXT NOT NULL, turn_id TEXT NOT NULL, host_id TEXT NOT NULL, "
    "generation INTEGER NOT NULL, state TEXT NOT NULL, app TEXT NOT NULL, "
    "created_at REAL NOT NULL, expires_at REAL NOT NULL, actions INTEGER NOT NULL DEFAULT 0, "
    "consent_generation INTEGER NOT NULL DEFAULT 1, platform TEXT NOT NULL DEFAULT 'x11', "
    "environment TEXT NOT NULL DEFAULT 'isolated')",
    "CREATE UNIQUE INDEX single_active_computer ON sessions ((1)) "
    "WHERE state IN ('starting','active','paused','quarantined')",
    "CREATE TABLE receipts (session_id TEXT NOT NULL, action_id TEXT NOT NULL, "
    "payload_hash TEXT NOT NULL, status TEXT NOT NULL, result TEXT NOT NULL, "
    "PRIMARY KEY(session_id,action_id))",
    "CREATE TABLE session_cleanup (session_id TEXT PRIMARY KEY, result TEXT NOT NULL)",
    "CREATE TABLE session_runtime (session_id TEXT PRIMARY KEY, descriptor TEXT NOT NULL)",
    "CREATE TABLE session_recovery (session_id TEXT PRIMARY KEY, result TEXT NOT NULL)",
    "CREATE TABLE evidence (evidence_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, "
    "name TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, digest TEXT NOT NULL, "
    "device INTEGER NOT NULL, inode INTEGER NOT NULL, expires_at REAL NOT NULL)",
)


def _real_shape(tmp_path):
    path = tmp_path / "state.sqlite3"
    db = sqlite3.connect(path)
    for statement in REAL_SHAPE_DDL:
        db.execute(statement)
    db.execute(
        "INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            "sanitized-session",
            "sanitized-owner",
            "sanitized-channel",
            "sanitized-turn",
            "localhost",
            7,
            "closed",
            "drawing",
            1.25,
            2.5,
            9,
            3,
            "x11",
            "isolated",
        ),
    )
    db.execute(
        "INSERT INTO receipts VALUES (?,?,?,?,?)",
        (
            "sanitized-session",
            "sanitized-action",
            "a" * 64,
            "complete",
            sqlite3.Binary(b"\x00\xffsanitized-blob"),
        ),
    )
    for table, column, value in (
        ("session_cleanup", "result", json.dumps({"complete": True})),
        ("session_runtime", "descriptor", json.dumps({"sanitized": True})),
        ("session_recovery", "result", json.dumps({"status": "complete"})),
    ):
        db.execute(
            f'INSERT INTO "{table}" (session_id,"{column}") VALUES (?,?)',
            ("sanitized-session", value),
        )
    db.commit()
    db.close()
    path.chmod(0o600)
    return path


def _logical_dump(path):
    db = sqlite3.connect(path)
    try:
        tables = [
            row[0]
            for row in db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        return {
            "user_version": db.execute("PRAGMA user_version").fetchone()[0],
            "schema": db.execute(
                "SELECT type,name,tbl_name,sql FROM sqlite_master "
                "WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"
            ).fetchall(),
            "rows": {
                table: db.execute(f'SELECT * FROM "{table}" ORDER BY rowid').fetchall()
                for table in tables
            },
        }
    finally:
        db.close()


def _store(path, tmp_path):
    return ComputerStore(path, tmp_path / "evidence-files")


def test_sanitized_real_shape_rows_survive_byte_for_byte_and_reopen_is_idempotent(tmp_path):
    path = _real_shape(tmp_path)
    before = _logical_dump(path)
    store = _store(path, tmp_path)
    store.close()
    migrated = _logical_dump(path)
    assert {table: migrated["rows"][table] for table in before["rows"]} == before["rows"]
    assert isinstance(before["rows"]["receipts"][0][-1], bytes)
    store = _store(path, tmp_path)
    store.close()
    assert _logical_dump(path) == migrated


@pytest.mark.parametrize(
    "mutate",
    (
        lambda db: db.execute("ALTER TABLE receipts ADD COLUMN injected BLOB"),
        lambda db: db.execute("DROP INDEX single_active_computer"),
        lambda db: db.execute("CREATE TABLE injected_private_rows (payload BLOB)"),
        lambda db: (
            db.execute("DROP INDEX single_active_computer"),
            db.execute(
                "CREATE UNIQUE INDEX single_active_computer ON sessions ((1)) "
                "WHERE state IN ('starting','active','paused')"
            ),
        ),
    ),
)
def test_malformed_real_shape_fails_closed_without_logical_repair(tmp_path, mutate):
    path = _real_shape(tmp_path)
    db = sqlite3.connect(path)
    mutate(db)
    db.commit()
    db.close()
    before = _logical_dump(path)
    with pytest.raises(ComputerProvisioningError):
        _store(path, tmp_path)
    assert _logical_dump(path) == before


def test_current_shape_with_orphaned_new_row_fails_closed(tmp_path):
    path = _real_shape(tmp_path)
    store = _store(path, tmp_path)
    store.close()
    db = sqlite3.connect(path)
    db.execute("INSERT INTO session_backends VALUES ('missing-session','hyprland')")
    db.commit()
    db.close()
    before = _logical_dump(path)
    with pytest.raises(ComputerProvisioningError):
        _store(path, tmp_path)
    assert _logical_dump(path) == before


@pytest.mark.parametrize("phase", ["unknown_release", "native_continuity_lost"])
@pytest.mark.parametrize("mutation", ["platform", "environment", "missing", "backend"])
def test_native_pending_reopen_requires_exact_backend_contract(tmp_path, phase, mutation):
    path = tmp_path / "state.sqlite3"
    store = _store(path, tmp_path)
    grant = store.create_session(
        RequestContext("owner", "channel", "turn", "localhost"),
        platform="wayland", environment="existing_session", backend="hyprland",
    )
    store.begin_hyprland_reconciliation(
        grant, phase=phase, reason=phase,
        old_grant={"generation": grant.generation,
                   "consent_generation": grant.consent_generation,
                   "task_hints": {}, "authorizes_input": False},
    )
    store.close()
    with sqlite3.connect(path) as db:
        if mutation == "platform":
            db.execute("UPDATE sessions SET platform='x11'")
        elif mutation == "environment":
            db.execute("UPDATE sessions SET environment='isolated'")
        elif mutation == "missing":
            db.execute("DELETE FROM session_backends")
        else:
            db.execute("UPDATE session_backends SET backend='other'")
    db.close()
    before = _logical_dump(path)
    with pytest.raises(ComputerProvisioningError) as caught:
        _store(path, tmp_path)
    assert caught.value.code == "storage_schema_unsupported", repr(caught.value.__cause__)
    assert _logical_dump(path) == before


def test_reconciliation_is_one_atomic_fence_with_bounded_non_authority_snapshot(tmp_path):
    store = ComputerStore(tmp_path / "state.sqlite3", tmp_path / "evidence-files")
    try:
        grant = store.create_session(
            RequestContext("owner", "channel", "turn", "localhost"),
            platform="wayland",
            environment="existing_session",
            backend="hyprland",
        )
        snapshot = {
            "generation": grant.generation,
            "consent_generation": grant.consent_generation,
            "task_hints": {"goal": "retain task, never replay input"},
            "authorizes_input": False,
        }
        fenced = store.begin_hyprland_reconciliation(
            grant,
            phase="unknown_release",
            reason="unknown_release",
            old_grant=snapshot,
        )
        pending = store.get_recovery_pending(grant.session_id)
        assert (fenced.state, fenced.generation, fenced.consent_generation) == (
            "quarantined",
            grant.generation + 1,
            grant.consent_generation + 1,
        )
        assert pending is not None
        assert (pending.recovery_generation, pending.grant_generation, pending.stop_epoch) == (
            fenced.generation,
            fenced.generation,
            1,
        )
        assert pending.old_grant == snapshot
        with pytest.raises(ComputerError, match="grant_revoked"):
            store.begin_hyprland_reconciliation(
                grant,
                phase="unknown_release",
                reason="unknown_release",
                old_grant=snapshot,
            )
    finally:
        store.close()


@pytest.mark.parametrize(
    ("phase", "reason", "snapshot_update"),
    (
        ("resolved", "resolved", {}),
        ("unknown_release", "native_continuity_lost", {}),
        ("unknown_release", "unknown_release", {"authorizes_input": True}),
        ("unknown_release", "unknown_release", {"task_hints": {"goal": "bad\nvalue"}}),
    ),
)
def test_reconciliation_rejects_unbounded_or_authorizing_state_without_writes(
    tmp_path, phase, reason, snapshot_update
):
    store = ComputerStore(tmp_path / "state.sqlite3", tmp_path / "evidence-files")
    try:
        grant = store.create_session(
            RequestContext("owner", "channel", "turn", "localhost"),
            platform="wayland",
            environment="existing_session",
            backend="hyprland",
        )
        snapshot = {
            "generation": grant.generation,
            "consent_generation": grant.consent_generation,
            "task_hints": {},
            "authorizes_input": False,
            **snapshot_update,
        }
        with pytest.raises(ComputerError, match="invalid_recovery_pending"):
            store.begin_hyprland_reconciliation(
                grant,
                phase=phase,
                reason=reason,
                old_grant=snapshot,
            )
        assert store.get_session(grant.session_id) == grant
        assert store.get_recovery_pending(grant.session_id) is None
    finally:
        store.close()
