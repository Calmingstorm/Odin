"""Logging cog — audit log and server event tracking."""

from __future__ import annotations

import logging

import discord
from discord.ext import commands

from src.discord.helpers.embeds import log_embed

logger = logging.getLogger("odin.cogs.logging")


class Logging(commands.Cog):
    """Logs server events to a configured channel."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        # guild_id -> channel_id
        self._log_channels: dict[int, int] = {}

    async def _send_log(self, guild: discord.Guild, embed: discord.Embed) -> None:
        channel_id = self._log_channels.get(guild.id)
        if not channel_id:
            return
        channel = guild.get_channel(channel_id)
        if isinstance(channel, discord.TextChannel):
            try:
                await channel.send(embed=embed)
            except discord.Forbidden:
                logger.warning("Cannot send to log channel %s in %s", channel_id, guild.id)

    # ------------------------------------------------------------------
    # Event listeners
    # ------------------------------------------------------------------

    @commands.Cog.listener()
    async def on_message_delete(self, message: discord.Message) -> None:
        if message.author.bot or message.guild is None:
            return
        content = message.content[:1024] or "(no text)"
        embed = log_embed(
            "Message Deleted",
            f"**Author:** {message.author.mention}\n"
            f"**Channel:** {message.channel.mention}\n"
            f"**Content:** {content}",
        )
        await self._send_log(message.guild, embed)

    @commands.Cog.listener()
    async def on_message_edit(
        self, before: discord.Message, after: discord.Message
    ) -> None:
        if before.author.bot or before.guild is None:
            return
        if before.content == after.content:
            return
        embed = log_embed(
            "Message Edited",
            f"**Author:** {before.author.mention}\n"
            f"**Channel:** {before.channel.mention}\n"
            f"**Before:** {before.content[:512]}\n"
            f"**After:** {after.content[:512]}",
        )
        await self._send_log(before.guild, embed)

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member) -> None:
        embed = log_embed(
            "Member Joined",
            f"{member.mention} ({member}) joined the server.\n"
            f"Account created: {discord.utils.format_dt(member.created_at, 'R')}",
        )
        await self._send_log(member.guild, embed)

    @commands.Cog.listener()
    async def on_member_remove(self, member: discord.Member) -> None:
        embed = log_embed(
            "Member Left",
            f"{member.mention} ({member}) left the server.",
        )
        await self._send_log(member.guild, embed)

    @commands.Cog.listener()
    async def on_member_ban(
        self, guild: discord.Guild, user: discord.User
    ) -> None:
        embed = log_embed("Member Banned", f"{user.mention} ({user}) was banned.")
        await self._send_log(guild, embed)

    @commands.Cog.listener()
    async def on_member_unban(
        self, guild: discord.Guild, user: discord.User
    ) -> None:
        embed = log_embed("Member Unbanned", f"{user.mention} ({user}) was unbanned.")
        await self._send_log(guild, embed)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Logging(bot))
