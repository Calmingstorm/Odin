"""Tests for knowledge base versioning — edit history per entry with audit
trail (Round 22).
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

from src.knowledge.store import KnowledgeStore


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tmp_store() -> KnowledgeStore:
    """Create a KnowledgeStore backed by a temp SQLite file."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    store = KnowledgeStore(path)
    store._db_path = path
    return store


def _cleanup(store: KnowledgeStore) -> None:
    store.close()
    path = getattr(store, "_db_path", None)
    if path and os.path.exists(path):
        os.unlink(path)


SHORT_DOC = "Hello world, this is a test document for versioning."
SHORT_DOC_V2 = "Hello world, this is version TWO of the document."
SHORT_DOC_V3 = "Hello world, this is version THREE of the document with extra content."


# ---------------------------------------------------------------------------
# Schema tests
# ---------------------------------------------------------------------------


class TestVersionsSchema:
    def test_versions_table_exists(self):
        store = _tmp_store()
        try:
            tables = store._conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_versions'"
            ).fetchall()
            assert len(tables) == 1
        finally:
            _cleanup(store)

    def test_versions_index_exists(self):
        store = _tmp_store()
        try:
            indexes = store._conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index' "
                "AND name='idx_knowledge_versions_source'"
            ).fetchall()
            assert len(indexes) == 1
        finally:
            _cleanup(store)

    def test_schema_migration_idempotent(self):
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        store1 = KnowledgeStore(path)
        store1.close()
        store2 = KnowledgeStore(path)
        tables = store2._conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_versions'"
        ).fetchall()
        assert len(tables) == 1
        store2.close()
        os.unlink(path)


# ---------------------------------------------------------------------------
# _record_version tests
# ---------------------------------------------------------------------------


class TestRecordVersion:
    def test_records_version(self):
        store = _tmp_store()
        try:
            v = store._record_version(
                "doc.md", "abc123", "content here", 3, "user1", "create", "initial"
            )
            assert v == 1
            row = store._conn.execute(
                "SELECT * FROM knowledge_versions WHERE source = ?", ("doc.md",)
            ).fetchone()
            assert row is not None
        finally:
            _cleanup(store)

    def test_auto_increments_version(self):
        store = _tmp_store()
        try:
            v1 = store._record_version("doc.md", "h1", "c1", 1, "u", "create")
            v2 = store._record_version("doc.md", "h2", "c2", 2, "u", "update")
            assert v1 == 1
            assert v2 == 2
        finally:
            _cleanup(store)

    def test_independent_version_per_source(self):
        store = _tmp_store()
        try:
            v1 = store._record_version("a.md", "h1", "c1", 1, "u", "create")
            v2 = store._record_version("b.md", "h2", "c2", 1, "u", "create")
            assert v1 == 1
            assert v2 == 1
        finally:
            _cleanup(store)

    def test_unavailable_returns_zero(self):
        store = _tmp_store()
        store._conn = None
        assert store._record_version("x", "h", "c", 1, "u", "create") == 0

    def test_stores_content_snapshot(self):
        store = _tmp_store()
        try:
            store._record_version("doc.md", "h1", "full content here", 1, "u", "create")
            row = store._conn.execute(
                "SELECT content FROM knowledge_versions WHERE source = ?", ("doc.md",)
            ).fetchone()
            assert row[0] == "full content here"
        finally:
            _cleanup(store)

    def test_stores_null_content_for_delete(self):
        store = _tmp_store()
        try:
            store._record_version("doc.md", "h1", None, 0, "u", "delete", "deleted")
            row = store._conn.execute(
                "SELECT content FROM knowledge_versions WHERE source = ?", ("doc.md",)
            ).fetchone()
            assert row[0] is None
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# _make_diff_summary tests
# ---------------------------------------------------------------------------


class TestMakeDiffSummary:
    def test_initial_version(self):
        store = _tmp_store()
        try:
            result = store._make_diff_summary(None, "new content")
            assert result == "initial version"
        finally:
            _cleanup(store)

    def test_deleted(self):
        store = _tmp_store()
        try:
            result = store._make_diff_summary("old content", None)
            assert result == "deleted"
        finally:
            _cleanup(store)

    def test_no_changes(self):
        store = _tmp_store()
        try:
            result = store._make_diff_summary("same", "same")
            assert result == "no content changes"
        finally:
            _cleanup(store)

    def test_lines_added(self):
        store = _tmp_store()
        try:
            result = store._make_diff_summary("line1\n", "line1\nline2\nline3\n")
            assert "+" in result
            assert "lines" in result
        finally:
            _cleanup(store)

    def test_lines_removed(self):
        store = _tmp_store()
        try:
            result = store._make_diff_summary("line1\nline2\nline3\n", "line1\n")
            assert "-" in result
            assert "lines" in result
        finally:
            _cleanup(store)

    def test_mixed_changes(self):
        store = _tmp_store()
        try:
            result = store._make_diff_summary("line1\nline2", "line1\nline3\nline4")
            assert "+" in result
            assert "-" in result
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# Version recording on ingest
# ---------------------------------------------------------------------------


class TestIngestVersionRecording:
    async def test_create_records_version(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            versions = store.get_versions("doc.md")
            assert len(versions) == 1
            assert versions[0]["action"] == "create"
            assert versions[0]["version"] == 1
            assert versions[0]["uploader"] == "system"
        finally:
            _cleanup(store)

    async def test_update_records_version(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            versions = store.get_versions("doc.md")
            assert len(versions) == 2
            assert versions[0]["action"] == "update"
            assert versions[0]["version"] == 2
            assert versions[1]["action"] == "create"
            assert versions[1]["version"] == 1
        finally:
            _cleanup(store)

    async def test_version_stores_content_hash(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            versions = store.get_versions("doc.md")
            assert len(versions[0]["content_hash"]) == 64
        finally:
            _cleanup(store)

    async def test_version_records_chunk_count(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            versions = store.get_versions("doc.md")
            assert versions[0]["chunk_count"] == 1
        finally:
            _cleanup(store)

    async def test_version_diff_summary_initial(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            versions = store.get_versions("doc.md")
            assert versions[0]["diff_summary"] == "initial version"
        finally:
            _cleanup(store)

    async def test_version_diff_summary_update(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            versions = store.get_versions("doc.md")
            v2 = versions[0]
            assert v2["diff_summary"] != "initial version"
            assert "lines" in v2["diff_summary"]
        finally:
            _cleanup(store)

    async def test_preserves_uploader(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", uploader="web-api", dedup=False)
            versions = store.get_versions("doc.md")
            assert versions[0]["uploader"] == "web-api"
        finally:
            _cleanup(store)

    async def test_multiple_versions(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V3, "doc.md", dedup=False)
            versions = store.get_versions("doc.md")
            assert len(versions) == 3
            assert [v["version"] for v in versions] == [3, 2, 1]
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# Version recording on delete
# ---------------------------------------------------------------------------


class TestDeleteVersionRecording:
    async def test_delete_records_version(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            store.delete_source("doc.md")
            versions = store.get_versions("doc.md")
            assert len(versions) == 2
            delete_ver = versions[0]
            assert delete_ver["action"] == "delete"
            assert delete_ver["diff_summary"] == "deleted"
        finally:
            _cleanup(store)

    async def test_delete_version_has_no_content(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            store.delete_source("doc.md")
            ver = store.get_version("doc.md", 2)
            assert ver is not None
            assert ver["content"] is None
        finally:
            _cleanup(store)

    async def test_delete_zero_chunk_count(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            store.delete_source("doc.md")
            ver = store.get_version("doc.md", 2)
            assert ver["chunk_count"] == 0
        finally:
            _cleanup(store)

    def test_delete_nonexistent_no_version(self):
        store = _tmp_store()
        try:
            store.delete_source("nonexistent.md")
            versions = store.get_versions("nonexistent.md")
            assert len(versions) == 0
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# get_versions tests
# ---------------------------------------------------------------------------


class TestGetVersions:
    def test_empty_for_unknown_source(self):
        store = _tmp_store()
        try:
            assert store.get_versions("nope.md") == []
        finally:
            _cleanup(store)

    def test_unavailable_returns_empty(self):
        store = _tmp_store()
        store._conn = None
        assert store.get_versions("x") == []

    async def test_returns_descending_order(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            versions = store.get_versions("doc.md")
            assert versions[0]["version"] > versions[1]["version"]
        finally:
            _cleanup(store)

    async def test_excludes_content_field(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            versions = store.get_versions("doc.md")
            assert "content" not in versions[0]
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# get_version tests
# ---------------------------------------------------------------------------


class TestGetVersion:
    async def test_returns_specific_version(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            ver = store.get_version("doc.md", 1)
            assert ver is not None
            assert ver["version"] == 1
            assert ver["action"] == "create"
        finally:
            _cleanup(store)

    async def test_includes_content(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            ver = store.get_version("doc.md", 1)
            assert ver["content"] == SHORT_DOC
        finally:
            _cleanup(store)

    def test_returns_none_for_missing(self):
        store = _tmp_store()
        try:
            assert store.get_version("nope.md", 1) is None
        finally:
            _cleanup(store)

    async def test_returns_none_for_wrong_version(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            assert store.get_version("doc.md", 99) is None
        finally:
            _cleanup(store)

    def test_unavailable_returns_none(self):
        store = _tmp_store()
        store._conn = None
        assert store.get_version("x", 1) is None

    async def test_old_version_preserved_after_update(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            v1 = store.get_version("doc.md", 1)
            v2 = store.get_version("doc.md", 2)
            assert v1["content"] == SHORT_DOC
            assert v2["content"] == SHORT_DOC_V2
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# get_version_diff tests
# ---------------------------------------------------------------------------


class TestGetVersionDiff:
    async def test_diff_between_versions(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            diff = store.get_version_diff("doc.md", 1, 2)
            assert diff is not None
            assert diff["source"] == "doc.md"
            assert diff["from_version"] == 1
            assert diff["to_version"] == 2
            assert "diff" in diff
            assert isinstance(diff["lines_added"], int)
            assert isinstance(diff["lines_removed"], int)
        finally:
            _cleanup(store)

    async def test_diff_contains_unified_format(self):
        store = _tmp_store()
        try:
            await store.ingest("line1\nline2", "doc.md", dedup=False)
            await store.ingest("line1\nline3", "doc.md", dedup=False)
            diff = store.get_version_diff("doc.md", 1, 2)
            assert "---" in diff["diff"]
            assert "+++" in diff["diff"]
        finally:
            _cleanup(store)

    async def test_diff_includes_hashes(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            diff = store.get_version_diff("doc.md", 1, 2)
            assert len(diff["from_hash"]) == 64
            assert len(diff["to_hash"]) == 64
            assert diff["from_hash"] != diff["to_hash"]
        finally:
            _cleanup(store)

    def test_diff_missing_version_returns_none(self):
        store = _tmp_store()
        try:
            assert store.get_version_diff("nope.md", 1, 2) is None
        finally:
            _cleanup(store)

    async def test_diff_one_version_missing(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            assert store.get_version_diff("doc.md", 1, 99) is None
        finally:
            _cleanup(store)

    async def test_diff_same_version(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            diff = store.get_version_diff("doc.md", 1, 1)
            assert diff is not None
            assert diff["lines_added"] == 0
            assert diff["lines_removed"] == 0
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# restore_version tests
# ---------------------------------------------------------------------------


class TestRestoreVersion:
    async def test_restore_previous_version(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            chunks = await store.restore_version("doc.md", 1)
            assert chunks > 0
            content = store.get_source_content("doc.md")
            assert content == SHORT_DOC
        finally:
            _cleanup(store)

    async def test_restore_records_version(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            await store.restore_version("doc.md", 1)
            versions = store.get_versions("doc.md")
            assert len(versions) == 3
            assert versions[0]["uploader"] == "restore-v1"
        finally:
            _cleanup(store)

    async def test_restore_nonexistent_returns_zero(self):
        store = _tmp_store()
        try:
            result = await store.restore_version("nope.md", 1)
            assert result == 0
        finally:
            _cleanup(store)

    async def test_restore_delete_version_returns_zero(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            store.delete_source("doc.md")
            result = await store.restore_version("doc.md", 2)
            assert result == 0
        finally:
            _cleanup(store)

    async def test_restore_uses_dedup_false(self):
        """Restoring a version that matches current content should still work."""
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            await store.restore_version("doc.md", 1)
            await store.restore_version("doc.md", 1)
            versions = store.get_versions("doc.md")
            assert len(versions) == 4
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# _next_version tests
# ---------------------------------------------------------------------------


class TestNextVersion:
    def test_first_version_is_one(self):
        store = _tmp_store()
        try:
            assert store._next_version("new.md") == 1
        finally:
            _cleanup(store)

    def test_increments(self):
        store = _tmp_store()
        try:
            store._record_version("doc.md", "h", "c", 1, "u", "create")
            assert store._next_version("doc.md") == 2
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestVersioningEdgeCases:
    async def test_version_history_survives_source_delete(self):
        """Versions persist even after chunks are deleted."""
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            store.delete_source("doc.md")
            versions = store.get_versions("doc.md")
            assert len(versions) == 2
            v1 = store.get_version("doc.md", 1)
            assert v1["content"] == SHORT_DOC
        finally:
            _cleanup(store)

    async def test_reingest_after_delete_creates_new_version(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            store.delete_source("doc.md")
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            versions = store.get_versions("doc.md")
            assert len(versions) == 3
            assert versions[0]["action"] == "create"
            assert versions[0]["version"] == 3
        finally:
            _cleanup(store)

    async def test_version_content_independent_of_chunks(self):
        """Version content snapshot is independent of current chunks."""
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            current_content = store.get_source_content("doc.md")
            v1_content = store.get_version("doc.md", 1)["content"]
            assert current_content != v1_content
            assert v1_content == SHORT_DOC
        finally:
            _cleanup(store)

    async def test_created_at_is_utc_iso(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            ver = store.get_version("doc.md", 1)
            assert "T" in ver["created_at"]
            assert "+" in ver["created_at"] or ver["created_at"].endswith("Z") or ":" in ver["created_at"]
        finally:
            _cleanup(store)

    async def test_diff_summary_field_always_string(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            versions = store.get_versions("doc.md")
            assert isinstance(versions[0]["diff_summary"], str)
        finally:
            _cleanup(store)

    async def test_concurrent_ingests_versioned(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "a.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "b.md", dedup=False)
            a_versions = store.get_versions("a.md")
            b_versions = store.get_versions("b.md")
            assert len(a_versions) == 1
            assert len(b_versions) == 1
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# REST API tests
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


class TestVersionsListAPI:
    async def test_unavailable(self):
        bot = _make_bot_with_store()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/knowledge/testdoc/versions")
            assert resp.status == 503

    async def test_empty_versions(self):
        store = _tmp_store()
        try:
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.get("/api/knowledge/testdoc/versions")
                assert resp.status == 200
                data = await resp.json()
                assert data == []
        finally:
            _cleanup(store)

    async def test_versions_returned(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.get("/api/knowledge/doc.md/versions")
                assert resp.status == 200
                data = await resp.json()
                assert len(data) == 2
                assert data[0]["version"] == 2
        finally:
            _cleanup(store)


class TestVersionDetailAPI:
    async def test_unavailable(self):
        bot = _make_bot_with_store()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/knowledge/doc/versions/1")
            assert resp.status == 503

    async def test_not_found(self):
        store = _tmp_store()
        try:
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.get("/api/knowledge/doc/versions/1")
                assert resp.status == 404
        finally:
            _cleanup(store)

    async def test_returns_version_with_content(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.get("/api/knowledge/doc.md/versions/1")
                assert resp.status == 200
                data = await resp.json()
                assert data["version"] == 1
                assert data["content"] == SHORT_DOC
        finally:
            _cleanup(store)


class TestVersionRestoreAPI:
    async def test_unavailable(self):
        bot = _make_bot_with_store()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post("/api/knowledge/doc/versions/1/restore")
            assert resp.status == 503

    async def test_not_found(self):
        store = _tmp_store()
        try:
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.post("/api/knowledge/doc/versions/1/restore")
                assert resp.status == 404
        finally:
            _cleanup(store)

    async def test_cannot_restore_delete_version(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            store.delete_source("doc.md")
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.post("/api/knowledge/doc.md/versions/2/restore")
                assert resp.status == 400
        finally:
            _cleanup(store)

    async def test_restore_success(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.post("/api/knowledge/doc.md/versions/1/restore")
                assert resp.status == 200
                data = await resp.json()
                assert data["status"] == "restored"
                assert data["version"] == 1
                assert data["chunks"] > 0
        finally:
            _cleanup(store)


class TestVersionDiffAPI:
    async def test_unavailable(self):
        bot = _make_bot_with_store()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/knowledge/doc/versions/1/diff/2")
            assert resp.status == 503

    async def test_not_found(self):
        store = _tmp_store()
        try:
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.get("/api/knowledge/doc/versions/1/diff/2")
                assert resp.status == 404
        finally:
            _cleanup(store)

    async def test_diff_returned(self):
        store = _tmp_store()
        try:
            await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            await store.ingest(SHORT_DOC_V2, "doc.md", dedup=False)
            bot = _make_bot_with_store(store)
            app = _make_app(bot)
            async with TestClient(TestServer(app)) as client:
                resp = await client.get("/api/knowledge/doc.md/versions/1/diff/2")
                assert resp.status == 200
                data = await resp.json()
                assert data["source"] == "doc.md"
                assert data["from_version"] == 1
                assert data["to_version"] == 2
                assert "diff" in data
        finally:
            _cleanup(store)
