"""Focused contracts for best-effort terminal steering receipts."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.discord import steer_notifications
from src.discord.channel_state import ChannelStateRegistry, ChatTurnInbox
from src.discord.slash_commands import register_commands
from src.discord.tool_loop import CHAT_POLICY, _ChatTurn


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
    def __init__(self):
        self.channel_id = 42
        self.user = SimpleNamespace(id=7, bot=False)
        self.response = SimpleNamespace(send_message=AsyncMock())
        self.edit_original_response = AsyncMock()
        self.is_expired = Mock(return_value=False)


def _bot():
    bot = SimpleNamespace(
        tree=_Tree(), intake=SimpleNamespace(is_allowed_user=lambda _user: True),
        permissions=SimpleNamespace(is_admin=lambda _user_id: False),
        channel_state=ChannelStateRegistry(),
    )
    register_commands(bot)
    bot.channel_state.set_active_request("42", "request")
    inbox = ChatTurnInbox(requester_id="7")
    bot.channel_state.bind_steer_inbox("42", "request", inbox)
    return bot, inbox


def _turn(inbox):
    return _ChatTurn(
        message=SimpleNamespace(), policy=CHAT_POLICY, trace=None,
        system_prompt="system", tools=None,
        messages=[{"role": "user", "content": "original"}], user_id="7",
        chat_cap=4, stuck_tracker=SimpleNamespace(), _trajectory=SimpleNamespace(),
        _result_store_cap=100, _cancel=asyncio.Event(), _ch_id="42",
        _req_id="request", _steer_inbox=inbox,
    )


async def _settle():
    for _ in range(5):
        await asyncio.sleep(0)


@pytest.fixture(autouse=True)
async def _drain_observers():
    yield
    await steer_notifications.finish_steer_notifications()
    await _settle()
    assert not steer_notifications._pending_observers


def test_empty_drain_and_close_create_no_task_or_timestamp(monkeypatch):
    registry, inbox = ChannelStateRegistry(), ChatTurnInbox(requester_id="7")
    registry.set_active_request("42", "request")
    registry.bind_steer_inbox("42", "request", inbox)
    create_task = Mock(side_effect=AssertionError("empty path created task"))
    timestamp = Mock(side_effect=AssertionError("empty path created timestamp"))
    notify = Mock(wraps=steer_notifications.notify_steer)
    monkeypatch.setattr(steer_notifications.asyncio, "create_task", create_task)
    monkeypatch.setattr("src.discord.channel_state.time.time", timestamp)
    monkeypatch.setattr("src.discord.channel_state.notify_steer", notify)
    monkeypatch.setattr("src.discord.tool_loop.notify_steer", notify)
    assert _turn(inbox).drain_inbox() is False
    registry.close_steer_inbox("42", "request")
    registry.close_steer_inbox("42", "request")
    assert inbox.inbox_events == []
    create_task.assert_not_called()
    timestamp.assert_not_called()
    notify.assert_not_called()


async def test_consumed_notification_is_detached_ordered_and_exactly_once():
    registry, inbox = ChannelStateRegistry(), ChatTurnInbox(requester_id="7")
    registry.set_active_request("42", "request")
    registry.bind_steer_inbox("42", "request", inbox)
    calls = []
    async def notifier(sequence, outcome):
        calls.append((sequence, outcome, [e["event"] for e in inbox.inbox_events]))
    registry.request_steer("42", "direction", user_id="7", notifier=notifier)
    assert _turn(inbox).drain_inbox() is True
    assert calls == []
    await _settle()
    assert calls == [(1, "consumed", ["queued", "consumed"])]
    registry.close_steer_inbox("42", "request")
    await _settle()
    assert len(calls) == 1


async def test_close_discards_all_pending_notifies_and_is_idempotent():
    registry, inbox = ChannelStateRegistry(), ChatTurnInbox(requester_id="7")
    registry.set_active_request("42", "request")
    registry.bind_steer_inbox("42", "request", inbox)
    calls = []
    async def notifier(sequence, outcome): calls.append((sequence, outcome))
    for text in ("one", "two"):
        registry.request_steer("42", text, user_id="7", notifier=notifier)
    registry.close_steer_inbox("42", "request")
    registry.close_steer_inbox("42", "request")
    assert not inbox.accepting and inbox.inbox.empty() and not inbox.event.is_set()
    assert [e["event"] for e in inbox.inbox_events] == ["queued", "queued", "closed", "closed"]
    await _settle()
    assert sorted(calls) == [(1, "closed"), (2, "closed")]


async def test_same_owner_rebind_closes_displaced_pending_but_same_object_is_noop():
    registry = ChannelStateRegistry()
    registry.set_active_request("42", "request")
    old = ChatTurnInbox(requester_id="7")
    registry.bind_steer_inbox("42", "request", old)
    calls = []
    async def notifier(sequence, outcome): calls.append((sequence, outcome))
    registry.request_steer("42", "old pending", user_id="7", notifier=notifier)

    registry.bind_steer_inbox("42", "request", old)
    assert old.accepting and old.inbox.qsize() == 1
    assert calls == []

    replacement = ChatTurnInbox(requester_id="7")
    registry.bind_steer_inbox("42", "request", replacement)
    assert not old.accepting and old.inbox.empty()
    assert replacement.accepting
    await _settle()
    assert calls == [(1, "closed")]


async def test_broken_and_slow_callbacks_are_bounded(monkeypatch):
    monkeypatch.setattr(steer_notifications, "NOTIFY_TIMEOUT_SECONDS", 0.01)
    broken_called, slow_cancelled = asyncio.Event(), asyncio.Event()
    async def broken(_sequence, _outcome):
        broken_called.set()
        raise RuntimeError("transport failed")
    async def slow(_sequence, _outcome):
        try:
            await asyncio.Event().wait()
        finally:
            slow_cancelled.set()
    steer_notifications.notify_steer({"sequence": 1, "notifier": broken}, "consumed")
    steer_notifications.notify_steer({"sequence": 2, "notifier": slow}, "closed")
    assert not broken_called.is_set()
    await asyncio.wait_for(broken_called.wait(), 1)
    await asyncio.wait_for(slow_cancelled.wait(), 1)


async def test_eager_task_factory_still_cannot_invoke_notifier_inline():
    if not hasattr(asyncio, "eager_task_factory"):
        pytest.skip("eager task factories require Python 3.12")
    called = False
    async def notifier(_sequence, _outcome):
        nonlocal called
        called = True
    loop = asyncio.get_running_loop()
    previous = loop.get_task_factory()
    try:
        loop.set_task_factory(asyncio.eager_task_factory)
        steer_notifications.notify_steer({"sequence": 1, "notifier": notifier}, "consumed")
        assert called is False
        await _settle()
        assert called is True
    finally:
        loop.set_task_factory(previous)


def test_task_admission_failure_is_swallowed(monkeypatch):
    called = False
    async def notifier(_sequence, _outcome):
        nonlocal called
        called = True
    monkeypatch.setattr(steer_notifications.asyncio, "create_task", Mock(
        side_effect=RuntimeError("loop refuses task")))
    steer_notifications.notify_steer({"sequence": 3, "notifier": notifier}, "closed")
    assert called is False and not steer_notifications._pending_observers


async def test_shutdown_empty_noop_and_pending_task_is_cancelled(monkeypatch):
    await steer_notifications.finish_steer_notifications()
    monkeypatch.setattr(steer_notifications, "SHUTDOWN_TIMEOUT_SECONDS", 0.01)
    started, cancelled = asyncio.Event(), asyncio.Event()
    async def notifier(_sequence, _outcome):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()
    steer_notifications.notify_steer({"sequence": 1, "notifier": notifier}, "closed")
    await asyncio.wait_for(started.wait(), 1)
    await asyncio.wait_for(steer_notifications.finish_steer_notifications(), 1)
    await asyncio.wait_for(cancelled.wait(), 1)
    assert not steer_notifications._pending_observers


async def test_cancelling_shutdown_wait_still_cancels_and_joins_observers(monkeypatch):
    monkeypatch.setattr(steer_notifications, "SHUTDOWN_TIMEOUT_SECONDS", 10)
    started, cancelled = asyncio.Event(), asyncio.Event()
    async def notifier(_sequence, _outcome):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()
    steer_notifications.notify_steer({"sequence": 1, "notifier": notifier}, "closed")
    await asyncio.wait_for(started.wait(), 1)
    shutdown = asyncio.create_task(steer_notifications.finish_steer_notifications())
    await asyncio.sleep(0)
    shutdown.cancel()
    with pytest.raises(asyncio.CancelledError):
        await shutdown
    await asyncio.wait_for(cancelled.wait(), 1)
    assert not steer_notifications._pending_observers


@pytest.mark.parametrize("terminal", ["consumed", "closed"])
async def test_terminal_before_initial_send_edits_only_after_receipt(terminal):
    bot, inbox = _bot()
    interaction = _Interaction()
    entered, release = asyncio.Event(), asyncio.Event()
    async def send(*_args, **_kwargs):
        entered.set()
        await release.wait()
    interaction.response.send_message.side_effect = send
    command = asyncio.create_task(bot.tree.commands["steer"](interaction, "direction"))
    await asyncio.wait_for(entered.wait(), 1)
    if terminal == "consumed":
        assert _turn(inbox).drain_inbox() is True
        expected = "Message consumed (sequence 1)."
    else:
        bot.channel_state.close_steer_inbox("42", "request")
        expected = "Turn ended without consuming this message (sequence 1)."
    await _settle()
    interaction.edit_original_response.assert_not_awaited()
    release.set()
    await command
    await _settle()
    interaction.edit_original_response.assert_awaited_once_with(content=expected)


async def test_failed_send_expiry_and_edit_failure_are_silent(caplog):
    bot, inbox = _bot()
    interaction = _Interaction()
    interaction.response.send_message.side_effect = RuntimeError("send failed")
    with pytest.raises(RuntimeError, match="send failed"):
        await bot.tree.commands["steer"](interaction, "direction")
    assert _turn(inbox).drain_inbox() is True
    await _settle()
    interaction.edit_original_response.assert_not_awaited()

    for expired in (True, False):
        bot, inbox = _bot()
        interaction = _Interaction()
        interaction.is_expired.return_value = expired
        if not expired:
            interaction.edit_original_response.side_effect = RuntimeError("edit failed")
        await bot.tree.commands["steer"](interaction, "direction")
        assert _turn(inbox).drain_inbox() is True
        await _settle()
        if expired:
            interaction.edit_original_response.assert_not_awaited()
        else:
            interaction.edit_original_response.assert_awaited_once()
    assert not [r for r in caplog.records if r.levelno >= 30]


async def test_old_owner_cleanup_cannot_notify_or_close_new_owner():
    bot, old = _bot()
    first, second = _Interaction(), _Interaction()
    await bot.tree.commands["steer"](first, "old direction")
    bot.channel_state.set_active_request("42", "new")
    new = ChatTurnInbox(requester_id="7")
    bot.channel_state.bind_steer_inbox("42", "new", new)
    await bot.tree.commands["steer"](second, "new direction")
    bot.channel_state.close_steer_inbox("42", "request")
    bot.channel_state.clear_active_request("42", "request")
    await _settle()
    assert old.inbox.empty() and not old.accepting
    first.edit_original_response.assert_awaited_once_with(
        content="Turn ended without consuming this message (sequence 1).")
    second.edit_original_response.assert_not_awaited()
    assert new.inbox.qsize() == 1 and new.accepting
    assert _turn(new).drain_inbox() is True
    await _settle()
    second.edit_original_response.assert_awaited_once_with(content="Message consumed (sequence 1).")


async def test_rejected_command_installs_no_observer(monkeypatch):
    bot, inbox = _bot()
    bot.channel_state.close_steer_inbox("42", "request")
    interaction = _Interaction()
    create_task = Mock(side_effect=AssertionError("rejected steer created task"))
    monkeypatch.setattr(steer_notifications.asyncio, "create_task", create_task)
    await bot.tree.commands["steer"](interaction, "too late")
    create_task.assert_not_called()
    interaction.edit_original_response.assert_not_awaited()
    assert inbox.inbox.empty()


async def test_multiple_interactions_keep_sequence_and_response_ownership():
    bot, inbox = _bot()
    first, second = _Interaction(), _Interaction()
    await bot.tree.commands["steer"](first, "first")
    await bot.tree.commands["steer"](second, "second")
    assert _turn(inbox).drain_inbox() is True
    await _settle()
    first.edit_original_response.assert_awaited_once_with(content="Message consumed (sequence 1).")
    second.edit_original_response.assert_awaited_once_with(content="Message consumed (sequence 2).")


async def test_registry_and_wiring_shutdown_close_wait_and_reject_late_bind():
    from src.discord.wiring import shutdown_services
    registry, calls = ChannelStateRegistry(), []
    for channel in ("1", "2"):
        registry.set_active_request(channel, "request")
        inbox = ChatTurnInbox(requester_id="7")
        registry.bind_steer_inbox(channel, "request", inbox)
        async def notifier(sequence, outcome, *, owner=channel):
            calls.append((owner, sequence, outcome))
        registry.request_steer(channel, "pending", user_id="7", notifier=notifier)
    await registry.shutdown_steering()
    assert sorted(calls) == [("1", 1, "closed"), ("2", 1, "closed")]
    assert registry._steer_inboxes == {}
    registry.set_active_request("3", "request")
    late = ChatTurnInbox(requester_id="7")
    registry.bind_steer_inbox("3", "request", late)
    assert not late.accepting
    state = SimpleNamespace(shutdown_steering=AsyncMock())
    await shutdown_services(SimpleNamespace(channel_state=state))
    state.shutdown_steering.assert_awaited_once_with()
