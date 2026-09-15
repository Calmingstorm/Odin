"""Fault-injected wrapper classifications, not a claim about live failure cause."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.controller import ComputerController
from src.computer.models import BackendCapabilities, ComputerError, RequestContext
from src.computer.runtime.hyprland_scope import HyprlandScopeFailure
from src.computer.store import ComputerStore
from tests.test_hyprland_recovery_controller import binding


@pytest.fixture
def rig(tmp_path):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = SimpleNamespace(
        capabilities=BackendCapabilities(platform="wayland", environment="existing_session",
                                         backend="hyprland"),
        input_supported=False, start=AsyncMock(), hyprland_handoff_binding=binding())
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    controller._prepare_runtime = lambda *args: None
    controller._capture = AsyncMock()
    controller._deadline = AsyncMock()

    async def stop(sid, state):
        controller._fence(sid)
        store.set_state(sid, state)
    controller._stop = AsyncMock(side_effect=stop)
    yield controller, store, backend, RequestContext("owner", "channel", "turn", "host")
    store.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("error", [
    ComputerError("hyprland_capture_settle_budget_exhausted: PRIVATE_OWNER_SECRET"),
    HyprlandScopeFailure("hyprland_snapshot_capacity: PRIVATE_OWNER_SECRET"),
    ComputerError("hyprland_fresh_observation_required"),
    ComputerError("hyprland_capture_scope_changed"),
    ComputerError("hyprland_scope_unknown_locked_or_stale"),
    ComputerError("human_focus_changed"),
])
async def test_classified_capture_retains_active_without_observations(rig, error, caplog):
    controller, _, _, context = rig

    async def capture(grant):
        controller._live[grant.session_id].observations["stale"] = object()
        controller._delivered_observations[grant.session_id] = object()
        raise error
    controller._capture.side_effect = capture
    result = await controller.session(context, {"operation": "start"})
    sid = result["session_id"]
    assert result["state"] == "active"
    assert result["start_phase"] == "initial_capture"
    assert result["next_action"] == "observe_fresh" and result["observation_required"]
    assert not controller._live[sid].observations
    assert sid not in controller._delivered_observations
    controller._stop.assert_not_awaited()
    assert "PRIVATE_OWNER_SECRET" not in str(result) + caplog.text
    assert "phase=initial_capture" in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", ["backend_start", "persist_handoff", "initial_capture"])
@pytest.mark.parametrize("error", [
    ComputerError("hyprland_original_target_changed: PRIVATE_OWNER_SECRET"),
    HyprlandScopeFailure("hyprland_peer_mismatch: PRIVATE_OWNER_SECRET"),
])
async def test_unsafe_errors_keep_reason_and_phase_but_stop(rig, phase, error, caplog):
    controller, _, backend, context = rig
    if phase == "backend_start":
        backend.start.side_effect = error
    elif phase == "persist_handoff":
        def fail(*args):
            raise error
        controller._record_hyprland_start_grant = fail
    else:
        controller._capture.side_effect = error
    with pytest.raises(ComputerError) as caught:
        await controller.session(context, {"operation": "start"})
    assert str(caught.value) == f"{str(error).split(':')[0]}: start_phase={phase}"
    controller._stop.assert_awaited_once()
    assert "PRIVATE_OWNER_SECRET" not in str(caught.value) + caplog.text


@pytest.mark.asyncio
async def test_revoked_transient_does_not_retain_attachment(rig):
    controller, _, _, context = rig
    async def capture(grant):
        controller._fence(grant.session_id)
        raise ComputerError("hyprland_fresh_observation_required")
    controller._capture.side_effect = capture
    with pytest.raises(ComputerError, match="start_phase=initial_capture"):
        await controller.session(context, {"operation": "start"})
    controller._stop.assert_awaited_once()


@pytest.mark.asyncio
async def test_unknown_error_stays_generic_logs_only_safe_diagnostics(rig, caplog):
    controller, _, _, context = rig
    controller._capture.side_effect = RuntimeError("PRIVATE_OWNER_SECRET")
    with pytest.raises(ComputerError, match="^start_unavailable$"):
        await controller.session(context, {"operation": "start"})
    controller._stop.assert_awaited_once()
    assert "RuntimeError" in caplog.text and "frames=" in caplog.text
    assert "PRIVATE_OWNER_SECRET" not in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize("error", [TimeoutError(), ConnectionError("PRIVATE_OWNER_SECRET"),
    HyprlandScopeFailure("hyprland_snapshot_capacity: PRIVATE_OWNER_SECRET")])
async def test_real_capture_classifies_local_backend_refusal(rig, error):
    controller, _, backend, context = rig
    backend.observe = AsyncMock(side_effect=error)
    controller._capture = ComputerController._capture.__get__(controller)
    result = await controller.session(context, {"operation": "start"})
    assert result["state"] == "active"
    assert result["reason"] == "hyprland_fresh_observation_required"
    assert result["observation_required"]
    controller._stop.assert_not_awaited()


@pytest.mark.asyncio
async def test_real_capture_identity_loss_fences_not_retryable(rig):
    controller, store, backend, context = rig
    backend.observe = AsyncMock(side_effect=ComputerError("hyprland_original_target_changed"))
    controller._capture = ComputerController._capture.__get__(controller)
    with pytest.raises(ComputerError, match="hyprland_fresh_target_required"):
        await controller.session(context, {"operation": "start"})
    assert controller._stop.await_count >= 1
    assert all(live.revoked for live in controller._live.values())


@pytest.mark.asyncio
async def test_transient_during_handoff_is_not_capture_recovery(rig):
    controller, _, _, context = rig
    def fail(*args):
        raise ComputerError("hyprland_snapshot_capacity")
    controller._record_hyprland_start_grant = fail
    with pytest.raises(ComputerError, match="start_phase=persist_handoff"):
        await controller.session(context, {"operation": "start"})
    controller._stop.assert_awaited_once()
