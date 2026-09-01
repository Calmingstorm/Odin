"""Canonical identity pins for semantic and hybrid search results."""
from __future__ import annotations

import hashlib
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.knowledge.store import KnowledgeStore
from src.search.fts import FullTextIndex
from src.search.vectorstore import SessionVectorStore


def _embedder():
    return SimpleNamespace(embed=AsyncMock(return_value=[0.1] * 384))


async def test_session_fractional_timestamp_fuses_on_filename_doc_id(tmp_path):
    archive = tmp_path / "channel_1700000000.json"
    archive.write_text(json.dumps({
        "channel_id": "channel",
        "last_active": 1700000000.25,
        "messages": [{"role": "user", "content": "needle"}],
    }))
    fts = FullTextIndex(str(tmp_path / "session-fts.db"))
    store = SessionVectorStore(str(tmp_path / "sessions.db"), fts_index=fts)
    if not store._has_vec:
        pytest.skip("sqlite-vec not available")
    embedder = _embedder()
    assert await store.index_session(archive, embedder) is True

    results = await store.search_hybrid("needle", embedder, limit=5)

    assert len(results) == 1
    assert results[0]["doc_id"] == archive.stem
    assert results[0]["timestamp"] == 1700000000.25
    assert results[0]["rrf_score"] == round(2 / 61, 6)
    store._conn.close()
    fts._conn.close()


async def test_knowledge_hash_chunk_id_fuses_both_lists_with_summed_score(tmp_path):
    source = "runbook.md"
    fts = FullTextIndex(str(tmp_path / "knowledge-fts.db"))
    store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts_index=fts)
    if not store._has_vec:
        pytest.skip("sqlite-vec not available")
    embedder = _embedder()
    assert await store.ingest("needle body", source, embedder=embedder) == 1

    results = await store.search_hybrid("needle", embedder, limit=5)

    expected_id = f"{hashlib.md5(source.encode()).hexdigest()[:8]}_0"
    assert expected_id != f"{source}_0"
    assert len(results) == 1
    assert results[0]["chunk_id"] == expected_id
    assert results[0]["rrf_score"] == round(2 / 61, 6)
    store.close()
    fts._conn.close()


async def test_missing_semantic_identity_is_never_reconstructed():
    store = object.__new__(SessionVectorStore)
    store._conn = MagicMock()
    store._has_vec = True
    store._fts = None
    store.search = AsyncMock(return_value=[{
        "channel_id": "channel", "timestamp": 1.25, "content": "body"
    }])

    with pytest.raises(Exception, match="missing required identity"):
        await store.search_hybrid("needle", MagicMock(), limit=5)
