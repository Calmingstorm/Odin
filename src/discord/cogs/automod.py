"""Automod cog — spam filter, link filter, word filter."""

from __future__ import annotations

import logging
import re
import time
from collections import defaultdict

import discord
from discord.ext import commands

from src.discord.helpers.embeds import log_embed, warning_embed
from src.discord.helpers.permissions import is_admin

logger = logging.getLogger("odin.cogs.automod")

# Simple URL regex for link filtering
_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)


class AutoMod(commands.Cog):
    """Automatic moderation: spam, links, and word filtering."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        # Per-guild config (in-memory; would be persisted in production)
        self._config: dict[int, dict] = {}
        # Spam tracking: guild -> user -> list of message timestamps
        self._message_timestamps: dict[int, dict[int, list[float]]] = defaultdict(
            lambda: defaultdict(list)
        )

    def _guild_config(self, guild_id: int) -> dict:
        return self._config.setdefault(guild_id, {
            "spam_enabled": False,
            "spam_threshold": 5,        # messages
            "spam_interval": 5.0,       # seconds
            "link_filter_enabled": False,
            "word_filter_enabled": False,
            "filtered_words": [],
        })

    # ------------------------------------------------------------------
    # Listener
    # ------------------------------------------------------------------

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot or message.guild is None:
            return
        # Skip if author has manage_messages (moderators bypass automod)
        if message.author.guild_permissions.manage_messages:  # type: ignore[union-attr]
            return

        config = self._guild_config(message.guild.id)

        if config["spam_enabled"] and await self._check_spam(message, config):
            return
        if config["link_filter_enabled"] and _URL_RE.search(message.content):
            await message.delete()
            await message.channel.send(
                embed=warning_embed(f"{message.author.mention}, links are not allowed here."),
                delete_after=5,
            )
            return
        if config["word_filter_enabled"]:
            lower = message.content.lower()
            for word in config["filtered_words"]:
                if word.lower() in lower:
                    await message.delete()
                    await message.channel.send(
                        embed=warning_embed(f"{message.author.mention}, that word is not allowed."),
                        delete_after=5,
                    )
                    return

    async def _check_spam(self, message: discord.Message, config: dict) -> bool:
        now = time.monotonic()
        interval = config["spam_interval"]
        threshold = config["spam_threshold"]
        timestamps = self._message_timestamps[message.guild.id][message.author.id]  # type: ignore[union-attr]
        timestamps.append(now)
        # Prune old timestamps
        timestamps[:] = [t for t in timestamps if now - t < interval]
        if len(timestamps) >= threshold:
            timestamps.clear()
            try:
                await message.author.timeout(  # type: ignore[union-attr]
                    discord.utils.utcnow() + __import__("datetime").timedelta(minutes=5)
                    - discord.utils.utcnow(),
                    reason="Odin automod: spam detected",
                )
            except discord.Forbidden:
                pass
            await message.channel.send(
                embed=warning_embed(f"{message.author.mention} has been muted for spam."),
                delete_after=10,
            )
            return True
        return False

    # ------------------------------------------------------------------
    # Config commands
    # ------------------------------------------------------------------

    @commands.group(invoke_without_command=True)
    @is_admin()
    async def automod(self, ctx: commands.Context) -> None:
        """Manage automod settings."""
        config = self._guild_config(ctx.guild.id)  # type: ignore[union-attr]
        lines = [
            f"Spam filter: {'on' if config['spam_enabled'] else 'off'}",
            f"Link filter: {'on' if config['link_filter_enabled'] else 'off'}",
            f"Word filter: {'on' if config['word_filter_enabled'] else 'off'} ({len(config['filtered_words'])} words)",
        ]
        from src.discord.helpers.embeds import info_embed
        await ctx.send(embed=info_embed("AutoMod Settings", {"Status": "\n".join(lines)}))

    @automod.command(name="spam")
    @is_admin()
    async def automod_spam(self, ctx: commands.Context, enabled: bool) -> None:
        """Toggle spam filter."""
        self._guild_config(ctx.guild.id)["spam_enabled"] = enabled  # type: ignore[union-attr]
        from src.discord.helpers.embeds import success_embed
        await ctx.send(embed=success_embed(f"Spam filter {'enabled' if enabled else 'disabled'}."))

    @automod.command(name="links")
    @is_admin()
    async def automod_links(self, ctx: commands.Context, enabled: bool) -> None:
        """Toggle link filter."""
        self._guild_config(ctx.guild.id)["link_filter_enabled"] = enabled  # type: ignore[union-attr]
        from src.discord.helpers.embeds import success_embed
        await ctx.send(embed=success_embed(f"Link filter {'enabled' if enabled else 'disabled'}."))

    @automod.command(name="addword")
    @is_admin()
    async def automod_addword(self, ctx: commands.Context, *, word: str) -> None:
        """Add a word to the filter list."""
        config = self._guild_config(ctx.guild.id)  # type: ignore[union-attr]
        config["filtered_words"].append(word)
        config["word_filter_enabled"] = True
        from src.discord.helpers.embeds import success_embed
        await ctx.send(embed=success_embed(f"Added `{word}` to filter ({len(config['filtered_words'])} total)."))


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(AutoMod(bot))
