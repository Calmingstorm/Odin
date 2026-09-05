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

from tests.fakes import FakeAuthor, FakeChannel, FakeLLM, FakeMessage, make_bot, text_response


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
    bot.pipeline.run = AsyncMock()
    bot.intake._process_attachments = AsyncMock(return_value=("", []))
    return bot


def handled_contents(bot) -> list[str]:
    return [call.args[1] for call in bot.pipeline.run.await_args_list]


class TestGatingChain:
    async def test_plain_message_reaches_handler(self):
        bot = build()
        await bot.on_message(FakeMessage("hello there"))
        assert handled_contents(bot) == ["hello there"]
        bot.process_commands.assert_awaited_once()

    async def test_own_message_ignored_but_channel_logged(self):
        bot = build()
        logged = []
        bot.channel_logger.log_message = lambda m, *, content: logged.append((m, content))
        msg = FakeMessage("from myself")
        msg.author = bot.user  # message.author == self.user
        await bot.on_message(msg)
        assert logged == [(msg, "from myself")]  # redacted ingress log happens first
        bot.process_commands.assert_not_awaited()  # then everything else skipped
        bot.pipeline.run.assert_not_awaited()

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
        bot.pipeline.run.assert_not_awaited()

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
        bot.pipeline.run.assert_not_awaited()
        await bot.on_message(FakeMessage("hi", author=FakeAuthor(id=111)))
        bot.pipeline.run.assert_awaited_once()

    async def test_disallowed_channel_dropped(self):
        bot = build(discord={"channels": ["99"]})
        await bot.on_message(FakeMessage("hi", channel=FakeChannel(id=42)))
        bot.pipeline.run.assert_not_awaited()
        await bot.on_message(FakeMessage("hi", channel=FakeChannel(id=99)))
        bot.pipeline.run.assert_awaited_once()

    async def test_require_mention_drops_unmentioned_guild_message(self):
        bot = build(discord={"require_mention": True})
        guild = _FakeGuild()
        ch = FakeChannel(id=99)
        ch.guild = guild
        await bot.on_message(FakeMessage("no mention here", channel=ch, guild=guild))
        bot.pipeline.run.assert_not_awaited()

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
        bot.pipeline.run.assert_awaited_once()

    async def test_bot_author_dropped_when_respond_to_bots_disabled(self):
        bot = build()  # respond_to_bots defaults False
        await bot.on_message(FakeMessage("beep", author=FakeAuthor(id=555, bot=True)))
        bot.pipeline.run.assert_not_awaited()

    async def test_attachment_text_appended_to_content(self):
        bot = build()
        bot.intake._process_attachments = AsyncMock(return_value=("FILE: notes contents", []))
        await bot.on_message(FakeMessage("see attached"))
        assert handled_contents(bot) == ["see attached\n\nFILE: notes contents"]

    async def test_image_only_message_gets_placeholder_content(self):
        bot = build()
        block = {"type": "image", "source": {}}
        bot.intake._process_attachments = AsyncMock(return_value=("", [block]))
        await bot.on_message(FakeMessage(""))
        assert handled_contents(bot) == ["(see attached image)"]
        assert bot.pipeline.run.await_args.kwargs["image_blocks"] == [block]

    async def test_empty_message_without_attachments_dropped(self):
        bot = build()
        await bot.on_message(FakeMessage(""))
        bot.pipeline.run.assert_not_awaited()


class TestBotMessageBuffering:
    async def test_rapid_bot_messages_buffered_and_combined(self):
        bot = build(discord={"respond_to_bots": True})
        bot.channel_state.bot_msg_buffer_delay = 0.02
        other_bot = FakeAuthor(id=555, name="otherbot", bot=True)
        ch = FakeChannel(id=99)
        await bot.on_message(FakeMessage("part one", author=other_bot, channel=ch))
        await bot.on_message(FakeMessage("part two", author=other_bot, channel=ch))
        bot.pipeline.run.assert_not_awaited()  # buffered, not yet flushed
        await asyncio.sleep(0.1)
        assert handled_contents(bot) == ["part one\n\npart two"]

    async def test_split_code_block_joined_across_bot_messages(self):
        bot = build(discord={"respond_to_bots": True})
        bot.channel_state.bot_msg_buffer_delay = 0.02
        other_bot = FakeAuthor(id=555, name="otherbot", bot=True)
        ch = FakeChannel(id=99)
        await bot.on_message(FakeMessage("```python\nx = 1", author=other_bot, channel=ch))
        await bot.on_message(FakeMessage("y = 2\n```", author=other_bot, channel=ch))
        await asyncio.sleep(0.1)
        # Unclosed fence → continuation joined with single newline
        assert handled_contents(bot) == ["```python\nx = 1\ny = 2\n```"]

    async def test_buffered_bot_messages_dropped_without_mention_when_required(self):
        bot = build(discord={"respond_to_bots": True, "require_mention": True})
        bot.channel_state.bot_msg_buffer_delay = 0.02
        other_bot = FakeAuthor(id=555, name="otherbot", bot=True)
        guild = _FakeGuild()
        ch = FakeChannel(id=99)
        ch.guild = guild
        await bot.on_message(FakeMessage("no mention", author=other_bot, channel=ch, guild=guild))
        await asyncio.sleep(0.1)
        bot.pipeline.run.assert_not_awaited()


class TestBotAdmissionPreambleConsistency:
    """Bot admission and tool-loop provenance must use one resolution ladder."""

    @staticmethod
    def _build_real_pipeline(global_default: bool):
        fake = FakeLLM([text_response("ok")])
        bot = make_bot(
            fake_llm=fake,
            config_overrides={"discord": {"respond_to_bots": global_default}},
        )
        bot._connection.user = FakeClientUser(BOT_USER_ID)
        bot.process_commands = AsyncMock()
        bot.intake._process_attachments = AsyncMock(return_value=("", []))
        bot.channel_state.bot_msg_buffer_delay = 0.01
        return bot, fake

    @staticmethod
    def _seed_history(bot, channel_id: int) -> None:
        # The bot-provenance block is part of the full history separator;
        # seed a prior exchange so the emitted developer message is observable.
        key = str(channel_id)
        bot.sessions.add_message(key, "user", "[human]: earlier")
        bot.sessions.add_message(key, "assistant", "earlier reply")

    @pytest.mark.parametrize("global_default", [False, True])
    @pytest.mark.parametrize("guild_override", [None, False, True])
    @pytest.mark.parametrize("channel_override", [None, False, True])
    async def test_every_config_admitted_bot_turn_is_labeled(
        self,
        global_default,
        guild_override,
        channel_override,
    ):
        """Covers global-on preservation and every override precedence shape."""
        bot, fake = self._build_real_pipeline(global_default)
        guild = _FakeGuild(id=424242)
        channel = FakeChannel(id=99, guild=guild)
        if guild_override is not None:
            bot.channel_config.set_guild_config(
                str(guild.id), respond_to_bots=guild_override
            )
        if channel_override is not None:
            bot.channel_config.set_channel_config(
                str(channel.id), respond_to_bots=channel_override
            )
        expected_admitted = (
            channel_override
            if channel_override is not None
            else guild_override
            if guild_override is not None
            else global_default
        )
        await bot.on_message(
            FakeMessage(
                "bot request",
                author=FakeAuthor(id=555, name="otherbot", bot=True),
                channel=channel,
                guild=guild,
            )
        )
        if expected_admitted:
            await asyncio.sleep(0.08)

        assert bool(fake.calls) is expected_admitted
        if expected_admitted:
            developer_text = "\n".join(fake.developer_messages_of_call(0))
            assert "from ANOTHER BOT" in developer_text
            assert "EXECUTE immediately" in developer_text

    async def test_allowed_webhook_admission_is_also_labeled(self, monkeypatch):
        """The intake's non-config admission exception retains bot provenance."""
        from src.discord import tool_loop, tool_loop_helpers

        webhook_id = 777_001
        allowed = frozenset({str(webhook_id)})
        monkeypatch.setattr(tool_loop_helpers, "_ALLOWED_WEBHOOK_IDS", allowed)
        monkeypatch.setattr(tool_loop, "_ALLOWED_WEBHOOK_IDS", allowed)

        bot, fake = self._build_real_pipeline(False)
        guild = _FakeGuild(id=424242)
        channel = FakeChannel(id=99, guild=guild)
        self._seed_history(bot, channel.id)

        await bot.on_message(
            FakeMessage(
                "allowed webhook request",
                author=FakeAuthor(id=555, name="allowed-hook", bot=True),
                channel=channel,
                guild=guild,
                webhook_id=webhook_id,
            )
        )

        assert len(fake.calls) == 1
        assert "from ANOTHER BOT" in "\n".join(fake.developer_messages_of_call(0))

    @pytest.mark.parametrize(
        ("guild_override", "channel_override"),
        [(True, None), (False, True)],
        ids=["guild-admits", "channel-admits"],
    )
    async def test_global_off_override_admission_is_labeled(
        self,
        guild_override,
        channel_override,
    ):
        """Regression: the intake-admitted override case cannot be mislabeled."""
        bot, fake = self._build_real_pipeline(False)
        guild = _FakeGuild(id=424242)
        channel = FakeChannel(id=99, guild=guild)
        bot.channel_config.set_guild_config(
            str(guild.id), respond_to_bots=guild_override
        )
        if channel_override is not None:
            bot.channel_config.set_channel_config(
                str(channel.id), respond_to_bots=channel_override
            )

        await bot.on_message(
            FakeMessage(
                "override-admitted bot request",
                author=FakeAuthor(id=555, name="otherbot", bot=True),
                channel=channel,
                guild=guild,
            )
        )
        await asyncio.sleep(0.08)

        assert len(fake.calls) == 1
        assert "from ANOTHER BOT" in "\n".join(fake.developer_messages_of_call(0))

    async def test_admission_snapshot_survives_live_disable_during_buffer(self):
        """An admitted bot turn remains labeled if config changes before flush."""
        bot, fake = self._build_real_pipeline(False)
        bot.channel_state.bot_msg_buffer_delay = 0.05
        guild = _FakeGuild(id=424242)
        channel = FakeChannel(id=99, guild=guild)
        bot.channel_config.set_channel_config(str(channel.id), respond_to_bots=True)

        await bot.on_message(
            FakeMessage(
                "admitted before disable",
                author=FakeAuthor(id=555, name="otherbot", bot=True),
                channel=channel,
                guild=guild,
            )
        )
        # The message is already admitted and buffered. A live update must not
        # erase its origin while it waits to enter the pipeline.
        bot.channel_config.set_channel_config(str(channel.id), respond_to_bots=False)
        await asyncio.sleep(0.12)

        assert len(fake.calls) == 1
        assert "from ANOTHER BOT" in "\n".join(fake.developer_messages_of_call(0))
