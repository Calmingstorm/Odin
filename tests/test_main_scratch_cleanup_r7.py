"""Harmless cleanup faults. No connection to any desktop or display settings."""
import asyncio
import copy
import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'scripts/computer-feasibility'
sys.path.insert(0, str(DIRECTORY))
SPEC = importlib.util.spec_from_file_location('cleanup_r7', DIRECTORY / 'main_scratch_cleanup.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


@pytest.mark.asyncio
@pytest.mark.parametrize('fault', ['none', 'topology', 'windows', 'focus', 'power', 'snapshot'])
async def test_stages_independent_power_and_verification_always_run(tmp_path, fault):
    calls, stages = [], []
    before = {'randr': 'old', 'windows': 'old', 'power': 'Off'}
    after = {'randr': 'new', 'windows': 'new', 'power': 'On'}

    def invoke(name):
        calls.append(name)
        if name == fault:
            raise RuntimeError('harmless_stub_failure')
        if name == 'topology':
            after['randr'] = 'old'
        if name == 'windows':
            after['windows'] = 'old'
        if name == 'power':
            after['power'] = 'Off'
        if name == 'snapshot':
            return copy.deepcopy(after)

    result = await m.restore_desktop(stages=stages, base=tmp_path, before=before,
        restore_topology=lambda: invoke('topology'), restore_windows=lambda: invoke('windows'),
        restore_focus=lambda: invoke('focus'), restore_power=lambda: invoke('power'),
        snapshot=lambda: invoke('snapshot'))
    expected = ['topology', 'power', 'snapshot'] if fault == 'topology' else [
        'topology', 'windows', 'focus', 'power', 'snapshot']
    assert calls == expected
    assert result == (fault == 'none')
    if fault == 'none':
        assert all(row['ok'] for row in stages)
    else:
        assert not all(row['ok'] for row in stages)
    if fault == 'topology':
        blocked = [row for row in stages if row.get('reason') == 'baseline_topology_unavailable']
        assert len(blocked) == 2 and all(row['operator_action'] for row in blocked)


@pytest.mark.asyncio
async def test_repeated_cancellation_does_not_abandon_owned_cleanup():
    entered, release, completed = asyncio.Event(), asyncio.Event(), []

    async def cleanup():
        entered.set()
        await release.wait()
        completed.append(True)
        return 'verified'

    parent = asyncio.create_task(m.finish_cleanup(cleanup()))
    await entered.wait()
    for _ in range(3):
        parent.cancel()
        await asyncio.sleep(0)
    assert not parent.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(parent, 1)
    assert completed == [True]


@pytest.mark.asyncio
async def test_cleanup_exception_is_not_converted_to_success():
    async def failure():
        raise RuntimeError('stage_failed')

    with pytest.raises(RuntimeError, match='stage_failed'):
        await m.finish_cleanup(failure())


@pytest.mark.asyncio
async def test_exact_comparison_detects_extra_keys(tmp_path):
    stages = []
    result = await m.restore_desktop(stages=stages, base=tmp_path,
        before={'power': 'Off'}, restore_topology=lambda: None,
        restore_windows=lambda: None, restore_focus=lambda: None, restore_power=lambda: None,
        snapshot=lambda: {'power': 'Off', 'unexpected': True})
    assert not result and stages[-1]['result']['errors'] == ['unexpected']


@pytest.mark.asyncio
async def test_self_cancelled_stage_does_not_skip_power_and_comparison(tmp_path):
    calls, stages = [], []

    async def cancelled():
        raise asyncio.CancelledError

    assert not await m.restore_desktop(stages=stages, base=tmp_path, before={},
        restore_topology=lambda: None, restore_windows=cancelled,
        restore_focus=lambda: calls.append('focus'), restore_power=lambda: calls.append('power'),
        snapshot=lambda: {})
    assert calls == ['focus', 'power']
    assert stages[1]['error_type'] == 'CancelledError'
    assert stages[-1]['ok']


def test_cleanup_status_separates_task_error_from_restored_session():
    stages = [{'stage': 'task', 'ok': False}, {'stage': 'controller_close', 'ok': True},
              {'stage': 'compare_exact_session', 'ok': True}]
    result = m.cleanup_status(stages, start=1, baseline_validated=True)
    assert result['cleanup_complete'] and result['session_restored']
    assert not result['manual_actions']
    stages[1]['ok'] = False
    result = m.cleanup_status(stages, start=1, baseline_validated=True)
    assert not result['cleanup_complete'] and result['session_restored']
    assert result['manual_actions'][0]['stage'] == 'controller_close'


def test_preflight_failure_does_not_claim_baseline_restored():
    result = m.cleanup_status([{'stage': 'close_x_connection', 'ok': True}],
                             start=0, baseline_validated=False)
    assert result['cleanup_complete'] and result['session_restored'] is None
    assert not result['baseline_validated']


@pytest.mark.asyncio
@pytest.mark.parametrize('fault', ['none', 'live', 'quarantine', 'receipt', 'devices',
                                 'released', 'no_session'])
async def test_controller_close_none_requires_terminal_receipt(fault):
    from types import SimpleNamespace as NS  # noqa: N814 - concise fake constructor
    from unittest.mock import AsyncMock
    grant = NS(session_id='scratch', state='cancelled')
    receipt = dict.fromkeys(('complete', 'stopped', 'released', 'applications_preserved',
                             'input_revoked', 'capture_revoked'), True)
    receipt['owned_devices'] = 'removed'
    live = {}
    if fault == 'live':
        live['scratch'] = object()
    if fault == 'quarantine':
        grant.state = 'quarantined'
    if fault == 'receipt':
        receipt = None
    if fault == 'devices':
        receipt['owned_devices'] = 'unknown'
    if fault == 'released':
        receipt['released'] = False
    if fault == 'no_session':
        grant = None
    controller = NS(close=AsyncMock(return_value=None), _live=live,
        store=NS(find_session=lambda _: grant, cleanup=lambda _: receipt))
    result = await m.close_controller_verified(controller, object())
    assert bool(result.get('cleanup_verified')) == (fault in {'none', 'no_session'})
    controller.close.assert_awaited_once()
