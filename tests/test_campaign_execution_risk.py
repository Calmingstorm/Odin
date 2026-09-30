"""Risk is observational metadata; verify action-aware parity without effects."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.discord.tool_loop import ToolLoopRunner
from src.tools.result_validator import ToolResult
from src.tools.risk_classifier import RiskLevel, classify_tool


@pytest.mark.parametrize("tool,inp,level", [
    ("http_probe", {"method": "GET"}, RiskLevel.LOW),
    ("http_probe", {"method": "PATCH"}, RiskLevel.HIGH),
    ("memory_manage", {"action": "get"}, RiskLevel.LOW),
    ("memory_manage", {"action": "save"}, RiskLevel.MEDIUM),
    ("manage_list", {"action": "add"}, RiskLevel.MEDIUM),
    ("manage_process", {"action": "poll"}, RiskLevel.LOW),
    ("manage_process", {"action": "kill"}, RiskLevel.HIGH),
    ("validate_action", {"checks": [{"type": "port", "target": "80"}]}, RiskLevel.LOW),
    ("validate_action", {"checks": [{"type": "command", "target": "fixture"}]}, RiskLevel.HIGH),
    ("ingest_document", {}, RiskLevel.MEDIUM),
    ("schedule_task", {}, RiskLevel.HIGH),
    ("update_schedule", {}, RiskLevel.HIGH),
    ("create_skill", {}, RiskLevel.HIGH),
    ("invoke_skill", {}, RiskLevel.HIGH),
    ("start_loop", {}, RiskLevel.HIGH),
    ("spawn_agent", {}, RiskLevel.LOW),  # settled affordance is unchanged
])
def test_actual_names_and_action_aware_risk(tool, inp, level):
    assert classify_tool(tool, inp).level == level


@pytest.mark.parametrize("structured", [False, True])
async def test_foreground_native_and_executor_audit_use_shared_assessment(structured):
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._audit = SimpleNamespace(log_execution=AsyncMock(), log_event=AsyncMock())
    st = SimpleNamespace(
        message=SimpleNamespace(author=SimpleNamespace(id="u"),
                                channel=SimpleNamespace(id="c")), iteration=1,
    )
    tool, inp = "http_probe", {"method": "POST"}
    result = ToolResult("fixture") if structured else None
    await runner._audit_tool_outcome(st, tool, inp, "fixture", 1, None, result, call_id="call")
    kwargs = runner._audit.log_execution.await_args.kwargs
    expected = classify_tool(tool, inp)
    assert kwargs["risk_level"] == expected.level.value
    assert kwargs["risk_reason"] == expected.reason
