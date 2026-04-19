"""Runbook synthesis — render detected patterns as honestly-classified
operator artifacts (checklist / hybrid / executable).

``runbook_detector`` surfaces candidate runbooks; this module takes one
of those suggestions and produces a reviewable artifact. The CRITICAL
piece — and the reason the output used to lie about itself — is that
most interesting detected patterns contain tools SkillContext won't
run (``run_command``, ``write_file``, ``claude_code``, etc.). Before
this module classified outputs honestly, every synthesis produced
something that *looked* like a loadable skill even when every step was
a TODO block — a checklist wearing a skill's clothes.

**Classification (computed at synthesis time, not editor time):**

- ``executable`` — every step is a safe tool SkillContext actually
  runs. The generated module loads via ``create_skill`` and executes
  end-to-end.
- ``hybrid`` — at least one safe step and at least one unsafe step.
  The generated module loads, but unsafe steps are documented TODOs
  with captured inputs; operator executes those manually.
- ``documentation_only`` — every step is unsafe. The generated module
  loads but runs nothing; it's a checklist with a ``SKILL_DEFINITION``
  wrapper so the synthesis pipeline stays uniform.

Every output carries the classification in a ``SYNTHESIS_CLASSIFICATION``
module constant, in the ``SKILL_DEFINITION.tags`` list, and at the top
of the docstring so nobody mistakes a checklist for automation.

Other constraints the generated code respects:

1. **Skills can only call read-only tools.** The SkillContext blocks
   ``run_command``, ``write_file``, ``git_ops`` etc. — see the
   SKILL_SAFE_TOOLS list. This module's classification logic uses the
   same allowlist so a pattern of all-safe tools lands as
   ``executable`` and mixed patterns land as ``hybrid``.

2. **No auto-registration.** The tool that exposes synthesis returns
   the generated code; the operator explicitly calls ``create_skill``
   after reading it.

3. **Captured inputs are scrubbed** the same way runbook_detector
   scrubs ``sample_inputs`` — never echo a secret into source.
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

# Tool names embedded into generated source MUST match this exactly, or we
# refuse to render. Prevents anyone passing a crafted "tool name" with
# quotes/newlines that would break out of string literals in the generated
# code. Real tool names are snake_case identifiers.
_TOOL_NAME_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]{0,63}$")


def _assert_safe_tool_name(name: str) -> str:
    """Raise if ``name`` can't be safely embedded in generated source."""
    if not isinstance(name, str) or not _TOOL_NAME_RE.match(name):
        raise ValueError(
            f"refusing to synthesize — tool name {name!r} is not a valid "
            "snake_case identifier"
        )
    return name


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


CLASSIFICATION_EXECUTABLE = "executable"
CLASSIFICATION_HYBRID = "hybrid"
CLASSIFICATION_DOCS_ONLY = "documentation_only"


def classify_sequence(
    sequence: list[str],
    sample_inputs: list[dict] | None = None,
) -> str:
    """Classify a runbook sequence by whether SkillContext can run it.

    Returns one of ``executable`` (every step is in SKILL_SAFE_TOOLS
    AND has captured inputs to run against), ``hybrid`` (some steps
    safe, some not, OR safe sequence with empty inputs — operator has
    to fill in the blanks), or ``documentation_only`` (no steps are
    runnable from a skill). Used by synthesizers and by the summary
    output so operators see up-front whether the artifact is automation
    or a checklist.

    Odin's PR #18 self-audit finding #9: a sequence of all-safe tools
    paired with empty sample_inputs was classified ``executable`` even
    though the generated skill would call tools with empty dicts and
    produce nothing useful. When samples are missing/empty, downgrade
    to ``hybrid`` so the classification banner reflects that operator
    input is required.
    """
    if not sequence:
        return CLASSIFICATION_DOCS_ONLY
    safe_count = sum(1 for s in sequence if s in _SAFE_TOOLS)
    if safe_count == 0:
        return CLASSIFICATION_DOCS_ONLY
    if safe_count == len(sequence):
        # Normally ``executable``, but if captured inputs are empty for
        # every step the skill would run with empty dicts — operator
        # must supply overrides, so this is effectively hybrid.
        if sample_inputs is None:
            return CLASSIFICATION_EXECUTABLE
        if not sample_inputs:
            return CLASSIFICATION_HYBRID
        any_populated = any(
            (isinstance(s, dict) and s.get("input"))
            for s in sample_inputs
        )
        if not any_populated:
            return CLASSIFICATION_HYBRID
        return CLASSIFICATION_EXECUTABLE
    return CLASSIFICATION_HYBRID


def _classification_banner(classification: str, sequence: list[str]) -> list[str]:
    """Prominent banner lines added to every generated module's docstring
    so operators can't miss the classification."""
    safe = sum(1 for s in sequence if s in _SAFE_TOOLS)
    total = len(sequence)
    unsafe = total - safe
    if classification == CLASSIFICATION_EXECUTABLE:
        kind = "EXECUTABLE RUNBOOK"
        line = (
            f"All {total} steps are SkillContext-safe. Installing this via "
            f"create_skill() produces real automation."
        )
    elif classification == CLASSIFICATION_HYBRID:
        kind = "HYBRID RUNBOOK"
        line = (
            f"{safe}/{total} steps run via SkillContext; {unsafe} are TODO "
            f"blocks with captured input for operator execution. Installing "
            f"via create_skill() runs the safe steps and prints documentation "
            f"for the rest — partial automation, not full."
        )
    else:  # documentation_only
        kind = "CHECKLIST (documentation only)"
        line = (
            f"None of the {total} steps are SkillContext-safe. Installing "
            f"via create_skill() produces a skill that runs nothing — it is "
            f"a checklist. Operator must execute every step manually using "
            f"the captured inputs. Do not mistake this for automation."
        )
    return [
        "=" * 68,
        f"  {kind}",
        "=" * 68,
        textwrap.fill(line, width=66, initial_indent="  ", subsequent_indent="  "),
        "",
    ]


def synthesize_runbook_code(
    suggestion: RunbookSuggestion,
    *,
    skill_name: str | None = None,
    description_override: str | None = None,
) -> str:
    """Render a runbook source file as a string, classified up front.

    The output is loadable by ``create_skill`` in all classifications,
    but the tags, docstring banner, and description prefix make the
    classification unavoidable to anyone reading the file or browsing
    installed skills. No more checklist-wearing-a-skill's-clothes.
    """
    steps = suggestion.sequence or []
    # Odin's PR #18 self-audit finding #8: an empty sequence silently
    # produced a "valid" skill shell with STEPS = [] and an empty
    # execute body — loaded and did nothing. Fail loudly instead so
    # the caller knows there's nothing to synthesize.
    if not steps:
        raise ValueError(
            "Cannot synthesize a runbook from an empty sequence — the "
            "generated module would load but do nothing. Provide a "
            "non-empty sequence from detect_runbooks or another source."
        )
    name = normalise_skill_name(skill_name or "_".join(suggestion.sequence[:3]))
    hosts = ", ".join(suggestion.hosts) or "(host unknown)"
    samples = suggestion.sample_inputs or []
    # Validate every step name BEFORE emitting source — embedding an
    # attacker-controlled string in generated code is a code-injection
    # risk. Real tool names are plain snake_case; anything else is
    # rejected.
    for step in steps:
        _assert_safe_tool_name(step)

    classification = classify_sequence(steps, samples)

    if description_override:
        description = description_override
    else:
        first = steps[0] if steps else "noop"
        last = steps[-1] if steps else "noop"
        description = (
            f"Runbook from a pattern observed {suggestion.frequency}x "
            f"across {suggestion.session_count or 1} sessions. Pattern: "
            f"{' → '.join(steps)} on {hosts}. "
            f"{first}→…→{last}."
        )
    # Classification prefix on the description so operators see it in
    # any skill listing (create_skill / list_skills) without needing to
    # open the source.
    tag_prefix = {
        CLASSIFICATION_EXECUTABLE: "[executable]",
        CLASSIFICATION_HYBRID: "[hybrid]",
        CLASSIFICATION_DOCS_ONLY: "[checklist]",
    }[classification]
    if not description.startswith(tag_prefix):
        description = f"{tag_prefix} {description}"

    # Docstring: banner first (unmissable), then metadata, then steps.
    doc_lines = _classification_banner(classification, steps)
    doc_lines.extend([
        f"Runbook: {name}",
        "",
        f"Detected pattern: {' → '.join(steps) or '(empty)'}",
        f"Hosts seen: {hosts}",
        f"Observed: {suggestion.frequency} times across "
        f"{suggestion.session_count or 1} sessions "
        f"(first: {suggestion.first_seen[:19]}, last: {suggestion.last_seen[:19]}).",
        "",
        "Captured step inputs (secret-scrubbed):",
    ])
    for i, step in enumerate(steps):
        sample = samples[i] if i < len(samples) else {"tool_name": step, "input": {}}
        safe_marker = " [safe]" if step in _SAFE_TOOLS else " [UNSAFE — manual]"
        doc_lines.append(f"  {i + 1}. {_describe_step(step, sample)}{safe_marker}")
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
        # step has already passed _assert_safe_tool_name; repr() gives us a
        # guaranteed-safe string literal for embedding even though step is
        # already restricted to an identifier-shape.
        step_lit = repr(step)
        step_num_lit = repr(f"step {i + 1}")
        if step in _SAFE_TOOLS:
            body_lines.append(
                f"    # step {i + 1}: {step} (safe — invoked via SkillContext)"
            )
            body_lines.append(
                f"    step_input_{i} = {{**{pretty_input}, "
                f"**(inp.get('overrides', {{}}).get('step_{i}', {{}}))}}"
            )
            body_lines.append(
                f"    result_{i} = await context.execute_tool({step_lit}, step_input_{i})"
            )
            body_lines.append(
                f"    report.append({step_num_lit} + ' [' + {step_lit} + '] → ' + str(result_{i})[:200])"
            )
        else:
            body_lines.append(
                f"    # step {i + 1}: {step} — UNSAFE FROM SKILLS. Operator must run this manually."
            )
            # Comment safe because pretty_input has no newlines (repr() of
            # primitives never emits raw newlines — only escape sequences).
            body_lines.append(
                f"    # captured input (scrubbed): {pretty_input}"
            )
            body_lines.append(
                f"    report.append({step_num_lit} + ' [' + {step_lit} + ']: "
                f"SKIPPED — requires operator to run manually. Captured input attached below.')"
            )
            # Stringify the already-safe-repr'd input and embed via a
            # second repr() so no content can break out of the literal.
            captured_repr = repr("    captured_input: " + pretty_input)
            body_lines.append(
                f"    report.append({captured_repr})"
            )
        body_lines.append("")
    body_lines.append("    return '\\n'.join(report)")

    steps_literal = "[" + ", ".join(repr(s) for s in steps) + "]"

    tags_literal = (
        f"[\"runbook\", \"synthesized\", {_safe_repr(classification)}]"
    )
    source = f'''"""{textwrap.indent(docstring, "").strip()}
"""
from __future__ import annotations

# Classification is authoritative. SKILL_DEFINITION.tags carries a
# machine-readable copy; this constant is what operators and tests
# should prefer when inspecting a generated module.
SYNTHESIS_CLASSIFICATION = {_safe_repr(classification)}

STEPS = {steps_literal}

SKILL_DEFINITION = {{
    "name": {_safe_repr(name)},
    "description": {_safe_repr(description)},
    "version": "0.1.0",
    "tags": {tags_literal},
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


# Back-compat alias so existing callers (executor, tests) keep working
# during rollout. New code should use synthesize_runbook_code.
synthesize_skill_code = synthesize_runbook_code


def synthesize_summary(source: str, suggestion: RunbookSuggestion) -> str:
    """Short operator-facing summary of what was generated.

    Uses the honest classification vocabulary from Odin's review:
    checklist (documentation-only), hybrid, or executable — no more
    calling every output a "skill" regardless of whether it runs.
    """
    classification = classify_sequence(
        suggestion.sequence, suggestion.sample_inputs,
    )
    safe = sum(1 for s in suggestion.sequence if s in _SAFE_TOOLS)
    unsafe = len(suggestion.sequence) - safe
    kind_label = {
        CLASSIFICATION_EXECUTABLE: "executable runbook",
        CLASSIFICATION_HYBRID: "hybrid runbook",
        CLASSIFICATION_DOCS_ONLY: "checklist (documentation only)",
    }[classification]
    lines = [
        f"Synthesized {kind_label} for pattern: {' → '.join(suggestion.sequence)}",
        f"  classification: {classification}",
        f"  safe steps (will run from skill): {safe}",
        f"  unsafe steps (operator must run manually): {unsafe}",
        f"  lines of code: {source.count(chr(10)) + 1}",
        "",
    ]
    if classification == CLASSIFICATION_DOCS_ONLY:
        lines.append(
            "This is a CHECKLIST, not automation. Installing via "
            "create_skill() produces a loadable module that runs nothing. "
            "Use it as structured documentation for manual operator work."
        )
    elif classification == CLASSIFICATION_HYBRID:
        lines.append(
            f"Partial automation: {safe}/{safe + unsafe} steps run via "
            "SkillContext; the rest are TODO blocks with captured input. "
            "Operator executes unsafe steps manually."
        )
    else:
        lines.append(
            "Fully executable — all steps are SkillContext-safe. "
            "Review the generated code, then pass it to create_skill() "
            "to install as real automation."
        )
    return "\n".join(lines)
