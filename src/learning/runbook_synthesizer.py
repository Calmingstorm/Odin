"""Runbook synthesis — turn a detected pattern into a reviewable skill skeleton.

``runbook_detector`` surfaces candidate runbooks; this module takes one
of those suggestions and renders a Python skill module the operator can
review, edit, and (if they like) save via ``create_skill``.

Important constraints the generated code respects:

1. **Skills can only call read-only tools.** The SkillContext blocks
   ``run_command``, ``write_file``, ``git_ops`` etc. A synthesized
   runbook therefore cannot re-execute the unsafe parts of a pattern —
   those steps are emitted as a documented TODO block that the operator
   unblocks by either (a) keeping the skill as a documented checklist,
   or (b) promoting it to a direct-executor pattern outside the skill
   sandbox.

2. **No auto-registration.** The tool that exposes synthesis returns the
   generated code; the operator explicitly calls ``create_skill`` after
   reading it.

3. **Captured inputs are scrubbed** the same way runbook_detector scrubs
   ``sample_inputs`` — never echo a secret into a skill source file.
"""

from __future__ import annotations

import keyword
import re
import textwrap
from typing import Any

from .runbook_detector import RunbookSuggestion

try:
    from ..llm.secret_scrubber import scrub_output_secrets as _scrub
except Exception:  # pragma: no cover
    def _scrub(s: str) -> str:
        return s

# Tools the SkillContext permits — must stay in sync with
# src/tools/skill_context.py::SKILL_SAFE_TOOLS.
_SAFE_TOOLS: frozenset[str] = frozenset({
    "read_file", "search_history", "search_audit", "search_knowledge",
    "list_knowledge", "list_schedules", "list_skills", "list_tasks",
    "memory_manage", "parse_time", "web_search", "fetch_url",
    "http_probe", "browser_screenshot", "browser_read_page",
    "browser_read_table",
})

_IDENT_SAFE = re.compile(r"[^a-z0-9_]+")


def normalise_skill_name(raw: str) -> str:
    """Turn an arbitrary suggested name into a valid Python identifier
    suitable for both a Python filename and an import-safe module name."""
    base = raw.strip().lower()
    base = _IDENT_SAFE.sub("_", base)
    base = re.sub(r"_+", "_", base).strip("_")
    if not base:
        base = "synthesized_runbook"
    if base[0].isdigit():
        base = f"runbook_{base}"
    if keyword.iskeyword(base):
        base = f"{base}_runbook"
    return base[:60]


def _safe_repr(value: Any) -> str:
    """Conservative repr for literal-embed in generated code. Only primitive
    types are supported; complex values are emitted as their str()."""
    if isinstance(value, (str, int, float, bool)) or value is None:
        if isinstance(value, str):
            return repr(_scrub(value))
        return repr(value)
    if isinstance(value, (list, tuple)):
        return "[" + ", ".join(_safe_repr(v) for v in value) + "]"
    if isinstance(value, dict):
        return "{" + ", ".join(f"{_safe_repr(k)}: {_safe_repr(v)}" for k, v in value.items()) + "}"
    return repr(_scrub(str(value)))


def _describe_step(step_name: str, sample: dict) -> str:
    """Short human-readable description of one step for the generated docstring."""
    inp = sample.get("input") or {}
    keys = [f"{k}={_scrub(str(v))[:60]}" for k, v in inp.items() if v]
    host = sample.get("host") or ""
    suffix = f" on {host}" if host else ""
    args = f" ({', '.join(keys)})" if keys else ""
    return f"{step_name}{suffix}{args}"


def synthesize_skill_code(
    suggestion: RunbookSuggestion,
    *,
    skill_name: str | None = None,
    description_override: str | None = None,
) -> str:
    """Render a full skill source file as a string.

    The output is ready to feed to ``create_skill`` — but the intent is
    for the operator to read it first.
    """
    name = normalise_skill_name(skill_name or "_".join(suggestion.sequence[:3]))
    hosts = ", ".join(suggestion.hosts) or "(host unknown)"
    steps = suggestion.sequence or []
    samples = suggestion.sample_inputs or []

    if description_override:
        description = description_override
    else:
        first = steps[0] if steps else "noop"
        last = steps[-1] if steps else "noop"
        description = (
            f"Synthesized runbook from a pattern observed {suggestion.frequency}x "
            f"across {suggestion.session_count or 1} sessions. Pattern: "
            f"{' → '.join(steps)} on {hosts}. Verifies the preconditions of the "
            f"{first}→…→{last} procedure and documents the steps. Safe to dry-run; "
            f"destructive steps are left as TODOs for operator review."
        )

    # Docstring listing the captured sequence + sample inputs.
    doc_lines: list[str] = [
        f"Runbook skill: {name}",
        "",
        f"Detected pattern: {' → '.join(steps) or '(empty)'}",
        f"Hosts seen: {hosts}",
        f"Observed: {suggestion.frequency} times across "
        f"{suggestion.session_count or 1} sessions "
        f"(first: {suggestion.first_seen[:19]}, last: {suggestion.last_seen[:19]}).",
        "",
        "Captured step inputs (secret-scrubbed):",
    ]
    for i, step in enumerate(steps):
        sample = samples[i] if i < len(samples) else {"tool_name": step, "input": {}}
        doc_lines.append(f"  {i + 1}. {_describe_step(step, sample)}")
    docstring = textwrap.indent("\n".join(doc_lines), "")

    # Body: for each step, emit either a context.execute_tool() call (if
    # the step is a safe tool) or a TODO comment with the captured input
    # (if the step is unsafe and can't run from a skill).
    body_lines: list[str] = [
        "    report: list[str] = []",
        '    report.append(f"[runbook {SKILL_DEFINITION[\'name\']}] starting — {len(STEPS)} steps")',
        "",
    ]
    for i, step in enumerate(steps):
        sample = samples[i] if i < len(samples) else {"tool_name": step, "input": {}}
        sample_input = sample.get("input") or {}
        pretty_input = _safe_repr(sample_input)
        if step in _SAFE_TOOLS:
            body_lines.append(
                f"    # step {i + 1}: {step} (safe — invoked via SkillContext)"
            )
            body_lines.append(
                f"    step_input_{i} = {{**{pretty_input}, **(inp.get('overrides', {{}}).get('step_{i}', {{}}))}}"
            )
            body_lines.append(
                f"    result_{i} = await context.execute_tool('{step}', step_input_{i})"
            )
            body_lines.append(
                f"    report.append(f\"step {i + 1} [{step}] → {{result_{i}[:200]}}\")"
            )
        else:
            body_lines.append(
                f"    # step {i + 1}: {step} — UNSAFE FROM SKILLS. Operator must run this manually."
            )
            body_lines.append(
                f"    # captured input (scrubbed): {pretty_input}"
            )
            body_lines.append(
                f"    report.append('step {i + 1} [{step}]: SKIPPED — requires operator to run manually. "
                f"Captured input attached below.')"
            )
            body_lines.append(
                f"    report.append(f'    captured_input: {pretty_input!s}')"
            )
        body_lines.append("")
    body_lines.append("    return '\\n'.join(report)")

    steps_literal = "[" + ", ".join(repr(s) for s in steps) + "]"

    source = f'''"""{textwrap.indent(docstring, "").strip()}
"""
from __future__ import annotations

STEPS = {steps_literal}

SKILL_DEFINITION = {{
    "name": {_safe_repr(name)},
    "description": {_safe_repr(description)},
    "version": "0.1.0",
    "tags": ["runbook", "synthesized"],
    "input_schema": {{
        "type": "object",
        "properties": {{
            "overrides": {{
                "type": "object",
                "description": (
                    "Per-step input overrides. Key format 'step_<index>'. "
                    "Values are merged into the captured input for that step."
                ),
            }},
        }},
        "required": [],
    }},
}}


async def execute(inp: dict, context) -> str:
    """Auto-generated runbook. Review before trusting. See module docstring
    for the pattern this was synthesized from."""
{chr(10).join(body_lines)}
'''
    return source


def synthesize_summary(source: str, suggestion: RunbookSuggestion) -> str:
    """Short operator-facing summary of what was generated."""
    safe = sum(1 for s in suggestion.sequence if s in _SAFE_TOOLS)
    unsafe = len(suggestion.sequence) - safe
    lines = [
        f"Synthesized runbook skill for pattern: {' → '.join(suggestion.sequence)}",
        f"  safe steps (will run from skill): {safe}",
        f"  unsafe steps (operator must run manually): {unsafe}",
        f"  lines of code: {source.count(chr(10)) + 1}",
        "",
        "Review the generated code, then pass it to create_skill() to install.",
    ]
    return "\n".join(lines)
