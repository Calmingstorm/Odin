import asyncio
from types import SimpleNamespace
import pytest
from src.discord.wiring import close_computer_once

@pytest.mark.asyncio
async def test_computer_cleanup_is_once_for_independent_lifecycle_callers():
    closed = 0
    class Computer:
        async def close(self):
            nonlocal closed
            closed += 1
    bot = SimpleNamespace(computer=Computer())
    await asyncio.gather(close_computer_once(bot), close_computer_once(bot))
    await close_computer_once(bot)
    assert closed == 1
