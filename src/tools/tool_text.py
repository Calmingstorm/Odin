"""Shared tool-output text helpers (RFC-004 P4).

Leaf module — imported by both the executor core (middleware) and the
handler domain modules, so neither has to import the other. Moved
VERBATIM from executor.py; executor.py re-exports these names for the
existing importers (background_task, tool_loop_helpers, tests).
"""

from __future__ import annotations

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
