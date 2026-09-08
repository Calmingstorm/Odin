"""Durable receipts through the normal turn chain; synthetic native IPC only."""

import json

import pytest

from tests.test_computer_hyprland_turnloop_r33 import (
    NativeTransport,
    action,
    call,
    observe,
    start,
)
from tests.test_computer_hyprland_turnloop_r33 import (
    normal as normal,
)


def durable(normal, grant, action_id):
    row = normal.service.controller.store.db.execute(
        "SELECT result FROM receipts WHERE session_id=? AND action_id=?",
        (grant["session_id"], action_id),
    ).fetchone()
    assert row is not None
    return json.loads(row[0])


def safety(receipt, basis):
    value = receipt["input_safety"]
    assert value["backend"] == "hyprland"
    assert value["guarantee"] == "best_effort"
    assert value["release_basis"] == basis
    assert value["receiver_release_verified"] is False
    assert value["limitations"]
    assert value["recovery"] == "operator_release_all_then_close_and_start_new_session"


@pytest.mark.parametrize("kind", ["sequence", "strokes"])
async def test_batch_step_and_aggregate_durable_safety_and_replay(normal, kind):
    grant = await start(normal)
    await observe(normal, grant)
    inp = action(normal, grant, "batch")
    for key in ("x", "y", "expect"):
        inp.pop(key)
    inp["operation"] = kind
    if kind == "sequence":
        inp["steps"] = [dict(action_id=f"step-{i}", operation="click", x=i + 1,
                             y=1, expect={"type": "visual_change"}) for i in range(2)]
    else:
        inp["strokes"] = [dict(action_id=f"step-{i}", points=[[1, i + 1], [3, i + 1]],
                               duration=0.1) for i in range(2)]
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    assert "Image loaded" in result["content"], result
    # Every pixel changes at the transport: original-view second anchors yield.
    assert len(normal.transports[0].commands) == 1
    for aid in ("batch", "step-0"):
        safety(durable(normal, grant, aid), "cooperative_native_ack")
    safety(durable(normal, grant, "step-1"), "not_required_no_input_sent")
    count = len(normal.state.pending_image_blocks)
    replay = await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    # Failed tool outcomes may carry the standard visible-failure prefix.
    text = replay["content"]
    safety(json.loads(text[text.index("{"):]), "cooperative_native_ack")
    assert len(normal.transports[0].commands) == 1
    assert len(normal.state.pending_image_blocks) == count


@pytest.mark.parametrize("outcome,basis", [
    ("no_input", "not_required_no_input_sent"), ("unknown", "unconfirmed"),
])
async def test_native_outcome_release_basis_is_durable(normal, monkeypatch, outcome, basis):
    grant = await start(normal)
    await observe(normal, grant)
    original = NativeTransport.act

    async def reply(transport, command, **kwargs):
        result = await original(transport, command, **kwargs)
        if outcome == "no_input":
            result["input_was_sent"] = False
        else:
            result["release_ack"] = False
        return result

    monkeypatch.setattr(NativeTransport, "act", reply)
    inp = action(normal, grant)
    await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    receipt = durable(normal, grant, "first")
    safety(receipt, basis)
    assert receipt["execution"]["released"] is (outcome == "no_input")
    await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    assert len(normal.transports[0].commands) == 1
    assert durable(normal, grant, "first") == receipt


@pytest.mark.parametrize("operation,fields,target", [
    ("key", {"key": "Left"}, "native_window_focus"),
    ("replace_field_pixels", {"region": {"x": 1, "y": 1, "width": 3, "height": 3},
                              "text": "hello"}, "explicit_pixel_region"),
])
async def test_normal_native_targeting_paths(normal, operation, fields, target):
    grant = await start(normal)
    await observe(normal, grant)
    inp = action(normal, grant)
    inp.pop("x")
    inp.pop("y")
    inp.update(operation=operation, **fields)
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    assert "Image loaded" in result["content"], result
    receipt = durable(normal, grant, "first")
    assert receipt["targeting"]["path"] == target
    safety(receipt, "cooperative_native_ack")


async def test_normal_readiness_stale_and_paused(normal, monkeypatch):
    grant = await start(normal)
    backend = normal.service.controller._live[grant["session_id"]].backend
    assert backend.input_readiness == "ready"  # Normal start captures a frame.
    await observe(normal, grant)
    assert backend.input_readiness == "ready"
    monkeypatch.setattr(backend, "_captured_at", backend._captured_at - 6)
    assert backend.input_readiness == "observation_required"
    await normal.runner._run_one_tool(
        normal.state, call("computer_session", operation="pause", **grant))
    assert backend.input_readiness == "inactive"


async def test_offered_catalog_discloses_native_limits(normal):
    await start(normal)
    offered = {t["name"]: t for t in normal.bot.tool_catalog.merged_definitions()}
    description = offered["computer_session"]["description"]
    for phrase in ("best-effort", "not arbitrary-app qualification", "native scoped top-levels",
                   "no XWayland", "ambiguous modal", "SIGKILL", "human's hold",
                   "not receiver proof", "RELEASE-ALL", "renewed consent",
                   "fresh observation", "Never auto-replay", "credential/security"):
        assert phrase in description


async def test_authenticated_web_turn_and_revoked_browser_refusal(normal):
    from src.web.computer_binding import browser_binding
    from tests.test_computer_web_binding_r5 import browser

    bot, request, sessions, _ = browser()
    sid, authorized = browser_binding(bot, request)
    message = normal.state.message
    message._odin_source = "web"
    message._computer_web_session_id = sid
    message._computer_web_authorized = authorized
    grant = await start(normal)
    assert normal.service._context(normal.state).surface == "webui"
    await observe(normal, grant)
    result = await normal.runner._run_one_tool(normal.state, call(
        "computer_act", **action(normal, grant)))
    assert "Image loaded" in result["content"], result
    safety(durable(normal, grant, "first"), "cooperative_native_ack")
    sessions.destroy(sid)
    refused = await normal.runner._run_one_tool(normal.state, call(
        "computer_act", **action(normal, grant, "revoked")))
    assert "Image loaded" not in refused["content"]
    assert len(normal.transports[0].commands) == 1


async def test_web_turn_without_browser_binding_cannot_start(normal):
    normal.state.message._odin_source = "web"
    result = await normal.runner._run_one_tool(
        normal.state, call("computer_session", operation="start"))
    assert "Image loaded" not in result["content"]
    assert not normal.transports


async def test_post_image_format_failure_preserves_settled_receipt(normal, monkeypatch):
    grant = await start(normal)
    await observe(normal, grant)
    inp = action(normal, grant)
    image_count = len(normal.state.pending_image_blocks)

    def failed_format(_):
        raise ValueError("synthetic_image_encoding_failure")

    # Formatting is downstream of all lifecycle, controller and native dispatch.
    monkeypatch.setattr(normal.service, "output_image", failed_format)
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    assert "Image loaded" not in result["content"]
    receipt = json.loads(result["content"])
    safety(receipt, "cooperative_native_ack")
    assert receipt["execution"]["released"] is True
    assert durable(normal, grant, "first")["input_safety"] == receipt["input_safety"]
    replay = await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    assert json.loads(replay["content"]) == receipt
    assert len(normal.transports[0].commands) == 1
    assert len(normal.state.pending_image_blocks) == image_count


@pytest.mark.parametrize("scope_change", [{"safe_focus": False}, {"locked": True},
                                         {"native_wayland": False}])
async def test_native_scope_security_refusal_never_dispatches(normal, monkeypatch, scope_change):
    from tests.computer.test_hyprland_backend import scope

    grant = await start(normal)
    await observe(normal, grant)
    inp = action(normal, grant)
    backend = normal.service.controller._live[grant["session_id"]].backend

    async def snapshot(_):
        return scope(**scope_change)

    monkeypatch.setattr(backend._scope_provider, "snapshot", snapshot)
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **inp))
    assert "Image loaded" not in result["content"]
    assert not normal.transports[0].commands
