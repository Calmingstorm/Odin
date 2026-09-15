"""Exercise shipped manifest emission without compiling or touching a display."""

import hashlib
import json
import subprocess
from pathlib import Path

import pytest


@pytest.mark.parametrize("change", [None, "companion", "plugin", "guardian", "missing"])
def test_manifest_qualification_requires_exact_recorded_artifacts(tmp_path, change):
    source = Path("scripts/build-hyprland-input.sh").read_text()
    emission = source.split("# A changed source/compiler artifact", 1)[1]
    emission = "# A changed source/compiler artifact" + emission
    root, build = tmp_path / "source", tmp_path / "build"
    records = root / "assets/hyprland-input/runtime-qualified-tuples.txt"
    records.parent.mkdir(parents=True)
    build.mkdir()
    guardian = build / "odin-hyprland-input"
    guardian.write_bytes(b"qualified guardian fixture")
    guardian_hash = hashlib.sha256(guardian.read_bytes()).hexdigest()
    companion_hash, plugin_hash = "a" * 64, "b" * 64
    expected = [companion_hash, plugin_hash, guardian_hash]
    if change in {"companion", "plugin", "guardian"}:
        expected[{"companion": 0, "plugin": 1, "guardian": 2}[change]] = "f" * 64
    if change != "missing":
        records.write_text(" ".join(expected) + "\n")
    program = tmp_path / "emit.sh"
    program.write_text("set -eu\nroot=$1\nbuild=$2\nbuild_id=$3\nplugin_sha=$4\n"
                       "pin=39d7e209c79d451efab1b21151d5938289da838d\n"
                       "plugin_name=odin-hyprland-scope-$plugin_sha.so\n" + emission)
    result = subprocess.run(
        ["sh", str(program), str(root), str(build), companion_hash, plugin_hash],
        capture_output=True, text=True, timeout=5,
    )
    assert result.returncode == 0, result.stderr
    manifest = json.loads((build / "build-identity.json").read_text())
    assert manifest["runtime_qualified"] is (change is None)
    assert manifest["auto_management_approved"] is True
    assert manifest["runtime_qualification_scope"] == "same-boot-retained-original-witness-v1"
    assert manifest["companion_build_id"] == companion_hash
    assert manifest["plugin_sha256"] == plugin_hash
