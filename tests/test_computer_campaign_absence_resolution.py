"""Real SQLite resolution/reopen, no native sessions or input."""
import pytest

from src.computer.store import ComputerStore
from tests.test_hyprland_absence_store import absence, pending, record  # noqa: F401
from tests.test_hyprland_durable_reconnect import durable  # noqa: F401


@pytest.mark.parametrize("resolution", ["attestation", "cancelled_attestation", "absence"])
def test_qualified_absence_resolution_is_valid_on_reopen(pending, tmp_path, resolution):
    store, _, grant, owner = pending
    record(store, grant, owner)
    if resolution == "cancelled_attestation":
        store.cancel_hyprland_continuation(grant.session_id)
    acknowledged = resolution != "absence"
    result = ({"status": "operator_acknowledged_unverified",
               "reason": "operator_verified_external_cleanup",
               "recorded_processes_absent": True, "operator_id": "owner"}
              if acknowledged else {"status": "absence_verified", "reason": "owned_runtime_gone"})
    resolved = store.finish_recovery(grant, result, acknowledged=acknowledged)
    expected_state = "quarantined" if resolution == "attestation" else "closed"
    assert resolved.state == expected_state
    reopened = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    try:
        assert reopened.get_session(grant.session_id).state == expected_state
        assessment = reopened._hyprland_recovery_record(grant.session_id)
        assert not assessment["runtime_qualified"]
        assert assessment["qualified_absence_history"]["retirement_evidence"] == absence(owner)
        assert "retirement_evidence" not in assessment
        public = reopened.recovery_status(grant.session_id)
        assert "qualified_absence_history" not in public
        assert public["released"] is False and public["receiver_release_verified"] is False
    finally:
        reopened.close()
