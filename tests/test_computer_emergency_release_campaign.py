"""Emergency ledger release resolves input uncertainty without desktop IO."""

from dataclasses import replace
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from src.computer.store import ComputerStore
from tests.test_computer_hyprland_turnloop_r33 import action, call, observe, start
from tests.test_computer_hyprland_turnloop_r33 import normal as normal
from tests.test_computer_operator_auth_r5 import bound_operator
from tests.test_hyprland_recovery_controller import rig as rig


def incident(store, grant, phase="unknown_release"):
    return store.begin_hyprland_reconciliation(
        grant, phase=phase, reason=phase,
        old_grant={"generation": grant.generation,
                   "consent_generation": grant.consent_generation,
                   "task_hints": {"goal": "draw"}, "authorizes_input": False,
                   "recovery_command_id": "a" * 32})


async def test_unknown_release_can_close_and_continue_with_new_consent(normal):
    grant = await start(normal)
    await observe(normal, grant)
    old = action(normal, grant)
    controller = normal.service.controller
    store = controller.store
    sid = grant["session_id"]
    pending_grant = incident(store, store.get_session(sid))
    with bound_operator(normal.bot, "alice", "browser"):
        result = await normal.manager.operator_release_owned_input(
            session_id=sid, generation=pending_grant.generation,
            owner_id="alice", web_session_id="browser")
    assert result["state"] == "paused"
    assert result["recovery"]["status"] == "operator_ledger_released"
    assert store.get_recovery_pending(sid) is None
    assert normal.recovery == ["release-all"]
    assert controller._live[sid].revoked
    with pytest.raises(ComputerError, match="resume_unavailable"):
        await controller.session(normal.service._context(normal.state), {
            "operation": "resume", "session_id": sid,
            "generation": result["session_generation"]})
    with pytest.raises(ComputerError, match="stale_generation"):
        await controller.act(normal.service._context(normal.state), old)
    assert not normal.transports[0].commands
    closed = await controller.session(normal.service._context(normal.state), {
        "operation": "close", "session_id": sid})
    assert closed["state"] == "closed"
    db_path = store.db.execute("PRAGMA database_list").fetchone()[2]
    reopened = ComputerStore(db_path, store.evidence_path)
    try:
        assert reopened.get_session(sid).state == "closed"
        assert reopened.get_recovery_pending(sid) is None
    finally:
        reopened.close()
    fresh = await start(normal)
    assert fresh["session_id"] != sid
    await observe(normal, fresh)
    result = await normal.runner._run_one_tool(normal.state, call(
        "computer_act", **action(normal, fresh, "renewed-after-incident")))
    assert "Image loaded" in result["content"]
    assert len(normal.transports[-1].commands) == 1


async def test_successful_release_cannot_clear_newer_incident(rig, tmp_path):
    controller, store, context, grant, live, _, _ = rig
    grant = incident(store, grant)

    async def recover():
        pending = store.get_recovery_pending(grant.session_id)
        store.transition_recovery_pending(
            grant.session_id, recovery_generation=pending.recovery_generation,
            grant_generation=pending.grant_generation, stop_epoch=pending.stop_epoch,
            phase="native_continuity_lost", reason="native_continuity_lost",
            attempt=0, next_retry_at=None)
        return {"released": True, "input_revoked": True, "capture_revoked": True}

    live.backend.recover_owned_input = AsyncMock(side_effect=recover)
    with pytest.raises(ComputerError, match="grant_revoked"):
        await controller.operator_release_owned_input(
            replace(context, surface="webui"), grant.session_id, grant.generation)
    reopened = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    try:
        assert reopened.get_session(grant.session_id).state == "quarantined"
        assert reopened.get_recovery_pending(grant.session_id).phase == "native_continuity_lost"
        assert live.revoked
    finally:
        reopened.close()


async def test_emergency_resolution_state_and_history_roll_back_together(
        rig, tmp_path, monkeypatch):
    controller, store, context, grant, live, _, _ = rig
    grant = incident(store, grant)
    pending = store.get_recovery_pending(grant.session_id)
    prior = store._hyprland_recovery_record(grant.session_id)
    live.backend.recover_owned_input = AsyncMock(return_value={
        "released": True, "input_revoked": True, "capture_revoked": True})
    set_state = store.set_state

    def fail_paused(*args, **kwargs):
        result = set_state(*args, **kwargs)
        if args[1] == "paused":
            raise OSError("injected resolution failure")
        return result

    monkeypatch.setattr(store, "set_state", fail_paused)
    with pytest.raises(OSError, match="injected resolution failure"):
        await controller.operator_release_owned_input(
            replace(context, surface="webui"), grant.session_id, grant.generation)
    reopened = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    try:
        assert reopened.get_session(grant.session_id).state == "quarantined"
        assert reopened.get_recovery_pending(grant.session_id) == pending
        assert reopened._hyprland_recovery_record(grant.session_id) == prior
        assert live.revoked
    finally:
        reopened.close()


@pytest.mark.parametrize("phase", ["unknown_release", "native_continuity_lost"])
async def test_emergency_release_exception_keeps_reopenable_fence(rig, tmp_path, phase):
    controller, store, context, grant, live, _, _ = rig
    grant = incident(store, grant, phase)
    pending = store.get_recovery_pending(grant.session_id)
    live.backend.recover_owned_input = AsyncMock(side_effect=OSError("release failed"))
    live.backend.detach = AsyncMock(return_value={"stopped": False, "released": False})
    with pytest.raises(OSError, match="release failed"):
        await controller.operator_release_owned_input(
            replace(context, surface="webui"), grant.session_id, grant.generation)
    reopened = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    try:
        assert reopened.get_session(grant.session_id).state == "quarantined"
        assert reopened.get_recovery_pending(grant.session_id) == pending
        assert live.revoked
    finally:
        reopened.close()


def test_ledger_resolution_cannot_clear_native_continuity_incident(rig, tmp_path):
    _, store, context, grant, _, _, _ = rig
    grant = incident(store, grant, "native_continuity_lost")
    pending = store.get_recovery_pending(grant.session_id)
    with pytest.raises(ComputerError, match="grant_revoked"):
        store.finish_emergency_ledger_release(grant, pending)
    reopened = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    try:
        assert reopened.get_recovery_pending(grant.session_id) == pending
        with pytest.raises(ComputerError, match="session_busy"):
            reopened.create_session(context, platform="wayland",
                                    environment="existing_session", backend="hyprland")
    finally:
        reopened.close()
