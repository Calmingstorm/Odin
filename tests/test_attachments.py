"""Tests for the Discord attachment processor."""
from __future__ import annotations

import io
import sys
import tarfile
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.discord.attachments import (
    AttachmentIntent,
    AttachmentProcessor,
    AttachmentResult,
    _detect_image_type,
    _get_ext,
    _is_archive,
    _is_text_file,
    _preview_text,
    _safe_filename,
    infer_attachment_intent,
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
        assert (infer_attachment_intent("remember this for later")
                == AttachmentIntent.INGEST_KNOWLEDGE)

    def test_debug_keyword(self):
        assert infer_attachment_intent("debug this crash") == AttachmentIntent.CURRENT_TASK

    def test_here_are_logs(self):
        assert infer_attachment_intent("here are the logs you asked "
                                       "for") == AttachmentIntent.CURRENT_TASK

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
    async def test_small_text_inlined_no_ingestion(self, tmp_path):
        proc = AttachmentProcessor(temp_dir=str(tmp_path))
        att = _mock_attachment("notes.txt", 500, "text/plain", b"hello world")
        result = await proc.process([att], "ch1", "msg1")
        assert "hello world" in result.inline_text
        assert "ingest" not in result.inline_text.lower()
        assert "knowledge" not in result.inline_text.lower()
        assert "current task" in result.inline_text.lower()

    @pytest.mark.asyncio
    async def test_md_no_ingestion_hint(self, tmp_path):
        proc = AttachmentProcessor(temp_dir=str(tmp_path))
        att = _mock_attachment("README.md", 200, "text/markdown", b"# Hello")
        result = await proc.process([att], "ch1", "msg1")
        assert "ingest" not in result.inline_text.lower()

    @pytest.mark.asyncio
    async def test_log_head_tail_preview(self, tmp_path):
        log_content = (f"line {i}\n" for i in range(5000))
        data = "".join(log_content).encode()
        proc = AttachmentProcessor(
            temp_dir=str(tmp_path),
            inline_max_bytes=100,
            large_preview_chars=500,
        )
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
    async def test_image_produces_vision_block(self, tmp_path):
        png_header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        proc = AttachmentProcessor(temp_dir=str(tmp_path))
        att = _mock_attachment("screenshot.png", len(png_header), "image/png", png_header)
        result = await proc.process([att], "ch1", "msg1")
        assert len(result.image_blocks) == 1
        assert result.image_blocks[0]["type"] == "image"

    @pytest.mark.asyncio
    async def test_ingest_intent_produces_marker_not_auto_ingest(self, tmp_path):
        proc = AttachmentProcessor(temp_dir=str(tmp_path))
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

    def test_cleanup_missing_dir(self, tmp_path):
        proc = AttachmentProcessor(temp_dir=str(tmp_path / "absent"))
        assert proc.cleanup_old_workspaces() == 0


# --------------------------------------------------------------------------- #
# RFC-006 P8 additions: pure helpers + uncovered handler branches
# --------------------------------------------------------------------------- #
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


class TestPureHelpers:
    def test_detect_image_type(self):
        assert _detect_image_type(PNG) == "image/png"
        assert _detect_image_type(b"\xff\xd8\xffabc") == "image/jpeg"
        assert _detect_image_type(b"GIF89a") == "image/gif"
        assert _detect_image_type(b"RIFF" + b"\x00" * 4 + b"WEBP") == "image/webp"
        assert _detect_image_type(b"nope") is None

    def test_get_ext_and_archive(self):
        assert _get_ext("a.tar.gz") == ".tar.gz"
        assert _get_ext("b.PY") == ".py"
        assert _get_ext("noext") == ""
        assert _is_archive("x.zip") is True and _is_archive("x.txt") is False

    def test_is_text_file(self):
        assert _is_text_file("readme.md", None)
        assert _is_text_file("data.bin", "text/plain")
        assert not _is_text_file("data.bin", None)

    def test_infer_intent_default(self):
        # neither ingest nor task patterns, no assistant hint → CURRENT_TASK
        assert infer_attachment_intent("just a plain message") == AttachmentIntent.CURRENT_TASK


class TestImageHandler:
    @pytest.mark.asyncio
    async def test_size_limit(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path), image_max_bytes=10)
        parts: list = []
        await p._handle_image(_mock_attachment("big.png", 999, "image/png"),
                              ".png", parts, AttachmentResult())
        assert "exceeds limit" in parts[0]

    @pytest.mark.asyncio
    async def test_jpg_alias(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path))
        r = AttachmentResult()
        await p._handle_image(_mock_attachment("x.jpg", 5, "image/jpg", b"rawjpg"),
                              ".jpg", [], r)
        assert r.image_blocks[0]["source"]["media_type"] == "image/jpeg"

    @pytest.mark.asyncio
    async def test_read_failure(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path))
        att = _mock_attachment("x.png", 5, "image/png")
        att.read = AsyncMock(side_effect=RuntimeError("net"))
        parts: list = []
        await p._handle_image(att, ".png", parts, AttachmentResult())
        assert "failed" in parts[0]


class TestPdfHandler:
    @pytest.mark.asyncio
    async def test_size_limit(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path), pdf_max_bytes=10)
        parts: list = []
        await p._handle_pdf(_mock_attachment("big.pdf", 999), parts, AttachmentResult())
        assert "exceeds limit" in parts[0]

    @pytest.mark.asyncio
    async def test_success_with_fake_fitz(self, tmp_path):
        class _Doc:
            page_count = 1
            def __iter__(self):
                return iter([SimpleNamespace(get_text=lambda: "pdf body")])
            def close(self):
                pass
        p = AttachmentProcessor(temp_dir=str(tmp_path))
        parts: list = []
        with patch.dict(sys.modules, {"fitz": SimpleNamespace(open=lambda **k: _Doc())}):
            await p._handle_pdf(_mock_attachment("doc.pdf", 4, data=b"%PDF"),
                                parts, AttachmentResult())
        assert "pdf body" in parts[0] and "1 pages" in parts[0]

    @pytest.mark.asyncio
    async def test_failure(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path))
        boom = SimpleNamespace(open=lambda **k: (_ for _ in ()).throw(RuntimeError("bad")))
        parts: list = []
        with patch.dict(sys.modules, {"fitz": boom}):
            await p._handle_pdf(_mock_attachment("doc.pdf", 4), parts, AttachmentResult())
        assert "failed" in parts[0]


class TestTextAndBinaryFailures:
    @pytest.mark.asyncio
    async def test_text_read_failure(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path))
        att = _mock_attachment("a.txt", 5, "text/plain")
        att.read = AsyncMock(side_effect=RuntimeError("x"))
        parts: list = []
        await p._handle_text(att, ".txt", AttachmentIntent.CURRENT_TASK, "c", "m",
                             parts, AttachmentResult())
        assert "failed" in parts[0]

    @pytest.mark.asyncio
    async def test_binary_read_failure(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path))
        att = _mock_attachment("x.bin", 5)
        att.read = AsyncMock(side_effect=RuntimeError("x"))
        parts: list = []
        await p._handle_binary(att, "c", "m", parts, AttachmentResult())
        assert "failed" in parts[0]


def _tar_bytes(files):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tf:
        for name, content in files.items():
            data = content.encode()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))
    return buf.getvalue()


class TestArchiveExtended:
    @pytest.mark.asyncio
    async def test_archive_size_limit(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path), archive_max_bytes=5)
        parts: list = []
        await p._handle_archive(_mock_attachment("a.zip", 999), "c", "m",
                                parts, AttachmentResult())
        assert "exceeds limit" in parts[0]

    @pytest.mark.asyncio
    async def test_tar_extract(self, tmp_path):
        data = _tar_bytes({"top/file.txt": "tar content here"})
        p = AttachmentProcessor(temp_dir=str(tmp_path / "ws"))
        parts: list = []
        r = AttachmentResult()
        await p._handle_archive(_mock_attachment("a.tar", len(data), None, data),
                                "c", "m", parts, r)
        assert "Extracted to" in parts[0] and "tar content here" in parts[0]

    @pytest.mark.asyncio
    async def test_corrupt_archive_fails(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path / "ws"))
        parts: list = []
        await p._handle_archive(_mock_attachment("a.zip", 8, None, b"not a zip"),
                                "c", "m", parts, AttachmentResult())
        assert "failed" in parts[0]

    def test_extract_zip_too_many_files(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path), archive_max_files=1)
        zp = tmp_path / "a.zip"
        with zipfile.ZipFile(zp, "w") as zf:
            zf.writestr("a.txt", "1")
            zf.writestr("b.txt", "2")
        manifest, ok = p._extract_zip(zp, tmp_path / "out")
        assert ok is False and any("Too many files" in m for m in manifest)

    def test_extract_zip_too_large(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path), archive_extract_max_bytes=1)
        zp = tmp_path / "a.zip"
        with zipfile.ZipFile(zp, "w") as zf:
            zf.writestr("big.txt", "x" * 100)
        manifest, ok = p._extract_zip(zp, tmp_path / "out")
        assert ok is False and any("Too large" in m for m in manifest)

    def test_preview_archive_files(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path))
        d = tmp_path / "extracted"
        d.mkdir()
        (d / "note.txt").write_text("preview me")
        (d / "blob.bin").write_bytes(b"\x00")  # non-text → skipped
        out = p._preview_archive_files(d)
        assert "note.txt" in out and "preview me" in out

    def test_preview_skips_large_and_empty(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path), archive_preview_file_max_bytes=5)
        d = tmp_path / "ex"
        d.mkdir()
        (d / "big.txt").write_text("x" * 100)  # over per-file cap → skipped
        assert p._preview_archive_files(d) == ""  # nothing previewable → empty string

    def test_extract_tar_too_many_files(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path), archive_max_files=1)
        tp = tmp_path / "a.tar"
        tp.write_bytes(_tar_bytes({"a.txt": "1", "b.txt": "2"}))
        manifest, ok = p._extract_tar(tp, tmp_path / "out")
        assert ok is False and any("Too many files" in m for m in manifest)

    def test_extract_tar_unsafe_entry_blocked(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path))
        tp = tmp_path / "evil.tar"
        tp.write_bytes(_tar_bytes({"../escape.txt": "pwned"}))
        manifest, ok = p._extract_tar(tp, tmp_path / "out")
        assert ok is False and any("BLOCKED" in m for m in manifest)

    def test_extract_tar_too_large(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path), archive_extract_max_bytes=1)
        tp = tmp_path / "a.tar"
        tp.write_bytes(_tar_bytes({"big.txt": "x" * 100}))
        manifest, ok = p._extract_tar(tp, tmp_path / "out")
        assert ok is False and any("Too large" in m for m in manifest)

    def test_preview_stops_at_total_cap(self, tmp_path):
        # cap sized so the first "--- a.txt ---\nAAAA" (18 chars) fits but adding
        # the second would exceed it → break after the first.
        p = AttachmentProcessor(temp_dir=str(tmp_path), archive_preview_total_chars=25)
        d = tmp_path / "ex"
        d.mkdir()
        (d / "a.txt").write_text("AAAA")
        (d / "b.txt").write_text("BBBB")
        out = p._preview_archive_files(d)
        assert "a.txt" in out and "b.txt" not in out


class TestProcessPdfDispatch:
    @pytest.mark.asyncio
    async def test_pdf_routed_through_process(self, tmp_path):
        class _Doc:
            page_count = 1
            def __iter__(self):
                return iter([SimpleNamespace(get_text=lambda: "routed pdf")])
            def close(self):
                pass
        p = AttachmentProcessor(temp_dir=str(tmp_path))
        att = _mock_attachment("doc.pdf", 4, "application/pdf", b"%PDF")
        with patch.dict(sys.modules, {"fitz": SimpleNamespace(open=lambda **k: _Doc())}):
            result = await p.process([att], "c", "m")
        assert "routed pdf" in result.inline_text


class TestCleanupEdges:
    def test_skips_non_directories(self, tmp_path):
        p = AttachmentProcessor(temp_dir=str(tmp_path), retention_hours=0)
        (tmp_path / "loose_file").write_text("x")  # non-dir in temp_dir → skipped
        chan = tmp_path / "ch1"
        chan.mkdir()
        (chan / "stray").write_text("y")  # non-dir in channel_dir → skipped
        old_ws = chan / "msg1"
        old_ws.mkdir()
        import os
        os.utime(old_ws, (0, 0))
        removed = p.cleanup_old_workspaces()
        assert removed == 1 and not old_ws.exists()
