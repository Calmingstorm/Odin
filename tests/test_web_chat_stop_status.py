"""WebUI Chat controls (#744): POST /api/chat/stop, corrections bound to the page's
question, their owner receipts, and the running turn's tool status."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config
from src.discord.channel_state import ChannelStateRegistry, ChatTurnInbox
from src.discord.steer_notifications import finish_steer_notifications
from src.web import chat as web_chat
from src.web.api.sessions_chat import register_chat
from src.web.chat import INVALID_MESSAGE_ID, WebTurn, steer_authority
from src.web.websocket import WebSocketManager

OWNER = "page-owner"
DISCORD_CHANNEL = "123456789012345678"


def _identity(user_id=OWNER, tier="user", tools=None):
    return SimpleNamespace(user_id=user_id, username=user_id, tier=tier, allowed_tools=tools,
                           allowed_hosts=None, default_host="")


def _authority(identity):
    return steer_authority(identity.tier, identity.allowed_tools or None, None, "")


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


def _bot():
    pushes: list = []
    return SimpleNamespace(
        channel_state=ChannelStateRegistry(),
        # A configured token: the admin gate fails closed for non-admin callers.
        config=Config(discord={"token": "x"}, web={"api_token": "configured"}),
        api_token_manager=None,
        health_server=SimpleNamespace(
            publish_owner_message=lambda owner, payload: pushes.append((owner, payload))),
        pushes=pushes,
    )


@pytest.fixture(autouse=True)
def _no_web_turns():
    web_chat._WEB_TURNS.clear()
    yield
    web_chat._WEB_TURNS.clear()


def _web_turn(bot, *, question="q-1", request_id="101", identity=None, active=True):
    identity = identity or _identity()
    turn = WebTurn(OWNER, question, request_id, identity.user_id, _authority(identity))
    web_chat._WEB_TURNS[OWNER] = turn
    if active:
        bot.channel_state.set_active_request(OWNER, request_id)
        bot.channel_state.bind_steer_inbox(OWNER, request_id, ChatTurnInbox(
            requester_id=identity.user_id, requester_authority=_authority(identity)))
    return turn


async def _post(bot, path, payload, identity=None):
    async with TestClient(TestServer(_app(bot, identity or _identity()))) as client:
        response = await client.post(path, json=payload)
        return response.status, await response.json()


class TestStop:
    async def test_it_stops_the_callers_running_web_turn(self):
        bot = _bot()
        _web_turn(bot)
        status, body = await _post(bot, "/api/chat/stop", {"message_id": "q-1", "wait_seconds": 0})
        assert (status, body["status"]) == (202, "stop_requested")
        assert bot.channel_state.is_cancelled(OWNER)

    async def test_the_owner_is_told_how_it_settled(self):
        bot = _bot()
        _web_turn(bot)
        await _post(bot, "/api/chat/stop", {"message_id": "q-1", "wait_seconds": 0})
        bot.channel_state.finish_stop(OWNER, "101", "Task stopped by user.")
        await asyncio.sleep(0)
        assert bot.pushes == [(OWNER, {"type": "chat_control", "kind": "stop",
                                       "channel_id": OWNER, "question_id": "q-1",
                                       "status": "stopped"})]

    @pytest.mark.parametrize("ending,expected", [("stopped", "stopped"), ("finished", "finished")])
    async def test_a_wait_returns_the_settled_state(self, ending, expected):
        bot = _bot()
        _web_turn(bot)
        async with TestClient(TestServer(_app(bot, _identity()))) as client:
            request = asyncio.create_task(client.post(
                "/api/chat/stop", json={"message_id": "q-1", "wait_seconds": 5}))
            await asyncio.sleep(0.1)
            if ending == "stopped":
                bot.channel_state.finish_stop(OWNER, "101", "Task stopped by user.")
            else:
                bot.channel_state.clear_active_request(OWNER, "101")
            response = await request
            assert response.status == 200
            assert (await response.json())["status"] == expected
        assert bot.pushes[-1][1]["status"] == expected

    async def test_a_request_that_stops_waiting_leaves_the_turns_waiter_alone(self):
        bot = _bot()
        _web_turn(bot)
        status, _ = await _post(bot, "/api/chat/stop", {"message_id": "q-1", "wait_seconds": 0.05})
        assert status == 202
        waiter = bot.channel_state._stop_waiters[(OWNER, "101")]
        assert not waiter.done()
        bot.channel_state.finish_stop(OWNER, "101", "Task stopped by user.")
        assert waiter.result().confirmed

    async def test_no_running_turn(self):
        status, body = await _post(_bot(), "/api/chat/stop", {})
        assert (status, body["status"]) == (409, "no_turn")

    async def test_a_stale_question_never_stops_the_next_turn(self):
        bot = _bot()
        _web_turn(bot, question="q-2", request_id="102")
        status, body = await _post(bot, "/api/chat/stop", {"message_id": "q-1"})
        assert (status, body["status"]) == (409, "stale")
        assert not bot.channel_state.is_cancelled(OWNER)

    async def test_a_turn_still_starting_is_not_stopped(self):
        bot = _bot()
        _web_turn(bot, active=False)
        status, body = await _post(bot, "/api/chat/stop", {"message_id": "q-1"})
        assert (status, body["status"]) == (409, "not_started")
        status, body = await _post(bot, "/api/chat/stop", {})
        assert (status, body["status"]) == (409, "no_turn")

    async def test_a_narrower_credential_of_the_same_user_is_refused(self):
        bot = _bot()
        _web_turn(bot, identity=_identity(tools=["run_command"]))
        status, body = await _post(bot, "/api/chat/stop", {"message_id": "q-1"},
                                   _identity(tools=["read_file"]))
        assert (status, body["status"]) == (403, "denied")
        assert not bot.channel_state.is_cancelled(OWNER)

    async def test_only_an_admin_names_another_channel(self):
        bot = _bot()
        bot.channel_state.set_active_request(DISCORD_CHANNEL, "discord-req")
        status, body = await _post(bot, "/api/chat/stop", {"channel_id": DISCORD_CHANNEL})
        assert (status, body) == (403, {"error": "admin access required"})
        admin = _identity("operator", tier="admin")
        status, body = await _post(bot, "/api/chat/stop",
                                   {"channel_id": DISCORD_CHANNEL, "wait_seconds": 0}, admin)
        assert (status, body["status"]) == (202, "stop_requested")
        assert bot.channel_state.is_cancelled(DISCORD_CHANNEL)

    @pytest.mark.parametrize("payload", [{"wait_seconds": 61}, {"wait_seconds": True},
                                         {"message_id": "not valid!"}])
    async def test_bad_requests(self, payload):
        bot = _bot()
        _web_turn(bot)
        status, _ = await _post(bot, "/api/chat/stop", payload)
        assert status == 400
        assert not bot.channel_state.is_cancelled(OWNER)


    async def test_a_body_that_is_not_a_json_object_is_refused(self):
        bot = _bot()
        _web_turn(bot)
        async with TestClient(TestServer(_app(bot, _identity()))) as client:
            for body in (b"{not json", b"[1, 2]"):
                response = await client.post("/api/chat/stop", data=body,
                                             headers={"Content-Type": "application/json"})
                assert response.status == 400
                assert await response.json() == {"error": "invalid JSON"}
        assert not bot.channel_state.is_cancelled(OWNER)

    async def test_an_admin_stop_where_nothing_runs_finds_no_turn(self):
        admin = _identity("operator", tier="admin")
        status, body = await _post(_bot(), "/api/chat/stop",
                                   {"channel_id": DISCORD_CHANNEL, "wait_seconds": 0}, admin)
        assert (status, body["status"]) == (409, "no_turn")

    @pytest.mark.parametrize("ending", ["cancelled", "failed"])
    async def test_a_stop_that_never_settles_sends_no_receipt(self, ending):
        bot = _bot()
        _web_turn(bot)
        await _post(bot, "/api/chat/stop", {"message_id": "q-1", "wait_seconds": 0})
        waiter = bot.channel_state._stop_waiters[(OWNER, "101")]
        if ending == "cancelled":
            waiter.cancel()
        else:
            waiter.set_exception(RuntimeError("the stop never settled"))
        await asyncio.sleep(0)
        assert bot.pushes == []


class TestBoundCorrections:
    async def test_the_owner_is_told_when_a_correction_is_used(self):
        bot = _bot()
        _web_turn(bot)
        status, body = await _post(bot, "/api/chat/steer",
                                   {"content": "check the logs first", "message_id": "q-1"})
        assert (status, body["status"], body["sequence"]) == (202, "queued", 1)
        inbox = bot.channel_state._steer_inboxes[(OWNER, "101")]
        item = inbox.inbox.get_nowait()
        from src.discord.steer_notifications import notify_steer

        notify_steer(item, "consumed")
        await finish_steer_notifications()
        assert bot.pushes == [(OWNER, {"type": "chat_control", "kind": "steer",
                                       "channel_id": OWNER, "question_id": "q-1",
                                       "sequence": 1, "status": "consumed"})]

    async def test_a_correction_naming_an_invalid_question_is_refused(self):
        bot = _bot()
        _web_turn(bot)
        status, body = await _post(bot, "/api/chat/steer",
                                   {"content": "check the logs first", "message_id": "not valid!"})
        assert (status, body) == (400, {"error": INVALID_MESSAGE_ID})
        assert bot.channel_state._steer_inboxes[(OWNER, "101")].inbox.empty()

    async def test_a_correction_the_turn_ended_without_reads_not_consumed(self):
        bot = _bot()
        _web_turn(bot)
        await _post(bot, "/api/chat/steer", {"content": "also check disk", "message_id": "q-1"})
        bot.channel_state.close_steer_inbox(OWNER, "101")
        await finish_steer_notifications()
        assert bot.pushes[-1][1]["status"] == "not_consumed"

    async def test_a_correction_for_a_question_that_ended_is_refused(self):
        bot = _bot()
        _web_turn(bot, question="q-2", request_id="102")
        status, body = await _post(bot, "/api/chat/steer", {"content": "x", "message_id": "q-1"})
        assert (status, body["status"]) == (409, "stale")
        assert bot.channel_state._steer_inboxes[(OWNER, "102")].inbox.empty()


def _event(kind, *, channel_id=OWNER, turn_id="101", call_id="call-1", tool="run_command"):
    return {"type": kind, "action": tool, "tool_name": tool, "channel_id": channel_id,
            "actor": OWNER, "user_id": OWNER, "timestamp": "2026-10-29T12:00:00+00:00",
            "detail": "secret detail", "metadata": {"turn_id": turn_id, "call_id": call_id,
                                                    "tool_input_keys": ["command"]}}


class TestTurnStatus:
    async def test_the_turns_own_calls_reach_its_owner_with_name_and_call_only(self):
        bot = _bot()
        _web_turn(bot)
        manager = WebSocketManager(SimpleNamespace(name="odin"))
        sent: list = []
        manager.queue_owner_message = lambda owner, payload: sent.append((owner, payload))
        await manager.queue_event(_event("tool_start"))
        await manager.queue_event(_event("tool_end"))
        assert sent == [
            (OWNER, {"type": "chat_status", "channel_id": OWNER, "question_id": "q-1",
                     "call_id": "call-1", "tool": "run_command", "phase": "start"}),
            (OWNER, {"type": "chat_status", "channel_id": OWNER, "question_id": "q-1",
                     "call_id": "call-1", "tool": "run_command", "phase": "end"}),
        ]

    @pytest.mark.parametrize("event", [
        _event("tool_start", turn_id="agent-turn"),
        _event("tool_start", channel_id=DISCORD_CHANNEL),
        {**_event("tool_start"), "type": None},
        {**_event("tool_start"), "metadata": "malformed"},
    ])
    async def test_other_calls_and_records_are_not_this_turns_status(self, event):
        bot = _bot()
        _web_turn(bot)
        manager = WebSocketManager(SimpleNamespace(name="odin"))
        sent: list = []
        manager.queue_owner_message = lambda owner, payload: sent.append((owner, payload))
        await manager.queue_event(event)
        assert sent == []

    async def test_no_web_turn_no_status(self):
        manager = WebSocketManager(SimpleNamespace(name="odin"))
        sent: list = []
        manager.queue_owner_message = lambda owner, payload: sent.append((owner, payload))
        await manager.queue_event(_event("tool_start"))
        assert sent == []


def _chat_bot(run):
    from unittest.mock import AsyncMock, MagicMock

    bot = MagicMock()
    bot.sessions.get_task_history = AsyncMock(return_value=[])
    bot.llm_gateway.active_client = MagicMock()
    bot.prompt_builder.build_full_prompt = MagicMock(return_value="system prompt")
    bot.delivery.set_status = AsyncMock()
    bot.turn_recorder._new_context_trace = MagicMock(return_value=None)
    bot.tool_loop.run = AsyncMock(side_effect=run)
    return bot


class TestTurnBinding:
    async def test_a_turn_is_bound_to_its_question_only_while_it_runs(self):
        seen = {}

        async def run(message, history, **kwargs):
            seen["turn"], seen["request"] = web_chat.web_turn("ch-1"), str(message.id)
            return ("done", False, False, [], False)

        result = await web_chat.process_web_chat(
            _chat_bot(run), "hello", "ch-1", user_id="u1", message_id="q-9")
        turn = seen["turn"]
        assert (turn.question_id, turn.request_id, turn.owner_id) == ("q-9", seen["request"], "u1")
        assert turn.authority == steer_authority(None, None, None, "")
        assert result["question_id"] == "q-9"
        assert web_chat.web_turn("ch-1") is None

    async def test_a_failed_turn_is_unbound_too(self):
        async def run(message, history, **kwargs):
            raise RuntimeError("model unavailable")

        result = await web_chat.process_web_chat(_chat_bot(run), "hello", "ch-1", user_id="u1")
        assert result["is_error"] and web_chat.web_turn("ch-1") is None

    async def test_a_stateless_request_is_never_bound(self):
        seen = {}

        async def run(message, history, **kwargs):
            seen["turn"] = web_chat.web_turn("exec-1")
            return ("done", False, False, [], False)

        await web_chat.process_web_chat(_chat_bot(run), "hello", "exec-1", user_id="u1",
                                        ephemeral=True, persist_channel_lock=False)
        assert seen["turn"] is None


class TestStatusFromRealAuditRecords:
    """The router against what the audit producers really write (review R05)."""

    async def _run(self, tmp_path, write):
        from src.audit.logger import AuditLogger
        from src.observability.correlation import reset_turn, set_turn

        bot = _bot()
        _web_turn(bot)
        manager = WebSocketManager(SimpleNamespace(name="odin"))
        sent: list = []
        manager.queue_owner_message = lambda owner, payload: sent.append(payload)
        audit = AuditLogger(str(tmp_path / "audit.jsonl"))
        audit.set_event_callback(manager.queue_event)
        token = set_turn(turn_id="101", source="web", channel_id=OWNER)
        try:
            await write(audit)
        finally:
            reset_turn(token)
        return [(p["call_id"], p["tool"], p["phase"]) for p in sent]

    async def test_a_computer_tools_canonical_execution_ends_its_call(self, tmp_path):
        async def write(audit):
            await audit.log_event(event_type="tool_start", action="computer_observe",
                                  actor=OWNER, channel_id=OWNER, count_as_tool=False,
                                  metadata={"call_id": "c1", "turn_id": "101"})
            await audit.log_execution(
                user_id=OWNER, user_name=OWNER, channel_id=OWNER, tool_name="computer_observe",
                tool_input={}, approved=True, result_summary="observed", execution_time_ms=5,
                attribution={"call_id": "c1", "iteration": 1, "turn_id": "101"},
                event_type="tool_end")

        assert await self._run(tmp_path, write) == [
            ("c1", "computer_observe", "start"), ("c1", "computer_observe", "end")]

    async def test_a_timed_out_calls_terminal_record_ends_it_by_the_turn_context(self, tmp_path):
        async def write(audit):
            await audit.log_event(event_type="tool_start", action="run_command", actor=OWNER,
                                  channel_id=OWNER, count_as_tool=False,
                                  metadata={"call_id": "c2", "turn_id": "101"})
            await audit.log_execution(
                user_id=OWNER, user_name=OWNER, channel_id=OWNER, tool_name="run_command",
                tool_input={}, approved=True, result_summary="timed out", execution_time_ms=9,
                error="timed out", attribution={"call_id": "c2", "iteration": 1},
                event_type="tool_end")

        assert await self._run(tmp_path, write) == [
            ("c2", "run_command", "start"), ("c2", "run_command", "end")]

    async def test_an_agents_calls_and_plain_executions_are_not_the_turns(self, tmp_path):
        async def write(audit):
            await audit.log_event(event_type="loop_tool_start", action="read_file", actor=OWNER,
                                  channel_id=OWNER, count_as_tool=False,
                                  attribution={"call_id": "a1", "originating_turn_id": "101"})
            await audit.log_execution(
                user_id=OWNER, user_name=OWNER, channel_id=OWNER, tool_name="read_file",
                tool_input={}, approved=True, result_summary="ok", execution_time_ms=1,
                attribution={"call_id": "c3", "iteration": 1, "turn_id": "101"})

        assert await self._run(tmp_path, write) == []
