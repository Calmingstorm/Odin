#!/usr/bin/python3
"""Private GTK3 SendEvent experiment. No production safety/cancel/lease claim.

Only simulated HUMAN uses XTEST. Agent events are owner-directed NoEventMask;
no agent device creation, core-focus changes, server pointer motion or releases.
"""
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import time

from Xlib import X, XK, display, protocol
from Xlib.ext import xtest


def guard():
    assert os.environ.get('XI2_PRIVATE_SANDBOX') == '1'
    assert os.environ.get('DISPLAY') == ':177' and os.getuid() != 0
    assert not Path('/proc/self').exists() and Path('/harness/x11-passwd').is_file()


def record(kind, **values):
    print(json.dumps(dict(kind=kind, t=time.monotonic(), **values)), flush=True)


def sender():
    """Normal stdin EOF ends only this owner sender, never its target app."""
    d = display.Display(':177')
    root = d.screen().root
    classes = {'key-down': protocol.event.KeyPress, 'key-up': protocol.event.KeyRelease,
               'button-down': protocol.event.ButtonPress,
               'button-up': protocol.event.ButtonRelease, 'motion': protocol.event.MotionNotify,
               'enter': protocol.event.EnterNotify}
    try:
        for line in sys.stdin:
            item = json.loads(line)
            w = d.create_resource_object('window', item['xid'])
            extra = ({'mode': X.NotifyNormal, 'flags': 3} if item['op'] == 'enter'
                     else {'same_screen': 1})
            event = classes[item['op']](time=X.CurrentTime, root=root, window=w,
                child=X.NONE, root_x=item['rx'], root_y=item['ry'],
                event_x=item['x'], event_y=item['y'], state=item['state'],
                detail=item['detail'], **extra)
            w.send_event(event, event_mask=X.NoEventMask, propagate=False)
            d.sync()
            record('sender-ack', op=item['op'])
    finally:
        d.close()
    record('sender-normal-eof')


def records(path):
    result = []
    if path.exists():
        for line in path.read_text().splitlines():
            try:
                result.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return result


def wait_for(predicate, label, seconds=4):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.025)
    raise AssertionError('Timed out: ' + label)


def main():
    children, outputs, failures = [], {}, []

    def spawn(name, args, pipe=False):
        output = Path('/workspace/' + name + '.log').open('w')
        outputs[name] = output
        p = subprocess.Popen(args, stdin=subprocess.PIPE,
            stdout=subprocess.PIPE if pipe else output, stderr=output, text=True, bufsize=1)
        children.append((name, p))
        record('child', name=name, pid=p.pid)
        return p

    def helper(op):
        assert op in ('human-hold', 'human-release', 'query')
        cmd = ['/workspace/lifecycle', op] + (['2', '3'] if op == 'query' else [])
        result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=3)
        record('human-helper', op=op, output=result.stdout.strip())

    def check(label, condition, **details):
        record('assertion', label=label, passed=bool(condition), **details)
        if not condition:
            failures.append(label)

    d = None
    try:
        subprocess.run(['gcc', '-O2', '/harness/x11-lifecycle.c', '-o', '/workspace/lifecycle',
                        '-lX11', '-lXi', '-lXtst'], check=True, timeout=20)
        Path('/tmp/.X11-unix').mkdir(mode=0o1777, exist_ok=True)
        server = spawn('attached-xvfb', ['Xvfb', ':177', '-screen', '0', '900x500x24',
                        '-nolisten', 'tcp', '-noreset', '-extension', 'GLX'])
        wait_for(lambda: subprocess.run(['xdpyinfo', '-display', ':177'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0, 'private Xvfb')
        app = spawn('attached-gtk', ['/usr/bin/python3', '/harness/x11-attached-target.py'])
        ready = Path('/workspace/attached-ready.json')
        log = Path('/workspace/attached-gtk.log')
        wait_for(ready.exists, 'GTK ready')
        ids = json.loads(ready.read_text())
        d = display.Display(':177')
        root = d.screen().root
        # Private fixture only: avoid natural repeat obscuring cross-window routing
        # during a deliberately held same-key test. No host display is reachable.
        d.change_keyboard_control(auto_repeat_mode=X.AutoRepeatModeOff)
        d.sync()

        def window(xid):
            return d.create_resource_object('window', xid)

        def origin(w):
            r = root.translate_coords(w, 0, 0)
            return r.x, r.y

        def deepest(w, rx, ry):
            for child in reversed(w.query_tree().children):
                attrs, geo = child.get_attributes(), child.get_geometry()
                ox, oy = origin(child)
                if attrs.map_state == X.IsViewable and ox <= rx < ox+geo.width and oy <= ry < oy+geo.height:
                    return deepest(child, rx, ry)
            return w

        def destination(widget, x=30, y=20):
            meta = ids['robot'][widget]
            ox, oy = origin(window(meta['xid']))
            if meta['xid'] == ids['robot']['xid']:
                ox += meta['x']
                oy += meta['y']
            rx, ry = ox+x, oy+y
            target = deepest(window(ids['robot']['xid']), rx, ry)
            tx, ty = origin(target)
            return dict(xid=target.id, rx=rx, ry=ry, x=rx-tx, y=ry-ty)

        def physical_state():
            p = root.query_pointer()
            f = d.get_input_focus()
            return dict(x=p.root_x, y=p.root_y, mask=p.mask,
                        focus=getattr(f.focus, 'id', f.focus), keymap=list(d.query_keymap()))

        def grabs():
            # This separate diagnostic connection releases ONLY its own acquired grab.
            p = root.grab_pointer(False, 0, X.GrabModeAsync, X.GrabModeAsync,
                                  X.NONE, X.NONE, X.CurrentTime)
            if p == X.GrabSuccess:
                d.ungrab_pointer(X.CurrentTime)
            k = root.grab_keyboard(False, X.GrabModeAsync, X.GrabModeAsync, X.CurrentTime)
            if k == X.GrabSuccess:
                d.ungrab_keyboard(X.CurrentTime)
            d.sync()
            return {'pointer_status': int(p), 'keyboard_status': int(k)}

        def pixels():
            meta = ids['robot']['canvas']
            return window(meta['xid']).get_image(0, 0, meta['width'], meta['height'],
                                                X.ZPixmap, 0xffffffff).data

        def latest():
            return next(r for r in reversed(records(log)) if 'texts' in r)

        def human_key(symbol, down):
            xtest.fake_input(d, X.KeyPress if down else X.KeyRelease,
                             d.keysym_to_keycode(XK.string_to_keysym(symbol)))
            d.sync()
            time.sleep(.06)

        def human_button(number, down):
            xtest.fake_input(d, X.ButtonPress if down else X.ButtonRelease, number)
            d.sync()
            time.sleep(.06)

        # Exact helper human-hold moves the simulated-human pointer to (850,450),
        # deliberately inside the human canvas. Never move the agent core pointer.
        helper('human-hold')
        helper('human-release')
        window(ids['human']['xid']).set_input_focus(X.RevertToParent, X.CurrentTime)
        d.sync()
        time.sleep(.15)

        # New variant is idle-only. Prior logs retain the unsafe held-input cases.
        for index, case in enumerate(('plain',)):
            record('case-start', case=case)
            held_human = None
            sender_p = None
            try:
                if case == 'shift-button3':
                    held_human = 'helper'
                    helper('human-hold')
                elif case == 'same-key-b':
                    held_human = 'b'
                    human_key('b', True)
                elif case == 'same-button1':
                    held_human = 'button1'
                    human_button(1, True)
                time.sleep(.15)
                baseline = physical_state()
                before_grabs = grabs()
                before_app = latest()
                before_pixels = pixels()
                if case == 'same-key-b':
                    code = d.keysym_to_keycode(XK.string_to_keysym('b'))
                    check(case+':human-app-received-held-key',
                          code in before_app['held']['human-entry']['keys'], application=before_app)
                elif case == 'same-button1':
                    check(case+':human-app-received-held-button',
                          1 in before_app['held']['human-canvas']['buttons'], application=before_app)
                elif case == 'shift-button3':
                    check(case+':human-server-held-baseline',
                          baseline['mask'] & (X.ShiftMask|X.Button3Mask) == X.ShiftMask|X.Button3Mask)
                sender_p = spawn('sender-' + case, ['/usr/bin/python3',
                                 '/harness/x11-attached-corpus.py', '--sender'], pipe=True)
                sequence_grabs = []

                def send(op, widget='entry', state=0, detail=0, x=30, y=20):
                    dest = destination(widget, x, y)
                    if op.startswith('key'):
                        dest['xid'] = ids['robot']['xid']
                        ox, oy = origin(window(dest['xid']))
                        dest.update(x=dest['rx']-ox, y=dest['ry']-oy)
                    sender_p.stdin.write(json.dumps(dict(op=op, state=state, detail=detail, **dest))+'\n')
                    sender_p.stdin.flush()
                    if not select.select([sender_p.stdout], [], [], 3)[0]:
                        raise AssertionError('sender acknowledgement timeout')
                    ack = json.loads(sender_p.stdout.readline())
                    assert ack['kind'] == 'sender-ack', ack
                    time.sleep(.06)
                    now = physical_state()
                    check(case+':'+op+':physical-state', baseline == now, before=baseline, after=now)
                    sequence_grabs.append(dict(op=op, **grabs()))

                b = d.keysym_to_keycode(XK.string_to_keysym(('b', 'c', 'b', 'd')[index]))
                a = d.keysym_to_keycode(XK.string_to_keysym('a'))
                send('enter', widget='entry', detail=X.NotifyNonlinear)
                send('key-down', detail=b)
                send('key-up', detail=b)
                send('key-down', state=X.ControlMask, detail=a)
                send('key-up', state=X.ControlMask, detail=a)
                send('button-down', detail=1)
                send('button-up', state=X.Button1Mask, detail=1)
                # Different lane per case allows actual pixel-change proof each time.
                y = 20 + index*30
                send('enter', widget='canvas', detail=X.NotifyNonlinear, y=y)
                send('button-down', widget='canvas', detail=1, state=X.ControlMask, y=y)
                for x in (45, 60, 80):
                    send('motion', widget='canvas', state=X.ControlMask|X.Button1Mask, x=x, y=y)
                send('button-up', widget='canvas', detail=1, state=X.ControlMask|X.Button1Mask, x=80, y=y)
                sender_p.stdin.close()
                check(case+':sender-eof-exit', sender_p.wait(timeout=3) == 0)
                trailing = sender_p.stdout.read()
                check(case+':sender-eof-receipt', 'sender-normal-eof' in trailing, output=trailing)
                time.sleep(.2)
                after_app = latest()
                after_grabs = grabs()
                record('grabs', case=case, before=before_grabs, sequence=sequence_grabs, after=after_grabs)
                check(case+':grabs-restored', before_grabs == after_grabs)
                check(case+':app-survived', app.poll() is None)
                check(case+':physical-held-preserved-after-eof', baseline == physical_state())
                check(case+':human-text-unmodified', before_app['texts']['human'] == after_app['texts']['human'])
                check(case+':human-app-held-unmodified',
                      all(before_app['held'][k] == after_app['held'][k]
                          for k in ('human-entry', 'human-canvas')),
                      before=before_app['held'], after=after_app['held'])
                check(case+':robot-app-ledger-clear',
                      all(not values for name in ('robot-entry', 'robot-canvas')
                          for values in after_app['held'][name].values()), application=after_app)
                check(case+':robot-text-delivered', before_app['texts']['robot'] != after_app['texts']['robot'])
                changed = sum(a != b for a, b in zip(before_pixels, pixels()))
                check(case+':canvas-pixels', changed > 0, changed_bytes=changed,
                      ink_pixels=after_app['ink_pixels']['robot'])
                new_records = [r for r in records(log) if r.get('t', 0) > before_app['t']]
                for event_type in (4, 7, 3):  # GDK press, release, motion
                    check(case+':robot-canvas-event-'+str(event_type), any(
                        r.get('widget') == 'robot-canvas' and r.get('event') == event_type
                        for r in new_records))
            except Exception as exc:
                check(case+':exception', False, error=repr(exc))
            finally:
                if sender_p and sender_p.poll() is None:
                    sender_p.stdin.close()
                    sender_p.wait(timeout=3)
                if held_human == 'helper':
                    helper('human-release')
                elif held_human == 'b':
                    human_key('b', False)
                elif held_human == 'button1':
                    human_button(1, False)
            old = latest()['texts']['human']
            human_key('z', True)
            human_key('z', False)
            check(case+':fresh-human-text-after-sender-eof', latest()['texts']['human'] == old+'z',
                  before=old, after=latest()['texts']['human'])
            since = time.monotonic()
            human_button(1, True)
            human_button(1, False)
            human_events = [r for r in records(log) if r.get('t', 0) >= since
                            and r.get('widget') == 'human-canvas']
            check(case+':fresh-human-click-after-sender-eof',
                  all(any(r.get('event') == event for r in human_events) for event in (4, 7)),
                  events=human_events)
            helper('query')
            record('case-end', case=case, application=latest())
        d.close()
        d = None
        app.stdin.close()
        check('target-normal-stdin-eof-exit', app.wait(timeout=3) == 0)
        check('target-normal-eof-receipt', any(r.get('kind') == 'normal-controller-eof-app-shutdown' for r in records(log)))
        server.terminate()
        check('xvfb-exit', server.wait(timeout=3) == 0)
    finally:
        if d:
            d.close()
        for name, child in reversed(children):
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=2)
            record('reaped', name=name, pid=child.pid, exit_status=child.returncode)
            outputs[name].close()
            print(Path('/workspace/'+name+'.log').read_text(), flush=True)
    record('summary', failures=failures, passed=not failures,
           scope='core technique only; no production supervisor/cancel/lease claim')
    return 1 if failures else 0


if __name__ == '__main__':
    guard()
    if sys.argv[1:] == ['--sender']:
        sender()
    elif not sys.argv[1:]:
        raise SystemExit(main())
    else:
        raise SystemExit('Unsupported invocation')
