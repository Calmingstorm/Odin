"""Public tool reference drift, completeness, escaping and offline CLI pins."""

from __future__ import annotations

import html
import re
import subprocess
import sys

from scripts.docs._reference import REPO_ROOT, SOURCE_COMMIT, cell
from scripts.docs.generate_tool_reference import (
    OUTPUT,
    description_html,
    generate,
    property_rows,
    schema_type,
    tool_sections,
)
from src.tools.registry import TOOLS, get_tool_definitions
from tests.characterization.test_tool_parity import EXPECTED_TOOL_ORDER


def test_committed_tool_reference_is_byte_identical():
    assert OUTPUT.read_bytes() == generate().encode("utf-8"), (
        "Run python scripts/docs/generate_tool_reference.py"
    )


def test_all_tools_once_in_registry_order_and_all_sections():
    text = generate()
    assert re.findall(r"^### (.+)$", text, re.M) == EXPECTED_TOOL_ORDER
    assert [name for name, _ in tool_sections()] == [
        "system_files", "media_scheduling", "memory_skills", "tasks_knowledge",
        "browser_web", "channel_process_loops", "agents", "devops", "integrations_email",
        "output_delivery",
    ]
    assert f"`{SOURCE_COMMIT}`" in text


def test_complete_served_descriptions_and_core_flags():
    text = generate()
    for tool in get_tool_definitions():
        section = text.split(f"### {tool['name']}\n", 1)[1].split("\n### ", 1)[0]
        assert f"**Core:** {'Yes' if tool.get('is_core') else 'No'}" in section
        assert description_html(tool["description"]) in section
        rendered = description_html(tool["description"])
        restored = re.sub(r"</pre>\n\n<p v-pre><small>", "\n\n", rendered)
        restored = restored.replace("<br>", "\n")
        restored = re.sub(r"</?(?:p|small|pre)(?: [^>]*)?>", "", restored)
        assert html.unescape(restored) == tool["description"]


def test_every_property_row_and_order_is_rendered():
    text = generate()
    for tool in TOOLS:
        section = text.split(f"### {tool['name']}\n", 1)[1].split("\n### ", 1)[0]
        rows = property_rows(tool["input_schema"])
        assert "\n".join(rows) in section


def test_nested_required_and_constraints_are_not_lost():
    rows = property_rows({"properties": {"tasks": {
        "type": "array", "items": {"type": "object", "required": ["name"],
        "properties": {"name": {"type": "string", "enum": ["a|b", "<x>"]}}},
    }}})
    assert "| array&lt;object&gt; | No |" in rows[0]
    assert "tasks&#91;&#93;.name" in rows[1]
    assert "| string | Yes |" in rows[1]
    assert "a&#124;b" in rows[1] and "&lt;x&gt;" in rows[1]
    assert schema_type({"type": ["string", "null"]}) == "string / null"
    assert schema_type({"oneOf": [{"type": "string"}, {"type": "integer"}]}) == (
        "oneOf(string, integer)"
    )


def test_untrusted_markup_and_vue_expressions_stay_literal():
    value = "<script>x</script> | {{value}}\n`code` [link]"
    escaped = cell(value)
    assert "<script>" not in escaped and "{{" not in escaped and "|" not in escaped
    assert "<br>" in escaped
    assert html.unescape(escaped.replace("<br>", "\n")) == value
    assert description_html(value).startswith("<pre v-pre style=")
    assert ">&lt;script&gt;" in description_html(value)


def test_generation_does_not_load_runtime_configuration_or_discover_extensions(monkeypatch):
    import socket

    from src import config
    from src.config import schema
    from src.tools.skill_manager import SkillManager

    def forbidden(*args, **kwargs):
        raise AssertionError("Reference generation attempted runtime discovery or I/O")

    monkeypatch.setattr(config, "_load_env", forbidden)
    monkeypatch.setattr(schema, "load_config", forbidden)
    monkeypatch.setattr(SkillManager, "get_tool_definitions", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "bind", forbidden)
    assert "**74 built-in tools**" in generate()


def test_cli_check_works_outside_repo_and_without_git(tmp_path):
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts/docs/generate_tool_reference.py"), "--check"],
        cwd=tmp_path, env={"PATH": "", "PYTHONHASHSEED": "17"},
        text=True, capture_output=True, check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_drift_check_fails_without_writing(tmp_path, monkeypatch):
    from scripts.docs import _reference

    output = tmp_path / "reference.md"
    monkeypatch.setattr(_reference, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(sys, "argv", ["generator", "--check"])
    assert _reference.write_or_check("expected\n", output, description="test") == 1
    assert not output.exists()
    output.write_bytes(b"stale\r\n")
    assert _reference.write_or_check("expected\n", output, description="test") == 1
    assert output.read_bytes() == b"stale\r\n"
    monkeypatch.setattr(sys, "argv", ["generator"])
    assert _reference.write_or_check("expected\n", output, description="test") == 0
    assert output.read_bytes() == b"expected\n"
    monkeypatch.setattr(sys, "argv", ["generator", "--check"])
    assert _reference.write_or_check("expected\n", output, description="test") == 0
