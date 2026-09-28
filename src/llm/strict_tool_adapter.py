"""Request-local Codex tool schema compiler and canonical acceptance boundary."""

from __future__ import annotations

import hashlib
import json
import logging
from copy import deepcopy

from jsonschema import Draft202012Validator

log = logging.getLogger(__name__)
PAYLOADS = {"schedule_task", "update_schedule", "delegate_task", "invoke_skill"}
LOWERED = {"uniqueItems", "minProperties", "oneOf", "allOf", "not", "default"}
WIRE = {
    "type",
    "description",
    "enum",
    "const",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "anyOf",
    "$defs",
    "$ref",
    "format",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "minLength",
    "maxLength",
    "pattern",
    "minItems",
    "maxItems",
    "maxProperties",
    "multipleOf",
}


def _nullable(node):
    return {"anyOf": [node, {"type": "null"}]}


def _optional(node, original):
    # A canonical nullable property must distinguish explicit null from wire
    # omission. The sentinel is a disjoint closed object for non-object types,
    # or a closed object with a reserved member for canonical closed objects.
    if _allows_null(original):
        return {
            "anyOf": [
                node,
                {
                    "type": "object",
                    "properties": {"__odin_omitted__": {"type": "boolean", "const": True}},
                    "required": ["__odin_omitted__"],
                    "additionalProperties": False,
                },
            ]
        }
    return _nullable(node)


def _compile(node, name, builtin, path=()):
    if not isinstance(node, dict):
        raise ValueError(f"{name}: unsupported schema at {path}")
    unsupported = set(node) - WIRE - (LOWERED if builtin else set())
    if unsupported:
        raise ValueError(f"{name}: unsupported keywords {sorted(unsupported)} at {path}")
    if not name.startswith("computer_") and set(node) & (LOWERED - {"default"}):
        raise ValueError(
            f"{name}: unsupported constraint outside audited computer contract at {path}"
        )
    if any(key in node for key in ("oneOf", "allOf", "not")) and name != "computer_act":
        raise ValueError(f"{name}: unaudited combinator at {path}")
    if "$ref" in node or "$defs" in node or isinstance(node.get("type"), list):
        raise ValueError(f"{name}: reference or type union needs an envelope at {path}")
    if (
        node.get("type") == "object"
        and node.get("additionalProperties") is not None
        and node.get("additionalProperties") is not False
    ):
        raise ValueError(f"{name}: open object cannot be closed at {path}")
    if (
        node.get("type") == "object"
        and not builtin
        and node.get("additionalProperties") is not False
    ):
        raise ValueError(f"{name}: open external object at {path}")
    if path in (
        {("tool_input",), ("steps", "*", "tool_input")}
        if name in {"schedule_task", "update_schedule"}
        else {("steps", "*", "tool_input")}
        if name == "delegate_task"
        else {("input",)}
        if name == "invoke_skill"
        else set()
    ):
        return {
            "type": "string",
            "description": (
                "JSON object encoded as text; target schema and authorization "
                "are checked before execution."
            ),
        }
    if "anyOf" in node:
        if set(node) - {"anyOf", "description"}:
            raise ValueError(f"{name}: anyOf siblings require explicit lowering at {path}")
        result = {"anyOf": [_compile(branch, name, builtin, path) for branch in node["anyOf"]]}
        if "description" in node:
            result["description"] = node["description"]
        return result
    out = {
        key: deepcopy(value)
        for key, value in node.items()
        if key
        in (
            "type",
            "description",
            "enum",
            "const",
            "$ref",
            "format",
            "minimum",
            "maximum",
            "exclusiveMinimum",
            "exclusiveMaximum",
            "minLength",
            "maxLength",
            "pattern",
            "minItems",
            "maxItems",
            "maxProperties",
            "multipleOf",
        )
    }
    if node.get("type") == "object":
        props = node.get("properties", {})
        required = set(node.get("required", ()))
        out["properties"] = {
            key: (compiled if key in required else _optional(compiled, child))
            for key, child in props.items()
            for compiled in [_compile(child, name, builtin, path + (key,))]
        }
        out["required"] = list(props)
        out["additionalProperties"] = False
    if node.get("type") == "array":
        out["items"] = _compile(node["items"], name, builtin, path + ("*",))
    return out


def _computer_branches(schema):
    branches = []
    for case in schema["oneOf"]:
        op = case["properties"]["operation"]["const"]
        props = {
            key: value
            for key, value in schema["properties"].items()
            if case["properties"].get(key) is not False
        }
        for key, override in case["properties"].items():
            if isinstance(override, dict) and key != "operation":
                # Case constraints can refine a shared nested object (notably
                # computer_act.expect.type). Retain its base type and properties
                # while replacing only the overridden constraints.
                refined = deepcopy(props.get(key, {}))
                refined.update({k: v for k, v in override.items() if k != "properties"})
                if "properties" in override:
                    refined["properties"] = {
                        **refined.get("properties", {}),
                        **override["properties"],
                    }
                props[key] = refined
        props["operation"] = {"type": "string", "const": op}
        branch = deepcopy(schema)
        branch.pop("oneOf")
        branch["properties"] = props
        branch["required"] = sorted(set(schema["required"]) | set(case.get("required", ())))
        if "steps" in props:
            branch["properties"]["steps"] = deepcopy(props["steps"])
            branch["properties"]["steps"]["items"] = {
                "anyOf": _computer_branches(props["steps"]["items"])
            }
        branches.append(_compile(branch, "computer_act", True))
    return branches


def _allows_null(schema):
    return (
        schema is True
        or isinstance(schema, dict)
        and (
            schema.get("type") == "null"
            or isinstance(schema.get("type"), list)
            and "null" in schema["type"]
            or any(_allows_null(branch) for branch in schema.get("anyOf", []))
        )
    )


def _normalize(value, canonical, wire):
    if isinstance(value, dict) and "anyOf" in wire:
        matches = [
            idx
            for idx, branch in enumerate(wire["anyOf"])
            if Draft202012Validator(branch).is_valid(value)
        ]
        if len(matches) != 1:
            raise ValueError("ambiguous or invalid wire branch")
        idx = matches[0]
        if "oneOf" in canonical:
            case = canonical["oneOf"][idx]
            canonical = deepcopy(canonical)
            canonical.pop("oneOf")
            canonical["properties"] = {
                key: val
                for key, val in canonical["properties"].items()
                if case["properties"].get(key) is not False
            }
            canonical["required"] = list(
                set(canonical.get("required", ())) | set(case.get("required", ()))
            )
            for key, override in case["properties"].items():
                if key in canonical["properties"] and isinstance(override, dict):
                    merged = deepcopy(canonical["properties"][key])
                    merged.update({k: v for k, v in override.items() if k != "properties"})
                    if "properties" in override:
                        merged["properties"] = {
                            **merged.get("properties", {}),
                            **override["properties"],
                        }
                    canonical["properties"][key] = merged
        elif "anyOf" in canonical:
            canonical = canonical["anyOf"][idx]
        return _normalize(value, canonical, wire["anyOf"][idx])
    if isinstance(value, dict) and "properties" in wire:
        result = {}
        for key, item in value.items():
            if key not in canonical.get("properties", {}):
                result[key] = item
                continue
            child = canonical["properties"][key]
            child_wire = wire["properties"][key]
            if key not in canonical.get("required", ()):
                if (item is None and not _allows_null(child)) or (
                    _allows_null(child) and item == {"__odin_omitted__": True}
                ):
                    continue
                child_wire = child_wire["anyOf"][0]
            result[key] = _normalize(item, child, child_wire)
        return result
    if isinstance(value, list) and "items" in wire:
        return [_normalize(item, canonical["items"], wire["items"]) for item in value]
    return value


class RequestToolAdapter:
    def __init__(self, tools):
        from ..tools.defs.computer import COMPUTER_TOOL_NAMES
        from ..tools.registry import TOOL_MAP

        self.catalog = deepcopy(tools)
        self.wire_tools = []
        self.report = {}
        self._contracts: dict[str, tuple[dict, dict, str]] = {}
        self._resolution_logged = False
        builtins = set(TOOL_MAP) | set(COMPUTER_TOOL_NAMES)
        for tool in self.catalog:
            name = tool["name"]
            if name in self._contracts:
                raise ValueError(f"duplicate tool {name}")
            canonical = tool.get("input_schema", {"type": "object", "properties": {}})
            builtin = name in builtins or tool.get("is_core") is True
            try:
                if not builtin and canonical.get("type") != "object":
                    raise ValueError("external root is not an object")
                wire = (
                    {
                        "type": "object",
                        "properties": {"payload": {"anyOf": _computer_branches(canonical)}},
                        "required": ["payload"],
                        "additionalProperties": False,
                    }
                    if name == "computer_act"
                    else _compile(canonical, name, builtin)
                )
                mode, reason = ("builtin_strict" if builtin else "external_compiled"), None
            except ValueError as exc:
                if builtin:
                    raise
                reason = str(exc)
                if isinstance(canonical, dict) and canonical.get("type") == "object":
                    wire = {
                        "type": "object",
                        "properties": {
                            "json": {
                                "type": "string",
                                "description": "JSON object conforming to canonical input schema: "
                                + json.dumps(canonical, sort_keys=True, ensure_ascii=False),
                            }
                        },
                        "required": ["json"],
                        "additionalProperties": False,
                    }
                    mode = "external_envelope"
                else:
                    # A JSON-object envelope cannot preserve a non-object root.
                    wire = deepcopy(canonical)
                    mode = "external_exception"
            fingerprint = hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
            self._contracts[name] = (canonical, wire, mode)
            self.wire_tools.append(
                {
                    "type": "function",
                    "name": name,
                    "description": tool.get("description", ""),
                    "parameters": wire,
                    **(
                        {"strict": True}
                        if builtin
                        else {"strict": False}
                        if mode == "external_exception"
                        else {}
                    ),
                }
            )
            self.report[name] = {
                "mode": mode,
                "fingerprint": fingerprint,
                "resolution": "unknown",
                "reason": reason,
            }

    def accept(self, name, arguments):
        if name not in self._contracts:
            raise ValueError(f"{name}: not present in request catalog")
        canonical, wire, mode = self._contracts[name]
        if mode == "external_exception":
            return arguments  # explicitly unchanged, named non-strict residual exposure
        if not isinstance(arguments, dict) or not Draft202012Validator(wire).is_valid(arguments):
            raise ValueError(f"{name}: invalid wire arguments")
        if mode == "external_envelope":
            from ..tools.nested_payload import decode_json_object

            value = decode_json_object(arguments["json"], name)
        elif name == "computer_act":
            value = _normalize(arguments["payload"], canonical, wire["properties"]["payload"])
        else:
            value = _normalize(arguments, canonical, wire)
        checked = deepcopy(canonical)
        if mode == "builtin_strict":
            checked["additionalProperties"] = False
        if mode == "builtin_strict" and name in PAYLOADS:
            from ..tools.nested_payload import decode_nested_payloads

            value = decode_nested_payloads(name, value)
        headers = name == "http_probe" and isinstance(value.get("headers"), list)
        if headers and checked["properties"]["headers"].get("type") == "object":
            from ..tools.http_probe_ops import normalize_probe_headers

            value["headers"] = normalize_probe_headers(value["headers"])
        errors = list(Draft202012Validator(checked).iter_errors(value))
        if errors:
            error = min(errors, key=lambda e: (len(e.path), e.message))
            raise ValueError(
                f"{name}: invalid {'/'.join(map(str, error.path)) or 'root'}: "
                f"violates {error.validator} constraint"
            )
        if headers and isinstance(value["headers"], list):
            from ..tools.http_probe_ops import normalize_probe_headers

            value["headers"] = normalize_probe_headers(value["headers"])
        if name in PAYLOADS and mode == "builtin_strict":
            from ..tools.nested_payload import validate_nested_payload

            value = validate_nested_payload(name, value, self.catalog, allow_placeholders=True)
        return value

    def record_resolution(self, event=None):
        if self._resolution_logged:
            return {name: item["resolution"] for name, item in self.report.items()}
        response = (
            event.get("response", {})
            if isinstance(event, dict) and event.get("type") == "response.created"
            else {}
        )
        resolved = {}
        for tool in response.get("tools", []):
            if not isinstance(tool, dict):
                continue
            name = tool.get("name")
            expected = next((t for t in self.wire_tools if t["name"] == name), None)
            if expected is not None and tool.get("parameters") == expected["parameters"]:
                resolved[name] = tool.get("strict")
        result = {}
        for name, item in self.report.items():
            val = resolved.get(name)
            item["resolution"] = "true" if val is True else "false" if val is False else "unknown"
            result[name] = item["resolution"]
            log.info(
                "Codex schema name=%s fingerprint=%s mode=%s resolution=%s reason=%s",
                name,
                item["fingerprint"],
                item["mode"],
                item["resolution"],
                item["reason"],
            )
        self._resolution_logged = True
        return result


def compile_catalog(tools):
    return RequestToolAdapter(tools)
