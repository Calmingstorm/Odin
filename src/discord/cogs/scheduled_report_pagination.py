"""Discord reaction listener for scheduled-report pagination controls."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

from discord.ext import commands

import discord

if TYPE_CHECKING:
    from src.discord.scheduled_report import ScheduledReportPaginationService


class ScheduledReportPagination(commands.Cog):
    """Route reactions on managed scheduled reports to their pagination service."""

    def __init__(
        self,
        bot: commands.Bot,
        pagination: ScheduledReportPaginationService,
    ) -> None:
        self._bot = bot
        self._pagination = pagination

    @commands.Cog.listener()
    async def on_raw_reaction_add(self, payload: discord.RawReactionActionEvent) -> None:
        """Redraw a managed report when a user adds a pagination reaction."""
        if self._bot.user is not None and payload.user_id == self._bot.user.id:
            return
        if self._pagination.handles(payload.message_id, payload.emoji):
            await self._pagination.handle_reaction(payload)


async def setup(bot: commands.Bot) -> None:
    """Register scheduled-report pagination against the composed service."""
    components = cast(Any, bot).components
    await bot.add_cog(ScheduledReportPagination(bot, components.scheduled_reports))
