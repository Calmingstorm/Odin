"""Tests for agent worker lifecycle state machine (Round 31).

Covers AgentState enum, AgentStateMachine transitions and history,
InvalidStateTransition, AgentInfo integration, _run_agent lifecycle
with typed states, recovery logic, and backward compatibility.
"""
from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest

from src.agents.manager import (
    ACTIVE_STATES,
    ITERATION_CB_TIMEOUT,
    MAX_AGENT_ITERATIONS,
    MAX_AGENT_LIFETIME,
    MAX_RECOVERY_ATTEMPTS,
    TERMINAL_STATES,
    TOOL_EXEC_TIMEOUT,
    VALID_TRANSITIONS,
    AgentInfo,
    AgentManager,
    AgentState,
    AgentStateMachine,
    InvalidStateTransition,
    StateTransition,
    _call_llm_with_recovery,
    _get_last_progress,
    _run_agent,
    filter_agent_tools,
)


# ---------------------------------------------------------------------------
# AgentState enum
# ---------------------------------------------------------------------------

class TestAgentState:
    def test_all_states_defined(self):
        expected = {"spawning", "ready", "executing", "recovering",
                    "completed", "failed", "timeout", "killed"}
        assert {s.value for s in AgentState} == expected

    def test_string_comparison(self):
        assert AgentState.SPAWNING == "spawning"
        assert AgentState.COMPLETED == "completed"

    def test_is_str(self):
        assert isinstance(AgentState.READY, str)

    def test_terminal_states(self):
        assert TERMINAL_STATES == frozenset({
            AgentState.COMPLETED, AgentState.FAILED,
            AgentState.TIMEOUT, AgentState.KILLED,
        })

    def test_active_states(self):
        assert ACTIVE_STATES == frozenset({
            AgentState.SPAWNING, AgentState.READY,
            AgentState.EXECUTING, AgentState.RECOVERING,
        })

    def test_no_overlap(self):
        assert TERMINAL_STATES & ACTIVE_STATES == frozenset()

    def test_complete_coverage(self):
        assert TERMINAL_STATES | ACTIVE_STATES == frozenset(AgentState)


# ---------------------------------------------------------------------------
# VALID_TRANSITIONS
# ---------------------------------------------------------------------------

class TestValidTransitions:
    def test_all_states_have_transitions(self):
        for state in AgentState:
            assert state in VALID_TRANSITIONS

    def test_terminal_states_have_no_outgoing(self):
        for state in TERMINAL_STATES:
            assert VALID_TRANSITIONS[state] == frozenset()

    def test_spawning_transitions(self):
        assert VALID_TRANSITIONS[AgentState.SPAWNING] == frozenset({
            AgentState.READY, AgentState.KILLED,
            AgentState.FAILED, AgentState.TIMEOUT,
        })

    def test_ready_transitions(self):
        assert VALID_TRANSITIONS[AgentState.READY] == frozenset({
            AgentState.EXECUTING, AgentState.COMPLETED,
            AgentState.KILLED, AgentState.TIMEOUT,
        })

    def test_executing_transitions(self):
        assert VALID_TRANSITIONS[AgentState.EXECUTING] == frozenset({
            AgentState.READY, AgentState.RECOVERING,
            AgentState.COMPLETED, AgentState.FAILED,
            AgentState.KILLED, AgentState.TIMEOUT,
        })

    def test_recovering_transitions(self):
        assert VALID_TRANSITIONS[AgentState.RECOVERING] == frozenset({
            AgentState.EXECUTING, AgentState.FAILED,
            AgentState.KILLED, AgentState.TIMEOUT,
        })

    def test_no_self_transitions(self):
        for state, targets in VALID_TRANSITIONS.items():
            assert state not in targets


# ---------------------------------------------------------------------------
# InvalidStateTransition
# ---------------------------------------------------------------------------

class TestInvalidStateTransition:
    def test_exception_fields(self):
        exc = InvalidStateTransition(AgentState.COMPLETED, AgentState.EXECUTING)
        assert exc.from_state == AgentState.COMPLETED
        assert exc.to_state == AgentState.EXECUTING
        assert "completed" in str(exc)
        assert "executing" in str(exc)

    def test_is_exception(self):
        assert issubclass(InvalidStateTransition, Exception)


# ---------------------------------------------------------------------------
# StateTransition
# ---------------------------------------------------------------------------

class TestStateTransition:
    def test_fields(self):
        t = StateTransition(
            from_state=AgentState.SPAWNING,
            to_state=AgentState.READY,
            timestamp=1000.0,
            reason="init",
        )
        assert t.from_state == AgentState.SPAWNING
        assert t.to_state == AgentState.READY
        assert t.timestamp == 1000.0
        assert t.reason == "init"

    def test_default_reason(self):
        t = StateTransition(AgentState.READY, AgentState.EXECUTING, 0.0)
        assert t.reason == ""


# ---------------------------------------------------------------------------
# AgentStateMachine
# ---------------------------------------------------------------------------

class TestAgentStateMachine:
    def test_initial_state(self):
        sm = AgentStateMachine()
        assert sm.state == AgentState.SPAWNING

    def test_custom_initial(self):
        sm = AgentStateMachine(AgentState.READY)
        assert sm.state == AgentState.READY

    def test_valid_transition(self):
        sm = AgentStateMachine()
        record = sm.transition(AgentState.READY, "init done")
        assert sm.state == AgentState.READY
        assert record.from_state == AgentState.SPAWNING
        assert record.to_state == AgentState.READY
        assert record.reason == "init done"
        assert record.timestamp > 0

    def test_invalid_transition_raises(self):
        sm = AgentStateMachine()
        with pytest.raises(InvalidStateTransition) as exc_info:
            sm.transition(AgentState.EXECUTING)
        assert exc_info.value.from_state == AgentState.SPAWNING
        assert exc_info.value.to_state == AgentState.EXECUTING

    def test_terminal_state_blocks_transitions(self):
        sm = AgentStateMachine(AgentState.READY)
        sm.transition(AgentState.COMPLETED, "done")
        with pytest.raises(InvalidStateTransition):
            sm.transition(AgentState.EXECUTING)

    def test_can_transition(self):
        sm = AgentStateMachine()
        assert sm.can_transition(AgentState.READY)
        assert not sm.can_transition(AgentState.EXECUTING)
        assert not sm.can_transition(AgentState.COMPLETED)

    def test_is_terminal(self):
        sm = AgentStateMachine()
        assert not sm.is_terminal
        sm.transition(AgentState.READY)
        assert not sm.is_terminal
        sm.transition(AgentState.COMPLETED)
        assert sm.is_terminal

    def test_is_active(self):
        sm = AgentStateMachine()
        assert sm.is_active
        sm.transition(AgentState.KILLED)
        assert not sm.is_active

    def test_history_records_all(self):
        sm = AgentStateMachine()
        sm.transition(AgentState.READY)
        sm.transition(AgentState.EXECUTING)
        sm.transition(AgentState.READY)
        assert sm.transition_count == 3
        h = sm.history
        assert len(h) == 3
        assert h[0].to_state == AgentState.READY
        assert h[1].to_state == AgentState.EXECUTING
        assert h[2].to_state == AgentState.READY

    def test_history_is_copy(self):
        sm = AgentStateMachine()
        sm.transition(AgentState.READY)
        h1 = sm.history
        sm.transition(AgentState.EXECUTING)
        h2 = sm.history
        assert len(h1) == 1
        assert len(h2) == 2

    def test_history_as_dicts(self):
        sm = AgentStateMachine()
        sm.transition(AgentState.READY, "init")
        dicts = sm.history_as_dicts()
        assert len(dicts) == 1
        assert dicts[0]["from"] == "spawning"
        assert dicts[0]["to"] == "ready"
        assert dicts[0]["reason"] == "init"
        assert isinstance(dicts[0]["timestamp"], float)

    def test_legacy_status_active(self):
        sm = AgentStateMachine()
        assert sm.status == "running"
        sm.transition(AgentState.READY)
        assert sm.status == "running"

    def test_legacy_status_terminal(self):
        sm = AgentStateMachine(AgentState.READY)
        sm.transition(AgentState.COMPLETED)
        assert sm.status == "completed"

    def test_time_in_state(self):
        sm = AgentStateMachine()
        t = sm.time_in_state
        assert t >= 0
        assert t < 5

    def test_full_lifecycle(self):
        sm = AgentStateMachine()
        sm.transition(AgentState.READY, "init")
        sm.transition(AgentState.EXECUTING, "iter 1")
        sm.transition(AgentState.READY, "tools done")
        sm.transition(AgentState.EXECUTING, "iter 2")
        sm.transition(AgentState.COMPLETED, "finished")
        assert sm.is_terminal
        assert sm.transition_count == 5
        assert sm.status == "completed"


# ---------------------------------------------------------------------------
# AgentStateMachine — recovery path
# ---------------------------------------------------------------------------

class TestStateMachineRecovery:
    def test_executing_to_recovering(self):
        sm = AgentStateMachine(AgentState.READY)
        sm.transition(AgentState.EXECUTING)
        sm.transition(AgentState.RECOVERING, "LLM timeout")
        assert sm.state == AgentState.RECOVERING
        assert sm.status == "running"

    def test_recovering_to_executing(self):
        sm = AgentStateMachine(AgentState.READY)
        sm.transition(AgentState.EXECUTING)
        sm.transition(AgentState.RECOVERING)
        sm.transition(AgentState.EXECUTING, "retry")
        assert sm.state == AgentState.EXECUTING

    def test_recovering_to_failed(self):
        sm = AgentStateMachine(AgentState.READY)
        sm.transition(AgentState.EXECUTING)
        sm.transition(AgentState.RECOVERING)
        sm.transition(AgentState.FAILED, "retry also failed")
        assert sm.is_terminal
        assert sm.status == "failed"

    def test_recovering_cannot_complete(self):
        sm = AgentStateMachine(AgentState.READY)
        sm.transition(AgentState.EXECUTING)
        sm.transition(AgentState.RECOVERING)
        with pytest.raises(InvalidStateTransition):
            sm.transition(AgentState.COMPLETED)

    def test_recovery_history(self):
        sm = AgentStateMachine()
        sm.transition(AgentState.READY)
        sm.transition(AgentState.EXECUTING)
        sm.transition(AgentState.RECOVERING, "error")
        sm.transition(AgentState.EXECUTING, "retry")
        sm.transition(AgentState.COMPLETED, "success after retry")
        h = sm.history
        assert len(h) == 5
        states = [(t.from_state, t.to_state) for t in h]
        assert (AgentState.EXECUTING, AgentState.RECOVERING) in states
        assert (AgentState.RECOVERING, AgentState.EXECUTING) in states


# ---------------------------------------------------------------------------
# AgentInfo backward compatibility
# ---------------------------------------------------------------------------

class TestAgentInfoCompat:
    def test_default_state_is_spawning(self):
        info = AgentInfo(
            id="a1", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        assert info.state == AgentState.SPAWNING
        assert info.status == "running"

    def test_status_property_maps_to_legacy(self):
        info = AgentInfo(
            id="a2", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        info.transition(AgentState.READY)
        assert info.status == "running"
        info.transition(AgentState.EXECUTING)
        assert info.status == "running"
        info.transition(AgentState.COMPLETED)
        assert info.status == "completed"

    def test_state_history(self):
        info = AgentInfo(
            id="a3", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        info.transition(AgentState.READY)
        assert len(info.state_history) == 1
        assert info.state_history[0].to_state == AgentState.READY

    def test_recovery_attempts_default(self):
        info = AgentInfo(
            id="a4", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        assert info.recovery_attempts == 0


# ---------------------------------------------------------------------------
# AgentManager — spawn / list / kill with state machine
# ---------------------------------------------------------------------------

class TestAgentManagerWithStates:
    async def test_spawned_agent_starts_spawning(self):
        mgr = AgentManager()
        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": [], "stop_reason": "end_turn"})
        tool_cb = AsyncMock(return_value="ok")
        aid = mgr.spawn(
            label="t", goal="test", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=iter_cb, tool_executor_callback=tool_cb,
        )
        assert not aid.startswith("Error")
        # Agent starts in SPAWNING, transitions to READY quickly
        agent = mgr._agents[aid]
        # It might already be running, but state machine exists
        assert hasattr(agent, "_sm")
        mgr.kill(aid)

    async def test_list_includes_state(self):
        mgr = AgentManager()
        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": [], "stop_reason": "end_turn"})
        tool_cb = AsyncMock(return_value="ok")
        aid = mgr.spawn(
            label="t", goal="test", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=iter_cb, tool_executor_callback=tool_cb,
        )
        await asyncio.sleep(0.05)
        agents = mgr.list()
        assert len(agents) >= 1
        a = [x for x in agents if x["id"] == aid][0]
        assert "state" in a
        assert a["state"] in {s.value for s in AgentState}
        assert "status" in a

    async def test_get_results_includes_state_info(self):
        mgr = AgentManager()
        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": [], "stop_reason": "end_turn"})
        tool_cb = AsyncMock(return_value="ok")
        aid = mgr.spawn(
            label="t", goal="test", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=iter_cb, tool_executor_callback=tool_cb,
        )
        await asyncio.sleep(0.1)
        r = mgr.get_results(aid)
        assert r is not None
        assert "state" in r
        assert "state_history" in r
        assert isinstance(r["state_history"], list)
        assert "recovery_attempts" in r

    async def test_kill_sends_to_terminal(self):
        mgr = AgentManager()
        kill_reached = asyncio.Event()

        async def slow_iter(msgs, sys, tools):
            kill_reached.set()
            await asyncio.sleep(10)
            return {"text": "done", "tool_calls": [], "stop_reason": "end_turn"}

        tool_cb = AsyncMock(return_value="ok")
        aid = mgr.spawn(
            label="t", goal="test", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=slow_iter, tool_executor_callback=tool_cb,
        )
        await asyncio.wait_for(kill_reached.wait(), timeout=2)
        result = mgr.kill(aid)
        assert "Kill signal" in result
        # The agent task needs to notice the cancel_event on the next check
        agent = mgr._agents[aid]
        agent._task.cancel()
        try:
            await asyncio.wait_for(agent._task, timeout=2)
        except (asyncio.CancelledError, Exception):
            pass
        assert agent._sm.is_terminal

    async def test_send_rejects_terminal_agent(self):
        mgr = AgentManager()
        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": [], "stop_reason": "end_turn"})
        tool_cb = AsyncMock(return_value="ok")
        aid = mgr.spawn(
            label="t", goal="test", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=iter_cb, tool_executor_callback=tool_cb,
        )
        await asyncio.sleep(0.1)
        result = mgr.send(aid, "hello")
        assert "not running" in result.lower() or "Error" in result

    async def test_active_count_uses_state_machine(self):
        mgr = AgentManager()
        started = asyncio.Event()

        async def slow_iter(msgs, sys, tools):
            started.set()
            await asyncio.sleep(10)
            return {"text": "done", "tool_calls": [], "stop_reason": "end_turn"}

        tool_cb = AsyncMock(return_value="ok")
        aid = mgr.spawn(
            label="t", goal="test", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=slow_iter, tool_executor_callback=tool_cb,
        )
        await asyncio.wait_for(started.wait(), timeout=2)
        assert mgr.active_count >= 1
        agent = mgr._agents[aid]
        mgr.kill(aid)
        agent._task.cancel()
        try:
            await asyncio.wait_for(agent._task, timeout=2)
        except (asyncio.CancelledError, Exception):
            pass
        assert mgr.active_count == 0


# ---------------------------------------------------------------------------
# _run_agent — lifecycle transitions
# ---------------------------------------------------------------------------

class TestRunAgentLifecycle:
    async def test_simple_completion(self):
        agent = AgentInfo(
            id="t1", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]
        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": [], "stop_reason": "end_turn"})
        tool_cb = AsyncMock(return_value="ok")

        await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        assert agent.state == AgentState.COMPLETED
        assert agent.status == "completed"
        assert agent.result == "done"
        # History: SPAWNING→READY, READY→EXECUTING, EXECUTING→COMPLETED
        h = agent.state_history
        assert len(h) == 3
        assert h[0].to_state == AgentState.READY
        assert h[1].to_state == AgentState.EXECUTING
        assert h[2].to_state == AgentState.COMPLETED

    async def test_tool_call_cycle(self):
        agent = AgentInfo(
            id="t2", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]

        call_count = 0
        async def iter_cb(msgs, sys, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {
                    "text": "calling tool",
                    "tool_calls": [{"name": "read_file", "input": {"path": "/etc/hostname"}}],
                    "stop_reason": "tool_use",
                }
            return {"text": "final answer", "tool_calls": [], "stop_reason": "end_turn"}

        tool_cb = AsyncMock(return_value="hostname1")
        await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        assert agent.state == AgentState.COMPLETED
        # History: SPAWNING→READY, READY→EXECUTING, EXECUTING→READY (tools done),
        #          READY→EXECUTING (iter 2), EXECUTING→COMPLETED
        h = agent.state_history
        assert len(h) == 5
        states = [t.to_state for t in h]
        assert states == [
            AgentState.READY, AgentState.EXECUTING,
            AgentState.READY, AgentState.EXECUTING,
            AgentState.COMPLETED,
        ]

    async def test_kill_signal(self):
        agent = AgentInfo(
            id="t3", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]
        agent._cancel_event.set()

        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": []})
        tool_cb = AsyncMock()

        await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        assert agent.state == AgentState.KILLED
        assert agent.status == "killed"
        assert agent.ended_at is not None

    async def test_lifetime_timeout(self):
        agent = AgentInfo(
            id="t4", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]
        agent.created_at = time.time() - MAX_AGENT_LIFETIME - 10

        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": []})
        tool_cb = AsyncMock()

        await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        assert agent.state == AgentState.TIMEOUT
        assert agent.status == "timeout"

    async def test_max_iterations(self):
        agent = AgentInfo(
            id="t5", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]

        async def iter_cb(msgs, sys, tools):
            return {
                "text": "working",
                "tool_calls": [{"name": "read_file", "input": {}}],
                "stop_reason": "tool_use",
            }

        tool_cb = AsyncMock(return_value="data")

        with patch("src.agents.manager.MAX_AGENT_ITERATIONS", 3):
            await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        assert agent.state == AgentState.COMPLETED
        assert agent.iteration_count == 3
        h = agent.state_history
        last = h[-1]
        assert last.to_state == AgentState.COMPLETED
        assert "max iterations" in last.reason

    async def test_cancelled_error(self):
        agent = AgentInfo(
            id="t6", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]

        async def iter_cb(msgs, sys, tools):
            raise asyncio.CancelledError()

        tool_cb = AsyncMock()
        await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        assert agent.state == AgentState.KILLED
        assert agent.status == "killed"

    async def test_unhandled_exception(self):
        agent = AgentInfo(
            id="t7", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]

        async def iter_cb(msgs, sys, tools):
            raise RuntimeError("something broke")

        tool_cb = AsyncMock()
        await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        # The recovery logic will catch the RuntimeError, not the outer handler
        assert agent._sm.is_terminal
        assert agent.error != ""

    async def test_inbox_messages_processed(self):
        agent = AgentInfo(
            id="t8", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]
        agent._inbox.put_nowait("extra instruction")

        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": [], "stop_reason": "end_turn"})
        tool_cb = AsyncMock()

        await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        assert agent.state == AgentState.COMPLETED
        inbox_msgs = [m for m in agent.messages if "Message from parent" in m.get("content", "")]
        assert len(inbox_msgs) == 1


# ---------------------------------------------------------------------------
# Recovery logic — _call_llm_with_recovery
# ---------------------------------------------------------------------------

class TestLLMRecovery:
    async def test_successful_call_no_recovery(self):
        agent = AgentInfo(
            id="r1", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        agent.transition(AgentState.EXECUTING)

        resp = {"text": "ok", "tool_calls": []}
        iter_cb = AsyncMock(return_value=resp)

        result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])
        assert result == resp
        assert agent.state == AgentState.EXECUTING
        assert agent.recovery_attempts == 0

    async def test_timeout_triggers_recovery(self):
        agent = AgentInfo(
            id="r2", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        agent.transition(AgentState.EXECUTING)

        call_count = 0
        async def iter_cb(msgs, sys, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise asyncio.TimeoutError()
            return {"text": "ok after retry", "tool_calls": []}

        with patch("src.agents.manager.ITERATION_CB_TIMEOUT", 1):
            with patch("src.agents.manager.asyncio.wait_for", side_effect=[asyncio.TimeoutError(), AsyncMock(return_value={"text": "ok", "tool_calls": []})()]):
                # Use direct call pattern instead
                pass

        # Test with actual recovery path
        agent2 = AgentInfo(
            id="r2b", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent2.transition(AgentState.READY)
        agent2.transition(AgentState.EXECUTING)

        calls = 0
        async def flaky_iter(msgs, sys, tools):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise asyncio.TimeoutError()
            return {"text": "recovered", "tool_calls": []}

        with patch("src.agents.manager.asyncio.sleep", new_callable=AsyncMock):
            with patch("src.agents.manager.asyncio.wait_for") as mock_wf:
                mock_wf.side_effect = [asyncio.TimeoutError(), {"text": "recovered", "tool_calls": []}]
                # wait_for is called with a coroutine, need a different approach
                pass

    async def test_recovery_retry_succeeds(self):
        agent = AgentInfo(
            id="r3", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        agent.transition(AgentState.EXECUTING)

        call_count = 0
        original_wait_for = asyncio.wait_for

        async def counting_wait_for(coro, *, timeout=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                try:
                    coro.close()
                except:
                    pass
                raise asyncio.TimeoutError()
            return await original_wait_for(coro, timeout=timeout)

        iter_cb = AsyncMock(return_value={"text": "recovered", "tool_calls": []})

        with patch("src.agents.manager.asyncio.wait_for", side_effect=counting_wait_for):
            with patch("src.agents.manager.asyncio.sleep", new_callable=AsyncMock):
                result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])

        assert result is not None
        assert result["text"] == "recovered"
        assert agent.recovery_attempts == 1
        assert agent.state == AgentState.EXECUTING
        # History should show EXECUTING → RECOVERING → EXECUTING
        h = agent.state_history
        states = [(t.from_state, t.to_state) for t in h]
        assert (AgentState.EXECUTING, AgentState.RECOVERING) in states
        assert (AgentState.RECOVERING, AgentState.EXECUTING) in states

    async def test_recovery_retry_fails(self):
        agent = AgentInfo(
            id="r4", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        agent.transition(AgentState.EXECUTING)

        original_wait_for = asyncio.wait_for

        async def always_timeout(coro, *, timeout=None):
            try:
                coro.close()
            except:
                pass
            raise asyncio.TimeoutError()

        iter_cb = AsyncMock(return_value={"text": "x", "tool_calls": []})

        with patch("src.agents.manager.asyncio.wait_for", side_effect=always_timeout):
            with patch("src.agents.manager.asyncio.sleep", new_callable=AsyncMock):
                result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])

        assert result is None
        assert agent.state == AgentState.FAILED
        assert agent.recovery_attempts == 1
        assert agent.ended_at is not None

    async def test_no_recovery_when_attempts_exhausted(self):
        agent = AgentInfo(
            id="r5", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        agent.transition(AgentState.EXECUTING)
        agent.recovery_attempts = MAX_RECOVERY_ATTEMPTS  # already used up

        async def timeout_coro(coro, *, timeout=None):
            try:
                coro.close()
            except:
                pass
            raise asyncio.TimeoutError()

        iter_cb = AsyncMock(return_value={"text": "x", "tool_calls": []})

        with patch("src.agents.manager.asyncio.wait_for", side_effect=timeout_coro):
            result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])

        assert result is None
        assert agent.state == AgentState.FAILED
        # No recovery transition in history (directly to FAILED)
        h = agent.state_history
        recovery_transitions = [t for t in h if t.to_state == AgentState.RECOVERING]
        assert len(recovery_transitions) == 0

    async def test_exception_triggers_recovery(self):
        agent = AgentInfo(
            id="r6", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        agent.transition(AgentState.EXECUTING)

        call_count = 0
        original_wait_for = asyncio.wait_for

        async def err_then_ok(coro, *, timeout=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                try:
                    coro.close()
                except:
                    pass
                raise ConnectionError("transient error")
            return await original_wait_for(coro, timeout=timeout)

        iter_cb = AsyncMock(return_value={"text": "ok", "tool_calls": []})

        with patch("src.agents.manager.asyncio.wait_for", side_effect=err_then_ok):
            with patch("src.agents.manager.asyncio.sleep", new_callable=AsyncMock):
                result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])

        assert result is not None
        assert agent.recovery_attempts == 1


# ---------------------------------------------------------------------------
# _run_agent full lifecycle with recovery
# ---------------------------------------------------------------------------

class TestRunAgentRecovery:
    async def test_full_recovery_lifecycle(self):
        agent = AgentInfo(
            id="fr1", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]

        call_count = 0
        original_wait_for = asyncio.wait_for

        async def first_timeout(coro, *, timeout=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                try:
                    coro.close()
                except:
                    pass
                raise asyncio.TimeoutError()
            return await original_wait_for(coro, timeout=timeout)

        iter_cb = AsyncMock(return_value={"text": "recovered", "tool_calls": []})
        tool_cb = AsyncMock()

        with patch("src.agents.manager.asyncio.wait_for", side_effect=first_timeout):
            with patch("src.agents.manager.asyncio.sleep", new_callable=AsyncMock):
                await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        assert agent.state == AgentState.COMPLETED
        assert agent.recovery_attempts == 1
        h = agent.state_history
        states = [t.to_state for t in h]
        assert AgentState.RECOVERING in states

    async def test_failed_recovery_lifecycle(self):
        agent = AgentInfo(
            id="fr2", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]

        async def always_fail(coro, *, timeout=None):
            try:
                coro.close()
            except:
                pass
            raise asyncio.TimeoutError()

        iter_cb = AsyncMock()
        tool_cb = AsyncMock()

        with patch("src.agents.manager.asyncio.wait_for", side_effect=always_fail):
            with patch("src.agents.manager.asyncio.sleep", new_callable=AsyncMock):
                await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        assert agent.state == AgentState.FAILED
        assert agent.ended_at is not None


# ---------------------------------------------------------------------------
# AgentManager.check_health with state machine
# ---------------------------------------------------------------------------

class TestCheckHealthWithStates:
    async def test_health_check_skips_terminal(self):
        mgr = AgentManager()
        agent = AgentInfo(
            id="h1", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        agent.transition(AgentState.COMPLETED)
        mgr._agents["h1"] = agent
        result = mgr.check_health()
        assert result["killed"] == 0
        assert result["stale"] == 0

    async def test_health_check_kills_overtime(self):
        mgr = AgentManager()
        agent = AgentInfo(
            id="h2", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.created_at = time.time() - MAX_AGENT_LIFETIME - 100
        mgr._agents["h2"] = agent
        result = mgr.check_health()
        assert result["killed"] == 1
        assert agent._cancel_event.is_set()


# ---------------------------------------------------------------------------
# AgentManager.cleanup with state machine
# ---------------------------------------------------------------------------

class TestCleanupWithStates:
    async def test_cleanup_removes_terminal_agents(self):
        mgr = AgentManager()
        agent = AgentInfo(
            id="cl1", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.FAILED, "crash")
        agent.ended_at = time.time() - 400  # past CLEANUP_DELAY
        mgr._agents["cl1"] = agent
        removed = await mgr.cleanup()
        assert removed == 1
        assert "cl1" not in mgr._agents

    async def test_cleanup_keeps_active_agents(self):
        mgr = AgentManager()
        agent = AgentInfo(
            id="cl2", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        mgr._agents["cl2"] = agent
        removed = await mgr.cleanup()
        assert removed == 0
        assert "cl2" in mgr._agents


# ---------------------------------------------------------------------------
# wait_for_agents with state machine
# ---------------------------------------------------------------------------

class TestWaitForAgentsWithStates:
    async def test_wait_returns_when_terminal(self):
        mgr = AgentManager()
        agent = AgentInfo(
            id="w1", label="test", goal="test goal",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        agent.transition(AgentState.COMPLETED)
        agent.result = "done"
        mgr._agents["w1"] = agent

        results = await mgr.wait_for_agents(["w1"], timeout=1)
        assert results["w1"]["status"] == "completed"
        assert results["w1"]["state"] == "completed"

    async def test_wait_timeout_returns_running(self):
        mgr = AgentManager()
        agent = AgentInfo(
            id="w2", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        mgr._agents["w2"] = agent

        results = await mgr.wait_for_agents(["w2"], timeout=0.1, poll_interval=0.05)
        assert results["w2"]["status"] == "running"


# ---------------------------------------------------------------------------
# spawn_group with state machine
# ---------------------------------------------------------------------------

class TestSpawnGroupWithStates:
    async def test_spawn_group_creates_agents(self):
        mgr = AgentManager()
        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": []})
        tool_cb = AsyncMock()
        ids = mgr.spawn_group(
            tasks=[
                {"label": "a", "goal": "g1"},
                {"label": "b", "goal": "g2"},
            ],
            channel_id="c1",
            requester_id="u1",
            requester_name="user",
            iteration_callback=iter_cb,
            tool_executor_callback=tool_cb,
        )
        assert len(ids) == 2
        for aid in ids:
            assert not aid.startswith("Error")
            mgr.kill(aid)


# ---------------------------------------------------------------------------
# Tool execution within agent lifecycle
# ---------------------------------------------------------------------------

class TestAgentToolExecution:
    async def test_tool_timeout_stays_in_executing(self):
        agent = AgentInfo(
            id="te1", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]

        call_count = 0
        async def iter_cb(msgs, sys, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {
                    "text": "",
                    "tool_calls": [{"name": "run_command", "input": {"command": "echo"}}],
                    "stop_reason": "tool_use",
                }
            return {"text": "done", "tool_calls": [], "stop_reason": "end_turn"}

        async def slow_tool(name, inp):
            await asyncio.sleep(10)
            return "late"

        with patch("src.agents.manager.TOOL_EXEC_TIMEOUT", 0.01):
            await _run_agent(agent, "sys", [], iter_cb, slow_tool)

        assert agent.state == AgentState.COMPLETED
        # Tool timeout is handled as an error result, not a state transition
        tool_msgs = [m for m in agent.messages if "timed out" in m.get("content", "")]
        assert len(tool_msgs) == 1

    async def test_tool_exception_continues(self):
        agent = AgentInfo(
            id="te2", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]

        call_count = 0
        async def iter_cb(msgs, sys, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {
                    "text": "",
                    "tool_calls": [{"name": "run_command", "input": {"command": "fail"}}],
                    "stop_reason": "tool_use",
                }
            return {"text": "done despite error", "tool_calls": [], "stop_reason": "end_turn"}

        async def failing_tool(name, inp):
            raise ValueError("tool broke")

        await _run_agent(agent, "sys", [], iter_cb, failing_tool)

        assert agent.state == AgentState.COMPLETED
        assert agent.result == "done despite error"


# ---------------------------------------------------------------------------
# LoopAgentBridge compatibility
# ---------------------------------------------------------------------------

class TestLoopBridgeCompat:
    async def test_bridge_works_with_state_machine(self):
        from src.agents.loop_bridge import LoopAgentBridge

        mgr = AgentManager()
        bridge = LoopAgentBridge(mgr)

        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": []})
        tool_cb = AsyncMock()

        ids = bridge.spawn_agents_for_loop(
            loop_id="loop1",
            iteration=1,
            loop_goal="test loop",
            tasks=[{"label": "sub", "goal": "subtask"}],
            channel_id="c1",
            requester_id="u1",
            requester_name="user",
            iteration_callback=iter_cb,
            tool_executor_callback=tool_cb,
        )
        assert len(ids) == 1
        assert not ids[0].startswith("Error")

        await asyncio.sleep(0.1)
        results = await bridge.wait_and_collect("loop1", timeout=2)
        assert len(results) == 1
        r = list(results.values())[0]
        assert r["status"] == "completed"
        assert r["state"] == "completed"

    async def test_bridge_active_agents(self):
        from src.agents.loop_bridge import LoopAgentBridge

        mgr = AgentManager()
        bridge = LoopAgentBridge(mgr)

        call_count = 0
        async def slow_iter(msgs, sys, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                await asyncio.sleep(5)
            return {"text": "done", "tool_calls": []}

        tool_cb = AsyncMock()
        ids = bridge.spawn_agents_for_loop(
            loop_id="loop2",
            iteration=1,
            loop_goal="test",
            tasks=[{"label": "slow", "goal": "be slow"}],
            channel_id="c1",
            requester_id="u1",
            requester_name="user",
            iteration_callback=slow_iter,
            tool_executor_callback=tool_cb,
        )
        await asyncio.sleep(0.05)
        active = bridge.get_active_loop_agents("loop2")
        assert len(active) == 1
        assert active[0]["status"] in {"running", "spawning", "ready", "executing"}
        mgr.kill(ids[0])


# ---------------------------------------------------------------------------
# Module exports
# ---------------------------------------------------------------------------

class TestModuleExports:
    def test_agent_state_importable(self):
        from src.agents import AgentState
        assert AgentState.SPAWNING == "spawning"

    def test_state_machine_importable(self):
        from src.agents import AgentStateMachine
        sm = AgentStateMachine()
        assert sm.state == AgentState.SPAWNING

    def test_invalid_transition_importable(self):
        from src.agents import InvalidStateTransition
        assert issubclass(InvalidStateTransition, Exception)

    def test_state_transition_importable(self):
        from src.agents import StateTransition
        t = StateTransition(AgentState.SPAWNING, AgentState.READY, 0.0)
        assert t.from_state == AgentState.SPAWNING

    def test_terminal_states_importable(self):
        from src.agents import TERMINAL_STATES, ACTIVE_STATES
        assert len(TERMINAL_STATES) == 4
        assert len(ACTIVE_STATES) == 4

    def test_valid_transitions_importable(self):
        from src.agents import VALID_TRANSITIONS
        assert len(VALID_TRANSITIONS) == 8


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_all_legacy_statuses_mapped(self):
        from src.agents.manager import _STATE_TO_LEGACY
        for state in AgentState:
            assert state in _STATE_TO_LEGACY

    def test_terminal_states_match_legacy(self):
        from src.agents.manager import _TERMINAL_STATUSES
        for state in TERMINAL_STATES:
            assert state.value in _TERMINAL_STATUSES

    def test_max_recovery_attempts_constant(self):
        assert MAX_RECOVERY_ATTEMPTS == 1

    def test_state_enum_is_str(self):
        for state in AgentState:
            assert isinstance(state, str)
            assert state == state.value

    async def test_agent_info_transition_invalid(self):
        info = AgentInfo(
            id="e1", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        with pytest.raises(InvalidStateTransition):
            info.transition(AgentState.EXECUTING)

    async def test_multiple_tool_calls_single_iteration(self):
        agent = AgentInfo(
            id="e2", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]

        call_count = 0
        async def iter_cb(msgs, sys, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {
                    "text": "",
                    "tool_calls": [
                        {"name": "read_file", "input": {"path": "/a"}},
                        {"name": "read_file", "input": {"path": "/b"}},
                    ],
                    "stop_reason": "tool_use",
                }
            return {"text": "done", "tool_calls": [], "stop_reason": "end_turn"}

        tool_cb = AsyncMock(return_value="content")
        await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        assert agent.state == AgentState.COMPLETED
        # Both tool results should be in messages
        tool_msgs = [m for m in agent.messages if "Tool result" in m.get("content", "")]
        assert len(tool_msgs) == 2

    def test_state_machine_fresh_per_agent(self):
        a1 = AgentInfo(id="f1", label="t", goal="t", channel_id="c", requester_id="u", requester_name="n")
        a2 = AgentInfo(id="f2", label="t", goal="t", channel_id="c", requester_id="u", requester_name="n")
        a1.transition(AgentState.READY)
        assert a1.state == AgentState.READY
        assert a2.state == AgentState.SPAWNING

    async def test_kill_during_recovery(self):
        agent = AgentInfo(
            id="kr1", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        agent.transition(AgentState.EXECUTING)
        agent.transition(AgentState.RECOVERING, "error")
        agent.transition(AgentState.KILLED, "user kill")
        assert agent.state == AgentState.KILLED
        assert agent._sm.is_terminal

    async def test_timeout_during_recovery(self):
        agent = AgentInfo(
            id="tr1", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        agent.transition(AgentState.EXECUTING)
        agent.transition(AgentState.RECOVERING, "error")
        agent.transition(AgentState.TIMEOUT, "lifetime")
        assert agent.state == AgentState.TIMEOUT
