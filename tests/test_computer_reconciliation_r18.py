"""Offline operator reconciliation regressions; all state lives under tmp_path."""
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer import accessibility_status
from src.computer.controller import ComputerController
from src.computer.integration import ComputerIntegration
from src.computer.models import ComputerError, RequestContext
from src.computer.runtime import recovery
from src.computer.store import ComputerStore
from src.config.schema import ComputerUseConfig
from src.web.computer_binding import operator_scope

BOOT = '12345678-1234-1234-1234-123456789abc'


def context(owner='admin'):
    return RequestContext(owner, ComputerIntegration.web_binding('browser'),
                          'web-operator', 'localhost', surface='webui')


def descriptor(sid='test', pending=True):
    return dict(version=1, session_id=sid, boot_id=BOOT, kind='processes',
                launch_pending=pending, processes=[{'pid': 90000, 'start_ticks': 100}],
                no_persistent_devices=False, input_was_enabled=True)


@pytest.fixture
def rig(tmp_path):
    store = ComputerStore(tmp_path / 'state.db', tmp_path / 'evidence')
    grant = store.create_session(context('foreign-owner'), environment='existing_session')
    store.record_runtime(grant, descriptor(grant.session_id))
    grant = store.set_state(grant.session_id, 'active')
    store.begin_action(grant, 'uncertain-input', 'payload', 10)
    store.record_cleanup(grant.session_id, {
        'stopped': False, 'released': False, 'applications_preserved': True,
        'owned_devices': 'retained_inactive'}, clean=False)
    controller = ComputerController(store, None, lambda _: True, enabled=False)
    yield store, controller, store.get_session(grant.session_id)
    store.close()


def acknowledgment(grant):
    return f'ACKNOWLEDGE UNVERIFIED CLEANUP {grant.session_id}'


async def reconcile(rig, ctx=None, generation=None, phrase=None):
    _, controller, grant = rig
    return await controller.operator_reconcile(
        ctx or context(), grant.session_id,
        grant.generation if generation is None else generation,
        acknowledgment(grant) if phrase is None else phrase)


@pytest.mark.asyncio
async def test_foreign_attestation_archives_without_clean_claim_or_replay(rig, monkeypatch):
    store, controller, grant = rig
    prior_cleanup = store.cleanup(grant.session_id)
    prior_identity = store.runtime_descriptor(grant.session_id)
    prior_receipt = store.receipt(grant.session_id, 'uncertain-input', 'payload')
    inspector = AsyncMock(return_value={'status': 'attestation_eligible'})
    monkeypatch.setattr(recovery, 'verify_reconciliation_prerequisites', inspector)
    result = await reconcile(rig)
    inspector.assert_awaited_once_with(prior_identity)
    assert result['state'] == 'closed'
    assert result['generation'] == grant.generation + 1
    assert result['recovery']['status'] == 'operator_acknowledged_unverified'
    assert result['recovery']['complete'] is False
    assert result['recovery']['prior_launch_pending'] is True
    assert result['recovery']['operator_id'] == 'admin'
    assert store.cleanup(grant.session_id) == prior_cleanup
    assert store.runtime_descriptor(grant.session_id) == prior_identity
    assert store.receipt(grant.session_id, 'uncertain-input', 'payload') == prior_receipt
    assert prior_receipt['status'] == 'unknown'
    assert not controller._live
    assert store.create_session(context(), environment='existing_session').state == 'starting'


@pytest.mark.asyncio
@pytest.mark.parametrize('phrase', ['', 'acknowledge', 'ACKNOWLEDGE UNVERIFIED CLEANUP wrong',
                                   'ACKNOWLEDGE UNVERIFIED CLEANUP {sid} '])
async def test_exact_phrase_required_before_inspection(rig, monkeypatch, phrase):
    inspector = AsyncMock()
    monkeypatch.setattr(recovery, 'verify_reconciliation_prerequisites', inspector)
    with pytest.raises(ComputerError, match='explicit_acknowledgment_required'):
        await reconcile(rig, phrase=phrase.format(sid=rig[2].session_id))
    inspector.assert_not_awaited()
    assert rig[0].get_session(rig[2].session_id).state == 'quarantined'


@pytest.mark.asyncio
@pytest.mark.parametrize('case,error', [
    ('active', 'recovery_unavailable'), ('paused', 'recovery_unavailable'),
    ('starting', 'recovery_unavailable'), ('closed', 'recovery_unavailable'),
    ('live', 'recovery_unavailable'), ('isolated', 'recovery_unavailable'),
    ('missing', 'runtime_identity_required'), ('host', 'not_found'),
    ('surface', 'operator_surface_required'), ('turn', 'operator_surface_required'),
    ('generation', 'stale_generation'), ('bool-generation', 'stale_generation'),
    ('unauthorized', 'not_found')])
async def test_reconciliation_refuses_invalid_authority_or_runtime(rig, monkeypatch, case, error):
    store, controller, grant = rig
    ctx, gen = context(), grant.generation
    if case in {'active', 'paused', 'starting', 'closed'}:
        store.set_state(grant.session_id, case)
    elif case == 'live':
        controller._live[grant.session_id] = object()
    elif case == 'isolated':
        store.db.execute("UPDATE sessions SET environment='isolated' WHERE session_id=?",
                         (grant.session_id,))
    elif case == 'missing':
        store.db.execute('DELETE FROM session_runtime WHERE session_id=?', (grant.session_id,))
    elif case == 'host':
        ctx = replace(ctx, host_id='other-host')
    elif case == 'surface':
        ctx = replace(ctx, surface='discord')
    elif case == 'turn':
        ctx = replace(ctx, turn_id='ordinary-chat')
    elif case == 'generation':
        gen += 1
    elif case == 'bool-generation':
        gen = True
    else:
        controller.authorize = lambda _: False
    inspector = AsyncMock()
    monkeypatch.setattr(recovery, 'verify_reconciliation_prerequisites', inspector)
    with pytest.raises(ComputerError, match=error):
        await reconcile(rig, ctx=ctx, generation=gen)
    inspector.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize('change', ['auth', 'generation', 'state'])
async def test_post_await_authority_and_generation_cas(rig, monkeypatch, change):
    store, controller, grant = rig
    allowed = True
    auth_calls = []

    def auth(ctx):
        auth_calls.append(ctx)
        return allowed

    async def inspect(value):
        nonlocal allowed
        if change == 'auth':
            allowed = False
        elif change == 'generation':
            store.set_state(grant.session_id, 'quarantined', revoke=True)
        else:
            store.set_state(grant.session_id, 'paused')
        return {'status': 'attestation_eligible'}

    controller.authorize = auth
    monkeypatch.setattr(recovery, 'verify_reconciliation_prerequisites', inspect)
    with pytest.raises(ComputerError, match='not_found' if change == 'auth' else 'stale_generation'):
        await reconcile(rig)
    assert len(auth_calls) == 2
    assert store.get_session(grant.session_id).state != 'closed'
    assert store.recovery_status(grant.session_id) is None or (
        store.recovery_status(grant.session_id)['status'] != 'operator_acknowledged_unverified')


@pytest.mark.asyncio
@pytest.mark.parametrize('reason', ['owned_process_remaining', 'process_inspection_unavailable',
                                   'owned_process_group_remaining'])
async def test_unknown_machine_result_keeps_quarantine(rig, monkeypatch, reason):
    store, _, grant = rig
    prior = store.cleanup(grant.session_id)
    monkeypatch.setattr(recovery, 'verify_reconciliation_prerequisites',
                        AsyncMock(return_value={'status': 'unknown', 'reason': reason}))
    result = await reconcile(rig)
    assert result['state'] == 'quarantined'
    assert result['generation'] == grant.generation
    assert result['recovery'] == {'status': 'unknown', 'reason': reason, 'complete': False}
    assert store.cleanup(grant.session_id) == prior


@pytest.mark.asyncio
async def test_foreign_status_is_lifecycle_only_and_legacy_routes_remain_owner_bound(rig, monkeypatch):
    store, controller, grant = rig
    monkeypatch.setattr(controller, '_public_session', lambda _: pytest.fail('foreign evidence access'))
    result = await controller.operator_session(context(), 'status')
    assert result['session_id'] == grant.session_id
    assert result['generation'] == grant.generation
    assert result['state'] == 'quarantined'
    assert result['input_supported'] is False
    assert set(result) <= {'session_id', 'generation', 'state', 'platform', 'environment',
                           'app', 'recovery', 'input_supported', 'input_readiness', 'input_blocker'}
    assert result['app'] is None
    assert 'foreign-owner' not in str(result)
    assert BOOT not in str(result)
    with pytest.raises(ComputerError, match='not_found'):
        await controller.reconcile_recovery(context(), grant.session_id, grant.generation)
    store.db.execute('DELETE FROM session_runtime WHERE session_id=?', (grant.session_id,))
    with pytest.raises(ComputerError, match='not_found'):
        await controller.acknowledge_legacy_recovery(
            context(), grant.session_id, grant.generation, acknowledgment(grant))


@pytest.mark.asyncio
@pytest.mark.parametrize('authorized,host_allowed,expected', [
    (True, True, True), (False, True, False), (True, False, False)])
async def test_integration_authenticated_operator_and_host_fences(rig, monkeypatch,
                                                               authorized, host_allowed, expected):
    _, controller, grant = rig
    settings = SimpleNamespace(enabled=False)
    bot = SimpleNamespace(config=SimpleNamespace(computer=settings),
                          host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: host_allowed),
                          tool_executor=SimpleNamespace(check_permission=lambda *_: None))
    integration = ComputerIntegration(bot, controller=controller, settings=settings)
    controller.authorize = integration._authorize
    monkeypatch.setattr(recovery, 'verify_reconciliation_prerequisites',
                        AsyncMock(return_value={'status': 'attestation_eligible'}))
    with operator_scope(('admin', 'browser', lambda: authorized, ('localhost',))):
        if expected:
            result = await integration.operator_reconcile(
                owner_id='admin', web_session_id='browser', session_id=grant.session_id,
                generation=grant.generation, acknowledgment=acknowledgment(grant))
            assert result['state'] == 'closed'
        else:
            with pytest.raises((ComputerError, PermissionError)):
                await integration.operator_reconcile(
                    owner_id='admin', web_session_id='browser', session_id=grant.session_id,
                    generation=grant.generation, acknowledgment=acknowledgment(grant))


@pytest.mark.asyncio
async def test_x11_uid_uses_real_config_display_not_display_name(monkeypatch):
    settings = ComputerUseConfig(display=':77')
    calls = []

    async def loginctl(*args):
        calls.append(args)
        if args[0] == 'list-sessions':
            return 'c1 1000 operator seat0\nc2 1001 other seat0\n'
        display = ':77' if args[1] == 'c1' else ':78'
        uid = '1000' if args[1] == 'c1' else '1001'
        return f'User={uid}\nDisplay={display}\nType=x11\nRemote=no\nActive=yes\n'

    monkeypatch.setattr(accessibility_status, '_loginctl', loginctl)
    assert await accessibility_status._x11_uid(settings) == 1000
    assert len(calls) == 3
    assert not hasattr(settings, 'display_name')


def proc_stat(root, pid, group, session):
    path = root / str(pid)
    path.mkdir()
    fields = ['S', '1', str(group), str(session)] + ['0'] * 15 + ['200']
    (path / 'stat').write_text(f'{pid} (test child) ' + ' '.join(fields))


@pytest.mark.asyncio
@pytest.mark.parametrize('pending', [False, True])
@pytest.mark.parametrize('kind', ['group', 'session', 'absent', 'unavailable', 'live'])
async def test_prerequisites_census_pending_and_nonpending(tmp_path, monkeypatch, pending, kind):
    value = descriptor(pending=pending)
    monkeypatch.setattr(recovery, 'boot_id', lambda: BOOT)
    if kind == 'group':
        proc_stat(tmp_path, 90001, 90000, 1)
    elif kind == 'session':
        proc_stat(tmp_path, 90001, 1, 90000)
    elif kind == 'unavailable':
        proc_stat(tmp_path, 90001, 1, 1)
        (tmp_path / '90001' / 'stat').write_text('malformed')
    elif kind == 'live':
        proc_stat(tmp_path, 90000, 1, 1)
        text = (tmp_path / '90000' / 'stat').read_text()
        (tmp_path / '90000' / 'stat').write_text(text.removesuffix('200') + '100')
    original = recovery._processes_gone
    seen = []

    def inspect(desc):
        seen.append(desc)
        return original(desc, proc_root=tmp_path)

    monkeypatch.setattr(recovery, '_processes_gone', inspect)
    result = await recovery.verify_reconciliation_prerequisites(value)
    assert len(seen) == 1
    assert seen[0]['kind'] == 'isolated'
    assert value['kind'] == 'processes'
    assert result['status'] == ('attestation_eligible' if kind == 'absent' else 'unknown')
    assert result['status'] != 'absence_verified'
    if kind in {'group', 'session'}:
        assert result['reason'] == 'owned_process_group_remaining'


@pytest.mark.asyncio
async def test_prerequisite_reboot_is_attestation_not_automatic_release(monkeypatch):
    monkeypatch.setattr(recovery, 'boot_id', lambda: 'a' * 36)
    result = await recovery.verify_reconciliation_prerequisites(descriptor())
    assert result == {'status': 'attestation_eligible', 'reason': 'host_rebooted'}


@pytest.mark.asyncio
async def test_prerequisite_exception_is_unknown(monkeypatch):
    def unavailable():
        raise OSError('offline probe denied')

    monkeypatch.setattr(recovery, 'boot_id', unavailable)
    assert await recovery.verify_reconciliation_prerequisites(descriptor()) == {
        'status': 'unknown', 'reason': 'inspection_unavailable'}


@pytest.mark.asyncio
async def test_real_route_manager_integration_persisted_foreign_quarantine(tmp_path, monkeypatch):
    from aiohttp import web
    from aiohttp.test_utils import TestClient, TestServer

    from src.config.schema import ApiTokenIdentity
    from src.health.server import SessionManager
    from src.web.api.computer import register_computer
    from tests.test_computer_lifecycle_r5 import owner

    root = tmp_path / 'private'
    root.mkdir(mode=0o700)
    prior = ComputerStore(root / 'state.sqlite3', root / 'evidence')
    grant = prior.create_session(context('old-owner'), environment='existing_session')
    prior.record_runtime(grant, descriptor(grant.session_id))
    prior.set_state(grant.session_id, 'active')
    prior.close()
    bot, manager = owner(tmp_path, enabled=True, environment='existing_session',
                         display=':77', monitor_names=['test-monitor'])
    await manager.start()
    store = manager._service.controller.store
    grant = store.get_session(grant.session_id)
    assert grant.state == 'quarantined'
    principal = ApiTokenIdentity(token='offline-test-credential', user_id='admin', tier='admin')
    bot.config.web.api_tokens = [principal]
    sessions = SessionManager()
    sid, _ = sessions.create(principal)

    @web.middleware
    async def auth(request, handler):
        request._api_identity = principal
        request._session_id = sid
        request._session_managed = True
        return await handler(request)

    monkeypatch.setattr(accessibility_status, 'read_accessibility_status',
                        AsyncMock(side_effect=AssertionError('must not access desktop')))
    monkeypatch.setattr(manager._service, '_backend',
                        lambda *_: pytest.fail('must not construct desktop backend'))
    inspector = AsyncMock(return_value={'status': 'attestation_eligible'})
    monkeypatch.setattr(recovery, 'verify_reconciliation_prerequisites', inspector)
    routes = web.RouteTableDef()
    register_computer(routes, bot)
    app = web.Application(middlewares=[auth])
    app['session_manager'] = sessions
    app.router.add_routes(routes)
    try:
        async with TestClient(TestServer(app)) as client:
            response = await client.get('/api/computer')
            assert response.status == 200
            body = await response.json()
            assert body['session_id'] == grant.session_id
            assert body['session_generation'] == grant.generation
            assert body['state'] == 'quarantined'
            assert body['backend']['input_supported'] is False
            assert 'old-owner' not in str(body) and BOOT not in str(body)
            response = await client.post('/api/computer/reconcile', json={
                'session_id': grant.session_id, 'generation': grant.generation,
                'acknowledgment': acknowledgment(grant)})
            assert response.status == 200, await response.text()
            body = await response.json()
            assert body['state'] == 'closed'
            assert body['recovery']['complete'] is False
            assert body['recovery']['status'] == 'operator_acknowledged_unverified'
            assert store.get_session(grant.session_id).state == 'closed'
            inspector.assert_awaited_once()
    finally:
        await manager.close()
