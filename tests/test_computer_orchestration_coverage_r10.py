"""In-process controller authority and evidence regressions, without desktop I/O."""
import asyncio
from dataclasses import replace
from unittest.mock import AsyncMock

import pytest

from src.computer.controller import ComputerController, _bounded, _text
from src.computer.models import ComputerError, RequestContext
from src.computer.store import ComputerStore
from tests.test_computer_contract_r1 import Stub


@pytest.fixture
async def rig(tmp_path):
    backend = Stub()
    store = ComputerStore(tmp_path / 'db', tmp_path / 'evidence')
    ctx = RequestContext('owner', 'channel', 'turn', 'host')
    controller = ComputerController(store, lambda _: backend, AsyncMock(return_value=True),
                                    enabled=True)
    try:
        yield controller, backend, store, ctx
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize('value', [None, 42, 'x' * 4097, '\ud800', 'bad\x00', '\x1f'])
def test_text_rejects_non_utf8_controls_and_excess(value):
    with pytest.raises(ComputerError, match='invalid_text'):
        _text(value)


def test_text_preserves_allowed_whitespace():
    assert _text('héllo\n\t') == 'héllo\n\t'


async def test_bounded_cancellation_reaps_child():
    entered, finished = asyncio.Event(), asyncio.Event()
    async def child():
        entered.set()
        try:
            await asyncio.Event().wait()
        finally:
            finished.set()
    task = asyncio.create_task(_bounded(child(), 60))
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await asyncio.wait_for(finished.wait(), 1)
    assert task.cancelled()


async def test_resume_rebinds_turn_consent_and_exports_evidence(rig):
    controller, backend, store, ctx = rig
    backend.pause = AsyncMock(return_value={'released': True})
    backend.export = AsyncMock(return_value=b'export bytes')
    consent = 1
    original = backend.observe
    async def observe():
        raw = await original()
        return replace(raw, source=replace(raw.source, consent_generation=consent),
                       scope=replace(raw.scope, consent_generation=consent))
    async def resume(*, consent_generation):
        nonlocal consent
        consent = consent_generation
    backend.observe, backend.resume = observe, AsyncMock(side_effect=resume)
    started = await controller.session(ctx, {'operation': 'start', 'app': 'profile'})
    sid = started['session_id']
    paused = await controller.session(ctx, {'operation': 'pause', 'session_id': sid})
    assert paused['state'] == 'paused' and paused['generation'] > started['generation']
    next_ctx = replace(ctx, turn_id='next')
    prior_consent = store.get_session(sid).consent_generation
    resumed = await controller.session(next_ctx, {'operation': 'resume', 'session_id': sid,
                                                 'generation': paused['generation']})
    assert resumed['state'] == 'active' and store.get_session(sid).turn_id == 'next'
    stored_consent = store.get_session(sid).consent_generation
    assert stored_consent > prior_consent
    backend.resume.assert_awaited_once_with(consent_generation=stored_consent)
    observation = await controller.session(next_ctx, {'operation': 'reconcile', 'session_id': sid,
                                                      'generation': resumed['generation']})
    assert observation['image_bytes'].startswith(b'\x89PNG')
    artifact = await controller.session(next_ctx, {'operation': 'export', 'session_id': sid,
                        'generation': resumed['generation'], 'name': 'drawing.png'})
    web = replace(next_ctx, surface='webui', channel_id='operator')
    content, metadata = await controller.read_evidence(web, artifact['artifact_id'])
    assert content == b'export bytes' and metadata['expires_at'] == artifact['expires_at']
    with pytest.raises(ComputerError, match='operator_surface_required'):
        await controller.read_evidence(next_ctx, artifact['artifact_id'])


async def test_operator_authority_and_export(rig):
    controller, backend, store, ctx = rig
    web = replace(ctx, surface='webui')
    with pytest.raises(ComputerError, match='not_found'):
        await controller.operator_session(web, 'status')
    with pytest.raises(ComputerError, match='unsupported_operation'):
        await controller.operator_session(web, 'start')
    await controller.session(ctx, {'operation': 'start', 'app': 'profile'})
    backend.export = AsyncMock(return_value=b'operator export')
    status = await controller.operator_session(web, 'status')
    assert status['state'] == 'active'
    observed = await controller.operator_observe(web)
    assert observed['session_id'] == status['session_id'] and observed['image_bytes']
    artifact = await controller.operator_export(web, 'result.png')
    assert (await controller.read_evidence(web, artifact['artifact_id']))[0] == b'operator export'
    with pytest.raises(ComputerError, match='evidence_unavailable'):
        await controller.read_evidence(web, 'missing')
    backend.pause = AsyncMock(return_value={'released': True})
    assert (await controller.operator_session(web, 'pause'))['state'] == 'paused'
    assert (await controller.operator_session(web, 'close'))['state'] == 'closed'
    assert (await controller.session(ctx, {'operation': 'close'}))['state'] == 'closed'


@pytest.mark.parametrize('problem', ['missing', 'throws', 'changed'])
async def test_failed_resume_cannot_restore_input(rig, problem):
    controller, backend, store, ctx = rig
    backend.pause = AsyncMock(return_value={'released': True})
    started = await controller.session(ctx, {'operation': 'start', 'app': 'profile'})
    paused = await controller.session(ctx, {'operation': 'pause'})
    if problem == 'throws':
        backend.resume = AsyncMock(side_effect=RuntimeError('resume failed'))
    elif problem == 'changed':
        async def resume(**kw):
            backend.capabilities = replace(backend.capabilities, platform='x11')
        backend.resume = resume
    with pytest.raises((ComputerError, RuntimeError)):
        await controller.session(ctx, {'operation': 'resume', 'generation': paused['generation']})
    assert store.get_session(started['session_id']).state != 'active'
    assert not controller._live.get(started['session_id']) or problem == 'missing'


@pytest.mark.parametrize('value', [9, '', 'x' * 97])
async def test_start_rejects_invalid_profile_before_factory(rig, value):
    controller, backend, store, ctx = rig
    factory = AsyncMock(return_value=backend)
    controller.backend_factory = factory
    with pytest.raises(ComputerError, match='unsupported_app'):
        await controller.session(ctx, {'operation': 'start', 'app': value})
    factory.assert_not_called()


async def test_async_factory_and_invalid_selection(rig):
    controller, backend, store, ctx = rig
    controller.backend_factory = AsyncMock(return_value=backend)
    grant = await controller.session(ctx, {'operation': 'start', 'app': 'profile'})
    inp = {'session_id': grant['session_id'], 'generation': grant['generation']}
    with pytest.raises(ComputerError, match='invalid_source_selection'):
        await controller.observe(ctx, {**inp, 'source_id': ''})
    with pytest.raises(ComputerError, match='source_selection_unavailable'):
        await controller.observe(ctx, {**inp, 'source_id': 'source'})
    with pytest.raises(ComputerError, match='invalid_export_name'):
        await controller.session(ctx, {**inp, 'operation': 'export'})
    with pytest.raises(ComputerError, match='resume_unavailable'):
        await controller.session(ctx, {**inp, 'operation': 'resume'})
    with pytest.raises(ComputerError, match='unsupported_operation'):
        await controller.session(ctx, {'operation': 'invented'})


@pytest.mark.parametrize('pause_kind', ['missing', 'invalid', 'raises'])
async def test_pause_without_verified_release_stops(rig, pause_kind):
    controller, backend, store, ctx = rig
    await controller.session(ctx, {'operation': 'start', 'app': 'profile'})
    if pause_kind != 'missing':
        backend.pause = AsyncMock(return_value={}, side_effect=(
            RuntimeError('release failed') if pause_kind == 'raises' else None))
    result = await controller.session(ctx, {'operation': 'pause'})
    assert result['state'] == 'cancelled' and backend.stopped
    with pytest.raises(ComputerError, match='grant_revoked'):
        await controller._pause(result['session_id'])


async def test_missing_live_adapter_quarantines_instead_of_claiming_cleanup(rig):
    controller, backend, store, ctx = rig
    grant = store.create_session(ctx, 'profile')
    result = await controller._pause(grant.session_id)
    assert result['state'] == 'quarantined'
    result = await controller._stop(grant.session_id, 'closed')
    assert result['state'] == 'quarantined' and not backend.stopped


async def test_deadline_revokes_owned_session(rig):
    controller, backend, store, ctx = rig
    grant = await controller.session(ctx, {'operation': 'start', 'app': 'profile'})
    await controller._deadline(grant['session_id'], 0)
    assert store.get_session(grant['session_id']).state == 'cancelled'
    assert backend.stopped
