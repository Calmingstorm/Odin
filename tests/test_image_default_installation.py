"""Image-default install contracts; all writable paths are disposable."""
import os
import subprocess
from pathlib import Path

import pytest
import yaml

from src.setup_wizard import build_config

ROOT = Path(__file__).resolve().parents[1]


def assert_following(text):
    native = yaml.safe_load(text)["image"]["openai"]
    assert "outer_model" not in native
    assert "image_model" not in native
    assert "# outer_model: gpt-6-astra" in text
    assert "# image_model: gpt-image-2.5-flare" in text


def test_source_template_follows_and_preserves_routing():
    text = (ROOT / "config.yml").read_text()
    assert_following(text)
    assert yaml.safe_load(text)["image"] == {"openai": {"enabled": True}}


def test_setup_wizard_does_not_materialize_image_pins():
    for answers in ({}, {"features": {"browser": True}}):
        config = build_config(**answers)
        native = config.get("image", {}).get("openai", {})
        assert "image_model" not in native
        assert "outer_model" not in native


def test_setup_wizard_ignores_removed_comfyui_feature_answer():
    config = build_config(features={"comfyui": True})
    assert "comfyui" not in config


def test_package_maps_source_to_default_not_operator_config():
    rows = yaml.safe_load((ROOT / "packaging/nfpm.yml").read_text())["contents"]
    assert {"src": "./config.yml", "dst": "/opt/odin/config.yml.default"} in rows
    assert not any(row["dst"] == "/etc/odin/config.yml" for row in rows)


def test_release_pins_nfpm_and_requires_disposable_package_smoke():
    workflow = (ROOT / ".github/workflows/release.yml").read_text()
    assert "nfpm_2.46.0_amd64.deb" in workflow
    assert "sha256sum --check --strict" in workflow
    assert "8d50e304492983e4b76b844216e3d2a23dee48e98a9c9ac1e3fafff42bc2f9a9" in workflow
    assert "Mandatory disposable-container package smoke" in workflow
    assert "packaging/smoke-computer-install.sh /tmp/odin.deb headless" in workflow
    assert "ODIN_PACKAGE_SMOKE_DISPOSABLE=yes" in workflow
    smoke_step = workflow.index("Mandatory disposable-container package smoke")
    upload_step = workflow.index("Upload .deb artifact")
    assert smoke_step < upload_step


def exercise_config_install(root, hook, template):
    """Execute the actual bounded config-copy block with sandboxed variables.

    Excludes account, dependency and service hooks deliberately. No text path
    substitution and no host-level postinstall execution are permitted here.
    """
    app = root / "app"
    config = root / "etc"
    app.mkdir()
    config.mkdir()
    (app / "config.yml.default").write_bytes(template)
    (app / "pyproject.toml").write_text('version = "4.5.0"\n')
    block = hook.split("FRESH_INSTALL=false\n", 1)[1]
    block = "FRESH_INSTALL=false\n" + block
    block = block.split('\nif [ ! -f "$CONFIG_DIR/.env" ]; then', 1)[0]
    script = ('set -eu\nSERVICE_USER="$(id -un)"\nSERVICE_GROUP="$(id -gn)"\n'
              'APP_DIR="$1"\nCONFIG_DIR="$2"\n' + block)
    cases = (
        None,
        b"# operator bytes\nimage: {backend: comfyui}\ncomfyui: {enabled: true}\n",
        b"image:\n  openai:\n    image_model: gpt-image-2\n    outer_model: gpt-5.5\n",
    )
    for existing in cases:
        destination = config / "config.yml"
        if existing is None:
            destination.unlink(missing_ok=True)
        else:
            destination.write_bytes(existing)
        expected = template if existing is None else existing
        for _ in range(2):
            subprocess.run(
                ["bash", "-c", script, "postinstall-contract", str(app), str(config)], check=True)
            assert destination.read_bytes() == expected
        proposal = config / "config.yml.new-4.5.0"
        if existing is None or existing == template:
            assert not proposal.exists()
        else:
            assert proposal.read_bytes() == template
            assert proposal.stat().st_mode & 0o777 == 0o600


def test_postinstall_config_contract_enforces_secret_permissions_and_preserves_existing(tmp_path):
    hook = (ROOT / "packaging/postinstall.sh").read_text()
    assert 'chmod 600 "$CONFIG_DIR/config.yml"' in hook
    assert 'chmod 600 "$CONFIG_DIR/.env"' in hook
    assert 'cp "$APP_DIR/config.yml.default" "$CONFIG_DIR/config.yml"' in hook
    assert 'sudo diff -u' in hook
    assert 'The diff is not printed here because config.yml may contain secrets.' in hook
    assert 'config.yml.new-$CONFIG_VERSION' in hook
    assert 'CONFIG_PROPOSAL" ]; then' in hook
    assert "stat -c '%a:%U:%G' \"$CONFIG_DIR/config.yml\"" in hook
    assert 'The diff is not printed here because config.yml may contain secrets.' in hook


def test_config_and_proposal_modes_are_tightened_in_sandbox(tmp_path):
    hook = (ROOT / "packaging/postinstall.sh").read_text()
    permissions = hook.split("# Set ownership and permissions\n", 1)[1]
    permissions = permissions.split("chown root:root /usr/lib/systemd/system/odin.service", 1)[0]
    config_dir = tmp_path / "etc"
    config_dir.mkdir()
    config = config_dir / "config.yml"
    proposal = config_dir / "config.yml.new-4.5.0"
    config.write_text("secret: value\n")
    proposal.write_text("new default\n")
    (config_dir / ".env").write_text("DISCORD_TOKEN=secret\n")
    script = ('set -eu\nSERVICE_USER="$(id -un)"\nSERVICE_GROUP="$(id -gn)"\n'
              'APP_DIR="$1/app"\nDATA_DIR="$1/data"\nLOG_DIR="$1/log"\n'
              'WORKSPACE_DIR="$1/workspace"\nCONFIG_DIR="$1/etc"\n'
              'CONFIG_PROPOSAL="$CONFIG_DIR/config.yml.new-4.5.0"\n' + permissions)
    for name in ("app", "data", "log", "workspace"):
        (tmp_path / name).mkdir()
    subprocess.run(["bash", "-c", script, "postinstall-permissions", str(tmp_path)], check=True)
    assert config.stat().st_mode & 0o777 == 0o600
    assert proposal.stat().st_mode & 0o777 == 0o600
    assert (config_dir / ".env").stat().st_mode & 0o777 == 0o600


def test_source_install_fresh_upgrade_and_repeat(tmp_path):
    exercise_config_install(tmp_path, (ROOT / "packaging/postinstall.sh").read_text(),
                            (ROOT / "config.yml").read_bytes())


@pytest.mark.skipif(
    not os.environ.get("ODIN_IMAGE_DEFAULT_DEB"), reason="requires actual release artifact")
def test_actual_deb_template_and_install_contract(tmp_path):
    package = Path(os.environ["ODIN_IMAGE_DEFAULT_DEB"]).resolve(strict=True)
    payload, control = tmp_path / "payload", tmp_path / "control"
    subprocess.run(["dpkg-deb", "--extract", str(package), str(payload)], check=True)
    subprocess.run(["dpkg-deb", "--control", str(package), str(control)], check=True)
    template = payload / "opt/odin/config.yml.default"
    assert_following(template.read_text())
    assert template.read_bytes() == (ROOT / "config.yml").read_bytes()
    assert not (payload / "etc/odin/config.yml").exists()
    sandbox = tmp_path / "install"
    sandbox.mkdir()
    exercise_config_install(sandbox, (control / "postinst").read_text(), template.read_bytes())
