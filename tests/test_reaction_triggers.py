"""Tests for Discord reaction trigger integration.

Covers:
- ReactionTriggers cog event handling
- Emoji normalization (unicode and custom)
- Channel and user allowlists
- Scheduler trigger matching for discord_reaction source
- Trigger key matching (emoji, user_id, channel_id)
- Config schema (ReactionTriggerConfig)
- Integration: reaction → scheduler.fire_triggers
"""

from __future__ import annotations

import json

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.config.schema import ReactionTriggerConfig
from src.discord.cogs.reaction_triggers import ReactionTriggers
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
) -> ReactionTriggerConfig:
    return ReactionTriggerConfig(
        enabled=enabled,
        channel_ids=channel_ids or [],
        allowed_user_ids=allowed_user_ids or [],
    )


def _make_payload(
    *,
    user_id: int = 222222222,
    channel_id: int = 333333333,
    message_id: int = 444444444,
    guild_id: int = 111111111,
    emoji_name: str = "\U0001f680",  # 🚀
    emoji_id: int | None = None,
    animated: bool = False,
) -> MagicMock:
    """Create a mock RawReactionActionEvent payload."""
    payload = MagicMock()
    payload.user_id = user_id
    payload.channel_id = channel_id
    payload.message_id = message_id
    payload.guild_id = guild_id

    emoji = MagicMock()
    emoji.name = emoji_name
    emoji.id = emoji_id
    emoji.animated = animated

    if emoji_id is None:
        # Unicode emoji
        emoji.is_unicode_emoji.return_value = True
        emoji.__str__ = lambda self: emoji_name
    else:
        # Custom emoji
        emoji.is_unicode_emoji.return_value = False

    payload.emoji = emoji
    return payload


def _make_scheduler(fired: int = 0) -> MagicMock:
    scheduler = MagicMock(spec=Scheduler)
    scheduler.fire_triggers = AsyncMock(return_value=fired)
    return scheduler


# ---------------------------------------------------------------------------
# Tests — Cog Basics
# ---------------------------------------------------------------------------

class TestReactionTriggersEnabled:
    """Test enabled/disabled state."""

    def test_disabled_by_default(self):
        cog = ReactionTriggers(_make_bot())
        assert not cog.enabled

    def test_enabled_with_config_and_scheduler(self):
        cog = ReactionTriggers(
            _make_bot(),
            config=_make_config(enabled=True),
            scheduler=_make_scheduler(),
        )
        assert cog.enabled

    def test_disabled_when_config_off(self):
        cog = ReactionTriggers(
            _make_bot(),
            config=_make_config(enabled=False),
            scheduler=_make_scheduler(),
        )
        assert not cog.enabled

    def test_disabled_without_scheduler(self):
        cog = ReactionTriggers(
            _make_bot(),
            config=_make_config(enabled=True),
        )
        assert not cog.enabled

    def test_set_scheduler(self):
        cog = ReactionTriggers(_make_bot(), config=_make_config(enabled=True))
        assert not cog.enabled
        cog.set_scheduler(_make_scheduler())
        assert cog.enabled

    def test_set_config(self):
        cog = ReactionTriggers(_make_bot(), scheduler=_make_scheduler())
        assert not cog.enabled
        cog.set_config(_make_config(enabled=True))
        assert cog.enabled


# ---------------------------------------------------------------------------
# Tests — Emoji Normalization
# ---------------------------------------------------------------------------

class TestEmojiNormalization:
    """Emoji name extraction for unicode and custom emoji."""

    def setup_method(self):
        self.cog = ReactionTriggers(_make_bot())

    def test_unicode_emoji(self):
        emoji = MagicMock()
        emoji.is_unicode_emoji.return_value = True
        emoji.__str__ = lambda self: "\U0001f680"
        assert self.cog._emoji_name(emoji) == "\U0001f680"

    def test_custom_emoji(self):
        emoji = MagicMock()
        emoji.is_unicode_emoji.return_value = False
        emoji.name = "deploy"
        assert self.cog._emoji_name(emoji) == "deploy"

    def test_custom_emoji_no_name(self):
        emoji = MagicMock()
        emoji.is_unicode_emoji.return_value = False
        emoji.name = None
        assert self.cog._emoji_name(emoji) == ""

    def test_check_mark_emoji(self):
        emoji = MagicMock()
        emoji.is_unicode_emoji.return_value = True
        emoji.__str__ = lambda self: "\u2705"
        assert self.cog._emoji_name(emoji) == "\u2705"


# ---------------------------------------------------------------------------
# Tests — Channel Allowlist
# ---------------------------------------------------------------------------

class TestChannelAllowlist:
    """Channel filtering for reaction triggers."""

    def test_empty_list_allows_all(self):
        cog = ReactionTriggers(
            _make_bot(),
            config=_make_config(channel_ids=[]),
        )
        assert cog._is_channel_allowed(333333333)
        assert cog._is_channel_allowed(999999999)

    def test_specific_channels(self):
        cog = ReactionTriggers(
            _make_bot(),
            config=_make_config(channel_ids=["333333333", "444444444"]),
        )
        assert cog._is_channel_allowed(333333333)
        assert cog._is_channel_allowed(444444444)
        assert not cog._is_channel_allowed(555555555)

    def test_no_config_denies(self):
        cog = ReactionTriggers(_make_bot())
        assert not cog._is_channel_allowed(333333333)


# ---------------------------------------------------------------------------
# Tests — User Allowlist
# ---------------------------------------------------------------------------

class TestUserAllowlist:
    """User filtering for reaction triggers."""

    def test_empty_list_allows_all(self):
        cog = ReactionTriggers(
            _make_bot(),
            config=_make_config(allowed_user_ids=[]),
        )
        assert cog._is_user_allowed(222222222)

    def test_specific_users(self):
        cog = ReactionTriggers(
            _make_bot(),
            config=_make_config(allowed_user_ids=["222222222"]),
        )
        assert cog._is_user_allowed(222222222)
        assert not cog._is_user_allowed(999999999)

    def test_no_config_denies(self):
        cog = ReactionTriggers(_make_bot())
        assert not cog._is_user_allowed(222222222)


# ---------------------------------------------------------------------------
# Tests — Reaction Event Handling
# ---------------------------------------------------------------------------

class TestReactionEventHandling:
    """on_raw_reaction_add dispatches to scheduler correctly."""

    @pytest.fixture
    def scheduler(self):
        return _make_scheduler(fired=1)

    @pytest.fixture
    def cog(self, scheduler):
        return ReactionTriggers(
            _make_bot(),
            config=_make_config(enabled=True),
            scheduler=scheduler,
        )

    async def test_fires_trigger_on_reaction(self, cog, scheduler):
        payload = _make_payload(emoji_name="\U0001f680")
        await cog.on_raw_reaction_add(payload)

        scheduler.fire_triggers.assert_awaited_once()
        source, event_data = scheduler.fire_triggers.call_args[0]
        assert source == "discord_reaction"
        assert event_data["event"] == "reaction_add"
        assert event_data["emoji"] == "\U0001f680"
        assert event_data["user_id"] == "222222222"
        assert event_data["channel_id"] == "333333333"
        assert event_data["message_id"] == "444444444"
        assert event_data["guild_id"] == "111111111"

    async def test_ignores_bot_own_reaction(self, cog, scheduler):
        payload = _make_payload(user_id=123456789)  # bot's own ID
        await cog.on_raw_reaction_add(payload)
        scheduler.fire_triggers.assert_not_awaited()

    async def test_ignores_when_disabled(self, scheduler):
        cog = ReactionTriggers(
            _make_bot(),
            config=_make_config(enabled=False),
            scheduler=scheduler,
        )
        await cog.on_raw_reaction_add(_make_payload())
        scheduler.fire_triggers.assert_not_awaited()

    async def test_ignores_disallowed_channel(self, scheduler):
        cog = ReactionTriggers(
            _make_bot(),
            config=_make_config(enabled=True, channel_ids=["999"]),
            scheduler=scheduler,
        )
        payload = _make_payload(channel_id=333333333)
        await cog.on_raw_reaction_add(payload)
        scheduler.fire_triggers.assert_not_awaited()

    async def test_ignores_disallowed_user(self, scheduler):
        cog = ReactionTriggers(
            _make_bot(),
            config=_make_config(enabled=True, allowed_user_ids=["999"]),
            scheduler=scheduler,
        )
        payload = _make_payload(user_id=222222222)
        await cog.on_raw_reaction_add(payload)
        scheduler.fire_triggers.assert_not_awaited()

    async def test_custom_emoji_fires(self, cog, scheduler):
        payload = _make_payload(emoji_name="deploy", emoji_id=12345)
        await cog.on_raw_reaction_add(payload)

        scheduler.fire_triggers.assert_awaited_once()
        _, event_data = scheduler.fire_triggers.call_args[0]
        assert event_data["emoji"] == "deploy"

    async def test_empty_emoji_name_skipped(self, cog, scheduler):
        payload = _make_payload(emoji_name=None, emoji_id=12345)
        # Force empty name return
        payload.emoji.name = None
        payload.emoji.is_unicode_emoji.return_value = False
        await cog.on_raw_reaction_add(payload)
        scheduler.fire_triggers.assert_not_awaited()

    async def test_scheduler_error_handled(self, cog, scheduler):
        scheduler.fire_triggers = AsyncMock(side_effect=RuntimeError("boom"))
        payload = _make_payload()
        # Should not raise
        await cog.on_raw_reaction_add(payload)

    async def test_dm_reaction_guild_id_empty(self, scheduler):
        cog = ReactionTriggers(
            _make_bot(),
            config=_make_config(enabled=True),
            scheduler=scheduler,
        )
        payload = _make_payload(guild_id=None)
        payload.guild_id = None
        await cog.on_raw_reaction_add(payload)

        scheduler.fire_triggers.assert_awaited_once()
        _, event_data = scheduler.fire_triggers.call_args[0]
        assert event_data["guild_id"] == ""


# ---------------------------------------------------------------------------
# Tests — Scheduler Trigger Matching for discord_reaction
# ---------------------------------------------------------------------------

class TestSchedulerReactionSource:
    """Scheduler validates and matches discord_reaction triggers."""

    def test_validate_reaction_source(self):
        Scheduler._validate_trigger({"source": "discord_reaction", "emoji": "\U0001f680"})

    def test_validate_emoji_key(self):
        Scheduler._validate_trigger({"emoji": "\U0001f680"})

    def test_validate_user_id_key(self):
        Scheduler._validate_trigger({"user_id": "222222222"})

    def test_validate_channel_id_key(self):
        Scheduler._validate_trigger({"channel_id": "333333333"})

    def test_validate_combined_keys(self):
        Scheduler._validate_trigger({
            "source": "discord_reaction",
            "emoji": "\U0001f680",
            "user_id": "222222222",
            "channel_id": "333333333",
        })

    def test_trigger_matches_emoji(self):
        trigger = {"source": "discord_reaction", "emoji": "\U0001f680"}
        assert Scheduler._trigger_matches(
            trigger, "discord_reaction",
            {"event": "reaction_add", "emoji": "\U0001f680"},
        )

    def test_trigger_no_match_wrong_emoji(self):
        trigger = {"source": "discord_reaction", "emoji": "\U0001f680"}
        assert not Scheduler._trigger_matches(
            trigger, "discord_reaction",
            {"event": "reaction_add", "emoji": "\u2705"},
        )

    def test_trigger_matches_user_id(self):
        trigger = {"source": "discord_reaction", "user_id": "222222222"}
        assert Scheduler._trigger_matches(
            trigger, "discord_reaction",
            {"event": "reaction_add", "emoji": "\U0001f680", "user_id": "222222222"},
        )

    def test_trigger_no_match_wrong_user(self):
        trigger = {"source": "discord_reaction", "user_id": "222222222"}
        assert not Scheduler._trigger_matches(
            trigger, "discord_reaction",
            {"event": "reaction_add", "emoji": "\U0001f680", "user_id": "999999999"},
        )

    def test_trigger_matches_channel_id(self):
        trigger = {"source": "discord_reaction", "channel_id": "333333333"}
        assert Scheduler._trigger_matches(
            trigger, "discord_reaction",
            {"event": "reaction_add", "channel_id": "333333333"},
        )

    def test_trigger_no_match_wrong_channel(self):
        trigger = {"source": "discord_reaction", "channel_id": "333333333"}
        assert not Scheduler._trigger_matches(
            trigger, "discord_reaction",
            {"event": "reaction_add", "channel_id": "999999999"},
        )

    def test_trigger_matches_all_fields(self):
        trigger = {
            "source": "discord_reaction",
            "emoji": "\U0001f680",
            "user_id": "222222222",
            "channel_id": "333333333",
        }
        assert Scheduler._trigger_matches(
            trigger, "discord_reaction",
            {
                "event": "reaction_add",
                "emoji": "\U0001f680",
                "user_id": "222222222",
                "channel_id": "333333333",
            },
        )

    def test_trigger_fails_on_one_mismatch(self):
        trigger = {
            "source": "discord_reaction",
            "emoji": "\U0001f680",
            "user_id": "222222222",
        }
        # emoji matches but user doesn't
        assert not Scheduler._trigger_matches(
            trigger, "discord_reaction",
            {
                "event": "reaction_add",
                "emoji": "\U0001f680",
                "user_id": "999999999",
            },
        )

    def test_trigger_no_match_wrong_source(self):
        trigger = {"source": "discord_reaction", "emoji": "\U0001f680"}
        assert not Scheduler._trigger_matches(
            trigger, "github",
            {"event": "push", "emoji": "\U0001f680"},
        )

    async def test_add_reaction_trigger_schedule(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        result = await sched.add(
            description="Deploy on rocket reaction",
            action="reminder",
            channel_id="999",
            message="Rocket reacted — deploying!",
            trigger={"source": "discord_reaction", "emoji": "\U0001f680"},
        )
        assert result["trigger"]["source"] == "discord_reaction"
        assert result["trigger"]["emoji"] == "\U0001f680"
        assert result["one_time"] is False
        assert len(sched.list_all()) == 1

    async def test_add_reaction_trigger_with_user_filter(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        result = await sched.add(
            description="Admin-only deploy",
            action="reminder",
            channel_id="999",
            message="Admin triggered deploy",
            trigger={
                "source": "discord_reaction",
                "emoji": "\U0001f680",
                "user_id": "222222222",
            },
        )
        assert result["trigger"]["user_id"] == "222222222"


# ---------------------------------------------------------------------------
# Tests — Config Schema
# ---------------------------------------------------------------------------

class TestReactionTriggerConfig:
    """ReactionTriggerConfig model tests."""

    def test_default_disabled(self):
        cfg = ReactionTriggerConfig()
        assert cfg.enabled is False
        assert cfg.channel_ids == []
        assert cfg.allowed_user_ids == []

    def test_enabled_with_channels(self):
        cfg = ReactionTriggerConfig(
            enabled=True,
            channel_ids=["111", "222"],
        )
        assert cfg.enabled is True
        assert cfg.channel_ids == ["111", "222"]

    def test_with_allowed_users(self):
        cfg = ReactionTriggerConfig(
            enabled=True,
            allowed_user_ids=["333"],
        )
        assert cfg.allowed_user_ids == ["333"]

    def test_from_dict(self):
        cfg = ReactionTriggerConfig(**{
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
    """ReactionTriggerConfig integrates into main Config."""

    def test_config_has_reaction_triggers(self):
        from src.config.schema import Config
        cfg = Config(discord={"token": "test"})
        assert hasattr(cfg, "reaction_triggers")
        assert isinstance(cfg.reaction_triggers, ReactionTriggerConfig)
        assert cfg.reaction_triggers.enabled is False

    def test_config_with_reaction_triggers(self):
        from src.config.schema import Config
        cfg = Config(
            discord={"token": "test"},
            reaction_triggers={"enabled": True, "channel_ids": ["123"]},
        )
        assert cfg.reaction_triggers.enabled is True
        assert cfg.reaction_triggers.channel_ids == ["123"]


# ---------------------------------------------------------------------------
# Tests — Integration: fire_triggers end-to-end
# ---------------------------------------------------------------------------

class TestFireTriggersIntegration:
    """End-to-end: scheduler.fire_triggers with discord_reaction source."""

    async def test_fire_matching_trigger(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        fired_schedules: list[dict] = []

        async def cb(schedule):
            fired_schedules.append(schedule)

        sched.start(cb)
        await sched.add(
            description="Deploy on rocket",
            action="reminder",
            channel_id="999",
            message="Deploy triggered!",
            trigger={"source": "discord_reaction", "emoji": "\U0001f680"},
        )

        count = await sched.fire_triggers("discord_reaction", {
            "event": "reaction_add",
            "emoji": "\U0001f680",
            "user_id": "222",
            "channel_id": "333",
        })
        await sched.stop()

        assert count == 1
        assert len(fired_schedules) == 1
        assert fired_schedules[0]["description"] == "Deploy on rocket"

    async def test_no_fire_on_wrong_emoji(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        fired_schedules: list[dict] = []

        async def cb(schedule):
            fired_schedules.append(schedule)

        sched.start(cb)
        await sched.add(
            description="Deploy on rocket",
            action="reminder",
            channel_id="999",
            message="Deploy triggered!",
            trigger={"source": "discord_reaction", "emoji": "\U0001f680"},
        )

        count = await sched.fire_triggers("discord_reaction", {
            "event": "reaction_add",
            "emoji": "\u2705",  # different emoji
            "user_id": "222",
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
        # Two triggers for same emoji
        await sched.add(
            description="Action A",
            action="reminder",
            channel_id="999",
            message="A",
            trigger={"source": "discord_reaction", "emoji": "\U0001f680"},
        )
        await sched.add(
            description="Action B",
            action="reminder",
            channel_id="999",
            message="B",
            trigger={"source": "discord_reaction", "emoji": "\U0001f680"},
        )

        count = await sched.fire_triggers("discord_reaction", {
            "event": "reaction_add",
            "emoji": "\U0001f680",
        })
        await sched.stop()

        assert count == 2
        assert len(fired_schedules) == 2

    async def test_webhook_trigger_unaffected(self, tmp_path):
        """discord_reaction triggers don't fire on github events and vice versa."""
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        fired_schedules: list[dict] = []

        async def cb(schedule):
            fired_schedules.append(schedule)

        sched.start(cb)
        await sched.add(
            description="GitHub trigger",
            action="reminder",
            channel_id="999",
            message="GitHub push",
            trigger={"source": "github", "event": "push"},
        )
        await sched.add(
            description="Reaction trigger",
            action="reminder",
            channel_id="999",
            message="Reaction",
            trigger={"source": "discord_reaction", "emoji": "\U0001f680"},
        )

        # Fire a discord_reaction event — only reaction trigger should fire
        count = await sched.fire_triggers("discord_reaction", {
            "event": "reaction_add",
            "emoji": "\U0001f680",
        })
        await sched.stop()

        assert count == 1
        assert fired_schedules[0]["description"] == "Reaction trigger"
