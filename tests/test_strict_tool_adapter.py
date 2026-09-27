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
    assert adapter.record_resolution(
        {
            "type": "response.created",
            "response": {
                "tools": [
                    {"name": "closed_ext", "strict": True},
                    {"name": "open_ext", "strict": False},
                ]
            },
        }
    ) == {"closed_ext": "true", "open_ext": "false", "odd_ext": "unknown"}
