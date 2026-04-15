"""Bulk knowledge import — markdown dirs, PDFs, web URLs.

Provides a BulkImporter that orchestrates ingesting multiple documents into the
KnowledgeStore in a single operation, with per-item status tracking.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

import aiohttp

from ..odin_log import get_logger

if TYPE_CHECKING:
    from ..search.embedder import LocalEmbedder
    from .store import KnowledgeStore

log = get_logger("knowledge.importer")

MAX_BATCH_SIZE = 50
MAX_FILE_BYTES = 512_000  # 500 KB per file
MAX_PDF_BYTES = 50_000_000  # 50 MB
FETCH_TIMEOUT = aiohttp.ClientTimeout(total=30)
FETCH_MAX_CHARS = 100_000  # larger than tool output — we want full content for ingestion
PDF_MAX_CHARS = 500_000
DIR_ALLOWED_EXTENSIONS = {".md", ".txt", ".rst", ".adoc", ".log", ".csv", ".json", ".yaml", ".yml", ".toml", ".cfg", ".ini", ".conf"}


@dataclass
class ImportResult:
    source: str
    status: str  # "ok", "error", "skipped"
    chunks: int = 0
    error: str = ""


@dataclass
class BatchResult:
    total: int = 0
    succeeded: int = 0
    failed: int = 0
    skipped: int = 0
    results: list[dict] = field(default_factory=list)


class BulkImporter:
    """Orchestrates bulk ingestion of files, PDFs, and web pages."""

    def __init__(self, store: KnowledgeStore, embedder: LocalEmbedder | None = None) -> None:
        self._store = store
        self._embedder = embedder

    async def import_directory(
        self,
        directory: str,
        pattern: str = "**/*.md",
        uploader: str = "bulk-import",
    ) -> list[ImportResult]:
        base = Path(directory)
        if not base.is_dir():
            return [ImportResult(source=directory, status="error", error="directory not found")]

        results: list[ImportResult] = []
        resolved_base = base.resolve()
        files = sorted(
            f for f in base.glob(pattern)
            if f.resolve().is_relative_to(resolved_base)
        )
        if not files:
            return [ImportResult(source=directory, status="skipped", error="no files matched pattern")]

        count = 0
        for fpath in files:
            if not fpath.is_file():
                continue
            ext = fpath.suffix.lower()
            if ext not in DIR_ALLOWED_EXTENSIONS:
                continue
            source_name = str(fpath.relative_to(base))
            if count >= MAX_BATCH_SIZE:
                results.append(ImportResult(
                    source=source_name, status="skipped",
                    error=f"batch limit ({MAX_BATCH_SIZE}) reached",
                ))
                continue
            try:
                size = fpath.stat().st_size
                if size > MAX_FILE_BYTES:
                    results.append(ImportResult(
                        source=source_name, status="skipped",
                        error=f"file too large ({size} bytes, max {MAX_FILE_BYTES})",
                    ))
                    count += 1
                    continue
                content = await asyncio.to_thread(fpath.read_text, encoding="utf-8", errors="replace")
                if not content.strip():
                    results.append(ImportResult(source=source_name, status="skipped", error="empty file"))
                    count += 1
                    continue
                chunks = await self._store.ingest(
                    content, source_name, embedder=self._embedder, uploader=uploader,
                )
                results.append(ImportResult(source=source_name, status="ok", chunks=chunks))
            except Exception as e:
                results.append(ImportResult(source=source_name, status="error", error=str(e)))
            count += 1

        return results

    async def import_pdf_url(
        self,
        url: str,
        source: str | None = None,
        uploader: str = "bulk-import",
    ) -> ImportResult:
        if not url.startswith(("http://", "https://")):
            return ImportResult(source=url, status="error", error="only http/https URLs supported")

        try:
            import fitz
        except ImportError:
            return ImportResult(source=url, status="error", error="PyMuPDF (fitz) not installed")

        src = source or url.rsplit("/", 1)[-1] or url
        try:
            async with aiohttp.ClientSession(timeout=FETCH_TIMEOUT) as session:
                async with session.get(url) as resp:
                    if resp.status != 200:
                        return ImportResult(source=src, status="error", error=f"HTTP {resp.status}")
                    pdf_bytes = await resp.read()
                    if len(pdf_bytes) > MAX_PDF_BYTES:
                        return ImportResult(source=src, status="error", error="PDF too large")
        except Exception as e:
            return ImportResult(source=src, status="error", error=f"download failed: {e}")

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            return ImportResult(source=src, status="error", error=f"failed to parse PDF: {e}")

        try:
            parts = []
            for i in range(doc.page_count):
                text = doc[i].get_text()
                if text.strip():
                    parts.append(f"## Page {i + 1}\n{text}")
            content = "\n\n".join(parts)
            if not content.strip():
                return ImportResult(source=src, status="skipped", error="PDF contains no text")
            if len(content) > PDF_MAX_CHARS:
                content = content[:PDF_MAX_CHARS]
            chunks = await self._store.ingest(
                content, src, embedder=self._embedder, uploader=uploader,
            )
            return ImportResult(source=src, status="ok", chunks=chunks)
        finally:
            doc.close()

    async def import_web_url(
        self,
        url: str,
        source: str | None = None,
        uploader: str = "bulk-import",
    ) -> ImportResult:
        if not url.startswith(("http://", "https://")):
            return ImportResult(source=url, status="error", error="only http/https URLs supported")

        from ..tools.web import _html_to_text

        src = source or url
        try:
            async with aiohttp.ClientSession(timeout=FETCH_TIMEOUT) as session:
                async with session.get(
                    url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; OdinBot/1.0)"},
                    allow_redirects=True,
                    ssl=False,
                ) as resp:
                    if resp.status != 200:
                        return ImportResult(source=src, status="error", error=f"HTTP {resp.status}")
                    ct = resp.headers.get("Content-Type", "")
                    body = await resp.text(errors="replace")
        except Exception as e:
            return ImportResult(source=src, status="error", error=f"fetch failed: {e}")

        if "html" in ct:
            content = _html_to_text(body)
        else:
            content = body

        if not content.strip():
            return ImportResult(source=src, status="skipped", error="page has no content")
        if len(content) > FETCH_MAX_CHARS:
            content = content[:FETCH_MAX_CHARS]

        try:
            chunks = await self._store.ingest(
                content, src, embedder=self._embedder, uploader=uploader,
            )
            return ImportResult(source=src, status="ok", chunks=chunks)
        except Exception as e:
            return ImportResult(source=src, status="error", error=str(e))

    async def import_batch(
        self,
        items: list[dict],
        uploader: str = "bulk-import",
    ) -> BatchResult:
        if not items:
            return BatchResult()

        if len(items) > MAX_BATCH_SIZE:
            items = items[:MAX_BATCH_SIZE]

        batch = BatchResult(total=len(items))

        for item in items:
            item_type = item.get("type", "")
            results: list[ImportResult] = []

            if item_type == "directory":
                path = item.get("path", "")
                pattern = item.get("pattern", "**/*.md")
                if not path:
                    results = [ImportResult(source="", status="error", error="path is required")]
                else:
                    results = await self.import_directory(path, pattern=pattern, uploader=uploader)

            elif item_type == "pdf":
                url = item.get("url", "")
                source = item.get("source")
                if not url:
                    results = [ImportResult(source="", status="error", error="url is required")]
                else:
                    results = [await self.import_pdf_url(url, source=source, uploader=uploader)]

            elif item_type == "url":
                url = item.get("url", "")
                source = item.get("source")
                if not url:
                    results = [ImportResult(source="", status="error", error="url is required")]
                else:
                    results = [await self.import_web_url(url, source=source, uploader=uploader)]

            else:
                results = [ImportResult(
                    source=str(item), status="error",
                    error=f"unknown type '{item_type}' — use 'directory', 'pdf', or 'url'",
                )]

            for r in results:
                if r.status == "ok":
                    batch.succeeded += 1
                elif r.status == "error":
                    batch.failed += 1
                else:
                    batch.skipped += 1
                batch.results.append({
                    "source": r.source, "status": r.status,
                    "chunks": r.chunks, "error": r.error,
                })

        return batch
