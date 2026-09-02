"""Bulk knowledge import — markdown dirs, PDFs, web URLs.

Provides a BulkImporter that orchestrates ingesting multiple documents into the
KnowledgeStore in a single operation, with per-item status tracking.
"""
from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING

import aiohttp

from ..odin_log import get_logger

if TYPE_CHECKING:
    from ..search.embedder import LocalEmbedder
    from .store import KnowledgeStore

log = get_logger("knowledge.importer")

MAX_BATCH_SIZE = 50
MAX_FILE_BYTES = 512_000  # 500 KB per file

SAFE_IMPORT_ROOTS = (
    "/opt/odin",
    "/opt/heimdall",
    "/tmp",
    "/home",
    "/root",
)
MAX_PDF_BYTES = 50_000_000  # 50 MB
FETCH_TIMEOUT = aiohttp.ClientTimeout(total=30)
FETCH_MAX_CHARS = 100_000  # larger than tool output — we want full content for ingestion
PDF_MAX_CHARS = 500_000
_LEGACY_MIGRATION_LOCK = asyncio.Lock()
DIR_ALLOWED_EXTENSIONS = {
    ".md",
    ".txt",
    ".rst",
    ".adoc",
    ".log",
    ".csv",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".cfg",
    ".ini",
    ".conf",
}


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

    @staticmethod
    def _in_safe_import_root(path: Path) -> bool:
        return any(path.is_relative_to(root) for root in SAFE_IMPORT_ROOTS)

    @staticmethod
    def _canonical_file_source(path: Path) -> str:
        """Return a base-independent identity for a resolved local file."""
        return path.as_uri()

    @staticmethod
    def _legacy_source_matches_path(source: str, path: Path) -> bool:
        """Whether *source* could be an old base-relative name for *path*."""
        if not source or "://" in source:
            return False
        candidate = PurePosixPath(source)
        parts = candidate.parts
        if candidate.is_absolute() or not parts or any(part in (".", "..") for part in parts):
            return False
        return len(parts) <= len(path.parts) and tuple(path.parts[-len(parts):]) == parts

    def _legacy_source_for(
        self,
        path: Path,
        content: str,
        canonical_source: str,
    ) -> tuple[str | None, str | None]:
        """Find one safely identifiable old base-relative source.

        Old source names discarded their import base.  Exact normalized content
        is therefore required in addition to a path-suffix match; ambiguous or
        changed legacy entries are reported instead of creating a second source.
        """
        entries = self._store.list_sources()
        if any(str(entry.get("source", "")) == canonical_source for entry in entries):
            return None, None

        candidates = [
            entry for entry in entries
            if self._legacy_source_matches_path(str(entry.get("source", "")), path)
        ]
        if not candidates:
            return None, None

        content_hash = hashlib.sha256(content.strip().lower().encode("utf-8")).hexdigest()
        matching = [
            str(entry["source"])
            for entry in candidates
            if entry.get("content_hash") == content_hash
        ]
        if len(matching) == 1:
            return matching[0], None

        names = ", ".join(sorted(str(entry.get("source", "")) for entry in candidates))
        if not matching:
            reason = "none has matching content"
        else:
            reason = f"{len(matching)} have matching content"
        return None, (
            f"legacy source conflict ({names}; {reason}); refusing to create "
            f"'{canonical_source}'"
        )

    @staticmethod
    def _read_file_bytes(path: Path) -> bytes:
        """Read at most one byte beyond the local-file size fence."""
        with path.open("rb") as handle:
            return handle.read(MAX_FILE_BYTES + 1)

    async def _import_resolved_file(
        self,
        path: Path,
        uploader: str,
    ) -> ImportResult:
        source_name = self._canonical_file_source(path)
        ext = path.suffix.lower()
        if ext not in DIR_ALLOWED_EXTENSIONS:
            return ImportResult(
                source=source_name,
                status="skipped",
                error=f"unsupported file extension '{ext or '<none>'}'",
            )

        try:
            size = path.stat().st_size
            if size > MAX_FILE_BYTES:
                return ImportResult(
                    source=source_name,
                    status="skipped",
                    error=f"file too large ({size} bytes, max {MAX_FILE_BYTES})",
                )
            data = await asyncio.to_thread(self._read_file_bytes, path)
            if len(data) > MAX_FILE_BYTES:
                return ImportResult(
                    source=source_name,
                    status="skipped",
                    error=f"file too large (more than {MAX_FILE_BYTES} bytes)",
                )
            try:
                content = data.decode("utf-8", errors="strict")
            except UnicodeDecodeError as exc:
                return ImportResult(
                    source=source_name,
                    status="error",
                    error=f"invalid UTF-8: {exc}",
                )
            if not content.strip():
                return ImportResult(
                    source=source_name,
                    status="skipped",
                    error="empty file",
                )

            legacy_source, conflict = self._legacy_source_for(path, content, source_name)
            if conflict:
                return ImportResult(source=source_name, status="error", error=conflict)

            if legacy_source is None:
                chunks = await self._store.ingest(
                    content, source_name, embedder=self._embedder, uploader=uploader,
                )
                return ImportResult(source=source_name, status="ok", chunks=chunks)

            # Every BulkImporter shares this migration lock.  Re-check after
            # admission so concurrent imports cannot both copy/delete the same
            # legacy source and roll back each other's canonical document.
            async with _LEGACY_MIGRATION_LOCK:
                legacy_source, conflict = self._legacy_source_for(path, content, source_name)
                if conflict:
                    return ImportResult(source=source_name, status="error", error=conflict)
                if legacy_source is None:
                    chunks = await self._store.ingest(
                        content, source_name, embedder=self._embedder, uploader=uploader,
                    )
                    return ImportResult(source=source_name, status="ok", chunks=chunks)

                # Store the canonical copy first, then remove the uniquely
                # matched legacy source.  A failed copy is removed while the
                # legacy document remains intact.
                expected_chunks = len(self._store._chunk_text(content))
                chunks = await self._store.ingest(
                    content,
                    source_name,
                    embedder=self._embedder,
                    uploader=uploader,
                    dedup=False,
                )
                if chunks != expected_chunks:
                    await self._store.delete_source_async(source_name)
                    return ImportResult(
                        source=source_name,
                        status="error",
                        error=(
                            f"legacy migration from '{legacy_source}' failed: indexed "
                            f"{chunks}/{expected_chunks} chunks"
                        ),
                    )
                removed = await self._store.delete_source_async(legacy_source)
                if removed <= 0:
                    await self._store.delete_source_async(source_name)
                    return ImportResult(
                        source=source_name,
                        status="error",
                        error=(
                            f"legacy migration from '{legacy_source}' failed; "
                            "canonical copy removed"
                        ),
                    )
                return ImportResult(source=source_name, status="ok", chunks=chunks)
        except Exception as exc:
            return ImportResult(source=source_name, status="error", error=str(exc))

    async def import_file(
        self,
        file_path: str,
        uploader: str = "bulk-import",
    ) -> ImportResult:
        """Import one local text file under the existing safe-root fence."""
        path = Path(file_path).resolve()
        if not path.is_file():
            return ImportResult(source=file_path, status="error", error="file not found")
        if not self._in_safe_import_root(path):
            return ImportResult(
                source=file_path,
                status="error",
                error=f"file not in allowed import roots: {', '.join(SAFE_IMPORT_ROOTS)}",
            )
        return await self._import_resolved_file(path, uploader)

    async def import_directory(
        self,
        directory: str,
        pattern: str = "**/*.md",
        uploader: str = "bulk-import",
    ) -> list[ImportResult]:
        base = Path(directory).resolve()
        if not base.is_dir():
            return [ImportResult(source=directory, status="error", error="directory not found")]
        if not self._in_safe_import_root(base):
            return [ImportResult(
                source=directory, status="error",
                error=f"directory not in allowed import roots: {', '.join(SAFE_IMPORT_ROOTS)}",
            )]

        results: list[ImportResult] = []
        resolved_base = base.resolve()
        files = sorted(
            f.resolve() for f in base.glob(pattern)
            if f.resolve().is_relative_to(resolved_base)
        )
        if not files:
            return [ImportResult(
                source=directory,
                status="skipped",
                error="no files matched pattern",
            )]

        count = 0
        for fpath in files:
            if not fpath.is_file():
                continue
            if fpath.suffix.lower() not in DIR_ALLOWED_EXTENSIONS:
                continue
            source_name = self._canonical_file_source(fpath)
            if count >= MAX_BATCH_SIZE:
                results.append(ImportResult(
                    source=source_name, status="skipped",
                    error=f"batch limit ({MAX_BATCH_SIZE}) reached",
                ))
                continue
            results.append(await self._import_resolved_file(fpath, uploader))
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
        from ..tools.safe_fetch import BlockedAddressError, ResponseTooLargeError, safe_fetch
        try:
            resp = await safe_fetch(url, max_bytes=MAX_PDF_BYTES, timeout=15.0)
        except BlockedAddressError:
            return ImportResult(
                source=src,
                status="error",
                error="URL targets a blocked address (private IP, localhost, or metadata endpoint)",
            )
        except ResponseTooLargeError:
            return ImportResult(
                source=src, status="error", error=f"PDF too large (max {MAX_PDF_BYTES} bytes)"
            )
        except Exception as e:
            return ImportResult(source=src, status="error", error=f"download failed: {e}")
        if resp.status != 200:
            return ImportResult(source=src, status="error", error=f"HTTP {resp.status}")
        pdf_bytes = resp.body

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
        from ..tools.safe_fetch import BlockedAddressError, safe_fetch
        try:
            resp = await safe_fetch(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; OdinBot/1.0)"},
                max_bytes=MAX_PDF_BYTES,
                timeout=15.0,
            )
        except BlockedAddressError:
            return ImportResult(
                source=src,
                status="error",
                error="URL targets a blocked address (private IP, localhost, or metadata endpoint)",
            )
        except Exception as e:
            return ImportResult(source=src, status="error", error=f"fetch failed: {e}")
        if resp.status != 200:
            return ImportResult(source=src, status="error", error=f"HTTP {resp.status}")
        ct = resp.content_type
        try:
            body = resp.text(errors="strict")
        except UnicodeDecodeError as exc:
            return ImportResult(
                source=src,
                status="error",
                error=f"response text could not be decoded without data loss: {exc}",
            )

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

            elif item_type == "file":
                path = item.get("path", "")
                if not path:
                    results = [ImportResult(source="", status="error", error="path is required")]
                else:
                    results = [await self.import_file(path, uploader=uploader)]

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
                    error=(
                        f"unknown type '{item_type}' — use 'directory', 'file', 'pdf', or 'url'"
                    ),
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
