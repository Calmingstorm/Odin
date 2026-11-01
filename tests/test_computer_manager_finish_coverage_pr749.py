"""An interrupted turn reaches the fake service and retires only its own watchers."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from tests.test_computer_lifecycle_r5 import fake_factory, owner


@pytest.mark.parametrize("failure", [False, True])
async def test_incomplete_turn_is_forwarded_and_watchers_retired_even_on_failure(tmp_path, failure):
    _, manager = owner(tmp_path, factory=fake_factory)
    finish = AsyncMock(side_effect=RuntimeError("fixture-cleanup") if failure else None)
    manager._service = SimpleNamespace(finish_turn=finish)
    st = SimpleNamespace(user_id=42, _req_id=73)
    matched = ("42", "current-channel", "73")
    other_turn = ("42", "current-channel", "74")
    other_owner = ("43", "current-channel", "73")
    started = asyncio.Event()

    async def watch():
        started.set()
        await asyncio.Event().wait()

    task = asyncio.create_task(watch())
    await asyncio.wait_for(started.wait(), timeout=1)
    manager._watchers = {matched: task, other_turn: None, other_owner: None}
    manager._web_grants = dict.fromkeys(manager._watchers, lambda: True)
    try:
        if failure:
            with pytest.raises(RuntimeError, match="fixture-cleanup"):
                await manager.finish_turn(st, completed=False)
        else:
            await manager.finish_turn(st, completed=False)
        finish.assert_awaited_once_with(st, completed=False)
        assert task.cancelled()
        assert set(manager._watchers) == {other_turn, other_owner}
        assert set(manager._web_grants) == {other_turn, other_owner}
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
