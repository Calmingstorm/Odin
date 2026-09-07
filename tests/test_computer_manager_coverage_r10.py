"""Lifecycle publication and failure isolation using only in-process services."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.manager import _binding
from src.computer.models import ComputerError, RequestContext
from tests.test_computer_lifecycle_r5 import fake_factory, owner


async def test_start_publishes_once_and_closes(tmp_path):
    factory = Mock(side_effect=fake_factory)
    bot, manager = owner(tmp_path, enabled=True, factory=factory)
    await manager.start()
    assert manager.enabled and manager.generation == 1 and manager.error == ''
    service = manager._service
    await manager.start()
    factory.assert_called_once()
    await manager.close()
    service.set_enabled.assert_awaited_once_with(False)
    service.close.assert_awaited_once()
    assert manager._service is None and not manager.enabled


@pytest.mark.parametrize('failure', ['construct', 'janitor', 'closing', 'retained'])
async def test_start_failure_never_publishes_active_authority(tmp_path, monkeypatch, failure):
    bot, manager = owner(tmp_path, enabled=True, factory=fake_factory)
    if failure == 'construct':
        monkeypatch.setattr(manager, '_construct', Mock(side_effect=ValueError('preflight')))
    elif failure == 'janitor':
        monkeypatch.setattr(manager, '_start_janitor', Mock(side_effect=ValueError('prune')))
    elif failure == 'closing':
        manager._closing = True
    else:
        manager._service = fake_factory()
    with pytest.raises((ValueError, RuntimeError)):
        await manager.start()
    assert not manager.enabled
    if failure in {'construct', 'janitor'}:
        expected = 'startup_failed' if failure == 'construct' else 'evidence_cleanup_failed'
        assert manager.error == expected
        assert manager._service is None
    await manager.close()


@pytest.mark.parametrize('kind', ['relative', 'public', 'attached'])
def test_storage_and_attachment_preflight_refuses_before_factory(tmp_path, kind):
    factory = Mock(side_effect=fake_factory)
    bot, manager = owner(tmp_path, factory=factory)
    if kind == 'relative':
        manager.settings.storage_dir = 'relative'
    elif kind == 'public':
        (tmp_path / 'private').chmod(0o755)
    else:
        manager.settings.environment = 'existing_session'
    with pytest.raises(ValueError):
        manager._construct()
    factory.assert_not_called()


async def test_janitor_failure_revokes_service_and_preserves_diagnostic(tmp_path, monkeypatch):
    service = fake_factory()
    pruned = asyncio.Event()
    def prune():
        pruned.set()
        raise OSError('retention failed')
    service.controller.store = SimpleNamespace(prune=Mock(side_effect=prune), purge_evidence=Mock())
    _, manager = owner(tmp_path, enabled=True, factory=fake_factory)
    manager._service, manager._active = service, True
    original_sleep = asyncio.sleep
    async def immediate(_):
        await original_sleep(0)
    monkeypatch.setattr('src.computer.manager.asyncio.sleep', immediate)
    manager._start_janitor(already_pruned=True)
    await manager._janitor
    assert pruned.is_set() and not manager.enabled
    assert manager.error == 'evidence_cleanup_failed'
    service.set_enabled.assert_awaited_once_with(False)
    await manager.close()
    service.controller.store.purge_evidence.assert_called_once()


async def test_enable_janitor_failure_discards_candidate(tmp_path, monkeypatch):
    service = fake_factory()
    _, manager = owner(tmp_path, factory=lambda *a, **k: service)
    monkeypatch.setattr(manager, '_start_janitor', Mock(side_effect=RuntimeError('janitor')))
    with pytest.raises(RuntimeError, match='janitor'):
        await manager.set_enabled(True)
    assert not manager.enabled and manager._service is None
    assert manager.error == 'evidence_cleanup_failed'
    service.close.assert_awaited_once()


async def test_toggle_validation_idempotence_and_persist_cancellation(tmp_path):
    _, manager = owner(tmp_path, factory=fake_factory)
    with pytest.raises(ValueError, match='boolean'):
        await manager.set_enabled(1)
    await manager.set_enabled(True)
    generation = manager.generation
    await manager.set_enabled(True)
    assert manager.generation == generation
    manager._persist = AsyncMock(return_value=(None, True))
    with pytest.raises(asyncio.CancelledError):
        await manager.set_enabled(False)
    assert not manager.enabled and manager._service is None
    await manager.close()
    with pytest.raises(RuntimeError, match='closing'):
        await manager.set_enabled(True)


async def test_dispatch_tracks_inflight_and_cleans_watchers_on_finish(tmp_path):
    _, manager = owner(tmp_path, factory=fake_factory)
    await manager.set_enabled(True)
    service = manager._service
    service._handle_computer_observe = AsyncMock(return_value={'frame': 'checked'})
    service._handle_computer_act = AsyncMock(side_effect=ComputerError('refused'))
    service.validate_delivery = AsyncMock(return_value='valid')
    service.finish_turn = AsyncMock(side_effect=RuntimeError('cleanup'))
    service.stop_channel = AsyncMock(return_value='stopped')
    token = _binding.set((manager, service, manager.generation))
    try:
        assert await manager._handle_computer_observe({'x': 1}) == {'frame': 'checked'}
        with pytest.raises(ComputerError, match='refused'):
            await manager._handle_computer_act({})
        assert await manager.validate_delivery('st', 'block', 'image') == 'valid'
        service.validate_delivery.assert_awaited_once_with('st', 'block', 'image')
        assert not manager._inflight
    finally:
        _binding.reset(token)
    key = ('alice', 'channel', 'turn')
    watcher = asyncio.create_task(asyncio.Event().wait())
    manager._watchers[key], manager._web_grants[key] = watcher, lambda: True
    with pytest.raises(RuntimeError, match='cleanup'):
        await manager.finish_turn(SimpleNamespace(user_id='alice', _req_id='turn'))
    assert watcher.cancelled() and not manager._watchers and not manager._web_grants
    assert await manager.stop_channel('alice', 'channel') == 'stopped'
    service.stop_channel.assert_awaited_once_with('alice', 'channel')
    await manager.close()


@pytest.mark.parametrize('failure', ['authorize', 'finish'])
async def test_authority_watcher_failure_is_fail_closed(tmp_path, monkeypatch, failure):
    _, manager = owner(tmp_path, factory=fake_factory)
    await manager.set_enabled(True)
    service = manager._service
    service._authorize = Mock(side_effect=RuntimeError('authority'))
    service.finish_turn = AsyncMock(return_value={'state': 'quarantined'})
    if failure == 'finish':
        service.finish_turn.side_effect = OSError('cleanup')
    original = asyncio.sleep
    async def immediate(_):
        await original(0)
    monkeypatch.setattr('src.computer.manager.asyncio.sleep', immediate)
    key = ('a', 'b', 'c')
    manager._web_grants[key] = lambda: True
    await manager._watch_authority(service, object(), key, object())
    assert not manager.enabled and manager.error == 'authority_cleanup_unverified'
    assert key not in manager._web_grants and key not in manager._watchers
    await manager.close()


async def test_operator_fallbacks_errors_and_artifact_conversion(tmp_path):
    _, manager = owner(tmp_path, factory=fake_factory)
    with pytest.raises(PermissionError):
        await manager.operator_observe()
    await manager.set_enabled(True)
    service = manager._service
    service.operator_pause = AsyncMock(side_effect=ComputerError('not_found'))
    assert await manager.operator_pause() == manager.snapshot()
    service.operator_pause.side_effect = ValueError('not hidden')
    with pytest.raises(ValueError, match='not hidden'):
        await manager.operator_pause()
    service.operator_export = AsyncMock(return_value={'expires_at': 0, 'artifact_id': 'id'})
    assert (await manager.operator_export())['expires_at'] == '1970-01-01T00:00:00+00:00'
    service.operator_download = AsyncMock(
        return_value=(b'\xff\xd8\xffdata', {'expires_at': 'unchanged'}))
    assert await manager.operator_download() == {'data': b'\xff\xd8\xffdata',
                                                'expires_at': 'unchanged',
                                                'content_type': 'image/jpeg'}
    for name in ('recover', 'acknowledge_legacy'):
        setattr(service, 'operator_' + name,
                AsyncMock(return_value={'generation': 7, 'state': 'closed'}))
        result = await getattr(manager, 'operator_' + name)()
        assert result['session_generation'] == 7 and result['generation'] == manager.generation
    manager._active = False
    assert await manager.operator_pause() == manager.snapshot()
    with pytest.raises(PermissionError):
        await manager.operator_export()
    assert not manager._inflight
    await manager.close()


async def test_authorization_does_not_trust_throwing_web_callback(tmp_path):
    _, manager = owner(tmp_path, factory=fake_factory)
    ctx = RequestContext('o', 'c', 't', 'h', surface='webui')
    assert not manager.authorize_context(ctx)
    await manager.set_enabled(True)
    manager._web_grants[('o', 'c', 't')] = Mock(side_effect=RuntimeError('expired'))
    assert not manager.authorize_context(ctx)
    await manager.close()
