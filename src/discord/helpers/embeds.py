"""Embed builder helpers with consistent Odin branding."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

import discord

from src.constants import (
    BOT_NAME,
    COLOR_ERROR,
    COLOR_INFO,
    COLOR_PRIMARY,
    COLOR_SUCCESS,
    COLOR_WARNING,
)

if TYPE_CHECKING:
    pass


def odin_embed(
    title: str | None = None,
    description: str | None = None,
    color: int = COLOR_PRIMARY,
) -> discord.Embed:
    """Create a branded embed with Odin footer."""
    embed = discord.Embed(
        title=title,
        description=description,
        color=color,
        timestamp=datetime.now(timezone.utc),
    )
    embed.set_footer(text=BOT_NAME)
    return embed


def success_embed(message: str) -> discord.Embed:
    """Green success embed."""
    return odin_embed(description=f"\u2705 {message}", color=COLOR_SUCCESS)


def error_embed(message: str) -> discord.Embed:
    """Red error embed."""
    return odin_embed(description=f"\u274c {message}", color=COLOR_ERROR)


def warning_embed(message: str) -> discord.Embed:
    """Yellow warning embed."""
    return odin_embed(description=f"\u26a0\ufe0f {message}", color=COLOR_WARNING)


def info_embed(title: str, fields: dict[str, str] | None = None) -> discord.Embed:
    """Info embed with optional key-value fields."""
    embed = odin_embed(title=title, color=COLOR_INFO)
    if fields:
        for name, value in fields.items():
            embed.add_field(name=name, value=value, inline=True)
    return embed


def moderation_embed(
    action: str,
    moderator: discord.Member | discord.User,
    target: discord.Member | discord.User,
    reason: str | None = None,
) -> discord.Embed:
    """Standardized moderation action embed."""
    embed = odin_embed(
        title=f"Moderation: {action}",
        color=COLOR_WARNING,
    )
    embed.add_field(name="Moderator", value=str(moderator), inline=True)
    embed.add_field(name="Target", value=str(target), inline=True)
    embed.add_field(name="Reason", value=reason or "No reason provided", inline=False)
    return embed


def log_embed(event_type: str, details: str) -> discord.Embed:
    """Audit-log style embed for server events."""
    return odin_embed(
        title=f"Log: {event_type}",
        description=details,
        color=COLOR_INFO,
    )
