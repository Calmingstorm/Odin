"""Measured effect behavior, without depending on an operator's desktop."""

import copy
from io import BytesIO
from types import SimpleNamespace

import pytest
from PIL import Image, ImageDraw

from src.computer.effects import effect_receipt, measured_appearance, stroke_effect
from src.computer.runtime.x11_appearance import appearance_transition, same_application_appearance


def png(draw=None, size=(200, 150)):
    image = Image.new("RGB", size, "white")
    if draw:
        draw(ImageDraw.Draw(image))
    stream = BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


def raster_result():
    return {
        "status": "verified",
        "execution": {"injected": True, "released": True},
        "verification": {"status": "satisfied", "target_application_matches": True},
    }


@pytest.mark.parametrize(
    "change,on_path",
    [
        (lambda d: d.rectangle((0, 0, 100, 10), fill="black"), False),
        (lambda d: d.ellipse((147, 47, 153, 53), outline="black"), True),
        (lambda d: d.line([(20, 50), (150, 50)], fill="red", width=5), True),
        (lambda d: d.rectangle((0, 0, 199, 149), fill="red"), True),
        (None, False),
    ],
)
def test_toolbar_cursor_fill_and_real_stroke_never_claim_semantic_mark(change, on_path):
    result = raster_result()
    stroke_effect(
        result,
        {"operation": "polyline", "points": [[20, 50], [150, 50]]},
        png(),
        png(change),
        binding_matches=True,
    )
    assert result["status"] == "executed"
    assert result["execution"]["released"] is True
    verification = result["verification"]
    assert verification["status"] == "unavailable"
    assert verification["semantic_mark_verified"] is False
    assert bool(verification["path_evidence"]["path_changed_pixels"]) is on_path
    assert verification["path_evidence"]["corridor_width_delivered_pixels"] == 5


@pytest.mark.parametrize("status", ["unknown", "interrupted", "unavailable"])
def test_stroke_does_not_rewrite_dispatch_release_failure(status):
    result = {"status": status}
    stroke_effect(result, {"type": "polyline"}, png(), png(), binding_matches=True)
    assert result == {"status": status}


@pytest.mark.parametrize(
    "before,after,binding,points,reason",
    [
        (None, None, False, [[1, 1], [2, 2]], "stroke_evidence_binding_unavailable"),
        (png(), png(size=(10, 10)), True, [[1, 1], [2, 2]], "stroke_evidence_geometry_unavailable"),
        (png(), png(), True, [[-1, 1], [2, 2]], "stroke_evidence_geometry_unavailable"),
        (b"invalid", png(), True, [[1, 1], [2, 2]], "stroke_evidence_pixels_unavailable"),
    ],
)
def test_missing_or_invalid_stroke_evidence_is_not_verified(before, after, binding, points, reason):
    result = raster_result()
    stroke_effect(
        result, {"operation": "drag", "points": points}, before, after, binding_matches=binding
    )
    assert result["status"] == "executed"
    assert result["verification"]["reason"] == reason


def native_transition(kind="dialog", *, prior=0, complete=True):
    process = {"pid": 100, "start_ticks": 50}
    before = {
        "window": 10,
        "window_kind": "normal",
        "process": process,
        "topology": {"root": 2},
        "transient_chain": [],
    }
    after = {
        **before,
        "window": 20,
        "window_kind": kind,
        "modal": True,
        "modal_kind": "safe_application",
        "transient_chain": [10],
        "transient_processes": [process],
    }
    old = {
        "root": 2,
        "process": process,
        "target": 10,
        "complete": complete,
        "windows": [[2, 2], [10, 2], [20, prior]],
    }
    new = {**old, "target": 20, "windows": [[2, 2], [10, 2], [20, 2]]}
    return old, new, before, after


@pytest.mark.parametrize("kind", ["dialog", "normal", "menu"])
def test_native_new_transient_dialog_and_menu(kind):
    transition = appearance_transition(*native_transition(kind))
    assert transition["appeared"] is True
    assert transition["kind"] == ("dialog" if kind == "normal" else kind)


@pytest.mark.parametrize("prior", [1, 2])
def test_focus_or_ancestor_restore_is_not_native_appearance(prior):
    assert appearance_transition(*native_transition(prior=prior))["appeared"] is False


def test_incomplete_native_inventory_cannot_prove_dialog():
    assert appearance_transition(*native_transition(complete=False)) is None


def test_utility_dialog_requires_native_same_process_chain():
    args = native_transition("normal")
    args[3]["transient_processes"] = [{"pid": 200}]
    assert appearance_transition(*args)["kind"] == "normal"


def test_gimp_native_dialog_without_transient_hint_is_same_app_only_on_new_map():
    old, new, before, after = native_transition()
    before.update(source_rect=[0, 0, 200, 150], source_origin=[0, 0])
    after.update(
        source_rect=[0, 0, 200, 150],
        source_origin=[0, 0],
        focused=True,
        transient_chain=[],
        transient_processes=[],
    )
    transition = appearance_transition(old, new, before, after)
    assert same_application_appearance(before, after, transition)
    assert not same_application_appearance(before, after, {**transition, "appeared": False})
    assert not same_application_appearance(before, {**after, "process": {"pid": 55}}, transition)
    assert not same_application_appearance(before, {**after, "modal_kind": "unknown"}, transition)
    assert not same_application_appearance(before, {**after, "focused": False}, transition)
    assert not same_application_appearance(before, after, None)


def receipt(transition):
    source = SimpleNamespace(source_id="source", source_revision=1, consent_generation=1)
    raw = {
        "status": "executed",
        "injected": True,
        "released": True,
        "postcondition": {
            "type": "visual_change",
            "status": "observed",
            "method": "raster_digest_after_release",
            **vars(source),
            "target_application_matches": True,
            "actual": {"before_sha256": "a" * 64, "after_sha256": "b" * 64},
            "transition": transition,
        },
    }
    return raw, SimpleNamespace(source=source)


@pytest.mark.parametrize("expect", ["visual_change", "dialog_appeared"])
def test_bound_native_appearance_is_available_to_controller_gate(expect):
    raw, observation = receipt(appearance_transition(*native_transition("normal")))
    result = effect_receipt(raw, observation, {"type": expect})
    assert result["status"] == "verified"
    assert measured_appearance(result)


@pytest.mark.parametrize("damage", ["process", "source", "incomplete", "focused", "release"])
def test_pixel_change_alone_or_damaged_provenance_does_not_allow_dialog(damage):
    raw, observation = receipt(appearance_transition(*native_transition()))
    if damage == "process":
        raw["postcondition"]["target_application_matches"] = False
    elif damage == "source":
        raw["postcondition"]["source_revision"] += 1
    elif damage == "incomplete":
        raw["postcondition"].pop("transition")
    elif damage == "focused":
        raw["postcondition"]["transition"]["appeared"] = False
    else:
        raw["released"] = False
    result = effect_receipt(raw, observation, {"type": "visual_change"})
    assert not measured_appearance(result)


def test_nonstroke_visual_contract_unchanged():
    result = raster_result()
    previous = copy.deepcopy(result)
    stroke_effect(result, {"operation": "click"}, png(), png(), binding_matches=True)
    assert result == previous


@pytest.mark.parametrize(
    "change,supported",
    [
        (lambda d: d.rectangle((0, 0, 100, 10), fill="black"), False),
        (lambda d: d.ellipse((147, 47, 153, 53), outline="black"), False),
        (lambda d: d.line([(20, 50), (150, 50)], fill="red", width=5), True),
        (lambda d: d.rectangle((0, 0, 199, 149), fill="red"), False),
        (None, False),
    ],
)
def test_batch_continuation_requires_distributed_local_evidence(change, supported):
    result = raster_result()
    stroke_effect(
        result,
        {"operation": "polyline", "points": [[20, 50], [150, 50]]},
        png(),
        png(change),
        binding_matches=True,
    )
    assert result["status"] == "executed"
    assert result["verification"]["path_evidence"]["continuation_supported"] is supported
    assert result["verification"]["semantic_mark_verified"] is False


def test_repeated_short_path_not_eligible_for_continuation():
    result = raster_result()
    stroke_effect(
        result,
        {"operation": "polyline", "points": [[20, 50], [21, 50]] * 20},
        png(),
        png(lambda d: d.line([(20, 50), (21, 50)], fill="red", width=5)),
        binding_matches=True,
    )
    assert not result["verification"]["path_evidence"]["continuation_supported"]
