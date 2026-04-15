"""Tests for agent trajectory saving (Round 34).

Covers AgentTrajectoryTurn, AgentTrajectorySaver, _run_agent trajectory
integration, REST API endpoints, module exports, and edge cases.
"""
from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.trajectory import (
    DEFAULT_AGENT_TRAJECTORY_DIR,
    AgentTrajectorySaver,
    AgentTrajectoryTurn,
)
from src.agents.manager import (
    AgentInfo,
    AgentManager,
    AgentState,
    _run_agent,
)
from src.trajectories.saver import ToolIteration


# ---------------------------------------------------------------------------
# AgentTrajectoryTurn
# ---------------------------------------------------------------------------


class TestAgentTrajectoryTurn:
    def test_default_fields(self):
        turn = AgentTrajectoryTurn()
        assert turn.agent_id == ""
        assert turn.label == ""
        assert turn.goal == ""
        assert turn.channel_id == ""
        assert turn.source == "agent"
        assert turn.iterations == []
        assert turn.final_state == ""
        assert turn.tools_used == []

    def test_initialized_fields(self):
        turn = AgentTrajectoryTurn(
            agent_id="abc123",
            label="test-agent",
            goal="do stuff",
            channel_id="ch1",
            requester_id="user1",
            requester_name="Alice",
            system_prompt_length=500,
        )
        assert turn.agent_id == "abc123"
        assert turn.label == "test-agent"
        assert turn.goal == "do stuff"
        assert turn.channel_id == "ch1"
        assert turn.requester_id == "user1"
        assert turn.requester_name == "Alice"
        assert turn.system_prompt_length == 500

    def test_add_iteration(self):
        turn = AgentTrajectoryTurn(agent_id="a1")
        it = turn.add_iteration(
            iteration=1,
            tool_calls=[{"name": "run_command", "input": {"cmd": "ls"}}],
            tool_results=[{"name": "run_command", "result": "file.txt"}],
            llm_text="Let me check",
            duration_ms=150,
        )
        assert isinstance(it, ToolIteration)
        assert it.iteration == 1
        assert len(it.tool_calls) == 1
        assert it.llm_text == "Let me check"
        assert it.duration_ms == 150
        assert len(turn.iterations) == 1

    def test_add_multiple_iterations(self):
        turn = AgentTrajectoryTurn(agent_id="a1")
        turn.add_iteration(iteration=1, llm_text="first")
        turn.add_iteration(iteration=2, llm_text="second")
        turn.add_iteration(iteration=3, llm_text="done")
        assert len(turn.iterations) == 3
        assert turn.iterations[2].llm_text == "done"

    def test_add_iteration_defaults(self):
        turn = AgentTrajectoryTurn()
        it = turn.add_iteration(iteration=1)
        assert it.tool_calls == []
        assert it.tool_results == []
        assert it.llm_text == ""
        assert it.duration_ms == 0

    def test_finalize(self):
        turn = AgentTrajectoryTurn(agent_id="a1")
        turn.finalize(
            final_state="completed",
            result="All done",
            error="",
            tools_used=["run_command", "read_file"],
            iteration_count=3,
            recovery_attempts=1,
            state_history=[{"from": "spawning", "to": "ready"}],
            total_duration_ms=5000,
        )
        assert turn.final_state == "completed"
        assert turn.result == "All done"
        assert turn.tools_used == ["run_command", "read_file"]
        assert turn.iteration_count == 3
        assert turn.recovery_attempts == 1
        assert len(turn.state_history) == 1
        assert turn.total_duration_ms == 5000

    def test_finalize_defaults(self):
        turn = AgentTrajectoryTurn()
        turn.finalize(final_state="failed")
        assert turn.final_state == "failed"
        assert turn.result == ""
        assert turn.error == ""
        assert turn.tools_used == []
        assert turn.state_history == []

    def test_to_dict(self):
        turn = AgentTrajectoryTurn(
            agent_id="abc",
            label="my-agent",
            goal="test",
            channel_id="ch1",
            requester_id="u1",
            requester_name="Bob",
            system_prompt_length=200,
        )
        turn.add_iteration(
            iteration=1,
            tool_calls=[{"name": "t1", "input": {}}],
            tool_results=[{"name": "t1", "result": "ok"}],
            llm_text="text",
            duration_ms=100,
        )
        turn.finalize(
            final_state="completed",
            result="done",
            tools_used=["t1"],
            iteration_count=1,
            total_duration_ms=100,
        )
        d = turn.to_dict()
        assert d["agent_id"] == "abc"
        assert d["label"] == "my-agent"
        assert d["source"] == "agent"
        assert d["system_prompt_length"] == 200
        assert len(d["iterations"]) == 1
        assert d["iterations"][0]["tool_calls"] == [{"name": "t1", "input": {}}]
        assert d["final_state"] == "completed"
        assert d["result"] == "done"
        assert d["tools_used"] == ["t1"]
        assert d["iteration_count"] == 1
        assert d["total_duration_ms"] == 100

    def test_to_dict_serializable(self):
        turn = AgentTrajectoryTurn(agent_id="x")
        turn.finalize(final_state="failed", error="crash")
        d = turn.to_dict()
        serialized = json.dumps(d, default=str)
        assert "\"agent_id\": \"x\"" in serialized

    def test_to_dict_all_keys_present(self):
        turn = AgentTrajectoryTurn()
        d = turn.to_dict()
        expected_keys = {
            "agent_id", "label", "goal", "channel_id", "requester_id",
            "requester_name", "timestamp", "source", "system_prompt_length",
            "iterations", "final_state", "result", "error", "tools_used",
            "iteration_count", "total_duration_ms", "recovery_attempts",
            "state_history",
        }
        assert set(d.keys()) == expected_keys


# ---------------------------------------------------------------------------
# ToolIteration reuse
# ---------------------------------------------------------------------------


class TestToolIterationReuse:
    def test_tool_iteration_from_trajectories(self):
        it = ToolIteration(
            iteration=1,
            tool_calls=[{"name": "t"}],
            tool_results=[{"name": "t", "result": "r"}],
            llm_text="text",
            duration_ms=50,
        )
        assert it.iteration == 1
        assert it.llm_text == "text"

    def test_agent_trajectory_uses_same_type(self):
        turn = AgentTrajectoryTurn()
        it = turn.add_iteration(iteration=1)
        assert type(it).__name__ == "ToolIteration"


# ---------------------------------------------------------------------------
# AgentTrajectorySaver
# ---------------------------------------------------------------------------


class TestAgentTrajectorySaver:
    def test_init_creates_directory(self, tmp_path):
        d = str(tmp_path / "agent_traj")
        saver = AgentTrajectorySaver(directory=d)
        assert Path(d).exists()
        assert saver.count == 0

    def test_default_directory(self):
        assert DEFAULT_AGENT_TRAJECTORY_DIR == "./data/trajectories/agents"

    async def test_save_creates_file(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        turn = AgentTrajectoryTurn(agent_id="a1", label="test")
        turn.finalize(final_state="completed", result="ok")
        path = await saver.save(turn)
        assert path.exists()
        assert path.suffix == ".jsonl"
        assert saver.count == 1
        content = path.read_text()
        entry = json.loads(content.strip())
        assert entry["agent_id"] == "a1"
        assert entry["final_state"] == "completed"

    async def test_save_sets_timestamp(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        turn = AgentTrajectoryTurn(agent_id="a1")
        turn.finalize(final_state="completed")
        assert turn.timestamp == ""
        await saver.save(turn)
        assert turn.timestamp != ""

    async def test_save_preserves_existing_timestamp(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        turn = AgentTrajectoryTurn(agent_id="a1", timestamp="2026-01-01T00:00:00Z")
        turn.finalize(final_state="completed")
        await saver.save(turn)
        assert turn.timestamp == "2026-01-01T00:00:00Z"

    async def test_save_multiple(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        for i in range(3):
            turn = AgentTrajectoryTurn(agent_id=f"a{i}")
            turn.finalize(final_state="completed")
            await saver.save(turn)
        assert saver.count == 3

    async def test_save_appends(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        for i in range(2):
            turn = AgentTrajectoryTurn(agent_id=f"a{i}")
            turn.finalize(final_state="completed")
            await saver.save(turn)
        files = list(tmp_path.glob("*.jsonl"))
        assert len(files) == 1
        lines = files[0].read_text().strip().split("\n")
        assert len(lines) == 2


class TestAgentTrajectorySaverListFiles:
    async def test_list_empty(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        files = await saver.list_files()
        assert files == []

    async def test_list_after_save(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        turn = AgentTrajectoryTurn(agent_id="a1")
        turn.finalize(final_state="completed")
        await saver.save(turn)
        files = await saver.list_files()
        assert len(files) == 1
        assert files[0].endswith(".jsonl")

    async def test_list_ignores_non_jsonl(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        (tmp_path / "notes.txt").write_text("hi")
        files = await saver.list_files()
        assert files == []


class TestAgentTrajectorySaverReadFile:
    async def test_read_existing(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        turn = AgentTrajectoryTurn(agent_id="a1", label="test")
        turn.finalize(final_state="completed", result="done")
        await saver.save(turn)
        files = await saver.list_files()
        entries = await saver.read_file(files[0])
        assert len(entries) == 1
        assert entries[0]["agent_id"] == "a1"

    async def test_read_nonexistent(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        entries = await saver.read_file("nonexistent.jsonl")
        assert entries == []

    async def test_read_limit(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        for i in range(5):
            turn = AgentTrajectoryTurn(agent_id=f"a{i}")
            turn.finalize(final_state="completed")
            await saver.save(turn)
        files = await saver.list_files()
        entries = await saver.read_file(files[0], limit=2)
        assert len(entries) == 2

    async def test_read_returns_newest_first(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        for i in range(3):
            turn = AgentTrajectoryTurn(agent_id=f"a{i}")
            turn.finalize(final_state="completed")
            await saver.save(turn)
        files = await saver.list_files()
        entries = await saver.read_file(files[0])
        assert entries[0]["agent_id"] == "a2"
        assert entries[2]["agent_id"] == "a0"


class TestAgentTrajectorySaverFindByAgentId:
    async def test_find_existing(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        turn = AgentTrajectoryTurn(agent_id="abc123", label="finder")
        turn.finalize(final_state="completed", result="found")
        await saver.save(turn)
        entry = await saver.find_by_agent_id("abc123")
        assert entry is not None
        assert entry["agent_id"] == "abc123"
        assert entry["label"] == "finder"

    async def test_find_nonexistent(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        entry = await saver.find_by_agent_id("nonexistent")
        assert entry is None

    async def test_find_among_many(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        for i in range(5):
            turn = AgentTrajectoryTurn(agent_id=f"a{i}", label=f"agent-{i}")
            turn.finalize(final_state="completed")
            await saver.save(turn)
        entry = await saver.find_by_agent_id("a3")
        assert entry is not None
        assert entry["label"] == "agent-3"


class TestAgentTrajectorySaverSearch:
    async def test_search_by_channel(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        for ch in ["ch1", "ch2", "ch1"]:
            turn = AgentTrajectoryTurn(agent_id=ch, channel_id=ch)
            turn.finalize(final_state="completed")
            await saver.save(turn)
        results = await saver.search(channel_id="ch1")
        assert len(results) == 2

    async def test_search_by_requester(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        for uid in ["u1", "u2", "u1"]:
            turn = AgentTrajectoryTurn(agent_id=uid, requester_id=uid)
            turn.finalize(final_state="completed")
            await saver.save(turn)
        results = await saver.search(requester_id="u1")
        assert len(results) == 2

    async def test_search_by_tool(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        t1 = AgentTrajectoryTurn(agent_id="a1")
        t1.finalize(final_state="completed", tools_used=["run_command", "read_file"])
        await saver.save(t1)
        t2 = AgentTrajectoryTurn(agent_id="a2")
        t2.finalize(final_state="completed", tools_used=["read_file"])
        await saver.save(t2)
        results = await saver.search(tool_name="run_command")
        assert len(results) == 1
        assert results[0]["agent_id"] == "a1"

    async def test_search_by_state(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        for s in ["completed", "failed", "completed"]:
            turn = AgentTrajectoryTurn(agent_id=s)
            turn.finalize(final_state=s)
            await saver.save(turn)
        results = await saver.search(state="failed")
        assert len(results) == 1

    async def test_search_limit(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        for i in range(10):
            turn = AgentTrajectoryTurn(agent_id=f"a{i}")
            turn.finalize(final_state="completed")
            await saver.save(turn)
        results = await saver.search(limit=3)
        assert len(results) == 3

    async def test_search_empty(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        results = await saver.search()
        assert results == []

    async def test_search_combined_filters(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        t1 = AgentTrajectoryTurn(agent_id="a1", channel_id="ch1")
        t1.finalize(final_state="completed", tools_used=["run_command"])
        await saver.save(t1)
        t2 = AgentTrajectoryTurn(agent_id="a2", channel_id="ch1")
        t2.finalize(final_state="failed", tools_used=["run_command"])
        await saver.save(t2)
        results = await saver.search(channel_id="ch1", state="completed")
        assert len(results) == 1
        assert results[0]["agent_id"] == "a1"


class TestAgentTrajectorySaverMetrics:
    def test_prometheus_metrics(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        metrics = saver.get_prometheus_metrics()
        assert metrics == {"agent_trajectories_saved_total": 0}

    async def test_prometheus_metrics_after_saves(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        for i in range(3):
            turn = AgentTrajectoryTurn(agent_id=f"a{i}")
            turn.finalize(final_state="completed")
            await saver.save(turn)
        metrics = saver.get_prometheus_metrics()
        assert metrics == {"agent_trajectories_saved_total": 3}


# ---------------------------------------------------------------------------
# _run_agent trajectory integration
# ---------------------------------------------------------------------------


class TestRunAgentTrajectory:
    async def test_trajectory_saved_on_completion(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="t1", label="traj-test", goal="test goal",
            channel_id="ch1", requester_id="u1", requester_name="Alice",
        )
        cb = AsyncMock(return_value={"text": "Done", "tool_calls": []})
        tool_cb = AsyncMock(return_value="ok")

        await _run_agent(
            agent=agent,
            system_prompt="sys",
            tools=[],
            iteration_callback=cb,
            tool_executor_callback=tool_cb,
            trajectory_saver=saver,
        )

        assert saver.count == 1
        entry = await saver.find_by_agent_id("t1")
        assert entry is not None
        assert entry["label"] == "traj-test"
        assert entry["goal"] == "test goal"
        assert entry["final_state"] == "completed"
        assert entry["result"] == "Done"
        assert entry["source"] == "agent"

    async def test_trajectory_captures_iterations(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="t2", label="iter-test", goal="iterate",
            channel_id="ch1", requester_id="u1", requester_name="Bob",
        )
        call_count = 0

        async def iter_cb(messages, prompt, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {
                    "text": "Running command",
                    "tool_calls": [{"name": "run_command", "input": {"cmd": "ls"}}],
                }
            return {"text": "All done", "tool_calls": []}

        tool_cb = AsyncMock(return_value="file.txt")

        await _run_agent(
            agent=agent,
            system_prompt="sys",
            tools=[],
            iteration_callback=iter_cb,
            tool_executor_callback=tool_cb,
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("t2")
        assert entry is not None
        assert entry["iteration_count"] == 2
        assert len(entry["iterations"]) == 2
        # First iteration has tool calls
        it1 = entry["iterations"][0]
        assert it1["iteration"] == 1
        assert len(it1["tool_calls"]) == 1
        assert it1["tool_calls"][0]["name"] == "run_command"
        assert len(it1["tool_results"]) == 1
        assert it1["tool_results"][0]["result"] == "file.txt"
        assert it1["llm_text"] == "Running command"
        # Second iteration has no tool calls (completion)
        it2 = entry["iterations"][1]
        assert it2["iteration"] == 2
        assert it2["tool_calls"] == []
        assert it2["llm_text"] == "All done"

    async def test_trajectory_captures_tools_used(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="t3", label="tools-test", goal="use tools",
            channel_id="ch1", requester_id="u1", requester_name="C",
        )
        call_count = 0

        async def iter_cb(messages, prompt, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {
                    "text": "t",
                    "tool_calls": [
                        {"name": "run_command", "input": {}},
                        {"name": "read_file", "input": {}},
                    ],
                }
            return {"text": "done", "tool_calls": []}

        tool_cb = AsyncMock(return_value="ok")

        await _run_agent(
            agent=agent, system_prompt="s", tools=[],
            iteration_callback=iter_cb, tool_executor_callback=tool_cb,
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("t3")
        assert set(entry["tools_used"]) == {"run_command", "read_file"}

    async def test_trajectory_saved_on_failure(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="t4", label="fail-test", goal="fail",
            channel_id="ch1", requester_id="u1", requester_name="D",
        )

        async def iter_cb(messages, prompt, tools):
            raise RuntimeError("LLM down")

        await _run_agent(
            agent=agent, system_prompt="s", tools=[],
            iteration_callback=iter_cb,
            tool_executor_callback=AsyncMock(),
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("t4")
        assert entry is not None
        assert entry["final_state"] == "failed"
        assert "LLM down" in entry["error"]

    async def test_trajectory_saved_on_kill(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="t5", label="kill-test", goal="get killed",
            channel_id="ch1", requester_id="u1", requester_name="E",
        )
        agent._cancel_event.set()

        await _run_agent(
            agent=agent, system_prompt="s", tools=[],
            iteration_callback=AsyncMock(),
            tool_executor_callback=AsyncMock(),
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("t5")
        assert entry is not None
        assert entry["final_state"] == "killed"

    async def test_trajectory_saved_on_timeout(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="t6", label="timeout-test", goal="timeout",
            channel_id="ch1", requester_id="u1", requester_name="F",
        )
        agent.created_at = time.time() - 7200  # 2 hours ago

        await _run_agent(
            agent=agent, system_prompt="s", tools=[],
            iteration_callback=AsyncMock(),
            tool_executor_callback=AsyncMock(),
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("t6")
        assert entry is not None
        assert entry["final_state"] == "timeout"

    async def test_trajectory_has_state_history(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="t7", label="state-hist", goal="check state history",
            channel_id="ch1", requester_id="u1", requester_name="G",
        )
        cb = AsyncMock(return_value={"text": "done", "tool_calls": []})

        await _run_agent(
            agent=agent, system_prompt="s", tools=[],
            iteration_callback=cb,
            tool_executor_callback=AsyncMock(),
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("t7")
        history = entry["state_history"]
        assert len(history) >= 3
        assert history[0]["from"] == "spawning"
        assert history[0]["to"] == "ready"

    async def test_trajectory_records_duration(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="t8", label="dur-test", goal="duration",
            channel_id="ch1", requester_id="u1", requester_name="H",
        )
        cb = AsyncMock(return_value={"text": "done", "tool_calls": []})

        await _run_agent(
            agent=agent, system_prompt="s", tools=[],
            iteration_callback=cb,
            tool_executor_callback=AsyncMock(),
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("t8")
        assert entry["total_duration_ms"] >= 0
        assert entry["iterations"][0]["duration_ms"] >= 0

    async def test_trajectory_records_system_prompt_length(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="t9", label="prompt-len", goal="prompt",
            channel_id="ch1", requester_id="u1", requester_name="I",
        )
        prompt = "You are a test agent." * 10
        cb = AsyncMock(return_value={"text": "ok", "tool_calls": []})

        await _run_agent(
            agent=agent, system_prompt=prompt, tools=[],
            iteration_callback=cb,
            tool_executor_callback=AsyncMock(),
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("t9")
        assert entry["system_prompt_length"] == len(prompt)

    async def test_no_saver_no_error(self):
        agent = AgentInfo(
            id="t10", label="no-saver", goal="no saver",
            channel_id="ch1", requester_id="u1", requester_name="J",
        )
        cb = AsyncMock(return_value={"text": "ok", "tool_calls": []})

        await _run_agent(
            agent=agent, system_prompt="s", tools=[],
            iteration_callback=cb,
            tool_executor_callback=AsyncMock(),
            trajectory_saver=None,
        )
        assert agent.state == AgentState.COMPLETED

    async def test_trajectory_save_error_does_not_crash(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="t11", label="save-err", goal="test save error",
            channel_id="ch1", requester_id="u1", requester_name="K",
        )
        cb = AsyncMock(return_value={"text": "ok", "tool_calls": []})

        with patch.object(saver, "save", side_effect=OSError("disk full")):
            await _run_agent(
                agent=agent, system_prompt="s", tools=[],
                iteration_callback=cb,
                tool_executor_callback=AsyncMock(),
                trajectory_saver=saver,
            )
        assert agent.state == AgentState.COMPLETED

    async def test_trajectory_recovery_attempts(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="t12", label="recovery", goal="test recovery tracking",
            channel_id="ch1", requester_id="u1", requester_name="L",
        )
        call_count = 0

        async def iter_cb(messages, prompt, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise TimeoutError("LLM timeout")
            return {"text": "recovered", "tool_calls": []}

        await _run_agent(
            agent=agent, system_prompt="s", tools=[],
            iteration_callback=iter_cb,
            tool_executor_callback=AsyncMock(),
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("t12")
        assert entry is not None
        assert entry["recovery_attempts"] >= 1

    async def test_trajectory_tool_error_recorded(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="t13", label="tool-err", goal="tool error",
            channel_id="ch1", requester_id="u1", requester_name="M",
        )
        call_count = 0

        async def iter_cb(messages, prompt, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {
                    "text": "run it",
                    "tool_calls": [{"name": "run_command", "input": {"cmd": "fail"}}],
                }
            return {"text": "done", "tool_calls": []}

        async def tool_cb(name, inp):
            raise RuntimeError("tool crashed")

        await _run_agent(
            agent=agent, system_prompt="s", tools=[],
            iteration_callback=iter_cb,
            tool_executor_callback=tool_cb,
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("t13")
        it1 = entry["iterations"][0]
        assert "Error:" in it1["tool_results"][0]["result"]


# ---------------------------------------------------------------------------
# AgentManager.spawn with trajectory_saver
# ---------------------------------------------------------------------------


class TestAgentManagerTrajectory:
    async def test_spawn_with_trajectory_saver(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        mgr = AgentManager()
        cb = AsyncMock(return_value={"text": "done", "tool_calls": []})
        tool_cb = AsyncMock(return_value="ok")

        agent_id = mgr.spawn(
            label="mgr-traj",
            goal="test spawn trajectory",
            channel_id="ch1",
            requester_id="u1",
            requester_name="Alice",
            iteration_callback=cb,
            tool_executor_callback=tool_cb,
            trajectory_saver=saver,
        )
        assert not agent_id.startswith("Error")

        await asyncio.sleep(0.2)
        entry = await saver.find_by_agent_id(agent_id)
        assert entry is not None
        assert entry["final_state"] == "completed"

    async def test_spawn_without_trajectory_saver(self):
        mgr = AgentManager()
        cb = AsyncMock(return_value={"text": "done", "tool_calls": []})
        tool_cb = AsyncMock(return_value="ok")

        agent_id = mgr.spawn(
            label="no-traj",
            goal="test no trajectory",
            channel_id="ch1",
            requester_id="u1",
            requester_name="Bob",
            iteration_callback=cb,
            tool_executor_callback=tool_cb,
        )
        assert not agent_id.startswith("Error")
        await asyncio.sleep(0.2)
        results = mgr.get_results(agent_id)
        assert results["status"] == "completed"


# ---------------------------------------------------------------------------
# REST API endpoints
# ---------------------------------------------------------------------------


class TestAgentTrajectoryAPI:
    def _make_bot(self, saver=None):
        bot = MagicMock()
        if saver:
            bot.agent_trajectory_saver = saver
        else:
            del bot.agent_trajectory_saver
        return bot

    async def test_list_no_saver(self):
        from src.web.api import create_api_routes
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer

        bot = self._make_bot()
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/agent-trajectories")
            assert resp.status == 503

    async def test_list_with_saver(self, tmp_path):
        from src.web.api import create_api_routes
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer

        saver = AgentTrajectorySaver(directory=str(tmp_path))
        turn = AgentTrajectoryTurn(agent_id="a1")
        turn.finalize(final_state="completed")
        await saver.save(turn)

        bot = self._make_bot(saver)
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/agent-trajectories")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1
            assert len(data["files"]) == 1

    async def test_find_by_agent_id(self, tmp_path):
        from src.web.api import create_api_routes
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer

        saver = AgentTrajectorySaver(directory=str(tmp_path))
        turn = AgentTrajectoryTurn(agent_id="abc123", label="finder")
        turn.finalize(final_state="completed", result="found it")
        await saver.save(turn)

        bot = self._make_bot(saver)
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/agent-trajectories/agent/abc123")
            assert resp.status == 200
            data = await resp.json()
            assert data["entry"]["agent_id"] == "abc123"

    async def test_find_agent_not_found(self, tmp_path):
        from src.web.api import create_api_routes
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer

        saver = AgentTrajectorySaver(directory=str(tmp_path))
        bot = self._make_bot(saver)
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/agent-trajectories/agent/nonexistent")
            assert resp.status == 404

    async def test_search_endpoint(self, tmp_path):
        from src.web.api import create_api_routes
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer

        saver = AgentTrajectorySaver(directory=str(tmp_path))
        for ch in ["ch1", "ch2"]:
            turn = AgentTrajectoryTurn(agent_id=ch, channel_id=ch)
            turn.finalize(final_state="completed")
            await saver.save(turn)

        bot = self._make_bot(saver)
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/agent-trajectories/search/query?channel_id=ch1")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1
            assert data["results"][0]["channel_id"] == "ch1"

    async def test_search_no_saver(self):
        from src.web.api import create_api_routes
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer

        bot = self._make_bot()
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/agent-trajectories/search/query")
            assert resp.status == 503

    async def test_read_file_endpoint(self, tmp_path):
        from src.web.api import create_api_routes
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer

        saver = AgentTrajectorySaver(directory=str(tmp_path))
        turn = AgentTrajectoryTurn(agent_id="a1")
        turn.finalize(final_state="completed")
        await saver.save(turn)
        files = await saver.list_files()

        bot = self._make_bot(saver)
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get(f"/api/agent-trajectories/{files[0]}")
            assert resp.status == 200
            data = await resp.json()
            assert data["count"] == 1

    async def test_read_file_invalid_name(self, tmp_path):
        from src.web.api import create_api_routes
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer

        saver = AgentTrajectorySaver(directory=str(tmp_path))
        bot = self._make_bot(saver)
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/agent-trajectories/bad.txt")
            assert resp.status == 400

    async def test_read_file_no_saver(self):
        from src.web.api import create_api_routes
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer

        bot = self._make_bot()
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/agent-trajectories/2026-04-15.jsonl")
            assert resp.status == 503


# ---------------------------------------------------------------------------
# Module exports
# ---------------------------------------------------------------------------


class TestModuleExports:
    def test_trajectory_module_exports(self):
        from src.agents import trajectory
        assert hasattr(trajectory, "AgentTrajectorySaver")
        assert hasattr(trajectory, "AgentTrajectoryTurn")
        assert hasattr(trajectory, "DEFAULT_AGENT_TRAJECTORY_DIR")

    def test_agents_init_exports(self):
        from src.agents import AgentTrajectorySaver, AgentTrajectoryTurn
        assert AgentTrajectorySaver is not None
        assert AgentTrajectoryTurn is not None

    def test_tool_iteration_reexported(self):
        from src.agents.trajectory import AgentTrajectoryTurn
        from src.trajectories.saver import ToolIteration
        turn = AgentTrajectoryTurn()
        it = turn.add_iteration(iteration=1)
        assert isinstance(it, ToolIteration)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    async def test_empty_iterations(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        turn = AgentTrajectoryTurn(agent_id="e1")
        turn.finalize(final_state="killed")
        await saver.save(turn)
        entry = await saver.find_by_agent_id("e1")
        assert entry["iterations"] == []
        assert entry["iteration_count"] == 0

    async def test_large_result_saved(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        turn = AgentTrajectoryTurn(agent_id="e2")
        turn.finalize(final_state="completed", result="x" * 50000)
        await saver.save(turn)
        entry = await saver.find_by_agent_id("e2")
        assert len(entry["result"]) == 50000

    async def test_unicode_content(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        turn = AgentTrajectoryTurn(agent_id="e3", goal="日本語テスト")
        turn.finalize(final_state="completed", result="成功 🎉")
        await saver.save(turn)
        entry = await saver.find_by_agent_id("e3")
        assert entry["goal"] == "日本語テスト"
        assert "成功" in entry["result"]

    async def test_concurrent_saves(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))

        async def save_one(i):
            turn = AgentTrajectoryTurn(agent_id=f"c{i}")
            turn.finalize(final_state="completed")
            await saver.save(turn)

        await asyncio.gather(*[save_one(i) for i in range(10)])
        assert saver.count == 10

    def test_trajectory_turn_separate_instances(self):
        t1 = AgentTrajectoryTurn(agent_id="a")
        t2 = AgentTrajectoryTurn(agent_id="b")
        t1.add_iteration(iteration=1)
        assert len(t1.iterations) == 1
        assert len(t2.iterations) == 0

    async def test_max_iterations_trajectory(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="e4", label="max-iter", goal="exhaust iterations",
            channel_id="ch1", requester_id="u1", requester_name="Max",
        )

        async def iter_cb(messages, prompt, tools):
            return {
                "text": "more work",
                "tool_calls": [{"name": "run_command", "input": {"cmd": "echo hi"}}],
            }

        tool_cb = AsyncMock(return_value="hi")

        await _run_agent(
            agent=agent, system_prompt="s", tools=[],
            iteration_callback=iter_cb,
            tool_executor_callback=tool_cb,
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("e4")
        assert entry is not None
        assert entry["final_state"] == "completed"
        assert entry["iteration_count"] == 30
        assert len(entry["iterations"]) == 30

    async def test_cancelled_agent_trajectory(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="e5", label="cancel", goal="get cancelled",
            channel_id="ch1", requester_id="u1", requester_name="Cancel",
        )

        async def iter_cb(messages, prompt, tools):
            raise asyncio.CancelledError()

        await _run_agent(
            agent=agent, system_prompt="s", tools=[],
            iteration_callback=iter_cb,
            tool_executor_callback=AsyncMock(),
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("e5")
        assert entry is not None
        assert entry["final_state"] == "killed"

    async def test_multiple_tool_calls_per_iteration(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        agent = AgentInfo(
            id="e6", label="multi-tool", goal="call many tools",
            channel_id="ch1", requester_id="u1", requester_name="Multi",
        )
        call_count = 0

        async def iter_cb(messages, prompt, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {
                    "text": "checking",
                    "tool_calls": [
                        {"name": "run_command", "input": {"cmd": "ls"}},
                        {"name": "read_file", "input": {"path": "/tmp/x"}},
                        {"name": "write_file", "input": {"path": "/tmp/y", "content": "z"}},
                    ],
                }
            return {"text": "done", "tool_calls": []}

        tool_cb = AsyncMock(return_value="ok")

        await _run_agent(
            agent=agent, system_prompt="s", tools=[],
            iteration_callback=iter_cb,
            tool_executor_callback=tool_cb,
            trajectory_saver=saver,
        )

        entry = await saver.find_by_agent_id("e6")
        it1 = entry["iterations"][0]
        assert len(it1["tool_calls"]) == 3
        assert len(it1["tool_results"]) == 3
        assert it1["tool_calls"][0]["name"] == "run_command"
        assert it1["tool_calls"][2]["name"] == "write_file"

    async def test_saver_directory_deleted(self, tmp_path):
        d = tmp_path / "gone"
        d.mkdir()
        saver = AgentTrajectorySaver(directory=str(d))
        import shutil
        shutil.rmtree(d)
        files = await saver.list_files()
        assert files == []

    async def test_read_file_with_bad_json(self, tmp_path):
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        bad_file = tmp_path / "bad.jsonl"
        bad_file.write_text('{"agent_id": "a1"}\nnot json\n{"agent_id": "a2"}\n')
        entries = await saver.read_file("bad.jsonl")
        assert len(entries) == 2
        assert entries[0]["agent_id"] == "a2"
        assert entries[1]["agent_id"] == "a1"
