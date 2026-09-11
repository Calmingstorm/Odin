# ruff: noqa: E501
from types import SimpleNamespace

import pytest

from src.computer.integration import ComputerIntegration
from src.computer.manager import ComputerLifecycle
from src.computer.runtime.hyprland_discovery import (
    HyprlandCandidateHint,
    HyprlandDiscoveryError,
    HyprlandDiscoveryPolicy,
    HyprlandDiscoveryResolver,
)
from src.computer.runtime.hyprland_identity import ExecutableTrust
from src.config.schema import ComputerUseConfig


def config(**updates):
    return ComputerUseConfig(**{
        "enabled": True, "platform": "wayland", "environment": "existing_session",
        "wayland_backend": "hyprland", "wayland_uid": 1000,
        "hyprland_discovery_mode": "auto", "hyprland_output_name": "DP-1",
        "hyprland_compositor_executable": "/usr/bin/Hyprland",
        "hyprland_compositor_sha256": "a" * 64, "hyprland_compositor_version": "0.54.2",
        "hyprland_compositor_commit": "b" * 40, **updates,
    })


def test_auto_integration_constructs_unresolved_backend_without_desktop_io():
    s = config()
    integration = ComputerIntegration(SimpleNamespace(config=SimpleNamespace(computer=s)),
                                      controller=object(), settings=s)
    backend = integration._backend()
    assert backend.config.discovery_mode == "auto"
    assert backend.config.runtime_dir == "/run/user/1000"
    assert backend.config.compositor_pid is None
    assert backend.config.wayland_display == backend.config.instance_signature == ""


def test_pinned_and_x11_do_not_require_auto_fields():
    pinned = config(hyprland_discovery_mode="pinned", hyprland_runtime_dir="/run/user/1000",
                    hyprland_wayland_display="wayland-1", hyprland_instance_signature="sig",
                    hyprland_compositor_pid=12)
    x11 = ComputerUseConfig(enabled=True, platform="x11", environment="existing_session",
                            display=":1", monitor_names=["DP-1"])
    assert pinned.hyprland_discovery_mode == "pinned"
    assert x11.platform == "x11"


def test_manager_auto_readiness_does_not_demand_legacy_coordinates(monkeypatch, tmp_path):
    s = config(storage_dir=str(tmp_path))
    bot = SimpleNamespace(config=SimpleNamespace(computer=s), skill_manager=None, mcp_manager=None)
    lifecycle = ComputerLifecycle(bot, factory=lambda *_args, **_kwargs: "constructed")
    monkeypatch.setattr("src.computer.manager.provision_storage", lambda _settings: tmp_path)
    assert lifecycle._construct() == "constructed"


async def test_resolver_validates_all_candidates_before_choose_and_closes_connections():
    trust = ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40)
    policy = HyprlandDiscoveryPolicy(1000, "/run/user/1000", trust)
    hints = [HyprlandCandidateHint(10, policy.runtime_dir, "wayland-1", "one"),
             HyprlandCandidateHint(11, policy.runtime_dir, "wayland-2", "two")]
    closed, checked = [], []
    class Connection:
        def close(self):
            closed.append(True)
    async def pin(**kwargs):
        checked.append(kwargs["expected_pid"])
        if kwargs["expected_pid"] == 10:
            raise OSError()
        return SimpleNamespace(process=SimpleNamespace(pid=11)), Connection()
    resolved = await HyprlandDiscoveryResolver(policy, inventory=lambda *_: hints, pin=pin).resolve()
    assert (resolved.pid, checked, closed) == (11, [10, 11], [True])


async def test_resolver_reports_typed_failure():
    trust = ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40)
    resolver = HyprlandDiscoveryResolver(HyprlandDiscoveryPolicy(1000, "/run/user/1000", trust),
                                         inventory=lambda *_: [])
    with pytest.raises(HyprlandDiscoveryError, match="hyprland_discovery_not_found"):
        await resolver.resolve()
