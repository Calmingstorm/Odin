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


async def assert_revoked_owned_cleanup(controller, grant, backend):
    """A retained uncertain owner is safe only with input and capture fenced."""
    sid = grant["session_id"]
    assert not backend.input_supported and backend._paused
    assert backend._frame is None
    assert backend._cleanup_evidence["guardian_process_reaped"] is True
    assert backend._cleanup_evidence["scope_connection_closed"] is True
    assert not backend._guardian.alive
    assert sid not in controller._delivered_observations
    if sid in controller._live:
        assert controller._live[sid].backend is backend
        assert controller._live[sid].revoked
        assert not controller._live[sid].observations
    else:
        result = backend._recovery_result
        assert result is not None
        assert result.cleanup["local_resources_closed"] is True
        assert result.cleanup["guardian_process_reaped"] is True
        assert result.cleanup["scope_connection_closed"] is True
        assert controller.store.get_session(sid).state == "quarantined"
    with pytest.raises(ComputerError, match="hyprland_session_revoked"):
        await backend.observe()


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
    await assert_revoked_owned_cleanup(controller, grant, backend)
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
