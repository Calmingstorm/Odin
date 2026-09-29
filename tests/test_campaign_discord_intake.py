"""Buffered authorized intake retains each original message's attachments."""
import pytest

from src.discord.intake_pipeline import MessageIntake
from tests.characterization.test_intake_gating import _wait_for_buffer, build
from tests.fakes import FakeAuthor, FakeChannel, FakeMessage
from tests.test_attachments import _mock_attachment


@pytest.mark.parametrize("content", ["mixed bot content", ""])
async def test_buffered_bot_and_webhook_attachment_only_and_mixed(tmp_path, monkeypatch, content):
    monkeypatch.chdir(tmp_path)
    bot = build(discord={"respond_to_bots": True},
                attachments={"temp_directory": str(tmp_path / "attachments")})
    # Restore the production processor which the characterization helper stubs.
    bot.intake._process_attachments = MessageIntake._process_attachments.__get__(bot.intake)
    bot.channel_state.bot_msg_buffer_delay = 0.01
    author, channel = FakeAuthor(id=555, name="otherbot", bot=True), FakeChannel(id=99)
    first = FakeMessage(content, author=author, channel=channel)
    first.attachments = [_mock_attachment("report.txt", 6, data=b"report")]
    second = FakeMessage("", author=author, channel=channel)
    second.attachments = [_mock_attachment("image.png", 8, content_type="image/png",
                                           data=b"\x89PNG\r\n\x1a\n")]
    second.webhook_id = 1234
    await bot.on_message(first)
    await bot.on_message(second)
    await _wait_for_buffer(lambda: bool(bot.pipeline.run.await_args_list))
    args = bot.pipeline.run.await_args
    assert "report" in args.args[1]
    if content:
        assert content in args.args[1]
    assert len(args.kwargs["image_blocks"]) == 1
    assert args.kwargs["from_another_bot"] is True
    first.attachments[0].read.assert_awaited_once()
    second.attachments[0].read.assert_awaited_once()


async def test_required_mention_still_fences_buffered_attachment_download(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    bot = build(discord={"respond_to_bots": True, "require_mention": True})
    bot.intake._process_attachments = MessageIntake._process_attachments.__get__(bot.intake)
    bot.channel_state.bot_msg_buffer_delay = 0.01
    msg = FakeMessage("", author=FakeAuthor(id=555, name="otherbot", bot=True))
    attachment = _mock_attachment("report.txt", 6, data=b"report")
    msg.attachments = [attachment]
    await bot.on_message(msg)
    await _wait_for_buffer(lambda: not bot.channel_state.bot_msg_tasks)
    attachment.read.assert_not_awaited()
    bot.pipeline.run.assert_not_awaited()
