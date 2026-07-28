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


async def test_invalid_update_does_not_persist(tmp_path):
    """A rejected update must leave the stored workflow untouched."""
    sched = await _scheduler(tmp_path)
    sid = await _workflow(sched)
    with pytest.raises(ValueError):
        await sched.update(sid, steps=[])
    stored = await sched.get(sid) if hasattr(sched, "get") else None
    if stored is not None:
        assert stored["steps"] == VALID
