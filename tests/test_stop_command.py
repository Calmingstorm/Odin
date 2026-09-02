"""Truthful /stop acknowledgement pins."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from src.discord.channel_state import ChannelStateRegistry
from src.discord.slash_commands import register_commands


class _Tree:
    def __init__(self):
        self.commands = {}

    def command(self, *, name, description):
        del description
        def decorate(fn):
            self.commands[name] = fn
            return fn
        return decorate


class _Interaction:
    def __init__(self, channel_id=42):
        self.channel_id = channel_id
        self.user = object()
        self.response = SimpleNamespace(send_message=AsyncMock(), defer=AsyncMock())
        self.followup = SimpleNamespace(send=AsyncMock())


def _bot():
    bot = SimpleNamespace(
        tree=_Tree(),
        intake=SimpleNamespace(is_allowed_user=lambda _user: True),
        channel_state=ChannelStateRegistry(),
    )
    register_commands(bot)
    return bot


async def test_stop_reports_settled_result():
    bot = _bot()
    bot.channel_state.set_active_request("42", "req")
    interaction = _Interaction()

    task = asyncio.create_task(bot.tree.commands["stop"](interaction))
    await asyncio.sleep(0)
    assert bot.channel_state.cancel_events["42"].is_set()
    assert not task.done()

    bot.channel_state.finish_stop("42", "req", "Task stopped by user.")
    bot.channel_state.clear_active_request("42", "req")
    await asyncio.wait_for(task, timeout=1)
    interaction.response.defer.assert_awaited_once_with(ephemeral=True)
    interaction.followup.send.assert_awaited_once_with(
        "Task stopped by user.", ephemeral=True
    )


async def test_stop_reports_no_active_task():
    bot = _bot()
    interaction = _Interaction()
    await bot.tree.commands["stop"](interaction)
    interaction.response.send_message.assert_awaited_once_with(
        "No active task in this channel.", ephemeral=True
    )


async def test_clear_active_ignores_stale_request_owner():
    state = ChannelStateRegistry()
    state.set_active_request("42", "old")
    old_request, old_waiter = state.request_stop("42")
    assert old_request == "old"

    state.set_active_request("42", "new")
    assert old_waiter.result() == "The previous task ended before the stop request settled."
    assert "42" not in state.stop_results

    state.clear_active_request("42", "old")
    assert state.active_requests["42"] == "new"

    state.clear_active_request("42", "new")
    assert "42" not in state.active_requests
    assert "42" not in state.stop_results


async def test_request_stop_does_not_set_stale_event_without_owner():
    state = ChannelStateRegistry()
    assert state.request_stop("42") is None
    assert "42" not in state.cancel_events

    state.set_active_request("42", "req")
    assert "42" not in state.stop_results
    request_id, waiter = state.request_stop("42")
    assert request_id == "req"
    assert waiter is state.stop_results["42"]
    assert state.cancel_events["42"].is_set()


async def test_finish_stop_ignores_stale_owner_and_completed_waiter():
    state = ChannelStateRegistry()
    state.set_active_request("42", "req")
    request_id, waiter = state.request_stop("42")
    assert request_id == "req"

    state.finish_stop("42", "other", "wrong")
    assert not waiter.done()
    state.finish_stop("42", "req", "done")
    state.finish_stop("42", "req", "later")
    assert waiter.result() == "done"


async def test_cleanup_releases_stale_active_and_orphan_waiters():
    state = ChannelStateRegistry()
    state.set_active_request("active", "req")
    request_id, active_waiter = state.request_stop("active")
    assert request_id == "req"
    state.cancel_events["active"].clear()
    state.stop_results["orphan"] = asyncio.get_running_loop().create_future()
    orphan_waiter = state.stop_results["orphan"]

    state.cleanup(active_channels=set())

    assert "active" not in state.active_requests
    assert active_waiter.done()
    assert orphan_waiter.done()
    assert "orphan" not in state.stop_results
