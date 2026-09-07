"""R3 review regressions: nonvisual admission and live observation delivery only."""

from copy import deepcopy
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.controller import ComputerController
from src.computer.integration import ComputerIntegration
from src.computer.models import ComputerError
from src.computer.store import ComputerStore
from src.computer.vision import VisionError, observation_image
from src.discord.tool_loop import ToolLoopRunner
from src.tools.output_authorization import request_tool_scope
from tests.test_computer_contract_r1 import Stub
from tests.test_computer_dispatch_r3 import dispatch_state, facade
from tests.test_computer_vision import image_message, metadata, png


def call(name="computer_observe", **values):
    return SimpleNamespace(id="call", name=name, input=values)


@pytest.mark.parametrize("operation", ["stop", "cancel", "close", "status"])
async def test_nonvisual_model_change_allows_only_bound_operation(operation):
    service, state = facade(), dispatch_state()
    state._computer_serving = None
    block = call("computer_session", operation=operation)
    with service.foreground(state, block):
        result = await service._tool(block.name, block.input)
        assert result.ok
        service.controller.session.assert_awaited_once()
        for changed in ["start", "resume", "reconcile", "export", "pause", "status", "stop"]:
            if changed != operation:
                result = await service._tool(block.name, {"operation": changed})
                assert result.error == "permission_denied"
        block.input["operation"] = "start"
        assert (await service._tool(block.name, block.input)).error == "permission_denied"
        assert (await service._tool("computer_act", {})).error == "permission_denied"
        assert service.controller.session.await_count == 1


@pytest.mark.parametrize("operation", ["start", "resume", "reconcile", "export", "pause",
                                       "unknown", None, []])
async def test_visual_operations_still_require_vision(operation):
    service, state = facade(), dispatch_state()
    with pytest.raises(PermissionError, match="vision"):
        with service.foreground(state, call("computer_session", operation=operation)):
            pytest.fail("visual operation admitted")


@pytest.mark.parametrize("boundary", ["disabled", "host", "rbac", "scope"])
async def test_nonvisual_keeps_admission_boundaries(boundary):
    service, state = facade(), dispatch_state()
    if boundary == "disabled":
        service.bot.config.computer.enabled = False
    elif boundary == "host":
        service.bot.host_access_manager.is_host_allowed = lambda *_: False
    elif boundary == "rbac":
        service.bot.tool_executor.check_permission = lambda *_: "denied"
    token = request_tool_scope.set(frozenset() if boundary == "scope" else None)
    try:
        block = call("computer_session", operation="stop")
        with service.foreground(state, block):
            assert (await service._tool(block.name, block.input)).error == "permission_denied"
        service.controller.session.assert_not_called()
    finally:
        request_tool_scope.reset(token)


@pytest.fixture
async def live(tmp_path, monkeypatch):
    monkeypatch.setattr("src.computer.integration.require_vision", lambda _: None)
    state, service = dispatch_state(), facade()
    store = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    backend = Stub()
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    service.controller = controller
    context = service._context(state)
    session = await controller.session(context, {"operation": "start", "app": "xed"})
    block = call(session_id=session["session_id"], generation=session["generation"])
    try:
        yield service, state, block, context
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("changed", ["owner_id", "channel_id", "host_id", "surface"])
async def test_nonvisual_session_keeps_ownership(live, changed):
    service, _, block, context = live
    with pytest.raises(ComputerError):
        await service.controller.session(replace(context, **{changed: "other"}),
                                         {"operation": "stop", **block.input})
    assert service.controller.store.get_session(block.input["session_id"]).state == "active"


@pytest.mark.parametrize("session_id", ["historical", "other_session"])
def test_transcript_scan_never_clears_error(session_id):
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._get_computer = facade
    state = dispatch_state()
    state._computer_frame_error = True
    frame = observation_image(png(), replace(metadata(), session_id=session_id,
                                             captured_monotonic_ns=1))
    state.messages.append(image_message(frame))
    assert runner._computer_frames(state, capture=True)
    assert state._computer_frame_error


async def test_current_response_is_consumed_once_and_copy_is_not_delivery(live):
    service, state, block, _ = live
    with service.foreground(state, block):
        image = await service._tool(block.name, block.input)
        with pytest.raises(VisionError):
            await service.validate_delivery(state, block, deepcopy(image))
        await service.validate_delivery(state, block, image)
        with pytest.raises(VisionError):
            await service.validate_delivery(state, block, image)
    with service.foreground(state, block):
        with pytest.raises(VisionError):
            await service.validate_delivery(state, block, image)


@pytest.mark.parametrize("change", ["owner", "turn", "generation", "expired", "digest",
                                    "metadata", "revoked"])
async def test_delivery_rechecks_live_binding(live, change):
    service, state, block, context = live
    controller = service.controller
    with service.foreground(state, block):
        image = await service._tool(block.name, block.input)
        sid = block.input["session_id"]
        if change == "owner":
            controller.authorize = lambda _: False
        elif change == "turn":
            state._req_id = "other-turn"
        elif change == "generation":
            controller.store.set_state(sid, "active", revoke=True)
        elif change == "expired":
            now = controller.monotonic()
            controller.monotonic = lambda: now + 60
        elif change == "revoked":
            await controller.session(context, {"operation": "stop"})
        else:
            key, value = ("sha256", "0" * 64) if change == "digest" else ("session_id", "other")
            image["__computer_frame__"][key] = value
            image["__image_block__"]["__computer_frame__"][key] = value
        with pytest.raises((ComputerError, VisionError)):
            await service.validate_delivery(state, block, image)


def delivery_runner(service, monkeypatch, response=None):
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._get_computer = lambda: service
    runner._tool_executor = service.bot.tool_executor
    runner._delivery = SimpleNamespace(set_status=AsyncMock())
    runner._audit = SimpleNamespace(log_event=AsyncMock())
    runner._audit_tool_outcome = AsyncMock()
    runner._channel_state = SimpleNamespace(track_action=lambda *_, **__: None)

    async def dispatch(name, values, **kwargs):
        result = await service._tool(name, values) if response is None else response
        return result, SimpleNamespace(rebuild_system_prompt=False)

    runner._native_tools = SimpleNamespace(handles=lambda _: True, dispatch=dispatch)
    monkeypatch.setattr("src.tools.runtime_delivery.deliver_runtime_output",
                        lambda _, result, **kwargs: result)
    return runner


async def test_fresh_owned_observe_repairs_only_action_refusal(live, monkeypatch):
    service, state, block, _ = live
    runner = delivery_runner(service, monkeypatch)
    runner._retire_computer_frames(state)
    assert "Permission denied" in (await runner._run_one_tool(state, call("computer_act")))[
        "content"]
    result = await runner._run_one_tool(state, block)
    assert "Image loaded" in result["content"]
    assert not state._computer_frame_error
    assert len(state.pending_image_blocks) == 1
    result = await runner._run_one_tool(state, call("computer_act"))
    assert "grounded_actions_unavailable" in result["content"]
    assert "Permission denied" not in result["content"]


@pytest.mark.parametrize("response", [
    {"__computer_frame__": {}},
    {"__computer_frame__": {}, "__image_block__": {}, "__prompt__": "bad"},
    {"__image_block__": {}, "__prompt__": "missing computer marker"},
])
async def test_malformed_delivery_is_bounded_and_keeps_refusal(live, monkeypatch, response):
    service, state, block, _ = live
    runner = delivery_runner(service, monkeypatch, response)
    state._computer_frame_error = True
    result = await runner._run_one_tool(state, block)
    assert result["content"] == "Computer observation rejected; obtain a fresh observation."
    assert state._computer_frame_error
    assert not state.pending_image_blocks


async def test_replayed_image_cannot_repair_via_dispatch(live, monkeypatch):
    service, state, block, context = live
    image = ComputerIntegration.output_image(await service.controller.observe(context, block.input))
    runner = delivery_runner(service, monkeypatch, image)
    state._computer_frame_error = True
    result = await runner._run_one_tool(state, block)
    assert "observation rejected" in result["content"]
    assert state._computer_frame_error
    assert not state.pending_image_blocks


async def test_malformed_controller_response_refuses_without_stopping(live, monkeypatch):
    service, state, block, _ = live
    service.controller.observe = AsyncMock(return_value={"image_bytes": b"invalid"})
    runner = delivery_runner(service, monkeypatch)
    state._computer_frame_error = True
    result = await runner._run_one_tool(state, block)
    assert "invalid_observation_response" in result["content"]
    assert state._computer_frame_error
    assert not state.pending_image_blocks
    assert service.controller.store.get_session(block.input["session_id"]).state == "active"


async def test_other_owned_session_response_does_not_clear(live, monkeypatch):
    service, state, block, context = live
    await service.controller.session(context, {"operation": "stop"})
    other = replace(context, owner_id="bob", channel_id="other")
    session = await service.controller.session(other, {"operation": "start", "app": "xed"})
    response = await service.controller.observe(other, {
        "session_id": session["session_id"], "generation": session["generation"]})
    service.controller.observe = AsyncMock(return_value=response)
    runner = delivery_runner(service, monkeypatch)
    state._computer_frame_error = True
    result = await runner._run_one_tool(state, block)
    assert "observation rejected" in result["content"]
    assert state._computer_frame_error
    assert not state.pending_image_blocks


async def test_legacy_image_and_no_image_fast_path_keep_error(live, monkeypatch):
    service, state, _, _ = live
    state._computer_frame_error = True
    legacy = {"__image_block__": {"type": "image", "source": {}}, "__prompt__": "legacy"}
    runner = delivery_runner(service, monkeypatch, legacy)
    assert runner._computer_frames(state, capture=True) == frozenset()
    result = await runner._run_one_tool(state, call("analyze_image"))
    assert "Image loaded" in result["content"]
    assert state.pending_image_blocks == [legacy["__image_block__"]]
    assert state._computer_frame_error
    runner = delivery_runner(service, monkeypatch, "ordinary output")
    assert (await runner._run_one_tool(state, call("read_file")))["content"] == "ordinary output"
    assert state._computer_frame_error
