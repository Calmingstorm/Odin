"""Installation contract in staging only: no compositor, service or real helpers."""
import os
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]


def test_optional_package_no_activation_or_headless_dependency():
    optional = yaml.safe_load((ROOT / "packaging/nfpm-hyprland.yml").read_text())
    base = yaml.safe_load((ROOT / "packaging/nfpm.yml").read_text())
    assert "scripts" not in optional
    assert "${HYPRLAND_DEPENDENCY}" in optional["depends"]
    assert "hyprland" not in str(base.get("depends", [])).lower()
    destinations = {item["dst"] for item in optional["contents"]}
    assert "/usr/local/lib/odin/odin-hyprland-scope.so" in destinations
    assert "/usr/local/libexec/odin-hyprland-input" in destinations
    assert "/usr/local/libexec/odin-hyprland-capture" in destinations


@pytest.mark.parametrize("missing", [None, "odin-hyprland-input", "build-identity.json"])
def test_staged_source_install_does_not_activate(tmp_path, missing):
    build, stage = tmp_path / "build", tmp_path / "stage"
    build.mkdir()
    names = ["odin-hyprland-input", "odin-hyprland-capture", "odin-hyprland-scope.so",
             "build-identity.json"]
    for name in names:
        if name != missing:
            (build / name).write_text("inert fixture, never execute\n")
    result = subprocess.run(["sh", str(ROOT / "packaging/install-hyprland-helpers.sh"), str(build)],
                            env={**os.environ, "DESTDIR": str(stage)},
                            capture_output=True, text=True)
    if missing:
        assert result.returncode == 2
        assert not stage.exists()
    else:
        assert result.returncode == 0, result.stderr
        for name in names[:2]:
            installed = stage / "usr/local/libexec" / name
            assert installed.read_bytes() == (build / name).read_bytes()
            assert installed.stat().st_mode & 0o777 == 0o755
        assert (stage / "usr/local/lib/odin/odin-hyprland-scope.so").stat().st_mode & 0o777 == 0o644
        assert "Explicit operator plugin setup" in result.stdout
    script = (ROOT / "packaging/install-hyprland-helpers.sh").read_text()
    assert "hyprctl" not in script and "systemctl" not in script
    assert "hyprland.conf" not in script


def test_operator_docs_keep_native_residual_and_recovery_boundaries():
    text = (ROOT / "docs/computer-use/HYPRLAND-OPERATOR-R32.md").read_text()
    for phrase in ["SIGKILL", "same-button", "receiver_release_verified: false",
                   "--release-all", "--sha256", "hyprctl plugin load", "exact target Hyprland",
                   "No activation hook", "config-protected", "250ms"]:
        assert phrase in text
