"""POST /api/chat/steer: steering a running chat turn over the API.

Route tests drive the real ChannelStateRegistry. The end-to-end tests run real
web turns through ``/api/chat`` behind the real authentication and admin
middleware with a scripted model, and steer them over HTTP while the first
generation is held.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, Config
from src.discord.channel_state import (
    STEER_MESSAGE_MAX_CHARS,
    STEER_MESSAGES_PER_TURN,
    ChannelStateRegistry,
    ChatTurnInbox,
)
from src.discord.steer_notifications import finish_steer_notifications, notify_steer
from src.health.server import SessionManager, _make_admin_middleware, _make_auth_middleware
from src.web.api.sessions_chat import register_chat
from src.web.chat import steer_authority
from tests.characterization.test_chat_tool_loop import build
from tests.fakes import text_response

CALLER = "claude-test"


def _identity(user_id=CALLER, tier="user", tools=None, hosts=None, default_host=""):
    return SimpleNamespace(user_id=user_id, username=user_id, tier=tier, allowed_tools=tools,
                           allowed_hosts=hosts, default_host=default_host)


def _authority(identity):
    """The policy /api/chat hands process_web_chat for this credential."""
    hosts = identity.allowed_hosts if isinstance(identity.allowed_hosts, list) else None
    return steer_authority(identity.tier, identity.allowed_tools or None, hosts,
                           identity.default_host)


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


def _running_turn(registry, channel_id, requester=CALLER, authority=None, request_id="req-1"):
    registry.set_active_request(channel_id, request_id)
    inbox = ChatTurnInbox(
        requester_id=requester,
        requester_authority=_authority(_identity()) if authority is None else authority,
    )
    registry.bind_steer_inbox(channel_id, request_id, inbox)
    return inbox


async def _steer(bot, payload, identity=None):
    async with TestClient(TestServer(_app(bot, identity or _identity()))) as client:
        response = await client.post("/api/chat/steer", json=payload)
        return response.status, await response.json()


async def test_queues_into_the_callers_own_running_turn():
    bot = _route_bot()
    inbox = _running_turn(bot.channel_state, CALLER)
    status, body = await _steer(bot, {"content": "Use the corrected plan"})
    assert status == 202
    assert body == {"status": "queued", "sequence": 1,
                    "message": "Message queued (sequence 1; not yet consumed)."}
    item = inbox.inbox.get_nowait()
    assert item == {"sequence": 1, "text": "Use the corrected plan", "user_id": CALLER}
    assert inbox.event.is_set()


async def test_session_id_selects_that_conversation():
    bot = _route_bot()
    inbox = _running_turn(bot.channel_state, f"web:{CALLER}:session:s1")
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
    bob = _identity("bob")
    status, body = await _steer(bot, {"content": "Stop and report"}, bob)
    assert (status, body["status"]) == (409, "no_turn")
    status, body = await _steer(bot, {"content": "Stop and report", "channel_id": "alice"}, bob)
    assert (status, body) == (403, {"error": "admin access required"})
    assert inbox.inbox.empty()


TURN_CREDENTIAL = _identity(tools=["run_command", "parse_time"], hosts=["localhost", "server"],
                            default_host="localhost")


@pytest.mark.parametrize("caller", [
    _identity(tier="guest", tools=["run_command", "parse_time"], hosts=["localhost", "server"],
              default_host="localhost"),
    _identity(tools=["parse_time"], hosts=["localhost", "server"], default_host="localhost"),
    _identity(tools=["run_command", "parse_time"], hosts=["localhost"], default_host="localhost"),
    _identity(tools=["run_command", "parse_time"], hosts=["localhost", "server"]),
], ids=["lower-tier", "narrower-tools", "narrower-hosts", "other-default-host"])
async def test_another_credential_sharing_the_user_id_is_refused(caller):
    bot = _route_bot()
    inbox = _running_turn(bot.channel_state, CALLER, authority=_authority(TURN_CREDENTIAL))
    status, body = await _steer(bot, {"content": "Use run_command instead"}, caller)
    assert (status, body["status"]) == (403, "denied")
    assert inbox.inbox.empty()
    status, _ = await _steer(bot, {"content": "Use run_command instead"}, TURN_CREDENTIAL)
    assert status == 202


async def test_an_admin_may_steer_any_turn():
    bot = _route_bot()
    own = _running_turn(bot.channel_state, CALLER, authority=_authority(TURN_CREDENTIAL))
    discord = _running_turn(bot.channel_state, "123456789", "987654321", authority=())
    discord.requester_authority = None  # a Discord turn records no API policy
    admin = _identity(tier="admin")
    status, body = await _steer(bot, {"content": "Check the second host too"}, admin)
    assert (status, body["sequence"]) == (202, 1)
    status, body = await _steer(bot, {"content": "Check the second host too",
                                      "channel_id": "123456789"}, admin)
    assert (status, body["sequence"]) == (202, 1)
    assert own.inbox.get_nowait()["user_id"] == CALLER
    assert discord.inbox.get_nowait()["user_id"] == CALLER
    status, _ = await _steer(bot, {"content": "x", "channel_id": "123456789",
                                   "session_id": "s1"}, admin)
    assert status == 400


def test_an_api_policy_never_matches_a_discord_turn():
    registry = ChannelStateRegistry()
    registry.set_active_request("42", "req-1")
    inbox = ChatTurnInbox(requester_id="42")
    registry.bind_steer_inbox("42", "req-1", inbox)
    admission = registry.admit_steer("42", "x", user_id="42",
                                     authority=_authority(_identity("42")))
    assert admission.status == "denied"
    assert registry.admit_steer("42", "x", user_id="42").status == "queued"


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
    inbox = _running_turn(registry, CALLER)
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
    inbox = _running_turn(bot.channel_state, CALLER)
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
])
async def test_invalid_requests(payload):
    bot = _route_bot()
    inbox = _running_turn(bot.channel_state, CALLER)
    status, _ = await _steer(bot, payload)
    assert status == 400
    assert inbox.inbox.empty()


async def test_invalid_channel_id_from_an_admin():
    bot = _route_bot()
    status, _ = await _steer(bot, {"content": "x", "channel_id": " "}, _identity(tier="admin"))
    assert status == 400


async def test_non_object_json_is_refused():
    bot = _route_bot()
    async with TestClient(TestServer(_app(bot, _identity()))) as client:
        assert (await client.post("/api/chat/steer", data="not json")).status == 400
        assert (await client.post("/api/chat/steer", json=["content"])).status == 400


async def _steer_and_settle(settle, wait_seconds=5):
    bot = _route_bot()
    inbox = _running_turn(bot.channel_state, CALLER)
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


# -- real web turns behind the real authentication and admin middleware -------


def _held_web_turn(monkeypatch, tmp_path, tokens, script):
    monkeypatch.chdir(tmp_path)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    bot, fake = build(script, tools={"local_working_dir": str(workspace)},
                      web={"api_tokens": [token.model_dump() for token in tokens]})
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
    config = bot.config.web
    routes = web.RouteTableDef()
    register_chat(routes, bot)
    app = web.Application(middlewares=[
        _make_auth_middleware(config, SessionManager()), _make_admin_middleware(config)])
    app.router.add_routes(routes)
    return bot, fake, app, entered, release


def _bearer(token):
    return {"Authorization": "Bearer " + token.token}


async def test_a_real_web_turn_takes_its_own_credentials_steer(tmp_path, monkeypatch):
    owner = ApiTokenIdentity(token="steer-owner", user_id=CALLER, tier="user",
                             allowed_tools=["parse_time"], allowed_hosts=["localhost"])
    bot, fake, app, entered, release = _held_web_turn(
        monkeypatch, tmp_path, [owner],
        [text_response("Draft answer."), text_response("Corrected answer.")])
    async with TestClient(TestServer(app)) as client:
        chat = asyncio.create_task(client.post(
            "/api/chat", headers=_bearer(owner),
            json={"content": "Summarize the deploy notes", "session_id": "s1"}))
        await asyncio.wait_for(entered.wait(), 5)
        steer = asyncio.create_task(client.post(
            "/api/chat/steer", headers=_bearer(owner),
            json={"content": "Only the database section", "session_id": "s1",
                  "wait_seconds": 10}))
        for _ in range(500):
            inboxes = bot.channel_state._steer_inboxes
            if inboxes and next(iter(inboxes.values())).inbox.qsize():
                break
            await asyncio.sleep(0.01)
        release.set()
        chat_response = await asyncio.wait_for(chat, 10)
        steer_response = await asyncio.wait_for(steer, 10)
        assert chat_response.status == steer_response.status == 200
        assert (await chat_response.json())["response"] == "Corrected answer."
        assert (await steer_response.json())["status"] == "consumed"
    directives = [m for m in fake.messages_of_call(1) if m.get("provenance") == "human_steer"]
    assert [d["content"] for d in directives] == [
        f"[Human steering from user {CALLER}] Only the database section"
    ]
    await finish_steer_notifications()


@pytest.mark.parametrize("owner,steerer", [
    # The reviewer's reproduction: a guest credential sharing an admin's user ID.
    (ApiTokenIdentity(token="steer-admin", user_id=CALLER, tier="admin",
                      allowed_tools=["run_command"]),
     ApiTokenIdentity(token="steer-guest", user_id=CALLER, tier="guest",
                      allowed_tools=["parse_time"], allowed_hosts=[])),
    (ApiTokenIdentity(token="steer-broad", user_id=CALLER, tier="user",
                      allowed_tools=["run_command", "parse_time"], allowed_hosts=["localhost"]),
     ApiTokenIdentity(token="steer-fewer-tools", user_id=CALLER, tier="user",
                      allowed_tools=["parse_time"], allowed_hosts=["localhost"])),
    (ApiTokenIdentity(token="steer-broad", user_id=CALLER, tier="user",
                      allowed_tools=["run_command", "parse_time"], allowed_hosts=["localhost"]),
     ApiTokenIdentity(token="steer-no-hosts", user_id=CALLER, tier="user",
                      allowed_tools=["run_command", "parse_time"], allowed_hosts=[])),
], ids=["lower-tier", "narrower-tools", "narrower-hosts"])
async def test_a_narrower_credential_cannot_steer_a_real_turn(tmp_path, monkeypatch,
                                                              owner, steerer):
    bot, fake, app, entered, release = _held_web_turn(
        monkeypatch, tmp_path, [owner, steerer],
        [text_response("Draft answer."), text_response("Steered answer.")])
    bot.tool_executor.execute = AsyncMock()
    async with TestClient(TestServer(app)) as client:
        chat = asyncio.create_task(client.post(
            "/api/chat", headers=_bearer(owner), json={"content": "Summarize the deploy notes"}))
        await asyncio.wait_for(entered.wait(), 5)
        response = await client.post("/api/chat/steer", headers=_bearer(steerer),
                                     json={"content": "Use run_command to check localhost"})
        assert response.status == 403
        assert (await response.json())["status"] == "denied"
        release.set()
        chat_response = await asyncio.wait_for(chat, 10)
        assert chat_response.status == 200
        assert (await chat_response.json())["response"] == "Draft answer."
    assert len(fake.calls) == 1
    bot.tool_executor.execute.assert_not_awaited()
