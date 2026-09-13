from datetime import UTC, datetime, timedelta

import pytest

from src.scheduler.scheduler import (
    ConnectionAvailability,
    ConnectionReason,
    NonRetryableScheduleError,
    ScheduleConnectionUnavailableError,
    Scheduler,
)


def _provider(state):
    return lambda: ConnectionAvailability(
        state["available"],
        ConnectionReason.AVAILABLE if state["available"] else ConnectionReason.DISCONNECTED,
        state["epoch"],
    )


@pytest.mark.asyncio
async def test_webhook_http_executor_is_bypassed_before_any_effect(tmp_path, monkeypatch):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    state = {"available": True, "epoch": 4}
    scheduler.set_connection_state_provider(_provider(state))
    calls = []

    async def callback(_schedule):
        calls.append("callback")

    async def http(_config):
        calls.append("http")
        return {"status": 200}

    scheduler.start(callback)
    monkeypatch.setattr(scheduler, "_execute_webhook", http)
    schedule = await scheduler.add(
        "webhook", "webhook", "1", run_at="2030-01-01T00:00:00Z",
        webhook_config={"url": "https://example.invalid/hook"},
    )
    state["available"] = False

    with pytest.raises(ScheduleConnectionUnavailableError):
        await scheduler.run_now(schedule["id"])

    assert calls == []
    assert scheduler.list_all()[0]["last_run"] is None
    assert await scheduler.history.query() == []
    await scheduler.stop()


@pytest.mark.asyncio
async def test_matching_webhook_trigger_is_admitted_and_effect_runs(tmp_path):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    scheduler.set_connection_state_provider(
        lambda: ConnectionAvailability(True, ConnectionReason.AVAILABLE, 9)
    )
    seen = []

    async def callback(schedule):
        seen.append(schedule["id"])

    scheduler.start(callback)
    schedule = await scheduler.add(
        "push", "reminder", "1", trigger={"source": "github", "event": "push"}
    )

    assert await scheduler.fire_triggers("github", {"event": "push"}) == 1
    assert seen == [schedule["id"]]
    assert len(await scheduler.history.query()) == 1
    await scheduler.stop()


@pytest.mark.asyncio
async def test_run_now_connection_change_after_reservation_rolls_back(tmp_path, monkeypatch):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    state = {"available": True, "epoch": 10}
    scheduler.set_connection_state_provider(_provider(state))
    effects = []

    async def callback(_schedule):
        effects.append(True)

    async def publish(candidate):
        scheduler._schedules = candidate

    scheduler.start(callback)
    monkeypatch.setattr(scheduler, "_publish", publish)
    schedule = await scheduler.add("manual", "reminder", "1", run_at="2030-01-01T00:00:00Z")
    state["available"] = False
    state["epoch"] = 11

    with pytest.raises(ScheduleConnectionUnavailableError):
        await scheduler.run_now(schedule["id"])

    restored = scheduler.list_all()[0]
    assert effects == []
    assert restored["last_run"] is None
    assert scheduler._gate_reservations == {}
    await scheduler.stop()


@pytest.mark.asyncio
async def test_due_reservation_epoch_change_on_reconnect_does_not_execute(tmp_path):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    state = {"available": True, "epoch": 20}
    scheduler.set_connection_state_provider(_provider(state))
    effects = []

    async def callback(_schedule):
        effects.append(True)

    original_status = scheduler._connection_availability
    calls = 0

    def status_with_reconnect():
        nonlocal calls
        calls += 1
        if calls == 3:
            state["epoch"] = 21
        return original_status()

    scheduler._callback = callback
    scheduler._connection_availability = status_with_reconnect
    schedule = await scheduler.add(
        "due", "reminder", "1",
        run_at=(datetime.now(UTC) - timedelta(seconds=1)).isoformat(),
    )
    await scheduler._tick()

    persisted = scheduler.list_all()[0]
    assert effects == []
    assert persisted["last_run"] is None
    assert persisted["next_run"] == schedule["next_run"]
    assert await scheduler.history.query() == []
    await scheduler.stop()


@pytest.mark.asyncio
async def test_nonretryable_failure_is_retained_without_retry(tmp_path):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    scheduler.set_connection_state_provider(
        lambda: ConnectionAvailability(True, ConnectionReason.AVAILABLE, 1)
    )

    async def callback(_schedule):
        raise NonRetryableScheduleError("manual resolution")

    scheduler.start(callback)
    schedule = await scheduler.add(
        "one shot", "reminder", "1", run_at="2030-01-01T00:00:00Z",
        max_retries=3,
    )
    result = await scheduler.run_now(schedule["id"])

    retained = scheduler.list_all()[0]
    assert result["status"] == "failure"
    assert retained["id"] == schedule["id"]
    assert retained["retry_count"] == 0
    assert "retry_at" not in retained
    assert "next_run" not in retained
    await scheduler.stop()


@pytest.mark.asyncio
async def test_disconnected_due_task_is_not_dropped_or_reserved(tmp_path):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    scheduler.set_connection_state_provider(
        lambda: ConnectionAvailability(False, ConnectionReason.DISCONNECTED, 30)
    )
    effects = []

    async def callback(_schedule):
        effects.append(True)

    scheduler.start(callback)
    # Seed while connected, then make the due schedule unavailable to the tick.
    scheduler.set_connection_state_provider(
        lambda: ConnectionAvailability(True, ConnectionReason.AVAILABLE, 30)
    )
    schedule = await scheduler.add("due", "reminder", "1", run_at="2030-01-01T00:00:00Z")
    scheduler._schedules[0]["next_run"] = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    scheduler.set_connection_state_provider(
        lambda: ConnectionAvailability(False, ConnectionReason.DISCONNECTED, 31)
    )
    await scheduler._tick()
    assert effects == []
    assert scheduler.list_all()[0]["id"] == schedule["id"]
    assert scheduler.list_all()[0]["last_run"] is None
    await scheduler.stop()


@pytest.mark.asyncio
async def test_start_on_ready_is_idempotent_and_refreshes_callback(tmp_path):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    first = []
    second = []

    async def callback_one(_schedule):
        first.append(True)

    async def callback_two(_schedule):
        second.append(True)

    scheduler.start(callback_one)
    task = scheduler._task
    scheduler.start(callback_two)
    assert scheduler._task is task
    assert scheduler._callback is callback_two
    await scheduler.stop()
