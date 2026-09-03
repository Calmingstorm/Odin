"""Tests for action diff tracking — Round 26.

Covers: DiffTracker, compute_unified_diff, compute_dict_diff,
extract_file_target, AuditLogger diff field, background task integration,
web API config diff, and REST /api/audit/diffs endpoint.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

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
        assert '-  "timeout": 30' in diff
        assert '+  "timeout": 60' in diff

    def test_added_key(self):
        diff = compute_dict_diff({}, {"new_key": "value"})
        assert '+  "new_key": "value"' in diff

    def test_removed_key(self):
        diff = compute_dict_diff({"old_key": 1}, {})
        assert '-  "old_key": 1' in diff

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
        a_lines = [ln for ln in lines if '"a"' in ln]
        assert len(a_lines) >= 1


# ---------------------------------------------------------------------------
# No built-in whole-file diff target remains
# ---------------------------------------------------------------------------


class TestDiffToolRemoval:
    def test_apply_patch_has_no_single_whole_file_target(self):
        assert extract_file_target("apply_patch", {"host": "h", "root": "/repo"}) is None
        assert DIFF_TOOLS == frozenset()
        assert isinstance(DIFF_TOOLS, frozenset)


# ---------------------------------------------------------------------------
# MAX_DIFF_CHARS constant
# ---------------------------------------------------------------------------


class TestMaxDiffChars:
    def test_reasonable_size(self):
        assert 1000 <= MAX_DIFF_CHARS <= 10000

    def test_is_int(self):
        assert isinstance(MAX_DIFF_CHARS, int)


# ---------------------------------------------------------------------------
# DiffTracker with no tracked built-in tools
# ---------------------------------------------------------------------------


class TestDiffTracker:
    async def test_capture_before_returns_none_without_host_read(self):
        executor = MagicMock()
        executor._run_on_host = AsyncMock()
        tracker = DiffTracker()
        assert await tracker.capture_before("apply_patch", {}, executor) is None
        executor._run_on_host.assert_not_called()

    def test_compute_diff_discards_snapshot_and_returns_none(self):
        tracker = DiffTracker()
        tracker._snapshots["legacy"] = "old"
        assert tracker.compute_diff("apply_patch", {}, "legacy") is None
        assert "legacy" not in tracker._snapshots

    def test_clear(self):
        tracker = DiffTracker()
        tracker._snapshots["x"] = "y"
        tracker.clear()
        assert tracker._snapshots == {}


# ---------------------------------------------------------------------------
# AuditLogger diff field
# ---------------------------------------------------------------------------


class TestAuditLoggerDiffField:
    async def test_log_execution_with_diff(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="apply_patch",
            tool_input={"path": "/tmp/x", "host": "h"},
            approved=True,
            result_summary="ok",
            execution_time_ms=50,
            diff="--- a/x\n+++ b/x\n-old\n+new\n",
        )
        with open(logger.path) as f:
            entry = json.loads(f.readline())
        assert entry["diff"] == "--- a/x\n+++ b/x\n-old\n+new\n"

    async def test_log_execution_without_diff(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="run_command",
            tool_input={"command": "ls"},
            approved=True,
            result_summary="ok",
            execution_time_ms=50,
        )
        with open(logger.path) as f:
            entry = json.loads(f.readline())
        assert "diff" not in entry

    async def test_log_execution_none_diff_omitted(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="apply_patch",
            tool_input={"path": "/tmp/x"},
            approved=True,
            result_summary="ok",
            execution_time_ms=50,
            diff=None,
        )
        with open(logger.path) as f:
            entry = json.loads(f.readline())
        assert "diff" not in entry

    async def test_log_execution_empty_string_diff_omitted(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="apply_patch",
            tool_input={"path": "/tmp/x"},
            approved=True,
            result_summary="ok",
            execution_time_ms=50,
            diff="",
        )
        with open(logger.path) as f:
            entry = json.loads(f.readline())
        assert "diff" not in entry

    async def test_log_web_action_with_diff(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_web_action(
            method="PUT",
            path="/api/config",
            status=200,
            diff="--- a/config\n+++ b/config\n-old\n+new\n",
        )
        with open(logger.path) as f:
            entry = json.loads(f.readline())
        assert entry["diff"] == "--- a/config\n+++ b/config\n-old\n+new\n"
        assert entry["type"] == "web_action"

    async def test_log_web_action_without_diff(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_web_action(
            method="POST",
            path="/api/sessions/clear-all",
            status=200,
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
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="run_command",
            tool_input={},
            approved=True,
            result_summary="ok",
            execution_time_ms=10,
        )
        await logger.log_execution(
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="apply_patch",
            tool_input={"path": "/tmp/x"},
            approved=True,
            result_summary="ok",
            execution_time_ms=20,
            diff="-old\n+new\n",
        )
        results = await logger.search_diffs()
        assert len(results) == 1
        assert results[0]["tool_name"] == "apply_patch"
        assert results[0]["diff"] == "-old\n+new\n"

    async def test_empty_log(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        results = await logger.search_diffs()
        assert results == []

    async def test_no_diffs_in_log(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="run_command",
            tool_input={},
            approved=True,
            result_summary="ok",
            execution_time_ms=10,
        )
        results = await logger.search_diffs()
        assert results == []

    async def test_filter_by_tool(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="apply_patch",
            tool_input={},
            approved=True,
            result_summary="ok",
            execution_time_ms=10,
            diff="diff1",
        )
        await logger.log_web_action(
            method="PUT",
            path="/api/config",
            status=200,
            diff="diff2",
        )
        results = await logger.search_diffs(tool_name="apply_patch")
        assert len(results) == 1
        assert results[0]["tool_name"] == "apply_patch"

    async def test_filter_by_user(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.log_execution(
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="apply_patch",
            tool_input={},
            approved=True,
            result_summary="ok",
            execution_time_ms=10,
            diff="diff1",
        )
        await logger.log_execution(
            user_id="u2",
            user_name="bob",
            channel_id="c1",
            tool_name="apply_patch",
            tool_input={},
            approved=True,
            result_summary="ok",
            execution_time_ms=10,
            diff="diff2",
        )
        results = await logger.search_diffs(user="alice")
        assert len(results) == 1
        assert results[0]["user_name"] == "alice"

    async def test_filter_by_date(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        # Write entries with explicit timestamps
        entries = [
            {"timestamp": "2026-04-14T10:00:00+00:00", "tool_name": "apply_patch", "diff": "d1"},
            {"timestamp": "2026-04-15T10:00:00+00:00", "tool_name": "apply_patch", "diff": "d2"},
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
                user_id="u1",
                user_name="alice",
                channel_id="c1",
                tool_name="apply_patch",
                tool_input={},
                approved=True,
                result_summary="ok",
                execution_time_ms=10,
                diff=f"diff{i}",
            )
        results = await logger.search_diffs(limit=3)
        assert len(results) == 3

    async def test_most_recent_first(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        entries = [
            {"timestamp": "2026-04-15T10:00:00+00:00", "tool_name": "apply_patch", "diff": "first"},
            {
                "timestamp": "2026-04-15T12:00:00+00:00",
                "tool_name": "apply_patch",
                "diff": "second",
            },
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
            method="PUT",
            path="/api/config",
            status=200,
            diff="config diff",
        )
        results = await logger.search_diffs()
        assert len(results) == 1
        assert results[0]["type"] == "web_action"


# ---------------------------------------------------------------------------
# Background task integration
# ---------------------------------------------------------------------------


class TestBackgroundTaskDiffIntegration:
    def test_no_builtin_diff_tools_remain(self):
        assert DIFF_TOOLS == frozenset()


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
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="run_command",
            tool_input={},
            approved=True,
            result_summary="ok",
            execution_time_ms=10,
        )
        await bot.audit.log_execution(
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="apply_patch",
            tool_input={"path": "/tmp/x"},
            approved=True,
            result_summary="ok",
            execution_time_ms=20,
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
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="apply_patch",
            tool_input={},
            approved=True,
            result_summary="ok",
            execution_time_ms=10,
            diff="diff1",
        )
        await bot.audit.log_web_action(
            method="PUT",
            path="/api/config",
            status=200,
            diff="diff2",
        )

        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/audit/diffs?tool=apply_patch")
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
                user_id="u1",
                user_name="alice",
                channel_id="c1",
                tool_name="apply_patch",
                tool_input={},
                approved=True,
                result_summary="ok",
                execution_time_ms=10,
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
            assert resp.status == 200


# ---------------------------------------------------------------------------
# Config diff via web API
# ---------------------------------------------------------------------------


class TestConfigDiffIntegration:
    def test_compute_dict_diff_for_config(self):
        before = {"sessions": {"max_history": 50}, "tools": {"timeout": 300}}
        after = {"sessions": {"max_history": 100}, "tools": {"timeout": 300}}
        diff = compute_dict_diff(before, after, label="config.yml")
        assert "max_history" in diff
        assert '-    "max_history": 50' in diff
        assert '+    "max_history": 100' in diff

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
        from src.audit.diff_tracker import compute_dict_diff, compute_unified_diff

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

    async def test_diff_callback_fires_with_diff_entry(self, tmp_path):
        """Event callback receives the diff field."""
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        received = []
        logger.set_event_callback(AsyncMock(side_effect=lambda e: received.append(e)))
        await logger.log_execution(
            user_id="u1",
            user_name="alice",
            channel_id="c1",
            tool_name="apply_patch",
            tool_input={},
            approved=True,
            result_summary="ok",
            execution_time_ms=10,
            diff="the diff",
        )
        assert len(received) == 1
        assert received[0]["diff"] == "the diff"

    def test_dict_diff_with_non_serializable(self):
        from datetime import datetime

        before = {"ts": datetime(2026, 1, 1)}
        after = {"ts": datetime(2026, 1, 2)}
        diff = compute_dict_diff(before, after)
        assert diff  # should not crash, default=str handles it
