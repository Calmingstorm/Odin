"""Inventory failures must not be mistaken for an empty FTS index."""

from src.search.fts import FullTextIndex


def test_knowledge_inventory_distinguishes_absent_store_from_empty_store(tmp_path):
    index = FullTextIndex(str(tmp_path / "fts.db"))
    assert index.knowledge_chunk_sources() == []
    assert index.index_knowledge_chunk("id", "searchable text", "source", 0)
    assert index.knowledge_chunk_sources() == [("id", "source")]
    index._conn = None
    assert index.knowledge_chunk_sources() is None


def test_knowledge_inventory_read_failure_is_not_reported_as_empty(tmp_path):
    index = FullTextIndex(str(tmp_path / "fts.db"))
    assert index.index_knowledge_chunk("id", "searchable text", "source", 0)
    index._conn.close()
    assert index.knowledge_chunk_sources() is None


def test_replace_knowledge_source_refuses_unavailable_store(tmp_path):
    index = FullTextIndex(str(tmp_path / "fts.db"))
    index._conn = None
    assert index.replace_knowledge_source("source", [("id", "text", 0)]) is False
