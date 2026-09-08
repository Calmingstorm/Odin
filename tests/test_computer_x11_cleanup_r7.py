"""Actual private Xvfb native lifecycle, under an exclusive stdlib subreaper."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


def test_private_xvfb_lifetime_and_monitor_loss(tmp_path):
    if not all(shutil.which(name) for name in ("Xvfb", "xauth", "xrandr")):
        pytest.skip("private Xvfb/xauth/xrandr unavailable")
    pytest.importorskip("Xlib")
    root = Path(__file__).resolve().parents[1]
    report = tmp_path / "owned.json"
    supervisor = root / "scripts/computer-feasibility/owned-test-supervisor-r6.py"
    command = [sys.executable, "-B", str(supervisor),
               "--deadline", "35", "--grace", "2", "--report", str(report), "--",
               sys.executable, "-B", "-I", str(root / "tests/fixtures/computer_x11_cleanup_r7.py")]
    env = {"PATH": "/usr/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8",
           "HOME": str(tmp_path), "XAUTHORITY": "/dev/null", "PYTHONDONTWRITEBYTECODE": "1"}
    result = subprocess.run(command, cwd=root, env=env, capture_output=True, text=True, timeout=45)
    assert result.returncode == 0, result.stdout + result.stderr
    owned = json.loads(report.read_text())
    assert owned["completed"] and owned["cleanup_ok"] and owned["census_complete"]
    assert not owned["residuals"] and not owned["signals"]
    data = json.loads(result.stdout.splitlines()[-1])
    assert len(data["trials"]) == 5 and data["receiver_edges"] == 20
    # Sources, successful capture, rejected capture, and retained event watcher.
    assert data["backend"]["capture_workers_reaped"] == 4
    assert data["hardware_dpms_tested"] is False
    print(json.dumps({"native_lifecycle": data, "owned": owned}, sort_keys=True))
