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
    assert result == (fault in {'none', 'focus'})
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
    assert await asyncio.wait_for(parent, 1) == 'verified'
    assert completed == [True]


@pytest.mark.asyncio
async def test_cleanup_exception_is_not_converted_to_success():
    async def failure():
        raise RuntimeError('stage_failed')

    with pytest.raises(RuntimeError, match='stage_failed'):
        await m.finish_cleanup(failure())
