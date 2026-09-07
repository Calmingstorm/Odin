"""Root controller/sudo worker and uid65534 applications, private namespaces only."""
import asyncio
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

from Xlib import X, display
from Xlib.protocol import event
sys.path.insert(0, '/code')
from src.computer.runtime.x11_attached import X11AttachedBackend
from src.computer.runtime.x11_owned_device import ExistingXTest
from src.computer.runtime.recovery import process_identity, verify_absence

assert os.geteuid() == 0 and os.environ['DISPLAY'] == ':177'
assert not Path('/home/odin').exists() and not Path('/tmp/.X11-unix/X0').exists()
children = []
def record(kind, **values):
    print(json.dumps(dict(kind=kind, **values)), flush=True)
def spawn(name, argv):
    stream = open('/workspace/' + name + '.log', 'w')
    proc = subprocess.Popen(['/usr/bin/setpriv', '--reuid=65534', '--regid=65534',
        '--clear-groups', '--bounding-set=-all', '--no-new-privs', *argv],
        stdout=stream, stderr=subprocess.STDOUT, stdin=subprocess.PIPE)
    children.append((proc, stream))
    return proc
def wait(check):
    end = time.monotonic()+4
    while time.monotonic() < end:
        value = check()
        if value:
            return value
        time.sleep(.02)
    raise AssertionError('fixture timeout')
def records():
    return [json.loads(s) for s in Path('/workspace/gtk.log').read_text().splitlines()
            if s.startswith('{')]

async def trials(human, app):
    for index, mode in enumerate(('no-ack', 'complete', 'controller-eof', 'cancel', 'timeout', 'wrapper-death')):
        b = X11AttachedBackend(enabled=True, display_name=':177', monitor_names=['screen'],
                               app_profile='xed', input_enabled=True, runtime_sudo=True)
        descriptor = b.startup_descriptor('crossuid-held-' + mode)
        updates = []
        b.runtime_identity_callback = lambda item: updates.append(item)
        argv = b._worker_argv('x11_guardian.py')
        argv[-2] = '/harness/x11-crossuid-held.py'  # Only this fixture substitutes a fault driver.
        p = await asyncio.create_subprocess_exec(*argv, stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, start_new_session=True)
        b._record_spawn(p, pending=True)
        try:
            g = await b._worker_ready(p, 'guardian', pending=True)
        except Exception:
            record('worker-start-failed', stderr=(await p.stderr.read()).decode())
            raise
        p.stdin.write(json.dumps({'mode':mode}).encode()+b'\n'); await p.stdin.drain()
        injector = await b._worker_ready(p, 'injector', parent=g['pid'])
        assert g['pid'] != p.pid, 'fixture must exercise an actual sudo monitor wrapper'
        assert updates[-1]['processes'][-1] == injector and not updates[-1]['launch_pending']
        if mode == 'no-ack':
            p.stdin.close()
            await asyncio.wait_for(p.wait(), 3)
            assert await b._identities_gone(p, timeout=3)
            assert human.held() == {'keys':set(), 'buttons':set()}
            assert app.poll() is None
            record('crossuid-no-input-gate-pass', identities=updates[-1]['processes'])
            continue
        p.stdin.write(json.dumps({'ack':injector}).encode()+b'\n'); await p.stdin.drain()
        held = json.loads(await asyncio.wait_for(p.stdout.readline(), 2))
        assert held['held'] and human.held()['keys'] and human.held()['buttons']
        if mode == 'controller-eof':
            p.stdin.close()
        elif mode == 'cancel':
            p.stdin.write(b'cancel\n'); await p.stdin.drain()
        receipt = json.loads(await asyncio.wait_for(p.stdout.readline(), 3))
        assert receipt['released'] and receipt['injected'], receipt
        assert human.held() == {'keys':set(), 'buttons':set()}
        if mode == 'wrapper-death':
            os.kill(p.pid, signal.SIGKILL)  # Exact owned wrapper, ONLY after release receipt.
        else:
            p.stdin.close()
        await asyncio.wait_for(p.wait(), 4)
        assert await b._identities_gone(p, timeout=3), b._worker_identities
        assert app.poll() is None
        wait(lambda: any(r.get('kind') == 'event' and not r['keys'] and not r['buttons']
             and r['t'] > held['t'] for r in records()))
        marker, when = chr(97+index), time.monotonic()
        for chord in human.text_keys(marker):
            for code in chord: human.key(code, True)
            for code in reversed(chord): human.key(code, False)
        human.sync()
        wait(lambda: any(r.get('kind') == 'text' and r['t'] > when and marker in r['text']
                         for r in records()))
        recovery = await verify_absence(updates[-1])
        assert recovery['status'] == 'unknown' and recovery['reason'] == 'owned_input_release_unproven'
        record('crossuid-lifecycle-pass', mode=mode, receipt=receipt,
            wrapper=updates[-1]['processes'][0],
            identities=updates[-1]['processes'], workers_absent=True, same_app=app.pid,
            recovery=recovery)

async def product(xed):
    b = X11AttachedBackend(enabled=True, display_name=':177', monitor_names=['screen'],
                           app_profile='xed', input_enabled=True, runtime_sudo=True)
    updates = [b.startup_descriptor('crossuid-product')]
    b.runtime_identity_callback = updates.append
    try:
        started = await b.start('crossuid-product')
        assert started['input_supported']
        for kind, fields in [('click',dict(x=200,y=180)),('type',dict(text='crossuid marker')),
            ('polyline',dict(points=[[200,180],[210,180],[220,180]],duration=.1)),
            ('key',dict(chord='ctrl+a')),('key',dict(chord='BackSpace'))]:
            f = await b.observe()
            assert f.focused and f.scope.input_sources
            result = await b.act(dict(type=kind, source_id=f.source.source_id,
                source_revision=f.source.source_revision, consent_generation=f.source.consent_generation,
                expected={'type':'visual_change'}, **fields))
            assert result['released'] and result['status']=='executed', result
            record('crossuid-product-pass', action=kind, receipt=result)
        stopped = await b.detach()
        assert stopped['released'] and xed.poll() is None
        for p in b._worker_identities:
            assert await b._identities_gone(p)
        record('crossuid-product-detach', stopped=stopped, same_xed=xed.pid,
               identities=updates[-1]['processes'], callbacks=len(updates))
    finally:
        await b.detach()

async def capture_lifecycle(app):
    for mode in ('cancel', 'timeout'):
        b = X11AttachedBackend(enabled=True, display_name=':177', monitor_names=['screen'],
                               app_profile='xed', runtime_sudo=True)
        updates = [b.startup_descriptor('crossuid-capture-' + mode)]
        b.runtime_identity_callback = updates.append
        p = await asyncio.create_subprocess_exec(*b._worker_argv('x11_attached_worker.py'),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, start_new_session=True)
        b._record_spawn(p, pending=True)
        await b._worker_ready(p, 'capture')
        if mode == 'cancel':
            p.stdin.close()
        # Withhold operation until the worker's launch gate expires.
        await asyncio.wait_for(p.wait(), 6)
        assert await b._identities_gone(p, timeout=2)
        assert app.poll() is None
        assert (await verify_absence(updates[-1]))['status'] == 'absence_verified'
        record('crossuid-capture-lifecycle-pass', mode=mode, identities=updates[-1]['processes'])

try:
    Path('/tmp/.X11-unix').mkdir(mode=0o1777)
    os.chmod('/tmp/.X11-unix', 0o1777)
    server = spawn('xvfb', ['Xvfb', ':177', '-screen','0','900x500x24','-nolisten','tcp','-noreset','-extension','GLX'])
    wait(lambda: subprocess.run(['xdpyinfo','-display',':177'],stdout=subprocess.DEVNULL,
         stderr=subprocess.DEVNULL).returncode == 0)
    # Target writes /workspace/owned-target.json, so give ONLY fixture workspace to app.
    os.chown('/workspace',65534,65534)
    app = spawn('gtk', ['/usr/bin/python3','/harness/x11-owned-target.py'])
    wait(lambda: Path('/workspace/owned-target.json').exists())
    d = display.Display(':177')
    target = d.create_resource_object('window',json.loads(Path('/workspace/owned-target.json').read_text())['xid'])
    target.set_input_focus(X.RevertToParent,X.CurrentTime); d.sync()
    human = ExistingXTest(':177')
    devices = human.identity()
    human.move(100,30); human.button(1,True); human.button(1,False); human.sync()
    asyncio.run(capture_lifecycle(app))
    asyncio.run(trials(human, app))
    app.stdin.close(); assert app.wait(timeout=3)==0
    xed = spawn('xed',['/usr/bin/dbus-run-session','--config-file=/harness/x11-owned-bus.conf','--',
                       '/usr/bin/xed','--standalone','--new-window'])
    target = wait(lambda: next((w for w in d.screen().root.query_tree().children
        if w.get_wm_class()==('xed','Xed') and w.get_attributes().map_state==X.IsViewable),None))
    target.configure(x=20,y=20,width=800,height=450)
    target.set_input_focus(X.RevertToParent,X.CurrentTime); d.sync(); time.sleep(.2)
    asyncio.run(product(xed))
    assert human.identity()==devices
    target.send_event(event.ClientMessage(window=target, client_type=d.intern_atom('WM_PROTOCOLS'),
        data=(32,[d.intern_atom('WM_DELETE_WINDOW'),X.CurrentTime,0,0,0])),event_mask=0)
    d.sync(); assert xed.wait(timeout=3)==0
    human.close(); d.close(); server.terminate(); assert server.wait(timeout=3)==0
    record('CROSSUID_PASS', lifecycle_trials=5, product_actions=5, devices_unchanged=True)
finally:
    for child, stream in children:
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=3)
        stream.close()
    for name in ('gtk','xed','xvfb'):
        path=Path('/workspace/'+name+'.log')
        if path.exists(): print(name.upper()+'_LOG\n'+path.read_text(),flush=True)
