"""Pure contracts: forged verdicts and hints never authorize native input."""

from copy import deepcopy
from types import SimpleNamespace

import pytest

from src.computer.actions import click_arguments, click_payload, click_receipt
from src.computer.geometry import AffineTransform, SourceGeometry
from src.computer.gui_actions import action_arguments, action_payload, visual_receipt
from src.computer.models import ComputerError
from src.computer.task_context import TaskContext, context_arguments


def view():
    return SimpleNamespace(
        source=SourceGeometry("source", 1, 1, 100, 100, "input", 100, 100, AffineTransform()),
        width=100,
        height=100,
        delivered_to_source=AffineTransform(),
        accessibility=[],
        modal=None,
        modal_kind=None,
        scope="scope",
        observation_id="observation",
    )


def action(operation="click", **fields):
    defaults = (
        {"x": 2, "y": 3, "expect": {"type": "pointer_at", "x": 2, "y": 3}}
        if operation == "click"
        else {"expect": {"type": "visual_change"}}
    )
    return (
        dict(
            session_id="session",
            generation=1,
            consent_generation=1,
            source_id="source",
            source_revision=1,
            action_id="action",
            observation_id="observation",
            operation=operation,
        )
        | defaults
        | fields
    )


def test_legacy_click_contract_and_mapping():
    inp = action()
    click_arguments(inp)
    payload, target = click_payload(inp, view())
    assert target == (2, 3) and payload["type"] == "click"
    assert payload["expected"] == inp["expect"]


@pytest.mark.parametrize(
    "change,reason",
    [
        ({"session_id": "bad space"}, "invalid_arguments"),
        ({"operation": "type"}, "unsupported_operation"),
        ({"expect": {"type": "visual_change", "x": 2, "y": 3}}, "unsupported_postcondition"),
        ({"expect": {"type": "pointer_at", "x": 3, "y": 3}}, "postcondition_target_mismatch"),
    ],
)
def test_legacy_click_validation_failures(change, reason):
    with pytest.raises(ComputerError, match=reason):
        click_arguments(action() | change)


@pytest.mark.parametrize(
    "change,reason",
    [
        ({"source_revision": 2}, "stale_source_binding"),
        ({"x": 100}, "invalid_target"),
    ],
)
def test_click_payload_rejects_stale_or_outside_source(change, reason):
    with pytest.raises(ComputerError, match=reason):
        click_payload(action() | change, view())


def pointer_raw():
    return {
        "status": "verified",
        "injected": True,
        "released": True,
        "postcondition": {
            "type": "pointer_at",
            "method": "pointer_query_after_release",
            "source_id": "source",
            "source_revision": 1,
            "consent_generation": 1,
            "actual": {"x": 2, "y": 3},
            "target_window_matches": True,
        },
    }


@pytest.mark.parametrize(
    "change",
    [
        None,
        {"released": False},
        {"injected": 1},
        {"injected": False},
        {"status": "claimed_success"},
    ],
)
def test_pointer_unproven_dispatch_is_unknown(change):
    raw = None if change is None else pointer_raw() | change
    assert click_receipt(raw, view(), (2, 3))["status"] == "unknown"


@pytest.mark.parametrize(
    "change",
    [
        {"method": "model_claim"},
        {"source_revision": True},
        {"consent_generation": 2},
        {"actual": {"x": True, "y": 3}},
        {"actual": {"x": 100, "y": 3}},
        {"actual": {"x": 2, "y": 3, "extra": 0}},
        {"target_window_matches": "yes"},
    ],
)
def test_pointer_evidence_requires_typed_binding_and_extent(change):
    raw = pointer_raw()
    raw["postcondition"].update(change)
    assert click_receipt(raw, view(), (2, 3))["status"] == "unknown"


@pytest.mark.parametrize(
    "binding,point,status",
    [
        (True, (2, 3), "verified"),
        (False, (2, 3), "not_satisfied"),
        (True, (3, 3), "not_satisfied"),
    ],
)
def test_pointer_verdict_is_recomputed_not_trusted(binding, point, status):
    raw = pointer_raw()
    raw["postcondition"].update(
        target_window_matches=binding, actual=dict(zip(("x", "y"), point, strict=True))
    )
    result = click_receipt(raw, view(), (2, 3))
    assert result["status"] == status
    assert result["verification"]["scope"] == "pointer_location_only"


def test_pointer_missing_measurement_and_clean_refusal():
    raw = pointer_raw()
    raw.pop("postcondition")
    assert click_receipt(raw, view(), (2, 3))["status"] == "executed"
    assert click_receipt(
        {"status": "unavailable", "released": True, "injected": False}, view(), (2, 3)
    )["execution"] == {"injected": False, "released": True}


@pytest.mark.parametrize(
    "inp,reason",
    [
        (action() | {"region": dict(x=1, y=1, width=2, height=2)}, "invalid_target"),
        (action() | {"modifiers": ["ctrl", "ctrl"]}, "invalid_modifiers"),
        (
            action() | {"expect": dict(type="field_text_equals", target="field", text="x")},
            "field_text_verification_requires_replace_field",
        ),
        (action("replace_field", text="x", target="bad space"), "invalid_target"),
        (action("replace_field", text="x", target="field"), "field_text_verification_required"),
        (
            action("replace_field_pixels", text="x\t", region=dict(x=0, y=0, width=2, height=2)),
            "invalid_text",
        ),
        (action("polyline", points=[[0, 0], [1]], duration=0.1), "invalid_target"),
    ],
)
def test_gui_strict_arguments(inp, reason):
    with pytest.raises(ComputerError, match=reason):
        action_arguments(inp)


def test_region_center_and_corners_are_grounded_without_mutating_input():
    inp = action("right_click", region=dict(x=2, y=4, width=4, height=6))
    before = deepcopy(inp)
    action_arguments(inp)
    payload, target = action_payload(inp, view())
    assert (payload["x"], payload["y"]) == (3, 6) and target is None
    assert inp == before
    inp = action("replace_field_pixels", region=dict(x=0, y=0, width=100, height=100), text="")
    action_arguments(inp)
    assert action_payload(inp, view())[0]["region"] == inp["region"]
    inp["region"]["width"] = 101
    with pytest.raises(ComputerError, match="invalid_bounds"):
        action_payload(inp, view())


def test_accessible_replacement_requires_unique_readable_capable_target():
    inp = action("replace_field", target="field", text="new")
    inp["expect"] = {"type": "field_text_equals", "target": "field", "text": "new"}
    action_arguments(inp)
    obs = view()
    node = {"handle": "field", "text_readable": True, "capabilities": ["replace_field"]}
    for nodes in (
        [],
        [node, node],
        [node | {"text_readable": False}],
        [node | {"capabilities": []}],
    ):
        obs.accessibility = nodes
        with pytest.raises(ComputerError, match="accessible_target_unavailable"):
            action_payload(inp, obs)
    obs.accessibility = [node]
    assert action_payload(inp, obs)[0]["target"] == "field"


def test_modal_binding_and_click_options_are_preserved():
    inp = action() | {"expected_modal": "dialog", "count": 2, "modifiers": ["shift"]}
    obs = view()
    with pytest.raises(ComputerError, match="stale_modal_binding"):
        action_payload(inp, obs)
    obs.modal, obs.modal_kind = "dialog", "safe_application"
    payload, _ = action_payload(inp, obs)
    assert payload["expected_modal"] == "dialog"
    assert payload["count"] == 2 and payload["modifiers"] == ["shift"]
    obs.modal_kind = "security"
    with pytest.raises(ComputerError, match="unexpected_modal"):
        action_payload(inp, obs)


@pytest.mark.parametrize(
    "characters",
    [
        None,
        [],
        [1],
        [{"index": True, "codepoint": 65}],
        [{"index": 0, "codepoint": 65}, {"index": 0, "codepoint": 66}],
        [{"index": 0, "codepoint": 0xD800}],
        [{"index": 0, "codepoint": "bad"}],
    ],
)
def test_unsupported_character_diagnostics_are_bounded_and_typed(characters):
    raw = {
        "status": "unavailable",
        "injected": False,
        "released": True,
        "reason": "unsupported_character",
        "unsupported_characters": characters,
    }
    assert visual_receipt(raw, view())["status"] == "unknown"


def test_visual_claim_without_proven_dispatch_or_binding_is_unknown():
    for raw in (None, {}, {"status": "verified", "injected": False, "released": True}):
        assert visual_receipt(raw, view())["status"] == "unknown"
    raw = {
        "status": "verified",
        "injected": True,
        "released": True,
        "postcondition": {
            "type": "visual_change",
            "method": "raster_digest_after_release",
            "source_id": "wrong",
            "target_application_matches": True,
        },
    }
    assert visual_receipt(raw, view())["status"] == "unknown"


@pytest.mark.parametrize(
    "value",
    [
        None,
        {},
        {"authority": "yes"},
        {"goal": ""},
        {"goal": "x" * 161},
        {"goal": "bad\n"},
        {"goal": "\ud800"},
        {"goal": 1},
    ],
)
def test_context_rejects_invalid_hints(value):
    with pytest.raises(ComputerError, match="invalid_task_context"):
        context_arguments(value)


@pytest.mark.parametrize(
    "same_digest,binding,status",
    [
        (False, True, "verified"),
        (True, True, "not_satisfied"),
        (False, False, "not_satisfied"),
    ],
)
def test_visual_verdict_is_only_raster_evidence(same_digest, binding, status):
    raw = {
        "status": "verified",
        "injected": True,
        "released": True,
        "postcondition": {
            "type": "visual_change",
            "method": "raster_digest_after_release",
            "source_id": "source",
            "source_revision": 1,
            "consent_generation": 1,
            "target_application_matches": binding,
            "actual": {
                "before_sha256": "a" * 64,
                "after_sha256": ("a" if same_digest else "b") * 64,
            },
        },
    }
    result = visual_receipt(raw, view())
    assert result["status"] == status
    assert result["verification"]["scope"] == "raster_change_only"
    raw["postcondition"]["actual"]["after_sha256"] = "not-a-digest"
    assert visual_receipt(raw, view())["status"] == "unknown"


def test_hints_survive_but_never_authorize_even_after_delivery():
    ctx = TaskContext()
    ctx.describe({"goal": "draw", "tool": "brush"}, delivered_observation_id=None)
    assert ctx.public()["state"] == "unverified"
    assert ctx.public()["reason"] == "no_delivered_view"
    obs = view()
    ctx.captured(obs)
    ctx.delivered(obs.observation_id)
    assert ctx.public()["state"] == "unverified"
    ctx.describe({"color": "blue"}, delivered_observation_id=obs.observation_id)
    assert ctx.public()["state"] == "caller_described"
    obs.source = SourceGeometry("other-monitor", 1, 1, 100, 100, "input", 100, 100,
                                AffineTransform())
    ctx.captured(obs)
    public = ctx.public()
    assert public["state"] == "stale" and public["reason"] == "target_binding_changed"
    assert "check them against the current view" in public["recovery"]
    assert public["authorizes_input"] is False
    assert public["hints"] == {"goal": "draw", "tool": "brush", "color": "blue"}
    public["hints"].clear()
    assert ctx.hints


def revision(number, source_id="source"):
    return SourceGeometry(source_id, number, 1, 100, 100, "input", 100, 100, AffineTransform())


def test_own_actions_never_make_notes_stale():
    """A revision bump or a dialog the caller's own input opened is its own transition."""
    ctx = TaskContext()
    obs = view()
    ctx.captured(obs)
    ctx.identify({"pid": 7, "start_ticks": 70, "exe_basename": "krita"})
    ctx.describe({"color": "navy"}, delivered_observation_id=obs.observation_id)
    for number in range(2, 6):
        ctx.acted()
        obs.source = revision(number)
        obs.scope = f"dialog-{number}"
        obs.modal = f"modal-{number}" if number % 2 else None
        ctx.captured(obs)
        ctx.identify({"pid": 7, "start_ticks": 70, "exe_basename": "krita"})
        public = ctx.public()
        assert public["state"] == "caller_described" and public["reason"] is None
        assert "recovery" not in public and public["authorizes_input"] is False
        assert public["target"]["source_revision"] == number
    # Captures without new input and without a target change stay quiet too.
    ctx.captured(obs)
    assert ctx.public()["state"] == "caller_described"


def test_external_window_change_makes_notes_stale():
    """A revision change that no own input preceded: someone switched windows."""
    ctx = TaskContext()
    obs = view()
    ctx.captured(obs)
    ctx.describe({"goal": "edit the original document"}, delivered_observation_id="o")
    ctx.acted()
    obs.source = revision(2)
    ctx.captured(obs)  # the caller's own transition consumes its one capture
    assert ctx.public()["state"] == "caller_described"
    obs.source = revision(3)
    ctx.captured(obs)
    public = ctx.public()
    assert public["state"] == "stale" and public["reason"] == "target_binding_changed"
    assert "recovery" in public


def test_action_end_expires_an_unconsumed_own_input_mark():
    obs = view()
    unseen = TaskContext()
    unseen.captured(obs)
    unseen.describe({"color": "navy"}, delivered_observation_id="o")
    unseen.acted()
    unseen.action_finished()  # no verification capture consumed the mark
    public = unseen.public()
    assert unseen.own_transition is False
    assert public["state"] == "stale" and public["reason"] == "post_action_view_unavailable"
    seen = TaskContext()
    seen.captured(obs)
    seen.describe({"color": "navy"}, delivered_observation_id="o")
    seen.acted()
    obs.source = revision(2)
    seen.captured(obs)
    seen.action_finished()
    assert seen.public()["state"] == "caller_described" and seen.own_transition is False


def test_a_different_application_makes_notes_stale():
    ctx = TaskContext()
    ctx.identify({})
    ctx.identify({"pid": 7, "start_ticks": 70, "exe_basename": "krita"})
    assert ctx.public()["state"] == "unobserved"
    ctx.identify({"pid": 9, "start_ticks": 90, "exe_basename": "xed"})
    public = ctx.public()
    assert public["state"] == "stale" and public["reason"] == "application_changed"
    assert public["application"] == {"pid": 9, "start_ticks": 90, "exe_basename": "xed"}
    assert "recovery" in public
