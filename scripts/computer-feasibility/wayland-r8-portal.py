"""R8 production guardian, strict original portal acquisition, real loss cases."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time

spec = importlib.util.spec_from_file_location('r8_portal', '/harness/wayland-portal.py')
portal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portal)


def run_owned_guardian(fd, mapping, mode, revoke=None):
    binary = '/usr/local/bin/wayland-owned-input' + ('-fault-fixture' if mode == 'guardian-loss' else '')
    target = Path('/evidence/guardian-' + mode + '.jsonl')
    controller = None
    with target.open('w') as output, Path(str(target) + '.stderr').open('w') as errors:
        child = subprocess.Popen([binary, str(fd), mapping], stdin=subprocess.PIPE,
                                 stdout=output, stderr=errors, pass_fds=(fd,))
        os.close(fd)
        portal.report('guardian_fd_transferred', guardian_pid=child.pid,
                      sole_ei_owner=True, parent_returned_fd_closed=True)
        def rows():
            return [json.loads(line) for line in target.read_text().splitlines()]
        def wait(predicate, seconds=4):
            deadline = time.monotonic() + seconds
            while not predicate():
                if child.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError('guardian wait failed: ' + str(child.returncode))
                time.sleep(.02)
        try:
            wait(lambda: any(r['event'] == 'ready' for r in rows()))
            if mode == 'guardian-eof':
                controller = subprocess.Popen(['python3', '/harness/wayland-controller-probe.py', str(child.stdin.fileno())], pass_fds=(child.stdin.fileno(),))
                child.stdin.close()
                portal.report('controller_transport_transferred', controller_pid=controller.pid,
                              parent_writer_closed=True, owns_ei_fd=False)
            else:
                child.stdin.write(b'H 42 272 250 250 2000\n'); child.stdin.flush()
            wait(lambda: any(r['event'] == 'held' for r in rows()))
            Path('/tmp/lifecycle-held').touch()
            wait(lambda: Path('/tmp/lifecycle-release-go').exists())
            portal.report('guardian_controller_trigger', mode=mode)
            if mode == 'guardian-revoke':
                revoke()
            elif mode == 'guardian-eof':
                controller.wait(timeout=3)
                assert controller.returncode == 0
                portal.report('controller_process_reaped', pid=controller.pid, code=0)
            elif mode != 'guardian-lease':
                child.stdin.write({'guardian-orderly': b'R\n', 'guardian-cancel': b'C\nH 42 272 250 250 2000\n', 'guardian-loss': b'F\n'}[mode])
                child.stdin.flush()
            child.wait(timeout=4)
            expected = {'guardian-revoke': 3, 'guardian-lease': 2}.get(mode, 0)
            if child.returncode != expected:
                raise RuntimeError(f'guardian {mode} exit {child.returncode}, expected {expected}')
            events = rows()
            assert sum(r['event'] == 'held' for r in events) == 1
            if mode == 'guardian-loss':
                assert any(r['event'] == 'guardian_loss' for r in events)
                assert not any(r['event'] == 'release_sent' for r in events)
            elif mode == 'guardian-revoke':
                assert any(r['event'] == 'unsupported_release' for r in events)
            else:
                assert any(r['event'] == 'release_sent' for r in events)
            portal.report('guardian_exited', mode=mode, code=child.returncode,
                          action_unknown=mode in ('guardian-revoke', 'guardian-lease', 'guardian-loss'),
                          application_release_must_be_measured=True)
        finally:
            if not child.stdin.closed: child.stdin.close()
            if child.poll() is None:
                try: child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    child.terminate()
                    try: child.wait(timeout=2)
                    except subprocess.TimeoutExpired: child.kill(); child.wait()
            if controller and controller.poll() is None:
                controller.terminate(); controller.wait(timeout=3)


portal.run_owned_guardian = run_owned_guardian
if __name__ == '__main__':
    sys.exit(portal.main())
