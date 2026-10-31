"""Host-admin lifecycle access, entirely synthetic and no desktop connection."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from tests.test_computer_reconciliation_r18 import context, rig


@pytest.mark.asyncio
async def test_cross_owner_status_select_and_stop_preserve_actor(rig, monkeypatch):
    store, controller, grant = rig
    checked = []
    controller.authorize = lambda ctx: checked.append(ctx.owner_id) or True
    result = await controller.operator_session(context(), 'status', session_id=grant.session_id)
    assert result['owner_id'] == 'foreign-owner'
    assert result['input_supported'] is False
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
    with pytest.raises(ComputerError, match='not_found'):
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
