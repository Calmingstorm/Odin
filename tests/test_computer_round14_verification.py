"""Real controller/adapter paths with inert native endpoints, never a desktop."""

# ruff: noqa: F811 - imported pytest fixtures are injected by name
import base64
import copy
import sys
from io import BytesIO
from unittest.mock import Mock

import pytest
from PIL import Image

from src.computer.integration import ComputerIntegration
from src.computer.models import ComputerError
from src.computer.render import render_frame
from src.computer.runtime import x11_app_scope
from src.computer.runtime import x11_attached_worker as worker
from src.computer.runtime import x11_guardian as guardian
from src.computer.runtime.x11_attached import same_application_scope
from src.computer.vision import FrameCrop, observation_image, plan_model_frames
from tests.test_computer_actions_r4 import persisted_receipt
from tests.test_computer_keyboard_grounding_r6 import fixture
from tests.test_computer_x11_app_scope_r5 import app  # noqa: F401 - shared hermetic fixture
from tests.test_computer_x11_attached_worker_r10_extra import native, request  # noqa: F401
from tests.test_computer_x11_lifecycle_coverage_r11 import (
    ExecuteHelper,
    Native,
    _execute_environment,
)


@pytest.mark.parametrize(
    "measurement,transition,status",
    [
        ({"x": 105, "y": 205, "target_window_matches": True}, False, "verified"),
        ({"x": 105, "y": 205, "target_window_matches": True}, True, "verified"),
        ({"x": 105, "y": 205, "target_window_matches": False}, True, "not_satisfied"),
        ({"x": 106, "y": 205, "target_window_matches": True}, False, "not_satisfied"),
        (None, False, "executed"),
        ({"x": True, "y": 205, "target_window_matches": True}, False, "executed"),
        ({"x": -5, "y": 205, "target_window_matches": True}, False, "executed"),
    ],
)
async def test_pointer_postcondition_does_not_cancel_acknowledged_click(
    tmp_path, monkeypatch, measurement, transition, status
):
    async with fixture(tmp_path, monkeypatch) as (controller, ctx, action, state, calls):
        backend = controller._live[action["session_id"]].backend
        inject = backend._input_worker

        async def measured(request):
            assert request["verify_pointer"] is True
            receipt = await inject(request)
            if transition:
                state["binding"]["focus_window"] = 91
            return {**receipt, "pointer_observation": measurement}

        monkeypatch.setattr(backend, "_input_worker", measured)
        action.update(operation="click", x=2, y=2, expect={"type": "pointer_at", "x": 2, "y": 2})
        result = await controller.act(ctx, action)
        assert result["status"] == status
        assert result["execution"] == {"sent": True, "injected": True, "released": True}
        assert result["verification"]["scope"] == "pointer_location_only"
        assert controller.store.get_session(action["session_id"]).state == "active"
        assert result["next_observation"]["image_bytes"]
        assert await controller.act(ctx, action) == persisted_receipt(result) and len(calls) == 1


@pytest.mark.parametrize("outcome", ["same", "other", "overlay", "unavailable"])
def test_guardian_queries_pointer_only_after_fence_and_release(monkeypatch, outcome):
    endpoint = Native()
    req, _connection, scope = _execute_environment(monkeypatch, endpoint, mode="shared")
    # The environment replaces imported modules with inert protocol adapters.
    monkeypatch.setattr(
        sys.modules["src.computer.runtime.x11_attached"],
        "same_application_scope",
        same_application_scope,
        raising=False,
    )
    scope.snapshot = Mock()
    binding = {
        "process": {"pid": 123, "start_ticks": 10},
        "window": 90,
        "focus_window": 91,
        "rect": [0, 0, 100, 100],
        "focused": True,
        "topology": "one",
        "source_rect": [0, 0, 100, 100],
        "source_origin": [0, 0],
        "modal_kind": None,
    }
    req.update(verify_pointer=True, scope=binding)

    class Helper(ExecuteHelper):
        def fence(self):
            endpoint.calls.append(("fenced",))
            return super().fence()

    monkeypatch.setattr(guardian, "InjectionHelper", Helper)

    def snapshot(_monitor):
        assert ("fenced",) in endpoint.calls
        assert not any(endpoint.held().values())
        if outcome == "unavailable":
            raise OSError("post-query failed")
        return {**binding, "window": 99} if outcome == "other" else binding

    scope.snapshot.side_effect = snapshot

    def assert_scope(*args, **kwargs):
        if outcome == "overlay" and ("fenced",) in endpoint.calls:
            raise x11_app_scope.ScopeFailure("pointer_scope_changed")

    scope.assert_snapshot.side_effect = assert_scope
    result = guardian.execute(req, controller_fd=None)
    assert result["status"] == "executed" and result["released"] is True
    if outcome == "unavailable":
        assert "pointer_observation" not in result
    else:
        assert result["pointer_observation"] == {
            "x": 10,
            "y": 20,
            "target_window_matches": outcome == "same",
        }


async def test_fresh_crop_survives_model_planning_and_maps_click_exactly(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (controller, ctx, action, state, calls):
        backend = controller._live[action["session_id"]].backend
        original = controller._live[action["session_id"]].observations[action["observation_id"]]
        png, _ = controller.store.read_evidence(ctx, original.evidence_id)
        full = observation_image(png, original.frame_metadata)
        read = backend._read_worker
        source = original.source
        crops = []

        async def capture(operation, **kwargs):
            reply = await read(operation, **kwargs)
            if operation != "capture":
                return reply
            crops.append(kwargs.get("crop"))
            with Image.open(BytesIO(state["image"])) as image:
                pixels = image.resize((40, 20), Image.Resampling.NEAREST).tobytes()
            frame = render_frame(
                pixels,
                source,
                mode="RGB",
                observation_id="worker",
                session_id="worker",
                generation=1,
                captured_monotonic_ns=1,
                crop=FrameCrop(**kwargs["crop"]) if kwargs.get("crop") else None,
            )
            reply.update(
                width=frame.metadata.width,
                height=frame.metadata.height,
                resize_scale=frame.metadata.resize_scale,
                delivered_to_source=frame.metadata.delivered_to_source.public(),
                crop=(list(vars(frame.metadata.crop).values()) if frame.metadata.crop else None),
                image=base64.b64encode(frame.png).decode(),
            )
            return reply

        monkeypatch.setattr(backend, "_read_worker", capture)
        crop = {"x": 10, "y": 4, "width": 16, "height": 8}
        observed = await controller.observe(
            ctx, {"session_id": action["session_id"], "generation": 1, "crop": crop}
        )
        obs = controller._live[action["session_id"]].observations[observed["observation_id"]]
        await controller.validate_observation_delivery(ctx, obs.frame_metadata, obs.image_sha256)
        image = ComputerIntegration.output_image(observed)
        assert obs.observation_id != original.observation_id
        plan = plan_model_frames(
            [
                {"role": "user", "content": [full["__image_block__"]]},
                {"role": "user", "content": [image["__image_block__"]]},
            ]
        )
        assert plan.frame_count == 1 and plan.protected_message_indices == (1,)
        assert (
            plan.messages[1]["content"][0]["source"]["data"]
            == image["__image_block__"]["source"]["data"]
        )
        from types import SimpleNamespace

        from src.discord.tool_loop import ToolLoopRunner
        from tests.test_computer_native_vision_r5 import client

        turn = SimpleNamespace(messages=plan.messages, _computer_frame_error=False)
        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        runner._get_computer = lambda: object()
        stamps = runner._computer_frames(turn, capture=True)
        assert stamps == {(obs.observation_id, obs.image_sha256)}
        assert runner._computer_frames(turn) == stamps and not turn._computer_frame_error
        # Real native request conversion, not prose describing a crop.
        wire = client()._convert_messages_with_tools(turn.messages)
        images = [
            block
            for item in wire
            for block in item.get("content", [])
            if block.get("type") == "input_image"
        ]
        assert len(images) == 1
        assert base64.b64decode(images[0]["image_url"].split(",", 1)[1]) == observed["image_bytes"]
        action.update(
            observation_id=obs.observation_id,
            source_revision=obs.source.source_revision,
            operation="click",
            x=0,
            y=0,
        )
        result = await controller.act(ctx, action)
        assert result["status"] == "verified"
        assert calls[0]["action"] == {"type": "click", "x": 110, "y": 204}
        assert all(value == crop for value in crops)


@pytest.mark.parametrize(
    "target_state,focused,status",
    [
        ("destroyed", False, "verified"),
        ("unmapped", False, "verified"),
        ("destroyed", True, "verified"),
        ("present", True, "not_satisfied"),
        ("unavailable", True, "not_satisfied"),
        ("replaced", True, "not_satisfied"),
    ],
)
@pytest.mark.parametrize("pixels_changed", [False, True])
async def test_native_disappearance_not_just_focus_change_satisfies_close(
    tmp_path, monkeypatch, target_state, focused, status, pixels_changed
):
    async with fixture(tmp_path, monkeypatch) as (controller, ctx, action, state, calls):
        backend = controller._live[action["session_id"]].backend
        original_scope = copy.deepcopy(state["binding"])
        read, inject = backend._read_worker, backend._input_worker

        async def capture(operation, **kwargs):
            reply = await read(operation, **kwargs)
            if kwargs.get("verify_scope") is not None:
                assert kwargs["verify_scope"] == original_scope
                reply["prior_target_state"] = target_state
            return reply

        async def close(request):
            before = state["image"]
            result = await inject(request)
            if not pixels_changed:
                state["image"] = before
            state["binding"].update(window=92, focused=focused)
            return result

        monkeypatch.setattr(backend, "_read_worker", capture)
        monkeypatch.setattr(backend, "_input_worker", close)
        action.update(operation="key", key="alt+F4", expect={"type": "window_gone"})
        result = await controller.act(ctx, action)
        assert result["status"] == status
        assert result["execution"] == {"sent": True, "injected": True, "released": True}
        assert result["verification"].get("target_disappeared", False) == (status == "verified")
        if status == "verified":
            assert result["verification"]["type"] == "window_gone"
            assert result["verification"]["method"] == "native_window_state_after_release"
        assert controller.store.get_session(action["session_id"]).state == "active"
        assert result["next_observation"]["image_bytes"]
        assert await controller.act(ctx, action) == persisted_receipt(result) and len(calls) == 1
        with pytest.raises(ComputerError, match="observation_not_delivered"):
            await controller.act(ctx, {**action, "action_id": "another"})


@pytest.mark.parametrize(
    "mode", ["present", "unmapped", "destroyed", "replaced", "topology", "error"]
)
def test_prior_target_native_query_does_not_confuse_unfocused_with_gone(app, monkeypatch, mode):
    from Xlib import error

    display, checker, monitor = app
    expected = checker.snapshot(monitor)
    display.focus = 1  # No focused app is NOT evidence of destruction.
    if mode == "unmapped":
        display.target.viewable = 0
    elif mode == "replaced":
        monkeypatch.setattr(x11_app_scope, "_process_identity", lambda _: {"pid": 9999})
    elif mode == "topology":
        display.monitors[0].crtcs = [99]
    elif mode in {"destroyed", "error"}:

        class Gone(error.BadWindow):
            def __init__(self):
                pass

        display.target.get_attributes = Mock(
            side_effect=Gone() if mode == "destroyed" else OSError("native failure")
        )
    if mode in {"topology", "error"}:
        with pytest.raises((OSError, x11_app_scope.ScopeFailure)):
            checker.target_state(expected, monitor)
    else:
        assert checker.target_state(expected, monitor) == mode


@pytest.mark.parametrize("failed", [False, True])
def test_capture_worker_reports_native_target_state_not_focus_absence(native, monkeypatch, failed):
    selected = worker.run(request())["sources"][0]
    verify = {"window": 20}
    query = Mock(side_effect=OSError("query failed") if failed else None, return_value="destroyed")
    monkeypatch.setattr(x11_app_scope.AppScope, "target_state", query)
    result = worker.run(
        request("capture", selected=selected, input_enabled=True, verify_scope=verify)
    )
    query.assert_called_once_with(verify, native.topology.monitors[0])
    assert result["prior_target_state"] == ("unavailable" if failed else "destroyed")


async def test_pointer_post_capture_unavailable_is_not_unknown_input(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (controller, ctx, action, state, calls):
        backend = controller._live[action["session_id"]].backend
        inject = backend._input_worker

        async def unavailable(**kwargs):
            raise ComputerError("display_asleep")

        async def measured(request):
            receipt = await inject(request)
            monkeypatch.setattr(backend, "observe", unavailable)
            return {
                **receipt,
                "pointer_observation": {"x": 105, "y": 205, "target_window_matches": True},
            }

        monkeypatch.setattr(backend, "_input_worker", measured)
        action.update(operation="click", x=2, y=2, expect={"type": "pointer_at", "x": 2, "y": 2})
        result = await controller.act(ctx, action)
        assert result["status"] == "executed"
        assert result["verification"]["reason"] == "display_asleep"
        assert controller.store.get_session(action["session_id"]).state == "active"
        assert len(calls) == 1
