"""Harmless Docker-command stubs; no daemon, desktop, or Podman use."""

import importlib.util
import json
import os
import shutil
import signal
import subprocess
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

STUB = r"""#!/usr/bin/python3
import json, os, pathlib, sys, time
root = pathlib.Path(os.environ['STUB_DIR'])
args = sys.argv[1:]
with (root / 'calls').open('a') as f: f.write(json.dumps(args)+'\n')
state = root / 'created'
mode = os.environ.get('STUB_MODE','normal')
if args[0] == 'create':
    state.write_text(args[args.index('--name')+1])
    if mode == 'create-fail': sys.exit(1)
    pathlib.Path(args[args.index('--cidfile')+1]).write_text('abcdef\n')
    print('abcdef')
elif args[:2] == ['container','ls']:
    if mode == 'inventory-fail': sys.exit(1)
    if state.exists(): print('abcdef')
elif args[0] == 'inspect': print('[{"State":{"Running":true}}]')
elif args[0] == 'top': print('PID PPID STAT COMMAND')
elif args[0] == 'start':
    if mode == 'term':
        while not (root/'stopped').exists(): time.sleep(.03)
    elif mode == 'run-fail': sys.exit(25)
elif args[0] == 'stop': (root/'stopped').touch()
elif args[0] == 'rm': state.unlink(missing_ok=True)
else: sys.exit(66)
"""


# Shell orchestration tests must not depend on unrelated concurrent host jobs.
# Actual inventory/error semantics are tested separately in ProcessLedgerTest.
LEDGER_STUB = r"""#!/usr/bin/python3
import json, os, pathlib, sys
args = sys.argv[1:]
if not args or pathlib.Path(args[0]).name != 'wayland-process-ledger.py':
    os.execv('/usr/bin/python3', ['/usr/bin/python3', *args])
mode = args[1]
if mode == 'snapshot':
    pathlib.Path(args[2]).write_text(json.dumps({'complete': True, 'errors': [], 'helpers': []}))
elif mode == 'identities':
    pathlib.Path(args[3]).write_text('[]')
elif mode == 'verify':
    pathlib.Path(args[2], 'host-cleanup.json').write_text(json.dumps({
        'owned_residuals': [], 'new_helpers': [], 'complete': True}))
    if os.environ.get('STUB_MODE') == 'ledger-fail': sys.exit(1)
else: sys.exit(66)
"""


class LabTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="wayland-stub-"))
        self.evidence = self.tmp / ("wayland-stub-" + uuid.uuid4().hex)
        docker = self.tmp / "docker"
        docker.write_text(STUB)
        docker.chmod(0o700)
        python = self.tmp / "python3"
        python.write_text(LEDGER_STUB)
        python.chmod(0o700)
        self.env = {
            **os.environ,
            "PATH": str(self.tmp) + ":" + os.environ["PATH"],
            "STUB_DIR": str(self.tmp),
            "EVIDENCE_ROOT": str(self.tmp),
        }
        self.script = Path(__file__).with_name("wayland-lab.sh")

    def tearDown(self):
        shutil.rmtree(self.tmp)
        if self.evidence.exists():
            shutil.rmtree(self.evidence)

    def command(self):
        return [
            "bash",
            str(self.script),
            "experiment-lifecycle",
            "--parent-authorized-after-contract-correction",
            str(self.evidence),
        ]

    def run_mode(self, mode, code):
        result = subprocess.run(
            self.command(),
            env={**self.env, "STUB_MODE": mode},
            capture_output=True,
            text=True,
            timeout=15,
        )
        self.assertEqual(result.returncode, code, result.stderr)
        return result

    def assert_clean(self):
        self.assertFalse((self.tmp / "created").exists())
        self.assertIn("EXACT_CONTAINER_ABSENT", (self.evidence / "cleanup.log").read_text())
        cleanup = json.loads((self.evidence / "host-cleanup.json").read_text())
        self.assertEqual(cleanup["owned_residuals"], [])
        calls = [json.loads(x) for x in (self.tmp / "calls").read_text().splitlines()]
        self.assertFalse(any("prune" in x or "kill" in x for x in calls))
        create = next(x for x in calls if x[0] == "create")
        self.assertIn("--init", create)
        self.assertIn("--cidfile", create)
        self.assertIn("--memory=1g", create)
        self.assertIn("--pids-limit=128", create)
        for call in calls:
            if call[0] in ("stop", "rm"):
                self.assertEqual(call[-1], "abcdef")

    def test_normal(self):
        self.run_mode("normal", 0)
        self.assert_clean()

    def test_create_committed_then_failed(self):
        self.run_mode("create-fail", 1)
        self.assert_clean()

    def test_runtime_nonzero_preserved(self):
        self.run_mode("run-fail", 25)
        self.assert_clean()

    def test_inventory_verification_failure_overrides_runtime_success(self):
        self.run_mode("ledger-fail", 70)
        self.assert_clean()

    def test_term_reaps_attachment(self):
        p = subprocess.Popen(
            self.command(),
            env={**self.env, "STUB_MODE": "term"},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            end = time.monotonic() + 5
            while not (self.evidence / "attach-client.pid").exists():
                if time.monotonic() > end:
                    self.fail("attachment never started")
                time.sleep(0.02)
            attachment = int((self.evidence / "attach-client.pid").read_text())
            p.send_signal(signal.SIGTERM)
            _out, err = p.communicate(timeout=12)
            self.assertEqual(p.returncode, 143, err)
            self.assertFalse(Path("/proc", str(attachment)).exists())
            self.assert_clean()
        finally:
            if p.poll() is None:
                p.kill()
                p.wait()

    def test_inventory_error_is_not_success(self):
        self.run_mode("inventory-fail", 70)
        self.assertIn("CLEANUP UNKNOWN", (self.evidence / "cleanup.log").read_text())

    def test_no_authority_and_podman_suspended(self):
        for args in (["experiment-lifecycle"], ["prepare"], ["versions"], ["import-docker"]):
            p = subprocess.run(
                ["bash", str(self.script), *args], env=self.env, capture_output=True, timeout=5
            )
            self.assertEqual(p.returncode, 64)
        self.assertFalse((self.tmp / "calls").exists())


class ProcessLedgerTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location(
            "wayland_ledger", Path(__file__).with_name("wayland-process-ledger.py")
        )
        self.ledger = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.ledger)

    def test_permission_error_marks_scan_incomplete(self):
        fake = Path("/proc/999/stat")
        with (
            patch.object(Path, "glob", return_value=[fake]),
            patch.object(Path, "read_text", side_effect=PermissionError),
        ):
            found, errors = self.ledger.processes()
        self.assertEqual(found, {})
        self.assertEqual(errors[0]["error"], "PermissionError")

    def test_vanished_process_race_only_if_directory_absent(self):
        fake = Path("/proc/999/stat")
        for remains in (False, True):
            with (
                patch.object(Path, "glob", return_value=[fake]),
                patch.object(Path, "read_text", side_effect=FileNotFoundError),
                patch.object(Path, "exists", return_value=remains),
            ):
                _, errors = self.ledger.processes()
            self.assertEqual(bool(errors), remains)

    def test_malformed_and_catatonit(self):
        with (
            patch.object(Path, "glob", return_value=[Path("/proc/999/stat")]),
            patch.object(Path, "read_text", return_value="malformed"),
        ):
            _, errors = self.ledger.processes()
        self.assertTrue(errors)
        helper = dict(comm="catatonit", state="S")
        self.assertEqual(self.ledger.helpers({999: helper}), [helper])


if __name__ == "__main__":
    unittest.main()
