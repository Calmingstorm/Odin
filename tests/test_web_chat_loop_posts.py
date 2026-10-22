"""Loops started from a WebUI/API chat post into that chat (#706).

A loop keeps the starting turn's virtual channel. Its later posts used to land
in that turn's capture list, which nothing reads after the turn answered, and
a restart answered 404 because a web chat has no Discord channel. Later posts
now go to the chat's stored posts (shown in the chat and read by read_channel,
like Discord channel posts) and to the owner's open pages; they never enter
the model's conversation history.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.discord.native_tools.channel_ops import ChannelOpsTools
from src.sessions.manager import SessionManager
from src.tools.autonomous_loop import LoopManager
from src.web.api.agents_loops import register_loops
from src.web.chat import _WebChannel, detached_web_channel, process_web_chat
from src.web.websocket import WebSocketManager


def _sessions(tmp_path) -> SessionManager:
    return SessionManager(max_history=50, max_age_hours=24, persist_dir=str(tmp_path))


def _bot(tmp_path, *, published):
    bot = MagicMock()
    bot.sessions = _sessions(tmp_path)
    bot.llm_gateway.active_client = MagicMock()
    bot.prompt_builder.build_full_prompt = MagicMock(return_value="system prompt")
    bot.delivery.set_status = AsyncMock()
    bot.turn_recorder._new_context_trace = MagicMock(return_value=None)
    bot.health_server = SimpleNamespace(
        publish_chat_post=lambda owner, payload: published.append((owner, payload)))
    return bot


async def test_a_loop_started_in_a_web_chat_posts_after_the_turn(tmp_path):
    published = []
    bot = _bot(tmp_path, published=published)
    manager = LoopManager()
    release_iteration = asyncio.Event()
    loops = {}

    async def iteration(prompt, channel, prev_context, cancel_event):
        await release_iteration.wait()
        return "LOOP RESULT"

    async def turn(msg, history, **_kwargs):
        # The model calls start_loop during the turn, with the turn's channel.
        loops["id"] = manager.start_loop(
            goal="watch X", channel=msg.channel, requester_id="claude-api-2",
            requester_name="lane", iteration_callback=iteration,
            interval_seconds=60, mode="notify", max_iterations=1)
        return "Started the loop.", False, False, ["start_loop"], False

    bot.tool_loop.run = AsyncMock(side_effect=turn)
    result = await process_web_chat(bot, "watch X", "claude-api-2", user_id="claude-api-2")
    assert result["response"] == "Started the loop."
    release_iteration.set()
    for _ in range(200):
        if manager._loops[loops["id"]].status != "running":
            break
        await asyncio.sleep(0.01)
    session = bot.sessions.get("claude-api-2")
    posts = [post.content for post in session.posts]
    assert posts == ["LOOP RESULT", f"Loop `{loops['id']}` completed after 1 iterations."]
    assert all(post.role == "post" for post in session.posts)
    # The conversation history is exactly the turn: posts stay out of it.
    assert [m.role for m in session.messages] == ["user", "assistant"]
    history = await bot.sessions.get_task_history("claude-api-2", max_messages=50)
    assert not any("LOOP RESULT" in str(message.get("content")) for message in history)
    assert [owner for owner, _ in published] == ["claude-api-2", "claude-api-2"]
    assert published[0][1]["type"] == "chat_post"
    assert published[0][1]["channel_id"] == "claude-api-2"
    assert manager._loops[loops["id"]].web_owner == "claude-api-2"


async def test_during_the_turn_sends_are_still_the_turns_own_output(tmp_path):
    sink = MagicMock()
    channel = _WebChannel("c1", owner_id="u1")
    await channel.send("progress while answering")
    assert channel.captured_messages == ["progress while answering"]
    channel.detach(sink)
    sent = await channel.send("later post")
    sink.assert_called_once_with("later post")
    assert channel.captured_messages == ["progress while answering"]
    await sent.edit(content="ignored")  # a later post is not editable
    assert channel.captured_messages == ["progress while answering"]


async def test_a_later_attachment_is_named_not_lost_silently(tmp_path):
    import io

    sink = MagicMock()
    channel = _WebChannel("c1", owner_id="u1")
    channel.detach(sink)
    await channel.send("report", file=SimpleNamespace(fp=io.BytesIO(b"x"), filename="r.txt"))
    sink.assert_called_once()
    assert sink.call_args.args[0] == "report\n[attachment not delivered to this chat: r.txt]"


async def test_session_api_and_read_channel_show_later_posts(tmp_path):
    from src.web.api.sessions_chat import register_sessions

    sessions = _sessions(tmp_path)
    sessions.add_message("u1", "user", "[u]: start it", user_id="u1", source="web")
    sessions.add_message("u1", "assistant", "Started.")
    sessions.add_post("u1", "iteration 1: all good")
    bot = MagicMock()
    bot.api_token_manager = None
    bot.sessions = sessions
    routes = web.RouteTableDef()
    register_sessions(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        body = await (await client.get("/api/sessions/u1")).json()
    assert [post["content"] for post in body["posts"]] == ["iteration 1: all good"]
    assert len(body["messages"]) == 2

    tools = ChannelOpsTools(sessions=sessions, permissions=MagicMock(), get_channel=lambda c: None)
    message = SimpleNamespace(channel=_WebChannel("u1", owner_id="u1"))
    out = await tools._handle_read_channel(message, {})
    assert "Odin [BOT] (later post): iteration 1: all good" in out
    assert out.index("Started.") < out.index("iteration 1: all good")


async def test_restarting_a_web_loop_posts_into_its_chat_again(tmp_path):
    published = []
    bot = _bot(tmp_path, published=published)
    info = SimpleNamespace(
        goal="watch X", mode="notify", interval_seconds=60, stop_condition=None,
        max_iterations=5, channel_id="web:u1:session:s1", requester_id="u1",
        requester_name="U", status="stopped", web_owner="u1")
    bot.loop_manager._loops = {"L1": info}
    bot.get_channel.side_effect = AssertionError("a web chat has no Discord channel")
    bot.loop_manager.start_loop.return_value = "loop-new"
    routes = web.RouteTableDef()
    register_loops(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/loops/L1/restart")
        assert response.status == 201, await response.text()
    channel = bot.loop_manager.start_loop.call_args.kwargs["channel"]
    assert channel.id == "web:u1:session:s1" and channel.owner_id == "u1"
    await channel.send("after restart")
    assert [p.content for p in bot.sessions.get("web:u1:session:s1").posts] == ["after restart"]
    assert published and published[0][0] == "u1"


async def test_restarted_loop_channel_helper_is_detached(tmp_path):
    bot = _bot(tmp_path, published=[])
    channel = detached_web_channel(bot, "u9", "u9")
    await channel.send("x")
    assert channel.captured_messages == []
    assert [p.content for p in bot.sessions.get("u9").posts] == ["x"]


class _Socket:
    """A hashable stand-in socket (SimpleNamespace is unhashable)."""

    def __init__(self, user_id):
        self._odin_identity = SimpleNamespace(user_id=user_id)
        self.closed = False
        self.send_json = AsyncMock()


async def test_only_the_owners_pages_receive_a_post():
    manager = WebSocketManager(SimpleNamespace(name="odin"))
    manager._policy_authorized = lambda ws: True
    owner, other = _Socket("u1"), _Socket("u2")
    manager._clients.update({owner, other})
    payload = {"type": "chat_post", "channel_id": "u1", "content": "hi"}
    manager.queue_chat_post("u1", payload)
    for _ in range(50):
        if not manager._event_fanouts:
            break
        await asyncio.sleep(0.01)
    owner.send_json.assert_awaited_once_with(payload)
    other.send_json.assert_not_awaited()


@pytest.mark.parametrize("revoked", [True, False])
async def test_a_post_respects_the_chat_policy_fence(revoked):
    manager = WebSocketManager(SimpleNamespace(name="odin"))
    manager._policy_authorized = lambda ws: not revoked
    socket = _Socket("u1")
    manager._clients.add(socket)
    manager.queue_chat_post("u1", {"type": "chat_post"})
    await asyncio.sleep(0.05)
    assert socket.send_json.await_count == (0 if revoked else 1)


# --- Later posts are saved without waiting for a turn (PR #729 review R4) ---

@pytest.fixture
def quick_post_saves(monkeypatch):
    import src.web.chat as chat_module

    monkeypatch.setattr(chat_module, "POST_SAVE_DELAY_SECONDS", 0.01)
    monkeypatch.setattr(chat_module, "POST_SAVE_RETRY_SECONDS", (0.01, 0.01))
    return chat_module


async def test_later_posts_are_saved_without_a_turn(tmp_path, quick_post_saves):
    sessions = _sessions(tmp_path)
    sessions.add_message("c1", "assistant", "Started background work.")
    sessions.save()
    bot = SimpleNamespace(sessions=sessions, health_server=None)
    channel = detached_web_channel(bot, "c1", "u1")
    saves = []
    save = sessions.save
    sessions.save = lambda: (saves.append(1), save())[1]
    for n in range(5):  # a burst shares one write
        await channel.send(f"result {n}")
    await quick_post_saves._post_saver(sessions)._task
    assert len(saves) == 1 and not sessions.is_dirty("c1")
    reloaded = _sessions(tmp_path)
    reloaded.load()
    assert [p.content for p in reloaded.get("c1").posts] == [f"result {n}" for n in range(5)]


async def test_a_post_save_that_fails_is_retried_then_left_for_the_next_save(
    tmp_path, quick_post_saves, monkeypatch, caplog
):
    import src.sessions.manager as session_module

    sessions = _sessions(tmp_path)
    bot = SimpleNamespace(sessions=sessions, health_server=None)
    channel = detached_web_channel(bot, "c1", "u1")
    write = session_module._atomic_json
    failures = {"left": 1}

    def flaky(path, data):
        if failures["left"]:
            failures["left"] -= 1
            raise OSError(28, "No space left on device")
        write(path, data)

    monkeypatch.setattr(session_module, "_atomic_json", flaky)
    await channel.send("result")
    await quick_post_saves._post_saver(sessions)._task
    assert not sessions.is_dirty("c1")  # the retry wrote it

    failures["left"] = 10  # more failures than retries
    await channel.send("second result")
    await quick_post_saves._post_saver(sessions)._task
    assert sessions.is_dirty("c1")  # still owed: the next save writes it
    assert "still unsaved" in caplog.text
    failures["left"] = 0
    sessions.save()
    reloaded = _sessions(tmp_path)
    reloaded.load()
    assert [p.content for p in reloaded.get("c1").posts] == ["result", "second result"]


async def test_the_post_saver_never_keeps_its_session_store_alive(tmp_path, quick_post_saves):
    import gc

    sessions = _sessions(tmp_path)
    saver = quick_post_saves._PostSaver(sessions)
    saver.request("c1")
    del sessions
    gc.collect()
    await saver._task  # nothing to save into any more: it ends


async def test_a_post_saver_fault_is_logged(tmp_path, quick_post_saves, caplog):
    class Store:
        def save(self):
            pass

        def is_dirty(self, _channel_id):
            raise RuntimeError("store closed")

    store = Store()
    saver = quick_post_saves._PostSaver(store)
    saver.request("c1")
    with pytest.raises(RuntimeError):
        await saver._task
    await asyncio.sleep(0)  # done callbacks run
    assert "Later-post save task failed" in caplog.text
