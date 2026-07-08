"""Coverage for src/scheduler/history.py (RFC-006 P19, safe).

Real ScheduleHistory against a tmp JSONL path — record (with error truncation +
retry field), query (schedule/status/limit filters + no-file guard), stats
(empty + computed), and prune (no-file, under-threshold no-op, excess removal,
and the auto-prune-during-record path). SAFE: async file I/O in tmp only; no
network, no scheduler execution.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from src.scheduler.history import ScheduleHistory


@pytest.fixture
def hist(tmp_path):
    return ScheduleHistory(path=str(tmp_path / "history.jsonl"))


async def _rec(hist, **kw):
    params = dict(schedule_id="s1", description="d", action="a",
                  status="success", duration_ms=10)
    params.update(kw)
    return await hist.record(**params)


class TestRecordAndQuery:
    async def test_record_and_filters(self, hist):
        await _rec(hist, schedule_id="s1", status="success")
        await _rec(hist, schedule_id="s1", status="failure")
        await _rec(hist, schedule_id="s2", status="success")
        assert len(await hist.query()) == 3                       # all
        assert len(await hist.query("s1")) == 2                   # by schedule
        assert len(await hist.query(status="success")) == 2       # by status
        assert len(await hist.query("s1", status="failure")) == 1  # combined
        assert len(await hist.query(limit=1)) == 1                # limit

    async def test_error_truncated_and_retry_recorded(self, hist):
        await _rec(hist, status="failure", error="x" * 600, retry_attempt=3)
        entry = (await hist.query("s1"))[0]
        assert len(entry["error"]) == 500 and entry["retry_attempt"] == 3

    async def test_query_missing_file(self, tmp_path):
        h = ScheduleHistory(path=str(tmp_path / "absent.jsonl"))
        assert await h.query() == []


class TestStats:
    async def test_empty(self, hist):
        s = await hist.stats("nope")
        assert s["total_runs"] == 0 and s["last_run"] is None

    async def test_computed(self, hist):
        await _rec(hist, status="success", duration_ms=10)
        await _rec(hist, status="failure", duration_ms=30)
        s = await hist.stats("s1")
        assert s["total_runs"] == 2 and s["successes"] == 1 and s["failures"] == 1
        assert s["avg_duration_ms"] == 20 and s["last_run"] is not None


class TestPrune:
    async def test_no_file(self, tmp_path):
        h = ScheduleHistory(path=str(tmp_path / "absent.jsonl"))
        assert await h.prune() == 0

    async def test_under_threshold_noop(self, hist):
        await _rec(hist)
        assert await hist.prune() == 0                            # <= MAX_TOTAL_ENTRIES

    async def test_removes_excess(self, tmp_path):
        h = ScheduleHistory(path=str(tmp_path / "h.jsonl"), max_entries_per_schedule=2)
        for i in range(5):
            await _rec(h, schedule_id="s1", duration_ms=i)
        with patch("src.scheduler.history.MAX_TOTAL_ENTRIES", 3):
            removed = await h.prune()                             # 5 rows, keep last 2
        assert removed == 3
        assert len(await h.query("s1")) == 2

    async def test_auto_prune_during_record(self, tmp_path):
        h = ScheduleHistory(path=str(tmp_path / "h.jsonl"), max_entries_per_schedule=1)
        h._auto_prune_interval = 2                                # prune every 2 records
        with patch("src.scheduler.history.MAX_TOTAL_ENTRIES", 1):
            for i in range(4):
                await _rec(h, schedule_id="s1", duration_ms=i)   # auto-prune fires mid-loop
        # only the most-recent-per-schedule survives the compaction
        assert len(await h.query("s1")) == 1


class TestIOErrors:
    """The defensive except arms — aiofiles.open raising is caught, not propagated."""

    async def test_record_write_failure_swallowed(self, hist):
        with patch("aiofiles.open", side_effect=OSError("disk full")):
            entry = await _rec(hist)               # write fails, is logged, entry still returned
        assert entry["schedule_id"] == "s1"

    async def test_query_read_failure_returns_empty(self, hist):
        await _rec(hist)                           # file now exists
        with patch("aiofiles.open", side_effect=OSError("io error")):
            assert await hist.query() == []

    async def test_prune_read_failure_returns_zero(self, hist):
        await _rec(hist)
        with patch("aiofiles.open", side_effect=OSError("io error")):
            assert await hist.prune() == 0
