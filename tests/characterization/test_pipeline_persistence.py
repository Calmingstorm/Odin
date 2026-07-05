"""Characterization: pipeline orchestration (_handle_message /
_handle_message_inner) — session persistence, error sanitization, guest
routing, skill handoff, thread context inheritance, CancelledError cleanup,
and delivery hand-off.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

import discord
from src.sessions.manager import summarize_tool_response
from tests.fakes import (
    FakeChannel,
    FakeLLM,
    FakeMessage,
    make_bot,
    text_response,
    tool_call_response,
)


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def build(script=None, chat=None, **overrides):
    fake = FakeLLM(script or [], chat_responses=chat)
    bot = make_bot(fake_llm=fake, config_overrides=overrides or None)
    return bot, fake


def history_of(bot, channel_id: str):
    session = bot.sessions.get(channel_id)
    return [(m.role, m.content) for m in session.messages] if session else []


class TestPersistence:
    async def test_success_persists_tagged_user_and_assistant_turns(self):
        bot, fake = build([text_response("the answer")])
        msg = FakeMessage("what is it?")
        await bot._handle_message(msg, "what is it?")
        hist = history_of(bot, str(msg.channel.id))
        assert hist[0] == ("user", "[tester]: what is it?")
        assert hist[1] == ("assistant", "the answer")
        assert msg.reply_texts == ["the answer"]

    async def test_tool_loop_response_is_summarized_for_history(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                text_response("Detailed multi-tool response " + "x" * 400),
            ]
        )
        msg = FakeMessage("do it")
        await bot._handle_message(msg, "do it")
        hist = history_of(bot, str(msg.channel.id))
        expected = summarize_tool_response(
            "Detailed multi-tool response " + "x" * 400,
            ["parse_time"],
        )
        assert hist[-1] == ("assistant", expected)

    async def test_error_persists_sanitized_marker_not_raw_error(self):
        bot, fake = build([RuntimeError("provider meltdown")])
        msg = FakeMessage("do it")
        await bot._handle_message(msg, "do it")
        hist = history_of(bot, str(msg.channel.id))
        assert hist[-1][0] == "assistant"
        assert hist[-1][1] == "[Previous request encountered an error before tool execution.]"
        assert "provider meltdown" not in hist[-1][1]
        # But the user SEES the real error
        assert any("provider meltdown" in t for t in msg.reply_texts)

    async def test_error_after_tools_marker_names_tools(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                RuntimeError("mid-loop failure"),
            ]
        )
        msg = FakeMessage("do it")
        await bot._handle_message(msg, "do it")
        hist = history_of(bot, str(msg.channel.id))
        assert "[Previous request used tools (parse_time)" in hist[-1][1]

    async def test_cancelled_error_removes_orphaned_user_turn_and_reraises(self):
        bot, fake = build()
        bot.tool_loop.run = AsyncMock(side_effect=asyncio.CancelledError())
        msg = FakeMessage("interrupted")
        bot._pending_files[str(msg.channel.id)] = [(b"x", "leak.txt")]
        with pytest.raises(asyncio.CancelledError):
            await bot._handle_message(msg, "interrupted")
        assert history_of(bot, str(msg.channel.id)) == []
        assert str(msg.channel.id) not in bot._pending_files

    async def test_reflection_receives_popped_op_details(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                text_response("done"),
            ]
        )
        seen = {}

        async def spy_reflection(
            content, tools_used, response, is_error, user_id, tool_details=None
        ):
            seen["tool_details"] = tool_details
            seen["tools_used"] = tools_used

        bot.turn_recorder._operational_reflection = spy_reflection
        msg = FakeMessage("do it")
        await bot._handle_message(msg, "do it")
        await asyncio.sleep(0.05)  # fire_and_forget task
        assert seen["tools_used"] == ["parse_time"]
        assert seen["tool_details"] and seen["tool_details"][0]["tool"] == "parse_time"
        # And the per-channel stash was consumed
        assert str(msg.channel.id) not in bot._last_op_details


class TestRouting:
    async def test_guest_tier_routes_to_chat_without_tools(self):
        bot, fake = build(chat=["guest-tier answer"])
        bot.permissions.is_guest = lambda uid: True
        msg = FakeMessage("hello")
        await bot._handle_message(msg, "hello")
        assert fake.calls == []  # no tool loop
        assert len(fake.chat_calls) == 1  # chat route
        assert msg.reply_texts == ["guest-tier answer"]

    async def test_no_llm_provider_notifies_and_removes_user_turn(self):
        bot, fake = build()
        bot.codex_client = None  # llm_client property now resolves to None
        msg = FakeMessage("hello")
        await bot._handle_message(msg, "hello")
        assert any("No LLM provider available" in t for t in msg.reply_texts)
        assert history_of(bot, str(msg.channel.id)) == []

    async def test_skill_handoff_routes_result_through_chat(self):
        bot, fake = build(chat=["conversational wrap-up"])
        bot.tool_loop.run = AsyncMock(
            return_value=("raw skill output", False, False, ["myskill"], True),
        )
        msg = FakeMessage("use the skill")
        await bot._handle_message(msg, "use the skill")
        assert msg.reply_texts == ["conversational wrap-up"]
        # The handoff chat saw the tool result as an assistant message
        handoff_msgs = fake.chat_calls[0]["messages"]
        assert any("raw skill output" in str(m.get("content")) for m in handoff_msgs)

    async def test_skill_handoff_falls_back_to_skill_output_on_chat_failure(self):
        bot, fake = build(chat=[RuntimeError("chat down")])
        bot.tool_loop.run = AsyncMock(
            return_value=("raw skill output", False, False, ["myskill"], True),
        )
        msg = FakeMessage("use the skill")
        await bot._handle_message(msg, "use the skill")
        assert msg.reply_texts == ["raw skill output"]

    async def test_voice_callback_receives_response(self):
        bot, fake = build([text_response("spoken words")])
        spoken = []

        async def voice_cb(text):
            spoken.append(text)

        msg = FakeMessage("say it")
        await bot._handle_message(msg, "say it", voice_callback=voice_cb)
        assert spoken == ["spoken words"]
        assert msg.reply_texts == ["spoken words"]


class TestThreadInheritance:
    async def test_thread_seeds_summary_from_parent_channel(self):
        bot, fake = build([text_response("thread answer")])
        parent = FakeChannel(id=100, name="general")
        # Parent session with prior conversation
        bot.sessions.add_message("100", "user", "[tester]: earlier topic")
        bot.sessions.add_message("100", "assistant", "earlier reply")

        thread = MagicMock(spec=discord.Thread)
        thread.id = 200
        thread.parent = parent
        thread.name = "side-thread"
        thread.guild = None
        # Wire the fake channel behaviors the pipeline needs
        real = FakeChannel(id=200, name="side-thread")
        thread.send = real.send
        thread.typing = real.typing

        msg = FakeMessage("continue here", channel=thread)
        await bot._handle_message(msg, "continue here")

        thread_session = bot.sessions.get("200")
        assert thread_session.summary.startswith("[INHERITED FROM #general]")
        assert "earlier topic" in thread_session.summary

    async def test_thread_with_existing_session_not_reseeded(self):
        bot, fake = build([text_response("ok")])
        parent = FakeChannel(id=100, name="general")
        bot.sessions.add_message("100", "user", "[tester]: parent context")
        bot.sessions.add_message("200", "user", "[tester]: thread already active")

        thread = MagicMock(spec=discord.Thread)
        thread.id = 200
        thread.parent = parent
        thread.name = "side-thread"
        thread.guild = None
        real = FakeChannel(id=200)
        thread.send = real.send
        thread.typing = real.typing

        msg = FakeMessage("more", channel=thread)
        await bot._handle_message(msg, "more")
        assert not (bot.sessions.get("200").summary or "").startswith("[INHERITED")


class TestDeliveryHandoff:
    async def test_pending_files_delivered_with_response(self):
        bot, fake = build([text_response("here you go")])
        msg = FakeMessage("give me the file")
        bot._pending_files[str(msg.channel.id)] = [(b"bytes", "gift.txt")]
        await bot._handle_message(msg, "give me the file")
        entry = msg.replies[0]
        assert entry["content"] == "here you go"
        assert [f.filename for f in entry["files"]] == ["gift.txt"]

    async def test_already_sent_response_posts_pending_files_separately(self):
        bot, fake = build()
        bot.tool_loop.run = AsyncMock(
            return_value=("streamed already", True, False, ["some_tool"], False),
        )
        msg = FakeMessage("stream it")
        bot._pending_files[str(msg.channel.id)] = [(b"bytes", "late.txt")]
        await bot._handle_message(msg, "stream it")
        assert msg.replies == []  # not re-sent
        assert msg.channel.sent  # files posted on their own
        assert [f.filename for f in msg.channel.sent[0]["files"]] == ["late.txt"]
