"""Saved and retained attachment evidence remains complete and caller-bound."""
import base64
import hashlib
import io
import json
import sys
import zipfile
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from src.discord.attachments import AttachmentIntent, AttachmentProcessor
from src.discord.intake_pipeline import MessageIntake
from src.tools.runtime_delivery import execution_delivery_scope
from tests.test_attachments import _mock_attachment
from tests.test_executor_output_retention import executor


@pytest.mark.parametrize("names", [("same.txt", "same.txt"), ("a?.txt", "a*.txt")])
async def test_text_paths_do_not_collide_even_when_sanitized(tmp_path, names):
    processor = AttachmentProcessor(temp_dir=str(tmp_path), inline_max_bytes=1)
    data = [b"first", b"second"]
    result = await processor.process([
        _mock_attachment(name, len(body), data=body) for name, body in zip(names, data, strict=True)
    ], "42", "1")
    assert len({saved.path for saved in result.saved_files}) == 2
    for saved, body in zip(result.saved_files, data, strict=True):
        from pathlib import Path
        assert Path(saved.path).read_bytes() == body
        assert saved.sha256 == hashlib.sha256(body).hexdigest()


@pytest.mark.parametrize("archive", [False, True])
async def test_binary_and_archive_paths_and_extractions_never_collide(tmp_path, archive):
    bodies = [b"first", b"second"]
    attachments = []
    for body in bodies:
        if archive:
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as zf:
                zf.writestr("nested.txt", body)
            body = buf.getvalue()
        attachments.append(_mock_attachment("same.zip" if archive else "same.bin",
                                            len(body), data=body))
    result = await AttachmentProcessor(temp_dir=str(tmp_path)).process(attachments, "42", "1")
    assert len({saved.path for saved in result.saved_files}) == 2
    from pathlib import Path
    for saved, attachment in zip(result.saved_files, attachments, strict=True):
        assert Path(saved.path).read_bytes() == attachment.read.return_value
    if archive:
        for saved, expected in zip(result.saved_files, bodies, strict=True):
            extracted = Path(saved.path + ".extracted") / "nested.txt"
            assert extracted.read_bytes() == expected


@pytest.mark.parametrize("pdf", [False, True])
async def test_truncated_attachment_full_content_retrieval_and_owner_channel_fences(
    tmp_path, monkeypatch, pdf,
):
    original = b"line\r\n" * 3000 + b"\xfftail"
    expected = [original]
    if pdf:
        original = b"%PDF fixture original bytes\x00\xff"
        pages = [f"Page {i} full contents " + "x" * 40 for i in range(3)]

        class Document:
            page_count = 3

            def __iter__(self):
                return iter([SimpleNamespace(get_text=lambda text=text: text) for text in pages])

            def close(self):
                pass

        def open_pdf(*, stream, filetype):
            assert stream == original and filetype == "pdf"
            return Document()

        monkeypatch.setitem(sys.modules, "fitz", SimpleNamespace(open=open_pdf))
        full = "\n".join(f"Page {i+1}: {text}" for i, text in enumerate(pages))
        expected = [original, full.encode()]
    ex = executor(tmp_path)
    cfg = SimpleNamespace(
        temp_directory=str(tmp_path / "attachments"), inline_text_max_bytes=100000,
        preview_max_chars=10, large_preview_chars=10, archive_max_bytes=100000,
        archive_max_files=10, archive_extract_max_bytes=100000,
        archive_preview_total_chars=100, archive_preview_file_max_bytes=100,
        image_max_bytes=10000, pdf_max_bytes=100000, retention_hours=24,
    )
    sessions = MagicMock()
    sessions.get.return_value = None
    intake = MessageIntake(SimpleNamespace(
        get_config=lambda: SimpleNamespace(attachments=cfg), get_user=lambda: None,
        channel_logger=MagicMock(), channel_config=MagicMock(), channel_state=MagicMock(),
        sessions=sessions, pipeline=MagicMock(), tool_executor=ex,
    ))
    message = SimpleNamespace(
        id=1, author=SimpleNamespace(id="owner"), channel=SimpleNamespace(id="42"),
        attachments=[_mock_attachment("source.pdf" if pdf else "source.txt",
                                     len(original), data=original)],
    )
    text, _ = await intake._process_attachments(message, "ingest this file")
    manifest_ref = json.loads(text[text.index('{"kind": "tool_attachment_manifest"'):])
    cursor = manifest_ref["retrieval"]["arguments"]["cursor"]
    with execution_delivery_scope("owner", "42"):
        assert not (await ex.execute("get_tool_output", {"cursor": cursor}, user_id="other")).ok
    with execution_delivery_scope("owner", "other-channel"):
        assert not (await ex.execute("get_tool_output", {"cursor": cursor}, user_id="owner")).ok
    with execution_delivery_scope("owner", "42"):
        manifest_result = await ex.execute("get_tool_output", {"cursor": cursor}, user_id="owner")
        assert manifest_result.ok
        envelope = json.loads(manifest_result.output)
        metadata = json.loads(envelope["text"])["attachments"]
        assert len(metadata) == len(expected)
        for item, body in zip(metadata, expected, strict=True):
            current = item["retrieval"]["arguments"]["cursor"]
            rebuilt = b""
            while current:
                result = await ex.execute("get_tool_output", {"cursor": current, "limit": 1000},
                                          user_id="owner")
                assert result.ok
                page = json.loads(result.output)
                assert page["start"] == len(rebuilt)
                rebuilt += base64.b64decode(page["data_base64"])
                current = page["cursor"]
            assert rebuilt == body
            assert item["sha256"] == hashlib.sha256(body).hexdigest()


async def test_inline_truncation_preserves_original_and_ingestion_intent(tmp_path):
    data = b"a" * 100
    processor = AttachmentProcessor(temp_dir=str(tmp_path), inline_max_bytes=1000,
                                    preview_max_chars=10, large_preview_chars=10)
    result = await processor.process([_mock_attachment("source.txt", 100, data=data)],
                                     "42", "1", AttachmentIntent.INGEST_KNOWLEDGE)
    assert result.saved_files[0].sha256 == hashlib.sha256(data).hexdigest()
    assert result.retained_content[0].data == data
    assert "User requested knowledge ingestion" in result.inline_text
