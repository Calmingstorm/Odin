"""Backfill scales with inventory, batches atomically, and verifies durable writes."""
import sqlite3
import time
from unittest.mock import Mock

import pytest

from src.knowledge.store import KnowledgeStore
from src.search.fts import FullTextIndex


def _fixture(tmp_path, count=3):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts)
    rows = [(f"chunk-{i}", "searchable text", "source", i) for i in range(count)]
    store._conn.executemany(
        "INSERT INTO knowledge_chunks "
        "(chunk_id, content, source, chunk_index, total_chunks, ingested_at) "
        "VALUES (?, ?, ?, ?, ?, '2026-10-11')",
        [(*row, count) for row in rows],
    )
    store._conn.commit()
    return store, fts, rows


def test_backfill_uses_inventory_not_per_chunk_scans(tmp_path, monkeypatch):
    store, fts, _ = _fixture(tmp_path)
    assert fts.index_knowledge_chunk("chunk-0", "old text", "source", 0)
    assert fts.index_knowledge_chunk("orphan", "unowned text", "old", 0)
    inventory = Mock(wraps=fts.knowledge_chunk_sources)
    monkeypatch.setattr(fts, "knowledge_chunk_sources", inventory)
    monkeypatch.setattr(fts, "has_knowledge_chunk", lambda *_: pytest.fail("per-row scan"))
    assert store.backfill_fts() == 2
    assert inventory.call_count == 2
    assert set(fts.knowledge_chunk_sources()) == {
        ("chunk-0", "source"), ("chunk-1", "source"), ("chunk-2", "source"),
    }
    assert fts.search_knowledge("old")[0]["chunk_id"] == "chunk-0"


def test_backfill_failed_batch_falls_back_and_verifies_only_successful_rows(tmp_path, monkeypatch):
    store, fts, _ = _fixture(tmp_path)
    monkeypatch.setattr(fts, "index_absent_knowledge_chunks", Mock(return_value=0))
    original = fts.index_knowledge_chunk
    writes = []

    def partial(chunk_id, *args):
        writes.append(chunk_id)
        if chunk_id == "chunk-1":
            return False
        if chunk_id == "chunk-2":
            return True  # A dishonest acknowledgment must not inflate the count.
        return original(chunk_id, *args)

    monkeypatch.setattr(fts, "index_knowledge_chunk", partial)
    assert store.backfill_fts() == 1
    assert writes == ["chunk-0", "chunk-1", "chunk-2"]
    assert fts.knowledge_chunk_sources() == [("chunk-0", "source")]


def test_successful_batch_does_not_use_replacement_path(tmp_path, monkeypatch):
    store, fts, rows = _fixture(tmp_path)
    batch = Mock(wraps=fts.index_absent_knowledge_chunks)
    monkeypatch.setattr(fts, "index_absent_knowledge_chunks", batch)
    monkeypatch.setattr(fts, "index_knowledge_chunk", lambda *_: pytest.fail("per-row write"))
    assert store.backfill_fts() == 3
    batch.assert_called_once_with(rows)
    assert store.backfill_fts() == 0
    assert batch.call_count == 1


def test_backfill_count_requires_readable_confirmation(tmp_path, monkeypatch):
    store, fts, _ = _fixture(tmp_path)
    monkeypatch.setattr(fts, "knowledge_chunk_sources", Mock(side_effect=[[], None]))
    assert store.backfill_fts() == 0


class _FailingBatchConnection:
    """Fail after executing the first insert, not before the transaction starts."""

    def __init__(self, real):
        self.real = real
        self.rolled_back = False

    def executemany(self, sql, rows):
        self.real.execute(sql, next(iter(rows)))
        raise sqlite3.OperationalError("synthetic mid-batch failure")

    def commit(self):
        pytest.fail("must not commit a failed batch")

    def rollback(self):
        self.rolled_back = True
        self.real.rollback()


def test_batch_failure_rolls_back_every_insert_before_row_fallback(tmp_path):
    store, fts, rows = _fixture(tmp_path)
    real = fts._conn
    failing = _FailingBatchConnection(real)
    fts._conn = failing
    try:
        assert fts.index_absent_knowledge_chunks(rows) == 0
    finally:
        fts._conn = real
    assert failing.rolled_back
    assert fts.knowledge_chunk_sources() == []
    assert store.backfill_fts() == 3
    assert len(fts.knowledge_chunk_sources()) == 3


def test_batch_unavailable_and_empty_are_noops(tmp_path):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    assert fts.index_absent_knowledge_chunks([]) == 0
    fts._conn.close()
    fts._conn = None
    assert fts.index_absent_knowledge_chunks([("id", "text", "source", 0)]) == 0


def test_twenty_thousand_indexed_chunks_reconcile_under_one_second(tmp_path, monkeypatch):
    store, fts, rows = _fixture(tmp_path, 20_000)
    assert fts.index_absent_knowledge_chunks(rows) == 20_000
    monkeypatch.setattr(fts, "has_knowledge_chunk", lambda *_: pytest.fail("per-row scan"))
    started = time.perf_counter()
    assert store.backfill_fts() == 0
    elapsed = time.perf_counter() - started
    print(f"20,000 indexed chunks, no-op reconciliation: {elapsed:.4f}s")
    assert elapsed < 1.0
