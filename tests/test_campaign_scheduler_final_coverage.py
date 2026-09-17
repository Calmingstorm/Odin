"""Final scheduler coverage for connection admission and retry races.

These tests exercise the scheduler's real admission contract without making
network calls or changing startup/composition behavior.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from src.scheduler.scheduler import (
    ConnectionAvailability,
    ConnectionReason,
    ScheduleConnectionUnavailableError,
    Scheduler,
)


def _scheduler(tmp_path):
    return Scheduler(str(tmp_path / "schedules.json"))


def test_connection_provider_contract_and_fault_are_safe(tmp_path):
    scheduler = _scheduler(tmp_path)

    with pytest.raises(TypeError, match="known report formats"):
        scheduler.set_known_report_formats_provider(None)  # type: ignore[arg-type]
    with pytest.raises(TypeError, match="connection provider"):
        scheduler.set_connection_state_provider(None)  # type: ignore[arg-type]

    scheduler.set_connection_provider(
        lambda: ConnectionAvailability(False, ConnectionReason.DISCONNECTED, 7)
    )
    assert scheduler.connection_status() == {
        "available": False,
        "reason": "disconnected",
        "epoch": 7,
    }

    scheduler.set_connection_state_provider(lambda: object())  # type: ignore[arg-type]
    assert scheduler.connection_status() == {
        "available": False,
        "reason": "provider_error",
        "epoch": -1,
    }


@pytest.mark.asyncio
async def test_run_now_reports_actual_connection_reason(tmp_path):
    scheduler = _scheduler(tmp_path)
    scheduler.start = lambda *args, **kwargs: None  # no loop required
    state = [ConnectionAvailability(True, ConnectionReason.AVAILABLE, 11)]
    scheduler.set_connection_state_provider(lambda: state[0])
    scheduler._callback = AsyncMock()
    schedule = await scheduler.add(
        "blocked", "reminder", "chan", run_at=(datetime.now(UTC) + timedelta(hours=1)).isoformat()
    )
    state[0] = ConnectionAvailability(False, ConnectionReason.UNAVAILABLE, 12)

    with pytest.raises(ScheduleConnectionUnavailableError) as caught:
        await scheduler.run_now(schedule["id"])
    assert caught.value.snapshot == {
        "available": False,
        "reason": "unavailable",
        "epoch": 12,
    }
    scheduler._callback.assert_not_awaited()


@pytest.mark.asyncio
async def test_epoch_race_restores_reservation_before_callback(tmp_path):
    scheduler = _scheduler(tmp_path)
    states = iter(
        [
            ConnectionAvailability(True, ConnectionReason.AVAILABLE, 1),  # add
            ConnectionAvailability(True, ConnectionReason.AVAILABLE, 1),  # tick
            ConnectionAvailability(False, ConnectionReason.DISCONNECTED, 2),  # execute
        ]
    )
    scheduler.set_connection_state_provider(lambda: next(states))
    callback = AsyncMock()
    scheduler._callback = callback
    schedule = await scheduler.add(
        "race", "reminder", "chan", run_at=(datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    )
    await scheduler._tick()

    assert scheduler.list_all()[0]["last_run"] is None
    assert scheduler.list_all()[0]["next_run"] == schedule["next_run"]
    callback.assert_not_awaited()


@pytest.mark.asyncio
async def test_inner_execution_rejects_unadmitted_connection(tmp_path):
    scheduler = _scheduler(tmp_path)
    scheduler.set_connection_state_provider(
        lambda: ConnectionAvailability(False, ConnectionReason.PROVIDER_ERROR, 3)
    )

    with pytest.raises(ScheduleConnectionUnavailableError) as caught:
        await scheduler._execute_and_record_inner({"id": "direct", "action": "reminder"})
    assert caught.value.availability.reason is ConnectionReason.PROVIDER_ERROR


@pytest.mark.asyncio
async def test_webhook_inner_rejects_unadmitted_connection(tmp_path):
    scheduler = _scheduler(tmp_path)
    scheduler.set_connection_state_provider(
        lambda: ConnectionAvailability(False, ConnectionReason.DISCONNECTED, 4)
    )

    with pytest.raises(ScheduleConnectionUnavailableError) as caught:
        await scheduler._execute_and_record_webhook({"id": "hook", "action": "webhook"})
    assert caught.value.snapshot["reason"] == "disconnected"


@pytest.mark.asyncio
async def test_retry_backoff_caps_and_alert_failure_does_not_escape(tmp_path):
    scheduler = _scheduler(tmp_path)
    scheduler._failure_callback = AsyncMock(side_effect=RuntimeError("alert transport down"))
    schedule = {
        "id": "retry",
        "description": "retry",
        "action": "reminder",
        "max_retries": 0,
        "retry_count": 99,
        "retry_backoff_seconds": 9999,
        "consecutive_failures": 2,
    }

    assert scheduler._compute_retry_at(schedule)
    scheduler._callback = AsyncMock(side_effect=RuntimeError("failed"))
    await scheduler._execute_and_record_inner(schedule)
    assert schedule["consecutive_failures"] == 3
    scheduler._failure_callback.assert_awaited_once()

