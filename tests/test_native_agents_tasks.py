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

import pytest

from src.agents.loop_bridge import LoopAgentBridge
from src.agents.manager import AgentManager
from src.agents.trajectory import AgentTrajectorySaver
from src.config.schema import ContextCompressionConfig, OpenAICodexConfig
from src.discord.background_task import MAX_STEPS
from src.discord.native_tools.agents_tasks import (
    AgentTaskDeps,
    AgentTaskTools,
    _capture_agent_generation_plan,
    _gateway_serving_for_config,
    _parse_spawn_overrides,
)
from src.llm.model_breaker import ModelBreakerRegistry
from src.llm.recovery import RecoveryPolicy


def _fake_gateway(client):
    """Gateway fake carrying the recovery surface the callbacks now use.

    The breaker registry is real (per-fake, isolated) so the callbacks'
    admission/resolution protocol actually runs; the fast policy keeps any
    would-be retry from sleeping meaningfully in tests.
    """
    registry = ModelBreakerRegistry()
    gw = SimpleNamespace(active_client=client)
    gw.capacity_breaker_for = lambda model=None, *, provider=None: registry.for_model(
        str(provider or "codex"), str(model or getattr(client, "model", None) or "unknown")
    )
    gw.recovery_policy = lambda: RecoveryPolicy(
        deadline_seconds=0.2, backoff_base=0.01, backoff_cap=0.02, retry_after_cap=0.05
    )
    gw.success_notices = []
    gw.notify_generation_success = gw.success_notices.append
    return gw


def _cfg(tools_enabled=True):
    return SimpleNamespace(
        tools=SimpleNamespace(enabled=tools_enabled, tool_timeouts={}),
        agents=SimpleNamespace(max_nesting_depth=2, max_children_per_agent=3,
                               hard_max_iterations=300,
                               max_iterations=120, scheduled_max_iterations=180,
                               final_warning_iterations=[20, 10, 5, 1],
                               iteration_timeout_seconds=900,
                               max_lifetime_seconds=14400),
    )


def _deps(**ov):
    d: dict[str, Any] = dict(
        get_config=lambda: _cfg(),
        llm_gateway=_fake_gateway(object()),
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
        steps=steps or [{"tool_name": "x"}], results=results or [], cancel=MagicMock(),
        request_cancel=AsyncMock(return_value=(status == "running")))


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

    async def test_cancel_mid_run_settles_cancelled(self):
        # A cancel that interrupts the runner mid-step hits the _run wrapper's
        # CancelledError branch: status stays 'cancelled', it re-raises.
        t = _tools()
        msg = _message()
        started = asyncio.Event()

        async def _blocking_run(*a, **k):
            started.set()
            await asyncio.sleep(3600)  # block until cancelled

        async def _boom_progress(*a, **k):
            raise RuntimeError("progress send failed")  # exercise the defensive except

        # Everything stays inside the patch: the fire-and-forget _run() executes
        # the patched (blocking) runner only while the patch is active. The
        # final-progress post is forced to raise so the cancel branch's guarded
        # except is covered; the task must still settle 'cancelled'.
        with patch("src.discord.native_tools.agents_tasks.run_background_task", _blocking_run), \
             patch("src.discord.native_tools.agents_tasks._send_progress", _boom_progress):
            out = await t._handle_delegate_task(
                msg, {"description": "job", "steps": [{"tool_name": "web_search"}]})
            assert "Background task started" in out
            task = next(iter(t._channel_state.background_tasks.values()))
            await asyncio.wait_for(started.wait(), timeout=2)
            task._asyncio_task.cancel()
            try:
                await task._asyncio_task
            except asyncio.CancelledError:
                pass  # the wrapper re-raises after marking the task cancelled
        assert task.status == "cancelled"
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
    @pytest.mark.parametrize("uid,cid,visible", [("7", 42, True), ("8", 42, False),
                                               ("7", 43, False), ("admin", 43, True),
                                               ("", 42, False), ("guest", 42, False)])
    async def test_dispatch_scopes_tasks(self, tmp_path, uid, cid, visible):
        from src.config.schema import PermissionsConfig
        from src.discord.native_tools.registry import NativeToolDispatcher, register_native_handlers
        from src.permissions.manager import PermissionManager
        from src.tools.executor import ToolExecutor

        permissions = PermissionManager(
            PermissionsConfig(default_tier="user"), tmp_path / "rbac.json")
        permissions.set_tier("admin", "admin")
        permissions.set_tier("guest", "guest")
        executor = MagicMock()
        executor._permission_manager = permissions
        executor.check_permission = lambda name, user: ToolExecutor.check_permission(
            executor, name, user)
        t = _tools(tool_executor=executor)
        task = _task(desc="owner-private-output")
        task.requester_id = "7"
        task.channel = SimpleNamespace(id=42)
        t._channel_state.background_tasks["T1"] = task
        owners = {k: MagicMock() for k in (
            "agents", "channel_ops", "media", "scheduling", "knowledge", "memory",
            "skills", "permissions")}
        owners["agents"] = t
        dispatcher = NativeToolDispatcher(owners=owners, skill_manager=MagicMock(),
                                          tool_catalog=MagicMock(), prompt_builder=MagicMock(),
                                          channel_state=t._channel_state)
        register_native_handlers(dispatcher)
        denial = executor.check_permission("list_tasks", uid)
        if uid == "guest":
            assert denial
            return
        if not uid:
            assert denial  # W1 ingress is fail-closed, handler remains scoped too.
        else:
            assert denial is None
        async def dispatch(inp):
            result, _ = await dispatcher.dispatch("list_tasks", inp, message=_message(cid),
                                                  user_id=uid, skill_file_delivery="stage")
            return result
        overview = await dispatch({})
        detail = await dispatch({"task_id": "T1"})
        assert ("owner-private-output" in overview) is visible
        assert ("owner-private-output" in detail) is visible
        if not visible:
            assert detail.replace("T1", "absent") == await dispatch({"task_id": "absent"})

    def test_list_empty(self):
        assert "No background tasks" in _tools()._handle_list_tasks()

    def test_list_overview(self):
        deps = _deps()
        r_ok = SimpleNamespace(status="ok", index=0, description="s", elapsed_ms=5, output="done")
        deps.channel_state.background_tasks = {"T1": _task(results=[r_ok])}
        deps.tool_executor._permission_manager.get_tier.return_value = "admin"
        out = AgentTaskTools(deps)._handle_list_tasks(user_id="admin")
        assert "`T1`" in out and "1 ok" in out

    def test_list_detail_and_missing(self):
        deps = _deps()
        r = SimpleNamespace(status="error", index=1, description="step", elapsed_ms=9, output="")
        deps.channel_state.background_tasks = {"T1": _task(results=[r])}
        t = AgentTaskTools(deps)
        deps.tool_executor._permission_manager.get_tier.return_value = "admin"
        out = t._handle_list_tasks({"task_id": "T1"}, user_id="admin")
        assert "job" in out and "(no output)" in out
        assert "No task found" in t._handle_list_tasks({"task_id": "ghost"})

    def test_list_detail_truncates(self):
        deps = _deps()
        big = SimpleNamespace(status="ok", index=0, description="s",
                              elapsed_ms=1, output="x" * 4000)
        deps.channel_state.background_tasks = {"T1": _task(results=[big])}
        deps.tool_executor._permission_manager.get_tier.return_value = "admin"
        out = AgentTaskTools(deps)._handle_list_tasks({"task_id": "T1"}, user_id="admin")
        assert "truncated" in out

    async def test_cancel(self):
        deps = _deps()
        deps.channel_state.background_tasks = {"T1": _task(status="running")}
        t = AgentTaskTools(deps)
        assert "No task found" in await t._handle_cancel_task({"task_id": "ghost"})
        # The handler now drives async request_cancel (real interrupt).
        assert "cancelled" in (await t._handle_cancel_task({"task_id": "T1"})).lower()
        deps.channel_state.background_tasks["T2"] = _task(status="completed", tid="T2")
        assert "is not running" in await t._handle_cancel_task({"task_id": "T2"})


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
        assert "'loop_id' is required" in await t._handle_stop_loop({})
        t._loop_manager.stop_loop = AsyncMock(return_value="Loop stopped.")
        assert "stopped" in await t._handle_stop_loop({"loop_id": "L1"})
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
        t = _tools(llm_gateway=_fake_gateway(None))
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

    async def test_invocation_bound_callback_overwrites_explicit_parent_id(self):
        """Agent-originated spawn ancestry is not model-selectable.

        Chat-level calls still pass their requested parent_id to spawn(), but
        once an agent invokes spawn_agent its own id is authoritative.
        """
        t = _tools()
        t._agent_manager.spawn.return_value = "agent-self"
        t._agent_manager._agents = {}
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        callback = t._agent_manager.spawn.call_args.kwargs["tool_executor_callback"]
        t._tool_loop.dispatch_loop_tool = AsyncMock(return_value="ok")

        await callback(
            "spawn_agent",
            {"label": "child", "goal": "g", "parent_id": "other-tree"},
        )

        _, dispatched, *_ = t._tool_loop.dispatch_loop_tool.await_args.args
        assert dispatched["parent_id"] == "agent-self"

    async def test_nested_tool_filter_uses_the_parent_depth_snapshot(self):
        """Live config cannot change the catalogue within a running tree."""
        cfg = _cfg()
        cfg.agents.max_nesting_depth = 1
        t = _tools(
            get_config=lambda: cfg,
            tool_catalog=SimpleNamespace(merged_definitions=lambda: [
                {"name": "spawn_agent"}, {"name": "run_command"},
            ]),
        )
        t._agent_manager.spawn.return_value = "child-1"
        # This tree began with depth limit 3 even though live config is now 1.
        t._agent_manager._agents = {
            "parent-1": SimpleNamespace(depth=0, max_depth=3)
        }
        await t._handle_spawn_agent(
            _message(),
            {"label": "child", "goal": "sub", "parent_id": "parent-1"},
        )
        tools = t._agent_manager.spawn.call_args.kwargs["tools"]
        assert {tool["name"] for tool in tools} == {"spawn_agent", "run_command"}

    async def test_nested_with_parent_and_compressor(self):
        cc = ContextCompressionConfig(max_context_chars=500000, keep_recent_iterations=20)
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
    """Codex-shaped client: has a reasoning_effort attr (the inherit source)
    and stamps response provenance exactly like the real provider — from the
    same values the outbound body would carry."""
    reasoning_effort = "high"
    model = "gpt-5.5"
    provider_name = "codex"

    def __init__(self):
        self.captured: dict = {}

    async def chat_with_tools(self, **kw):
        self.captured.update(kw)
        effort = kw.get("reasoning_effort")
        effort = effort if effort is not None else self.reasoning_effort
        return SimpleNamespace(
            text="hi", tool_calls=[], stop_reason="end_turn",
            input_tokens=1000, output_tokens=5,
            server_input_tokens=1000, server_output_tokens=5,
            cached_tokens=800, cache_write_tokens=100,
            provenance_provider="codex",
            provenance_model=kw.get("model") or self.model,
            provenance_reasoning_effort=effort or None,
        )


class TestAgentReasoningEffortCallback:
    def _spawned_callback(self, agent_effort, client):
        cfg = _cfg()
        cfg.openai_codex = SimpleNamespace(agent_reasoning_effort=agent_effort)
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(client))
        t._agent_manager.spawn.return_value = "agent-e"
        t._agent_manager._agents = {}
        return t

    async def test_callback_passes_configured_override_and_stamps(self):
        client = _FakeEffortClient()
        t = self._spawned_callback("low", client)
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        cb = t._agent_manager.spawn.call_args.kwargs["iteration_callback"]
        out = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert client.captured["reasoning_effort"] == "low"
        assert out["reasoning_effort"] == "low"
        assert out["provider"] == "codex"
        assert out["model"] == "gpt-5.5"
        assert out["cached_tokens"] == 800
        assert out["cache_write_tokens"] == 100

    async def test_callback_inherits_when_unset(self):
        client = _FakeEffortClient()
        t = self._spawned_callback(None, client)
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        cb = t._agent_manager.spawn.call_args.kwargs["iteration_callback"]
        out = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        # Since the round-2 snapshot contract, the inherited effort is pinned
        # per generation and travels EXPLICITLY on the wire (preflight and the
        # outbound request must agree) — same effective request as the old
        # "None = client applies its own", now immune to mid-generation drift.
        assert client.captured["reasoning_effort"] == "high"
        assert out["reasoning_effort"] == "high"            # stamp = inherited value

    async def test_callback_reads_config_at_call_time(self):
        """A live config change reaches an in-flight agent's NEXT iteration."""
        client = _FakeEffortClient()
        cfg = _cfg()
        cfg.openai_codex = SimpleNamespace(agent_reasoning_effort=None)
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(client))
        t._agent_manager.spawn.return_value = "agent-e"
        t._agent_manager._agents = {}
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        cb = t._agent_manager.spawn.call_args.kwargs["iteration_callback"]
        await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        # inherit resolves to the client's own effort, snapshotted per
        # generation (round-2 contract) — explicit on the wire, not None
        assert client.captured["reasoning_effort"] == "high"
        cfg.openai_codex.agent_reasoning_effort = "xhigh"  # live WebUI change
        await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert client.captured["reasoning_effort"] == "xhigh"

    async def test_callback_stamps_none_for_effortless_provider(self):
        """A provider without a reasoning_effort attr reports None effort in
        its provenance — never a value it silently ignored."""
        class NoEffortClient:
            model = "qwen3"
            provider_name = "ollama"

            def __init__(self):
                self.captured: dict = {}

            async def chat_with_tools(self, **kw):
                self.captured.update(kw)
                return SimpleNamespace(
                    text="hi", tool_calls=[], stop_reason="end_turn",
                    provenance_provider="ollama",
                    provenance_model=self.model,
                    provenance_reasoning_effort=None,
                )

        client = NoEffortClient()
        t = self._spawned_callback("low", client)
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        cb = t._agent_manager.spawn.call_args.kwargs["iteration_callback"]
        out = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert out["reasoning_effort"] is None
        assert out["provider"] == "ollama"

    async def test_loop_spawn_callback_passes_effort(self):
        """The spawn_loop_agents iteration callback gets the same treatment."""
        client = _FakeEffortClient()
        cfg = _cfg()
        cfg.openai_codex = SimpleNamespace(agent_reasoning_effort="medium")
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(client))
        t._loop_manager._loops = {"L1": SimpleNamespace(
            status="running", requester_id="1", requester_name="u",
            goal="loop goal", iteration_count=1)}
        t._loop_agent_bridge.spawn_agents_for_loop = MagicMock(return_value=["a1"])
        await t._handle_spawn_loop_agents(
            _message(), {"loop_id": "L1", "tasks": [{"label": "x", "goal": "g"}]})
        cb = t._loop_agent_bridge.spawn_agents_for_loop.call_args.kwargs["iteration_callback"]
        out = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert client.captured["reasoning_effort"] == "medium"
        assert out["reasoning_effort"] == "medium"
        assert out["cached_tokens"] == 800
        assert out["cache_write_tokens"] == 100

    async def test_direct_agent_real_path_persists_cache_attribution(self, tmp_path):
        client = _FakeEffortClient()
        cfg = _cfg()
        cfg.openai_codex = SimpleNamespace(
            agent_reasoning_effort="medium", agent_model=None, model="gpt-5.5"
        )
        manager = AgentManager()
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        t = _tools(
            get_config=lambda: cfg,
            llm_gateway=_fake_gateway(client),
            agent_manager=manager,
            agent_trajectory_saver=saver,
        )

        result = await t._handle_spawn_agent(_message(), {"label": "cache", "goal": "finish"})
        assert "spawned" in result.lower()
        agent_id = next(iter(manager._agents))
        await manager._agents[agent_id]._task
        stored = await saver.find_by_agent_id(agent_id)
        assert stored["iterations"][0]["cached_tokens"] == 800
        assert stored["iterations"][0]["cache_write_tokens"] == 100
        manager._remove_agent(agent_id, source="test")

    async def test_loop_agent_real_path_persists_cache_attribution(self, tmp_path):
        client = _FakeEffortClient()
        cfg = _cfg()
        cfg.openai_codex = SimpleNamespace(
            agent_reasoning_effort="medium", agent_model=None, model="gpt-5.5"
        )
        manager = AgentManager()
        saver = AgentTrajectorySaver(directory=str(tmp_path))
        bridge = LoopAgentBridge(manager, saver)
        loop_manager = MagicMock()
        loop_manager._loops = {
            "L1": SimpleNamespace(
                status="running", requester_id="1", requester_name="u",
                goal="loop goal", iteration_count=1,
            )
        }
        t = _tools(
            get_config=lambda: cfg,
            llm_gateway=_fake_gateway(client),
            agent_manager=manager,
            agent_trajectory_saver=saver,
            loop_manager=loop_manager,
            loop_agent_bridge=bridge,
        )

        result = await t._handle_spawn_loop_agents(
            _message(), {"loop_id": "L1", "tasks": [{"label": "cache", "goal": "finish"}]}
        )
        assert "spawned" in result.lower()
        agent_id = bridge.get_loop_agent_ids("L1")[0]
        await manager._agents[agent_id]._task
        stored = await saver.find_by_agent_id(agent_id)
        assert stored["iterations"][0]["cached_tokens"] == 800
        assert stored["iterations"][0]["cache_write_tokens"] == 100
        manager._remove_agent(agent_id, source="test")


class TestAgentModelCallback:
    """openai_codex.agent_model — the spawned-agent model override. The
    callback resolves agent_model ?? model from ONE config read, passes the
    RESOLVED value to chat_with_tools, and stamps that same value: the
    request body and the trajectory stamp cannot diverge."""

    def _spawned(self, cfg_codex, client):
        cfg = _cfg()
        cfg.openai_codex = cfg_codex
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(client))
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
        out = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
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
        out = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert client.captured["model"] == "gpt-5.6-sol"
        assert out["model"] == "gpt-5.6-sol"

    async def test_whitespace_override_means_inherit(self):
        client = _FakeEffortClient()
        t = self._spawned(SimpleNamespace(agent_reasoning_effort=None,
                                          agent_model="   ",
                                          model="gpt-5.6-sol"), client)
        cb = await self._callback(t)
        out = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
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
        out1 = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert client.captured["model"] == "gpt-5.6-sol" == out1["model"]
        cfg_codex.agent_model = "gpt-5.6-luna"  # live WebUI change
        out2 = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert client.captured["model"] == "gpt-5.6-luna" == out2["model"]

    async def test_non_codex_provider_stamps_actual_model(self):
        """A provider that pins its model ignores the override — its response
        provenance reports what actually answered, never the Codex agent
        setting."""
        class PinnedModelClient:
            model = "qwen3"
            provider_name = "ollama"

            def __init__(self):
                self.captured: dict = {}

            async def chat_with_tools(self, **kw):
                self.captured.update(kw)
                return SimpleNamespace(
                    text="hi", tool_calls=[], stop_reason="end_turn",
                    provenance_provider="ollama",
                    provenance_model=self.model,
                    provenance_reasoning_effort=None,
                )

        client = PinnedModelClient()
        t = self._spawned(SimpleNamespace(agent_reasoning_effort=None,
                                          agent_model="gpt-5.6-luna",
                                          model="gpt-5.6-sol"), client)
        cb = await self._callback(t)
        out = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert client.captured["model"] is None  # override not forwarded
        assert out["model"] == "qwen3"

    async def test_stamp_comes_from_response_not_resolver(self):
        """The iteration stamp reads the RESPONSE provenance — the resolver
        output still rides the request, but it is not the stamp source."""
        class ProvenanceProofClient:
            reasoning_effort = "high"
            model = "gpt-5.5"
            provider_name = "codex"

            def __init__(self):
                self.captured: dict = {}

            async def chat_with_tools(self, **kw):
                self.captured.update(kw)
                return SimpleNamespace(
                    text="hi", tool_calls=[], stop_reason="end_turn",
                    provenance_provider="codex",
                    provenance_model="proof-from-response",
                    provenance_reasoning_effort="low",
                )

        client = ProvenanceProofClient()
        t = self._spawned(SimpleNamespace(agent_reasoning_effort=None,
                                          agent_model="gpt-5.6-luna",
                                          model="gpt-5.6-sol"), client)
        cb = await self._callback(t)
        out = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert client.captured["model"] == "gpt-5.6-luna"  # resolver → request
        assert out["model"] == "proof-from-response"       # response → stamp
        assert out["reasoning_effort"] == "low"

    async def test_missing_provenance_stays_unknown(self):
        """A response without provenance is recorded as UNKNOWN — never
        replaced with a call-site guess (which would silently reintroduce
        false attribution for diverted or retried requests)."""
        class NoProvenanceClient:
            reasoning_effort = "high"
            model = "gpt-5.5"
            provider_name = "codex"

            def __init__(self):
                self.captured: dict = {}

            async def chat_with_tools(self, **kw):
                self.captured.update(kw)
                return SimpleNamespace(text="hi", tool_calls=[], stop_reason="end_turn")

        client = NoProvenanceClient()
        t = self._spawned(SimpleNamespace(agent_reasoning_effort=None,
                                          agent_model="gpt-5.6-luna",
                                          model="gpt-5.6-sol"), client)
        cb = await self._callback(t)
        out = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert out["provider"] == ""
        assert out["model"] == ""
        assert out["reasoning_effort"] is None

    async def test_loop_spawn_callback_same_treatment(self):
        client = _FakeEffortClient()
        cfg = _cfg()
        cfg.openai_codex = SimpleNamespace(agent_reasoning_effort=None,
                                           agent_model="gpt-5.6-luna",
                                           model="gpt-5.6-sol")
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(client))
        t._loop_manager._loops = {"L1": SimpleNamespace(
            status="running", requester_id="1", requester_name="u",
            goal="loop goal", iteration_count=1)}
        t._loop_agent_bridge.spawn_agents_for_loop = MagicMock(return_value=["a1"])
        await t._handle_spawn_loop_agents(
            _message(), {"loop_id": "L1", "tasks": [{"label": "x", "goal": "g"}]})
        cb = t._loop_agent_bridge.spawn_agents_for_loop.call_args.kwargs["iteration_callback"]
        out = await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert client.captured["model"] == "gpt-5.6-luna"
        assert out["model"] == "gpt-5.6-luna"


class TestParseSpawnOverrides:
    """Per-spawn model/effort override parsing: empty = inherit, invalid effort
    is REJECTED (never clamped), model whitespace normalizes to inherit."""

    def test_absent_means_inherit(self):
        assert _parse_spawn_overrides({}) == (None, None, None)

    def test_valid_model_and_effort(self):
        assert _parse_spawn_overrides(
            {"model": "gpt-5.6-luna", "reasoning_effort": "low"}
        ) == ("gpt-5.6-luna", "low", None)

    def test_model_whitespace_normalizes_to_inherit(self):
        assert _parse_spawn_overrides({"model": "   "}) == (None, None, None)

    def test_empty_effort_string_is_inherit(self):
        assert _parse_spawn_overrides({"reasoning_effort": ""}) == (None, None, None)

    def test_none_effort_is_real(self):
        # "none" is a real Codex effort level (not the inherit sentinel).
        assert _parse_spawn_overrides({"reasoning_effort": "none"}) == (None, "none", None)

    def test_invalid_effort_rejected_not_clamped(self):
        mo, eo, err = _parse_spawn_overrides({"reasoning_effort": "banana"})
        assert mo is None and eo is None
        assert err and "banana" in err


class TestPerSpawnModelEffort:
    """The parent can choose a model/effort for a SPECIFIC agent; it wins over
    the configured agent defaults and is stamped on the trajectory."""

    def _codex_cfg(self, agent_model="gpt-5.6-sol", agent_effort="medium"):
        return SimpleNamespace(
            model="gpt-5.6-sol", agent_model=agent_model,
            agent_reasoning_effort=agent_effort,
        )

    async def test_spawn_override_wins_over_config(self):
        client = _FakeEffortClient()
        cfg = _cfg()
        # Per-spawn overrides are only accepted when the axis is Auto.
        cfg.openai_codex = self._codex_cfg(agent_model="auto", agent_effort="auto")
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(client))
        t._agent_manager.spawn.return_value = "agent-o"
        t._agent_manager._agents = {}
        await t._handle_spawn_agent(
            _message(), {"label": "w", "goal": "g",
                         "model": "gpt-5.6-luna", "reasoning_effort": "low"})
        # the spawn call carries the overrides for trajectory stamping
        kwargs = t._agent_manager.spawn.call_args.kwargs
        assert kwargs["model_override"] == "gpt-5.6-luna"
        assert kwargs["reasoning_effort_override"] == "low"
        # and the iteration callback ASKS the client for luna@low, not sol@medium
        cb = kwargs["iteration_callback"]
        await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert client.captured["model"] == "gpt-5.6-luna"
        assert client.captured["reasoning_effort"] == "low"

    async def test_no_override_inherits_config(self):
        client = _FakeEffortClient()
        cfg = _cfg()
        cfg.openai_codex = self._codex_cfg(agent_model="gpt-5.6-terra", agent_effort="high")
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(client))
        t._agent_manager.spawn.return_value = "agent-i"
        t._agent_manager._agents = {}
        await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        kwargs = t._agent_manager.spawn.call_args.kwargs
        assert kwargs["model_override"] is None
        assert kwargs["reasoning_effort_override"] is None
        cb = kwargs["iteration_callback"]
        await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert client.captured["model"] == "gpt-5.6-terra"  # agent_model
        assert client.captured["reasoning_effort"] == "high"

    async def test_invalid_effort_rejects_without_spawning(self):
        client = _FakeEffortClient()
        cfg = _cfg()
        # Effort axis Auto so the field is accepted for value-validation.
        cfg.openai_codex = self._codex_cfg(agent_effort="auto")
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(client))
        t._agent_manager._agents = {}
        out = await t._handle_spawn_agent(
            _message(), {"label": "w", "goal": "g", "reasoning_effort": "ultra"})
        assert "invalid reasoning_effort" in out
        t._agent_manager.spawn.assert_not_called()

    async def test_loop_per_task_overrides_and_batch_rejection(self):
        client = _FakeEffortClient()
        cfg = _cfg()
        # Both axes Auto so per-task model + effort overrides are accepted.
        cfg.openai_codex = self._codex_cfg(agent_model="auto", agent_effort="auto")
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(client))
        t._loop_manager._loops = {"L1": SimpleNamespace(
            status="running", requester_id="1", requester_name="u",
            goal="loop goal", iteration_count=1)}
        t._loop_agent_bridge.spawn_agents_for_loop = MagicMock(return_value=["a1", "a2"])
        await t._handle_spawn_loop_agents(_message(), {"loop_id": "L1", "tasks": [
            {"label": "a", "goal": "g", "model": "gpt-5.6-luna"},
            {"label": "b", "goal": "g", "reasoning_effort": "xhigh"},
        ]})
        # tasks reach the bridge normalized with per-task overrides
        passed = t._loop_agent_bridge.spawn_agents_for_loop.call_args.kwargs["tasks"]
        assert passed[0]["model_override"] == "gpt-5.6-luna"
        assert passed[1]["reasoning_effort_override"] == "xhigh"
        # the factory builds a per-task callback that asks for THAT task's model
        factory = t._loop_agent_bridge.spawn_agents_for_loop.call_args.kwargs[
            "iteration_callback_factory"]
        cb = factory("gpt-5.6-luna", None)
        await cb([{"role": "user", "content": "x"}], "sys", [], generation_state={})
        assert client.captured["model"] == "gpt-5.6-luna"
        # one bad effort rejects the WHOLE batch — nothing spawns
        t._loop_agent_bridge.spawn_agents_for_loop.reset_mock()
        out = await t._handle_spawn_loop_agents(_message(), {"loop_id": "L1", "tasks": [
            {"label": "ok", "goal": "g"},
            {"label": "bad", "goal": "g", "reasoning_effort": "nope"},
        ]})
        assert "invalid reasoning_effort" in out and "bad" in out
        t._loop_agent_bridge.spawn_agents_for_loop.assert_not_called()


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

    async def test_wait_render_carries_iteration_count_not_runtime(self):
        """PR #244 round-1 blocker #4: iteration_count is the stable
        progress marker for the wait-class stuck signature — a silently
        progressing agent must not render identically to a hung one.
        Runtime stays excluded (it would make a hung agent immortal)."""
        t = _tools()
        t._agent_manager.wait_for_agents = AsyncMock(return_value={
            "a1": {"status": "running", "label": "w", "iteration_count": 7,
                   "runtime_seconds": 123.4, "result": ""}})
        out = await t._handle_wait_for_agents({"agent_ids": ["a1"], "timeout": 10})
        assert "[iterations=7]" in out
        assert "123" not in out  # runtime never rendered
        # Progressing iterations change the render (and therefore the
        # wait signature); a frozen count repeats identically.
        t._agent_manager.wait_for_agents = AsyncMock(return_value={
            "a1": {"status": "running", "label": "w", "iteration_count": 8,
                   "runtime_seconds": 200.0, "result": ""}})
        out2 = await t._handle_wait_for_agents({"agent_ids": ["a1"], "timeout": 10})
        assert out2 != out and "[iterations=8]" in out2

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
        t = _tools(llm_gateway=_fake_gateway(None))
        t._loop_manager._loops = {"L1": self._running_loop()}
        assert "not available" in await t._handle_spawn_loop_agents(
            _message(), {"loop_id": "L1", "tasks": ["t"]})

    async def test_spawn_loop_agents_success_and_errors(self):
        t = _tools()
        t._loop_manager._loops = {"L1": self._running_loop()}
        t._loop_agent_bridge.spawn_agents_for_loop.return_value = ["ag1", "Error: bad"]
        message = _message()
        message.id = 5151
        out = await t._handle_spawn_loop_agents(
            message, {"loop_id": "L1", "tasks": [
                {"label": "a", "goal": "g"}, {"label": "b", "goal": "g"}]})
        assert "Spawned 1 agent(s): ag1" in out and "Errors: Error: bad" in out
        assert t._loop_agent_bridge.spawn_agents_for_loop.call_args.kwargs["turn_id"] == "5151"

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


class TestBackgroundFollowupRouting:
    """The conversational-followup callback resolves the auxiliary pointer at
    CALL time and routes 'background_followup' cheap when enabled on the
    current wrapper (Codex active); else the active client handles it."""

    async def _capture_cb(self, gateway):
        captured = {}

        async def _fake_run(*a, **k):
            captured["cb"] = k.get("codex_callback")

        deps = _deps(llm_gateway=gateway)
        t = AgentTaskTools(deps)
        with patch("src.discord.native_tools.agents_tasks.run_background_task",
                   new=_fake_run):
            await t._handle_delegate_task(_message(),
                                          {"steps": [{"tool_name": "web_search"}]})
            await asyncio.sleep(0)
        return captured["cb"]

    async def test_routes_cheap_when_enabled(self):
        aux = SimpleNamespace(is_enabled=lambda t: t == "background_followup",
                              chat=AsyncMock(return_value="cheap"))
        active = SimpleNamespace(chat=AsyncMock(return_value="strong"))
        gateway = SimpleNamespace(active_client=active, auxiliary_llm_client=aux)
        cb = await self._capture_cb(gateway)
        assert await cb([], "s", 200) == "cheap"
        aux.chat.assert_awaited_once()

    async def test_falls_to_active_when_no_aux(self):
        active = SimpleNamespace(chat=AsyncMock(return_value="strong"))
        gateway = SimpleNamespace(active_client=active, auxiliary_llm_client=None)
        cb = await self._capture_cb(gateway)
        assert await cb([], "s", 200) == "strong"
        active.chat.assert_awaited_once()


class TestSpawnPairValidation:
    """Spawn boundary (3 of 4): the pair a spawn would run RIGHT NOW —
    override beats fixed config beats inherited-main — must not be a
    known-incompatible model/effort combination. Rejected before anything
    spawns, through the same policy resolution the iteration callbacks use."""

    @staticmethod
    def _codex_cfg(model="gpt-5.6-sol", agent_model=None, agent_effort=None):
        base = _cfg()
        base.openai_codex = SimpleNamespace(
            model=model, agent_model=agent_model, agent_reasoning_effort=agent_effort)
        return base

    @staticmethod
    def _codex_client(model="gpt-5.6-sol", effort="medium"):
        return SimpleNamespace(model=model, reasoning_effort=effort)

    async def test_fixed_config_bad_pair_rejected(self):
        cfg = self._codex_cfg(agent_model="gpt-5.5", agent_effort="max")
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(self._codex_client()))
        out = await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        assert "Error" in out and "gpt-5.5" in out and "'max'" in out
        assert "allowed for this model" in out
        t._agent_manager.spawn.assert_not_called()

    async def test_override_bad_pair_rejected(self):
        cfg = self._codex_cfg(agent_model="auto", agent_effort="auto")
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(self._codex_client()))
        out = await t._handle_spawn_agent(
            _message(),
            {"label": "w", "goal": "g", "model": "gpt-5.5", "reasoning_effort": "max"})
        assert "Error" in out and "gpt-5.5" in out
        t._agent_manager.spawn.assert_not_called()

    async def test_model_override_meets_inherited_live_max(self):
        """Effort inherits the LIVE client's max; an explicit gpt-5.5 model
        override makes the resolved pair invalid even though the task itself
        never mentions an effort."""
        cfg = self._codex_cfg(agent_model="auto", agent_effort=None)
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(self._codex_client(effort="max")))
        out = await t._handle_spawn_agent(
            _message(), {"label": "w", "goal": "g", "model": "gpt-5.5"})
        assert "Error" in out and "'max'" in out
        t._agent_manager.spawn.assert_not_called()

    async def test_good_max_pair_spawns(self):
        cfg = self._codex_cfg(agent_model="auto", agent_effort="auto")
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(self._codex_client()))
        t._agent_manager.spawn.return_value = "agent-1"
        t._agent_manager._agents = {}
        out = await t._handle_spawn_agent(
            _message(),
            {"label": "w", "goal": "g",
             "model": "gpt-5.6-luna", "reasoning_effort": "max"})
        assert "spawned" in out

    async def test_non_codex_client_unaffected(self):
        """A provider without effort semantics (no reasoning_effort attr)
        never trips the pair check regardless of config."""
        cfg = self._codex_cfg(agent_model="gpt-5.5", agent_effort="max")
        t = _tools(get_config=lambda: cfg,
                   llm_gateway=_fake_gateway(SimpleNamespace(model="llama3.1:8b")))
        t._agent_manager.spawn.return_value = "agent-1"
        t._agent_manager._agents = {}
        out = await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        assert "spawned" in out


class TestAgentGeneratePreflight:
    """Review round 1 (High), agent path: an in-flight agent whose resolved
    pair is invalid must fail fast as LLMRequestError BEFORE breaker
    admission — even (especially) while that model's breaker is OPEN — and
    must not move the breaker's failure count."""

    async def test_bad_pair_fails_fast_with_open_breaker(self):
        from src.llm.errors import LLMRequestError

        client = SimpleNamespace(model="gpt-5.6-sol", reasoning_effort="medium")
        gw = _fake_gateway(client)
        breaker = gw.capacity_breaker_for("gpt-5.5")
        # open it: default threshold, drive failures until open
        while breaker.snapshot()["state"] != "open":
            breaker.record_generation_failure()
        failures_before = breaker.snapshot()["failed_generations"]
        t = _tools(llm_gateway=gw)
        with pytest.raises(LLMRequestError) as ei:
            await t._agent_generate(
                client,
                messages=[{"role": "user", "content": "hi"}],
                sys_prompt="sys",
                tool_defs=[],
                agent_effort="max",
                resolved_model="gpt-5.5",
            )
        assert "gpt-5.5" in str(ei.value) and "'max'" in str(ei.value)
        assert breaker.snapshot()["failed_generations"] == failures_before
        assert breaker.snapshot()["state"] == "open"

    async def test_resolved_client_effort_pair_fails_fast(self):
        """The plan's resolved effort is validated at preflight for its fixed model."""
        from src.llm.errors import LLMRequestError

        client = SimpleNamespace(model="gpt-5.6-sol", reasoning_effort="max")
        t = _tools(llm_gateway=_fake_gateway(client))
        with pytest.raises(LLMRequestError):
            await t._agent_generate(
                client, messages=[], sys_prompt="s", tool_defs=[],
                agent_effort="max", resolved_model="gpt-5.5",
            )


class TestSpawnPairNonCodexCollision:
    """Review round 1 (Medium): a non-Codex provider whose model NAME
    collides with the exception map must not trip Codex capability rules —
    those providers accept-and-ignore Codex reasoning effort."""

    async def test_kimi_shaped_client_named_gpt55_spawns_under_max_config(self):
        cfg = _cfg()
        cfg.openai_codex = SimpleNamespace(
            model="gpt-5.6-sol", agent_model=None, agent_reasoning_effort="max")
        # kimi/ollama-shaped: has .model, has NO .reasoning_effort
        client = SimpleNamespace(model="gpt-5.5")
        t = _tools(get_config=lambda: cfg, llm_gateway=_fake_gateway(client))
        t._agent_manager.spawn.return_value = "agent-1"
        t._agent_manager._agents = {}
        out = await t._handle_spawn_agent(_message(), {"label": "w", "goal": "g"})
        assert "spawned" in out


class TestResolvedAgentEffortBoundary:
    async def test_codex_generation_rejects_unresolved_effort_sentinel(self):
        client = SimpleNamespace(model="gpt-5.6-sol", reasoning_effort="xhigh")
        t = _tools(llm_gateway=_fake_gateway(client))
        with pytest.raises(ValueError, match="unresolved reasoning effort"):
            await t._agent_generate(
                client,
                messages=[],
                sys_prompt="s",
                tool_defs=[],
                agent_effort=None,
                resolved_model="gpt-5.6-sol",
            )

    async def test_effortless_provider_may_carry_none(self):
        client = SimpleNamespace(
            model="local",
            chat_with_tools=AsyncMock(
                return_value=SimpleNamespace(
                    text="ok", tool_calls=[], provenance_provider="ollama"
                )
            ),
        )
        t = _tools(llm_gateway=_fake_gateway(client))
        response = await t._agent_generate(
            client,
            messages=[],
            sys_prompt="s",
            tool_defs=[],
            agent_effort=None,
            resolved_model=None,
        )
        assert response.text == "ok"
        assert client.chat_with_tools.await_args.kwargs["reasoning_effort"] is None


class TestAgentEffortSnapshot:
    """Review round 2 (High): the inherited agent effort is snapshotted ONCE
    per generation — preflight approves the SAME immutable value every
    attempt carries. A legal live effort change mid-generation (during an
    open-breaker or transport-retry wait) must not rewrite the outbound
    request; it reaches the agent on its next iteration."""

    async def test_plan_capture_drives_attempt_after_in_place_client_mutation(self):
        from src.config.schema import OpenAICodexConfig
        from src.discord.native_tools.agents_tasks import _capture_agent_generation_plan

        calls = []

        class _Client:
            model = "gpt-5.6-sol"
            reasoning_effort = "xhigh"

            async def chat_with_tools(self, *, reasoning_effort=None, model=None, **_kw):
                calls.append((reasoning_effort, model))
                return SimpleNamespace(
                    text="ok", tool_calls=[], provenance_provider="codex"
                )

        client = _Client()
        cfg = SimpleNamespace(
            openai_codex=OpenAICodexConfig(
                model="gpt-5.6-sol", agent_reasoning_effort=None
            )
        )
        plan = _capture_agent_generation_plan(
            lambda: cfg,
            lambda _cfg: client,
            lambda: ContextCompressionConfig(),
            model_override=None,
            effort_override=None,
        )
        client.reasoning_effort = "max"
        t = _tools(llm_gateway=_fake_gateway(client))
        await t._agent_generate(
            plan["client"],
            messages=[],
            sys_prompt="s",
            tool_defs=[],
            agent_effort=plan["effort"],
            resolved_model=plan["model"],
        )
        assert calls == [("xhigh", "gpt-5.6-sol")]

    async def test_attempts_carry_the_snapshot_across_retries(self):
        from src.llm.errors import LLMTransportError

        calls = []

        class _Client:
            model = "gpt-5.6-sol"
            reasoning_effort = "xhigh"

            async def chat_with_tools(self, *, reasoning_effort=None, model=None, **kw):
                calls.append(reasoning_effort)
                if len(calls) == 1:
                    # a live PUT lands mid-generation: xhigh -> max
                    self.reasoning_effort = "max"
                    raise LLMTransportError("blip")
                return SimpleNamespace(
                    text="ok", tool_calls=[], provenance_provider="codex")

        client = _Client()
        t = _tools(llm_gateway=_fake_gateway(client))
        resp = await t._agent_generate(
            client, messages=[], sys_prompt="s", tool_defs=[],
            agent_effort="xhigh", resolved_model="gpt-5.5",
        )
        # both attempts carried the PRE-CHANGE snapshot, never None and never
        # the mid-generation "max" (which would 400 against gpt-5.5)
        assert calls == ["xhigh", "xhigh"]
        assert resp.text == "ok"

class TestFrozenGenerationIdentity:
    """PR #273 round-1 blocker #1 pin: client/model/effort/budget come from
    ONE capture and stay fixed across rescue retries of the same generation;
    a live reload or client swap reaches only the NEXT generation."""

    async def test_rescue_retry_reuses_the_first_attempt_plan(self):
        from src.config.schema import OpenAICodexConfig

        cfg = _cfg()
        cfg.openai_codex = OpenAICodexConfig(
            model="gpt-5.6-sol", agent_model=None, agent_reasoning_effort=None,
        )
        sol_client = SimpleNamespace(model="gpt-5.6-sol", reasoning_effort="xhigh")
        gateway = SimpleNamespace(active_client=sol_client)
        t = _tools(get_config=lambda: cfg, llm_gateway=gateway)
        t._agent_manager.spawn = MagicMock(return_value="agent-1")
        t._agent_generate = AsyncMock(
            return_value=SimpleNamespace(
                text="ok", tool_calls=[], stop_reason="end_turn",
                provenance_provider="codex", provenance_model="gpt-5.6-sol",
                provenance_reasoning_effort="xhigh",
            )
        )
        await t._handle_spawn_agent(_message(), {"label": "x", "goal": "g"})
        cb = t._agent_manager.spawn.call_args.kwargs["iteration_callback"]

        generation_state: dict = {}
        await cb([], "sys", [], generation_state=generation_state)
        plan = generation_state["plan"]
        assert plan["client"] is sol_client
        assert plan["model"] == "gpt-5.6-sol"
        assert plan["snapshot"].primary_chars == 1_277_400

        # Mid-generation reload: live config and the active client both flip
        # to 5.5. The rescue retry MUST still use the frozen sol identity.
        cfg.openai_codex.model = "gpt-5.5"
        gateway.active_client = SimpleNamespace(
            model="gpt-5.5", reasoning_effort="xhigh"
        )
        await cb([], "sys", [], generation_state=generation_state)
        first = t._agent_generate.await_args_list[0]
        second = t._agent_generate.await_args_list[1]
        assert second.args[0] is sol_client  # same client object
        assert second.kwargs["resolved_model"] == first.kwargs["resolved_model"]
        assert generation_state["plan"] is plan  # nothing re-resolved

        # A FRESH generation state (the next iteration) sees the new world.
        fresh: dict = {}
        await cb([], "sys", [], generation_state=fresh)
        assert fresh["plan"]["model"] == "gpt-5.5"
        assert fresh["plan"]["snapshot"].primary_chars == 570_002

class TestIntegrationFrozenProviderBreaker:
    async def test_rescue_after_provider_switch_uses_frozen_provider_breaker(self):
        registry = ModelBreakerRegistry()

        class _Gateway:
            def __init__(self):
                self.live_provider = "codex"
                self.active_client = SimpleNamespace(
                    model="gpt-5.6-sol", reasoning_effort="xhigh"
                )
                self.recovery_policy = lambda: RecoveryPolicy(
                    deadline_seconds=0.2,
                    backoff_base=0.01,
                    backoff_cap=0.02,
                    retry_after_cap=0.05,
                )

            def capture_serving_identity(self, _config):
                return SimpleNamespace(
                    provider=self.live_provider,
                    client=self.active_client,
                    model=self.active_client.model,
                    reasoning_effort=getattr(self.active_client, "reasoning_effort", None),
                    is_codex=self.live_provider == "codex",
                )

            def capacity_breaker_for(self, model=None, *, provider=None):
                return registry.for_model(provider or self.live_provider, model or "unknown")

            def notify_generation_success(self, _response):
                return None

        calls = []

        class _Client:
            model = "gpt-5.6-sol"
            reasoning_effort = "xhigh"

            async def chat_with_tools(self, **_kwargs):
                calls.append("called")
                return SimpleNamespace(
                    text="ok", tool_calls=[], provenance_provider="codex"
                )

        gateway = _Gateway()
        gateway.active_client = _Client()
        cfg = SimpleNamespace(
            openai_codex=OpenAICodexConfig(
                model="gpt-5.6-sol", agent_reasoning_effort=None
            )
        )
        plan = _capture_agent_generation_plan(
            lambda: cfg,
            lambda root: _gateway_serving_for_config(gateway, root),
            lambda: ContextCompressionConfig(),
            model_override=None,
            effort_override=None,
        )
        assert plan["provider"] == "codex"

        # Open only the newly-live Ollama breaker, then switch providers. A
        # rescue governed by live identity would now fail before reaching the
        # frozen Codex client.
        live = registry.for_model("ollama", "gpt-5.6-sol")
        while live.snapshot()["state"] != "open":
            live.record_generation_failure()
        gateway.live_provider = "ollama"

        tools = _tools(llm_gateway=gateway)
        response = await tools._agent_generate(
            plan["client"],
            messages=[],
            sys_prompt="s",
            tool_defs=[],
            agent_effort=plan["effort"],
            resolved_model=plan["model"],
            provider=plan["provider"],
        )
        assert response.text == "ok"
        assert calls == ["called"]
        assert registry.for_model("codex", "gpt-5.6-sol").snapshot()["state"] == "closed"


async def test_spawn_agent_links_triggering_message_turn():
    agent_manager = MagicMock()
    agent_manager.spawn.return_value = "agent42"
    deps = _deps(agent_manager=agent_manager)
    tools = AgentTaskTools(deps)
    message = _message()
    message.id = 4242

    result = await tools._handle_spawn_agent(
        message, {"label": "linked", "goal": "work"}
    )

    assert not result.startswith("Error")
    assert deps.agent_manager.spawn.call_args.kwargs["turn_id"] == "4242"


class TestAstraSpawnBoundary:
    """gpt-6-astra per-spawn: accepted as an override, and the spawn boundary
    rejects the one pair it cannot serve (effort none) through the shared
    validator — never a per-model comparison scattered at the call site."""

    @staticmethod
    def _cfg(agent_model=None, agent_effort=None):
        return SimpleNamespace(
            openai_codex=SimpleNamespace(
                agent_model=agent_model, agent_reasoning_effort=agent_effort
            )
        )

    def test_override_parsed_on_auto_axes(self):
        from src.discord.native_tools.agents_tasks import _parse_spawn_overrides

        model, effort, err = _parse_spawn_overrides(
            {"model": "gpt-6-astra", "reasoning_effort": "max"},
            model_mode="auto", effort_mode="auto",
        )
        assert (model, effort, err) == ("gpt-6-astra", "max", None)

    def test_pair_boundary_rejects_none_accepts_max(self):
        from src.discord.native_tools.agents_tasks import _spawn_pair_error

        client = _FakeEffortClient()
        err = _spawn_pair_error(self._cfg(), client, "gpt-6-astra", "none")
        assert err is not None and "gpt-6-astra" in err and "'none'" in err
        assert _spawn_pair_error(self._cfg(), client, "gpt-6-astra", "max") is None
        # Inherited pair: a fixed astra agent model under a "none" main effort
        # is caught the same way (override beats fixed beats inherited-main).
        client.reasoning_effort = "none"
        err = _spawn_pair_error(self._cfg(agent_model="gpt-6-astra"), client, None, None)
        assert err is not None and "gpt-6-astra" in err
