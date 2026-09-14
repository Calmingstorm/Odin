from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from tests.computer.test_hyprland_backend import action, backend  # noqa: F401


async def test_preflight_capture_failure_is_known_no_input(backend, monkeypatch):
    frame = await backend.observe()
    monkeypatch.setattr(backend, "_capture", AsyncMock(side_effect=ComputerError("capture_failed")))
    receipt = await backend.act(action(frame))
    assert receipt["injected"] is False and receipt["released"] is True
    assert receipt["diagnostics"]["phase"] == "preflight"
    assert not backend._guardian.commands


async def test_preflight_does_not_mask_previous_unknown(backend):
    frame = await backend.observe()
    backend._release_failed = True
    with pytest.raises(ComputerError):
        await backend.act(action(frame))


async def test_dispatch_error_preserves_ledger_cleanup(backend, monkeypatch):
    frame = await backend.observe()
    monkeypatch.setattr(backend._guardian, "act", AsyncMock(side_effect=ComputerError("dispatch_failed")))
    monkeypatch.setattr(backend._guardian, "close", AsyncMock(return_value={
        "release_ack": False, "release_confirmed": True, "unknown_release": False,
    }))
    receipt = await backend.act(action(frame))
    assert receipt["status"] == "interrupted"
    assert receipt["injected"] is None and receipt["released"] is True
    assert receipt["release_basis"] == "guardian_ledger_drained"
    assert backend._frame is None


@pytest.mark.parametrize("receipt", [{}, {"release_confirmed": 1},
    {"release_confirmed": True, "unknown_release": True}])
def test_release_proof_is_explicit(backend, receipt):
    assert not backend._release_ack(receipt)


async def test_normal_receipt_retains_ledger_basis(normal, monkeypatch):
    from tests.test_computer_hyprland_turnloop_r33 import start, observe, action as turn_action, call, NativeTransport
    from tests.test_computer_hyprland_receipts_r33 import durable

    grant = await start(normal)
    await observe(normal, grant)
    original = NativeTransport.act

    async def ledger(transport, command, **kwargs):
        result = await original(transport, command, **kwargs)
        result.update(release_ack=False, release_confirmed=True, unknown_release=False)
        return result

    monkeypatch.setattr(NativeTransport, "act", ledger)
    output = await normal.runner._run_one_tool(normal.state, call("computer_act", **turn_action(normal, grant)))
    result = durable(normal, grant, "first")
    assert result.get("execution", {}).get("released") is True, (result, output)
    assert result["input_safety"]["release_basis"] == "guardian_ledger_drained"
    assert result["input_safety"]["recovery"] == "fresh_observation_and_replan_no_replay"


from tests.test_computer_hyprland_turnloop_r33 import normal  # noqa: E402,F401


async def test_dispatch_unknown_close_stays_unknown(backend, monkeypatch):
    frame = await backend.observe()
    monkeypatch.setattr(backend._guardian, "act", AsyncMock(side_effect=ComputerError("dispatch_failed")))
    monkeypatch.setattr(backend._guardian, "close", AsyncMock(return_value={}))
    with pytest.raises(ComputerError):
        await backend.act(action(frame))
    assert backend._release_failed


async def test_dispatch_cleanup_ledger_is_durable(normal, monkeypatch):
    from tests.test_computer_hyprland_turnloop_r33 import start, observe, action as turn_action, call, NativeTransport
    from tests.test_computer_hyprland_receipts_r33 import durable

    grant = await start(normal)
    await observe(normal, grant)
    monkeypatch.setattr(NativeTransport, "act", AsyncMock(side_effect=ComputerError("dispatch_failed")))
    monkeypatch.setattr(NativeTransport, "close", AsyncMock(return_value={
        "release_confirmed": True, "release_ack": False, "unknown_release": False,
        "process_reaped": True,
    }))
    await normal.runner._run_one_tool(normal.state, call("computer_act", **turn_action(normal, grant)))
    result = durable(normal, grant, "first")
    assert result["status"] == "interrupted"
    assert result["execution"]["released"] is True
    assert result["input_safety"]["release_basis"] == "guardian_ledger_drained"
