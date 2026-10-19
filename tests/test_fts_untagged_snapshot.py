"""One untagged-row scan per indexing pass, with every other consistency check fresh.

The per-channel untagged probe scans the whole FTS5 table (``channel_id`` is
UNINDEXED) once per channel. The pass now takes that predicate from a single
materialized snapshot. Detection, repair, rollback and next-pass recovery must not
change; an unavailable snapshot falls back to the fresh per-channel checks.
"""
import sqlite3
from types import SimpleNamespace

from src.discord.channel_logger import ChannelLogger
from src.search.fts import FullTextIndex

PER_CHANNEL_UNTAGGED = "FROM channel_log_fts AS f WHERE f.channel_id="
BATCHED_UNTAGGED = "SELECT DISTINCT f.channel_id FROM channel_log_fts"


def msg(identity, channel, content=None):
    return SimpleNamespace(
        id=identity, content=f"message {identity}" if content is None else content,
        channel=SimpleNamespace(id=channel, guild=SimpleNamespace(id=9)),
        created_at=SimpleNamespace(timestamp=lambda: 100.0))


def build(tmp_path, channels=(1, 2, 3, 4, 5, 6), per_channel=3):
    logger = ChannelLogger(tmp_path / "logs")
    index = FullTextIndex(str(tmp_path / "fts.db"))
    for channel in channels:
        for n in range(per_channel):
            logger.log_message(msg(channel * 100 + n, channel))
    assert logger.index_to_fts(index) == len(channels) * per_channel
    return logger, index


def rowids(index, channel):
    return [r[0] for r in index._conn.execute(
        "SELECT rowid FROM channel_log_fts WHERE channel_id=? ORDER BY rowid", (str(channel),))]


def untagged_row(index, channel, text="untagged marker"):
    index._conn.execute(
        "INSERT INTO channel_log_fts(content, author, channel_id, timestamp) "
        "VALUES (?, 'Unknown', ?, '1.0')", (text, str(channel)))
    index._conn.commit()


def consistent(index, channels):
    return {str(c): not index.channel_needs_reconciliation(str(c)) for c in channels}


def test_snapshot_matches_the_fresh_predicate_in_every_state(tmp_path):
    logger, index = build(tmp_path)
    logger.log_message(msg(901, 7, content=""))  # an empty-content-only channel
    logger.index_to_fts(index)
    untagged_row(index, 2)
    first_of_1 = rowids(index, 1)[0]
    index._conn.execute("INSERT INTO channel_log_identity VALUES ('3', 'wrong', ?)", (first_of_1,))
    index._conn.execute("INSERT INTO channel_log_identity VALUES ('4', 'gone', 999999)")
    index._conn.execute("DELETE FROM channel_log_cursor WHERE channel_id='5'")
    untagged_row(index, "07")  # source-less, and not the same ID as channel 7
    index._conn.commit()
    snapshot = index.untagged_channel_snapshot()
    assert snapshot == frozenset({"2", "07"})
    for channel in ("1", "2", "3", "4", "5", "6", "7"):
        assert index.channel_needs_reconciliation_cached(channel, snapshot) is \
            index.channel_needs_reconciliation(channel), channel
    assert [c for c in "1234567" if index.channel_needs_reconciliation(c)] == ["2", "3", "4", "5"]


def test_healthy_pass_runs_one_untagged_scan(tmp_path):
    logger, index = build(tmp_path)
    statements = []
    index._conn.set_trace_callback(statements.append)
    assert logger.index_to_fts(index) == 0
    index._conn.set_trace_callback(None)
    assert sum(BATCHED_UNTAGGED in s for s in statements) == 1
    assert not [s for s in statements if PER_CHANNEL_UNTAGGED in s]


def test_one_pass_repairs_several_channels_including_a_later_dangling_mapping(tmp_path):
    logger, index = build(tmp_path, channels=(1, 2))
    untagged_row(index, 1)
    victim = rowids(index, 1)[0]  # channel 1's repair deletes this row
    index._conn.execute("INSERT INTO channel_log_identity VALUES ('2', 'wrong', ?)", (victim,))
    index._conn.commit()
    assert index.untagged_channel_snapshot() == frozenset({"1"})  # channel 2 relies on fresh checks
    assert logger.index_to_fts(index) == 6
    assert consistent(index, (1, 2)) == {"1": True, "2": True}
    assert len(rowids(index, 1)) == 3 and len(rowids(index, 2)) == 3


def test_flagged_but_healthy_channel_is_not_rebuilt(tmp_path, monkeypatch):
    logger, index = build(tmp_path, channels=(1,))
    before = rowids(index, 1)
    monkeypatch.setattr(index, "untagged_channel_snapshot", lambda: frozenset({"1"}))
    assert logger.index_to_fts(index) == 0  # the in-lock recheck acknowledges "empty"
    assert rowids(index, 1) == before


def test_failed_repair_keeps_every_table_and_the_next_pass_repairs(tmp_path, monkeypatch):
    logger, index = build(tmp_path, channels=(1, 2))
    untagged_row(index, 1)

    def tables():
        return [index._conn.execute(f"SELECT * FROM {t} ORDER BY 1, 2").fetchall()
                for t in ("channel_log_fts", "channel_log_identity", "channel_log_cursor")]

    before = tables()

    def broken(self, path, deadline):
        yield [{"message_id": "100", "content": "partial", "channel_id": "1"}]
        raise RuntimeError("fixture source failure")

    monkeypatch.setattr(ChannelLogger, "_initial_index_batches", broken)
    logger.index_to_fts(index)
    assert tables() == before
    monkeypatch.undo()
    assert logger.index_to_fts(index) == 3
    assert consistent(index, (1, 2)) == {"1": True, "2": True}


def test_fault_after_a_healthy_pass_is_repaired_on_the_next_pass(tmp_path):
    logger, index = build(tmp_path, channels=(1, 2))
    assert logger.index_to_fts(index) == 0
    untagged_row(index, 2)
    assert logger.index_to_fts(index) == 3  # a fresh snapshot, nothing reused across calls
    assert consistent(index, (1, 2)) == {"1": True, "2": True}


def test_unavailable_snapshot_uses_fresh_checks_and_keeps_progress_rules(tmp_path, monkeypatch):
    logger, index = build(tmp_path, channels=(1, 2))
    monkeypatch.setattr(index, "untagged_channel_snapshot", lambda: None)
    fresh = index.channel_needs_reconciliation
    calls = []

    def checked(channel_id):
        calls.append(channel_id)
        if channel_id == "2":
            raise sqlite3.OperationalError("fixture check failure")
        return fresh(channel_id)

    monkeypatch.setattr(index, "channel_needs_reconciliation", checked)
    cursor_2 = index.channel_cursor("2")
    logger.log_message(msg(150, 1))
    logger.log_message(msg(250, 2))
    assert logger.index_to_fts(index) == 1  # channel 1 advances, channel 2 does not
    assert sorted(calls) == ["1", "2"]
    assert index.channel_cursor("2") == cursor_2
    monkeypatch.undo()
    assert logger.index_to_fts(index) == 1  # channel 2's message is indexed once it can be checked


def test_snapshot_query_failure_is_unavailable_not_healthy(tmp_path):
    logger, index = build(tmp_path, channels=(1, 2))
    untagged_row(index, 1)
    real = index._conn

    class FailingSnapshot:
        def __getattr__(self, name):
            return getattr(real, name)

        def execute(self, sql, *args):
            if BATCHED_UNTAGGED in sql:
                raise sqlite3.OperationalError("fixture snapshot failure")
            return real.execute(sql, *args)

    index._conn = FailingSnapshot()
    try:
        assert index.untagged_channel_snapshot() is None
        assert logger.index_to_fts(index) == 3  # the fresh per-channel check still finds the fault
    finally:
        index._conn = real
    assert consistent(index, (1, 2)) == {"1": True, "2": True}


def test_untagged_row_written_mid_pass_waits_for_the_next_pass(tmp_path, monkeypatch):
    """Boundary: production has one channel-row writer (this indexer). A row inserted by
    an unsupported writer after the snapshot is found by the next pass, not this one."""
    logger, index = build(tmp_path, channels=(1, 2))
    taken = index.untagged_channel_snapshot

    def snapshot_then_foreign_write():
        result = taken()
        untagged_row(index, 2, "foreign mid-pass write")
        return result

    monkeypatch.setattr(index, "untagged_channel_snapshot", snapshot_then_foreign_write)
    assert logger.index_to_fts(index) == 0
    assert index.channel_needs_reconciliation("2")
    monkeypatch.undo()
    assert logger.index_to_fts(index) == 3
    assert consistent(index, (1, 2)) == {"1": True, "2": True}


def test_rows_of_channels_without_a_log_are_left_alone(tmp_path):
    logger, index = build(tmp_path, channels=(1,))
    index.index_channel_messages([{"channel_id": "99", "message_id": "x", "content": "other"}])
    untagged_row(index, 99)
    before = rowids(index, 99)
    assert "99" in index.untagged_channel_snapshot()
    assert logger.index_to_fts(index) == 0
    assert rowids(index, 99) == before
