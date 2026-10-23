"""Coverage for src/web/api/sessions_chat.py (RFC-006 P11, safe tier-1).

Chat/execute routes (through the `process_web_chat` seam — patched, never a real
LLM call) plus the session read/export/delete CRUD with a faked bot.sessions.
SAFE: no LLM, no real session store, no network.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config
from src.search.errors import InvalidSearchQuery, validate_search_query
from src.web.api.sessions_chat import (
    register_agent_trajectories,
    register_chat,
    register_sessions,
    register_trajectories,
)


def _app(*registrars, bot):
    routes = web.RouteTableDef()
    for reg in registrars:
        reg(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app


def _msg(role="user", content="hi", ts=1.0, uid="u", mid=None):
    return SimpleNamespace(role=role, content=content, timestamp=ts, user_id=uid, message_id=mid)


def _session(messages=None, summary=""):
    return SimpleNamespace(messages=messages if messages is not None else [_msg()],
                           estimated_tokens=10, last_active=1.0, created_at=1.0,
                           summary=summary, summary_segments=[], has_summary=bool(summary),
                           last_user_id="u")


def _bot():
    bot = MagicMock()
    bot.api_token_manager = None  # dev mode → admin gate allows
    bot.config = Config(discord={"token": "x"})
    s = bot.sessions
    s.items_snapshot.return_value = [("web:u:session:1", _session([_msg(content="x" * 200)]))]
    s.get_session_token_usage.return_value = {"total": 100}
    s.get_activity_metrics.return_value = {"active": 1}
    s.search_history = AsyncMock(return_value=[{"r": 1}])
    s.get.return_value = _session()
    s.exists.return_value = True
    s.token_budget = 64000
    s.reset_many.return_value = 3
    return bot


_CHAT_OK = {"response": "hello", "tools_used": ["grep"], "is_error": False, "files": []}


class TestChat:
    async def test_validation(self):
        async with TestClient(TestServer(_app(register_chat, bot=_bot()))) as c:
            assert (await c.post("/api/chat", data="bad")).status == 400
            assert (await c.post("/api/chat", json={})).status == 400  # no content
            assert (await c.post("/api/chat", json={"content": "x" * 40000})).status == 400
            assert (await c.post("/api/chat",
                                 json={"content": "hi", "session_id": "bad id!"})).status == 400

    async def test_success_and_error_and_session(self):
        with patch("src.web.api.process_web_chat", new=AsyncMock(return_value=_CHAT_OK)):
            async with TestClient(TestServer(_app(register_chat, bot=_bot()))) as c:
                r = await c.post("/api/chat", json={"content": "hi", "session_id": "s1"})
                assert r.status == 200
                body = await r.json()
                assert body["response"] == "hello" and body["session_id"] == "s1"
        err = {**_CHAT_OK, "is_error": True, "files": [{"name": "f"}]}
        with patch("src.web.api.process_web_chat", new=AsyncMock(return_value=err)):
            async with TestClient(TestServer(_app(register_chat, bot=_bot()))) as c:
                r = await c.post("/api/chat", json={"content": "hi"})
                assert r.status == 502 and (await r.json())["files"]

    async def test_a_question_can_name_its_id_and_the_reply_returns_both(self):
        # #730: a page matches its live question and reply with the stored ones.
        chat = AsyncMock(return_value={**_CHAT_OK, "question_id": "q-1", "reply_id": "w01"})
        with patch("src.web.api.process_web_chat", new=chat):
            async with TestClient(TestServer(_app(register_chat, bot=_bot()))) as c:
                r = await c.post("/api/chat", json={"content": "hi", "message_id": "q-1"})
                body = await r.json()
                assert (body["question_id"], body["reply_id"]) == ("q-1", "w01")
                assert chat.await_args.kwargs["message_id"] == "q-1"
                for bad in ("", "a b", "x" * 65, "abc\n", 7, ["q"]):
                    r = await c.post("/api/chat", json={"content": "hi", "message_id": bad})
                    assert r.status == 400 and "message_id" in (await r.json())["error"]
                assert chat.await_count == 1  # nothing ran for an invalid id
                await c.post("/api/chat", json={"content": "hi", "message_id": None})
                assert "message_id" not in chat.await_args.kwargs

    async def test_a_reused_message_id_is_a_conflict(self):
        from src.web.chat import ChatMessageIdError

        chat = AsyncMock(side_effect=ChatMessageIdError("message_id is already used in this chat"))
        with patch("src.web.api.process_web_chat", new=chat):
            async with TestClient(TestServer(_app(register_chat, bot=_bot()))) as c:
                r = await c.post("/api/chat", json={"content": "hi", "message_id": "q-1"})
                assert r.status == 409
                assert (await r.json())["error"] == "message_id is already used in this chat"

    async def test_a_stored_error_turn_keeps_its_ids_and_files_on_502(self):
        err = {**_CHAT_OK, "is_error": True, "files": [{"name": "f"}],
               "question_id": "q-1", "reply_id": "w01"}
        with patch("src.web.api.process_web_chat", new=AsyncMock(return_value=err)):
            async with TestClient(TestServer(_app(register_chat, bot=_bot()))) as c:
                r = await c.post("/api/chat", json={"content": "hi", "message_id": "q-1"})
                body = await r.json()
                assert r.status == 502 and body["files"] and body["reply_id"] == "w01"
        removed = {**_CHAT_OK, "is_error": True}  # nothing stored: no ids
        with patch("src.web.api.process_web_chat", new=AsyncMock(return_value=removed)):
            async with TestClient(TestServer(_app(register_chat, bot=_bot()))) as c:
                body = await (await c.post("/api/chat", json={"content": "hi"})).json()
                assert "question_id" not in body and "reply_id" not in body

    async def test_escaping_exception_never_leaks_its_text(self):
        # An unexpected exception escaping the route becomes aiohttp's
        # generic 500 — never a detailed body. Pins that an HTML-bearing
        # exception (the 2026-07-16 incident class) cannot leak through
        # the REST surface either.
        html = "<html><body>Internal Server Error<script>cf()</script></body></html>"
        with patch("src.web.api.process_web_chat",
                   new=AsyncMock(side_effect=RuntimeError(html))):
            async with TestClient(TestServer(_app(register_chat, bot=_bot()))) as c:
                r = await c.post("/api/chat", json={"content": "hi"})
                assert r.status == 500
                body = await r.text()
                assert "<html" not in body
                assert "cf()" not in body


class TestExecute:
    async def test_validation_and_success(self):
        with patch("src.web.api.process_web_chat", new=AsyncMock(return_value=_CHAT_OK)):
            async with TestClient(TestServer(_app(register_chat, bot=_bot()))) as c:
                assert (await c.post("/api/execute", data="bad")).status == 400
                assert (await c.post("/api/execute", json={})).status == 400  # no prompt
                assert (await c.post("/api/execute",
                                     json={"prompt": "x" * 40000})).status == 400
                r = await c.post("/api/execute", json={"prompt": "do it"})
                assert r.status == 200 and (await r.json())["source"] == "web_api"


class TestSessionsCrud:
    async def test_list_and_stats_and_search(self):
        async with TestClient(TestServer(_app(register_sessions, bot=_bot()))) as c:
            listed = await (await c.get("/api/sessions")).json()
            assert listed[0]["channel_id"] == "web:u:session:1"
            assert listed[0]["preview"][0]["content"].endswith("...")  # long msg truncated
            assert (await (await c.get("/api/sessions/token-usage")).json())["total"] == 100
            assert (await (await c.get("/api/sessions/activity")).json())["active"] == 1
            assert (await c.get("/api/sessions/search")).status == 400  # no q
            s = await (await c.get("/api/sessions/search?q=hi&after=1&before=2")).json()
            assert s["count"] == 1

    async def test_list_labels_identity_keyed_api_chats_by_recorded_origin(self):
        # An /api/chat conversation without session_id is keyed by the
        # caller's identity; only the recorded origin can label it.
        bot = _bot()
        api_chat = _session()
        api_chat.source = "web"
        legacy_api_chat = _session()  # older session: no recorded origin
        legacy_api_chat.source = None
        discord_chat = _session()
        discord_chat.source = None
        bot.sessions.items_snapshot.return_value = [
            ("claude-api-2", api_chat),
            ("web:u:session:1", legacy_api_chat),
            ("123456789012345678", discord_chat),
        ]
        async with TestClient(TestServer(_app(register_sessions, bot=bot))) as c:
            listed = await (await c.get("/api/sessions")).json()
        sources = {s["channel_id"]: s["source"] for s in listed}
        assert sources == {
            "claude-api-2": "web", "web:u:session:1": "web", "123456789012345678": "discord",
        }

    async def test_surrogate_query_is_400_at_route_boundary(self):
        bot = _bot()

        async def search_with_real_validation(query, **_kwargs):
            validate_search_query(query)
            return []

        bot.sessions.search_history = AsyncMock(side_effect=search_with_real_validation)
        routes = web.RouteTableDef()
        register_sessions(routes, bot)
        handler = next(
            route.handler for route in routes if route.handler.__name__ == "search_sessions"
        )
        response = await handler(SimpleNamespace(query={"q": "\ud800"}))
        assert response.status == 400
        assert response.text == '{"error": "invalid query"}'

    async def test_search_invalid_query_and_failure_are_distinct(self):
        bot = _bot()
        bot.sessions.search_history = AsyncMock(
            side_effect=InvalidSearchQuery("invalid query")
        )
        async with TestClient(TestServer(_app(register_sessions, bot=bot))) as c:
            r = await c.get("/api/sessions/search?q=bad")
            assert r.status == 400
            assert (await r.json()) == {"error": "invalid query"}

        bot.sessions.search_history = AsyncMock(side_effect=RuntimeError("database failure"))
        async with TestClient(TestServer(_app(register_sessions, bot=bot))) as c:
            r = await c.get("/api/sessions/search?q=valid")
            assert r.status == 500
            assert (await r.json()) == {"error": "search failed"}

    async def test_get_export_delete(self):
        bot = _bot()
        bot.sessions.get.return_value = _session(summary="a running summary")
        async with TestClient(TestServer(_app(register_sessions, bot=bot))) as c:
            body = await (await c.get("/api/sessions/web:u:session:1")).json()
            assert body["token_budget"] == 64000 and len(body["messages"]) == 1
            assert body["messages"][0]["message_id"] is None  # a record stored without one
            bot.sessions.get.return_value = _session([_msg(mid="q-1")])
            body = await (await c.get("/api/sessions/web:u:session:1")).json()
            assert body["messages"][0]["message_id"] == "q-1"
            bot.sessions.get.return_value = _session(summary="a running summary")
            # export json + text (text includes the summary header)
            assert (await c.get("/api/sessions/c1/export")).status == 200
            txt = await c.get("/api/sessions/c1/export?format=text")
            text_body = await txt.text()
            assert txt.status == 200 and "MESSAGES" in text_body.upper()
            assert "running summary" in text_body
            assert (await c.delete("/api/sessions/c1")).status == 200
            bot.sessions.get.return_value = None
            assert (await c.get("/api/sessions/gone")).status == 404
            bot.sessions.exists.return_value = False
            assert (await c.delete("/api/sessions/gone")).status == 404

    async def test_export_includes_every_summary_segment(self):
        # The first compaction folds the legacy summary into segments; an
        # export must carry all of them (the prompt shows only five).
        segments = [
            {"id": f"s{i}", "summary": f"segment {i} text", "start_ts": 1_700_000_000 + i,
             "end_ts": 1_700_000_100 + i}
            for i in range(7)
        ]
        session = _session(summary="")
        session.summary_segments = segments
        bot = _bot()
        bot.sessions.get.return_value = session
        async with TestClient(TestServer(_app(register_sessions, bot=bot))) as c:
            data = await (await c.get("/api/sessions/c1/export")).json()
            assert data["summary"] == "" and data["summary_segments"] == segments
            text_body = await (await c.get("/api/sessions/c1/export?format=text")).text()
            assert all(f"segment {i} text" in text_body for i in range(7))
            assert text_body.index("segment 0 text") < text_body.index("segment 6 text")

    async def test_clear_bulk(self):
        async with TestClient(TestServer(_app(register_sessions, bot=_bot()))) as c:
            assert (await c.post("/api/sessions/clear-bulk", data="bad")).status == 400
            empty = await c.post("/api/sessions/clear-bulk", json={"channel_ids": []})
            assert empty.status == 400
            r = await c.post("/api/sessions/clear-bulk", json={"channel_ids": ["a", "b", "c"]})
            assert r.status == 200 and (await r.json())["count"] == 3

    async def test_non_admin_access(self):
        # inject a non-admin identity via an app middleware, exercising the
        # own-session filter / access-denied branches
        bot = _bot()
        ident = SimpleNamespace(tier="user", user_id="alice", username="A", allowed_tools=None)

        @web.middleware
        async def _inject(request, handler):
            # the handlers read the attribute form via getattr(request, "_api_identity")
            request._api_identity = ident  # type: ignore[attr-defined]
            return await handler(request)

        routes = web.RouteTableDef()
        register_sessions(routes, bot)
        app = web.Application(middlewares=[_inject])
        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as c:
            # own session (alice) not in snapshot → filtered out → empty list
            assert await (await c.get("/api/sessions")).json() == []
            # accessing someone else's session → 403
            assert (await c.get("/api/sessions/web:bob:session:1")).status == 403


def _saver(tmp_path, count=2):
    s = MagicMock()
    s.directory = tmp_path
    s.count = count
    s.list_files = AsyncMock(return_value=["a.jsonl"])
    s.read_file = AsyncMock(return_value=[{"e": 1}])
    s.find_by_message_id = AsyncMock(return_value={"m": 1})
    s.find_by_agent_id = AsyncMock(return_value={"a": 1})
    s.search = AsyncMock(return_value=[{"r": 1}])
    return s


class TestTrajectories:
    async def test_all(self, tmp_path):
        bot = _bot()
        bot.trajectory_saver = _saver(tmp_path)
        async with TestClient(TestServer(_app(register_trajectories, bot=bot))) as c:
            assert (await (await c.get("/api/trajectories")).json())["count"] == 2
            assert (await (await c.get("/api/trajectories/a.jsonl")).json())["count"] == 1
            assert (await c.get("/api/trajectories/bad.txt")).status == 400  # bad ext
            assert (await c.get("/api/trajectories/..%2Fx.jsonl")).status == 400  # traversal
            assert (await (await c.get(
                "/api/trajectories/message/m1")).json())["entry"]["m"] == 1
            assert (await (await c.get(
                "/api/trajectories/search/query?errors_only=1")).json())["count"] == 1
            bot.trajectory_saver.find_by_message_id = AsyncMock(return_value=None)
            assert (await c.get("/api/trajectories/message/gone")).status == 404

    async def test_unavailable_503(self):
        bot = _bot()
        bot.trajectory_saver = None
        async with TestClient(TestServer(_app(register_trajectories, bot=bot))) as c:
            assert (await c.get("/api/trajectories")).status == 503
            assert (await c.get("/api/trajectories/a.jsonl")).status == 503
            assert (await c.get("/api/trajectories/message/m")).status == 503
            assert (await c.get("/api/trajectories/search/query")).status == 503


class TestAgentTrajectories:
    async def test_all(self, tmp_path):
        bot = _bot()
        bot.agent_trajectory_saver = _saver(tmp_path)
        async with TestClient(TestServer(_app(register_agent_trajectories, bot=bot))) as c:
            assert (await (await c.get("/api/agent-trajectories")).json())["count"] == 2
            assert (await (await c.get(
                "/api/agent-trajectories/agent/ag1")).json())["entry"]["a"] == 1
            assert (await (await c.get(
                "/api/agent-trajectories/search/query")).json())["count"] == 1
            assert (await (await c.get("/api/agent-trajectories/a.jsonl")).json())["count"] == 1
            assert (await c.get("/api/agent-trajectories/bad.txt")).status == 400
            bot.agent_trajectory_saver.find_by_agent_id = AsyncMock(return_value=None)
            assert (await c.get("/api/agent-trajectories/agent/gone")).status == 404

    async def test_unavailable_503(self):
        bot = _bot()
        bot.agent_trajectory_saver = None
        async with TestClient(TestServer(_app(register_agent_trajectories, bot=bot))) as c:
            assert (await c.get("/api/agent-trajectories")).status == 503
            assert (await c.get("/api/agent-trajectories/agent/a")).status == 503
            assert (await c.get("/api/agent-trajectories/search/query")).status == 503
            assert (await c.get("/api/agent-trajectories/a.jsonl")).status == 503
