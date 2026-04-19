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


class TestCodeInjectionHardening:
    """Round 3 review — generated code must not be breakable by crafted inputs."""

    def test_rejects_tool_name_with_quote(self):
        """Embedding a tool name with a quote would break out of the string literal."""
        s = _suggestion(["http_probe", "bad'name"])
        with pytest.raises(ValueError, match="snake_case identifier"):
            synthesize_skill_code(s)

    def test_rejects_tool_name_with_newline(self):
        s = _suggestion(["http_probe", "bad\nname"])
        with pytest.raises(ValueError):
            synthesize_skill_code(s)

    def test_rejects_tool_name_with_semicolon(self):
        s = _suggestion(["http_probe", "bad;import os;os.system('rm -rf /')"])
        with pytest.raises(ValueError):
            synthesize_skill_code(s)

    def test_captured_input_with_quote_does_not_break_literal(self):
        """Captured inputs with single quotes should parse as valid Python."""
        s = _suggestion(
            ["run_command"],
            samples=[{
                "tool_name": "run_command",
                "host": "hostA",
                "input": {"command": "echo 'it's a string with quotes' and \"doubles\""},
            }],
        )
        source = synthesize_skill_code(s)
        # Round-trip through AST — any escape bug would raise SyntaxError.
        ast.parse(source)

    def test_captured_input_with_newline_does_not_escape_literal(self):
        s = _suggestion(
            ["run_command"],
            samples=[{
                "tool_name": "run_command",
                "host": "hostA",
                "input": {"command": "line1\nline2\nline3"},
            }],
        )
        source = synthesize_skill_code(s)
        ast.parse(source)

    def test_generated_source_is_always_parseable(self):
        """Every safe-tool-name combination + quoted/unquoted input combination should produce valid Python."""
        for cmd in [
            "simple",
            "has 'single' quotes",
            'has "double" quotes',
            "has\nnewline",
            "has\\backslash",
            "has { curly } braces",
            "{% template %}",
            "#!/bin/bash\necho hi",
        ]:
            s = _suggestion(
                ["http_probe"],
                samples=[{
                    "tool_name": "http_probe",
                    "host": "hostA",
                    "input": {"command": cmd},
                }],
            )
            source = synthesize_skill_code(s)
            ast.parse(source)


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


class TestClassification:
    """Addresses Odin's PR #16 post-merge critique: synthesized output
    must declare up front whether it's automation or documentation.
    `synthesize_runbook` used to produce checklist-wearing-a-skill's-
    clothes regardless of whether steps were actually runnable. Now
    every output carries a classification."""

    def test_all_safe_sequence_classified_executable(self):
        from src.learning.runbook_synthesizer import (
            CLASSIFICATION_EXECUTABLE,
            classify_sequence,
        )
        # All of these are in SKILL_SAFE_TOOLS
        assert classify_sequence(
            ["http_probe", "read_file", "search_audit"],
        ) == CLASSIFICATION_EXECUTABLE

    def test_all_unsafe_sequence_classified_docs_only(self):
        from src.learning.runbook_synthesizer import (
            CLASSIFICATION_DOCS_ONLY,
            classify_sequence,
        )
        assert classify_sequence(
            ["run_command", "write_file", "claude_code"],
        ) == CLASSIFICATION_DOCS_ONLY

    def test_mixed_sequence_classified_hybrid(self):
        from src.learning.runbook_synthesizer import (
            CLASSIFICATION_HYBRID,
            classify_sequence,
        )
        assert classify_sequence(
            ["claude_code", "read_file", "run_command"],
        ) == CLASSIFICATION_HYBRID

    def test_empty_sequence_is_docs_only(self):
        from src.learning.runbook_synthesizer import (
            CLASSIFICATION_DOCS_ONLY,
            classify_sequence,
        )
        assert classify_sequence([]) == CLASSIFICATION_DOCS_ONLY

    def test_generated_source_carries_classification_constant(self):
        """SYNTHESIS_CLASSIFICATION must be a literal in the source,
        so tests and operators can grep for it without importing."""
        s = _suggestion(["run_command", "write_file"])
        source = synthesize_skill_code(s)
        assert "SYNTHESIS_CLASSIFICATION = 'documentation_only'" in source

    def test_executable_classification_lands_in_tags(self):
        s = _suggestion(["http_probe", "read_file"])
        source = synthesize_skill_code(s)
        assert "'executable'" in source
        assert "'documentation_only'" not in source
        # Tags list must contain the classification
        assert "\"runbook\", \"synthesized\", 'executable'" in source

    def test_docs_only_description_prefixed_with_checklist(self):
        """Operators see the [checklist] tag in create_skill / list_skills
        output without opening the generated file."""
        s = _suggestion(["run_command", "write_file"])
        source = synthesize_skill_code(s)
        # Description (inside SKILL_DEFINITION) starts with [checklist]
        assert "[checklist]" in source

    def test_hybrid_description_prefixed_with_hybrid(self):
        s = _suggestion(["run_command", "read_file"])
        source = synthesize_skill_code(s)
        assert "[hybrid]" in source

    def test_executable_description_prefixed_with_executable(self):
        s = _suggestion(["http_probe", "read_file"])
        source = synthesize_skill_code(s)
        assert "[executable]" in source

    def test_banner_warns_on_checklist(self):
        """The docstring banner must make it impossible to mistake a
        checklist for automation."""
        s = _suggestion(["run_command", "claude_code"])
        source = synthesize_skill_code(s)
        assert "CHECKLIST (documentation only)" in source
        assert "Do not mistake this for automation" in source

    def test_banner_warns_on_hybrid(self):
        s = _suggestion(["run_command", "read_file"])
        source = synthesize_skill_code(s)
        assert "HYBRID RUNBOOK" in source
        # textwrap.fill may split the banner across lines; test tolerates
        # that by checking for unambiguous short signal phrases.
        assert "TODO blocks" in source
        assert "SkillContext" in source

    def test_banner_confirms_executable(self):
        s = _suggestion(["http_probe", "read_file"])
        source = synthesize_skill_code(s)
        assert "EXECUTABLE RUNBOOK" in source
        assert "real automation" in source

    def test_description_override_still_gets_classification_prefix(self):
        """Even when the caller passes description_override, the
        classification tag must be prepended so honest labeling isn't
        bypassed by a well-meaning renamer."""
        s = _suggestion(["run_command", "write_file"])
        source = synthesize_skill_code(
            s, description_override="my cool procedure",
        )
        assert "[checklist] my cool procedure" in source

    def test_summary_uses_classification_vocabulary(self):
        from src.learning.runbook_synthesizer import synthesize_summary
        s = _suggestion(["run_command", "write_file"])
        source = synthesize_skill_code(s)
        summary = synthesize_summary(source, s)
        # New vocabulary: no more "runbook skill" for a thing that runs nothing
        assert "checklist (documentation only)" in summary
        assert "This is a CHECKLIST, not automation" in summary

    def test_summary_hybrid_vocabulary(self):
        from src.learning.runbook_synthesizer import synthesize_summary
        s = _suggestion(["run_command", "read_file"])
        source = synthesize_skill_code(s)
        summary = synthesize_summary(source, s)
        assert "hybrid runbook" in summary
        assert "Partial automation" in summary

    def test_summary_executable_vocabulary(self):
        from src.learning.runbook_synthesizer import synthesize_summary
        s = _suggestion(["http_probe", "read_file"])
        source = synthesize_skill_code(s)
        summary = synthesize_summary(source, s)
        assert "executable runbook" in summary
        assert "Fully executable" in summary


class TestBackwardCompat:
    def test_synthesize_skill_code_alias_exists(self):
        """During rollout, callers still import synthesize_skill_code."""
        from src.learning.runbook_synthesizer import (
            synthesize_runbook_code,
            synthesize_skill_code,
        )
        assert synthesize_skill_code is synthesize_runbook_code
