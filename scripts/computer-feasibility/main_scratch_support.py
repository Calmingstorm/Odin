"""Private journals, independently bounded cleanup and exact gated processes."""
from __future__ import annotations

import asyncio
import json
import os
import signal
import subprocess
import time
from contextlib import contextmanager
from pathlib import Path
from xml.sax.saxutils import escape


def command(*argv):
    return subprocess.run(argv, check=True, capture_output=True, text=True, timeout=10).stdout


@contextmanager
def bounded(seconds=10):
    def expired(*_):
        raise TimeoutError('stage_deadline')
    old = signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old)


def durable_json(path, value):
    path = Path(path)
    temporary = path.with_suffix('.pending')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, sort_keys=True)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def bus_config(socket):
    # No includes, service directories, activation helper or daemon defaults.
    return ('<busconfig><type>session</type><listen>unix:path=' + escape(str(socket)) +
            '</listen><auth>EXTERNAL</auth><policy context="default">'
            '<allow send_destination="*"/><allow receive_sender="*"/>'
            '<allow own="*"/><deny send_destination="org.freedesktop.DBus" '
            'send_interface="org.freedesktop.DBus" send_member="StartServiceByName"/>'
            '</policy></busconfig>\n')


async def stage(records, base, name, fn):
    start = time.monotonic()
    record = {'stage': name, 'ok': False}
    records.append(record)
    try:
        with bounded(12):
            value = fn()
            if hasattr(value, '__await__'):
                signal.setitimer(signal.ITIMER_REAL, 0)
                value = await asyncio.wait_for(value, 25)
        if isinstance(value, dict):
            record['result'] = value
            if value.get('errors'):
                raise RuntimeError('stage_reported_errors')
        record['ok'] = True
    except Exception as exc:
        record['error_type'] = type(exc).__name__
    finally:
        record['seconds'] = round(time.monotonic() - start, 3)
        try:
            durable_json(base / 'stages.json', records)
        except OSError as exc:
            record['ok'] = False
            record['journal_error'] = type(exc).__name__
    return record['ok']


def exact_process(expected):
    from main_scratch_launcher import identity
    try:
        return expected is not None and identity(expected['pid']) == expected
    except (OSError, ValueError, RuntimeError):
        return False


async def launch(role, args, home, base, processes):
    if role not in {'bus', 'xed', 'inkscape'}:
        raise RuntimeError('invalid_role')
    env = ['env', '-i', 'PATH=/usr/bin:/bin', f'HOME={home}',
        f'USER={args.session_user}', f'LOGNAME={args.session_user}',
        'LANG=C.UTF-8', f'DISPLAY={args.display}', f'XAUTHORITY={args.xauthority}',
        'GSETTINGS_BACKEND=memory', 'NO_AT_BRIDGE=1', 'GDK_BACKEND=x11',
        f'XDG_CONFIG_HOME={home}/config', f'XDG_CACHE_HOME={home}/cache',
        f'XDG_DATA_HOME={home}/data', f'XDG_RUNTIME_DIR={home}',
        'GTK_USE_PORTAL=0', f'DBUS_SESSION_BUS_ADDRESS=unix:path={home}/bus.socket']
    argv = ['sudo', '-n', '-u', args.session_user, *env,
            '/usr/bin/python3', '-I', str(home / 'launcher.py'), role]
    if role == 'bus':
        argv.extend(['--config', str(home / 'bus.conf')])
    child = await asyncio.create_subprocess_exec(*argv, stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, limit=2048)
    entry = {'wrapper': child, 'identity': None}
    processes[role] = entry
    announced = json.loads(await asyncio.wait_for(child.stdout.readline(), 5))
    if (set(announced) != {'pid', 'uid', 'start_ticks'} or announced['uid'] != 1000
            or not all(type(v) is int for v in announced.values())):
        raise RuntimeError('launch_identity_invalid')
    if not exact_process(announced):
        raise RuntimeError('launch_identity_unverified')
    entry['identity'] = announced
    durable_json(base / (role + '-identity.json'), announced)
    child.stdin.write(b'GO\n')
    await child.stdin.drain()
    child.stdin.close()
    if role == 'bus':
        for _ in range(50):
            try:
                await asyncio.to_thread(command, 'sudo', '-n', '-u', args.session_user,
                                        'test', '-S', str(home / 'bus.socket'))
                return
            except subprocess.CalledProcessError:
                await asyncio.sleep(.1)
        raise RuntimeError('private_bus_not_ready')


async def terminate(role, args, home, processes):
    entry = processes.get(role)
    if not entry:
        return
    child, expected = entry['wrapper'], entry['identity']
    if child.stdin and not child.stdin.is_closing():
        child.stdin.close()
    if exact_process(expected):
        await asyncio.to_thread(command, 'sudo', '-n', '-u', args.session_user,
            '/usr/bin/python3', '-I', str(home / 'launcher.py'), 'terminate',
            '--pid', str(expected['pid']), '--start', str(expected['start_ticks']))
    await asyncio.wait_for(child.wait(), 5)
    if exact_process(expected):
        raise RuntimeError('owned_process_remaining')
