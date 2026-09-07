"""Explicit Wayland targets are restart-pinned; configuration is not consent."""
import pytest

from src.config.schema import ComputerUseConfig


def test_default_off_does_not_discover_desktop():
    config = ComputerUseConfig()
    assert not config.enabled
    assert config.wayland_bus_address == ""
    assert config.wayland_uid is None
    assert config.wayland_guardian_binary == "/usr/libexec/odin-computer-wayland-input"


@pytest.mark.parametrize("address", [
    "tcp:host=localhost,port=1", "unix:abstract=foo", "unix:path=relative",
    "unix:path=/run/user/1000/bus;unix:path=/other", "unix:path=/x,guid=ignored",
    "unix:path=/x\n", "unix:path=/x\0", "unix:path=/" + "x" * 512,
])
def test_only_one_bounded_local_bus_is_valid(address):
    with pytest.raises(ValueError):
        ComputerUseConfig(wayland_bus_address=address)


@pytest.mark.parametrize("uid", [True, -1, 4294967295, "1000", 1.5])
def test_uid_is_explicit_strict_integer(uid):
    with pytest.raises(ValueError):
        ComputerUseConfig(wayland_uid=uid)


@pytest.mark.parametrize("path", ["", "relative", "/x\0", "/x\n", "/x\x7f", "/" + "x" * 4096])
def test_guardian_executable_path_is_bounded(path):
    with pytest.raises(ValueError):
        ComputerUseConfig(wayland_guardian_binary=path)


def test_configuration_carries_no_release_override_or_approval():
    config = ComputerUseConfig(platform="wayland", environment="existing_session",
                               wayland_bus_address="unix:path=/run/user/1000/bus", wayland_uid=1000)
    assert config.display == "" and config.monitor_names == []
    for field in ("release_verified", "skip_probe", "compositor_safe", "consent"):
        with pytest.raises(ValueError):
            ComputerUseConfig(**{field: True})
