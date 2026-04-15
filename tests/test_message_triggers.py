"""Tests for Discord message trigger integration.

Covers:
- MessageTriggers cog event handling
- Channel and user allowlists
- Bot message filtering
- Scheduler trigger matching for discord_message source
- Content matching: content_contains, content_regex, starts_with, equals, author_id
- Config schema (MessageTriggerConfig)
- Integration: message → scheduler.fire_triggers
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock

from src.config.schema import MessageTriggerConfig
from src.discord.cogs.message_triggers import MessageTriggers
from src.scheduler.scheduler import Scheduler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_bot(bot_user_id: int = 123456789) -> MagicMock:
    bot = MagicMock()
    bot.user = MagicMock()
    bot.user.id = bot_user_id
    return bot


def _make_config(
    enabled: bool = True,
    channel_ids: list[str] | None = None,
    allowed_user_ids: list[str] | None = None,
) -> MessageTriggerConfig:
    return MessageTriggerConfig(
        enabled=enabled,
        channel_ids=channel_ids or [],
        allowed_user_ids=allowed_user_ids or [],
    )


def _make_message(
    *,
    author_id: int = 222222222,
    author_bot: bool = False,
    channel_id: int = 333333333,
    message_id: int = 444444444,
    guild_id: int = 111111111,
    content: str = "hello world",
) -> MagicMock:
    """Create a mock discord.Message."""
    message = MagicMock()
    message.author = MagicMock()
    message.author.id = author_id
    message.author.bot = author_bot
    message.content = content
    message.id = message_id

    channel = MagicMock()
    channel.id = channel_id
    message.channel = channel

    guild = MagicMock()
    guild.id = guild_id
    message.guild = guild

    return message


def _make_scheduler(fired: int = 0) -> MagicMock:
    scheduler = MagicMock(spec=Scheduler)
    scheduler.fire_triggers = AsyncMock(return_value=fired)
    return scheduler


# ---------------------------------------------------------------------------
# Tests — Cog Basics
# ---------------------------------------------------------------------------

class TestMessageTriggersEnabled:
    """Test enabled/disabled state."""

    def test_disabled_by_default(self):
        cog = MessageTriggers(_make_bot())
        assert not cog.enabled

    def test_enabled_with_config_and_scheduler(self):
        cog = MessageTriggers(
            _make_bot(),
            config=_make_config(enabled=True),
            scheduler=_make_scheduler(),
        )
        assert cog.enabled

    def test_disabled_when_config_off(self):
        cog = MessageTriggers(
            _make_bot(),
            config=_make_config(enabled=False),
            scheduler=_make_scheduler(),
        )
        assert not cog.enabled

    def test_disabled_without_scheduler(self):
        cog = MessageTriggers(
            _make_bot(),
            config=_make_config(enabled=True),
        )
        assert not cog.enabled

    def test_set_scheduler(self):
        cog = MessageTriggers(_make_bot(), config=_make_config(enabled=True))
        assert not cog.enabled
        cog.set_scheduler(_make_scheduler())
        assert cog.enabled

    def test_set_config(self):
        cog = MessageTriggers(_make_bot(), scheduler=_make_scheduler())
        assert not cog.enabled
        cog.set_config(_make_config(enabled=True))
        assert cog.enabled


# ---------------------------------------------------------------------------
# Tests — Channel Allowlist
# ---------------------------------------------------------------------------

class TestChannelAllowlist:
    """Channel filtering for message triggers."""

    def test_empty_list_allows_all(self):
        cog = MessageTriggers(
            _make_bot(),
            config=_make_config(channel_ids=[]),
        )
        assert cog._is_channel_allowed(333333333)
        assert cog._is_channel_allowed(999999999)

    def test_specific_channels(self):
        cog = MessageTriggers(
            _make_bot(),
            config=_make_config(channel_ids=["333333333", "444444444"]),
        )
        assert cog._is_channel_allowed(333333333)
        assert cog._is_channel_allowed(444444444)
        assert not cog._is_channel_allowed(555555555)

    def test_no_config_denies(self):
        cog = MessageTriggers(_make_bot())
        assert not cog._is_channel_allowed(333333333)


# ---------------------------------------------------------------------------
# Tests — User Allowlist
# ---------------------------------------------------------------------------

class TestUserAllowlist:
    """User filtering for message triggers."""

    def test_empty_list_allows_all(self):
        cog = MessageTriggers(
            _make_bot(),
            config=_make_config(allowed_user_ids=[]),
        )
        assert cog._is_user_allowed(222222222)

    def test_specific_users(self):
        cog = MessageTriggers(
            _make_bot(),
            config=_make_config(allowed_user_ids=["222222222"]),
        )
        assert cog._is_user_allowed(222222222)
        assert not cog._is_user_allowed(999999999)

    def test_no_config_denies(self):
        cog = MessageTriggers(_make_bot())
        assert not cog._is_user_allowed(222222222)


# ---------------------------------------------------------------------------
# Tests — Message Event Handling
# ---------------------------------------------------------------------------

class TestMessageEventHandling:
    """on_message dispatches to scheduler correctly."""

    @pytest.fixture
    def scheduler(self):
        return _make_scheduler(fired=1)

    @pytest.fixture
    def cog(self, scheduler):
        return MessageTriggers(
            _make_bot(),
            config=_make_config(enabled=True),
            scheduler=scheduler,
        )

    async def test_fires_trigger_on_message(self, cog, scheduler):
        msg = _make_message(content="!deploy prod")
        await cog.on_message(msg)

        scheduler.fire_triggers.assert_awaited_once()
        source, event_data = scheduler.fire_triggers.call_args[0]
        assert source == "discord_message"
        assert event_data["event"] == "message_create"
        assert event_data["content"] == "!deploy prod"
        assert event_data["author_id"] == "222222222"
        assert event_data["channel_id"] == "333333333"
        assert event_data["message_id"] == "444444444"
        assert event_data["guild_id"] == "111111111"

    async def test_ignores_bot_messages(self, cog, scheduler):
        msg = _make_message(author_bot=True)
        await cog.on_message(msg)
        scheduler.fire_triggers.assert_not_awaited()

    async def test_ignores_own_bot_messages(self, cog, scheduler):
        msg = _make_message(author_id=123456789, author_bot=True)
        await cog.on_message(msg)
        scheduler.fire_triggers.assert_not_awaited()

    async def test_ignores_when_disabled(self, scheduler):
        cog = MessageTriggers(
            _make_bot(),
            config=_make_config(enabled=False),
            scheduler=scheduler,
        )
        await cog.on_message(_make_message())
        scheduler.fire_triggers.assert_not_awaited()

    async def test_ignores_disallowed_channel(self, scheduler):
        cog = MessageTriggers(
            _make_bot(),
            config=_make_config(enabled=True, channel_ids=["999"]),
            scheduler=scheduler,
        )
        msg = _make_message(channel_id=333333333)
        await cog.on_message(msg)
        scheduler.fire_triggers.assert_not_awaited()

    async def test_ignores_disallowed_user(self, scheduler):
        cog = MessageTriggers(
            _make_bot(),
            config=_make_config(enabled=True, allowed_user_ids=["999"]),
            scheduler=scheduler,
        )
        msg = _make_message(author_id=222222222)
        await cog.on_message(msg)
        scheduler.fire_triggers.assert_not_awaited()

    async def test_scheduler_error_handled(self, cog, scheduler):
        scheduler.fire_triggers = AsyncMock(side_effect=RuntimeError("boom"))
        msg = _make_message()
        # Should not raise
        await cog.on_message(msg)

    async def test_dm_message_guild_id_empty(self, scheduler):
        cog = MessageTriggers(
            _make_bot(),
            config=_make_config(enabled=True),
            scheduler=scheduler,
        )
        msg = _make_message()
        msg.guild = None
        await cog.on_message(msg)

        scheduler.fire_triggers.assert_awaited_once()
        _, event_data = scheduler.fire_triggers.call_args[0]
        assert event_data["guild_id"] == ""


# ---------------------------------------------------------------------------
# Tests — Scheduler Trigger Matching for discord_message
# ---------------------------------------------------------------------------

class TestSchedulerMessageSource:
    """Scheduler validates and matches discord_message triggers."""

    def test_validate_message_source(self):
        Scheduler._validate_trigger({"source": "discord_message", "event": "message_create"})

    def test_validate_content_contains(self):
        Scheduler._validate_trigger({"source": "discord_message", "content_contains": "deploy"})

    def test_validate_content_regex(self):
        Scheduler._validate_trigger({"source": "discord_message", "content_regex": r"^!deploy\s+"})

    def test_validate_starts_with(self):
        Scheduler._validate_trigger({"source": "discord_message", "starts_with": "!deploy"})

    def test_validate_equals(self):
        Scheduler._validate_trigger({"source": "discord_message", "equals": "!status"})

    def test_validate_author_id(self):
        Scheduler._validate_trigger({"source": "discord_message", "author_id": "222222222"})

    def test_validate_combined_keys(self):
        Scheduler._validate_trigger({
            "source": "discord_message",
            "event": "message_create",
            "channel_id": "333333333",
            "author_id": "222222222",
            "content_contains": "deploy",
        })

    def test_validate_rejects_unknown_key(self):
        with pytest.raises(ValueError, match="Unknown trigger keys"):
            Scheduler._validate_trigger({"source": "discord_message", "bogus_key": "x"})

    # -- content_contains matching --

    def test_content_contains_match(self):
        trigger = {"source": "discord_message", "content_contains": "deploy"}
        assert Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "please deploy prod"},
        )

    def test_content_contains_no_match(self):
        trigger = {"source": "discord_message", "content_contains": "deploy"}
        assert not Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "hello world"},
        )

    # -- content_regex matching --

    def test_content_regex_match(self):
        trigger = {"source": "discord_message", "content_regex": r"^!deploy\s+\w+"}
        assert Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "!deploy prod"},
        )

    def test_content_regex_no_match(self):
        trigger = {"source": "discord_message", "content_regex": r"^!deploy\s+\w+"}
        assert not Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "deploy prod"},
        )

    def test_content_regex_invalid_pattern_no_match(self):
        trigger = {"source": "discord_message", "content_regex": r"[invalid"}
        assert not Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "anything"},
        )

    # -- starts_with matching --

    def test_starts_with_match(self):
        trigger = {"source": "discord_message", "starts_with": "!deploy"}
        assert Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "!deploy prod"},
        )

    def test_starts_with_no_match(self):
        trigger = {"source": "discord_message", "starts_with": "!deploy"}
        assert not Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "please !deploy prod"},
        )

    # -- equals matching --

    def test_equals_match(self):
        trigger = {"source": "discord_message", "equals": "!status"}
        assert Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "!status"},
        )

    def test_equals_no_match(self):
        trigger = {"source": "discord_message", "equals": "!status"}
        assert not Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "!status please"},
        )

    # -- author_id matching --

    def test_author_id_match(self):
        trigger = {"source": "discord_message", "author_id": "222222222"}
        assert Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "hi", "author_id": "222222222"},
        )

    def test_author_id_no_match(self):
        trigger = {"source": "discord_message", "author_id": "222222222"}
        assert not Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "hi", "author_id": "999999999"},
        )

    # -- channel_id matching --

    def test_channel_id_match(self):
        trigger = {"source": "discord_message", "channel_id": "333333333"}
        assert Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "hi", "channel_id": "333333333"},
        )

    def test_channel_id_no_match(self):
        trigger = {"source": "discord_message", "channel_id": "333333333"}
        assert not Scheduler._trigger_matches(
            trigger, "discord_message",
            {"event": "message_create", "content": "hi", "channel_id": "999999999"},
        )

    # -- AND logic across multiple fields --

    def test_combined_all_match(self):
        trigger = {
            "source": "discord_message",
            "event": "message_create",
            "channel_id": "333333333",
            "author_id": "222222222",
            "content_contains": "deploy",
            "starts_with": "!",
        }
        assert Scheduler._trigger_matches(
            trigger, "discord_message",
            {
                "event": "message_create",
                "content": "!deploy prod",
                "author_id": "222222222",
                "channel_id": "333333333",
            },
        )

    def test_combined_one_field_mismatch_fails(self):
        trigger = {
            "source": "discord_message",
            "author_id": "222222222",
            "content_contains": "deploy",
        }
        # author matches but content doesn't
        assert not Scheduler._trigger_matches(
            trigger, "discord_message",
            {
                "event": "message_create",
                "content": "hello world",
                "author_id": "222222222",
            },
        )

    def test_wrong_source_no_match(self):
        trigger = {"source": "discord_message", "content_contains": "deploy"}
        assert not Scheduler._trigger_matches(
            trigger, "github",
            {"event": "push", "content": "deploy stuff"},
        )

    # -- Schedule creation --

    def test_add_message_trigger_schedule(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        result = sched.add(
            description="Deploy on command",
            action="reminder",
            channel_id="999",
            message="Deploy triggered!",
            trigger={"source": "discord_message", "starts_with": "!deploy"},
        )
        assert result["trigger"]["source"] == "discord_message"
        assert result["trigger"]["starts_with"] == "!deploy"
        assert result["one_time"] is False
        assert len(sched.list_all()) == 1

    def test_add_message_trigger_with_regex(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        result = sched.add(
            description="Regex trigger",
            action="reminder",
            channel_id="999",
            message="Matched!",
            trigger={
                "source": "discord_message",
                "content_regex": r"^!run\s+\w+",
                "channel_id": "333333333",
            },
        )
        assert result["trigger"]["content_regex"] == r"^!run\s+\w+"


# ---------------------------------------------------------------------------
# Tests — Config Schema
# ---------------------------------------------------------------------------

class TestMessageTriggerConfig:
    """MessageTriggerConfig model tests."""

    def test_default_disabled(self):
        cfg = MessageTriggerConfig()
        assert cfg.enabled is False
        assert cfg.channel_ids == []
        assert cfg.allowed_user_ids == []

    def test_enabled_with_channels(self):
        cfg = MessageTriggerConfig(
            enabled=True,
            channel_ids=["111", "222"],
        )
        assert cfg.enabled is True
        assert cfg.channel_ids == ["111", "222"]

    def test_with_allowed_users(self):
        cfg = MessageTriggerConfig(
            enabled=True,
            allowed_user_ids=["333"],
        )
        assert cfg.allowed_user_ids == ["333"]

    def test_from_dict(self):
        cfg = MessageTriggerConfig(**{
            "enabled": True,
            "channel_ids": ["111"],
            "allowed_user_ids": ["222"],
        })
        assert cfg.enabled is True
        assert cfg.channel_ids == ["111"]
        assert cfg.allowed_user_ids == ["222"]


# ---------------------------------------------------------------------------
# Tests — Full Config integration
# ---------------------------------------------------------------------------

class TestConfigIntegration:
    """MessageTriggerConfig integrates into main Config."""

    def test_config_has_message_triggers(self):
        from src.config.schema import Config
        cfg = Config(discord={"token": "test"})
        assert hasattr(cfg, "message_triggers")
        assert isinstance(cfg.message_triggers, MessageTriggerConfig)
        assert cfg.message_triggers.enabled is False

    def test_config_with_message_triggers(self):
        from src.config.schema import Config
        cfg = Config(
            discord={"token": "test"},
            message_triggers={"enabled": True, "channel_ids": ["123"]},
        )
        assert cfg.message_triggers.enabled is True
        assert cfg.message_triggers.channel_ids == ["123"]


# ---------------------------------------------------------------------------
# Tests — Integration: fire_triggers end-to-end
# ---------------------------------------------------------------------------

class TestFireTriggersIntegration:
    """End-to-end: scheduler.fire_triggers with discord_message source."""

    async def test_fire_matching_trigger(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        fired_schedules: list[dict] = []

        async def cb(schedule):
            fired_schedules.append(schedule)

        sched.start(cb)
        sched.add(
            description="Deploy on command",
            action="reminder",
            channel_id="999",
            message="Deploy triggered!",
            trigger={"source": "discord_message", "starts_with": "!deploy"},
        )

        count = await sched.fire_triggers("discord_message", {
            "event": "message_create",
            "content": "!deploy prod",
            "author_id": "222",
            "channel_id": "333",
        })
        await sched.stop()

        assert count == 1
        assert len(fired_schedules) == 1
        assert fired_schedules[0]["description"] == "Deploy on command"

    async def test_no_fire_on_non_matching_content(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        fired_schedules: list[dict] = []

        async def cb(schedule):
            fired_schedules.append(schedule)

        sched.start(cb)
        sched.add(
            description="Deploy on command",
            action="reminder",
            channel_id="999",
            message="Deploy triggered!",
            trigger={"source": "discord_message", "starts_with": "!deploy"},
        )

        count = await sched.fire_triggers("discord_message", {
            "event": "message_create",
            "content": "hello world",
            "author_id": "222",
            "channel_id": "333",
        })
        await sched.stop()

        assert count == 0
        assert len(fired_schedules) == 0

    async def test_multiple_triggers_fire(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        fired_schedules: list[dict] = []

        async def cb(schedule):
            fired_schedules.append(schedule)

        sched.start(cb)
        sched.add(
            description="Action A",
            action="reminder",
            channel_id="999",
            message="A",
            trigger={"source": "discord_message", "content_contains": "deploy"},
        )
        sched.add(
            description="Action B",
            action="reminder",
            channel_id="999",
            message="B",
            trigger={"source": "discord_message", "starts_with": "!deploy"},
        )

        count = await sched.fire_triggers("discord_message", {
            "event": "message_create",
            "content": "!deploy prod",
        })
        await sched.stop()

        assert count == 2
        assert len(fired_schedules) == 2

    async def test_regex_trigger_fires(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        fired_schedules: list[dict] = []

        async def cb(schedule):
            fired_schedules.append(schedule)

        sched.start(cb)
        sched.add(
            description="Regex deploy",
            action="reminder",
            channel_id="999",
            message="Regex matched",
            trigger={"source": "discord_message", "content_regex": r"^!deploy\s+(prod|staging)$"},
        )

        count = await sched.fire_triggers("discord_message", {
            "event": "message_create",
            "content": "!deploy prod",
        })
        await sched.stop()

        assert count == 1

    async def test_regex_trigger_no_match(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        fired_schedules: list[dict] = []

        async def cb(schedule):
            fired_schedules.append(schedule)

        sched.start(cb)
        sched.add(
            description="Regex deploy",
            action="reminder",
            channel_id="999",
            message="Regex matched",
            trigger={"source": "discord_message", "content_regex": r"^!deploy\s+(prod|staging)$"},
        )

        count = await sched.fire_triggers("discord_message", {
            "event": "message_create",
            "content": "!deploy dev",
        })
        await sched.stop()

        assert count == 0

    async def test_message_trigger_doesnt_fire_reaction(self, tmp_path):
        """discord_message triggers don't fire on discord_reaction events."""
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        fired_schedules: list[dict] = []

        async def cb(schedule):
            fired_schedules.append(schedule)

        sched.start(cb)
        sched.add(
            description="Message trigger",
            action="reminder",
            channel_id="999",
            message="Msg",
            trigger={"source": "discord_message", "content_contains": "deploy"},
        )
        sched.add(
            description="Reaction trigger",
            action="reminder",
            channel_id="999",
            message="React",
            trigger={"source": "discord_reaction", "emoji": "\U0001f680"},
        )

        # Fire a discord_message event — only message trigger should fire
        count = await sched.fire_triggers("discord_message", {
            "event": "message_create",
            "content": "deploy now",
        })
        await sched.stop()

        assert count == 1
        assert fired_schedules[0]["description"] == "Message trigger"

    async def test_equals_trigger_exact(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        fired_schedules: list[dict] = []

        async def cb(schedule):
            fired_schedules.append(schedule)

        sched.start(cb)
        sched.add(
            description="Exact match",
            action="reminder",
            channel_id="999",
            message="Exact!",
            trigger={"source": "discord_message", "equals": "!status"},
        )

        # Exact match fires
        count = await sched.fire_triggers("discord_message", {
            "event": "message_create",
            "content": "!status",
        })
        assert count == 1

        # Partial doesn't
        count = await sched.fire_triggers("discord_message", {
            "event": "message_create",
            "content": "!status please",
        })
        await sched.stop()
        assert count == 0
