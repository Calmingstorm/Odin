"""Native capture fencing with synthetic transports, never desktop connections."""

import asyncio
import copy
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from tests.computer.test_hyprland_backend import Guardian, config, native, output, scope


@pytest.fixture
def capture_rig(monkeypatch):
    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    backend._started = True
    backend._identity = SimpleNamespace(digest="f" * 64)
    backend._output = output()
    backend._guardian = Guardian()
    backend._scope_provider = SimpleNamespace(
        snapshot=AsyncMock(side_effect=lambda _: scope()), close=AsyncMock())
    connection = SimpleNamespace(close=Mock())
    connect = AsyncMock(return_value=connection)
    monkeypatch.setattr(hb, "connect_peer", connect)
    trusted = Mock()
    monkeypatch.setattr(hb, "trusted_binary", trusted)
    seen = []

    async def capture(**kwargs):
        seen.append(kwargs)
        await kwargs["scope"]()
        return native()

    monkeypatch.setattr(hb, "capture_explicit_output", capture)
    return SimpleNamespace(backend=backend, connect=connect, trusted=trusted, seen=seen)


async def test_capture_returns_raster_only_after_matching_native_scope(capture_rig):
    rig = capture_rig
    rendered, measured, captured_at = await rig.backend._capture()
    assert rendered.png.startswith(b"\x89PNG\r\n\x1a\n")
    assert measured["application"] == scope()["application"]
    assert 0 <= time.monotonic() - captured_at < 2
    rig.trusted.assert_called_once_with(rig.backend.config.capture_binary)
    assert rig.connect.await_args.args[:3] == (
        rig.backend.config.wayland_path, 4242, 1000)
    assert rig.seen[0]["identity"] is rig.backend._identity
    assert rig.seen[0]["output"] == output()
    assert rig.seen[0]["on_spawn"] == rig.backend._record_spawn
    assert rig.backend._scope_provider.snapshot.await_count == 2
    assert not rig.backend._capture_jobs
    assert not rig.backend._guardian.commands


@pytest.mark.parametrize("phase,expected", [
    ("before_proof", "hyprland_generation_revoked"),
    ("after_proof", "hyprland_capture_generation_changed"),
    ("scope_change", "hyprland_capture_scope_changed"),
])
async def test_capture_rejects_generation_or_scope_race(capture_rig, monkeypatch, phase, expected):
    backend = capture_rig.backend

    async def capture(**kwargs):
        if phase == "before_proof":
            backend._generation += 1
        await kwargs["scope"]()
        if phase == "after_proof":
            backend._generation += 1
        if phase == "scope_change":
            backend._scope_provider.snapshot.side_effect = lambda _: scope(native_scope_serial=2)
        return native()

    monkeypatch.setattr(hb, "capture_explicit_output", capture)
    with pytest.raises(ComputerError, match=f"^{expected}$"):
        await backend._capture()
    assert not backend._capture_jobs
    assert backend._frame is None
    assert not backend._guardian.commands


async def test_cancelled_capture_removes_owned_job_and_does_not_inject(capture_rig, monkeypatch):
    backend = capture_rig.backend
    entered, cancelled = asyncio.Event(), asyncio.Event()

    async def blocked_capture(**kwargs):
        await kwargs["scope"]()
        entered.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    monkeypatch.setattr(hb, "capture_explicit_output", blocked_capture)
    task = asyncio.create_task(backend._capture())
    await entered.wait()
    assert len(backend._capture_jobs) == 1
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert cancelled.is_set()
    assert not backend._capture_jobs
    assert not backend._guardian.commands


@pytest.mark.parametrize("error,expected", [
    (hb.HyprlandScopeFailure("hyprland_snapshot_capacity"), "hyprland_snapshot_capacity"),
    (ComputerError("hyprland_original_application_changed"), "input_focus_unavailable"),
    (ComputerError("hyprland_scope_unknown_locked_or_stale"),
     "hyprland_scope_unknown_locked_or_stale"),
])
async def test_observe_remaps_only_recoverable_focus_errors(
        capture_rig, monkeypatch, error, expected):
    backend = capture_rig.backend
    backend._selected_binding = {"window_id": "selected"}
    capture = AsyncMock(side_effect=error)
    monkeypatch.setattr(backend, "_capture_observation", capture)
    with pytest.raises(ComputerError, match=f"^{expected}$"):
        await backend.observe()
    capture.assert_awaited_once_with(None)
    assert backend._frame is None
    assert not backend._guardian.commands


async def test_unknown_scope_error_is_not_promoted_to_recoverable_focus(capture_rig, monkeypatch):
    error = hb.HyprlandScopeFailure("hyprland_provider_owner_changed")
    monkeypatch.setattr(capture_rig.backend, "_capture_observation", AsyncMock(side_effect=error))
    with pytest.raises(hb.HyprlandScopeFailure) as caught:
        await capture_rig.backend.observe()
    assert caught.value is error


def test_startup_descriptor_and_spawn_publications_are_independent_snapshots(monkeypatch):
    from src.computer.runtime import recovery

    monkeypatch.setattr(recovery, "boot_id", lambda: "fixture-boot")
    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    with pytest.raises(ComputerError, match="wayland_runtime_identity_missing"):
        backend._record_spawn({"pid": 12, "start_ticks": 34})
    descriptor = backend.startup_descriptor("a" * 32)
    assert descriptor["no_persistent_devices"] is False
    descriptor["processes"].append({"pid": 99, "start_ticks": 99})
    assert backend._descriptor["processes"] == []
    published = []
    backend.runtime_identity_callback = published.append
    backend._record_spawn({"pid": 12, "start_ticks": 34, "untrusted_extra": "ignored"})
    assert published[0]["processes"] == [{"pid": 12, "start_ticks": 34}]
    assert published[0]["launch_pending"] is False
    published[0]["processes"].clear()
    assert backend._descriptor["processes"] == [{"pid": 12, "start_ticks": 34}]
    backend._record_spawn(None)
    assert backend._descriptor["launch_pending"] is True
    with pytest.raises(ComputerError, match="wayland_session_identity_changed"):
        backend.startup_descriptor("b" * 32)
    backend._descriptor["processes"] = [{"pid": 12, "start_ticks": 34}] * 2048
    before = copy.deepcopy(backend._descriptor)
    with pytest.raises(ComputerError, match="wayland_runtime_process_limit"):
        backend._record_spawn({"pid": 13, "start_ticks": 35})
    assert backend._descriptor == before


def test_spawn_persistence_failure_does_not_publish_uncommitted_descriptor():
    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    backend.startup_descriptor("a" * 32)
    before = copy.deepcopy(backend._descriptor)
    backend.runtime_identity_callback = Mock(side_effect=OSError("storage unavailable"))
    with pytest.raises(OSError, match="storage unavailable"):
        backend._record_spawn({"pid": 12, "start_ticks": 34})
    assert backend._descriptor == before


def test_exported_selection_proof_is_detached_and_revoked_on_close():
    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    backend._selection_proofs["candidate"] = {"nested": ["original"]}
    proof = backend.export_selection_proof("candidate")
    proof["nested"].clear()
    assert backend._selection_proofs["candidate"] == {"nested": ["original"]}
    with pytest.raises(ComputerError, match="target_selection_invalid"):
        backend.export_selection_proof("other")
    backend._closed = True
    with pytest.raises(ComputerError, match="target_selection_invalid"):
        backend.export_selection_proof("candidate")
