"""Measured effect contracts, independent of dispatch and release acknowledgements."""

from io import BytesIO
from math import hypot
from typing import Any

from .models import ComputerError
from .policy import exact_keys, integer

EFFECT_TYPES = {
    "visual_change",
    "pointer_at",
    "region_changed",
    "dialog_appeared",
    "menu_appeared",
    "window_gone",
    "field_text_equals",
}
PHASES = {"preflight", "dispatch", "release", "verification", "complete"}


def expectation_arguments(expected):
    exact_keys(expected, {"type", "x", "y", "width", "height", "target", "text"}, {"type"})
    kind = expected["type"]
    if type(kind) is not str or kind not in EFFECT_TYPES:
        raise ComputerError("unsupported_postcondition")
    fields = {
        "pointer_at": {"x", "y"},
        "region_changed": {"x", "y", "width", "height"},
        "field_text_equals": {"target", "text"},
    }.get(kind, set())
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
    safe: dict[str, Any] = {
        "phase": phase
        if type(phase) is str and phase in PHASES
        else ("verification" if injected else "dispatch"),
        "release": "confirmed" if released else "unknown",
        "replay_allowed": False,
    }
    for key in ("steps_planned", "steps_completed"):
        value = diagnostics.get(key)
        if type(value) is int and 0 <= value <= 100_000:
            safe[key] = value
    reason = raw.get("reason")
    if type(reason) is str and reason in {
        "complete",
        "input_dispatch_expired",
        "input_lease_expired",
        "controller_closed",
        "application_scope_changed",
        "application_scope_unavailable",
        "human_input_overlap",
        "input_cancelled",
        "invalid_polyline",
        "unsupported_character",
        "unsupported_key",
        "native_input_failed",
        "input_scope_changed",
        "input_revoked",
    }:
        safe["reason"] = reason
    if result["status"] in {"interrupted", "unknown"}:
        safe["next_action"] = "stop" if not released else "observe_and_reconcile"
    result["diagnostics"] = safe
    path = raw.get("targeting_path")
    if type(path) is str and path in {
        "native_atspi_identity",
        "explicit_pixel_region",
        "observed_pixel_coordinates",
        "native_window_focus",
    }:
        result["targeting"] = {"path": path}
        if path == "explicit_pixel_region":
            result["targeting"].update(
                accessible_identity=False,
                text_readback=False,
                field_focus="visually_grounded_not_semantically_proven",
                contents_require_visual_inspection=True,
            )
    return result


def effect_receipt(raw, observation, expected, target=None):
    from .actions import click_receipt
    from .gui_actions import visual_receipt

    kind = expected["type"]
    if kind == "field_text_equals":
        if (
            type(raw) is dict
            and raw.get("status") == "unavailable"
            and raw.get("injected") is False
            and raw.get("released") is True
        ):
            result = {"status": "unavailable", "reason": "backend_refused"}
        else:
            result = {
                "status": "executed"
                if type(raw) is dict
                and raw.get("status") in {"executed", "verified", "not_satisfied"}
                else "unknown"
            }
    else:
        result = (
            click_receipt(raw, observation, target)
            if kind == "pointer_at"
            else visual_receipt(raw, observation)
        )
    result = execution_receipt(raw, result)
    if kind == "pointer_at":
        return result
    evidence = raw.get("postcondition", {}) if type(raw) is dict else {}
    evidence = evidence if type(evidence) is dict else {}
    same_app = result.get("verification", {}).get("target_application_matches") is True
    native_binding = all(
        type(evidence.get(key)) is type(getattr(observation.source, key))
        and evidence.get(key) == getattr(observation.source, key)
        for key in ("source_id", "source_revision", "consent_generation")
    )
    transition = evidence.get("transition")
    if (
        native_binding
        and same_app
        and type(transition) is dict
        and transition.get("method") == "native_complete_map_inventory_transition"
        and type(transition.get("appeared")) is bool
        and transition.get("kind") in {"dialog", "menu", "normal"}
    ):
        result["verification"]["native_transition"] = {
            key: transition[key] for key in ("method", "appeared", "kind")
        }
    if kind == "visual_change":
        return result
    native_transition = result["verification"].get("native_transition")
    result["verification"] = {
        "status": "unavailable",
        "type": kind,
        "target_application_matches": same_app,
    }
    if native_transition is not None:
        result["verification"]["native_transition"] = native_transition
    if (
        not result["execution"]["released"]
        or result["execution"]["injected"] is not True
        or result["status"] == "interrupted"
    ):
        return result
    satisfied = None
    method = None
    if kind == "window_gone" and native_binding:
        if evidence.get(
            "target_state_method"
        ) == "native_window_state_after_release" and evidence.get("target_state") in {
            "destroyed",
            "unmapped",
            "viewable",
        }:
            satisfied = evidence["target_state"] in {"destroyed", "unmapped"}
            method = "native_window_state_after_release"
            result["verification"]["target_disappeared"] = satisfied
    elif kind in {"dialog_appeared", "menu_appeared"} and native_binding and same_app:
        transition = evidence.get("transition")
        if (
            type(transition) is dict
            and transition.get("method") == "native_complete_map_inventory_transition"
            and type(transition.get("appeared")) is bool
            and transition.get("kind") in {"dialog", "menu", "normal"}
        ):
            satisfied = transition["appeared"] and transition["kind"] == kind.removesuffix(
                "_appeared"
            )
            method = "native_complete_map_inventory_transition"
    elif kind == "field_text_equals" and native_binding:
        actual = evidence.get("actual")
        if (
            evidence.get("type") == kind
            and evidence.get("target") == expected["target"]
            and evidence.get("method") == "accessibility_text_after_release"
            and evidence.get("target_application_matches") is True
            and type(actual) is dict
            and actual.get("text_complete") is True
            and type(actual.get("text")) is str
            and len(actual["text"]) <= 512
        ):
            satisfied = actual["text"] == expected["text"]
            same_app = True
            method = "accessibility_text_after_release"
    if result["status"] != "interrupted":
        result["status"] = (
            "executed" if satisfied is None else ("verified" if satisfied else "not_satisfied")
        )
    result["verification"].update(
        status=(
            "unavailable" if satisfied is None else ("satisfied" if satisfied else "not_satisfied")
        ),
        method=method,
        target_application_matches=same_app,
    )
    return result


def measured_appearance(result):
    """Accept only newly mapped same-app native dialogs/menus, not pixel guesses.

    Only effect_receipt's bound native evidence may populate native_transition.
    This allows a visual dialog open without granting fresh input or excusing
    an unmeasured modal/focus change.
    """
    verification = result.get("verification", {})
    transition = verification.get("native_transition", {})
    return (
        result.get("status") == "verified"
        and verification.get("target_application_matches") is True
        and transition.get("method") == "native_complete_map_inventory_transition"
        and transition.get("appeared") is True
        and transition.get("kind") in {"dialog", "menu"}
    )


def stroke_effect(result, action, before, after, *, binding_matches):
    """Report localized raster evidence without inventing semantic mark proof.

    Polylines also drag sliders, selections and windows. No canvas/tool/brush
    identity is part of this contract, so even perfect path coverage cannot
    prove a painted mark. Keep acknowledged input executed, with inspectable
    path evidence, rather than treating a cursor or toolbar repaint as success.
    """
    if action.get("type", action.get("operation")) not in {"polyline", "drag"}:
        return
    if result.get("status") in {"unknown", "interrupted", "unavailable"}:
        return
    verification = result.setdefault("verification", {})
    result["status"] = "executed"
    verification.update(
        status="unavailable",
        method="delivered_path_pixels_after_release",
        scope="requested_path_raster_evidence_only",
        semantic_mark_verified=False,
        reason="requested_mark_requires_visual_inspection",
    )
    if not binding_matches or before is None or after is None:
        verification["reason"] = "stroke_evidence_binding_unavailable"
        return
    from PIL import Image, ImageChops, ImageDraw

    try:
        with Image.open(BytesIO(before)) as old, Image.open(BytesIO(after)) as new:
            points = action.get("points")
            if (
                old.size != new.size
                or type(points) is not list
                or not 2 <= len(points) <= 256
                or any(
                    type(p) not in {list, tuple}
                    or len(p) != 2
                    or any(type(v) is not int for v in p)
                    or not 0 <= p[0] < old.width
                    or not 0 <= p[1] < old.height
                    for p in points
                )
            ):
                verification["reason"] = "stroke_evidence_geometry_unavailable"
                return
            # Fixed narrow delivered-pixel corridor is evidence, not a guessed
            # brush width. Count every RGB difference, including red-only edits.
            channels = ImageChops.difference(old.convert("RGB"), new.convert("RGB")).split()
            difference = ImageChops.lighter(
                ImageChops.lighter(channels[0], channels[1]), channels[2]
            ).point(lambda v: 255 if v else 0)
            mask = Image.new("L", old.size)
            ImageDraw.Draw(mask).line([tuple(p) for p in points], fill=255, width=5)
            changed = difference.histogram()[255]
            path_changed = ImageChops.multiply(difference, mask).histogram()[255]
            path_pixels = mask.histogram()[255]
            segments = [
                (a, b, hypot(b[0] - a[0], b[1] - a[1]))
                for a, b in zip(points, points[1:], strict=False)
            ]
            length = sum(segment[2] for segment in segments)
            hits = 0
            # Distributed interior samples reject a cursor repaint at either
            # endpoint. This is only continuation evidence for already-grounded
            # disconnected strokes, not proof of brush, color, or mark semantics.
            for sample in range(1, 9):
                remaining = length * sample / 9
                for a, b, segment_length in segments:
                    if segment_length and remaining <= segment_length:
                        ratio = remaining / segment_length
                        x = round(a[0] + ratio * (b[0] - a[0]))
                        y = round(a[1] + ratio * (b[1] - a[1]))
                        hits += (
                            difference.crop(
                                (
                                    max(0, x - 2),
                                    max(0, y - 2),
                                    min(old.width, x + 3),
                                    min(old.height, y + 3),
                                )
                            ).getbbox()
                            is not None
                        )
                        break
                    remaining -= segment_length
            span = hypot(
                max(p[0] for p in points) - min(p[0] for p in points),
                max(p[1] for p in points) - min(p[1] for p in points),
            )
            execution = result.get("execution", {})
            continuation = (
                execution.get("injected") is True
                and execution.get("released") is True
                and verification.get("target_application_matches") is True
                and span >= 24
                and hits >= 6
                and changed - path_changed <= old.width * old.height * 0.2
                and path_changed >= changed * 0.1
            )
            verification["path_evidence"] = {
                "changed_pixels": changed,
                "path_changed_pixels": path_changed,
                "path_pixels": path_pixels,
                "path_coverage": round(path_changed / path_pixels, 4) if path_pixels else 0,
                "outside_path_changed_pixels": changed - path_changed,
                "corridor_width_delivered_pixels": 5,
                "interior_samples_changed": hits,
                "interior_samples": 8,
                "continuation_supported": continuation,
            }
            if not path_changed:
                verification["reason"] = "no_requested_path_raster_change"
    except (OSError, ValueError):
        verification["reason"] = "stroke_evidence_pixels_unavailable"


def region_effect(result, expected, before, after, *, binding_matches):
    """Compare only the requested delivered-image region, never changed geometry."""
    if (
        expected["type"] != "region_changed"
        or not binding_matches
        or result.get("status") in {"interrupted", "unknown", "unavailable"}
        or result.get("execution", {}).get("injected") is not True
        or result.get("execution", {}).get("released") is not True
        or result.get("verification", {}).get("target_application_matches") is not True
    ):
        return
    from PIL import Image, ImageChops

    x, y, width, height = (expected[k] for k in ("x", "y", "width", "height"))
    with Image.open(BytesIO(before)) as old, Image.open(BytesIO(after)) as new:
        if old.size != new.size or x + width > old.width or y + height > old.height:
            raise ComputerError("postcondition_region_changed_geometry")
        box = (x, y, x + width, y + height)
        changed = (
            ImageChops.difference(
                old.crop(box).convert("RGB"), new.crop(box).convert("RGB")
            ).getbbox()
            is not None
        )
    result["status"] = "verified" if changed else "not_satisfied"
    result["verification"].update(
        status="satisfied" if changed else "not_satisfied",
        method="delivered_region_pixels_after_release",
        scope="region_raster_change_only",
    )
