# ruff: noqa: E501
import os
import socket
import tempfile
from contextlib import ExitStack, contextmanager
from pathlib import Path
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


def test_new_defaults_discover_reboot_identifiers_and_manage_plugin():
    defaults = ComputerUseConfig()
    assert defaults.hyprland_discovery_mode == "auto"
    assert defaults.hyprland_managed_activation is True
    assert defaults.hyprland_plugin_manifest == (
        "/usr/local/share/doc/odin-hyprland/build-identity.json"
    )
    settings = config(hyprland_compositor_pid=1369,
                      hyprland_instance_signature="stale", hyprland_wayland_display="old")
    integration = ComputerIntegration(
        SimpleNamespace(config=SimpleNamespace(computer=settings)),
        controller=object(), settings=settings,
    )
    backend = integration._backend()
    assert backend.config.compositor_pid is None
    assert backend.config.instance_signature == backend.config.wayland_display == ""
    assert backend.config.managed_activation is True
    assert backend.config.plugin_manifest_path == defaults.hyprland_plugin_manifest


def test_explicit_manual_activation_optout_survives_config_roundtrip():
    settings = config(hyprland_discovery_mode="pinned", hyprland_managed_activation=False)
    restored = ComputerUseConfig.model_validate(settings.model_dump())
    assert restored.hyprland_discovery_mode == "pinned"
    assert restored.hyprland_managed_activation is False


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


@pytest.fixture
def runtime_sockets():
    # Linux pathname sockets have a 108-byte sun_path, including the terminator.
    # Neither pytest's basetemp/worker paths nor TMPDIR have a bounded length.
    with ExitStack() as stack:
        root = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="hdi-", dir="/tmp")))
        root.chmod(0o700)

        def bind(relative_path):
            path = root / relative_path
            listener = stack.enter_context(socket.socket(socket.AF_UNIX, socket.SOCK_STREAM))
            listener.bind(str(path))
            # Set fixture permissions explicitly; do not change process-global umask.
            path.chmod(0o600)
            return listener

        yield root, bind


@pytest.mark.parametrize("stale_first", [True, False])
@pytest.mark.parametrize("stale_kind", ["missing", "file", "symlink", "unsafe_socket", "unsafe_dir", "inaccessible"])
def test_runtime_inventory_enumerates_real_unix_sockets_with_narrow_fake_proc(
    tmp_path, runtime_sockets, monkeypatch, stale_first, stale_kind
):
    """Keep runtime artifacts real; only the otherwise hard-coded /proc is remapped."""
    uid = os.getuid()
    root, bind = runtime_sockets
    bind("wayland-9")
    (root / "hypr").mkdir(mode=0o700)
    (root / "hypr").chmod(0o700)
    hypr_socket_dir = root / "hypr" / "signature"
    hypr_socket_dir.mkdir(mode=0o700)
    hypr_socket_dir.chmod(0o700)
    bind("hypr/signature/.socket.sock")
    stale_dir = root / "hypr" / "stale"
    stale_dir.mkdir(mode=0o700)
    stale_dir.chmod(0o700)
    stale_socket = stale_dir / ".socket.sock"
    if stale_kind == "file":
        stale_socket.touch(mode=0o600)
    elif stale_kind == "symlink":
        stale_socket.symlink_to(hypr_socket_dir / ".socket.sock")
    elif stale_kind in {"unsafe_socket", "unsafe_dir"}:
        bind("hypr/stale/.socket.sock")
        (stale_socket if stale_kind == "unsafe_socket" else stale_dir).chmod(0o777)
    proc = tmp_path / "proc"
    (proc / "42").mkdir(parents=True)
    real_scandir = discovery.os.scandir
    real_readlink = discovery.os.readlink
    real_stat = discovery.os.stat

    @contextmanager
    def scandir(path):
        with real_scandir(proc if str(path) == "/proc" else path) as entries:
            if str(path) == str(root / "hypr"):
                # Real DirEntry objects and real missing sockets, with both
                # orders guaranteed independently of filesystem enumeration.
                yield iter(sorted(entries, key=lambda entry: entry.name == "stale", reverse=stale_first))
            else:
                yield entries

    def checked_stat(path, *args, **kwargs):
        if stale_kind == "inaccessible" and str(path) == str(stale_socket):
            raise PermissionError("candidate cannot be inspected")
        return real_stat(path, *args, **kwargs)

    def readlink(path):
        if str(path) == "/proc/42/exe":
            return "/usr/bin/Hyprland"
        return real_readlink(path)

    monkeypatch.setattr(discovery, "stable_runtime_root", lambda _uid: str(root))
    monkeypatch.setattr(discovery.os, "scandir", scandir)
    monkeypatch.setattr(discovery.os, "readlink", readlink)
    monkeypatch.setattr(discovery.os, "stat", checked_stat)
    policy = HyprlandDiscoveryPolicy(
        uid, str(root), ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40)
    )
    expected = () if stale_kind == "inaccessible" else (
        HyprlandCandidateHint(42, str(root), "wayland-9", "signature"),
    )
    assert runtime_inventory(policy, discovery.time.monotonic() + 1) == expected


def test_runtime_inventory_fails_closed_for_deadline_and_socket_permissions(runtime_sockets, monkeypatch):
    uid = os.getuid()
    root, bind = runtime_sockets
    bind("wayland-9")
    os.chmod(root / "wayland-9", 0o777)
    monkeypatch.setattr(discovery, "stable_runtime_root", lambda _uid: str(root))
    policy = HyprlandDiscoveryPolicy(
        uid, str(root), ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40)
    )
    assert runtime_inventory(policy, discovery.time.monotonic() + 1) == ()
    with pytest.raises(HyprlandDiscoveryError, match="deadline"):
        runtime_inventory(policy, discovery.time.monotonic() - 1)


def test_runtime_inventory_rejects_candidate_overflow_and_unavailable_scans(runtime_sockets, monkeypatch):
    uid = os.getuid()
    root, bind = runtime_sockets
    for number in range(2):
        bind(f"wayland-{number}")
    monkeypatch.setattr(discovery, "stable_runtime_root", lambda _uid: str(root))
    policy = HyprlandDiscoveryPolicy(
        uid,
        str(root),
        ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40),
        max_candidates=1,
    )
    with pytest.raises(HyprlandDiscoveryError, match="candidate_limit"):
        runtime_inventory(policy, discovery.time.monotonic() + 1)
    with monkeypatch.context() as scan_patch:
        scan_patch.setattr(discovery.os, "scandir", lambda _path: (_ for _ in ()).throw(OSError()))
        assert runtime_inventory(policy, discovery.time.monotonic() + 1) == ()


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
