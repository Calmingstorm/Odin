"""A broken embedding model cannot take usable full-text knowledge down with it."""
import asyncio
import logging
from unittest.mock import AsyncMock, Mock

import pytest

from src.knowledge.store import KnowledgeStore
from src.search.errors import InvalidSearchQuery, SearchExecutionError
from src.search.fts import FullTextIndex


@pytest.fixture
async def store(tmp_path):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts)
    assert await store.ingest("quantum searchable notes", "notes.md", dedup=False) == 1
    # Exercise the semantic branch independently of sqlite-vec's availability.
    store._has_vec = True
    yield store
    store.close()
    fts._conn.close()


@pytest.mark.parametrize("failure", [None, RuntimeError("damaged model")])
async def test_embedding_failure_falls_back_to_full_text_once_per_store(store, failure, caplog):
    embedder = Mock()
    embedder.embed = AsyncMock(return_value=None, side_effect=failure)
    with caplog.at_level(logging.WARNING, logger="odin.knowledge"):
        for _ in range(2):
            results = await store.search_hybrid("quantum", embedder, limit=1)
            assert len(results) == 1
            assert results[0]["source"] == "notes.md"
            assert "quantum" in results[0]["content"]
    warnings = [r for r in caplog.records if "Semantic knowledge search failed" in r.message]
    assert len(warnings) == 1
    assert embedder.embed.await_count == 2


async def test_validation_precedes_semantic_or_full_text_search(store):
    embedder = Mock(embed=AsyncMock(return_value=None))
    store._fts.search_knowledge = Mock(side_effect=AssertionError("must validate first"))
    with pytest.raises(InvalidSearchQuery):
        await store.search_hybrid("invalid\x00query", embedder)
    embedder.embed.assert_not_awaited()
    store._fts.search_knowledge.assert_not_called()


async def test_semantic_cancellation_propagates_without_full_text(store, caplog):
    embedder = Mock(embed=AsyncMock(side_effect=asyncio.CancelledError()))
    store._fts.search_knowledge = Mock(side_effect=AssertionError("must not continue"))
    with pytest.raises(asyncio.CancelledError):
        await store.search_hybrid("quantum", embedder)
    store._fts.search_knowledge.assert_not_called()
    assert not any("Semantic knowledge search failed" in r.message for r in caplog.records)


async def test_full_text_failure_is_not_swallowed(store):
    embedder = Mock(embed=AsyncMock(return_value=None))
    store._fts.search_knowledge = Mock(side_effect=SearchExecutionError("fts failed"))
    with pytest.raises(SearchExecutionError, match="fts failed"):
        await store.search_hybrid("quantum", embedder)


async def test_literal_fallback_when_no_full_text_index_is_injected(store):
    store._fts = None
    embedder = Mock(embed=AsyncMock(return_value=None))
    results = await store.search_hybrid("quantum", embedder, limit=1)
    assert results[0]["source"] == "notes.md"
    assert results[0]["type"] == "literal"
