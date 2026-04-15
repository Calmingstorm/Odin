"""Message trigger cog — fires scheduler triggers on Discord messages.

When a user sends a message matching configured criteria in a monitored channel,
this cog fires the event through the scheduler's trigger system, enabling
message-based workflow execution.

Examples:
    "!deploy prod" → deploy pipeline (starts_with match)
    "status report" → generate report (content_contains match)
    Messages matching a regex → custom automation
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import discord
from discord.ext import commands

if TYPE_CHECKING:
    from src.config.schema import MessageTriggerConfig
    from src.scheduler.scheduler import Scheduler

logger = logging.getLogger("odin.message_triggers")


class MessageTriggers(commands.Cog):
    """Monitors Discord messages and fires matching scheduler triggers."""

    def __init__(
        self,
        bot: commands.Bot,
        *,
        config: MessageTriggerConfig | None = None,
        scheduler: Scheduler | None = None,
    ) -> None:
        self.bot = bot
        self._config = config
        self._scheduler = scheduler

    @property
    def enabled(self) -> bool:
        return bool(self._config and self._config.enabled and self._scheduler)

    def set_scheduler(self, scheduler: Scheduler) -> None:
        self._scheduler = scheduler

    def set_config(self, config: MessageTriggerConfig) -> None:
        self._config = config

    def _is_channel_allowed(self, channel_id: int) -> bool:
        """Check if message triggers are allowed in this channel."""
        if not self._config:
            return False
        # Empty list means all channels allowed
        if not self._config.channel_ids:
            return True
        return str(channel_id) in self._config.channel_ids

    def _is_user_allowed(self, user_id: int) -> bool:
        """Check if this user is allowed to fire message triggers."""
        if not self._config:
            return False
        # Empty list means all users allowed
        if not self._config.allowed_user_ids:
            return True
        return str(user_id) in self._config.allowed_user_ids

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        """Handle an incoming Discord message."""
        if not self.enabled:
            return

        # Never trigger on bot messages (including self)
        if message.author.bot:
            return

        # Check channel allowlist
        if not self._is_channel_allowed(message.channel.id):
            return

        # Check user allowlist
        if not self._is_user_allowed(message.author.id):
            return

        # Build event data for the scheduler trigger system
        event_data: dict = {
            "event": "message_create",
            "content": message.content,
            "author_id": str(message.author.id),
            "channel_id": str(message.channel.id),
            "message_id": str(message.id),
            "guild_id": str(message.guild.id) if message.guild else "",
        }

        logger.debug(
            "Message trigger candidate: user %s in channel %s",
            message.author.id,
            message.channel.id,
        )

        try:
            fired = await self._scheduler.fire_triggers("discord_message", event_data)
            if fired:
                logger.info(
                    "Message from %s fired %d trigger(s) in channel %s",
                    message.author.id,
                    fired,
                    message.channel.id,
                )
        except Exception as e:
            logger.error("Message trigger dispatch failed: %s", e)


async def setup(bot: commands.Bot) -> None:
    """Standard discord.py cog setup (no-op scheduler/config — wired later)."""
    await bot.add_cog(MessageTriggers(bot))
