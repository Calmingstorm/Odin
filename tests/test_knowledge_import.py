"""Tests for bulk knowledge import — markdown dirs, PDFs, web URLs (Round 25)."""
from __future__ import annotations

import asyncio
import os
import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.knowledge.importer import (
    BulkImporter,
    BatchResult,
    ImportResult,
    MAX_BATCH_SIZE,
    MAX_FILE_BYTES,
    MAX_PDF_BYTES,
    FETCH_MAX_CHARS,
    PDF_MAX_CHARS,
    DIR_ALLOWED_EXTENSIONS,
)
from src.knowledge.store import KnowledgeStore

try:
    import fitz
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
                assert results[0].source == "readme.md"
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
                assert "docs/api/endpoints.md" in results[0].source
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
                assert results[0].source == "b.txt"
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
                assert "doc.md" in sources
                assert "binary.exe" not in sources
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
                assert statuses.get("empty.md") == "skipped"
                assert statuses.get("content.md") == "ok"
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
                skip_count = sum(1 for r in results if r.status == "skipped" and "batch limit" in r.error)
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
                assert results[0].source == "subdir/file.md"
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
                    assert f"file{ext}" in ok_sources
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
    mock_resp = AsyncMock()
    mock_resp.status = status
    mock_resp.read = AsyncMock(return_value=read_data)
    mock_resp.text = AsyncMock(return_value=text_data)
    mock_resp.headers = headers or {}
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_session = AsyncMock()
    mock_session.get = MagicMock(return_value=mock_resp)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    return mock_session


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
                 patch("aiohttp.ClientSession", return_value=mock_session):
                r = await importer.import_pdf_url("https://example.com/missing.pdf")
                assert r.status == "error"
                assert "404" in r.error
        finally:
            _cleanup(store)

    async def test_successful_pdf_import(self):
        importer, store = _make_importer()
        try:
            doc = _mock_fitz_doc(text_per_page=["Test PDF content for knowledge import."], page_count=1)
            mock_fitz = MagicMock()
            mock_fitz.open.return_value = doc
            mock_session = _mock_aiohttp_response(status=200, read_data=b"fake pdf bytes")

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("aiohttp.ClientSession", return_value=mock_session):
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
                 patch("aiohttp.ClientSession", return_value=mock_session):
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
                 patch("aiohttp.ClientSession", return_value=mock_session):
                r = await importer.import_pdf_url("https://example.com/empty.pdf")
                assert r.status == "skipped"
                assert "no text" in r.error
        finally:
            _cleanup(store)

    async def test_pdf_too_large(self):
        importer, store = _make_importer()
        try:
            big_bytes = b"x" * (MAX_PDF_BYTES + 1)
            mock_fitz = MagicMock()
            mock_session = _mock_aiohttp_response(status=200, read_data=big_bytes)

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("aiohttp.ClientSession", return_value=mock_session):
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
                 patch("aiohttp.ClientSession", return_value=mock_session):
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
                 patch("aiohttp.ClientSession", return_value=mock_session):
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
                 patch("aiohttp.ClientSession", return_value=mock_session):
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
            with patch("aiohttp.ClientSession", return_value=mock_session):
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
                text_data="<html><body><p>Important knowledge content for testing.</p></body></html>",
                headers={"Content-Type": "text/html; charset=utf-8"},
            )
            with patch("aiohttp.ClientSession", return_value=mock_session):
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
            with patch("aiohttp.ClientSession", return_value=mock_session):
                r = await importer.import_web_url("https://example.com/plain.txt")
                assert r.status == "ok"
                assert r.chunks > 0
        finally:
            _cleanup(store)

    async def test_custom_source(self):
        importer, store = _make_importer()
        try:
            mock_session = _mock_aiohttp_response(
                status=200,
                text_data="Content for custom source.",
                headers={"Content-Type": "text/plain"},
            )
            with patch("aiohttp.ClientSession", return_value=mock_session):
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
            with patch("aiohttp.ClientSession", return_value=mock_session):
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
            with patch("aiohttp.ClientSession", return_value=mock_session):
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
            with patch("aiohttp.ClientSession", return_value=mock_session):
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
            with patch("aiohttp.ClientSession", return_value=mock_session):
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
                with patch("aiohttp.ClientSession", return_value=mock_session):
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
                assert batch.results[0]["source"] == "b.txt"
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
                 patch("aiohttp.ClientSession", return_value=mock_session):
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
                 patch("aiohttp.ClientSession", return_value=mock_session):
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
        assert item_schema["properties"]["type"]["enum"] == ["directory", "pdf", "url"]

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
        from src.knowledge.importer import ImportResult, BatchResult
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
            mock_session = AsyncMock()
            mock_session.get = MagicMock(side_effect=Exception("connection refused"))
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)

            with patch.dict("sys.modules", {"fitz": mock_fitz}), \
                 patch("aiohttp.ClientSession", return_value=mock_session):
                r = await importer.import_pdf_url("https://example.com/err.pdf")
                assert r.status == "error"
                assert "download failed" in r.error
        finally:
            _cleanup(store)

    async def test_web_fetch_exception(self):
        importer, store = _make_importer()
        try:
            mock_session = AsyncMock()
            mock_session.get = MagicMock(side_effect=Exception("timeout"))
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)

            with patch("aiohttp.ClientSession", return_value=mock_session):
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
