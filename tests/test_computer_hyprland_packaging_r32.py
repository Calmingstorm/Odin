"""Installation contract in staging only: no compositor, service or real helpers."""
import os
import hashlib
import json
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
    assert "/usr/local/lib/odin/${SCOPE_PLUGIN_FILENAME}" in destinations
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
    digest = hashlib.sha256(b"inert fixture, never execute\n").hexdigest()
    plugin = f"odin-hyprland-scope-{digest}.so"
    (build / plugin).write_text("inert fixture, never execute\n")
    if missing != "build-identity.json":
        (build / "build-identity.json").write_text(json.dumps({
            "companion_build_id": "a" * 64, "plugin_sha256": digest,
            "plugin_filename": plugin,
        }))
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
        assert (stage / "usr/local/lib/odin/odin-hyprland-scope.so").is_symlink()
        installed_plugin = stage / "usr/local/lib/odin" / plugin
        inode = installed_plugin.stat().st_ino
        again = subprocess.run(["sh", str(ROOT / "packaging/install-hyprland-helpers.sh"), str(build)],
                               env={**os.environ, "DESTDIR": str(stage)}, capture_output=True)
        assert again.returncode == 0
        assert installed_plugin.stat().st_ino == inode
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


def test_plugin_build_identity_contract():
    build = (ROOT / "scripts/build-hyprland-input.sh").read_text()
    source = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    assert "-fno-gnu-unique" in build
    assert "-DODIN_SCOPE_BUILD_ID=" in build
    assert '"companion_build_id", std::string(ODIN_SCOPE_BUILD_ID)' in source
    assert "scope-deadline.hpp | sha256sum" in build
    assert '"plugin_sha256"' in build and '"plugin_filename"' in build


@pytest.mark.parametrize("bad", ["digest", "filename", "id", "symlink", "bytes"])
def test_invalid_identity_refused_before_install(tmp_path, bad):
    build, stage = tmp_path / "build", tmp_path / "stage"
    build.mkdir()
    for name in ["odin-hyprland-input", "odin-hyprland-capture", "odin-hyprland-scope.so"]:
        (build / name).write_bytes(b"fixture")
    digest = hashlib.sha256(b"fixture").hexdigest()
    name = f"odin-hyprland-scope-{digest}.so"
    identity = {"companion_build_id": "a" * 64, "plugin_filename": name, "plugin_sha256": digest}
    if bad == "digest":
        identity["plugin_sha256"] = "b" * 64
    elif bad == "filename":
        identity["plugin_filename"] = "../escape.so"
    elif bad == "id":
        identity["companion_build_id"] = "unknown"
    if bad == "symlink":
        (build / name).symlink_to("odin-hyprland-scope.so")
    else:
        (build / name).write_bytes(b"wrong" if bad == "bytes" else b"fixture")
    (build / "build-identity.json").write_text(json.dumps(identity))
    result = subprocess.run(["sh", str(ROOT / "packaging/install-hyprland-helpers.sh"), str(build)],
                            env={**os.environ, "DESTDIR": str(stage), "PYTHONOPTIMIZE": "1"},
                            capture_output=True)
    assert result.returncode == 2
    assert not stage.exists()


def test_guardian_parser_accepts_flat_companion_identity(tmp_path):
    source = (ROOT / "assets/hyprland-input/guardian.c").read_text()
    start = source.index("struct scope_reply {")
    end = source.index("\n}", source.index("static bool parse_reply(", start)) + 2
    harness = '#include <stdbool.h>\n#include <stdint.h>\n#include <string.h>\n#include <stddef.h>\n#include <assert.h>\n'
    harness += source[start:end]
    reply = json.dumps({"ok": True, "armed": False, "keys": 0, "buttons": 0,
                        "rejected": 0, "release_acknowledged": True,
                        "companion_build_id": "a" * 64})
    harness += '\nint main(void) { struct scope_reply r; assert(parse_reply(' + json.dumps(reply) + ', &r)); assert(r.ok && r.release_acknowledged); }\n'
    path = tmp_path / "parser.c"
    path.write_text(harness)
    subprocess.run(["cc", "-std=c11", "-Wall", "-Wextra", "-Werror", str(path), "-o", str(tmp_path / "parser")], check=True)
    subprocess.run([str(tmp_path / "parser")], check=True)
