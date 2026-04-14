"""Reminders cog — schedule reminders for users."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import discord
from discord.ext import commands, tasks

from src.discord.helpers.converters import DurationConverter
from src.discord.helpers.embeds import odin_embed, success_embed

logger = logging.getLogger("odin.cogs.reminders")


@dataclass
class Reminder:
    user_id: int
    channel_id: int
    message: str
    fire_at: datetime
    id: int = 0


class Reminders(commands.Cog):
    """Set and manage personal reminders."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self._reminders: list[Reminder] = []
        self._next_id = 1
        self._check_reminders.start()

    def cog_unload(self) -> None:
        self._check_reminders.cancel()

    @tasks.loop(seconds=15)
    async def _check_reminders(self) -> None:
        now = datetime.now(timezone.utc)
        due = [r for r in self._reminders if r.fire_at <= now]
        for reminder in due:
            self._reminders.remove(reminder)
            channel = self.bot.get_channel(reminder.channel_id)
            if isinstance(channel, discord.TextChannel):
                try:
                    await channel.send(
                        f"<@{reminder.user_id}>",
                        embed=odin_embed(
                            title="Reminder",
                            description=reminder.message,
                        ),
                    )
                except discord.Forbidden:
                    pass

    @_check_reminders.before_loop
    async def _before_check(self) -> None:
        await self.bot.wait_until_ready()

    @commands.command(name="remind")
    async def remind(
        self,
        ctx: commands.Context,
        duration: str,
        *,
        message: str,
    ) -> None:
        """Set a reminder. Usage: !remind 1h30m Take out the trash."""
        converter = DurationConverter()
        td = await converter.convert(ctx, duration)
        fire_at = datetime.now(timezone.utc) + td
        reminder = Reminder(
            user_id=ctx.author.id,
            channel_id=ctx.channel.id,
            message=message,
            fire_at=fire_at,
            id=self._next_id,
        )
        self._next_id += 1
        self._reminders.append(reminder)
        await ctx.send(
            embed=success_embed(
                f"Reminder set for {discord.utils.format_dt(fire_at, 'R')}."
            )
        )

    @commands.command(name="reminders")
    async def list_reminders(self, ctx: commands.Context) -> None:
        """List your active reminders."""
        user_reminders = [r for r in self._reminders if r.user_id == ctx.author.id]
        if not user_reminders:
            await ctx.send(embed=odin_embed(description="You have no active reminders."))
            return
        lines = [
            f"**#{r.id}** — {discord.utils.format_dt(r.fire_at, 'R')}: {r.message[:80]}"
            for r in user_reminders
        ]
        await ctx.send(embed=odin_embed(title="Your Reminders", description="\n".join(lines)))


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Reminders(bot))
