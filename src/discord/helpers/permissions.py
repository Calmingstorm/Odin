"""Permission checks and decorators for Odin commands."""

from __future__ import annotations

from typing import TYPE_CHECKING

from discord.ext import commands

from src.constants import ADMIN_PERMISSIONS, MOD_PERMISSIONS

if TYPE_CHECKING:
    pass


def _has_any_permission(
    ctx: commands.Context, permission_names: list[str]
) -> bool:
    """Check whether *ctx.author* has any of the listed guild permissions."""
    if ctx.guild is None:
        return False
    perms = ctx.author.guild_permissions  # type: ignore[union-attr]
    return any(getattr(perms, p, False) for p in permission_names)


def is_moderator():
    """Command check: author must have at least one moderator permission."""

    async def predicate(ctx: commands.Context) -> bool:
        if _has_any_permission(ctx, MOD_PERMISSIONS + ADMIN_PERMISSIONS):
            return True
        raise commands.MissingPermissions(MOD_PERMISSIONS)

    return commands.check(predicate)


def is_admin():
    """Command check: author must have at least one admin permission."""

    async def predicate(ctx: commands.Context) -> bool:
        if _has_any_permission(ctx, ADMIN_PERMISSIONS):
            return True
        raise commands.MissingPermissions(ADMIN_PERMISSIONS)

    return commands.check(predicate)


def bot_has_guild_permissions(**perms: bool):
    """Command check: the **bot** must have the specified guild permissions."""

    async def predicate(ctx: commands.Context) -> bool:
        if ctx.guild is None:
            raise commands.NoPrivateMessage()
        bot_perms = ctx.guild.me.guild_permissions
        missing = [p for p, required in perms.items() if required and not getattr(bot_perms, p, False)]
        if missing:
            raise commands.BotMissingPermissions(missing)
        return True

    return commands.check(predicate)
