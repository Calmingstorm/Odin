"""Coverage for src/discord/intake_pipeline.py gating (RFC-006 P13, safe).

MessageIntake's allowlist checks, attachment processing, and the early handle
gates (own-message, secret-scrub) — the real-behaviour parts. SAFE: the
attachment processor and downstream pipeline are faked, so no download, no LLM,
no tool dispatch. The deep handle/_run_inner routing (which reaches the tool
loop) is deferred to a future round rather than mock-worshipped.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import discord
from src.discord.intake_pipeline import MessageIntake


def _forbidden():
    return discord.Forbidden(
        SimpleNamespace(status=403, reason="F"), "x")  # type: ignore[arg-type]


def _cfg(allowed_users=None, channels=None):
    return SimpleNamespace(
        discord=SimpleNamespace(
            allowed_users=allowed_users or [], channels=channels or [],
            ignore_bot_ids=[]),
        attachments=None,
    )


def _intake(config=None, sessions=None, pipeline=None, user=None):
    deps = SimpleNamespace(
        get_config=lambda: config or _cfg(),
        get_user=lambda: user,
        process_commands=AsyncMock(),
        channel_logger=MagicMock(),
        channel_config=MagicMock(),
        channel_state=MagicMock(),
        sessions=sessions or MagicMock(),
        pipeline=pipeline or MagicMock(),
    )
    return MessageIntake(deps)  # type: ignore[arg-type]  # SimpleNamespace fake of the deps


def _message(content="hi", author_id=5, is_bot=False, channel_id=42, attachments=None):
    m = MagicMock()
    m.content = content
    m.author = SimpleNamespace(id=author_id, bot=is_bot, mention=f"<@{author_id}>")
    m.channel = MagicMock()
    m.channel.id = channel_id
    m.channel.send = AsyncMock()
    m.id = 999
    m.delete = AsyncMock()
    m.attachments = attachments if attachments is not None else []
    return m


class TestAllowlists:
    def test_allowed_user(self):
        assert _intake().is_allowed_user(SimpleNamespace(id=5)) is True  # empty list → all
        i = _intake(_cfg(allowed_users=["5"]))
        assert i.is_allowed_user(SimpleNamespace(id=5)) is True
        assert i.is_allowed_user(SimpleNamespace(id=9)) is False

    def test_allowed_channel(self):
        assert _intake().is_allowed_channel(42) is True  # empty list → all
        i = _intake(_cfg(channels=["42"]))
        assert i.is_allowed_channel(42) is True
        assert i.is_allowed_channel(99) is False


class TestProcessAttachments:
    async def test_no_attachments(self):
        assert await _intake()._process_attachments(_message()) == ("", [])

    async def test_with_attachments(self):
        result = SimpleNamespace(inline_text="file text", image_blocks=[{"b": 1}],
                                 warnings=["a warning"])
        proc = MagicMock()
        proc.process = AsyncMock(return_value=result)
        sessions = MagicMock()
        sessions.get.return_value = SimpleNamespace(
            messages=[SimpleNamespace(role="assistant", content="prior")])
        msg = _message(attachments=[SimpleNamespace(filename="a.txt")])
        with patch("src.discord.attachments.AttachmentProcessor", return_value=proc):
            text, blocks = await _intake(sessions=sessions)._process_attachments(msg, "look")
        assert text == "file text" and blocks == [{"b": 1}]
        proc.process.assert_awaited_once()


class TestHandleEarlyGates:
    async def test_ignores_own_message(self):
        me = SimpleNamespace(id=1, bot=True)
        i = _intake(user=me)
        msg = _message()
        msg.author = me  # message from ourselves
        await i.handle(msg)
        i._pipeline.run.assert_not_called()  # short-circuits before hand-off

    async def test_secret_scrub_deletes_and_notifies(self):
        sessions = MagicMock()
        i = _intake(sessions=sessions, user=SimpleNamespace(id=1, bot=True))
        msg = _message(content="my token is sk-secret")
        with patch("src.discord.intake_pipeline.check_for_secrets", return_value=True):
            await i.handle(msg)
        sessions.scrub_secrets.assert_called_once()
        msg.delete.assert_awaited_once()
        msg.channel.send.assert_awaited_once()  # notice sent
        assert "deleted it" in msg.channel.send.await_args.args[0]
        i._pipeline.run.assert_not_called()  # returns after scrubbing

    async def test_secret_scrub_cannot_delete(self):
        i = _intake(user=SimpleNamespace(id=1, bot=True))
        msg = _message(content="secret")
        msg.delete = AsyncMock(side_effect=_forbidden())  # no delete permission
        with patch("src.discord.intake_pipeline.check_for_secrets", return_value=True):
            await i.handle(msg)
        # the fallback notice tells the user to delete it themselves
        assert "couldn't delete" in msg.channel.send.await_args.args[0]

    async def test_secret_scrub_error_branches(self):
        # scrub_secrets raising is caught and logged; a NotFound on delete is
        # treated as "already gone" (still notifies as deleted)
        sessions = MagicMock()
        sessions.scrub_secrets.side_effect = RuntimeError("scrub boom")
        i = _intake(sessions=sessions, user=SimpleNamespace(id=1, bot=True))
        msg = _message(content="secret")
        msg.delete = AsyncMock(side_effect=discord.NotFound(
            SimpleNamespace(status=404, reason="NF"), "gone"))  # type: ignore[arg-type]
        with patch("src.discord.intake_pipeline.check_for_secrets", return_value=True):
            await i.handle(msg)
        assert "deleted it" in msg.channel.send.await_args.args[0]  # NotFound → treated deleted

    async def test_secret_scrub_http_exception_and_send_failure(self):
        i = _intake(user=SimpleNamespace(id=1, bot=True))
        msg = _message(content="secret")
        msg.delete = AsyncMock(side_effect=discord.HTTPException(
            SimpleNamespace(status=429, reason="rate"), "slow"))  # type: ignore[arg-type]
        msg.channel.send = AsyncMock(side_effect=RuntimeError("send failed"))  # notice fails
        with patch("src.discord.intake_pipeline.check_for_secrets", return_value=True):
            await i.handle(msg)  # HTTPException → not deleted; send failure swallowed, no raise
        i._pipeline.run.assert_not_called()
