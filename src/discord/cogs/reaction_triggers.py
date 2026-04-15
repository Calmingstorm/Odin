"""Reaction trigger cog — fires scheduler triggers on Discord emoji reactions.

When a user reacts with a configured emoji in a monitored channel, this cog
fires the reaction through the scheduler's trigger system, enabling
emoji-based workflow execution.

Examples:
    React with 🚀 → deploy pipeline
    React with ✅ → approve a task
    React with 🔄 → re-run CI
    React with 📊 → generate a report
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import discord
from discord.ext import commands

if TYPE_CHECKING:
    from src.config.schema import ReactionTriggerConfig
    from src.scheduler.scheduler import Scheduler

logger = logging.getLogger("odin.reaction_triggers")


class ReactionTriggers(commands.Cog):
    """Monitors Discord reactions and fires matching scheduler triggers."""

    def __init__(
        self,
        bot: commands.Bot,
        *,
        config: ReactionTriggerConfig | None = None,
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

    def set_config(self, config: ReactionTriggerConfig) -> None:
        self._config = config

    def _emoji_name(self, emoji: discord.PartialEmoji) -> str:
        """Normalize emoji to a string key.

        Unicode emoji → the character itself (e.g. "🚀")
        Custom emoji   → the name without colons (e.g. "deploy")
        """
        if emoji.is_unicode_emoji():
            return str(emoji)
        return emoji.name or ""

    def _is_channel_allowed(self, channel_id: int) -> bool:
        """Check if reaction triggers are allowed in this channel."""
        if not self._config:
            return False
        # Empty list means all channels allowed
        if not self._config.channel_ids:
            return True
        return str(channel_id) in self._config.channel_ids

    def _is_user_allowed(self, user_id: int) -> bool:
        """Check if this user is allowed to fire reaction triggers."""
        if not self._config:
            return False
        # Empty list means all users allowed
        if not self._config.allowed_user_ids:
            return True
        return str(user_id) in self._config.allowed_user_ids

    @commands.Cog.listener()
    async def on_raw_reaction_add(self, payload: discord.RawReactionActionEvent) -> None:
        """Handle a reaction being added to a message."""
        if not self.enabled:
            return

        # Ignore bot's own reactions
        if payload.user_id == self.bot.user.id:
            return

        # Check channel allowlist
        if not self._is_channel_allowed(payload.channel_id):
            return

        # Check user allowlist
        if not self._is_user_allowed(payload.user_id):
            return

        emoji_str = self._emoji_name(payload.emoji)
        if not emoji_str:
            return

        # Build event data for the scheduler trigger system
        event_data: dict = {
            "event": "reaction_add",
            "emoji": emoji_str,
            "user_id": str(payload.user_id),
            "channel_id": str(payload.channel_id),
            "message_id": str(payload.message_id),
            "guild_id": str(payload.guild_id) if payload.guild_id else "",
        }

        logger.info(
            "Reaction trigger: %s reacted %s in channel %s (msg %s)",
            payload.user_id,
            emoji_str,
            payload.channel_id,
            payload.message_id,
        )

        try:
            fired = await self._scheduler.fire_triggers("discord_reaction", event_data)
            if fired:
                logger.info(
                    "Reaction %s fired %d trigger(s)",
                    emoji_str,
                    fired,
                )
        except Exception as e:
            logger.error("Reaction trigger dispatch failed: %s", e)


async def setup(bot: commands.Bot) -> None:
    """Standard discord.py cog setup (no-op scheduler/config — wired later)."""
    await bot.add_cog(ReactionTriggers(bot))
