"""Bounded GUI actions. Visual change is not semantic task success."""

import math
import re
from typing import Any

from .actions import _REQUIRED, click_arguments, click_payload
from .geometry import GeometryError, opaque_id
from .models import ComputerError
from .policy import exact_keys, integer
from .runtime.primitives import parse_key_chord


def crop_arguments(crop, width=None, height=None):
    """Validate source-pixel crop shape, then optional selected-source extent."""
    exact_keys(crop, {"x", "y", "width", "height"}, {"x", "y", "width", "height"})
    for key in ("x", "y"):
        integer(crop[key], 0, 999_999)
    for key in ("width", "height"):
        integer(crop[key], 1, 1_000_000)
    if ((width is not None and crop["x"] + crop["width"] > width)
            or (height is not None and crop["y"] + crop["height"] > height)):
        raise ComputerError("invalid_bounds")
    return dict(crop)


def action_arguments(inp):
    fields = {"click": {"x", "y"}, "double_click": {"x", "y"},
              "right_click": {"x", "y"}, "middle_click": {"x", "y"},
              "scroll": {"x", "y", "direction", "count"},
              "type": {"text"}, "key": {"key"},
              "drag": {"points", "duration"}, "polyline": {"points", "duration"}}
    exact_keys(inp, _REQUIRED | set().union(*fields.values()) | {"expected_modal"}, _REQUIRED)
    operation = inp["operation"]
    if type(operation) is not str or operation not in fields:
        raise ComputerError("unsupported_operation")
    exact_keys(inp, _REQUIRED | fields[operation] | {"expected_modal"},
               _REQUIRED | fields[operation])
    for key in ("session_id", "source_id", "action_id", "observation_id", "expected_modal"):
        if key in inp:
            try:
                opaque_id(inp[key])
            except GeometryError:
                raise ComputerError("invalid_arguments") from None
    for key in ("generation", "consent_generation", "source_revision"):
        integer(inp[key], 1, 2**63 - 1)
    expected = inp["expect"]
    exact_keys(expected, {"type", "x", "y"}, {"type"})
    if expected["type"] == "pointer_at" and operation == "click":
        return click_arguments(inp)
    if expected != {"type": "visual_change"}:
        raise ComputerError("unsupported_postcondition")
    if operation in {"click", "double_click", "right_click", "middle_click", "scroll"}:
        for key in ("x", "y"):
            integer(inp[key], 0, 999_999)
        if operation == "scroll":
            if type(inp["direction"]) is not str or inp["direction"] not in {
                    "up", "down", "left", "right"}:
                raise ComputerError("invalid_arguments")
            integer(inp["count"], 1, 20)
    elif operation == "type":
        text = inp["text"]
        if (type(text) is not str or not 1 <= len(text) <= 512
                or any(ord(c) < 32 and c not in "\n\t" for c in text)):
            raise ComputerError("invalid_text")
        try:
            text.encode("utf-8")
        except UnicodeError:
            raise ComputerError("invalid_text") from None
    elif operation == "key":
        try:
            parse_key_chord(inp["key"])
        except ValueError:
            raise ComputerError("unsupported_key") from None
    else:
        points, duration = inp["points"], inp["duration"]
        if type(points) is not list or not 2 <= len(points) <= 256:
            raise ComputerError("invalid_target")
        for point in points:
            if type(point) is not list or len(point) != 2:
                raise ComputerError("invalid_target")
            for value in point:
                integer(value, 0, 999_999)
        if (type(duration) not in (int, float) or not math.isfinite(duration)
                or not 0 <= duration <= 1):
            raise ComputerError("invalid_bounds")


def action_payload(inp, observation):
    source = observation.source
    if any(inp[key] != getattr(source, key) for key in
           ("source_id", "source_revision", "consent_generation")):
        raise ComputerError("stale_source_binding")
    if observation.modal is not None:
        if (observation.modal_kind != "safe_application"
                or inp.get("expected_modal") != observation.modal):
            raise ComputerError("unexpected_modal")
    elif "expected_modal" in inp:
        raise ComputerError("stale_modal_binding")
    if inp["operation"] == "click":
        payload, target = click_payload(inp, observation)
    else:
        payload = {key: inp[key] for key in
                   ("source_id", "source_revision", "consent_generation")}
        payload.update(type={"drag": "polyline"}.get(inp["operation"], inp["operation"]),
                       expected=dict(inp["expect"]))
        for key in ("text", "points", "duration", "x", "y", "direction", "count"):
            if key in inp:
                payload[key] = inp[key]
        if inp["operation"] == "key":
            payload["chord"] = inp["key"]
        try:
            if "x" in inp:
                source.input_point(observation.delivered_to_source, inp["x"], inp["y"],
                                   observation.width, observation.height)
            for point in inp.get("points", []):
                source.input_point(observation.delivered_to_source, *point,
                                   observation.width, observation.height)
        except GeometryError:
            raise ComputerError("invalid_target") from None
        target = None
    if "expected_modal" in inp:
        payload["expected_modal"] = inp["expected_modal"]
    return payload, target


def visual_receipt(raw, observation):
    """Compare independent digests; never trust a supplied verdict."""
    unknown = {"status": "unknown", "reason": "input_outcome_unknown"}
    if (type(raw) is not dict or raw.get("released") is not True
            or type(raw.get("injected")) is not bool):
        return unknown
    if raw.get("status") == "unavailable" and raw["injected"] is False:
        refused: dict[str, Any] = {"status": "unavailable", "reason": "backend_refused",
                                   "execution": {"injected": False, "released": True}}
        reason = raw.get("reason")
        if isinstance(reason, str) and reason in {"unsupported_character", "unsupported_key"}:
            refused["reason"] = reason
        if reason == "unsupported_character":
            characters = raw.get("unsupported_characters", raw.get("characters"))
            if type(characters) is not list or not 1 <= len(characters) <= 512:
                return unknown
            normalized, seen = [], set()
            for character in characters:
                if type(character) is not dict:
                    return unknown
                index, codepoint = character.get("index"), character.get("codepoint")
                if type(index) is not int or not 0 <= index < 512 or index in seen:
                    return unknown
                if isinstance(codepoint, str) and re.fullmatch(r"U\+[0-9A-F]{4,6}", codepoint):
                    codepoint = int(codepoint[2:], 16)
                if (type(codepoint) is not int or not 0 <= codepoint <= 0x10FFFF
                        or 0xD800 <= codepoint <= 0xDFFF):
                    return unknown
                seen.add(index)
                normalized.append({"index": index, "codepoint": f"U+{codepoint:04X}"})
            refused["unsupported_characters"] = normalized
        return refused
    if (raw["injected"] is not True or raw.get("status") not in
            {"executed", "verified", "not_satisfied"}):
        return unknown
    result: dict[str, Any] = {
        "status": "executed", "execution": {"injected": True, "released": True},
        "verification": {"status": "unavailable", "type": "visual_change",
                         "scope": "raster_change_only"}}
    evidence = raw.get("postcondition")
    if type(evidence) is not dict or evidence.get("status") == "unavailable":
        return result
    source = observation.source
    if (evidence.get("type") != "visual_change"
            or evidence.get("method") != "raster_digest_after_release"
            or type(evidence.get("target_application_matches")) is not bool
            or any(type(evidence.get(key)) is not type(getattr(source, key))
                   or evidence.get(key) != getattr(source, key) for key in
                   ("source_id", "source_revision", "consent_generation"))):
        return unknown
    actual = evidence.get("actual")
    if (type(actual) is not dict or set(actual) != {"before_sha256", "after_sha256"}
            or any(type(v) is not str or len(v) != 64
                   or any(c not in "0123456789abcdef" for c in v) for v in actual.values())):
        return unknown
    binding = evidence["target_application_matches"]
    satisfied = binding and actual["before_sha256"] != actual["after_sha256"]
    result["status"] = "verified" if satisfied else "not_satisfied"
    result["verification"].update(
        status="satisfied" if satisfied else "not_satisfied", actual=dict(actual),
        method="raster_digest_after_release", target_application_matches=binding)
    return result
