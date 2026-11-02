"""Host-admin access to sessions someone else started; synthetic, no desktop connection."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.controller import ComputerController
from src.computer.models import ComputerError, RequestContext
from src.computer.store import ComputerStore
from tests.test_computer_contract_r1 import Stub
from tests.test_computer_reconciliation_r18 import context

pytest_plugins = ["tests.test_computer_reconciliation_r18"]


@pytest.mark.asyncio
async def test_cross_owner_status_select_and_stop_preserve_actor(rig, monkeypatch):
    store, controller, grant = rig
    checked = []
    controller.authorize = lambda ctx: checked.append(ctx.owner_id) or True
    result = await controller.operator_session(context(), 'status', session_id=grant.session_id)
    assert result['owner_id'] == 'foreign-owner'
    assert result.get('input_supported') is not True
    assert result['sessions'][0]['session_id'] == grant.session_id
    stop = AsyncMock()
    monkeypatch.setattr(controller, '_stop', stop)
    await controller.operator_session(context(), 'stop', session_id=grant.session_id,
                                      generation=grant.generation)
    stop.assert_awaited_once_with(grant.session_id, 'cancelled')
    assert set(checked) == {'admin'}
    with pytest.raises(ComputerError, match='stale_generation'):
        await controller.operator_session(context(), 'stop', session_id=grant.session_id,
                                          generation=grant.generation + 1)
    controller.enabled = True
    # Any admin's Pause reaches a session someone else started (Aaron,
    # 2026-11-01); this quarantined one is already revoked.
    with pytest.raises(ComputerError, match='grant_revoked'):
        await controller.operator_session(context(), 'pause', session_id=grant.session_id)


@pytest.mark.asyncio
@pytest.mark.parametrize('proof', [True, False, 'idle'])
async def test_live_reconcile_requires_exact_proof_never_generic_idle(rig, monkeypatch, proof):
    store, controller, grant = rig
    receipt = store.receipt(grant.session_id, 'uncertain-input', 'payload')
    descriptor = store.runtime_descriptor(grant.session_id)
    helper = AsyncMock(return_value={
        'reconciled': proof, 'proof_scope': 'recorded_synthetic_devices_only',
        'physical_release_proven': False})
    live = SimpleNamespace(backend=SimpleNamespace(reconcile_owned_cleanup=helper),
                           capabilities=None, observations={}, revoked=False)
    controller._live[grant.session_id] = live

    async def stopped(sid, state):
        assert live.revoked is True
        store.set_state(sid, state)

    stop = AsyncMock(side_effect=stopped)
    monkeypatch.setattr(controller, '_stop', stop)
    result = await controller.reconcile_recovery(context(), grant.session_id, grant.generation)
    assert helper.await_count == 1
    assert stop.await_count == int(proof is True)
    assert result['state'] == ('closed' if proof is True else 'quarantined')
    assert store.receipt(grant.session_id, 'uncertain-input', 'payload') == receipt
    assert store.runtime_descriptor(grant.session_id) == descriptor


@pytest.mark.asyncio
async def test_live_reconcile_auth_revocation_stops_cleanup_continuation(rig, monkeypatch):
    _, controller, grant = rig
    allowed = True

    async def recover():
        nonlocal allowed
        allowed = False
        return {'reconciled': True, 'proof_scope': 'recorded_synthetic_devices_only',
                'physical_release_proven': False}

    controller.authorize = lambda _: allowed
    controller._live[grant.session_id] = SimpleNamespace(
        backend=SimpleNamespace(reconcile_owned_cleanup=recover), capabilities=None,
        observations={}, revoked=False)
    stop = AsyncMock()
    monkeypatch.setattr(controller, '_stop', stop)
    with pytest.raises(ComputerError, match='not_found'):
        await controller.reconcile_recovery(context(), grant.session_id, grant.generation)
    stop.assert_not_awaited()


@pytest.mark.asyncio
async def test_real_backend_probe_persists_only_exact_fenced_runtime(rig):
    """Real backend/controller, fake native query and fake process identities."""
    import copy

    from tests.test_computer_x11_live_reconcile_proof import IDENTITY, backend

    store, controller, grant = rig
    b = backend()
    b._runtime_descriptor = store.runtime_descriptor(grant.session_id)
    b._runtime_descriptor['launch_pending'] = False
    store.record_reconciliation_runtime(grant, b._runtime_descriptor)
    b._shared_cleanup_identity = copy.deepcopy(IDENTITY)
    def original(_):
        pytest.fail('ordinary revoked runtime callback must not run')
    b.runtime_identity_callback = original

    async def query(expected):
        b._record_spawn()
        b._record_spawn(identity={'pid': 90001, 'start_ticks': 200})
        return {'ok': True, 'all_up': True, 'device_identity': expected,
                'proof_scope': 'recorded_synthetic_devices_only',
                'physical_release_proven': False}

    b._query_shared_all_up = query
    controller._live[grant.session_id] = SimpleNamespace(
        backend=b, capabilities=b.capabilities, observations={}, revoked=False)
    result = await controller.reconcile_recovery(context(), grant.session_id, grant.generation)
    assert result['state'] == 'closed'
    assert store.cleanup(grant.session_id)['complete'] is True
    assert result['cleanup']['release_proof_scope'] == 'recorded_synthetic_devices_only'
    assert result['cleanup']['physical_release_proven'] is False
    assert b._release_failed is True
    assert b.runtime_identity_callback is original
    assert store.runtime_descriptor(grant.session_id)['processes'][-1] == {
        'pid': 90001, 'start_ticks': 200}


@pytest.mark.asyncio
@pytest.mark.parametrize('operation', ['observe', 'export'])
async def test_observe_and_export_act_on_the_selected_session_never_the_current_one(
        tmp_path, operation):
    """Odin's PR #755 review: a closed Discord session is selected while another is active."""
    store = ComputerStore(tmp_path / 'db', tmp_path / 'evidence')
    backend = Stub()
    backend.export = AsyncMock(return_value=b'CURRENT-CONTENT')
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    operator = RequestContext('api-admin', 'browser', 'web-operator', 'localhost', surface='webui')

    def act(**selection):
        if operation == 'observe':
            return controller.operator_observe(operator, **selection)
        return controller.operator_export(operator, 'selected.png', **selection)

    def evidence_count():
        return store.db.execute('SELECT COUNT(*) FROM evidence').fetchone()[0]

    try:
        first = RequestContext('discord-owner-a', 'channel-a', 'turn-a', 'localhost')
        closed = await controller.session(first, {'operation': 'start', 'app': 'profile-a'})
        await controller.session(first, {'operation': 'close', 'session_id': closed['session_id']})
        second = RequestContext('discord-owner-b', 'channel-b', 'turn-b', 'localhost')
        current = await controller.session(second, {'operation': 'start', 'app': 'profile-b'})
        a, b = (store.get_session(s['session_id']) for s in (closed, current))
        before = evidence_count()
        with pytest.raises(ComputerError, match='grant_revoked'):
            await act(session_id=a.session_id, generation=a.generation)
        with pytest.raises(ComputerError, match='stale_generation'):
            await act(session_id=b.session_id, generation=b.generation + 1)
        assert evidence_count() == before and not backend.export.await_count
        result = await act(session_id=b.session_id, generation=b.generation)
        evidence = result['evidence_id' if operation == 'observe' else 'artifact_id']
        assert store.db.execute('SELECT session_id FROM evidence WHERE evidence_id=?',
                                (evidence,)).fetchone()[0] == b.session_id
    finally:
        await controller.close()
        store.close()
