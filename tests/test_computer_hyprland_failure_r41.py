"""Fast-loop receipt and diagnostic boundaries, without a desktop or child process."""
import asyncio
import copy
import json
import os
import time
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_guardian as module
from tests.test_computer_hyprland_failure_r38 import DETAIL
from tests.test_computer_hyprland_turnloop_r33 import (
    NativeTransport,
    action,
    call,
    observe,
    start,
)
from tests.test_computer_hyprland_turnloop_r33 import normal as normal


def terminal(detail=None):
    detail = copy.deepcopy(DETAIL if detail is None else detail)
    return {**detail, "native_failure": detail}


@pytest.mark.parametrize("row", [None, [], "private", {}, {"native_failure": []}])
def test_non_schema_native_data_is_not_evidence(row):
    assert module.native_failure(row) is None
    assert module._native_diagnostics(row) is None


@pytest.mark.parametrize("command", ["none", "begin", "renew", "bind", "select",
                                     "pixel-permit", "action"])
def test_all_native_command_enums_preserve_bounded_failure(command):
    for operation in ("none", "arm", "renew"):
        for error in module._SCOPE_ERRORS:
            detail = {"command": command, "scope_operation": operation, "scope_error": error}
            assert module.native_failure({"native_failure": detail}) == detail


@pytest.mark.parametrize("field,values", [
    ("command", [None, [], True, "private command"]),
    ("scope_operation", [None, {}, 1, "private operation"]),
    ("scope_error", [None, [], False, "private error"]),
])
def test_native_required_fields_reject_wrong_types_and_unknown_values(field, values):
    for value in values:
        row = terminal()
        row["native_failure"][field] = value
        assert module.native_failure(row) is None


@pytest.mark.parametrize("field", ["input_was_sent", "release_sent", "release_acknowledged"])
@pytest.mark.parametrize("value", [0, 1, None, "true", [], {}])
def test_native_boolean_facts_never_coerce(field, value):
    row = terminal()
    row[field] = value
    result = module.native_failure(row)
    assert field not in result
    assert result["scope_error"] == "human-input-held"


@pytest.mark.parametrize("field,value", [
    ("phase", []), ("phase", "private"), ("release", {}),
    ("reason", []), ("reason", "secret"), ("steps_planned", True),
    ("steps_completed", -1), ("steps_planned", 4097), ("steps_completed", 1),
])
def test_malformed_diagnostics_dropped_without_losing_native_facts(field, value):
    row = terminal()
    row["diagnostics"][field] = value
    result = module.native_failure(row)
    assert "diagnostics" not in result
    assert result["release_acknowledged"] is True


def test_sanitization_is_nonmutating_and_does_not_copy_private_fields():
    row = terminal()
    row.update(socket="secret-socket", coordinates=[123, 456], text="secret-text")
    row["native_failure"]["token"] = "secret-token"
    row["diagnostics"]["exception"] = "secret-exception"
    before = copy.deepcopy(row)
    assert module.native_failure(row) == DETAIL
    assert row == before


@pytest.mark.parametrize("error_kind", ["native", "ordinary"])
@pytest.mark.parametrize("malformed", [False, True])
async def test_action_exception_identity_and_safe_journal(
    monkeypatch, caplog, error_kind, malformed,
):
    monkeypatch.setattr(module.time, "monotonic_ns", lambda: 1_000_000_000)
    guardian = module.HyprlandGuardian("/never/executed", os.getuid())
    guardian._scope_deadline = time.monotonic_ns() + 250_000_000
    row = terminal()
    row["private"] = "secret-peer-token"
    row["diagnostics"]["private"] = "secret-window-title"
    if malformed:
        row["diagnostics"]["phase"] = []
    guardian._last_terminal = row
    exc = (module.HyprlandGuardianError("private-exception-text")
           if error_kind == "native" else RuntimeError("private-exception-text"))
    dispatch = AsyncMock(side_effect=exc)
    monkeypatch.setattr(module.WaylandGuardian, "act", dispatch)
    with caplog.at_level("WARNING", logger=module.log.name):
        with pytest.raises(type(exc)) as caught:
            await guardian.act("private-command", scope_deadline_ns=guardian._scope_deadline)
    assert caught.value is exc
    dispatch.assert_awaited_once()
    assert "human-input-held" in caplog.text
    assert "release_acknowledged=True" in caplog.text
    assert "secret" not in caplog.text and "private" not in caplog.text
    if error_kind == "native":
        expected = copy.deepcopy(DETAIL)
        if malformed:
            expected.pop("diagnostics")
        assert exc.details["native_failure"] == expected
    else:
        assert not hasattr(exc, "details")


@pytest.mark.parametrize("detail", [
    {"command": "none", "scope_operation": "none", "scope_error": "none"},
    {**DETAIL, "release_acknowledged": False, "input_was_sent": True},
])
async def test_native_receipt_roundtrip_does_not_promote_execution(normal, monkeypatch, detail):
    grant = await start(normal)
    await observe(normal, grant)

    async def refused(*args, **kwargs):
        exc = module.HyprlandGuardianError("wayland_guardian_input_path_lost")
        exc.details = {"native_failure": copy.deepcopy(detail)}
        raise exc

    monkeypatch.setattr(NativeTransport, "act", refused)
    await normal.runner._run_one_tool(normal.state, call("computer_act", **action(normal, grant)))
    store = normal.service.controller.store
    raw = store.db.execute("SELECT result FROM receipts WHERE session_id=? AND action_id=?",
                           (grant["session_id"], "first")).fetchone()[0]
    receipt = json.loads(raw)
    assert receipt["native_failure"] == detail
    assert receipt["status"] == "unknown"
    assert receipt["execution"]["released"] is False


async def test_invalid_native_failure_is_not_attached_or_logged(monkeypatch, caplog):
    monkeypatch.setattr(module.time, "monotonic_ns", lambda: 1_000_000_000)
    guardian = module.HyprlandGuardian("/never/executed", os.getuid())
    guardian._scope_deadline = time.monotonic_ns() + 250_000_000
    guardian._last_terminal = {
        "native_failure": {"command": "secret-command"},
        "input_was_sent": "secret-text", "release_sent": 1,
        "release_acknowledged": [],
    }
    exc = module.HyprlandGuardianError("wayland_guardian_input_path_lost")
    monkeypatch.setattr(module.WaylandGuardian, "act", AsyncMock(side_effect=exc))
    with caplog.at_level("WARNING", logger=module.log.name):
        with pytest.raises(module.HyprlandGuardianError) as caught:
            await guardian.act("secret-action", scope_deadline_ns=guardian._scope_deadline)
    assert caught.value is exc
    assert "native_failure" not in getattr(exc, "details", {})
    assert "native_failure=None" in caplog.text
    assert "input_was_sent=None" in caplog.text
    assert "release_sent=None" in caplog.text
    assert "release_acknowledged=None" in caplog.text
    assert "secret" not in caplog.text


@pytest.mark.parametrize("detail", [None, [], {**DETAIL, "command": []},
                                         {**DETAIL, "scope_operation": 1},
                                         {**DETAIL, "release_acknowledged": "true"}])
async def test_store_refuses_malformed_detail_before_reservation_lookup(normal, detail):
    grant = await start(normal)
    with pytest.raises(ComputerError, match="invalid_receipt"):
        normal.service.controller.store.finish_action(
            grant["session_id"], "unreserved", {"status": "unknown", "native_failure": detail})


@pytest.mark.parametrize("storage_failure", [False, True])
async def test_cancelled_dispatch_always_closes_and_never_replays(
    normal, monkeypatch, storage_failure,
):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    backend = controller._live[grant["session_id"]].backend
    dispatched = []

    async def cancelled(*args, **kwargs):
        dispatched.append(1)
        raise asyncio.CancelledError()

    monkeypatch.setattr(NativeTransport, "act", cancelled)
    original = controller.store.finish_action
    if storage_failure:
        def broken(*args, **kwargs):
            raise ComputerError("invalid_receipt")
        monkeypatch.setattr(controller.store, "finish_action", broken)
    inp = action(normal, grant)
    if storage_failure:
        await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    else:
        with pytest.raises(asyncio.CancelledError):
            await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    assert backend._closed
    assert grant["session_id"] not in controller._live
    monkeypatch.setattr(controller.store, "finish_action", original)
    await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    assert dispatched == [1]


@pytest.mark.parametrize("details", [None, [], {}, {"native_failure": []},
                                     {"native_failure": {**DETAIL, "command": []}}])
async def test_controller_drops_malformed_native_details_but_still_closes(
    normal, monkeypatch, details,
):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    backend = controller._live[grant["session_id"]].backend

    async def refused(*args, **kwargs):
        exc = module.HyprlandGuardianError("wayland_guardian_input_path_lost")
        exc.details = details
        raise exc

    monkeypatch.setattr(NativeTransport, "act", refused)
    await normal.runner._run_one_tool(normal.state, call("computer_act", **action(normal, grant)))
    raw = controller.store.db.execute(
        "SELECT result FROM receipts WHERE session_id=? AND action_id=?",
        (grant["session_id"], "first"),
    ).fetchone()[0]
    result = json.loads(raw)
    assert result["status"] == "unknown"
    assert "native_failure" not in result
    assert backend._closed
