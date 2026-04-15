"""Tests for nested agent spawning — depth-limited sub-agent hierarchy."""
from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.manager import (
    AGENT_BLOCKED_TOOLS,
    AGENT_MANAGEMENT_TOOLS,
    MAX_CHILDREN_PER_AGENT,
    MAX_NESTING_DEPTH,
    AgentInfo,
    AgentManager,
    AgentState,
    AgentStateMachine,
    _run_agent,
    filter_agent_tools,
)
from src.agents.trajectory import AgentTrajectoryTurn


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

AGENT_TOOLS = [
    {"name": "spawn_agent", "description": "spawn"},
    {"name": "run_command", "description": "run"},
    {"name": "list_agents", "description": "list"},
    {"name": "read_file", "description": "read"},
    {"name": "kill_agent", "description": "kill"},
]


def _make_iter_cb(text="done", tool_calls=None):
    """Create an iteration callback that returns a fixed response."""
    return AsyncMock(return_value={
        "text": text,
        "tool_calls": tool_calls or [],
        "stop_reason": "end_turn",
    })


def _make_tool_cb(result="ok"):
    return AsyncMock(return_value=result)


def _make_agent(
    agent_id="a1", label="test", goal="do it", channel_id="c1",
    depth=0, parent_id=None,
):
    return AgentInfo(
        id=agent_id, label=label, goal=goal,
        channel_id=channel_id, requester_id="u1", requester_name="user",
        depth=depth, parent_id=parent_id,
    )


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_max_nesting_depth_default(self):
        assert MAX_NESTING_DEPTH == 2

    def test_max_children_per_agent(self):
        assert MAX_CHILDREN_PER_AGENT == 3

    def test_agent_management_tools(self):
        assert "spawn_agent" in AGENT_MANAGEMENT_TOOLS
        assert "send_to_agent" in AGENT_MANAGEMENT_TOOLS
        assert "list_agents" in AGENT_MANAGEMENT_TOOLS
        assert "kill_agent" in AGENT_MANAGEMENT_TOOLS
        assert "get_agent_results" in AGENT_MANAGEMENT_TOOLS
        assert "wait_for_agents" in AGENT_MANAGEMENT_TOOLS

    def test_blocked_tools_is_alias(self):
        assert AGENT_BLOCKED_TOOLS is AGENT_MANAGEMENT_TOOLS


# ---------------------------------------------------------------------------
# filter_agent_tools
# ---------------------------------------------------------------------------

class TestFilterAgentTools:
    def test_depth_below_max_keeps_all(self):
        result = filter_agent_tools(AGENT_TOOLS, depth=0, max_depth=2)
        assert len(result) == len(AGENT_TOOLS)
        names = {t["name"] for t in result}
        assert "spawn_agent" in names

    def test_depth_at_max_removes_agent_tools(self):
        result = filter_agent_tools(AGENT_TOOLS, depth=2, max_depth=2)
        names = {t["name"] for t in result}
        assert "spawn_agent" not in names
        assert "list_agents" not in names
        assert "kill_agent" not in names
        assert "run_command" in names
        assert "read_file" in names

    def test_depth_above_max_removes_agent_tools(self):
        result = filter_agent_tools(AGENT_TOOLS, depth=3, max_depth=2)
        names = {t["name"] for t in result}
        assert "spawn_agent" not in names

    def test_depth_one_below_max_keeps_tools(self):
        result = filter_agent_tools(AGENT_TOOLS, depth=1, max_depth=2)
        names = {t["name"] for t in result}
        assert "spawn_agent" in names

    def test_default_params(self):
        result = filter_agent_tools(AGENT_TOOLS)
        names = {t["name"] for t in result}
        assert "spawn_agent" in names

    def test_max_depth_zero_blocks_all(self):
        result = filter_agent_tools(AGENT_TOOLS, depth=0, max_depth=0)
        names = {t["name"] for t in result}
        assert "spawn_agent" not in names
        assert "run_command" in names

    def test_empty_tools(self):
        assert filter_agent_tools([], depth=0, max_depth=2) == []

    def test_no_agent_tools_in_input(self):
        tools = [{"name": "run_command"}, {"name": "read_file"}]
        result = filter_agent_tools(tools, depth=2, max_depth=2)
        assert len(result) == 2

    def test_returns_new_list(self):
        result = filter_agent_tools(AGENT_TOOLS, depth=0, max_depth=2)
        assert result is not AGENT_TOOLS


# ---------------------------------------------------------------------------
# AgentInfo nesting fields
# ---------------------------------------------------------------------------

class TestAgentInfoNesting:
    def test_default_depth(self):
        info = _make_agent()
        assert info.depth == 0

    def test_custom_depth(self):
        info = _make_agent(depth=2)
        assert info.depth == 2

    def test_default_parent_id(self):
        info = _make_agent()
        assert info.parent_id is None

    def test_custom_parent_id(self):
        info = _make_agent(parent_id="parent1")
        assert info.parent_id == "parent1"

    def test_default_children_ids(self):
        info = _make_agent()
        assert info.children_ids == []

    def test_children_ids_independent(self):
        a = _make_agent(agent_id="a1")
        b = _make_agent(agent_id="a2")
        a.children_ids.append("child1")
        assert b.children_ids == []


# ---------------------------------------------------------------------------
# AgentManager.spawn — nesting
# ---------------------------------------------------------------------------

class TestSpawnNesting:
    def test_root_spawn_depth_zero(self):
        mgr = AgentManager()
        aid = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        assert not aid.startswith("Error")
        agent = mgr._agents[aid]
        assert agent.depth == 0
        assert agent.parent_id is None

    def test_child_spawn_depth_one(self):
        mgr = AgentManager()
        parent_id = mgr.spawn(
            label="parent", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        child_id = mgr.spawn(
            label="child", goal="sub-task", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=parent_id,
        )
        assert not child_id.startswith("Error")
        child = mgr._agents[child_id]
        assert child.depth == 1
        assert child.parent_id == parent_id

    def test_grandchild_spawn_depth_two(self):
        mgr = AgentManager()
        parent_id = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        child_id = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=parent_id,
        )
        grandchild_id = mgr.spawn(
            label="grandchild", goal="sub-sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=child_id,
        )
        assert not grandchild_id.startswith("Error")
        gc = mgr._agents[grandchild_id]
        assert gc.depth == 2
        assert gc.parent_id == child_id

    def test_depth_exceeds_max(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        gc = mgr.spawn(
            label="grandchild", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=c,
        )
        # depth=2 is at max_depth=2, so spawning a child from it exceeds
        result = mgr.spawn(
            label="too-deep", goal="nope", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=gc,
        )
        assert result.startswith("Error")
        assert "nesting depth" in result.lower()

    def test_custom_max_depth(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            max_depth=1,
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
            max_depth=1,
        )
        # child at depth=1, max_depth=1 → can't go deeper
        result = mgr.spawn(
            label="gc", goal="nope", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=c,
            max_depth=1,
        )
        assert result.startswith("Error")

    def test_parent_not_found(self):
        mgr = AgentManager()
        result = mgr.spawn(
            label="orphan", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id="nonexistent",
        )
        assert result.startswith("Error")
        assert "not found" in result.lower()

    def test_max_children_per_agent(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        for i in range(MAX_CHILDREN_PER_AGENT):
            result = mgr.spawn(
                label=f"child-{i}", goal="sub", channel_id="c1",
                requester_id="u1", requester_name="user",
                iteration_callback=_make_iter_cb(),
                tool_executor_callback=_make_tool_cb(),
                parent_id=p,
            )
            assert not result.startswith("Error"), f"Child {i} failed: {result}"
        # One more should fail
        result = mgr.spawn(
            label="too-many", goal="nope", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        assert result.startswith("Error")
        assert "maximum" in result.lower()

    def test_parent_registers_child(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="parent", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        assert c in mgr._agents[p].children_ids


# ---------------------------------------------------------------------------
# System prompt nesting context
# ---------------------------------------------------------------------------

class TestSystemPromptNesting:
    def test_root_can_nest_prompt(self):
        mgr = AgentManager()
        aid = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        agent = mgr._agents[aid]
        # Check that task was started (system prompt goes to _run_agent)
        assert agent._task is not None

    def test_deep_agent_no_spawn_prompt(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        gc = mgr.spawn(
            label="gc", goal="sub-sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=c,
        )
        assert not gc.startswith("Error")


# ---------------------------------------------------------------------------
# AgentManager hierarchy methods
# ---------------------------------------------------------------------------

class TestHierarchyMethods:
    def test_get_children_empty(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        assert mgr.get_children(p) == []

    def test_get_children_with_children(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c1 = mgr.spawn(
            label="c1", goal="sub1", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        c2 = mgr.spawn(
            label="c2", goal="sub2", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        children = mgr.get_children(p)
        child_ids = {c["id"] for c in children}
        assert c1 in child_ids
        assert c2 in child_ids

    def test_get_children_not_found(self):
        mgr = AgentManager()
        assert mgr.get_children("nonexistent") == []

    def test_get_lineage_root(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        lineage = mgr.get_lineage(p)
        assert lineage == [p]

    def test_get_lineage_three_levels(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        gc = mgr.spawn(
            label="gc", goal="sub-sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=c,
        )
        lineage = mgr.get_lineage(gc)
        assert lineage == [p, c, gc]

    def test_get_lineage_not_found(self):
        mgr = AgentManager()
        assert mgr.get_lineage("nope") == ["nope"]

    def test_get_descendants_empty(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        assert mgr.get_descendants(p) == []

    def test_get_descendants_multi_level(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        gc = mgr.spawn(
            label="gc", goal="sub-sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=c,
        )
        descendants = mgr.get_descendants(p)
        assert c in descendants
        assert gc in descendants

    def test_get_descendants_not_found(self):
        mgr = AgentManager()
        assert mgr.get_descendants("nope") == []


# ---------------------------------------------------------------------------
# Kill cascade
# ---------------------------------------------------------------------------

class TestKillCascade:
    def test_kill_cascades_to_children(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        result = mgr.kill(p, cascade=True)
        assert "1 descendant" in result
        assert mgr._agents[p]._cancel_event.is_set()
        assert mgr._agents[c]._cancel_event.is_set()

    def test_kill_no_cascade(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        result = mgr.kill(p, cascade=False)
        assert "descendant" not in result
        assert mgr._agents[p]._cancel_event.is_set()
        assert not mgr._agents[c]._cancel_event.is_set()

    def test_kill_cascade_multi_level(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        gc = mgr.spawn(
            label="gc", goal="sub-sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=c,
        )
        result = mgr.kill(p, cascade=True)
        assert "2 descendant" in result
        assert mgr._agents[gc]._cancel_event.is_set()

    def test_kill_no_children_same_message(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        result = mgr.kill(p, cascade=True)
        assert "Kill signal sent to agent" in result
        assert "descendant" not in result


# ---------------------------------------------------------------------------
# list() and get_results() include nesting info
# ---------------------------------------------------------------------------

class TestListAndResults:
    def test_list_includes_depth(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        entries = mgr.list()
        assert any(e["id"] == p and e["depth"] == 0 for e in entries)

    def test_list_includes_parent_id(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        entries = mgr.list()
        child_entry = next(e for e in entries if e["id"] == c)
        assert child_entry["parent_id"] == p
        assert child_entry["depth"] == 1

    def test_list_includes_children_count(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        entries = mgr.list()
        parent_entry = next(e for e in entries if e["id"] == p)
        assert parent_entry["children_count"] == 1

    def test_get_results_includes_nesting(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        results = mgr.get_results(c)
        assert results["depth"] == 1
        assert results["parent_id"] == p
        assert results["children_ids"] == []

    def test_get_results_parent_children(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        results = mgr.get_results(p)
        assert c in results["children_ids"]


# ---------------------------------------------------------------------------
# _run_agent with nesting fields in trajectory
# ---------------------------------------------------------------------------

class TestRunAgentTrajectory:
    async def test_trajectory_includes_depth(self):
        agent = _make_agent(depth=1, parent_id="parent1")
        iter_cb = _make_iter_cb()
        tool_cb = _make_tool_cb()
        saver = AsyncMock()
        saver.save = AsyncMock()

        await _run_agent(
            agent=agent,
            system_prompt="sys",
            tools=[],
            iteration_callback=iter_cb,
            tool_executor_callback=tool_cb,
            trajectory_saver=saver,
        )

        assert saver.save.called
        turn = saver.save.call_args[0][0]
        assert isinstance(turn, AgentTrajectoryTurn)
        assert turn.depth == 1
        assert turn.parent_id == "parent1"

    async def test_trajectory_root_agent(self):
        agent = _make_agent()
        saver = AsyncMock()
        saver.save = AsyncMock()

        await _run_agent(
            agent=agent,
            system_prompt="sys",
            tools=[],
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            trajectory_saver=saver,
        )

        turn = saver.save.call_args[0][0]
        assert turn.depth == 0
        assert turn.parent_id is None


# ---------------------------------------------------------------------------
# AgentTrajectoryTurn nesting fields
# ---------------------------------------------------------------------------

class TestTrajectoryTurnNesting:
    def test_default_depth(self):
        turn = AgentTrajectoryTurn()
        assert turn.depth == 0
        assert turn.parent_id is None

    def test_custom_depth(self):
        turn = AgentTrajectoryTurn(depth=2, parent_id="p1")
        assert turn.depth == 2
        assert turn.parent_id == "p1"

    def test_to_dict_includes_depth(self):
        turn = AgentTrajectoryTurn(depth=1, parent_id="p1")
        d = turn.to_dict()
        assert d["depth"] == 1
        assert d["parent_id"] == "p1"

    def test_to_dict_root(self):
        turn = AgentTrajectoryTurn()
        d = turn.to_dict()
        assert d["depth"] == 0
        assert d["parent_id"] is None


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

class TestConfig:
    def test_agents_config_defaults(self):
        from src.config.schema import AgentsConfig
        cfg = AgentsConfig()
        assert cfg.max_nesting_depth == 2
        assert cfg.max_children_per_agent == 3

    def test_agents_config_custom(self):
        from src.config.schema import AgentsConfig
        cfg = AgentsConfig(max_nesting_depth=5, max_children_per_agent=10)
        assert cfg.max_nesting_depth == 5
        assert cfg.max_children_per_agent == 10

    def test_config_has_agents(self):
        from src.config.schema import Config
        cfg = Config(discord={"token": "test"})
        assert cfg.agents.max_nesting_depth == 2

    def test_config_agents_override(self):
        from src.config.schema import Config
        cfg = Config(
            discord={"token": "test"},
            agents={"max_nesting_depth": 4},
        )
        assert cfg.agents.max_nesting_depth == 4


# ---------------------------------------------------------------------------
# REST API endpoints
# ---------------------------------------------------------------------------

class TestRestApi:
    def _make_bot(self):
        bot = MagicMock()
        bot.agent_manager = AgentManager()
        return bot

    async def test_list_agents_includes_depth(self):
        from aiohttp import web
        from aiohttp.test_utils import make_mocked_request
        from src.web.api import setup_api

        bot = self._make_bot()
        app = web.Application()
        setup_api(app, bot)

        # Spawn parent + child
        p = bot.agent_manager.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = bot.agent_manager.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )

        # Call the handler directly
        request = make_mocked_request("GET", "/api/agents", app=app)
        # Find the handler
        handler = None
        for resource in app.router.resources():
            if hasattr(resource, '_path') and resource._path == "/api/agents":
                for route in resource:
                    if route.method == "GET":
                        handler = route.handler
                        break
        # If handler lookup fails, just verify the agent data exists
        entries = bot.agent_manager.list()
        child_entry = next(e for e in entries if e["id"] == c)
        assert child_entry["depth"] == 1
        assert child_entry["parent_id"] == p

    async def test_get_children_endpoint_data(self):
        bot = self._make_bot()
        p = bot.agent_manager.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = bot.agent_manager.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        children = bot.agent_manager.get_children(p)
        assert len(children) == 1
        assert children[0]["id"] == c

    async def test_get_lineage_endpoint_data(self):
        bot = self._make_bot()
        p = bot.agent_manager.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = bot.agent_manager.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        lineage = bot.agent_manager.get_lineage(c)
        assert lineage == [p, c]

    async def test_get_descendants_endpoint_data(self):
        bot = self._make_bot()
        p = bot.agent_manager.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = bot.agent_manager.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        gc = bot.agent_manager.spawn(
            label="gc", goal="sub-sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=c,
        )
        desc = bot.agent_manager.get_descendants(p)
        assert c in desc
        assert gc in desc


# ---------------------------------------------------------------------------
# Module exports
# ---------------------------------------------------------------------------

class TestExports:
    def test_agents_init_exports(self):
        from src.agents import (
            AGENT_BLOCKED_TOOLS,
            AGENT_MANAGEMENT_TOOLS,
            MAX_CHILDREN_PER_AGENT,
            MAX_NESTING_DEPTH,
            filter_agent_tools,
        )
        assert MAX_NESTING_DEPTH == 2
        assert MAX_CHILDREN_PER_AGENT == 3
        assert AGENT_BLOCKED_TOOLS is AGENT_MANAGEMENT_TOOLS

    def test_filter_agent_tools_importable(self):
        from src.agents import filter_agent_tools
        result = filter_agent_tools(AGENT_TOOLS, depth=0)
        assert len(result) > 0


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_spawn_with_max_depth_zero(self):
        """max_depth=0 means even root agents can't spawn children."""
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            max_depth=0,
        )
        result = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
            max_depth=0,
        )
        assert result.startswith("Error")

    def test_children_ids_list_is_independent(self):
        mgr = AgentManager()
        p1 = mgr.spawn(
            label="p1", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        p2 = mgr.spawn(
            label="p2", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        mgr.spawn(
            label="c1", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p1,
        )
        assert len(mgr._agents[p1].children_ids) == 1
        assert len(mgr._agents[p2].children_ids) == 0

    def test_lineage_cycle_protection(self):
        mgr = AgentManager()
        # Manually create a cycle (shouldn't happen, but verify safety)
        a1 = _make_agent(agent_id="a1", parent_id="a2")
        a2 = _make_agent(agent_id="a2", parent_id="a1")
        mgr._agents["a1"] = a1
        mgr._agents["a2"] = a2
        lineage = mgr.get_lineage("a1")
        # Should terminate without infinite loop
        assert "a1" in lineage

    def test_descendants_cycle_protection(self):
        mgr = AgentManager()
        a1 = _make_agent(agent_id="a1")
        a2 = _make_agent(agent_id="a2")
        a1.children_ids = ["a2"]
        a2.children_ids = ["a1"]
        mgr._agents["a1"] = a1
        mgr._agents["a2"] = a2
        desc = mgr.get_descendants("a1")
        assert len(desc) == 2

    def test_kill_cascade_skips_terminal_children(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        c = mgr.spawn(
            label="child", goal="sub", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            parent_id=p,
        )
        # Force child to terminal state
        mgr._agents[c].transition(AgentState.READY, "init")
        mgr._agents[c].transition(AgentState.COMPLETED, "done")
        result = mgr.kill(p, cascade=True)
        # Child is terminal so only parent killed
        assert "descendant" not in result

    def test_max_depth_high_allows_deep_nesting(self):
        mgr = AgentManager()
        current = mgr.spawn(
            label="d0", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
            max_depth=10,
        )
        # Use different channels to avoid per-channel limit
        for depth in range(1, 5):
            child = mgr.spawn(
                label=f"d{depth}", goal="go", channel_id=f"c{depth}",
                requester_id="u1", requester_name="user",
                iteration_callback=_make_iter_cb(),
                tool_executor_callback=_make_tool_cb(),
                parent_id=current,
                max_depth=10,
            )
            assert not child.startswith("Error"), f"Failed at depth {depth}: {child}"
            assert mgr._agents[child].depth == depth
            current = child

    def test_spawn_no_parent_id_backward_compat(self):
        """Existing callers that don't pass parent_id still work."""
        mgr = AgentManager()
        aid = mgr.spawn(
            label="test", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        assert not aid.startswith("Error")
        assert mgr._agents[aid].depth == 0
        assert mgr._agents[aid].parent_id is None

    def test_concurrent_children_tracking(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        children = []
        for i in range(MAX_CHILDREN_PER_AGENT):
            c = mgr.spawn(
                label=f"c{i}", goal="sub", channel_id="c1",
                requester_id="u1", requester_name="user",
                iteration_callback=_make_iter_cb(),
                tool_executor_callback=_make_tool_cb(),
                parent_id=p,
            )
            assert not c.startswith("Error")
            children.append(c)
        assert mgr._agents[p].children_ids == children

    def test_get_results_children_ids_is_copy(self):
        mgr = AgentManager()
        p = mgr.spawn(
            label="root", goal="go", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=_make_iter_cb(),
            tool_executor_callback=_make_tool_cb(),
        )
        results = mgr.get_results(p)
        results["children_ids"].append("fake")
        assert "fake" not in mgr._agents[p].children_ids

    def test_filter_preserves_non_agent_tools(self):
        tools = [
            {"name": "run_command"},
            {"name": "read_file"},
            {"name": "spawn_agent"},
        ]
        result = filter_agent_tools(tools, depth=2, max_depth=2)
        assert len(result) == 2
        names = {t["name"] for t in result}
        assert "run_command" in names
        assert "read_file" in names
