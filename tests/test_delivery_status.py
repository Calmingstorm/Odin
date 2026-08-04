"""Presence-status accounting pins for Discord delivery."""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

import discord
from src.discord.delivery import ResponseDelivery


@pytest.mark.asyncio
async def test_working_presence_starts_immediately_and_clears_on_last_task():
    change_presence = AsyncMock()
    delivery = ResponseDelivery(channel_state=None, change_presence=change_presence)

    await delivery.set_status("Working...", task_start=True)

    assert delivery.active_tasks == 1
    activity = change_presence.await_args.kwargs["activity"]
    assert activity.type is discord.ActivityType.watching
    assert activity.name == "Working..."

    await delivery.set_status(None, task_end=True)

    assert delivery.active_tasks == 0
    assert change_presence.await_count == 2
    assert change_presence.await_args.kwargs["activity"] is None


@pytest.mark.asyncio
async def test_debounce_skips_second_start_but_keeps_pairing_truthful():
    change_presence = AsyncMock()
    delivery = ResponseDelivery(channel_state=None, change_presence=change_presence)

    await delivery.set_status("Working...", task_start=True)
    await delivery.set_status("Working...", task_start=True)

    assert delivery.active_tasks == 2
    assert change_presence.await_count == 1

    await delivery.set_status(None, task_end=True)
    assert delivery.active_tasks == 1
    assert change_presence.await_count == 1

    await delivery.set_status(None, task_end=True)
    assert delivery.active_tasks == 0
    assert change_presence.await_count == 2
    assert change_presence.await_args.kwargs["activity"] is None
