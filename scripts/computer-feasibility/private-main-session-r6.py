#!/usr/bin/python3
"""Exact main-session harness, disposable PID/network/mount namespace and cgroup."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

from r6_reaper import Reaper


def outer():
    source = Path(__file__).resolve().parent
    out = Path(tempfile.mkdtemp(prefix='private-main-r6-', dir='/tmp'))
    tree = out / 'tree'
    harness = tree / 'scripts/computer-feasibility'
    harness.mkdir(parents=True)
    files = ['x11-run.py', 'x11_records.py', 'x11-passwd', 'x11-group',
             'x11-crossuid-passwd', 'x11-crossuid-sudoers', 'x11-crossuid-pam',
             'x11-crossuid-bootstrap.sh', 'r6_reaper.py',
             'main-session-app-smoke-r6.py', 'main_scratch_launcher.py',
             'main_scratch_support.py', 'main_scratch_windows.py',
             'main_scratch_randr.py', 'owned-test-supervisor-r6.py']
    for name in files:
        shutil.copy2(source / name, harness / name)
    shutil.copy2(__file__, harness / 'x11-crossuid-corpus.py')
    bootstrap = harness / 'x11-crossuid-bootstrap.sh'
    bootstrap.write_text(bootstrap.read_text().replace(
        'chown 65534:65534 /workspace/home /workspace/run /workspace/tmp',
        'chown 1000:1000 /workspace/home /workspace/run'))
    (harness / 'x11-crossuid-passwd').write_text(
        'root:x:0:0:root:/workspace/root:/bin/bash\n'
        'calmingstorm:x:1000:1000:private fixture:/workspace/home:/bin/bash\n'
        'nobody:x:65534:65534:nobody:/nonexistent:/bin/false\n')
    (harness / 'x11-group').write_text('root:x:0:\ncalmingstorm:x:1000:\nnogroup:x:65534:\n')
    (harness / 'x11-crossuid-sudoers').write_text(
        'Defaults !requiretty\nroot ALL=(ALL:ALL) NOPASSWD: ALL\n')
    workspace = out / 'workspace'
    subprocess.run(['sudo', '-n', 'install', '-d', '-m', '755', '-o', '0', '-g', '0',
                    str(workspace), str(workspace / 'tmp')], check=True, timeout=5)
    (tree / 'src').symlink_to(source.parents[1] / 'src', target_is_directory=True)
    runner = (harness / 'x11-run.py').read_text()
    changes = {
        "'MemoryMax=1G'": "'MemoryMax=2G'",
        "'RuntimeMaxSec=120'": "'RuntimeMaxSec=300'",
        "CAP_SYS_PTRACE CAP_AUDIT_WRITE CAP_KILL']": "CAP_SYS_PTRACE CAP_AUDIT_WRITE CAP_KILL CAP_FOWNER']",
        "'--cap-add', 'CAP_AUDIT_WRITE', '--cap-add', 'CAP_KILL']":
            "'--cap-add', 'CAP_AUDIT_WRITE', '--cap-add', 'CAP_KILL', '--cap-add', 'CAP_FOWNER']",
        "'--size', '268435456', '--tmpfs', '/workspace',": "'--bind', '/r6-output', '/workspace',",
        "f'BindReadOnlyPaths={root}:/xi2-source']":
            "f'BindReadOnlyPaths={root}:/xi2-source', 'BindPaths=" + str(workspace) + ":/r6-output']",
        "'--symlink', 'workspace/tmp', '/tmp'": "'--bind', '/r6-output/tmp', '/tmp'",
        "'--dir', '/code', '--ro-bind', '/capture-source', '/code/src'":
            "'--dir', '/code', '--ro-bind', '/capture-source', '/code/src', "
            "'--ro-bind', '/xi2-source', '/code/scripts/computer-feasibility'",
    }
    for old, new in changes.items():
        if runner.count(old) != 1:
            raise RuntimeError('reviewed_runner_anchor_changed')
        runner = runner.replace(old, new)
    (harness / 'x11-run.py').write_text(runner)
    digest = hashlib.sha256((source / 'main-session-app-smoke-r6.py').read_bytes()).hexdigest()
    assert digest == hashlib.sha256((harness / 'main-session-app-smoke-r6.py').read_bytes()).hexdigest()
    reaper = Reaper()
    result = 1
    try:
        with (out / 'runner.log').open('w') as log:
            result = subprocess.run(['/usr/bin/python3', str(harness / 'x11-run.py'),
                '--execute-isolated', '--crossuid-guardian'], stdout=log, stderr=log,
                env={'PATH': '/usr/bin', 'LANG': 'C.UTF-8'}, timeout=330).returncode
    finally:
        cleanup = reaper.close()
        summary = {'exit_code': result, 'outer_cleanup': cleanup,
                   'exact_harness_sha256': digest, 'evidence': str(out)}
        (out / 'outer.json').write_text(json.dumps(summary, indent=2) + '\n')
        print(json.dumps(summary), flush=True)
    return result


def inner():
    assert os.geteuid() == 0 and os.environ.get('DISPLAY') == ':177'
    assert not Path('/home/odin').exists() and not Path('/tmp/.X11-unix/X0').exists()
    sys.path.insert(0, '/code/scripts/computer-feasibility')
    from main_scratch_launcher import identity
    from main_scratch_support import bus_config
    reaper = Reaper()
    children = []
    os.chmod('/tmp', 0o1777)
    home = Path('/workspace/fixture-home')
    home.mkdir(mode=0o700)
    os.chown(home, 1000, 1000)
    authority = Path('/workspace/Xauthority')
    authority.touch(mode=0o600)
    os.chown(authority, 1000, 1000)
    env = {'PATH': '/usr/bin:/bin', 'HOME': str(home), 'LANG': 'C.UTF-8',
           'DISPLAY': ':177', 'XAUTHORITY': str(authority), 'USER': 'calmingstorm',
           'LOGNAME': 'calmingstorm', 'XDG_CONFIG_HOME': str(home / 'config'),
           'XDG_CACHE_HOME': str(home / 'cache'), 'XDG_DATA_HOME': str(home / 'data'),
           'XDG_RUNTIME_DIR': str(home), 'GSETTINGS_BACKEND': 'memory',
           'DBUS_SESSION_BUS_ADDRESS': 'unix:path=' + str(home / 'bus.socket'),
           'NO_AT_BRIDGE': '1', 'GDK_BACKEND': 'x11', 'PYTHONDONTWRITEBYTECODE': '1'}
    uid = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups',
           '--bounding-set=-all', '--no-new-privs']
    def spawn(name, argv):
        with Path('/workspace/' + name + '.log').open('w') as log:
            p = subprocess.Popen(uid + argv, env=env, stdout=log, stderr=log)
        children.append(p)
        return p
    def wait(check):
        for _ in range(100):
            if check():
                return
            time.sleep(.1)
        raise RuntimeError('private_fixture_readiness_timeout')
    result = 1
    try:
        subprocess.run(['xauth', '-f', str(authority)],
                       input='add :177 . ' + os.urandom(16).hex() + '\n', text=True,
                       env=env, check=True, timeout=5, stdout=subprocess.DEVNULL)
        os.chown(authority, 1000, 1000)
        Path('/tmp/.X11-unix').mkdir(mode=0o1777)
        os.chmod('/tmp/.X11-unix', 0o1777)
        xvfb = spawn('xvfb', ['Xvfb', ':177', '-screen', '0', '1280x900x24',
                            '-auth', str(authority), '-nolisten', 'tcp', '-noreset',
                            '-extension', 'GLX'])
        wait(lambda: subprocess.run(['xdpyinfo'], env=env, stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL, timeout=2).returncode == 0)
        rejected = subprocess.run(['xdpyinfo'], env={**env, 'XAUTHORITY': '/nonexistent'},
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                  timeout=2).returncode != 0
        if not rejected:
            raise RuntimeError('private_xauthority_not_enforced')
        config = home / 'bus.conf'
        config.write_text(bus_config(home / 'bus.socket'))
        os.chown(config, 1000, 1000)
        spawn('bus', ['dbus-daemon', '--nofork', '--nopidfile', '--config-file=' + str(config)])
        wait(lambda: (home / 'bus.socket').exists())
        wm = spawn('openbox', ['openbox', '--sm-disable'])
        os.environ.update(env)
        from Xlib import display
        d = display.Display(':177')
        wait(lambda: d.screen().root.get_full_property(d.intern_atom('_NET_SUPPORTING_WM_CHECK'), 0))
        time.sleep(1)
        # Let Openbox establish its own idle active-window property via a wholly
        # disposable fixture window. Never synthesize WM-owned EWMH properties.
        from Xlib import X
        window = d.screen().root.create_window(1, 1, 40, 40, 0,
            d.screen().root_depth, X.InputOutput, X.CopyFromParent)
        window.set_wm_name('private-baseline-initializer')
        window.map()
        d.sync()
        def clients():
            prop = d.screen().root.get_full_property(d.intern_atom('_NET_CLIENT_LIST'), 0)
            return list(prop.value) if prop else []
        wait(lambda: window.id in clients())
        subprocess.run(['xdotool', 'windowminimize', str(window.id)], env=env,
                       check=True, timeout=3)
        time.sleep(.5)
        window.destroy()
        d.sync()
        wait(lambda: not clients())
        time.sleep(1)
        marker = Path('/etc/odin-r6-private.json')
        marker.write_text(json.dumps({'xvfb': identity(xvfb.pid), 'wm': identity(wm.pid)}))
        marker.chmod(0o600)
        d.close()
        with Path('/workspace/harness.log').open('w') as log:
            result = subprocess.run(['/usr/bin/python3',
                '/code/scripts/computer-feasibility/main-session-app-smoke-r6.py',
                '--confirm-scratch-only', '--private-qualification', '--display', ':177',
                '--monitor', 'screen', '--xauthority', str(authority),
                '--session-user', 'calmingstorm'], env={**env, 'HOME': '/workspace/root'},
                stdout=log, stderr=log, timeout=275).returncode
        print(json.dumps({'harness_returncode': result, 'xauthority_enforced': rejected,
                          'xvfb': identity(xvfb.pid), 'wm': identity(wm.pid)}), flush=True)
    finally:
        cleanup = reaper.close()
        authority.unlink(missing_ok=True)
        shutil.rmtree(home, ignore_errors=True)
        Path('/workspace/inner.json').write_text(json.dumps(
            {'harness_returncode': result, 'cleanup': cleanup}) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute-isolated', action='store_true')
    args = parser.parse_args()
    if os.environ.get('XI2_PRIVATE_SANDBOX') == '1':
        raise SystemExit(inner())
    if not args.execute_isolated:
        parser.error('--execute-isolated required; never connects to host displays')
    raise SystemExit(outer())
