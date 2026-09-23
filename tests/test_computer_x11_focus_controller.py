"""Fake X11 adapter only: no graphical session or native injection."""

import json
from contextlib import asynccontextmanager
from dataclasses import replace
from types import SimpleNamespace

import pytest

from src.computer.controller import ComputerController
from src.computer.error_guidance import InputBoundaryError, failure_guidance
from src.computer.geometry import AffineTransform, SourceGeometry
from src.computer.gui_actions import action_arguments
from src.computer.integration import ComputerIntegration
from src.computer.models import BackendCapabilities, CaptureScope, ComputerError, RequestContext
from src.computer.store import ComputerStore
from src.tools.defs.computer import computer_definitions
from tests.test_computer_contract_r1 import Stub
from tests.test_computer_native_vision_r5 import client, serving


class FocusBackend(Stub):
    capabilities = BackendCapabilities(
        "x11", "existing_session", "shared", "shared", "verified", "verified"
    )
    input_supported = False
    input_limits = {"effect_expectations": ["visual_change"]}

    def __init__(self):
        super().__init__()
        self.source = SourceGeometry("opaque", 1, 1, 2, 2)
        self.identity = "private-window-and-process"
        self.focused = False
        self.modal = None
        self.focus_calls = []
        self.click_calls = []
        self.fail_release = False
        self.no_focus = False
        self.wrong_focus = False

    async def start(self, sid):
        return {"ok": True}

    def focus_candidate_token(self):
        return self.identity if not self.focused and self.modal is None else None

    def focused_target_matches(self, token):
        return self.focused and not self.wrong_focus and self.identity == token

    async def observe(self):
        raw = await super().observe()
        source = (
            replace(self.source, input_region_id="input", input_width=2,
                    input_height=2, pixel_to_input=AffineTransform())
            if self.focused else self.source
        )
        return replace(raw, source=source,
                       scope=CaptureScope(1, frozenset({"opaque"}),
                                          frozenset({"opaque"}) if self.focused else frozenset()),
                       focused=self.focused, modal=self.modal,
                       modal_kind="safe_application" if self.modal else None)

    async def focus_acquire(self, payload, *, expected_candidate):
        self.focus_calls.append(payload)
        assert expected_candidate == self.identity
        if self.fail_release:
            return {"status": "unknown", "injected": True, "released": False}
        if not self.no_focus:
            self.focused = True
        return {"status": "executed", "injected": True, "released": True,
                "focus_confirmed": not self.no_focus}

    async def act(self, payload):
        self.click_calls.append(payload)
        return {"status": "unavailable", "injected": False, "released": True}


@asynccontextmanager
async def setup(tmp_path):
    backend = FocusBackend()
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("owner", "channel", "turn", "host")
    try:
        grant = await controller.session(context, {"operation": "start"})
        seen = await controller.observe(
            context, {"session_id": grant["session_id"], "generation": 1}
        )
        obs = controller._live[grant["session_id"]].observations[seen["observation_id"]]
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )
        inp = {"session_id": grant["session_id"], "generation": 1,
               "consent_generation": 1, "source_id": "opaque", "source_revision": 1,
               "observation_id": seen["observation_id"], "action_id": "focus-1",
               "operation": "focus", "x": 1, "y": 1, "expect": {"type": "visual_change"}}
        yield controller, backend, context, seen, inp
    finally:
        await controller.close()
        store.close()


async def test_focus_requires_new_eligible_delivery_before_typing(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, observed, action):
        assert observed["focus_available"] and not backend.input_supported
        result = await controller.act(ctx, action)
        assert result["execution"] == {"sent": True, "injected": True, "released": True}
        assert result["verification"]["focus_confirmed"] is True
        assert result["next_observation"]["focused"]
        assert not result["next_observation"]["focus_available"]
        assert len(backend.focus_calls) == 1 and backend.click_calls == []
        old = {**action, "operation": "type", "text": "unsafe", "action_id": "old-typing"}
        old.pop("x"), old.pop("y")
        with pytest.raises(ComputerError, match="observation_not_delivered"):
            await controller.act(ctx, old)
        replay = await controller.act(ctx, action)
        assert "next_observation" not in replay and len(backend.focus_calls) == 1


@pytest.mark.parametrize("unknown_release", [False, True])
async def test_focus_through_integration_classifies_release_truthfully(
        tmp_path, monkeypatch, unknown_release):
    async with setup(tmp_path) as (controller, backend, ctx, _, action):
        backend.fail_release = unknown_release
        bot = SimpleNamespace(
            config=SimpleNamespace(computer=SimpleNamespace(enabled=True)),
            host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: True),
            tool_executor=SimpleNamespace(check_permission=lambda *_: None),
        )
        integration = ComputerIntegration(bot, controller=controller)
        monkeypatch.setattr(integration, "_context", lambda _: ctx)
        turn = SimpleNamespace(
            user_id=ctx.owner_id,
            message=SimpleNamespace(channel=SimpleNamespace(id=ctx.channel_id)),
            _computer_serving=serving(client()),
        )
        block = SimpleNamespace(id="focus-call", name="computer_act", input=action)
        with integration.foreground(turn, block):
            delivered = await integration._tool("computer_act", action)
        if unknown_release:
            assert delivered.ok is False
            assert delivered.uncertain_outcome is True
            receipt = json.loads(delivered.output)
            assert receipt["input_outcome"] == "release_unknown"
            assert receipt["terminal"] is True
            assert receipt["next_action"] == "operator_intervention_required"
        else:
            receipt = delivered["__computer_action_receipt__"]
            assert receipt["verification"]["status"] == "observed"
            assert receipt["execution"]["released"] is True
            assert receipt["input_outcome"] == "released_verified"
            assert receipt["terminal"] is False
            assert receipt["next_action"] == "inspect_new_observation"
            assert receipt["verification"]["focus_confirmed"] is True
        assert ("RELEASE-ALL" in receipt["instruction"]) is unknown_release
        assert len(backend.focus_calls) == 1


@pytest.mark.parametrize("change,reason", [
    ("platform", "focus_transition_unavailable"),
    ("candidate", "focus_candidate_unavailable"),
    ("bounds", "invalid_target"),
])
async def test_focus_preflight_error_proves_no_dispatch(tmp_path, change, reason):
    async with setup(tmp_path) as (controller, backend, ctx, observed, action):
        sid = action["session_id"]
        if change == "platform":
            backend.focus_acquire = None
        elif change == "candidate":
            controller._x11_focus_candidates.pop(sid)
        else:
            action["x"] = 2
        with pytest.raises(InputBoundaryError, match=reason) as error:
            await controller.act(ctx, action)
        assert error.value.execution == {"injected": False, "sent": False}
        guidance = failure_guidance({"status": "rejected", "reason": reason,
                                     "execution": error.value.execution})
        assert guidance["input_outcome"] == "not_dispatched"
        assert not guidance["terminal"]
        assert backend.focus_calls == []


async def test_focus_backend_clean_refusal_keeps_session_usable(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, observed, action):
        async def refuse(payload, *, expected_candidate):
            backend.focus_calls.append(payload)
            return {"status": "unavailable", "focus_confirmed": False,
                    "injected": False, "released": True}

        backend.focus_acquire = refuse
        result = await controller.act(ctx, action)
        assert result["reason"] == "focus_preflight_refused"
        assert result["execution"] == {"injected": False, "sent": False, "released": True}
        assert controller.store.get_session(action["session_id"]).state == "active"


async def test_capture_only_click_refusal_has_non_dispatch_evidence(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, observed, action):
        click = {**action, "operation": "click", "action_id": "capture-only-click"}
        with pytest.raises(InputBoundaryError, match="invalid_target") as error:
            await controller.act(ctx, click)
        result = failure_guidance({"status": "rejected", "reason": error.value.code,
                                   "execution": error.value.execution})
        assert result["input_outcome"] == "not_dispatched"
        assert result["terminal"] is False
        assert backend.click_calls == []


@pytest.mark.parametrize("change", ["window", "geometry", "modal", "focus"])
async def test_candidate_changed_before_dispatch_refuses_without_click(tmp_path, change):
    async with setup(tmp_path) as (controller, backend, ctx, observed, action):
        if change == "window":
            backend.identity = "replacement"
        elif change == "geometry":
            backend.source = replace(backend.source, source_revision=2)
        elif change == "modal":
            backend.modal = "overlay"
        else:
            backend.focused = True
        with pytest.raises(ComputerError, match="focus_candidate_changed"):
            await controller.act(ctx, action)
        assert not backend.focus_calls and not backend.click_calls


@pytest.mark.parametrize("mode", ["no_focus", "wrong_focus", "fail_release"])
async def test_unverified_focus_or_release_never_yields_typing_authority(tmp_path, mode):
    async with setup(tmp_path) as (controller, backend, ctx, observed, action):
        setattr(backend, mode, True)
        result = await controller.act(ctx, action)
        assert result["verification"].get("focus_confirmed") is not True
        assert "next_observation" not in result
        assert len(backend.focus_calls) == 1 and not backend.click_calls
        if mode == "fail_release":
            assert result["status"] == "unknown"
            assert controller.store.get_session(action["session_id"]).state != "active"


def test_focus_schema_forbids_typing_modifiers_and_batching():
    schema = next(t["input_schema"] for t in computer_definitions()
                  if t["name"] == "computer_act")
    single = next(case for case in schema["oneOf"]
                  if case["properties"]["operation"]["const"] == "focus")
    for key in ("text", "modifiers", "count", "region"):
        assert single["properties"][key] is False
    assert "focus" not in schema["properties"]["steps"]["items"]["properties"]["operation"]["enum"]
    inp = {"operation": "focus", "session_id": "a", "observation_id": "b",
           "action_id": "c", "generation": 1, "consent_generation": 1,
           "source_id": "d", "source_revision": 1, "x": 1, "y": 1,
           "expect": {"type": "visual_change"}}
    action_arguments(inp)
    for extra in ({"text": "bad"}, {"count": 2}, {"modifiers": ["ctrl"]},
                  {"expect": {"type": "pointer_at", "x": 1, "y": 1}}):
        with pytest.raises(ComputerError):
            action_arguments({**inp, **extra})
