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
        """Graceful shutdown: stop services, persist state, then disconnect.

        Components are dynamically attached at runtime so we use ``getattr``
        to probe for them safely.  The shutdown order matters:

        1. Autonomous loops (stop generating new work)
        2. Scheduler (stop firing new tasks)
        3. Infrastructure watcher (stop monitoring checks)
        4. Health server (stop accepting HTTP/WS connections)
        5. Process registry (terminate managed subprocesses)
        6. Knowledge store (close SQLite connection)
        7. Session manager (persist dirty sessions to disk)
        8. Discord gateway (super().close())
        """
        logger.info("Shutting down %s …", BOT_NAME)

        # 1. Stop autonomous loops
        loop_manager = getattr(self, "loop_manager", None)
        if loop_manager is not None:
            try:
                loop_manager.stop_loop("all")
                logger.info("Autonomous loops stopped")
            except Exception:
                logger.exception("Error stopping autonomous loops")

        # 2. Stop scheduler
        scheduler = getattr(self, "scheduler", None)
        if scheduler is not None:
            try:
                await scheduler.stop()
                logger.info("Scheduler stopped")
            except Exception:
                logger.exception("Error stopping scheduler")

        # 3. Stop infra watcher
        watcher = getattr(self, "watcher", None)
        if watcher is not None:
            try:
                await watcher.stop()
                logger.info("Infrastructure watcher stopped")
            except Exception:
                logger.exception("Error stopping watcher")

        # 4. Stop health/web server
        health_server = getattr(self, "health_server", None)
        if health_server is not None:
            try:
                await health_server.stop()
                logger.info("Health server stopped")
            except Exception:
                logger.exception("Error stopping health server")

        # 5. Terminate managed processes
        process_registry = getattr(self, "process_registry", None)
        if process_registry is not None:
            try:
                await process_registry.shutdown()
                logger.info("Process registry shut down")
            except Exception:
                logger.exception("Error shutting down process registry")

        # 6. Close knowledge store (SQLite connection)
        knowledge = getattr(self, "knowledge", None)
        if knowledge is not None:
            try:
                knowledge.close()
                logger.info("Knowledge store closed")
            except Exception:
                logger.exception("Error closing knowledge store")

        # 7. Persist session state
        sessions = getattr(self, "sessions", None)
        if sessions is not None:
            try:
                sessions.save_all()
                logger.info("Sessions persisted to disk")
            except Exception:
                logger.exception("Error saving sessions")

        await super().close()
        logger.info("%s shutdown complete", BOT_NAME)


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
