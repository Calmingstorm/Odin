#!/usr/bin/python3
"""Fixed UID1000 exec gate. No X connection, shell, or model code."""
import argparse
import json
import os
import select
import signal
import sys
from pathlib import Path


def identity(pid):
    proc = Path('/proc') / str(pid)
    data = (proc / 'stat').read_text()
    fields = data[data.rfind(')') + 2:].split()
    if fields[0] in {'Z', 'X', 'x'}:
        raise RuntimeError('process_not_live')
    return {'pid': pid, 'uid': proc.stat().st_uid, 'start_ticks': int(fields[19])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('role', choices=['xed', 'bus', 'terminate'])
    parser.add_argument('--config')
    parser.add_argument('--pid', type=int)
    parser.add_argument('--start', type=int)
    args = parser.parse_args()
    if os.getuid() != 1000 or os.geteuid() != 1000:
        raise RuntimeError('operator_uid_must_be_1000')
    if args.role == 'terminate':
        if args.pid is None or args.pid <= 1 or args.start is None:
            raise RuntimeError('invalid_identity')
        try:
            fd = os.pidfd_open(args.pid)
        except ProcessLookupError:
            return
        try:
            if identity(args.pid) != {'pid': args.pid, 'uid': 1000, 'start_ticks': args.start}:
                raise RuntimeError('identity_changed')
            signal.pidfd_send_signal(fd, signal.SIGTERM)
        finally:
            os.close(fd)
        return
    signal.alarm(12)
    print(json.dumps(identity(os.getpid())), flush=True)
    if not select.select([sys.stdin], [], [], 10)[0] or sys.stdin.buffer.readline(4) != b'GO\n':
        raise RuntimeError('launch_gate_not_acknowledged')
    signal.alarm(0)
    with open(os.devnull, 'r+b', buffering=0) as null:
        for fd in (0, 1, 2):
            os.dup2(null.fileno(), fd)
    if args.role == 'xed':
        os.execve('/usr/bin/xed', ['xed', '--standalone', '--new-window'], os.environ)
    if not args.config or not Path(args.config).is_absolute():
        raise RuntimeError('private_config_required')
    os.execve('/usr/bin/dbus-daemon', ['dbus-daemon', '--nofork', '--nopidfile',
                                     '--config-file=' + args.config], os.environ)


if __name__ == '__main__':
    main()
