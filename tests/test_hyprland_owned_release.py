"""Local ownership release is not a compositor or receiver acknowledgement."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
import time

import pytest

from src.computer.runtime.hyprland_guardian import HyprlandGuardian, owned_release_v1
from src.computer.runtime.wayland_guardian import WaylandGuardian
from src.computer.runtime.wayland_guardian import WaylandGuardianError


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


@pytest.mark.parametrize("fault", [None, "ledger", "sent", "proof", "closed"])
async def test_preinput_rejection_restores_group_refresh_only_with_clean_ledger(monkeypatch, fault):
    owner = HyprlandGuardian("/unused", 0)
    owner._child = SimpleNamespace(returncode=None)
    owner._ready = {"scope_lease_v1": True}
    owner._scope_deadline = time.monotonic_ns() + 1_000_000_000
    receipt = {"event": "action_rejected", "reason": "invalid-command",
               "input_was_sent": False, "release_sent": True,
               "release_acknowledged": True, "receiver_release_verified": False,
               "owned_release_v1": {"release_sent": True, "ledger_empty": True,
                                    "resources_closed": False}}
    if fault == "ledger":
        receipt["owned_release_v1"]["ledger_empty"] = False
    elif fault == "sent":
        receipt["input_was_sent"] = True
    elif fault == "proof":
        receipt.pop("owned_release_v1")
    elif fault == "closed":
        receipt["owned_release_v1"]["resources_closed"] = True
    monkeypatch.setattr(owner, "_send", AsyncMock())
    owner._events.put_nowait(receipt)
    with pytest.raises(WaylandGuardianError):
        await owner.act("K unsupported", scope_deadline_ns=owner._scope_deadline)
    assert not owner._active
    assert owner.application_group_refresh_ready is (fault is None)


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
