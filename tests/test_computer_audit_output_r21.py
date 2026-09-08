"""Computer audit copies omit desktop content without changing model evidence."""

import json
from copy import deepcopy
from types import SimpleNamespace

import pytest

from src.audit.logger import AuditLogger
from src.discord.tool_loop import ToolLoopRunner
from src.tools.result_validator import ToolResult

PRIVATE = "A private document sentence with no credential patterns"


@pytest.mark.parametrize(
    ("tool", "result", "ok", "error", "uncertain", "expected_status"),
    [
        (
            "computer_observe",
            "[Image loaded. Analyze it with this instruction: "
            + json.dumps({"accessible_targets": [{"name": PRIVATE, "text": PRIVATE}]})
            + "]",
            None,
            None,
            False,
            "succeeded",
        ),
        (
            "computer_act",
            json.dumps({"status": "verified", "verification": {"actual": {"text": PRIVATE}}}),
            True,
            None,
            False,
            "succeeded",
        ),
        (
            "computer_act",
            "Computer post-action observation rejected; Action receipt: "
            + json.dumps({"status": "verified", "verification": {"actual": {"text": PRIVATE}}}),
            True,
            "computer_observation_rejected",
            False,
            "failed",
        ),
        (
            "computer_act",
            json.dumps({"status": "unknown", "verification": {"actual": {"text": PRIVATE}}}),
            False,
            "computer_not_satisfied",
            True,
            "outcome_unknown",
        ),
        ("computer_session", PRIVATE, False, PRIVATE, False, "failed"),
        ("computer_act", PRIVATE, False, None, False, "failed"),
        ("computer_act", PRIVATE, False, None, True, "outcome_unknown"),
        ("computer_act", PRIVATE, None, "outcome_unknown", False, "outcome_unknown"),
    ],
)
async def test_computer_output_private_in_persisted_and_fanout_audit(
    tmp_path, tool, result, ok, error, uncertain, expected_status
):
    path = tmp_path / "audit.jsonl"
    audit = AuditLogger(str(path), hmac_key="synthetic-audit-key")
    delivered = []

    async def receive(entry):
        delivered.append(deepcopy(entry))

    audit._event_callback = receive
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._audit = audit
    state = SimpleNamespace(
        message=SimpleNamespace(
            author=SimpleNamespace(id="fixture-owner"),
            channel=SimpleNamespace(id="fixture-channel"),
        ),
        iteration=3,
    )
    values = {"session_id": "fixture-session", "action_id": "fixture-action", "text": PRIVATE}
    structured = (
        ToolResult(
            result,
            ok=ok,
            error=error,
            uncertain_outcome=uncertain,
            audit_metadata={"computer_call_id": "fixture-call"},
        )
        if ok is not None
        else None
    )
    before = deepcopy((values, structured))
    await runner._audit_tool_outcome(
        state, tool, values, result, 17, error, structured, call_id="fixture-call"
    )

    persisted = [json.loads(line) for line in path.read_text().splitlines()]
    assert len(persisted) == 1
    assert persisted == delivered
    assert PRIVATE not in json.dumps(persisted)
    entry = persisted[0]
    assert entry["type"] == "tool_end"
    assert entry["call_id"] == "fixture-call"
    assert entry["iteration"] == 3
    assert entry["execution_time_ms"] == 17
    assert entry["tool_input"]["session_id"] == "[redacted:sensitive-key]"
    assert entry["tool_input"]["action_id"] == "fixture-action"
    summary = json.loads(entry["result_summary"])
    assert summary["kind"] == "computer_audit"
    assert summary["tool_status"] == expected_status
    assert summary["output_omitted"] == "private desktop content"
    assert len(entry["result_summary"]) < 300
    assert bool(entry["error"]) == (expected_status != "succeeded")
    if error == "computer_observation_rejected":
        assert entry["error"] == error
    assert (values, structured) == before
    assert PRIVATE in result
    if structured is not None:
        assert structured.output == result
    assert (await audit.verify_integrity())["valid"]


async def test_ordinary_audit_output_still_retained(tmp_path):
    audit = AuditLogger(str(tmp_path / "audit.jsonl"))
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._audit = audit
    state = SimpleNamespace(
        message=SimpleNamespace(
            author=SimpleNamespace(id="fixture-owner"),
            channel=SimpleNamespace(id="fixture-channel"),
        ),
        iteration=1,
    )
    await runner._audit_tool_outcome(
        state, "read_file", {}, PRIVATE, 17, None, None, call_id="fixture-call"
    )
    entries = [json.loads(line) for line in audit.path.read_text().splitlines()]
    assert len(entries) == 2
    assert entries[0]["result_summary"] == PRIVATE
