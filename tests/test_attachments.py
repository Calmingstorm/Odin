"""Tests for the Discord attachment processor."""
from __future__ import annotations

import zipfile
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.discord.attachments import (
    AttachmentIntent,
    AttachmentProcessor,
    AttachmentResult,
    infer_attachment_intent,
    _safe_filename,
    _preview_text,
)


def _mock_attachment(filename, size, content_type=None, data=b"test content"):
    att = MagicMock()
    att.filename = filename
    att.size = size
    att.content_type = content_type
    att.read = AsyncMock(return_value=data)
    return att


class TestIntentClassifier:
    def test_ingest_keyword(self):
        assert infer_attachment_intent("ingest this file") == AttachmentIntent.INGEST_KNOWLEDGE

    def test_add_to_knowledge(self):
        assert infer_attachment_intent("add to knowledge base") == AttachmentIntent.INGEST_KNOWLEDGE

    def test_remember_this(self):
        assert infer_attachment_intent("remember this for later") == AttachmentIntent.INGEST_KNOWLEDGE

    def test_debug_keyword(self):
        assert infer_attachment_intent("debug this crash") == AttachmentIntent.CURRENT_TASK

    def test_here_are_logs(self):
        assert infer_attachment_intent("here are the logs you asked for") == AttachmentIntent.CURRENT_TASK

    def test_review_keyword(self):
        assert infer_attachment_intent("review this code") == AttachmentIntent.CURRENT_TASK

    def test_neutral_message(self):
        assert infer_attachment_intent("hey check this out") == AttachmentIntent.CURRENT_TASK

    def test_assistant_asked_for_file(self):
        assert infer_attachment_intent(
            "here you go", recent_assistant_text="please attach the log file"
        ) == AttachmentIntent.CURRENT_TASK


class TestSafeFilename:
    def test_normal(self):
        assert _safe_filename("test.txt") == "test.txt"

    def test_spaces(self):
        assert _safe_filename("my file.txt") == "my_file.txt"

    def test_path_traversal(self):
        result = _safe_filename("../../../etc/passwd")
        assert "/" not in result or result.startswith("_")

    def test_long_name(self):
        assert len(_safe_filename("a" * 500)) <= 200


class TestPreviewText:
    def test_short_text_unchanged(self):
        assert _preview_text("hello", ".txt") == "hello"

    def test_log_head_tail(self):
        text = "line\n" * 10000
        preview = _preview_text(text, ".log", max_chars=200)
        assert "head and tail" in preview

    def test_txt_truncation(self):
        text = "x" * 50000
        preview = _preview_text(text, ".txt", max_chars=1000)
        assert "truncated" in preview
        assert len(preview) < 1100


class TestAttachmentProcessor:
    @pytest.mark.asyncio
    async def test_small_text_inlined_no_ingestion(self):
        proc = AttachmentProcessor()
        att = _mock_attachment("notes.txt", 500, "text/plain", b"hello world")
        result = await proc.process([att], "ch1", "msg1")
        assert "hello world" in result.inline_text
        assert "ingest" not in result.inline_text.lower()
        assert "knowledge" not in result.inline_text.lower()
        assert "current task" in result.inline_text.lower()

    @pytest.mark.asyncio
    async def test_md_no_ingestion_hint(self):
        proc = AttachmentProcessor()
        att = _mock_attachment("README.md", 200, "text/markdown", b"# Hello")
        result = await proc.process([att], "ch1", "msg1")
        assert "ingest" not in result.inline_text.lower()

    @pytest.mark.asyncio
    async def test_log_head_tail_preview(self):
        log_content = ("line %d\n" % i for i in range(5000))
        data = "".join(log_content).encode()
        proc = AttachmentProcessor(inline_max_bytes=100, large_preview_chars=500)
        att = _mock_attachment("app.log", len(data), "text/plain", data)
        result = await proc.process([att], "ch1", "msg1")
        assert "head and tail" in result.inline_text
        assert "ingest" not in result.inline_text.lower()

    @pytest.mark.asyncio
    async def test_zip_saved_and_listed(self, tmp_path):
        zf_path = tmp_path / "test.zip"
        with zipfile.ZipFile(zf_path, "w") as zf:
            zf.writestr("hello.txt", "world")
            zf.writestr("src/main.py", "print('hi')")
        data = zf_path.read_bytes()
        proc = AttachmentProcessor(temp_dir=str(tmp_path / "workspace"))
        att = _mock_attachment("test.zip", len(data), "application/zip", data)
        result = await proc.process([att], "ch1", "msg1")
        assert "Entries:" in result.inline_text
        assert "SHA256:" in result.inline_text
        assert len(result.saved_files) == 1
        assert result.saved_files[0].kind == "archive"

    @pytest.mark.asyncio
    async def test_zip_path_traversal_blocked(self, tmp_path):
        zf_path = tmp_path / "evil.zip"
        with zipfile.ZipFile(zf_path, "w") as zf:
            zf.writestr("../../../etc/evil", "pwned")
        data = zf_path.read_bytes()
        proc = AttachmentProcessor(temp_dir=str(tmp_path / "workspace"))
        att = _mock_attachment("evil.zip", len(data), "application/zip", data)
        result = await proc.process([att], "ch1", "msg1")
        assert "BLOCKED" in result.inline_text

    @pytest.mark.asyncio
    async def test_binary_saved_to_workspace(self, tmp_path):
        proc = AttachmentProcessor(temp_dir=str(tmp_path / "workspace"))
        att = _mock_attachment("firmware.bin", 1024, "application/octet-stream", b"\x00" * 1024)
        result = await proc.process([att], "ch1", "msg1")
        assert len(result.saved_files) == 1
        assert result.saved_files[0].kind == "binary"
        assert Path(result.saved_files[0].path).exists()

    @pytest.mark.asyncio
    async def test_image_produces_vision_block(self):
        png_header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        proc = AttachmentProcessor()
        att = _mock_attachment("screenshot.png", len(png_header), "image/png", png_header)
        result = await proc.process([att], "ch1", "msg1")
        assert len(result.image_blocks) == 1
        assert result.image_blocks[0]["type"] == "image"

    @pytest.mark.asyncio
    async def test_ingest_intent_produces_marker_not_auto_ingest(self):
        proc = AttachmentProcessor()
        att = _mock_attachment("data.txt", 50, "text/plain", b"some data")
        result = await proc.process(
            [att], "ch1", "msg1", intent=AttachmentIntent.INGEST_KNOWLEDGE,
        )
        assert "current task" in result.inline_text.lower()
        assert "ingest_document" in result.inline_text

    @pytest.mark.asyncio
    async def test_filename_sanitized_in_workspace(self, tmp_path):
        proc = AttachmentProcessor(temp_dir=str(tmp_path / "workspace"))
        att = _mock_attachment("my evil file!@#.bin", 100, None, b"\x00" * 100)
        result = await proc.process([att], "ch1", "msg1")
        assert len(result.saved_files) == 1
        saved = result.saved_files[0].path
        assert "!" not in Path(saved).name
        assert "@" not in Path(saved).name


class TestWorkspaceCleanup:
    def test_cleanup_old_dirs(self, tmp_path):
        proc = AttachmentProcessor(temp_dir=str(tmp_path), retention_hours=0)
        ws = tmp_path / "ch1" / "msg1"
        ws.mkdir(parents=True)
        (ws / "file.txt").write_text("old")
        import os
        os.utime(ws, (0, 0))
        removed = proc.cleanup_old_workspaces()
        assert removed >= 1
        assert not ws.exists()
