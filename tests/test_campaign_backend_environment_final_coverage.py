"""Native-free adversarial coverage for Hyprland bookkeeping and env publication."""

from __future__ import annotations

import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from src.computer.runtime import hyprland_discovery
from src.computer.runtime.hyprland_identity import ExecutableTrust
from src.config import environment
from src.config.environment import EnvironmentSource, EnvironmentSourceError, edit_environment


def _config(**changes):
    values = {
        "expected_uid": os.geteuid(), "runtime_dir": "/run/user/1000",
        "wayland_display": "wayland-1", "instance_signature": "instance",
        "output_name": "DP-1", "compositor_pid": 42,
        "compositor_trust": ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.55", "b" * 40),
    }
    return hb.HyprlandSessionConfig(**(values | changes))


def _backend():
    backend = hb.HyprlandRuntimeBackend(config=_config(), enabled=True)
    backend._started = True
    backend._identity = SimpleNamespace(digest="d" * 64)
    backend._output = SimpleNamespace(name="DP-1", oriented_size=(12, 8))
    return backend


def _private(path: Path) -> Path:
    path.mkdir(mode=0o700)
    path.chmod(0o700)
    return path


def test_environment_bytes_path_and_validation_failure_paths(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    source = EnvironmentSource(os.fsencode(str(tmp_path / "plain.env")))
    assert source.path == tmp_path / "plain.env"
    with pytest.raises(EnvironmentSourceError, match="valid UTF-8"):
        EnvironmentSource(b"/tmp/\xff")

    root = _private(tmp_path / "root")
    env = root / ".env"
    with pytest.raises(EnvironmentSourceError, match="values must be strings"):
        edit_environment(EnvironmentSource(env), {"A": 1})  # type: ignore[dict-item]
    with pytest.raises(EnvironmentSourceError, match="too many"):
        edit_environment(EnvironmentSource(env), {f"A{i}": "x" for i in range(129)})
    with pytest.raises(EnvironmentSourceError, match="too large"):
        edit_environment(EnvironmentSource(env), {"A": "x" * (16 * 1024 + 1)})

    def gone(_path):
        raise OSError("gone")

    monkeypatch.setattr(environment.os, "lstat", gone)
    assert environment._same(SimpleNamespace(path=env)) is False


def test_environment_publication_permission_error_cleans_temp(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    env = _private(tmp_path / "root") / ".env"
    env.write_text("A=old\n")
    real_replace = environment.os.replace

    def denied(*args, **kwargs):
        raise PermissionError("publication denied")

    monkeypatch.setattr(environment.os, "replace", denied)
    with pytest.raises(EnvironmentSourceError, match="publication failed before commit"):
        edit_environment(EnvironmentSource(env), {"A": "new"})
    assert env.read_text() == "A=old\n"
    assert not list(env.parent.glob(".*.tmp"))
    monkeypatch.setattr(environment.os, "replace", real_replace)


async def test_hyprland_selection_descriptor_and_invalid_recovery_are_local_only():
    backend = _backend()
    backend._guardian = SimpleNamespace(alive=True)
    backend._scope_provider = SimpleNamespace()
    assert await backend.select_source("DP-1") == {"selected_source": "DP-1", "capture_only": False}
    with pytest.raises(ComputerError, match="not_granted"):
        await backend.select_source("other")

    descriptor = backend.startup_descriptor("a" * 32)
    backend._record_spawn({"pid": 7, "start_ticks": 9})
    assert descriptor["processes"] == []
    with pytest.raises(ComputerError, match="identity_changed"):
        backend.startup_descriptor("b" * 32)

    backend._selected_binding = {"output_name": "wrong", "output": "DP-1", "identity": {}}
    assert await backend.recover_focus({}, context={}) is False


async def test_hyprland_cleanup_and_resume_guards_are_native_free():
    backend = _backend()

    class Guardian:
        async def close(self):
            return {"release_ack": True, "process_reaped": True}

    class Provider:
        async def close(self):
            return None

    backend._guardian = Guardian()
    backend._scope_provider = Provider()
    assert await backend._cleanup_all() is True
    assert backend._cleanup_evidence["receiver_release_verified"] is False

    backend._closed = True
    with pytest.raises(ComputerError, match="renewed_session_consent_required"):
        await backend.resume(consent_generation=2)


async def test_hyprland_cleanup_failure_is_quarantined_without_input():
    backend = _backend()

    class BrokenGuardian:
        async def close(self):
            raise RuntimeError("no acknowledgement")

    class BrokenProvider:
        async def close(self):
            raise RuntimeError("no close")

    backend._guardian = BrokenGuardian()
    backend._scope_provider = BrokenProvider()
    assert await backend._cleanup_all() is False
    assert backend._release_failed is True
    assert backend._cleanup_evidence["guardian_process_reaped"] is False


async def test_hyprland_local_readiness_properties_and_start_refusal(monkeypatch):
    backend = _backend()
    assert backend.sources() == [
        {
            "source_id": "DP-1",
            "label": "Explicitly granted Hyprland output",
            "width": 12,
            "height": 8,
        }
    ]
    assert backend.hyprland_handoff_binding is None
    backend.input_supported = True
    assert backend.input_readiness == "observation_required"
    backend._closed = True
    assert backend.input_readiness == "inactive"

    starting = hb.HyprlandRuntimeBackend(config=_config(), enabled=True)
    monkeypatch.setattr(starting, "stop", AsyncMock())
    with pytest.raises(Exception):
        await starting.start("a" * 32, selection={"wrong": "shape"})
    starting.stop.assert_awaited_once()


async def test_hyprland_local_active_extent_and_scope_guard_fail_closed():
    backend = _backend()
    backend._guardian = SimpleNamespace(alive=False)
    with pytest.raises(ComputerError, match="extent_mismatch"):
        backend._check_ready({"width": 12, "height": 8})
    with pytest.raises(ComputerError, match="session_revoked"):
        backend._active()
    backend._scope_provider = None
    with pytest.raises(ComputerError, match="session_revoked"):
        await backend._action_scope({})


async def test_hyprland_recovery_selection_identity_shape_fails_closed():
    backend = _backend()
    backend._guardian = SimpleNamespace(alive=True)
    backend._scope_provider = SimpleNamespace()
    backend._selected_binding = {
        "output_name": "DP-1", "output": "DP-1", "identity": "not-a-dict"
    }
    assert await backend.recover_focus({}, context={}) is False


async def test_hyprland_inventory_refuses_unavailable_and_closes_mocked_resources(monkeypatch):
    disabled = hb.HyprlandRuntimeBackend(config=_config(), enabled=False)
    with pytest.raises(ComputerError, match="target_inventory_unavailable"):
        await disabled.inventory_targets()

    backend = hb.HyprlandRuntimeBackend(
        config=_config(discovery_mode="auto", compositor_pid=None), enabled=True
    )
    resolver = hyprland_discovery.HyprlandDiscoveryResolver
    monkeypatch.setattr(resolver, "resolve", AsyncMock(side_effect=RuntimeError("no native")))
    with pytest.raises(RuntimeError, match="no native"):
        await backend.inventory_targets()

    connection = SimpleNamespace(closed=False)
    connection.close = lambda: setattr(connection, "closed", True)
    provider = SimpleNamespace(closed=False)

    async def inventory():
        return [{"id": "opaque"}]

    async def close():
        provider.closed = True

    provider.inventory_targets, provider.close = inventory, close
    resolved = SimpleNamespace(
        runtime_dir="/run/user/1000", wayland_display="wayland-1", instance_signature="instance",
        pid=42,
    )
    monkeypatch.setattr(resolver, "resolve", AsyncMock(return_value=resolved))
    monkeypatch.setattr(hb, "pin_connections", AsyncMock(return_value=(object(), connection)))
    monkeypatch.setattr(hb.HyprlandScopeProvider, "from_identity", AsyncMock(return_value=provider))
    assert await backend.inventory_targets() == [{"id": "opaque"}]
    assert connection.closed and provider.closed
