"""Tests for server-side log search — AuditLogger.search_logs, get_log_stats, API endpoints."""
from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.audit.logger import AuditLogger


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_audit_log(tmp_path: Path, entries: list[dict]) -> AuditLogger:
    """Create an AuditLogger with pre-populated entries."""
    logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
    with open(logger.path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")
    return logger


def _sample_entries() -> list[dict]:
    """Return a set of realistic audit log entries for testing."""
    return [
        {
            "timestamp": "2026-04-15T10:00:00+00:00",
            "user_id": "u1",
            "user_name": "alice",
            "channel_id": "c1",
            "tool_name": "run_command",
            "tool_input": {"command": "ls", "host": "server1"},
            "approved": True,
            "result_summary": "file1.txt\nfile2.txt",
            "execution_time_ms": 120,
            "error": None,
        },
        {
            "timestamp": "2026-04-15T11:00:00+00:00",
            "user_id": "u2",
            "user_name": "bob",
            "channel_id": "c2",
            "tool_name": "read_file",
            "tool_input": {"path": "/etc/hosts"},
            "approved": True,
            "result_summary": "127.0.0.1 localhost",
            "execution_time_ms": 50,
            "error": None,
        },
        {
            "timestamp": "2026-04-15T12:00:00+00:00",
            "user_id": "u1",
            "user_name": "alice",
            "channel_id": "c1",
            "tool_name": "run_command",
            "tool_input": {"command": "rm /tmp/broken", "host": "server2"},
            "approved": True,
            "result_summary": "",
            "execution_time_ms": 80,
            "error": "Permission denied",
        },
        {
            "timestamp": "2026-04-15T13:00:00+00:00",
            "type": "web_action",
            "method": "POST",
            "path": "/api/sessions/clear-all",
            "status": 200,
            "ip": "127.0.0.1",
            "execution_time_ms": 15,
        },
        {
            "timestamp": "2026-04-15T14:00:00+00:00",
            "user_id": "u2",
            "user_name": "bob",
            "channel_id": "c1",
            "tool_name": "search_knowledge",
            "tool_input": {"query": "deployment steps"},
            "approved": True,
            "result_summary": "Found 3 results for deployment",
            "execution_time_ms": 200,
            "error": None,
        },
    ]


# ---------------------------------------------------------------------------
# search_logs — no filters
# ---------------------------------------------------------------------------

class TestSearchLogsNoFilter:
    async def test_returns_all_in_reverse(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs()
        assert len(results) == 5
        assert results[0]["timestamp"] == "2026-04-15T14:00:00+00:00"
        assert results[-1]["timestamp"] == "2026-04-15T10:00:00+00:00"

    async def test_empty_log_file(self, tmp_path):
        logger = _make_audit_log(tmp_path, [])
        results = await logger.search_logs()
        assert results == []

    async def test_no_log_file(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "nonexistent.jsonl"))
        results = await logger.search_logs()
        assert results == []

    async def test_limit(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(limit=2)
        assert len(results) == 2


# ---------------------------------------------------------------------------
# search_logs — level filter
# ---------------------------------------------------------------------------

class TestSearchLogsLevel:
    async def test_error_level(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(level="error")
        assert len(results) == 1
        assert results[0]["error"] == "Permission denied"

    async def test_info_level(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(level="info")
        assert len(results) == 4
        for r in results:
            assert not r.get("error")

    async def test_all_level(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(level="all")
        assert len(results) == 5


# ---------------------------------------------------------------------------
# search_logs — time range filter
# ---------------------------------------------------------------------------

class TestSearchLogsTimeRange:
    async def test_start_time(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(start_time="2026-04-15T12:00:00")
        assert len(results) == 3
        assert all(r["timestamp"] >= "2026-04-15T12:00:00" for r in results)

    async def test_end_time(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(end_time="2026-04-15T11:30:00")
        assert len(results) == 2
        assert all(r["timestamp"] <= "2026-04-15T11:30:00" for r in results)

    async def test_start_and_end_time(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(
            start_time="2026-04-15T11:00:00",
            end_time="2026-04-15T13:00:00+00:00",
        )
        assert len(results) == 3

    async def test_empty_range(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(
            start_time="2026-04-16T00:00:00",
            end_time="2026-04-16T23:59:59",
        )
        assert len(results) == 0


# ---------------------------------------------------------------------------
# search_logs — keyword filter
# ---------------------------------------------------------------------------

class TestSearchLogsKeyword:
    async def test_keyword_match(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(keyword="deployment")
        assert len(results) == 1
        assert results[0]["tool_name"] == "search_knowledge"

    async def test_keyword_case_insensitive(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(keyword="PERMISSION")
        assert len(results) == 1
        assert results[0]["error"] == "Permission denied"

    async def test_keyword_no_match(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(keyword="zzz_nonexistent")
        assert len(results) == 0


# ---------------------------------------------------------------------------
# search_logs — tool_name filter
# ---------------------------------------------------------------------------

class TestSearchLogsToolName:
    async def test_filter_by_tool(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(tool_name="run_command")
        assert len(results) == 2
        for r in results:
            assert r["tool_name"] == "run_command"

    async def test_tool_not_found(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(tool_name="nonexistent_tool")
        assert len(results) == 0


# ---------------------------------------------------------------------------
# search_logs — combined filters
# ---------------------------------------------------------------------------

class TestSearchLogsCombined:
    async def test_level_and_tool(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(level="error", tool_name="run_command")
        assert len(results) == 1
        assert results[0]["error"] == "Permission denied"

    async def test_time_and_keyword(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(
            start_time="2026-04-15T10:00:00",
            keyword="alice",
        )
        assert len(results) == 2

    async def test_all_filters(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        results = await logger.search_logs(
            level="info",
            tool_name="run_command",
            start_time="2026-04-15T09:00:00",
            end_time="2026-04-15T11:00:00+00:00",
            keyword="file",
        )
        assert len(results) == 1
        assert results[0]["user_name"] == "alice"


# ---------------------------------------------------------------------------
# search_logs — malformed data resilience
# ---------------------------------------------------------------------------

class TestSearchLogsResilience:
    async def test_skips_invalid_json(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        with open(logger.path, "w") as f:
            f.write("not valid json\n")
            f.write(json.dumps({"timestamp": "2026-04-15T10:00:00", "error": None}) + "\n")
            f.write("\n")  # blank line
            f.write(json.dumps({"timestamp": "2026-04-15T11:00:00", "error": "boom"}) + "\n")
        results = await logger.search_logs()
        assert len(results) == 2

    async def test_entries_missing_fields(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        with open(logger.path, "w") as f:
            f.write(json.dumps({"foo": "bar"}) + "\n")
        results = await logger.search_logs()
        assert len(results) == 1


# ---------------------------------------------------------------------------
# get_log_stats
# ---------------------------------------------------------------------------

class TestGetLogStats:
    async def test_stats_with_data(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        stats = await logger.get_log_stats()
        assert stats["total"] == 5
        assert stats["errors"] == 1
        assert stats["tool_count"] == 3
        assert sorted(stats["tools"]) == ["read_file", "run_command", "search_knowledge"]
        assert stats["web_actions"] == 1

    async def test_stats_empty(self, tmp_path):
        logger = _make_audit_log(tmp_path, [])
        stats = await logger.get_log_stats()
        assert stats["total"] == 0
        assert stats["errors"] == 0

    async def test_stats_no_file(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "nonexistent.jsonl"))
        stats = await logger.get_log_stats()
        assert stats["total"] == 0


# ---------------------------------------------------------------------------
# API endpoints — setup helpers
# ---------------------------------------------------------------------------

def _make_bot_with_audit(audit_logger: AuditLogger):
    bot = MagicMock()
    bot.audit = audit_logger
    bot.config = MagicMock()
    bot.config.web = MagicMock()
    bot.config.web.api_token = ""
    return bot


def _make_app(bot):
    from src.web.api import setup_api
    app = web.Application()
    setup_api(app, bot)
    return app


# ---------------------------------------------------------------------------
# API: GET /api/logs/search
# ---------------------------------------------------------------------------

class TestLogSearchAPI:
    async def test_search_no_filters(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        bot = _make_bot_with_audit(logger)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/logs/search")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 5
            assert len(data["entries"]) == 5

    async def test_search_with_level(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        bot = _make_bot_with_audit(logger)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/logs/search?level=error")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1
            assert data["entries"][0]["error"] == "Permission denied"

    async def test_search_invalid_level(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        bot = _make_bot_with_audit(logger)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/logs/search?level=invalid")
            assert resp.status == 400

    async def test_search_with_time_range(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        bot = _make_bot_with_audit(logger)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get(
                "/api/logs/search?start=2026-04-15T12:00:00&end=2026-04-15T14:00:00%2B00:00"
            )
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 3

    async def test_search_with_keyword(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        bot = _make_bot_with_audit(logger)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/logs/search?q=deployment")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1

    async def test_search_with_tool(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        bot = _make_bot_with_audit(logger)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/logs/search?tool=run_command")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 2

    async def test_search_with_limit(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        bot = _make_bot_with_audit(logger)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/logs/search?limit=1")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1

    async def test_search_invalid_limit(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        bot = _make_bot_with_audit(logger)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/logs/search?limit=abc")
            assert resp.status == 400

    async def test_search_combined(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        bot = _make_bot_with_audit(logger)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/logs/search?level=info&tool=run_command&q=file")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1
            assert data["entries"][0]["user_name"] == "alice"


# ---------------------------------------------------------------------------
# API: GET /api/logs/stats
# ---------------------------------------------------------------------------

class TestLogStatsAPI:
    async def test_stats(self, tmp_path):
        entries = _sample_entries()
        logger = _make_audit_log(tmp_path, entries)
        bot = _make_bot_with_audit(logger)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/logs/stats")
            assert resp.status == 200
            data = await resp.json()
            assert data["total"] == 5
            assert data["errors"] == 1
            assert data["tool_count"] == 3
            assert "run_command" in data["tools"]

    async def test_stats_empty(self, tmp_path):
        logger = _make_audit_log(tmp_path, [])
        bot = _make_bot_with_audit(logger)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/logs/stats")
            assert resp.status == 200
            data = await resp.json()
            assert data["total"] == 0


# ---------------------------------------------------------------------------
# AuditLogger.log_execution integration with search_logs
# ---------------------------------------------------------------------------

class TestSearchAfterLog:
    async def test_logged_entry_is_searchable(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="run_command",
            tool_input={"command": "whoami"},
            approved=True,
            result_summary="root",
            execution_time_ms=50,
            error=None,
        )
        await logger.log_execution(
            user_id="u2",
            user_name="bob",
            channel_id="c2",
            tool_name="read_file",
            tool_input={"path": "/etc/passwd"},
            approved=True,
            result_summary="root:x:0:0",
            execution_time_ms=30,
            error="access denied",
        )
        all_results = await logger.search_logs()
        assert len(all_results) == 2

        errors = await logger.search_logs(level="error")
        assert len(errors) == 1
        assert errors[0]["tool_name"] == "read_file"

        by_tool = await logger.search_logs(tool_name="run_command")
        assert len(by_tool) == 1
        assert by_tool[0]["user_name"] == "alice"

    async def test_web_action_is_searchable(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_web_action(
            method="DELETE",
            path="/api/sessions/abc",
            status=200,
            ip="10.0.0.1",
            execution_time_ms=10,
        )
        results = await logger.search_logs(keyword="DELETE")
        assert len(results) == 1
        assert results[0]["type"] == "web_action"

        stats = await logger.get_log_stats()
        assert stats["web_actions"] == 1


# ---------------------------------------------------------------------------
# Edge case coverage (Round 10 tightening)
# ---------------------------------------------------------------------------

class TestLogSearchEdgeCases:
    async def test_search_with_limit_one(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        for i in range(5):
            await logger.log_execution(
                tool_name=f"tool_{i}", user_name="u", user_id="1",
                channel_id="c", tool_input={}, result_summary="ok",
                approved=True, execution_time_ms=10,
            )
        results = await logger.search_logs(limit=1)
        assert len(results) == 1

    async def test_search_level_invalid_returns_all(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            tool_name="test", user_name="u", user_id="1",
            channel_id="c", tool_input={}, result_summary="ok",
            approved=True, execution_time_ms=10,
        )
        results = await logger.search_logs(level="all")
        assert len(results) == 1

    async def test_search_keyword_in_tool_input(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            tool_name="run_command", user_name="u", user_id="1",
            channel_id="c", tool_input={"command": "docker ps"},
            result_summary="ok", approved=True, execution_time_ms=10,
        )
        results = await logger.search_logs(keyword="docker")
        assert len(results) == 1

    async def test_get_log_stats_counts_unique_tools(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        for tool in ["run_command", "read_file", "run_command"]:
            await logger.log_execution(
                tool_name=tool, user_name="u", user_id="1",
                channel_id="c", tool_input={}, result_summary="ok",
                approved=True, execution_time_ms=10,
            )
        stats = await logger.get_log_stats()
        assert stats["tool_count"] == 2
        assert stats["total"] == 3
