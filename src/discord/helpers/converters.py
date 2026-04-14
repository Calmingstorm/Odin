"""Custom argument converters for Odin commands."""

from __future__ import annotations

import re
from datetime import timedelta

from discord.ext import commands

# Matches strings like "1d2h30m10s", "2h", "30m", etc.
_DURATION_RE = re.compile(
    r"(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$", re.IGNORECASE
)


class DurationConverter(commands.Converter):
    """Convert a human-readable duration string to a ``timedelta``.

    Accepted formats: ``1d2h30m``, ``2h``, ``30m10s``, ``60`` (seconds).
    """

    async def convert(self, ctx: commands.Context, argument: str) -> timedelta:
        # Plain integer → seconds
        if argument.isdigit():
            return timedelta(seconds=int(argument))

        match = _DURATION_RE.match(argument.strip())
        if not match or not any(match.groups()):
            raise commands.BadArgument(
                f"Invalid duration: `{argument}`. Use format like `1d2h30m10s`."
            )

        days = int(match.group(1) or 0)
        hours = int(match.group(2) or 0)
        minutes = int(match.group(3) or 0)
        seconds = int(match.group(4) or 0)
        return timedelta(days=days, hours=hours, minutes=minutes, seconds=seconds)


class ReasonConverter(commands.Converter):
    """Ensure a reason string is within Discord's 512-char audit log limit."""

    MAX_LENGTH = 512

    async def convert(self, ctx: commands.Context, argument: str) -> str:
        if len(argument) > self.MAX_LENGTH:
            raise commands.BadArgument(
                f"Reason must be {self.MAX_LENGTH} characters or fewer."
            )
        return argument
