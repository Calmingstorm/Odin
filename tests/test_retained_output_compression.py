"""Compression must not undo successful recoverable result delivery."""

import json

import pytest

from src.llm.context_compressor import _truncate_iteration, estimate_message_chars
from src.llm.retained_output import compact_retained_output


def _iteration(value):
    return [{"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": "call-1", "content": json.dumps(value)},
    ]}]


@pytest.mark.parametrize("start", [0, 4000])
def test_compaction_rewinds_to_removed_page_start(start):
    value = {
        "kind": "tool_output", "retention": "retained", "status": "failed",
        "result_id": "a" * 32, "start": start, "end": start + 5000,
        "head": "x" * 5000, "cursor": f"{'a' * 32}:{start + 5000}",
        "expires_at": "2030-01-01T00:00:00+00:00",
    }
    original = _iteration(value)
    work, saved = _truncate_iteration(original, 600)
    compact = json.loads(work[0]["content"][0]["content"])
    assert compact["retrieval"] == {
        "tool": "get_tool_output", "arguments": {"cursor": f"{'a' * 32}:{start}"},
    }
    assert compact["status"] == "failed"
    assert compact["expires_at"] == value["expires_at"]
    assert saved > 4000
    assert estimate_message_chars(work) <= 600
    assert json.loads(original[0]["content"][0]["content"]) == value


def test_tiny_budget_keeps_pointer_instead_of_admitting_corrupt_result():
    original = _iteration({
        "kind": "tool_output", "retention": "retained", "status": "succeeded",
        "result_id": "b" * 32, "start": 0, "head": "x" * 5000,
    })
    work, _ = _truncate_iteration(original, 20)
    compact = json.loads(work[0]["content"][0]["content"])
    assert compact["retrieval"]["tool"] == "get_tool_output"
    assert estimate_message_chars(work) > 20
    again, saved = _truncate_iteration(work, 20)
    assert again == work
    assert saved == 0


def test_terminal_agent_page_still_has_retrieval_after_compression():
    work, saved = _truncate_iteration(_iteration({
        "id": "agent-1", "status": "completed", "preview": "x" * 5000,
        "original_bytes": 5000, "result_bytes": 5000, "error_bytes": 0,
        "truncated": False, "cursor": None,
    }), 400)
    assert saved > 4000
    compact = json.loads(work[0]["content"][0]["content"])
    assert compact["retrieval"] == {
        "tool": "get_agent_results", "arguments": {"agent_id": "agent-1"},
    }


@pytest.mark.parametrize("text", [
    "plain output", "[]", "{}", '{"kind":"tool_output","retention":"failed"}',
    '{"kind":"tool_output","retention":"retained","start":true,"result_id":"x"}',
    '{"id":1,"preview":"x","original_bytes":1,"result_bytes":1,"error_bytes":0}',
])
def test_other_output_is_not_mistaken_for_retrievable_content(text):
    assert compact_retained_output(text) is None


def test_ordinary_result_compression_unchanged():
    work, saved = _truncate_iteration(_iteration("x" * 5000), 200)
    assert saved > 4500
    assert estimate_message_chars(work) <= 200
