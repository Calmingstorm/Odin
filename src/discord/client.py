"""OdinBot — main Discord bot client.

This module defines the core bot class and the ``run_bot`` entry point.
All command logic lives in cogs under ``src.discord.cogs``; helper utilities
live under ``src.discord.helpers``.
"""

from __future__ import annotations

import logging
import sys
from typing import TYPE_CHECKING

import discord
from discord.ext import commands

from src.config import OdinConfig
from src.constants import BOT_NAME, COLOR_PRIMARY

if TYPE_CHECKING:
    from collections.abc import Sequence

logger = logging.getLogger("odin.discord")

# Cog extensions to load on startup (dotted module paths)
INITIAL_EXTENSIONS: Sequence[str] = (
    "src.discord.cogs.moderation",
    "src.discord.cogs.administration",
    "src.discord.cogs.utility",
    "src.discord.cogs.automod",
    "src.discord.cogs.logging_cog",
    "src.discord.cogs.reminders",
    "src.discord.cogs.fun",
    "src.discord.cogs.reaction_triggers",
    "src.discord.cogs.message_triggers",
)


class OdinBot(commands.Bot):
    """Core Odin bot client.

    Responsibilities are intentionally narrow:
    * configure intents and prefix
    * load cog extensions
    * handle lifecycle events (ready, shutdown)
    * expose shared state (config, db pool) to cogs
    """

    config: OdinConfig

    def __init__(self, config: OdinConfig) -> None:
        self.config = config

        intents = discord.Intents.default()
        intents.message_content = True
        intents.members = True

        super().__init__(
            command_prefix=self._resolve_prefix,
            intents=intents,
            help_command=commands.DefaultHelpCommand(no_category="General"),
            activity=discord.Activity(
                type=discord.ActivityType.watching,
                name=f"{config.prefix}help | {BOT_NAME}",
            ),
        )

    # ------------------------------------------------------------------
    # Prefix resolution
    # ------------------------------------------------------------------

    async def _resolve_prefix(
        self, bot: commands.Bot, message: discord.Message
    ) -> list[str]:
        """Return applicable prefixes for *message*.

        Currently returns the global prefix; guild-specific overrides can be
        added here via the database layer.
        """
        base = [self.config.prefix]
        # Always allow mention as prefix
        return commands.when_mentioned_or(*base)(bot, message)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def setup_hook(self) -> None:
        """Called once before the bot connects to the gateway."""
        for ext in INITIAL_EXTENSIONS:
            try:
                await self.load_extension(ext)
                logger.info("Loaded extension %s", ext)
            except commands.ExtensionError:
                logger.exception("Failed to load extension %s", ext)

    async def on_ready(self) -> None:
        """Fired when the bot has connected and the cache is ready."""
        assert self.user is not None
        logger.info(
            "%s is online — %s guilds, %s users",
            self.user,
            len(self.guilds),
            sum(g.member_count or 0 for g in self.guilds),
        )

    async def on_guild_join(self, guild: discord.Guild) -> None:
        """Handle joining a new guild."""
        logger.info("Joined guild %s (id=%s, members=%s)", guild.name, guild.id, guild.member_count)

    async def on_guild_remove(self, guild: discord.Guild) -> None:
        """Handle being removed from a guild."""
        logger.info("Removed from guild %s (id=%s)", guild.name, guild.id)

    async def close(self) -> None:
        """Graceful shutdown: close sessions then disconnect."""
        logger.info("Shutting down %s…", BOT_NAME)
        await super().close()


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------


def run_bot() -> None:
    """Load config, create the bot, and run it."""
    config = OdinConfig.from_env()
    errors = config.validate()
    if errors:
        for err in errors:
            print(f"Config error: {err}", file=sys.stderr)
        if not config.token:
            sys.exit(1)

    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    bot = OdinBot(config)
    bot.run(config.token, log_handler=None)
