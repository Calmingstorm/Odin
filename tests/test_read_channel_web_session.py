"""read_channel in a web or API chat reads that chat's own stored session.

A web chat has no Discord history (its channel's ``history`` was a coroutine
that ``async for`` could not iterate). The tool now reads the current chat's
stored session, read-only and bounded, says what that snapshot is and is not,
and never reads any other stored session. Discord channels are unchanged.
"""
from __future__ import annotations

import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from src.discord.native_tools.channel_ops import ChannelOpsTools
from src.discord.tool_loop import _LoopMessageProxy
from src.sessions.manager import SessionManager
from src.tools.execution_outcome import is_tool_failure
from src.web.chat import WebMessage, process_web_chat
from tests.characterization.test_chat_tool_loop import build
from tests.fakes import text_response, tool_call_response

# 2026-10-21 18:04:11 UTC
STAMP = 1792605851.0


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def _sessions(tmp_path) -> SessionManager:
    return SessionManager(max_history=500, max_age_hours=24, persist_dir=str(tmp_path / "s"))


def _tools(sessions, get_channel=None) -> ChannelOpsTools:
    return ChannelOpsTools(
        sessions=sessions,
        permissions=MagicMock(),
        get_channel=get_channel or MagicMock(return_value=None),
    )


def _web(channel_id="Admin", user_id="Admin", username="Aaron") -> WebMessage:
    return WebMessage(channel_id=channel_id, user_id=user_id, username=username, content="x")


def _add(sessions, channel_id, role, content, *, user_id=None, at=STAMP):
    sessions.add_message(channel_id, role, content, user_id=user_id)
    sessions.get(channel_id).messages[-1].timestamp = at


def _state(sessions):
    return (
        {key: [(m.role, m.content) for m in s.messages] for key, s in sessions._sessions.items()},
        set(sessions._dirty),
        dict(sessions._mutation_revisions),
    )


async def test_web_chat_reads_its_stored_conversation(tmp_path):
    sessions = _sessions(tmp_path)
    _add(sessions, "Admin", "user", "[Aaron]: is the backup done?", user_id="Admin")
    _add(sessions, "Admin", "assistant", "Yes, it finished at 06:00.", at=STAMP + 5)
    _add(sessions, "Admin", "user", "[Aaron]: read the chat", user_id="Admin", at=STAMP + 60)
    before = _state(sessions)
    out = await _tools(sessions)._handle_read_channel(_web(), {})
    assert not is_tool_failure(out)
    header, *lines = out.split("\n")
    assert header.startswith("[Stored session: 3 message(s) from this chat's saved conversation")
    assert "oldest first, times in UTC" in header
    assert "not live channel history or a full record of tool calls" in header
    assert "may include the unsaved current request" in header
    assert "reply in progress is not stored yet" in header
    assert "do not paste or echo" in header
    assert "compacted" not in header
    assert lines == [
        "[2026-10-21 18:04:11] user Admin: [Aaron]: is the backup done?",
        "[2026-10-21 18:04:16] Odin [BOT]: Yes, it finished at 06:00.",
        "[2026-10-21 18:05:11] user Admin: [Aaron]: read the chat",
    ]
    assert _state(sessions) == before


async def test_stored_identities_are_kept_not_renamed(tmp_path):
    sessions = _sessions(tmp_path)
    _add(sessions, "room", "user", "[old-name]: first", user_id="u1")
    _add(sessions, "room", "user", "[Jess]: second", user_id="u2")
    _add(sessions, "room", "user", "no prefix stored")
    out = await _tools(sessions)._handle_read_channel(_web("room", "u1", "new-name"), {})
    assert out.split("\n")[1:] == [
        "[2026-10-21 18:04:11] user u1: [old-name]: first",
        "[2026-10-21 18:04:11] user u2: [Jess]: second",
        "[2026-10-21 18:04:11] user: no prefix stored",
    ]
    assert "new-name" not in out


@pytest.mark.parametrize("channel_id", ["Admin", "123456789012345678"])
async def test_naming_the_current_chat_reads_it_even_when_numeric(tmp_path, channel_id):
    sessions = _sessions(tmp_path)
    _add(sessions, channel_id, "user", "[Aaron]: hello", user_id=channel_id)
    get_channel = MagicMock(return_value=None)
    out = await _tools(sessions, get_channel)._handle_read_channel(
        _web(channel_id, channel_id), {"channel_id": channel_id}
    )
    assert "[Aaron]: hello" in out
    get_channel.assert_not_called()


async def test_another_stored_session_is_never_read(tmp_path):
    sessions = _sessions(tmp_path)
    _add(sessions, "Admin", "user", "[Aaron]: mine", user_id="Admin")
    _add(sessions, "Admin:other", "user", "[Aaron]: a different chat", user_id="Admin")
    _add(sessions, "777", "user", "[Jess]: someone else's", user_id="777")
    get_channel = MagicMock(return_value=None)
    tools = _tools(sessions, get_channel)
    for other in ("Admin:other", "general", "admin"):
        out = await tools._handle_read_channel(_web(), {"channel_id": other})
        assert is_tool_failure(out) and "not found" in out
        assert "a different chat" not in out and "someone else's" not in out
    for blank in ("", " ", None):  # a blank placeholder means "this chat"
        out = await tools._handle_read_channel(_web(), {"channel_id": blank})
        assert "[Aaron]: mine" in out
        assert "a different chat" not in out and "someone else's" not in out
    # A numeric ID stays a Discord lookup, never a stored session.
    out = await tools._handle_read_channel(_web(), {"channel_id": "777"})
    assert is_tool_failure(out) and "not found" in out and "someone else's" not in out
    get_channel.assert_called_once_with(777)


async def test_a_numeric_discord_channel_is_still_read_from_a_web_chat(tmp_path):
    class _History:
        def __init__(self, items):
            self.items = list(items)

        def __aiter__(self):
            return self

        async def __anext__(self):
            if not self.items:
                raise StopAsyncIteration
            return self.items.pop(0)

    post = SimpleNamespace(
        created_at=SimpleNamespace(strftime=lambda fmt: "12:00:00"),
        author=SimpleNamespace(display_name="jess", bot=False),
        content="from discord", attachments=[], embeds=[],
    )
    channel = SimpleNamespace(id=555, history=lambda limit: _History([post]))
    out = await _tools(_sessions(tmp_path), lambda cid: channel)._handle_read_channel(
        _web(), {"channel_id": "555"}
    )
    assert out.startswith("[Channel history: 1 messages read.")
    assert "[12:00:00] jess: from discord" in out


@pytest.mark.parametrize(("raw", "expected"), [
    (None, 10), ("", 10), (0, 10), ("20", 20), (7, 7), (-3, 1), (500, 100),
])
async def test_limit_defaults_and_bounds(tmp_path, raw, expected):
    sessions = _sessions(tmp_path)
    for n in range(150):
        _add(sessions, "Admin", "user", f"[Aaron]: message {n}", user_id="Admin")
    out = await _tools(sessions)._handle_read_channel(_web(), {"limit": raw})
    lines = out.split("\n")[1:]
    assert len(lines) == expected
    assert lines[-1].endswith("message 149")  # the newest records, oldest first
    assert lines[0].endswith(f"message {150 - expected}")


@pytest.mark.parametrize("raw", ["ten", True, 2.5j])
async def test_an_invalid_limit_is_a_clear_failure(tmp_path, raw):
    sessions = _sessions(tmp_path)
    _add(sessions, "Admin", "user", "[Aaron]: hi", user_id="Admin")
    out = await _tools(sessions)._handle_read_channel(_web(), {"limit": raw})
    assert is_tool_failure(out) and "limit must be a whole number from 1 to 100" in out


@pytest.mark.parametrize(("record", "line"), [
    (SimpleNamespace(role="assistant", content="", timestamp=STAMP),
     "[2026-10-21 18:04:11] Odin [BOT]: (empty message)"),
    (SimpleNamespace(role="user", content=["image"], timestamp=STAMP, user_id="u1"),
     "[2026-10-21 18:04:11] user u1: (non-text content omitted)"),
    (SimpleNamespace(role="system", content="note", timestamp=None),
     "[unknown time] system: note"),
    (SimpleNamespace(role="", content="x", timestamp=True), "[unknown time] unknown: x"),
    (SimpleNamespace(role="user", content="far", timestamp=1e20, user_id=None),
     "[unknown time] user: far"),
])
def test_odd_stored_records_render_without_inventing_anything(record, line):
    from src.discord.native_tools.channel_ops import _stored_record_line

    assert _stored_record_line(record) == line


async def test_secrets_are_scrubbed_from_the_whole_payload(tmp_path):
    sessions = _sessions(tmp_path)
    _add(sessions, "Admin", "user", "[Aaron]: password=hunter2abc", user_id="Admin")
    out = await _tools(sessions)._handle_read_channel(_web(), {})
    assert "hunter2abc" not in out and "[REDACTED]" in out


@pytest.mark.parametrize("summary_kind", ["legacy", "rolling"])
async def test_compaction_is_announced_never_reproduced(tmp_path, summary_kind):
    sessions = _sessions(tmp_path)
    _add(sessions, "Admin", "user", "[Aaron]: latest", user_id="Admin")
    session = sessions.get("Admin")
    if summary_kind == "legacy":
        session.summary = "SUMMARY TEXT: the old discussion"
    else:
        session.summary_segments = [{"summary": "SUMMARY TEXT: the old discussion"}]
    out = await _tools(sessions)._handle_read_channel(_web(), {})
    assert "Older messages were compacted into a summary, which is not reproduced here." in out
    assert "SUMMARY TEXT" not in out
    assert out.startswith("[Stored session: 1 message(s)")


async def test_an_existing_empty_session_is_an_empty_snapshot(tmp_path):
    sessions = _sessions(tmp_path)
    _add(sessions, "Admin", "user", "[Aaron]: gone", user_id="Admin")
    session = sessions.get("Admin")
    session.messages.clear()
    out = await _tools(sessions)._handle_read_channel(_web(), {})
    assert not is_tool_failure(out)
    assert out == "[Stored session: no messages are stored in this chat's conversation yet.]"
    session.summary_segments = [{"summary": "earlier talk"}]
    out = await _tools(sessions)._handle_read_channel(_web(), {})
    assert out.endswith("not reproduced here.]") and "earlier talk" not in out


async def test_no_session_in_memory_is_said_plainly_and_none_is_created(tmp_path):
    sessions = _sessions(tmp_path)
    out = await _tools(sessions)._handle_read_channel(_web(), {})
    assert not is_tool_failure(out)
    assert "no stored session in memory" in out and "no history was read" in out
    assert sessions.get("Admin") is None
    assert not list((tmp_path / "s").iterdir())


async def test_a_lookup_failure_is_history_unavailable(tmp_path):
    sessions = MagicMock()
    sessions.get.side_effect = RuntimeError("store offline")
    out = await _tools(sessions)._handle_read_channel(_web(), {})
    assert is_tool_failure(out)
    assert "Stored history for this chat is unavailable: store offline" in out


async def test_a_loop_started_in_a_web_chat_reads_the_same_session(tmp_path):
    sessions = _sessions(tmp_path)
    _add(sessions, "Admin", "user", "[Aaron]: watch the queue", user_id="Admin")
    proxy = _LoopMessageProxy(_web().channel, "Admin", "Aaron")
    out = await _tools(sessions)._handle_read_channel(proxy, {})
    assert "[Aaron]: watch the queue" in out


async def test_discord_channels_never_take_the_stored_session_branch(tmp_path):
    sessions = _sessions(tmp_path)
    _add(sessions, "42", "user", "[Aaron]: stored", user_id="42")
    for channel in (MagicMock(id=42), SimpleNamespace(id=42, reads_stored_session="yes")):
        channel.history = None  # a Discord read reaches history and fails visibly
        message = SimpleNamespace(channel=channel)
        out = await _tools(sessions)._handle_read_channel(message, {})
        assert is_tool_failure(out) and "Failed to read channel" in out
        assert "stored" not in out


# ---------------------------------------------------------------------------
# Through the real web chat and tool loop
# ---------------------------------------------------------------------------


def _tool_result_text(fake, call_index):
    for message in fake.messages_of_call(call_index):
        content = message.get("content")
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_result":
                    return str(block.get("content"))
    raise AssertionError("no tool result in that request")


async def test_web_chat_turn_reads_its_history_and_keeps_its_reply_out(tmp_path):
    bot, fake = build([
        text_response("The backup finished at 06:00."),
        tool_call_response(("read_channel", {})),
        text_response("You asked about the backup."),
    ])
    first = await process_web_chat(bot, "is the backup done?", "Admin", "Admin", "Aaron")
    assert not first["is_error"]
    before = time.time()
    second = await process_web_chat(bot, "what did I ask?", "Admin", "Admin", "Aaron")
    assert not second["is_error"]
    result = _tool_result_text(fake, 2)
    assert "[Stored session: 3 message(s)" in result
    assert "[Aaron]: is the backup done?" in result
    assert "Odin [BOT]: The backup finished at 06:00." in result
    assert "[Aaron]: what did I ask?" in result  # the unsaved current request
    assert "You asked about the backup." not in result  # the reply in progress
    assert bot.sessions.get("Admin").messages[-1].timestamp >= before


async def test_two_chats_of_one_user_never_see_each_other(tmp_path):
    bot, fake = build([
        text_response("noted"),
        tool_call_response(("read_channel", {})),
        text_response("done"),
    ])
    await process_web_chat(bot, "the launch code is in chat A", "Admin:a", "Admin", "Aaron")
    await process_web_chat(bot, "read this chat", "Admin:b", "Admin", "Aaron")
    result = _tool_result_text(fake, 2)
    assert "[Stored session: 1 message(s)" in result
    assert "chat A" not in result


async def test_a_stateless_execute_chat_sees_only_its_own_request(tmp_path):
    bot, fake = build([
        text_response("earlier"),
        tool_call_response(("read_channel", {})),
        text_response("done"),
    ])
    await process_web_chat(bot, "an earlier request", "Admin", "Admin", "Aaron")
    await process_web_chat(
        bot, "one-off request", "execute-5f0c", "Admin", "Aaron", persist_channel_lock=False
    )
    result = _tool_result_text(fake, 2)
    assert "[Stored session: 1 message(s)" in result
    assert "one-off request" in result and "an earlier request" not in result


async def test_a_large_snapshot_stays_within_the_shared_output_budget(tmp_path):
    bot, fake = build([tool_call_response(("read_channel", {"limit": 100})), text_response("ok")])
    for n in range(100):
        bot.sessions.add_message("Admin", "user", f"[Aaron]: {n} " + "x" * 2000, user_id="Admin")
    await process_web_chat(bot, "summarize this chat", "Admin", "Admin", "Aaron")
    result = _tool_result_text(fake, 1)
    assert len(result) <= 13000
