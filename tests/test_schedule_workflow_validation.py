"""Workflow steps must obey ONE contract, on create and on update.

Creation rejected empty and incomplete workflows; update did not, so an
existing workflow could be updated to any of these and the invalid version was
persisted (adversarial review of v3.65.1, reproduced):

    []
    [{"tool_name": "run_command", "tool_input": {}}]
    [{"tool_name": "run_command"}]
"""

from __future__ import annotations

import pytest

from src.scheduler.scheduler import Scheduler

INVALID = [
    pytest.param([], id="empty-list"),
    pytest.param([{"tool_name": "run_command"}], id="no-tool-input"),
    pytest.param([{"tool_name": "run_command", "tool_input": {}}], id="empty-tool-input"),
    pytest.param([{"tool_input": {"command": "x"}}], id="no-tool-name"),
    pytest.param("not-a-list", id="not-a-list"),
]

VALID = [{"tool_name": "run_command", "tool_input": {"command": "echo hi"}}]


async def _scheduler(tmp_path) -> Scheduler:
    return Scheduler(data_path=str(tmp_path / "schedules.json"))


async def _workflow(sched: Scheduler) -> str:
    created = await sched.add(
        description="w", action="workflow", channel_id="1",
        cron="0 0 * * *", steps=VALID,
    )
    return created["id"]


@pytest.mark.parametrize("steps", INVALID)
async def test_create_rejects_invalid_workflows(tmp_path, steps):
    sched = await _scheduler(tmp_path)
    with pytest.raises(ValueError):
        await sched.add(
            description="w", action="workflow", channel_id="1",
            cron="0 0 * * *", steps=steps,
        )


@pytest.mark.parametrize("steps", INVALID)
async def test_update_rejects_the_same_invalid_workflows(tmp_path, steps):
    """The asymmetry itself: update must not accept what create rejects."""
    sched = await _scheduler(tmp_path)
    sid = await _workflow(sched)
    with pytest.raises(ValueError):
        await sched.update(sid, steps=steps)


async def test_update_still_accepts_a_valid_workflow(tmp_path):
    """The shared validator must not block legitimate edits."""
    sched = await _scheduler(tmp_path)
    sid = await _workflow(sched)
    updated = await sched.update(
        sid, steps=[{"tool_name": "run_command", "tool_input": {"command": "echo changed"}}]
    )
    assert updated is not None
    assert updated["steps"][0]["tool_input"]["command"] == "echo changed"


async def test_invalid_update_is_transactional(tmp_path):
    """A rejected update must not partially mutate live state.

    update() edits the stored dict in place. Before this pin, a description
    supplied before invalid steps survived in memory and a later valid update
    persisted it, despite the original call raising ValueError.
    """
    sched = await _scheduler(tmp_path)
    sid = await _workflow(sched)
    with pytest.raises(ValueError):
        await sched.update(sid, description="must not leak", steps=[])

    stored = next(s for s in sched.list_all() if s["id"] == sid)
    assert stored["description"] == "w"
    assert stored["steps"] == VALID

    # Prove a later save cannot serialize residue from the rejected update.
    await sched.update(sid, paused=True)
    reloaded = Scheduler(data_path=str(tmp_path / "schedules.json"))
    persisted = next(s for s in reloaded.list_all() if s["id"] == sid)
    assert persisted["description"] == "w"
    assert persisted["steps"] == VALID


async def test_invalid_timing_update_is_transactional(tmp_path):
    sched = await _scheduler(tmp_path)
    sid = await _workflow(sched)
    before = next(s for s in sched.list_all() if s["id"] == sid)

    with pytest.raises(ValueError, match="Invalid cron"):
        await sched.update(sid, description="must not leak", cron="bad cron")

    after = next(s for s in sched.list_all() if s["id"] == sid)
    assert after["description"] == before["description"]
    assert after["cron"] == before["cron"]
    assert after["next_run"] == before["next_run"]


async def test_failed_save_rolls_back_live_update(tmp_path, monkeypatch):
    sched = await _scheduler(tmp_path)
    sid = await _workflow(sched)

    def _fail_save():
        raise OSError("disk full")

    monkeypatch.setattr(sched, "_save", _fail_save)
    with pytest.raises(OSError, match="disk full"):
        await sched.update(sid, description="must not remain")

    stored = next(s for s in sched.list_all() if s["id"] == sid)
    assert stored["description"] == "w"


async def test_invalid_webhook_update_is_transactional(tmp_path):
    sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
    created = await sched.add(
        description="hook",
        action="webhook",
        channel_id="1",
        cron="0 0 * * *",
        webhook_config={"url": "https://example.com/hook"},
    )
    with pytest.raises(ValueError):
        await sched.update(
            created["id"],
            description="must not leak",
            webhook_config={"url": "file:///tmp/nope"},
        )
    stored = next(s for s in sched.list_all() if s["id"] == created["id"])
    assert stored["description"] == "hook"
    assert stored["webhook_config"]["url"] == "https://example.com/hook"
