"""Controller-boundary guidance is evidence-based, never a reason allowlist."""

import json
from unittest.mock import AsyncMock

import pytest

from src.computer.error_guidance import (
    InputBoundaryError,
    audit_reason_code,
    failure_guidance,
    guidance,
    input_outcome,
)
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
    "unsupported_operation", "target_inventory_unavailable",
    "inventory_targets_unsupported", "operation_unavailable", "focus_preflight_refused",
    "focus_candidate_unavailable", "focus_candidate_changed",
    "focus_full_observation_required", "focus_visual_target_changed",
    "focus_transition_unavailable",
])
def test_preflight_non_dispatch_can_retry_with_supported_operation(reason):
    result = failure_guidance({
        "status": "rejected",
        "reason": reason,
        "execution": {"injected": False, "sent": False},
    })
    assert result["input_outcome"] == "not_dispatched"
    assert result["terminal"] is False and result["recoverable"] is True
    assert result["next_action"] == "retry_with_supported_operation"
    assert "safe to retry with a supported operation" in result["instruction"]
    assert "RELEASE-ALL" not in result["instruction"]
    assert result["replay_permitted"] is False


@pytest.mark.parametrize("receipt,expected", [
    ({"reason": "unsupported_operation"}, "release_unknown"),
    ({"reason": "unsupported_operation", "execution": {"sent": False}}, "not_dispatched"),
    ({"reason": "input_release_unknown", "execution": {"sent": True, "released": True}},
     "released_verified"),
    ({"reason": "anything", "execution": {"sent": True, "released": False}}, "release_unknown"),
    ({"reason": "anything", "released": True, "verification": {"released": False}},
     "release_unknown"),
])
def test_input_outcome_uses_receipt_evidence_not_reason(receipt, expected):
    assert input_outcome(receipt) == expected


def test_audit_reason_is_whitelisted_and_never_contains_desktop_text():
    assert audit_reason_code("unsupported_operation") == "unsupported_operation"
    assert audit_reason_code("password_is_hunter2") == "computer_rejected"
    assert audit_reason_code("Tabby document contents") == "computer_rejected"


def test_x1_exact_capability_envelope_is_safe_non_dispatch():
    envelope = {
        "status": "unsupported_operation", "backend": "x11",
        "operation": "inventory_targets", "dispatch": "none",
        "supported_next_step": "start",
    }
    result = failure_guidance(envelope)
    assert result["input_outcome"] == "not_dispatched"
    assert result["terminal"] is False
    assert result["next_action"] == "retry_with_supported_operation"
    assert failure_guidance({**envelope, "backend": "unsafe"})["input_outcome"] == "release_unknown"
    assert failure_guidance({**envelope, "dispatch": "maybe"})["input_outcome"] == "release_unknown"


def test_focus_post_dispatch_reasons_never_claim_non_dispatch():
    dispatched = {
        "status": "not_satisfied", "reason": "focus_not_obtained",
        "execution": {"injected": True, "sent": True, "released": True},
    }
    result = failure_guidance(dispatched)
    assert result["input_outcome"] == "released_verified"
    assert result["next_action"] == "observe_fresh"
    assert result["replay_permitted"] is False


def test_focus_after_action_requests_fresh_observation_without_typing_authority():
    result = failure_guidance({
        "status": "executed", "reason": "focus_requires_new_observation",
        "execution": {"injected": True, "sent": True, "released": True},
    })
    assert result["input_outcome"] == "released_verified"
    assert result["next_action"] == "observe_fresh"
    assert "no typing authority" in result["instruction"]


@pytest.mark.parametrize("reason", ["focus_not_obtained", "focus_requires_new_observation"])
def test_focus_post_dispatch_reason_without_evidence_remains_unknown(reason):
    result = failure_guidance({"status": "not_satisfied", "reason": reason})
    assert result["input_outcome"] == "release_unknown"
    assert result["terminal"] is True
    assert result["next_action"] == "operator_intervention_required"


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
