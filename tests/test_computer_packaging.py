"""Package contracts, with no package install or desktop access on the test host."""
import tomllib
from pathlib import Path

import pytest
import yaml

from src.computer.runtime import profile

ROOT = Path(__file__).resolve().parents[1]


def test_headless_dependency_split_and_shipped_helper():
    package = yaml.safe_load((ROOT / "packaging/nfpm.yml").read_text())
    assert set(package["depends"]) == {
        "python3 (>= 3.11)", "python3-venv", "openssh-client", "systemd", "sudo"}
    recommends = set(package["recommends"])
    assert {"xvfb", "bubblewrap (>= 0.8.0)", "xdotool", "openbox", "dbus",
            "python3-xlib", "python3-gi", "drawing", "xed", "inkscape",
            "libreoffice-writer", "gir1.2-atspi-2.0", "gstreamer1.0-pipewire",
            "libei1 (>= 1.3.901)", "libxkbcommon0 (>= 0.5.0)"} <= recommends
    assert {"gnome-shell", "xdg-desktop-portal-gnome"} <= set(package["suggests"])
    assert "gnome-shell" not in recommends
    contents = {row["dst"]: row for row in package["contents"]}
    helper = contents["/usr/libexec/odin-computer-wayland-input"]
    assert helper["src"] == "./build/computer/odin-computer-wayland-input"
    assert helper["file_info"] == {"owner": "root", "group": "root", "mode": 0o755}
    assert contents["/var/lib/odin/computer/"]["file_info"]["mode"] == 0o700
    extension = "/usr/share/gnome-shell/extensions/odin-scope@calmingstorm.net/"
    for name in ("extension.js", "metadata.json"):
        assert (ROOT / contents[extension + name]["src"]).is_file()


def test_wheel_assets_are_explicit_not_incidental():
    metadata = tomllib.loads((ROOT / "pyproject.toml").read_text())
    patterns = metadata["tool"]["setuptools"]["package-data"]["src.computer.runtime"]
    assert "assets/*" in patterns and "assets/services/*" in patterns
    dependencies = metadata["project"]["optional-dependencies"]["computer"]
    assert any(item.startswith("dbus-next") for item in dependencies)


def test_clean_dev_install_includes_computer_contract_test_clients():
    metadata = tomllib.loads((ROOT / "pyproject.toml").read_text())
    extras = metadata["project"]["optional-dependencies"]
    assert set(extras["computer"]) <= set(extras["dev"])


def test_packaging_never_compiles_or_activates_a_desktop_at_install():
    hook = (ROOT / "packaging/postinstall.sh").read_text()
    for command in ("gsettings set", "gnome-extensions enable", "xhost +", "cc -std"):
        assert command not in hook
    build = (ROOT / "packaging/build-computer-helper.sh").read_text()
    assert "assets/wayland_owned_input.c" in build
    assert "--atleast-version=1.3.901" in build
    workflow = (ROOT / ".github/workflows/release.yml").read_text()
    assert workflow.index("Build matching optional computer helper") < workflow.index(
        "Build .deb package")


def test_missing_xed_does_not_disable_installed_drawing(monkeypatch):
    monkeypatch.setattr(profile.os, "access", lambda path, mode: path != "/usr/bin/xed")
    profile.preflight()
    profile.preflight("drawing")
    with pytest.raises(RuntimeError, match="desktop dependencies unavailable: xed"):
        profile.preflight("xed")


def test_missing_common_runtime_still_refused(monkeypatch):
    monkeypatch.setattr(profile.os, "access", lambda path, mode: path != "/usr/bin/bwrap")
    for app in (None, "drawing", "xed"):
        with pytest.raises(RuntimeError, match="desktop dependencies unavailable: bwrap"):
            profile.preflight(app)
    with pytest.raises(ValueError, match="unapproved"):
        profile.preflight("terminal")
