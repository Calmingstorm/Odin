"""Integrated native-loss fences with fake OS transports and real durable store."""

import json
import re
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import recovery
from src.computer.runtime.hyprland_identity import HyprlandIdentityError
from src.computer.runtime.hyprland_scope import HyprlandScopeFailure
from src.computer.store import ComputerStore
from tests.test_computer_hyprland_turnloop_r33 import action, call, observe, start
from tests.test_computer_hyprland_turnloop_r33 import normal as normal
from tests.test_computer_operator_auth_r5 import bound_operator


def _reopen_store(store):
    path = Path(store.db.execute("PRAGMA database_list").fetchone()[2])
    return ComputerStore(path, store.evidence_path)


@pytest.mark.parametrize("failure", [
    HyprlandIdentityError("hyprland_process_changed"),
    HyprlandIdentityError("hyprland_peer_mismatch"),
    HyprlandScopeFailure("hyprland_provider_owner_changed"),
    HyprlandScopeFailure("hyprland_scope_eof"),
    ComputerError("hyprland_provider_owner_changed"),
    ComputerError("hyprland_session_revoked"),
    TimeoutError(),
    ConnectionError(),
])
async def test_native_continuity_loss_preserves_intent_not_authority(normal, monkeypatch, failure):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    sid = grant["session_id"]
    live = controller._live[sid]
    live.task_context.hints = {"goal": "Finish the blue sketch", "color": "blue"}
    old = action(normal, grant)
    monkeypatch.setattr(live.backend, "observe", AsyncMock(side_effect=failure))
    result = await normal.runner._run_one_tool(normal.state, call("computer_observe", **grant))
    assert "hyprland_fresh_target_required" in result["content"]
    current = controller.store.get_session(sid)
    assert current.state == "quarantined"
    assert current.generation > grant["generation"]
    assert live.revoked and not live.observations
    assert sid not in controller._delivered_observations
    pending = controller.store.get_recovery_pending(sid)
    assert pending.phase == "native_continuity_lost"
    assert pending.old_grant["task_hints"]["goal"] == "Finish the blue sketch"
    assert set(pending.old_grant) == {"generation", "consent_generation", "task_hints",
                                      "authorizes_input", "recovery_command_id"}
    assert re.fullmatch(r"[a-f0-9]{32}", pending.old_grant["recovery_command_id"])
    assert pending.old_grant["authorizes_input"] is False
    status = controller._public_session(current)
    assert status["native_reconciliation"]["required"] is True
    assert status["input_supported"] is False
    assert status["native_reconciliation"]["replay_allowed"] is False
    await controller._stop(sid, "closed")
    assert controller.store.get_session(sid).state == "quarantined"
    reopened = _reopen_store(controller.store)
    try:
        assert reopened.get_session(sid) == controller.store.get_session(sid)
        assert reopened.get_recovery_pending(sid) == pending
    finally:
        reopened.close()
    await normal.runner._run_one_tool(normal.state, call("computer_act", **old))
    assert not normal.transports[0].commands
    with pytest.raises(ComputerError, match="session_busy"):
        controller.store.create_session(normal.service._context(normal.state), None,
                                        platform="wayland", environment="existing_session",
                                        backend="hyprland")


async def test_unknown_release_survives_clean_detach_restart_and_cannot_replay(normal, monkeypatch):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    sid = grant["session_id"]
    live = controller._live[sid]
    live.task_context.hints = {"goal": "Keep my unfinished task"}
    old = action(normal, grant)
    monkeypatch.setattr(live.backend, "act", AsyncMock(side_effect=ConnectionError()))
    await normal.runner._run_one_tool(normal.state, call("computer_act", **old))
    pending = controller.store.get_recovery_pending(sid)
    assert pending.phase == "unknown_release"
    assert controller.store.get_session(sid).state == "quarantined"
    raw = controller.store.db.execute(
        "SELECT result FROM receipts WHERE session_id=?", (sid,)).fetchone()[0]
    receipt = json.loads(raw)
    assert receipt["status"] == "unknown"
    assert receipt["execution"]["released"] is False
    assessment = controller.store.recovery_status(sid)
    assert assessment["status"] == "operator_release_required"
    assert assessment["released"] is False
    assert assessment["resources_retired"] is False
    # A later cooperative detach may finish local cleanup, but cannot erase
    # the persisted unknown outcome or authorize replay.
    await controller._stop(sid, "closed")
    assert controller.store.cleanup(sid)["complete"] is True
    controller.store.recover()
    assert controller.store.get_recovery_pending(sid) == pending
    assert controller.store.get_session(sid).state == "quarantined"
    await normal.runner._run_one_tool(normal.state, call("computer_act", **old))
    live.backend.act.assert_awaited_once()
    assert not normal.transports[0].commands


async def test_focus_loss_does_not_become_compositor_loss(normal, monkeypatch):
    grant = await start(normal)
    controller = normal.service.controller
    live = controller._live[grant["session_id"]]
    monkeypatch.setattr(live.backend, "observe", AsyncMock(
        side_effect=ComputerError("input_focus_unavailable")))
    await normal.runner._run_one_tool(normal.state, call("computer_observe", **grant))
    assert controller.store.get_recovery_pending(grant["session_id"]) is None
    assert controller.store.get_session(grant["session_id"]).state == "active"


async def test_fence_persistence_failure_still_revokes_and_detaches(normal, monkeypatch):
    grant = await start(normal)
    controller = normal.service.controller
    live = controller._live[grant["session_id"]]
    monkeypatch.setattr(live.backend, "observe", AsyncMock(side_effect=ConnectionError()))

    def fail(*args, **kwargs):
        raise OSError("disk unavailable")

    monkeypatch.setattr(ComputerStore, "begin_hyprland_reconciliation", fail)
    await normal.runner._run_one_tool(normal.state, call("computer_observe", **grant))
    assert live.revoked and not live.observations
    assert live.backend._closed
    assert controller.store.get_session(grant["session_id"]).state == "quarantined"


async def test_explicit_operator_reconciliation_frees_new_session_not_old_action(
    normal, monkeypatch,
):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    sid = grant["session_id"]
    live = controller._live[sid]
    old = action(normal, grant)
    # Only the original pinned incarnation's exit plus local resource closure
    # permits retirement. Neither fact certifies release of its native ledger.
    monkeypatch.setattr(live.backend._incarnation, "exited", lambda: True)
    monkeypatch.setattr(live.backend._guardian, "release_ack", False)
    local_close = AsyncMock(wraps=live.backend._guardian.close)
    monkeypatch.setattr(live.backend._guardian, "close", local_close)
    monkeypatch.setattr(live.backend, "act", AsyncMock(side_effect=ConnectionError()))
    await normal.runner._run_one_tool(normal.state, call("computer_act", **old))
    assert sid not in controller._live
    local_close.assert_awaited_once()
    assert not live.backend._guardian.alive
    cleanup = live.backend._recovery_result.cleanup
    assert cleanup["guardian_process_reaped"] is True
    assert cleanup["scope_connection_closed"] is True
    assert cleanup["retirement_basis"] == "original_compositor_pidfd_exited"
    assert cleanup["resources_retired"] is True
    assert cleanup["unknown_release"] is True
    assert cleanup["released"] is False and cleanup["release_ack"] is False
    assert cleanup["receiver_release_verified"] is False
    assessment = controller.store.recovery_status(sid)
    assert assessment["status"] == "operator_release_required"
    assert assessment["resources_retired"] is True and assessment["released"] is False
    current = controller.store.get_session(sid)
    inspector = AsyncMock(return_value={"status": "attestation_eligible"})
    monkeypatch.setattr(recovery, "verify_reconciliation_prerequisites", inspector)
    with bound_operator(normal.bot, "alice", "browser"):
        result = await normal.manager.operator_reconcile(
            owner_id="alice", web_session_id="browser", session_id=sid,
            generation=current.generation,
            acknowledgment=f"ACKNOWLEDGE UNVERIFIED CLEANUP {sid}",
        )
    assert result["state"] == "closed"
    assert result["recovery"]["complete"] is False
    assert result["recovery"]["status"] == "operator_acknowledged_unverified"
    inspector.assert_awaited_once()
    historical = controller._public_session(controller.store.get_session(sid))
    assert historical["native_reconciliation"]["required"] is False
    before = json.loads(controller.store.db.execute(
        "SELECT result FROM receipts WHERE session_id=?", (sid,)).fetchone()[0])
    new = await start(normal)
    assert new["session_id"] != sid
    await normal.runner._run_one_tool(normal.state, call("computer_act", **old))
    assert not normal.transports[-1].commands
    after = json.loads(controller.store.db.execute(
        "SELECT result FROM receipts WHERE session_id=?", (sid,)).fetchone()[0])
    assert before == after and after["status"] == "unknown"
    reopened = _reopen_store(controller.store)
    try:
        assert reopened.get_session(sid).state == "closed"
        assert reopened.get_recovery_pending(sid).phase == "unknown_release"
        assert reopened.recovery_status(sid)["status"] == "operator_acknowledged_unverified"
    finally:
        reopened.close()


async def test_prior_handoff_cannot_hide_unknown_release(normal, monkeypatch):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    sid = grant["session_id"]
    current = controller.store.get_session(sid)
    controller.store.set_recovery_pending(
        current, recovery_generation=1, stop_epoch=0,
        phase="hyprland_handoff_pending", reason="no_input_stale_output",
        attempt=1, next_retry_at=None, old_grant={
            "grant_id": 1,
            "generation": current.generation,
            "consent_generation": current.consent_generation,
            "output_name": "DP-1",
            "source_id": "source-a",
            "application_identity": {
                "pid": 123,
                "uid": 1000,
                "start_ticks": 456,
                "exe": "/usr/bin/drawing",
                "exe_identity": [1, 2],
            },
        },
    )
    old = action(normal, grant)
    dispatch = AsyncMock(side_effect=ConnectionError())
    monkeypatch.setattr(controller._live[sid].backend, "act", dispatch)
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **old))
    assert dispatch.await_count == 1, result
    assert controller.store.get_recovery_pending(sid).phase == "unknown_release", result
    await controller._stop(sid, "closed")
    assert controller.store.get_session(sid).state == "quarantined"


async def test_failed_native_cleanup_remains_fenced_not_falsely_reconciled(normal, monkeypatch):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    sid = grant["session_id"]
    live = controller._live[sid]
    monkeypatch.setattr(live.backend, "observe", AsyncMock(
        side_effect=HyprlandScopeFailure("hyprland_provider_owner_changed")))
    # No original-incarnation exit or ledger retirement is proven. Do not drop
    # this adapter merely to make attestation or fresh-start paths work.
    live.backend._release_failed = True
    try:
        await normal.runner._run_one_tool(normal.state, call("computer_observe", **grant))
        assert controller._live[sid] is live and live.revoked
        assert not live.backend.input_supported and live.backend._frame is None
        assert live.backend._cleanup_evidence["hyprland_owned_connections_closed"] is False
        assessment = controller.store.recovery_status(sid)
        assert assessment["complete"] is False and assessment["released"] is False
        assert assessment["resources_retired"] is False
        assert assessment["receiver_release_verified"] is False
        current = controller.store.get_session(sid)
        with bound_operator(normal.bot, "alice", "browser"):
            with pytest.raises(ComputerError, match="recovery_unavailable"):
                await normal.manager.operator_reconcile(
                    owner_id="alice", web_session_id="browser", session_id=sid,
                    generation=current.generation,
                    acknowledgment=f"ACKNOWLEDGE UNVERIFIED CLEANUP {sid}",
                )
        assert controller.store.get_session(sid).state == "quarantined"
        assert not normal.transports[0].commands
    finally:
        # Teardown removes only the injected local fault, never ledger evidence.
        live.backend._release_failed = False
