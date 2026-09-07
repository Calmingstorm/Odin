#!/usr/bin/python3
"""Explicitly gated disposable XI2 experiment. Never connects to a host display."""
import argparse
import os
from pathlib import Path
import subprocess
import threading
import json
import uuid

from x11_records import process_identity

p = argparse.ArgumentParser()
p.add_argument('--execute-isolated', action='store_true', help='requires parent go-ahead')
p.add_argument('--same-process', action='store_true', help='opt-in GTK shared-focus and disconnect probe')
p.add_argument('--safe-lifecycle', action='store_true', help='R2 watchdog, release and retained-device lifecycle only')
p.add_argument('--send-event-probe', action='store_true', help='R5 disposable no-device compatibility probe')
p.add_argument('--attached-corpus', action='store_true', help='R5 disposable SendEvent toolkit coexistence corpus')
p.add_argument('--capture-adapter', action='store_true', help='R5 actual capture adapter in private display')
p.add_argument('--owned-guardian', action='store_true', help='R5 existing XTEST input and release')
p.add_argument('--crossuid-guardian', action='store_true', help='R5 private root sudo workers, uid65534 apps')
args = p.parse_args()
if args.crossuid_guardian:
    args.owned_guardian = True
if not args.execute_isolated:
    raise SystemExit('PREPARED ONLY. Parent authorization required before --execute-isolated.')
if args.same_process:
    raise SystemExit('Historical removal probe is unsafe and disabled; use --safe-lifecycle.')
if not any((args.safe_lifecycle, args.send_event_probe, args.attached_corpus,
            args.capture_adapter, args.owned_guardian)):
    raise SystemExit('Historical hierarchy-removal fixtures are disabled; require --safe-lifecycle.')
root = Path(__file__).resolve().parent
if any(c in str(root) for c in ': \n\r'):
    raise SystemExit('Unsafe source path')
unit = 'odin-xi2-feasibility-' + uuid.uuid4().hex + '.service'
props = ['DynamicUser=yes', 'PrivateTmp=yes', 'PrivateNetwork=yes', 'PrivateDevices=yes',
         'ProtectSystem=strict', 'ProtectHome=yes', 'NoNewPrivileges=yes',
         'ProtectKernelTunables=yes', 'ProtectKernelModules=yes', 'ProtectKernelLogs=yes',
         'ProtectControlGroups=yes', 'ProtectClock=yes', 'RestrictRealtime=yes',
         'RestrictSUIDSGID=yes', 'LockPersonality=yes', 'RemoveIPC=yes',
         'MemoryMax=1G', 'MemorySwapMax=0', 'CPUQuota=100%', 'TasksMax=64',
         'RuntimeMaxSec=120', 'TimeoutStopSec=2', 'KillMode=control-group',
         'UMask=0077', 'RestrictAddressFamilies=AF_UNIX AF_NETLINK',
         'CapabilityBoundingSet=', 'AmbientCapabilities=', 'LimitCORE=0',
         f'BindReadOnlyPaths={root}:/xi2-source']
sandbox = ['/usr/bin/bwrap', '--unshare-all', '--unshare-user', '--die-with-parent',
           '--new-session', '--cap-drop', 'ALL', '--clearenv', '--uid', '65534', '--gid', '65534',
           '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin',
           '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
           # No procfs is needed. An empty directory avoids the proc remount
           # failure under systemd's protected proc submounts, without exposing
           # the host procfs or weakening systemd's kernel protection.
           '--ro-bind', '/xi2-source', '/harness', '--dir', '/proc', '--dev', '/dev',
           '--dir', '/etc', '--ro-bind', '/etc/fonts', '/etc/fonts',
           '--ro-bind', '/xi2-source/x11-passwd', '/etc/passwd',
           '--ro-bind', '/xi2-source/x11-group', '/etc/group',
           '--dir', '/var', '--dir', '/home', '--size', '268435456', '--tmpfs', '/workspace',
           '--dir', '/workspace/home', '--dir', '/workspace/run', '--dir', '/workspace/tmp',
           '--symlink', 'workspace/tmp', '/tmp', '--symlink', 'workspace/run', '/run',
           '--symlink', '/workspace/tmp', '/var/tmp', '--chdir', '/workspace',
           '--remount-ro', '/dev', '--remount-ro', '/']
env = {'PATH': '/usr/bin', 'HOME': '/workspace/home', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
       'DISPLAY': ':177', 'XDG_RUNTIME_DIR': '/workspace/run', 'GDK_BACKEND': 'x11',
       'GSETTINGS_BACKEND': 'memory', 'NO_AT_BRIDGE': '1', 'PYTHONDONTWRITEBYTECODE': '1',
       'GIO_USE_VFS': 'local', 'GTK_IM_MODULE': 'gtk-im-context-simple',
       'XI2_PRIVATE_SANDBOX': '1'}
if args.same_process:
    env['XI2_SAME_PROCESS'] = '1'
if args.safe_lifecycle or args.send_event_probe or args.attached_corpus or args.capture_adapter:
    env['XI2_SAFE_LIFECYCLE'] = '1'
for k, v in env.items():
    sandbox += ['--setenv', k, v]
sandbox += ['/usr/bin/dbus-run-session', '--', '/usr/bin/bash',
            '/harness/x11-send-event-session.sh' if args.send_event_probe else
            '/harness/x11-lifecycle-session.sh' if args.safe_lifecycle else '/harness/x11-session.sh']
if args.attached_corpus:
    sandbox[-2:] = ['/usr/bin/python3', '/harness/x11-attached-corpus.py']
if args.capture_adapter or args.owned_guardian:
    props.append(f'BindReadOnlyPaths={root.parents[1] / "src"}:/capture-source')
    at = sandbox.index('--ro-bind')
    sandbox[at:at] = ['--dir', '/code', '--ro-bind', '/capture-source', '/code/src']
    sandbox[-2:] = ['/usr/bin/python3', '/harness/x11-attached-capture-check.py']
if args.owned_guardian:
    # The app identity query needs ONLY the fixture's private PID namespace.
    # Replace outer masked proc mounts with private readonly proc (R4 bootstrap).
    props = [p for p in props if not p.startswith((
        'ProtectKernelTunables=', 'ProtectKernelLogs=', 'DynamicUser=',
        'CapabilityBoundingSet='))]
    # Root-only namespace bootstrap preserves real immutable /usr ownership for
    # the PRODUCT executable identity check. Drop uid before server/apps start.
    props += ['CapabilityBoundingSet=CAP_SYS_ADMIN CAP_NET_ADMIN CAP_CHOWN CAP_SETUID CAP_SETGID CAP_SETPCAP CAP_SYS_CHROOT']
    sandbox.remove('--unshare-all')
    sandbox.remove('--unshare-user')
    sandbox[1:1] = ['--unshare-pid', '--unshare-net', '--unshare-ipc', '--unshare-uts']
    for flag in ('--uid', '--gid'):
        at = sandbox.index(flag)
        del sandbox[at:at+2]
    at = sandbox.index('--cap-drop') + 2
    sandbox[at:at] = ['--cap-add', 'CAP_SETUID', '--cap-add', 'CAP_SETGID',
                     '--cap-add', 'CAP_SETPCAP', '--cap-add', 'CAP_CHOWN']
    at = sandbox.index('/proc')
    sandbox[at-1:at+1] = ['--proc', '/proc']
    at = sandbox.index('--remount-ro')
    sandbox[at:at] = ['--remount-ro', '/proc']
    sandbox[-2:] = ['/usr/bin/python3', '/harness/x11-owned-guardian-corpus.py']
    at = sandbox.index('/usr/bin/dbus-run-session')
    sandbox[at:] = ['/usr/bin/bash', '/harness/x11-owned-bootstrap.sh']
if args.crossuid_guardian:
    props = [p for p in props if not p.startswith('CapabilityBoundingSet=')]
    at = sandbox.index('/etc')
    sandbox[at-1] = '--tmpfs'
    props += ['CapabilityBoundingSet=CAP_SYS_ADMIN CAP_NET_ADMIN CAP_CHOWN CAP_SETUID CAP_SETGID CAP_SETPCAP CAP_SYS_CHROOT CAP_DAC_OVERRIDE CAP_SYS_PTRACE CAP_AUDIT_WRITE CAP_KILL']
    at = sandbox.index('--cap-drop') + 2
    sandbox[at:at] = ['--cap-add', 'CAP_DAC_OVERRIDE', '--cap-add', 'CAP_SYS_PTRACE',
                      '--cap-add', 'CAP_AUDIT_WRITE', '--cap-add', 'CAP_KILL']
    at = sandbox.index('--remount-ro')
    sandbox[at:at] = ['--ro-bind', '/harness/x11-crossuid-passwd', '/etc/passwd']
    # Bind source uses outer namespace paths, not the inner /harness alias.
    sandbox = [s.replace('/harness/x11-crossuid-passwd', '/xi2-source/x11-crossuid-passwd')
               .replace('/harness/x11-crossuid-sudoers', '/xi2-source/x11-crossuid-sudoers')
               for s in sandbox]
    sandbox[-1] = '/harness/x11-crossuid-bootstrap.sh'
cmd = ['/usr/bin/systemd-run', '--quiet', '--pipe', '--wait', '--collect', '--service-type=exec',
       '--unit=' + unit] + ['--property=' + x for x in props] + sandbox
if os.geteuid() != 0:
    cmd = ['/usr/bin/sudo', '-n'] + cmd
print('OWNED_UNIT=' + unit, flush=True)
group = Path('/sys/fs/cgroup/system.slice') / unit
seen = {}
monitor_errors = []
finished = threading.Event()

def identity(pid):
    return process_identity(pid)

def census():
    while not finished.is_set():
        try:
            for file in group.rglob('cgroup.procs'):
                try:
                    pids = file.read_text().split()
                except FileNotFoundError:
                    continue
                for pid in pids:
                    item = identity(pid)
                    if item:
                        seen[(item['pid'], item['start_ticks'])] = item
        except FileNotFoundError:
            pass
        except Exception as exc:
            monitor_errors.append(type(exc).__name__ + ': ' + str(exc))
            return
        finished.wait(.02)

monitor = threading.Thread(target=census, daemon=True)
monitor.start()
result = 1
try:
    result = subprocess.run(cmd, env={'PATH': '/usr/bin', 'LANG': 'C.UTF-8'}, check=False).returncode
finally:
    # Stop only this recorded fixture unit, including interrupted wrapper paths.
    stop = ['/usr/bin/systemctl', 'stop', unit]
    if os.geteuid() != 0:
        stop = ['/usr/bin/sudo', '-n'] + stop
    stopped = subprocess.run(stop, text=True, capture_output=True, timeout=10)
    check = subprocess.run(['/usr/bin/systemctl', 'show', unit, '-p', 'LoadState',
                            '-p', 'ActiveState', '-p', 'SubState', '-p', 'ControlGroup'],
                           text=True, capture_output=True, timeout=10)
    print('CLEANUP_UNIT ' + check.stdout.strip(), flush=True)
    finished.set()
    monitor.join(timeout=2)
    survivors = []
    for original in seen.values():
        current = identity(original['pid'])
        if current and current['start_ticks'] == original['start_ticks']:
            survivors.append(current)
    print('HOST_PROCESS_LEDGER ' + json.dumps({'unit': unit, 'cgroup': str(group),
          'sample_interval_ms': 20, 'identities': list(seen.values()),
          'survivors_including_zombies': survivors, 'cgroup_exists': group.exists(),
          'monitor_errors': monitor_errors}), flush=True)
    if survivors or group.exists() or monitor_errors or not seen:
        raise SystemExit('FAIL exact fixture process/cgroup cleanup unverified')
    state = dict(line.split('=', 1) for line in check.stdout.splitlines() if '=' in line)
    if not (state.get('ActiveState') == 'inactive' and state.get('SubState') == 'dead'
            and state.get('ControlGroup') == ''
            and (stopped.returncode == 0 or state.get('LoadState') == 'not-found')):
        raise SystemExit('FAIL exact owned-unit cleanup unverified: ' + check.stderr)
raise SystemExit(result)
