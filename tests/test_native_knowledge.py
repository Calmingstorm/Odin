"""Coverage for src/discord/native_tools/knowledge.py (RFC-006 P5).

Drives the knowledge/history/audit-search handlers on KnowledgeTools with faked
store / sessions / audit boundaries. The store is a fake with controlled return
shapes so the formatting branches are exercised precisely; BulkImporter is
patched for the bulk path.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from src.discord.native_tools.knowledge import KnowledgeTools
from src.search.errors import InvalidSearchQuery


def _tools(store=None, sessions=None, audit=None):
    return KnowledgeTools(
        sessions=sessions or MagicMock(),
        get_knowledge_store=lambda: store,
        embedder=object(),
        audit=audit or MagicMock(),
    )


def _store():
    s = MagicMock()
    s.search_hybrid = AsyncMock(return_value=[])
    s.ingest = AsyncMock(return_value=3)
    s.delete_source_async = AsyncMock(return_value=2)
    return s


class TestSearchHistory:
    async def test_requires_query(self):
        assert "query is required" in await _tools()._handle_search_history({})

    async def test_no_results(self):
        s = MagicMock()
        s.search_history = AsyncMock(return_value=[])
        assert "No past conversations" in await _tools(sessions=s)._handle_search_history(
            {"query": "x"})

    async def test_formats_results(self):
        s = MagicMock()
        s.search_history = AsyncMock(return_value=[
            {"timestamp": 1_700_000_000, "type": "user", "content": "line\nbreak"},
        ])
        out = await _tools(sessions=s)._handle_search_history({"query": "q"})
        assert "Found 1 result(s)" in out and "(user)" in out

    async def test_invalid_query_is_explicit(self):
        s = MagicMock()
        s.search_history = AsyncMock(side_effect=InvalidSearchQuery("invalid query"))
        out = await _tools(sessions=s)._handle_search_history({"query": "bad\x00query"})
        assert "Invalid query" in out

    async def test_search_failure_is_explicit(self):
        s = MagicMock()
        s.search_history = AsyncMock(side_effect=RuntimeError("database failure"))
        out = await _tools(sessions=s)._handle_search_history({"query": "q"})
        assert "Search failed" in out


class TestSearchKnowledge:
    async def test_store_unavailable(self):
        assert "not available" in await _tools(store=None)._handle_search_knowledge({"query": "q"})

    async def test_requires_query(self):
        assert "query is required" in await _tools(store=_store())._handle_search_knowledge({})

    async def test_no_results(self):
        assert "No knowledge base results" in await _tools(
            store=_store())._handle_search_knowledge({"query": "q"})

    async def test_formats_results(self):
        s = _store()
        s.search_hybrid = AsyncMock(return_value=[
            {"source": "doc.md", "score": 0.9, "content": "body\ntext"},
        ])
        out = await _tools(store=s)._handle_search_knowledge({"query": "q"})
        assert "[doc.md]" in out and "score: 0.9" in out

    async def test_invalid_query_is_explicit(self):
        s = _store()
        s.search_hybrid = AsyncMock(side_effect=InvalidSearchQuery("invalid query"))
        out = await _tools(store=s)._handle_search_knowledge({"query": "bad\x00query"})
        assert "Invalid query" in out

    async def test_search_failure_is_explicit(self):
        s = _store()
        s.search_hybrid = AsyncMock(side_effect=RuntimeError("database failure"))
        out = await _tools(store=s)._handle_search_knowledge({"query": "q"})
        assert "Search failed" in out


class TestIngest:
    async def test_store_unavailable(self):
        assert "not available" in await _tools(store=None)._handle_ingest_document({}, "web")

    async def test_requires_source_and_content(self):
        assert "required" in await _tools(store=_store())._handle_ingest_document(
            {"source": "s"}, "web")

    async def test_zero_chunks(self):
        s = _store()
        s.ingest = AsyncMock(return_value=0)
        out = await _tools(store=s)._handle_ingest_document(
            {"source": "s", "content": "c"}, "web")
        assert "Failed to ingest" in out

    async def test_success(self):
        out = await _tools(store=_store())._handle_ingest_document(
            {"source": "s", "content": "c"}, "web")
        assert "Ingested 's'" in out and "3 chunks" in out


class TestBulkIngest:
    async def test_store_unavailable(self):
        assert "not available" in await _tools(store=None)._handle_bulk_ingest({}, "web")

    async def test_requires_items(self):
        assert "required" in await _tools(store=_store())._handle_bulk_ingest(
            {"items": "notalist"}, "web")

    async def test_success(self):
        batch = MagicMock(succeeded=1, failed=1, skipped=0, results=[
            {"status": "ok", "source": "a", "chunks": 2, "error": None},
            {"status": "error", "source": "b", "chunks": 0, "error": "bad"},
        ])
        importer = MagicMock()
        importer.import_batch = AsyncMock(return_value=batch)
        with patch("src.knowledge.importer.BulkImporter", return_value=importer):
            out = await _tools(store=_store())._handle_bulk_ingest(
                {"items": [{"type": "url"}]}, "web")
        assert "1 succeeded, 1 failed" in out and "[OK] a (2 chunks)" in out and "[ERROR] b" in out


class TestListDelete:
    def test_list_unavailable_empty_and_formatted(self):
        assert "not available" in _tools(store=None)._handle_list_knowledge()
        s = _store()
        s.list_sources = MagicMock(return_value=[])
        assert "empty" in _tools(store=s)._handle_list_knowledge()
        s.list_sources = MagicMock(return_value=[
            {"source": "d.md", "chunks": 4, "uploader": "u", "ingested_at": "2026-07-07T00:00:00"},
        ])
        out = _tools(store=s)._handle_list_knowledge()
        assert "1 document(s), 4 total chunks" in out and "**d.md**" in out

    async def test_delete_paths(self):
        assert "not available" in await _tools(store=None)._handle_delete_knowledge({})
        assert "'source' is required" in await _tools(store=_store())._handle_delete_knowledge({})
        s = _store()
        s.delete_source_async = AsyncMock(return_value=0)
        assert "No document found" in await _tools(store=s)._handle_delete_knowledge(
            {"source": "x"})
        out = await _tools(store=_store())._handle_delete_knowledge({"source": "x"})
        assert "Deleted 'x'" in out and "2 chunks removed" in out


class TestSearchAudit:
    async def test_no_results(self):
        a = MagicMock()
        a.search = AsyncMock(return_value=[])
        assert "No audit log entries" in await _tools(audit=a)._handle_search_audit({})

    async def test_formats_entries(self):
        a = MagicMock()
        a.search = AsyncMock(return_value=[
            {"timestamp": "2026-07-07T12:00:00Z", "tool_name": "run_command",
             "user_name": "aaron", "approved": True, "execution_time_ms": 12,
             "result_summary": "ok"},
            {"timestamp": "2026-07-07T12:01:00Z", "tool_name": "x",
             "user_name": "u", "approved": False, "error": "boom"},
        ])
        out = await _tools(audit=a)._handle_search_audit(
            {"has_error": 1, "min_duration_ms": "5", "limit": 5})
        assert "2 entries" in out and "run_command" in out and "ERROR: boom" in out

    async def test_renders_audit_metadata(self):
        # A later "which backend?" lookup surfaces the structured record.
        a = MagicMock()
        a.search = AsyncMock(return_value=[
            {"timestamp": "2026-07-07T12:00:00Z", "tool_name": "generate_image",
             "user_name": "aaron", "approved": True, "execution_time_ms": 63000,
             "result_summary": "Image generated (1536x1024, 800 KB) and posted.",
             "audit_metadata": {"backend": "openai", "route": "auto_native",
                                "decoded_width": 1536, "decoded_height": 1024}},
        ])
        out = await _tools(audit=a)._handle_search_audit({"tool_name": "generate_image"})
        assert "backend=openai" in out and "route=auto_native" in out
