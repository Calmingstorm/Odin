"""Reasoning usage survives real generation recorders and durable JSONL codecs."""
import asyncio
import json
import sqlite3
from dataclasses import asdict
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.agents.manager import AgentInfo, _run_agent
from src.agents.trajectory import AgentTrajectorySaver, AgentTrajectoryTurn
from src.discord.response_guards import StuckLoopTracker
from src.discord.tool_loop import ToolLoopRunner
from src.llm.types import LLMResponse
from src.trajectories.saver import ToolIteration, TrajectorySaver, TrajectoryTurn
from src.usage.provenance import accepted_usage_fields, apply_accepted_usage
from src.usage.rollup import UsageRollup


@pytest.mark.parametrize("representation", ["object", "dict"])
@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, None), (0, 0), (37, 37), (-1, None), (True, None),
     (False, None), (2.5, None), ("37", None)],
)
def test_accepted_usage_sanitizes_nullable_reasoning(representation, value, expected):
    response = {"reasoning_tokens": value}
    if representation == "object":
        response = SimpleNamespace(**response)
    usage = accepted_usage_fields(response, chars_sent=0, images_sent=0, snapshot=None)
    assert usage["reasoning_tokens"] == expected
    assert usage["input_tokens"] is None
    assert usage["output_tokens"] is None
    if representation == "object":
        apply_accepted_usage(response, chars_sent=0, images_sent=0, snapshot=None)
        assert response.reasoning_tokens == expected


@pytest.mark.parametrize("response", [{}, SimpleNamespace(), LLMResponse()])
def test_unreported_reasoning_is_unknown_without_an_estimate(response):
    usage = accepted_usage_fields(response, chars_sent=1200, images_sent=0, snapshot=None)
    assert usage["reasoning_tokens"] is None


@pytest.mark.parametrize("value", [None, 0, 37])
def test_real_dataclass_and_turn_serialization_preserve_reasoning(value):
    iteration = ToolIteration(iteration=1, output_tokens=100, reasoning_tokens=value)
    assert asdict(iteration)["reasoning_tokens"] == value
    chat = TrajectoryTurn(message_id="chat")
    agent = AgentTrajectoryTurn(agent_id="agent")
    for turn in (chat, agent):
        turn.add_iteration(iteration=1, output_tokens=100, reasoning_tokens=value)
        serialized = turn.to_dict()["iterations"][0]
        assert serialized["reasoning_tokens"] == value
        # Reasoning is a subset of output, not an additional output count.
        assert serialized["output_tokens"] == 100
    assert asdict(ToolIteration(iteration=1))["reasoning_tokens"] is None


@pytest.mark.parametrize("path", ["chat", "loop"])
@pytest.mark.parametrize("value", [None, 0, 37])
async def test_actual_chat_and_loop_recorders_persist_reasoning(tmp_path, path, value):
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    turn = TrajectoryTurn(message_id="message", source="discord" if path == "chat" else "loop")
    st = SimpleNamespace(
        iteration=1, _trajectory=turn, stuck_tracker=StuckLoopTracker(),
        final_text="", completed_naturally=False,
    )
    response = LLMResponse(
        text="Done", server_input_tokens=321, server_output_tokens=100,
        output_tokens=100, reasoning_tokens=value,
        provenance_provider="codex", provenance_model="executed-model",
        provenance_reasoning_effort="high",
    )
    apply_accepted_usage(response, chars_sent=500, images_sent=0, snapshot=None)
    if path == "chat":
        assert await runner._check_stuck_and_record(st, response) is None
    else:
        assert runner._record_loop_iteration(st, response, 1)
    turn.finalize("Done")
    observer = Mock()
    saver = TrajectorySaver(directory=str(tmp_path / path), usage_observer=observer)
    await saver.save(turn)
    persisted = await saver.find_by_message_id("message")
    row = persisted["iterations"][0]
    assert row["reasoning_tokens"] == value
    assert row["server_output_tokens"] == row["output_tokens"] == 100
    assert row["provider"] == "codex"
    assert row["model"] == "executed-model"
    assert row["reasoning_effort"] == "high"
    assert row["input_token_provenance"] == row["output_token_provenance"] == "provider_reported"
    observed, kind = observer.schedule_trajectory.call_args.args
    assert kind == "turn"
    assert observed["iterations"] == persisted["iterations"]


@pytest.mark.parametrize("value", [None, 0, 37])
async def test_real_agent_tool_and_final_generations_persist_reasoning(tmp_path, value):
    observer = Mock()
    saver = AgentTrajectorySaver(directory=str(tmp_path), usage_observer=observer)
    agent = AgentInfo(
        id="reasoning-agent", label="reasoning", goal="finish",
        channel_id="channel", requester_id="user", requester_name="User",
    )
    responses = iter([
        {"text": "Inspecting", "tool_calls": [{"name": "inspect", "input": {}}]},
        {"text": "Done", "tool_calls": []},
    ])

    async def callback(messages, prompt, tools, generation_state=None):
        return {
            **next(responses), "reasoning_tokens": value,
            "server_input_tokens": 321, "server_output_tokens": 100,
            "provider": "codex", "model": "executed-model", "reasoning_effort": "high",
        }

    tool = AsyncMock(return_value="inspected")
    await _run_agent(
        agent=agent, system_prompt="sys", tools=[], iteration_callback=callback,
        tool_executor_callback=tool, trajectory_saver=saver,
    )
    persisted = await saver.find_by_agent_id(agent.id)
    assert persisted["final_state"] == "completed"
    assert len(persisted["iterations"]) == 2
    tool.assert_awaited_once()
    for row in persisted["iterations"]:
        assert row["reasoning_tokens"] == value
        assert row["server_output_tokens"] == row["output_tokens"] == 100
        assert row["provider"] == "codex"
        assert row["model"] == "executed-model"
        assert row["reasoning_effort"] == "high"
        assert row["input_token_provenance"] == "provider_reported"
        assert row["output_token_provenance"] == "provider_reported"
    observed, kind = observer.schedule_trajectory.call_args.args
    assert kind == "agent"
    assert observed["iterations"] == persisted["iterations"]


@pytest.mark.parametrize("value", [-1, True, "37"])
async def test_agent_sanitizes_reasoning_without_other_usage_facts(tmp_path, value):
    saver = AgentTrajectorySaver(directory=str(tmp_path))
    agent = AgentInfo(
        id="invalid", label="reasoning", goal="finish",
        channel_id="channel", requester_id="user", requester_name="User",
    )
    await _run_agent(
        agent=agent, system_prompt="sys", tools=[],
        iteration_callback=AsyncMock(return_value={
            "text": "Done", "tool_calls": [], "reasoning_tokens": value,
        }),
        tool_executor_callback=AsyncMock(), trajectory_saver=saver,
    )
    persisted = await saver.find_by_agent_id(agent.id)
    assert persisted["iterations"][0]["reasoning_tokens"] is None


@pytest.mark.parametrize("value", [None, 0, 37])
@pytest.mark.parametrize("with_tools", [False, True])
async def test_incomplete_agent_generation_persists_usage_without_executing_tools(
    tmp_path, value, with_tools,
):
    trajectory_dir = tmp_path / "trajectories"
    agent_dir = trajectory_dir / "agents"
    rollup = UsageRollup(
        str(tmp_path / "usage"), trajectory_directory=str(trajectory_dir),
        agent_trajectory_directory=str(agent_dir), audit=None,
    )
    assert rollup.available
    saver = AgentTrajectorySaver(directory=str(agent_dir), usage_observer=rollup)
    agent = AgentInfo(
        id="incomplete", label="reasoning", goal="finish",
        channel_id="channel", requester_id="user", requester_name="User",
    )
    callback = AsyncMock(return_value={
        "text": "Partial answer", "stop_reason": "incomplete",
        "tool_calls": [{"name": "inspect", "input": {}}] if with_tools else [],
        "reasoning_tokens": value,
        "server_input_tokens": 321, "server_output_tokens": 100,
        "cached_tokens": 12, "cache_write_tokens": 4, "duration_ms": 19,
        "provider": "codex", "model": "executed-model", "reasoning_effort": "high",
        "upstream_provider": "upstream", "actual_cost_usd": 0.125,
    })
    tool = AsyncMock()
    await _run_agent(
        agent=agent, system_prompt="sys", tools=[], iteration_callback=callback,
        tool_executor_callback=tool, trajectory_saver=saver,
    )
    callback.assert_awaited_once()
    tool.assert_not_called()
    assert agent.state.value == "failed"
    assert agent.result == "Partial answer"
    assert agent.ended_at is not None
    assert agent.tools_used == []

    # Read the actual JSONL append, not an in-memory turn or observer mock.
    files = list(agent_dir.glob("*.jsonl"))
    assert len(files) == 1
    lines = files[0].read_text().splitlines()
    assert len(lines) == 1
    persisted = json.loads(lines[0])
    assert persisted["final_state"] == "failed"
    assert persisted["result"] == "Partial answer"
    assert "incomplete" in persisted["error"]
    assert persisted["iteration_count"] == 1
    assert persisted["tools_used"] == []
    assert len(persisted["iterations"]) == 1
    row = persisted["iterations"][0]
    assert row["reasoning_tokens"] == value
    assert row["server_input_tokens"] == row["input_tokens"] == 321
    assert row["server_output_tokens"] == row["output_tokens"] == 100
    assert row["input_token_provenance"] == row["output_token_provenance"] == "provider_reported"
    assert row["provider"] == "codex"
    assert row["model"] == "executed-model"
    assert row["reasoning_effort"] == "high"
    assert row["cached_tokens"] == 12
    assert row["cache_write_tokens"] == 4
    assert row["upstream_provider"] == "upstream"
    assert row["actual_cost_usd"] == 0.125
    # The real recovery helper's timing decorator replaces callback timing.
    assert row["duration_ms"] == callback.return_value["duration_ms"]
    assert row["llm_text"] == "Partial answer"
    assert len(row["tool_calls"]) == int(with_tools)
    assert row["tool_results"] == []
    assert row["tool_duration_ms"] == 0

    # Exercise the saver -> real observer -> durable SQLite path.
    tasks = list(rollup._observer_tasks)
    if tasks:
        await asyncio.gather(*tasks)
    with sqlite3.connect(rollup.db_path) as conn:
        assert conn.execute(
            "SELECT reasoning_tokens, input_tokens, output_tokens FROM generation_facts"
        ).fetchall() == [(value, 321, 100)]
        assert conn.execute(
            "SELECT outcome, agent_final_state, is_error FROM turn_facts"
        ).fetchall() == [("failed", "failed", 1)]
    restarted = UsageRollup(
        str(tmp_path / "usage"), trajectory_directory=str(trajectory_dir),
        agent_trajectory_directory=str(agent_dir), audit=None,
    )
    work = (await restarted.summary("all"))["work"]
    assert work["reasoning_tokens"] == value
    assert work["reasoning_generations_reported"] == int(value is not None)
    assert work["reasoning_unknown_generations"] == int(value is None)
    totals = await restarted.totals()
    assert totals["output_tokens"] == 100
    assert totals["total_tokens"] == 421


@pytest.mark.parametrize("value", [None, 0, 37])
async def test_reasoning_alone_preserves_legacy_agent_output_estimates(tmp_path, value):
    saver = AgentTrajectorySaver(directory=str(tmp_path))
    agent = AgentInfo(
        id="legacy", label="reasoning", goal="finish",
        channel_id="channel", requester_id="user", requester_name="User",
    )
    await _run_agent(
        agent=agent, system_prompt="sys", tools=[],
        iteration_callback=AsyncMock(return_value={
            "text": "Done", "tool_calls": [], "reasoning_tokens": value,
            "input_tokens": 123, "output_tokens": 50,
        }),
        tool_executor_callback=AsyncMock(), trajectory_saver=saver,
    )
    persisted = await saver.find_by_agent_id(agent.id)
    row = persisted["iterations"][0]
    assert row["reasoning_tokens"] == value
    assert row["input_tokens"] == 123
    assert row["output_tokens"] == 50
