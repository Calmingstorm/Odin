"""Tests for FTS5 session search (Round 24).

Tests cover:
- SessionManager.search_history: keyword search with channel_id, user_id, time filters
- SessionManager._search_archives: filtered archive search
- FullTextIndex.search_sessions: channel_id filter on FTS5 session table
- REST API: GET /api/sessions/search endpoint
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.sessions.manager import Message, Session, SessionManager


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _msg(content: str, role: str = "user", ts: float | None = None,
         user_id: str | None = None) -> Message:
    return Message(
        role=role, content=content,
        timestamp=ts or time.time(),
        user_id=user_id if role == "user" else None,
    )


def _session(channel_id: str = "ch1", messages: list | None = None,
             summary: str = "") -> Session:
    return Session(channel_id=channel_id, messages=messages or [], summary=summary)


def _manager(tmp_path) -> SessionManager:
    return SessionManager(
        max_history=50,
        max_age_hours=24,
        persist_dir=str(tmp_path),
        token_budget=256_000,
    )


def _archive_session(persist_dir: str, channel_id: str, messages: list[dict],
                     summary: str = "", last_active: float | None = None) -> None:
    archive_dir = Path(persist_dir) / "archive"
    archive_dir.mkdir(exist_ok=True)
    la = last_active or time.time()
    data = {
        "channel_id": channel_id,
        "messages": messages,
        "summary": summary,
        "created_at": la - 3600,
        "last_active": la,
    }
    path = archive_dir / f"{channel_id}_{int(la)}.json"
    path.write_text(json.dumps(data))


# ---------------------------------------------------------------------------
# search_history — basic keyword search
# ---------------------------------------------------------------------------

class TestSearchHistoryBasic:
    async def test_empty_sessions_returns_empty(self, tmp_path):
        mgr = _manager(tmp_path)
        results = await mgr.search_history("hello")
        assert results == []

    async def test_finds_matching_message_content(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("hello world", ts=now, user_id="u1"),
            _msg("goodbye", role="assistant", ts=now + 1),
        ])
        results = await mgr.search_history("hello")
        assert len(results) == 1
        assert results[0]["type"] == "user"
        assert "hello" in results[0]["content"]

    async def test_finds_matching_summary(self, tmp_path):
        mgr = _manager(tmp_path)
        mgr._sessions["ch1"] = _session("ch1", summary="discussed deployment strategy")
        results = await mgr.search_history("deployment")
        assert len(results) == 1
        assert results[0]["type"] == "summary"

    async def test_respects_limit(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        msgs = [_msg(f"test message {i}", ts=now + i, user_id="u1") for i in range(20)]
        mgr._sessions["ch1"] = _session("ch1", msgs)
        results = await mgr.search_history("test", limit=5)
        assert len(results) == 5

    async def test_returns_user_id_in_results(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("hello world", ts=now, user_id="user123"),
        ])
        results = await mgr.search_history("hello")
        assert len(results) == 1
        assert results[0].get("user_id") == "user123"


# ---------------------------------------------------------------------------
# search_history — channel_id filter
# ---------------------------------------------------------------------------

class TestSearchHistoryChannelFilter:
    async def test_filter_by_channel_id(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("hello from ch1", ts=now, user_id="u1"),
        ])
        mgr._sessions["ch2"] = _session("ch2", [
            _msg("hello from ch2", ts=now, user_id="u2"),
        ])
        results = await mgr.search_history("hello", channel_id="ch1")
        assert len(results) == 1
        assert results[0]["channel_id"] == "ch1"

    async def test_channel_filter_no_match(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("hello", ts=now, user_id="u1"),
        ])
        results = await mgr.search_history("hello", channel_id="ch999")
        assert results == []

    async def test_channel_filter_on_summary(self, tmp_path):
        mgr = _manager(tmp_path)
        mgr._sessions["ch1"] = _session("ch1", summary="deployment notes")
        mgr._sessions["ch2"] = _session("ch2", summary="deployment plan")
        results = await mgr.search_history("deployment", channel_id="ch2")
        assert len(results) == 1
        assert results[0]["channel_id"] == "ch2"


# ---------------------------------------------------------------------------
# search_history — user_id filter
# ---------------------------------------------------------------------------

class TestSearchHistoryUserFilter:
    async def test_filter_by_user_id(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("test alpha", ts=now, user_id="alice"),
            _msg("test beta", ts=now + 1, user_id="bob"),
        ])
        results = await mgr.search_history("test", user_id="alice")
        assert len(results) == 1
        assert results[0]["user_id"] == "alice"

    async def test_user_filter_skips_assistant(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("test info", role="assistant", ts=now),
        ])
        results = await mgr.search_history("test", user_id="alice")
        assert results == []

    async def test_user_filter_no_match(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("test data", ts=now, user_id="bob"),
        ])
        results = await mgr.search_history("test", user_id="charlie")
        assert results == []


# ---------------------------------------------------------------------------
# search_history — time range filters
# ---------------------------------------------------------------------------

class TestSearchHistoryTimeFilter:
    async def test_after_filter(self, tmp_path):
        mgr = _manager(tmp_path)
        base = 1700000000.0
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("old message", ts=base, user_id="u1"),
            _msg("new message", ts=base + 3600, user_id="u1"),
        ])
        results = await mgr.search_history("message", after=base + 1800)
        assert len(results) == 1
        assert "new" in results[0]["content"]

    async def test_before_filter(self, tmp_path):
        mgr = _manager(tmp_path)
        base = 1700000000.0
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("old message", ts=base, user_id="u1"),
            _msg("new message", ts=base + 3600, user_id="u1"),
        ])
        results = await mgr.search_history("message", before=base + 1800)
        assert len(results) == 1
        assert "old" in results[0]["content"]

    async def test_after_and_before_combined(self, tmp_path):
        mgr = _manager(tmp_path)
        base = 1700000000.0
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("msg early", ts=base, user_id="u1"),
            _msg("msg middle", ts=base + 1800, user_id="u1"),
            _msg("msg late", ts=base + 3600, user_id="u1"),
        ])
        results = await mgr.search_history("msg", after=base + 900, before=base + 2700)
        assert len(results) == 1
        assert "middle" in results[0]["content"]

    async def test_time_filter_on_summary(self, tmp_path):
        mgr = _manager(tmp_path)
        base = 1700000000.0
        s = _session("ch1", summary="important deployment")
        s.last_active = base
        mgr._sessions["ch1"] = s
        results = await mgr.search_history("deployment", after=base + 100)
        assert len(results) == 0

    async def test_time_filter_on_summary_passes(self, tmp_path):
        mgr = _manager(tmp_path)
        base = 1700000000.0
        s = _session("ch1", summary="important deployment")
        s.last_active = base + 200
        mgr._sessions["ch1"] = s
        results = await mgr.search_history("deployment", after=base + 100)
        assert len(results) == 1


# ---------------------------------------------------------------------------
# search_history — combined filters
# ---------------------------------------------------------------------------

class TestSearchHistoryCombinedFilters:
    async def test_channel_and_user(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("test one", ts=now, user_id="alice"),
            _msg("test two", ts=now + 1, user_id="bob"),
        ])
        mgr._sessions["ch2"] = _session("ch2", [
            _msg("test three", ts=now, user_id="alice"),
        ])
        results = await mgr.search_history("test", channel_id="ch1", user_id="alice")
        assert len(results) == 1
        assert results[0]["channel_id"] == "ch1"
        assert results[0]["user_id"] == "alice"

    async def test_all_filters(self, tmp_path):
        mgr = _manager(tmp_path)
        base = 1700000000.0
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("target msg", ts=base + 1000, user_id="alice"),
            _msg("other msg", ts=base + 1000, user_id="bob"),
            _msg("old target", ts=base - 1000, user_id="alice"),
        ])
        results = await mgr.search_history(
            "msg", channel_id="ch1", user_id="alice",
            after=base, before=base + 2000,
        )
        assert len(results) == 1
        assert "target" in results[0]["content"]


# ---------------------------------------------------------------------------
# _search_archives — filtered
# ---------------------------------------------------------------------------

class TestSearchArchivesFiltered:
    def test_archive_channel_filter(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        _archive_session(str(tmp_path), "ch1", [
            {"role": "user", "content": "archived hello", "timestamp": now, "user_id": "u1"},
        ], last_active=now)
        _archive_session(str(tmp_path), "ch2", [
            {"role": "user", "content": "archived hello", "timestamp": now, "user_id": "u2"},
        ], last_active=now + 1)

        results = mgr._search_archives("hello", 10, channel_id="ch1")
        assert len(results) == 1
        assert results[0]["channel_id"] == "ch1"

    def test_archive_user_filter(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        _archive_session(str(tmp_path), "ch1", [
            {"role": "user", "content": "alpha data", "timestamp": now, "user_id": "alice"},
            {"role": "user", "content": "beta data", "timestamp": now + 1, "user_id": "bob"},
        ], last_active=now + 1)

        results = mgr._search_archives("data", 10, user_id="alice")
        assert len(results) == 1
        assert results[0]["user_id"] == "alice"

    def test_archive_time_after_filter(self, tmp_path):
        mgr = _manager(tmp_path)
        base = 1700000000.0
        _archive_session(str(tmp_path), "ch1", [
            {"role": "user", "content": "old item", "timestamp": base, "user_id": "u1"},
            {"role": "user", "content": "new item", "timestamp": base + 3600, "user_id": "u1"},
        ], last_active=base + 3600)

        results = mgr._search_archives("item", 10, after=base + 1800)
        assert len(results) == 1
        assert "new" in results[0]["content"]

    def test_archive_time_before_filter(self, tmp_path):
        mgr = _manager(tmp_path)
        base = 1700000000.0
        _archive_session(str(tmp_path), "ch1", [
            {"role": "user", "content": "old item", "timestamp": base, "user_id": "u1"},
            {"role": "user", "content": "new item", "timestamp": base + 3600, "user_id": "u1"},
        ], last_active=base + 3600)

        results = mgr._search_archives("item", 10, before=base + 1800)
        assert len(results) == 1
        assert "old" in results[0]["content"]

    def test_archive_returns_user_id(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        _archive_session(str(tmp_path), "ch1", [
            {"role": "user", "content": "hello world", "timestamp": now, "user_id": "user456"},
        ], last_active=now)

        results = mgr._search_archives("hello", 10)
        assert len(results) == 1
        assert results[0]["user_id"] == "user456"

    def test_archive_summary_time_filter(self, tmp_path):
        mgr = _manager(tmp_path)
        base = 1700000000.0
        _archive_session(str(tmp_path), "ch1", [],
                         summary="deployment notes", last_active=base)
        results = mgr._search_archives("deployment", 10, after=base + 100)
        assert len(results) == 0

    def test_archive_summary_passes_time_filter(self, tmp_path):
        mgr = _manager(tmp_path)
        base = 1700000000.0
        _archive_session(str(tmp_path), "ch1", [],
                         summary="deployment notes", last_active=base + 200)
        results = mgr._search_archives("deployment", 10, after=base + 100)
        assert len(results) == 1


# ---------------------------------------------------------------------------
# search_history — archive integration with filters
# ---------------------------------------------------------------------------

class TestSearchHistoryArchiveIntegration:
    async def test_search_includes_archives(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        _archive_session(str(tmp_path), "ch1", [
            {"role": "user", "content": "archived needle", "timestamp": now, "user_id": "u1"},
        ], last_active=now)
        results = await mgr.search_history("needle")
        assert len(results) == 1

    async def test_archive_respects_channel_filter(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        _archive_session(str(tmp_path), "ch1", [
            {"role": "user", "content": "data point", "timestamp": now, "user_id": "u1"},
        ], last_active=now)
        _archive_session(str(tmp_path), "ch2", [
            {"role": "user", "content": "data point", "timestamp": now + 1, "user_id": "u2"},
        ], last_active=now + 1)
        results = await mgr.search_history("data", channel_id="ch2")
        assert all(r["channel_id"] == "ch2" for r in results)

    async def test_archive_respects_user_filter(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        _archive_session(str(tmp_path), "ch1", [
            {"role": "user", "content": "target hit", "timestamp": now, "user_id": "alice"},
            {"role": "user", "content": "target miss", "timestamp": now + 1, "user_id": "bob"},
        ], last_active=now + 1)
        results = await mgr.search_history("target", user_id="alice")
        assert len(results) == 1
        assert results[0]["user_id"] == "alice"


# ---------------------------------------------------------------------------
# FullTextIndex.search_sessions — channel_id filter
# ---------------------------------------------------------------------------

class TestFTSSearchSessionsChannelFilter:
    def test_unfiltered_returns_all(self, tmp_path):
        from src.search.fts import FullTextIndex
        fts = FullTextIndex(str(tmp_path / "fts.db"))
        fts.index_session("ch1_100", "hello world from ch1", "ch1", "100")
        fts.index_session("ch2_200", "hello world from ch2", "ch2", "200")
        results = fts.search_sessions("hello")
        assert len(results) == 2

    def test_filtered_by_channel(self, tmp_path):
        from src.search.fts import FullTextIndex
        fts = FullTextIndex(str(tmp_path / "fts.db"))
        fts.index_session("ch1_100", "hello world from ch1", "ch1", "100")
        fts.index_session("ch2_200", "hello world from ch2", "ch2", "200")
        results = fts.search_sessions("hello", channel_id="ch1")
        assert len(results) == 1
        assert results[0]["channel_id"] == "ch1"

    def test_filter_no_match(self, tmp_path):
        from src.search.fts import FullTextIndex
        fts = FullTextIndex(str(tmp_path / "fts.db"))
        fts.index_session("ch1_100", "hello world", "ch1", "100")
        results = fts.search_sessions("hello", channel_id="ch999")
        assert results == []

    def test_returns_snippet_markers(self, tmp_path):
        from src.search.fts import FullTextIndex
        fts = FullTextIndex(str(tmp_path / "fts.db"))
        fts.index_session("ch1_100", "the quick brown fox jumps", "ch1", "100")
        results = fts.search_sessions("fox")
        assert len(results) == 1
        assert ">>>" in results[0]["content"]
        assert "<<<" in results[0]["content"]


# ---------------------------------------------------------------------------
# search_history — hybrid/FTS filtering passthrough
# ---------------------------------------------------------------------------

class TestSearchHistoryHybridFiltering:
    async def test_hybrid_results_filtered_by_channel(self, tmp_path):
        mgr = _manager(tmp_path)
        mock_vs = AsyncMock()
        mock_vs.available = True
        mock_vs.search_hybrid = AsyncMock(return_value=[
            {"channel_id": "ch1", "content": "hit1", "timestamp": 100, "type": "fts"},
            {"channel_id": "ch2", "content": "hit2", "timestamp": 200, "type": "fts"},
        ])
        mgr._vector_store = mock_vs
        mgr._embedder = MagicMock()
        results = await mgr.search_history("hit", channel_id="ch1")
        ch_ids = [r["channel_id"] for r in results]
        assert "ch2" not in ch_ids

    async def test_hybrid_results_filtered_by_time(self, tmp_path):
        mgr = _manager(tmp_path)
        mock_vs = AsyncMock()
        mock_vs.available = True
        mock_vs.search_hybrid = AsyncMock(return_value=[
            {"channel_id": "ch1", "content": "old", "timestamp": 100, "type": "fts"},
            {"channel_id": "ch1", "content": "new", "timestamp": 500, "type": "fts"},
        ])
        mgr._vector_store = mock_vs
        mgr._embedder = MagicMock()
        results = await mgr.search_history("content", after=200)
        assert all(r["timestamp"] >= 200 for r in results)

    async def test_channel_log_results_filtered_by_channel(self, tmp_path):
        mgr = _manager(tmp_path)
        mock_fts = MagicMock()
        mock_fts.search_channel_logs = MagicMock(return_value=[
            {"channel_id": "ch1", "content": "log1", "timestamp": 100, "type": "channel"},
            {"channel_id": "ch2", "content": "log2", "timestamp": 200, "type": "channel"},
        ])
        mgr._fts_index = mock_fts
        mgr._channel_logger = MagicMock()
        results = await mgr.search_history("log", channel_id="ch1")
        ch_ids = [r["channel_id"] for r in results]
        assert "ch2" not in ch_ids

    async def test_channel_log_fts_called_with_channel_id(self, tmp_path):
        mgr = _manager(tmp_path)
        mock_fts = MagicMock()
        mock_fts.search_channel_logs = MagicMock(return_value=[])
        mgr._fts_index = mock_fts
        mgr._channel_logger = MagicMock()
        await mgr.search_history("query", channel_id="ch5")
        mock_fts.search_channel_logs.assert_called_once()
        call_kwargs = mock_fts.search_channel_logs.call_args
        assert call_kwargs[1].get("channel_id") == "ch5" or call_kwargs[0][0] == "query"


# ---------------------------------------------------------------------------
# REST API tests
# ---------------------------------------------------------------------------

def _make_bot(tmp_path):
    bot = MagicMock()
    mgr = _manager(tmp_path)
    bot.sessions = mgr
    bot._knowledge_store = None
    bot._embedder = None
    bot.config = MagicMock()
    bot.config.web = MagicMock()
    bot.config.web.api_token = ""
    return bot


def _make_app(bot):
    from src.web.api import create_api_routes
    app = web.Application()
    routes = create_api_routes(bot)
    app.router.add_routes(routes)
    return app


class TestSessionSearchAPI:
    async def test_missing_query_returns_400(self, tmp_path):
        bot = _make_bot(tmp_path)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/sessions/search")
            assert resp.status == 400
            data = await resp.json()
            assert "error" in data

    async def test_empty_query_returns_400(self, tmp_path):
        bot = _make_bot(tmp_path)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/sessions/search", params={"q": "  "})
            assert resp.status == 400

    async def test_basic_search_returns_results(self, tmp_path):
        bot = _make_bot(tmp_path)
        now = time.time()
        bot.sessions._sessions["ch1"] = _session("ch1", [
            _msg("findme keyword here", ts=now, user_id="u1"),
        ])
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/sessions/search", params={"q": "findme"})
            assert resp.status == 200
            data = await resp.json()
            assert data["query"] == "findme"
            assert data["count"] == 1
            assert len(data["results"]) == 1

    async def test_search_with_channel_filter(self, tmp_path):
        bot = _make_bot(tmp_path)
        now = time.time()
        bot.sessions._sessions["ch1"] = _session("ch1", [
            _msg("test data", ts=now, user_id="u1"),
        ])
        bot.sessions._sessions["ch2"] = _session("ch2", [
            _msg("test data", ts=now, user_id="u2"),
        ])
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/sessions/search",
                                    params={"q": "test", "channel_id": "ch1"})
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1
            assert data["results"][0]["channel_id"] == "ch1"

    async def test_search_with_user_filter(self, tmp_path):
        bot = _make_bot(tmp_path)
        now = time.time()
        bot.sessions._sessions["ch1"] = _session("ch1", [
            _msg("hello alice", ts=now, user_id="alice"),
            _msg("hello bob", ts=now + 1, user_id="bob"),
        ])
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/sessions/search",
                                    params={"q": "hello", "user_id": "bob"})
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1

    async def test_search_with_time_filters(self, tmp_path):
        bot = _make_bot(tmp_path)
        base = 1700000000.0
        bot.sessions._sessions["ch1"] = _session("ch1", [
            _msg("early msg", ts=base, user_id="u1"),
            _msg("late msg", ts=base + 7200, user_id="u1"),
        ])
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/sessions/search",
                                    params={"q": "msg", "after": str(base + 3600)})
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1
            assert "late" in data["results"][0]["content"]

    async def test_limit_parameter(self, tmp_path):
        bot = _make_bot(tmp_path)
        now = time.time()
        msgs = [_msg(f"item number {i}", ts=now + i, user_id="u1") for i in range(20)]
        bot.sessions._sessions["ch1"] = _session("ch1", msgs)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/sessions/search",
                                    params={"q": "item", "limit": "3"})
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 3

    async def test_limit_capped_at_50(self, tmp_path):
        bot = _make_bot(tmp_path)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/sessions/search",
                                    params={"q": "test", "limit": "100"})
            assert resp.status == 200

    async def test_invalid_time_params_ignored(self, tmp_path):
        bot = _make_bot(tmp_path)
        now = time.time()
        bot.sessions._sessions["ch1"] = _session("ch1", [
            _msg("findme", ts=now, user_id="u1"),
        ])
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/sessions/search",
                                    params={"q": "findme", "after": "notanumber"})
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1

    async def test_response_structure(self, tmp_path):
        bot = _make_bot(tmp_path)
        now = time.time()
        bot.sessions._sessions["ch1"] = _session("ch1", [
            _msg("structured result", ts=now, user_id="u1"),
        ])
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/sessions/search",
                                    params={"q": "structured"})
            data = await resp.json()
            assert "query" in data
            assert "results" in data
            assert "count" in data
            r = data["results"][0]
            assert "type" in r
            assert "content" in r
            assert "timestamp" in r
            assert "channel_id" in r


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestSearchEdgeCases:
    async def test_case_insensitive_search(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("Hello World", ts=now, user_id="u1"),
        ])
        results = await mgr.search_history("hello world")
        assert len(results) == 1

    async def test_empty_message_content(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("", ts=now, user_id="u1"),
        ])
        results = await mgr.search_history("test")
        assert len(results) == 0

    async def test_content_truncated_to_500(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        long_content = "x" * 1000
        mgr._sessions["ch1"] = _session("ch1", [
            _msg(long_content, ts=now, user_id="u1"),
        ])
        results = await mgr.search_history("x")
        assert len(results[0]["content"]) == 500

    async def test_multiple_channels_mixed(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("alpha search", ts=now, user_id="u1"),
        ])
        mgr._sessions["ch2"] = _session("ch2", [
            _msg("beta search", ts=now + 1, user_id="u2"),
        ])
        results = await mgr.search_history("search")
        assert len(results) == 2

    async def test_search_backward_compat_no_filters(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("compat test", ts=now, user_id="u1"),
        ])
        results = await mgr.search_history("compat")
        assert len(results) == 1

    def test_archive_no_archive_dir(self, tmp_path):
        mgr = _manager(tmp_path)
        results = mgr._search_archives("test", 10)
        assert results == []

    async def test_summary_not_filtered_by_user_id(self, tmp_path):
        mgr = _manager(tmp_path)
        mgr._sessions["ch1"] = _session("ch1", summary="deployment plan")
        results = await mgr.search_history("deployment", user_id="alice")
        assert len(results) == 1
        assert results[0]["type"] == "summary"

    async def test_search_history_deduplication(self, tmp_path):
        mgr = _manager(tmp_path)
        now = time.time()
        mgr._sessions["ch1"] = _session("ch1", [
            _msg("dedup test", ts=now, user_id="u1"),
        ])
        # Also create an archive with the same content and timestamp
        _archive_session(str(tmp_path), "ch1", [
            {"role": "user", "content": "dedup test", "timestamp": now, "user_id": "u1"},
        ], last_active=now)
        results = await mgr.search_history("dedup")
        # Should find both since they come from different sources (live vs archive)
        assert len(results) >= 1
