"""Strict adapter fixtures, with no endpoint or desktop input."""

import copy
import json

import pytest

from src.llm.strict_tool_adapter import compile_catalog
from src.tools.defs.computer import computer_definitions
from src.tools.registry import get_tool_definitions


def _wire_args(adapter, name, specified):
    """Populate omitted wire optionals using their request-local null branch."""
    props = next(
        wire["parameters"]["properties"] for wire in adapter.wire_tools if wire["name"] == name
    )
    result = dict(specified)
    for key in props:
        result.setdefault(key, None)
    if name == "validate_action":
        schema = props["checks"]["items"]["properties"]
        for check in result["checks"]:
            for key in schema:
                check.setdefault(key, None)
    return result


def test_catalog_strict_and_request_local():
    catalog = get_tool_definitions() + computer_definitions()
    original = copy.deepcopy(catalog)
    adapter = compile_catalog(catalog)
    assert catalog == original
    assert len(adapter.wire_tools) == len(catalog)
    assert all(wire["strict"] is True for wire in adapter.wire_tools)
    computer = adapter.wire_tools[-1]["parameters"]
    assert "anyOf" not in computer
    assert len(computer["properties"]["payload"]["anyOf"]) == 14
    key_branch = next(
        branch for branch in computer["properties"]["payload"]["anyOf"]
        if branch["properties"]["operation"]["const"] == "key"
    )
    assert "pattern" not in key_branch["properties"]["key"]


def test_forced_values_and_nested_omission():
    adapter = compile_catalog(get_tool_definitions())
    assert adapter.accept(
        "update_schedule",
        _wire_args(
            adapter, "update_schedule", {"schedule_id": "s", "paused": False, "report_format": ""}
        ),
    ) == {"schedule_id": "s", "paused": False, "report_format": ""}
    assert adapter.accept(
        "browser_read_table",
        _wire_args(
            adapter,
            "browser_read_table",
            {"url": "https://example.com", "table_index": 0, "wait_seconds": None},
        ),
    ) == {"url": "https://example.com", "table_index": 0}
    checks = {
        "checks": [
            {
                "type": "http",
                "target": "https://example.com",
                "expected": [200, 204],
                "severity": None,
            }
        ]
    }
    assert adapter.accept("validate_action", _wire_args(adapter, "validate_action", checks)) == {
        "checks": [{"type": "http", "target": "https://example.com", "expected": [200, 204]}]
    }


def test_external_modes_round_trip_and_resolution():
    adapter = compile_catalog(
        [
            {
                "name": "closed_ext",
                "input_schema": {
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                    "additionalProperties": False,
                },
            },
            {
                "name": "open_ext",
                "input_schema": {"type": "object", "properties": {"text": {"type": "string"}}},
            },
            {"name": "odd_ext", "input_schema": {"type": "string"}},
        ]
    )
    assert [r["mode"] for r in adapter.report.values()] == [
        "external_compiled",
        "external_envelope",
        "external_exception",
    ]
    assert "strict" not in adapter.wire_tools[0]
    assert "strict" not in adapter.wire_tools[1]
    assert adapter.wire_tools[2]["strict"] is False
    assert adapter.accept("open_ext", {"json": json.dumps({"text": "a", "more": None})}) == {
        "text": "a",
        "more": None,
    }
    assert (
        "canonical input schema"
        in adapter.wire_tools[1]["parameters"]["properties"]["json"]["description"]
    )
    for payload in ('{"a":1,"a":2}', "[1,2]", "not-json"):
        with pytest.raises(ValueError):
            adapter.accept("open_ext", {"json": payload})
    assert set(adapter.record_resolution(None).values()) == {"unknown"}
    adapter = compile_catalog(adapter.catalog)
    assert adapter.record_resolution(
        {
            "type": "response.created",
            "response": {
                "tools": [
                    {**adapter.wire_tools[0], "strict": True},
                    {**adapter.wire_tools[1], "strict": False},
                ]
            },
        }
    ) == {"closed_ext": "true", "open_ext": "false", "odd_ext": "unknown"}


def test_external_unsupported_subschemas_never_break_catalog(monkeypatch):
    import src.llm.strict_tool_adapter as strict_adapter

    def external(name, property_schema):
        return {"name": name, "input_schema": {
            "type": "object", "properties": {"tags": property_schema},
            "required": ["tags"], "additionalProperties": False,
        }}

    tools = [external("itemless", {"type": "array"}),
             external("boolean", True)]
    adapter = compile_catalog(tools)
    assert [item["mode"] for item in adapter.report.values()] == [
        "external_envelope", "external_envelope",
    ]
    assert adapter.accept("itemless", {"json": '{"tags":[1,"x"]}'}) == {
        "tags": [1, "x"],
    }
    assert adapter.accept("boolean", {"json": '{"tags":42}'}) == {"tags": 42}
    assert "array without items" in adapter.report["itemless"]["reason"]

    original = strict_adapter._compile

    def broken(node, name, builtin, path=()):
        if name == "broken_external":
            raise RuntimeError("do not leak this text")
        return original(node, name, builtin, path)

    monkeypatch.setattr(strict_adapter, "_compile", broken)
    injected = compile_catalog([external("broken_external", {"type": "array"})])
    assert injected.report["broken_external"]["mode"] == "external_envelope"
    assert injected.report["broken_external"]["reason"] == "compiler RuntimeError"
    assert injected.accept("broken_external", {"json": '{"tags":[]}'}) == {"tags": []}
    with pytest.raises(ValueError, match="array without items"):
        compile_catalog([{
            "name": "run_command", "input_schema": tools[0]["input_schema"],
        }])


def test_external_defaults_lowered_without_mutating_canonical():
    schema = {"type": "object", "properties": {
        "name": {"type": "string", "default": "unused"},
    }, "additionalProperties": False}
    adapter = compile_catalog([{"name": "defaults_ext", "input_schema": schema}])
    assert adapter.report["defaults_ext"]["mode"] == "external_compiled"
    assert "default" not in str(adapter.wire_tools[0]["parameters"])
    assert schema["properties"]["name"]["default"] == "unused"
    assert adapter.accept("defaults_ext", {"name": None}) == {}


def test_resolution_logging_is_process_memoized_and_builtin_warnings_repeat(caplog, monkeypatch):
    import logging

    import src.llm.strict_tool_adapter as strict_adapter

    monkeypatch.setattr(strict_adapter, "_resolution_seen", set())
    catalog = [{"name": "fixture_ext", "input_schema": {
        "type": "object", "properties": {}, "additionalProperties": False,
    }}]
    with caplog.at_level(logging.INFO, logger=strict_adapter.__name__):
        for _ in range(3):
            adapter = compile_catalog(catalog)
            adapter.record_resolution({"type": "response.created", "response": {
                "tools": [{**adapter.wire_tools[0], "strict": True}],
            }})
        assert len([r for r in caplog.records if r.levelno == logging.INFO]) == 1
        changed = copy.deepcopy(catalog)
        changed[0]["input_schema"]["properties"]["extra"] = {"type": "string"}
        compile_catalog(changed).record_resolution(None)
        compile_catalog(catalog).record_resolution(None)
        assert len([r for r in caplog.records if r.levelno == logging.INFO]) == 3
        builtin = next(t for t in get_tool_definitions() if t["name"] == "browser_read_table")
        for _ in range(2):
            compile_catalog([builtin]).record_resolution(None)
        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 2
        assert all("browser_read_table" in r.message for r in warnings)


def test_probe_headers_lowered_after_wire_validation():
    adapter = compile_catalog(get_tool_definitions())
    args = _wire_args(adapter, "http_probe", {"url": "https://example.org", "headers": [
        {"name": "Accept", "value": "application/json"},
    ]})
    assert adapter.accept("http_probe", args)["headers"] == {"Accept": "application/json"}
    args["headers"].append({"name": "accept", "value": "text/plain"})
    with pytest.raises(ValueError):
        adapter.accept("http_probe", args)


def _computer_wire(adapter, operation, specified):
    branches = next(w["parameters"] for w in adapter.wire_tools if w["name"] == "computer_act")
    branch = next(
        b for b in branches["properties"]["payload"]["anyOf"]
        if b["properties"]["operation"]["const"] == operation
    )
    args = {
        "session_id": "s", "generation": 1, "consent_generation": 1,
        "source_id": "src", "source_revision": 1,
        "action_id": "unique", "observation_id": "observed", "operation": operation,
        **specified,
    }

    def populate(fields, data):
        result = {name: data.get(name) for name in fields["properties"]}
        for name, value in list(result.items()):
            child = fields["properties"][name]
            if isinstance(value, dict) and "properties" in child:
                result[name] = populate(child, value)
            elif name == "steps" and isinstance(value, list):
                options = child["items"]["anyOf"]
                result[name] = [populate(next(
                    b for b in options if b["properties"]["operation"]["const"] == step["operation"]
                ), step) for step in value]
            elif name == "strokes" and isinstance(value, list):
                result[name] = [populate(child["items"], stroke) for stroke in value]
        return result

    return {"payload": populate(branch, args)}


def test_computer_branch_normalization_and_pre_effect_tripwire():
    adapter = compile_catalog(computer_definitions())
    focus = _computer_wire(adapter, "focus", {"x": 1, "y": 2,
        "expect": {"type": "visual_change"}})
    assert adapter.accept("computer_act", focus)["expect"] == {"type": "visual_change"}
    with pytest.raises(ValueError):
        adapter.accept("computer_act", _computer_wire(adapter, "focus", {
            "x": 1, "y": 2, "expect": {"type": "pointer_at"}}))

    click = _computer_wire(adapter, "click", {"x": 3, "y": 4,
        "expect": {"type": "visual_change"}})
    assert adapter.accept("computer_act", click)["x"] == 3
    region = {"x": 3, "y": 4, "width": 10, "height": 10}
    assert adapter.accept("computer_act", _computer_wire(adapter, "click", {
        "region": region, "expect": {"type": "visual_change"}}))["region"] == region
    for changes in ({"x": 3, "region": region}, {"x": 3}, {"points": [[1, 2], [3, 4]]}):
        with pytest.raises(ValueError):
            adapter.accept("computer_act", _computer_wire(adapter, "click", {
                "expect": {"type": "visual_change"}, **changes}))

    sequence = _computer_wire(adapter, "sequence", {"steps": [
        {"action_id": "step", "operation": "click", "x": 1, "y": 2,
         "expect": {"type": "visual_change"}},
    ]})
    assert adapter.accept("computer_act", sequence)["steps"][0]["x"] == 1
    strokes = _computer_wire(adapter, "strokes", {"strokes": [
        {"action_id": "stroke", "points": [[1, 1], [2, 2]], "duration": 0.1},
    ]})
    assert len(adapter.accept("computer_act", strokes)["strokes"]) == 1
    bad_step = _computer_wire(adapter, "sequence", {"steps": [
        {"action_id": "step", "operation": "drag", "points": [[1, 2]],
         "duration": 0.1, "expect": {"type": "visual_change"}},
    ]})
    with pytest.raises(ValueError):
        adapter.accept("computer_act", bad_step)
    bad_stroke = _computer_wire(adapter, "strokes", {"strokes": [
        {"action_id": "stroke", "points": [[1, 1], [2, 2]],
         "duration": 0.1, "modifiers": ["shift", "shift"]},
    ]})
    with pytest.raises(ValueError):
        adapter.accept("computer_act", bad_stroke)
    duplicate_modifiers = _computer_wire(adapter, "drag", {
        "points": [[1, 1], [2, 2]], "duration": 0.1,
        "modifiers": ["ctrl", "ctrl"], "expect": {"type": "visual_change"},
    })
    with pytest.raises(ValueError):
        adapter.accept("computer_act", duplicate_modifiers)
    key_repeat = _computer_wire(adapter, "key", {
        "key": "ctrl+ctrl+a", "expect": {"type": "visual_change"},
    })
    with pytest.raises(ValueError):
        adapter.accept("computer_act", key_repeat)


def test_computer_task_context_min_properties():
    adapter = compile_catalog(computer_definitions())
    props = next(w["parameters"]["properties"] for w in adapter.wire_tools
                 if w["name"] == "computer_observe")
    context_props = props["task_context"]["anyOf"][0]["properties"]
    args = {k: None for k in props} | {
        "session_id": "s", "generation": 1,
        "task_context": {k: None for k in context_props},
    }
    with pytest.raises(ValueError):
        adapter.accept("computer_observe", args)
    args["task_context"]["goal"] = "draw a shape"
    assert adapter.accept("computer_observe", args)["task_context"] == {"goal": "draw a shape"}


def test_spawn_policy_wire_omissions_preserve_presence_checks():
    adapter = compile_catalog(get_tool_definitions())
    schema = next(t["parameters"]["properties"] for t in adapter.wire_tools
                  if t["name"] == "spawn_agent")
    base = {name: None for name in schema} | {
        "label": "audit", "goal": "verify", "model": "gpt-6-luna",
    }
    assert adapter.accept("spawn_agent", base) == {
        "label": "audit", "goal": "verify", "model": "gpt-6-luna",
    }
    for optional, value in (("reasoning_effort", "high"), ("parent_id", "parent")):
        assert adapter.accept("spawn_agent", base | {optional: value})[optional] == value

    # Dynamic policy filtering happens before compilation. A forbidden field
    # remains forbidden, even when its value is null (not an omission token).
    filtered = copy.deepcopy(next(t for t in get_tool_definitions()
                                  if t["name"] == "spawn_agent"))
    filtered["input_schema"]["properties"].pop("reasoning_effort")
    filtered["input_schema"]["properties"].pop("parent_id")
    filtered_adapter = compile_catalog([filtered])
    allowed = {key: value for key, value in base.items()
               if key in filtered["input_schema"]["properties"]}
    assert "reasoning_effort" not in filtered_adapter.accept("spawn_agent", allowed)
    for forbidden in ("reasoning_effort", "parent_id"):
        with pytest.raises(ValueError):
            filtered_adapter.accept("spawn_agent", allowed | {forbidden: None})


def test_external_nullable_omission_distinguishes_meaningful_null():
    adapter = compile_catalog([{
        "name": "nullable_ext",
        "input_schema": {"type": "object", "additionalProperties": False,
                         "properties": {"value": {
                             "anyOf": [{"type": "string"}, {"type": "null"}],
                         }}},
    }])
    assert adapter.accept("nullable_ext", {"value": None}) == {"value": None}
    assert adapter.accept("nullable_ext", {"value": {"__odin_omitted__": True}}) == {}
