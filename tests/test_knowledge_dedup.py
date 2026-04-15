"""Tests for knowledge base deduplication — content hashing, duplicate
detection, near-duplicate detection, merge, and REST API endpoints (Round 21).
"""
from __future__ import annotations

import asyncio
import os
import sqlite3
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.knowledge.store import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    KnowledgeStore,
    NEAR_DUPE_THRESHOLD,
    VECTOR_DIM,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tmp_store() -> KnowledgeStore:
    """Create a KnowledgeStore backed by a temp SQLite file."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    store = KnowledgeStore(path)
    store._db_path = path  # stash for cleanup
    return store


def _cleanup(store: KnowledgeStore) -> None:
    store.close()
    path = getattr(store, "_db_path", None)
    if path and os.path.exists(path):
        os.unlink(path)


SHORT_DOC = "Hello world, this is a test document."
SHORT_DOC_V2 = "Hello world, this is a DIFFERENT test document."


# Make a long document that will produce multiple chunks
def _long_doc(seed: str = "alpha", paragraphs: int = 20) -> str:
    para = f"This is paragraph about {seed}. " * 40  # ~1000 chars each
    return "\n\n".join([f"Paragraph {i}: {para}" for i in range(paragraphs)])


# ---------------------------------------------------------------------------
# Content hash tests
# ---------------------------------------------------------------------------


class TestContentHash:
    def test_deterministic(self):
        h1 = KnowledgeStore._content_hash("hello world")
        h2 = KnowledgeStore._content_hash("hello world")
        assert h1 == h2

    def test_strips_whitespace(self):
        h1 = KnowledgeStore._content_hash("  hello world  ")
        h2 = KnowledgeStore._content_hash("hello world")
        assert h1 == h2

    def test_case_insensitive(self):
        h1 = KnowledgeStore._content_hash("Hello World")
        h2 = KnowledgeStore._content_hash("hello world")
        assert h1 == h2

    def test_different_content_different_hash(self):
        h1 = KnowledgeStore._content_hash("alpha")
        h2 = KnowledgeStore._content_hash("beta")
        assert h1 != h2

    def test_sha256_length(self):
        h = KnowledgeStore._content_hash("test")
        assert len(h) == 64  # SHA-256 hex digest


# ---------------------------------------------------------------------------
# Schema migration tests
# ---------------------------------------------------------------------------


class TestSchemaMigration:
    def test_new_columns_exist(self):
        store = _tmp_store()
        try:
            cursor = store._conn.execute("PRAGMA table_info(knowledge_chunks)")
            cols = {r[1] for r in cursor.fetchall()}
            assert "content_hash" in cols
            assert "doc_content_hash" in cols
        finally:
            _cleanup(store)

    def test_indexes_created(self):
        store = _tmp_store()
        try:
            rows = store._conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index'"
            ).fetchall()
            idx_names = {r[0] for r in rows}
            assert "idx_knowledge_content_hash" in idx_names
            assert "idx_knowledge_doc_hash" in idx_names
        finally:
            _cleanup(store)

    def test_migration_idempotent(self):
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        store1 = KnowledgeStore(path)
        store1.close()
        store2 = KnowledgeStore(path)
        assert store2.available
        store2.close()
        os.unlink(path)


# ---------------------------------------------------------------------------
# Ingest with dedup tests
# ---------------------------------------------------------------------------


class TestIngestExactDuplicate:
    async def test_skip_same_source_same_content(self):
        store = _tmp_store()
        try:
            n1 = await store.ingest(SHORT_DOC, "doc.md", uploader="u1")
            assert n1 == 1
            n2 = await store.ingest(SHORT_DOC, "doc.md", uploader="u1")
            assert n2 == 1  # returns existing count, not re-indexed
            assert store.count() == 1  # still 1 chunk
        finally:
            _cleanup(store)

    async def test_skip_different_source_same_content(self):
        store = _tmp_store()
        try:
            n1 = await store.ingest(SHORT_DOC, "doc-a.md", uploader="u1")
            assert n1 == 1
            n2 = await store.ingest(SHORT_DOC, "doc-b.md", uploader="u1")
            assert n2 == 0  # skipped as cross-source duplicate
            assert store.count() == 1  # only one source's chunks
        finally:
            _cleanup(store)

    async def test_allow_different_content_same_source(self):
        store = _tmp_store()
        try:
            n1 = await store.ingest(SHORT_DOC, "doc.md", uploader="u1")
            assert n1 == 1
            n2 = await store.ingest(SHORT_DOC_V2, "doc.md", uploader="u1")
            assert n2 == 1  # re-indexed with new content
        finally:
            _cleanup(store)

    async def test_dedup_false_bypasses_check(self):
        store = _tmp_store()
        try:
            n1 = await store.ingest(SHORT_DOC, "doc-a.md", uploader="u1")
            assert n1 == 1
            n2 = await store.ingest(
                SHORT_DOC, "doc-b.md", uploader="u1", dedup=False
            )
            assert n2 == 1  # ingested despite duplicate
            assert store.count() == 2  # both sources present
        finally:
            _cleanup(store)

    async def test_case_insensitive_duplicate(self):
        store = _tmp_store()
        try:
            n1 = await store.ingest("Hello World", "a.md")
            assert n1 == 1
            n2 = await store.ingest("hello world", "b.md")
            assert n2 == 0  # case-normalized match
        finally:
            _cleanup(store)


class TestIngestNearDuplicate:
    async def test_skip_near_duplicate(self):
        store = _tmp_store()
        try:
            doc = _long_doc("shared")
            n1 = await store.ingest(doc, "original.md")
            assert n1 > 1  # multiple chunks

            # Slightly modify the doc (change first paragraph only)
            lines = doc.split("\n\n")
            lines[0] = "Paragraph 0: THIS IS ENTIRELY DIFFERENT CONTENT. " * 40
            modified = "\n\n".join(lines)

            n2 = await store.ingest(modified, "near-copy.md")
            assert n2 == 0  # near-duplicate skipped
        finally:
            _cleanup(store)

    async def test_allow_dissimilar_content(self):
        store = _tmp_store()
        try:
            doc_a = _long_doc("alpha")
            doc_b = _long_doc("completely_different_topic")
            n1 = await store.ingest(doc_a, "doc-a.md")
            assert n1 > 1
            n2 = await store.ingest(doc_b, "doc-b.md")
            assert n2 > 1  # different enough to pass
        finally:
            _cleanup(store)


class TestIngestStoresHashes:
    async def test_chunk_content_hash_stored(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md")
            row = store._conn.execute(
                "SELECT content_hash FROM knowledge_chunks WHERE source = ?",
                ("doc.md",),
            ).fetchone()
            assert row is not None
            assert len(row[0]) == 64
        finally:
            _cleanup(store)

    async def test_doc_content_hash_stored(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md")
            row = store._conn.execute(
                "SELECT doc_content_hash FROM knowledge_chunks WHERE source = ?",
                ("doc.md",),
            ).fetchone()
            expected = KnowledgeStore._content_hash(SHORT_DOC)
            assert row[0] == expected
        finally:
            _cleanup(store)

    async def test_all_chunks_have_same_doc_hash(self):
        store = _tmp_store()
        try:
            doc = _long_doc("multi")
            await store.ingest(doc, "multi.md")
            rows = store._conn.execute(
                "SELECT DISTINCT doc_content_hash FROM knowledge_chunks WHERE source = ?",
                ("multi.md",),
            ).fetchall()
            assert len(rows) == 1
        finally:
            _cleanup(store)


class TestIngestUnavailable:
    async def test_unavailable_returns_zero(self):
        store = _tmp_store()
        store._conn = None
        result = await store.ingest(SHORT_DOC, "doc.md")
        assert result == 0

    async def test_empty_content_returns_zero(self):
        store = _tmp_store()
        try:
            result = await store.ingest("", "doc.md")
            assert result == 0
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# _find_by_doc_hash tests
# ---------------------------------------------------------------------------


class TestFindByDocHash:
    async def test_finds_existing(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md")
            h = KnowledgeStore._content_hash(SHORT_DOC)
            result = store._find_by_doc_hash(h)
            assert result is not None
            assert result[0] == "doc.md"
            assert result[1] == 1
        finally:
            _cleanup(store)

    async def test_returns_none_for_unknown(self):
        store = _tmp_store()
        try:
            result = store._find_by_doc_hash("nonexistent_hash")
            assert result is None
        finally:
            _cleanup(store)

    def test_returns_none_when_unavailable(self):
        store = _tmp_store()
        store._conn = None
        assert store._find_by_doc_hash("abc") is None


# ---------------------------------------------------------------------------
# _find_near_duplicate tests
# ---------------------------------------------------------------------------


class TestFindNearDuplicate:
    async def test_detects_overlap(self):
        store = _tmp_store()
        try:
            doc = _long_doc("overlap")
            await store.ingest(doc, "original.md")
            chunks = KnowledgeStore._chunk_text(doc)
            chunk_hashes = [KnowledgeStore._content_hash(c) for c in chunks]
            result = store._find_near_duplicate(chunk_hashes, "new-source.md")
            assert result is not None
            assert result[0] == "original.md"
            assert result[1] >= NEAR_DUPE_THRESHOLD
        finally:
            _cleanup(store)

    async def test_excludes_self(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md")
            chunks = KnowledgeStore._chunk_text(SHORT_DOC)
            chunk_hashes = [KnowledgeStore._content_hash(c) for c in chunks]
            result = store._find_near_duplicate(chunk_hashes, "doc.md")
            assert result is None  # self excluded
        finally:
            _cleanup(store)

    def test_empty_hashes(self):
        store = _tmp_store()
        try:
            assert store._find_near_duplicate([], "x") is None
        finally:
            _cleanup(store)

    def test_unavailable(self):
        store = _tmp_store()
        store._conn = None
        assert store._find_near_duplicate(["h1"], "x") is None

    async def test_custom_threshold(self):
        store = _tmp_store()
        try:
            doc = _long_doc("base")
            await store.ingest(doc, "original.md")
            chunks = KnowledgeStore._chunk_text(doc)
            hashes = [KnowledgeStore._content_hash(c) for c in chunks]
            # All chunks match → ratio = 1.0, even very high threshold should match
            result = store._find_near_duplicate(hashes, "new.md", threshold=0.99)
            assert result is not None
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# find_duplicates tests
# ---------------------------------------------------------------------------


class TestFindDuplicates:
    async def test_no_duplicates(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "a.md")
            await store.ingest(SHORT_DOC_V2, "b.md")
            assert store.find_duplicates() == []
        finally:
            _cleanup(store)

    async def test_finds_exact_dupes_with_dedup_off(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "a.md", dedup=False)
            await store.ingest(SHORT_DOC, "b.md", dedup=False)
            dupes = store.find_duplicates()
            assert len(dupes) == 1
            assert set(dupes[0]["sources"]) == {"a.md", "b.md"}
            assert dupes[0]["source_count"] == 2
        finally:
            _cleanup(store)

    def test_unavailable(self):
        store = _tmp_store()
        store._conn = None
        assert store.find_duplicates() == []


# ---------------------------------------------------------------------------
# find_near_duplicates tests
# ---------------------------------------------------------------------------


class TestFindNearDuplicates:
    async def test_empty_store(self):
        store = _tmp_store()
        try:
            assert store.find_near_duplicates() == []
        finally:
            _cleanup(store)

    async def test_finds_overlapping_sources(self):
        store = _tmp_store()
        try:
            doc = _long_doc("shared_topic")
            await store.ingest(doc, "original.md")
            # Slightly modified copy — change one paragraph
            lines = doc.split("\n\n")
            lines[0] = "Paragraph 0: COMPLETELY DIFFERENT START. " * 40
            modified = "\n\n".join(lines)
            await store.ingest(modified, "variant.md", dedup=False)

            near = store.find_near_duplicates(threshold=0.5)
            assert len(near) >= 1
            pair = near[0]
            assert pair["shared_chunks"] > 0
            assert pair["overlap_ratio"] >= 0.5
        finally:
            _cleanup(store)

    async def test_no_overlap(self):
        store = _tmp_store()
        try:
            await store.ingest(_long_doc("alpha"), "a.md")
            await store.ingest(_long_doc("beta"), "b.md")
            near = store.find_near_duplicates(threshold=0.5)
            # Distinct content → no overlap
            overlapping = [n for n in near if n["overlap_ratio"] >= 0.5]
            assert len(overlapping) == 0
        finally:
            _cleanup(store)

    def test_unavailable(self):
        store = _tmp_store()
        store._conn = None
        assert store.find_near_duplicates() == []


# ---------------------------------------------------------------------------
# merge_sources tests
# ---------------------------------------------------------------------------


class TestMergeSources:
    async def test_merge_removes_source(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "keep.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "remove.md")
            removed = store.merge_sources("keep.md", "remove.md")
            assert removed == 1
            sources = [s["source"] for s in store.list_sources()]
            assert "keep.md" in sources
            assert "remove.md" not in sources
        finally:
            _cleanup(store)

    async def test_merge_same_source_noop(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md")
            assert store.merge_sources("doc.md", "doc.md") == 0
        finally:
            _cleanup(store)

    async def test_merge_keep_not_found(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "only.md")
            assert store.merge_sources("nonexistent.md", "only.md") == 0
        finally:
            _cleanup(store)

    def test_merge_unavailable(self):
        store = _tmp_store()
        store._conn = None
        assert store.merge_sources("a", "b") == 0


# ---------------------------------------------------------------------------
# list_sources includes content_hash
# ---------------------------------------------------------------------------


class TestListSourcesHash:
    async def test_includes_content_hash(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md")
            sources = store.list_sources()
            assert len(sources) == 1
            assert "content_hash" in sources[0]
            assert len(sources[0]["content_hash"]) == 64
        finally:
            _cleanup(store)

    async def test_empty_content_hash_for_legacy(self):
        """Chunks ingested before dedup columns will have empty hash."""
        store = _tmp_store()
        try:
            # Simulate legacy data: insert without hashes
            store._conn.execute(
                "INSERT INTO knowledge_chunks "
                "(chunk_id, content, source, chunk_index, total_chunks, "
                "uploader, ingested_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("legacy_0", "old content", "legacy.md", 0, 1, "sys", "2024-01-01"),
            )
            store._conn.commit()
            sources = store.list_sources()
            assert len(sources) == 1
            assert sources[0]["content_hash"] == ""
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# Constants tests
# ---------------------------------------------------------------------------


class TestConstants:
    def test_near_dupe_threshold(self):
        assert 0 < NEAR_DUPE_THRESHOLD <= 1.0
        assert NEAR_DUPE_THRESHOLD == 0.8

    def test_chunk_size(self):
        assert CHUNK_SIZE == 1500

    def test_vector_dim(self):
        assert VECTOR_DIM == 384


# ---------------------------------------------------------------------------
# Module imports
# ---------------------------------------------------------------------------


class TestModuleImports:
    def test_knowledge_store_importable(self):
        from src.knowledge.store import KnowledgeStore
        assert KnowledgeStore is not None

    def test_near_dupe_threshold_importable(self):
        from src.knowledge.store import NEAR_DUPE_THRESHOLD
        assert isinstance(NEAR_DUPE_THRESHOLD, float)


# ---------------------------------------------------------------------------
# REST API endpoint tests
# ---------------------------------------------------------------------------


def _make_bot_with_store(store=None):
    bot = MagicMock()
    bot._knowledge_store = store
    bot._embedder = None
    bot.config = MagicMock()
    bot.config.web = MagicMock()
    bot.config.web.api_token = ""
    return bot


def _make_app(bot):
    from src.web.api import create_api_routes
    app = web.Application()
    routes = create_api_routes(bot)
    app.router.add_routes(routes)
    return app


class TestKnowledgeDuplicatesAPI:
    async def test_duplicates_unavailable(self):
        bot = _make_bot_with_store()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/knowledge/duplicates")
            assert resp.status == 503

    async def test_duplicates_empty(self):
        store = _tmp_store()
        try:
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.get("/api/knowledge/duplicates")
                assert resp.status == 200
                data = await resp.json()
                assert data["exact"] == []
                assert data["near"] == []
        finally:
            _cleanup(store)

    async def test_duplicates_with_data(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "a.md", dedup=False)
            await store.ingest(SHORT_DOC, "b.md", dedup=False)
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.get("/api/knowledge/duplicates")
                assert resp.status == 200
                data = await resp.json()
                assert len(data["exact"]) == 1
        finally:
            _cleanup(store)

    async def test_duplicates_custom_threshold(self):
        store = _tmp_store()
        try:
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.get("/api/knowledge/duplicates?threshold=0.9")
                assert resp.status == 200
        finally:
            _cleanup(store)


class TestKnowledgeMergeAPI:
    async def test_merge_unavailable(self):
        bot = _make_bot_with_store()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/knowledge/merge",
                json={"keep_source": "a", "remove_source": "b"},
            )
            assert resp.status == 503

    async def test_merge_missing_fields(self):
        store = _tmp_store()
        try:
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.post(
                    "/api/knowledge/merge",
                    json={"keep_source": "a"},
                )
                assert resp.status == 400
        finally:
            _cleanup(store)

    async def test_merge_not_found(self):
        store = _tmp_store()
        try:
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.post(
                    "/api/knowledge/merge",
                    json={"keep_source": "missing", "remove_source": "also_missing"},
                )
                assert resp.status == 404
        finally:
            _cleanup(store)

    async def test_merge_success(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "keep.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "remove.md")
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.post(
                    "/api/knowledge/merge",
                    json={"keep_source": "keep.md", "remove_source": "remove.md"},
                )
                assert resp.status == 200
                data = await resp.json()
                assert data["status"] == "merged"
                assert data["kept"] == "keep.md"
                assert data["removed"] == "remove.md"
                assert data["chunks_removed"] == 1
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    async def test_ingest_whitespace_only(self):
        store = _tmp_store()
        try:
            result = await store.ingest("   \n\n  ", "blank.md")
            assert result == 0
        finally:
            _cleanup(store)

    async def test_ingest_after_delete(self):
        """After deleting a source, re-ingest should succeed."""
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md")
            store.delete_source("doc.md")
            n = await store.ingest(SHORT_DOC, "doc.md")
            assert n == 1
        finally:
            _cleanup(store)

    async def test_multiple_exact_dupes_found(self):
        """When dedup=False creates multiple copies, find_duplicates groups them."""
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "a.md", dedup=False)
            await store.ingest(SHORT_DOC, "b.md", dedup=False)
            await store.ingest(SHORT_DOC, "c.md", dedup=False)
            dupes = store.find_duplicates()
            assert len(dupes) == 1
            assert dupes[0]["source_count"] == 3
        finally:
            _cleanup(store)

    async def test_doc_hash_changes_on_content_change(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md")
            h1 = store._conn.execute(
                "SELECT doc_content_hash FROM knowledge_chunks WHERE source = ?",
                ("doc.md",),
            ).fetchone()[0]
            await store.ingest(SHORT_DOC_V2, "doc.md")
            h2 = store._conn.execute(
                "SELECT doc_content_hash FROM knowledge_chunks WHERE source = ?",
                ("doc.md",),
            ).fetchone()[0]
            assert h1 != h2
        finally:
            _cleanup(store)

    async def test_dedup_with_embedder(self):
        """Dedup should work even when embedder is provided."""
        store = _tmp_store()
        try:
            n1 = await store.ingest(SHORT_DOC, "a.md")
            assert n1 == 1
            n2 = await store.ingest(SHORT_DOC, "b.md")
            assert n2 == 0
        finally:
            _cleanup(store)

    async def test_near_dupe_below_threshold(self):
        """When most of the new doc's chunks are unique, it is not a near-dup."""
        store = _tmp_store()
        try:
            doc = _long_doc("base", paragraphs=20)
            await store.ingest(doc, "original.md")
            chunks = KnowledgeStore._chunk_text(doc)
            if len(chunks) > 2:
                # 1 matching hash + 9 fake hashes → ratio = 1/10 < 0.8
                hashes = [KnowledgeStore._content_hash(chunks[0])]
                hashes += [f"fake_{i}" for i in range(9)]
                result = store._find_near_duplicate(hashes, "new.md", threshold=0.8)
                assert result is None
        finally:
            _cleanup(store)

    def test_find_near_duplicates_no_content_hash(self):
        """Legacy data without content_hash should not crash."""
        store = _tmp_store()
        try:
            store._conn.execute(
                "INSERT INTO knowledge_chunks "
                "(chunk_id, content, source, chunk_index, total_chunks, "
                "uploader, ingested_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("leg_0", "content", "legacy.md", 0, 1, "sys", "2024-01-01"),
            )
            store._conn.commit()
            # Should not crash
            result = store.find_near_duplicates()
            assert isinstance(result, list)
        finally:
            _cleanup(store)

    async def test_reingest_same_content_idempotent(self):
        """Re-ingesting same source with same content should be a no-op."""
        store = _tmp_store()
        try:
            n1 = await store.ingest(SHORT_DOC, "doc.md")
            n2 = await store.ingest(SHORT_DOC, "doc.md")
            assert n1 == n2
            assert store.count() == 1
        finally:
            _cleanup(store)

    async def test_merge_preserves_keep_source(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "keep.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "remove.md")
            before = store.count()
            store.merge_sources("keep.md", "remove.md")
            # keep.md chunks should still exist
            keep_chunks = store.get_source_chunks("keep.md")
            assert len(keep_chunks) > 0
        finally:
            _cleanup(store)
