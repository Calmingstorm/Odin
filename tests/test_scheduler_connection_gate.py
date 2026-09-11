from datetime import UTC, datetime, timedelta

import pytest

from src.scheduler.scheduler import (
    ConnectionAvailability,
    ConnectionReason,
    ScheduleConnectionUnavailableError,
    Scheduler,
)


@pytest.mark.asyncio
async def test_create_and_unpause_are_rejected_while_connection_unavailable(tmp_path):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    scheduler.set_connection_state_provider(
        lambda: ConnectionAvailability(False, ConnectionReason.DISCONNECTED, 17)
    )

    with pytest.raises(ScheduleConnectionUnavailableError) as create:
        await scheduler.add("blocked", "reminder", "1", run_at="2030-01-01T00:00:00Z")
    assert create.value.snapshot == {
        "available": False, "reason": "disconnected", "epoch": 17,
    }

    scheduler.set_connection_state_provider(
        lambda: ConnectionAvailability(True, ConnectionReason.AVAILABLE, 18)
    )
    schedule = await scheduler.add("paused", "reminder", "1", run_at="2030-01-01T00:00:00Z")
    await scheduler.update(schedule["id"], paused=True)
    scheduler.set_connection_state_provider(
        lambda: ConnectionAvailability(False, ConnectionReason.DISCONNECTED, 19)
    )
    with pytest.raises(ScheduleConnectionUnavailableError):
        await scheduler.update(schedule["id"], paused=False)
    assert scheduler.list_all()[0]["paused"] is True


@pytest.mark.asyncio
async def test_lost_connection_after_reservation_restores_due_work_without_history(tmp_path):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    state = {"up": True}
    scheduler.set_connection_state_provider(
        lambda: ConnectionAvailability(
            state["up"],
            ConnectionReason.AVAILABLE if state["up"] else ConnectionReason.DISCONNECTED,
            3,
        )
    )
    called = []

    async def callback(schedule):
        called.append(schedule["id"])

    scheduler.start(callback)
    schedule = await scheduler.add(
        "due", "reminder", "1",
        run_at=(datetime.now(UTC) - timedelta(seconds=1)).isoformat(),
    )
    state["up"] = False
    await scheduler._tick()
    persisted = scheduler.list_all()[0]
    assert persisted["id"] == schedule["id"]
    assert persisted["next_run"] == schedule["next_run"]
    assert persisted["last_run"] is None
    assert called == []
    assert await scheduler.history.query() == []
    await scheduler.stop()


@pytest.mark.asyncio
async def test_run_now_rejects_before_reservation(tmp_path):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    scheduler.start(lambda _schedule: None)
    schedule = await scheduler.add("manual", "reminder", "1", run_at="2030-01-01T00:00:00Z")
    scheduler.set_connection_state_provider(
        lambda: ConnectionAvailability(False, ConnectionReason.DISCONNECTED, 4)
    )
    with pytest.raises(ScheduleConnectionUnavailableError):
        await scheduler.run_now(schedule["id"])
    assert scheduler.list_all()[0]["last_run"] is None
    await scheduler.stop()
