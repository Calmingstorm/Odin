"""Unknown effect is reconciled visually after confirmed release, never replayed."""
import pytest

from src.computer.error_guidance import failure_guidance


def test_confirmed_release_unknown_effect_reconciles_without_replay():
    result = failure_guidance({
        "status": "interrupted", "reason": "effect_unknown_reconcile_no_replay",
        "execution": {"injected": True, "sent": True, "released": True},
        "verification": {"status": "unavailable",
                         "next_action": "start_fresh_session_and_reconcile"},
    })
    assert result["recoverable"] is True
    assert result["next_action"] == "inspect_session_and_reconcile_effect"
    assert result["replay_permitted"] is False
    assert result["status"] == "interrupted"
    assert "DIFFERENT action" in result["instruction"]


@pytest.mark.parametrize("negative", [
    {"execution": {"released": False}}, {"state": "quarantined"},
    {"release_confirmed": False}, {"uncertain_outcome": True},
    {"cleanup": {"complete": False}},
])
def test_effect_reconciliation_never_overrides_unknown_release(negative):
    result = failure_guidance({
        "status": "interrupted", "reason": "effect_unknown_reconcile_no_replay",
        "execution": {"injected": True, "released": True}, **negative,
    })
    assert result["terminal"] is True
    assert result["replay_permitted"] is False
