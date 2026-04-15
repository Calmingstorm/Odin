"""Tests for Scheduler execution history.

Covers:
- Recording success and failure entries
- Querying by schedule_id, status, limit
- Stats computation (totals, avg duration)
- Pruning old entries
- History integration with Scheduler (execute_and_record)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from src.scheduler.history import ScheduleHistory
from src.scheduler.scheduler import Scheduler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_history(tmp_path: Path) -> ScheduleHistory:
    return ScheduleHistory(str(tmp_path / "history.jsonl"))


def _make_scheduler(tmp_path: Path) -> Scheduler:
    return Scheduler(
        str(tmp_path / "schedules.json"),
        history_path=str(tmp_path / "history.jsonl"),
    )


# ---------------------------------------------------------------------------
# Tests — ScheduleHistory
# ---------------------------------------------------------------------------

class TestScheduleHistory:
    """Direct tests for ScheduleHistory."""

    async def test_record_and_query(self, tmp_path):
        h = _make_history(tmp_path)
        await h.record(
            schedule_id="abc",
            description="test job",
            action="check",
            status="success",
            duration_ms=150,
        )
        entries = await h.query("abc")
        assert len(entries) == 1
        assert entries[0]["schedule_id"] == "abc"
        assert entries[0]["status"] == "success"
        assert entries[0]["duration_ms"] == 150
        assert entries[0]["action"] == "check"

    async def test_record_failure_with_error(self, tmp_path):
        h = _make_history(tmp_path)
        await h.record(
            schedule_id="def",
            description="fail job",
            action="reminder",
            status="failure",
            duration_ms=50,
            error="connection refused",
            retry_attempt=1,
        )
        entries = await h.query("def")
        assert len(entries) == 1
        assert entries[0]["error"] == "connection refused"
        assert entries[0]["retry_attempt"] == 1

    async def test_query_all_schedules(self, tmp_path):
        h = _make_history(tmp_path)
        await h.record(schedule_id="a", description="a", action="check", status="success", duration_ms=10)
        await h.record(schedule_id="b", description="b", action="check", status="failure", duration_ms=20)
        entries = await h.query()
        assert len(entries) == 2

    async def test_query_with_status_filter(self, tmp_path):
        h = _make_history(tmp_path)
        await h.record(schedule_id="a", description="a", action="check", status="success", duration_ms=10)
        await h.record(schedule_id="a", description="a", action="check", status="failure", duration_ms=20)
        await h.record(schedule_id="a", description="a", action="check", status="success", duration_ms=30)

        successes = await h.query("a", status="success")
        assert len(successes) == 2
        failures = await h.query("a", status="failure")
        assert len(failures) == 1

    async def test_query_limit(self, tmp_path):
        h = _make_history(tmp_path)
        for i in range(10):
            await h.record(schedule_id="a", description="a", action="check", status="success", duration_ms=i)
        entries = await h.query("a", limit=3)
        assert len(entries) == 3
        # Most recent first (last written has highest duration_ms)
        assert entries[0]["duration_ms"] == 9

    async def test_query_empty_file(self, tmp_path):
        h = _make_history(tmp_path)
        entries = await h.query("nonexistent")
        assert entries == []

    async def test_stats(self, tmp_path):
        h = _make_history(tmp_path)
        await h.record(schedule_id="x", description="x", action="check", status="success", duration_ms=100)
        await h.record(schedule_id="x", description="x", action="check", status="success", duration_ms=200)
        await h.record(schedule_id="x", description="x", action="check", status="failure", duration_ms=50)

        stats = await h.stats("x")
        assert stats["total_runs"] == 3
        assert stats["successes"] == 2
        assert stats["failures"] == 1
        assert stats["avg_duration_ms"] == 116  # (100+200+50)/3
        assert stats["last_run"] is not None

    async def test_stats_empty(self, tmp_path):
        h = _make_history(tmp_path)
        stats = await h.stats("nothing")
        assert stats["total_runs"] == 0
        assert stats["last_run"] is None

    async def test_prune_under_threshold(self, tmp_path):
        h = _make_history(tmp_path)
        await h.record(schedule_id="a", description="a", action="check", status="success", duration_ms=10)
        removed = await h.prune()
        assert removed == 0

    async def test_prune_over_threshold(self, tmp_path):
        h = ScheduleHistory(str(tmp_path / "history.jsonl"), max_entries_per_schedule=5)
        # Write > MAX_TOTAL_ENTRIES entries (use a small number for testing)
        from src.scheduler import history as hist_mod
        orig = hist_mod.MAX_TOTAL_ENTRIES
        hist_mod.MAX_TOTAL_ENTRIES = 10
        try:
            for i in range(15):
                await h.record(schedule_id="a", description="a", action="check", status="success", duration_ms=i)
            removed = await h.prune()
            assert removed == 10  # 15 - 5 kept
            entries = await h.query("a")
            assert len(entries) == 5
        finally:
            hist_mod.MAX_TOTAL_ENTRIES = orig


# ---------------------------------------------------------------------------
# Tests — Scheduler integration
# ---------------------------------------------------------------------------

class TestSchedulerHistoryIntegration:
    """Test that Scheduler records execution history."""

    async def test_successful_execution_recorded(self, tmp_path):
        s = _make_scheduler(tmp_path)
        callback = AsyncMock()
        s.start(callback)

        schedule = await s.add("test", "reminder", "chan1", cron="*/5 * * * *")
        # Manually call _execute_and_record
        await s._execute_and_record(schedule)

        entries = await s.history.query(schedule["id"])
        assert len(entries) == 1
        assert entries[0]["status"] == "success"
        assert entries[0]["duration_ms"] >= 0

        await s.stop()

    async def test_failed_execution_recorded(self, tmp_path):
        s = _make_scheduler(tmp_path)
        callback = AsyncMock(side_effect=RuntimeError("boom"))
        s.start(callback)

        schedule = await s.add("test", "reminder", "chan1", cron="*/5 * * * *")
        await s._execute_and_record(schedule)

        entries = await s.history.query(schedule["id"])
        assert len(entries) == 1
        assert entries[0]["status"] == "failure"
        assert "boom" in entries[0]["error"]

        await s.stop()

    async def test_no_callback_no_history(self, tmp_path):
        s = _make_scheduler(tmp_path)
        schedule = await s.add("test", "reminder", "chan1", cron="*/5 * * * *")
        await s._execute_and_record(schedule)
        entries = await s.history.query(schedule["id"])
        assert len(entries) == 0

    async def test_tick_records_history(self, tmp_path):
        s = _make_scheduler(tmp_path)
        callback = AsyncMock()
        s._callback = callback

        # Add a cron schedule with next_run in the past so _tick fires it
        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        schedule = await s.add("tick test", "reminder", "chan1", cron="*/5 * * * *")
        # Force next_run to past
        s._schedules[0]["next_run"] = past

        await s._tick()

        entries = await s.history.query(schedule["id"])
        assert len(entries) == 1
        assert entries[0]["status"] == "success"

    async def test_trigger_records_history(self, tmp_path):
        s = _make_scheduler(tmp_path)
        callback = AsyncMock()
        s._callback = callback

        trigger = {"source": "github", "event": "push"}
        schedule = await s.add("trigger test", "reminder", "chan1", trigger=trigger)

        fired = await s.fire_triggers("github", {"event": "push"})
        assert fired == 1

        entries = await s.history.query(schedule["id"])
        assert len(entries) == 1
        assert entries[0]["status"] == "success"

    async def test_history_path_default(self, tmp_path):
        """History file defaults to same directory as schedules data."""
        s = Scheduler(str(tmp_path / "data" / "schedules.json"))
        assert s.history.path == tmp_path / "data" / "schedule_history.jsonl"

    async def test_retry_failure_recorded(self, tmp_path):
        s = _make_scheduler(tmp_path)
        callback = AsyncMock(side_effect=RuntimeError("fail"))
        s._callback = callback

        schedule = await s.add(
            "retry test", "reminder", "chan1",
            cron="*/5 * * * *", max_retries=2,
        )
        await s._execute_and_record(schedule)

        entries = await s.history.query(schedule["id"])
        assert len(entries) == 1
        assert entries[0]["status"] == "failure"
        assert entries[0]["retry_attempt"] == 1
