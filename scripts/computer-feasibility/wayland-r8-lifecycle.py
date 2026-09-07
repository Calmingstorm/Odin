"""R8 binds the strict existing six-case corpus to stock native or nested Mutter."""
import importlib.util
import os
from pathlib import Path
import subprocess
import time
import types


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def consent(label):
    for role, name in [('check box', 'Allow Remote Interaction'), ('push button', 'Share')]:
        result = subprocess.run(['python3', '/harness/wayland-r8-consent.py', role, name],
                                capture_output=True, text=True, timeout=8)
        Path('/evidence/consent-' + label + '-' + role.replace(' ', '-') + '.txt').write_text(result.stdout + result.stderr)
        if result.returncode or 'OPERATOR_UI_ACTION' not in result.stdout or 'True' not in result.stdout:
            raise RuntimeError('genuine consent UI action not observed')
        time.sleep(.5)


def main():
    assert Path('/.dockerenv').exists() and os.environ['HOME'] == '/tmp/home'
    lifecycle = load('r8_lifecycle', '/harness/wayland-lifecycle.py')
    def spawn(args, **kwargs):
        if args[:2] == ['python3', '/harness/wayland-portal.py']:
            args = ['python3', '/harness/wayland-r8-portal.py', *args[2:]]
        return subprocess.Popen(args, **kwargs)
    def run(args, **kwargs):
        if args[:2] == ['python3', '/harness/wayland-operator.py']:
            args = ['python3', '/harness/wayland-r8-consent.py', *args[2:]]
        return subprocess.run(args, **kwargs)
    lifecycle.subprocess = types.SimpleNamespace(Popen=spawn, run=run,
        STDOUT=subprocess.STDOUT, TimeoutExpired=subprocess.TimeoutExpired)
    operator = None
    log = None
    if os.environ['R8_BACKEND'] == 'native-headless':
        subprocess.run(['python3', '/harness/wayland-r8-consent.py', 'escape'], check=True, timeout=8)
        native = load('r8_operator', '/harness/wayland-r8-operator.py')
        log = open('/evidence/operator-native.jsonl', 'w')
        operator = subprocess.Popen(['python3', '/harness/wayland-r8-operator.py'], stdout=log, stderr=subprocess.STDOUT)
        lifecycle.wait_for(lambda: Path('/tmp/r8-operator-consent').exists(), 15)
        time.sleep(1)
        consent('native-operator')
        lifecycle.wait_for(lambda: Path('/tmp/r8-operator.sock').exists(), 15)
        def send(*args):
            native.client(args)
            lifecycle.report('simulated_native_operator', args=args, product_input=False)
        lifecycle.operator = send
    else:
        lifecycle.operator('mousemove', '400', '300', 'click', '1', 'key', 'Escape')
    try:
        lifecycle.operator('key', 'Escape')
        lifecycle.main()
    finally:
        if operator:
            if operator.poll() is None:
                try: native.client(['close'])
                except Exception: pass
                try: operator.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    operator.terminate(); operator.wait(timeout=3)
            log.close()


if __name__ == '__main__':
    main()
