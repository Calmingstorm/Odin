"""Centralized command error handling for Odin."""

from __future__ import annotations

import logging
import traceback

import discord
from discord.ext import commands

from src.discord.helpers.embeds import error_embed

logger = logging.getLogger("odin.errors")


async def handle_command_error(
    ctx: commands.Context, error: commands.CommandError
) -> None:
    """Dispatch command errors to user-friendly responses."""
    # Unwrap CommandInvokeError
    if isinstance(error, commands.CommandInvokeError):
        error = error.original  # type: ignore[assignment]

    if isinstance(error, commands.MissingPermissions):
        missing = ", ".join(error.missing_permissions)
        await ctx.send(embed=error_embed(f"You need: **{missing}**"))

    elif isinstance(error, commands.BotMissingPermissions):
        missing = ", ".join(error.missing_permissions)
        await ctx.send(embed=error_embed(f"I need: **{missing}**"))

    elif isinstance(error, commands.MissingRequiredArgument):
        await ctx.send(
            embed=error_embed(f"Missing argument: **{error.param.name}**")
        )

    elif isinstance(error, commands.BadArgument):
        await ctx.send(embed=error_embed(str(error)))

    elif isinstance(error, commands.CommandOnCooldown):
        await ctx.send(
            embed=error_embed(f"Cooldown: try again in {error.retry_after:.1f}s")
        )

    elif isinstance(error, commands.NoPrivateMessage):
        await ctx.send(embed=error_embed("This command cannot be used in DMs."))

    elif isinstance(error, commands.CommandNotFound):
        pass  # Silently ignore unknown commands

    elif isinstance(error, commands.CheckFailure):
        await ctx.send(embed=error_embed("You do not have permission to use this command."))

    else:
        logger.error(
            "Unhandled error in command %s: %s",
            ctx.command,
            error,
            exc_info=error,
        )
        await ctx.send(embed=error_embed("An unexpected error occurred."))
