"""Guidance follows local release truth without granting input or replay."""
import pytest

from src.computer.error_guidance import failure_guidance, guidance


@pytest.mark.parametrize("reason", ["stale_generation", "resume_unavailable"])
def test_session_state_error_requests_status_not_unconditional_operator(reason):
    result = guidance(reason, safe_receipt=True)
    assert result["next_action"] == "inspect_session_status"
    assert result["recoverable"] is True
    assert result["replay_permitted"] is False
    assert "quarantined" in result["instruction"]
    assert guidance(reason, terminal=True)["terminal"] is True
    assert guidance(reason)["terminal"] is True


def test_missing_native_ack_does_not_override_confirmed_local_release():
    result = failure_guidance({
        "reason": "stale_source_binding", "release_ack": False,
        "execution": {"released": True}, "receiver_release_verified": False,
    })
    assert result["next_action"] == "observe_fresh"
    assert result["terminal"] is False
    assert result["release_ack"] is False
    assert result["receiver_release_verified"] is False
    assert result["replay_permitted"] is False


@pytest.mark.parametrize("negative", [
    {"execution": {"released": False}}, {"released": False},
    {"release_confirmed": False}, {"uncertain_outcome": True},
    {"state": "quarantined"}, {"status": "unknown"},
    {"cleanup": {"complete": False}},
])
def test_actual_uncertainty_or_cleanup_failure_still_fences(negative):
    result = failure_guidance({
        "reason": "stale_generation", "release_ack": False,
        "execution": {"released": True}, **negative,
    })
    assert result["terminal"] is True
    assert result["next_action"] == "operator_intervention_required"
    assert result["replay_permitted"] is False


def test_missing_ack_without_any_local_release_proof_still_fences():
    result = failure_guidance({"reason": "stale_source_binding", "release_ack": False})
    assert result["terminal"] is True
