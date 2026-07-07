"""Coverage for src/discord/native_tools/channel_ops.py (RFC-006 P5).

Drives the Discord-native channel-op handlers (purge / read / react / poll /
set-permission) directly on ChannelOpsTools with faked discord objects. No
gateway is touched — messages, channels, and discord.Forbidden/NotFound are all
fakes; the handlers return plain strings we assert on.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import discord
from src.discord.native_tools.channel_ops import ChannelOpsTools


def _forbidden():
    return discord.Forbidden(
        SimpleNamespace(status=403, reason="Forbidden"), "denied")  # type: ignore[arg-type]


def _not_found():
    return discord.NotFound(
        SimpleNamespace(status=404, reason="Not Found"), "missing")  # type: ignore[arg-type]


class _AsyncIter:
    def __init__(self, items):
        self._items = list(items)

    def __aiter__(self):
        self._it = iter(self._items)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration from None


def _hist_msg(content="hi", author="alice", bot=False, attachments=(), embeds=()):
    return SimpleNamespace(
        created_at=SimpleNamespace(strftime=lambda fmt: "12:00:00"),
        author=SimpleNamespace(display_name=author, bot=bot),
        content=content, attachments=list(attachments), embeds=list(embeds),
    )


def _channel(history_msgs=None, cid=42):
    ch = MagicMock()
    ch.id = cid
    ch.purge = AsyncMock(return_value=[object(), object()])
    ch.send = AsyncMock()
    ch.fetch_message = AsyncMock()
    if history_msgs is not None:
        ch.history = lambda limit=10: _AsyncIter(history_msgs)
    return ch


def _message(channel=None, mid=7):
    msg = MagicMock()
    msg.id = mid
    msg.channel = channel or _channel()
    return msg


def _tools(get_channel=None):
    return ChannelOpsTools(
        sessions=MagicMock(),
        permissions=MagicMock(),
        get_channel=get_channel or (lambda cid: None),
    )


# --------------------------------------------------------------------------- #
# purge
# --------------------------------------------------------------------------- #
class TestPurge:
    async def test_success_resets_session(self):
        t = _tools()
        msg = _message()
        out = await t._handle_purge(msg, {"count": 5})
        assert "Deleted 2 messages" in out
        t.sessions.reset.assert_called_once_with(str(msg.channel.id))

    async def test_forbidden(self):
        t = _tools()
        msg = _message()
        msg.channel.purge = AsyncMock(side_effect=_forbidden())
        assert "don't have permission" in await t._handle_purge(msg, {})

    async def test_generic_error(self):
        t = _tools()
        msg = _message()
        msg.channel.purge = AsyncMock(side_effect=RuntimeError("boom"))
        assert "Failed to purge" in await t._handle_purge(msg, {})


# --------------------------------------------------------------------------- #
# read_channel
# --------------------------------------------------------------------------- #
class TestReadChannel:
    async def test_reads_and_formats(self):
        embed = SimpleNamespace(title="T", description="D" * 300)
        msgs = [
            _hist_msg("hello", "alice"),
            _hist_msg("", "botty", bot=True,
                      attachments=[SimpleNamespace(filename="a.png")], embeds=[embed]),
        ]
        t = _tools()
        msg = _message(channel=_channel(history_msgs=msgs))
        out = await t._handle_read_channel(msg, {"limit": 10})
        assert "2 messages read" in out
        assert "alice" in out and "[BOT]" in out
        assert "[attachment: a.png]" in out and "[embed:" in out

    async def test_resolve_by_channel_id(self):
        ch = _channel(history_msgs=[_hist_msg("yo")])
        t = _tools(get_channel=lambda cid: ch)
        out = await t._handle_read_channel(_message(), {"channel_id": "99"})
        assert "1 messages read" in out

    async def test_channel_id_not_found(self):
        t = _tools(get_channel=lambda cid: None)
        out = await t._handle_read_channel(_message(), {"channel_id": "99"})
        assert "not found or not accessible" in out

    async def test_no_channel_context(self):
        t = _tools()
        msg = SimpleNamespace(channel=None)
        assert "No channel context" in await t._handle_read_channel(msg, {})

    async def test_no_messages(self):
        t = _tools()
        msg = _message(channel=_channel(history_msgs=[]))
        assert "No messages found" in await t._handle_read_channel(msg, {})

    async def test_forbidden_and_error(self):
        t = _tools()
        ch = MagicMock()
        ch.history = MagicMock(side_effect=_forbidden())
        assert "Permission denied" in await t._handle_read_channel(
            SimpleNamespace(channel=ch), {})
        ch.history = MagicMock(side_effect=RuntimeError("x"))
        assert "Failed to read channel" in await t._handle_read_channel(
            SimpleNamespace(channel=ch), {})


# --------------------------------------------------------------------------- #
# add_reaction
# --------------------------------------------------------------------------- #
class TestAddReaction:
    async def test_missing_emoji(self):
        assert "'emoji' is required" in await _tools()._handle_add_reaction(_message(), {})

    async def test_success_resolves_this(self):
        t = _tools()
        msg = _message()
        target = MagicMock()
        target.add_reaction = AsyncMock()
        msg.channel.fetch_message = AsyncMock(return_value=target)
        out = await t._handle_add_reaction(msg, {"emoji": "👍", "message_id": "this"})
        assert out == "Reaction added."
        msg.channel.fetch_message.assert_awaited_once_with(int(msg.id))

    async def test_not_found_forbidden_error(self):
        t = _tools()
        msg = _message()
        msg.channel.fetch_message = AsyncMock(side_effect=_not_found())
        assert "not found" in await t._handle_add_reaction(msg, {"emoji": "x", "message_id": "5"})
        msg.channel.fetch_message = AsyncMock(side_effect=_forbidden())
        assert "Permission denied" in await t._handle_add_reaction(
            msg, {"emoji": "x", "message_id": "5"})
        msg.channel.fetch_message = AsyncMock(side_effect=RuntimeError("e"))
        assert "Failed to add reaction" in await t._handle_add_reaction(
            msg, {"emoji": "x", "message_id": "5"})


# --------------------------------------------------------------------------- #
# create_poll
# --------------------------------------------------------------------------- #
class TestCreatePoll:
    async def test_validation(self):
        t = _tools()
        assert "required" in await t._handle_create_poll(_message(), {"question": "q"})
        assert "maximum of 10" in await t._handle_create_poll(
            _message(), {"question": "q", "options": [str(i) for i in range(11)]})

    async def test_success(self):
        t = _tools()
        msg = _message()
        out = await t._handle_create_poll(
            msg, {"question": "Pick", "options": ["a", "b"], "duration_hours": 5})
        assert out == "Poll created."
        msg.channel.send.assert_awaited_once()

    async def test_send_error(self):
        t = _tools()
        msg = _message()
        msg.channel.send = AsyncMock(side_effect=RuntimeError("nope"))
        assert "Failed to create poll" in await t._handle_create_poll(
            msg, {"question": "q", "options": ["a"]})


# --------------------------------------------------------------------------- #
# set_permission
# --------------------------------------------------------------------------- #
class TestSetPermission:
    async def test_denied_for_non_admin(self):
        t = _tools()
        t.permissions.is_admin.return_value = False
        assert "Permission denied" in await t._handle_set_permission(
            "u1", {"user_id": "u2", "tier": "user"})

    async def test_success(self):
        t = _tools()
        t.permissions.is_admin.return_value = True
        t.permissions.async_set_tier = AsyncMock()
        out = await t._handle_set_permission("admin", {"user_id": "u2", "tier": "admin"})
        assert "set to **admin**" in out

    async def test_invalid_tier(self):
        t = _tools()
        t.permissions.is_admin.return_value = True
        t.permissions.async_set_tier = AsyncMock(side_effect=ValueError("bad tier"))
        assert "bad tier" in await t._handle_set_permission(
            "admin", {"user_id": "u2", "tier": "nope"})
