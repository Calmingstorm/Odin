"""Defense in depth must distinguish observation progress from repetition."""

from unittest.mock import AsyncMock

from src.agents.manager import AgentState, _run_agent
from src.agents.repetition import RepetitionGuard
from tests.test_agent_transcript_contract import agent


async def test_unchanged_cycle_nudges_once_then_truthfully_stops():
    a = agent()

    async def cb(*args, **kwargs):
        return {"tool_calls": [{"id": str(a.iteration_count), "name": "t", "input": {"x": 1}}]}

    execute = AsyncMock(return_value="unchanged")
    await _run_agent(a, "", [], cb, execute, max_iterations=10)
    assert a.state == AgentState.FAILED and a.iteration_count == 4
    assert execute.await_count == 4
    assert "unchanged" in a.result and "after one warning" in a.result
    assert sum(m.get("provenance") == "agent_guard" for m in a.messages) == 1
    assert len([m for m in a.messages if isinstance(m.get("content"), list)]) == 8


async def test_changing_output_is_progress_and_model_can_follow_nudge():
    a = agent()

    async def cb(messages, *args, **kwargs):
        if any(m.get("provenance") == "agent_guard" for m in messages):
            return {"text": "already done"}
        return {"tool_calls": [{"id": str(a.iteration_count), "name": "t", "input": {}}]}

    execute = AsyncMock(side_effect=["a", "b", "b", "b"])
    await _run_agent(a, "", [], cb, execute, max_iterations=10)
    assert a.result == "already done" and a.state == AgentState.COMPLETED
    assert execute.await_count == 4


def test_fingerprint_includes_input_status_output_and_order_not_identity():
    guard = RepetitionGuard()
    calls = [{"id": "a", "name": "t", "input": {"x": 1}}]
    results = [{"tool_use_id": "a", "result": "ok", "status": "succeeded"}]
    assert guard.observe(calls, results) == ""
    calls[0]["id"] = results[0]["tool_use_id"] = "b"
    assert guard.observe(calls, results) == ""
    assert guard.observe(calls, results) == "nudge"
    results[0]["status"] = "failed"
    assert guard.observe(calls, results) == ""
    calls[0]["input"]["x"] = 2
    assert guard.observe(calls, results) == ""
    for status in ("not_executed", "invalid_arguments", "interrupted_effect_free"):
        results[0]["status"] = status
        assert guard.observe(calls, results) == "" and guard.repeats == 0
