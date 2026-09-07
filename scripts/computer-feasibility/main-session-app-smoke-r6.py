#!/usr/bin/env python3
"""Opt-in, scratch-only native Inkscape task. DO NOT run on :0 as a dev agent.

Parent operator must review this file and successful private tests first. Fixed
UID1000 gated native executable, private HOME/bus, exact XRes identity checks,
production controller input only. Never touches an existing document/window.
Cleanup restores the durable baseline only when exact resource identities still
match. Hotplug/replacement refuses repair; unknown actions are never replayed.

Run as root through sudo so the standalone subreaper can clean its cross-UID
descendants. The CLI always starts its worker under a finite owned supervisor.
No screenshots or document content are printed or retained after cleanup.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import importlib.util
import json
import math
import os
import pwd
import re
import shutil
import sys
import tempfile
import time
import uuid
from pathlib import Path
from types import SimpleNamespace
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import main_scratch_randr as randr  # noqa: E402
import main_scratch_windows as windows  # noqa: E402
from main_scratch_cleanup import (  # noqa: E402
    cleanup_status,
    close_controller_verified,
    finish_cleanup,
    restore_desktop,
)
from main_scratch_launcher import identity  # noqa: E402
from main_scratch_support import (  # noqa: E402
    bounded,
    bus_config,
    command,
    durable_json,
    exact_process,
    launch,
    stage,
    terminate,
)
from Xlib import display  # noqa: E402

from src.computer.integration import ComputerIntegration  # noqa: E402
from src.computer.models import RequestContext  # noqa: E402

# Exact CLI task privately passed: /tmp/private-main-r6-5ebg39n9, ten verified
# actions, rectangle + ellipse GUI save, exact metadata restoration and cleanup.
# Main preflight remains unchanged; authorization is still explicitly required.
PRIVATE_TASK_QUALIFIED = True


def validate_journal(value):
    path = Path(value)
    if (path.parent != Path('/tmp') or not re.fullmatch(r'cu-r6-[a-z0-9_]{8}', path.name)
            or path.is_symlink() or path.resolve() != path):
        raise RuntimeError('supervisor_scratch_journal_required')
    stat = path.stat()
    if not path.is_dir() or stat.st_uid != 0 or stat.st_mode & 0o077:
        raise RuntimeError('private_root_owned_journal_required')
    return path


def power_state():
    match = re.search(r'Monitor is (On|Off|Standby|Suspend)', command('xset', 'q'))
    return match.group(1) if match else 'unavailable'


def restore_power(expected):
    """Restore only the explicitly recorded power state, never DPMS settings."""
    current = power_state()
    if current == expected:
        return {'power': current, 'changed': False}
    values = {'On': 'on', 'Off': 'off', 'Standby': 'standby', 'Suspend': 'suspend'}
    if expected not in values or current not in values:
        raise RuntimeError('power_state_restoration_unavailable')
    command('xset', 'dpms', 'force', values[expected])
    for _ in range(20):
        if power_state() == expected:
            return {'power': expected, 'changed': True}
        time.sleep(.05)
    raise RuntimeError('power_state_not_restored')


def validate_args(args):
    if not args.confirm_scratch_only:
        raise RuntimeError('explicit_current_scratch_authorization_required')
    if getattr(args, 'private_qualification', False):
        validate_private_fixture(args)
    elif not PRIVATE_TASK_QUALIFIED:
        raise RuntimeError('native_task_not_privately_qualified_do_not_run_main')
    if os.geteuid() != 0:
        raise RuntimeError('standalone_root_supervisor_required_for_cross_uid_cleanup')
    if (not re.fullmatch(r':[0-9]{1,5}(?:\.[0-9]+)?', args.display)
            or not Path(args.xauthority).is_absolute() or not args.monitor):
        raise RuntimeError('explicit_display_monitor_authority_required')
    if pwd.getpwnam(args.session_user).pw_uid != 1000:
        raise RuntimeError('operator_uid_must_be_1000')


def validate_private_fixture(args):
    """Private-only exception, never a switch for relaxing a real desktop guard."""
    marker = Path('/etc/odin-r6-private.json')
    if (os.geteuid() != 0 or args.display != ':177' or args.monitor != 'screen'
            or args.xauthority != '/workspace/Xauthority'
            or Path('/home/odin').exists() or Path('/home/calmingstorm').exists()
            or Path('/tmp/.X11-unix/X0').exists() or marker.is_symlink()):
        raise RuntimeError('private_namespace_required')
    stat = marker.stat()
    if stat.st_uid != 0 or stat.st_mode & 0o077:
        raise RuntimeError('private_fixture_marker_invalid')
    proof = json.loads(marker.read_text())
    expected = proof['xvfb']
    if identity(expected['pid']) != expected or expected['uid'] != 1000:
        raise RuntimeError('private_xvfb_identity_changed')
    wm = proof['wm']
    if (identity(wm['pid']) != wm or wm['uid'] != 1000
            or (Path('/proc') / str(wm['pid']) / 'exe').resolve() != Path('/usr/bin/openbox')):
        raise RuntimeError('private_openbox_identity_changed')
    proc = Path('/proc') / str(expected['pid'])
    if (proc / 'exe').resolve() != Path('/usr/bin/Xvfb'):
        raise RuntimeError('private_xvfb_executable_required')
    argv = (proc / 'cmdline').read_bytes().split(b'\0')
    if (argv[1:3] != [b':177', b'-screen'] or b'-ac' in argv
            or argv[argv.index(b'-auth') + 1] != b'/workspace/Xauthority'
            or argv[argv.index(b'-nolisten') + 1] != b'tcp'):
        raise RuntimeError('private_xvfb_authorization_required')
    authority = Path(args.xauthority)
    if (authority.is_symlink() or authority.stat().st_uid != 1000
            or authority.stat().st_mode & 0o077):
        raise RuntimeError('private_xauthority_required')


def private_topology(d):
    """Xvfb lacks hardware transform/panning support. Preserve raw exact metadata.

    This adapter is ONLY reachable after the namespace/Xvfb identity gate. Main
    RandR capture/validation is unchanged, including its unsupported-state refusal.
    """
    geometry = d.screen().root.get_geometry()
    if d.screen_count() != 1 or geometry.width < 1280 or geometry.height < 900:
        raise RuntimeError('private_screen_too_small')
    return {'private_xvfb': command('xrandr', '--verbose'),
            'geometry': [geometry.width, geometry.height, geometry.depth]}


def validate_private_empty(before):
    if (before['clients'] or before['stacking'] or before['windows']
            or tuple(before['active']) != (0,) or len(before['workspace']) != 1
            or before['pointer'][2] & 0x1F00 or any(before['keymap'])
            or len(before['keymap']) != 32 or before['focus'] <= 1
            or not before['focus_identity'] or before['focus_identity']['uid'] != 1000
            or not set(before['required'].values()) <= set(before['supported'])):
        raise RuntimeError('private_empty_openbox_baseline_required')


def restore_private_empty(d, before):
    from Xlib import X
    validate_private_empty(before)
    if windows.identity(d, before['focus']) != before['focus_identity']:
        raise RuntimeError('private_idle_focus_identity_changed')
    if any(d.query_keymap()) or d.screen().root.query_pointer().mask & 0x1F00:
        raise RuntimeError('private_input_still_held')
    d.create_resource_object('window', before['focus']).set_input_focus(
        before['focus_revert'], X.CurrentTime)
    d.screen().root.warp_pointer(*before['pointer'][:2])
    d.sync()


def verify_svg(blob, marker):
    if len(blob) > 1024 * 1024 or b'<!DOCTYPE' in blob or b'<!ENTITY' in blob:
        raise RuntimeError('unexpected_svg_encoding')
    root = ElementTree.fromstring(blob)
    ns = '{http://www.w3.org/2000/svg}'
    if root.tag != ns + 'svg':
        raise RuntimeError('not_svg')
    texts = root.findall('.//' + ns + 'text')
    if len(texts) != 1 or ''.join(texts[0].itertext()) != marker:
        raise RuntimeError('native_text_artifact_mismatch')
    return {'sha256': hashlib.sha256(blob).hexdigest(), 'text_elements': 1}


def verify_shapes(blob):
    if len(blob) > 1024 * 1024 or b'<!DOCTYPE' in blob or b'<!ENTITY' in blob:
        raise RuntimeError('unexpected_svg_encoding')
    root = ElementTree.fromstring(blob)
    ns = '{http://www.w3.org/2000/svg}'
    rects = root.findall('.//' + ns + 'rect')
    ellipses = root.findall('.//' + ns + 'ellipse')
    if root.tag != ns + 'svg' or len(rects) != 1 or len(ellipses) != 1:
        raise RuntimeError('native_shape_artifact_mismatch')
    for node, names in ((rects[0], ('width', 'height')), (ellipses[0], ('rx', 'ry'))):
        if not all(math.isfinite(float(node.get(name, '0')))
                   and float(node.get(name, '0')) > 0 for name in names):
            raise RuntimeError('empty_native_shape')
    return {'sha256': hashlib.sha256(blob).hexdigest(), 'rectangles': 1, 'ellipses': 1}


def delivered_points(obs, monitor, geometry, points):
    """Client-local points -> current source -> delivered raster, never assume 1:1."""
    x, y, width, height = geometry
    inverse = obs.delivered_to_source.inverse()
    mapped = []
    for px, py in points:
        if not (0 <= px < width and 0 <= py < height):
            raise RuntimeError('task_point_outside_scratch_client')
        dx, dy = inverse.map_point(x + px - monitor['x'], y + py - monitor['y'])
        dx, dy = math.floor(dx), math.floor(dy)
        if not (0 <= dx < obs.width and 0 <= dy < obs.height):
            raise RuntimeError('task_point_outside_delivered_image')
        mapped.append([dx, dy])
    return mapped


async def run(args):
    validate_args(args)
    os.environ['DISPLAY'], os.environ['XAUTHORITY'] = args.display, args.xauthority
    os.umask(0o077)
    principal = pwd.getpwnam(args.session_user)
    base = validate_journal(args.journal)
    home = base / 'home'
    stages, actions, processes = [], [], {}
    before = d = service = app_identity = None
    app_windows = []
    artifact = failure = None
    preflight_complete = False
    filename = home / 'scratch.svg'

    def snapshot():
        with bounded():
            topology = private_topology(d) if args.private_qualification else randr.capture(d)
            return {'randr': topology,
                    'windows': windows.snapshot(d),
                    'power': power_state()}

    def assert_owned_focus():
        from src.computer.runtime.x11_app_scope import AppScope
        with bounded():
            scope = AppScope(d, 'inkscape')
            target, _ = scope._target(d.get_input_focus().focus, d.screen().root)
            if not exact_process(app_identity) or scope._pid(target) != app_identity['pid']:
                raise RuntimeError('focus_not_gated_scratch')
            # Unlike _NET_WM_PID, XRes is server-owned metadata.
            if windows.identity(d, target.id) != {'xid': target.id, **app_identity}:
                raise RuntimeError('focus_xres_identity_changed')

    context = RequestContext('operator-r6-scratch', 'private-scratch', uuid.uuid4().hex,
                             'localhost')

    async def observe(grant):
        assert_owned_focus()
        result = await asyncio.wait_for(service.controller.observe(context, {
            'session_id': grant['session_id'], 'generation': grant['generation']}), 20)
        obs = service.controller._live[grant['session_id']].observations[result['observation_id']]
        assert service.output_image(result)['__image_block__']['type'] == 'image'
        await asyncio.wait_for(service.controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256), 20)
        return obs

    async def act(grant, operation, **fields):
        for attempt in range(4):
            obs = await observe(grant)
            mapped_fields = dict(fields)
            if 'client_points' in mapped_fields:
                with bounded():
                    if obs.modal is not None:
                        raise RuntimeError('drawing_requires_nonmodal_canvas')
                    current = windows.snapshot(d)['windows'][app_windows[0]]
                    if current['identity'] != {'xid': app_windows[0], **app_identity}:
                        raise RuntimeError('drawing_window_identity_changed')
                    mapped_fields['points'] = delivered_points(obs, monitor,
                        current['geometry'], mapped_fields.pop('client_points'))
            payload = {'session_id': obs.session_id, 'generation': obs.generation,
                'action_id': uuid.uuid4().hex, 'observation_id': obs.observation_id,
                'source_id': obs.source.source_id, 'source_revision': obs.source.source_revision,
                'consent_generation': obs.source.consent_generation, 'operation': operation,
                'expect': {'type': 'visual_change'}, **mapped_fields}
            if obs.modal is not None:
                payload['expected_modal'] = obs.modal
            assert_owned_focus()
            try:
                receipt = await asyncio.wait_for(service.controller.act(context, payload), 20)
            except Exception as exc:
                if str(exc) in {'visual_target_changed', 'stale_source_binding'} and attempt < 3:
                    await asyncio.sleep(.2)
                    continue
                raise
            actions.append({'operation': operation, 'status': receipt['status']})
            if receipt['status'] in {'unknown', 'unavailable'}:
                raise RuntimeError('uncertain_action_no_replay')
            await asyncio.sleep(.3)
            return

    try:
        home.mkdir(mode=0o700)
        os.chown(home, 1000, principal.pw_gid)
        command('setfacl', '-m', f'u:{args.session_user}:--x', str(base))
        d = display.Display(args.display)
        before = snapshot()
        durable_json(base / 'before.json', before)
        if args.private_qualification:
            validate_private_empty(before['windows'])
            width, height, _depth = before['randr']['geometry']
            monitor = {'x': 0, 'y': 0, 'width': width, 'height': height}
        else:
            randr.validate(before['randr'])
            windows.validate(before['windows'])
            if before['power'] not in {'On', 'Off', 'Standby', 'Suspend'}:
                raise RuntimeError('power_baseline_unavailable')
            monitor = randr.monitor_geometry(d, args.monitor)
        if monitor['width'] < 1280 or monitor['height'] < 900:
            raise RuntimeError('task_requires_1280x900_monitor')
        if snapshot() != before:
            raise RuntimeError('preflight_session_changed')
        stages.append({'stage': 'preflight_durable_snapshot', 'ok': True})
        preflight_complete = True
        # NEW scratch profile only: suppress the first-run welcome, not real settings.
        profile = home / 'config' / 'inkscape'
        profile.mkdir(parents=True)
        preferences = profile / 'preferences.xml'
        preferences.write_text('<inkscape version="1"><group id="options">'
            '<group id="boot" enabled="0"/></group></inkscape>')
        gtk_profile = home / 'config' / 'gtk-3.0'
        gtk_profile.mkdir()
        gtk_settings = gtk_profile / 'settings.ini'
        gtk_settings.write_text('[Settings]\ngtk-cursor-blink=false\n')
        for path in (home / 'config', profile, preferences, gtk_profile, gtk_settings):
            os.chown(path, 1000, principal.pw_gid)
        config = base / 'bus.conf'
        config.write_text(bus_config(home / 'bus.socket'))
        for source, name in ((Path(__file__).with_name('main_scratch_launcher.py'), 'launcher.py'),
                             (config, 'bus.conf')):
            command('install', '-m', '600', '-o', '1000', '-g', str(principal.pw_gid),
                    str(source), str(home / name))
        settings = SimpleNamespace(enabled=True, storage_dir=str(base / 'private-state'),
            environment='existing_session', platform='x11', display=args.display,
            xauthority=args.xauthority, monitor_names=[args.monitor], runtime_sudo=True)
        bot = SimpleNamespace(config=SimpleNamespace(computer=settings),
            host_access_manager=SimpleNamespace(
                is_host_allowed=lambda owner, host: host == 'localhost'),
            tool_executor=SimpleNamespace(check_permission=lambda *_: None))
        service = ComputerIntegration(bot)
        for role in ('bus', 'inkscape'):
            if not await stage(stages, base, 'launch_' + role,
                               lambda role=role: launch(role, args, home, base, processes)):
                raise RuntimeError('gated_launch_failed')
        app_identity = processes['inkscape']['identity']
        for _ in range(100):
            await asyncio.sleep(.1)
            with bounded():
                current = windows.snapshot(d)
                app_windows = [wid for wid in current['windows'] if
                    windows.identity(d, wid) == {'xid': wid, **app_identity}]
            if len(app_windows) == 1:
                break
        if len(app_windows) != 1 or app_windows[0] in before['windows']['windows']:
            raise RuntimeError('unique_new_scratch_window_unavailable')
        window = app_windows[0]
        with bounded():
            if windows.identity(d, window) != {'xid': window, **app_identity}:
                raise RuntimeError('scratch_identity_changed')
        command('xdotool', 'windowmove', str(window),
                str(monitor['x'] + 40), str(monitor['y'] + 40))
        command('xdotool', 'windowsize', str(window), '1200', '840')
        command('xdotool', 'windowactivate', '--sync', str(window))
        await asyncio.sleep(.7)
        assert_owned_focus()
        grant = await asyncio.wait_for(service.controller.session(context,
            {'operation': 'start', 'app': 'inkscape'}), 20)
        # Client-relative points use current delivered/source transforms. This
        # exact GUI task is qualified by the isolated private CLI runner.
        await act(grant, 'type', text='r')
        await act(grant, 'drag', client_points=[[530, 330], [630, 380], [730, 460]], duration=.3)
        await act(grant, 'key', key='Escape')
        await act(grant, 'type', text='e')
        await act(grant, 'drag', client_points=[[580, 500], [640, 550], [700, 600]], duration=.3)
        await act(grant, 'key', key='Escape')
        await act(grant, 'key', key='ctrl+shift+s')
        await act(grant, 'key', key='ctrl+a')
        await act(grant, 'type', text=str(filename))
        await act(grant, 'key', key='Return')
        for _ in range(40):
            await asyncio.sleep(.1)
            if filename.is_file():
                break
        artifact = verify_shapes(filename.read_bytes())
        stages.append({'stage': 'native_svg_verified', 'ok': True})
    except asyncio.CancelledError:
        failure = {'type': 'TimeoutError', 'code': 'cooperative_task_deadline'}
        stages.append({'stage': 'task_deadline', 'ok': False, 'error_type': 'TimeoutError'})
    except Exception as exc:
        failure = {'type': type(exc).__name__, 'code': str(exc)[:160]}
        stages.append({'stage': 'task', 'ok': False, 'error_type': type(exc).__name__})
    finally:
        cleanup_start = len(stages)
        async def cleanup():
            controller_ok = True
            if service is not None:
                controller_ok = await stage(stages, base, 'controller_close',
                    lambda: close_controller_verified(service.controller, context))
                await stage(stages, base, 'purge_evidence', service.controller.store.purge_evidence)
                await stage(stages, base, 'integration_close', service.close)
            if (controller_ok and preflight_complete and app_identity
                    and not before['windows']['active'][0]):
                def minimize_scratch():
                    for wid in app_windows:
                        ident = {'xid': wid, **app_identity}
                        windows._owned(d, ident, lambda: windows._send(
                            d, wid, 'WM_CHANGE_STATE', [3, 0, 0, 0, 0]))
                await stage(stages, base, 'minimize_only_scratch', minimize_scratch)
            terminated = []
            for role in ('inkscape', 'bus'):
                terminated.append(await stage(stages, base, 'terminate_' + role,
                            lambda role=role: terminate(role, args, home, processes)))
            if before is not None and preflight_complete:
                def require_settled():
                    if not controller_ok or not all(terminated):
                        raise RuntimeError('owned_input_or_apps_cleanup_unverified')
                    windows.assert_input_idle(d)

                def restore_topology():
                    require_settled()
                    if args.private_qualification:
                        if private_topology(d) != before['randr']:
                            raise RuntimeError('private_topology_changed')
                        return {'changed': False}
                    return {'changed': randr.restore(d, before['randr'])}

                def power():
                    require_settled()
                    return restore_power(before['power'])

                await restore_desktop(stages=stages, base=base, before=before,
                    restore_topology=restore_topology,
                    restore_windows=(lambda: None) if args.private_qualification else
                        lambda: windows.restore_windows(d, before['windows'],
                                                        restore_hidden_position=True),
                    restore_focus=lambda: (restore_private_empty(d, before['windows'])
                        if args.private_qualification else
                        windows.restore_focus_pointer(d, before['windows'])),
                    restore_power=power, snapshot=snapshot)
            if d is not None:
                await stage(stages, base, 'close_x_connection', d.close)
            # All content and screenshots go, including failed action evidence.
            # Outer supervisor retries removals after descendant cleanup too.
            removable = ['private-state']
            if all(e['wrapper'].returncode is not None for e in processes.values()):
                removable.append('home')
            for name in removable:
                await stage(stages, base, 'remove_' + name,
                    lambda name=name: shutil.rmtree(base / name)
                    if (base / name).exists() else None)

        try:
            await finish_cleanup(cleanup())
        except asyncio.CancelledError:
            failure = failure or {'type': 'CancelledError', 'code': 'cancelled_during_cleanup'}
        status = cleanup_status(stages, start=cleanup_start,
                                baseline_validated=preflight_complete)
        report = {'passed': artifact is not None and failure is None
                  and status['cleanup_complete'] and all(s['ok'] for s in stages),
                  'task_complete': artifact is not None and failure is None,
                  'artifact_verified': artifact is not None,
                  'artifact': artifact, **status, 'stages': stages,
                  'actions': actions, 'failure': failure,
                  'screenshots_purged': not (base / 'private-state').exists()}
        durable_json(base / 'result.json', report)
        print(json.dumps(report), flush=True)
    return 0 if report['passed'] else 1


async def bounded_worker(args):
    # A cooperative deadline leaves cleanup time before the independent watchdog.
    return await asyncio.wait_for(run(args), 120)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--confirm-scratch-only', action='store_true')
    parser.add_argument('--display', required=True)
    parser.add_argument('--monitor', required=True)
    parser.add_argument('--xauthority', required=True)
    parser.add_argument('--session-user', required=True)
    parser.add_argument('--private-qualification', action='store_true',
                        help='isolated namespace fixture only; never an operator-display override')
    parser.add_argument('--owned-parent', help=argparse.SUPPRESS)
    parser.add_argument('--journal', help=argparse.SUPPRESS)
    args = parser.parse_args()
    validate_args(args)
    if args.owned_parent:
        pid, start = map(int, args.owned_parent.split(':'))
        if pid != os.getppid() or identity(pid) != {'pid': pid, 'uid': 0, 'start_ticks': start}:
            raise RuntimeError('standalone_supervisor_identity_required')
        return asyncio.run(bounded_worker(args))
    if args.journal:
        raise RuntimeError('journal_is_supervisor_owned')
    spec = importlib.util.spec_from_file_location('owned_r6',
        Path(__file__).with_name('owned-test-supervisor-r6.py'))
    supervisor = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(supervisor)
    base = Path(tempfile.mkdtemp(prefix='cu-r6-', dir='/tmp'))
    parent = identity(os.getpid())
    argv = [sys.executable, str(Path(__file__).resolve()), *sys.argv[1:],
            '--owned-parent', f"{parent['pid']}:{parent['start_ticks']}", '--journal', str(base)]
    code = supervisor.supervise(argv, 240, 30, base / 'supervisor.json')
    cleanup = json.loads((base / 'supervisor.json').read_text())
    removable = ['private-state']
    if cleanup['cleanup_ok']:
        removable.append('home')
    for name in removable:
        if (base / name).exists():
            shutil.rmtree(base / name)
    print(json.dumps({'private_journal': str(base), 'cleanup_ok': cleanup['cleanup_ok']}))
    worker_path = base / 'result.json'
    worker = json.loads(worker_path.read_text()) if worker_path.exists() else {}
    complete = (worker.get('cleanup_complete') is True and cleanup['cleanup_ok']
                and not cleanup['deadline_exceeded'] and not cleanup['interrupted_signal'])
    handoff = {'cleanup_complete': complete, 'worker_result_present': bool(worker),
               'process_cleanup_ok': cleanup['cleanup_ok'],
               'manual_actions': worker.get('manual_actions', [])}
    if not worker or cleanup['deadline_exceeded'] or cleanup['interrupted_signal']:
        handoff['manual_actions'].append({'stage': 'worker_lost',
            'action': 'inspect_supervisor_then_before_json_and_live_display_no_automatic_replay'})
    durable_json(base / 'handoff.json', handoff)
    return code if code else (0 if complete else 1)


if __name__ == '__main__':
    raise SystemExit(main())
