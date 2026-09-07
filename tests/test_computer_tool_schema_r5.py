"""Operation-specific fields must not become mandatory dummy action arguments."""

from src.llm.openai_codex import CodexChatClient
from src.tools.defs.computer import computer_definitions


def test_computer_schema_explicitly_disables_transport_strict_normalization():
    tools = computer_definitions()
    converted = CodexChatClient._convert_tools(tools)
    assert len(converted) == 3
    assert all(tool["strict"] is False for tool in converted)
    assert all(tool["parameters"] == source["input_schema"]
               for tool, source in zip(converted, tools, strict=True))


def test_ordinary_tool_conversion_shape_unchanged_without_explicit_strict_field():
    tool = {"name": "ordinary", "description": "ordinary tool", "input_schema": {
        "type": "object", "properties": {"value": {"type": "string"}}}}
    assert CodexChatClient._convert_tools([tool]) == [{
        "type": "function", "name": "ordinary", "description": "ordinary tool",
        "parameters": tool["input_schema"]}]
    assert "strict" not in CodexChatClient._convert_tools([{**tool, "strict": "false"}])[0]


def test_public_key_vocabulary_is_executable_by_controller_and_private_backend():
    from src.computer.gui_actions import parse_key_chord as controller_parse
    from src.computer.runtime.primitives import parse_key_chord as native_parse

    action = next(tool for tool in computer_definitions() if tool["name"] == "computer_act")
    assert "enum" not in action["input_schema"]["properties"]["key"]
    assert controller_parse is native_parse
    assert native_parse("super+alt+F12") == (("super", "alt"), "F12")
