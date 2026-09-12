"""Regression coverage for the one-time computer-store schema-0 to schema-1 upgrade."""

import json
import sqlite3

import pytest

from src.computer.provisioning import ComputerProvisioningError
from src.computer.store import STORE_SCHEMA_VERSION, ComputerStore

LEGACY_DDL = (
    "CREATE TABLE sessions (session_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, "
    "channel_id TEXT NOT NULL, turn_id TEXT NOT NULL, host_id TEXT NOT NULL, "
    "generation INTEGER NOT NULL, state TEXT NOT NULL, app TEXT NOT NULL, "
    "created_at REAL NOT NULL, expires_at REAL NOT NULL, actions INTEGER NOT NULL DEFAULT 0)",
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


def _legacy_db(tmp_path, *, restriction=False):
    db = tmp_path / "state.db"
    conn = sqlite3.connect(db)
    for ddl in LEGACY_DDL:
        conn.execute(ddl)
    if restriction:
        conn.execute(
            "CREATE TABLE restrictions (owner_id TEXT NOT NULL, channel_id TEXT NOT NULL, "
            "turn_id TEXT NOT NULL, created_at REAL NOT NULL, "
            "PRIMARY KEY(owner_id,channel_id))"
        )
        conn.execute("INSERT INTO restrictions VALUES ('owner', 'channel', 'turn', 1.25)")
    conn.execute(
        "INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ("legacy-session", "owner", "channel", "turn", "host", 4, "closed", "drawing", 1.5, 9.5, 3),
    )
    conn.execute(
        "INSERT INTO receipts VALUES (?,?,?,?,?)",
        ("legacy-session", "receipt-1", "a" * 64, "complete", json.dumps({"kept": "receipt"})),
    )
    conn.execute(
        "INSERT INTO session_cleanup VALUES (?,?)",
        ("legacy-session", json.dumps({"stopped": True, "release": "evidence"})),
    )
    conn.commit()
    conn.close()
    db.chmod(0o600)
    return db


def _dump(db):
    conn = sqlite3.connect(db)
    try:
        objects = conn.execute(
            "SELECT type, name, tbl_name, sql FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        ).fetchall()
        rows = {}
        for kind, name, _, _ in objects:
            if kind == "table":
                cols = [r[1] for r in conn.execute(f"PRAGMA table_info({name})")]
                rows[name] = conn.execute(
                    f"SELECT * FROM {name} ORDER BY " + ", ".join(cols)
                ).fetchall()
        return conn.execute("PRAGMA user_version").fetchone()[0], objects, rows
    finally:
        conn.close()


def _store(db, tmp_path):
    evidence = tmp_path / "evidence"
    evidence.mkdir(mode=0o700, exist_ok=True)
    evidence.chmod(0o700)
    return ComputerStore(db, evidence)


def test_real_legacy_v0_fixture_is_upgraded_to_the_only_shipped_schema(tmp_path):
    store = _store(_legacy_db(tmp_path), tmp_path)
    try:
        assert store.db.execute("PRAGMA user_version").fetchone()[0] == STORE_SCHEMA_VERSION == 1
        assert store.get_session("legacy-session").generation == 4
        assert store.get_session("legacy-session").consent_generation == 1
        assert store.get_session("legacy-session").platform == "x11"
        assert store.get_session("legacy-session").environment == "isolated"
    finally:
        store.close()


def test_legacy_receipt_and_cleanup_evidence_survive_upgrade(tmp_path):
    store = _store(_legacy_db(tmp_path), tmp_path)
    try:
        receipt = store.db.execute("SELECT result FROM receipts").fetchone()[0]
        assert receipt == json.dumps({"kept": "receipt"})
        assert store.db.execute("SELECT result FROM session_cleanup").fetchone()[0] == json.dumps(
            {"stopped": True, "release": "evidence"}
        )
    finally:
        store.close()


def test_fresh_database_creates_schema_one_not_a_phantom_schema_two(tmp_path):
    store = _store(tmp_path / "state.db", tmp_path)
    try:
        assert store.db.execute("PRAGMA user_version").fetchone()[0] == 1
        names = {
            r[0] for r in store.db.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        assert {"session_backends", "session_output_grants", "recovery_pending"} <= names
        assert "store_schema" not in names
    finally:
        store.close()


def test_upgrade_reopens_with_wal_and_full_synchronous_durability(tmp_path):
    db = _legacy_db(tmp_path)
    store = _store(db, tmp_path)
    store.close()
    reopened = _store(db, tmp_path)
    try:
        assert reopened.db.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert reopened.db.execute("PRAGMA synchronous").fetchone()[0] == 2
    finally:
        reopened.close()


def test_known_legacy_restrictions_are_removed_during_upgrade(tmp_path):
    store = _store(_legacy_db(tmp_path, restriction=True), tmp_path)
    try:
        restriction = store.db.execute(
            "SELECT name FROM sqlite_master WHERE name='restrictions'"
        ).fetchone()
        assert restriction is None
        assert store.get_session("legacy-session").session_id == "legacy-session"
    finally:
        store.close()


def test_partial_version_one_is_rejected_without_logical_database_change(tmp_path):
    db = _legacy_db(tmp_path)
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA user_version=1")
    conn.execute(
        "CREATE TABLE session_backends (session_id TEXT PRIMARY KEY, backend TEXT NOT NULL)"
    )
    conn.commit()
    conn.close()
    before = _dump(db)
    with pytest.raises(ComputerProvisioningError) as exc:
        _store(db, tmp_path)
    assert exc.value.code == "storage_schema_unsupported"
    assert _dump(db) == before


def test_future_version_is_rejected_without_logical_database_change(tmp_path):
    db = _legacy_db(tmp_path)
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA user_version=99")
    conn.commit()
    conn.close()
    before = _dump(db)
    with pytest.raises(ComputerProvisioningError) as exc:
        _store(db, tmp_path)
    assert exc.value.code == "storage_schema_unsupported"
    assert _dump(db) == before


def test_create_table_failure_rolls_back_schema_and_legacy_row_changes(tmp_path, monkeypatch):
    db = _legacy_db(tmp_path, restriction=True)
    before = _dump(db)
    original = ComputerStore._migrate_schema

    def fail_after_first_create(self):
        self.db.execute("CREATE TABLE session_output_grants (broken INTEGER)")
        raise sqlite3.OperationalError("injected create table failure")

    monkeypatch.setattr(ComputerStore, "_migrate_schema", fail_after_first_create)
    with pytest.raises(sqlite3.OperationalError, match="injected create table failure"):
        _store(db, tmp_path)
    assert _dump(db) == before
    monkeypatch.setattr(ComputerStore, "_migrate_schema", original)


def test_lineage_unique_index_prevents_duplicate_session_generation_consent(tmp_path):
    store = _store(_legacy_db(tmp_path), tmp_path)
    try:
        values = ("legacy-session", 4, 1, "DP-1", "source-a", "{}", 1.0, None)
        store.db.execute(
            "INSERT INTO session_output_grants "
            "(session_id,generation,consent_generation,output_name,source_id,"
            "application_identity,created_at,parent_grant_id) "
            "VALUES (?,?,?,?,?,?,?,?)", values
        )
        with pytest.raises(sqlite3.IntegrityError):
            store.db.execute(
                "INSERT INTO session_output_grants "
                "(session_id,generation,consent_generation,output_name,source_id,"
                "application_identity,created_at,parent_grant_id) "
                "VALUES (?,?,?,?,?,?,?,?)", values
            )
    finally:
        store.close()


def test_lineage_index_has_exact_expected_columns(tmp_path):
    store = _store(_legacy_db(tmp_path), tmp_path)
    try:
        assert tuple(
            r[2] for r in store.db.execute("PRAGMA index_info(session_output_grants_lineage)")
        ) == ("session_id", "generation", "consent_generation")
    finally:
        store.close()


def test_reopening_completed_upgrade_does_not_add_schema_objects(tmp_path):
    db = _legacy_db(tmp_path)
    store = _store(db, tmp_path)
    store.close()
    before = _dump(db)
    reopened = _store(db, tmp_path)
    reopened.close()
    assert _dump(db) == before
