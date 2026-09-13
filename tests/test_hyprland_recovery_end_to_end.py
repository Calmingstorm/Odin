"""Real controller/runtime persistence with injected native transports, not qualification."""

import asyncio
from unittest.mock import AsyncMock

import pytest

from src.computer.controller import ComputerController
from src.computer.models import ComputerError, LiveSession, RequestContext
from src.computer.runtime import hyprland_backend as hb
from src.computer.store import ComputerStore
from tests.test_hyprland_recovery_backend import evidence
from tests.test_hyprland_recovery_backend import runtime as runtime
from tests.test_hyprland_selection_handoff_integration import context, inventory
from tests.test_hyprland_selection_handoff_integration import rig as rig


@pytest.fixture
def integrated(runtime, tmp_path, monkeypatch):
    backend, provider, guardian = runtime
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, None, lambda _: True, enabled=True)
    request = RequestContext("owner", "channel", "turn", "host")
    grant = store.create_session(request, platform="wayland", environment="existing_session",
                                 backend="hyprland")
    backend._descriptor = None
    live = LiveSession(backend, controller.monotonic() + 100, capabilities=backend.capabilities)
    controller._live[grant.session_id] = live
    controller._hyprland_contexts[grant.session_id] = request
    controller._prepare_runtime(grant, backend)
    backend._persist_owner()
    controller._record_hyprland_start_grant(grant, live)
    grant = store.set_state(grant.session_id, "active")
    spawned = []

    def guardian_factory(binary, uid, on_spawn):
        async def start(*args):
            # Both notifications made by the actual guardian start protocol.
            on_spawn(None)
            on_spawn({"pid": 4567, "start_ticks": 123})
            spawned.append(True)

        guardian.start = AsyncMock(side_effect=start)
        return guardian

    monkeypatch.setattr(hb, "HyprlandGuardian", guardian_factory)
    yield controller, store, grant, live, provider, guardian, spawned
    store.close()


async def test_recovery_replacement_spawn_uses_real_controller_persistence(integrated):
    controller, store, grant, live, _, guardian, spawned = integrated
    await controller._quarantine_hyprland(grant, live, phase="native_continuity_lost")
    current = store.get_session(grant.session_id)
    assert current.state == "active" and current.generation == 2
    assert spawned == [True]
    guardian.start.assert_awaited_once()
    guardian.bind_scope.assert_awaited_once()
    assert not live.revoked and live.backend.input_readiness == "observation_required"
    assert store.get_recovery_pending(grant.session_id) is None
    assert store.hyprland_owner(grant.session_id)["owner"]["ledger_id"] == "n" * 48
    assert live.backend._descriptor["processes"] == [{"pid": 4567, "start_ticks": 123}]
    assert not live.backend._descriptor["launch_pending"]


@pytest.mark.parametrize("operation", ["stop", "pause"])
async def test_stop_pause_refuse_late_replacement_spawn_callback(
    integrated, monkeypatch, operation,
):
    controller, store, grant, live, _, guardian, _ = integrated
    backend = live.backend
    entered = asyncio.Event()
    refused = []

    def guardian_factory(binary, uid, on_spawn):
        async def late_start(*args):
            on_spawn(None)
            entered.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                # A cancellation-resistant transport cannot publish its late child
                # into either the revoked or a newer durable generation.
                for descriptor in (None, {"pid": 4567, "start_ticks": 123}):
                    with pytest.raises(ComputerError, match="grant_revoked"):
                        on_spawn(descriptor)
                    refused.append(True)

        guardian.start = AsyncMock(side_effect=late_start)
        return guardian

    monkeypatch.setattr(hb, "HyprlandGuardian", guardian_factory)
    recovery = asyncio.create_task(controller._quarantine_hyprland(
        grant, live, phase="native_continuity_lost"))
    await asyncio.wait_for(entered.wait(), 2)
    if operation == "stop":
        await controller._stop(grant.session_id, "cancelled")
    else:
        await controller._pause(grant.session_id)
    await asyncio.gather(recovery, return_exceptions=True)
    assert refused == [True, True]
    guardian.bind_scope.assert_not_awaited()
    assert not backend.input_supported and backend._paused
    assert store.get_session(grant.session_id).state != "active"
    assert backend._descriptor["processes"] == []
    with pytest.raises(ComputerError):
        backend.commit_native_recovery(consent_generation=2)


@pytest.mark.parametrize("change", ["backend", "live", "generation", "epoch", "missing", "task"])
async def test_revoked_spawn_exception_is_exact_preparation_only(integrated, change):
    controller, _, grant, live, _, _, _ = integrated
    sid = grant.session_id
    controller._fence(sid)
    epoch = controller._hyprland_recovery_epochs[sid]
    controller._hyprland_preparations[sid] = (live, live.backend, grant.generation, epoch)
    if change != "task":
        controller._recoveries[sid] = asyncio.current_task()
    preparation = list(controller._hyprland_preparations[sid])
    if change == "backend":
        preparation[1] = object()
    elif change == "live":
        preparation[0] = object()
    elif change == "generation":
        preparation[2] += 1
    elif change == "epoch":
        preparation[3] += 1
    if change == "missing":
        controller._hyprland_preparations.pop(sid)
    else:
        controller._hyprland_preparations[sid] = tuple(preparation)
    with pytest.raises(ComputerError, match="grant_revoked"):
        live.backend._record_spawn(None)
    with pytest.raises(ComputerError, match="grant_revoked"):
        live.backend._persist_owner()


async def test_sticky_unknown_remedy_requires_external_reconciliation(integrated):
    controller, store, grant, live, provider, guardian, spawned = integrated
    row = evidence(release_ack=False, ledger_empty=False, unknown_release=True)
    provider.reconcile_owner.return_value = provider.retire_owner.return_value = row
    await controller._quarantine_hyprland(grant, live, phase="native_continuity_lost")
    result = live.backend._recovery_result
    assert result.reason == "hyprland_operator_reconciliation_required"
    assert result.cleanup["resources_retired"] and not result.cleanup["released"]
    assert live.revoked and not spawned
    guardian.bind_scope.assert_not_awaited()
    assert store.get_session(grant.session_id).state == "quarantined"


@pytest.mark.parametrize("seam", [1, 2])
@pytest.mark.parametrize("changed", ["surface_token", "plugin_epoch"])
async def test_initial_selection_refuses_same_process_sibling_at_each_scope_seam(
    rig, monkeypatch, seam, changed,
):
    state = rig
    original = hb.HyprlandRuntimeBackend._action_scope
    calls = 0

    async def shifted(backend, *args, **kwargs):
        nonlocal calls
        snapshot, deadline = await original(backend, *args, **kwargs)
        calls += 1
        if calls == seam:
            snapshot[changed] = "different-native-lifetime"
        return snapshot, deadline

    monkeypatch.setattr(hb.HyprlandRuntimeBackend, "_action_scope", shifted)
    selected = await inventory(state)
    with pytest.raises(ComputerError):
        await state.controller.session(context(), selected)
    assert calls == seam
    assert len(state.guardians) == seam - 1
    assert all(not guardian.bound for guardian in state.guardians)
