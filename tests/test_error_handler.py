"""Coverage for src/discord/helpers/error_handler.py (RFC-006 P18, safe).

The command-error dispatcher — each discord.py error type maps to its
user-friendly embed (or is silently ignored / logged). SAFE: real discord error
objects + a fake ctx with an AsyncMock send; no gateway, no network.
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

from discord.ext import commands

from src.discord.helpers.error_handler import handle_command_error


def _ctx() -> Any:
    return SimpleNamespace(send=AsyncMock(), command="mycmd")


async def _run(error) -> Any:
    ctx = _ctx()
    await handle_command_error(ctx, error)
    return ctx


def _sent_text(ctx) -> str:
    ctx.send.assert_awaited_once()
    return ctx.send.await_args.kwargs["embed"].description or ""


class TestHandleCommandError:
    async def test_missing_permissions(self):
        ctx = await _run(commands.MissingPermissions(["manage_guild"]))
        assert "manage_guild" in _sent_text(ctx)

    async def test_bot_missing_permissions(self):
        ctx = await _run(commands.BotMissingPermissions(["send_messages"]))
        assert "send_messages" in _sent_text(ctx)

    async def test_missing_required_argument(self):
        param = SimpleNamespace(name="amount", displayed_name="amount")
        ctx = await _run(commands.MissingRequiredArgument(param))  # type: ignore[arg-type]
        assert "amount" in _sent_text(ctx)

    async def test_bad_argument(self):
        ctx = await _run(commands.BadArgument("bad value here"))
        assert "bad value here" in _sent_text(ctx)

    async def test_cooldown(self):
        cd = commands.Cooldown(1, 5.0)
        ctx = await _run(commands.CommandOnCooldown(cd, 3.2, commands.BucketType.user))
        assert "Cooldown" in _sent_text(ctx)

    async def test_no_private_message(self):
        ctx = await _run(commands.NoPrivateMessage())
        assert "DMs" in _sent_text(ctx)

    async def test_command_not_found_is_silent(self):
        ctx = await _run(commands.CommandNotFound())
        ctx.send.assert_not_called()   # unknown commands ignored

    async def test_check_failure(self):
        ctx = await _run(commands.CheckFailure())
        assert "permission" in _sent_text(ctx)

    async def test_unhandled_error_is_logged_and_generic(self):
        ctx = await _run(RuntimeError("something weird"))  # type: ignore[arg-type]
        assert "unexpected error" in _sent_text(ctx)

    async def test_unwraps_command_invoke_error(self):
        # CommandInvokeError wrapping a known error → unwrapped and handled
        inner = commands.MissingPermissions(["administrator"])
        ctx = await _run(commands.CommandInvokeError(inner))
        assert "administrator" in _sent_text(ctx)
