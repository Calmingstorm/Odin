"""A known no-input stale frame is recoverable, not unknown-release guidance."""
import pytest

from src.computer.effects import execution_receipt
from src.computer.error_guidance import failure_guidance


@pytest.mark.parametrize("reason", [
    "hyprland_observation_changed", "hyprland_scope_evidence_expired",
    "hyprland_capture_scope_changed", "hyprland_focus_changed_before_dispatch",
])
def test_no_input_refusal_preserves_bounded_reason_and_replan(reason):
    result = execution_receipt({
        "status": "unavailable", "injected": False, "released": True,
        "reason": reason, "diagnostics": {"phase": "preflight"},
    }, {"status": "unavailable", "reason": "backend_refused"})
    assert result["reason"] == reason
    assert result["execution"] == {"injected": False, "sent": False, "released": True}
    guidance = failure_guidance(result)
    assert guidance["recoverable"] is True
    assert guidance["replay_permitted"] is False


@pytest.mark.parametrize("raw", [
    {"injected": True}, {"released": False},
    {"reason": "secret-native-message"},
    {"diagnostics": {"phase": "dispatch"}},
])
def test_non_preflight_or_unknown_safety_cannot_gain_reason_exception(raw):
    result = execution_receipt({
        "status": "unavailable", "injected": False, "released": True,
        "reason": "hyprland_observation_changed", "diagnostics": {"phase": "preflight"},
        **raw,
    }, {"status": "unavailable", "reason": "backend_refused"})
    assert result["reason"] != "hyprland_observation_changed"
    assert "secret-native-message" not in str(result)
