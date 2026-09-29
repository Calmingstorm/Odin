import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from src.scheduler.scheduler import Scheduler


@pytest.mark.parametrize("route", ["tick", "trigger"])
@pytest.mark.parametrize("change", ["delete", "pause", "payload"])
async def test_queued_obsolete_schedule_never_starts(tmp_path, route, change):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    timing = {"cron": "0 * * * *"} if route == "tick" else {"trigger": {"source": "github"}}
    first = await scheduler.add("first", "reminder", "1", **timing)
    second = await scheduler.add("second", "reminder", "1", message="old", **timing)
    if route == "tick":
        for schedule in scheduler._schedules:
            schedule["next_run"] = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    entered, release = asyncio.Event(), asyncio.Event()
    calls = []

    async def callback(schedule):
        calls.append(schedule["id"])
        if schedule["id"] == first["id"]:
            entered.set()
            await release.wait()

    scheduler._callback = callback
    pending = asyncio.create_task(scheduler._tick() if route == "tick" else scheduler.fire_triggers("github", {}))
    await asyncio.wait_for(entered.wait(), 2)
    try:
        if change == "delete":
            await scheduler.delete(second["id"])
        elif change == "pause":
            await scheduler.update(second["id"], paused=True)
        else:
            await scheduler.update(second["id"], message="new")
    finally:
        release.set()
    await pending
    assert calls == [first["id"]]
    assert len(await scheduler.history.query()) == 1
    assert scheduler._gate_reservations == {}
    assert scheduler._in_flight == set()


@pytest.mark.parametrize("trigger", [{}, {"source": None}, {"event": ""}, {"source": None, "repo": ""}])
def test_conditionless_triggers_rejected(trigger):
    with pytest.raises(ValueError, match="at least one condition"):
        Scheduler._validate_trigger(trigger)


@pytest.mark.parametrize("key", ["source", "event", "repo", "alert_name"])
@pytest.mark.parametrize("value", [123, False, [], {}])
def test_trigger_filters_require_strings(key, value):
    with pytest.raises(ValueError, match="string or null"):
        Scheduler._validate_trigger({"source": "github", key: value})


async def test_bad_persisted_trigger_does_not_block_later_delivery(tmp_path):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    await scheduler.add("bad", "reminder", "1", trigger={"source": "github"})
    valid = await scheduler.add("good", "reminder", "1", trigger={"repo": "odin", "event": None})
    scheduler._schedules[0]["trigger"]["repo"] = 123
    calls = []

    async def callback(schedule):
        calls.append(schedule["id"])

    scheduler._callback = callback
    assert await scheduler.fire_triggers("github", {"repo": "Calmingstorm/Odin"}) == 1
    assert calls == [valid["id"]]


async def test_retry_stamps_latest_attempt(tmp_path, monkeypatch):
    import src.scheduler.scheduler as module

    now = datetime(2026, 9, 29, 12, tzinfo=UTC)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz or UTC)

    monkeypatch.setattr(module, "datetime", Clock)
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    schedule = await scheduler.add("retry", "reminder", "1", run_at=now.isoformat(), max_retries=2)
    stamps = []

    async def callback(record):
        stamps.append(record["last_run"])
        raise RuntimeError("synthetic failure")

    scheduler._callback = callback
    await scheduler._tick()
    now += timedelta(seconds=61)
    await scheduler._tick()
    assert stamps == ["2026-09-29T12:00:00+00:00", now.isoformat()]
    persisted = next(record for record in scheduler.list_all() if record["id"] == schedule["id"])
    assert persisted["last_run"] == now.isoformat()
