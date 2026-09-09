"""R37 native failure persistence and cleanup regressions, isolated transports."""
import copy
import json

import pytest

from src.computer.models import ComputerError
from src.computer.runtime.hyprland_guardian import HyprlandGuardianError
from tests.test_computer_hyprland_turnloop_r33 import (
    NativeTransport,
    action,
    call,
    observe,
    start,
)
from tests.test_computer_hyprland_turnloop_r33 import normal as normal

DETAIL = {
    "command": "begin", "scope_operation": "arm", "scope_error": "human-input-held",
    "input_was_sent": False, "release_sent": True, "release_acknowledged": True,
    "diagnostics": {"phase": "release", "steps_planned": 0, "steps_completed": 0,
                    "release": "confirmed", "reason": "invalid-command"},
}


@pytest.mark.parametrize("storage_failure", [False, True])
async def test_native_refusal_durable_and_cleanup_even_when_storage_fails(
    normal, monkeypatch, storage_failure,
):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    store = controller.store
    backend = controller._live[grant["session_id"]].backend
    dispatched = []

    async def refused(transport, command, **kwargs):
        dispatched.append(command)
        exc = HyprlandGuardianError("wayland_guardian_input_path_lost")
        exc.details = {"native_failure": copy.deepcopy(DETAIL)}
        raise exc

    monkeypatch.setattr(NativeTransport, "act", refused)
    original = store.finish_action
    if storage_failure:
        def broken(*args, **kwargs):
            raise ComputerError("invalid_receipt")
        monkeypatch.setattr(store, "finish_action", broken)
    inp = action(normal, grant)
    await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    assert backend._closed
    assert grant["session_id"] not in controller._live
    assert len(dispatched) == 1
    if not storage_failure:
        status, raw = store.db.execute(
            "SELECT status,result FROM receipts WHERE session_id=? AND action_id=?",
            (grant["session_id"], "first"),
        ).fetchone()
        receipt = json.loads(raw)
        assert status == "unknown"
        assert receipt["native_failure"] == DETAIL
        assert receipt["execution"]["released"] is False  # No policy promotion.
    monkeypatch.setattr(store, "finish_action", original)
    await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    assert len(dispatched) == 1  # Neither settled nor pending work replays.


@pytest.mark.parametrize("bad", [
    {**DETAIL, "private_text": "not admitted"},
    {**DETAIL, "input_was_sent": 0},
    {**DETAIL, "scope_error": "unbounded peer text"},
    {**DETAIL, "diagnostics": {**DETAIL["diagnostics"], "steps_planned": 99999}},
    {**DETAIL, "diagnostics": {**DETAIL["diagnostics"], "steps_completed": 1}},
    {**DETAIL, "diagnostics": {**DETAIL["diagnostics"], "extra": "not admitted"}},
    {**DETAIL, "diagnostics": {**DETAIL["diagnostics"], "phase": []}},
    [],
])
async def test_native_failure_store_contract_rejects_unbounded_or_malformed(normal, bad):
    grant = await start(normal)
    with pytest.raises(ComputerError, match="invalid_receipt"):
        normal.service.controller.store.finish_action(
            grant["session_id"], "none", {"status": "unknown", "native_failure": bad},
        )
