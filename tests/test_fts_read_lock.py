"""Every public FTS reader shares the connection's transaction lock.

The index shares one connection across ``asyncio.to_thread`` callers. WAL
isolates separate connections, not callers sharing one connection's
transaction and statement state: a reader that enters while a writer's
transaction is open fails with ``InterfaceError: bad parameter or other API
misuse`` (seen in Odin Desktop's CI, from ``SessionVectorStore.backfill``
calling ``has_session`` while another thread was in ``index_session``).

Events force the boundary rather than hoping SQLite trips over a stress run.
The proxy raises InterfaceError if a reader reaches the connection during a
paused writer, making the pre-fix implementation fail deterministically.
Ported from Odin Desktop's ``test_desktop_fts_read_lock.py``.
"""
from __future__ import annotations

import sqlite3
import threading

import pytest

from src.search.fts import FullTextIndex

READERS = [
    ("has_session", ("session",), {}),
    ("search_sessions", ("needle",), {}),
    ("search_sessions", ("needle",), {"channel_id": "channel"}),
    ("search_knowledge", ("needle",), {}),
    ("count_knowledge_source", ("source",), {}),
    ("has_knowledge_source", ("source",), {}),
    ("has_knowledge_chunk", ("chunk",), {}),
    ("knowledge_chunk_sources", (), {}),
    ("get_knowledge_source_rows", ("source",), {}),
    ("search_channel_logs", ("needle",), {}),
    ("search_channel_logs", ("needle",), {"channel_id": "channel"}),
    ("channel_cursor", ("channel",), {}),
    ("channel_needs_reconciliation", ("channel",), {}),
]


class _ObservedLock:
    def __init__(self, lock, reached, name="fts-reader"):
        self.lock = lock
        self.reached = reached
        self.name = name
        self.acquired = threading.Event()

    def __enter__(self):
        if threading.current_thread().name == self.name:
            self.reached.set()
        self.lock.acquire()
        if threading.current_thread().name == self.name:
            self.acquired.set()
        return self

    def __exit__(self, *exc):
        self.lock.release()


@pytest.fixture
def index(tmp_path):
    idx = FullTextIndex(str(tmp_path / "fts.db"))
    assert idx.available
    assert idx.index_session("session", "needle old", "channel", 1.0)
    assert idx.index_knowledge_chunk("chunk", "needle", "source", 0)
    ack = idx.index_channel_batch([{
        "content": "needle", "author": "author", "channel_id": "channel",
        "message_id": "message", "log_identity": "position", "ts": 1.0,
    }], channel_id="channel", cursor_identity="position")
    assert ack.status == "committed"
    conn = idx._conn
    yield idx
    conn.close()


class _PausedWriterConnection:
    def __init__(self, conn, reached):
        self.conn = conn
        self.reached = reached
        self.paused = threading.Event()
        self.release = threading.Event()
        self.reader_entered = threading.Event()
        self.writer_active = False

    def __getattr__(self, name):
        return getattr(self.conn, name)

    def execute(self, sql, parameters=()):
        if threading.current_thread().name == "fts-reader":
            self.reader_entered.set()
            self.reached.set()
            if self.writer_active:
                raise sqlite3.InterfaceError("reader overlapped writer transaction")
        cursor = self.conn.execute(sql, parameters)
        if sql.startswith("DELETE FROM session_fts"):
            self.writer_active = True
            self.paused.set()
            if not self.release.wait(5):
                raise TimeoutError("writer release not signaled")
        return cursor

    def commit(self):
        result = self.conn.commit()
        self.writer_active = False
        return result


def _thread(name, call, results, errors):
    def run():
        try:
            results.append(call())
        except BaseException as exc:
            errors.append(exc)
    thread = threading.Thread(target=run, name=name, daemon=True)
    thread.start()
    return thread


@pytest.mark.parametrize("method,args,kwargs", READERS)
def test_public_reader_cannot_enter_paused_writer(index, method, args, kwargs):
    reached = threading.Event()
    proxy = _PausedWriterConnection(index._conn, reached)
    lock = _ObservedLock(index._write_lock, reached)
    index._conn = proxy
    index._write_lock = lock
    expected = getattr(index, method)(*args, **kwargs)
    writer_results, reader_results, errors = [], [], []
    writer = _thread("fts-writer", lambda: index.index_session(
        "session", "needle new", "channel", 2.0,
    ), writer_results, errors)
    reader = None
    try:
        assert proxy.paused.wait(5), "writer did not reach the open transaction"
        reader = _thread("fts-reader", lambda: getattr(index, method)(
            *args, **kwargs,
        ), reader_results, errors)
        assert reached.wait(5), "reader never attempted connection access"
        assert not lock.acquired.is_set(), "reader acquired writer's lock"
        assert not proxy.reader_entered.is_set(), "reader bypassed the transaction lock"
    finally:
        proxy.release.set()
        writer.join(5)
        if reader is not None:
            reader.join(5)
    assert not writer.is_alive()
    assert reader is not None and not reader.is_alive()
    assert errors == []
    assert writer_results == [True]
    assert reader_results == [getattr(index, method)(*args, **kwargs)]
    # No reader silently returns a missing row / empty result on contention.
    if method != "channel_needs_reconciliation":
        assert expected
        assert reader_results[0]
    assert index.search_sessions("old") == []
    assert index.search_sessions("new")[0]["doc_id"] == "session"


@pytest.mark.parametrize("method,args,kwargs", READERS[:7])
def test_overlap_probe_detects_reader_lock_bypass(index, method, args, kwargs):
    """Same fixture/proxy fails at the SQLite boundary if readers skip locking."""
    reached = threading.Event()
    proxy = _PausedWriterConnection(index._conn, reached)
    real_lock = index._write_lock

    class BypassReaderLock:
        def __enter__(self):
            if threading.current_thread().name != "fts-reader":
                real_lock.acquire()
            return self

        def __exit__(self, *exc):
            if threading.current_thread().name != "fts-reader":
                real_lock.release()

    index._conn = proxy
    index._write_lock = BypassReaderLock()
    writer_results, reader_results, errors = [], [], []
    writer = _thread("fts-writer", lambda: index.index_session(
        "session", "needle new", "channel", 2.0,
    ), writer_results, errors)
    reader = None
    try:
        assert proxy.paused.wait(5)
        reader = _thread("fts-reader", lambda: getattr(index, method)(
            *args, **kwargs,
        ), reader_results, errors)
        reader.join(5)
        assert not reader.is_alive()
        assert proxy.reader_entered.is_set()
        assert reader_results == []
        assert len(errors) == 1
        assert isinstance(errors[0], sqlite3.InterfaceError)
        assert "reader overlapped" in str(errors[0])
    finally:
        proxy.release.set()
        writer.join(5)
        if reader is not None:
            reader.join(5)
    assert not writer.is_alive()
    assert writer_results == [True]


@pytest.mark.parametrize("method,args,kwargs", READERS)
def test_public_reader_can_reenter_connection_lock(index, method, args, kwargs):
    results, errors = [], []

    def nested():
        with index._write_lock:
            return getattr(index, method)(*args, **kwargs)

    thread = _thread("nested-reader", nested, results, errors)
    thread.join(2)
    assert not thread.is_alive(), "same-thread read deadlocked on its connection lock"
    assert errors == []
    assert results == [getattr(index, method)(*args, **kwargs)]


@pytest.mark.parametrize("method,args", [
    ("has_session", ("session",)),
    ("search_sessions", ("needle",)),
    ("search_knowledge", ("needle",)),
    ("search_channel_logs", ("needle",)),
])
def test_interface_error_is_not_suppressed(index, method, args):
    class BrokenConnection:
        def execute(self, *args, **kwargs):
            raise sqlite3.InterfaceError("injected interface failure")

    index._conn = BrokenConnection()
    with pytest.raises(sqlite3.InterfaceError, match="injected interface failure"):
        getattr(index, method)(*args)


@pytest.mark.parametrize("method,args", [
    ("has_session", ("session",)),
    ("search_sessions", ("needle",)),
])
def test_reader_holds_lock_through_cursor_fetch(index, method, args):
    conn = index._conn
    paused, release, writer_reached = (threading.Event() for _ in range(3))
    lock = _ObservedLock(index._write_lock, writer_reached, name="fts-writer")
    index._write_lock = lock

    class PausedCursor:
        def __init__(self, cursor):
            self.cursor = cursor

        def _fetch(self, name):
            paused.set()
            assert release.wait(5), "cursor release not signaled"
            return getattr(self.cursor, name)()

        def fetchone(self):
            return self._fetch("fetchone")

        def fetchall(self):
            return self._fetch("fetchall")

    class Connection:
        def __getattr__(self, name):
            return getattr(conn, name)

        def execute(self, sql, parameters=()):
            cursor = conn.execute(sql, parameters)
            if threading.current_thread().name == "fts-reader":
                return PausedCursor(cursor)
            return cursor

    index._conn = Connection()
    reader_results, writer_results, errors = [], [], []
    reader = _thread("fts-reader", lambda: getattr(index, method)(*args),
                     reader_results, errors)
    writer = None
    try:
        assert paused.wait(5)
        writer = _thread("fts-writer", lambda: index.index_session(
            "session", "replacement", "channel", 2.0,
        ), writer_results, errors)
        assert writer_reached.wait(5)
        assert not lock.acquired.is_set(), "writer entered before reader fetched its cursor"
    finally:
        release.set()
        reader.join(5)
        if writer is not None:
            writer.join(5)
    assert not reader.is_alive()
    assert writer is not None and not writer.is_alive()
    assert errors == []
    assert reader_results[0]
    assert writer_results == [True]


MUTATIONS = [
    ("index_session", ("session", "replacement", "channel", 2.0)),
    ("index_knowledge_chunk", ("chunk", "replacement", "source", 1)),
    ("replace_knowledge_source", ("source", [("new", "replacement", 0)])),
    ("delete_knowledge_chunks", ({"chunk"},)),
    ("delete_knowledge_source", ("source",)),
    ("clear_channel_logs", ()),
    ("index_channel_messages", ([{"content": "replacement", "channel_id": "channel"}],)),
    ("index_channel_batch", ([{"content": "replacement", "channel_id": "channel"}],)),
    ("reconcile_channel_batches", ("missing", [[{
        "content": "replacement", "channel_id": "missing", "log_identity": "position",
    }]])),
    ("remove_channel_message", ("channel", "message")),
]


@pytest.mark.parametrize("method,args", MUTATIONS)
@pytest.mark.parametrize("fail_insert", [False, True])
def test_mutations_keep_connection_operations_inside_lock(index, method, args, fail_insert):
    """Audit execute, commit, rollback and progress-handler access, including faults."""
    conn = index._conn
    calls = []
    unlocked = []

    class LockedConnection:
        def __getattr__(self, name):
            return getattr(conn, name)

        def _call(self, name, *args):
            if not index._write_lock._is_owned():
                unlocked.append(name)
            assert index._write_lock._is_owned(), f"{name} outside transaction lock"
            calls.append(name)
            return getattr(conn, name)(*args)

        def execute(self, sql, parameters=()):
            if not index._write_lock._is_owned():
                unlocked.append("execute")
            assert index._write_lock._is_owned(), "execute outside transaction lock"
            calls.append("execute")
            if fail_insert and sql.startswith("INSERT"):
                raise sqlite3.OperationalError("injected insert failure")
            return conn.execute(sql, parameters)

        def commit(self):
            return self._call("commit")

        def rollback(self):
            return self._call("rollback")

        def set_progress_handler(self, callback, steps):
            return self._call("set_progress_handler", callback, steps)

    index._conn = LockedConnection()
    kwargs = {"deadline": float("inf")} if method == "reconcile_channel_batches" else {}
    getattr(index, method)(*args, **kwargs)
    assert unlocked == [], f"connection operations escaped the lock: {unlocked}"
    assert "execute" in calls
    assert "commit" in calls or "rollback" in calls
    if fail_insert and method in {
        "index_session", "index_knowledge_chunk", "replace_knowledge_source",
        "index_channel_messages", "index_channel_batch", "reconcile_channel_batches",
    }:
        assert "rollback" in calls
