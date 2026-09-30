"""Failure regressions for attachment preservation at the intake boundary."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from src.config.schema import AttachmentsConfig
from src.discord import attachments
from src.discord.attachments import AttachmentProcessor
from tests.test_intake_pipeline import _cfg, _intake, _message


def test_exclusive_save_retries_uuid_collision_without_overwrite(tmp_path, monkeypatch):
    processor = AttachmentProcessor(temp_dir=str(tmp_path))
    ids = iter(["collision", "collision", "fresh"])
    monkeypatch.setattr(attachments.uuid, "uuid4", lambda: SimpleNamespace(hex=next(ids)))
    att = SimpleNamespace(filename="payload.txt")
    first = processor._save(att, b"first", "channel", "message")
    second = processor._save(att, b"second", "channel", "message")
    assert first != second
    assert first.read_bytes() == b"first"
    assert second.read_bytes() == b"second"


def test_archive_preview_read_error_does_not_hide_readable_member(tmp_path, monkeypatch):
    processor = AttachmentProcessor(temp_dir=str(tmp_path))
    bad, good = tmp_path / "a.txt", tmp_path / "b.txt"
    bad.write_text("unreadable")
    good.write_text("preserved")
    original = Path.read_text

    def read(path, *args, **kwargs):
        if path == bad:
            raise PermissionError("unreadable member")
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", read)
    preview = processor._preview_archive_files(tmp_path)
    assert "preserved" in preview and "unreadable" not in preview


async def test_retention_failure_reports_no_cursor_but_preserves_attachment_text(tmp_path):
    config = _cfg()
    config.attachments = AttachmentsConfig(temp_directory=str(tmp_path))
    intake = _intake(config=config)
    intake._tool_executor = SimpleNamespace(retain_attachments=Mock(side_effect=OSError("quota")))
    intake._sessions.get.return_value = None
    # Real processor feeds the retention boundary, with just the Discord HTTP
    # download replaced. Preview limits force full-content retention.
    data = b"x" * 100_000
    from unittest.mock import AsyncMock

    att = SimpleNamespace(filename="large.txt", content_type="text/plain",
                          size=len(data), read=AsyncMock(return_value=data))
    text, images = await intake._process_attachments(_message(attachments=[att]))
    assert "Large file previewed" in text
    assert "no cursor was issued" in text
    assert not images
    intake._tool_executor.retain_attachments.assert_called_once()


async def test_ignored_bot_without_explicit_mention_never_enters_pipeline():
    config = _cfg()
    config.discord.ignore_bot_ids = ["5"]
    intake = _intake(config=config, user=SimpleNamespace(id=1))
    await intake.handle(_message(is_bot=True))
    intake._pipeline.run.assert_not_called()
