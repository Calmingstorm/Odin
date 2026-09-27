"""Canonical decoding and validation for tool inputs nested as JSON strings on strict wire calls."""
from __future__ import annotations

import json
import re
from typing import Any

from jsonschema.validators import validator_for

_NESTED_FIELDS = {
    "schedule_task": ("tool_input", "steps[].tool_input"),
    "update_schedule": ("tool_input", "steps[].tool_input"),
    "delegate_task": ("steps[].tool_input",),
    "invoke_skill": ("input",),
}
_PLACEHOLDER = re.compile(r"\{(?:var\.[^{}]+|prev_output)\}")


def _object_no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key in nested payload: {key!r}")
        result[key] = value
    return result


def decode_json_object(value: Any, label: str) -> dict:
    """Decode one wire JSON string or accept an already-canonical dict."""
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        raise ValueError(f"{label} must be a JSON object string or object")
    try:
        result = json.loads(value, object_pairs_hook=_object_no_duplicates,
                            parse_constant=lambda token: (_ for _ in ()).throw(ValueError(f"invalid JSON constant {token}")))
    except (json.JSONDecodeError, ValueError) as exc:
        raise ValueError(f"{label} must contain valid JSON without duplicate keys: {exc}") from exc
    if not isinstance(result, dict):
        raise ValueError(f"{label} must decode to a JSON object")
    return result


def decode_nested_payloads(tool_name: str, arguments: dict) -> dict:
    """Return copied arguments with nested wire JSON strings decoded exactly once."""
    if tool_name not in _NESTED_FIELDS:
        return arguments
    result = dict(arguments)
    if tool_name in ("schedule_task", "update_schedule") and "tool_input" in result and isinstance(result["tool_input"], str):
        result["tool_input"] = decode_json_object(result["tool_input"], "tool_input")
    if tool_name == "invoke_skill" and "input" in result and isinstance(result["input"], str):
        result["input"] = decode_json_object(result["input"], "input")
    if isinstance(result.get("steps"), list):
        steps = []
        for index, original in enumerate(result["steps"], 1):
            if not isinstance(original, dict):
                steps.append(original); continue
            step = dict(original)
            if isinstance(step.get("tool_input"), str):
                step["tool_input"] = decode_json_object(step["tool_input"], f"step {index} tool_input")
            steps.append(step)
        result["steps"] = steps
    return result


def _schema_for(name: str, catalog: list[dict]) -> dict | None:
    return next((t.get("input_schema") for t in catalog if t.get("name") == name), None)


def _validate(schema: dict, payload: dict, *, allow_placeholders: bool) -> None:
    validator_cls = validator_for(schema)
    validator_cls.check_schema(schema)
    validator = validator_cls(schema)
    import copy
    candidate = copy.deepcopy(payload)
    deferred: set[tuple] = set()
    if allow_placeholders:
        # The established workflow substitution contract touches direct string
        # values in tool_input only, not nested objects or array members.
        if isinstance(candidate, dict):
            schema = copy.deepcopy(schema)
            for key, value in candidate.items():
                if isinstance(value, str) and _PLACEHOLDER.search(value):
                    schema.setdefault("properties", {})[key] = {}
    errors = sorted(validator_cls(schema).iter_errors(candidate), key=lambda e: list(map(str, e.path)))
    if errors:
        err = errors[0]
        path = ".".join(map(str, err.absolute_path)) or "<root>"
        raise ValueError(f"invalid input for selected tool at {path}: {err.message}")


def validate_nested_payload(tool_name: str, canonical_arguments: dict, catalog: list[dict], *, allow_placeholders: bool = True) -> dict:
    """Decode nested JSON fields, validate selected canonical targets, return canonical args.

    This validates payload shape only. Callers must also apply their existing authorization
    checks to the selected target; a name in a payload is not permission.
    """
    from .registry import TOOLS
    args = decode_nested_payloads(tool_name, canonical_arguments)
    def check(target, payload, label):
        schema = _schema_for(target, catalog) or _schema_for(target, TOOLS)
        if schema is None:
            raise ValueError(f"{label} selects unknown tool {target!r}")
        if not isinstance(payload, dict):
            raise ValueError(f"{label} must be an object")
        _validate(schema, payload, allow_placeholders=allow_placeholders)
    if tool_name in ("schedule_task", "update_schedule"):
        if args.get("tool_name") and isinstance(args.get("tool_input"), dict) and args.get("action", "check") == "check":
            check(args["tool_name"], args["tool_input"], "tool_input")
        if tool_name == "update_schedule" and isinstance(args.get("tool_input"), dict) and args.get("tool_name"):
            check(args["tool_name"], args["tool_input"], "tool_input")
        for i, step in enumerate(args.get("steps") or [], 1):
            if isinstance(step, dict) and step.get("tool_name") and isinstance(step.get("tool_input"), dict):
                check(step["tool_name"], step["tool_input"], f"step {i} tool_input")
    elif tool_name == "delegate_task":
        for i, step in enumerate(args.get("steps") or [], 1):
            if isinstance(step, dict) and step.get("tool_name") and isinstance(step.get("tool_input"), dict):
                check(step["tool_name"], step["tool_input"], f"step {i} tool_input")
    elif tool_name == "invoke_skill":
        target = args.get("name")
        if target and isinstance(args.get("input"), dict):
            check(target, args["input"], "input")
    return args
