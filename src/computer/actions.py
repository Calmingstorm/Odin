"""Narrow R4 click contract. No executable paths, arbitrary keys, or backend verdict trust."""

import math

from .geometry import GeometryError, opaque_id
from .models import ComputerError
from .policy import exact_keys, integer

_REQUIRED = {
    "session_id",
    "generation",
    "consent_generation",
    "source_id",
    "source_revision",
    "action_id",
    "observation_id",
    "operation",
    "expect",
}


def click_arguments(inp):
    """A strict supported subset of the declared computer_act JSON schema."""
    exact_keys(inp, _REQUIRED | {"x", "y", "expected_modal"}, _REQUIRED)
    for key in ("session_id", "source_id", "action_id", "observation_id"):
        try:
            opaque_id(inp[key])
        except GeometryError:
            raise ComputerError("invalid_arguments") from None
    for key in ("generation", "consent_generation", "source_revision"):
        integer(inp[key], 1, 2**63 - 1)
    if inp["operation"] != "click":
        raise ComputerError("unsupported_operation")
    exact_keys(inp, _REQUIRED | {"x", "y", "expected_modal"}, _REQUIRED | {"x", "y"})
    for key in ("x", "y"):
        integer(inp[key], 0, 1_000_000 - 1)
    expected = inp["expect"]
    exact_keys(expected, {"type", "x", "y"}, {"type", "x", "y"})
    if expected["type"] != "pointer_at":
        raise ComputerError("unsupported_postcondition")
    for key in ("x", "y"):
        integer(expected[key], 0, 1_000_000 - 1)
        if expected[key] != inp[key]:
            raise ComputerError("postcondition_target_mismatch")


def click_payload(inp, observation):
    source = observation.source
    if (
        inp["source_id"] != source.source_id
        or inp["source_revision"] != source.source_revision
        or inp["consent_generation"] != source.consent_generation
    ):
        raise ComputerError("stale_source_binding")
    try:
        point = source.input_point(
            observation.delivered_to_source,
            inp["x"],
            inp["y"],
            observation.width,
            observation.height,
        )
    except GeometryError:
        raise ComputerError("invalid_target") from None
    # The private integer-input adapter explicitly floors mapped pixel centers.
    # Never round or scale against an inferred desktop-global coordinate plane.
    actual_target = tuple(math.floor(value) for value in point)
    payload = {
        "type": "click",
        "source_id": source.source_id,
        "source_revision": source.source_revision,
        "consent_generation": source.consent_generation,
        "x": inp["x"],
        "y": inp["y"],
        "expected": dict(inp["expect"]),
    }
    return payload, actual_target


def click_receipt(raw, observation, target):
    """Compute a bounded verdict from measured data, never an adapter's 'verified'.

    The trusted adapter must independently query after release and revalidate its
    native focus/window binding. A model-supplied receipt cannot enter this path.
    Pointer location proves only pointer location, not application click semantics.
    """
    unknown = {"status": "unknown", "reason": "input_outcome_unknown"}
    if (
        type(raw) is not dict
        or raw.get("released") is not True
        or type(raw.get("injected")) is not bool
    ):
        return unknown
    if raw.get("status") == "unavailable" and raw["injected"] is False:
        return {
            "status": "unavailable",
            "reason": "backend_refused",
            "execution": {"injected": False, "released": True},
        }
    if raw["injected"] is not True or raw.get("status") not in {
        "executed",
        "verified",
        "not_satisfied",
    }:
        return unknown
    result = {
        "status": "executed",
        "execution": {"injected": True, "released": True},
        "verification": {
            "status": "unavailable",
            "type": "pointer_at",
            "scope": "pointer_location_only",
        },
    }
    evidence = raw.get("postcondition")
    if type(evidence) is not dict or evidence.get("status") == "unavailable":
        return result
    source = observation.source
    if (
        evidence.get("method") != "pointer_query_after_release"
        or evidence.get("type") != "pointer_at"
        or evidence.get("source_id") != source.source_id
        or type(evidence.get("source_revision")) is not int
        or evidence["source_revision"] != source.source_revision
        or type(evidence.get("consent_generation")) is not int
        or evidence["consent_generation"] != source.consent_generation
    ):
        return unknown
    actual = evidence.get("actual")
    if (
        type(actual) is not dict
        or set(actual) != {"x", "y"}
        or type(actual["x"]) is not int
        or type(actual["y"]) is not int
        or not 0 <= actual["x"] < source.input_width
        or not 0 <= actual["y"] < source.input_height
    ):
        return unknown
    binding = evidence.get("target_window_matches")
    if type(binding) is not bool:
        return unknown
    satisfied = binding and (actual["x"], actual["y"]) == target
    result["status"] = "verified" if satisfied else "not_satisfied"
    result["verification"] = {
        "status": "satisfied" if satisfied else "not_satisfied",
        "type": "pointer_at",
        "scope": "pointer_location_only",
        "method": "pointer_query_after_release",
        "actual": dict(actual),
        "source_id": source.source_id,
        "target_binding_matches": binding,
        "source_revision": source.source_revision,
        "consent_generation": source.consent_generation,
    }
    return result
