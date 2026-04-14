"""Tests for cooldown manager."""


from src.discord.helpers.cooldowns import CooldownManager


class TestCooldownManager:
    def test_no_cooldown_initially(self):
        mgr = CooldownManager()
        assert mgr.is_on_cooldown("test", 1) is False
        assert mgr.remaining("test", 1) == 0.0

    def test_set_cooldown(self):
        mgr = CooldownManager()
        mgr.set_cooldown("test", 1, 60.0)
        assert mgr.is_on_cooldown("test", 1) is True
        assert mgr.remaining("test", 1) > 0

    def test_different_users(self):
        mgr = CooldownManager()
        mgr.set_cooldown("test", 1, 60.0)
        assert mgr.is_on_cooldown("test", 2) is False

    def test_different_actions(self):
        mgr = CooldownManager()
        mgr.set_cooldown("action_a", 1, 60.0)
        assert mgr.is_on_cooldown("action_b", 1) is False

    def test_reset(self):
        mgr = CooldownManager()
        mgr.set_cooldown("test", 1, 60.0)
        mgr.reset("test", 1)
        assert mgr.is_on_cooldown("test", 1) is False

    def test_clear_expired(self):
        mgr = CooldownManager()
        mgr.set_cooldown("test", 1, 0.0)  # Already expired
        removed = mgr.clear_expired()
        assert removed >= 1
