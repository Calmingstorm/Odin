"""Moderation cog — ban, kick, mute, warn commands."""

from __future__ import annotations

import logging

import discord
from discord.ext import commands

from src.discord.helpers.converters import ReasonConverter
from src.discord.helpers.embeds import moderation_embed, success_embed, error_embed
from src.discord.helpers.permissions import bot_has_guild_permissions, is_moderator

logger = logging.getLogger("odin.cogs.moderation")


class Moderation(commands.Cog):
    """Server moderation commands."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    # ------------------------------------------------------------------
    # Ban
    # ------------------------------------------------------------------

    @commands.command()
    @is_moderator()
    @bot_has_guild_permissions(ban_members=True)
    async def ban(
        self,
        ctx: commands.Context,
        member: discord.Member,
        *,
        reason: str = "No reason provided",
    ) -> None:
        """Ban a member from the server."""
        if member.top_role >= ctx.author.top_role:  # type: ignore[union-attr]
            await ctx.send(embed=error_embed("You cannot ban someone with an equal or higher role."))
            return
        await member.ban(reason=f"{ctx.author}: {reason}")
        embed = moderation_embed("Ban", ctx.author, member, reason)
        await ctx.send(embed=embed)
        logger.info("%s banned %s in %s", ctx.author, member, ctx.guild)

    # ------------------------------------------------------------------
    # Kick
    # ------------------------------------------------------------------

    @commands.command()
    @is_moderator()
    @bot_has_guild_permissions(kick_members=True)
    async def kick(
        self,
        ctx: commands.Context,
        member: discord.Member,
        *,
        reason: str = "No reason provided",
    ) -> None:
        """Kick a member from the server."""
        if member.top_role >= ctx.author.top_role:  # type: ignore[union-attr]
            await ctx.send(embed=error_embed("You cannot kick someone with an equal or higher role."))
            return
        await member.kick(reason=f"{ctx.author}: {reason}")
        embed = moderation_embed("Kick", ctx.author, member, reason)
        await ctx.send(embed=embed)
        logger.info("%s kicked %s in %s", ctx.author, member, ctx.guild)

    # ------------------------------------------------------------------
    # Mute (timeout)
    # ------------------------------------------------------------------

    @commands.command()
    @is_moderator()
    @bot_has_guild_permissions(moderate_members=True)
    async def mute(
        self,
        ctx: commands.Context,
        member: discord.Member,
        duration: str = "10m",
        *,
        reason: str = "No reason provided",
    ) -> None:
        """Timeout a member. Duration examples: 10m, 1h, 1d."""
        from src.discord.helpers.converters import DurationConverter

        converter = DurationConverter()
        td = await converter.convert(ctx, duration)
        await member.timeout(td, reason=f"{ctx.author}: {reason}")
        embed = moderation_embed("Mute", ctx.author, member, f"{reason} ({duration})")
        await ctx.send(embed=embed)

    @commands.command()
    @is_moderator()
    @bot_has_guild_permissions(moderate_members=True)
    async def unmute(
        self,
        ctx: commands.Context,
        member: discord.Member,
    ) -> None:
        """Remove timeout from a member."""
        await member.timeout(None)
        await ctx.send(embed=success_embed(f"Unmuted {member.mention}."))

    # ------------------------------------------------------------------
    # Warn (local tracking — stores in-memory for now)
    # ------------------------------------------------------------------

    _warnings: dict[int, dict[int, list[str]]] = {}  # guild -> user -> reasons

    @commands.command()
    @is_moderator()
    async def warn(
        self,
        ctx: commands.Context,
        member: discord.Member,
        *,
        reason: str = "No reason provided",
    ) -> None:
        """Issue a warning to a member."""
        guild_warns = self._warnings.setdefault(ctx.guild.id, {})  # type: ignore[union-attr]
        user_warns = guild_warns.setdefault(member.id, [])
        user_warns.append(reason)
        embed = moderation_embed("Warning", ctx.author, member, reason)
        embed.add_field(name="Total Warnings", value=str(len(user_warns)))
        await ctx.send(embed=embed)

    @commands.command()
    @is_moderator()
    async def warnings(
        self,
        ctx: commands.Context,
        member: discord.Member,
    ) -> None:
        """View warnings for a member."""
        guild_warns = self._warnings.get(ctx.guild.id, {})  # type: ignore[union-attr]
        user_warns = guild_warns.get(member.id, [])
        if not user_warns:
            await ctx.send(embed=success_embed(f"{member.mention} has no warnings."))
            return
        lines = [f"{i}. {r}" for i, r in enumerate(user_warns, 1)]
        from src.discord.helpers.embeds import odin_embed

        embed = odin_embed(
            title=f"Warnings for {member}",
            description="\n".join(lines),
        )
        await ctx.send(embed=embed)

    # ------------------------------------------------------------------
    # Purge
    # ------------------------------------------------------------------

    @commands.command()
    @is_moderator()
    @bot_has_guild_permissions(manage_messages=True)
    async def purge(
        self,
        ctx: commands.Context,
        count: int = 10,
    ) -> None:
        """Delete messages from the current channel (default 10, max 100)."""
        count = min(max(count, 1), 100)
        deleted = await ctx.channel.purge(limit=count + 1)  # +1 for command msg
        await ctx.send(
            embed=success_embed(f"Deleted {len(deleted) - 1} messages."),
            delete_after=5,
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Moderation(bot))
