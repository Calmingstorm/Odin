#!/usr/bin/python3
"""Explicitly gated disposable XI2 experiment. Never connects to a host display."""
import argparse
import os
from pathlib import Path
import subprocess
import uuid

p = argparse.ArgumentParser()
p.add_argument('--execute-isolated', action='store_true', help='requires parent go-ahead')
p.add_argument('--same-process', action='store_true', help='opt-in GTK shared-focus and disconnect probe')
args = p.parse_args()
if not args.execute_isolated:
    raise SystemExit('PREPARED ONLY. Parent authorization required before --execute-isolated.')
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
for k, v in env.items():
    sandbox += ['--setenv', k, v]
sandbox += ['/usr/bin/dbus-run-session', '--', '/usr/bin/bash', '/harness/x11-session.sh']
cmd = ['/usr/bin/systemd-run', '--quiet', '--pipe', '--wait', '--collect', '--service-type=exec',
       '--unit=' + unit] + ['--property=' + x for x in props] + sandbox
if os.geteuid() != 0:
    cmd = ['/usr/bin/sudo', '-n'] + cmd
print('OWNED_UNIT=' + unit, flush=True)
r = subprocess.run(cmd, env={'PATH': '/usr/bin', 'LANG': 'C.UTF-8'}, check=False)
check = subprocess.run(['/usr/bin/systemctl', 'show', unit, '-p', 'ActiveState', '-p', 'SubState',
                        '-p', 'ControlGroup'], text=True, capture_output=True)
print('CLEANUP_UNIT ' + check.stdout.strip(), flush=True)
raise SystemExit(r.returncode)
