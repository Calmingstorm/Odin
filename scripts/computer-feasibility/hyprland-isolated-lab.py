#!/usr/bin/env python3
"""Disposable Phase-3 native compositor lab; never enters a host compositor.

Copy this file into a NEW ~/odin-hyprland-phase3-proof and run --launch there.
Only fixed `proof` and `stop` FIFO actions are supported. Proof executes the
reviewed /proof/harness.py within the compositor's PID/mount namespaces.
"""
import json
import os
from pathlib import Path
import select
import signal
import socket
import stat
import subprocess
import sys
import time


def identity(pid):
    text = Path(f"/proc/{pid}/stat").read_text()
    return {"pid": pid, "start_ticks": text[text.rfind(")") + 2:].split()[19]}


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + "\n")


def inside():
    root = Path('/proof')
    assert os.environ['XDG_RUNTIME_DIR'] == '/proof/runtime'
    assert not Path('/run/dbus/system_bus_socket').exists()
    assert not Path('/dev/input').exists()
    assert not list(Path('/dev/dri').glob('card*'))
    assert not Path('/opt/Odin').exists()
    assert not os.environ.get('DISPLAY')
    write_json(root / 'namespace.json', {
        'supervisor': identity(os.getpid()),
        'namespaces': {k: os.readlink('/proc/self/ns/' + k)
                       for k in ('pid', 'mnt', 'user', 'net', 'ipc', 'uts')},
        'devices': sorted(str(p) for p in Path('/dev').rglob('*')),
        'environment': dict(os.environ),
    })
    (root / 'hyprland.conf').write_text('''monitor = ,800x600@60,auto,1
misc {
    disable_hyprland_logo = true
    disable_splash_rendering = true
    force_default_wallpaper = 0
}
animations {
    enabled = false
}
xwayland {
    enabled = false
}
debug {
    disable_logs = false
}
''')
    children = []
    fifo_fd = None

    def launch(args, filename, env=None):
        with (root / filename).open('wb') as output:
            child = subprocess.Popen(args, stdout=output, stderr=subprocess.STDOUT,
                                     env=env, start_new_session=True)
        children.append(child)
        return child

    def await_socket(path, child):
        for _ in range(200):
            if child.poll() is not None:
                raise RuntimeError(f'{path}: child exited {child.returncode}')
            if path.exists() and stat.S_ISSOCK(path.stat().st_mode):
                return
            time.sleep(.1)
        raise RuntimeError(f'timeout waiting for {path}')

    try:
        # Extracted SIGNED distro labwc/wlroots packages, not installed globally.
        # Headless backend and render node only; no protocol-version spoofing.
        (root / 'parent-config').mkdir(exist_ok=True)
        weston = launch(['/proof/parent-packages/extracted/usr/bin/labwc',
                         '--config-dir', '/proof/parent-config', '--debug'],
                        'parent.log', dict(os.environ,
                            LD_LIBRARY_PATH='/proof/parent-packages/extracted/usr/lib',
                            WLR_BACKENDS='headless', WLR_HEADLESS_OUTPUTS='1',
                            WLR_RENDERER='gles2', WLR_RENDER_DRM_DEVICE='/dev/dri/renderD128',
                            WLR_RENDER_NO_EXPLICIT_SYNC='1'))
        await_socket(root / 'runtime/wayland-0', weston)
        env = dict(os.environ, WAYLAND_DISPLAY='wayland-0',
                   AQ_DRM_DEVICES='/dev/nonexistent')
        hypr = launch(['python3', '/proof/hyprland-isolated-lab.py', '--hypr'],
                      'hyprland.log', env)
        await_socket(root / 'runtime/hypr-test', hypr)
        time.sleep(2)
        if hypr.poll() is not None:
            raise RuntimeError(f'Hyprland initialization exited {hypr.returncode}')
        os.mkfifo(root / 'control', 0o600)
        fifo_fd = os.open(root / 'control', os.O_RDWR | os.O_NONBLOCK)
        state = {'weston': identity(weston.pid), 'hyprland': identity(hypr.pid),
                 'wayland_socket': '/proof/runtime/hypr-test',
                 'control': '/proof/control', 'ready': True}
        write_json(root / 'ready.json', state)
        print(json.dumps(state), flush=True)
        ran = False
        pending = b''
        while hypr.poll() is None and weston.poll() is None:
            readable, _, _ = select.select([fifo_fd], [], [], .5)
            if not readable:
                continue
            pending += os.read(fifo_fd, 128)
            if len(pending) > 1024:
                raise RuntimeError('oversized fixed control input')
            while b'\n' in pending:
                action, pending = pending.split(b'\n', 1)
                if action == b'stop':
                    return
                if action != b'proof' or ran:
                    print('refused control action', flush=True)
                    continue
                harness = root / 'harness.py'
                if not harness.is_file() or harness.is_symlink():
                    print('harness.py not installed', flush=True)
                    continue
                ran = True
                proof_env = dict(os.environ, WAYLAND_DISPLAY='hypr-test',
                                 AQ_DRM_DEVICES='/dev/nonexistent')
                instances = list((root / 'runtime/hypr').glob('*'))
                if len(instances) == 1:
                    proof_env['HYPRLAND_INSTANCE_SIGNATURE'] = instances[0].name
                proof = launch(['python3', '/proof/harness.py'], 'harness.log', proof_env)
                write_json(root / 'proof-process.json', identity(proof.pid))
        raise RuntimeError('compositor exited')
    finally:
        (root / 'ready.json').unlink(missing_ok=True)
        if fifo_fd is not None:
            os.close(fifo_fd)
        for child in reversed(children):
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
        for child in reversed(children):
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=5)
        write_json(root / 'cleanup.json', {'children': [
            {'pid': child.pid, 'exit_code': child.returncode} for child in children]})


def launch():
    root = Path.home() / 'odin-hyprland-phase3-proof'
    if root.is_symlink() or Path(__file__).resolve().parent != root:
        raise RuntimeError('launch script must reside in exact private proof directory')
    os.umask(0o077)
    root.chmod(0o700)
    if (root / 'owner.json').exists():
        old_owner = json.loads((root / 'owner.json').read_text())
        try:
            if identity(old_owner['pid']) == old_owner:
                raise RuntimeError('previous owned supervisor still alive')
        except FileNotFoundError:
            pass
    for name in ('home', 'runtime'):
        (root / name).mkdir(mode=0o700, exist_ok=True)
    for name in ('runtime/hypr-test', 'control'):
        candidate = root / name
        if candidate.exists():
            if not (stat.S_ISSOCK(candidate.lstat().st_mode) or
                    stat.S_ISFIFO(candidate.lstat().st_mode)):
                raise RuntimeError('unexpected stale resource type')
            candidate.unlink()
    write_json(root / 'owner.json', identity(os.getpid()))
    command = ['bwrap', '--unshare-all', '--new-session', '--die-with-parent',
               '--clearenv', '--ro-bind', '/usr', '/usr', '--ro-bind', '/etc', '/etc',
               '--ro-bind', '/sys', '/sys',
               '--symlink', 'usr/bin', '/bin', '--symlink', 'usr/bin', '/sbin',
               '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib', '/lib64',
               '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
               '--dir', '/run', '--dir', '/dev/dri',
               '--dev-bind', '/dev/dri/renderD128', '/dev/dri/renderD128',
               '--dev-bind', '/dev/nvidia0', '/dev/nvidia0',
               '--dev-bind', '/dev/nvidiactl', '/dev/nvidiactl',
               '--bind', str(root), '/proof', '--chdir', '/proof']
    whitelist = {'PATH': '/usr/bin', 'HOME': '/proof/home',
                 'XDG_RUNTIME_DIR': '/proof/runtime', 'LANG': 'C.UTF-8',
                 'XDG_SESSION_TYPE': 'wayland', 'XDG_CURRENT_DESKTOP': 'Hyprland',
                 'AQ_DRM_DEVICES': '/dev/nonexistent',
                 '__EGL_VENDOR_LIBRARY_FILENAMES': '/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
                 'GBM_BACKEND': 'nvidia-drm'}
    for key, value in whitelist.items():
        command += ['--setenv', key, value]
    command += ['dbus-run-session', '--', 'python3',
                '/proof/hyprland-isolated-lab.py', '--inside']
    write_json(root / 'launch.json', {'argv': command})
    os.execvp(command[0], command)


if __name__ == '__main__':
    if sys.argv[1:] == ['--inside']:
        inside()
    elif sys.argv[1:] == ['--launch']:
        launch()
    elif sys.argv[1:] == ['--hypr']:
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        listener.bind('/proof/runtime/hypr-test')
        listener.listen(128)
        listener.set_inheritable(True)
        os.execvp('Hyprland', ['Hyprland', '--config', '/proof/hyprland.conf',
                              '--socket', 'hypr-test', '--wayland-fd', str(listener.fileno())])
    else:
        raise SystemExit('Use --launch outside or --inside in owned bubblewrap')
