# ruff: noqa: E501
import os
import socket
from types import SimpleNamespace

import pytest

import src.computer.runtime.hyprland_discovery as discovery
from src.computer.integration import ComputerIntegration
from src.computer.manager import ComputerLifecycle
from src.computer.runtime.hyprland_discovery import (
    HyprlandCandidateHint,
    HyprlandDiscoveryError,
    HyprlandDiscoveryPolicy,
    HyprlandDiscoveryResolver,
    runtime_inventory,
    stable_runtime_root,
)
from src.computer.runtime.hyprland_identity import ExecutableTrust, HyprlandIdentityError
from src.config.schema import ComputerUseConfig


def config(**updates):
    return ComputerUseConfig(
        **{
            "enabled": True,
            "platform": "wayland",
            "environment": "existing_session",
            "wayland_backend": "hyprland",
            "wayland_uid": 1000,
            "hyprland_discovery_mode": "auto",
            "hyprland_output_name": "DP-1",
            "hyprland_compositor_executable": "/usr/bin/Hyprland",
            "hyprland_compositor_sha256": "a" * 64,
            "hyprland_compositor_version": "0.54.2",
            "hyprland_compositor_commit": "b" * 40,
            **updates,
        }
    )


def test_auto_integration_constructs_unresolved_backend_without_desktop_io():
    s = config()
    integration = ComputerIntegration(
        SimpleNamespace(config=SimpleNamespace(computer=s)), controller=object(), settings=s
    )
    backend = integration._backend()
    assert backend.config.discovery_mode == "auto"
    assert backend.config.runtime_dir == "/run/user/1000"
    assert backend.config.compositor_pid is None
    assert backend.config.wayland_display == backend.config.instance_signature == ""


def test_pinned_and_x11_do_not_require_auto_fields():
    pinned = config(
        hyprland_discovery_mode="pinned",
        hyprland_runtime_dir="/run/user/1000",
        hyprland_wayland_display="wayland-1",
        hyprland_instance_signature="sig",
        hyprland_compositor_pid=12,
    )
    x11 = ComputerUseConfig(
        enabled=True,
        platform="x11",
        environment="existing_session",
        display=":1",
        monitor_names=["DP-1"],
    )
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
    hints = [
        HyprlandCandidateHint(10, policy.runtime_dir, "wayland-1", "one"),
        HyprlandCandidateHint(11, policy.runtime_dir, "wayland-2", "two"),
    ]
    closed, checked = [], []

    class Connection:
        def close(self):
            closed.append(True)

    async def pin(**kwargs):
        checked.append(kwargs["expected_pid"])
        if kwargs["expected_pid"] == 10:
            raise OSError()
        return SimpleNamespace(process=SimpleNamespace(pid=11)), Connection()

    resolved = await HyprlandDiscoveryResolver(
        policy, inventory=lambda *_: hints, pin=pin
    ).resolve()
    assert (resolved.pid, checked, closed) == (11, [10, 11], [True])


async def test_resolver_reports_typed_failure():
    trust = ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40)
    resolver = HyprlandDiscoveryResolver(
        HyprlandDiscoveryPolicy(1000, "/run/user/1000", trust), inventory=lambda *_: []
    )
    with pytest.raises(HyprlandDiscoveryError, match="hyprland_discovery_not_found"):
        await resolver.resolve()


@pytest.mark.parametrize(
    "kwargs",
    [
        {"expected_uid": -1},
        {"runtime_dir": "relative"},
        {"runtime_dir": "/run/user/1000/../x"},
        {"max_candidates": 0},
        {"timeout_seconds": 0},
        {"timeout_seconds": True},
    ],
)
def test_policy_rejects_untrusted_shapes(kwargs):
    values = dict(
        expected_uid=1000,
        runtime_dir="/run/user/1000",
        trust=ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40),
    )
    values.update(kwargs)
    with pytest.raises(HyprlandDiscoveryError, match="policy_invalid"):
        HyprlandDiscoveryPolicy(**values)


def test_runtime_root_and_inventory_fail_closed(monkeypatch):
    monkeypatch.setattr(discovery, "_trusted_dir", lambda *_: (_ for _ in ()).throw(OSError()))
    with pytest.raises(HyprlandDiscoveryError, match="runtime_unavailable"):
        stable_runtime_root(1000)
    policy = HyprlandDiscoveryPolicy(
        1000,
        "/not-the-real-root",
        ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40),
    )
    monkeypatch.setattr(discovery, "stable_runtime_root", lambda _uid: "/run/user/1000")
    assert runtime_inventory(policy, discovery.time.monotonic() + 1) == ()


@pytest.mark.asyncio
async def test_resolver_rejects_invalid_duplicate_and_ambiguous_hints():
    trust = ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40)
    policy = HyprlandDiscoveryPolicy(1000, "/run/user/1000", trust)
    bad = [HyprlandCandidateHint(1, policy.runtime_dir, "wayland-1", "x")]
    with pytest.raises(HyprlandDiscoveryError, match="hint_invalid"):
        await HyprlandDiscoveryResolver(policy, inventory=lambda *_: bad).resolve()
    hint = HyprlandCandidateHint(10, policy.runtime_dir, "wayland-1", "x")

    async def pin_once(**_):
        return SimpleNamespace(process=SimpleNamespace(pid=10)), SimpleNamespace(close=lambda: None)

    with pytest.raises(HyprlandDiscoveryError, match="hint_invalid"):
        await HyprlandDiscoveryResolver(
            policy, inventory=lambda *_: [hint, hint], pin=pin_once
        ).resolve()

    async def pin(**_):
        return SimpleNamespace(process=SimpleNamespace(pid=10)), SimpleNamespace(close=lambda: None)

    with pytest.raises(HyprlandDiscoveryError, match="ambiguous"):
        await HyprlandDiscoveryResolver(
            policy,
            inventory=lambda *_: [
                hint,
                HyprlandCandidateHint(11, policy.runtime_dir, "wayland-2", "y"),
            ],
            pin=pin,
        ).resolve()


@pytest.mark.asyncio
async def test_resolver_maps_identity_deadline():
    trust = ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40)
    policy = HyprlandDiscoveryPolicy(1000, "/run/user/1000", trust)
    hint = HyprlandCandidateHint(10, policy.runtime_dir, "wayland-1", "x")

    async def pin(**_):
        raise HyprlandIdentityError("hyprland_identity_deadline")

    with pytest.raises(HyprlandDiscoveryError, match="deadline"):
        await HyprlandDiscoveryResolver(policy, inventory=lambda *_: [hint], pin=pin).resolve()


def test_runtime_inventory_enumerates_real_unix_sockets_with_narrow_fake_proc(
    tmp_path, monkeypatch
):
    """Keep runtime artifacts real; only the otherwise hard-coded /proc is remapped."""
    uid = os.getuid()
    root = tmp_path / "runtime"
    root.mkdir(mode=0o700)
    display_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    display_socket.bind(str(root / "wayland-9"))
    hypr_socket_dir = root / "hypr" / "signature"
    hypr_socket_dir.mkdir(parents=True, mode=0o700)
    ipc_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    ipc_socket.bind(str(hypr_socket_dir / ".socket.sock"))
    proc = tmp_path / "proc"
    (proc / "42").mkdir(parents=True)
    real_scandir = discovery.os.scandir
    real_readlink = discovery.os.readlink

    def scandir(path):
        return real_scandir(proc if str(path) == "/proc" else path)

    def readlink(path):
        if str(path) == "/proc/42/exe":
            return "/usr/bin/Hyprland"
        return real_readlink(path)

    monkeypatch.setattr(discovery, "stable_runtime_root", lambda _uid: str(root))
    monkeypatch.setattr(discovery.os, "scandir", scandir)
    monkeypatch.setattr(discovery.os, "readlink", readlink)
    policy = HyprlandDiscoveryPolicy(
        uid, str(root), ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40)
    )
    try:
        assert runtime_inventory(policy, discovery.time.monotonic() + 1) == (
            HyprlandCandidateHint(42, str(root), "wayland-9", "signature"),
        )
    finally:
        display_socket.close()
        ipc_socket.close()


def test_runtime_inventory_fails_closed_for_deadline_and_socket_permissions(tmp_path, monkeypatch):
    uid = os.getuid()
    root = tmp_path / "runtime"
    root.mkdir(mode=0o700)
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    listener.bind(str(root / "wayland-9"))
    os.chmod(root / "wayland-9", 0o777)
    monkeypatch.setattr(discovery, "stable_runtime_root", lambda _uid: str(root))
    policy = HyprlandDiscoveryPolicy(
        uid, str(root), ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40)
    )
    try:
        assert runtime_inventory(policy, discovery.time.monotonic() + 1) == ()
        with pytest.raises(HyprlandDiscoveryError, match="deadline"):
            runtime_inventory(policy, discovery.time.monotonic() - 1)
    finally:
        listener.close()


def test_runtime_inventory_rejects_candidate_overflow_and_unavailable_scans(tmp_path, monkeypatch):
    uid = os.getuid()
    root = tmp_path / "runtime"
    root.mkdir(mode=0o700)
    listeners = []
    for number in range(2):
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        listener.bind(str(root / f"wayland-{number}"))
        listeners.append(listener)
    monkeypatch.setattr(discovery, "stable_runtime_root", lambda _uid: str(root))
    policy = HyprlandDiscoveryPolicy(
        uid,
        str(root),
        ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40),
        max_candidates=1,
    )
    try:
        with pytest.raises(HyprlandDiscoveryError, match="candidate_limit"):
            runtime_inventory(policy, discovery.time.monotonic() + 1)
        monkeypatch.setattr(discovery.os, "scandir", lambda _path: (_ for _ in ()).throw(OSError()))
        assert runtime_inventory(policy, discovery.time.monotonic() + 1) == ()
    finally:
        for listener in listeners:
            listener.close()


@pytest.mark.asyncio
async def test_resolver_maps_inventory_timeout_and_unavailable_errors():
    trust = ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40)
    policy = HyprlandDiscoveryPolicy(1000, "/run/user/1000", trust, timeout_seconds=0.01)

    async def slow_inventory(*_args):
        await __import__("asyncio").sleep(0.02)
        return []

    with pytest.raises(HyprlandDiscoveryError, match="deadline"):
        await HyprlandDiscoveryResolver(policy, inventory=slow_inventory).resolve()
    with pytest.raises(HyprlandDiscoveryError, match="unavailable"):
        await HyprlandDiscoveryResolver(policy, inventory=lambda *_: object()).resolve()
