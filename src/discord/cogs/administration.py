"""Administration cog — server configuration and management."""

from __future__ import annotations

import logging

import discord
from discord.ext import commands

from src.discord.helpers.embeds import info_embed, success_embed, error_embed
from src.discord.helpers.permissions import is_admin

logger = logging.getLogger("odin.cogs.admin")


class Administration(commands.Cog):
    """Server administration commands."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        # In-memory guild settings (would be persisted to DB in production)
        self._guild_settings: dict[int, dict] = {}

    def _settings(self, guild_id: int) -> dict:
        return self._guild_settings.setdefault(guild_id, {
            "prefix": "!",
            "log_channel": None,
            "autorole": None,
            "welcome_message": None,
        })

    @commands.command()
    @is_admin()
    async def setprefix(self, ctx: commands.Context, prefix: str) -> None:
        """Set the command prefix for this server."""
        if len(prefix) > 5:
            await ctx.send(embed=error_embed("Prefix must be 5 characters or fewer."))
            return
        self._settings(ctx.guild.id)["prefix"] = prefix  # type: ignore[union-attr]
        await ctx.send(embed=success_embed(f"Prefix set to `{prefix}`."))

    @commands.command()
    @is_admin()
    async def setlogchannel(
        self, ctx: commands.Context, channel: discord.TextChannel
    ) -> None:
        """Set the channel for audit log messages."""
        self._settings(ctx.guild.id)["log_channel"] = channel.id  # type: ignore[union-attr]
        await ctx.send(embed=success_embed(f"Log channel set to {channel.mention}."))

    @commands.command()
    @is_admin()
    async def autorole(
        self, ctx: commands.Context, role: discord.Role | None = None
    ) -> None:
        """Set or clear the auto-assigned role for new members."""
        self._settings(ctx.guild.id)["autorole"] = role.id if role else None  # type: ignore[union-attr]
        if role:
            await ctx.send(embed=success_embed(f"Auto-role set to {role.mention}."))
        else:
            await ctx.send(embed=success_embed("Auto-role cleared."))

    @commands.command()
    @is_admin()
    async def serversettings(self, ctx: commands.Context) -> None:
        """Display current server settings."""
        settings = self._settings(ctx.guild.id)  # type: ignore[union-attr]
        fields = {
            "Prefix": f"`{settings['prefix']}`",
            "Log Channel": f"<#{settings['log_channel']}>" if settings["log_channel"] else "Not set",
            "Auto-Role": f"<@&{settings['autorole']}>" if settings["autorole"] else "Not set",
        }
        await ctx.send(embed=info_embed("Server Settings", fields))


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Administration(bot))
