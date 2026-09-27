"""Knowledge backfill must not delete FTS rows when inventory is unreadable."""

import pytest

from src.knowledge.store import KnowledgeStore
from src.search.errors import SearchExecutionError
from src.search.fts import FullTextIndex


def test_backfill_does_not_delete_rows_when_inventory_fails(tmp_path, monkeypatch):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts)
    assert fts.index_knowledge_chunk("unowned", "keep until inventory works", "old", 0)
    monkeypatch.setattr(fts, "knowledge_chunk_sources", lambda: None)
    monkeypatch.setattr(
        fts, "delete_knowledge_chunks", lambda *_: pytest.fail("deleted without inventory")
    )
    assert store.backfill_fts() == 0
    assert fts.has_knowledge_chunk("unowned")


def test_backfill_unavailable_and_unreadable_metadata_leave_fts_intact(tmp_path):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts)
    assert fts.index_knowledge_chunk("orphan", "still present", "source", 0)
    store._conn.close()
    assert store.backfill_fts() == 0
    assert fts.has_knowledge_chunk("orphan")
    store._conn = None
    assert store.backfill_fts() == 0
    assert fts.has_knowledge_chunk("orphan")


class _FailedVersionConnection:
    def __init__(self, real, *, rollback_fails=False):
        self.real = real
        self.rolled_back = False
        self.rollback_fails = rollback_fails

    def execute(self, *args, **kwargs):
        raise OSError("synthetic version write failure")

    def rollback(self):
        self.rolled_back = True
        if self.rollback_fails:
            raise OSError("synthetic rollback failure")
        self.real.rollback()


def test_failed_version_write_rolls_back_and_leaves_history_empty(tmp_path):
    store = KnowledgeStore(str(tmp_path / "knowledge.db"))
    connection = store._conn
    fake = _FailedVersionConnection(connection)
    store._conn = fake
    assert store._record_version("source", "hash", "content", 1, "test", "ingest") == 0
    assert fake.rolled_back
    store._conn = connection
    assert store.get_versions("source") == []


def test_version_write_failure_preserves_original_error_if_rollback_fails(tmp_path):
    store = KnowledgeStore(str(tmp_path / "knowledge.db"))
    connection = store._conn
    fake = _FailedVersionConnection(connection, rollback_fails=True)
    store._conn = fake
    assert store._record_version("source", "hash", "content", 1, "test", "ingest") == 0
    assert fake.rolled_back
    store._conn = connection
    assert store.get_versions("source") == []


@pytest.mark.asyncio
async def test_hybrid_search_refuses_unavailable_store_even_with_fts(tmp_path):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts)
    store.close()
    with pytest.raises(SearchExecutionError, match="knowledge store is unavailable"):
        await store.search_hybrid("searchable")
