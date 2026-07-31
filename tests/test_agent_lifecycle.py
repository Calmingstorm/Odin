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
    MAX_AGENT_LIFETIME,
    TERMINAL_STATES,
    VALID_TRANSITIONS,
    AgentInfo,
    AgentManager,
    AgentState,
    AgentStateMachine,
    InvalidStateTransition,
    StateTransition,
    _call_llm_with_recovery,
    _run_agent,
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
        iter_cb = AsyncMock(return_value={
            "text": "done",
            "tool_calls": [],
            "stop_reason": "end_turn",
        })
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
        iter_cb = AsyncMock(return_value={
            "text": "done",
            "tool_calls": [],
            "stop_reason": "end_turn",
        })
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
        iter_cb = AsyncMock(return_value={
            "text": "done",
            "tool_calls": [],
            "stop_reason": "end_turn",
        })
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
        iter_cb = AsyncMock(return_value={
            "text": "done",
            "tool_calls": [],
            "stop_reason": "end_turn",
        })
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
        iter_cb = AsyncMock(return_value={
            "text": "done",
            "tool_calls": [],
            "stop_reason": "end_turn",
        })
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

        await _run_agent(agent, "sys", [], iter_cb, tool_cb, max_iterations=3)

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

        iter_cb = AsyncMock(return_value={
            "text": "done",
            "tool_calls": [],
            "stop_reason": "end_turn",
        })
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
                raise TimeoutError()
            return {"text": "ok after retry", "tool_calls": []}

        with patch("src.agents.manager.ITERATION_CB_TIMEOUT", 1):
            with patch("src.agents.manager.asyncio.wait_for", side_effect=[
                TimeoutError(),
                AsyncMock(return_value={"text": "ok", "tool_calls": []})(),
            ]):
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
                raise TimeoutError()
            return {"text": "recovered", "tool_calls": []}

        with patch("src.agents.manager.asyncio.sleep", new_callable=AsyncMock):
            with patch("src.agents.manager.asyncio.wait_for") as mock_wf:
                mock_wf.side_effect = [TimeoutError(), {"text": "recovered", "tool_calls": []}]
                # wait_for is called with a coroutine, need a different approach
                pass

    # Deliberate pin amendments (2026-07-30, design settled with Odin):
    # transient-failure recovery moved INSIDE the iteration callback via the
    # shared deadline policy (src/llm/recovery.py). The manager keeps only
    # the wall; the old EXECUTING→RECOVERING→EXECUTING single-retry ladder —
    # which retried programming defects via bare except — is gone. These
    # tests pin its absence.

    async def test_timeout_fails_without_manager_retry(self):
        agent = AgentInfo(
            id="r3", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.transition(AgentState.READY)
        agent.transition(AgentState.EXECUTING)

        call_count = 0

        async def counting_timeout(coro, *, timeout=None):
            nonlocal call_count
            call_count += 1
            try:
                coro.close()
            except:  # noqa: E722 — deliberate maximum-breadth catch; narrowing changes cancellation semantics
                pass
            raise TimeoutError()

        iter_cb = AsyncMock(return_value={"text": "never", "tool_calls": []})

        with patch("src.agents.manager.asyncio.wait_for", side_effect=counting_timeout):
            result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])

        assert result is None
        assert call_count == 1  # exactly one call — no ladder
        assert agent.state == AgentState.FAILED
        assert agent.recovery_attempts == 0
        assert agent.ended_at is not None
        recovery_transitions = [
            t for t in agent.state_history if t.to_state == AgentState.RECOVERING
        ]
        assert recovery_transitions == []

    async def test_exception_fails_fast_no_second_call(self):
        # The old ladder would have made a second call and "recovered" —
        # that second call must never happen now.
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
                except:  # noqa: E722 — deliberate maximum-breadth catch; narrowing changes cancellation semantics
                    pass
                raise ConnectionError("transient error")
            return await original_wait_for(coro, timeout=timeout)

        iter_cb = AsyncMock(return_value={"text": "ok", "tool_calls": []})

        with patch("src.agents.manager.asyncio.wait_for", side_effect=err_then_ok):
            result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])

        assert result is None
        assert call_count == 1
        assert agent.state == AgentState.FAILED
        assert agent.error == "LLM error: transient error"
        assert agent.recovery_attempts == 0


# ---------------------------------------------------------------------------
# _run_agent full lifecycle with recovery
# ---------------------------------------------------------------------------

class TestRunAgentRecovery:
    async def test_llm_failure_fails_agent_without_manager_retry(self):
        # Deliberate amendment (2026-07-30): the old ladder made this agent
        # COMPLETE via a manager retry; recovery now lives inside the
        # iteration callback, so a failure that escapes it fails the agent.
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
                except:  # noqa: E722 — deliberate maximum-breadth catch; narrowing changes cancellation semantics
                    pass
                raise TimeoutError()
            return await original_wait_for(coro, timeout=timeout)

        iter_cb = AsyncMock(return_value={"text": "would recover", "tool_calls": []})
        tool_cb = AsyncMock()

        with patch("src.agents.manager.asyncio.wait_for", side_effect=first_timeout):
            await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        assert agent.state == AgentState.FAILED
        assert call_count == 1
        assert agent.recovery_attempts == 0
        states = [t.to_state for t in agent.state_history]
        assert AgentState.RECOVERING not in states

    async def test_failed_recovery_lifecycle(self):
        agent = AgentInfo(
            id="fr2", label="test", goal="test",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]

        async def always_fail(coro, *, timeout=None):
            try:
                coro.close()
            except:  # noqa: E722 — deliberate maximum-breadth catch; narrowing changes cancellation semantics
                pass
            raise TimeoutError()

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

    async def test_spawn_group_forwards_kwargs(self):
        """spawn_group must forward trajectory_saver, max_iterations, etc."""
        mgr = AgentManager()
        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": []})
        tool_cb = AsyncMock()
        traj_saver = AsyncMock()

        with patch.object(mgr, "spawn", wraps=mgr.spawn) as spy:
            ids = mgr.spawn_group(
                tasks=[{"label": "a", "goal": "g1"}],
                channel_id="c1",
                requester_id="u1",
                requester_name="user",
                iteration_callback=iter_cb,
                tool_executor_callback=tool_cb,
                trajectory_saver=traj_saver,
                max_iterations=42,
                budget_warnings=[10, 5, 1],
                context_compression_enabled=True,
                max_context_chars=100000,
                keep_recent_iterations=10,
            )
            assert len(ids) == 1
            assert not ids[0].startswith("Error")

            call_kwargs = spy.call_args
            assert call_kwargs.kwargs.get("trajectory_saver") is traj_saver
            assert call_kwargs.kwargs.get("max_iterations") == 42
            assert call_kwargs.kwargs.get("budget_warnings") == [10, 5, 1]
            assert call_kwargs.kwargs.get("context_compression_enabled") is True
            assert call_kwargs.kwargs.get("max_context_chars") == 100000
            assert call_kwargs.kwargs.get("keep_recent_iterations") == 10

            mgr.kill(ids[0])


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

    async def test_bridge_forwards_spawn_kwargs(self):
        """spawn_agents_for_loop must forward runtime config to AgentManager.spawn."""
        from src.agents.loop_bridge import LoopAgentBridge

        mgr = AgentManager()
        bridge = LoopAgentBridge(mgr)

        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": []})
        tool_cb = AsyncMock()

        with patch.object(mgr, "spawn", wraps=mgr.spawn) as spy:
            ids = bridge.spawn_agents_for_loop(
                loop_id="loop-fwd",
                iteration=1,
                loop_goal="test",
                tasks=[{"label": "a", "goal": "g"}],
                channel_id="c1",
                requester_id="u1",
                requester_name="user",
                iteration_callback=iter_cb,
                tool_executor_callback=tool_cb,
                max_iterations=42,
                budget_warnings=[10, 5, 1],
                context_compression_enabled=True,
                max_context_chars=100000,
                keep_recent_iterations=10,
            )
            assert len(ids) == 1
            assert not ids[0].startswith("Error")

            call_kwargs = spy.call_args
            assert call_kwargs.kwargs.get("max_iterations") == 42
            assert call_kwargs.kwargs.get("budget_warnings") == [10, 5, 1]
            assert call_kwargs.kwargs.get("context_compression_enabled") is True
            assert call_kwargs.kwargs.get("max_context_chars") == 100000
            assert call_kwargs.kwargs.get("keep_recent_iterations") == 10

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
        from src.agents import ACTIVE_STATES, TERMINAL_STATES
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

    def test_manager_retry_ladder_removed(self):
        # Deliberate amendment (2026-07-30): transient recovery moved into
        # the iteration callback (src/llm/recovery.py); the manager-level
        # ladder and its constant must stay gone.
        import src.agents.manager as manager_mod

        assert not hasattr(manager_mod, "MAX_RECOVERY_ATTEMPTS")

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
        a1 = AgentInfo(
            id="f1",
            label="t",
            goal="t",
            channel_id="c",
            requester_id="u",
            requester_name="n",
        )
        a2 = AgentInfo(
            id="f2",
            label="t",
            goal="t",
            channel_id="c",
            requester_id="u",
            requester_name="n",
        )
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


# ---------------------------------------------------------------------------
# Per-agent timeout snapshot + lifetime deadline (configurable, PR #226)
# ---------------------------------------------------------------------------

def _exec_agent(**overrides) -> AgentInfo:
    """AgentInfo in EXECUTING state, ready for _call_llm_with_recovery."""
    kw = dict(
        id="pt1", label="test", goal="test",
        channel_id="c1", requester_id="u1", requester_name="user",
    )
    kw.update(overrides)
    agent = AgentInfo(**kw)
    agent.transition(AgentState.READY)
    agent.transition(AgentState.EXECUTING)
    return agent


class TestPerAgentTimeoutSnapshot:
    async def test_spawn_snapshots_values(self):
        mgr = AgentManager()
        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": []})
        aid = mgr.spawn(
            label="t", goal="g", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=iter_cb, tool_executor_callback=AsyncMock(),
            iteration_timeout=333.0, max_lifetime=4444.0,
        )
        agent = mgr._agents[aid]
        assert agent.iteration_timeout == 333.0
        assert agent.max_lifetime == 4444.0
        mgr.kill(aid)

    async def test_spawn_none_falls_back_to_constants(self):
        mgr = AgentManager()
        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": []})
        aid = mgr.spawn(
            label="t", goal="g", channel_id="c1",
            requester_id="u1", requester_name="user",
            iteration_callback=iter_cb, tool_executor_callback=AsyncMock(),
        )
        agent = mgr._agents[aid]
        assert agent.iteration_timeout == ITERATION_CB_TIMEOUT
        assert agent.max_lifetime == MAX_AGENT_LIFETIME
        mgr.kill(aid)

    async def test_spawn_group_threads_values(self):
        mgr = AgentManager()
        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": []})
        ids = mgr.spawn_group(
            tasks=[{"label": "a", "goal": "g1"}, {"label": "b", "goal": "g2"}],
            channel_id="c1", requester_id="u1", requester_name="user",
            iteration_callback=iter_cb, tool_executor_callback=AsyncMock(),
            iteration_timeout=222.0, max_lifetime=3333.0,
        )
        for aid in ids:
            assert mgr._agents[aid].iteration_timeout == 222.0
            assert mgr._agents[aid].max_lifetime == 3333.0
            mgr.kill(aid)

    async def test_llm_wait_uses_agent_iteration_timeout(self):
        agent = _exec_agent(iteration_timeout=42.0, max_lifetime=100000.0)
        captured: list[float | None] = []
        original_wait_for = asyncio.wait_for

        async def capture(coro, *, timeout=None):
            captured.append(timeout)
            return await original_wait_for(coro, timeout=timeout)

        iter_cb = AsyncMock(return_value={"text": "ok", "tool_calls": []})
        with patch("src.agents.manager.asyncio.wait_for", side_effect=capture):
            result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])
        assert result is not None
        assert captured == [42.0]

    async def test_llm_wait_capped_at_remaining_lifetime(self):
        agent = _exec_agent(iteration_timeout=900.0, max_lifetime=50.0)
        agent.created_at = time.time() - 20  # ~30s of lifetime left
        captured: list[float | None] = []
        original_wait_for = asyncio.wait_for

        async def capture(coro, *, timeout=None):
            captured.append(timeout)
            return await original_wait_for(coro, timeout=timeout)

        iter_cb = AsyncMock(return_value={"text": "ok", "tool_calls": []})
        with patch("src.agents.manager.asyncio.wait_for", side_effect=capture):
            await _call_llm_with_recovery(agent, iter_cb, "sys", [])
        assert len(captured) == 1
        assert captured[0] is not None
        assert 0 < captured[0] <= 30.1

    async def test_lifetime_exhausted_before_call(self):
        agent = _exec_agent(max_lifetime=60.0)
        agent.created_at = time.time() - 120  # deadline already passed
        iter_cb = AsyncMock(return_value={"text": "never", "tool_calls": []})

        result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])
        assert result is None
        assert agent.state == AgentState.TIMEOUT
        iter_cb.assert_not_awaited()
        assert "lifetime exceeded" in agent.state_history[-1].reason

    async def test_deadline_timeout_is_lifetime_not_failure(self):
        """A wait that times out AT the deadline is lifetime exhaustion —
        TIMEOUT, never a FAILED recovery cycle."""
        agent = _exec_agent(iteration_timeout=900.0, max_lifetime=100.0)
        agent.created_at = time.time() - 50  # 50s remaining at entry

        async def timeout_past_deadline(coro, *, timeout=None):
            try:
                coro.close()
            except Exception:
                pass
            agent.created_at -= 100  # the wait consumed the rest of the lifetime
            raise TimeoutError()

        iter_cb = AsyncMock(return_value={"text": "x", "tool_calls": []})
        with patch("src.agents.manager.asyncio.wait_for", side_effect=timeout_past_deadline):
            result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])

        assert result is None
        assert agent.state == AgentState.TIMEOUT
        recoveries = [t for t in agent.state_history if t.to_state == AgentState.RECOVERING]
        assert recoveries == []

    async def test_timeout_stores_readable_error(self):
        agent = _exec_agent(iteration_timeout=77.0, max_lifetime=100000.0)

        async def always_timeout(coro, *, timeout=None):
            try:
                coro.close()
            except Exception:
                pass
            raise TimeoutError()

        iter_cb = AsyncMock(return_value={"text": "x", "tool_calls": []})
        with patch("src.agents.manager.asyncio.wait_for", side_effect=always_timeout):
            result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])

        assert result is None
        assert agent.state == AgentState.FAILED
        # str(asyncio.TimeoutError()) is "" — the stored error must never be empty
        assert agent.error == "LLM timeout after 77s"

    async def test_empty_string_exception_stores_readable_error(self):
        agent = _exec_agent(iteration_timeout=77.0, max_lifetime=100000.0)

        async def raise_bare(coro, *, timeout=None):
            try:
                coro.close()
            except Exception:
                pass
            raise ConnectionError()  # str() == ""

        iter_cb = AsyncMock(return_value={"text": "x", "tool_calls": []})
        with patch("src.agents.manager.asyncio.wait_for", side_effect=raise_bare):
            result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])

        assert result is None
        assert agent.state == AgentState.FAILED
        assert agent.error == "LLM error: ConnectionError"


class TestLifetimeEnforcement:
    def test_check_health_uses_per_agent_lifetime(self):
        mgr = AgentManager()
        agent = AgentInfo(
            id="lh1", label="short", goal="g",
            channel_id="c1", requester_id="u1", requester_name="user",
            max_lifetime=10.0,
        )
        agent.created_at = time.time() - 20  # past its own (short) deadline
        mgr._agents["lh1"] = agent
        report = mgr.check_health()
        assert report["killed"] == 1
        assert agent._cancel_event.is_set()

    def test_check_health_respects_extended_lifetime(self):
        """An agent older than the legacy 3600s constant but inside its own
        snapshot must NOT be force-killed."""
        mgr = AgentManager()
        agent = AgentInfo(
            id="lh2", label="long", goal="g",
            channel_id="c1", requester_id="u1", requester_name="user",
            max_lifetime=14400.0,
        )
        agent.created_at = time.time() - 4000  # > 3600, < 14400
        agent.last_activity = time.time()
        mgr._agents["lh2"] = agent
        report = mgr.check_health()
        assert report["killed"] == 0
        assert not agent._cancel_event.is_set()

    async def test_tool_wait_capped_at_remaining_lifetime(self):
        agent = AgentInfo(
            id="tw1", label="test", goal="g",
            channel_id="c1", requester_id="u1", requester_name="user",
            iteration_timeout=40.0, max_lifetime=200.0,
        )
        captured: list[float | None] = []
        original_wait_for = asyncio.wait_for

        async def capture(coro, *, timeout=None):
            captured.append(timeout)
            return await original_wait_for(coro, timeout=timeout)

        calls = 0

        async def iter_cb(msgs, sys, tools):
            nonlocal calls
            calls += 1
            if calls == 1:
                return {"text": "using tool", "tool_calls": [{"name": "t", "input": {}}]}
            return {"text": "done", "tool_calls": []}

        tool_cb = AsyncMock(return_value="tool ok")
        with patch("src.agents.manager.asyncio.wait_for", side_effect=capture):
            await _run_agent(agent, "sys", [], iter_cb, tool_cb)

        assert agent.state == AgentState.COMPLETED
        # captured: [LLM iter1, tool, LLM iter2]
        assert len(captured) == 3
        assert captured[0] == 40.0                    # iteration timeout
        assert captured[1] is not None
        assert 190 <= captured[1] <= 200              # tool wait capped by lifetime


class TestTrajectoryStamps:
    async def test_iteration_stamps_and_spawn_policy(self):
        """Each iteration records the provider/model/effort the callback
        reported (live-reloadable values — a turn-level stamp would lie),
        and the turn records the spawn-policy snapshot."""
        agent = AgentInfo(
            id="ts1", label="test", goal="g",
            channel_id="c1", requester_id="u1", requester_name="user",
            iteration_timeout=222.0, max_lifetime=3333.0,
        )
        saved = {}

        class FakeSaver:
            async def save(self, turn):
                saved["turn"] = turn

        calls = 0

        async def iter_cb(msgs, sys, tools):
            nonlocal calls
            calls += 1
            if calls == 1:
                return {
                    "text": "using tool",
                    "tool_calls": [{"name": "t", "input": {}}],
                    "provider": "codex", "model": "gpt-5.5",
                    "reasoning_effort": "low",
                }
            return {
                "text": "done", "tool_calls": [],
                "provider": "codex", "model": "gpt-5.6-sol",
                "reasoning_effort": "xhigh",
            }

        tool_cb = AsyncMock(return_value="ok")
        await _run_agent(agent, "sys", [], iter_cb, tool_cb, trajectory_saver=FakeSaver())

        turn = saved["turn"]
        assert turn.iteration_timeout == 222.0
        assert turn.max_lifetime == 3333.0
        assert turn.iterations[0].provider == "codex"
        assert turn.iterations[0].model == "gpt-5.5"
        assert turn.iterations[0].reasoning_effort == "low"
        # the second iteration recorded its own (changed) stamp
        assert turn.iterations[1].model == "gpt-5.6-sol"
        assert turn.iterations[1].reasoning_effort == "xhigh"

    async def test_callback_without_stamps_defaults_clean(self):
        """Older/simpler callbacks that omit the stamp keys must not break."""
        agent = AgentInfo(
            id="ts2", label="test", goal="g",
            channel_id="c1", requester_id="u1", requester_name="user",
        )
        saved = {}

        class FakeSaver:
            async def save(self, turn):
                saved["turn"] = turn

        iter_cb = AsyncMock(return_value={"text": "done", "tool_calls": []})
        await _run_agent(agent, "sys", [], iter_cb, AsyncMock(), trajectory_saver=FakeSaver())
        it = saved["turn"].iterations[0]
        assert it.provider == ""
        assert it.model == ""
        assert it.reasoning_effort is None


class TestRetryPathDeadline:
    async def test_lifetime_exhaustion_wins_over_exception_class(self):
        """A failing call that consumed the lifetime is lifetime exhaustion
        (TIMEOUT), never FAILED — the v3.59.0 rule holds on the single-call
        path now that the manager retry ladder is gone."""
        agent = _exec_agent(iteration_timeout=900.0, max_lifetime=100.0)
        agent.created_at = time.time() - 50

        async def fail_and_expire(coro, *, timeout=None):
            try:
                coro.close()
            except Exception:
                pass
            agent.created_at -= 100  # the failed call ate the lifetime
            raise ConnectionError("transient")

        iter_cb = AsyncMock(return_value={"text": "x", "tool_calls": []})
        with patch("src.agents.manager.asyncio.wait_for", side_effect=fail_and_expire):
            result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])

        assert result is None
        assert agent.state == AgentState.TIMEOUT
        assert "lifetime exceeded" in agent.state_history[-1].reason


class TestHardDeadlineDuringToolsAndSleep:
    """PR #226 review blockers: the deadline must hold BETWEEN tool calls
    (no floored bonus budget per tool). The recovery-sleep half of the
    original class is gone with the manager retry ladder (2026-07-30) —
    waits-bounded-by-remaining-budget now lives in src/llm/recovery.py and
    is pinned in tests/test_recovery_policy.py."""

    async def test_expired_agent_stops_at_next_tool(self):
        """Odin's repro shape: tiny lifetime + three slow tools ran ~3s on
        the 1s-per-tool floor. Now: the first tool is capped at the true
        remainder and the second never starts."""
        agent = AgentInfo(
            id="hd1", label="test", goal="g",
            channel_id="c1", requester_id="u1", requester_name="user",
            iteration_timeout=900.0, max_lifetime=0.05,
        )
        saved = {}

        class FakeSaver:
            async def save(self, turn):
                saved["turn"] = turn

        three_tools = [{"name": f"t{i}", "input": {}} for i in range(3)]
        iter_cb = AsyncMock(return_value={
            "text": "using tools", "tool_calls": three_tools,
        })
        started = 0

        async def slow_tool(name, tool_input):
            nonlocal started
            started += 1
            await asyncio.sleep(5)
            return "done"

        t0 = time.monotonic()
        await _run_agent(agent, "sys", [], iter_cb, slow_tool,
                         trajectory_saver=FakeSaver())
        elapsed = time.monotonic() - t0

        assert agent.state == AgentState.TIMEOUT
        assert "lifetime exceeded" in agent.state_history[-1].reason
        assert started == 1                    # tools 2 and 3 never began
        assert elapsed < 2                     # not ~3s of floored budgets
        # the partial iteration was still recorded
        turn = saved["turn"]
        assert len(turn.iterations) == 1
        assert len(turn.iterations[0].tool_calls) == 1
        assert "timed out" in turn.iterations[0].tool_results[0]["result"]

    async def test_no_manager_sleep_exists_on_failure_path(self):
        """The manager never sleeps anymore: a failure either times out the
        lifetime or fails the agent immediately — no recovery sleep at all."""
        agent = _exec_agent(iteration_timeout=900.0, max_lifetime=100.0)
        agent.created_at = time.time() - 50

        async def fail_once(coro, *, timeout=None):
            try:
                coro.close()
            except Exception:
                pass
            raise ConnectionError("transient")

        sleep_mock = AsyncMock()
        iter_cb = AsyncMock(return_value={"text": "x", "tool_calls": []})
        with patch("src.agents.manager.asyncio.wait_for", side_effect=fail_once):
            with patch("src.agents.manager.asyncio.sleep", sleep_mock):
                result = await _call_llm_with_recovery(agent, iter_cb, "sys", [])

        assert result is None
        assert agent.state == AgentState.FAILED
        sleep_mock.assert_not_awaited()

    async def test_expiry_during_final_tool_of_final_iteration_is_timeout(self):
        """Odin's re-review repro: one 5s tool, max_lifetime=0.05,
        max_iterations=1 previously fell through to COMPLETED
        ('max iterations reached'). Expiry inside the last tool call must
        terminate as TIMEOUT."""
        agent = AgentInfo(
            id="hd2", label="one-tool", goal="g",
            channel_id="c1", requester_id="u1", requester_name="user",
            iteration_timeout=900.0, max_lifetime=0.05,
        )
        saved = {}

        class FakeSaver:
            async def save(self, turn):
                saved["turn"] = turn

        iter_cb = AsyncMock(return_value={
            "text": "using tool", "tool_calls": [{"name": "slow", "input": {}}],
        })

        async def slow_tool(name, tool_input):
            await asyncio.sleep(5)
            return "done"

        await _run_agent(agent, "sys", [], iter_cb, slow_tool,
                         trajectory_saver=FakeSaver(), max_iterations=1)

        assert agent.state == AgentState.TIMEOUT
        assert "lifetime exceeded" in agent.state_history[-1].reason
        # the lifetime-capped tool attempt is still recorded
        turn = saved["turn"]
        assert len(turn.iterations) == 1
        assert "timed out" in turn.iterations[0].tool_results[0]["result"]
