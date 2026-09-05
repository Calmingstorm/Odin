"""Production CRUD and suspended execution ownership, with real disposable files."""

import asyncio
import copy
import json
import threading

import pytest

from src.scheduler.history import ScheduleHistory
from src.scheduler.scheduler import Scheduler


async def add(scheduler, **kwargs):
    return await scheduler.add("test", "reminder", "channel", **kwargs)


@pytest.mark.parametrize("operation", ["add", "reset", "delete", "update"])
async def test_rejected_write_never_publishes_or_leaks_later(tmp_path, monkeypatch, operation):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    schedule = await add(scheduler, cron="0 * * * *")
    scheduler._schedules[0]["consecutive_failures"] = 3
    scheduler._save()
    before = copy.deepcopy(scheduler.list_all())
    real_replace = __import__("os").replace

    def fail(*args):
        assert scheduler.list_all() == before  # Visibility DURING candidate I/O.
        raise OSError("synthetic rename failure")

    monkeypatch.setattr("src.scheduler.scheduler.os.replace", fail)
    with pytest.raises(OSError, match="rename failure"):
        if operation == "add":
            await add(scheduler, cron="0 * * * *")
        elif operation == "reset":
            await scheduler.reset_failures(schedule["id"])
        elif operation == "delete":
            await scheduler.delete(schedule["id"])
        else:
            await scheduler.update(schedule["id"], description="rejected")
    assert scheduler.list_all() == before
    monkeypatch.setattr("src.scheduler.scheduler.os.replace", real_replace)
    scheduler._save()
    assert json.loads(scheduler.data_path.read_text()) == before


@pytest.mark.parametrize("change", ["description", "timing", "delete", "reuse", "reset"])
@pytest.mark.parametrize("failed", [False, True])
async def test_completion_fenced_against_current_record(tmp_path, change, failed):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    original = await add(scheduler, run_at="2999-01-01T00:00:00Z", max_retries=2)
    entered, release = asyncio.Event(), asyncio.Event()

    async def callback(schedule):
        entered.set()
        await release.wait()
        if failed:
            raise RuntimeError("synthetic failure")

    scheduler._callback = callback
    running = asyncio.create_task(scheduler.run_now(original["id"]))
    await entered.wait()
    if change == "description":
        await scheduler.update(original["id"], description="edited")
    elif change == "timing":
        await scheduler.update(original["id"], cron="0 * * * *")
    elif change in {"delete", "reuse"}:
        await scheduler.delete(original["id"])
        if change == "reuse":
            await add(scheduler, cron="0 * * * *")
            scheduler._schedules[0]["id"] = original["id"]
            scheduler._save()
    else:
        await scheduler.reset_failures(original["id"])
    release.set()
    result = await running
    assert result["status"] == ("failure" if failed else "success")
    current = scheduler.list_all()
    if change == "delete" or (change == "description" and not failed):
        assert current == []
    else:
        assert len(current) == 1
        if change == "description":
            assert current[0]["description"] == "edited"
            assert current[0]["consecutive_failures"] == 1
            assert current[0]["retry_count"] == 1
            assert current[0]["retry_at"]
        else:
            assert current[0]["consecutive_failures"] == 0
            assert "retry_at" not in current[0]
    assert json.loads(scheduler.data_path.read_text()) == current


@pytest.mark.parametrize("cancel_count", [1, 3])
async def test_candidate_cancellation_settles_before_unlock(tmp_path, monkeypatch, cancel_count):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    entered, release = threading.Event(), threading.Event()
    real_save = Scheduler._save

    def held_save(writer):
        entered.set()
        assert release.wait(5)
        real_save(writer)

    monkeypatch.setattr(Scheduler, "_save", held_save)
    pending = asyncio.create_task(add(scheduler, cron="0 * * * *"))
    await asyncio.to_thread(entered.wait, 5)
    assert scheduler.list_all() == []
    try:
        for _ in range(cancel_count):
            pending.cancel()
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            assert scheduler._lock.locked()
            assert not pending.done()
    finally:
        release.set()
    with pytest.raises(asyncio.CancelledError):
        await pending
    assert len(scheduler.list_all()) == 1
    assert json.loads(scheduler.data_path.read_text()) == scheduler.list_all()


async def test_repeated_cancel_and_failed_writer_cannot_leak_to_next_save(tmp_path, monkeypatch):
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    entered, release = threading.Event(), threading.Event()
    real_save = Scheduler._save

    def held_save(writer):
        if writer._schedules[-1]["description"] == "rejected":
            entered.set()
            assert release.wait(5)
            raise OSError("synthetic write failure")
        real_save(writer)

    monkeypatch.setattr(Scheduler, "_save", held_save)
    pending = asyncio.create_task(scheduler.add(
        "rejected", "reminder", "channel", cron="0 * * * *",
    ))
    assert await asyncio.to_thread(entered.wait, 5)
    following = asyncio.create_task(add(scheduler, cron="0 * * * *"))
    try:
        for _ in range(3):
            pending.cancel()
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            assert scheduler._lock.locked()
            assert not following.done()
    finally:
        release.set()
    with pytest.raises(OSError, match="synthetic write failure"):
        await pending
    saved = await following
    assert scheduler.list_all() == [saved]
    assert json.loads(scheduler.data_path.read_text()) == [saved]


@pytest.mark.parametrize("cancel_prune", [False, True])
async def test_append_waits_for_real_compaction_snapshot(tmp_path, monkeypatch, cancel_prune):
    history = ScheduleHistory(str(tmp_path / "history.jsonl"), max_entries_per_schedule=1)
    monkeypatch.setattr("src.scheduler.history.MAX_TOTAL_ENTRIES", 1)
    for _ in range(2):
        await history.record(schedule_id="old", description="", action="reminder",
                             status="success", duration_ms=1)
    import aiofiles.threadpool.text
    real_readlines = aiofiles.threadpool.text.AsyncTextIOWrapper.readlines
    entered, release = asyncio.Event(), asyncio.Event()

    async def readlines(file, *args, **kwargs):
        lines = await real_readlines(file, *args, **kwargs)
        entered.set()
        await release.wait()
        return lines

    monkeypatch.setattr(aiofiles.threadpool.text.AsyncTextIOWrapper, "readlines", readlines)
    pruning = asyncio.create_task(history.prune())
    await entered.wait()
    recording = asyncio.create_task(history.record(
        schedule_id="new", description="", action="reminder", status="success", duration_ms=1,
    ))
    await asyncio.sleep(0.01)
    assert not recording.done()
    try:
        if cancel_prune:
            for _ in range(3):
                pruning.cancel()
                await asyncio.sleep(0)
                await asyncio.sleep(0)
                assert history._lock.locked()
                assert not recording.done()
    finally:
        release.set()
    if cancel_prune:
        with pytest.raises(asyncio.CancelledError):
            await pruning
    else:
        assert await pruning == 1
    await recording
    assert {row["schedule_id"] for row in await history.query()} == {"old", "new"}


async def test_cancelled_history_append_keeps_thread_owned_until_settled(tmp_path, monkeypatch):
    import aiofiles.threadpool

    history = ScheduleHistory(str(tmp_path / "history.jsonl"))
    entered, release = threading.Event(), threading.Event()
    real_open = aiofiles.threadpool.sync_open

    def held_open(*args, **kwargs):
        file = real_open(*args, **kwargs)
        if file.mode == "a":
            real_write = file.write

            def held_write(content):
                entered.set()
                assert release.wait(5)
                return real_write(content)

            file.write = held_write
        return file

    monkeypatch.setattr(aiofiles.threadpool, "sync_open", held_open)
    recording = asyncio.create_task(history.record(
        schedule_id="new", description="", action="reminder", status="success", duration_ms=1,
    ))
    assert await asyncio.to_thread(entered.wait, 5)
    pruning = asyncio.create_task(history.prune())
    try:
        for _ in range(3):
            recording.cancel()
            await asyncio.sleep(0.01)
            assert history._lock.locked()
            assert not pruning.done()
    finally:
        release.set()
    with pytest.raises(asyncio.CancelledError):
        await recording
    await pruning
    assert [row["schedule_id"] for row in await history.query()] == ["new"]
