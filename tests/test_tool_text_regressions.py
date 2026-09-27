"""Regression coverage for tool-result failure labels and truncation boundaries."""

import json

import pytest

from src.tools.result_capture import result_capture
from src.tools.tool_text import _truncate_lines, failure_reason


@pytest.mark.parametrize(("text", "reason"), [
    (None, None),
    ("  Command failed (exit 2)", "command failed"),
    ("Error: tool 'browser' timed out", "timed out"),
    ("Tool 'browser' cancelled", "cancelled"),
    ("Unknown tool: missing", "unknown tool"),
    ("[Interrupted before execution]", "not executed"),
    ("[Interrupted: outcome unknown]", "outcome unknown"),
    ("[Interrupted observation]", "interrupted"),
    ("Error (tool reported failure): nope", "tool reported failure"),
    ("ordinary output", None),
])
def test_failure_reason_plain_text_edges(text, reason):
    assert failure_reason(text) == reason


@pytest.mark.parametrize(("status", "head", "expected"), [
    ("succeeded", "Command failed", None),
    ("failed", "Permission denied: /fixture", "permission denied"),
    ("failed", "ordinary detail", "failed"),
])
def test_failure_reason_tool_output_envelope(status, head, expected):
    payload = json.dumps(
        {"kind": "tool_output", "status": status, "head": head},
        separators=(",", ":"),
    )
    assert failure_reason(payload) == expected


def test_failure_reason_rejects_malformed_or_non_string_envelopes():
    assert failure_reason('{"kind":"tool_output","status":"failed"') is None
    assert failure_reason('{"kind":"tool_output","status":7}') is None


def test_truncate_lines_small_custom_boundary_and_capture_bypass():
    assert _truncate_lines("a\nb", max_lines=2) == "a\nb"
    truncated = _truncate_lines("\n".join(f"row-{i}" for i in range(7)), max_lines=4)
    assert truncated.splitlines() == [
        "row-0",
        "row-1",
        "[... 3 lines omitted — pipe through head/tail/grep for specific output ...]",
        "row-5", "row-6",
    ]
    full = "\n".join(f"row-{i}" for i in range(8))
    with result_capture():
        assert _truncate_lines(full, max_lines=2) == full
