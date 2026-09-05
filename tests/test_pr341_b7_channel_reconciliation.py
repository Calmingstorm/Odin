import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from src.discord.channel_logger import ChannelLogger
from src.search.fts import FullTextIndex
from tests.test_channel_cursor_campaign import message


def fixture_index(tmp_path, count=12):
    logger = ChannelLogger(tmp_path / "logs")
    index = FullTextIndex(str(tmp_path / "index.db"))
    for identity in range(1, count + 1):
        logger.log_message(message(identity, f"marker {identity}"))
    index.index_channel_messages([
        {"channel_id": "42", "content": f"marker {identity}"}
        for identity in range(1, count + 1)
    ] + [{"channel_id": "99", "content": "unrelated"}])
    return logger, index


def test_upgrade_more_than_5000_rows_caught_up_in_one_pass(tmp_path):
    logger, index = fixture_index(tmp_path, count=12003)
    path = tmp_path / "logs" / "42.jsonl"
    before = path.read_bytes()
    assert logger.index_to_fts(index) == 12003
    assert index._conn.execute("SELECT count(*) FROM channel_log_fts").fetchone()[0] == 12004
    assert index.channel_cursor("42")
    assert logger.index_to_fts(index) == 0
    assert path.read_bytes() == before
    index._conn.close()


@pytest.mark.parametrize("failure", ["timeout", "source", "sql", "commit"])
def test_failed_later_batch_keeps_entire_old_index_and_cursor(tmp_path, monkeypatch, failure):
    logger, index = fixture_index(tmp_path)
    logger.FTS_BATCH_LIMIT = 3
    original = logger._initial_index_batches
    before = index._conn.execute("SELECT rowid, * FROM channel_log_fts").fetchall()
    before_ids = index._conn.execute("SELECT * FROM channel_log_identity").fetchall()
    clock = [1.0]
    monkeypatch.setattr("src.discord.channel_logger.time.monotonic", lambda: clock[0])

    def batches(path, deadline):
        for number, batch in enumerate(original(path, deadline)):
            if number == 1:
                if failure == "timeout":
                    clock[0] = 100.0
                elif failure == "source":
                    raise OSError("source unavailable")
                elif failure == "sql":
                    index._conn.execute(
                        "CREATE TEMP TRIGGER fail_identity BEFORE INSERT ON channel_log_identity "
                        "BEGIN SELECT RAISE(ABORT, 'failure'); END",
                    )
            yield batch

    monkeypatch.setattr(logger, "_initial_index_batches", batches)
    if failure == "commit":
        index._conn.execute(
            "CREATE TRIGGER fail_cursor BEFORE INSERT ON channel_log_cursor "
            "BEGIN SELECT RAISE(ABORT, 'failure'); END",
        )
    assert logger.index_to_fts(index) == 0
    assert index.channel_cursor("42") is None
    assert index._conn.execute("SELECT rowid, * FROM channel_log_fts").fetchall() == before
    assert index._conn.execute("SELECT * FROM channel_log_identity").fetchall() == before_ids
    monkeypatch.setattr(logger, "_initial_index_batches", original)
    index._conn.execute("DROP TRIGGER IF EXISTS fail_cursor")
    index._conn.execute("DROP TRIGGER IF EXISTS fail_identity")
    assert logger.index_to_fts(index) == 12
    index._conn.close()


def test_readers_never_see_first_batch_replacement(tmp_path, monkeypatch):
    logger, index = fixture_index(tmp_path)
    logger.FTS_BATCH_LIMIT = 3
    original = logger._initial_index_batches
    entered, release, reader_started = threading.Event(), threading.Event(), threading.Event()
    observer = sqlite3.connect(tmp_path / "index.db")

    def batches(path, deadline):
        for number, batch in enumerate(original(path, deadline)):
            if number == 1:
                entered.set()
                assert release.wait(3)
            yield batch

    def search():
        reader_started.set()
        return index.search_channel_logs("marker", limit=30)

    monkeypatch.setattr(logger, "_initial_index_batches", batches)
    with ThreadPoolExecutor(max_workers=2) as pool:
        work = pool.submit(logger.index_to_fts, index)
        try:
            assert entered.wait(3)
            assert observer.execute("SELECT count(*) FROM channel_log_fts").fetchone()[0] == 13
            read = pool.submit(search)
            assert reader_started.wait(3)
            assert not read.done()
        finally:
            release.set()
        assert work.result(3) == 12
        assert len(read.result(3)) == 12
    observer.close()
    index._conn.close()


def test_empty_source_and_expired_budget_preserve_legacy_coverage(tmp_path):
    logger, index = fixture_index(tmp_path)
    before = index._conn.execute("SELECT rowid, * FROM channel_log_fts").fetchall()
    ack = index.reconcile_channel_batches("42", [], deadline=time.monotonic() - 1)
    assert ack.status == "error"
    ack = index.reconcile_channel_batches("42", [], deadline=time.monotonic() + 3)
    assert ack.status == "empty"
    assert index._conn.execute("SELECT rowid, * FROM channel_log_fts").fetchall() == before
    assert index.channel_cursor("42") is None
    assert logger.index_to_fts(index) == 12
    index._conn.close()


def test_racing_first_pass_does_not_replace_already_committed_cursor(tmp_path):
    logger, index = fixture_index(tmp_path)
    assert logger.index_to_fts(index) == 12
    rows = index._conn.execute("SELECT rowid, * FROM channel_log_fts").fetchall()
    cursor = index.channel_cursor("42")

    def never_read():
        raise AssertionError("already reconciled channel must not replay")
        yield  # pragma: no cover

    ack = index.reconcile_channel_batches("42", never_read(), deadline=time.monotonic() + 3)
    assert ack.status == "empty"
    assert index.channel_cursor("42") == cursor
    assert index._conn.execute("SELECT rowid, * FROM channel_log_fts").fetchall() == rows
    logger.log_message(message(13, "late"))
    assert logger.index_to_fts(index) == 1  # handler/lock was released
    index._conn.close()


def test_source_deadline_and_malformed_records_do_not_consume_progress(tmp_path):
    logger, index = fixture_index(tmp_path)
    path = tmp_path / "logs" / "42.jsonl"
    with pytest.raises(TimeoutError):
        list(logger._initial_index_batches(path, time.monotonic() - 1))
    with path.open("a") as stream:
        stream.write("null\n[]\n{bad\n")
    assert logger.index_to_fts(index) == 12
    with path.open("a") as stream:
        stream.write('{"incomplete":')
    cursor = index.channel_cursor("42")
    assert logger.index_to_fts(index) == 0
    assert index.channel_cursor("42") == cursor
    index._conn.close()
