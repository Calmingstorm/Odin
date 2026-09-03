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


async def test_expire_stop_waiter_removes_request_owned_alias():
    state = ChannelStateRegistry()
    state.set_active_request("42", "req")
    request_id, waiter = state.request_stop("42")

    state.expire_stop_waiter("42", request_id, waiter)

    assert ("42", "req") not in state._stop_waiters
    assert "42" not in state.stop_results
    assert not waiter.done()
    waiter.cancel()


async def test_stop_reports_no_active_task():
    bot = _bot()
    interaction = _Interaction()
    await bot.tree.commands["stop"](interaction)
    interaction.response.send_message.assert_awaited_once_with(
        "No active task in this channel.", ephemeral=True
    )


async def test_clear_active_ignores_stale_request_owner():
    state = ChannelStateRegistry()
    old_event = state.set_active_request("42", "old")
    old_request, old_waiter = state.request_stop("42")
    assert old_request == "old"
    assert old_event.is_set()

    new_event = state.set_active_request("42", "new")
    assert not old_waiter.done()
    assert "42" not in state.stop_results
    assert new_event is state.cancel_events["42"]
    assert new_event is not old_event
    assert not new_event.is_set()
    assert old_event.is_set()

    state.finish_stop("42", "old", "old durably cancelled")
    assert old_waiter.result() == "old durably cancelled"
    state.clear_active_request("42", "old")
    assert state.active_requests["42"] == "new"

    state.clear_active_request("42", "new")
    assert "42" not in state.active_requests
    assert "42" not in state.stop_results


async def test_replacing_owner_does_not_revoke_old_stop_or_misdirect_new_stop():
    state = ChannelStateRegistry()
    old_event = state.set_active_request("42", "old")
    old_request, old_waiter = state.request_stop("42")
    assert old_request == "old"

    new_event = state.set_active_request("42", "new")
    new_request, new_waiter = state.request_stop("42")
    assert new_request == "new"
    assert old_event.is_set()
    assert new_event.is_set()
    assert old_waiter is not new_waiter

    state.finish_stop("42", "old", "old settled")
    assert old_waiter.result() == "old settled"
    assert not new_waiter.done()
    state.finish_stop("42", "new", "new settled")
    assert new_waiter.result() == "new settled"


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


async def test_request_stop_never_borrows_another_requests_event():
    """An event bound to a different request must not be reused for this one."""
    reg = ChannelStateRegistry()
    stale = asyncio.Event()
    stale.set()
    reg.cancel_events["c1"] = stale          # bound to nobody / an older owner
    reg.active_requests["c1"] = "req-new"    # owner registered without an event

    target = reg.request_stop("c1")

    assert target is not None
    request_id, _waiter = target
    assert request_id == "req-new"
    fresh = reg.cancel_events["c1"]
    assert fresh is not stale, "must not reuse an event bound to another request"
    assert fresh.is_set(), "the new owner's own event is the one that gets set"


async def test_cleanup_resolves_request_owned_waiter_orphaned_by_a_successor():
    """A superseded request's own waiter must still be resolved, not leaked.

    ``set_active_request`` hands the channel alias to the new owner but keeps
    the previous request's waiter request-owned, so only the request-keyed
    sweep can retire it once that request never settles.
    """
    reg = ChannelStateRegistry()
    reg.active_requests["c1"] = "req-1"
    target = reg.request_stop("c1")
    assert target is not None
    _request_id, waiter = target

    # A successor takes the channel; req-1's waiter stays request-owned.
    reg.set_active_request("c1", "req-2")
    assert "c1" not in reg.stop_results
    assert ("c1", "req-1") in reg._stop_waiters
    assert not waiter.done()

    reg.active_requests.pop("c1")            # req-2 vanished without settling
    reg.cleanup(active_channels=set())

    assert waiter.done()
    assert waiter.result() == "No active task in this channel."
    assert reg._stop_waiters == {}
