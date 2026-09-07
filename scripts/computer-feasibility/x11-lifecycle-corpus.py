#!/usr/bin/python3
"""Bounded disposable lifecycle corpus. No hierarchy removal, fatal-signal case,
physical input, production watchdog, or real-session authorization is claimed.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import time

from x11_records import complete_records

assert os.environ.get('XI2_SAFE_LIFECYCLE') == '1'
assert os.environ.get('DISPLAY') == ':177' and os.getuid() != 0
assert not Path('/proc/self').exists() and Path('/harness/x11-passwd').is_file()
root = Path('/workspace')
exe = str(root / 'lifecycle')
children = []
logs = {}

def record(kind, **values):
    print(json.dumps(dict(kind=kind, t=time.monotonic(), **values)), flush=True)

def spawn(name, args, **kw):
    file = (root / (name + '.log')).open('w')
    logs[name] = file
    child = subprocess.Popen(args, stdout=file, stderr=subprocess.STDOUT, **kw)
    children.append((name, child))
    record('owned-child', name=name, pid=child.pid)
    return child

def wait_for(predicate, timeout=2):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.01)
    raise AssertionError('bounded postcondition timeout')

def records(name):
    return complete_records((root / (name + '.log')).read_text())

def call(*args):
    result = subprocess.run([exe, *map(str, args)], capture_output=True, text=True,
                            check=True, timeout=1)
    assert not result.stderr, result.stderr
    return [json.loads(line) for line in result.stdout.splitlines()]

def connect(request):
    channel = socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET)
    channel.settimeout(3)
    channel.connect('/workspace/watchdog.sock')
    channel.sendall(request.encode())
    return channel

def command(channel, value):
    channel.sendall(value.encode())
    assert channel.recv(256) == b'DONE'

def state(pointer, keyboard, phase):
    value = {item['label']: item for item in call('query', pointer, keyboard)}
    record('snapshot', phase=phase, states=value)
    return value

def expect_new_text(widget, marker, cursor, dispatched):
    # Clicks may replace selected text or insert at any caret position. Require
    # a fresh application receipt, never an assumed append or old matching log.
    matches = []
    def received():
        matches[:] = [item for item in records('gtk')[cursor:]
                      if item.get('kind') == 'text' and item.get('widget') == widget
                      and item['t'] >= dispatched and marker in item.get('value', '')]
        return bool(matches)
    wait_for(received)
    receipt = matches[0]
    record('fresh-text-receipt', widget=widget, marker=marker, cursor=cursor,
           dispatched=dispatched, receipt=receipt)
    return receipt['value']

passed = 0
result = 1
xvfb = app = watchdog = None
try:
    Path('/tmp/.X11-unix').mkdir(mode=0o1777)
    xvfb = spawn('xvfb', ['/usr/bin/Xvfb', ':177', '-screen', '0', '900x500x24',
                         '-nolisten', 'tcp', '-noreset', '-extension', 'GLX'])
    def display_ready():
        return subprocess.run(['xdpyinfo', '-display', ':177'], stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, timeout=1).returncode == 0
    wait_for(display_ready)
    app = spawn('gtk', ['/usr/bin/python3', '/harness/x11-same-target.py'], stdin=subprocess.PIPE)
    wait_for(lambda: (root / 'human.xid').exists() and (root / 'robot.xid').exists())
    human_window = (root / 'human.xid').read_text().strip()
    robot_window = (root / 'robot.xid').read_text().strip()
    call('human-focus', human_window)
    call('human-click', 70, 80)
    watchdog = spawn('watchdog', [exe, 'watchdog'])
    wait_for(lambda: Path('/workspace/watchdog.sock').exists())
    human_text = robot_text = ''
    modes = [('client-eof', 'input-client-eof'), ('cancel', 'controller-eof'),
             ('lease', 'lease-expired'), ('detach', 'graceful-detach')]
    for repeat in range(3):
        for mode, reason in modes:
            channel = connect('attach')
            ack = channel.recv(256).decode().split()
            assert ack[0] == 'ATTACHED', ack
            pointer, keyboard, client = map(int, ack[1:4])
            lease_deadline = float(ack[4])
            command(channel, 'focus ' + robot_window)
            command(channel, 'click 470 80')
            marker = chr(ord('a') + repeat * len(modes) + modes.index((mode, reason)))
            cursor, dispatched = len(records('gtk')), time.monotonic()
            command(channel, 'tap ' + marker)
            robot_text = expect_new_text('robot-top', marker, cursor, dispatched)
            call('human-hold')
            command(channel, 'hold')
            before = state(pointer, keyboard, f'{repeat}/{mode}/held')
            assert before['human']['mods'] == 1 and before['human']['buttons'] == 8, before
            assert before['owned']['mods'] == 4 and before['owned']['buttons'] == 2, before
            assert before['human']['focus'] == int(human_window)
            request_time = time.monotonic()
            prior = len([item for item in records('watchdog') if item['kind'] == 'release'])
            if mode == 'cancel':
                channel.close()  # normal controller transport EOF, not SIGKILL
            elif mode == 'client-eof':
                channel.sendall(b'client-eof')  # child _exit(0), no input release
            elif mode == 'detach':
                channel.sendall(b'detach')
            if mode != 'cancel':
                assert channel.recv(256) == b'RELEASED RETAINED ENABLED'
                channel.close()
            wait_for(lambda: len([item for item in records('watchdog')
                                  if item['kind'] == 'release']) == prior + 1, timeout=3)
            release = [item for item in records('watchdog') if item['kind'] == 'release'][-1]
            assert release['reason'] == reason and release['client_status'] == 0, release
            assert 0 <= release['latency_ms'] < 250, release
            assert release['released'] <= lease_deadline + .250, release
            after = state(pointer, keyboard, f'{repeat}/{mode}/released')
            assert after['owned']['mods'] == 0 and after['owned']['buttons'] == 0, after
            for field in ('mods', 'buttons', 'x', 'y', 'focus'):
                assert before['human'][field] == after['human'][field], (field, before, after)
            assert app.poll() is None and watchdog.poll() is None
            cursor, dispatched = len(records('gtk')), time.monotonic()
            call('human-tap', marker)
            human_text = expect_new_text('human-top', marker.upper(), cursor, dispatched)
            call('human-release')  # human explicitly releases only its own input
            final = state(pointer, keyboard, f'{repeat}/{mode}/human-own-release')
            assert final['human']['mods'] == 0 and final['human']['buttons'] == 0
            passed += 1
            record('trial-pass', trial=passed, repeat=repeat, mode=mode,
                   release=release, request_to_release_ms=(release['released']-request_time)*1000,
                   input_client_pid=client, app_pid=app.pid, human_text=human_text,
                   robot_text=robot_text, marker=marker, retained_enabled=True)
    inventory = call('inventory')
    retained = [item for item in inventory if item['name'].startswith('Odin R2 retained')]
    assert len(retained) == 4 and all(item['enabled'] for item in retained), retained
    record('retained-inventory', devices=retained, all_device_count=len(inventory))
    quit_channel = connect('quit')
    assert quit_channel.recv(256) == b'RETAINED'
    quit_channel.close()
    assert watchdog.wait(timeout=2) == 0
    assert app.poll() is None
    cursor, dispatched = len(records('gtk')), time.monotonic()
    call('human-tap', 'z')
    human_text = expect_new_text('human-top', 'z', cursor, dispatched)
    record('post-watchdog-exit-app-survives', app_pid=app.pid, human_text=human_text,
           retained_devices=call('inventory'))
    app.stdin.close()  # test complete; normal EOF shutdown of fixture application
    assert app.wait(timeout=2) == 0
    xvfb.terminate()  # exact owned disposable server PID, after app has exited
    assert xvfb.wait(timeout=2) == 0
    result = 0
finally:
    for name, child in reversed(children):
        if child.poll() is None:
            child.terminate()  # failure cleanup of exact owned child only
            try:
                child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=2)
        record('owned-child-reaped', name=name, pid=child.pid, exit_status=child.returncode)
    for name, file in logs.items():
        file.close()
        text = (root / (name + '.log')).read_text()
        print(f'=== {name.upper()} EVIDENCE BEGIN ===', flush=True)
        print(text, end='', flush=True)
        print(f'=== {name.upper()} EVIDENCE END ===', flush=True)
        if any(word in text for word in ('Traceback', 'XERROR', 'XI_BadDevice', 'X Window System error', 'FAIL ')):
            result = 6
    record('corpus-result', passed=passed, planned=12, exit_status=result,
           note='retained ENABLED pair/slaves until private X server exit; not a disabled or removed device lifecycle')
assert result == 0 and passed == 12, 'lifecycle corpus failed'
