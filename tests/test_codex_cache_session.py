"""Prompt-cache affinity and client identity on the Codex wire.

The ChatGPT Codex backend keeps a conversation's prompt cache only while its
requests carry one ``session_id`` header (measured 2026-10-16: without it no
follow-up request reused any of the previous prompt). Odin sends his own
random UUID per conversation, and names himself ``odin`` on every request.
"""
from __future__ import annotations

import asyncio
import json
import platform
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlsplit

import pytest

from src.agents.manager import _run_agent
from src.discord.tool_loop import ToolLoopRunner
from src.llm import cache_session
from src.llm.cache_session import (
    bind_session,
    channel_session_id,
    current_session_id,
    forget_channel,
    in_new_session,
    new_session_id,
)
from src.llm.codex_auth import CodexAuth
from src.llm.openai_codex import ODIN_ORIGINATOR, ODIN_USER_AGENT, CodexChatClient
from src.sessions.manager import SessionManager
from src.tools.image.openai_backend import OpenAIImageBackend
from tests.test_agent_transcript_contract import agent
from tests.test_codex_reliability import TEXT_OK_SSE, FakeResp, _client

_EXPECTED_UA = f"odin ({platform.system()}; {platform.machine()})"

_TOOL_SSE = [
    "data: "
    + json.dumps({"type": "response.output_text.delta", "delta": "done"})
    + "\n",
    "data: " + json.dumps({"type": "response.completed", "response": {}}) + "\n",
    "data: [DONE]\n",
]


class _RecordingSession:
    """Records every post's headers and JSON body, replying with ``replies``."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls: list[tuple[dict, dict]] = []
        self.closed = False

    def post(self, url, *, headers, json, timeout):  # noqa: A002 - aiohttp's name
        self.calls.append((dict(headers), json))
        return self.replies.pop(0)


def _recording_client(replies, max_retries: int = 1):
    client = _client(max_retries=max_retries)
    session = _RecordingSession(replies)

    async def get_session():
        return session

    client._get_session = get_session
    return client, session


# --- the conversation ID registry --------------------------------------------


def test_new_ids_are_random_uuid4():
    first, second = new_session_id(), new_session_id()
    assert first != second
    assert uuid.UUID(first).version == 4 and uuid.UUID(second).version == 4


def test_channel_keeps_its_id_until_forgotten():
    channel = f"chan-{new_session_id()}"
    first = channel_session_id(channel)
    assert channel_session_id(channel) == first
    assert channel_session_id(f"other-{channel}") != first
    forget_channel(channel)
    assert channel_session_id(channel) != first
    forget_channel(f"other-{channel}")
    forget_channel(channel)


def test_registry_is_bounded(monkeypatch):
    monkeypatch.setattr(cache_session, "_MAX_CHANNEL_IDS", 2)
    monkeypatch.setattr(cache_session, "_channel_ids", {})
    oldest = channel_session_id("a")
    channel_session_id("b")
    channel_session_id("c")
    assert set(cache_session._channel_ids) == {"b", "c"}
    assert channel_session_id("a") != oldest


async def test_binding_is_scoped_and_restored():
    assert current_session_id() is None
    with bind_session("outer"):
        with bind_session("inner"):
            assert current_session_id() == "inner"
        assert current_session_id() == "outer"
    assert current_session_id() is None


def test_session_reset_starts_a_new_conversation(tmp_path):
    sessions = SessionManager(max_history=50, max_age_hours=24, persist_dir=str(tmp_path))
    channel = f"chan-{new_session_id()}"
    before = channel_session_id(channel)
    sessions.reset(channel)
    after = channel_session_id(channel)
    assert after != before
    sessions.reset_many([channel])
    assert channel_session_id(channel) != after
    forget_channel(channel)


# --- the wire ------------------------------------------------------------------


async def test_tool_request_carries_the_conversation_id_and_odin_identity():
    client, session = _recording_client([FakeResp(200, sse_lines=_TOOL_SSE)])
    with bind_session("conv-1"):
        await client.chat_with_tools(
            messages=[{"role": "user", "content": "hi"}], system="sys", tools=[]
        )
    headers, body = session.calls[0]
    assert headers["session_id"] == "conv-1"
    assert body["prompt_cache_key"] == "conv-1"
    assert headers["originator"] == "odin" == ODIN_ORIGINATOR
    assert headers["User-Agent"] == _EXPECTED_UA == ODIN_USER_AGENT


async def test_text_request_carries_the_conversation_id():
    client, session = _recording_client([FakeResp(200, sse_lines=TEXT_OK_SSE)])
    with bind_session("conv-2"):
        assert await client.chat([{"role": "user", "content": "hi"}], system="sys") == "hello"
    headers, body = session.calls[0]
    assert headers["session_id"] == "conv-2" and body["prompt_cache_key"] == "conv-2"


async def test_requests_outside_a_conversation_send_no_session():
    client, session = _recording_client(
        [FakeResp(200, sse_lines=_TOOL_SSE), FakeResp(200, sse_lines=TEXT_OK_SSE)]
    )
    await client.chat_with_tools(messages=[{"role": "user", "content": "hi"}], system="s", tools=[])
    await client.chat([{"role": "user", "content": "hi"}], system="s")
    for headers, body in session.calls:
        assert "session_id" not in headers and "prompt_cache_key" not in body
        assert headers["originator"] == "odin" and headers["User-Agent"] == _EXPECTED_UA
    assert set(session.calls[0][0]) == {
        "Authorization", "Content-Type", "originator", "User-Agent",
    }


async def test_retry_attempts_keep_the_same_conversation_id():
    client, session = _recording_client(
        [FakeResp(500, body=b"busy"), FakeResp(200, sse_lines=TEXT_OK_SSE)], max_retries=2
    )
    with bind_session("conv-3"):
        assert await client.chat([{"role": "user", "content": "hi"}], system="s") == "hello"
    assert [headers["session_id"] for headers, _ in session.calls] == ["conv-3", "conv-3"]
    assert [body["prompt_cache_key"] for _, body in session.calls] == ["conv-3", "conv-3"]


def test_auth_headers_name_odin_and_never_carry_a_session():
    headers = CodexChatClient._auth_headers("t", "acct")
    assert headers["originator"] == "odin" and headers["User-Agent"] == _EXPECTED_UA
    assert headers["ChatGPT-Account-Id"] == "acct" and "session_id" not in headers


def test_image_requests_name_odin():
    headers = OpenAIImageBackend._headers("t", "acct")
    assert headers["originator"] == "odin" and headers["User-Agent"] == _EXPECTED_UA
    assert "session_id" not in headers


def test_login_link_names_odin():
    url, _verifier = CodexAuth.build_auth_url()
    assert parse_qs(urlsplit(url).query)["originator"] == ["odin"]


# --- where conversations start --------------------------------------------------


def _turn(channel: str):
    durability = SimpleNamespace(
        settle_terminal=AsyncMock(return_value=True), settled=True, suspended=False
    )
    return SimpleNamespace(
        _ch_id=channel, _req_id="r", _cancel=asyncio.Event(), durability=durability, trace=None
    )


def _runner(seen: list):
    async def run_iterations(st):
        seen.append(current_session_id())
        return ("ok", False, False, [], False)

    return SimpleNamespace(
        _computer_service=lambda: None,
        _run_chat_iterations=run_iterations,
        _channel_state=SimpleNamespace(close_steer_inbox=lambda *_: None),
        _stop_computer_turn=AsyncMock(),
        _release_workload=lambda _st: None,
        _clear_active=lambda _st: None,
    )


async def test_chat_turns_of_one_channel_share_its_id_until_reset():
    channel = f"chan-{new_session_id()}"
    seen: list = []
    runner = _runner(seen)
    await ToolLoopRunner._run_with_guards(runner, _turn(channel))
    await ToolLoopRunner._run_with_guards(runner, _turn(channel))
    await ToolLoopRunner._run_with_guards(runner, _turn(f"other-{channel}"))
    forget_channel(channel)
    await ToolLoopRunner._run_with_guards(runner, _turn(channel))
    assert seen[0] is not None and seen[0] == seen[1]  # one channel session, one ID
    assert seen[2] not in (None, seen[0])  # another channel
    assert seen[3] not in (None, seen[0]) and seen[3] == channel_session_id(channel)  # after reset
    assert current_session_id() is None
    forget_channel(channel)
    forget_channel(f"other-{channel}")


async def test_each_agent_run_has_its_own_id_for_all_its_requests():
    seen: list = []

    async def callback(*args, **kwargs):
        seen.append(current_session_id())
        if len(seen) == 1:
            return {"tool_calls": [{"id": "1", "name": "read_file", "input": {}}]}
        return {"text": "done"}

    with bind_session("parent-turn"):
        await _run_agent(agent(), "", [], callback, AsyncMock(return_value="ok"))
        first_agent = list(seen)
        seen.clear()
        await _run_agent(agent(), "", [], callback, AsyncMock(return_value="ok"))
        assert current_session_id() == "parent-turn"
    assert len(first_agent) == 2 and first_agent[0] == first_agent[1]
    assert first_agent[0] not in (None, "parent-turn")
    assert seen[0] == seen[1] and seen[0] not in (None, "parent-turn", first_agent[0])


async def test_a_loop_keeps_one_id_across_its_iterations(monkeypatch):
    import src.tools.autonomous_loop as al

    monkeypatch.setattr(al, "MIN_INTERVAL_SECONDS", 0)
    manager = al.LoopManager()
    seen: list = []
    channel = SimpleNamespace(id="loop-chan", send=AsyncMock())

    async def iteration(prompt, ch, prev_context, cancel_event):
        seen.append(current_session_id())
        return "still going"

    with bind_session("starting-turn"):
        loop_id = manager.start_loop(
            goal="g",
            channel=channel,
            requester_id="u",
            requester_name="user",
            iteration_callback=iteration,
            interval_seconds=0,
            max_iterations=2,
        )
    assert not loop_id.startswith("Error")
    await asyncio.wait_for(manager._loops[loop_id]._task, 10)
    assert len(seen) == 2 and seen[0] == seen[1]
    assert seen[0] not in (None, "starting-turn")


async def test_quota_check_never_sends_a_session_even_inside_a_conversation(monkeypatch):
    from src.llm.codex_quota_check import CodexQuotaCheckService
    from tests.test_codex_quota_check import Pool, Session

    pool, session = Pool(), Session()
    service = CodexQuotaCheckService(lambda: pool, interval=900, timeout=3)
    monkeypatch.setattr(
        "src.llm.codex_quota_check.aiohttp.ClientSession", lambda **_kwargs: session
    )
    with bind_session("conv-4"):
        await service.check_once()
    assert session.calls
    for _args, kwargs in session.calls:
        assert "session_id" not in kwargs["headers"]
        assert "prompt_cache_key" not in kwargs["json"]
        assert kwargs["headers"]["originator"] == "odin"


async def test_detached_work_runs_under_its_own_new_id():
    seen: list = []

    async def work():
        seen.append(current_session_id())

    with bind_session("conversation"):
        await asyncio.create_task(in_new_session(work()))
        assert current_session_id() == "conversation"
    assert seen[0] not in (None, "conversation")
    assert uuid.UUID(seen[0]).version == 4


# --- conversation ingress: Odin's review checks for PR #664, adopted -----------
# These need Odin's bot (tests.fakes), so their imports stay local.


def _recording_llm(*args, **kwargs):
    from tests.fakes import FakeLLM

    class RecordingLLM(FakeLLM):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self.cache_ids: list = []

        async def chat(self, *a, **kw):
            self.cache_ids.append(("chat", current_session_id()))
            return await super().chat(*a, **kw)

        async def chat_with_tools(self, *a, **kw):
            self.cache_ids.append(("tools", current_session_id()))
            return await super().chat_with_tools(*a, **kw)

    return RecordingLLM(*args, **kwargs)


@pytest.fixture
def bot_dir(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    return tmp_path


@pytest.mark.parametrize("surface", ["discord", "web", "web-unlocked"])
async def test_pre_turn_compaction_uses_the_turn_id(surface, bot_dir):
    from src.web.chat import process_web_chat
    from tests.fakes import FakeMessage, make_bot, text_response

    fake = _recording_llm([text_response("answer")])
    bot = make_bot(fake_llm=fake)
    channel = f"cache-{surface}-{new_session_id()}"
    bot.sessions.token_budget = 1
    for n in range(8):
        bot.sessions.add_message(channel, "user", f"prior message {n}")

    async def compact(messages, system):
        return await fake.chat(messages, system)

    bot.sessions.set_compaction_fn(compact)
    if surface.startswith("web"):
        # /api/execute's single-use channels run without the channel lock.
        result = await process_web_chat(
            bot, "hello", channel, persist_channel_lock=surface == "web"
        )
        assert not result["is_error"]
    else:
        msg = FakeMessage("hello")
        msg.channel.id = channel
        await bot.pipeline.run(msg, "hello")
    assert fake.cache_ids[0][0] == "chat"  # the compaction ran first
    tool_id = next(sid for kind, sid in fake.cache_ids if kind == "tools")
    assert tool_id is not None and fake.cache_ids[0][1] == tool_id
    forget_channel(channel)


async def test_guest_chat_uses_the_channel_id(bot_dir):
    from tests.fakes import FakeMessage, make_bot

    fake = _recording_llm(chat_responses=["guest answer", "second answer"])
    bot = make_bot(fake_llm=fake)
    bot.permissions.is_guest = lambda uid: True
    msg = FakeMessage("hello")
    await bot.pipeline.run(msg, "hello")
    await bot.pipeline.run(FakeMessage("again", channel=msg.channel), "again")
    assert len(fake.cache_ids) == 2
    assert fake.cache_ids[0][1] is not None and fake.cache_ids[0][1] == fake.cache_ids[1][1]
    forget_channel(str(msg.channel.id))


async def test_skill_handoff_keeps_the_turn_id_and_reflection_gets_its_own(bot_dir):
    from tests.fakes import FakeMessage, make_bot, tool_call_response

    fake = _recording_llm(
        [tool_call_response(("myskill", {"q": "x"}))], chat_responses=["conversational wrap-up"]
    )
    bot = make_bot(fake_llm=fake)
    bot.skill_manager.has_skill = lambda name: name == "myskill"
    bot.skill_manager.should_handoff_to_codex = lambda name: True
    bot.skill_manager.execute = AsyncMock(return_value="skill output text")
    reflected: list = []
    reflection_done = asyncio.Event()

    async def reflection(*args, **kwargs):
        reflected.append(current_session_id())
        reflection_done.set()

    bot.turn_recorder._operational_reflection = reflection
    msg = FakeMessage("use myskill")
    await bot.pipeline.run(msg, "use myskill")
    await asyncio.wait_for(reflection_done.wait(), 2)
    assert msg.reply_texts == ["conversational wrap-up"]
    turn_id = fake.cache_ids[0][1]
    assert fake.cache_ids[0][0] == "tools" and turn_id is not None
    assert fake.cache_ids[-1] == ("chat", turn_id)  # the hand-off reply
    assert reflected[0] not in (None, turn_id)  # background learning has its own ID
    forget_channel(str(msg.channel.id))


async def test_delegated_followup_has_its_own_id_even_after_a_reset(monkeypatch):
    from src.discord.background_task import _send_conversational_followup
    from tests.test_native_agents_tasks import _message, _tools

    tools = _tools()
    tools._llm_gateway.auxiliary_llm_client = None
    seen: list = []

    async def chat(**kwargs):
        seen.append(current_session_id())
        return "completed"

    tools._llm_gateway.chat = chat
    ready, release = asyncio.Event(), asyncio.Event()

    async def fake_steps(task, *args, codex_callback, **kwargs):
        ready.set()
        await release.wait()
        await _send_conversational_followup(task, codex_callback)

    monkeypatch.setattr("src.discord.native_tools.agents_tasks.run_background_task", fake_steps)
    msg = _message()
    msg.channel.send = AsyncMock()
    channel = f"cache-delegation-{new_session_id()}"
    old_id = channel_session_id(channel)
    with bind_session(old_id):
        result = await tools._handle_delegate_task(
            msg, {"description": "offline task", "steps": [{"tool_name": "web_search"}]}
        )
    assert "Background task started" in result
    task = next(iter(tools._channel_state.background_tasks.values()))
    await asyncio.wait_for(ready.wait(), 2)
    forget_channel(channel)
    new_id = channel_session_id(channel)
    release.set()
    await asyncio.wait_for(task._asyncio_task, 2)
    assert msg.channel.send.await_count == 1
    assert len(seen) == 1 and seen[0] not in (None, old_id, new_id)
    forget_channel(channel)


def test_finished_ephemeral_channel_releases_its_id(tmp_path):
    sessions = SessionManager(max_history=50, max_age_hours=24, persist_dir=str(tmp_path / "s"))
    channel = f"cache-ephemeral-{new_session_id()}"
    with sessions.ephemeral(channel):
        sessions.add_message(channel, "user", "single-use API request")
        channel_session_id(channel)
    assert not sessions.exists(channel)
    assert channel not in cache_session._channel_ids


async def test_concurrent_bindings_are_isolated_and_restored_after_cancel():
    entered, resume = asyncio.Event(), asyncio.Event()

    async def worker():
        with bind_session("child"):
            entered.set()
            await resume.wait()

    with bind_session("parent"):
        task = asyncio.create_task(worker())
        await asyncio.wait_for(entered.wait(), 2)
        assert current_session_id() == "parent"
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert current_session_id() == "parent"
        with pytest.raises(RuntimeError), bind_session("exception"):
            raise RuntimeError("offline test")
        assert current_session_id() == "parent"
    assert current_session_id() is None


def test_prune_and_restore_keep_the_id_and_clear_all_replaces_it(tmp_path):
    sessions = SessionManager(max_history=50, max_age_hours=24, persist_dir=str(tmp_path / "s"))
    channel = f"cache-archive-{new_session_id()}"
    sessions.add_message(channel, "user", "preserved history")
    first = channel_session_id(channel)
    sessions.get(channel).last_active = 1
    assert sessions.prune() == 1 and not sessions.exists(channel)
    assert sessions.get_or_create(channel).messages[0].content == "preserved history"
    assert channel_session_id(channel) == first
    assert sessions.clear_all() == 1
    assert channel_session_id(channel) != first
    forget_channel(channel)


async def test_loop_reflection_runs_under_its_own_id():
    from src.discord.turn_recorder import TurnRecorder

    reflected: list = []
    done = asyncio.Event()

    async def reflect_on_operation(**kwargs):
        reflected.append(current_session_id())
        done.set()

    recorder = TurnRecorder(
        get_config=lambda: SimpleNamespace(
            learning=SimpleNamespace(enabled=True, loop_reflection_enabled=True)
        ),
        trajectory_saver=None,
        reflector=SimpleNamespace(reflect_on_operation=reflect_on_operation),
        outbound_webhook_dispatcher=None,
        loop_reflection_gate=SimpleNamespace(evaluate=lambda loop_id, **_kw: (True, "test")),
    )
    with bind_session("loop-id"):
        recorder._maybe_loop_reflect(
            loop_id="loop-1", prompt="p", outcome="o", is_error=False, failure_class="",
            error_text="", tool_details=[{"tool": "run_command", "result": "ok"}], user_id="u",
        )
    await asyncio.wait_for(done.wait(), 2)
    assert reflected[0] not in (None, "loop-id")


async def test_session_manager_reflections_run_under_their_own_ids(tmp_path):
    """Compaction and archive reflection are background learning: never the conversation's ID."""
    seen: dict = {}

    class Reflector:
        async def reflect_on_compacted(self, messages, summary, user_ids=None):
            seen["compaction"] = current_session_id()

        async def reflect_on_session(self, session, user_ids=None):
            seen["archive"] = current_session_id()

    sessions = SessionManager(
        max_history=50, max_age_hours=24, persist_dir=str(tmp_path / "s"), reflector=Reflector()
    )

    async def compact(messages, system):
        return "- Earlier conversation summarized"

    sessions.set_compaction_fn(compact)
    sessions.token_budget = 1
    channel, other = f"cache-a-{new_session_id()}", f"cache-b-{new_session_id()}"
    for n in range(12):
        sessions.add_message(channel, "user", f"prior message {n}", user_id="u")
    for n in range(4):
        sessions.add_message(other, "user", f"expired message {n}", user_id="u")
    sessions.get(other).last_active = 1
    conversation = channel_session_id(channel)
    with bind_session(conversation):
        await sessions.get_task_history(channel, max_messages=10)
        assert sessions.prune() == 1  # archives the other channel inside this request
    await asyncio.wait_for(asyncio.gather(*list(sessions._reflection_tasks)), 3)
    assert set(seen) == {"compaction", "archive"}
    assert seen["compaction"] not in (None, conversation)
    assert seen["archive"] not in (None, conversation, seen["compaction"])
    forget_channel(channel)
    forget_channel(other)


@pytest.mark.parametrize("surface", ["discord", "web"])
@pytest.mark.parametrize("trigger", ["compaction", "archive-other-channel"])
async def test_session_reflection_through_ingress_has_its_own_id(surface, trigger, bot_dir):
    """Odin's round-2 review check: real ingress, session manager and reflector."""
    from src.web.chat import process_web_chat
    from tests.fakes import FakeLLM, FakeMessage, make_bot, text_response

    class RecordingProvider(FakeLLM):
        def __init__(self):
            super().__init__([text_response("answer")])
            self.observed: list = []
            self.reflection_started = asyncio.Event()
            self.release_reflection = asyncio.Event()

        def eligible_account_keys_snapshot(self):
            return ()

        async def chat_with_tools(self, *args, **kwargs):
            self.observed.append(("tools", current_session_id()))
            return await super().chat_with_tools(*args, **kwargs)

        async def chat(self, messages, system="", **kwargs):
            if system.startswith("Summarize the following conversation slice"):
                self.observed.append(("compaction", current_session_id()))
                return (
                    "[Topics: review]\n[Entities: none]\n[Decisions: none]\n[Open: none]\n- Prior"
                )
            if system.startswith("You extract explicit lessons from conversations."):
                self.observed.append(("reflection-start", current_session_id()))
                self.reflection_started.set()
                await self.release_reflection.wait()
                self.observed.append(("reflection-after-reset", current_session_id()))
                return "[]"
            return await super().chat(messages, system, **kwargs)

    fake = RecordingProvider()
    bot = make_bot(fake_llm=fake, config_overrides={"learning": {"enabled": True}})
    assert bot.reflector.is_enabled() and bot.sessions._reflector is bot.reflector
    bot.llm_gateway.wire_callbacks()
    channel = f"cache-{surface}-{trigger}-{new_session_id()}"
    old = channel_session_id(channel)
    archived_channel, archived_id = f"other-{channel}", None
    if trigger == "compaction":
        bot.sessions.token_budget = 1
        for n in range(12):
            bot.sessions.add_message(channel, "user", f"prior message {n}", user_id="review-user")
    else:
        archived_id = channel_session_id(archived_channel)
        for n in range(4):
            bot.sessions.add_message(
                archived_channel, "user", f"expired message {n}", user_id="review-user"
            )
        bot.sessions.get(archived_channel).last_active = 1
    try:
        if surface == "web":
            assert not (await process_web_chat(bot, "hello", channel))["is_error"]
        else:
            msg = FakeMessage("hello")
            msg.channel.id = channel
            await bot.pipeline.run(msg, "hello")
            assert msg.reply_texts == ["answer"]
        await asyncio.wait_for(fake.reflection_started.wait(), 3)
        bot.sessions.reset(channel)  # the copied context must not matter after a reset
        new = channel_session_id(channel)
        fake.release_reflection.set()
        await asyncio.wait_for(asyncio.gather(*list(bot.sessions._reflection_tasks)), 3)
        foreground = next(sid for kind, sid in fake.observed if kind == "tools")
        reflected = [sid for kind, sid in fake.observed if kind.startswith("reflection-")]
        assert foreground == old and new != old
        if trigger == "compaction":
            assert next(sid for kind, sid in fake.observed if kind == "compaction") == old
        else:
            assert not bot.sessions.exists(archived_channel) and archived_id != old
        assert len(reflected) == 2 and reflected[0] == reflected[1]
        assert reflected[0] not in (None, old, new, archived_id)
    finally:
        fake.release_reflection.set()
        if bot.sessions._reflection_tasks:
            await asyncio.gather(*list(bot.sessions._reflection_tasks), return_exceptions=True)
        forget_channel(channel)
        forget_channel(archived_channel)
