#!/usr/bin/python3
"""Real Xed modal roundtrip, strictly inside rootcrossuid disposable namespaces."""
import asyncio
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import uuid


def record(kind, **fields):
    print(json.dumps(dict(kind=kind, **fields)), flush=True)


def outer():
    assert sys.argv[1:] == ['--execute-isolated']
    source = Path(__file__).resolve().parent
    out = Path(tempfile.mkdtemp(prefix='x11-modal-check-', dir='/tmp'))
    tree = out / 'tree'
    harness = tree / 'scripts/computer-feasibility'
    harness.mkdir(parents=True)
    for name in ('x11-run.py', 'x11_records.py', 'x11-passwd', 'x11-group',
                 'x11-crossuid-passwd', 'x11-crossuid-sudoers', 'x11-crossuid-pam',
                 'x11-crossuid-bootstrap.sh', 'x11-owned-bus.conf'):
        shutil.copy2(source / name, harness / name)
    shutil.copy2(__file__, harness / 'x11-crossuid-corpus.py')
    (tree / 'src').symlink_to(source.parents[1] / 'src', target_is_directory=True)
    try:
        r = subprocess.run(['/usr/bin/python3', str(harness/'x11-run.py'),
                            '--execute-isolated', '--crossuid-guardian'], capture_output=True,
                           text=True, timeout=145, env={'PATH':'/usr/bin', 'LANG':'C.UTF-8'})
        events, cleanup = [], None
        for line in r.stdout.splitlines():
            if line.startswith('{'):
                events.append(json.loads(line))
            elif line.startswith('HOST_PROCESS_LEDGER '):
                raw = json.loads(line.split(' ', 1)[1])
                cleanup = {k:raw[k] for k in ('unit', 'survivors_including_zombies',
                           'cgroup_exists', 'monitor_errors')}
                cleanup['observed_processes'] = len(raw['identities'])
        result = dict(passed=r.returncode == 0, exit_code=r.returncode, events=events, cleanup=cleanup)
        if not events:
            result['bootstrap_diagnostic'] = (r.stdout+r.stderr)[-2000:]
        data = json.dumps(result, indent=2)
        assert len(data) < 32000
        (out/'result.json').write_text(data+'\n')
        record('result', artifact=str(out/'result.json'), **result)
        return r.returncode
    finally:
        shutil.rmtree(tree)


def inner():
    assert os.geteuid() == 0 and os.environ['DISPLAY'] == ':177'
    assert os.environ['XI2_PRIVATE_SANDBOX'] == '1'
    assert not Path('/home/odin').exists() and not Path('/tmp/.X11-unix/X0').exists()
    sys.path.insert(0, '/code')
    from Xlib import X, display
    from src.computer.controller import ComputerController
    from src.computer.models import RequestContext
    from src.computer.runtime.x11_attached import X11AttachedBackend
    from src.computer.runtime.x11_owned_device import ExistingXTest
    from src.computer.store import ComputerStore
    from src.computer.vision import observation_image
    children = []

    def spawn(name, argv):
        f = open('/workspace/'+name+'.log', 'w')
        p = subprocess.Popen(['setpriv', '--reuid=65534', '--regid=65534', '--clear-groups',
             '--bounding-set=-all', '--no-new-privs', *argv], stdout=f, stderr=f,
             stdin=subprocess.PIPE, start_new_session=True)
        children.append((name,p,f))
        return p

    def wait(test):
        for _ in range(100):
            value = test()
            if value:
                return value
            time.sleep(.05)
        raise AssertionError('fixture_start_timeout')

    class EvidenceBackend(X11AttachedBackend):
        async def _read_worker(self, operation, **fields):
            result = await super()._read_worker(operation, **fields)
            if operation == 'capture':
                scope = result.get('input_scope')
                before = self._scope or {}
                if scope:
                    record('scope_comparison', focused=scope.get('focused'),
                           modal_kind=scope.get('modal_kind'),
                           process_equal=before.get('process') == scope.get('process'),
                           topology_equal=before.get('topology') == scope.get('topology'),
                           source_rect_equal=before.get('source_rect') == scope.get('source_rect'),
                           source_origin_equal=before.get('source_origin') == scope.get('source_origin'),
                           root_equal=(before.get('transient_chain') or [before.get('window')])[-1]
                             == (scope.get('transient_chain') or [scope.get('window')])[-1])
                    if scope.get('modal'):
                        conn = display.Display(':177')
                        try:
                            w = conn.create_resource_object('window',scope['window'])
                            prop = w.get_full_property(conn.intern_atom('_NET_WM_NAME'),0)
                            title = bytes(prop.value).decode('utf-8') if prop else str(w.get_wm_name())
                            record('isolated_modal_title', title=title[:120],wm_class=w.get_wm_class())
                        finally:
                            conn.close()
            return result

        async def act(self, payload):
            try:
                result = await super().act(payload)
                record('native_receipt', receipt=result)
                return result
            except BaseException as exc:
                record('native_exception', error_type=type(exc).__name__, code=str(exc)[:160])
                raise

    async def exercise(app):
        b = EvidenceBackend(enabled=True, display_name=':177', monitor_names=['screen'],
                            app_profile='xed', input_enabled=True, runtime_sudo=True)
        store = ComputerStore(Path('/workspace/private/db'), Path('/workspace/private/evidence'))
        ctx = RequestContext('modal-fixture','isolated-private',uuid.uuid4().hex,'localhost')
        ctl = ComputerController(store, lambda _: b, lambda c:c == ctx, enabled=True)
        probe = ExistingXTest(':177')
        devices = probe.identity()
        grant = None

        async def observe():
            g = store.get_session(grant['session_id'])
            r = await ctl.observe(ctx, dict(session_id=g.session_id,generation=g.generation))
            o = ctl._live[g.session_id].observations[r['observation_id']]
            assert observation_image(r['image_bytes'],o.frame_metadata)['__computer_frame__']
            await ctl.validate_observation_delivery(ctx,o.frame_metadata,o.image_sha256)
            record('observation',modal=o.modal is not None,modal_kind=o.modal_kind,
                   revision=o.source.source_revision,focused=o.focused)
            return o

        async def act(o, operation, **fields):
            p = dict(session_id=o.session_id,generation=o.generation,operation=operation,
                consent_generation=o.source.consent_generation,source_id=o.source.source_id,
                source_revision=o.source.source_revision,observation_id=o.observation_id,
                action_id=uuid.uuid4().hex,expect={'type':'visual_change'},**fields)
            if o.modal is not None:
                p['expected_modal'] = o.modal
            t = time.monotonic()
            for attempt in range(4):
                try:
                    def trace(frame, event, arg):
                        if (event == 'exception' and frame.f_code.co_name == 'act'
                                and frame.f_code.co_filename.endswith('/computer/controller.py')):
                            kind, error, _ = arg
                            if kind not in {StopIteration, StopAsyncIteration}:
                                record('controller_exception', line=frame.f_lineno,
                                       error_type=kind.__name__, code=str(error)[:160])
                        return trace
                    prior = sys.gettrace()
                    try:
                        sys.settrace(trace)
                        r = await ctl.act(ctx,p)
                    finally:
                        sys.settrace(prior)
                    break
                except Exception as exc:
                    if str(exc) not in {'visual_target_changed', 'stale_source_binding'} or attempt == 3:
                        raise
                    record('pre_dispatch_refresh', code=str(exc))
                    await asyncio.sleep(.15)
                    fresh = await observe()
                    p.update(observation_id=fresh.observation_id,
                             source_revision=fresh.source.source_revision,
                             action_id=uuid.uuid4().hex)
            held = probe.held()
            record('action',operation=operation,key=fields.get('key'),status=r['status'],
                   seconds=round(time.monotonic()-t,3),held_clear=not any(held.values()))
            assert not any(held.values())
            assert r['status'] not in {'unknown','unavailable'}, 'uncertain_action_no_replay'
            await asyncio.sleep(.3)

        try:
            grant = await ctl.session(ctx,{'operation':'start','app':'xed'})
            record('started',runtime_sudo=True,controller=True,target_uid=65534)
            before = await observe()
            assert before.modal is None and before.focused
            await act(before,'type',text='isolated modal marker')
            typed = await observe()
            assert typed.image_sha256 != before.image_sha256
            await act(typed,'key',key='ctrl+s')
            modal = await observe()
            assert modal.modal is not None and modal.modal_kind == 'safe_application'
            assert modal.source.source_revision != typed.source.source_revision
            await act(modal,'key',key='Escape')
            after = await observe()
            assert after.modal is None and after.focused
            assert after.source.source_revision != modal.source.source_revision
            record('modal_roundtrip',passed=True,marker_visual_change=True,
                   safe_chooser=True,revision_changed_twice=True,escape_cancel=True)
            await act(after,'key',key='ctrl+s')
            await act(await observe(),'key',key='ctrl+a')
            await act(await observe(),'type',text='/workspace/home/verified-note.txt')
            await act(await observe(),'key',key='Return')
            saved = Path('/workspace/home/verified-note.txt')
            for _ in range(20):
                if saved.exists():
                    break
                await asyncio.sleep(.1)
            content = saved.read_bytes()
            assert content == b'isolated modal marker\n'
            record('gui_saved_file', exact_marker=True, bytes=len(content))
        finally:
            await ctl.close()
            absent = all([await b._identities_gone(p) for p in b._worker_identities])
            clear = not any(probe.held().values())
            record('controller_cleanup',workers_absent=absent,held_clear=clear,
                   app_preserved=app.poll() is None,devices_unchanged=devices == probe.identity(),
                   children_remaining=len(b._children),session_state=(
                       store.get_session(grant['session_id']).state if grant else None))
            store.close()
            assert absent and clear and app.poll() is None and not b._children

    d = None
    passed = False
    try:
        Path('/tmp/.X11-unix').mkdir(mode=0o1777)
        os.chmod('/tmp/.X11-unix',0o1777)
        spawn('xvfb',['Xvfb',':177','-screen','0','1000x700x24','-nolisten','tcp',
                      '-noreset','-extension','GLX'])
        wait(lambda:subprocess.run(['xdpyinfo','-display',':177'],stdout=subprocess.DEVNULL,
             stderr=subprocess.DEVNULL).returncode == 0)
        spawn('wm',['openbox','--sm-disable'])
        d = display.Display(':177')
        wait(lambda:d.screen().root.get_full_property(d.intern_atom('_NET_SUPPORTING_WM_CHECK'),0))
        app = spawn('xed',['dbus-run-session','--config-file=/harness/x11-owned-bus.conf',
                          '--','xed','--standalone','--new-window'])
        def find():
            prop = d.screen().root.get_full_property(d.intern_atom('_NET_CLIENT_LIST'),0)
            for xid in prop.value if prop else []:
                w = d.create_resource_object('window',xid)
                if w.get_wm_class() == ('xed','Xed') and w.get_attributes().map_state == X.IsViewable:
                    return w
        target = wait(find)
        subprocess.run(['xdotool','windowactivate','--sync',str(target.id)],check=True,timeout=3)
        time.sleep(.5)
        asyncio.run(asyncio.wait_for(exercise(app),80))
        passed = True
    except Exception as exc:
        record('failure',error_type=type(exc).__name__,code=str(exc)[:160])
    finally:
        if d:
            d.close()
        for name,p,f in reversed(children):
            try:
                os.killpg(p.pid,15)
            except ProcessLookupError:
                pass
            try:
                p.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(p.pid,9)
                p.wait(timeout=2)
            f.close()
            record('fixture_reaped',process=name,exit_code=p.returncode)
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(inner() if os.environ.get('XI2_PRIVATE_SANDBOX') == '1' else outer())
