import asyncio
import copy
import hashlib

import pytest

from src.computer.controller import ComputerController
from src.computer.models import ComputerError, LiveSession, RequestContext
from src.computer.runtime import recovery
from src.computer.runtime.backend import LinuxDesktopBackend
from src.computer.runtime.profile import unit_for
from src.computer.store import ComputerStore

BOOT = '12345678-1234-1234-1234-123456789abc'


def descriptor(sid='test', *, isolated=False):
    value = dict(version=1, session_id=sid, boot_id=BOOT, launch_pending=False, processes=[])
    if isolated:
        token = hashlib.sha256(sid.encode()).hexdigest()[:32] + '-' + 'a' * 32
        value.update(kind='isolated', token=token, unit=unit_for(token))
        value['processes'] = [{'pid': 90000, 'start_ticks': 100}]
    else:
        value.update(kind='processes', no_persistent_devices=True, input_was_enabled=False)
    return value


@pytest.fixture
def store(tmp_path):
    value = ComputerStore(tmp_path / 'state.db', tmp_path / 'evidence')
    yield value
    value.close()


def context(owner='owner', surface='webui'):
    return RequestContext(owner, 'channel', 'turn', 'localhost', surface=surface)


def quarantined(store, *, legacy=False):
    grant = store.create_session(context(), 'drawing')
    if not legacy:
        store.record_runtime(grant, descriptor(grant.session_id))
    store.recover()
    return store.get_session(grant.session_id)


@pytest.mark.asyncio
async def test_operator_absence_unblocks_without_replay(store, monkeypatch):
    grant = store.create_session(context(), 'drawing')
    store.record_runtime(grant, descriptor(grant.session_id))
    grant = store.set_state(grant.session_id, 'active')
    store.begin_action(grant, 'action', 'payload', 10)
    control = ComputerController(store, None, lambda _: True, enabled=True)
    grant = store.get_session(grant.session_id)
    async def gone(value):
        assert value['session_id'] == grant.session_id
        return {'status': 'absence_verified', 'reason': 'owned_runtime_gone'}
    monkeypatch.setattr(recovery, 'verify_absence', gone)
    result = await control.reconcile_recovery(context(), grant.session_id, grant.generation)
    assert result['state'] == 'closed'
    assert result['recovery']['complete'] is True
    assert store.receipt(grant.session_id, 'action', 'payload')['status'] == 'unknown'
    assert store.create_session(context(), 'drawing').state == 'starting'
    assert 'boot_id' not in str(result)


@pytest.mark.asyncio
async def test_legacy_explicit_acknowledgment_is_not_clean(store):
    grant = quarantined(store, legacy=True)
    control = ComputerController(store, None, lambda _: True)
    result = await control.reconcile_recovery(context(), grant.session_id, grant.generation)
    assert result['state'] == 'quarantined'
    with pytest.raises(ComputerError, match='explicit_acknowledgment_required'):
        await control.acknowledge_legacy_recovery(context(), grant.session_id, grant.generation, '')
    result = await control.acknowledge_legacy_recovery(
        context(), grant.session_id, grant.generation,
        f'ACKNOWLEDGE UNVERIFIED CLEANUP {grant.session_id}')
    assert result['state'] == 'closed'
    assert result['cleanup']['complete'] is False
    assert result['recovery']['status'] == 'operator_acknowledged_unverified'
    assert store.create_session(context(), 'drawing')


@pytest.mark.asyncio
@pytest.mark.parametrize('ctx,error', [(context(surface='discord'), 'operator_surface_required'),
                                     (context('other'), 'not_found')])
async def test_recovery_operator_binding(store, ctx, error):
    grant = quarantined(store)
    control = ComputerController(store, None, lambda _: True)
    with pytest.raises(ComputerError, match=error):
        await control.reconcile_recovery(ctx, grant.session_id, grant.generation)


@pytest.mark.asyncio
async def test_recovery_rechecks_auth_and_generation(store, monkeypatch):
    grant = quarantined(store)
    allowed = True
    control = ComputerController(store, None, lambda _: allowed)
    async def inspect(value):
        store.set_state(grant.session_id, 'quarantined', revoke=True)
        return {'status': 'absence_verified', 'reason': 'owned_runtime_gone'}
    monkeypatch.setattr(recovery, 'verify_absence', inspect)
    with pytest.raises(ComputerError, match='stale_generation'):
        await control.reconcile_recovery(context(), grant.session_id, grant.generation)
    assert store.get_session(grant.session_id).state == 'quarantined'
    async def revoke(value):
        nonlocal allowed
        allowed = False
        return {'status': 'absence_verified', 'reason': 'owned_runtime_gone'}
    monkeypatch.setattr(recovery, 'verify_absence', revoke)
    grant = store.get_session(grant.session_id)
    with pytest.raises(ComputerError, match='not_found'):
        await control.reconcile_recovery(context(), grant.session_id, grant.generation)


def stat_file(root, pid, start, state='S', group=1):
    path = root / str(pid)
    path.mkdir(exist_ok=True)
    fields = [state, '1', str(group), '1'] + ['0'] * 15 + [str(start)]
    (path / 'stat').write_text(f'{pid} (process with spaces) ' + ' '.join(fields))


def test_pid_reuse_zombie_and_unknown(tmp_path):
    value = descriptor()
    value['processes'] = [{'pid': 45, 'start_ticks': 100}]
    assert recovery._processes_gone(value, proc_root=tmp_path) is None
    stat_file(tmp_path, 45, 101)
    assert recovery._processes_gone(value, proc_root=tmp_path) is None
    stat_file(tmp_path, 45, 100, 'Z')
    assert recovery._processes_gone(value, proc_root=tmp_path) == 'owned_process_remaining'
    (tmp_path / '45' / 'stat').write_text('bad')
    assert recovery._processes_gone(value, proc_root=tmp_path) == 'process_inspection_unavailable'


@pytest.mark.asyncio
async def test_exact_unit_cgroup_and_input_proof(monkeypatch):
    monkeypatch.setattr(recovery, 'boot_id', lambda: BOOT)
    monkeypatch.setattr(recovery, '_processes_gone', lambda _: None)
    monkeypatch.setattr(recovery, '_cgroup_empty', lambda _: True)
    value = descriptor(isolated=True)
    state = {'Id': value['unit'], 'LoadState': 'not-found', 'ActiveState': 'inactive',
             'MainPID': '0', 'ControlPID': '0', 'Job': '', 'ControlGroup': ''}
    async def query(unit):
        assert unit == value['unit']
        return state
    monkeypatch.setattr(recovery, '_unit_state', query)
    assert (await recovery.verify_absence(value))['status'] == 'absence_verified'
    for key, wrong in [('Id', 'unrelated.service'), ('MainPID', '44'), ('Job', '10'),
                       ('ActiveState', 'active'), ('ControlGroup', '/unrelated')]:
        previous = state[key]
        state[key] = wrong
        assert (await recovery.verify_absence(value))['status'] == 'unknown'
        state[key] = previous
    monkeypatch.setattr(recovery, '_cgroup_empty', lambda _: False)
    assert (await recovery.verify_absence(value))['reason'] == 'cgroup_absence_unproven'
    attached = descriptor()
    attached['input_was_enabled'] = True
    assert (await recovery.verify_absence(attached))['reason'] == 'owned_input_release_unproven'
    attached['launch_pending'] = True
    assert (await recovery.verify_absence(attached))['reason'] == 'launch_identity_incomplete'
    monkeypatch.setattr(recovery, 'boot_id', lambda: 'a' * 36)
    assert (await recovery.verify_absence(attached))['reason'] == 'host_rebooted'


def test_identity_frozen_and_revocation(store):
    grant = store.create_session(context(), 'drawing')
    value = descriptor(grant.session_id, isolated=True)
    store.record_runtime(grant, value)
    bad = copy.deepcopy(value)
    bad['unit'] = 'unrelated.service'
    with pytest.raises(ComputerError):
        store.record_runtime(grant, bad)
    bad = descriptor(grant.session_id)
    with pytest.raises(ComputerError):
        store.record_runtime(grant, bad)
    store.recover()
    with pytest.raises(ComputerError, match='grant_revoked'):
        store.record_runtime(grant, value)


def test_descriptor_precedes_launch_and_survives_copy(monkeypatch):
    monkeypatch.setattr(recovery, 'boot_id', lambda: BOOT)
    backend = LinuxDesktopBackend(enabled=True)
    value = backend.startup_descriptor('session')
    recovery.validate_descriptor(value, 'session')
    assert value['launch_pending'] is True
    assert backend._process is None
    value['unit'] = 'bad'
    assert backend.startup_descriptor('session')['unit'] != 'bad'


def test_late_spawn_cannot_inherit_resumed_generation(store, monkeypatch):
    monkeypatch.setattr(recovery, 'boot_id', lambda: BOOT)
    control = ComputerController(store, None, lambda _: True)
    grant = store.create_session(context(), 'drawing')
    backend = LinuxDesktopBackend(enabled=True)
    control._live[grant.session_id] = LiveSession(backend, 99999)
    control._prepare_runtime(grant, backend)
    old = backend.startup_descriptor(grant.session_id)
    old['processes'] = [{'pid': 456, 'start_ticks': 123}]
    old['launch_pending'] = False
    store.set_state(grant.session_id, 'paused', revoke=True)
    store.set_state(grant.session_id, 'active', revoke=True)
    with pytest.raises(ComputerError, match='grant_revoked'):
        backend.runtime_identity_callback(old)


@pytest.mark.asyncio
async def test_constructor_does_not_inspect_and_recovery_is_bounded(store, monkeypatch):
    grant = quarantined(store)
    called = False
    async def slow(value):
        nonlocal called
        called = True
        await asyncio.sleep(100)
    monkeypatch.setattr(recovery, 'verify_absence', slow)
    control = ComputerController(store, None, lambda _: True)
    assert called is False
    from src.computer import controller
    original = controller._bounded
    async def fast(value, timeout):
        return await original(value, .01)
    monkeypatch.setattr(controller, '_bounded', fast)
    result = await control.reconcile_recovery(context(), grant.session_id, grant.generation)
    assert result['state'] == 'quarantined'
    assert result['recovery']['reason'] == 'inspection_timeout'


def test_no_created_devices_cleanup_truth(store):
    grant = store.create_session(context(), 'drawing')
    store.record_cleanup(grant.session_id,
                         {'owned_devices': 'not_created', 'input_was_enabled': False}, clean=True)
    assert store.cleanup(grant.session_id)['owned_devices'] == 'not_created'
    assert store.cleanup(grant.session_id)['input_was_enabled'] is False


def test_cgroup_v2_evidence(tmp_path):
    unit = unit_for('fixture')
    assert recovery._cgroup_empty(unit, root=tmp_path) is False
    (tmp_path / 'cgroup.controllers').write_text('cpu memory')
    assert recovery._cgroup_empty(unit, root=tmp_path) is True
    group = tmp_path / 'system.slice' / unit
    group.mkdir(parents=True)
    (group / 'cgroup.events').write_text('populated 1\nfrozen 0\n')
    assert recovery._cgroup_empty(unit, root=tmp_path) is False
    (group / 'cgroup.events').write_text('populated 0\nfrozen 0\n')
    assert recovery._cgroup_empty(unit, root=tmp_path) is True


@pytest.mark.asyncio
async def test_supervisor_eof_before_gate_never_launches(monkeypatch):
    from src.computer.runtime.supervisor import Supervisor
    called = False
    async def connect(factory, pipe):
        protocol = factory()
        protocol.eof_received()
    async def spawn(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError('launch before durable gate')
    monkeypatch.setattr(asyncio.get_running_loop(), 'connect_read_pipe', connect)
    monkeypatch.setattr(asyncio, 'create_subprocess_exec', spawn)
    await Supervisor('fixture', 'drawing').run()
    assert called is False


def test_reopen_preserves_descriptor_and_unknown_receipt(tmp_path):
    path = tmp_path / 'db'
    evidence = tmp_path / 'evidence'
    first = ComputerStore(path, evidence)
    grant = first.create_session(context(), 'drawing')
    value = descriptor(grant.session_id)
    first.record_runtime(grant, value)
    grant = first.set_state(grant.session_id, 'active')
    first.begin_action(grant, 'one', 'payload', 10)
    first.close()
    second = ComputerStore(path, evidence)
    try:
        second.recover()
        assert second.runtime_descriptor(grant.session_id) == value
        assert second.receipt(grant.session_id, 'one', 'payload')['status'] == 'unknown'
    finally:
        second.close()
