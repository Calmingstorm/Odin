"""Tool result schema enforcement.

Validates and normalises tool results before they are fed back to the LLM,
ensuring consistent shape, bounded size, and observable quality.

Design principles:
- **Fail-open**: invalid results are normalised and logged, never blocked.
- **Observable**: every violation is counted in ``ResultValidationStats``.
- **Per-tool rules**: tools may declare an ``output_schema`` override via
  ``ToolResultSchema``; everything else gets sensible defaults.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field

log = logging.getLogger("odin.tools.result_validator")

RESULT_MAX_CHARS = 12_000

_ERROR_PREFIXES = (
    "Error:",
    "Error executing ",
    "Unknown tool:",
    "Unknown or disallowed host:",
    "Permission denied:",
    "Unsupported interpreter:",
    "Command failed (exit ",
    "Script failed (exit ",
)

_EMPTY_RESULT_PLACEHOLDER = "(no output)"


@dataclass(slots=True)
class ToolResultSchema:
    """Per-tool validation rules."""

    max_chars: int = RESULT_MAX_CHARS
    allow_empty: bool = False
    expect_json: bool = False


# Tools whose handlers may legitimately return an empty/blank string
_EMPTY_OK_TOOLS = frozenset({
    "write_file",
    "browser_click",
    "browser_fill",
    "add_reaction",
    "memory_manage",
    "manage_list",
    "delete_schedule",
    "update_schedule",
    "stop_loop",
    "kill_agent",
})

# Tools whose results should be valid JSON
_JSON_TOOLS = frozenset({
    "manage_process",
})

TOOL_SCHEMAS: dict[str, ToolResultSchema] = {}

for _t in _EMPTY_OK_TOOLS:
    TOOL_SCHEMAS[_t] = ToolResultSchema(allow_empty=True)
for _t in _JSON_TOOLS:
    TOOL_SCHEMAS.setdefault(_t, ToolResultSchema()).expect_json = True

DEFAULT_SCHEMA = ToolResultSchema()


@dataclass(slots=True)
class ToolResult:
    """Structured tool execution result.

    Carries metadata alongside the output string so downstream code
    (audit, web API, retry logic) can inspect structured state instead
    of parsing error strings.  ``str(result)`` returns the output for
    backward-compatible string usage.
    """

    output: str
    ok: bool = True
    error: str | None = None
    exit_code: int | None = None
    truncated: bool = False
    duration_ms: int = 0
    tool_name: str = ""
    risk_level: str = "low"
    risk_reason: str = ""
    requires_validation: bool = False
    validation_reason: str = ""

    def __str__(self) -> str:
        return self.output

    def as_dict(self) -> dict:
        d: dict = {
            "ok": self.ok,
            "output": self.output,
            "truncated": self.truncated,
            "duration_ms": self.duration_ms,
        }
        if self.error:
            d["error"] = self.error
        if self.exit_code is not None:
            d["exit_code"] = self.exit_code
        if self.tool_name:
            d["tool_name"] = self.tool_name
        if self.risk_level != "low":
            d["risk_level"] = self.risk_level
            d["risk_reason"] = self.risk_reason
        return d


@dataclass(slots=True)
class ValidationOutcome:
    """Result of validating a single tool result."""

    valid: bool
    original: str
    normalized: str
    violations: list[str] = field(default_factory=list)


@dataclass
class ResultValidationStats:
    """Counters for tool result validation violations."""

    coerced_type: int = 0
    replaced_empty: int = 0
    truncated: int = 0
    invalid_json: int = 0
    total_validated: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "coerced_type": self.coerced_type,
            "replaced_empty": self.replaced_empty,
            "truncated": self.truncated,
            "invalid_json": self.invalid_json,
            "total_validated": self.total_validated,
        }


def _is_error_result(text: str) -> bool:
    """True when *text* looks like an executor error string."""
    return any(text.startswith(p) for p in _ERROR_PREFIXES)


def _truncate_smart(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    omitted = len(text) - max_chars
    return (
        text[:half]
        + f"\n\n[... {omitted} characters omitted ...]\n\n"
        + text[-half:]
    )


def validate_tool_result(
    tool_name: str,
    result: object,
    *,
    schema: ToolResultSchema | None = None,
    stats: ResultValidationStats | None = None,
) -> ValidationOutcome:
    """Validate and normalise a tool result.

    Always returns a ``ValidationOutcome`` whose ``.normalized`` is a safe
    string ready to feed to the LLM.  Violations are logged at debug level
    and optionally counted in *stats*.
    """
    s = schema or TOOL_SCHEMAS.get(tool_name, DEFAULT_SCHEMA)
    violations: list[str] = []

    if stats is not None:
        stats.total_validated += 1

    # --- 1. Type coercion ---------------------------------------------------
    if result is None:
        text = ""
        violations.append("result_was_none")
        if stats is not None:
            stats.coerced_type += 1
    elif isinstance(result, str):
        text = result
    else:
        text = str(result)
        violations.append(f"coerced_{type(result).__name__}_to_str")
        if stats is not None:
            stats.coerced_type += 1

    # --- 2. Whitespace normalisation ----------------------------------------
    text = text.strip()

    # --- 3. Empty check -----------------------------------------------------
    if not text and not s.allow_empty and not _is_error_result(text):
        text = _EMPTY_RESULT_PLACEHOLDER
        violations.append("empty_result_replaced")
        if stats is not None:
            stats.replaced_empty += 1

    # --- 4. Truncation ------------------------------------------------------
    if len(text) > s.max_chars:
        text = _truncate_smart(text, s.max_chars)
        violations.append("truncated")
        if stats is not None:
            stats.truncated += 1

    # --- 5. JSON check (soft) -----------------------------------------------
    if s.expect_json and text and not _is_error_result(text):
        try:
            json.loads(text)
        except (json.JSONDecodeError, ValueError):
            violations.append("invalid_json")
            if stats is not None:
                stats.invalid_json += 1

    valid = len(violations) == 0

    if violations:
        log.debug("Tool %s result violations: %s", tool_name, ", ".join(violations))

    return ValidationOutcome(
        valid=valid,
        original=str(result) if result is not None else "",
        normalized=text,
        violations=violations,
    )
