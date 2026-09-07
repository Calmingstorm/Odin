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


async def test_wayland_enable_is_not_blanket_refused_and_does_not_probe(tmp_path):
    from tests.test_computer_lifecycle_r5 import fake_factory, owner

    _bot, manager = owner(tmp_path, factory=fake_factory, platform="wayland",
                          environment="existing_session",
                          wayland_bus_address="unix:path=/run/user/1000/bus", wayland_uid=1000)
    try:
        await manager.set_enabled(True)
        assert manager.enabled
        assert manager.snapshot()["backend"]["input_supported"] is None
    finally:
        await manager.close()


async def test_wayland_identity_configuration_is_restart_pinned(tmp_path):
    from tests.test_computer_lifecycle_r5 import fake_factory, owner

    bot, manager = owner(tmp_path, factory=fake_factory, platform="wayland",
                         environment="existing_session",
                         wayland_bus_address="unix:path=/run/user/1000/bus", wayland_uid=1000)
    bot.config.computer.wayland_uid = 1001
    bot.config.computer.wayland_bus_address = "unix:path=/run/user/1001/bus"
    try:
        await manager.set_enabled(True)
        assert manager.settings.wayland_uid == 1000
        assert manager.snapshot()["restart_required"] == ["wayland_bus_address", "wayland_uid"]
    finally:
        await manager.close()


def test_real_composition_selects_portal_backend_and_actual_qualifier(tmp_path):
    from types import SimpleNamespace

    from src.computer.integration import ComputerIntegration
    from src.computer.runtime.wayland_backend import WaylandRuntimeBackend
    from src.computer.runtime.wayland_probe import SameStackQualifier
    from src.config.schema import Config

    settings = ComputerUseConfig(
        enabled=True, platform="wayland", environment="existing_session",
        wayland_bus_address="unix:path=/run/user/1000/bus", wayland_uid=1000)
    facade = ComputerIntegration(SimpleNamespace(config=Config(
        discord={"token": "fixture"}, computer=settings)), controller=object(), settings=settings)
    selected = facade._backend(None)
    assert type(selected) is WaylandRuntimeBackend
    assert type(selected._qualify) is SameStackQualifier
    assert selected.config.expected_uid == 1000
    assert selected.config.bus_address == settings.wayland_bus_address
    assert selected.input_supported is False
    assert selected._portal is None and selected._guardian is None


@pytest.mark.parametrize("app", [None, "xed", "drawing", "writer", "calc", "draw",
                                 "libreoffice", "user-local-application"])
def test_attached_wayland_does_not_gate_application_profiles(app):
    from src.computer.app_profiles import application_profile, validate_profile

    assert application_profile(app, platform="wayland", environment="existing_session") is None
    assert validate_profile(app, platform="wayland", environment="existing_session") is None
