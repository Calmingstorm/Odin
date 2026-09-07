"""Independent review regressions for production lifecycle publication and cleanup."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.config.persistence import config_transaction
from tests.test_computer_lifecycle_r5 import fake_factory, owner


async def test_start_rechecks_disable_after_waiting_for_config_transaction(tmp_path):
    factory = Mock(side_effect=fake_factory)
    bot, manager = owner(tmp_path, enabled=True, factory=factory)
    async with config_transaction():
        disable = asyncio.create_task(manager._change_enabled(False))
        await asyncio.sleep(0)
        start = asyncio.create_task(manager.start())
        await asyncio.sleep(0)
    await asyncio.gather(disable, start)
    assert not bot.config.computer.enabled and not manager.enabled
    assert manager._service is None and not manager._active
    factory.assert_not_called()
    await manager.close()


async def test_initial_retention_failure_never_persists_enable(tmp_path):
    candidate = fake_factory()
    candidate.controller.store = SimpleNamespace(
        prune=Mock(side_effect=OSError("synthetic prune failure")), purge_evidence=Mock())
    persist = AsyncMock(return_value=(None, False))
    bot, manager = owner(tmp_path, factory=lambda *a, **kw: candidate, persist=persist)
    with pytest.raises(OSError):
        await manager.set_enabled(True)
    persist.assert_not_called()
    assert not bot.config.computer.enabled and not manager.enabled
    assert manager._service is None
    candidate.close.assert_awaited_once()
    await manager.close()


async def test_failed_authority_cleanup_fences_runtime_and_keeps_owner(tmp_path):
    _, manager = owner(tmp_path, factory=fake_factory)
    await manager.set_enabled(True)
    service = manager._service
    service._authorize = lambda _: False
    service.finish_turn = AsyncMock(return_value={
        "state": "quarantined", "cleanup": {"complete": False}})
    key = ("owner", "channel", "turn")
    task = asyncio.create_task(manager._watch_authority(service, object(), key, object()))
    manager._watchers[key] = task
    await asyncio.wait_for(task, 1)
    assert not manager.enabled
    assert manager.error == "authority_cleanup_unverified"
    assert manager._service is service
    service.set_enabled.assert_awaited_once_with(False)
    service.finish_turn.assert_awaited_once()
    await manager.close()
