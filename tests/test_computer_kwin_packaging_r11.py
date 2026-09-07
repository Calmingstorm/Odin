"""KWin companion packaging is opt-in, ABI-pinned, and never desktop-activating."""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def test_main_package_ships_companion_sources_not_universal_abi_binary():
    package = yaml.safe_load((ROOT / "packaging/nfpm.yml").read_text())
    entries = [row for row in package["contents"] if "kwin-scope" in row.get("src", "")]
    assert entries == [{"src": "./assets/kwin-scope", "dst": "/usr/share/odin/kwin-scope",
                        "type": "tree"}]
    assert not any("odin-kwin-scope" in dep for dep in package.get("depends", []))


def test_binary_companion_requires_exact_target_dependency_and_has_no_hooks():
    package = yaml.safe_load((ROOT / "packaging/nfpm-kwin-scope.yml").read_text())
    assert package["depends"] == ["odin", "${KWIN_DEPENDENCY}"]
    assert "scripts" not in package
    binary = package["contents"][0]
    assert binary["src"] == "./build/kwin-scope/odin-scope.so"
    assert binary["dst"] == "${KWIN_PLUGIN_PATH}"
    assert binary["file_info"] == {"owner": "root", "group": "root", "mode": 0o644}
