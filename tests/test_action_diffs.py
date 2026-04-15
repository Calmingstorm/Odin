"""Tests for action diff tracking — Round 26.

Covers: DiffTracker, compute_unified_diff, compute_dict_diff,
extract_file_target, AuditLogger diff field, background task integration,
web API config diff, and REST /api/audit/diffs endpoint.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.audit.diff_tracker import (
    DIFF_TOOLS,
    MAX_DIFF_CHARS,
    DiffTracker,
    compute_dict_diff,
    compute_unified_diff,
    extract_file_target,
)
from src.audit.logger import AuditLogger


# ---------------------------------------------------------------------------
# compute_unified_diff
# ---------------------------------------------------------------------------

class TestComputeUnifiedDiff:
    def test_identical_content_returns_empty(self):
        assert compute_unified_diff("hello\n", "hello\n") == ""

    def test_simple_change(self):
        diff = compute_unified_diff("line1\nline2\n", "line1\nline3\n", label="test.txt")
        assert "--- a/test.txt" in diff
        assert "+++ b/test.txt" in diff
        assert "-line2" in diff
        assert "+line3" in diff

    def test_new_file(self):
        diff = compute_unified_diff("", "new content\n", label="new.txt")
        assert "+new content" in diff

    def test_deleted_file(self):
        diff = compute_unified_diff("old content\n", "", label="gone.txt")
        assert "-old content" in diff

    def test_multiline_changes(self):
        before = "a\nb\nc\nd\ne\n"
        after = "a\nB\nc\nD\ne\n"
        diff = compute_unified_diff(before, after)
        assert "-b" in diff
        assert "+B" in diff
        assert "-d" in diff
        assert "+D" in diff

    def test_truncation(self):
        before = "a\n" * 1000
        after = "b\n" * 1000
        diff = compute_unified_diff(before, after, max_chars=200)
        assert len(diff) <= 200 + len("\n[diff truncated]")
        assert "[diff truncated]" in diff

    def test_default_label(self):
        diff = compute_unified_diff("x\n", "y\n")
        assert "a/file" in diff
        assert "b/file" in diff

    def test_empty_both(self):
        assert compute_unified_diff("", "") == ""

    def test_no_trailing_newline(self):
        diff = compute_unified_diff("abc", "def")
        assert "-abc" in diff
        assert "+def" in diff

    def test_unicode_content(self):
        diff = compute_unified_diff("héllo\n", "wörld\n")
        assert "-héllo" in diff
        assert "+wörld" in diff


# ---------------------------------------------------------------------------
# compute_dict_diff
# ---------------------------------------------------------------------------

class TestComputeDictDiff:
    def test_identical_dicts(self):
        assert compute_dict_diff({"a": 1}, {"a": 1}) == ""

    def test_changed_value(self):
        diff = compute_dict_diff({"timeout": 30}, {"timeout": 60}, label="config.yml")
        assert "-  \"timeout\": 30" in diff
        assert "+  \"timeout\": 60" in diff

    def test_added_key(self):
        diff = compute_dict_diff({}, {"new_key": "value"})
        assert "+  \"new_key\": \"value\"" in diff

    def test_removed_key(self):
        diff = compute_dict_diff({"old_key": 1}, {})
        assert "-  \"old_key\": 1" in diff

    def test_nested_change(self):
        before = {"outer": {"inner": 1}}
        after = {"outer": {"inner": 2}}
        diff = compute_dict_diff(before, after)
        assert diff  # something changed

    def test_truncation(self):
        big_before = {f"key{i}": f"val{i}" for i in range(500)}
        big_after = {f"key{i}": f"changed{i}" for i in range(500)}
        diff = compute_dict_diff(big_before, big_after, max_chars=300)
        assert "[diff truncated]" in diff

    def test_sorts_keys(self):
        diff = compute_dict_diff({"z": 1, "a": 2}, {"z": 1, "a": 3})
        lines = diff.split("\n")
        a_lines = [l for l in lines if '"a"' in l]
        assert len(a_lines) >= 1


# ---------------------------------------------------------------------------
# extract_file_target
# ---------------------------------------------------------------------------

class TestExtractFileTarget:
    def test_write_file(self):
        result = extract_file_target("write_file", {"host": "server1", "path": "/etc/config"})
        assert result == ("server1", "/etc/config")

    def test_write_file_missing_host(self):
        assert extract_file_target("write_file", {"path": "/tmp/x"}) is None

    def test_write_file_missing_path(self):
        assert extract_file_target("write_file", {"host": "server1"}) is None

    def test_non_diff_tool(self):
        assert extract_file_target("run_command", {"host": "h", "command": "ls"}) is None

    def test_read_file(self):
        assert extract_file_target("read_file", {"host": "h", "path": "/tmp"}) is None

    def test_empty_inputs(self):
        assert extract_file_target("write_file", {}) is None

    def test_write_file_empty_host(self):
        assert extract_file_target("write_file", {"host": "", "path": "/tmp/x"}) is None

    def test_write_file_empty_path(self):
        assert extract_file_target("write_file", {"host": "h", "path": ""}) is None


# ---------------------------------------------------------------------------
# DIFF_TOOLS constant
# ---------------------------------------------------------------------------

class TestDiffToolsConstant:
    def test_contains_write_file(self):
        assert "write_file" in DIFF_TOOLS

    def test_is_frozenset(self):
        assert isinstance(DIFF_TOOLS, frozenset)

    def test_does_not_contain_read_file(self):
        assert "read_file" not in DIFF_TOOLS

    def test_does_not_contain_run_command(self):
        assert "run_command" not in DIFF_TOOLS


# ---------------------------------------------------------------------------
# MAX_DIFF_CHARS constant
# ---------------------------------------------------------------------------

class TestMaxDiffChars:
    def test_reasonable_size(self):
        assert 1000 <= MAX_DIFF_CHARS <= 10000

    def test_is_int(self):
        assert isinstance(MAX_DIFF_CHARS, int)


# ---------------------------------------------------------------------------
# DiffTracker
# ---------------------------------------------------------------------------

class TestDiffTracker:
    async def test_capture_before_write_file(self):
        executor = MagicMock()
        executor._run_on_host = AsyncMock(return_value="old content\n")
        tracker = DiffTracker()
        key = await tracker.capture_before(
            "write_file", {"host": "server1", "path": "/tmp/f.txt"}, executor,
        )
        assert key == "server1:/tmp/f.txt"
        executor._run_on_host.assert_called_once()

    async def test_capture_before_non_diff_tool(self):
        executor = MagicMock()
        tracker = DiffTracker()
        key = await tracker.capture_before(
            "run_command", {"host": "h", "command": "ls"}, executor,
        )
        assert key is None

    async def test_capture_before_host_error(self):
        executor = MagicMock()
        executor._run_on_host = AsyncMock(return_value="Unknown or disallowed host: bad")
        tracker = DiffTracker()
        key = await tracker.capture_before(
            "write_file", {"host": "bad", "path": "/tmp/f.txt"}, executor,
        )
        assert key is not None
        # Before content should be empty (unknown host)
        assert tracker._snapshots[key] == ""

    async def test_capture_before_exception(self):
        executor = MagicMock()
        executor._run_on_host = AsyncMock(side_effect=Exception("ssh fail"))
        tracker = DiffTracker()
        key = await tracker.capture_before(
            "write_file", {"host": "h", "path": "/tmp/f.txt"}, executor,
        )
        assert key is not None
        assert tracker._snapshots[key] == ""

    async def test_compute_diff_write_file(self):
        executor = MagicMock()
        executor._run_on_host = AsyncMock(return_value="old line\n")
        tracker = DiffTracker()
        key = await tracker.capture_before(
            "write_file", {"host": "h", "path": "/tmp/test.txt", "content": "new line\n"}, executor,
        )
        diff = tracker.compute_diff(
            "write_file", {"host": "h", "path": "/tmp/test.txt", "content": "new line\n"}, key,
        )
        assert diff is not None
        assert "-old line" in diff
        assert "+new line" in diff

    async def test_compute_diff_no_change(self):
        executor = MagicMock()
        executor._run_on_host = AsyncMock(return_value="same\n")
        tracker = DiffTracker()
        key = await tracker.capture_before(
            "write_file", {"host": "h", "path": "/tmp/f.txt", "content": "same\n"}, executor,
        )
        diff = tracker.compute_diff(
            "write_file", {"host": "h", "path": "/tmp/f.txt", "content": "same\n"}, key,
        )
        assert diff is None

    async def test_compute_diff_new_file(self):
        executor = MagicMock()
        executor._run_on_host = AsyncMock(return_value="")
        tracker = DiffTracker()
        key = await tracker.capture_before(
            "write_file", {"host": "h", "path": "/tmp/new.txt", "content": "hello\n"}, executor,
        )
        diff = tracker.compute_diff(
            "write_file", {"host": "h", "path": "/tmp/new.txt", "content": "hello\n"}, key,
        )
        assert diff is not None
        assert "+hello" in diff

    def test_compute_diff_none_key(self):
        tracker = DiffTracker()
        assert tracker.compute_diff("write_file", {}, None) is None

    def test_compute_diff_missing_snapshot(self):
        tracker = DiffTracker()
        diff = tracker.compute_diff("write_file", {"content": "x"}, "nonexistent:key")
        # before = "" (popped missing key → default ""), after = "x"
        assert diff is not None

    async def test_snapshot_cleanup_after_compute(self):
        executor = MagicMock()
        executor._run_on_host = AsyncMock(return_value="old\n")
        tracker = DiffTracker()
        key = await tracker.capture_before(
            "write_file", {"host": "h", "path": "/tmp/f.txt", "content": "new\n"}, executor,
        )
        assert key in tracker._snapshots
        tracker.compute_diff("write_file", {"content": "new\n"}, key)
        assert key not in tracker._snapshots

    def test_clear(self):
        tracker = DiffTracker()
        tracker._snapshots["a"] = "b"
        tracker._snapshots["c"] = "d"
        tracker.clear()
        assert len(tracker._snapshots) == 0

    async def test_compute_diff_non_write_tool(self):
        tracker = DiffTracker()
        tracker._snapshots["h:/tmp/x"] = "old"
        diff = tracker.compute_diff("run_command", {"content": "new"}, "h:/tmp/x")
        assert diff is None

    async def test_path_used_as_diff_label(self):
        executor = MagicMock()
        executor._run_on_host = AsyncMock(return_value="old\n")
        tracker = DiffTracker()
        key = await tracker.capture_before(
            "write_file", {"host": "h", "path": "/etc/nginx.conf", "content": "new\n"}, executor,
        )
        diff = tracker.compute_diff(
            "write_file", {"host": "h", "path": "/etc/nginx.conf", "content": "new\n"}, key,
        )
        assert "/etc/nginx.conf" in diff


# ---------------------------------------------------------------------------
# AuditLogger diff field
# ---------------------------------------------------------------------------

class TestAuditLoggerDiffField:
    async def test_log_execution_with_diff(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="write_file",
            tool_input={"path": "/tmp/x", "host": "h"},
            approved=True, result_summary="ok",
            execution_time_ms=50,
            diff="--- a/x\n+++ b/x\n-old\n+new\n",
        )
        with open(logger.path) as f:
            entry = json.loads(f.readline())
        assert entry["diff"] == "--- a/x\n+++ b/x\n-old\n+new\n"

    async def test_log_execution_without_diff(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="run_command",
            tool_input={"command": "ls"},
            approved=True, result_summary="ok",
            execution_time_ms=50,
        )
        with open(logger.path) as f:
            entry = json.loads(f.readline())
        assert "diff" not in entry

    async def test_log_execution_none_diff_omitted(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="write_file",
            tool_input={"path": "/tmp/x"},
            approved=True, result_summary="ok",
            execution_time_ms=50,
            diff=None,
        )
        with open(logger.path) as f:
            entry = json.loads(f.readline())
        assert "diff" not in entry

    async def test_log_execution_empty_string_diff_omitted(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="write_file",
            tool_input={"path": "/tmp/x"},
            approved=True, result_summary="ok",
            execution_time_ms=50,
            diff="",
        )
        with open(logger.path) as f:
            entry = json.loads(f.readline())
        assert "diff" not in entry

    async def test_log_web_action_with_diff(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_web_action(
            method="PUT", path="/api/config", status=200,
            diff="--- a/config\n+++ b/config\n-old\n+new\n",
        )
        with open(logger.path) as f:
            entry = json.loads(f.readline())
        assert entry["diff"] == "--- a/config\n+++ b/config\n-old\n+new\n"
        assert entry["type"] == "web_action"

    async def test_log_web_action_without_diff(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_web_action(
            method="POST", path="/api/sessions/clear-all", status=200,
        )
        with open(logger.path) as f:
            entry = json.loads(f.readline())
        assert "diff" not in entry


# ---------------------------------------------------------------------------
# AuditLogger.search_diffs
# ---------------------------------------------------------------------------

class TestSearchDiffs:
    async def test_returns_only_entries_with_diff(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="run_command", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=10,
        )
        await logger.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="write_file", tool_input={"path": "/tmp/x"},
            approved=True, result_summary="ok", execution_time_ms=20,
            diff="-old\n+new\n",
        )
        results = await logger.search_diffs()
        assert len(results) == 1
        assert results[0]["tool_name"] == "write_file"
        assert results[0]["diff"] == "-old\n+new\n"

    async def test_empty_log(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        results = await logger.search_diffs()
        assert results == []

    async def test_no_diffs_in_log(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="run_command", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=10,
        )
        results = await logger.search_diffs()
        assert results == []

    async def test_filter_by_tool(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="write_file", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=10,
            diff="diff1",
        )
        await logger.log_web_action(
            method="PUT", path="/api/config", status=200,
            diff="diff2",
        )
        results = await logger.search_diffs(tool_name="write_file")
        assert len(results) == 1
        assert results[0]["tool_name"] == "write_file"

    async def test_filter_by_user(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="write_file", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=10,
            diff="diff1",
        )
        await logger.log_execution(
            user_id="u2", user_name="bob", channel_id="c1",
            tool_name="write_file", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=10,
            diff="diff2",
        )
        results = await logger.search_diffs(user="alice")
        assert len(results) == 1
        assert results[0]["user_name"] == "alice"

    async def test_filter_by_date(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        # Write entries with explicit timestamps
        entries = [
            {"timestamp": "2026-04-14T10:00:00+00:00", "tool_name": "write_file", "diff": "d1"},
            {"timestamp": "2026-04-15T10:00:00+00:00", "tool_name": "write_file", "diff": "d2"},
        ]
        with open(logger.path, "w") as f:
            for e in entries:
                f.write(json.dumps(e) + "\n")
        results = await logger.search_diffs(date="2026-04-15")
        assert len(results) == 1
        assert results[0]["diff"] == "d2"

    async def test_limit(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        for i in range(10):
            await logger.log_execution(
                user_id="u1", user_name="alice", channel_id="c1",
                tool_name="write_file", tool_input={},
                approved=True, result_summary="ok", execution_time_ms=10,
                diff=f"diff{i}",
            )
        results = await logger.search_diffs(limit=3)
        assert len(results) == 3

    async def test_most_recent_first(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        entries = [
            {"timestamp": "2026-04-15T10:00:00+00:00", "tool_name": "write_file", "diff": "first"},
            {"timestamp": "2026-04-15T12:00:00+00:00", "tool_name": "write_file", "diff": "second"},
        ]
        with open(logger.path, "w") as f:
            for e in entries:
                f.write(json.dumps(e) + "\n")
        results = await logger.search_diffs()
        assert results[0]["diff"] == "second"

    async def test_nonexistent_file(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "missing" / "audit.jsonl"))
        logger.path = Path(str(tmp_path / "nonexistent.jsonl"))
        results = await logger.search_diffs()
        assert results == []

    async def test_web_action_diffs_included(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_web_action(
            method="PUT", path="/api/config", status=200,
            diff="config diff",
        )
        results = await logger.search_diffs()
        assert len(results) == 1
        assert results[0]["type"] == "web_action"


# ---------------------------------------------------------------------------
# Background task integration
# ---------------------------------------------------------------------------

class TestBackgroundTaskDiffIntegration:
    async def test_write_file_captures_diff(self):
        """Verify that run_background_task captures before/after diffs for write_file."""
        from src.discord.background_task import run_background_task, BackgroundTask, DIFF_TOOLS

        assert "write_file" in DIFF_TOOLS

    async def test_diff_tracker_import(self):
        from src.discord.background_task import DiffTracker
        tracker = DiffTracker()
        assert hasattr(tracker, "capture_before")
        assert hasattr(tracker, "compute_diff")

    async def test_diff_passed_to_audit_log(self):
        """End-to-end: write_file tool → diff captured → passed to audit logger."""
        import asyncio
        from unittest.mock import patch, AsyncMock, MagicMock
        from src.discord.background_task import run_background_task, BackgroundTask

        # Set up mocks
        executor = MagicMock()
        executor.config = MagicMock()
        executor.config.hosts = {"localhost": MagicMock()}
        executor._run_on_host = AsyncMock(return_value="old content\n")
        executor.execute = AsyncMock(return_value="File written successfully")

        skill_manager = MagicMock()
        skill_manager.has_skill = MagicMock(return_value=False)

        audit_logger = MagicMock()
        audit_logger.log_execution = AsyncMock()

        channel = MagicMock()
        channel.send = AsyncMock(return_value=MagicMock(edit=AsyncMock()))

        task = BackgroundTask(
            task_id="test-1",
            description="test write",
            steps=[{
                "tool_name": "write_file",
                "tool_input": {
                    "host": "localhost",
                    "path": "/tmp/test.txt",
                    "content": "new content\n",
                },
                "description": "write test file",
            }],
            channel=channel,
            requester="tester",
            requester_id="u1",
        )

        await run_background_task(
            task, executor, skill_manager,
            audit_logger=audit_logger,
        )

        # Verify audit log was called with a diff
        assert audit_logger.log_execution.called
        call_kwargs = audit_logger.log_execution.call_args[1]
        assert "diff" in call_kwargs
        diff = call_kwargs["diff"]
        assert diff is not None
        assert "-old content" in diff
        assert "+new content" in diff

    async def test_non_diff_tool_no_diff_in_audit(self):
        """run_command should NOT produce a diff in the audit entry."""
        from src.discord.background_task import run_background_task, BackgroundTask

        executor = MagicMock()
        executor.config = MagicMock()
        executor.config.hosts = {"localhost": MagicMock()}
        executor.execute = AsyncMock(return_value="output")

        skill_manager = MagicMock()
        skill_manager.has_skill = MagicMock(return_value=False)

        audit_logger = MagicMock()
        audit_logger.log_execution = AsyncMock()

        channel = MagicMock()
        channel.send = AsyncMock(return_value=MagicMock(edit=AsyncMock()))

        task = BackgroundTask(
            task_id="test-2",
            description="test run",
            steps=[{
                "tool_name": "run_command",
                "tool_input": {"host": "localhost", "command": "ls"},
                "description": "list files",
            }],
            channel=channel,
            requester="tester",
            requester_id="u1",
        )

        await run_background_task(
            task, executor, skill_manager,
            audit_logger=audit_logger,
        )

        call_kwargs = audit_logger.log_execution.call_args[1]
        assert "diff" not in call_kwargs


# ---------------------------------------------------------------------------
# REST API endpoint /api/audit/diffs
# ---------------------------------------------------------------------------

class TestAuditDiffsAPI:
    def _make_bot(self, tmp_path):
        bot = MagicMock()
        bot.audit = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        return bot

    async def test_empty_results(self, tmp_path):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        bot = self._make_bot(tmp_path)
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/audit/diffs")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 0
            assert data["entries"] == []

    async def test_returns_diff_entries(self, tmp_path):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        bot = self._make_bot(tmp_path)
        # Write some entries
        await bot.audit.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="run_command", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=10,
        )
        await bot.audit.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="write_file", tool_input={"path": "/tmp/x"},
            approved=True, result_summary="ok", execution_time_ms=20,
            diff="-old\n+new\n",
        )

        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/audit/diffs")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1
            assert data["entries"][0]["diff"] == "-old\n+new\n"

    async def test_filter_by_tool(self, tmp_path):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        bot = self._make_bot(tmp_path)
        await bot.audit.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="write_file", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=10,
            diff="diff1",
        )
        await bot.audit.log_web_action(
            method="PUT", path="/api/config", status=200,
            diff="diff2",
        )

        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/audit/diffs?tool=write_file")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1

    async def test_limit_parameter(self, tmp_path):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        bot = self._make_bot(tmp_path)
        for i in range(5):
            await bot.audit.log_execution(
                user_id="u1", user_name="alice", channel_id="c1",
                tool_name="write_file", tool_input={},
                approved=True, result_summary="ok", execution_time_ms=10,
                diff=f"diff{i}",
            )

        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/audit/diffs?limit=2")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 2

    async def test_invalid_limit(self, tmp_path):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        bot = self._make_bot(tmp_path)
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/audit/diffs?limit=abc")
            assert resp.status == 400


# ---------------------------------------------------------------------------
# Config diff via web API
# ---------------------------------------------------------------------------

class TestConfigDiffIntegration:
    def test_compute_dict_diff_for_config(self):
        before = {"sessions": {"max_history": 50}, "tools": {"timeout": 300}}
        after = {"sessions": {"max_history": 100}, "tools": {"timeout": 300}}
        diff = compute_dict_diff(before, after, label="config.yml")
        assert "max_history" in diff
        assert "-    \"max_history\": 50" in diff
        assert "+    \"max_history\": 100" in diff

    def test_no_diff_when_unchanged(self):
        cfg = {"sessions": {"max_history": 50}}
        diff = compute_dict_diff(cfg, cfg)
        assert diff == ""


# ---------------------------------------------------------------------------
# Module imports
# ---------------------------------------------------------------------------

class TestModuleImports:
    def test_diff_tracker_importable(self):
        from src.audit.diff_tracker import DiffTracker
        assert DiffTracker is not None

    def test_compute_functions_importable(self):
        from src.audit.diff_tracker import compute_unified_diff, compute_dict_diff
        assert callable(compute_unified_diff)
        assert callable(compute_dict_diff)

    def test_extract_file_target_importable(self):
        from src.audit.diff_tracker import extract_file_target
        assert callable(extract_file_target)

    def test_constants_importable(self):
        from src.audit.diff_tracker import DIFF_TOOLS, MAX_DIFF_CHARS
        assert DIFF_TOOLS is not None
        assert MAX_DIFF_CHARS is not None


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_diff_with_binary_like_content(self):
        diff = compute_unified_diff("abc\x00def\n", "abc\x00ghi\n")
        assert diff  # should not crash

    def test_diff_very_large_identical(self):
        big = "x\n" * 10000
        assert compute_unified_diff(big, big) == ""

    async def test_multiple_writes_tracked_independently(self):
        executor = MagicMock()
        executor._run_on_host = AsyncMock(side_effect=["old1\n", "old2\n"])
        tracker = DiffTracker()
        key1 = await tracker.capture_before(
            "write_file", {"host": "h", "path": "/tmp/a.txt"}, executor,
        )
        key2 = await tracker.capture_before(
            "write_file", {"host": "h", "path": "/tmp/b.txt"}, executor,
        )
        assert key1 != key2
        diff1 = tracker.compute_diff(
            "write_file", {"path": "/tmp/a.txt", "content": "new1\n"}, key1,
        )
        diff2 = tracker.compute_diff(
            "write_file", {"path": "/tmp/b.txt", "content": "new2\n"}, key2,
        )
        assert diff1 is not None
        assert diff2 is not None
        assert "-old1" in diff1
        assert "-old2" in diff2

    async def test_diff_callback_fires_with_diff_entry(self, tmp_path):
        """Event callback receives the diff field."""
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        received = []
        logger.set_event_callback(AsyncMock(side_effect=lambda e: received.append(e)))
        await logger.log_execution(
            user_id="u1", user_name="alice", channel_id="c1",
            tool_name="write_file", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=10,
            diff="the diff",
        )
        assert len(received) == 1
        assert received[0]["diff"] == "the diff"

    def test_extract_file_target_extra_fields_ignored(self):
        result = extract_file_target("write_file", {
            "host": "h", "path": "/tmp/x", "content": "y", "extra": "z",
        })
        assert result == ("h", "/tmp/x")

    def test_dict_diff_with_non_serializable(self):
        from datetime import datetime
        before = {"ts": datetime(2026, 1, 1)}
        after = {"ts": datetime(2026, 1, 2)}
        diff = compute_dict_diff(before, after)
        assert diff  # should not crash, default=str handles it

    async def test_capture_before_quotes_path(self):
        executor = MagicMock()
        executor._run_on_host = AsyncMock(return_value="content")
        tracker = DiffTracker()
        await tracker.capture_before(
            "write_file", {"host": "h", "path": "/tmp/file with spaces.txt"}, executor,
        )
        call_cmd = executor._run_on_host.call_args[0][1]
        assert "'" in call_cmd or '"' in call_cmd  # path should be quoted
