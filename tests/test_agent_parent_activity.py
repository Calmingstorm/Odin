"""Parent control at safe boundaries, with deterministic synchronization."""

import asyncio
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.agents.execution_context import waiting_agent
from src.agents.manager import AgentManager, AgentState, _run_agent
from tests.test_agent_transcript_contract import agent
from tests.test_native_agents_tasks import _tools


def registry():
    manager = AgentManager()
    parent = agent()
    manager._agents[parent.id] = parent
    return manager, parent


@pytest.mark.parametrize("final", [True, False])
async def test_parent_arrival_during_generation_prevents_calls_or_final(final):
    manager, parent = registry()
    generating, release = asyncio.Event(), asyncio.Event()
    calls = [{"id": "first", "name": "patch", "input": {}}]

    async def cb(messages, *args, **kwargs):
        if parent.iteration_count == 1:
            generating.set()
            await release.wait()
            return {"text": "outdated answer", "tool_calls": [] if final else calls}
        controls = [m for m in messages if m.get("provenance") == "agent_parent"]
        assert [m["sequence"] for m in controls] == [1, 2]
        assert parent.last_consumed_sequence == 2
        return {"text": "corrected answer"}

    execute = AsyncMock()
    saver = SimpleNamespace(save=AsyncMock())
    task = asyncio.create_task(_run_agent(parent, "", [], cb, execute, trajectory_saver=saver))
    await generating.wait()
    assert parent.phase == "generating" and parent.phase_deadline
    assert "queued" in manager.send(parent.id, "stop editing")
    manager.send(parent.id, "answer differently")
    assert parent.activity()["pending_inbox_count"] == 2
    assert parent.last_consumed_sequence == 0
    release.set()
    await task
    assert parent.result == "corrected answer" and execute.await_count == 0
    if not final:
        assert parent.messages[2]["content"][0]["status"] == "not_executed"
    events = saver.save.call_args.args[0].to_dict()["inbox_events"]
    assert [(e["event"], e["sequence"]) for e in events] == [
        ("queued", 1),
        ("queued", 2),
        ("consumed", 1),
        ("consumed", 2),
    ]
    assert "not running" in manager.send(parent.id, "too late")


async def test_parent_does_not_cancel_running_mutation_and_skips_remaining_calls():
    manager, parent = registry()
    started, release = asyncio.Event(), asyncio.Event()
    calls = [{"id": str(i), "name": "patch", "input": {}} for i in range(2)]

    async def execute(*args):
        started.set()
        await release.wait()
        return "applied"

    executor = AsyncMock(side_effect=execute)
    callback = AsyncMock(side_effect=[{"tool_calls": calls}, {"text": "stopped"}])
    task = asyncio.create_task(_run_agent(parent, "", [], callback, executor))
    await started.wait()
    assert parent.phase == "executing_tool"
    stamp = parent.last_activity
    manager.send(parent.id, "do not make further edits")
    assert not task.done() and parent.last_activity == stamp
    release.set()
    await task
    assert executor.await_count == 1
    assert [b["status"] for b in parent.messages[2]["content"]] == ["succeeded", "not_executed"]
    assert parent.last_consumed_sequence == 1


async def test_nested_wait_wakes_for_parent_with_all_child_snapshots():
    manager, parent = registry()
    done, child = agent(), agent()
    done.id, child.id = "done", "child"
    done.transition(AgentState.READY)
    done.transition(AgentState.COMPLETED)
    done.result = "finished"
    manager._agents.update({done.id: done, child.id: child})
    tools = _tools(agent_manager=manager)
    entered = asyncio.Event()
    real_wait = manager.wait_for_agents

    async def wait(*args, **kwargs):
        entered.set()
        return await real_wait(*args, **kwargs)

    manager.wait_for_agents = wait

    async def execute(name, inp):
        assert waiting_agent.get() is parent
        return await tools._handle_wait_for_agents(inp)

    async def callback(messages, *args, **kwargs):
        if parent.iteration_count == 1:
            return {
                "tool_calls": [
                    {
                        "id": "wait",
                        "name": "wait_for_agents",
                        "input": {"agent_ids": [done.id, child.id, "missing"], "timeout": 3600},
                    }
                ]
            }
        result = messages[2]["content"][0]
        assert result["tool_use_id"] == "wait"
        assert result["status"] == "interrupted_effect_free" and not result["uncertain_outcome"]
        assert "Wait interrupted by parent message; children continue" in result["content"]
        assert all(f"`{aid}`" in result["content"] for aid in ["done", "child", "missing"])
        assert "finished" in result["content"]
        assert messages[-1]["provenance"] == "agent_parent"
        return {"text": "received"}

    task = asyncio.create_task(_run_agent(parent, "", [], callback, execute))
    await entered.wait()
    assert parent.phase == "waiting_for_children"
    assert "waiting for children" in manager.list()[0]["activity"]
    manager.send(parent.id, "stop waiting")
    await asyncio.wait_for(task, 1)
    assert not child._cancel_event.is_set() and child.status == "running"
    assert waiting_agent.get() is None
    assert parent.last_consumed_sequence == 1


async def test_cancelled_wait_does_not_cancel_child_or_claim_unknown_effect():
    manager, parent = registry()
    child = agent()
    child.id = "child"
    manager._agents[child.id] = child
    entered = asyncio.Event()

    async def execute(*args):
        entered.set()
        await manager.wait_for_agents([child.id], timeout=3600)

    cb = AsyncMock(
        return_value={"tool_calls": [{"id": "w", "name": "wait_for_agents", "input": {}}]}
    )
    task = asyncio.create_task(_run_agent(parent, "", [], cb, execute))
    await entered.wait()
    task.cancel()
    await task
    result = parent.messages[-1]["content"][0]
    assert result["status"] == "interrupted_effect_free" and not result["uncertain_outcome"]
    assert not child._cancel_event.is_set()


@pytest.mark.parametrize("phase", ["generating", "executing_tool", "waiting_for_children"])
def test_long_work_is_not_idle_but_expired_phase_is_stale(phase):
    manager, parent = registry()
    now = time.time()
    parent.set_phase(phase, now + 500)
    parent.phase_started_at = parent.last_activity = now - 300
    stamp = parent.last_activity
    assert manager.check_health() == {"killed": 0, "stale": 0}
    assert parent.last_activity == stamp
    parent.phase_deadline = now - 1
    assert manager.check_health() == {"killed": 0, "stale": 1}
    parent.set_phase("ready")
    parent.last_activity = now - 300
    assert manager.check_health()["stale"] == 1


async def test_final_iteration_correction_does_not_return_outdated_answer():
    manager, parent = registry()

    async def cb(*args, **kwargs):
        manager.send(parent.id, "new instruction")
        return {"text": "stale answer"}

    await _run_agent(parent, "", [], cb, AsyncMock(), max_iterations=1)
    assert parent.state == AgentState.FAILED and parent.result == ""
    assert parent.last_consumed_sequence == 1 and "replan" in parent.error


async def test_model_arguments_cannot_select_waiting_parent():
    manager, parent = registry()
    manager.send(parent.id, "queued")
    tools = _tools(agent_manager=manager)
    result = await tools._handle_wait_for_agents(
        {"agent_ids": ["missing"], "parent_id": parent.id, "waiting_agent": parent.id, "timeout": 0}
    )
    assert "interrupted" not in str(result).lower()
    assert parent.last_consumed_sequence == 0


@pytest.mark.parametrize("signal", ["completion", "cancel", "inbox"])
async def test_wait_wakeup_events_do_not_need_poll_timer(signal, monkeypatch):
    manager, parent = registry()
    child, done = agent(), agent()
    child.id, done.id = "child", "done"
    done.transition(AgentState.READY)
    done.transition(AgentState.COMPLETED)
    done.result = "captured"
    manager._agents.update({child.id: child, done.id: done})
    entered = asyncio.Event()
    real_wait = asyncio.wait

    async def observe_wait(*args, **kwargs):
        entered.set()
        return await real_wait(*args, **kwargs)

    monkeypatch.setattr(asyncio, "wait", observe_wait)
    token = waiting_agent.set(parent)
    try:
        task = asyncio.create_task(
            manager.wait_for_agents([done.id, child.id], timeout=3600, poll_interval=3600)
        )
    finally:
        waiting_agent.reset(token)
    await entered.wait()
    manager._agents.pop(done.id)
    if signal == "completion":
        child.transition(AgentState.READY)
        child.transition(AgentState.COMPLETED)
    elif signal == "cancel":
        parent._cancel_event.set()
    else:
        manager.send(parent.id, "change plan")
    if signal == "cancel":
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, 1)
    else:
        results = await asyncio.wait_for(task, 1)
        assert set(results) == {"done", "child"}
        assert results["done"]["result"] == "captured"
    assert not child._cancel_event.is_set()


async def test_last_tool_correction_at_exhaustion_is_not_success():
    manager, parent = registry()

    async def execute(*args):
        manager.send(parent.id, "replan")
        return "completed tool"

    cb = AsyncMock(return_value={"tool_calls": [{"id": "a", "name": "t", "input": {}}]})
    await _run_agent(parent, "", [], cb, execute, max_iterations=1)
    assert parent.state == AgentState.FAILED and parent.result == ""
    assert "replan" in parent.error


async def test_wait_timeout_is_effect_free():
    _, parent = registry()
    cb = AsyncMock(
        side_effect=[
            {"tool_calls": [{"id": "a", "name": "wait_for_agents", "input": {}}]},
            {"text": "done"},
        ]
    )
    await _run_agent(parent, "", [], cb, AsyncMock(side_effect=TimeoutError()))
    result = parent.messages[2]["content"][0]
    assert result["status"] == "timed_out" and not result["uncertain_outcome"]


@pytest.mark.parametrize("signal", ["inbox", "cancel"])
async def test_scheduler_gap_before_tool_dispatch_does_not_claim_execution(signal, monkeypatch):
    manager, parent = registry()
    real_wait = asyncio.wait_for

    async def gap(awaitable, timeout):
        if parent.phase == "executing_tool":
            if signal == "inbox":
                manager.send(parent.id, "do not execute")
            else:
                parent._cancel_event.set()
        return await real_wait(awaitable, timeout)

    monkeypatch.setattr(asyncio, "wait_for", gap)
    callback = AsyncMock(
        side_effect=[{"tool_calls": [{"id": "a", "name": "t", "input": {}}]}, {"text": "replanned"}]
    )
    execute = AsyncMock()
    await _run_agent(parent, "", [], callback, execute)
    execute.assert_not_called()
    assert parent.tool_execution_count == 0
    result = parent.messages[2]["content"][0]
    assert result["status"] == "not_executed" and not result["uncertain_outcome"]
