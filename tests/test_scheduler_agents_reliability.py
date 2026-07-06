"""Tests for scheduler / autonomous-loop / agent reliability fixes (PR2).

Covers:
- 2.3 autonomous-loop error path backs off instead of tight-looping
- LoopManager.shutdown() cancels+awaits; cleanup_finished handles no last_trigger
- 2.4 Scheduler.start() and InfraWatcher.start() are idempotent
- per-schedule overlap/dedup guard
- retry backoff off-by-one (first retry waits base, not 2*base)
- _compute_tick_delay honors retry_at
- per-schedule cron timezone
- agent kill force-cancels the task (not cooperative-only)
- plan_id collisions + 0600 file perms
"""
from __future__ import annotations

import asyncio
import os
import stat
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from src.scheduler.scheduler import Scheduler, _cron_next_run
from src.tools.autonomous_loop import LoopInfo, LoopManager
from src.planning.store import PlanStore


# ---------------------------------------------------------------------------
# 2.3 — autonomous-loop error backoff
# ---------------------------------------------------------------------------

def _loop_info(**kw) -> LoopInfo:
    defaults = dict(
        id="lp1", goal="g", mode="silent", interval_seconds=10,
        stop_condition=None, max_iterations=3, channel_id="c",
        requester_id="u", requester_name="U",
    )
    defaults.update(kw)
    return LoopInfo(**defaults)


class _SilentChannel:
    async def send(self, *_a, **_k):
        return None


async def test_error_iterations_back_off_and_do_not_skip_wait(monkeypatch):
    """Every failing iteration must wait (exponential backoff) before retrying;
    the old `continue` skipped the wait entirely and hammered the endpoint."""
    manager = LoopManager()
    info = _loop_info(interval_seconds=10, max_iterations=3)
    waits: list[float] = []

    async def _record_wait(_info, seconds):
        waits.append(seconds)
        return False  # not cancelled

    monkeypatch.setattr(manager, "_interruptible_wait", _record_wait)

    async def _always_fail(_prompt, _channel, _prev):
        raise RuntimeError("boom")

    await manager._run_loop(info, _SilentChannel(), _always_fail)

    # One wait per failed iteration, growing: 10·2¹, 10·2², 10·2³.
    assert waits == [20, 40, 80]


async def test_successful_iteration_waits_plain_interval(monkeypatch):
    manager = LoopManager()
    info = _loop_info(interval_seconds=15, max_iterations=2)
    waits: list[float] = []

    async def _record_wait(_info, seconds):
        waits.append(seconds)
        return False

    monkeypatch.setattr(manager, "_interruptible_wait", _record_wait)

    async def _ok(_prompt, _channel, _prev):
        return "done"

    await manager._run_loop(info, _SilentChannel(), _ok)
    assert waits == [15, 15]  # no backoff on success


# ---------------------------------------------------------------------------
# LoopManager.shutdown / cleanup_finished
# ---------------------------------------------------------------------------

async def test_shutdown_cancels_and_awaits_loop_tasks():
    manager = LoopManager()
    started = asyncio.Event()

    async def _forever(_prompt, _channel, _prev):
        started.set()
        await asyncio.sleep(3600)

    loop_id = manager.start_loop(
        goal="g", channel=_SilentChannel(), requester_id="u",
        requester_name="U", iteration_callback=_forever,
        interval_seconds=10, mode="silent", max_iterations=100,
    )
    await asyncio.wait_for(started.wait(), timeout=2)
    task = manager._loops[loop_id]._task

    await manager.shutdown()

    assert task.done()
    assert manager._loops[loop_id].status == "stopped"


def test_cleanup_finished_removes_loop_with_no_last_trigger():
    manager = LoopManager()
    info = _loop_info()
    info.status = "stopped"
    info.last_trigger = None  # stopped before first iteration
    manager._loops[info.id] = info

    manager.cleanup_finished()
    assert info.id not in manager._loops


def test_cleanup_finished_keeps_running_loops():
    manager = LoopManager()
    info = _loop_info()
    info.status = "running"
    info.last_trigger = None
    manager._loops[info.id] = info

    manager.cleanup_finished()
    assert info.id in manager._loops


# ---------------------------------------------------------------------------
# 2.4 — Scheduler.start idempotency
# ---------------------------------------------------------------------------

async def test_scheduler_start_is_idempotent(tmp_path):
    sched = Scheduler(str(tmp_path / "schedules.json"))

    async def _cb(_s):
        return None

    sched.start(_cb)
    first_task = sched._task
    sched.start(_cb)  # simulate a second on_ready
    try:
        assert sched._task is first_task  # no second loop task
    finally:
        await sched.stop()


# ---------------------------------------------------------------------------
# Overlap / dedup guard
# ---------------------------------------------------------------------------

async def test_execute_skips_when_already_in_flight(tmp_path):
    sched = Scheduler(str(tmp_path / "schedules.json"))
    calls = []

    async def _cb(schedule):
        calls.append(schedule["id"])

    sched.start(_cb)
    try:
        schedule = {"id": "s1", "action": "reminder", "description": "d"}
        sched._in_flight.add("s1")  # pretend a tick is mid-execution
        await sched._execute_and_record(schedule)
        assert calls == []  # skipped
    finally:
        await sched.stop()


async def test_execute_runs_and_clears_in_flight(tmp_path):
    sched = Scheduler(str(tmp_path / "schedules.json"))
    calls = []

    async def _cb(schedule):
        calls.append(schedule["id"])

    sched.start(_cb)
    try:
        schedule = {"id": "s2", "action": "reminder", "description": "d",
                    "max_retries": 0}
        await sched._execute_and_record(schedule)
        assert calls == ["s2"]
        assert "s2" not in sched._in_flight  # cleared in finally
    finally:
        await sched.stop()


# ---------------------------------------------------------------------------
# Retry backoff off-by-one + tick delay honoring retry_at
# ---------------------------------------------------------------------------

def test_first_retry_waits_base_not_double(tmp_path):
    sched = Scheduler(str(tmp_path / "schedules.json"))
    # retry_count is incremented to 1 before _compute_retry_at is called.
    schedule = {"retry_count": 1, "retry_backoff_seconds": 60}
    retry_at = datetime.fromisoformat(sched._compute_retry_at(schedule))
    delay = (retry_at - datetime.now(timezone.utc)).total_seconds()
    assert 55 <= delay <= 61  # ~base (60), not 120


def test_second_retry_doubles(tmp_path):
    sched = Scheduler(str(tmp_path / "schedules.json"))
    schedule = {"retry_count": 2, "retry_backoff_seconds": 60}
    retry_at = datetime.fromisoformat(sched._compute_retry_at(schedule))
    delay = (retry_at - datetime.now(timezone.utc)).total_seconds()
    assert 115 <= delay <= 121  # base·2¹ = 120


def test_tick_delay_accounts_for_retry_at(tmp_path):
    sched = Scheduler(str(tmp_path / "schedules.json"))
    soon = (datetime.now(timezone.utc) + timedelta(seconds=3)).isoformat()
    sched._schedules = [{"id": "r", "retry_at": soon}]
    delay = sched._compute_tick_delay()
    assert delay <= 4  # would have been 60 when retry_at was ignored


# ---------------------------------------------------------------------------
# Per-schedule cron timezone
# ---------------------------------------------------------------------------

def test_cron_next_run_respects_timezone():
    # 9am in America/New_York is 13:00 (EDT) or 14:00 (EST) UTC.
    ny = _cron_next_run("0 9 * * *", "America/New_York")
    parsed = datetime.fromisoformat(ny)
    assert parsed.tzinfo is not None
    assert parsed.astimezone(timezone.utc).hour in (13, 14)
    assert parsed.minute == 0


def test_cron_next_run_defaults_utc():
    utc = _cron_next_run("30 6 * * *", None)
    parsed = datetime.fromisoformat(utc).astimezone(timezone.utc)
    assert parsed.hour == 6 and parsed.minute == 30


async def test_add_stores_timezone_and_future_next_run(tmp_path):
    sched = Scheduler(str(tmp_path / "schedules.json"))
    s = await sched.add(
        description="daily", action="reminder", channel_id="c",
        cron="0 9 * * *", message="hi", cron_timezone="America/New_York",
    )
    assert s["timezone"] == "America/New_York"
    assert datetime.fromisoformat(s["next_run"]).astimezone(timezone.utc) > datetime.now(timezone.utc)


async def test_add_rejects_invalid_timezone(tmp_path):
    sched = Scheduler(str(tmp_path / "schedules.json"))
    with pytest.raises(ValueError, match="[Ii]nvalid timezone"):
        await sched.add(
            description="x", action="reminder", channel_id="c",
            cron="0 9 * * *", message="hi", cron_timezone="Mars/Phobos",
        )


# ---------------------------------------------------------------------------
# Agent kill force-cancel
# ---------------------------------------------------------------------------

async def test_force_cancel_sets_event_and_cancels_task():
    from src.agents.manager import AgentManager

    async def _sleep_forever():
        await asyncio.sleep(3600)

    task = asyncio.create_task(_sleep_forever())
    await asyncio.sleep(0)  # let it start
    agent = SimpleNamespace(_cancel_event=asyncio.Event(), _task=task)

    AgentManager._force_cancel(agent)
    assert agent._cancel_event.is_set()
    await asyncio.sleep(0)
    assert task.cancelled() or task.done()
    with pytest.raises(asyncio.CancelledError):
        await task


async def test_force_cancel_tolerates_missing_task():
    from src.agents.manager import AgentManager
    agent = SimpleNamespace(_cancel_event=asyncio.Event(), _task=None)
    AgentManager._force_cancel(agent)  # must not raise
    assert agent._cancel_event.is_set()


async def test_check_health_force_cancels_stuck_task(monkeypatch):
    """The safety-net path must actually cancel the task, not just set the
    cooperative flag a stuck tool call ignores (Odin's PR#124 blocker)."""
    import src.agents.manager as mgr_mod
    from src.agents.manager import AgentManager

    manager = AgentManager()

    async def _sleep_forever():
        await asyncio.sleep(3600)

    task = asyncio.create_task(_sleep_forever())
    await asyncio.sleep(0)

    sm = MagicMock()
    sm.is_terminal = False
    agent = SimpleNamespace(
        _sm=sm, _cancel_event=asyncio.Event(), _task=task,
        id="a1", label="stuck",
        created_at=0.0,          # far in the past → lifetime exceeded
        last_activity=time.time(),
    )
    manager._agents["a1"] = agent
    # Ensure the lifetime threshold is exceeded regardless of its constant.
    monkeypatch.setattr(mgr_mod, "MAX_AGENT_LIFETIME", 1.0)

    result = manager.check_health()
    assert result["killed"] == 1
    assert agent._cancel_event.is_set()
    await asyncio.sleep(0)
    assert task.cancelled() or task.done()
    with pytest.raises(asyncio.CancelledError):
        await task


# ---------------------------------------------------------------------------
# Plan store — id uniqueness + perms
# ---------------------------------------------------------------------------

def test_plan_ids_unique_within_same_second(tmp_path):
    store = PlanStore(str(tmp_path / "plans.json"))
    p1 = store.create(user_id="user1234", channel_id="c", original_request="r", summary="s")
    p2 = store.create(user_id="user1234", channel_id="c", original_request="r", summary="s")
    assert p1.plan_id != p2.plan_id
    assert len(store._plans) == 2  # no overwrite


def test_plans_file_is_not_world_readable(tmp_path):
    path = tmp_path / "plans.json"
    store = PlanStore(str(path))
    store.create(user_id="u", channel_id="c", original_request="secret request", summary="s")
    mode = stat.S_IMODE(os.stat(path).st_mode)
    assert mode == 0o600


def test_cleanup_removes_untriggered_loop_even_on_fresh_boot(monkeypatch):
    """Regression: `last_trigger or 0` on the monotonic clock kept
    never-triggered stopped loops alive for an hour after a fresh boot
    (monotonic < 3600); the intent was "immediately stale" (RFC-003 P0)."""
    import time as _time

    monkeypatch.setattr(_time, "monotonic", lambda: 42.0)  # young machine
    manager = LoopManager()
    info = _loop_info()
    info.status = "stopped"
    info.last_trigger = None
    manager._loops[info.id] = info

    manager.cleanup_finished()
    assert info.id not in manager._loops
