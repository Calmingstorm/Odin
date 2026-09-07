"""Measured effect contracts, independent of dispatch and release acknowledgements."""
from io import BytesIO
from typing import Any

from .models import ComputerError
from .policy import exact_keys, integer

EFFECT_TYPES = {"visual_change", "pointer_at", "region_changed", "dialog_appeared",
                "menu_appeared", "window_gone", "field_text_equals"}
PHASES = {"preflight", "dispatch", "release", "verification", "complete"}


def expectation_arguments(expected):
    exact_keys(expected, {"type", "x", "y", "width", "height", "target", "text"}, {"type"})
    kind = expected["type"]
    if type(kind) is not str or kind not in EFFECT_TYPES:
        raise ComputerError("unsupported_postcondition")
    fields = {"pointer_at": {"x", "y"}, "region_changed": {"x", "y", "width", "height"},
              "field_text_equals": {"target", "text"}}.get(kind, set())
    exact_keys(expected, {"type"} | fields, {"type"} | fields)
    for key in fields & {"x", "y", "width", "height"}:
        integer(expected[key], 1 if key in {"width", "height"} else 0, 999_999)
    if kind == "field_text_equals":
        from .geometry import GeometryError, opaque_id
        try:
            opaque_id(expected["target"])
            text = expected["text"]
            if type(text) is not str or len(text) > 512 or "\x00" in text:
                raise ValueError
            text.encode("utf-8")
        except (ValueError, GeometryError):
            raise ComputerError("invalid_arguments") from None


def execution_receipt(raw, result):
    """Preserve release even on missing verification; never forward native prose."""
    raw = raw if type(raw) is dict else {}
    released = raw.get("released") is True
    injected = raw.get("injected") if type(raw.get("injected")) is bool else None
    result["execution"] = {"injected": injected, "sent": injected, "released": released}
    result.setdefault("verification", {"status": "unavailable"})
    if not released:
        result.update(status="unknown", reason="input_release_unknown")
    elif result["status"] == "unknown":
        result.update(status="interrupted", reason="effect_unknown_reconcile_no_replay")
    diagnostics = raw.get("diagnostics", {})
    diagnostics = diagnostics if type(diagnostics) is dict else {}
    phase = diagnostics.get("phase")
    safe: dict[str, Any] = {"phase": phase if type(phase) is str and phase in PHASES else
            ("verification" if injected else "dispatch"),
            "release": "confirmed" if released else "unknown", "replay_allowed": False}
    for key in ("steps_planned", "steps_completed"):
        value = diagnostics.get(key)
        if type(value) is int and 0 <= value <= 100_000:
            safe[key] = value
    reason = raw.get("reason")
    if type(reason) is str and reason in {
            "complete", "input_dispatch_expired", "input_lease_expired", "controller_closed",
            "application_scope_changed", "application_scope_unavailable", "human_input_overlap",
            "input_cancelled", "invalid_polyline", "unsupported_character", "unsupported_key",
            "native_input_failed", "input_scope_changed", "input_revoked"}:
        safe["reason"] = reason
    if result["status"] in {"interrupted", "unknown"}:
        safe["next_action"] = "stop" if not released else "observe_and_reconcile"
    result["diagnostics"] = safe
    return result


def effect_receipt(raw, observation, expected, target=None):
    from .actions import click_receipt
    from .gui_actions import visual_receipt
    kind = expected["type"]
    if kind == "field_text_equals":
        if (type(raw) is dict and raw.get("status") == "unavailable"
                and raw.get("injected") is False and raw.get("released") is True):
            result = {"status": "unavailable", "reason": "backend_refused"}
        else:
            result = {"status": "executed" if type(raw) is dict and raw.get("status") in
                      {"executed", "verified", "not_satisfied"} else "unknown"}
    else:
        result = (click_receipt(raw, observation, target) if kind == "pointer_at"
                  else visual_receipt(raw, observation))
    result = execution_receipt(raw, result)
    if kind in {"pointer_at", "visual_change"}:
        return result
    evidence = raw.get("postcondition", {}) if type(raw) is dict else {}
    evidence = evidence if type(evidence) is dict else {}
    same_app = result.get("verification", {}).get("target_application_matches") is True
    native_binding = all(type(evidence.get(key)) is type(getattr(observation.source, key))
                         and evidence.get(key) == getattr(observation.source, key)
                         for key in ("source_id", "source_revision", "consent_generation"))
    result["verification"] = {"status": "unavailable", "type": kind,
                              "target_application_matches": same_app}
    if (not result["execution"]["released"] or result["execution"]["injected"] is not True
            or result["status"] == "interrupted"):
        return result
    satisfied = None
    method = None
    if kind == "window_gone" and native_binding:
        if (evidence.get("target_state_method") == "native_window_state_after_release"
                and evidence.get("target_state") in {"destroyed", "unmapped", "viewable"}):
            satisfied = evidence["target_state"] in {"destroyed", "unmapped"}
            method = "native_window_state_after_release"
            result["verification"]["target_disappeared"] = satisfied
    elif kind in {"dialog_appeared", "menu_appeared"} and native_binding and same_app:
        transition = evidence.get("transition")
        if (type(transition) is dict and transition.get("method")
                == "native_complete_map_inventory_transition"
                and type(transition.get("appeared")) is bool
                and transition.get("kind") in {"dialog", "menu", "normal"}):
            satisfied = (transition["appeared"]
                         and transition["kind"] == kind.removesuffix("_appeared"))
            method = "native_complete_map_inventory_transition"
    elif kind == "field_text_equals" and native_binding:
        actual = evidence.get("actual")
        if (evidence.get("type") == kind and evidence.get("target") == expected["target"]
                and evidence.get("method") == "accessibility_text_after_release"
                and evidence.get("target_application_matches") is True
                and type(actual) is dict and actual.get("text_complete") is True
                and type(actual.get("text")) is str and len(actual["text"]) <= 512):
            satisfied = actual["text"] == expected["text"]
            same_app = True
            method = "accessibility_text_after_release"
    if result["status"] != "interrupted":
        result["status"] = ("executed" if satisfied is None
                            else ("verified" if satisfied else "not_satisfied"))
    result["verification"].update(
        status=("unavailable" if satisfied is None
                else ("satisfied" if satisfied else "not_satisfied")),
        method=method, target_application_matches=same_app)
    return result


def region_effect(result, expected, before, after, *, binding_matches):
    """Compare only the requested delivered-image region, never changed geometry."""
    if (expected["type"] != "region_changed" or not binding_matches
            or result.get("status") in {"interrupted", "unknown", "unavailable"}):
        return
    from PIL import Image, ImageChops
    x, y, width, height = (expected[k] for k in ("x", "y", "width", "height"))
    with Image.open(BytesIO(before)) as old, Image.open(BytesIO(after)) as new:
        if old.size != new.size or x + width > old.width or y + height > old.height:
            raise ComputerError("postcondition_region_changed_geometry")
        box = (x, y, x + width, y + height)
        changed = ImageChops.difference(old.crop(box).convert("RGB"),
                                       new.crop(box).convert("RGB")).getbbox() is not None
    result["status"] = "verified" if changed else "not_satisfied"
    result["verification"].update(status="satisfied" if changed else "not_satisfied",
                                  method="delivered_region_pixels_after_release",
                                  scope="region_raster_change_only")
