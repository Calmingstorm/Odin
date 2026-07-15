"""Coverage for src/discord/native_tools/agents_tasks.py (RFC-006 P5).

The fifth, largest native-tool domain: background-task delegation, autonomous
loops, agent spawn/collect, and the loop-agent bridge. Every runtime boundary is
faked — managers, the loop runner, the LLM gateway, and run_background_task —
so no real task/loop/agent ever executes (Odin's rule: don't start real runtime
just to green the bar). The inner iteration/tool callbacks only run under real
execution and are intentionally not driven here; we cover the handler bodies:
validation, setup, the launch call, and response shaping.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from src.discord.background_task import MAX_STEPS
from src.discord.native_tools.agents_tasks import AgentTaskDeps, AgentTaskTools


def _cfg(tools_enabled=True):
    return SimpleNamespace(
        tools=SimpleNamespace(enabled=tools_enabled, tool_timeouts={}),
        agents=SimpleNamespace(max_nesting_depth=2, hard_max_iterations=300,
                               max_iterations=120, scheduled_max_iterations=180,
                               final_warning_iterations=[20, 10, 5, 1],
                               iteration_timeout_seconds=900,
                               max_lifetime_seconds=14400),
    )


def _deps(**ov):
    d: dict[str, Any] = dict(
        get_config=lambda: _cfg(),
        llm_gateway=SimpleNamespace(active_client=object()),
        channel_state=SimpleNamespace(background_tasks={}, background_tasks_max=50),
        tool_executor=MagicMock(),
        skill_manager=MagicMock(),
        get_knowledge_store=lambda: MagicMock(),
        embedder=None,
        audit=MagicMock(),
        agent_manager=MagicMock(),
        loop_manager=MagicMock(),
        loop_agent_bridge=MagicMock(),
        agent_trajectory_saver=None,
        get_context_compressor=lambda: None,
        tool_loop=MagicMock(),
        turn_recorder=SimpleNamespace(_emit_lifecycle_event=AsyncMock()),
        prompt_builder=SimpleNamespace(build_full_prompt=lambda **k: "SYS"),
        tool_catalog=SimpleNamespace(merged_definitions=lambda: [{"name": "web_search"}]),
    )
    d.update(ov)
    return AgentTaskDeps(**d)


def _tools(**ov):
    return AgentTaskTools(_deps(**ov))


def _message(cid=42, uid=7):
    return SimpleNamespace(channel=SimpleNamespace(id=cid), author=SimpleNamespace(id=uid))


def _task(status="running", results=None, steps=None, tid="T1", desc="job"):
    return SimpleNamespace(
        task_id=tid, description=desc, status=status,
        steps=steps or [{"tool_name": "x"}], results=results or [], cancel=MagicMock())


# --------------------------------------------------------------------------- #
# delegate_task
# --------------------------------------------------------------------------- #
class TestDelegateTask:
    async def test_validation(self):
        t = _tools()
        msg = _message()
        assert "No steps" in await t._handle_delegate_task(msg, {"steps": []})
        assert "Too many steps" in await t._handle_delegate_task(
            msg, {"steps": [{"tool_name": "x"}] * (MAX_STEPS + 1)})
        assert "must have 'tool_name'" in await t._handle_delegate_task(
            msg, {"steps": [{"no_tool": 1}]})
        assert "missing 'command'" in await t._handle_delegate_task(
            msg, {"steps": [{"tool_name": "run_command", "tool_input": {}}]})

    async def test_success_launches(self):
        t = _tools()
        msg = _message()
        with patch("src.discord.native_tools.agents_tasks.run_background_task",
                   new=AsyncMock()):
            out = await t._handle_delegate_task(
                msg, {"description": "deploy", "steps": [{"tool_name": "web_search"}]})
            await asyncio.sleep(0)  # let the fire-and-forget _run() settle
        assert "Background task started" in out and "deploy" in out
        assert len(t._channel_state.background_tasks) == 1

    async def test_prunes_old_completed(self):
        deps = _deps()
        deps.channel_state.background_tasks_max = 1
        deps.channel_state.background_tasks = {
            "old1": _task(status="completed"), "old2": _task(status="completed")}
        t = AgentTaskTools(deps)
        with patch("src.discord.native_tools.agents_tasks.run_background_task",
                   new=AsyncMock()):
            await t._handle_delegate_task(_message(), {"steps": [{"tool_name": "web_search"}]})
            await asyncio.sleep(0)
        # pruned down to the cap + the new one
        assert len(deps.channel_state.background_tasks) <= 2


# --------------------------------------------------------------------------- #
# list_tasks / cancel_task
# --------------------------------------------------------------------------- #
class TestListCancelTasks:
    def test_list_empty(self):
        assert "No background tasks" in _tools()._handle_list_tasks()

    def test_list_overview(self):
        deps = _deps()
        r_ok = SimpleNamespace(status="ok", index=0, description="s", elapsed_ms=5, output="done")
        deps.channel_state.background_tasks = {"T1": _task(results=[r_ok])}
        out = AgentTaskTools(deps)._handle_list_tasks()
        assert "`T1`" in out and "1 ok" in out

    def test_list_detail_and_missing(self):
        deps = _deps()
        r = SimpleNamespace(status="error", index=1, description="step", elapsed_ms=9, output="")
        deps.channel_state.background_tasks = {"T1": _task(results=[r])}
        t = AgentTaskTools(deps)
        out = t._handle_list_tasks({"task_id": "T1"})
        assert "job" in out and "(no output)" in out
        assert "No task found" in t._handle_list_tasks({"task_id": "ghost"})

    def test_list_detail_truncates(self):
        deps = _deps()
        big = SimpleNamespace(status="ok", index=0, description="s",
                              elapsed_ms=1, output="x" * 4000)
        deps.channel_state.background_tasks = {"T1": _task(results=[big])}
        out = AgentTaskTools(deps)._handle_list_tasks({"task_id": "T1"})
        assert "truncated" in out

    def test_cancel(self):
        deps = _deps()
        deps.channel_state.background_tasks = {"T1": _task(status="running")}
        t = AgentTaskTools(deps)
        assert "No task found" in t._handle_cancel_task({"task_id": "ghost"})
        assert "Cancellation requested" in t._handle_cancel_task({"task_id": "T1"})
        deps.channel_state.background_tasks["T2"] = _task(status="completed", tid="T2")
        assert "is not running" in t._handle_cancel_task({"task_id": "T2"})


# --------------------------------------------------------------------------- #
# loops
# --------------------------------------------------------------------------- #
class TestLoops:
    def test_start_loop_validation_and_error(self):
        t = _tools()
        assert "'goal' is required" in t._handle_start_loop(_message(), {})
        t._loop_manager.start_loop.return_value = "Error: too many loops"
        assert "Error" in t._handle_start_loop(_message(), {"goal": "watch"})

    async def test_start_loop_success(self):
        t = _tools()
        t._loop_manager.start_loop.return_value = "loop123"
        out = t._handle_start_loop(_message(), {"goal": "watch the logs", "interval_seconds": 30})
        await asyncio.sleep(0)  # let lifecycle fire-and-forget settle
        assert "loop123" in out and "mode=notify" in out

    async def test_stop_loop(self):
        t = _tools()
        assert "'loop_id' is required" in t._handle_stop_loop({})
        t._loop_manager.stop_loop.return_value = "Loop stopped."
        assert "stopped" in t._handle_stop_loop({"loop_id": "L1"})
        await asyncio.sleep(0)

    def test_list_loops(self):
        t = _tools()
        t._loop_manager.list_loops.return_value = "1 loop"
        assert t._handle_list_loops() == "1 loop"


# --------------------------------------------------------------------------- #
# spawn_agent
# --------------------------------------------------------------------------- #
class TestSpawnAgent:
    async def test_validation(self):
        assert "required" in await _tools()._handle_spawn_agent(_message(), {"label": "a"})
        t = _tools(llm_gateway=SimpleNamespace(active_client=None))
        assert "not available" in await t._handle_spawn_agent(
            _message(), {"label": "a", "goal": "g"})

    async def test_success(self):
        t = _tools()
        t._agent_manager.spawn.return_value = "agent-1"
        t._agent_manager._agents = {}
        out = await t._handle_spawn_agent(_message(), {"label": "worker", "goal": "do it"})
        assert "spawned" in out and "agent-1" in out

    async def test_spawn_error_returned(self):
        t = _tools()
        t._agent_manager.spawn.return_value = "Error: nesting too deep"
        t._agent_manager._agents = {}
        assert "Error" in await t._handle_spawn_agent(
            _message(), {"label": "w", "goal": "g"})

    async def test_nested_with_parent_and_compressor(self):
        cc = SimpleNamespace(max_context_chars=500000, keep_recent_iterations=20)
        t = _tools(get_context_compressor=lambda: cc)
        t._agent_manager.spawn.return_value = "child-1"
        t._agent_manager._agents = {"parent-1": SimpleNamespace(depth=0)}
        out = await t._handle_spawn_agent(
            _message(), {"label": "child", "goal": "sub", "parent_id": "parent-1"})
        assert "depth 1" in out

    async def test_scheduled_spawn_uses_higher_budget(self):
        t = _tools()
        t._agent_manager.spawn.return_value = "agent-s"
        t._agent_manager._agents = {}
        out = await t._handle_spawn_agent(
            _message(), {"label": "s", "goal": "g", "_scheduled": True})
        assert "spawned" in out

    async def test_spawn_passes_configured_timeouts(self):
        """agents.iteration_timeout_seconds / max_lifetime_seconds are
        snapshotted into the spawn call."""
        t = _tools()
        t._agent_manager.spawn.return_value = "agent-t"
        t._agent_manager._agents = {}
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        kwargs = t._agent_manager.spawn.call_args.kwargs
        assert kwargs["iteration_timeout"] == 900
        assert kwargs["max_lifetime"] == 14400

    async def test_spawn_defaults_without_agents_config(self):
        """A config missing the agents section falls back to 900/14400."""
        t = _tools(get_config=lambda: SimpleNamespace(
            tools=SimpleNamespace(enabled=True, tool_timeouts={})))
        t._agent_manager.spawn.return_value = "agent-d"
        t._agent_manager._agents = {}
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        kwargs = t._agent_manager.spawn.call_args.kwargs
        assert kwargs["iteration_timeout"] == 900
        assert kwargs["max_lifetime"] == 14400


class _FakeEffortClient:
    """Codex-shaped client: has a reasoning_effort attr (the inherit source)."""
    reasoning_effort = "high"
    model = "gpt-5.5"
    provider_name = "codex"

    def __init__(self):
        self.captured: dict = {}

    async def chat_with_tools(self, **kw):
        self.captured.update(kw)
        return SimpleNamespace(text="hi", tool_calls=[], stop_reason="end_turn")


class TestAgentReasoningEffortCallback:
    def _spawned_callback(self, agent_effort, client):
        cfg = _cfg()
        cfg.openai_codex = SimpleNamespace(agent_reasoning_effort=agent_effort)
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=SimpleNamespace(active_client=client))
        t._agent_manager.spawn.return_value = "agent-e"
        t._agent_manager._agents = {}
        return t

    async def test_callback_passes_configured_override_and_stamps(self):
        client = _FakeEffortClient()
        t = self._spawned_callback("low", client)
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        cb = t._agent_manager.spawn.call_args.kwargs["iteration_callback"]
        out = await cb([{"role": "user", "content": "x"}], "sys", [])
        assert client.captured["reasoning_effort"] == "low"
        assert out["reasoning_effort"] == "low"
        assert out["provider"] == "codex"
        assert out["model"] == "gpt-5.5"

    async def test_callback_inherits_when_unset(self):
        client = _FakeEffortClient()
        t = self._spawned_callback(None, client)
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        cb = t._agent_manager.spawn.call_args.kwargs["iteration_callback"]
        out = await cb([{"role": "user", "content": "x"}], "sys", [])
        assert client.captured["reasoning_effort"] is None  # client applies its own
        assert out["reasoning_effort"] == "high"            # stamp = inherited value

    async def test_callback_reads_config_at_call_time(self):
        """A live config change reaches an in-flight agent's NEXT iteration."""
        client = _FakeEffortClient()
        cfg = _cfg()
        cfg.openai_codex = SimpleNamespace(agent_reasoning_effort=None)
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=SimpleNamespace(active_client=client))
        t._agent_manager.spawn.return_value = "agent-e"
        t._agent_manager._agents = {}
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        cb = t._agent_manager.spawn.call_args.kwargs["iteration_callback"]
        await cb([{"role": "user", "content": "x"}], "sys", [])
        assert client.captured["reasoning_effort"] is None
        cfg.openai_codex.agent_reasoning_effort = "xhigh"  # live WebUI change
        await cb([{"role": "user", "content": "x"}], "sys", [])
        assert client.captured["reasoning_effort"] == "xhigh"

    async def test_callback_stamps_none_for_effortless_provider(self):
        """A provider without a reasoning_effort attr stamps None — never a
        value it silently ignored."""
        class NoEffortClient:
            model = "qwen3"
            provider_name = "ollama"

            def __init__(self):
                self.captured: dict = {}

            async def chat_with_tools(self, **kw):
                self.captured.update(kw)
                return SimpleNamespace(text="hi", tool_calls=[], stop_reason="end_turn")

        client = NoEffortClient()
        t = self._spawned_callback("low", client)
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        cb = t._agent_manager.spawn.call_args.kwargs["iteration_callback"]
        out = await cb([{"role": "user", "content": "x"}], "sys", [])
        assert out["reasoning_effort"] is None
        assert out["provider"] == "ollama"

    async def test_loop_spawn_callback_passes_effort(self):
        """The spawn_loop_agents iteration callback gets the same treatment."""
        client = _FakeEffortClient()
        cfg = _cfg()
        cfg.openai_codex = SimpleNamespace(agent_reasoning_effort="medium")
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=SimpleNamespace(active_client=client))
        t._loop_manager._loops = {"L1": SimpleNamespace(
            status="running", requester_id="1", requester_name="u",
            goal="loop goal", iteration_count=1)}
        t._loop_agent_bridge.spawn_agents_for_loop = MagicMock(return_value=["a1"])
        await t._handle_spawn_loop_agents(
            _message(), {"loop_id": "L1", "tasks": [{"label": "x", "goal": "g"}]})
        cb = t._loop_agent_bridge.spawn_agents_for_loop.call_args.kwargs["iteration_callback"]
        out = await cb([{"role": "user", "content": "x"}], "sys", [])
        assert client.captured["reasoning_effort"] == "medium"
        assert out["reasoning_effort"] == "medium"


class TestAgentModelCallback:
    """openai_codex.agent_model — the spawned-agent model override. The
    callback resolves agent_model ?? model from ONE config read, passes the
    RESOLVED value to chat_with_tools, and stamps that same value: the
    request body and the trajectory stamp cannot diverge."""

    def _spawned(self, cfg_codex, client):
        cfg = _cfg()
        cfg.openai_codex = cfg_codex
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=SimpleNamespace(active_client=client))
        t._agent_manager.spawn.return_value = "agent-m"
        t._agent_manager._agents = {}
        return t

    async def _callback(self, t):
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        return t._agent_manager.spawn.call_args.kwargs["iteration_callback"]

    async def test_override_passed_and_stamped(self):
        client = _FakeEffortClient()
        t = self._spawned(SimpleNamespace(agent_reasoning_effort=None,
                                          agent_model="gpt-5.6-luna",
                                          model="gpt-5.6-sol"), client)
        cb = await self._callback(t)
        out = await cb([{"role": "user", "content": "x"}], "sys", [])
        assert client.captured["model"] == "gpt-5.6-luna"
        assert out["model"] == "gpt-5.6-luna"

    async def test_inherit_passes_resolved_chat_model(self):
        """None = inherit still passes the RESOLVED config model — never
        None-and-let-self.model-decide-later — so the body and the stamp
        share one source (the values here differ from client.model on
        purpose to prove the config is that source)."""
        client = _FakeEffortClient()
        t = self._spawned(SimpleNamespace(agent_reasoning_effort=None,
                                          agent_model=None,
                                          model="gpt-5.6-sol"), client)
        cb = await self._callback(t)
        out = await cb([{"role": "user", "content": "x"}], "sys", [])
        assert client.captured["model"] == "gpt-5.6-sol"
        assert out["model"] == "gpt-5.6-sol"

    async def test_whitespace_override_means_inherit(self):
        client = _FakeEffortClient()
        t = self._spawned(SimpleNamespace(agent_reasoning_effort=None,
                                          agent_model="   ",
                                          model="gpt-5.6-sol"), client)
        cb = await self._callback(t)
        out = await cb([{"role": "user", "content": "x"}], "sys", [])
        assert client.captured["model"] == "gpt-5.6-sol"
        assert out["model"] == "gpt-5.6-sol"

    async def test_live_config_change_tracks_per_iteration(self):
        """Body model == stamped model on EVERY iteration even when config
        changes between iterations."""
        client = _FakeEffortClient()
        cfg_codex = SimpleNamespace(agent_reasoning_effort=None,
                                    agent_model=None, model="gpt-5.6-sol")
        t = self._spawned(cfg_codex, client)
        cb = await self._callback(t)
        out1 = await cb([{"role": "user", "content": "x"}], "sys", [])
        assert client.captured["model"] == "gpt-5.6-sol" == out1["model"]
        cfg_codex.agent_model = "gpt-5.6-luna"  # live WebUI change
        out2 = await cb([{"role": "user", "content": "x"}], "sys", [])
        assert client.captured["model"] == "gpt-5.6-luna" == out2["model"]

    async def test_non_codex_provider_stamps_actual_model(self):
        """A provider that pins its model ignores the override — the stamp
        must report what actually answered, never the Codex agent setting."""
        class PinnedModelClient:
            model = "qwen3"
            provider_name = "ollama"

            def __init__(self):
                self.captured: dict = {}

            async def chat_with_tools(self, **kw):
                self.captured.update(kw)
                return SimpleNamespace(text="hi", tool_calls=[], stop_reason="end_turn")

        client = PinnedModelClient()
        t = self._spawned(SimpleNamespace(agent_reasoning_effort=None,
                                          agent_model="gpt-5.6-luna",
                                          model="gpt-5.6-sol"), client)
        cb = await self._callback(t)
        out = await cb([{"role": "user", "content": "x"}], "sys", [])
        assert client.captured["model"] is None  # override not forwarded
        assert out["model"] == "qwen3"

    async def test_loop_spawn_callback_same_treatment(self):
        client = _FakeEffortClient()
        cfg = _cfg()
        cfg.openai_codex = SimpleNamespace(agent_reasoning_effort=None,
                                           agent_model="gpt-5.6-luna",
                                           model="gpt-5.6-sol")
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=SimpleNamespace(active_client=client))
        t._loop_manager._loops = {"L1": SimpleNamespace(
            status="running", requester_id="1", requester_name="u",
            goal="loop goal", iteration_count=1)}
        t._loop_agent_bridge.spawn_agents_for_loop = MagicMock(return_value=["a1"])
        await t._handle_spawn_loop_agents(
            _message(), {"loop_id": "L1", "tasks": [{"label": "x", "goal": "g"}]})
        cb = t._loop_agent_bridge.spawn_agents_for_loop.call_args.kwargs["iteration_callback"]
        out = await cb([{"role": "user", "content": "x"}], "sys", [])
        assert client.captured["model"] == "gpt-5.6-luna"
        assert out["model"] == "gpt-5.6-luna"


# --------------------------------------------------------------------------- #
# simple agent handlers
# --------------------------------------------------------------------------- #
class TestAgentHandlers:
    def test_send_to_agent(self):
        t = _tools()
        assert "'agent_id' is required" in t._handle_send_to_agent({})
        assert "'message' is required" in t._handle_send_to_agent({"agent_id": "a"})
        t._agent_manager.send.return_value = "sent"
        assert t._handle_send_to_agent({"agent_id": "a", "message": "hi"}) == "sent"

    def test_list_agents(self):
        t = _tools()
        t._agent_manager.list.return_value = []
        assert "No agents running" in t._handle_list_agents(_message())
        t._agent_manager.list.return_value = [
            {"id": "a1", "label": "w", "status": "running",
             "iteration_count": 3, "runtime_seconds": 12}]
        out = t._handle_list_agents(_message())
        assert "Agents (1)" in out and "`a1`" in out

    def test_kill_agent(self):
        t = _tools()
        assert "'agent_id' is required" in t._handle_kill_agent({})
        t._agent_manager.kill.return_value = "killed"
        assert t._handle_kill_agent({"agent_id": "a"}) == "killed"

    def test_get_agent_results(self):
        t = _tools()
        assert "'agent_id' is required" in t._handle_get_agent_results({})
        t._agent_manager.get_results.return_value = None
        assert "not found" in t._handle_get_agent_results({"agent_id": "a"})
        t._agent_manager.get_results.return_value = {
            "status": "running", "label": "w", "iteration_count": 2, "runtime_seconds": 5}
        assert "still running" in t._handle_get_agent_results({"agent_id": "a"})
        t._agent_manager.get_results.return_value = {
            "status": "failed", "label": "w", "iteration_count": 4, "runtime_seconds": 9,
            "tools_used": ["grep"], "result": "x" * 2000, "error": "boom"}
        out = t._handle_get_agent_results({"agent_id": "a"})
        assert "failed" in out and "Result:" in out and "Error: boom" in out
        assert "..." in out  # long result truncated

    async def test_wait_for_agents(self):
        t = _tools()
        assert "required" in await t._handle_wait_for_agents({})
        assert "must be a list" in await t._handle_wait_for_agents({"agent_ids": "notalist"})
        t._agent_manager.wait_for_agents = AsyncMock(return_value={
            "a1": {"status": "completed", "label": "w", "result": "x" * 1000}})
        out = await t._handle_wait_for_agents({"agent_ids": ["a1"], "timeout": 10})
        assert "`a1`" in out and "..." in out  # long content truncated at 800

    async def test_collect_agent_result_helper(self):
        t = _tools()
        t._agent_manager.wait_for_agents = AsyncMock(return_value={
            "a1": {"status": "failed", "label": "worker", "runtime_seconds": 5,
                   "iteration_count": 3, "tools_used": ["grep"], "result": "x" * 2000,
                   "error": "crashed"}})
        text, raw = await t._collect_agent_result("a1")
        assert "worker" in text and raw["status"] == "failed"
        assert raw["empty_result"] is False and "..." in text  # long result truncated
        assert "Error: crashed" in text


# --------------------------------------------------------------------------- #
# loop-agent bridge
# --------------------------------------------------------------------------- #
class TestLoopAgentBridge:
    def _running_loop(self):
        return SimpleNamespace(status="running", iteration_count=2, goal="g",
                               requester_id="u1", requester_name="U")

    async def test_spawn_loop_agents_validation(self):
        t = _tools()
        assert "'loop_id' is required" in await t._handle_spawn_loop_agents(_message(), {})
        assert "'tasks' list is required" in await t._handle_spawn_loop_agents(
            _message(), {"loop_id": "L1"})
        t._loop_manager._loops = {}
        assert "not found" in await t._handle_spawn_loop_agents(
            _message(), {"loop_id": "L1", "tasks": ["t"]})
        t._loop_manager._loops = {"L1": SimpleNamespace(status="stopped")}
        assert "not running" in await t._handle_spawn_loop_agents(
            _message(), {"loop_id": "L1", "tasks": ["t"]})

    async def test_spawn_loop_agents_no_client(self):
        t = _tools(llm_gateway=SimpleNamespace(active_client=None))
        t._loop_manager._loops = {"L1": self._running_loop()}
        assert "not available" in await t._handle_spawn_loop_agents(
            _message(), {"loop_id": "L1", "tasks": ["t"]})

    async def test_spawn_loop_agents_success_and_errors(self):
        t = _tools()
        t._loop_manager._loops = {"L1": self._running_loop()}
        t._loop_agent_bridge.spawn_agents_for_loop.return_value = ["ag1", "Error: bad"]
        out = await t._handle_spawn_loop_agents(
            _message(), {"loop_id": "L1", "tasks": ["a", "b"]})
        assert "Spawned 1 agent(s): ag1" in out and "Errors: Error: bad" in out

    async def test_collect_loop_agents(self):
        t = _tools()
        assert "'loop_id' is required" in await t._handle_collect_loop_agents({})
        t._loop_manager._loops = {}
        assert "not found" in await t._handle_collect_loop_agents({"loop_id": "L1"})
        t._loop_manager._loops = {"L1": self._running_loop()}
        t._loop_agent_bridge.wait_and_collect = AsyncMock(return_value=[])
        assert "No agents to collect" in await t._handle_collect_loop_agents({"loop_id": "L1"})
        t._loop_agent_bridge.wait_and_collect = AsyncMock(return_value=[{"id": "a1"}])
        t._loop_agent_bridge.format_agent_results_for_context.return_value = "formatted"
        assert await t._handle_collect_loop_agents(
            {"loop_id": "L1", "agent_ids": ["a1"]}) == "formatted"
