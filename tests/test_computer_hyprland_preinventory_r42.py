"""Managed-plugin preparation precedes every native inventory or startup scope."""

from __future__ import annotations

import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from src.computer.runtime import hyprland_discovery
from src.computer.runtime.hyprland_plugin import PluginState
from tests.test_computer_hyprland_foundation_r29 import pinned


def config(**changes):
    values = {
        "expected_uid": os.getuid(), "runtime_dir": "/run/user/fixture",
        "wayland_display": "", "instance_signature": "", "output_name": "TEST-1",
        "compositor_pid": None, "compositor_trust": pinned().trust,
        "discovery_mode": "auto", "managed_activation": True,
        "plugin_manifest_path": "/etc/odin/plugin.json",
    }
    return hb.HyprlandSessionConfig(**(values | changes))


async def test_inventory_prepares_pinned_plugin_before_opening_scope_and_replaces_proofs(
    monkeypatch,
):
    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    backend._selection_proofs["old"] = SimpleNamespace()
    identity = pinned()
    calls = []
    connection = SimpleNamespace(close=lambda: calls.append("connection-close"))
    resolved = SimpleNamespace(
        runtime_dir="/run/user/fixture", wayland_display="wayland-9",
        instance_signature="instance", pid=identity.process.pid,
    )

    class Provider:
        async def inventory_targets(self):
            calls.append("inventory")
            return {"candidate_epoch": 3, "candidates": [{"id": "new"}]}

        def export_selection_proof(self, candidate_id):
            assert candidate_id == "new"
            return "new-proof"

        async def close(self):
            calls.append("provider-close")

    async def prepare(actual_identity, *, ipc_path):
        assert actual_identity is identity
        assert ipc_path == "/run/user/fixture/hypr/instance/.socket.sock"
        calls.append("prepare")

    monkeypatch.setattr(
        hyprland_discovery.HyprlandDiscoveryResolver,
        "resolve",
        AsyncMock(return_value=resolved),
    )
    monkeypatch.setattr(hb, "pin_connections", AsyncMock(return_value=(identity, connection)))
    async def from_identity(**_):
        calls.append("scope-open")
        return Provider()

    monkeypatch.setattr(hb.HyprlandScopeProvider, "from_identity", from_identity)
    monkeypatch.setattr(backend, "_prepare_plugin", prepare)

    assert await backend.inventory_targets() == {
        "candidate_epoch": 3,
        "candidates": [{"id": "new"}],
    }
    assert calls[:3] == ["prepare", "scope-open", "inventory"]
    assert backend._selection_proofs == {"new": "new-proof"}
    assert "old" not in backend._selection_proofs
    assert not backend._guardian and not backend._started


async def test_failed_inventory_preparation_clears_cached_proofs_without_opening_scope(monkeypatch):
    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    backend._selection_proofs["old"] = SimpleNamespace()
    identity = pinned()
    connection = SimpleNamespace(closed=False)
    connection.close = lambda: setattr(connection, "closed", True)
    resolved = SimpleNamespace(
        runtime_dir="/run/user/fixture", wayland_display="wayland-9",
        instance_signature="instance", pid=identity.process.pid,
    )
    opened = AsyncMock()

    async def unready(*args, **kwargs):
        raise ComputerError("hyprland_plugin_mapped_image_unverified")

    monkeypatch.setattr(
        hyprland_discovery.HyprlandDiscoveryResolver,
        "resolve",
        AsyncMock(return_value=resolved),
    )
    monkeypatch.setattr(hb, "pin_connections", AsyncMock(return_value=(identity, connection)))
    monkeypatch.setattr(backend, "_prepare_plugin", unready)
    monkeypatch.setattr(hb.HyprlandScopeProvider, "from_identity", opened)

    with pytest.raises(ComputerError, match="mapped_image_unverified"):
        await backend.inventory_targets()
    assert backend._selection_proofs == {}
    assert connection.closed
    opened.assert_not_awaited()
    assert backend._guardian is None and not backend._started


async def test_preparation_requires_ready_attestation_for_the_pinned_identity(monkeypatch):
    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    identity = pinned()
    captured = {}

    class Manager:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def activate(self, *, authorized_task):
            assert authorized_task is True
            return PluginState(True, False, "hyprland_plugin_mapped_image_unverified")

    plugin = __import__("src.computer.runtime.hyprland_plugin", fromlist=["x"])
    monkeypatch.setattr(
        plugin,
        "read_trusted_plugin_manifest",
        lambda _: SimpleNamespace(approval=object()),
    )
    monkeypatch.setattr(plugin, "HyprlandPluginIPC", lambda **kwargs: kwargs)
    monkeypatch.setattr(plugin, "ProcMappedPluginVerifier", lambda: "verifier")
    monkeypatch.setattr(plugin, "ManagedHyprlandPlugin", Manager)

    with pytest.raises(ComputerError, match="mapped_image_unverified"):
        await backend._prepare_plugin(
            identity,
            ipc_path="/run/user/fixture/hypr/instance/.socket.sock",
        )
    assert captured["identity"] is identity
    assert captured["ipc"]["identity"] is identity
    assert captured["ipc"]["ipc_path"] == "/run/user/fixture/hypr/instance/.socket.sock"


async def test_unmanaged_preparation_does_not_read_or_activate_plugin(monkeypatch):
    backend = hb.HyprlandRuntimeBackend(
        config=config(managed_activation=False, plugin_manifest_path=None),
        enabled=True,
    )
    plugin = __import__("src.computer.runtime.hyprland_plugin", fromlist=["x"])
    read_manifest = AsyncMock()
    monkeypatch.setattr(plugin, "read_trusted_plugin_manifest", read_manifest)

    await backend._prepare_plugin(
        pinned(), ipc_path="/run/user/fixture/hypr/instance/.socket.sock"
    )
    read_manifest.assert_not_called()


async def test_startup_prepares_before_constructing_a_scope_provider(monkeypatch):
    identity = pinned()
    backend = hb.HyprlandRuntimeBackend(
        config=config(
            discovery_mode="pinned", compositor_pid=identity.process.pid,
            wayland_display="wayland-9", instance_signature="instance",
        ),
        enabled=True,
    )
    calls = []
    connection = SimpleNamespace(close=lambda: calls.append("connection-close"))

    async def prepare(actual_identity, *, ipc_path):
        assert actual_identity is identity
        assert ipc_path.endswith("/hypr/instance/.socket.sock")
        calls.append("prepare")

    def new_provider():
        calls.append("scope-open")
        return SimpleNamespace(attest_identity=AsyncMock())

    monkeypatch.setattr(hb, "trusted_binary", lambda _: None)
    monkeypatch.setattr(hb, "pin_connections", AsyncMock(return_value=(identity, connection)))
    monkeypatch.setattr(backend, "_prepare_plugin", prepare)
    monkeypatch.setattr(backend, "_new_provider", new_provider)
    monkeypatch.setattr(
        backend,
        "_action_scope",
        AsyncMock(side_effect=ComputerError("scope stopped")),
    )

    try:
        with pytest.raises(ComputerError, match="scope stopped"):
            await backend._open()
        assert calls.index("prepare") < calls.index("scope-open")
        backend._scope_provider.attest_identity.assert_awaited_once_with(identity)
        assert backend._guardian is None
    finally:
        if backend._incarnation is not None:
            backend._incarnation.close()
