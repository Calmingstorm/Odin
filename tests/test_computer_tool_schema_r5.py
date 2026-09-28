"""Operation-specific fields must not become mandatory dummy action arguments."""

import pytest

from src.llm.openai_codex import CodexChatClient
from src.llm.strict_tool_adapter import compile_catalog
from src.tools.defs.computer import computer_definitions


def test_computer_schema_uses_closed_strict_wrapper_without_changing_canonical_contract():
    tools = computer_definitions()
    converted = CodexChatClient._convert_tools(tools)
    assert len(converted) == 3
    assert all(tool["strict"] is True for tool in converted)
    action = next(tool for tool in converted if tool["name"] == "computer_act")
    assert "anyOf" not in action["parameters"]
    assert action["parameters"]["additionalProperties"] is False
    assert len(action["parameters"]["properties"]["payload"]["anyOf"]) == 14
    assert tools == computer_definitions()  # request-local lowering only


def test_external_tool_open_schema_uses_envelope_without_claiming_strict_resolution():
    tool = {"name": "ordinary", "description": "ordinary tool", "input_schema": {
        "type": "object", "properties": {"value": {"type": "string"}}}}
    converted = CodexChatClient._convert_tools([tool])[0]
    assert "strict" not in converted  # server resolves external strictness
    assert converted["parameters"]["required"] == ["json"]
    assert converted["parameters"]["additionalProperties"] is False
    assert '"value"' in converted["parameters"]["properties"]["json"]["description"]
    assert compile_catalog([tool]).accept("ordinary", {"json": '{"value":"ok","other":1}'}) == {
        "value": "ok", "other": 1,
    }


def test_public_key_vocabulary_is_executable_by_controller_and_private_backend():
    from src.computer.gui_actions import parse_key_chord as controller_parse
    from src.computer.runtime.primitives import parse_key_chord as native_parse

    action = next(tool for tool in computer_definitions() if tool["name"] == "computer_act")
    assert "enum" not in action["input_schema"]["properties"]["key"]
    # primitives is deliberately reloaded by the native suite. Function identity
    # is not a contract; both parser references must implement the same grammar.
    for chord, expected in [("super+alt+F12", (("super", "alt"), "F12")),
                            ("alt+F4", (("alt",), "F4")), ("F12", ((), "F12"))]:
        assert controller_parse(chord) == native_parse(chord) == expected
    for chord in ("alt++F4", "ctrl+ctrl+a", "not-allowed", [], True):
        for parse in (controller_parse, native_parse):
            with pytest.raises(ValueError, match="unsupported_key"):
                parse(chord)
