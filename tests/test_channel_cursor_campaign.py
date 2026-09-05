import json
from types import SimpleNamespace

import pytest

from src.discord.channel_logger import ChannelLogger
from src.search.errors import SearchExecutionError
from src.search.fts import FullTextIndex


def message(identity, content="body"):
    return SimpleNamespace(id=identity, content=content,
                           channel=SimpleNamespace(id=42, guild=SimpleNamespace(id=9)),
                           created_at=SimpleNamespace(timestamp=lambda: 100.0))


def test_equal_timestamp_batches_restart_and_late_arrival(tmp_path):
    logger = ChannelLogger(tmp_path / "logs")
    logger.FTS_BATCH_LIMIT = 2
    index = FullTextIndex(str(tmp_path / "fts.db"))
    for identity in range(3):
        logger.log_message(message(identity + 1))
    assert logger.index_to_fts(index) == 2
    index._conn.close()
    index = FullTextIndex(str(tmp_path / "fts.db"))
    logger = ChannelLogger(tmp_path / "logs")
    assert logger.index_to_fts(index) == 1
    logger.log_message(message(4))
    assert logger.index_to_fts(index) == 1
    assert logger.index_to_fts(index) == 0
    assert index._conn.execute("SELECT count(*) FROM channel_log_fts").fetchone()[0] == 4
    index._conn.close()


def test_real_sqlite_failure_rolls_back_rows_and_cursor(tmp_path):
    logger = ChannelLogger(tmp_path / "logs")
    index = FullTextIndex(":memory:")
    logger.log_message(message(1))
    index._conn.execute("CREATE TRIGGER fail_cursor BEFORE INSERT ON channel_log_cursor "
                        "BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END")
    assert logger.index_to_fts(index) == 0
    assert index.channel_cursor("42") is None
    assert index._conn.execute("SELECT count(*) FROM channel_log_fts").fetchone()[0] == 0
    index._conn.execute("DROP TRIGGER fail_cursor")
    assert logger.index_to_fts(index) == 1
    assert index.channel_cursor("42")
    assert logger.index_to_fts(index) == 0
    index._conn.close()


def test_typed_empty_committed_error_and_rotation_replay(tmp_path):
    logger = ChannelLogger(tmp_path)
    index = FullTextIndex(":memory:")
    assert index.index_channel_batch([]).status == "empty"
    assert index.index_channel_batch([{"content": "healthy"}]).status == "committed"
    index._conn.execute("CREATE TRIGGER fail_cursor BEFORE INSERT ON channel_log_cursor "
                        "BEGIN SELECT RAISE(ABORT, 'failure'); END")
    assert index.index_channel_batch([], channel_id="42", cursor_identity="x").status == "error"
    index._conn.execute("DROP TRIGGER fail_cursor")
    logger.log_message(message(1, ""))
    assert logger.index_to_fts(index) == 0
    assert index.channel_cursor("42") is not None
    (tmp_path / "42.jsonl").rename(tmp_path / "preserved.log")
    logger.log_message(message(2))
    assert logger.index_to_fts(index) == 1
    logger.log_message(message(2))
    assert logger.index_to_fts(index) == 0  # replay is idempotent
    assert index._conn.execute("SELECT count(*) FROM channel_log_fts").fetchone()[0] == 2
    index._conn.close()


def test_legacy_source_untouched_partial_append_not_consumed(tmp_path):
    path = tmp_path / "42.jsonl"
    row = json.dumps({"channel_id": "42", "ts": 100, "content": "legacy"})
    path.write_text(row)
    logger = ChannelLogger(tmp_path)
    index = FullTextIndex(":memory:")
    assert logger.index_to_fts(index) == 0
    path.write_text(row + "\n")
    original = path.read_bytes()
    assert logger.index_to_fts(index) == 1
    assert ChannelLogger(tmp_path).index_to_fts(index) == 0
    assert path.read_bytes() == original
    index._conn.close()


def test_restart_preserves_pre_identity_history_and_resumes_durable_cursor(tmp_path):
    database = str(tmp_path / "fts.db")
    logger = ChannelLogger(tmp_path / "logs")
    index = FullTextIndex(database)
    index.index_channel_messages([{"content": "historical exact marker", "channel_id": "42"}])
    historical = index._conn.execute("SELECT rowid, * FROM channel_log_fts").fetchall()
    logger.log_message(message(1, "first new marker"))
    assert logger.index_to_fts(index) == 1
    cursor = index.channel_cursor("42")
    index._conn.close()
    logger = ChannelLogger(tmp_path / "logs")
    index = FullTextIndex(database)
    assert index.channel_cursor("42") == cursor
    logger.log_message(message(2, "late equal timestamp marker"))
    assert logger.index_to_fts(index) == 1
    rows = index._conn.execute("SELECT rowid, * FROM channel_log_fts ORDER BY rowid").fetchall()
    assert rows[:1] == historical
    assert len(rows) == 3
    assert index.channel_cursor("42") != cursor
    assert logger.index_to_fts(index) == 0
    assert index._conn.execute(
        "SELECT rowid, * FROM channel_log_fts ORDER BY rowid",
    ).fetchall() == rows
    index._conn.close()


def test_unavailable_index_and_empty_identity_do_not_claim_progress():
    index = FullTextIndex(":memory:")
    assert not index.remove_channel_message("42", "")
    index._conn.close()
    index._conn = None
    with pytest.raises(SearchExecutionError, match="unavailable"):
        index.channel_cursor("42")
    assert index.index_channel_batch([], channel_id="42", cursor_identity="next").status == "error"
    assert not index.remove_channel_message("42", "8")
