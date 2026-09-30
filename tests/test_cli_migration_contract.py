"""Explicit command roles and legacy upgrades are a tested package contract."""
import tomllib
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def test_explicit_names_have_matching_roles_without_rewriting_legacy_aliases():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]["scripts"]
    assert project["odin-server"] == project["odin"] == "src.__main__:main"
    assert project["odin-client"] == "src.cli:main"
    package = yaml.safe_load((ROOT / "packaging/nfpm.yml").read_text())
    commands = {
        Path(row["dst"]).name: row["src"] for row in package["contents"]
        if row.get("dst", "").startswith("/usr/local/bin/")
    }
    assert commands["odin-client"] == commands["odin"] == "./scripts/odin-cli.py"
    assert commands["odin-server"] == "./scripts/odin-server"
    guide = (ROOT / "docs/cli.md").read_text()
    assert "`odin-server`" in guide and "`odin-client`" in guide
    assert "installation-dependent legacy alias" in guide
    assert "no package upgrade edits" in guide
