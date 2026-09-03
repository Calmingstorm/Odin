"""Tests for bulk knowledge import — markdown dirs, PDFs, web URLs (Round 25)."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.knowledge.importer import (
    DIR_ALLOWED_EXTENSIONS,
    FETCH_MAX_CHARS,
    MAX_BATCH_SIZE,
    MAX_FILE_BYTES,
    MAX_PDF_BYTES,
    PDF_MAX_CHARS,
    BatchResult,
    BulkImporter,
    ImportResult,
)
from src.knowledge.store import KnowledgeStore
from src.search.errors import validate_search_query
from src.search.fts import FullTextIndex
from src.tools.result_validator import ToolResult

try:
    import fitz  # noqa: F401 — availability probe for the [pdf] extra
    HAS_FITZ = True
except ImportError:
    HAS_FITZ = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tmp_store() -> KnowledgeStore:
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


def _make_importer(store=None):
    s = store or _tmp_store()
    return BulkImporter(s, embedder=None), s


SHORT_DOC = "Hello world, this is a test document for bulk import testing."


# ---------------------------------------------------------------------------
# ImportResult / BatchResult dataclass tests
# ---------------------------------------------------------------------------


class TestImportResult:
    def test_defaults(self):
        r = ImportResult(source="test.md", status="ok")
        assert r.source == "test.md"
        assert r.status == "ok"
        assert r.chunks == 0
        assert r.error == ""

    def test_with_error(self):
        r = ImportResult(source="bad.pdf", status="error", error="download failed")
        assert r.status == "error"
        assert r.error == "download failed"

    def test_with_chunks(self):
        r = ImportResult(source="doc.md", status="ok", chunks=5)
        assert r.chunks == 5


class TestBatchResult:
    def test_defaults(self):
        b = BatchResult()
        assert b.total == 0
        assert b.succeeded == 0
        assert b.failed == 0
        assert b.skipped == 0
        assert b.results == []

    def test_results_independent(self):
        b1 = BatchResult()
        b2 = BatchResult()
        b1.results.append({"source": "a"})
        assert b2.results == []


# ---------------------------------------------------------------------------
# Directory import
# ---------------------------------------------------------------------------


class TestImportDirectory:
    async def test_missing_directory(self):
        importer, store = _make_importer()
        try:
            results = await importer.import_directory("/nonexistent/path/xyz")
            assert len(results) == 1
            assert results[0].status == "error"
            assert "not found" in results[0].error
        finally:
            _cleanup(store)

    async def test_empty_directory(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                results = await importer.import_directory(tmpdir)
                assert len(results) == 1
                assert results[0].status == "skipped"
                assert "no files matched" in results[0].error
        finally:
            _cleanup(store)

    async def test_single_markdown_file(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                md = Path(tmpdir) / "readme.md"
                md.write_text("# Test\nSome content here.")
                results = await importer.import_directory(tmpdir)
                assert len(results) == 1
                assert results[0].status == "ok"
                assert results[0].source == md.resolve().as_uri()
                assert results[0].chunks > 0
        finally:
            _cleanup(store)

    async def test_multiple_files(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                for name in ["a.md", "b.md", "c.md"]:
                    (Path(tmpdir) / name).write_text(f"Content of {name}")
                results = await importer.import_directory(tmpdir)
                ok = [r for r in results if r.status == "ok"]
                assert len(ok) == 3
        finally:
            _cleanup(store)

    async def test_nested_directory(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                subdir = Path(tmpdir) / "docs" / "api"
                subdir.mkdir(parents=True)
                (subdir / "endpoints.md").write_text("# API docs\nSome endpoints.")
                results = await importer.import_directory(tmpdir)
                assert len(results) == 1
                assert results[0].status == "ok"
                assert results[0].source == (subdir / "endpoints.md").resolve().as_uri()
        finally:
            _cleanup(store)

    async def test_custom_pattern(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "a.md").write_text("markdown")
                (Path(tmpdir) / "b.txt").write_text("text file")
                results = await importer.import_directory(tmpdir, pattern="**/*.txt")
                assert len(results) == 1
                assert results[0].source == (Path(tmpdir) / "b.txt").resolve().as_uri()
        finally:
            _cleanup(store)

    async def test_skips_disallowed_extensions(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "binary.exe").write_text("not real binary")
                (Path(tmpdir) / "doc.md").write_text("valid doc")
                results = await importer.import_directory(tmpdir, pattern="*")
                sources = [r.source for r in results]
                assert (Path(tmpdir) / "doc.md").resolve().as_uri() in sources
                assert all("binary.exe" not in source for source in sources)
        finally:
            _cleanup(store)

    async def test_skips_empty_files(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "empty.md").write_text("")
                (Path(tmpdir) / "content.md").write_text("real content")
                results = await importer.import_directory(tmpdir)
                statuses = {r.source: r.status for r in results}
                assert statuses.get((Path(tmpdir) / "empty.md").resolve().as_uri()) == "skipped"
                assert statuses.get((Path(tmpdir) / "content.md").resolve().as_uri()) == "ok"
        finally:
            _cleanup(store)

    async def test_skips_large_files(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                big = Path(tmpdir) / "huge.md"
                big.write_text("x" * (MAX_FILE_BYTES + 1))
                results = await importer.import_directory(tmpdir)
                assert results[0].status == "skipped"
                assert "too large" in results[0].error
        finally:
            _cleanup(store)

    async def test_batch_limit(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                for i in range(MAX_BATCH_SIZE + 5):
                    (Path(tmpdir) / f"doc_{i:03d}.md").write_text(f"Content {i}")
                results = await importer.import_directory(tmpdir)
                ok_count = sum(1 for r in results if r.status == "ok")
                skip_count = sum(1 for r in results
                    if r.status == "skipped" and "batch limit" in r.error)
                assert ok_count == MAX_BATCH_SIZE
                assert skip_count > 0
        finally:
            _cleanup(store)

    async def test_uploader_propagated(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "doc.md").write_text("content for uploader test")
                await importer.import_directory(tmpdir, uploader="test-user")
                sources = store.list_sources()
                assert len(sources) == 1
                chunks = store._conn.execute(
                    "SELECT uploader FROM knowledge_chunks WHERE source = ?",
                    (sources[0]["source"],)
                ).fetchone()
                assert chunks[0] == "test-user"
        finally:
            _cleanup(store)

    async def test_relative_source_names(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                sub = Path(tmpdir) / "subdir"
                sub.mkdir()
                (sub / "file.md").write_text("content")
                results = await importer.import_directory(tmpdir)
                assert results[0].source == (sub / "file.md").resolve().as_uri()
        finally:
            _cleanup(store)

    async def test_allowed_extensions(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                for ext in [".md", ".txt", ".rst", ".yaml", ".json", ".toml"]:
                    (Path(tmpdir) / f"file{ext}").write_text(f"content for {ext}")
                results = await importer.import_directory(tmpdir, pattern="*")
                ok_sources = {r.source for r in results if r.status == "ok"}
                for ext in [".md", ".txt", ".rst", ".yaml", ".json", ".toml"]:
                    assert (Path(tmpdir) / f"file{ext}").resolve().as_uri() in ok_sources
        finally:
            _cleanup(store)


    async def test_matched_entry_that_is_not_a_file_is_ignored(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "ignored.md"
                path.write_text("ignored", encoding="utf-8")
                with patch.object(Path, "is_file", return_value=False):
                    results = await importer.import_directory(tmpdir)
                assert results == []
        finally:
            _cleanup(store)

    async def test_matched_directory_entry_removed_before_read(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "vanished.md"
                path.write_text("temporary", encoding="utf-8")
                original = Path.is_file

                def remove_after_match(candidate):
                    matched = original(candidate)
                    if candidate == path.resolve() and matched:
                        candidate.unlink()
                    return matched

                with patch.object(Path, "is_file", remove_after_match):
                    results = await importer.import_directory(tmpdir)
                assert len(results) == 1
                assert results[0].status == "error"
                assert "No such file" in results[0].error
        finally:
            _cleanup(store)


class TestLocalFileIntegrity:
    async def test_invalid_utf8_is_failed_without_ingestion(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "invalid.md"
                path.write_bytes(b"valid\n\xff\xfe")
                result = await importer.import_file(str(path))
                assert result.status == "error"
                assert "invalid UTF-8" in result.error
                assert store.list_sources() == []
        finally:
            _cleanup(store)

    def test_legacy_source_rejects_absolute_and_traversal_names(self):
        path = Path("/tmp/project/docs/doc.md")
        assert not BulkImporter._legacy_source_matches_path("", path)
        assert not BulkImporter._legacy_source_matches_path("/tmp/project/docs/doc.md", path)
        assert not BulkImporter._legacy_source_matches_path("../docs/doc.md", path)
        assert not BulkImporter._legacy_source_matches_path("https://example.com/doc.md", path)

    async def test_single_file_missing_and_outside_safe_roots(self):
        importer, store = _make_importer()
        try:
            missing = await importer.import_file("/tmp/definitely-missing-odin-import.md")
            assert missing.status == "error"
            assert missing.error == "file not found"

            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "outside.md"
                path.write_text("outside", encoding="utf-8")
                with patch("src.knowledge.importer.SAFE_IMPORT_ROOTS", ("/opt/odin",)):
                    outside = await importer.import_file(str(path))
                assert outside.status == "error"
                assert "not in allowed import roots" in outside.error
        finally:
            _cleanup(store)

    async def test_single_file_rejects_unsupported_extension(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "binary.bin"
                path.write_bytes(b"not really binary")
                result = await importer.import_file(str(path))
                assert result.status == "skipped"
                assert "unsupported file extension" in result.error
                assert store.list_sources() == []
        finally:
            _cleanup(store)

    async def test_file_growth_during_read_hits_size_fence(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "growing.md"
                path.write_text("small", encoding="utf-8")
                with patch.object(
                    BulkImporter,
                    "_read_file_bytes",
                    return_value=b"x" * (MAX_FILE_BYTES + 1),
                ):
                    result = await importer.import_file(str(path))
                assert result.status == "skipped"
                assert "more than" in result.error
                assert store.list_sources() == []
        finally:
            _cleanup(store)

    async def test_single_file_import_is_first_class(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "one.md"
                path.write_text("single-file content", encoding="utf-8")
                result = await importer.import_file(str(path))
                assert result.status == "ok"
                assert result.source == path.resolve().as_uri()
                assert store.get_source_content(result.source) == "single-file content"
        finally:
            _cleanup(store)

    async def test_directory_base_does_not_change_source_identity(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                outer = Path(tmpdir) / "a"
                inner = outer / "b"
                inner.mkdir(parents=True)
                path = inner / "doc.md"
                path.write_text("stable identity content", encoding="utf-8")

                first = await importer.import_directory(str(outer))
                second = await importer.import_directory(str(inner))

                canonical = path.resolve().as_uri()
                assert first[0].source == canonical
                assert second[0].source == canonical
                assert [entry["source"] for entry in store.list_sources()] == [canonical]
        finally:
            _cleanup(store)

    async def test_exact_legacy_source_is_migrated_to_canonical_identity(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            fts = FullTextIndex(str(base / "fts.db"))
            store = KnowledgeStore(str(base / "knowledge.db"), fts_index=fts)
            importer = BulkImporter(store)
            try:
                path = base / "docs" / "doc.md"
                path.parent.mkdir()
                content = "legacy migration content"
                path.write_text(content, encoding="utf-8")
                await store.ingest(content, "docs/doc.md", dedup=False)

                result = await importer.import_file(str(path))

                canonical = path.resolve().as_uri()
                assert result.status == "ok"
                assert result.source == canonical
                assert store.get_source_content("docs/doc.md") is None
                assert store.get_source_content(canonical) == content
                assert not fts.has_knowledge_source("docs/doc.md")
                assert fts.has_knowledge_source(canonical)
            finally:
                store.close()
                if fts._conn is not None:
                    fts._conn.close()

    async def test_migration_recheck_uses_existing_canonical_source(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "docs" / "doc.md"
                path.parent.mkdir()
                content = "raced migration content"
                path.write_text(content, encoding="utf-8")
                await store.ingest(content, "docs/doc.md", dedup=False)
                original = importer._legacy_source_for
                calls = 0

                def migrate_then_observe_canonical(*args):
                    nonlocal calls
                    calls += 1
                    if calls == 1:
                        return original(*args)
                    store.delete_source("docs/doc.md")
                    store._conn.execute(
                        "UPDATE knowledge_chunks SET source = ? WHERE source = ?",
                        (path.resolve().as_uri(), "docs/doc.md"),
                    )
                    return None, None

                # Simulate a concurrent importer completing migration between
                # the optimistic check and admission to the shared lock.
                with patch.object(importer, "_legacy_source_for", side_effect=[
                    ("docs/doc.md", None), (None, None),
                ]):
                    await store.ingest(content, path.resolve().as_uri(), dedup=False)
                    store.delete_source("docs/doc.md")
                    result = await importer.import_file(str(path))

                assert result.status == "ok"
                assert store.get_source_content(path.resolve().as_uri()) == content
        finally:
            _cleanup(store)

    async def test_migration_recheck_reports_new_conflict(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "docs" / "doc.md"
                path.parent.mkdir()
                content = "raced conflict content"
                path.write_text(content, encoding="utf-8")
                await store.ingest(content, "docs/doc.md", dedup=False)
                with patch.object(importer, "_legacy_source_for", side_effect=[
                    ("docs/doc.md", None), (None, "legacy source conflict after lock"),
                ]):
                    result = await importer.import_file(str(path))
                assert result.status == "error"
                assert result.error == "legacy source conflict after lock"
                assert store.get_source_content(path.resolve().as_uri()) is None
        finally:
            _cleanup(store)

    async def test_failed_migration_copy_retains_partial_canonical(self):
        store = MagicMock()
        store.list_sources.return_value = [{
            "source": "docs/doc.md",
            "content_hash": KnowledgeStore._content_hash("copy failure content"),
        }]
        store._chunk_text.return_value = ["copy failure content"]
        store.ingest = AsyncMock(return_value=0)
        store.source_is_durable_async = AsyncMock(return_value=False)
        store.delete_source_async = AsyncMock(return_value=0)
        importer = BulkImporter(store)
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "docs" / "doc.md"
            path.parent.mkdir()
            path.write_text("copy failure content", encoding="utf-8")
            result = await importer.import_file(str(path))
        assert result.status == "error"
        assert "indexed 0/1 durably verified chunks" in result.error
        assert "canonical copy retained" in result.error
        store.delete_source_async.assert_not_called()

    async def test_failed_legacy_delete_retains_canonical_copy(self):
        store = MagicMock()
        store.list_sources.return_value = [{
            "source": "docs/doc.md",
            "content_hash": KnowledgeStore._content_hash("delete failure content"),
        }]
        store._chunk_text.return_value = ["delete failure content"]
        store.ingest = AsyncMock(return_value=1)
        store.source_is_durable_async = AsyncMock(return_value=True)
        store.delete_source_confirmed_async = AsyncMock(return_value=0)
        importer = BulkImporter(store)
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "docs" / "doc.md"
            path.parent.mkdir()
            path.write_text("delete failure content", encoding="utf-8")
            result = await importer.import_file(str(path))
        assert result.status == "error"
        assert "canonical copy retained" in result.error
        content_hash = KnowledgeStore._content_hash("delete failure content")
        store.delete_source_confirmed_async.assert_awaited_once_with(
            "docs/doc.md",
            survivor_source=result.source,
            survivor_expected_chunks=1,
            survivor_content_hash=content_hash,
            expected_source_hash=content_hash,
        )
        store.delete_source_async.assert_not_called()

    async def test_failed_canonical_fts_create_keeps_searchable_legacy_copy(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            fts = FullTextIndex(str(base / "fts.db"))
            store = KnowledgeStore(str(base / "knowledge.db"), fts_index=fts)
            importer = BulkImporter(store)
            try:
                path = base / "docs" / "doc.md"
                path.parent.mkdir()
                content = "canonical FTS create failure keeps legacy searchable"
                path.write_text(content, encoding="utf-8")
                legacy = "docs/doc.md"
                canonical = path.resolve().as_uri()
                assert await store.ingest(content, legacy, dedup=False) == 1
                real_index = fts.index_knowledge_chunk

                def fail_canonical_index(chunk_id, chunk, source, chunk_index):
                    if source == canonical:
                        return False
                    return real_index(chunk_id, chunk, source, chunk_index)

                with patch.object(
                    fts, "index_knowledge_chunk", side_effect=fail_canonical_index,
                ):
                    result = await importer.import_file(str(path))

                assert result.status == "error"
                assert "canonical copy retained" in result.error
                assert store.get_source_content(canonical) is None  # canonical DB
                assert not fts.has_knowledge_source(canonical)  # canonical FTS
                assert store.get_source_content(legacy) == content  # legacy DB
                assert fts.has_knowledge_source(legacy)  # legacy FTS
            finally:
                store.close()
                if fts._conn is not None:
                    fts._conn.close()

    async def test_confirmed_delete_rechecks_survivor_under_write_lock(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            fts = FullTextIndex(str(base / "fts.db"))
            store = KnowledgeStore(str(base / "knowledge.db"), fts_index=fts)
            try:
                legacy = "docs/doc.md"
                canonical = (base / "docs" / "doc.md").resolve().as_uri()
                assert await store.ingest("legacy", legacy, dedup=False) == 1
                assert await store.ingest("canonical", canonical, dedup=False) == 1
                assert fts.delete_knowledge_source(canonical) == 1

                removed = await store.delete_source_confirmed_async(
                    legacy,
                    survivor_source=canonical,
                    survivor_expected_chunks=1,
                )

                assert removed == 0
                assert store.get_source_content(legacy) == "legacy"
                assert fts.has_knowledge_source(legacy)
            finally:
                store.close()
                if fts._conn is not None:
                    fts._conn.close()

    async def test_migration_refuses_changed_legacy_source_under_store_lock(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            fts = FullTextIndex(str(base / "fts.db"))
            store = KnowledgeStore(str(base / "knowledge.db"), fts_index=fts)
            importer = BulkImporter(store)
            try:
                path = base / "docs" / "doc.md"
                path.parent.mkdir()
                original = "original legacy migration content"
                changed = "changed legacy content after candidate selection"
                path.write_text(original, encoding="utf-8")
                legacy = "docs/doc.md"
                canonical = path.resolve().as_uri()
                assert await store.ingest(original, legacy, dedup=False) == 1
                real_confirmed_delete = store.delete_source_confirmed_async

                async def change_then_delete(source, **kwargs):
                    assert await store.ingest(changed, legacy, dedup=False) == 1
                    return await real_confirmed_delete(source, **kwargs)

                with patch.object(
                    store,
                    "delete_source_confirmed_async",
                    side_effect=change_then_delete,
                ):
                    result = await importer.import_file(str(path))

                assert result.status == "error"
                assert store.get_source_content(canonical) == original
                assert fts.has_knowledge_source(canonical)
                assert store.get_source_content(legacy) == changed
                assert fts.has_knowledge_source(legacy)
            finally:
                store.close()
                if fts._conn is not None:
                    fts._conn.close()

    async def test_partial_fts_delete_cannot_erase_canonical_copy(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            fts = FullTextIndex(str(base / "fts.db"))
            store = KnowledgeStore(str(base / "knowledge.db"), fts_index=fts)
            importer = BulkImporter(store)
            try:
                path = base / "docs" / "doc.md"
                path.parent.mkdir()
                content = "partial FTS migration content"
                path.write_text(content, encoding="utf-8")
                await store.ingest(content, "docs/doc.md", dedup=False)
                real_delete = fts.delete_knowledge_source

                def delete_fts_then_fail(source):
                    real_delete(source)
                    raise RuntimeError("simulated failure after FTS commit")

                with patch.object(
                    fts, "delete_knowledge_source", side_effect=delete_fts_then_fail,
                ):
                    result = await importer.import_file(str(path))

                canonical = path.resolve().as_uri()
                assert result.status == "error"
                assert "canonical copy retained" in result.error
                assert store.get_source_content(canonical) == content
                assert store.get_source_content("docs/doc.md") == content
                assert fts.has_knowledge_source(canonical)
                assert fts.has_knowledge_source("docs/doc.md")
            finally:
                store.close()
                if fts._conn is not None:
                    fts._conn.close()

    async def test_db_delete_failure_restores_fts_and_retains_canonical_copy(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            fts = FullTextIndex(str(base / "fts.db"))
            store = KnowledgeStore(str(base / "knowledge.db"), fts_index=fts)
            importer = BulkImporter(store)
            try:
                path = base / "docs" / "doc.md"
                path.parent.mkdir()
                content = "DB failure migration content"
                path.write_text(content, encoding="utf-8")
                await store.ingest(content, "docs/doc.md", dedup=False)
                legacy_ids = [
                    row[0] for row in store._conn.execute(
                        "SELECT chunk_id FROM knowledge_chunks WHERE source = ?",
                        ("docs/doc.md",),
                    ).fetchall()
                ]
                real_confirmed_delete = store.delete_source_confirmed

                def fail_after_fts_delete(source, **kwargs):
                    real_delete = fts.delete_knowledge_source

                    def delete_fts_then_fail_knowledge_db(delete_source):
                        real_delete(delete_source)
                        store._conn.execute(
                            "CREATE TRIGGER fail_legacy_delete BEFORE DELETE ON knowledge_chunks "
                            "WHEN OLD.source = 'docs/doc.md' "
                            "BEGIN SELECT RAISE(ABORT, 'simulated DB delete failure'); END"
                        )
                        store._conn.commit()

                    with patch.object(
                        fts,
                        "delete_knowledge_source",
                        side_effect=delete_fts_then_fail_knowledge_db,
                    ):
                        return real_confirmed_delete(source, **kwargs)

                with patch.object(
                    store, "delete_source_confirmed", side_effect=fail_after_fts_delete,
                ):
                    result = await importer.import_file(str(path))

                canonical = path.resolve().as_uri()
                assert result.status == "error"
                assert "canonical copy retained" in result.error
                assert store.get_source_content(canonical) == content
                assert store.get_source_content("docs/doc.md") == content
                assert all(fts.has_knowledge_chunk(chunk_id) for chunk_id in legacy_ids)
            finally:
                store.close()
                if fts._conn is not None:
                    fts._conn.close()

    async def test_legacy_migration_without_fts_retains_both_sources(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "docs" / "doc.md"
                path.parent.mkdir()
                content = "migration requires FTS confirmation"
                path.write_text(content, encoding="utf-8")
                await store.ingest(content, "docs/doc.md", dedup=False)

                result = await importer.import_file(str(path))

                canonical = path.resolve().as_uri()
                assert result.status == "error"
                assert "canonical copy retained" in result.error
                assert store.get_source_content("docs/doc.md") == content
                assert store.get_source_content(canonical) == content
        finally:
            _cleanup(store)

    async def test_migrated_source_accepts_later_content_updates(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            fts = FullTextIndex(str(base / "fts.db"))
            store = KnowledgeStore(str(base / "knowledge.db"), fts_index=fts)
            importer = BulkImporter(store)
            try:
                path = base / "docs" / "doc.md"
                path.parent.mkdir()
                path.write_text("original content", encoding="utf-8")
                await store.ingest("original content", "docs/doc.md", dedup=False)
                migrated = await importer.import_file(str(path))
                assert migrated.status == "ok"

                path.write_text("updated content", encoding="utf-8")
                updated = await importer.import_file(str(path))

                assert updated.status == "ok"
                assert store.get_source_content("docs/doc.md") is None
                assert store.get_source_content(path.resolve().as_uri()) == "updated content"
            finally:
                store.close()
                if fts._conn is not None:
                    fts._conn.close()

    async def test_changed_legacy_source_conflicts_without_duplicate(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "docs" / "doc.md"
                path.parent.mkdir()
                path.write_text("new content", encoding="utf-8")
                await store.ingest("old content", "docs/doc.md", dedup=False)

                result = await importer.import_file(str(path))

                assert result.status == "error"
                assert "legacy source conflict" in result.error
                assert store.get_source_content("docs/doc.md") == "old content"
                assert store.get_source_content(path.resolve().as_uri()) is None
        finally:
            _cleanup(store)

    async def test_ambiguous_legacy_sources_conflict_without_duplicate(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "docs" / "doc.md"
                path.parent.mkdir()
                content = "ambiguous content"
                path.write_text(content, encoding="utf-8")
                await store.ingest(content, "doc.md", dedup=False)
                await store.ingest(content, "docs/doc.md", dedup=False)

                result = await importer.import_file(str(path))

                assert result.status == "error"
                assert "2 have matching content" in result.error
                assert store.get_source_content(path.resolve().as_uri()) is None
                assert {entry["source"] for entry in store.list_sources()} == {
                    "doc.md", "docs/doc.md",
                }
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# PDF URL import
# ---------------------------------------------------------------------------


def _mock_fitz_doc(text_per_page=None, page_count=1):
    """Create a mock fitz document without requiring PyMuPDF."""
    pages = []
    for i in range(page_count):
        page = MagicMock()
        if text_per_page:
            page.get_text.return_value = text_per_page[i] if i < len(text_per_page) else ""
        else:
            page.get_text.return_value = ""
        pages.append(page)

    doc = MagicMock()
    doc.page_count = page_count
    doc.__getitem__ = lambda self, i: pages[i]
    doc.close = MagicMock()
    return doc


def _mock_aiohttp_response(status=200, read_data=b"", text_data="", headers=None):
    """Return a fake ``safe_fetch`` callable. import_pdf_url/import_web_url now
    route through the hardened transport; these tests exercise the caller's
    response handling with the transport faked (no network). Body is bytes for
    PDF (``read_data``) and encoded text for web (``text_data``)."""
    from src.tools.safe_fetch import SafeFetchResponse

    body = read_data if read_data else text_data.encode()
    ct = (headers or {}).get("Content-Type", "")

    async def _f(url, **kw):
        return SafeFetchResponse(status, headers or {}, body, ct, url, "")

    return _f


def _fake_safe_fetch_raises(exc):
    async def _f(url, **kw):
        raise exc

    return _f


class TestImportPdfUrl:
    async def test_invalid_scheme(self):
        importer, store = _make_importer()
        try:
            r = await importer.import_pdf_url("ftp://example.com/doc.pdf")
            assert r.status == "error"
            assert "http" in r.error
        finally:
            _cleanup(store)

    async def test_fitz_not_available(self):
        importer, store = _make_importer()
        try:
            with patch.dict("sys.modules", {"fitz": None}):
                r = await importer.import_pdf_url("https://example.com/doc.pdf")
                assert r.status == "error"
        finally:
            _cleanup(store)

    async def test_http_error(self):
        importer, store = _make_importer()
        try:
            mock_fitz = MagicMock()
            mock_session = _mock_aiohttp_response(status=404)
            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_pdf_url("https://example.com/missing.pdf")
                assert r.status == "error"
                assert "404" in r.error
        finally:
            _cleanup(store)

    async def test_successful_pdf_import(self):
        importer, store = _make_importer()
        try:
            doc = _mock_fitz_doc(
                text_per_page=["Test PDF content for knowledge import."], page_count=1)
            mock_fitz = MagicMock()
            mock_fitz.open.return_value = doc
            mock_session = _mock_aiohttp_response(status=200, read_data=b"fake pdf bytes")

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_pdf_url("https://example.com/test.pdf")
                assert r.status == "ok"
                assert r.chunks > 0
                assert r.source == "test.pdf"
        finally:
            _cleanup(store)

    async def test_custom_source_name(self):
        importer, store = _make_importer()
        try:
            doc = _mock_fitz_doc(text_per_page=["Content for custom source."], page_count=1)
            mock_fitz = MagicMock()
            mock_fitz.open.return_value = doc
            mock_session = _mock_aiohttp_response(status=200, read_data=b"pdf bytes")

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_pdf_url(
                    "https://example.com/test.pdf",
                    source="my-custom-doc",
                )
                assert r.source == "my-custom-doc"
                assert r.status == "ok"
        finally:
            _cleanup(store)

    async def test_empty_pdf(self):
        importer, store = _make_importer()
        try:
            doc = _mock_fitz_doc(text_per_page=[""], page_count=1)
            mock_fitz = MagicMock()
            mock_fitz.open.return_value = doc
            mock_session = _mock_aiohttp_response(status=200, read_data=b"pdf bytes")

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_pdf_url("https://example.com/empty.pdf")
                assert r.status == "skipped"
                assert "no text" in r.error
        finally:
            _cleanup(store)

    async def test_pdf_too_large(self):
        importer, store = _make_importer()
        try:
            from src.tools.safe_fetch import ResponseTooLargeError
            mock_fitz = MagicMock()

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("src.tools.safe_fetch.safe_fetch",
                       _fake_safe_fetch_raises(ResponseTooLargeError("too large"))):
                r = await importer.import_pdf_url("https://example.com/huge.pdf")
                assert r.status == "error"
                assert "too large" in r.error
        finally:
            _cleanup(store)

    async def test_source_from_url_path(self):
        importer, store = _make_importer()
        try:
            doc = _mock_fitz_doc(text_per_page=["Source name test content."], page_count=1)
            mock_fitz = MagicMock()
            mock_fitz.open.return_value = doc
            mock_session = _mock_aiohttp_response(status=200, read_data=b"pdf bytes")

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_pdf_url("https://example.com/path/to/manual.pdf")
                assert r.source == "manual.pdf"
        finally:
            _cleanup(store)

    async def test_multi_page_pdf(self):
        importer, store = _make_importer()
        try:
            doc = _mock_fitz_doc(
                text_per_page=["Page one content.", "Page two content.", "Page three content."],
                page_count=3,
            )
            mock_fitz = MagicMock()
            mock_fitz.open.return_value = doc
            mock_session = _mock_aiohttp_response(status=200, read_data=b"pdf bytes")

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_pdf_url("https://example.com/multi.pdf")
                assert r.status == "ok"
                content = store.get_source_content("multi.pdf")
                assert "Page 1" in content
                assert "Page 3" in content
        finally:
            _cleanup(store)

    async def test_pdf_content_truncation(self):
        importer, store = _make_importer()
        try:
            big_text = "A" * (PDF_MAX_CHARS + 1000)
            doc = _mock_fitz_doc(text_per_page=[big_text], page_count=1)
            mock_fitz = MagicMock()
            mock_fitz.open.return_value = doc
            mock_session = _mock_aiohttp_response(status=200, read_data=b"pdf bytes")

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_pdf_url("https://example.com/big.pdf")
                assert r.status == "ok"
                content = store.get_source_content(r.source)
                assert content is not None
                assert len(content) <= PDF_MAX_CHARS + 100
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# Web URL import
# ---------------------------------------------------------------------------


class TestImportWebUrl:
    async def test_invalid_scheme(self):
        importer, store = _make_importer()
        try:
            r = await importer.import_web_url("ftp://example.com")
            assert r.status == "error"
            assert "http" in r.error
        finally:
            _cleanup(store)

    async def test_http_error(self):
        importer, store = _make_importer()
        try:
            mock_session = _mock_aiohttp_response(status=500)
            with patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_web_url("https://example.com/bad")
                assert r.status == "error"
                assert "500" in r.error
        finally:
            _cleanup(store)

    async def test_html_page(self):
        importer, store = _make_importer()
        try:
            mock_session = _mock_aiohttp_response(
                status=200,
                text_data=("<html><body><p>Important knowledge content "
                           "for testing.</p></body></html>"),
                headers={"Content-Type": "text/html; charset=utf-8"},
            )
            with patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_web_url("https://example.com/docs")
                assert r.status == "ok"
                assert r.chunks > 0
                assert r.source == "https://example.com/docs"
        finally:
            _cleanup(store)

    async def test_plain_text_page(self):
        importer, store = _make_importer()
        try:
            mock_session = _mock_aiohttp_response(
                status=200,
                text_data="Plain text knowledge content here.",
                headers={"Content-Type": "text/plain"},
            )
            with patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_web_url("https://example.com/plain.txt")
                assert r.status == "ok"
                assert r.chunks > 0
        finally:
            _cleanup(store)

    async def test_invalid_declared_text_encoding_is_failed(self):
        importer, store = _make_importer()
        try:
            from src.tools.safe_fetch import SafeFetchResponse

            response = SafeFetchResponse(
                status=200,
                headers={"Content-Type": "text/plain; charset=utf-8"},
                body=b"valid\n\xff",
                content_type="text/plain; charset=utf-8",
                url="https://example.com/invalid.txt",
            )

            async def mock_fetch(url, **kwargs):
                return response

            with patch("src.tools.safe_fetch.safe_fetch", mock_fetch):
                result = await importer.import_web_url(response.url)
            assert result.status == "error"
            assert "without data loss" in result.error
            assert store.list_sources() == []
        finally:
            _cleanup(store)

    async def test_declared_non_utf8_charset_is_supported_strictly(self):
        importer, store = _make_importer()
        try:
            from src.tools.safe_fetch import SafeFetchResponse

            response = SafeFetchResponse(
                status=200,
                headers={"Content-Type": "text/plain; charset=latin-1"},
                body="café knowledge".encode("latin-1"),
                content_type="text/plain; charset=latin-1",
                url="https://example.com/latin1.txt",
            )

            async def mock_fetch(url, **kwargs):
                return response

            with patch("src.tools.safe_fetch.safe_fetch", mock_fetch):
                result = await importer.import_web_url(response.url)
            assert result.status == "ok"
            assert store.get_source_content(response.url) == "café knowledge"
        finally:
            _cleanup(store)

    async def test_store_failure_is_reported(self):
        store = MagicMock()
        store.ingest = AsyncMock(side_effect=RuntimeError("index failed"))
        importer = BulkImporter(store)
        response = _mock_aiohttp_response(
            status=200,
            text_data="valid web content",
            headers={"Content-Type": "text/plain; charset=utf-8"},
        )
        with patch("src.tools.safe_fetch.safe_fetch", response):
            result = await importer.import_web_url("https://example.com/fail")
        assert result.status == "error"
        assert result.error == "index failed"

    async def test_custom_source(self):
        importer, store = _make_importer()
        try:
            mock_session = _mock_aiohttp_response(
                status=200,
                text_data="Content for custom source.",
                headers={"Content-Type": "text/plain"},
            )
            with patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_web_url(
                    "https://example.com/page",
                    source="my-docs",
                )
                assert r.source == "my-docs"
        finally:
            _cleanup(store)

    async def test_empty_page(self):
        importer, store = _make_importer()
        try:
            mock_session = _mock_aiohttp_response(
                status=200,
                text_data="<html><body></body></html>",
                headers={"Content-Type": "text/html"},
            )
            with patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_web_url("https://example.com/empty")
                assert r.status == "skipped"
                assert "no content" in r.error
        finally:
            _cleanup(store)

    async def test_content_truncation(self):
        importer, store = _make_importer()
        try:
            big_content = "x" * (FETCH_MAX_CHARS + 1000)
            mock_session = _mock_aiohttp_response(
                status=200,
                text_data=big_content,
                headers={"Content-Type": "text/plain"},
            )
            with patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_web_url("https://example.com/huge")
                assert r.status == "ok"
                content = store.get_source_content("https://example.com/huge")
                assert content is not None
                assert len(content) <= FETCH_MAX_CHARS + 100
        finally:
            _cleanup(store)

    async def test_default_source_is_url(self):
        importer, store = _make_importer()
        try:
            mock_session = _mock_aiohttp_response(
                status=200,
                text_data="edge case content",
                headers={"Content-Type": "text/plain"},
            )
            with patch("src.tools.safe_fetch.safe_fetch", mock_session):
                r = await importer.import_web_url("https://docs.example.com/guide")
                assert r.source == "https://docs.example.com/guide"
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# Batch import
# ---------------------------------------------------------------------------


class TestImportBatch:
    async def test_empty_items(self):
        importer, store = _make_importer()
        try:
            batch = await importer.import_batch([])
            assert batch.total == 0
            assert batch.succeeded == 0
        finally:
            _cleanup(store)

    async def test_unknown_type(self):
        importer, store = _make_importer()
        try:
            batch = await importer.import_batch([{"type": "foobar"}])
            assert batch.failed == 1
            assert "unknown type" in batch.results[0]["error"]
        finally:
            _cleanup(store)

    async def test_missing_type(self):
        importer, store = _make_importer()
        try:
            batch = await importer.import_batch([{"url": "https://example.com"}])
            assert batch.failed == 1
        finally:
            _cleanup(store)

    async def test_directory_type(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "doc.md").write_text("batch dir import content")
                batch = await importer.import_batch([
                    {"type": "directory", "path": tmpdir},
                ])
                assert batch.succeeded == 1
                assert batch.results[0]["status"] == "ok"
        finally:
            _cleanup(store)

    async def test_file_type(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "doc.md"
                path.write_text("batch file import content", encoding="utf-8")
                batch = await importer.import_batch([
                    {"type": "file", "path": str(path)},
                ])
                assert batch.succeeded == 1
                assert batch.results[0]["source"] == path.resolve().as_uri()
        finally:
            _cleanup(store)

    async def test_file_missing_path(self):
        importer, store = _make_importer()
        try:
            batch = await importer.import_batch([{"type": "file"}])
            assert batch.failed == 1
            assert "path is required" in batch.results[0]["error"]
        finally:
            _cleanup(store)

    async def test_directory_missing_path(self):
        importer, store = _make_importer()
        try:
            batch = await importer.import_batch([{"type": "directory"}])
            assert batch.failed == 1
            assert "path is required" in batch.results[0]["error"]
        finally:
            _cleanup(store)

    async def test_url_type(self):
        importer, store = _make_importer()
        try:
            mock_session = _mock_aiohttp_response(
                status=200,
                text_data="batch url import content",
                headers={"Content-Type": "text/plain"},
            )
            with patch("src.tools.safe_fetch.safe_fetch", mock_session):
                batch = await importer.import_batch([
                    {"type": "url", "url": "https://example.com/page"},
                ])
                assert batch.succeeded == 1
        finally:
            _cleanup(store)

    async def test_url_missing_url(self):
        importer, store = _make_importer()
        try:
            batch = await importer.import_batch([{"type": "url"}])
            assert batch.failed == 1
            assert "url is required" in batch.results[0]["error"]
        finally:
            _cleanup(store)

    async def test_pdf_missing_url(self):
        importer, store = _make_importer()
        try:
            batch = await importer.import_batch([{"type": "pdf"}])
            assert batch.failed == 1
            assert "url is required" in batch.results[0]["error"]
        finally:
            _cleanup(store)

    async def test_mixed_batch(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "doc.md").write_text("dir content")

                mock_session = _mock_aiohttp_response(
                    status=200,
                    text_data="web content for mixed batch",
                    headers={"Content-Type": "text/plain"},
                )
                with patch("src.tools.safe_fetch.safe_fetch", mock_session):
                    batch = await importer.import_batch([
                        {"type": "directory", "path": tmpdir},
                        {"type": "url", "url": "https://example.com/page"},
                    ])
                    assert batch.total == 2
                    assert batch.succeeded == 2
        finally:
            _cleanup(store)

    async def test_batch_size_limit(self):
        importer, store = _make_importer()
        try:
            items = [{"type": "url", "url": f"ftp://bad/{i}"} for i in range(MAX_BATCH_SIZE + 10)]
            batch = await importer.import_batch(items)
            assert batch.total == MAX_BATCH_SIZE
        finally:
            _cleanup(store)

    async def test_skipped_result_is_counted(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                batch = await importer.import_batch([
                    {"type": "directory", "path": tmpdir},
                ])
                assert batch.skipped == 1
                assert batch.results[0]["status"] == "skipped"
        finally:
            _cleanup(store)

    async def test_counts_accumulate(self):
        importer, store = _make_importer()
        try:
            batch = await importer.import_batch([
                {"type": "url", "url": "ftp://invalid"},  # error
                {"type": "url"},  # error (missing url)
                {"type": "directory", "path": "/nonexistent/xyz"},  # error
            ])
            assert batch.total == 3
            assert batch.failed == 3
            assert batch.succeeded == 0
        finally:
            _cleanup(store)

    async def test_directory_with_pattern(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "a.md").write_text("markdown")
                (Path(tmpdir) / "b.txt").write_text("text")
                batch = await importer.import_batch([
                    {"type": "directory", "path": tmpdir, "pattern": "*.txt"},
                ])
                assert batch.succeeded == 1
                assert batch.results[0]["source"] == (Path(tmpdir) / "b.txt").resolve().as_uri()
        finally:
            _cleanup(store)

    async def test_pdf_via_batch(self):
        importer, store = _make_importer()
        try:
            doc = _mock_fitz_doc(text_per_page=["PDF batch content."], page_count=1)
            mock_fitz = MagicMock()
            mock_fitz.open.return_value = doc
            mock_session = _mock_aiohttp_response(status=200, read_data=b"pdf bytes")

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("src.tools.safe_fetch.safe_fetch", mock_session):
                batch = await importer.import_batch([
                    {"type": "pdf", "url": "https://example.com/doc.pdf"},
                ])
                assert batch.succeeded == 1
        finally:
            _cleanup(store)

    async def test_pdf_with_custom_source(self):
        importer, store = _make_importer()
        try:
            doc = _mock_fitz_doc(text_per_page=["PDF source content."], page_count=1)
            mock_fitz = MagicMock()
            mock_fitz.open.return_value = doc
            mock_session = _mock_aiohttp_response(status=200, read_data=b"pdf bytes")

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("src.tools.safe_fetch.safe_fetch", mock_session):
                batch = await importer.import_batch([
                    {"type": "pdf", "url": "https://example.com/doc.pdf", "source": "my-pdf"},
                ])
                assert batch.results[0]["source"] == "my-pdf"
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# Tool handler (_execute_tool in background_task.py)
# ---------------------------------------------------------------------------


class TestToolHandler:
    async def test_search_knowledge_tool_reports_invalid_query_and_failure(self):
        from src.discord.background_task import _execute_tool

        executor = MagicMock()
        skill_mgr = MagicMock()
        skill_mgr.has_skill.return_value = False
        store = MagicMock()

        async def search_with_real_validation(query, *_args, **_kwargs):
            validate_search_query(query)
            return []

        store.search_hybrid = AsyncMock(side_effect=search_with_real_validation)
        result = await _execute_tool(
            "search_knowledge", {"query": "\ud800"}, executor, skill_mgr,
            store, object(), "test-user",
        )
        assert "Invalid query" in result

        store.search_hybrid = AsyncMock(side_effect=RuntimeError("database failure"))
        result = await _execute_tool(
            "search_knowledge", {"query": "valid"}, executor, skill_mgr,
            store, object(), "test-user",
        )
        assert "Search failed" in result

    async def test_ingest_document_tool_reports_zero_as_failure(self):
        from src.discord.background_task import _execute_tool

        executor = MagicMock()
        skill_mgr = MagicMock()
        skill_mgr.has_skill.return_value = False
        store = MagicMock()
        store.ingest = AsyncMock(return_value=0)

        result = await _execute_tool(
            "ingest_document",
            {"source": "doc.md", "content": "body"},
            executor,
            skill_mgr,
            store,
            object(),
            "test-user",
        )
        assert isinstance(result, ToolResult)
        assert result.ok is False
        assert result.error == "Failed to ingest 'doc.md' durably."
        assert str(result) == result.error

    async def test_bulk_ingest_tool_routing(self):
        from src.discord.background_task import _execute_tool

        store = _tmp_store()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "doc.md").write_text("tool handler test content")

                executor = MagicMock()
                skill_mgr = MagicMock()
                skill_mgr.has_skill.return_value = False

                result = await _execute_tool(
                    "bulk_ingest_knowledge",
                    {"items": [{"type": "directory", "path": tmpdir}]},
                    executor,
                    skill_mgr,
                    store,
                    None,
                    "test-user",
                )
                assert "1 succeeded" in result
                assert "0 failed" in result
        finally:
            _cleanup(store)

    async def test_bulk_ingest_missing_items(self):
        from src.discord.background_task import _execute_tool

        store = _tmp_store()
        try:
            executor = MagicMock()
            skill_mgr = MagicMock()
            skill_mgr.has_skill.return_value = False

            result = await _execute_tool(
                "bulk_ingest_knowledge",
                {},
                executor,
                skill_mgr,
                store,
                None,
                "test-user",
            )
            assert "required" in result.lower()
        finally:
            _cleanup(store)

    async def test_bulk_ingest_invalid_items(self):
        from src.discord.background_task import _execute_tool

        store = _tmp_store()
        try:
            executor = MagicMock()
            skill_mgr = MagicMock()
            skill_mgr.has_skill.return_value = False

            result = await _execute_tool(
                "bulk_ingest_knowledge",
                {"items": "not a list"},
                executor,
                skill_mgr,
                store,
                None,
                "test-user",
            )
            assert "required" in result.lower()
        finally:
            _cleanup(store)

    async def test_bulk_ingest_result_format(self):
        from src.discord.background_task import _execute_tool

        store = _tmp_store()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "a.md").write_text("content a")
                (Path(tmpdir) / "b.md").write_text("content b")

                executor = MagicMock()
                skill_mgr = MagicMock()
                skill_mgr.has_skill.return_value = False

                result = await _execute_tool(
                    "bulk_ingest_knowledge",
                    {"items": [{"type": "directory", "path": tmpdir}]},
                    executor,
                    skill_mgr,
                    store,
                    None,
                    "test-user",
                )
                assert "[OK]" in result
                assert "a.md" in result
                assert "b.md" in result
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------------


class TestImportAPI:
    async def _make_app(self, store=None):
        s = store or _tmp_store()
        app = web.Application()
        routes_list = web.RouteTableDef()

        @routes_list.post("/api/knowledge/import")
        async def import_knowledge(request: web.Request) -> web.Response:
            if not s.available:
                return web.json_response({"error": "knowledge store not available"}, status=503)
            data = await request.json()
            items = data.get("items")
            if not items or not isinstance(items, list):
                return web.json_response({"error": "items (array) is required"}, status=400)
            from src.knowledge.importer import BulkImporter
            importer = BulkImporter(s, None)
            batch = await importer.import_batch(items, uploader="web-api")
            return web.json_response({
                "total": batch.total,
                "succeeded": batch.succeeded,
                "failed": batch.failed,
                "skipped": batch.skipped,
                "results": batch.results,
            })

        app.router.add_routes(routes_list)
        return app, s

    async def test_missing_items(self):
        app, store = await self._make_app()
        try:
            async with TestClient(TestServer(app)) as client:
                resp = await client.post("/api/knowledge/import", json={})
                assert resp.status == 400
                data = await resp.json()
                assert "required" in data["error"]
        finally:
            _cleanup(store)

    async def test_invalid_items_type(self):
        app, store = await self._make_app()
        try:
            async with TestClient(TestServer(app)) as client:
                resp = await client.post("/api/knowledge/import", json={"items": "string"})
                assert resp.status == 400
        finally:
            _cleanup(store)

    async def test_directory_import_via_api(self):
        app, store = await self._make_app()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "api_test.md").write_text("API import test content")
                async with TestClient(TestServer(app)) as client:
                    resp = await client.post("/api/knowledge/import", json={
                        "items": [{"type": "directory", "path": tmpdir}],
                    })
                    assert resp.status == 200
                    data = await resp.json()
                    assert data["total"] == 1
                    assert data["succeeded"] == 1
                    assert len(data["results"]) == 1
        finally:
            _cleanup(store)

    async def test_response_structure(self):
        app, store = await self._make_app()
        try:
            async with TestClient(TestServer(app)) as client:
                resp = await client.post("/api/knowledge/import", json={
                    "items": [{"type": "url", "url": "ftp://bad"}],
                })
                data = await resp.json()
                assert "total" in data
                assert "succeeded" in data
                assert "failed" in data
                assert "skipped" in data
                assert "results" in data
                assert isinstance(data["results"], list)
                assert "source" in data["results"][0]
                assert "status" in data["results"][0]
                assert "chunks" in data["results"][0]
                assert "error" in data["results"][0]
        finally:
            _cleanup(store)

    async def test_unavailable_store(self):
        store = _tmp_store()
        store.close()
        app, _ = await self._make_app(store)
        try:
            async with TestClient(TestServer(app)) as client:
                resp = await client.post("/api/knowledge/import", json={
                    "items": [{"type": "url", "url": "https://x.com"}],
                })
                assert resp.status == 503
        finally:
            path = getattr(store, "_db_path", None)
            if path and os.path.exists(path):
                os.unlink(path)

    async def test_mixed_results_via_api(self):
        app, store = await self._make_app()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "good.md").write_text("good content")
                async with TestClient(TestServer(app)) as client:
                    resp = await client.post("/api/knowledge/import", json={
                        "items": [
                            {"type": "directory", "path": tmpdir},
                            {"type": "url", "url": "ftp://bad"},
                        ],
                    })
                    data = await resp.json()
                    assert data["succeeded"] == 1
                    assert data["failed"] == 1
        finally:
            _cleanup(store)


# ---------------------------------------------------------------------------
# Tool definition
# ---------------------------------------------------------------------------


class TestToolDefinition:
    def test_bulk_ingest_tool_exists(self):
        from src.tools.registry import TOOLS
        names = [t["name"] for t in TOOLS]
        assert "bulk_ingest_knowledge" in names

    def test_tool_schema_structure(self):
        from src.tools.registry import TOOLS
        tool = next(t for t in TOOLS if t["name"] == "bulk_ingest_knowledge")
        schema = tool["input_schema"]
        assert schema["type"] == "object"
        assert "items" in schema["properties"]
        assert schema["properties"]["items"]["type"] == "array"
        assert "items" in schema["required"]

    def test_item_schema_has_type_enum(self):
        from src.tools.registry import TOOLS
        tool = next(t for t in TOOLS if t["name"] == "bulk_ingest_knowledge")
        item_schema = tool["input_schema"]["properties"]["items"]["items"]
        assert item_schema["properties"]["type"]["enum"] == ["directory", "file", "pdf", "url"]

    def test_tool_has_description(self):
        from src.tools.registry import TOOLS
        tool = next(t for t in TOOLS if t["name"] == "bulk_ingest_knowledge")
        assert len(tool["description"]) > 20


# ---------------------------------------------------------------------------
# Constants and module-level tests
# ---------------------------------------------------------------------------


class TestConstants:
    def test_max_batch_size_positive(self):
        assert MAX_BATCH_SIZE > 0

    def test_max_file_bytes_reasonable(self):
        assert MAX_FILE_BYTES > 1000
        assert MAX_FILE_BYTES <= 10_000_000

    def test_max_pdf_bytes_reasonable(self):
        assert MAX_PDF_BYTES > MAX_FILE_BYTES

    def test_fetch_max_chars_larger_than_tool_output(self):
        assert FETCH_MAX_CHARS > 12000

    def test_pdf_max_chars_positive(self):
        assert PDF_MAX_CHARS > 0

    def test_allowed_extensions_include_common(self):
        assert ".md" in DIR_ALLOWED_EXTENSIONS
        assert ".txt" in DIR_ALLOWED_EXTENSIONS
        assert ".yaml" in DIR_ALLOWED_EXTENSIONS
        assert ".json" in DIR_ALLOWED_EXTENSIONS

    def test_no_binary_extensions(self):
        binary = {".exe", ".bin", ".dll", ".so", ".o", ".pyc", ".class"}
        assert not binary & DIR_ALLOWED_EXTENSIONS


class TestModuleImports:
    def test_importer_importable(self):
        from src.knowledge.importer import BulkImporter
        assert BulkImporter is not None

    def test_result_types_importable(self):
        from src.knowledge.importer import BatchResult, ImportResult
        assert ImportResult is not None
        assert BatchResult is not None


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    async def test_directory_with_subdirs_only(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                sub = Path(tmpdir) / "empty_sub"
                sub.mkdir()
                results = await importer.import_directory(tmpdir)
                assert len(results) == 1
                assert results[0].status == "skipped"
        finally:
            _cleanup(store)

    async def test_directory_unicode_content(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "unicode.md").write_text("日本語テスト content 中文")
                results = await importer.import_directory(tmpdir)
                assert results[0].status == "ok"
        finally:
            _cleanup(store)

    async def test_pdf_source_fallback_to_url(self):
        importer, store = _make_importer()
        try:
            r = await importer.import_pdf_url("ftp://bad")
            assert r.source == "ftp://bad"
        finally:
            _cleanup(store)

    async def test_dedup_works_across_batch(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                (Path(tmpdir) / "a.md").write_text("identical content")
                (Path(tmpdir) / "b.md").write_text("identical content")
                results = await importer.import_directory(tmpdir)
                ok_results = [r for r in results if r.status == "ok"]
                assert len(ok_results) >= 1
        finally:
            _cleanup(store)

    async def test_batch_result_dict_format(self):
        importer, store = _make_importer()
        try:
            batch = await importer.import_batch([
                {"type": "directory", "path": "/nonexistent/path/abc123"},
            ])
            r = batch.results[0]
            assert isinstance(r, dict)
            assert set(r.keys()) == {"source", "status", "chunks", "error"}
        finally:
            _cleanup(store)

    @pytest.mark.skipif(os.getuid() == 0, reason="root ignores filesystem permissions")
    async def test_directory_read_error_handled(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                f = Path(tmpdir) / "unreadable.md"
                f.write_text("content")
                f.chmod(0o000)
                try:
                    results = await importer.import_directory(tmpdir)
                    assert len(results) == 1
                    assert results[0].status == "error"
                finally:
                    f.chmod(0o644)
        finally:
            _cleanup(store)

    async def test_pdf_download_exception(self):
        importer, store = _make_importer()
        try:
            mock_fitz = MagicMock()

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("src.tools.safe_fetch.safe_fetch",
                       _fake_safe_fetch_raises(Exception("connection refused"))):
                r = await importer.import_pdf_url("https://example.com/err.pdf")
                assert r.status == "error"
                assert "download failed" in r.error
        finally:
            _cleanup(store)

    async def test_web_fetch_exception(self):
        importer, store = _make_importer()
        try:
            with patch("src.tools.safe_fetch.safe_fetch",
                       _fake_safe_fetch_raises(Exception("timeout"))):
                r = await importer.import_web_url("https://example.com/timeout")
                assert r.status == "error"
                assert "fetch failed" in r.error
        finally:
            _cleanup(store)

    async def test_multiple_directories_in_batch(self):
        importer, store = _make_importer()
        try:
            with tempfile.TemporaryDirectory() as d1, tempfile.TemporaryDirectory() as d2:
                (Path(d1) / "a.md").write_text("content a")
                (Path(d2) / "b.md").write_text("content b")
                batch = await importer.import_batch([
                    {"type": "directory", "path": d1},
                    {"type": "directory", "path": d2},
                ])
                assert batch.succeeded == 2
        finally:
            _cleanup(store)
