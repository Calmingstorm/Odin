"""Regression tests for shipped install manifests and executable contracts."""
from __future__ import annotations

import json
import os
import subprocess
import tomllib
from pathlib import Path

ROOT = Path(__file__).parents[1]


def test_wheel_declares_import_time_model_catalogue_resource():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())
    assert "model_hints_seed.json" in project["tool"]["setuptools"]["package-data"]["src.tools"]
    assert (ROOT / "src/tools/model_hints_seed.json").is_file()


def test_official_python_install_paths_include_browser_dependency():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())
    assert "playwright" in project["project"]["optional-dependencies"]["browser"][0]
    assert "browser" in (ROOT / "Dockerfile").read_text()
    assert "browser" in (ROOT / "packaging/postinstall.sh").read_text()
    incus = (ROOT / "scripts/incus-deploy.sh").read_text()
    assert "ui\" \"$INSTANCE/app/" in incus
    assert "[pdf,browser]" in incus


def test_packaged_cli_names_are_distinct_and_scripts_exist():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())
    scripts = project["project"]["scripts"]
    assert scripts["odin"] == scripts["odin-client"]
    assert scripts["odin-server"] != scripts["odin-client"]
    package = (ROOT / "packaging/nfpm.yml").read_text()
    assert "dst: /usr/local/bin/odin\n" in package
    assert "/usr/local/bin/odin-client" in package
    assert "/usr/local/bin/odin-server" in package
    assert (ROOT / "scripts/odin-server").is_file()


def test_compose_persists_config_as_directory_and_has_no_removed_voice_tree():
    compose = (ROOT / "docker-compose.yml").read_text()
    assert "./config:/app/config" in compose
    assert "./config.yml:/app/config.yml:ro" in compose
    assert ":ro" not in next(line for line in compose.splitlines() if "./config:" in line)
    assert "voice-service" not in compose
    assert "docker-compose-entrypoint.sh" in compose


def test_compose_legacy_config_migrates_once_without_overwriting_existing(tmp_path):
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    legacy = tmp_path / "config.yml"
    legacy.write_text("web:\n  port: 3001\n")
    bindir = tmp_path / "bin"
    bindir.mkdir()
    python = bindir / "python"
    python.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
    python.chmod(0o755)
    env = os.environ | {
        "ODIN_COMPOSE_CONFIG_DIR": str(config_dir),
        "ODIN_COMPOSE_LEGACY_CONFIG": str(legacy),
        "PATH": f"{bindir}:{os.environ['PATH']}",
    }
    script = ROOT / "scripts/docker-compose-entrypoint.sh"
    first = subprocess.run(["sh", str(script)], env=env, text=True, capture_output=True, check=True)
    target = config_dir / "config.yml"
    assert target.read_text() == legacy.read_text()
    assert first.stdout.splitlines()[-3:] == ["-m", "src", str(target)]
    target.write_text("operator edit\n")
    subprocess.run(["sh", str(script)], env=env, text=True, capture_output=True, check=True)
    assert target.read_text() == "operator edit\n"


def test_ui_guards_are_required_by_aggregate_check_and_workflow():
    package = json.loads((ROOT / "package.json").read_text())
    check = package["scripts"]["check"]
    for name in ("check:setup-ui", "check:computer", "check:schedule-availability"):
        assert f"npm run {name}" in check
        assert name in package["scripts"]
    workflow = (ROOT / ".github/workflows/ui.yml").read_text()
    assert "npm run check" in workflow
