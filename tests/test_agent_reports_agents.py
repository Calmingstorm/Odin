"""Who receives reports, agent catalogs, agent receivers and refused callers.

Agent loops run through the real ``_run_agent`` and tool cycle with fake
providers; refused callers go through the real dispatch wrapper.
Contract: docs/agent-transcript-contract.md "Upward reports".
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.agents.execution_context import AgentDispatch, agent_dispatch
from src.agents.manager import AgentInfo, AgentManager, AgentState, _run_agent
from src.agents.reports import (
    CLOSED_RECEIPT,
    NOT_AGENT_RECEIPT,
    STOPPING_RECEIPT,
    ReportTarget,
    admit_report,
)
from src.audit.tool_context import _pending_observers
from src.discord.channel_state import ChannelStateRegistry
from src.discord.tool_loop import _LoopMessageProxy
from src.llm.strict_tool_adapter import RequestToolAdapter
from src.tools.affordances import Cost, Latency, Risk, get_affordance
from src.tools.agent_tool_policy import with_agent_only_tools
from src.tools.builtin_policy import BUILTIN_TOOL_NAMES, BuiltinToolPolicy
from src.tools.defs.agent_only import AGENT_ONLY_TOOL_NAMES, agent_only_definitions
from src.tools.effect_classifier import ToolEffectClass, classify_tool_effect
from src.tools.nested_payload import validate_nested_payload
from src.tools.recovery import UNSAFE_TO_RETRY
from src.tools.registry import TOOL_MAP
from src.tools.skill_manager import validate_skill_definition
from tests.fakes import FakeMessage, make_bot
from tests.test_native_agents_tasks import _cfg, _message, _tools


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def _agent(agent_id: str, *, target: ReportTarget | None = None, label: str | None = None):
    return AgentInfo(
        id=agent_id,
        label=label or agent_id,
        goal="g",
        channel_id="42",
        requester_id="7",
        requester_name="user",
        report_target=target,
    )


def _registry(*agents: AgentInfo) -> AgentManager:
    manager = AgentManager()
    for agent in agents:
        manager._agents[agent.id] = agent
    return manager


def _report(manager: AgentManager, sender: AgentInfo, text: str, call_id: str = "c1"):
    return admit_report(
        AgentDispatch(sender, {"id": call_id}),
        text,
        lambda target: manager.report_endpoint(target.agent_id),
    )


class TestBindingAtSpawn:
    async def _spawn(self, message, inp, *, dispatching=None, agents=None):
        t = _tools()
        t._agent_manager.spawn.return_value = "child-1"
        t._agent_manager._agents = agents or {}
        if dispatching is None:
            await t._handle_spawn_agent(message, inp)
        else:
            with agent_dispatch(dispatching, {"id": "spawn-call"}):
                await t._handle_spawn_agent(message, inp)
        return t._agent_manager.spawn.call_args.kwargs

    async def test_a_chat_or_api_turn_receives_by_its_owner_key(self):
        message = SimpleNamespace(
            id=5001, channel=SimpleNamespace(id=42), author=SimpleNamespace(id=7)
        )
        kwargs = await self._spawn(message, {"label": "c", "goal": "g"})
        assert kwargs["report_target"] == ReportTarget.for_turn("42", "5001")

    async def test_a_chat_chosen_parent_changes_tree_accounting_not_the_receiver(self):
        message = SimpleNamespace(
            id=5002, channel=SimpleNamespace(id=42), author=SimpleNamespace(id=7)
        )
        parent = SimpleNamespace(depth=0, max_depth=2)
        kwargs = await self._spawn(
            message, {"label": "c", "goal": "g", "parent_id": "other"}, agents={"other": parent}
        )
        assert kwargs["parent_id"] == "other"
        assert kwargs["report_target"] == ReportTarget.for_turn("42", "5002")

    async def test_schedule_and_loop_roots_have_no_receiver(self):
        proxy = _LoopMessageProxy(SimpleNamespace(id=42), "7", "loop")
        assert (await self._spawn(proxy, {"label": "c", "goal": "g"}))["report_target"] is None
        assert (await self._spawn(_message(), {"label": "c", "goal": "g"}))["report_target"] is None

    async def test_an_agents_own_tool_cycle_binds_to_that_agent_not_to_input(self):
        invoker = _agent("invoker")
        proxy = _LoopMessageProxy(SimpleNamespace(id=42), "7", "agent")
        kwargs = await self._spawn(
            proxy,
            {"label": "c", "goal": "g", "parent_id": "forged"},
            dispatching=invoker,
            agents={"forged": SimpleNamespace(depth=0, max_depth=2)},
        )
        assert kwargs["report_target"] == ReportTarget.for_agent("invoker")

    async def test_the_turn_id_ancestry_is_never_the_destination(self):
        # A grandchild inherits turn_id from its parent, but reports to the parent.
        manager = AgentManager()
        root_target = ReportTarget.for_turn("42", "5003")
        parent_id = manager.spawn(
            label="p",
            goal="g",
            channel_id="42",
            requester_id="7",
            requester_name="u",
            iteration_callback=AsyncMock(),
            tool_executor_callback=AsyncMock(),
            turn_id="5003",
            report_target=root_target,
        )
        child_id = manager.spawn(
            label="c",
            goal="g",
            channel_id="42",
            requester_id="7",
            requester_name="u",
            iteration_callback=AsyncMock(),
            tool_executor_callback=AsyncMock(),
            parent_id=parent_id,
            report_target=ReportTarget.for_agent(parent_id),
        )
        child = manager._agents[child_id]
        assert child.turn_id == "5003"
        assert child.report_target == ReportTarget.for_agent(parent_id)
        for agent in manager._agents.values():
            AgentManager._force_cancel(agent)
        await asyncio.gather(*(a._task for a in manager._agents.values()), return_exceptions=True)


class TestAgentCatalogs:
    async def test_every_depth_gets_the_tool_including_the_maximum(self):
        cfg = _cfg()
        cfg.agents.max_nesting_depth = 1
        t = _tools(
            get_config=lambda: cfg,
            tool_catalog=SimpleNamespace(
                merged_definitions=lambda: [{"name": "spawn_agent"}, {"name": "run_command"}]
            ),
        )
        t._agent_manager.spawn.return_value = "child-1"
        t._agent_manager._agents = {"p": SimpleNamespace(depth=0, max_depth=1)}
        await t._handle_spawn_agent(_message(), {"label": "c", "goal": "g", "parent_id": "p"})
        names = [tool["name"] for tool in t._agent_manager.spawn.call_args.kwargs["tools"]]
        assert names == ["run_command", "report_to_parent"]  # max depth: no agent tools

    def test_operator_disable_and_tools_off_remove_it(self):
        enabled = SimpleNamespace(tools=SimpleNamespace(enabled=True, disabled_tools=[]))
        assert [t["name"] for t in with_agent_only_tools([], enabled)] == ["report_to_parent"]
        disabled = SimpleNamespace(
            tools=SimpleNamespace(enabled=True, disabled_tools=[" report_to_parent "])
        )
        assert with_agent_only_tools([{"name": "x"}], disabled) == [{"name": "x"}]
        off = SimpleNamespace(tools=SimpleNamespace(enabled=False, disabled_tools=[]))
        assert with_agent_only_tools([{"name": "x"}], off) == [{"name": "x"}]

    def test_composition_uses_fresh_decorated_copies(self):
        first, second = agent_only_definitions(), agent_only_definitions()
        assert first == second and first[0] is not second[0]
        first[0]["description"] = "mutated"
        assert agent_only_definitions()[0]["description"].endswith(
            "[affordances: cost=low risk=low latency=fast]"
        )

    def test_the_main_catalog_never_carries_it(self):
        bot = make_bot(config_overrides={"agents": {"model": None}})
        names = {tool["name"] for tool in bot.tool_catalog.merged_definitions()}
        assert "report_to_parent" not in names and "report_to_parent" not in TOOL_MAP
        assert "spawn_agent" in names


class TestPolicyAndWire:
    def test_reserved_disableable_effect_capable_never_retried(self):
        assert AGENT_ONLY_TOOL_NAMES == {"report_to_parent"} <= BUILTIN_TOOL_NAMES
        policy = BuiltinToolPolicy(
            lambda: SimpleNamespace(tools=SimpleNamespace(disabled_tools=["report_to_parent"]))
        )
        assert policy.is_disabled("report_to_parent")
        assert classify_tool_effect("report_to_parent") == ToolEffectClass.EXTERNAL_EFFECT_CAPABLE
        assert "report_to_parent" in UNSAFE_TO_RETRY
        assert get_affordance("report_to_parent").cost == Cost.LOW
        assert get_affordance("report_to_parent").risk == Risk.LOW
        assert get_affordance("report_to_parent").latency == Latency.FAST

    def test_no_skill_can_take_the_name(self):
        with pytest.raises(ValueError, match="conflicts with a built-in tool"):
            validate_skill_definition(
                {
                    "name": "report_to_parent",
                    "description": "d",
                    "input_schema": {"type": "object", "properties": {}},
                }
            )

    def test_strict_wire_round_trip_and_no_forged_fields(self):
        adapter = RequestToolAdapter(agent_only_definitions())
        (wire,) = adapter.wire_tools
        assert wire["strict"] is True
        assert adapter.accept("report_to_parent", {"message": "found it"}) == {
            "message": "found it"
        }
        with pytest.raises(ValueError):
            adapter.accept("report_to_parent", {"message": "x", "agent_id": "root"})


class TestRefusedCallers:
    async def test_main_turn_and_loop_calls_through_the_real_wrapper(self):
        bot = make_bot()
        for message in (
            FakeMessage("chat", id=6001),
            _LoopMessageProxy(SimpleNamespace(id=99), "12345", "loop"),
        ):
            result = await bot.tool_loop.dispatch_loop_tool(
                "report_to_parent", {"message": "hi"}, message, "12345"
            )
            assert not result.ok and result.output.endswith(NOT_AGENT_RECEIPT)

    async def test_skills_and_delegated_payloads_cannot_reach_it(self):
        bot = make_bot()
        skill_route = await bot.tool_executor.execute(
            "report_to_parent", {"message": "hi"}, user_id="12345"
        )
        assert not skill_route.ok and "Unknown tool" in skill_route.output
        with pytest.raises(ValueError):
            validate_nested_payload(
                "delegate_task",
                {"steps": [{"tool_name": "report_to_parent", "tool_input": {"message": "x"}}]},
                bot.tool_catalog.merged_definitions(),
            )

    async def test_an_operator_disable_refuses_at_dispatch(self):
        bot = make_bot(config_overrides={"tools": {"disabled_tools": ["report_to_parent"]}})
        result, _effects = await bot.native_tools.dispatch(
            "report_to_parent",
            {"message": "x"},
            message=FakeMessage("x", id=1),
            user_id="12345",
            skill_file_delivery="stage",
        )
        assert not result.ok and result.error == "tool_disabled"


class TestAgentReceivers:
    async def test_child_reports_drain_at_the_parent_loop_head_as_one_message(self):
        parent = _agent("parent")
        first = _agent("first", target=ReportTarget.for_agent("parent"))
        second = _agent("second", target=ReportTarget.for_agent("parent"))
        manager = _registry(parent, first, second)
        seen: list = []

        async def callback(messages, *args, **kwargs):
            if parent.iteration_count == 1:
                assert _report(manager, second, "two-a").ok
                assert _report(manager, first, "one").ok
                assert _report(manager, second, "two-b").ok
                return {"tool_calls": [{"id": "t1", "name": "noop", "input": {}}]}
            seen.extend(m for m in messages if m.get("provenance") == "agent_report")
            return {"text": "done"}

        stamp: list = []

        async def execute(name, inp):
            stamp.append(parent.last_activity)
            return "ok"

        await _run_agent(parent, "", [], callback, execute)
        (message,) = seen
        lines = [json.loads(line) for line in message["content"].split("\n")[1:]]
        assert [(x["agent_id"], x["report"]) for x in lines] == [
            ("second", "two-a"),
            ("first", "one"),
            ("second", "two-b"),
        ]
        assert [x["report_sequence"] for x in lines] == [1, 2, 3]
        assert parent.state == AgentState.COMPLETED and parent.result == "done"

    async def test_a_report_never_wakes_a_parent_wait_but_a_parent_message_still_does(self):
        tools = _tools()
        manager = _registry()
        tools._agent_manager = manager
        waiter, worker = _agent("waiter"), _agent("worker", target=ReportTarget.for_agent("waiter"))
        manager._agents.update({waiter.id: waiter, worker.id: worker})
        worker.transition(AgentState.READY)
        token_started = asyncio.Event()

        async def run_wait():
            from src.agents.execution_context import waiting_agent

            token = waiting_agent.set(waiter)
            try:
                token_started.set()
                return await manager.wait_for_agents([worker.id], timeout=5, poll_interval=5)
            finally:
                waiting_agent.reset(token)

        task = asyncio.create_task(run_wait())
        await token_started.wait()
        await asyncio.sleep(0.05)
        assert _report(manager, worker, "progress").ok
        await asyncio.sleep(0.1)
        assert not task.done() and not waiter._inbox_event.is_set()
        manager.send(waiter.id, "parent correction")
        results = await asyncio.wait_for(task, 2)
        assert results[worker.id]["wait_interrupted"] == "parent_message"

    async def test_reports_ride_ahead_of_a_consumed_parent_message(self):
        parent = _agent("parent")
        child = _agent("child", target=ReportTarget.for_agent("parent"))
        manager = _registry(parent, child)
        seen: list = []

        async def callback(messages, *args, **kwargs):
            if parent.iteration_count == 1:
                return {"tool_calls": [{"id": "t1", "name": "noop", "input": {}}]}
            seen.extend(m.get("provenance") for m in messages)
            return {"text": "done"}

        async def execute(name, inp):
            assert _report(manager, child, "evidence").ok
            manager.send(parent.id, "change course")
            return "ok"

        await _run_agent(parent, "", [], callback, execute)
        # Consumed at the post-tools checkpoint: the report first, the correction last.
        assert seen[-2:] == ["agent_report", "agent_parent"]

    async def test_reports_never_count_as_a_parent_correction_at_the_last_iteration(self):
        parent = _agent("parent")
        child = _agent("child", target=ReportTarget.for_agent("parent"))
        manager = _registry(parent, child)

        async def callback(messages, *args, **kwargs):
            assert _report(manager, child, "late evidence").ok  # during the final generation
            return {"text": "final"}

        await _run_agent(parent, "", [], callback, AsyncMock(), max_iterations=1)
        assert parent.state == AgentState.COMPLETED and parent.result == "final"
        assert parent.error == ""

    async def test_terminal_settlement_closes_synchronously_and_exports_records(self):
        parent = _agent("parent")
        child = _agent("child", target=ReportTarget.for_agent("parent"))
        manager = _registry(parent, child)
        saver = SimpleNamespace(save=AsyncMock())

        async def callback(messages, *args, **kwargs):
            assert _report(manager, child, "never read").ok
            assert parent.activity()["pending_child_report_count"] == 1
            return {"text": "finished first"}

        await _run_agent(parent, "", [], callback, AsyncMock(), trajectory_saver=saver)
        refused = _report(manager, child, "after the end")
        assert refused.output == CLOSED_RECEIPT
        assert refused.audit_metadata["report_closed_reason"] == "terminal_parent"
        saved = saver.save.call_args.args[0].to_dict()
        assert saved["reports"]["totals"] == {"queued": 1, "consumed": 0, "closed": 1}
        assert saved["reports"]["events"][-1]["reason"] == "terminal_parent"
        assert saved["activity"]["pending_child_report_count"] == 0

    async def test_no_reports_means_no_trajectory_key(self):
        agent = _agent("quiet")
        saver = SimpleNamespace(save=AsyncMock())
        await _run_agent(
            agent,
            "",
            [],
            AsyncMock(return_value={"text": "ok"}),
            AsyncMock(),
            trajectory_saver=saver,
        )
        saved = saver.save.call_args.args[0].to_dict()
        assert "reports" not in saved
        assert saved["activity"]["pending_child_report_count"] == 0

    async def test_the_handler_resolves_both_receiver_kinds_and_refuses_outsiders(self):
        tools = _tools()
        manager = _registry()
        tools._agent_manager = manager
        tools._channel_state = ChannelStateRegistry()
        parent = _agent("parent")
        child = _agent("child", target=ReportTarget.for_agent("parent"))
        orphan = _agent("orphan", target=ReportTarget.for_turn("1", "finished-turn"))
        manager._agents.update({parent.id: parent, child.id: child, orphan.id: orphan})
        with agent_dispatch(child, {"id": "c1"}):
            queued = tools._handle_report_to_parent({"message": "via handler"})
        assert queued.ok and [item.body for item in parent._reports.pending] == ["via handler"]
        with agent_dispatch(orphan, {"id": "c2"}):
            assert tools._handle_report_to_parent({"message": "x"}).output == CLOSED_RECEIPT
        assert tools._handle_report_to_parent({"message": "x"}).output == NOT_AGENT_RECEIPT

    async def test_stop_requested_refuses_before_the_terminal_transition(self):
        parent = _agent("parent")
        child = _agent("child", target=ReportTarget.for_agent("parent"))
        manager = _registry(parent, child)
        parent._cancel_event.set()
        assert _report(manager, child, "x").output == STOPPING_RECEIPT
        parent.transition(AgentState.KILLED, "stop")
        assert _report(manager, child, "x").output == CLOSED_RECEIPT

    async def test_unstarted_cancellation_closes_and_eviction_is_not_the_closure(self):
        manager = AgentManager()
        parent_id = manager.spawn(
            label="p",
            goal="g",
            channel_id="42",
            requester_id="7",
            requester_name="u",
            iteration_callback=AsyncMock(),
            tool_executor_callback=AsyncMock(),
        )
        parent = manager._agents[parent_id]
        child = _agent("child", target=ReportTarget.for_agent(parent_id))
        parent._task.cancel()  # cancelled before the coroutine ever ran
        await asyncio.gather(parent._task, return_exceptions=True)
        await asyncio.sleep(0)
        assert parent.state == AgentState.KILLED and parent_id in manager._agents
        assert not parent._reports.accepting
        assert _report(manager, child, "x").audit_metadata["report_closed_reason"] == (
            "terminal_parent"
        )
        for task in list(manager._cleanup_tasks.values()):
            task.cancel()
        await asyncio.gather(*manager._cleanup_tasks.values(), return_exceptions=True)

    async def test_two_children_interleave_fifo_by_admission(self):
        parent = _agent("parent")
        manager = _registry(parent)
        children = [_agent(f"c{n}", target=ReportTarget.for_agent("parent")) for n in range(3)]
        for n in range(6):
            assert _report(manager, children[n % 3], f"r{n}").ok
        assert [item.body for item in parent._reports.pending] == [f"r{n}" for n in range(6)]
        assert parent.drain_reports() and not parent._reports.pending


class TestThroughTheAgentDispatchPath:
    async def _run_reporting_agent(self, bot, *, audit_gate=None):
        registry: ChannelStateRegistry = bot.channel_state
        registry.set_active_request("99", "7001")
        from src.discord.channel_state import ChatTurnInbox

        inbox = ChatTurnInbox(requester_id="12345")
        registry.bind_steer_inbox("99", "7001", inbox)
        agent = AgentInfo(
            id="sender",
            label="sender",
            goal="g",
            channel_id="99",
            requester_id="12345",
            requester_name="u",
            report_target=ReportTarget.for_turn("99", "7001"),
            messages=[{"role": "user", "content": "g"}],
        )
        bot.agent_manager._agents[agent.id] = agent
        proxy = _LoopMessageProxy(SimpleNamespace(id=99), "12345", "u")

        async def execute(name, inp):
            return await bot.tool_loop.dispatch_loop_tool(name, inp, proxy, "12345")

        calls = [
            {"id": "r1", "name": "report_to_parent", "input": {"message": "via wrapper"}},
            {"id": "r2", "name": "report_to_parent", "input": {"message": ""}},
        ]
        callback = AsyncMock(side_effect=[{"tool_calls": calls}, {"text": "done"}])
        await asyncio.wait_for(_run_agent(agent, "", [], callback, execute), 5)
        return agent, inbox

    async def test_receipts_and_typed_failures_survive_delivery_and_the_transcript(self):
        bot = make_bot()
        agent, inbox = await self._run_reporting_agent(bot)
        results = agent.messages[2]["content"]
        assert results[0]["status"] == "succeeded"
        assert results[0]["content"].startswith("Report queued for the conversation")
        assert results[1]["status"] == "failed" and results[1]["is_error"]
        assert "Not queued: the report is empty." in results[1]["content"]
        assert [item.body for item in inbox.reports.pending] == ["via wrapper"]

    async def test_a_stalled_audit_sink_neither_delays_admission_nor_invents_failure(self):
        bot = make_bot()
        stalled = asyncio.Event()

        async def hang(*args, **kwargs):
            await stalled.wait()

        bot.tool_loop._audit = MagicMock(log_event=hang, log_execution=hang)
        try:
            agent, inbox = await self._run_reporting_agent(bot)
            assert agent.messages[2]["content"][0]["status"] == "succeeded"
            assert len(inbox.reports.pending) == 1
        finally:
            stalled.set()
            await asyncio.gather(*list(_pending_observers), return_exceptions=True)
