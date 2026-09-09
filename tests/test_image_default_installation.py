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
    assert yaml.safe_load(text)["image"] == {
        "backend": "auto", "openai": {"enabled": True}}


def test_setup_wizard_does_not_materialize_image_pins():
    for answers in ({}, {"features": {"comfyui": True, "browser": True}}):
        config = build_config(**answers)
        native = config.get("image", {}).get("openai", {})
        assert "image_model" not in native
        assert "outer_model" not in native


def test_package_maps_source_to_default_not_operator_config():
    rows = yaml.safe_load((ROOT / "packaging/nfpm.yml").read_text())["contents"]
    assert {"src": "./config.yml", "dst": "/opt/odin/config.yml.default"} in rows
    assert not any(row["dst"] == "/etc/odin/config.yml" for row in rows)


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
    block = hook.split("# Install config templates (preserve existing on upgrade)\n", 1)[1]
    block = block.split('\nif [ ! -f "$CONFIG_DIR/.env" ]; then', 1)[0]
    script = 'set -eu\nAPP_DIR="$1"\nCONFIG_DIR="$2"\n' + block
    cases = (
        None,
        b"# operator bytes\nimage: {backend: comfyui}\n",
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
