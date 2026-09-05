"""Rollback/redeploy must reconcile stale side tables, not append duplicates."""

import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from src.discord.channel_logger import ChannelLogger
from src.search.errors import SearchExecutionError
from src.search.fts import FullTextIndex
from tests.test_channel_cursor_campaign import message


def fixture_index(tmp_path, count=12):
    logger = ChannelLogger(tmp_path / "logs")
    logger.FTS_BATCH_LIMIT = 3
    index = FullTextIndex(str(tmp_path / "index.db"))
    for identity in range(1, count + 1):
        logger.log_message(message(identity, f"marker {identity}"))
    assert logger.index_to_fts(index) == count
    index.index_channel_messages([
        {"channel_id": "99", "message_id": "other", "content": "unrelated"},
    ])
    return logger, index


def snapshot(index):
    return (
        index._conn.execute("SELECT rowid, * FROM channel_log_fts ORDER BY rowid").fetchall(),
        index._conn.execute("SELECT * FROM channel_log_identity ORDER BY channel_id, message_id")
        .fetchall(),
        index._conn.execute("SELECT * FROM channel_log_cursor ORDER BY channel_id").fetchall(),
    )


def rollback_rebuild(index, count=12):
    # Old master clears/rebuilds only FTS; branch cursors/identities survive.
    # Explicit disjoint rowids guarantee the stale identities are dangling.
    index._conn.execute("DELETE FROM channel_log_fts WHERE channel_id='42'")
    index._conn.executemany(
        "INSERT INTO channel_log_fts(rowid, content, author, channel_id, timestamp) "
        "VALUES (?, ?, 'Unknown', '42', '100.0')",
        [(100000 + number, f"marker {number}") for number in range(1, count + 1)],
    )
    index._conn.commit()


def assert_repaired(index, count=12):
    assert index._conn.execute(
        "SELECT count(*), count(DISTINCT content) FROM channel_log_fts WHERE channel_id='42'",
    ).fetchone() == (count, count)
    assert index._conn.execute(
        "SELECT count(*) FROM channel_log_fts f LEFT JOIN channel_log_identity i "
        "ON i.fts_rowid=f.rowid AND i.channel_id=f.channel_id "
        "WHERE f.channel_id='42' AND i.message_id IS NULL",
    ).fetchone()[0] == 0
    assert index._conn.execute(
        "SELECT count(*) FROM channel_log_identity i LEFT JOIN channel_log_fts f "
        "ON f.rowid=i.fts_rowid AND f.channel_id=i.channel_id "
        "WHERE i.channel_id='42' AND f.rowid IS NULL",
    ).fetchone()[0] == 0
    assert index._conn.execute(
        "SELECT 1 FROM channel_log_cursor c JOIN channel_log_identity i "
        "ON c.channel_id=i.channel_id AND c.identity=i.message_id WHERE c.channel_id='42'",
    ).fetchone() == (1,)
    assert not index.channel_needs_reconciliation("42")


def test_rollback_untagged_rows_stale_cursor_dangling_identities_one_pass(tmp_path):
    logger, index = fixture_index(tmp_path, count=5003)
    rollback_rebuild(index, count=5003)
    # Reproduce the pre-B10 two-column cursor schema and stale UUID as well.
    if "position" in {
        row[1] for row in index._conn.execute("PRAGMA table_info(channel_log_cursor)")
    }:
        index._conn.executescript(
            "ALTER TABLE channel_log_cursor RENAME TO old_cursor;"
            "CREATE TABLE channel_log_cursor (channel_id TEXT PRIMARY KEY, identity TEXT NOT NULL);"
            "INSERT INTO channel_log_cursor SELECT channel_id, position FROM old_cursor;"
            "DROP TABLE old_cursor;",
        )
    # The surviving branch cursor/identities cover only an old prefix. Master
    # rebuilt the entire newer log without tagging any rows. Incremental replay
    # would now append duplicates for every message after that stale prefix.
    stale_position = logger._index_batch(tmp_path / "logs" / "42.jsonl", None)[-1]["log_identity"]
    index._conn.execute(
        "UPDATE channel_log_cursor SET identity=? WHERE channel_id='42'", (stale_position,),
    )
    index._conn.execute(
        "DELETE FROM channel_log_identity WHERE channel_id='42' AND CAST(message_id AS INTEGER)>3",
    )
    index._conn.commit()
    original_log = (tmp_path / "logs" / "42.jsonl").read_bytes()
    before = snapshot(index)
    assert before[2][0][1]
    assert index._conn.execute(
        "SELECT count(*) FROM channel_log_identity i LEFT JOIN channel_log_fts f "
        "ON f.rowid=i.fts_rowid WHERE i.channel_id='42' AND f.rowid IS NULL",
    ).fetchone()[0] == 3
    index._conn.close()
    index = FullTextIndex(str(tmp_path / "index.db"))
    assert logger.index_to_fts(index) == 5003
    assert_repaired(index, 5003)
    after = snapshot(index)
    assert [r for r in before[0] if r[3] == "99"] == [r for r in after[0] if r[3] == "99"]
    assert [r for r in before[1] if r[0] == "99"] == [r for r in after[1] if r[0] == "99"]
    assert logger.index_to_fts(index) == 0
    assert snapshot(index) == after
    assert (tmp_path / "logs" / "42.jsonl").read_bytes() == original_log
    index._conn.close()


@pytest.mark.parametrize("fault", ["untagged", "dangling", "cursor", "wrong_channel"])
def test_each_inconsistency_independently_triggers_reconciliation(tmp_path, fault):
    logger, index = fixture_index(tmp_path)
    if fault == "untagged":
        index._conn.execute(
            "INSERT INTO channel_log_fts(content, channel_id) VALUES ('marker 1', '42')",
        )
    elif fault == "dangling":
        index._conn.execute("INSERT INTO channel_log_identity VALUES ('42', 'gone', 999999)")
    elif fault == "cursor":
        index._conn.execute("UPDATE channel_log_cursor SET identity='gone' WHERE channel_id='42'")
    else:
        rowid = index._conn.execute(
            "SELECT rowid FROM channel_log_fts WHERE channel_id='99'",
        ).fetchone()[0]
        index._conn.execute("INSERT INTO channel_log_identity VALUES ('42', 'wrong', ?)", (rowid,))
    index._conn.commit()
    assert index.channel_needs_reconciliation("42")
    assert logger.index_to_fts(index) == 12
    assert_repaired(index)
    assert logger.index_to_fts(index) == 0
    index._conn.close()


@pytest.mark.parametrize("failure", ["timeout", "source", "sql", "cursor_write", "cursor_delete"])
def test_inconsistent_reconciliation_failure_preserves_all_three_tables(
    tmp_path, monkeypatch, failure,
):
    logger, index = fixture_index(tmp_path)
    rollback_rebuild(index)
    before = snapshot(index)
    original = logger._initial_index_batches
    clock = [1.0]
    monkeypatch.setattr("src.discord.channel_logger.time.monotonic", lambda: clock[0])

    def batches(path, deadline):
        for number, batch in enumerate(original(path, deadline)):
            if number == 1:
                if failure == "timeout":
                    clock[0] = 100.0
                elif failure == "source":
                    raise OSError("source failure")
                elif failure == "sql":
                    index._conn.execute(
                        "CREATE TEMP TRIGGER fail_identity BEFORE INSERT ON channel_log_identity "
                        "BEGIN SELECT RAISE(ABORT, 'failure'); END",
                    )
            yield batch

    monkeypatch.setattr(logger, "_initial_index_batches", batches)
    if failure.startswith("cursor_"):
        operation = "INSERT" if failure == "cursor_write" else "DELETE"
        index._conn.execute(
            f"CREATE TRIGGER fail_cursor BEFORE {operation} ON channel_log_cursor "
            "BEGIN SELECT RAISE(ABORT, 'failure'); END",
        )
    assert logger.index_to_fts(index) == 0
    assert snapshot(index) == before
    assert index.channel_needs_reconciliation("42")
    monkeypatch.setattr(logger, "_initial_index_batches", original)
    index._conn.execute("DROP TRIGGER IF EXISTS fail_cursor")
    index._conn.execute("DROP TRIGGER IF EXISTS fail_identity")
    assert logger.index_to_fts(index) == 12
    assert_repaired(index)
    assert logger.index_to_fts(index) == 0
    index._conn.close()


def test_legacy_cursor_schema_upgrades_idempotently_without_touching_rows(tmp_path):
    logger, index = fixture_index(tmp_path)
    before = snapshot(index)
    old_position = index.channel_cursor("42")
    index._conn.executescript(
        "DROP INDEX channel_log_identity_fts_rowid;"
        "ALTER TABLE channel_log_cursor RENAME TO old_cursor;"
        "CREATE TABLE channel_log_cursor (channel_id TEXT PRIMARY KEY, identity TEXT NOT NULL);"
        "INSERT INTO channel_log_cursor SELECT channel_id, position FROM old_cursor;"
        "DROP TABLE old_cursor;",
    )
    index._conn.close()
    index = FullTextIndex(str(tmp_path / "index.db"))
    assert index.available
    assert snapshot(index)[:2] == before[:2]
    assert index.channel_cursor("42") == old_position
    assert index._conn.execute("PRAGMA index_info(channel_log_identity_fts_rowid)").fetchall() == [
        (0, 2, "fts_rowid"),
    ]
    assert logger.index_to_fts(index) == 12
    assert_repaired(index)
    after = snapshot(index)
    index._conn.close()
    index = FullTextIndex(str(tmp_path / "index.db"))
    assert logger.index_to_fts(index) == 0
    assert snapshot(index) == after
    index._conn.close()


def test_healthy_cursor_duplicate_and_empty_records_do_not_rebuild(tmp_path, monkeypatch):
    logger, index = fixture_index(tmp_path)
    before = snapshot(index)[0]

    def never_reconcile(*args, **kwargs):
        pytest.fail("healthy channel must stay on the incremental path")

    monkeypatch.setattr(index, "reconcile_channel_batches", never_reconcile)
    for incoming in [message(12, "marker 12"), message(13, ""), message(14, "marker 14")]:
        old_cursor = index.channel_cursor("42")
        logger.log_message(incoming)
        assert logger.index_to_fts(index) == (1 if incoming.id == 14 else 0)
        assert index.channel_cursor("42") != old_cursor
        assert not index.channel_needs_reconciliation("42")
        assert logger.index_to_fts(index) == 0
    assert snapshot(index)[0][:len(before)] == before
    index._conn.close()


def test_empty_only_channel_consumes_position_without_false_inconsistency(tmp_path, monkeypatch):
    logger = ChannelLogger(tmp_path)
    index = FullTextIndex(":memory:")
    logger.log_message(message(1, ""))
    assert logger.index_to_fts(index) == 0
    assert index.channel_cursor("42")
    assert not index.channel_needs_reconciliation("42")
    monkeypatch.setattr(index, "reconcile_channel_batches", lambda *a, **kw: pytest.fail("replay"))
    logger.log_message(message(2, ""))
    assert logger.index_to_fts(index) == 0
    logger.log_message(message(3, "marker 3"))
    assert logger.index_to_fts(index) == 1
    assert_repaired(index, 1)
    index._conn.close()


def test_consistency_probes_are_bounded_and_rowid_indexed(tmp_path):
    logger, index = fixture_index(tmp_path)
    statements = []
    index._conn.set_trace_callback(statements.append)
    assert not index.channel_needs_reconciliation("42")
    index._conn.set_trace_callback(None)
    probes = [sql for sql in statements if sql.startswith("SELECT 1")]
    assert len(probes) == 3
    assert all("LIMIT 1" in sql and "COUNT(" not in sql.upper() for sql in probes)
    plan = index._conn.execute("EXPLAIN QUERY PLAN " + probes[1]).fetchall()
    assert any("USING INDEX channel_log_identity_fts_rowid" in row[3] for row in plan)
    plan = index._conn.execute("EXPLAIN QUERY PLAN " + probes[2]).fetchall()
    assert any("VIRTUAL TABLE INDEX" in row[3] and "=" in row[3] for row in plan)
    index._conn.close()


def test_repaired_by_other_indexer_does_not_consume_stale_reconciliation(tmp_path):
    logger, index = fixture_index(tmp_path)
    rollback_rebuild(index)
    assert index.channel_needs_reconciliation("42")
    assert logger.index_to_fts(index) == 12
    before = snapshot(index)

    def never_read():
        pytest.fail("another indexer already repaired the channel")
        yield  # pragma: no cover

    assert index.reconcile_channel_batches(
        "42", never_read(), deadline=time.monotonic() + 3,
    ).status == "empty"
    assert snapshot(index) == before
    index._conn.close()


def test_inconsistent_reconciliation_keeps_old_reader_snapshot_until_caught_up(
    tmp_path, monkeypatch,
):
    logger, index = fixture_index(tmp_path)
    rollback_rebuild(index)
    before = snapshot(index)
    original = logger._initial_index_batches
    entered, release = threading.Event(), threading.Event()
    observer = sqlite3.connect(tmp_path / "index.db")

    def batches(path, deadline):
        for number, batch in enumerate(original(path, deadline)):
            if number == 1:
                entered.set()
                assert release.wait(3)
            yield batch

    monkeypatch.setattr(logger, "_initial_index_batches", batches)
    with ThreadPoolExecutor(max_workers=1) as pool:
        work = pool.submit(logger.index_to_fts, index)
        try:
            assert entered.wait(3)
            assert observer.execute(
                "SELECT rowid, * FROM channel_log_fts ORDER BY rowid",
            ).fetchall() == before[0]
            assert observer.execute(
                "SELECT * FROM channel_log_identity ORDER BY channel_id, message_id",
            ).fetchall() == before[1]
            assert observer.execute(
                "SELECT * FROM channel_log_cursor ORDER BY channel_id",
            ).fetchall() == before[2]
            # The writer has removed the old cursor, but observers still see it.
            assert index._conn.execute("SELECT * FROM channel_log_cursor").fetchall() == []
        finally:
            release.set()
        assert work.result(3) == 12
    assert_repaired(index)
    observer.close()
    index._conn.close()


def test_empty_source_preserves_inconsistent_index_and_cursor(tmp_path):
    logger, index = fixture_index(tmp_path)
    rollback_rebuild(index)
    before = snapshot(index)
    ack = index.reconcile_channel_batches("42", [], deadline=time.monotonic() + 3)
    assert ack.status == "empty"
    assert snapshot(index) == before
    assert logger.index_to_fts(index) == 12
    index._conn.close()


def test_legacy_position_that_is_a_message_identity_remains_incremental(tmp_path, monkeypatch):
    logger = ChannelLogger(tmp_path / "logs")
    index = FullTextIndex(str(tmp_path / "index.db"))
    path = tmp_path / "logs" / "42.jsonl"
    path.write_text('{"channel_id":"42","content":"legacy"}\n')
    assert logger.index_to_fts(index) == 1
    # Pre-B10 legacy JSONL used the same stable line hash for both identities.
    index._conn.execute("UPDATE channel_log_cursor SET position=NULL")
    index._conn.commit()
    before = snapshot(index)
    monkeypatch.setattr(index, "reconcile_channel_batches", lambda *a, **kw: pytest.fail("replay"))
    assert logger.index_to_fts(index) == 0
    assert snapshot(index) == before
    index._conn.close()


def test_consistency_probe_failure_does_not_advance_or_append(tmp_path):
    logger, index = fixture_index(tmp_path)
    before = snapshot(index)
    logger.log_message(message(13, "marker 13"))

    def deny_read(action, table, column, database, source):
        if action == sqlite3.SQLITE_READ and table == "channel_log_identity":
            return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK

    index._conn.set_authorizer(deny_read)
    assert logger.index_to_fts(index) == 0
    index._conn.set_authorizer(None)
    assert snapshot(index) == before
    assert logger.index_to_fts(index) == 1
    index._conn.close()
    index._conn = None
    with pytest.raises(SearchExecutionError, match="unavailable"):
        index.channel_needs_reconciliation("42")
