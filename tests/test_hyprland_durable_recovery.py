"""Production controller/store/runtime seams, injected native transport, no qualification."""

import asyncio
import os
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.controller import ComputerController
from src.computer.models import ComputerError, RequestContext
from src.computer.runtime import hyprland_backend as hb
from src.computer.runtime.hyprland_identity import _proc_start
from src.computer.runtime.hyprland_recovery import (
    HyprlandCrossIncarnationRecovery,
    HyprlandRetirementCapability,
)
from src.computer.runtime.hyprland_scope import owner_handle_to_record
from src.computer.store import ComputerStore
from tests.test_hyprland_durable_reconnect import durable as durable


@pytest.fixture
def recovered(tmp_path, durable, monkeypatch):
    _, old, _, _ = durable
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    context = RequestContext("owner", "channel", "before-crash", "host")
    grant = store.create_session(context, platform="wayland", environment="existing_session",
                                 backend="hyprland")
    store.record_hyprland_owner(grant, owner_handle_to_record(old))
    grant = store.set_state(grant.session_id, "active")
    store.persist_hyprland_task(grant, {"goal": "finish the original document"})
    config = hb.HyprlandSessionConfig(
        expected_uid=os.geteuid(), runtime_dir="/tmp", wayland_display="wayland-1",
        instance_signature="test", output_name="DP-1", compositor_pid=321,
        compositor_trust=old.compositor.trust)
    backend = hb.HyprlandRuntimeBackend(config=config, enabled=True)
    adopted = replace(old, recovery_pid=os.getpid(), recovery_uid=os.geteuid(),
                      recovery_start_ticks=str(_proc_start(os.getpid(), os.geteuid())))
    row = dict(owner_matched=True, instance_id=old.instance_id, plugin_epoch=old.plugin_epoch,
               ledger_id=old.ledger_id, ledger_empty=True, release_ack=True, revoked=True,
               retired=True, native_resources_retired=True, unknown_release=False,
               receiver_release_verified=False, retirement_evidence_version=1,
               retirement_evidence_kind="exact-client-resources-destroyed",
               **{k: getattr(adopted, k) for k in ("guardian_pid", "guardian_uid",
                  "guardian_start_ticks", "recovery_pid", "recovery_uid", "recovery_start_ticks")})
    provider = SimpleNamespace(reconnect_owner=AsyncMock(return_value=adopted),
                               reconcile_owner=AsyncMock(return_value=row),
                               retire_owner=AsyncMock(return_value=row),
                               owner_status=AsyncMock(return_value=row), close=AsyncMock())
    monkeypatch.setattr(hb, "revalidate", AsyncMock())
    monkeypatch.setattr(hb.HyprlandScopeProvider, "from_identity", AsyncMock(return_value=provider))
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    current = store.get_session(grant.session_id)
    context = replace(context, turn_id="current-request")
    yield controller, store, current, context, backend, provider
    controller.store.close()


async def test_daemon_loss_reconnect_is_release_only_and_preserves_task(recovered):
    controller, store, grant, context, backend, provider = recovered
    assert not controller._live
    assert store.get_recovery_pending(grant.session_id).old_grant["task_hints"]["goal"]
    result = await controller.session(context, {"operation": "reconcile",
                                              "session_id": grant.session_id,
                                              "generation": grant.generation})
    assert result["state"] == "quarantined"
    assert result["recovery"]["status"] == "fresh_target_required"
    assert not backend.input_supported and not backend._started and not controller._live
    provider.reconnect_owner.assert_awaited_once()
    provider.reconcile_owner.assert_awaited_once()
    provider.retire_owner.assert_awaited_once()
    assert "recovery_capability" not in str(result)


async def test_lost_adoption_ack_queries_without_replay(recovered):
    controller, store, grant, context, _, provider = recovered
    adopted = provider.reconnect_owner.return_value
    provider.reconnect_owner.side_effect = [OSError("lost ACK"), adopted]
    await controller.reconcile_hyprland_owner(context, grant.session_id, grant.generation)
    modes = [call.kwargs["query_only"] for call in provider.reconnect_owner.await_args_list]
    assert modes == [False, True]
    assert store.recovery_status(grant.session_id)["status"] == "fresh_target_required"


@pytest.mark.parametrize("phase", ["adoption", "reconcile", "retire"])
async def test_persistence_fault_prevents_next_native_mutation(recovered, monkeypatch, phase):
    controller, store, grant, context, _, provider = recovered
    def fail(*args, **kwargs):
        raise OSError("disk full")
    if phase == "adoption":
        monkeypatch.setattr(store, "persist_hyprland_reconnected_owner", fail)
    else:
        original = store.prepare_hyprland_reconnect_phase
        def maybe(grant, command, step):
            return fail() if step == phase else original(grant, command, step)
        monkeypatch.setattr(store, "prepare_hyprland_reconnect_phase", maybe)
    with pytest.raises(OSError):
        await controller.reconcile_hyprland_owner(context, grant.session_id, grant.generation)
    provider.retire_owner.assert_not_awaited()
    if phase != "retire":
        provider.reconcile_owner.assert_not_awaited()
    assert store.get_session(grant.session_id).state == "quarantined"


async def test_auth_revocation_after_adoption_prevents_release(recovered):
    controller, store, grant, context, _, provider = recovered
    async def adoption(*args, **kwargs):
        controller.authorize = lambda _: False
        return provider.reconnect_owner.return_value
    provider.reconnect_owner.side_effect = adoption
    with pytest.raises(ComputerError, match="not_found"):
        await controller.reconcile_hyprland_owner(context, grant.session_id, grant.generation)
    provider.reconcile_owner.assert_not_awaited()
    assert store.get_session(grant.session_id) == grant


async def test_stop_cancels_pending_durable_reconnect(recovered):
    controller, store, grant, context, backend, provider = recovered
    entered = asyncio.Event()
    async def blocked(*args, **kwargs):
        entered.set()
        await asyncio.Event().wait()
    provider.reconnect_owner.side_effect = blocked
    task = asyncio.create_task(controller.reconcile_hyprland_owner(
        context, grant.session_id, grant.generation))
    await asyncio.wait_for(entered.wait(), 1)
    await controller._stop(grant.session_id, "cancelled")
    await asyncio.gather(task, return_exceptions=True)
    assert not backend.input_supported and not controller._live
    provider.reconcile_owner.assert_not_awaited()
    assert store.recovery_status(grant.session_id)["continuation_cancelled"]


def attest(store, grant):
    return store.finish_recovery(grant, {
        "status": "operator_acknowledged_unverified",
        "reason": "operator_verified_external_cleanup",
        "recorded_processes_absent": True, "operator_id": "admin"}, acknowledged=True)


def test_external_cleanup_keeps_unknown_and_lineage_through_successor_reopen(recovered):
    _, store, grant, context, _, _ = recovered
    store.record_cleanup(grant.session_id, {"released": False}, clean=False)
    original = store.cleanup(grant.session_id)
    grant = attest(store, grant)
    assert grant.state == "quarantined"
    successor = store.create_session(context, platform="wayland", environment="existing_session",
                                     backend="hyprland", recovery_session_id=grant.session_id,
                                     recovery_generation=grant.generation)
    assert store.cleanup(grant.session_id) == original
    assert store.hyprland_task_lineage(successor.session_id)["task_hints"] == {
        "goal": "finish the original document"}
    store._validate_current_schema()
    assert not store.recovery_status(grant.session_id)["released"]


def test_stop_prevents_attested_task_resurrection(recovered):
    _, store, grant, context, _, _ = recovered
    store.cancel_hyprland_continuation(grant.session_id)
    grant = attest(store, grant)
    with pytest.raises(ComputerError, match="hyprland_reconciliation_required"):
        store.create_session(context, platform="wayland", environment="existing_session",
                             backend="hyprland", recovery_session_id=grant.session_id,
                             recovery_generation=grant.generation)


@pytest.mark.parametrize("cleanup", ["native", "external_attestation"])
@pytest.mark.parametrize("stop_state", ["closed", "cancelled"])
async def test_cleanup_after_stop_preserves_pending_history_across_reopen(
    recovered, cleanup, stop_state,
):
    controller, store, grant, context, backend, provider = recovered
    sid = grant.session_id
    pending = store.get_recovery_pending(sid)
    owner = store.hyprland_owner(sid)
    store.record_cleanup(sid, {"released": False, "unknown_release": True}, clean=False)
    original_cleanup = store.cleanup(sid)
    await controller._stop(sid, stop_state)
    stopped = store.get_session(sid)
    assert stopped.state == "quarantined"
    assert stopped.generation > pending.grant_generation == grant.generation
    assert store.get_recovery_pending(sid) == pending
    assert store.recovery_status(sid)["continuation_cancelled"] is True

    # Historical lineage is not permission for a stale caller to finish cleanup.
    # Both writers must still CAS the current session generation.
    if cleanup == "native":
        with pytest.raises(ComputerError, match="grant_revoked"):
            store.record_hyprland_recovery_assessment(
                grant, state="fresh_target_required", released=True, resources_retired=True)
        await controller.reconcile_hyprland_owner(context, sid, stopped.generation)
        provider.reconcile_owner.assert_awaited_once()
        provider.retire_owner.assert_awaited_once()
    else:
        with pytest.raises(ComputerError, match="stale_generation"):
            attest(store, grant)
        attest(store, stopped)
        provider.reconnect_owner.assert_not_awaited()

    assessment = store.recovery_status(sid)
    assert assessment["status"] == "fresh_target_required"
    assert assessment["recovery_generation"] == pending.grant_generation
    assert store._hyprland_recovery_record(sid)["recovery_command_id"] == (
        pending.old_grant["recovery_command_id"])
    assert assessment["continuation_cancelled"] is True
    assert assessment["released"] is (cleanup == "native")
    assert assessment["resources_retired"] is (cleanup == "native")
    assert assessment["receiver_release_verified"] is False
    assert assessment["runtime_qualified"] is False
    assert not backend.input_supported and not controller._live

    path = Path(store.db.execute("PRAGMA database_list").fetchone()[2])
    evidence_path = store.evidence_path
    store.close()
    reopened = ComputerStore(path, evidence_path)
    controller.store = reopened  # fixture owns the replacement connection
    restarted = ComputerController(reopened, lambda _: backend, lambda _: True, enabled=True)
    assert not restarted._live
    assert reopened.get_session(sid) == stopped
    assert reopened.get_recovery_pending(sid) == pending
    assert pending.old_grant["task_hints"] == {"goal": "finish the original document"}
    assert reopened.hyprland_owner(sid) == owner
    assert reopened.cleanup(sid) == original_cleanup
    assert reopened.recovery_status(sid) == assessment
    with pytest.raises(ComputerError, match="hyprland_reconciliation_required"):
        reopened.create_session(context, platform="wayland", environment="existing_session",
                                backend="hyprland", recovery_session_id=sid,
                                recovery_generation=stopped.generation)
    assert reopened.get_session(sid) == stopped


@pytest.mark.parametrize("qualified", [False, True])
async def test_compositor_death_cannot_manufacture_native_absence(qualified, durable):
    coordinator = HyprlandCrossIncarnationRecovery(
        HyprlandRetirementCapability(runtime_qualified=qualified))
    provider = SimpleNamespace(prove_resource_absence=AsyncMock())
    result = await coordinator.reconcile(provider=provider, handle=durable[1], successor=None,
                                         command_id="retire", checkpoint=AsyncMock())
    assert not result.cleanup["released"] and not result.cleanup["resources_retired"]
    assert result.cleanup["unknown_release"]
    provider.prove_resource_absence.assert_not_awaited()
