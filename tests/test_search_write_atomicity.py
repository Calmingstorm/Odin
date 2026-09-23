"""Gist H4 and M8 — serialized, rollback-safe session writes.

H4: `SessionVectorStore` sent each archive write to the default thread pool
while sharing one ``check_same_thread=False`` connection, with no write lock
and no busy timeout. Overlapping archive/backfill writes could cross
thread-affine transaction state.

M8: `FullTextIndex.index_session` deleted the old row, inserted the
replacement, and committed; its exception path returned False without a
rollback, so a failed insert left the DELETE pending for another writer on the
shared connection to commit — losing the prior searchable row.

Faults are injected at the SQLite boundary through a connection proxy (as in
``tests/test_knowledge_durability_failure_paths.py``), because a real
``sqlite3.Connection`` attribute cannot be patched in place.
"""
from __future__ import annotations

import asyncio
import json
import sqlite3
import threading
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from src.search.fts import FullTextIndex
from src.search.vectorstore import VECTOR_DIM, SessionVectorStore


class _ConnectionProxy:
    """Delegates to a real connection; can inject a fault and count overlap.

    ``overlap`` counts how many callers were inside ``execute`` at once, which
    is the shared resource a missing write lock lets two threads share.
    """

    def __init__(
        self,
        conn,
        *,
        fail_in: str | None = None,
        rollback_fails: bool = False,
        delay: float = 0.0,
    ) -> None:
        self._conn = conn
        self._fail_in = fail_in
        self._rollback_fails = rollback_fails
        self._delay = delay
        self._counter_lock = threading.Lock()
        self.active = 0
        self.overlap = 0
        self.failed = False

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def execute(self, sql, parameters=()):
        if self._fail_in and not self.failed and self._fail_in in sql:
            self.failed = True
            raise sqlite3.OperationalError(f"injected failure: {sql.split()[0]}")
        with self._counter_lock:
            self.active += 1
            self.overlap = max(self.overlap, self.active)
        try:
            if self._delay:
                time.sleep(self._delay)
            return self._conn.execute(sql, parameters)
        finally:
            with self._counter_lock:
                self.active -= 1

    def rollback(self):
        if self._rollback_fails:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database.")
        return self._conn.rollback()


class _Embedder:
    """Deterministic embedder: the vector depends only on the text."""

    async def embed(self, text: str):
        return [float(len(text) % 7 + 1)] * VECTOR_DIM


class _Unlocked:
    """Stand-in for a missing write lock, so the sensitivity probe can run."""

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


def _archive(path: Path, channel_id: str, body: str, messages: int = 2) -> Path:
    path.write_text(json.dumps({
        "channel_id": channel_id,
        "last_active": 1_700_000_000.0,
        "messages": [{"role": "user", "content": f"{body} {i}"} for i in range(messages)],
    }))
    return path


# ---------------------------------------------------------------------------
# H4 — shared connection writers are serialized
# ---------------------------------------------------------------------------


def test_session_writers_never_share_the_connection(tmp_path):
    """Concurrent writers must not enter the shared connection at once.

    The proxy counts callers inside ``execute`` — the shared resource a missing
    write lock lets two threads occupy simultaneously. Its sensitivity is
    asserted in the same test: the same probe against a store with the lock
    replaced by a no-op DOES observe overlap, so a count of one below is
    evidence of locking rather than a blind probe.
    """
    def run_writers(store, count: int) -> list[BaseException]:
        """Drive concurrent writers; return whatever they raised.

        Errors are collected rather than leaked as thread warnings: on the
        unlocked store the contention surfaces as sqlite's "bad parameter or
        other API misuse", the same failure the live 40-ingest stress test
        produced, and that is part of the evidence, not noise.
        """
        errors: list[BaseException] = []

        def writer(i: int) -> None:
            try:
                store._write_session_sync(f"doc{i}", f"body {i}", "ch", float(i), i, None)
            except BaseException as exc:  # noqa: BLE001 — evidence, re-asserted below
                errors.append(exc)

        threads = [threading.Thread(target=writer, args=(i,)) for i in range(count)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        return errors

    store = SessionVectorStore(str(tmp_path / "sessions.db"))
    real_conn = store._conn
    proxy = _ConnectionProxy(real_conn, delay=0.002)
    store._conn = proxy
    try:
        locked_errors = run_writers(store, 12)
    finally:
        store._conn = real_conn
    assert proxy.overlap == 1, f"writers shared the connection: {proxy.overlap}"
    assert locked_errors == [], f"serialized writers still failed: {locked_errors}"

    # Sensitivity: removing the lock reintroduces the overlap the fix prevents.
    unlocked = SessionVectorStore(str(tmp_path / "unlocked.db"))
    unlocked_conn = unlocked._conn
    unlocked_proxy = _ConnectionProxy(unlocked_conn, delay=0.002)
    unlocked._conn = unlocked_proxy
    try:
        with patch.object(unlocked, "_write_lock", _Unlocked()):
            unlocked_errors = run_writers(unlocked, 12)
    finally:
        unlocked._conn = unlocked_conn
    # The unlocked store both overlaps and trips sqlite's API-misuse guard;
    # either proves the probe (and the defect) is real.
    assert unlocked_proxy.overlap > 1 or unlocked_errors, (
        "overlap probe cannot detect an unlocked writer"
    )

    real_conn.close()
    unlocked_conn.close()


async def test_concurrent_async_index_session_writes_every_archive(tmp_path):
    """The real archive path (index_session → to_thread) under concurrency."""
    store = SessionVectorStore(str(tmp_path / "sessions.db"))
    if not store._has_vec:
        pytest.skip("sqlite-vec not available")
    embedder = _Embedder()

    paths = [_archive(tmp_path / f"a{i}.json", f"ch{i}", f"body{i}") for i in range(16)]
    results = await asyncio.gather(*(store.index_session(p, embedder) for p in paths))
    assert all(results)

    (archived,) = store._conn.execute("SELECT COUNT(*) FROM session_archives").fetchone()
    (vectors,) = store._conn.execute("SELECT COUNT(*) FROM session_vec").fetchone()
    (skew,) = store._conn.execute(
        "SELECT COUNT(*) FROM session_archives a WHERE NOT EXISTS "
        "(SELECT 1 FROM session_vec v WHERE v.doc_id = a.doc_id)"
    ).fetchone()
    assert archived == 16
    assert vectors == 16
    assert skew == 0
    store._conn.close()


async def test_backfill_overlap_does_not_cross_transaction_state(tmp_path):
    """Overlapping backfills (the H4 archive/backfill race) stay consistent."""
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()
    for i in range(12):
        _archive(archive_dir / f"s{i}.json", f"ch{i}", f"content{i}")

    store = SessionVectorStore(str(tmp_path / "sessions.db"))
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store._fts = fts
    embedder = _Embedder()

    counts = await asyncio.gather(
        store.backfill(archive_dir, embedder),
        store.backfill(archive_dir, embedder),
        store.backfill(archive_dir, embedder),
    )
    assert sum(counts) >= 12

    (archived,) = store._conn.execute("SELECT COUNT(*) FROM session_archives").fetchone()
    assert archived == 12
    # Both stores hold one row per archive: no metadata/FTS skew.
    (fts_rows,) = fts._conn.execute("SELECT COUNT(*) FROM session_fts").fetchone()
    assert fts_rows == 12
    assert fts.has_session("s0")
    assert fts.search_sessions("content0") != []
    store._conn.close()
    fts._conn.close()


def test_session_store_sets_a_bounded_busy_timeout(tmp_path):
    """Contended locks wait instead of failing immediately."""
    store = SessionVectorStore(str(tmp_path / "sessions.db"))
    (timeout,) = store._conn.execute("PRAGMA busy_timeout").fetchone()
    assert timeout == 30000
    store._conn.close()


def test_failed_session_write_rolls_back_metadata_and_vector(tmp_path):
    """A failed replacement must not leave a partial row behind."""
    store = SessionVectorStore(str(tmp_path / "sessions.db"))
    if not store._has_vec:
        pytest.skip("sqlite-vec not available")

    store._write_session_sync("doc", "first", "ch", 1.0, 1, [0.1] * VECTOR_DIM)
    real_conn = store._conn

    store._conn = _ConnectionProxy(real_conn, fail_in="INSERT INTO session_vec")
    try:
        with pytest.raises(sqlite3.OperationalError, match="injected failure"):
            store._write_session_sync("doc", "second", "ch", 2.0, 5, [0.9] * VECTOR_DIM)
    finally:
        store._conn = real_conn

    # The prior durable row is intact: the REPLACE and the vec DELETE were
    # rolled back together.
    (content,) = real_conn.execute(
        "SELECT content FROM session_archives WHERE doc_id = 'doc'"
    ).fetchone()
    assert content == "first"
    (vec_rows,) = real_conn.execute(
        "SELECT COUNT(*) FROM session_vec WHERE doc_id = 'doc'"
    ).fetchone()
    assert vec_rows == 1
    real_conn.close()


def test_rollback_failure_does_not_mask_the_original_error(tmp_path):
    """A rollback that cannot run must not replace the real failure."""
    store = SessionVectorStore(str(tmp_path / "sessions.db"))
    store._write_session_sync("doc", "first", "ch", 1.0, 1, None)
    real_conn = store._conn

    store._conn = _ConnectionProxy(
        real_conn, fail_in="INSERT OR REPLACE INTO session_archives", rollback_fails=True,
    )
    try:
        with pytest.raises(sqlite3.OperationalError, match="injected failure"):
            store._write_session_sync("doc", "second", "ch", 2.0, 5, None)
    finally:
        store._conn = real_conn
    real_conn.close()


# ---------------------------------------------------------------------------
# M8 — FTS session replacement rolls back on delete/insert failure
# ---------------------------------------------------------------------------


def test_index_session_rolls_back_a_failed_insert(tmp_path):
    """A failed insert must not leave the DELETE pending on the connection."""
    idx = FullTextIndex(str(tmp_path / "fts.db"))
    assert idx.index_session("s1", "original searchable body", "c1", 100.0)
    assert idx.has_session("s1")

    real_conn = idx._conn
    idx._conn = _ConnectionProxy(real_conn, fail_in="INSERT INTO session_fts")
    try:
        assert idx.index_session("s1", "replacement body", "c1", 200.0) is False
    finally:
        idx._conn = real_conn

    # The pending DELETE was rolled back, so the prior row is still searchable
    # even before anything else commits on this connection.
    assert idx.has_session("s1")
    (content,) = real_conn.execute(
        "SELECT content FROM session_fts WHERE doc_id = 's1'"
    ).fetchone()
    assert content == "original searchable body"
    assert idx.search_sessions("original") != []
    real_conn.close()


def test_later_writer_commit_cannot_turn_a_failed_delete_durable(tmp_path):
    """The exact M8 consequence: another writer's commit made the delete stick."""
    idx = FullTextIndex(str(tmp_path / "fts.db"))
    assert idx.index_session("victim", "searchable needle text", "c1", 1.0)

    real_conn = idx._conn
    idx._conn = _ConnectionProxy(real_conn, fail_in="INSERT INTO session_fts")
    try:
        assert idx.index_session("victim", "replacement", "c1", 2.0) is False
    finally:
        idx._conn = real_conn

    # An unrelated writer committing afterwards must not retire the old row.
    assert idx.index_session("other", "unrelated body", "c1", 3.0) is True
    assert idx.has_session("victim")
    assert idx.search_sessions("needle") != []
    real_conn.close()


def test_failed_session_insert_survives_a_sibling_committing_writer(tmp_path):
    """The knowledge-chunk writer on the same connection must not commit it."""
    idx = FullTextIndex(str(tmp_path / "fts.db"))
    assert idx.index_session("session-doc", "needle in session", "c1", 1.0)

    real_conn = idx._conn
    idx._conn = _ConnectionProxy(real_conn, fail_in="INSERT INTO session_fts")
    try:
        assert idx.index_session("session-doc", "replacement body", "c1", 2.0) is False
    finally:
        idx._conn = real_conn

    assert idx.index_knowledge_chunk("k1", "knowledge body", "doc.md", 0) is True
    assert idx.has_session("session-doc")
    (content,) = real_conn.execute(
        "SELECT content FROM session_fts WHERE doc_id = 'session-doc'"
    ).fetchone()
    assert content == "needle in session"
    real_conn.close()


def test_index_session_still_replaces_on_success(tmp_path):
    """The rollback must not change the successful delete-then-insert path."""
    idx = FullTextIndex(str(tmp_path / "fts.db"))
    assert idx.index_session("s1", "first version", "c1", 100.0)
    assert idx.index_session("s1", "second version", "c1", 101.0)
    assert idx.search_sessions("first") == []
    results = idx.search_sessions("second")
    assert len(results) == 1
    idx._conn.close()


def test_fts_rollback_failure_does_not_mask_the_original_error(tmp_path):
    """A rollback that cannot run must not replace the real failure."""
    idx = FullTextIndex(str(tmp_path / "fts.db"))
    assert idx.index_session("s1", "body", "c1", 1.0)

    real_conn = idx._conn
    idx._conn = _ConnectionProxy(
        real_conn, fail_in="INSERT INTO session_fts", rollback_fails=True,
    )
    try:
        # Still the documented False contract, not a leaked rollback error.
        assert idx.index_session("s1", "replacement", "c1", 2.0) is False
    finally:
        idx._conn = real_conn
    real_conn.close()


def test_closed_connection_still_returns_false(tmp_path):
    """Existing error-arm contract for a dead connection is unchanged."""
    idx = FullTextIndex(str(tmp_path / "fts.db"))
    idx.index_session("s1", "content", "c1", 1.0)
    idx._conn.close()
    assert idx.index_session("s2", "x", "c1", 1.0) is False


def test_channel_batch_failure_rolls_back_through_the_helper(tmp_path):
    """The channel-batch error arm uses the same logged, non-masking rollback."""
    idx = FullTextIndex(str(tmp_path / "fts.db"))
    assert idx.index_channel_messages([
        {"content": "kept row", "author": "a", "channel_id": "c1", "ts": 1.0},
    ]) == 1

    real_conn = idx._conn
    idx._conn = _ConnectionProxy(real_conn, fail_in="INSERT INTO channel_log_fts")
    try:
        ack = idx.index_channel_batch(
            [{"content": "new row", "author": "b", "channel_id": "c2", "ts": 2.0}],
        )
    finally:
        idx._conn = real_conn

    assert ack.status == "error"
    # The prior committed rows survived the rolled-back batch.
    assert idx.search_channel_logs("kept") != []
    real_conn.close()


def test_remove_channel_message_rolls_back_through_the_helper(tmp_path):
    """The identity-scoped delete path also rolls back via the helper."""
    idx = FullTextIndex(str(tmp_path / "fts.db"))
    idx.index_channel_batch(
        [{"content": "alpha body", "author": "a", "channel_id": "c1", "ts": 1.0,
          "message_id": "m1"}],
        channel_id="c1", cursor_identity="m1",
    )
    assert idx.search_channel_logs("alpha") != []

    real_conn = idx._conn
    idx._conn = _ConnectionProxy(real_conn, fail_in="DELETE FROM channel_log_fts")
    try:
        assert idx.remove_channel_message("c1", "m1") is False
    finally:
        idx._conn = real_conn

    # The rollback kept the identity row and its searchable text.
    assert idx.search_channel_logs("alpha") != []
    real_conn.close()
