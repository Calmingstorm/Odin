"""Tests for runbook synthesis — turning a detected pattern into skill code."""
from __future__ import annotations

import ast

import pytest

from src.learning.runbook_detector import RunbookSuggestion
from src.learning.runbook_synthesizer import (
    normalise_skill_name,
    synthesize_skill_code,
    synthesize_summary,
)


def _suggestion(sequence, *, samples=None, hosts=("hostA",), frequency=3, session_count=3):
    samples = samples or [
        {"tool_name": s, "host": hosts[0] if hosts else None, "input": {"host": hosts[0]} if hosts else {}}
        for s in sequence
    ]
    return RunbookSuggestion(
        sequence=list(sequence),
        frequency=frequency,
        session_count=session_count,
        hosts=list(hosts),
        actors=["alice"],
        first_seen="2026-04-10T10:00:00Z",
        last_seen="2026-04-17T10:00:00Z",
        sample_inputs=samples,
    )


class TestNormaliseSkillName:
    def test_basic(self):
        assert normalise_skill_name("Nginx Reload") == "nginx_reload"

    def test_strips_bad_chars(self):
        assert normalise_skill_name("my-skill!") == "my_skill"

    def test_empty_gets_default(self):
        assert normalise_skill_name("") == "synthesized_runbook"

    def test_digit_prefix(self):
        assert normalise_skill_name("3 times") == "runbook_3_times"

    def test_keyword_collision(self):
        assert normalise_skill_name("import") == "import_runbook"

    def test_length_cap(self):
        assert len(normalise_skill_name("x" * 200)) <= 60


class TestSynthesizeSkillCode:
    def test_generated_is_valid_python(self):
        s = _suggestion(["http_probe", "read_file"])
        source = synthesize_skill_code(s)
        ast.parse(source)  # must not raise

    def test_contains_skill_definition_and_execute(self):
        s = _suggestion(["http_probe", "read_file"])
        source = synthesize_skill_code(s)
        assert "SKILL_DEFINITION" in source
        assert "async def execute" in source
        assert "runbook" in source.lower()

    def test_safe_step_emits_execute_tool_call(self):
        s = _suggestion(["http_probe", "read_file"])
        source = synthesize_skill_code(s)
        assert "context.execute_tool('http_probe'" in source
        assert "context.execute_tool('read_file'" in source

    def test_unsafe_step_emits_todo_without_execute(self):
        """run_command is unsafe — the generated code must NOT try to run it."""
        s = _suggestion(["http_probe", "run_command"])
        source = synthesize_skill_code(s)
        # The safe step uses execute_tool.
        assert "context.execute_tool('http_probe'" in source
        # The unsafe step does NOT — it's documented as TODO.
        assert "context.execute_tool('run_command'" not in source
        assert "UNSAFE FROM SKILLS" in source
        assert "run_command" in source

    def test_secrets_scrubbed_in_generated_code(self):
        s = _suggestion(
            ["http_probe"],
            samples=[{
                "tool_name": "http_probe",
                "host": "hostA",
                "input": {
                    "url": "https://api.example/x",
                    "command": "curl -H 'Authorization: Bearer sk-ant-api03-LEAKYTOKEN1234567890abcd' https://x",
                },
            }],
        )
        source = synthesize_skill_code(s)
        assert "sk-ant-api03-LEAKYTOKEN1234567890abcd" not in source

    def test_skill_name_normalised(self):
        s = _suggestion(["http_probe", "read_file"])
        source = synthesize_skill_code(s, skill_name="My Runbook 1!")
        assert '"name": \'my_runbook_1\'' in source or "'my_runbook_1'" in source

    def test_description_override_respected(self):
        s = _suggestion(["http_probe", "read_file"])
        source = synthesize_skill_code(s, description_override="reload the thing")
        assert "reload the thing" in source

    def test_sequence_preserved_in_steps_constant(self):
        s = _suggestion(["http_probe", "read_file", "run_command"])
        source = synthesize_skill_code(s)
        assert "STEPS = ['http_probe', 'read_file', 'run_command']" in source


class TestSynthesizeSummary:
    def test_counts_safe_vs_unsafe(self):
        s = _suggestion(["http_probe", "read_file", "run_command", "write_file"])
        source = synthesize_skill_code(s)
        out = synthesize_summary(source, s)
        assert "safe steps (will run from skill): 2" in out
        assert "unsafe steps (operator must run manually): 2" in out

    def test_mentions_create_skill(self):
        s = _suggestion(["http_probe"])
        source = synthesize_skill_code(s)
        assert "create_skill" in synthesize_summary(source, s)
