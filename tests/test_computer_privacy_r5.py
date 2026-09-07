"""Desktop content uses normal audit/storage paths without persisting document text."""

import json
from copy import deepcopy

import pytest

from src.audit.logger import AuditLogger
from src.discord.tool_loop import ToolLoopRunner
from src.discord.tool_loop_helpers import _scrub_tool_input_for_storage
from src.tools.result_validator import ToolResult
from src.turn_state.codec import scrub_stored_tool_input
from tests.test_computer_dispatch_r3 import dispatch_state


@pytest.mark.parametrize("key", [
    "text", "value", "content", "data", "image_bytes", "text_equals", "text_contains",
    "contains_text", "expected_text", "selected_text", "accessible_name",
    "accessible_description", "clipboard",
])
def test_private_aliases_scrubbed_before_durability_and_audit(key):
    original = {"action_id": "fixture", "expect": {key: "private noncredential document"}}
    before = deepcopy(original)
    for scrub in (_scrub_tool_input_for_storage, scrub_stored_tool_input):
        clean = scrub("computer_act", original)
        assert "private noncredential document" not in json.dumps(clean)
        assert clean["action_id"] == "fixture"
    assert original == before


def test_desktop_nesting_is_bounded_without_affecting_ordinary_tools():
    original = {}
    original["nested"] = original
    cleaned = _scrub_tool_input_for_storage("computer_act", original)
    assert "nesting limit" in json.dumps(cleaned)
    assert _scrub_tool_input_for_storage("ordinary", original) is original


async def test_real_tool_outcome_audit_pipeline_keeps_attribution_not_document(tmp_path):
    path = tmp_path / "audit.jsonl"
    audit = AuditLogger(str(path), hmac_key="harmless-test-key")
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._audit = audit
    state = dispatch_state()
    state.iteration = 1
    values = {"session_id": "fixture-session", "action_id": "fixture-action",
              "text": "private body", "expect": {"text_contains": "private substring"}}
    original = deepcopy(values)
    result = ToolResult('{"status":"verified"}', ok=True,
                        audit_metadata={"computer_call_id": "fixture-call"})
    await runner._audit_tool_outcome(state, "computer_act", values, result.output, 17,
                                    None, result, call_id="fixture-call")
    lines = path.read_text()
    assert "private body" not in lines and "private substring" not in lines
    records = [json.loads(line) for line in lines.splitlines()]
    execution = next(record for record in records if "tool_input" in record)
    assert execution["tool_input"]["action_id"] == "fixture-action"
    assert execution["execution_time_ms"] == 17
    assert execution["audit_metadata"]["computer_call_id"] == "fixture-call"
    assert any(record.get("metadata", {}).get("call_id") == "fixture-call"
               for record in records)
    assert values == original
    assert (await audit.verify_integrity())["valid"]
