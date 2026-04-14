"""Tests for permission helpers."""

from unittest.mock import MagicMock

from src.discord.helpers.permissions import _has_any_permission


class TestHasAnyPermission:
    def test_has_permission(self):
        ctx = MagicMock()
        ctx.guild = MagicMock()
        ctx.author.guild_permissions.administrator = True
        ctx.author.guild_permissions.ban_members = False
        assert _has_any_permission(ctx, ["administrator"]) is True

    def test_missing_permission(self):
        ctx = MagicMock()
        ctx.guild = MagicMock()
        ctx.author.guild_permissions.administrator = False
        ctx.author.guild_permissions.ban_members = False
        assert _has_any_permission(ctx, ["administrator", "ban_members"]) is False

    def test_no_guild(self):
        ctx = MagicMock()
        ctx.guild = None
        assert _has_any_permission(ctx, ["administrator"]) is False
