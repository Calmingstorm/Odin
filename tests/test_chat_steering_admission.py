"""Pins for the process-local main-chat steering mailbox and slash admission.

These deliberately exercise the registry and the slash boundary together: a
queued receipt is evidence of enqueueing only, never model consumption.
"""
from __future__ import annotations

import asyncio
import copy
from types import SimpleNamespace
from unittest.mock import AsyncMock

from src.discord.channel_state import (
    STEER_MESSAGE_MAX_CHARS,
    STEER_MESSAGES_PER_TURN,
    ChannelStateRegistry,
    ChatTurnInbox,
)
from src.discord.slash_commands import register_commands
from src.discord.tool_loop import CHAT_POLICY, _ChatTurn


class _Tree:
    def __init__(self) -> None:
        self.commands = {}

    def command(self, *, name, description):
        del description

        def decorate(fn):
            self.commands[name] = fn
            return fn

        return decorate


class _Interaction:
    def __init__(self, *, user_id: int, bot: bool = False, channel_id: int = 42) -> None:
        self.channel_id = channel_id
        self.user = SimpleNamespace(id=user_id, bot=bot)
        self.response = SimpleNamespace(send_message=AsyncMock())


def _turn(inbox: ChatTurnInbox) -> _ChatTurn:
    """The smallest real chat turn needed to exercise inbox consumption."""
    return _ChatTurn(
        message=SimpleNamespace(),
        policy=CHAT_POLICY,
        trace=None,
        system_prompt="system",
        tools=None,
        messages=[{"role": "user", "content": "original request"}],
        user_id="requester",
        chat_cap=10,
        stuck_tracker=SimpleNamespace(),
        _trajectory=SimpleNamespace(),
        _result_store_cap=100,
        _cancel=asyncio.Event(),
        _ch_id="42",
        _req_id="request",
        _steer_inbox=inbox,
    )


def _bound_registry(*, requester: str = "requester") -> tuple[ChannelStateRegistry, ChatTurnInbox]:
    registry = ChannelStateRegistry()
    registry.set_active_request("42", "request")
    inbox = ChatTurnInbox(requester_id=requester)
    registry.bind_steer_inbox("42", "request", inbox)
    return registry, inbox


def test_fifo_drain_is_exactly_once_and_empty_drain_is_a_true_noop():
    registry, inbox = _bound_registry()
    turn = _turn(inbox)
    assert turn._inbox is inbox.inbox
    assert turn._inbox_event is inbox.event
    assert turn.inbox_events is inbox.inbox_events

    for text in ("first", "second", "third"):
        assert registry.request_steer("42", text, user_id="requester") == (
            f"Message queued (sequence {inbox.inbox_sequence}; not yet consumed)."
        )
    assert inbox.event.is_set()
    assert [event["event"] for event in inbox.inbox_events] == ["queued"] * 3

    assert turn.drain_inbox() is True
    assert [message["sequence"] for message in turn.messages[1:]] == [1, 2, 3]
    assert [message["content"] for message in turn.messages[1:]] == [
        "[Human steering from user requester] first",
        "[Human steering from user requester] second",
        "[Human steering from user requester] third",
    ]
    assert all(message["provenance"] == "human_steer" for message in turn.messages[1:])
    assert inbox.last_consumed_sequence == 3
    assert not inbox.event.is_set()
    assert [event["event"] for event in inbox.inbox_events] == [
        "queued", "queued", "queued", "consumed", "consumed", "consumed",
    ]

    before_messages = list(turn.messages)
    before_events = list(inbox.inbox_events)
    before_sequence = inbox.last_consumed_sequence
    before_state = {
        key: copy.deepcopy(value) for key, value in vars(turn).items()
        if isinstance(value, (str, int, bool, list, dict, type(None)))
    }
    assert turn.drain_inbox() is False
    assert turn.messages == before_messages
    assert inbox.inbox_events == before_events
    assert inbox.last_consumed_sequence == before_sequence
    assert not inbox.event.is_set()
    assert inbox.inbox_sequence == 3
    assert before_state == {
        key: value for key, value in vars(turn).items()
        if isinstance(value, (str, int, bool, list, dict, type(None)))
    }
    # Empty means no-op even if a stale notification flag is still set.
    inbox.event.set()
    assert turn.drain_inbox() is False
    assert inbox.event.is_set()


def test_registry_rejects_nonowner_but_allows_current_admin_without_changing_requester():
    registry, inbox = _bound_registry()

    assert registry.request_steer("42", "no", user_id="stranger") == (
        "Access denied. Only the turn's requester or an admin may steer it."
    )
    assert inbox.inbox.empty()
    assert registry.request_steer("42", "admin direction", user_id="admin", is_admin=True) == (
        "Message queued (sequence 1; not yet consumed)."
    )
    queued = inbox.inbox.get_nowait()
    assert queued == {"sequence": 1, "text": "admin direction", "user_id": "admin"}
    assert inbox.requester_id == "requester"


def test_registry_rejects_blank_oversize_stopping_and_total_turn_limit_without_enqueueing():
    registry, inbox = _bound_registry()

    assert registry.request_steer("42", " \n\t ", user_id="requester") == "Message cannot be empty."
    assert registry.request_steer(
        "42", "x" * (STEER_MESSAGE_MAX_CHARS + 1), user_id="requester"
    ) == (
        f"Steering messages must be at most {STEER_MESSAGE_MAX_CHARS} characters."
    )
    assert inbox.inbox.empty()

    registry.cancel_event("42").set()
    assert registry.request_steer("42", "too late", user_id="requester") == (
        "The current task is stopping; steering was not queued."
    )
    assert inbox.inbox.empty()

    registry.set_active_request("42", "request")
    # set_active_request intentionally closed the first mailbox; bind a fresh current one.
    inbox = ChatTurnInbox(requester_id="requester")
    registry.bind_steer_inbox("42", "request", inbox)
    for number in range(STEER_MESSAGES_PER_TURN):
        result = registry.request_steer("42", str(number), user_id="requester")
        assert result.startswith("Message queued")
    assert inbox.inbox.qsize() == STEER_MESSAGES_PER_TURN
    assert inbox.inbox_sequence == STEER_MESSAGES_PER_TURN
    assert registry.request_steer("42", "one too many", user_id="requester") == (
        "This turn's steering limit has been reached; message was not queued."
    )
    assert inbox.inbox.qsize() == STEER_MESSAGES_PER_TURN
    # The total-turn cap bounds consumed metadata too, not just queue length.
    assert _turn(inbox).drain_inbox() is True
    assert inbox.inbox.empty()
    before_events = list(inbox.inbox_events)
    assert "limit has been reached" in registry.request_steer(
        "42", "after consumption", user_id="requester"
    )
    assert inbox.inbox_events == before_events
    assert inbox.inbox.empty()


def test_old_new_request_isolation_late_cleanup_and_late_bind_do_not_touch_new_mailbox():
    registry = ChannelStateRegistry()
    registry.set_active_request("42", "old")
    old = ChatTurnInbox(requester_id="old-user")
    registry.bind_steer_inbox("42", "old", old)
    result = registry.request_steer("42", "old direction", user_id="old-user")
    assert result.startswith("Message queued")

    registry.set_active_request("42", "new")
    assert old.accepting is False
    assert registry.request_steer("42", "cannot leak", user_id="old-user") == (
        "No running chat turn accepting steering in this channel."
    )

    # A resumed/late old turn cannot bind after the new owner takes over.
    late_old = ChatTurnInbox(requester_id="old-user")
    registry.bind_steer_inbox("42", "old", late_old)
    assert late_old.accepting is False

    new = ChatTurnInbox(requester_id="new-user")
    registry.bind_steer_inbox("42", "new", new)
    registry.close_steer_inbox("42", "old")  # late terminal cleanup
    registry.clear_active_request("42", "old")  # late ownership cleanup
    assert registry.active_requests["42"] == "new"
    assert registry.request_steer("42", "new direction", user_id="new-user") == (
        "Message queued (sequence 1; not yet consumed)."
    )
    assert new.inbox.get_nowait()["text"] == "new direction"
    assert old.inbox.get_nowait()["text"] == "old direction"
    assert late_old.inbox.empty()


def _slash_bot(*, allowed=True, admins: set[str] | None = None):
    bot = SimpleNamespace(
        tree=_Tree(),
        intake=SimpleNamespace(is_allowed_user=lambda _user: allowed),
        permissions=SimpleNamespace(is_admin=lambda user_id: user_id in (admins or set())),
        channel_state=ChannelStateRegistry(),
    )
    register_commands(bot)
    return bot


async def test_slash_steer_is_ephemeral_queue_only_and_credential_safe():
    bot = _slash_bot()
    bot.channel_state.set_active_request("42", "request")
    inbox = ChatTurnInbox(requester_id="7")
    bot.channel_state.bind_steer_inbox("42", "request", inbox)

    interaction = _Interaction(user_id=7)
    await bot.tree.commands["steer"](interaction, "please use the other file")
    interaction.response.send_message.assert_awaited_once_with(
        "Message queued (sequence 1; not yet consumed).", ephemeral=True
    )
    assert inbox.inbox.qsize() == 1
    assert inbox.inbox_events[0]["event"] == "queued"
    assert not any(event["event"] == "consumed" for event in inbox.inbox_events)

    secret = "api_key=supersecret-value"
    credential_interaction = _Interaction(user_id=7)
    await bot.tree.commands["steer"](credential_interaction, secret)
    credential_interaction.response.send_message.assert_awaited_once_with(
        "A secret/credential was detected. Remove it and send the steering message again.",
        ephemeral=True,
    )
    assert inbox.inbox.qsize() == 1
    assert secret not in str(credential_interaction.response.send_message.await_args)


async def test_slash_steer_enforces_allowed_bot_requester_admin_and_size_boundaries():
    denied_bot = _slash_bot(allowed=False)
    denied = _Interaction(user_id=7)
    await denied_bot.tree.commands["steer"](denied, "direction")
    denied.response.send_message.assert_awaited_once_with("Access denied.", ephemeral=True)

    bot_user_bot = _slash_bot()
    bot_user = _Interaction(user_id=7, bot=True)
    await bot_user_bot.tree.commands["steer"](bot_user, "direction")
    bot_user.response.send_message.assert_awaited_once_with("Access denied.", ephemeral=True)

    bot = _slash_bot(admins={"99"})
    bot.channel_state.set_active_request("42", "request")
    inbox = ChatTurnInbox(requester_id="7")
    bot.channel_state.bind_steer_inbox("42", "request", inbox)
    stranger = _Interaction(user_id=8)
    await bot.tree.commands["steer"](stranger, "not mine")
    stranger.response.send_message.assert_awaited_once_with(
        "Access denied. Only the turn's requester or an admin may steer it.", ephemeral=True
    )
    admin = _Interaction(user_id=99)
    await bot.tree.commands["steer"](admin, "admin correction")
    admin.response.send_message.assert_awaited_once_with(
        "Message queued (sequence 1; not yet consumed).", ephemeral=True
    )
    oversize = _Interaction(user_id=7)
    await bot.tree.commands["steer"](oversize, "x" * (STEER_MESSAGE_MAX_CHARS + 1))
    oversize.response.send_message.assert_awaited_once_with(
        f"Steering messages must be at most {STEER_MESSAGE_MAX_CHARS} characters.", ephemeral=True
    )
    assert inbox.inbox.qsize() == 1


async def test_slash_steer_count_cap_is_ephemeral_and_does_not_enqueue_overflow():
    bot = _slash_bot()
    bot.channel_state.set_active_request("42", "request")
    inbox = ChatTurnInbox(requester_id="7")
    bot.channel_state.bind_steer_inbox("42", "request", inbox)

    for number in range(STEER_MESSAGES_PER_TURN):
        interaction = _Interaction(user_id=7)
        await bot.tree.commands["steer"](interaction, f"direction {number}")
        interaction.response.send_message.assert_awaited_once_with(
            f"Message queued (sequence {number + 1}; not yet consumed).", ephemeral=True
        )
    overflow = _Interaction(user_id=7)
    await bot.tree.commands["steer"](overflow, "overflow")
    overflow.response.send_message.assert_awaited_once_with(
        "This turn's steering limit has been reached; message was not queued.", ephemeral=True
    )
    assert inbox.inbox.qsize() == STEER_MESSAGES_PER_TURN
    assert inbox.inbox_sequence == STEER_MESSAGES_PER_TURN
