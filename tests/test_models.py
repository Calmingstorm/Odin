"""Tests for data models."""

from datetime import UTC, datetime

from src.models.guild import GuildSettings
from src.models.infraction import Infraction
from src.models.reminder import ReminderRecord
from src.models.user import UserProfile


class TestGuildSettings:
    def test_defaults(self):
        gs = GuildSettings(guild_id=1)
        assert gs.prefix == "!"
        assert gs.log_channel_id is None
        assert gs.filtered_words == []

    def test_to_dict(self):
        gs = GuildSettings(guild_id=1, prefix="?")
        d = gs.to_dict()
        assert d["guild_id"] == 1
        assert d["prefix"] == "?"

    def test_from_dict(self):
        gs = GuildSettings.from_dict({"guild_id": 1, "prefix": "?"})
        assert gs.guild_id == 1
        assert gs.prefix == "?"

    def test_roundtrip(self):
        original = GuildSettings(guild_id=42, prefix=">>", spam_filter_enabled=True)
        restored = GuildSettings.from_dict(original.to_dict())
        assert restored.guild_id == original.guild_id
        assert restored.prefix == original.prefix
        assert restored.spam_filter_enabled == original.spam_filter_enabled


class TestInfraction:
    def test_creation(self):
        inf = Infraction(guild_id=1, user_id=2, moderator_id=3, action="ban")
        assert inf.action == "ban"
        assert inf.reason == "No reason provided"

    def test_to_dict(self):
        inf = Infraction(guild_id=1, user_id=2, moderator_id=3, action="warn", reason="Spam")
        d = inf.to_dict()
        assert d["action"] == "warn"
        assert d["reason"] == "Spam"
        assert "created_at" in d

    def test_from_dict(self):
        now = datetime.now(UTC)
        inf = Infraction.from_dict({
            "guild_id": 1,
            "user_id": 2,
            "moderator_id": 3,
            "action": "kick",
            "created_at": now.isoformat(),
        })
        assert inf.action == "kick"


class TestUserProfile:
    def test_defaults(self):
        up = UserProfile(user_id=1, guild_id=2)
        assert up.xp == 0
        assert up.level == 0

    def test_roundtrip(self):
        up = UserProfile(user_id=1, guild_id=2, xp=100, level=5)
        restored = UserProfile.from_dict(up.to_dict())
        assert restored.xp == 100
        assert restored.level == 5


class TestReminderRecord:
    def test_creation(self):
        now = datetime.now(UTC)
        r = ReminderRecord(user_id=1, channel_id=2, message="test", fire_at=now)
        assert r.message == "test"

    def test_to_dict(self):
        now = datetime.now(UTC)
        r = ReminderRecord(user_id=1, channel_id=2, message="test", fire_at=now)
        d = r.to_dict()
        assert d["message"] == "test"
        assert "fire_at" in d

    def test_from_dict(self):
        now = datetime.now(UTC)
        r = ReminderRecord(user_id=1, channel_id=2, message="test", fire_at=now)
        restored = ReminderRecord.from_dict(r.to_dict())
        assert restored.user_id == 1
        assert restored.message == "test"

    def test_roundtrip(self):
        now = datetime.now(UTC)
        original = ReminderRecord(user_id=1, channel_id=2, message="hello", fire_at=now)
        restored = ReminderRecord.from_dict(original.to_dict())
        assert restored.user_id == original.user_id
        assert restored.message == original.message
        assert restored.channel_id == original.channel_id
