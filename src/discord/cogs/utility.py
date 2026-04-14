"""Utility cog — informational and helper commands."""

from __future__ import annotations

import platform
from datetime import datetime, timezone

import discord
from discord.ext import commands

from src import __version__
from src.constants import BOT_NAME
from src.discord.helpers.embeds import info_embed, odin_embed


class Utility(commands.Cog):
    """General utility commands."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.command()
    async def ping(self, ctx: commands.Context) -> None:
        """Check the bot's latency."""
        latency_ms = round(self.bot.latency * 1000)
        await ctx.send(embed=odin_embed(description=f"Pong! **{latency_ms}ms**"))

    @commands.command()
    async def about(self, ctx: commands.Context) -> None:
        """Show information about the bot."""
        fields = {
            "Version": __version__,
            "Library": f"discord.py {discord.__version__}",
            "Python": platform.python_version(),
            "Guilds": str(len(self.bot.guilds)),
            "Users": str(sum(g.member_count or 0 for g in self.bot.guilds)),
        }
        await ctx.send(embed=info_embed(f"About {BOT_NAME}", fields))

    @commands.command()
    async def serverinfo(self, ctx: commands.Context) -> None:
        """Show server information."""
        guild = ctx.guild
        if guild is None:
            return
        fields = {
            "Owner": str(guild.owner),
            "Members": str(guild.member_count),
            "Roles": str(len(guild.roles)),
            "Channels": str(len(guild.channels)),
            "Created": discord.utils.format_dt(guild.created_at, "R"),
        }
        embed = info_embed(guild.name, fields)
        if guild.icon:
            embed.set_thumbnail(url=guild.icon.url)
        await ctx.send(embed=embed)

    @commands.command()
    async def userinfo(
        self, ctx: commands.Context, member: discord.Member | None = None
    ) -> None:
        """Show information about a user."""
        member = member or ctx.author  # type: ignore[assignment]
        fields = {
            "ID": str(member.id),
            "Joined": discord.utils.format_dt(member.joined_at, "R") if member.joined_at else "Unknown",
            "Created": discord.utils.format_dt(member.created_at, "R"),
            "Roles": ", ".join(r.mention for r in member.roles[1:]) or "None",
        }
        embed = info_embed(str(member), fields)
        embed.set_thumbnail(url=member.display_avatar.url)
        await ctx.send(embed=embed)

    @commands.command()
    async def avatar(
        self, ctx: commands.Context, member: discord.Member | None = None
    ) -> None:
        """Show a user's avatar."""
        member = member or ctx.author  # type: ignore[assignment]
        embed = odin_embed(title=f"{member}'s Avatar")
        embed.set_image(url=member.display_avatar.url)
        await ctx.send(embed=embed)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Utility(bot))
