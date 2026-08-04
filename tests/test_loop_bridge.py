"""Coverage for src/agents/loop_bridge.py (RFC-006 P21, safe).

Real LoopAgentBridge over a FAKE AgentManager: spawn_agents_for_loop (limits +
happy + spawn-error skip), get_loop_agent_ids/count, wait_and_collect (explicit +
all-uncollected + empty), format_agent_results_for_context (all fields +
truncation + empty), cleanup_loop, get_active_loop_agents, tracked_loop_count.
SAFE: no real agents, no LLM, no tool dispatch — pure bookkeeping over a fake.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from src.agents.loop_bridge import LoopAgentBridge


class _FakeAgentManager:
    def __init__(self, error_labels=None, results=None):
        self._error_labels = error_labels or set()
        self._results = results or {}
        self.waited = []
        self._n = 0

    def spawn(self, *, label, goal, **kw):
        if label in self._error_labels:
            return f"Error: spawn failed for {label}"
        aid = f"agent-{self._n}"
        self._n += 1
        return aid

    async def wait_for_agents(self, agent_ids, timeout):
        self.waited.append((tuple(agent_ids), timeout))
        return {aid: {"status": "completed", "label": aid, "result": "done"}
                for aid in agent_ids}

    def get_results(self, agent_id):
        return self._results.get(agent_id)


def _bridge(**kw):
    return LoopAgentBridge(_FakeAgentManager(**kw))  # type: ignore[arg-type]  # fake mgr


def _tasks(n):
    return [{"label": f"L{i}", "goal": f"g{i}"} for i in range(n)]


_CB = MagicMock()


class TestSpawn:
    def test_empty_tasks(self):
        assert _bridge().spawn_agents_for_loop(
            "loop1", 0, "goal", [], "c1", "u1", "U1", _CB, _CB) == []

    def test_per_iteration_limit(self):
        out = _bridge().spawn_agents_for_loop(
            "loop1", 0, "goal", _tasks(4), "c1", "u1", "U1", _CB, _CB)
        assert len(out) == 1 and out[0].startswith("Error: Cannot spawn more than")

    def test_per_loop_lifetime_limit(self):
        b = _bridge()
        with patch("src.agents.loop_bridge.MAX_AGENTS_PER_LOOP", 2):
            b.spawn_agents_for_loop("loop1", 0, "goal", _tasks(2), "c1", "u1", "U1", _CB, _CB)
            over = b.spawn_agents_for_loop(
                "loop1", 1, "goal", _tasks(1), "c1", "u1", "U1", _CB, _CB)
        assert over[0].startswith("Error: Loop")

    def test_happy_spawn_tracks_ids(self):
        b = _bridge()
        ids = b.spawn_agents_for_loop("loop1", 3, "goal", _tasks(2), "c1", "u1", "U1", _CB, _CB)
        assert len(ids) == 2 and all(i.startswith("agent-") for i in ids)
        assert b.get_loop_agent_ids("loop1") == ids
        assert b.get_loop_agent_count("loop1") == 2
        assert b.tracked_loop_count == 1

    def test_spawn_error_not_tracked(self):
        b = LoopAgentBridge(_FakeAgentManager(error_labels={"L1"}))  # type: ignore[arg-type]
        ids = b.spawn_agents_for_loop("loop1", 0, "goal", _tasks(2), "c1", "u1", "U1", _CB, _CB)
        assert ids[1].startswith("Error")               # L1 failed
        assert b.get_loop_agent_count("loop1") == 1      # only the successful one tracked


class TestWaitAndCollect:
    async def test_explicit_ids(self):
        b = _bridge()
        ids = b.spawn_agents_for_loop("loop1", 0, "goal", _tasks(2), "c1", "u1", "U1", _CB, _CB)
        results = await b.wait_and_collect("loop1", agent_ids=ids, timeout=5)
        assert set(results) == set(ids)

    async def test_all_uncollected_then_empty(self):
        b = _bridge()
        b.spawn_agents_for_loop("loop1", 0, "goal", _tasks(2), "c1", "u1", "U1", _CB, _CB)
        first = await b.wait_and_collect("loop1")        # collects all uncollected
        assert len(first) == 2
        assert await b.wait_and_collect("loop1") == {}    # nothing left uncollected


class TestFormatting:
    def test_empty(self):
        assert _bridge().format_agent_results_for_context({}) == ""

    def test_all_fields_and_truncation(self):
        b = _bridge()
        out = b.format_agent_results_for_context({
            "a1": {"status": "completed", "label": "fixer", "result": "x" * 600},
            "a2": {"status": "failed", "error": "boom"},          # falls back to error
        })
        assert "Agent results:" in out
        assert "[fixer] (completed)" in out and out.count("...") >= 1  # truncated
        assert "[a2] (failed): boom" in out                          # label defaults to id


class TestCleanupAndActive:
    def test_cleanup_and_tracked_count(self):
        b = _bridge()
        b.spawn_agents_for_loop("loop1", 0, "goal", _tasks(2), "c1", "u1", "U1", _CB, _CB)
        assert b.cleanup_loop("loop1") == 2
        assert b.tracked_loop_count == 0
        assert b.cleanup_loop("missing") == 0

    def test_get_active_loop_agents(self):
        fam = _FakeAgentManager(results={"agent-0": {"status": "running"}})
        b = LoopAgentBridge(fam)  # type: ignore[arg-type]
        b.spawn_agents_for_loop("loop1", 2, "goal", _tasks(1), "c1", "u1", "U1", _CB, _CB)
        active = b.get_active_loop_agents("loop1")
        assert len(active) == 1 and active[0]["status"] == "running"
        assert active[0]["label"] == "L0"


class TestInvocationBoundToolCallback:
    """A loop agent's nested spawn_agent must carry its own id as parent_id.

    The shared callback used to be passed bare, so every loop-agent child
    registered as a fresh ROOT and bypassed depth, child-limit, and tree-cap
    enforcement entirely — reproduced during review by driving the callback
    and watching the request arrive parentless.
    """

    def _bridge_and_captured(self):
        from types import SimpleNamespace
        from unittest.mock import MagicMock

        from src.agents.loop_bridge import LoopAgentBridge

        captured = {}

        def fake_spawn(**kwargs):
            captured.update(kwargs)
            return "agent123"

        mgr = MagicMock()
        mgr.spawn = fake_spawn
        bridge = LoopAgentBridge(agent_manager=mgr, trajectory_saver=None)

        async def shared_cb(tool_name, tool_input):
            captured["dispatched"] = (tool_name, tool_input)
            return "ok"

        async def iter_cb(*a, **k):
            return SimpleNamespace(text="", tool_calls=None)

        ids = bridge.spawn_agents_for_loop(
            loop_id="L1", iteration=1, loop_goal="g",
            tasks=[{"label": "a", "goal": "g"}],
            channel_id="c1", requester_id="u1", requester_name="user",
            iteration_callback=iter_cb, tool_executor_callback=shared_cb,
        )
        assert ids == ["agent123"]
        return captured

    async def test_nested_spawn_gains_the_agents_own_parent_id(self):
        captured = self._bridge_and_captured()
        bound_cb = captured["tool_executor_callback"]
        await bound_cb("spawn_agent", {"label": "child", "goal": "g"})
        name, tool_input = captured["dispatched"]
        assert name == "spawn_agent"
        assert tool_input["parent_id"] == "agent123"

    async def test_an_explicit_parent_id_is_not_overridden(self):
        captured = self._bridge_and_captured()
        bound_cb = captured["tool_executor_callback"]
        await bound_cb("spawn_agent", {"label": "c", "goal": "g", "parent_id": "other"})
        _, tool_input = captured["dispatched"]
        assert tool_input["parent_id"] == "other"

    async def test_other_tools_pass_through_untouched(self):
        captured = self._bridge_and_captured()
        bound_cb = captured["tool_executor_callback"]
        await bound_cb("run_command", {"command": "ls"})
        name, tool_input = captured["dispatched"]
        assert name == "run_command"
        assert "parent_id" not in tool_input
