"""Usage-store schema versioning: genuine v1 stores migrate additively and
transactionally; unknown layouts fail clearly instead of being blessed."""
from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

import pytest

from src.usage import rollup as rollup_module
from src.usage.rollup import UsageRollup, UsageSchemaError
from tests.test_usage_rollup import FakeAudit

_V1_DDL = """
CREATE TABLE usage_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE turn_facts (
    fact_id TEXT PRIMARY KEY, occurred_at REAL NOT NULL, surface TEXT NOT NULL,
    outcome TEXT NOT NULL, duration_ms INTEGER NOT NULL, iteration_count INTEGER NOT NULL,
    is_error INTEGER NOT NULL, agent_final_state TEXT,
    recovery_attempts INTEGER NOT NULL DEFAULT 0, agent_depth INTEGER, parent_id TEXT
);
CREATE TABLE generation_facts (
    fact_id TEXT PRIMARY KEY, turn_fact_id TEXT NOT NULL, occurred_at REAL NOT NULL,
    ordinal INTEGER NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, effort TEXT,
    input_tokens INTEGER, input_provenance TEXT NOT NULL, output_tokens INTEGER,
    output_provenance TEXT NOT NULL, duration_ms INTEGER NOT NULL,
    FOREIGN KEY(turn_fact_id) REFERENCES turn_facts(fact_id)
);
CREATE TABLE tool_facts (
    fact_id TEXT PRIMARY KEY, occurred_at REAL NOT NULL, tool_name TEXT NOT NULL,
    event_type TEXT NOT NULL, duration_ms INTEGER NOT NULL, is_error INTEGER NOT NULL
);
CREATE TABLE ingestion_cursors (
    source_id TEXT PRIMARY KEY, source_kind TEXT NOT NULL, display_path TEXT NOT NULL,
    device INTEGER NOT NULL, inode INTEGER NOT NULL, low_offset INTEGER NOT NULL,
    high_offset INTEGER NOT NULL, initial_size INTEGER NOT NULL,
    initial_complete INTEGER NOT NULL DEFAULT 0, malformed_rows INTEGER NOT NULL DEFAULT 0,
    scan_errors INTEGER NOT NULL DEFAULT 0, updated_at REAL NOT NULL
);
"""


def _v1_store(tmp_path, version: str | None = "1", *, extra_sql: str = ""):
    """A byte-genuine v1 layout with one settled generation row."""
    directory = tmp_path / "usage"
    directory.mkdir()
    db = directory / "usage.sqlite3"
    conn = sqlite3.connect(db)
    conn.executescript(_V1_DDL)
    if version is not None:
        conn.execute("INSERT INTO usage_meta(key, value) VALUES('schema_version', ?)", (version,))
    conn.execute(
        "INSERT INTO turn_facts VALUES('t1', 1700000000, 'discord', 'completed', 10, 1, 0, "
        "NULL, 0, NULL, NULL)"
    )
    conn.execute(
        "INSERT INTO generation_facts VALUES('t1:generation:0:1','t1',1700000000,1,'codex','m',"
        "'high',100,'provider_reported',5,'provider_reported',10)"
    )
    if extra_sql:
        conn.executescript(extra_sql)
    conn.commit()
    conn.close()
    return directory


def _open(tmp_path, directory):
    trajectory = tmp_path / "trajectories"
    agents = trajectory / "agents"
    trajectory.mkdir(exist_ok=True)
    agents.mkdir(exist_ok=True)
    audit = tmp_path / "audit.jsonl"
    audit.touch()
    return UsageRollup(
        str(directory),
        trajectory_directory=str(trajectory),
        agent_trajectory_directory=str(agents),
        audit=FakeAudit(audit),
    )


def _columns(directory):
    conn = sqlite3.connect(directory / "usage.sqlite3")
    try:
        cols = [row[1] for row in conn.execute("PRAGMA table_info(generation_facts)")]
        version = conn.execute(
            "SELECT value FROM usage_meta WHERE key='schema_version'"
        ).fetchone()
        return cols, (version[0] if version else None)
    finally:
        conn.close()


def test_fresh_store_is_created_at_v2(tmp_path):
    store = _open(tmp_path, tmp_path / "usage")
    assert store.available
    cols, version = _columns(tmp_path / "usage")
    assert version == "2"
    assert cols[-2:] == ["cached_tokens", "cache_write_tokens"]


def test_v1_store_migrates_additively_and_keeps_history_null(tmp_path):
    directory = _v1_store(tmp_path)
    store = _open(tmp_path, directory)
    assert store.available, store.error
    cols, version = _columns(directory)
    assert version == "2"
    assert "cached_tokens" in cols and "cache_write_tokens" in cols
    conn = sqlite3.connect(directory / "usage.sqlite3")
    row = conn.execute(
        "SELECT input_tokens, cached_tokens, cache_write_tokens FROM generation_facts"
    ).fetchone()
    conn.close()
    assert row == (100, None, None)  # historical rows: unavailable, never zero


def test_migrated_store_reopens_idempotently(tmp_path):
    directory = _v1_store(tmp_path)
    assert _open(tmp_path, directory).available
    again = _open(tmp_path, directory)
    assert again.available, again.error
    cols, version = _columns(directory)
    assert version == "2" and cols.count("cached_tokens") == 1


@pytest.mark.parametrize(
    "version, fragment",
    [
        ("abc", "malformed"),
        ("-1", "malformed"),
        ("0", "unsupported"),
        ("3", "newer than supported"),
        (None, "declares no schema_version"),
    ],
)
def test_bad_versions_fail_clearly_without_touching_the_store(tmp_path, version, fragment):
    directory = _v1_store(tmp_path, version)
    store = _open(tmp_path, directory)
    assert store.available is False
    assert "UsageSchemaError" in (store.error or "") and fragment in store.error
    cols, stored = _columns(directory)
    assert "cached_tokens" not in cols
    assert stored == version


def test_incompatible_v1_layout_is_refused(tmp_path):
    directory = _v1_store(
        tmp_path, "1", extra_sql="ALTER TABLE generation_facts ADD COLUMN stray TEXT;"
    )
    store = _open(tmp_path, directory)
    assert store.available is False
    assert "incompatible" in (store.error or "")
    cols, version = _columns(directory)
    assert "cached_tokens" not in cols and version == "1"


def test_v2_store_with_missing_column_is_refused(tmp_path):
    directory = _v1_store(
        tmp_path, "2", extra_sql="ALTER TABLE generation_facts ADD COLUMN cached_tokens INTEGER;"
    )
    store = _open(tmp_path, directory)
    assert store.available is False
    assert "cache_write_tokens" in (store.error or "")


def test_failed_migration_rolls_back_schema_and_version(tmp_path, monkeypatch):
    directory = _v1_store(tmp_path)
    real = rollup_module._require_columns

    def flaky(conn, table, expected):
        if expected is rollup_module._GENERATION_COLUMNS_V2 and "cached_tokens" in (
            rollup_module._table_columns(conn, table)
        ):
            raise UsageSchemaError("injected post-migration validation failure")
        return real(conn, table, expected)

    monkeypatch.setattr(rollup_module, "_require_columns", flaky)
    store = _open(tmp_path, directory)
    assert store.available is False
    assert "injected" in (store.error or "")
    cols, version = _columns(directory)
    assert "cached_tokens" not in cols, "ALTER survived the rollback"
    assert version == "1", "version advanced despite the failed migration"


def test_ingest_stores_cache_attribution_and_summary_reports_subsets(tmp_path):
    store = _open(tmp_path, tmp_path / "usage")
    record = {
        "message_id": "m1",
        "channel_id": "c1",
        "timestamp": datetime.now(UTC).isoformat(),
        "source": "discord",
        "iterations": [
            {
                "iteration": 1,
                "input_tokens": 1000,
                "output_tokens": 50,
                "server_input_tokens": 1000,
                "server_output_tokens": 50,
                "input_token_provenance": "provider_reported",
                "output_token_provenance": "provider_reported",
                "cached_tokens": 800,
                "cache_write_tokens": 100,
                "provider": "codex",
                "model": "m",
            },
            {
                "iteration": 2,
                "input_tokens": 500,
                "output_tokens": 10,
                "server_input_tokens": 500,
                "server_output_tokens": 10,
                "input_token_provenance": "provider_reported",
                "output_token_provenance": "provider_reported",
                # no cache fields at all: unavailable, not zero
                "provider": "codex",
                "model": "m",
            },
        ],
        "iteration_count": 2,
        "total_duration_ms": 100,
    }
    assert store._ingest_trajectory(record, "turn")
    summary = store._summary_sync("all")
    cache = summary["work"]["cache"]
    assert cache == {"cached_tokens": 800, "cache_write_tokens": 100, "generations_reported": 1}
    # cache never inflates the totals
    assert summary["work"]["input_tokens"]["total"] == 1500


def test_migration_failure_leaves_the_open_connection_rolled_back(tmp_path, monkeypatch):
    """Pinned on the SAME connection: without an explicit ROLLBACK the
    transaction would still be open with the ALTER pending."""
    directory = _v1_store(tmp_path)
    real = rollup_module._require_columns

    def flaky(conn, table, expected):
        if expected is rollup_module._GENERATION_COLUMNS_V2:
            raise UsageSchemaError("injected")
        return real(conn, table, expected)

    monkeypatch.setattr(rollup_module, "_require_columns", flaky)
    conn = sqlite3.connect(directory / "usage.sqlite3", timeout=0.1)
    try:
        with pytest.raises(UsageSchemaError, match="injected"):
            UsageRollup._migrate_existing(conn, {"usage_meta", "generation_facts"})
        assert conn.in_transaction is False
        cols = [row[1] for row in conn.execute("PRAGMA table_info(generation_facts)")]
        assert "cached_tokens" not in cols
        version = conn.execute("SELECT value FROM usage_meta WHERE key='schema_version'").fetchone()
        assert version == ("1",)
    finally:
        conn.close()
