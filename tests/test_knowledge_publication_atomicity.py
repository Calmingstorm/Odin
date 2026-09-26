"""#402/#403: a knowledge ingest publishes DB rows, vectors, FTS rows and the
version snapshot together, or nothing. Faults are injected at the SQLite
connection boundary (the same boundary before and after the fix)."""
from __future__ import annotations

import asyncio
import sqlite3
import threading

import pytest

from src.knowledge.store import CHUNK_SIZE, VECTOR_DIM, KnowledgeStore
from src.search.fts import FullTextIndex


class _Proxy:
    def __init__(self, conn):
        self.conn = conn

    def __getattr__(self, name):
        return getattr(self.conn, name)


class _FailNthExecute(_Proxy):
    """Raise on the n-th execute whose SQL contains needle (1-based)."""

    def __init__(self, conn, needle, n):
        super().__init__(conn)
        self.needle, self.n, self.seen = needle, n, 0

    def execute(self, sql, parameters=()):
        if self.needle in sql:
            self.seen += 1
            if self.seen == self.n:
                raise sqlite3.OperationalError("injected FTS write failure")
        return self.conn.execute(sql, parameters)


class _FailCommitOnce(_Proxy):
    failed = False

    def commit(self):
        if not self.failed:
            self.failed = True
            raise sqlite3.OperationalError("injected commit failure")
        return self.conn.commit()


def _doc(tag: str, parts: int = 3) -> str:
    """A document that chunks into `parts` chunks, each carrying a unique tag word."""
    body = []
    for i in range(parts):
        words = " ".join(f"{tag}{i}w{j}" for j in range(CHUNK_SIZE // 12))
        body.append(f"{tag} part{i} {words}"[: CHUNK_SIZE - 20])
    return "\n\n".join(body)


class _Embedder:
    async def embed(self, _content):
        return [0.1] * VECTOR_DIM


@pytest.fixture
def stores(tmp_path):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts_index=fts)
    yield store, fts
    store.close()
    fts._conn.close()


def _fail_fts_insert(fts, n=2):
    real = fts._conn
    fts._conn = _FailNthExecute(real, "INSERT INTO knowledge_fts", n)
    return lambda: setattr(fts, "_conn", real)


async def _sources(store, query):
    return [hit["source"] for hit in await store.search_hybrid(query, None, limit=10)]


async def test_failed_initial_ingest_leaves_nothing_searchable(stores):
    store, fts = stores
    doc = _doc("orphanword")
    assert len(store._chunk_text(doc)) == 3
    restore = _fail_fts_insert(fts)
    outcome = await store.ingest(doc, "orphan.md")
    restore()
    assert outcome.status == "failure"
    assert store.list_sources() == []
    assert fts.count_knowledge_source("orphan.md") == 0
    assert await _sources(store, "orphanword") == []
    # the name is not jammed: a retry stores it and delete removes it
    assert (await store.ingest(doc, "orphan.md")).status == "stored"
    assert await store.delete_source_async("orphan.md") == 3
    assert await _sources(store, "orphanword") == []


async def test_failed_replacement_keeps_old_document_whole(stores):
    store, fts = stores
    v1, v2 = _doc("versionone"), _doc("versiontwo")
    assert (await store.ingest(v1, "doc.md")).status == "stored"
    restore = _fail_fts_insert(fts)
    outcome = await store.ingest(v2, "doc.md")
    restore()
    assert outcome.status == "failure"
    assert await _sources(store, "versiontwo") == []
    assert set(await _sources(store, "versionone")) == {"doc.md"}
    assert store.source_is_durable("doc.md", expected_chunks=3)
    assert store.get_source_snapshot("doc.md") == v1
    assert (await store.ingest(v1, "doc.md")).status == "unchanged"
    assert await store.delete_source_async("doc.md") == 3


async def test_replacement_without_embeddings_retires_old_vectors(stores):
    store, _fts = stores
    if not store._has_vec:
        pytest.skip("sqlite-vec unavailable")
    assert (await store.ingest("vector version one", "vectors.md", _Embedder())).status == "stored"
    before = store._conn.execute("SELECT count(*) FROM knowledge_vec").fetchone()[0]
    assert before == 1
    assert (await store.ingest("vector version two", "vectors.md")).status == "stored"
    assert store._conn.execute("SELECT count(*) FROM knowledge_vec").fetchone()[0] == 0
    assert store.source_is_durable("vectors.md", expected_chunks=1)


async def test_db_commit_failure_after_fts_publish_is_compensated(stores):
    store, fts = stores
    real = store._conn
    store._conn = _FailCommitOnce(real)
    try:
        outcome = await store.ingest(_doc("commitword"), "c.md")
    finally:
        store._conn = real
    assert outcome.status == "failure"
    assert fts.count_knowledge_source("c.md") == 0
    assert await _sources(store, "commitword") == []


async def test_existing_orphan_rows_are_removed_by_delete_ingest_and_startup(stores):
    """Installs that already carry leftovers from a failed ingest (pre-fix)."""
    store, fts = stores
    # leftovers of three past failures: no DB rows own these FTS rows
    for i, name in enumerate(("gone.md", "reused.md", "untouched.md")):
        assert fts.index_knowledge_chunk(f"stale{i}_0_x", f"leftoverword {name}", name, 0)
    # (1) deleting the name removes its leftovers (master: "No document found")
    assert await store.delete_source_async("gone.md") == 1
    assert fts.count_knowledge_source("gone.md") == 0
    # (2) a new ingest of the name replaces them (master: failure, name jammed)
    assert (await store.ingest("fresh reused body", "reused.md")).status == "stored"
    assert fts.count_knowledge_source("reused.md") == 1
    # (3) the startup reconciliation removes leftovers of names nobody touches
    await store.backfill_fts_async()
    assert fts.count_knowledge_source("untouched.md") == 0
    assert await _sources(store, "leftoverword") == []
    assert store.source_is_durable("reused.md", expected_chunks=1)


async def test_version_failure_fails_the_ingest_and_retry_repairs(stores):
    store, _fts = stores
    assert (await store.ingest("original text body", "notes.md")).status == "stored"
    store._conn.execute(
        "CREATE TRIGGER block_versions BEFORE INSERT ON knowledge_versions "
        "WHEN NEW.source = 'notes.md' BEGIN SELECT RAISE(ABORT, 'injected version fault'); END"
    )
    store._conn.commit()
    outcome = await store.ingest("replacement text body", "notes.md")
    assert outcome.status == "failure"
    assert store.get_source_content("notes.md") == "original text body"
    assert store.get_source_snapshot("notes.md") == "original text body"
    store._conn.execute("DROP TRIGGER block_versions")
    store._conn.commit()
    assert (await store.ingest("replacement text body", "notes.md")).status == "stored"
    assert store.get_source_snapshot("notes.md") == "replacement text body"


async def test_missing_snapshot_is_repaired_by_same_content_ingest(stores):
    """A store damaged before the fix: current chunks, no current version row."""
    store, _fts = stores
    assert (await store.ingest("original text body", "notes.md")).status == "stored"
    store._conn.execute("DELETE FROM knowledge_versions WHERE source = 'notes.md'")
    store._conn.commit()
    assert store.get_source_snapshot("notes.md") is None
    assert (await store.ingest("original text body", "notes.md")).status == "stored"
    assert store.get_source_snapshot("notes.md") == "original text body"
    assert (await store.ingest("original text body", "notes.md")).status == "unchanged"


async def test_cancelled_ingest_still_records_its_version(stores, monkeypatch):
    store, _fts = stores
    assert (await store.ingest("original text body", "notes.md")).status == "stored"
    entered, release = threading.Event(), threading.Event()
    real = store._write_chunks_sync

    def gated(*args, **kwargs):
        entered.set()
        release.wait(5)
        return real(*args, **kwargs)

    monkeypatch.setattr(store, "_write_chunks_sync", gated)
    task = asyncio.create_task(store.ingest("replacement text body", "notes.md"))
    await asyncio.to_thread(entered.wait, 5)
    task.cancel()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    for _ in range(100):  # let an orphaned worker (pre-fix) finish too
        if not store._write_lock.locked():
            break
        await asyncio.sleep(0.01)
    await asyncio.sleep(0.2)
    assert store.get_source_snapshot("notes.md") in {"original text body", "replacement text body"}
    assert store.get_source_snapshot("notes.md") == store.get_source_content("notes.md")


def test_record_version_failure_leaves_no_pending_row(stores):
    store, _fts = stores
    real = store._conn
    store._conn = _FailCommitOnce(real)
    try:
        assert store._record_version("a.md", "h", "body", 1, "u", "delete", "deleted") == 0
    finally:
        store._conn = real
    assert not store._conn.in_transaction
    assert store._record_version("b.md", "h2", "b", 1, "u", "create") == 1
    assert store.get_versions("a.md") == []
