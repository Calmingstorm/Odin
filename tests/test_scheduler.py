"""Tests for Scheduler — add/delete/tick/fire_triggers with async lock safety.

Covers:
- Basic add (cron, one-time, trigger, workflow, digest)
- Validation errors (missing fields, invalid cron, etc.)
- Delete existing and missing schedules
- Persistence (save/load round-trip)
- Tick fires due schedules and advances cron next_run
- One-time schedules removed after firing
- fire_triggers matches and fires webhook-triggered schedules
- Concurrent add/delete/tick operations are serialized by _lock
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from src.scheduler.scheduler import Scheduler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_scheduler(tmp_path: Path) -> Scheduler:
    return Scheduler(str(tmp_path / "schedules.json"))


# ---------------------------------------------------------------------------
# Tests — add()
# ---------------------------------------------------------------------------

class TestSchedulerAdd:
    """Test schedule creation and validation."""

    async def test_add_cron_schedule(self, tmp_path):
        s = _make_scheduler(tmp_path)
        result = await s.add("test cron", "reminder", "chan1", cron="*/5 * * * *")
        assert result["description"] == "test cron"
        assert result["action"] == "reminder"
        assert result["cron"] == "*/5 * * * *"
        assert result["one_time"] is False
        assert "next_run" in result
        assert len(s.list_all()) == 1

    async def test_add_one_time_schedule(self, tmp_path):
        s = _make_scheduler(tmp_path)
        run_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        result = await s.add("one-time", "reminder", "chan1", run_at=run_at)
        assert result["one_time"] is True
        assert result["next_run"] == run_at

    async def test_add_trigger_schedule(self, tmp_path):
        s = _make_scheduler(tmp_path)
        trigger = {"source": "github", "event": "push"}
        result = await s.add("gh push", "reminder", "chan1", trigger=trigger)
        assert result["trigger"] == trigger
        assert result["one_time"] is False

    async def test_add_check_schedule(self, tmp_path):
        s = _make_scheduler(tmp_path)
        result = await s.add(
            "disk check", "check", "chan1",
            cron="0 * * * *", tool_name="run_command", tool_input={"command": "df -h"},
        )
        assert result["tool_name"] == "run_command"
        assert result["tool_input"] == {"command": "df -h"}

    async def test_add_workflow_schedule(self, tmp_path):
        s = _make_scheduler(tmp_path)
        steps = [{"tool_name": "run_command", "tool_input": {"command": "echo hi"}}]
        result = await s.add("wf", "workflow", "chan1", cron="0 0 * * *", steps=steps)
        assert result["steps"] == steps

    async def test_add_digest_schedule(self, tmp_path):
        s = _make_scheduler(tmp_path)
        result = await s.add("daily digest", "digest", "chan1", cron="0 9 * * *")
        assert result["action"] == "digest"

    async def test_add_no_cron_or_run_at_or_trigger_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="Either 'cron', 'run_at', or 'trigger'"):
            await s.add("bad", "reminder", "chan1")

    async def test_add_invalid_cron_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="Invalid cron"):
            await s.add("bad cron", "reminder", "chan1", cron="not-a-cron")

    async def test_add_check_missing_tool_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="tool_name is required"):
            await s.add("no tool", "check", "chan1", cron="* * * * *")

    async def test_add_check_disallowed_tool_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="not allowed"):
            await s.add("bad tool", "check", "chan1", cron="* * * * *", tool_name="write_file")

    async def test_add_workflow_missing_steps_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="'steps'"):
            await s.add("no steps", "workflow", "chan1", cron="* * * * *")

    async def test_add_invalid_run_at_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="Invalid ISO datetime"):
            await s.add("bad time", "reminder", "chan1", run_at="not-a-date")

    async def test_add_invalid_trigger_key_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="Unknown trigger keys"):
            await s.add("bad", "reminder", "chan1", trigger={"bogus_key": "x"})


# ---------------------------------------------------------------------------
# Tests — delete()
# ---------------------------------------------------------------------------

class TestSchedulerDelete:
    async def test_delete_existing(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("to delete", "reminder", "chan1", cron="* * * * *")
        assert await s.delete(sched["id"]) is True
        assert len(s.list_all()) == 0

    async def test_delete_missing(self, tmp_path):
        s = _make_scheduler(tmp_path)
        assert await s.delete("nonexistent") is False


# ---------------------------------------------------------------------------
# Tests — persistence
# ---------------------------------------------------------------------------

class TestSchedulerPersistence:
    async def test_save_and_load_round_trip(self, tmp_path):
        s = _make_scheduler(tmp_path)
        await s.add("persist me", "reminder", "chan1", cron="0 * * * *")
        assert len(s.list_all()) == 1

        # Create a new scheduler pointing at the same file — it should load
        s2 = _make_scheduler(tmp_path)
        assert len(s2.list_all()) == 1
        assert s2.list_all()[0]["description"] == "persist me"

    async def test_delete_persists(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("delete me", "reminder", "chan1", cron="0 * * * *")
        await s.delete(sched["id"])

        s2 = _make_scheduler(tmp_path)
        assert len(s2.list_all()) == 0


# ---------------------------------------------------------------------------
# Tests — _tick()
# ---------------------------------------------------------------------------

class TestSchedulerTick:
    async def test_tick_fires_due_schedule(self, tmp_path):
        s = _make_scheduler(tmp_path)
        cb = AsyncMock()
        s._callback = cb

        # Add a schedule with next_run in the past
        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        sched = await s.add("fire me", "reminder", "chan1", run_at=past)

        await s._tick()
        cb.assert_called_once()
        assert cb.call_args[0][0]["id"] == sched["id"]

    async def test_tick_removes_one_time_after_firing(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        await s.add("one-shot", "reminder", "chan1", run_at=past)
        assert len(s.list_all()) == 1

        await s._tick()
        assert len(s.list_all()) == 0

    async def test_tick_advances_cron_next_run(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        # Manually set next_run to the past so tick fires it
        sched = await s.add("cron job", "reminder", "chan1", cron="*/5 * * * *")
        old_next = sched["next_run"]

        # Force next_run into the past
        async with s._lock:
            s._schedules[0]["next_run"] = (
                datetime.now(timezone.utc) - timedelta(minutes=1)
            ).isoformat()

        await s._tick()
        new_next = s.list_all()[0]["next_run"]
        assert new_next != old_next  # next_run was advanced
        assert s._callback.called

    async def test_tick_skips_future_schedules(self, tmp_path):
        s = _make_scheduler(tmp_path)
        cb = AsyncMock()
        s._callback = cb

        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        await s.add("not yet", "reminder", "chan1", run_at=future)

        await s._tick()
        cb.assert_not_called()
        assert len(s.list_all()) == 1  # still there

    async def test_tick_callback_error_does_not_crash(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock(side_effect=RuntimeError("boom"))

        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        await s.add("boom", "reminder", "chan1", run_at=past)

        # Should not raise
        await s._tick()


# ---------------------------------------------------------------------------
# Tests — fire_triggers()
# ---------------------------------------------------------------------------

class TestSchedulerFireTriggers:
    async def test_fire_triggers_matching(self, tmp_path):
        s = _make_scheduler(tmp_path)
        cb = AsyncMock()
        s._callback = cb

        trigger = {"source": "github", "event": "push"}
        await s.add("gh push", "reminder", "chan1", trigger=trigger)

        fired = await s.fire_triggers("github", {"event": "push"})
        assert fired == 1
        cb.assert_called_once()

    async def test_fire_triggers_no_match(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        trigger = {"source": "github", "event": "push"}
        await s.add("gh push", "reminder", "chan1", trigger=trigger)

        fired = await s.fire_triggers("gitlab", {"event": "push"})
        assert fired == 0

    async def test_fire_triggers_no_callback(self, tmp_path):
        s = _make_scheduler(tmp_path)
        trigger = {"source": "github"}
        await s.add("no cb", "reminder", "chan1", trigger=trigger)
        assert await s.fire_triggers("github", {}) == 0


# ---------------------------------------------------------------------------
# Tests — concurrency safety
# ---------------------------------------------------------------------------

class TestSchedulerConcurrency:
    async def test_concurrent_adds_are_serialized(self, tmp_path):
        """Multiple concurrent add() calls should all succeed without data loss."""
        s = _make_scheduler(tmp_path)
        tasks = [
            s.add(f"task-{i}", "reminder", "chan1", cron="* * * * *")
            for i in range(20)
        ]
        results = await asyncio.gather(*tasks)
        assert len(results) == 20
        assert len(s.list_all()) == 20
        # Verify persisted
        s2 = _make_scheduler(tmp_path)
        assert len(s2.list_all()) == 20

    async def test_concurrent_add_and_delete(self, tmp_path):
        """Add and delete running concurrently should not corrupt state."""
        s = _make_scheduler(tmp_path)
        # Pre-populate
        schedules = []
        for i in range(10):
            sched = await s.add(f"pre-{i}", "reminder", "chan1", cron="* * * * *")
            schedules.append(sched)

        # Concurrently delete half and add new ones
        delete_tasks = [s.delete(schedules[i]["id"]) for i in range(5)]
        add_tasks = [
            s.add(f"new-{i}", "reminder", "chan1", cron="* * * * *")
            for i in range(5)
        ]
        await asyncio.gather(*delete_tasks, *add_tasks)
        # 10 - 5 deleted + 5 added = 10
        assert len(s.list_all()) == 10

    async def test_concurrent_add_and_tick(self, tmp_path):
        """add() and _tick() should not interfere with each other."""
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        # Add a schedule that will fire on tick
        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        await s.add("fire me", "reminder", "chan1", run_at=past)

        # Run tick and add concurrently
        add_task = s.add("concurrent", "reminder", "chan1", cron="* * * * *")
        tick_task = s._tick()
        await asyncio.gather(add_task, tick_task)

        # The one-time was removed, the new cron was added
        remaining = s.list_all()
        assert len(remaining) == 1
        assert remaining[0]["description"] == "concurrent"


# ---------------------------------------------------------------------------
# Tests — update()
# ---------------------------------------------------------------------------

class TestSchedulerUpdate:
    """Test schedule update (partial modification)."""

    async def test_update_description(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("original", "reminder", "chan1", cron="*/5 * * * *")
        updated = await s.update(sched["id"], description="renamed")
        assert updated is not None
        assert updated["description"] == "renamed"
        assert s.list_all()[0]["description"] == "renamed"

    async def test_update_message(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("reminder", "reminder", "chan1", cron="0 9 * * *", message="old msg")
        updated = await s.update(sched["id"], message="new msg")
        assert updated["message"] == "new msg"

    async def test_update_channel_id(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("test", "reminder", "chan1", cron="0 * * * *")
        updated = await s.update(sched["id"], channel_id="chan2")
        assert updated["channel_id"] == "chan2"

    async def test_update_cron_expression(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("cron job", "reminder", "chan1", cron="*/5 * * * *")
        old_next = sched["next_run"]
        updated = await s.update(sched["id"], cron="0 12 * * *")
        assert updated["cron"] == "0 12 * * *"
        assert updated["next_run"] != old_next
        assert updated["one_time"] is False

    async def test_update_cron_to_one_time(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("was cron", "reminder", "chan1", cron="*/5 * * * *")
        run_at = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        updated = await s.update(sched["id"], run_at=run_at)
        assert "cron" not in updated
        assert updated["run_at"] == run_at
        assert updated["one_time"] is True

    async def test_update_one_time_to_cron(self, tmp_path):
        s = _make_scheduler(tmp_path)
        run_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        sched = await s.add("was one-time", "reminder", "chan1", run_at=run_at)
        updated = await s.update(sched["id"], cron="0 * * * *")
        assert "run_at" not in updated
        assert updated["cron"] == "0 * * * *"
        assert updated["one_time"] is False

    async def test_update_to_trigger(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("was cron", "reminder", "chan1", cron="0 * * * *")
        trigger = {"source": "github", "event": "push"}
        updated = await s.update(sched["id"], trigger=trigger)
        assert "cron" not in updated
        assert "next_run" not in updated
        assert updated["trigger"] == trigger
        assert updated["one_time"] is False

    async def test_update_nonexistent_returns_none(self, tmp_path):
        s = _make_scheduler(tmp_path)
        result = await s.update("bogus", description="nope")
        assert result is None

    async def test_update_invalid_cron_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("test", "reminder", "chan1", cron="0 * * * *")
        with pytest.raises(ValueError, match="Invalid cron"):
            await s.update(sched["id"], cron="not-valid")

    async def test_update_invalid_run_at_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("test", "reminder", "chan1", cron="0 * * * *")
        with pytest.raises(ValueError, match="Invalid ISO datetime"):
            await s.update(sched["id"], run_at="not-a-date")

    async def test_update_invalid_trigger_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("test", "reminder", "chan1", cron="0 * * * *")
        with pytest.raises(ValueError, match="Unknown trigger keys"):
            await s.update(sched["id"], trigger={"bad_key": "x"})

    async def test_update_check_disallowed_tool_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add(
            "check", "check", "chan1",
            cron="0 * * * *", tool_name="run_command", tool_input={"command": "df -h"},
        )
        with pytest.raises(ValueError, match="not allowed"):
            await s.update(sched["id"], tool_name="write_file")

    async def test_update_workflow_invalid_steps_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        steps = [{"tool_name": "run_command", "tool_input": {"command": "echo hi"}}]
        sched = await s.add("wf", "workflow", "chan1", cron="0 0 * * *", steps=steps)
        with pytest.raises(ValueError, match="Step 0"):
            await s.update(sched["id"], steps=[{"bad": "step"}])

    async def test_update_persists(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("persist", "reminder", "chan1", cron="0 * * * *")
        await s.update(sched["id"], description="updated")
        # Reload from disk
        s2 = _make_scheduler(tmp_path)
        assert s2.list_all()[0]["description"] == "updated"

    async def test_update_tool_input(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add(
            "check", "check", "chan1",
            cron="0 * * * *", tool_name="run_command",
            tool_input={"command": "df -h", "host": "server1"},
        )
        updated = await s.update(sched["id"], tool_input={"command": "free -m", "host": "server1"})
        assert updated["tool_input"]["command"] == "free -m"

    async def test_update_no_fields_still_persists(self, tmp_path):
        """Calling update with no changed fields returns the schedule unchanged."""
        s = _make_scheduler(tmp_path)
        sched = await s.add("stable", "reminder", "chan1", cron="0 * * * *")
        updated = await s.update(sched["id"])
        assert updated["description"] == "stable"

    async def test_concurrent_updates_serialized(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("concurrent", "reminder", "chan1", cron="0 * * * *")
        tasks = [
            s.update(sched["id"], description=f"v{i}")
            for i in range(10)
        ]
        results = await asyncio.gather(*tasks)
        assert all(r is not None for r in results)
        # Final state should be one of the updates
        final = s.list_all()[0]["description"]
        assert final.startswith("v")
