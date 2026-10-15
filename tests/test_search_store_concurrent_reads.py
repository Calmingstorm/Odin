"""Concurrent reads on the session vector and knowledge stores' shared connections.

Each store shares one SQLite connection across ``asyncio.to_thread`` callers.
Concurrent reads of the same statement on one connection can hit CPython
3.12's statement-cache race (python/cpython#118172), and a reader can enter
another thread's open write transaction. These tests read through the real
stores from many threads, alone and beside a writer, and require the exact
answer every time.
"""
from __future__ import annotations

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

from src.knowledge.store import KnowledgeStore
from src.search.vectorstore import SessionVectorStore

THREADS = 8
READS = 250


def _hammer(read, check, *, writer=None):
    """Run READS reads on each of THREADS threads; *writer* runs alongside."""
    barrier = threading.Barrier(THREADS + (1 if writer else 0))
    stop = threading.Event()

    def reader():
        barrier.wait(timeout=5)
        for _ in range(READS):
            check(read())

    def write_until_stopped():
        barrier.wait(timeout=5)
        n = 0
        while not stop.is_set():
            writer(n)
            n += 1

    with ThreadPoolExecutor(max_workers=THREADS + 1) as pool:
        background = pool.submit(write_until_stopped) if writer else None
        try:
            for future in [pool.submit(reader) for _ in range(THREADS)]:
                future.result(timeout=60)
        finally:
            stop.set()
        if background is not None:
            background.result(timeout=60)


def test_vector_store_concurrent_reads_stay_exact(tmp_path):
    store = SessionVectorStore(str(tmp_path / "sessions.db"))
    assert store.available
    store._write_session_sync("doc-a", "first archived session", "channel", 1.0, 1, None)

    def read():
        return store._segment_exists_sync("doc-a"), store._get_indexed_ids_sync()

    def check(result):
        exists, ids = result
        assert exists is True
        assert ids == {"doc-a"}

    _hammer(read, check)


def test_vector_store_reads_beside_a_writer_stay_exact(tmp_path):
    store = SessionVectorStore(str(tmp_path / "sessions.db"))
    assert store.available
    store._write_session_sync("doc-a", "first archived session", "channel", 1.0, 1, None)

    def write(n):
        store._write_session_sync(f"doc-{n % 5}", "another archived session",
                                  "channel", 2.0, 1, None)

    def check(result):
        exists, ids = result
        assert exists is True
        assert "doc-a" in ids

    _hammer(lambda: (store._segment_exists_sync("doc-a"), store._get_indexed_ids_sync()),
            check, writer=write)


def _knowledge_store(tmp_path) -> KnowledgeStore:
    store = KnowledgeStore(str(tmp_path / "knowledge.db"))
    assert store.available
    stored = asyncio.run(store.ingest(
        "The release checklist names each step and who owns it.", "checklist.md",
        dedup=False,
    ))
    assert stored > 0
    return store


def test_knowledge_store_concurrent_reads_stay_exact(tmp_path):
    store = _knowledge_store(tmp_path)
    expected_sources = store.list_sources()
    expected_chunks = store.get_source_chunks("checklist.md")
    assert [s["source"] for s in expected_sources] == ["checklist.md"]
    assert expected_chunks

    def read():
        return (store.list_sources(), store.get_source_chunks("checklist.md"),
                store.source_is_durable("checklist.md"))

    def check(result):
        sources, chunks, durable = result
        assert sources == expected_sources
        assert chunks == expected_chunks
        assert durable is True

    _hammer(read, check)


def test_knowledge_store_reads_beside_a_writer_stay_exact(tmp_path):
    store = _knowledge_store(tmp_path)
    expected_chunks = store.get_source_chunks("checklist.md")

    def write(n):
        asyncio.run(store.ingest(f"Note {n % 5}: the deploy waits for an idle turn.",
                                 f"note-{n % 5}.md", dedup=False))

    def check(result):
        sources, chunks = result
        assert "checklist.md" in {s["source"] for s in sources}
        assert chunks == expected_chunks

    _hammer(lambda: (store.list_sources(), store.get_source_chunks("checklist.md")),
            check, writer=write)
