"""POST /api/chat/steer: steering a running chat turn over the API.

Route tests drive the real ChannelStateRegistry. The end-to-end test runs a
real web turn (``process_web_chat`` through the tool loop) with a scripted
model and steers it through the HTTP route while its first generation is held.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config
from src.discord.channel_state import (
    STEER_MESSAGE_MAX_CHARS,
    STEER_MESSAGES_PER_TURN,
    ChannelStateRegistry,
    ChatTurnInbox,
)
from src.discord.steer_notifications import notify_steer
from src.web.api.sessions_chat import register_chat
from src.web.chat import process_web_chat
from tests.characterization.test_chat_tool_loop import build
from tests.fakes import text_response

CALLER = "claude-test"


def _identity(user_id=CALLER, tier="admin"):
    return SimpleNamespace(user_id=user_id, username=user_id, tier=tier,
                           allowed_tools=None, allowed_hosts=None, default_host="")


def _app(bot, identity):
    @web.middleware
    async def authenticate(request, handler):
        request._api_identity = identity
        return await handler(request)

    routes = web.RouteTableDef()
    register_chat(routes, bot)
    app = web.Application(middlewares=[authenticate])
    app.router.add_routes(routes)
    return app


def _route_bot():
    registry = ChannelStateRegistry()
    # A configured token: the admin gate fails closed for non-admin callers.
    config = Config(discord={"token": "x"}, web={"api_token": "configured"})
    return SimpleNamespace(channel_state=registry, config=config, api_token_manager=None)


def _running_turn(registry, channel_id, requester, request_id="req-1"):
    registry.set_active_request(channel_id, request_id)
    inbox = ChatTurnInbox(requester_id=requester)
    registry.bind_steer_inbox(channel_id, request_id, inbox)
    return inbox


async def _steer(bot, payload, identity=None):
    async with TestClient(TestServer(_app(bot, identity or _identity()))) as client:
        response = await client.post("/api/chat/steer", json=payload)
        return response.status, await response.json()


async def test_queues_into_the_callers_own_running_turn():
    bot = _route_bot()
    inbox = _running_turn(bot.channel_state, CALLER, CALLER)
    status, body = await _steer(bot, {"content": "Use the corrected plan"})
    assert status == 202
    assert body == {"status": "queued", "sequence": 1,
                    "message": "Message queued (sequence 1; not yet consumed)."}
    item = inbox.inbox.get_nowait()
    assert item == {"sequence": 1, "text": "Use the corrected plan", "user_id": CALLER}
    assert inbox.event.is_set()


async def test_session_id_selects_that_conversation():
    bot = _route_bot()
    inbox = _running_turn(bot.channel_state, f"web:{CALLER}:session:s1", CALLER)
    status, body = await _steer(bot, {"content": "Narrow it to the logs", "session_id": "s1"})
    assert (status, body["sequence"]) == (202, 1)
    assert inbox.inbox.qsize() == 1
    # The identity's default conversation has no running turn.
    status, body = await _steer(bot, {"content": "Narrow it to the logs"})
    assert (status, body["status"]) == (409, "no_turn")
    assert inbox.inbox.qsize() == 1


async def test_another_identitys_turn_is_out_of_reach():
    bot = _route_bot()
    inbox = _running_turn(bot.channel_state, "alice", "alice")
    bob = _identity("bob", tier="user")
    status, body = await _steer(bot, {"content": "Stop and report"}, bob)
    assert (status, body["status"]) == (409, "no_turn")
    status, body = await _steer(bot, {"content": "Stop and report", "channel_id": "alice"}, bob)
    assert (status, body) == (403, {"error": "admin access required"})
    assert inbox.inbox.empty()


async def test_admin_names_any_running_turn_including_a_discord_one():
    bot = _route_bot()
    inbox = _running_turn(bot.channel_state, "123456789", "987654321")
    status, body = await _steer(bot, {"content": "Check the second host too",
                                      "channel_id": "123456789"})
    assert (status, body["sequence"]) == (202, 1)
    assert inbox.inbox.get_nowait()["user_id"] == CALLER
    status, body = await _steer(bot, {"content": "x", "channel_id": "123456789",
                                      "session_id": "s1"})
    assert status == 400


@pytest.mark.parametrize("prepare,content,expected", [
    (None, "   ", (400, "empty", "Message cannot be empty.")),
    (None, "x" * (STEER_MESSAGE_MAX_CHARS + 1),
     (400, "too_long", f"Steering messages must be at most {STEER_MESSAGE_MAX_CHARS} characters.")),
    ("limit", "One more", (409, "limit",
                           "This turn's steering limit has been reached; message was not queued.")),
    ("stopping", "One more", (409, "stopping",
                              "The current task is stopping; steering was not queued.")),
    ("finished", "One more", (409, "no_turn",
                              "No running chat turn accepting steering in this channel.")),
])
async def test_refusals_match_discord_steer(prepare, content, expected):
    bot = _route_bot()
    registry = bot.channel_state
    inbox = _running_turn(registry, CALLER, CALLER)
    if prepare == "limit":
        inbox.inbox_sequence = STEER_MESSAGES_PER_TURN
    elif prepare == "stopping":
        registry.cancel_events[CALLER].set()
    elif prepare == "finished":
        registry.close_steer_inbox(CALLER, "req-1")
    status, body = await _steer(bot, {"content": content})
    assert (status, body["status"], body["error"]) == expected
    assert inbox.inbox.empty()


async def test_credentials_are_refused_without_echo():
    bot = _route_bot()
    inbox = _running_turn(bot.channel_state, CALLER, CALLER)
    status, body = await _steer(bot, {"content": "use password: correcthorse"})
    assert status == 400
    assert "correcthorse" not in body["error"]
    assert inbox.inbox.empty()


@pytest.mark.parametrize("payload", [
    {},
    {"content": 7},
    {"content": "x", "wait_seconds": -1},
    {"content": "x", "wait_seconds": 61},
    {"content": "x", "wait_seconds": "5"},
    {"content": "x", "wait_seconds": True},
    {"content": "x", "session_id": "bad id!"},
    {"content": "x", "channel_id": " "},
])
async def test_invalid_requests(payload):
    bot = _route_bot()
    inbox = _running_turn(bot.channel_state, CALLER, CALLER)
    status, _ = await _steer(bot, payload)
    assert status == 400
    assert inbox.inbox.empty()


async def test_non_object_json_is_refused():
    bot = _route_bot()
    async with TestClient(TestServer(_app(bot, _identity()))) as client:
        assert (await client.post("/api/chat/steer", data="not json")).status == 400
        assert (await client.post("/api/chat/steer", json=["content"])).status == 400


async def _steer_and_settle(settle, wait_seconds=5):
    bot = _route_bot()
    inbox = _running_turn(bot.channel_state, CALLER, CALLER)
    async with TestClient(TestServer(_app(bot, _identity()))) as client:
        request = asyncio.create_task(client.post(
            "/api/chat/steer", json={"content": "Use the corrected plan",
                                     "wait_seconds": wait_seconds}))
        for _ in range(500):
            if inbox.inbox.qsize():
                break
            await asyncio.sleep(0.01)
        settle(bot.channel_state, inbox)
        response = await asyncio.wait_for(request, 10)
        return response.status, await response.json()


async def test_wait_reports_consumption():
    def consume(registry, inbox):
        notify_steer(inbox.inbox.get_nowait(), "consumed")

    assert await _steer_and_settle(consume) == (200, {
        "status": "consumed", "sequence": 1, "message": "Message consumed (sequence 1).",
    })


async def test_wait_reports_a_turn_that_ended_first():
    def close(registry, inbox):
        registry.close_steer_inbox(CALLER, "req-1")

    assert await _steer_and_settle(close) == (200, {
        "status": "not_consumed", "sequence": 1,
        "message": "Turn ended without consuming this message (sequence 1).",
    })


async def test_wait_returns_queued_when_nothing_settles_in_time():
    status, body = await _steer_and_settle(lambda registry, inbox: None, wait_seconds=0.2)
    assert (status, body["status"], body["sequence"]) == (202, "queued", 1)


async def test_a_real_web_turn_takes_the_steer(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    bot, fake = build([text_response("Draft answer."), text_response("Corrected answer.")])
    entered, release = asyncio.Event(), asyncio.Event()
    original = fake.chat_with_tools
    calls = 0

    async def held_first_generation(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            entered.set()
            await release.wait()
        return await original(*args, **kwargs)

    monkeypatch.setattr(fake, "chat_with_tools", held_first_generation)
    turn = asyncio.create_task(process_web_chat(
        bot, "Summarize the deploy notes", CALLER, user_id=CALLER, username=CALLER,
        persist_channel_lock=False,
    ))
    await asyncio.wait_for(entered.wait(), 5)
    async with TestClient(TestServer(_app(bot, _identity(tier="user")))) as client:
        steer = asyncio.create_task(client.post("/api/chat/steer", json={
            "content": "Only the database section", "wait_seconds": 10}))
        for _ in range(500):
            if bot.channel_state._steer_inboxes and next(
                    iter(bot.channel_state._steer_inboxes.values())).inbox.qsize():
                break
            await asyncio.sleep(0.01)
        release.set()
        result = await asyncio.wait_for(turn, 10)
        response = await asyncio.wait_for(steer, 10)
        assert response.status == 200
        assert (await response.json())["status"] == "consumed"
    assert result["response"] == "Corrected answer."
    assert result["is_error"] is False
    directives = [m for m in fake.messages_of_call(1) if m.get("provenance") == "human_steer"]
    assert [d["content"] for d in directives] == [
        f"[Human steering from user {CALLER}] Only the database section"
    ]
