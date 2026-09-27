"""Shared tool-output text helpers (RFC-004 P4).

Leaf module — imported by both the executor core (middleware) and the
handler domain modules, so neither has to import the other. Moved
VERBATIM from executor.py; executor.py re-exports these names for the
existing importers (background_task, tool_loop_helpers, tests).
"""

from __future__ import annotations

import json
import re

from .result_capture import capture_active

# String prefixes that mark a handler's plain-string return as an error
# (used by execute()'s ok/error classification and by run_command_multi's
# per-host aggregation).
_ERROR_RESULT_PREFIXES = (
    "Error",
    "Command failed",
    "Script failed",
    "Blocked",
    "Unknown or disallowed host",
)

# Stable, non-sensitive reason labels for common tool failure results.
_FAILURE_REASONS = (
    (re.compile(r"Blocked\b"), "blocked"),
    (re.compile(r"Unknown or disallowed host"), "disallowed host"),
    (re.compile(r"Command failed"), "command failed"),
    (re.compile(r"Script failed"), "script failed"),
    (re.compile(r"(?:Permission denied|Denied)\b"), "permission denied"),
    (
        re.compile(r"(?:Tool '?[^\s']+'? timed out|Error: tool '[^']+' timed out|Timeout)"),
        "timed out",
    ),
    (re.compile(r"Tool '?[^\s']+'? input error"), "input error"),
    (re.compile(r"Tool '[^']+' cancelled"), "cancelled"),
    (re.compile(r"Unknown tool"), "unknown tool"),
    (re.compile(r"\[Interrupted before execution"), "not executed"),
    (re.compile(r"\[Interrupted: outcome unknown"), "outcome unknown"),
    (re.compile(r"\[Interrupted observation"), "interrupted"),
    (re.compile(r"Failed to "), "failed"),
    (re.compile(r"Error \(tool reported failure\):"), "tool reported failure"),
    (re.compile(r"(?:Error|error|ERROR)"), "error"),
)
_ENVELOPE_START = '{"kind":"tool_output","status":"'


def failure_reason(text: object) -> str | None:
    """Return a fixed short reason when tool result text reports failure."""
    if not isinstance(text, str):
        return None
    body = text.lstrip()
    if body.startswith(_ENVELOPE_START):
        try:
            envelope = json.loads(body)
        except ValueError:
            return None
        status = envelope.get("status") if isinstance(envelope, dict) else None
        if not isinstance(status, str) or status == "succeeded":
            return None
        head = envelope.get("head", envelope.get("text", ""))
        return failure_reason(head) or status.replace("_", " ")
    for pattern, reason in _FAILURE_REASONS:
        if pattern.match(body):
            return reason
    return None


# Maximum lines of output from run_command / run_command_multi before
# truncation for direct helpers. Retained tool delivery bypasses this legacy cut.
_RUN_COMMAND_MAX_LINES = 200


def _truncate_lines(text: str, max_lines: int = _RUN_COMMAND_MAX_LINES) -> str:
    """Truncate command output to *max_lines*, keeping first and last halves.

    Unlike the central character-based ``truncate_tool_output`` in
    ``client.py``, this cuts at line boundaries so the LLM always sees
    complete lines.  A notice is inserted in the middle telling the LLM
    how to get more specific output.
    """
    if capture_active():
        return text
    lines = text.split("\n")
    if len(lines) <= max_lines:
        return text
    keep = max_lines // 2
    omitted = len(lines) - max_lines
    return "\n".join(
        lines[:keep]
        + [f"[... {omitted} lines omitted — pipe through head/tail/grep for specific output ...]"]
        + lines[-keep:]
    )
