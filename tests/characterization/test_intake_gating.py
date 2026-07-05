"""Characterization: on_message intake gating.

Pins the gating chain ORDER (secret scrub → cog commands → bot gates →
allowlists → channel enablement → mention gate → dedup → bot buffering →
attachments), driving the REAL on_message with fake discord objects.

Boundaries stubbed: process_commands (discord.py command framework),
_handle_message (the pipeline — characterized separately), and
_process_attachments (attachments.py has its own tests).
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from tests.fakes import FakeAuthor, FakeChannel, FakeLLM, FakeMessage, make_bot


class FakeClientUser:
    """Stands in for bot.user (a discord.ClientUser)."""

    def __init__(self, id: int = 999_000) -> None:
        self.id = id
        self.bot = True

    def mentioned_in(self, message) -> bool:
        return f"<@{self.id}>" in (message.content or "")

    def __str__(self) -> str:
        return "OdinTest"


BOT_USER_ID = 999_000


class _FakeGuild:
    def __init__(self, id: int = 424242) -> None:
        self.id = id


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def build(**overrides):
    bot = make_bot(fake_llm=FakeLLM([]), config_overrides=overrides or None)
    bot._connection.user = FakeClientUser(BOT_USER_ID)
    bot.process_commands = AsyncMock()
    bot._handle_message = AsyncMock()
    bot._process_attachments = AsyncMock(return_value=("", []))
    return bot


def handled_contents(bot) -> list[str]:
    return [call.args[1] for call in bot._handle_message.await_args_list]


class TestGatingChain:
    async def test_plain_message_reaches_handler(self):
        bot = build()
        await bot.on_message(FakeMessage("hello there"))
        assert handled_contents(bot) == ["hello there"]
        bot.process_commands.assert_awaited_once()

    async def test_own_message_ignored_but_channel_logged(self):
        bot = build()
        logged = []
        bot.channel_logger.log_message = lambda m: logged.append(m)
        msg = FakeMessage("from myself")
        msg.author = bot.user  # message.author == self.user
        await bot.on_message(msg)
        assert logged == [msg]  # passive log happens first
        bot.process_commands.assert_not_awaited()  # then everything else skipped
        bot._handle_message.assert_not_awaited()

    async def test_secret_scrub_deletes_before_commands_and_handler(self):
        bot = build()
        scrubbed = []
        bot.sessions.scrub_secrets = lambda cid, content: scrubbed.append((cid, content))
        msg = FakeMessage("my password is hunter2secret")
        await bot.on_message(msg)
        assert msg.deleted is True
        assert scrubbed and scrubbed[0][0] == str(msg.channel.id)
        notice = msg.channel.sent_texts[0]
        assert "secret/credential" in notice and "deleted" in notice
        # The scrub path returns BEFORE cogs and the pipeline see the content
        bot.process_commands.assert_not_awaited()
        bot._handle_message.assert_not_awaited()

    async def test_secret_scrub_delete_forbidden_asks_manual_delete(self):
        import discord

        bot = build()
        msg = FakeMessage("my password is hunter2secret")

        async def forbidden():
            raise discord.Forbidden(type("R", (), {"status": 403, "reason": "nope"})(), "nope")

        msg.delete = forbidden
        await bot.on_message(msg)
        notice = msg.channel.sent_texts[0]
        assert "couldn't delete" in notice

    async def test_disallowed_user_dropped(self):
        bot = build(discord={"allowed_users": ["111"]})
        await bot.on_message(FakeMessage("hi", author=FakeAuthor(id=222)))
        bot._handle_message.assert_not_awaited()
        await bot.on_message(FakeMessage("hi", author=FakeAuthor(id=111)))
        bot._handle_message.assert_awaited_once()

    async def test_disallowed_channel_dropped(self):
        bot = build(discord={"channels": ["99"]})
        await bot.on_message(FakeMessage("hi", channel=FakeChannel(id=42)))
        bot._handle_message.assert_not_awaited()
        await bot.on_message(FakeMessage("hi", channel=FakeChannel(id=99)))
        bot._handle_message.assert_awaited_once()

    async def test_require_mention_drops_unmentioned_guild_message(self):
        bot = build(discord={"require_mention": True})
        guild = _FakeGuild()
        ch = FakeChannel(id=99)
        ch.guild = guild
        await bot.on_message(FakeMessage("no mention here", channel=ch, guild=guild))
        bot._handle_message.assert_not_awaited()

    async def test_require_mention_accepts_mention_and_strips_it(self):
        bot = build(discord={"require_mention": True})
        guild = _FakeGuild()
        ch = FakeChannel(id=99)
        ch.guild = guild
        await bot.on_message(
            FakeMessage(f"<@{BOT_USER_ID}> do the thing", channel=ch, guild=guild),
        )
        assert handled_contents(bot) == ["do the thing"]

    async def test_require_mention_bypassed_in_dm(self):
        bot = build(discord={"require_mention": True})
        # FakeChannel.guild is None → DM semantics
        await bot.on_message(FakeMessage("direct message, no mention"))
        assert handled_contents(bot) == ["direct message, no mention"]

    async def test_duplicate_message_id_processed_once(self):
        bot = build()
        msg = FakeMessage("only once")
        await bot.on_message(msg)
        await bot.on_message(msg)
        bot._handle_message.assert_awaited_once()

    async def test_bot_author_dropped_when_respond_to_bots_disabled(self):
        bot = build()  # respond_to_bots defaults False
        await bot.on_message(FakeMessage("beep", author=FakeAuthor(id=555, bot=True)))
        bot._handle_message.assert_not_awaited()

    async def test_attachment_text_appended_to_content(self):
        bot = build()
        bot._process_attachments = AsyncMock(return_value=("FILE: notes contents", []))
        await bot.on_message(FakeMessage("see attached"))
        assert handled_contents(bot) == ["see attached\n\nFILE: notes contents"]

    async def test_image_only_message_gets_placeholder_content(self):
        bot = build()
        block = {"type": "image", "source": {}}
        bot._process_attachments = AsyncMock(return_value=("", [block]))
        await bot.on_message(FakeMessage(""))
        assert handled_contents(bot) == ["(see attached image)"]
        assert bot._handle_message.await_args.kwargs["image_blocks"] == [block]

    async def test_empty_message_without_attachments_dropped(self):
        bot = build()
        await bot.on_message(FakeMessage(""))
        bot._handle_message.assert_not_awaited()


class TestBotMessageBuffering:
    async def test_rapid_bot_messages_buffered_and_combined(self):
        bot = build(discord={"respond_to_bots": True})
        bot._channel_state.bot_msg_buffer_delay = 0.02
        other_bot = FakeAuthor(id=555, name="otherbot", bot=True)
        ch = FakeChannel(id=99)
        await bot.on_message(FakeMessage("part one", author=other_bot, channel=ch))
        await bot.on_message(FakeMessage("part two", author=other_bot, channel=ch))
        bot._handle_message.assert_not_awaited()  # buffered, not yet flushed
        await asyncio.sleep(0.1)
        assert handled_contents(bot) == ["part one\n\npart two"]

    async def test_split_code_block_joined_across_bot_messages(self):
        bot = build(discord={"respond_to_bots": True})
        bot._channel_state.bot_msg_buffer_delay = 0.02
        other_bot = FakeAuthor(id=555, name="otherbot", bot=True)
        ch = FakeChannel(id=99)
        await bot.on_message(FakeMessage("```python\nx = 1", author=other_bot, channel=ch))
        await bot.on_message(FakeMessage("y = 2\n```", author=other_bot, channel=ch))
        await asyncio.sleep(0.1)
        # Unclosed fence → continuation joined with single newline
        assert handled_contents(bot) == ["```python\nx = 1\ny = 2\n```"]

    async def test_buffered_bot_messages_dropped_without_mention_when_required(self):
        bot = build(discord={"respond_to_bots": True, "require_mention": True})
        bot._channel_state.bot_msg_buffer_delay = 0.02
        other_bot = FakeAuthor(id=555, name="otherbot", bot=True)
        guild = _FakeGuild()
        ch = FakeChannel(id=99)
        ch.guild = guild
        await bot.on_message(FakeMessage("no mention", author=other_bot, channel=ch, guild=guild))
        await asyncio.sleep(0.1)
        bot._handle_message.assert_not_awaited()
