"""Subreaped native Xvfb evidence for the three R11 safety defects."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


def test_private_xvfb_native_safety_r11(tmp_path):
    if not all(shutil.which(x) for x in ("Xvfb", "xauth", "xinput", "setxkbmap")):
        pytest.skip("private X11 utilities unavailable")
    pytest.importorskip("Xlib")
    root = Path(__file__).resolve().parents[1]
    report = tmp_path / "owned-native-r11.json"
    supervisor = root / "scripts/computer-feasibility/owned-test-supervisor-r6.py"
    command = [sys.executable, "-B", str(supervisor),
        "--deadline", "40", "--grace", "2", "--report", str(report), "--", sys.executable,
        "-B", "-I", str(root / "tests/fixtures/computer_x11_native_safety_r11.py")]
    env = {"PATH": "/usr/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "HOME": str(tmp_path),
           "XAUTHORITY": "/dev/null", "PYTHONDONTWRITEBYTECODE": "1"}
    result = subprocess.run(command, cwd=root, env=env, capture_output=True, text=True, timeout=50)
    assert result.returncode == 0, result.stdout + result.stderr
    owned = json.loads(report.read_text())
    assert owned["completed"] and owned["cleanup_ok"] and owned["census_complete"]
    assert not owned["signals"] and not owned["residuals"]
    evidence = json.loads(result.stdout.splitlines()[-1])
    assert evidence["matching_edges"]
    assert evidence["mismatch_reason"] == "injected_keyboard_mapping_mismatch"
    assert evidence["grab_key_edges"] == [] and evidence["helper_reaped"]
    assert evidence["owned_release_state_empty"] and evidence["disabled_master_reason"]
    print(json.dumps({"native_safety": evidence, "owned": owned}, sort_keys=True))
