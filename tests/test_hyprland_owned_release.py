"""Local ownership release is not a compositor or receiver acknowledgement."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime.hyprland_guardian import HyprlandGuardian, owned_release_v1
from src.computer.runtime.wayland_guardian import WaylandGuardian


def terminal():
    return {
        "event": "closed", "release_sent": True, "release_acknowledged": False,
        "receiver_release_verified": False,
        "owned_release_v1": {"release_sent": True, "ledger_empty": True,
                             "resources_closed": True},
        "native_failure": {"command": "action", "scope_operation": "release_all",
            "scope_error": "none", "input_loss_v1": {
                "terminal_cause": "orderly", "scope_outcome": "transport_lost",
                "events_queued": 1, "events_submitted": 1,
                "release_submission": "submitted", "release_ack": "transport_lost",
                "resource_closure": "complete"}},
    }


@pytest.mark.parametrize("field,value", [
    ("release_sent", False), ("ledger_empty", False), ("resources_closed", False),
    ("ledger_empty", 1), ("release_sent", None), ("extra", True),
])
def test_bad_local_evidence(field, value):
    row = terminal()
    row["owned_release_v1"][field] = value
    assert not owned_release_v1(row, closed=True)


def test_no_legacy_fallback():
    row = terminal()
    del row["owned_release_v1"]
    row["release_acknowledged"] = True
    assert not owned_release_v1(row, closed=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("reaped", [True, False])
async def test_close_local_proof_without_ack(monkeypatch, reaped):
    owner = HyprlandGuardian("/unused", 0)
    owner._child = SimpleNamespace(returncode=0)
    owner._closed_receipt = True
    owner._last_terminal = terminal()
    monkeypatch.setattr(WaylandGuardian, "close", AsyncMock(return_value={
        "process_reaped": reaped, "release_ack": False}))
    result = await owner.close()
    assert result["release_confirmed"] is reaped
    assert result["native_release_acknowledged"] is False
    assert result["release_ack"] is False
    assert result["receiver_release_verified"] is False
