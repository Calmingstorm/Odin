"""Shared test fixtures for Odin."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture
def mock_bot():
    """A mock OdinBot with common attributes."""
    bot = MagicMock()
    bot.user = MagicMock()
    bot.user.id = 123456789
    bot.user.__str__ = lambda self: "Odin#0001"
    bot.guilds = []
    bot.latency = 0.042
    bot.wait_until_ready = AsyncMock()
    bot.get_channel = MagicMock(return_value=None)
    return bot


@pytest.fixture
def mock_ctx(mock_bot):
    """A mock commands.Context with guild, author, channel."""
    ctx = MagicMock()
    ctx.bot = mock_bot
    ctx.send = AsyncMock()

    # Guild
    ctx.guild = MagicMock()
    ctx.guild.id = 111111111
    ctx.guild.name = "Test Server"
    ctx.guild.member_count = 50
    ctx.guild.roles = []
    ctx.guild.channels = []
    ctx.guild.owner = MagicMock()
    ctx.guild.icon = None
    ctx.guild.me = MagicMock()
    ctx.guild.me.guild_permissions = MagicMock()

    # Author
    ctx.author = MagicMock()
    ctx.author.id = 222222222
    ctx.author.__str__ = lambda self: "TestUser#0001"
    ctx.author.mention = "<@222222222>"
    ctx.author.guild_permissions = MagicMock()
    ctx.author.guild_permissions.administrator = True
    ctx.author.guild_permissions.ban_members = True
    ctx.author.guild_permissions.kick_members = True
    ctx.author.guild_permissions.manage_messages = True
    ctx.author.top_role = MagicMock()
    ctx.author.top_role.position = 10

    # Channel
    ctx.channel = MagicMock()
    ctx.channel.id = 333333333
    ctx.channel.mention = "<#333333333>"
    ctx.channel.purge = AsyncMock(return_value=[MagicMock()] * 5)

    return ctx


@pytest.fixture
def mock_member():
    """A mock Discord member (target of moderation)."""
    member = MagicMock()
    member.id = 444444444
    member.__str__ = lambda self: "TargetUser#0002"
    member.mention = "<@444444444>"
    member.top_role = MagicMock()
    member.top_role.position = 5
    member.ban = AsyncMock()
    member.kick = AsyncMock()
    member.timeout = AsyncMock()
    member.display_avatar = MagicMock()
    member.display_avatar.url = "https://example.com/avatar.png"
    member.joined_at = None
    member.created_at = MagicMock()
    return member


@pytest.fixture
def odin_config():
    """A test OdinConfig."""
    from src.config import OdinConfig

    return OdinConfig(
        token="test-token-not-real",
        prefix="!",
        log_level="DEBUG",
        web_secret="test-secret",
    )
