"""Full native scope, guardian, injector and event-receiver regression."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize("mode", ["normal", "latency", "stall", "dense"])
@pytest.mark.parametrize("input_mode", ["shared", "independent"])
def test_private_xvfb_long_stroke_delivery(tmp_path, mode, input_mode):
    if not all(shutil.which(x) for x in ("Xvfb", "xauth")):
        pytest.skip("private X11 utilities unavailable")
    pytest.importorskip("Xlib")
    root = Path(__file__).resolve().parents[1]
    report = tmp_path / "owned.json"
    command = [
        sys.executable,
        "-B",
        str(root / "scripts/computer-feasibility/owned-test-supervisor-r6.py"),
        "--deadline",
        "35",
        "--grace",
        "2",
        "--report",
        str(report),
        "--",
        sys.executable,
        "-B",
        "-I",
        str(root / "tests/fixtures/computer_x11_dispatch_r19.py"),
        mode,
        input_mode,
    ]
    result = subprocess.run(
        command,
        cwd=root,
        env={
            "PATH": "/usr/bin",
            "LANG": "C.UTF-8",
            "HOME": str(tmp_path),
            "XAUTHORITY": "/dev/null",
        },
        capture_output=True,
        text=True,
        timeout=45,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    owned = json.loads(report.read_text())
    assert owned["completed"] and owned["cleanup_ok"] and owned["census_complete"]
    assert not owned["signals"] and not owned["residuals"]
    evidence = json.loads(result.stdout.splitlines()[-1])
    assert evidence == {
        "runs": 3 if mode in {"normal", "latency"} else 1,
        "mode": mode,
        "validated": True,
    }
    print(result.stdout)
