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
- Retry with exponential backoff on failure
- Failure tracking (consecutive_failures, last_error, last_error_at)
- Failure alert callback at threshold
- Reset failures API
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
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
        run_at = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
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

class TestOneTimingModeOnly:
    """A schedule fires one way, and used to keep whichever won a hidden race.

    add() and update() preferred trigger, then cron, then run_at, and dropped
    the rest silently — so a form that left Cron populated while the operator
    filled in a one-time date created a RECURRING schedule and reported
    success. Rejecting is the only answer that cannot surprise anyone.
    """

    async def test_cron_and_run_at_together_are_rejected(self, tmp_path):
        s = _make_scheduler(tmp_path)
        run_at = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
        with pytest.raises(ValueError, match="exactly one"):
            await s.add("both", "reminder", "chan1", cron="*/5 * * * *", run_at=run_at)
        assert s.list_all() == []

    async def test_trigger_and_cron_together_are_rejected(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="exactly one"):
            await s.add(
                "both", "reminder", "chan1",
                cron="*/5 * * * *", trigger={"type": "webhook", "name": "x"},
            )

    async def test_the_message_names_what_was_supplied(self, tmp_path):
        s = _make_scheduler(tmp_path)
        run_at = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
        with pytest.raises(ValueError) as exc:
            await s.add("both", "reminder", "chan1", cron="*/5 * * * *", run_at=run_at)
        assert "cron" in str(exc.value) and "run_at" in str(exc.value)

    async def test_update_rejects_two_timing_modes(self, tmp_path):
        s = _make_scheduler(tmp_path)
        created = await s.add("job", "reminder", "chan1", cron="*/5 * * * *")
        run_at = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
        with pytest.raises(ValueError, match="exactly one"):
            await s.update(created["id"], cron="0 * * * *", run_at=run_at)
        # The original timing survives a rejected update.
        assert s.list_all()[0]["cron"] == "*/5 * * * *"

    async def test_a_single_mode_still_works(self, tmp_path):
        s = _make_scheduler(tmp_path)
        created = await s.add("job", "reminder", "chan1", cron="*/5 * * * *")
        updated = await s.update(created["id"], cron="0 * * * *")
        assert updated["cron"] == "0 * * * *"


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
        past = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
        sched = await s.add("fire me", "reminder", "chan1", run_at=past)

        await s._tick()
        cb.assert_called_once()
        assert cb.call_args[0][0]["id"] == sched["id"]

    async def test_tick_removes_one_time_after_firing(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        past = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
        await s.add("one-shot", "reminder", "chan1", run_at=past)
        assert len(s.list_all()) == 1

        await s._tick()
        assert len(s.list_all()) == 0

    async def test_tick_advances_cron_next_run(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        # Manually set next_run to the past so tick fires it
        sched = await s.add("cron job", "reminder", "chan1", cron="*/5 * * * *")
        sched["next_run"]

        # Force next_run far enough into the past that the next cron fire differs
        async with s._lock:
            s._schedules[0]["next_run"] = (
                datetime.now(UTC) - timedelta(minutes=10)
            ).isoformat()
        forced_next = s.list_all()[0]["next_run"]

        await s._tick()
        new_next = s.list_all()[0]["next_run"]
        assert new_next != forced_next  # next_run was advanced past the forced value
        assert s._callback.called

    async def test_tick_skips_future_schedules(self, tmp_path):
        s = _make_scheduler(tmp_path)
        cb = AsyncMock()
        s._callback = cb

        future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
        await s.add("not yet", "reminder", "chan1", run_at=future)

        await s._tick()
        cb.assert_not_called()
        assert len(s.list_all()) == 1  # still there

    async def test_tick_callback_error_does_not_crash(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock(side_effect=RuntimeError("boom"))

        past = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
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
        past = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
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
        """next_run must follow the NEW cron.

        This used to assert only that next_run CHANGED, which is a coincidence
        of the wall clock: between 11:55 and 12:00 UTC, "*/5 * * * *" and
        "0 12 * * *" both resolve to 12:00:00 and the test failed for five
        minutes a day. Compare against the new expression instead.
        """
        from src.scheduler.scheduler import _cron_next_run

        s = _make_scheduler(tmp_path)
        sched = await s.add("cron job", "reminder", "chan1", cron="*/5 * * * *")
        updated = await s.update(sched["id"], cron="0 12 * * *")
        assert updated["cron"] == "0 12 * * *"
        assert updated["next_run"] == _cron_next_run("0 12 * * *")
        assert updated["one_time"] is False

    async def test_update_cron_to_one_time(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("was cron", "reminder", "chan1", cron="*/5 * * * *")
        run_at = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
        updated = await s.update(sched["id"], run_at=run_at)
        assert "cron" not in updated
        assert updated["run_at"] == run_at
        assert updated["one_time"] is True

    async def test_update_one_time_to_cron(self, tmp_path):
        s = _make_scheduler(tmp_path)
        run_at = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
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


# ---------------------------------------------------------------------------
# Tests — retry & failure tracking
# ---------------------------------------------------------------------------

class TestSchedulerRetry:
    """Test retry with exponential backoff and failure tracking."""

    async def test_add_with_retry_config(self, tmp_path):
        s = _make_scheduler(tmp_path)
        result = await s.add(
            "retryable", "reminder", "chan1",
            cron="*/5 * * * *", max_retries=3, retry_backoff_seconds=30,
        )
        assert result["max_retries"] == 3
        assert result["retry_backoff_seconds"] == 30
        assert result["consecutive_failures"] == 0
        assert result["retry_count"] == 0
        assert result["last_error"] is None

    async def test_add_default_retry_config(self, tmp_path):
        s = _make_scheduler(tmp_path)
        result = await s.add("no retry", "reminder", "chan1", cron="*/5 * * * *")
        assert result["max_retries"] == 0
        assert result["retry_backoff_seconds"] == 60
        assert result["consecutive_failures"] == 0

    async def test_add_negative_max_retries_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="max_retries must be >= 0"):
            await s.add("bad", "reminder", "chan1", cron="* * * * *", max_retries=-1)

    async def test_add_zero_backoff_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="retry_backoff_seconds must be >= 1"):
            await s.add("bad", "reminder", "chan1", cron="* * * * *", retry_backoff_seconds=0)

    async def test_tick_failure_increments_counters(self, tmp_path):
        """Failure should increment consecutive_failures and record error."""
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock(side_effect=RuntimeError("disk full"))

        past = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
        await s.add("fail me", "reminder", "chan1", run_at=past)

        await s._tick()

        # Use an independent persistence file for the recurring case.
        recurring_path = tmp_path / "recurring"
        recurring_path.mkdir()
        s2 = _make_scheduler(recurring_path)
        s2._callback = AsyncMock(side_effect=RuntimeError("disk full"))
        await s2.add("cron fail", "reminder", "chan1", cron="*/5 * * * *")

        # Force next_run into the past
        async with s2._lock:
            s2._schedules[0]["next_run"] = (
                datetime.now(UTC) - timedelta(minutes=1)
            ).isoformat()

        await s2._tick()
        state = s2.list_all()[0]
        assert state["consecutive_failures"] == 1
        assert state["last_error"] == "disk full"
        assert state["last_error_at"] is not None

    async def test_tick_success_resets_counters(self, tmp_path):
        """Success after failure should reset consecutive_failures."""
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        await s.add("recover", "reminder", "chan1", cron="*/5 * * * *")

        # Manually set failure state
        async with s._lock:
            s._schedules[0]["consecutive_failures"] = 5
            s._schedules[0]["last_error"] = "old error"
            s._schedules[0]["last_error_at"] = datetime.now(UTC).isoformat()
            s._schedules[0]["next_run"] = (
                datetime.now(UTC) - timedelta(minutes=1)
            ).isoformat()

        await s._tick()
        state = s.list_all()[0]
        assert state["consecutive_failures"] == 0
        assert state["retry_count"] == 0

    async def test_tick_schedules_retry_on_failure(self, tmp_path):
        """With max_retries > 0, failure should schedule a retry."""
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock(side_effect=RuntimeError("timeout"))

        await s.add(
            "retryable", "reminder", "chan1",
            cron="*/5 * * * *", max_retries=3, retry_backoff_seconds=60,
        )

        # Force next_run into the past
        async with s._lock:
            s._schedules[0]["next_run"] = (
                datetime.now(UTC) - timedelta(minutes=1)
            ).isoformat()

        await s._tick()
        state = s.list_all()[0]
        assert state["retry_count"] == 1
        assert state["consecutive_failures"] == 1
        assert "retry_at" in state

    async def test_retry_fires_on_tick(self, tmp_path):
        """Pending retry should fire when retry_at is in the past."""
        s = _make_scheduler(tmp_path)

        # First call fails, second succeeds
        call_count = 0
        async def flaky_callback(schedule):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("transient")

        s._callback = flaky_callback

        await s.add(
            "flaky", "reminder", "chan1",
            cron="*/5 * * * *", max_retries=3, retry_backoff_seconds=60,
        )

        # Force next_run into the past for first tick
        async with s._lock:
            s._schedules[0]["next_run"] = (
                datetime.now(UTC) - timedelta(minutes=1)
            ).isoformat()

        await s._tick()
        assert call_count == 1
        state = s.list_all()[0]
        assert state["retry_count"] == 1
        assert "retry_at" in state

        # Force retry_at into the past
        async with s._lock:
            s._schedules[0]["retry_at"] = (
                datetime.now(UTC) - timedelta(seconds=1)
            ).isoformat()

        await s._tick()
        assert call_count == 2
        state = s.list_all()[0]
        assert state["retry_count"] == 0  # reset on success
        assert state["consecutive_failures"] == 0
        assert "retry_at" not in state

    async def test_retry_exhaustion(self, tmp_path):
        """When retries are exhausted, retry_at should be cleared."""
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock(side_effect=RuntimeError("permanent"))

        await s.add(
            "doomed", "reminder", "chan1",
            cron="*/5 * * * *", max_retries=2, retry_backoff_seconds=10,
        )

        # Fire initial — schedules retry 1
        async with s._lock:
            s._schedules[0]["next_run"] = (
                datetime.now(UTC) - timedelta(minutes=1)
            ).isoformat()
        await s._tick()
        assert s.list_all()[0]["retry_count"] == 1

        # Fire retry 1 — schedules retry 2
        async with s._lock:
            s._schedules[0]["retry_at"] = (
                datetime.now(UTC) - timedelta(seconds=1)
            ).isoformat()
        await s._tick()
        assert s.list_all()[0]["retry_count"] == 2

        # Fire retry 2 — exhausted, no more retries
        async with s._lock:
            s._schedules[0]["retry_at"] = (
                datetime.now(UTC) - timedelta(seconds=1)
            ).isoformat()
        await s._tick()
        state = s.list_all()[0]
        assert "retry_at" not in state  # no more retries
        assert state["consecutive_failures"] == 3

    async def test_one_time_not_removed_while_retrying(self, tmp_path):
        """One-time schedule should not be removed if retry is pending."""
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock(side_effect=RuntimeError("fail"))

        past = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
        await s.add(
            "one-shot retry", "reminder", "chan1",
            run_at=past, max_retries=2, retry_backoff_seconds=10,
        )

        await s._tick()
        # Should NOT be removed — retry is pending
        assert len(s.list_all()) == 1
        assert s.list_all()[0].get("retry_at") is not None

    async def test_exponential_backoff_grows(self, tmp_path):
        """Each retry should have a longer backoff (exponential)."""
        s = _make_scheduler(tmp_path)
        schedule = {
            "id": "test",
            "retry_count": 0,
            "retry_backoff_seconds": 60,
        }
        t1 = datetime.fromisoformat(s._compute_retry_at(schedule))

        schedule["retry_count"] = 1
        t2 = datetime.fromisoformat(s._compute_retry_at(schedule))

        schedule["retry_count"] = 2
        t3 = datetime.fromisoformat(s._compute_retry_at(schedule))

        # Each should be progressively further in the future
        # (relative to now, backoff doubles: 60, 120, 240)
        # We can't check exact times, but t2 > t1 and t3 > t2
        assert t2 > t1
        assert t3 > t2

    async def test_backoff_capped_at_max(self, tmp_path):
        """Backoff should not exceed MAX_BACKOFF_SECONDS."""
        from src.scheduler.scheduler import MAX_BACKOFF_SECONDS
        s = _make_scheduler(tmp_path)
        schedule = {
            "id": "test",
            "retry_count": 20,  # very high, would be 60 * 2^20 without cap
            "retry_backoff_seconds": 60,
        }
        now = datetime.now(UTC)
        retry_at = datetime.fromisoformat(s._compute_retry_at(schedule))
        # Should be at most MAX_BACKOFF_SECONDS from now (+ small tolerance)
        diff = (retry_at - now).total_seconds()
        assert diff <= MAX_BACKOFF_SECONDS + 2  # 2s tolerance for execution time

    async def test_fire_triggers_tracks_failure(self, tmp_path):
        """fire_triggers should also track failures."""
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock(side_effect=RuntimeError("webhook fail"))

        trigger = {"source": "github", "event": "push"}
        await s.add("gh push", "reminder", "chan1", trigger=trigger)

        await s.fire_triggers("github", {"event": "push"})
        state = s.list_all()[0]
        assert state["consecutive_failures"] == 1
        assert state["last_error"] == "webhook fail"

    async def test_fire_triggers_resets_on_success(self, tmp_path):
        """Successful trigger should reset failure state."""
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        trigger = {"source": "github", "event": "push"}
        await s.add("gh push", "reminder", "chan1", trigger=trigger)

        # Set pre-existing failures
        async with s._lock:
            s._schedules[0]["consecutive_failures"] = 3
            s._schedules[0]["last_error"] = "old"

        await s.fire_triggers("github", {"event": "push"})
        state = s.list_all()[0]
        assert state["consecutive_failures"] == 0


# ---------------------------------------------------------------------------
# Tests — failure alert callback
# ---------------------------------------------------------------------------

class TestSchedulerFailureAlerts:
    """Test failure alert callback firing at threshold."""

    async def test_alert_fires_at_threshold(self, tmp_path):
        """Failure callback fires when consecutive_failures hits threshold."""
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock(side_effect=RuntimeError("down"))
        alert_cb = AsyncMock()
        s._failure_callback = alert_cb

        await s.add("alertable", "reminder", "chan1", cron="*/5 * * * *")

        # Run 3 failures (DEFAULT_FAILURE_ALERT_THRESHOLD = 3)
        for i in range(3):
            async with s._lock:
                s._schedules[0]["next_run"] = (
                    datetime.now(UTC) - timedelta(minutes=1)
                ).isoformat()
                # Clear retry_at to allow next_run to fire
                s._schedules[0].pop("retry_at", None)
            await s._tick()

        # Alert should have been called once (at failure #3)
        alert_cb.assert_called_once()
        call_args = alert_cb.call_args
        assert call_args[0][1] == 3  # consecutive_failures count

    async def test_alert_fires_again_at_multiple(self, tmp_path):
        """Alert fires again at 2x threshold."""
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock(side_effect=RuntimeError("still down"))
        alert_cb = AsyncMock()
        s._failure_callback = alert_cb

        await s.add("multi-alert", "reminder", "chan1", cron="*/5 * * * *")

        for i in range(6):
            async with s._lock:
                s._schedules[0]["next_run"] = (
                    datetime.now(UTC) - timedelta(minutes=1)
                ).isoformat()
                s._schedules[0].pop("retry_at", None)
            await s._tick()

        # Alert at 3 and 6
        assert alert_cb.call_count == 2

    async def test_alert_not_fired_below_threshold(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock(side_effect=RuntimeError("flaky"))
        alert_cb = AsyncMock()
        s._failure_callback = alert_cb

        await s.add("below", "reminder", "chan1", cron="*/5 * * * *")

        for i in range(2):
            async with s._lock:
                s._schedules[0]["next_run"] = (
                    datetime.now(UTC) - timedelta(minutes=1)
                ).isoformat()
                s._schedules[0].pop("retry_at", None)
            await s._tick()

        alert_cb.assert_not_called()


# ---------------------------------------------------------------------------
# Tests — reset_failures()
# ---------------------------------------------------------------------------

class TestSchedulerResetFailures:
    async def test_reset_failures(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("failing", "reminder", "chan1", cron="*/5 * * * *")

        # Simulate failure state
        async with s._lock:
            s._schedules[0]["consecutive_failures"] = 5
            s._schedules[0]["retry_count"] = 2
            s._schedules[0]["last_error"] = "some error"
            s._schedules[0]["last_error_at"] = datetime.now(UTC).isoformat()
            s._schedules[0]["retry_at"] = datetime.now(UTC).isoformat()

        result = await s.reset_failures(sched["id"])
        assert result is not None
        assert result["consecutive_failures"] == 0
        assert result["retry_count"] == 0
        assert result["last_error"] is None
        assert result["last_error_at"] is None
        assert "retry_at" not in result

    async def test_reset_failures_nonexistent(self, tmp_path):
        s = _make_scheduler(tmp_path)
        result = await s.reset_failures("bogus")
        assert result is None

    async def test_reset_failures_persists(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("persist reset", "reminder", "chan1", cron="*/5 * * * *")

        async with s._lock:
            s._schedules[0]["consecutive_failures"] = 3
            s._schedules[0]["last_error"] = "err"

        await s.reset_failures(sched["id"])

        # Reload from disk
        s2 = _make_scheduler(tmp_path)
        assert s2.list_all()[0]["consecutive_failures"] == 0
        assert s2.list_all()[0]["last_error"] is None

    async def test_update_retry_config(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("update retry", "reminder", "chan1", cron="*/5 * * * *")
        updated = await s.update(sched["id"], max_retries=5, retry_backoff_seconds=120)
        assert updated["max_retries"] == 5
        assert updated["retry_backoff_seconds"] == 120

    async def test_update_invalid_retry_config(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("bad retry", "reminder", "chan1", cron="*/5 * * * *")
        with pytest.raises(ValueError, match="max_retries must be >= 0"):
            await s.update(sched["id"], max_retries=-1)
        with pytest.raises(ValueError, match="retry_backoff_seconds must be >= 1"):
            await s.update(sched["id"], retry_backoff_seconds=0)


class TestSchedulerWebhookAction:
    async def test_add_webhook_schedule(self, tmp_path):
        s = _make_scheduler(tmp_path)
        result = await s.add(
            "ping endpoint",
            "webhook",
            "chan1",
            cron="*/5 * * * *",
            webhook_config={
                "url": "https://example.com/hook",
                "method": "post",
                "headers": {"Authorization": "Bearer test"},
                "body": '{"ok":true}',
                "timeout": 10,
                "expected_status_codes": [200, 202],
            },
        )
        assert result["action"] == "webhook"
        assert result["webhook_config"] == {
            "url": "https://example.com/hook",
            "method": "POST",
            "headers": {"Authorization": "Bearer test"},
            "body": '{"ok":true}',
            "timeout": 10,
            "expected_status_codes": [200, 202],
        }

    async def test_add_webhook_requires_config(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="webhook_config"):
            await s.add("bad webhook", "webhook", "chan1", cron="*/5 * * * *")

    async def test_add_webhook_rejects_invalid_method(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="Invalid webhook method"):
            await s.add(
                "bad webhook",
                "webhook",
                "chan1",
                cron="*/5 * * * *",
                webhook_config={"url": "https://example.com/hook", "method": "TRACE"},
            )

    async def test_add_webhook_rejects_invalid_expected_status_codes(self, tmp_path):
        s = _make_scheduler(tmp_path)
        with pytest.raises(ValueError, match="expected_status_codes"):
            await s.add(
                "bad webhook",
                "webhook",
                "chan1",
                cron="*/5 * * * *",
                webhook_config={
                    "url": "https://example.com/hook",
                    "expected_status_codes": [99],
                },
            )

    async def test_execute_and_record_webhook_success(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._execute_webhook = AsyncMock(return_value={"status_code": 204})
        schedule = await s.add(
            "webhook success",
            "webhook",
            "chan1",
            cron="*/5 * * * *",
            webhook_config={"url": "https://example.com/hook"},
        )

        await s._execute_and_record(schedule)

        s._execute_webhook.assert_awaited_once()
        entries = await s.history.query(schedule["id"])
        assert len(entries) == 1
        assert entries[0]["action"] == "webhook"
        assert entries[0]["status"] == "success"

    async def test_execute_and_record_webhook_failure_tracks_error(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._execute_webhook = AsyncMock(side_effect=RuntimeError("bad status"))
        schedule = await s.add(
            "webhook failure",
            "webhook",
            "chan1",
            cron="*/5 * * * *",
            webhook_config={
                "url": "https://example.com/hook",
                "expected_status_codes": [200],
            },
            max_retries=1,
        )

        await s._execute_and_record(schedule)

        state = s.list_all()[0]
        assert state["consecutive_failures"] == 1
        assert state["last_error"] == "bad status"
        entries = await s.history.query(schedule["id"])
        assert len(entries) == 1
        assert entries[0]["action"] == "webhook"
        assert entries[0]["status"] == "failure"
        assert entries[0]["error"] == "bad status"

    async def test_update_webhook_config(self, tmp_path):
        s = _make_scheduler(tmp_path)
        schedule = await s.add(
            "webhook update",
            "webhook",
            "chan1",
            cron="*/5 * * * *",
            webhook_config={"url": "https://example.com/old"},
        )

        updated = await s.update(
            schedule["id"],
            webhook_config={
                "url": "https://example.com/new",
                "method": "patch",
                "timeout": 5,
                "expected_status_codes": [202],
            },
        )

        assert updated is not None
        assert updated["webhook_config"] == {
            "url": "https://example.com/new",
            "method": "PATCH",
            "headers": {},
            "body": None,
            "timeout": 5,
            "expected_status_codes": [202],
        }


class TestSchedulerAdaptiveTickDelay:
    """Regression for the class of bug Odin hit: scheduler slept 60s flat,
    so a one-off run_at due in 2s missed by up to 58s."""

    def test_compute_tick_delay_empty_schedules(self, tmp_path):
        s = _make_scheduler(tmp_path)
        assert s._compute_tick_delay() == 60.0

    async def test_compute_tick_delay_picks_soonest(self, tmp_path):
        s = _make_scheduler(tmp_path)
        soon = (datetime.now(UTC) + timedelta(seconds=10)).isoformat()
        later = (datetime.now(UTC) + timedelta(minutes=30)).isoformat()
        await s.add("soon", "reminder", "c", run_at=soon, message="x")
        await s.add("later", "reminder", "c", run_at=later, message="x")
        delay = s._compute_tick_delay()
        assert 1.0 <= delay <= 11.0, f"expected ~10s, got {delay}"

    async def test_add_wakes_loop(self, tmp_path):
        s = _make_scheduler(tmp_path)
        assert not s._wake.is_set()
        soon = (datetime.now(UTC) + timedelta(seconds=5)).isoformat()
        await s.add("wake-me", "reminder", "c", run_at=soon, message="x")
        assert s._wake.is_set(), "adding a schedule must set _wake for the loop"

    def test_compute_tick_delay_caps_at_60(self, tmp_path):
        s = _make_scheduler(tmp_path)
        far_future = (datetime.now(UTC) + timedelta(days=7)).isoformat()
        s._schedules.append({"next_run": far_future, "id": "x", "action": "reminder"})
        assert s._compute_tick_delay() == 60.0

    def test_compute_tick_delay_floors_at_1(self, tmp_path):
        s = _make_scheduler(tmp_path)
        past = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
        s._schedules.append({"next_run": past, "id": "x", "action": "reminder"})
        assert s._compute_tick_delay() == 1.0


# ---------------------------------------------------------------------------
# Tests — pause / resume
# ---------------------------------------------------------------------------

class TestSchedulerPause:
    """Test that paused schedules are skipped by _tick and fire_triggers."""

    async def test_update_pause(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("pausable", "reminder", "chan1", cron="*/5 * * * *")
        updated = await s.update(sched["id"], paused=True)
        assert updated["paused"] is True

    async def test_update_unpause(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("pausable", "reminder", "chan1", cron="*/5 * * * *")
        await s.update(sched["id"], paused=True)
        updated = await s.update(sched["id"], paused=False)
        assert updated["paused"] is False

    async def test_pause_persists(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("persist pause", "reminder", "chan1", cron="*/5 * * * *")
        await s.update(sched["id"], paused=True)
        s2 = _make_scheduler(tmp_path)
        assert s2.list_all()[0].get("paused") is True

    async def test_tick_skips_paused_cron(self, tmp_path):
        """Paused cron schedule must not fire even when next_run is past."""
        s = _make_scheduler(tmp_path)
        cb = AsyncMock()
        s._callback = cb

        sched = await s.add("paused cron", "reminder", "chan1", cron="*/5 * * * *")
        await s.update(sched["id"], paused=True)

        async with s._lock:
            s._schedules[0]["next_run"] = (
                datetime.now(UTC) - timedelta(minutes=5)
            ).isoformat()

        await s._tick()
        cb.assert_not_called()

    async def test_tick_skips_paused_one_time(self, tmp_path):
        """Paused one-time schedule must not fire."""
        s = _make_scheduler(tmp_path)
        cb = AsyncMock()
        s._callback = cb

        past = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
        sched = await s.add("paused one-time", "reminder", "chan1", run_at=past)
        await s.update(sched["id"], paused=True)

        await s._tick()
        cb.assert_not_called()
        assert len(s.list_all()) == 1  # not removed

    async def test_tick_skips_paused_retry(self, tmp_path):
        """Paused schedule with pending retry must not fire."""
        s = _make_scheduler(tmp_path)
        cb = AsyncMock()
        s._callback = cb

        sched = await s.add(
            "paused retry", "reminder", "chan1",
            cron="*/5 * * * *", max_retries=3,
        )
        await s.update(sched["id"], paused=True)

        async with s._lock:
            s._schedules[0]["retry_at"] = (
                datetime.now(UTC) - timedelta(seconds=1)
            ).isoformat()
            s._schedules[0]["retry_count"] = 1

        await s._tick()
        cb.assert_not_called()

    async def test_trigger_skips_paused(self, tmp_path):
        """Paused trigger-based schedule must not fire on matching webhook."""
        s = _make_scheduler(tmp_path)
        cb = AsyncMock()
        s._callback = cb

        trigger = {"source": "github", "event": "push"}
        sched = await s.add("paused trigger", "reminder", "chan1", trigger=trigger)
        await s.update(sched["id"], paused=True)

        fired = await s.fire_triggers("github", {"event": "push"})
        assert fired == 0
        cb.assert_not_called()

    async def test_unpause_allows_firing(self, tmp_path):
        """Unpausing a schedule allows it to fire normally."""
        s = _make_scheduler(tmp_path)
        cb = AsyncMock()
        s._callback = cb

        sched = await s.add("toggle", "reminder", "chan1", cron="*/5 * * * *")
        await s.update(sched["id"], paused=True)

        async with s._lock:
            s._schedules[0]["next_run"] = (
                datetime.now(UTC) - timedelta(minutes=1)
            ).isoformat()

        await s._tick()
        cb.assert_not_called()

        await s.update(sched["id"], paused=False)
        await s._tick()
        cb.assert_called_once()


# ---------------------------------------------------------------------------
# Tests — run_now()
# ---------------------------------------------------------------------------

class TestSchedulerRunNow:
    """Test manual schedule execution via run_now()."""

    async def test_run_now_fires_callback(self, tmp_path):
        s = _make_scheduler(tmp_path)
        cb = AsyncMock()
        s._callback = cb

        sched = await s.add("manual run", "reminder", "chan1", cron="0 * * * *")
        result = await s.run_now(sched["id"])

        assert result["status"] == "success"
        assert result["schedule_id"] == sched["id"]
        assert "error" not in result
        cb.assert_called_once()

    async def test_run_now_updates_last_run(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        sched = await s.add("track time", "reminder", "chan1", cron="0 * * * *")
        assert sched["last_run"] is None

        await s.run_now(sched["id"])
        assert s.list_all()[0]["last_run"] is not None

    async def test_run_now_warns_when_paused(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        sched = await s.add("paused manual", "reminder", "chan1", cron="0 * * * *")
        await s.update(sched["id"], paused=True)

        result = await s.run_now(sched["id"])
        assert result["status"] == "success"
        assert "paused" in result.get("warning", "")

    async def test_run_now_no_warning_when_active(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        sched = await s.add("active", "reminder", "chan1", cron="0 * * * *")
        result = await s.run_now(sched["id"])
        assert "warning" not in result

    async def test_run_now_not_found_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        with pytest.raises(ValueError, match="not found"):
            await s.run_now("nonexistent")

    async def test_run_now_no_callback_raises(self, tmp_path):
        s = _make_scheduler(tmp_path)
        sched = await s.add("no cb", "reminder", "chan1", cron="0 * * * *")

        with pytest.raises(ValueError, match="callback not configured"):
            await s.run_now(sched["id"])

    async def test_run_now_records_history(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()

        sched = await s.add("with history", "reminder", "chan1", cron="0 * * * *")
        await s.run_now(sched["id"])

        entries = await s.history.query(sched["id"])
        assert len(entries) == 1
        assert entries[0]["status"] == "success"



    async def test_tick_does_not_complete_one_time_already_in_flight(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()
        past = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
        sched = await s.add("busy tick", "reminder", "chan1", run_at=past)
        s._in_flight.add(sched["id"])

        await s._tick()

        assert [item["id"] for item in s.list_all()] == [sched["id"]]
        s._callback.assert_not_awaited()

    async def test_run_now_does_not_complete_one_time_already_in_flight(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock()
        future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
        sched = await s.add("busy", "reminder", "chan1", run_at=future)
        s._in_flight.add(sched["id"])

        result = await s.run_now(sched["id"])

        assert result == {
            "status": "skipped",
            "schedule_id": sched["id"],
            "error": "schedule is already executing",
        }
        assert [item["id"] for item in s.list_all()] == [sched["id"]]
        s._callback.assert_not_awaited()

    async def test_run_now_reports_failure(self, tmp_path):
        """run_now returns failure status when callback raises."""
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock(side_effect=RuntimeError("broke"))

        sched = await s.add("failing manual", "reminder", "chan1", cron="0 * * * *")
        result = await s.run_now(sched["id"])

        assert result["status"] == "failure"
        assert "broke" in result["error"]

        entries = await s.history.query(sched["id"])
        assert len(entries) == 1
        assert entries[0]["status"] == "failure"


class TestOneTimeDeliveryCorrectness:
    async def test_failed_one_time_without_retries_survives_and_is_persisted(self, tmp_path):
        s = _make_scheduler(tmp_path)
        s._callback = AsyncMock(side_effect=RuntimeError("discord unavailable"))
        past = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
        sched = await s.add("keep me", "reminder", "chan1", run_at=past)

        await s._tick()

        remaining = s.list_all()
        assert [item["id"] for item in remaining] == [sched["id"]]
        assert remaining[0]["consecutive_failures"] == 1
        assert remaining[0]["last_error"] == "discord unavailable"
        assert "next_run" not in remaining[0]
        reloaded = _make_scheduler(tmp_path)
        assert [item["id"] for item in reloaded.list_all()] == [sched["id"]]
        assert reloaded.list_all()[0]["last_error"] == "discord unavailable"
        assert "next_run" not in reloaded.list_all()[0]
        history = await s.history.query(sched["id"])
        assert history[-1]["status"] == "failure"

    async def test_failed_one_time_is_removed_after_later_success(self, tmp_path):
        s = _make_scheduler(tmp_path)
        callback = AsyncMock(side_effect=[RuntimeError("offline"), None])
        s._callback = callback
        past = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
        sched = await s.add("eventually", "reminder", "chan1", run_at=past)

        await s._tick()
        assert s.list_all()[0]["last_error"] == "offline"
        assert "next_run" not in s.list_all()[0]
        await s._tick()
        assert callback.await_count == 1

        result = await s.run_now(sched["id"])
        assert result["status"] == "success"
        assert s.list_all() == []
        history = await s.history.query(sched["id"])
        assert [entry["status"] for entry in reversed(history)] == ["failure", "success"]
