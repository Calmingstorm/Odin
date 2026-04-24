"""Discord attachment processor.

Handles file attachments sent via Discord messages. Policy:
- Attachments are current-task context by default.
- Knowledge ingestion happens only when explicitly requested.
- Archives are unpacked/listed safely into a temp workspace.
- Large files are previewed (head+tail) and saved, not shoved
  wholesale into the model context.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import os
import re
import shutil
import time
import zipfile
import tarfile
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from ..odin_log import get_logger

log = get_logger("attachments")

_IMAGE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".gif", ".webp"})
_IMAGE_MEDIA_TYPES = frozenset({"image/png", "image/jpeg", "image/gif", "image/webp"})

_TEXT_EXTENSIONS = frozenset({
    ".txt", ".md", ".yml", ".yaml", ".json", ".toml", ".ini",
    ".cfg", ".conf", ".py", ".sh", ".bash", ".js", ".ts",
    ".html", ".css", ".xml", ".csv", ".log", ".env",
    ".service", ".timer", ".sql", ".php", ".rb", ".go",
    ".rs", ".java", ".c", ".h", ".cpp", ".hpp", ".lua",
    ".mk", ".makefile", ".dockerfile", ".gitignore",
    ".patch", ".diff", ".properties", ".gradle",
})

_ARCHIVE_EXTENSIONS = frozenset({".zip", ".tar", ".tar.gz", ".tgz"})

_INGEST_PATTERNS = re.compile(
    r"\b(ingest|index|add to knowledge|remember this|save.*(for later|to knowledge))\b",
    re.IGNORECASE,
)
_TASK_PATTERNS = re.compile(
    r"\b(debug|analyze|review|look at|check|here are the|logs?|config|fix|help|explain|what.*(wrong|happening))\b",
    re.IGNORECASE,
)


class AttachmentIntent(str, Enum):
    CURRENT_TASK = "current_task"
    INGEST_KNOWLEDGE = "ingest_knowledge"
    STORE_ONLY = "store_only"


@dataclass
class SavedAttachment:
    filename: str
    path: str
    size: int
    sha256: str
    content_type: str | None = None
    kind: str = "binary"


@dataclass
class AttachmentResult:
    inline_text: str = ""
    image_blocks: list[dict] = field(default_factory=list)
    saved_files: list[SavedAttachment] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    processing_ms: int = 0


def infer_attachment_intent(
    message_content: str,
    recent_assistant_text: str | None = None,
) -> AttachmentIntent:
    if _INGEST_PATTERNS.search(message_content):
        return AttachmentIntent.INGEST_KNOWLEDGE
    if _TASK_PATTERNS.search(message_content):
        return AttachmentIntent.CURRENT_TASK
    if recent_assistant_text and re.search(
        r"\b(attach|upload|send|share|paste|provide).*(file|log|config|output)\b",
        recent_assistant_text, re.IGNORECASE,
    ):
        return AttachmentIntent.CURRENT_TASK
    return AttachmentIntent.CURRENT_TASK


def _safe_filename(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", name)[:200]


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _detect_image_type(data: bytes) -> str | None:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"GIF8":
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _preview_text(text: str, ext: str, max_chars: int = 12000) -> str:
    if len(text) <= max_chars:
        return text
    if ext in (".log", ".csv"):
        head_chars = max_chars // 2
        tail_chars = max_chars // 2
        omitted = len(text) - max_chars
        return (
            text[:head_chars]
            + f"\n\n[... {omitted:,} chars omitted — showing head and tail ...]\n\n"
            + text[-tail_chars:]
        )
    return text[:max_chars] + f"\n\n[... truncated at {max_chars:,} chars ...]"


def _is_text_file(filename: str, content_type: str | None) -> bool:
    ext = _get_ext(filename)
    return ext in _TEXT_EXTENSIONS or (content_type and "text" in content_type)


def _get_ext(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".tar.gz"):
        return ".tar.gz"
    return "." + lower.rsplit(".", 1)[-1] if "." in lower else ""


def _is_archive(filename: str) -> bool:
    return _get_ext(filename) in _ARCHIVE_EXTENSIONS


class AttachmentProcessor:
    def __init__(
        self,
        temp_dir: str = "/tmp/odin-attachments",
        inline_max_bytes: int = 100_000,
        preview_max_chars: int = 12_000,
        large_preview_chars: int = 4_000,
        archive_max_bytes: int = 50 * 1024 * 1024,
        archive_max_files: int = 500,
        archive_extract_max_bytes: int = 200 * 1024 * 1024,
        archive_preview_total_chars: int = 20_000,
        archive_preview_file_max_bytes: int = 64_000,
        image_max_bytes: int = 5 * 1024 * 1024,
        pdf_max_bytes: int = 25 * 1024 * 1024,
        retention_hours: int = 24,
    ) -> None:
        self.temp_dir = Path(temp_dir)
        self.inline_max_bytes = inline_max_bytes
        self.preview_max_chars = preview_max_chars
        self.large_preview_chars = large_preview_chars
        self.archive_max_bytes = archive_max_bytes
        self.archive_max_files = archive_max_files
        self.archive_extract_max_bytes = archive_extract_max_bytes
        self.archive_preview_total_chars = archive_preview_total_chars
        self.archive_preview_file_max_bytes = archive_preview_file_max_bytes
        self.image_max_bytes = image_max_bytes
        self.pdf_max_bytes = pdf_max_bytes
        self.retention_hours = retention_hours

    def _workspace(self, channel_id: str, message_id: str) -> Path:
        ws = self.temp_dir / channel_id / message_id
        ws.mkdir(parents=True, exist_ok=True)
        return ws

    async def process(
        self,
        attachments: list[Any],
        channel_id: str,
        message_id: str,
        intent: AttachmentIntent = AttachmentIntent.CURRENT_TASK,
    ) -> AttachmentResult:
        t0 = time.monotonic()
        result = AttachmentResult()
        text_parts: list[str] = []

        for att in attachments:
            filename = att.filename
            ext = _get_ext(filename)
            size = att.size

            # Images
            is_image = ext in _IMAGE_EXTENSIONS or (
                att.content_type and att.content_type in _IMAGE_MEDIA_TYPES
            )
            if is_image:
                await self._handle_image(att, ext, text_parts, result)
                continue

            # PDFs
            if ext == ".pdf":
                await self._handle_pdf(att, text_parts, result)
                continue

            # Archives
            if _is_archive(filename):
                await self._handle_archive(att, channel_id, message_id, text_parts, result)
                continue

            # Text files
            if _is_text_file(filename, att.content_type):
                await self._handle_text(att, ext, intent, channel_id, message_id, text_parts, result)
                continue

            # Unknown binary
            await self._handle_binary(att, channel_id, message_id, text_parts, result)

        result.inline_text = "\n\n".join(text_parts) if text_parts else ""
        result.processing_ms = int((time.monotonic() - t0) * 1000)
        return result

    async def _handle_image(
        self, att: Any, ext: str,
        text_parts: list[str], result: AttachmentResult,
    ) -> None:
        if att.size > self.image_max_bytes:
            text_parts.append(
                f"[Image: {att.filename} ({att.size / 1024 / 1024:.1f} MB, exceeds limit)]"
            )
            return
        try:
            data = await att.read()
            b64 = base64.b64encode(data).decode("ascii")
            media_type = _detect_image_type(data) or att.content_type or f"image/{ext.lstrip('.')}"
            if media_type == "image/jpg":
                media_type = "image/jpeg"
            result.image_blocks.append({
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": b64},
            })
            text_parts.append(f"[User shared image: {att.filename}]")
            log.info("Processed image: %s (%d KB)", att.filename, att.size // 1024)
        except Exception as e:
            text_parts.append(f"[Image: {att.filename} (failed: {e})]")

    async def _handle_pdf(
        self, att: Any, text_parts: list[str], result: AttachmentResult,
    ) -> None:
        if att.size > self.pdf_max_bytes:
            text_parts.append(
                f"[PDF: {att.filename} ({att.size / 1024 / 1024:.1f} MB, exceeds limit)]"
            )
            return
        try:
            import fitz
            data = await att.read()
            doc = fitz.open(stream=data, filetype="pdf")
            try:
                pages = [f"Page {i+1}: {p.get_text()}" for i, p in enumerate(doc)]
                full = "\n".join(pages)
                preview = _preview_text(full, ".pdf", self.preview_max_chars)
                text_parts.append(
                    f"**Attached PDF: {att.filename}** ({doc.page_count} pages)\n"
                    f"```\n{preview}\n```\n"
                    f"[PDF text extracted for current task.]"
                )
            finally:
                doc.close()
        except Exception as e:
            text_parts.append(f"[PDF: {att.filename} (failed: {e})]")

    async def _handle_text(
        self, att: Any, ext: str, intent: AttachmentIntent,
        channel_id: str, message_id: str,
        text_parts: list[str], result: AttachmentResult,
    ) -> None:
        try:
            data = await att.read()
            text = data.decode("utf-8", errors="replace")
            digest = _sha256(data)

            intent_note = ""
            if intent == AttachmentIntent.INGEST_KNOWLEDGE:
                intent_note = " User requested knowledge ingestion; use ingest_document if appropriate."

            if att.size <= self.inline_max_bytes:
                preview = _preview_text(text, ext, self.preview_max_chars)
                text_parts.append(
                    f"**Attached file: {att.filename}**\n```\n{preview}\n```\n"
                    f"[File read for current task.{intent_note}]"
                )
            else:
                ws = self._workspace(channel_id, message_id)
                safe = _safe_filename(att.filename)
                save_path = ws / safe
                save_path.write_bytes(data)

                preview = _preview_text(text, ext, self.large_preview_chars)
                text_parts.append(
                    f"**Attached file: {att.filename}** ({att.size:,} bytes)\n"
                    f"Saved to: `{save_path}`\n"
                    f"SHA256: `{digest[:16]}...`\n"
                    f"```\n{preview}\n```\n"
                    f"[Large file previewed for current task. "
                    f"Full file available at the saved path for shell tools.]"
                )
                result.saved_files.append(SavedAttachment(
                    filename=att.filename, path=str(save_path),
                    size=att.size, sha256=digest,
                    content_type=att.content_type, kind="text",
                ))
            log.info("Processed text: %s (%d bytes)", att.filename, att.size)
        except Exception as e:
            text_parts.append(f"[Attachment: {att.filename} (failed: {e})]")

    async def _handle_archive(
        self, att: Any, channel_id: str, message_id: str,
        text_parts: list[str], result: AttachmentResult,
    ) -> None:
        if att.size > self.archive_max_bytes:
            text_parts.append(
                f"[Archive: {att.filename} ({att.size / 1024 / 1024:.1f} MB, exceeds limit)]"
            )
            return
        try:
            data = await att.read()
            digest = _sha256(data)
            ws = self._workspace(channel_id, message_id)
            safe = _safe_filename(att.filename)
            archive_path = ws / safe
            archive_path.write_bytes(data)

            ext = _get_ext(att.filename)
            manifest_lines = []
            extract_dir = ws / safe.rsplit(".", 1)[0]

            if ext == ".zip":
                manifest_lines, extracted = await asyncio.to_thread(
                    self._extract_zip, archive_path, extract_dir,
                )
            elif ext in (".tar", ".tar.gz", ".tgz", ".gz"):
                manifest_lines, extracted = await asyncio.to_thread(
                    self._extract_tar, archive_path, extract_dir,
                )
            else:
                manifest_lines = ["Unknown archive format"]
                extracted = False

            manifest = "\n".join(manifest_lines[:50])
            extract_note = f"Extracted to: `{extract_dir}`" if extracted else "Not extracted (limits exceeded or unsupported)"

            # Preview small text files from the archive
            file_previews = ""
            if extracted:
                file_previews = self._preview_archive_files(extract_dir)

            text_parts.append(
                f"**Attached archive: {att.filename}** ({att.size:,} bytes)\n"
                f"Saved: `{archive_path}`\n"
                f"{extract_note}\n"
                f"SHA256: `{digest[:16]}...`\n"
                f"```\n{manifest}\n```"
                + (f"\n{file_previews}" if file_previews else "")
                + "\n[Archive processed for current task. Use shell tools to inspect further.]"
            )
            result.saved_files.append(SavedAttachment(
                filename=att.filename, path=str(archive_path),
                size=att.size, sha256=digest,
                content_type=att.content_type, kind="archive",
            ))
            log.info("Processed archive: %s (%d bytes, extracted=%s)", att.filename, att.size, extracted)
        except Exception as e:
            text_parts.append(f"[Archive: {att.filename} (failed: {e})]")

    def _extract_zip(self, archive_path: Path, extract_dir: Path) -> tuple[list[str], bool]:
        manifest = []
        with zipfile.ZipFile(archive_path) as zf:
            entries = zf.infolist()
            manifest.append(f"Entries: {len(entries)}")
            total_uncompressed = sum(e.file_size for e in entries)
            manifest.append(f"Uncompressed: {total_uncompressed / 1024 / 1024:.1f} MB")

            if len(entries) > self.archive_max_files:
                manifest.append(f"Too many files ({len(entries)} > {self.archive_max_files})")
                return manifest, False
            if total_uncompressed > self.archive_extract_max_bytes:
                manifest.append(f"Too large uncompressed ({total_uncompressed:,} > {self.archive_extract_max_bytes:,})")
                return manifest, False

            top_dirs = sorted({e.filename.split("/")[0] for e in entries if "/" in e.filename})
            manifest.append(f"Top-level: {', '.join(top_dirs[:10])}")

            extract_dir.mkdir(parents=True, exist_ok=True)
            base = extract_dir.resolve()
            for entry in entries:
                from pathlib import PurePosixPath
                parts = PurePosixPath(entry.filename).parts
                if entry.filename.startswith("/") or ".." in parts:
                    manifest.append(f"BLOCKED: unsafe path '{entry.filename}'")
                    shutil.rmtree(extract_dir, ignore_errors=True)
                    return manifest, False
                target = (extract_dir / entry.filename).resolve()
                if target != base and base not in target.parents:
                    manifest.append(f"BLOCKED: path escapes workspace '{entry.filename}'")
                    shutil.rmtree(extract_dir, ignore_errors=True)
                    return manifest, False
                zf.extract(entry, extract_dir)
            return manifest, True

    def _extract_tar(self, archive_path: Path, extract_dir: Path) -> tuple[list[str], bool]:
        manifest = []
        mode = "r:gz" if str(archive_path).endswith((".tar.gz", ".tgz")) else "r"
        with tarfile.open(archive_path, mode) as tf:
            members = tf.getmembers()
            manifest.append(f"Entries: {len(members)}")
            total_size = sum(m.size for m in members if m.isfile())
            manifest.append(f"Uncompressed: {total_size / 1024 / 1024:.1f} MB")

            if len(members) > self.archive_max_files:
                manifest.append(f"Too many files ({len(members)} > {self.archive_max_files})")
                return manifest, False
            if total_size > self.archive_extract_max_bytes:
                manifest.append(f"Too large uncompressed")
                return manifest, False

            top_dirs = sorted({m.name.split("/")[0] for m in members if "/" in m.name})
            manifest.append(f"Top-level: {', '.join(top_dirs[:10])}")

            extract_dir.mkdir(parents=True, exist_ok=True)
            base = extract_dir.resolve()
            for m in members:
                from pathlib import PurePosixPath
                parts = PurePosixPath(m.name).parts
                if m.name.startswith("/") or ".." in parts or m.issym() or m.islnk():
                    manifest.append(f"BLOCKED: unsafe entry '{m.name}'")
                    shutil.rmtree(extract_dir, ignore_errors=True)
                    return manifest, False
                target = (extract_dir / m.name).resolve()
                if target != base and base not in target.parents:
                    manifest.append(f"BLOCKED: path escapes workspace '{m.name}'")
                    shutil.rmtree(extract_dir, ignore_errors=True)
                    return manifest, False
                tf.extract(m, extract_dir, filter="data")
            return manifest, True

    def _preview_archive_files(self, extract_dir: Path) -> str:
        previews = []
        total_chars = 0
        for p in sorted(extract_dir.rglob("*")):
            if not p.is_file():
                continue
            if not _is_text_file(p.name, None):
                continue
            if p.stat().st_size > self.archive_preview_file_max_bytes:
                continue
            try:
                content = p.read_text(errors="replace")[:2000]
                rel = p.relative_to(extract_dir)
                preview = f"--- {rel} ---\n{content}"
                if total_chars + len(preview) > self.archive_preview_total_chars:
                    break
                previews.append(preview)
                total_chars += len(preview)
            except Exception:
                continue
        if not previews:
            return ""
        return "**File previews:**\n```\n" + "\n\n".join(previews) + "\n```"

    async def _handle_binary(
        self, att: Any, channel_id: str, message_id: str,
        text_parts: list[str], result: AttachmentResult,
    ) -> None:
        try:
            data = await att.read()
            digest = _sha256(data)
            ws = self._workspace(channel_id, message_id)
            safe = _safe_filename(att.filename)
            save_path = ws / safe
            save_path.write_bytes(data)

            text_parts.append(
                f"[Attachment saved: `{save_path}` "
                f"({att.content_type or 'binary'}, {att.size:,} bytes, "
                f"SHA256: `{digest[:16]}...`)]"
            )
            result.saved_files.append(SavedAttachment(
                filename=att.filename, path=str(save_path),
                size=att.size, sha256=digest,
                content_type=att.content_type, kind="binary",
            ))
            log.info("Saved binary: %s (%d bytes)", att.filename, att.size)
        except Exception as e:
            text_parts.append(f"[Attachment: {att.filename} (failed: {e})]")

    def cleanup_old_workspaces(self) -> int:
        if not self.temp_dir.exists():
            return 0
        cutoff = time.time() - self.retention_hours * 3600
        removed = 0
        for channel_dir in self.temp_dir.iterdir():
            if not channel_dir.is_dir():
                continue
            for msg_dir in channel_dir.iterdir():
                if not msg_dir.is_dir():
                    continue
                try:
                    if msg_dir.stat().st_mtime < cutoff:
                        shutil.rmtree(msg_dir)
                        removed += 1
                except Exception:
                    continue
            try:
                if not any(channel_dir.iterdir()):
                    channel_dir.rmdir()
            except Exception:
                continue
        if removed:
            log.info("Cleaned up %d old attachment workspace(s)", removed)
        return removed
