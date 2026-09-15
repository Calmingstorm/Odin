"""Controller-boundary guidance is evidence-based, never a reason allowlist."""

import json
from unittest.mock import AsyncMock

import pytest

from src.computer.error_guidance import InputBoundaryError, failure_guidance, guidance
from src.computer.models import ComputerError
from tests.test_computer_hyprland_turnloop_r33 import action, call, observe, start
from tests.test_computer_hyprland_turnloop_r33 import normal as normal


@pytest.mark.parametrize("reason", [
    "hyprland_inventory_owned_recovery_pending", "hyprland_owned_recovery_pending",
])
@pytest.mark.parametrize("evidence", [
    {}, {"released": True}, {"released": False}, {"unknown_release": True},
    {"status": "unknown"}, {"injected": False, "released": False},
])
def test_pending_owned_recovery_never_invites_continuation(reason, evidence):
    result = failure_guidance({"reason": reason, **evidence})
    assert result["terminal"] is True and result["recoverable"] is False
    assert result["next_action"] == "inspect_release_evidence"
    assert result["replay_permitted"] is False
    assert "CONTINUE" not in result["instruction"]
    assert "did not establish clean release" in result["instruction"]
    assert guidance(reason, terminal=True, safe_receipt=True)["terminal"] is True


@pytest.mark.parametrize("reason", [
    "hyprland_fresh_modal_binding_required", "hyprland_resume_retryable",
])
@pytest.mark.parametrize("evidence", [
    None, {"sent": False, "released": False},
    {"sent": False, "unknown_release": True},
    {"sent": False, "status": "unknown"},
])
async def test_service_reason_alone_or_negative_receipt_stays_terminal(
    normal, monkeypatch, reason, evidence,
):
    grant = await start(normal)
    await observe(normal, grant)
    request = action(normal, grant)
    error = (ComputerError(reason) if evidence is None else InputBoundaryError(
        reason, execution=evidence, state="paused",
    ))
    monkeypatch.setattr(normal.service.controller, "act", AsyncMock(side_effect=error))
    block = call("computer_act", **request)
    with normal.service.foreground(normal.state, block):
        delivered = await normal.service._tool(block.name, request)
    result = json.loads(delivered.output)
    assert delivered.ok is False
    assert result["reason"] == reason
    assert result["recoverable"] is False and result["terminal"] is True
    assert result["next_action"] == "operator_intervention_required"
    assert result["replay_permitted"] is False
    assert "CONTINUE" not in result["instruction"]
    assert "RELEASE-ALL" in result["instruction"]


@pytest.mark.parametrize("reason", [
    "hyprland_inventory_owned_recovery_pending", "hyprland_owned_recovery_pending",
])
async def test_service_unknown_pending_recovery_retains_terminal_guidance(
    normal, monkeypatch, reason,
):
    grant = await start(normal)
    await observe(normal, grant)
    request = action(normal, grant)
    monkeypatch.setattr(normal.service.controller, "act", AsyncMock(return_value={
        "status": "unknown", "reason": reason, "released": False, "unknown_release": True,
    }))
    block = call("computer_act", **request)
    with normal.service.foreground(normal.state, block):
        delivered = await normal.service._tool(block.name, request)
    result = json.loads(delivered.output)
    assert delivered.ok is False and delivered.uncertain_outcome is True
    assert delivered.error == "outcome_unknown"
    assert result["terminal"] is True and result["recoverable"] is False
    assert result["next_action"] == "inspect_release_evidence"
    assert result["replay_permitted"] is False
    assert "CONTINUE" not in result["instruction"]
