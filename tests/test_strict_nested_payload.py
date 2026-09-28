"""Strict wire nested JSON payload decoding and selected-target validation."""

import json

import pytest

from src.tools.nested_payload import decode_nested_payloads, validate_nested_payload


def catalog():
    return [
        {
            "name": "run_command",
            "input_schema": {
                "type": "object",
                "properties": {"command": {"type": "string"}, "host": {"type": ["string", "null"]}},
                "required": ["command"],
                "additionalProperties": False,
            },
        },
        {
            "name": "example_skill",
            "input_schema": {
                "type": "object",
                "properties": {"value": {"type": ["string", "null"]}},
                "required": ["value"],
                "additionalProperties": False,
            },
        },
    ]


def test_wire_json_decodes_canonical_payload_and_preserves_meaningful_null():
    raw = {
        "action": "check",
        "tool_name": "run_command",
        "tool_input": json.dumps({"command": 'printf "\\u03bb"', "host": None}),
    }
    result = validate_nested_payload("schedule_task", raw, catalog())
    assert result["tool_input"] == {"command": 'printf "\\u03bb"', "host": None}
    assert isinstance(raw["tool_input"], str)


@pytest.mark.parametrize("payload", ['{"command":"a","command":"b"}', "[]", "null", "{bad"])
def test_rejects_bad_wire_nested_json(payload):
    with pytest.raises(ValueError):
        decode_nested_payloads(
            "delegate_task", {"steps": [{"tool_name": "run_command", "tool_input": payload}]}
        )


def test_selected_target_schema_is_enforced():
    with pytest.raises(ValueError, match="invalid input"):
        validate_nested_payload(
            "delegate_task",
            {
                "steps": [
                    {"tool_name": "run_command", "tool_input": {"command": "ok", "surprise": True}}
                ]
            },
            catalog(),
        )


def test_template_field_can_defer_validation_and_null_is_not_dropped():
    item = {"tool_name": "run_command", "tool_input": {"command": "{prev_output}", "host": None}}
    result = validate_nested_payload("delegate_task", {"steps": [item]}, catalog())
    assert result["steps"][0]["tool_input"] == item["tool_input"]
    invalid = {"tool_name": "run_command", "tool_input": {"command": None, "host": None}}
    with pytest.raises(ValueError):
        validate_nested_payload(
            "delegate_task", {"steps": [invalid]}, catalog(), allow_placeholders=False
        )


def test_invoke_skill_validates_named_skill_schema():
    result = validate_nested_payload(
        "invoke_skill", {"name": "example_skill", "input": '{"value":null}'}, catalog()
    )
    assert result["input"] == {"value": None}
    with pytest.raises(ValueError):
        validate_nested_payload(
            "invoke_skill", {"name": "example_skill", "input": {"wrong": 1}}, catalog()
        )


def test_nested_http_probe_preserves_canonical_header_dict_and_checks_record_shape():
    from src.tools.registry import TOOL_MAP

    definitions = [{"name": "http_probe", "input_schema": TOOL_MAP["http_probe"]["input_schema"]}]
    args = {
        "steps": [
            {
                "tool_name": "http_probe",
                "tool_input": {
                    "url": "https://example.com/?q={prev_output}",
                    "headers": {"X-Test": "quoted"},
                },
            }
        ]
    }
    result = validate_nested_payload("delegate_task", args, definitions)
    assert result["steps"][0]["tool_input"]["headers"] == {"X-Test": "quoted"}
    args["steps"][0]["tool_input"]["headers"] = {"X-Test": 123}
    with pytest.raises(ValueError):
        validate_nested_payload("delegate_task", args, definitions)
