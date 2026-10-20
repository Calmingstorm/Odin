"""Killing an agent stops the background jobs it started (and only those)."""
from __future__ import annotations

import asyncio
import json
import shlex
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.agents.execution_context import (
    JobOrigin,
    agent_dispatch,
    bound_job_origin,
    current_job_origin,
)
from src.agents.manager import AgentManager
from src.agents.tool_cycle import execute_cycle
from src.discord.native_tools.agents_tasks import AgentTaskTools
from src.tools.executor import ToolExecutor
from src.tools.process_manager import AgentJobCleanup, ProcessRegistry
from tests.test_remote_processes import _Lease

AGENT = JobOrigin("agent-a", "root-a")


async def test_executor_hands_the_dispatching_agent_to_the_handler_task():
    executor = ToolExecutor()
    seen = []

    async def handler(_input):
        seen.append(current_job_origin())
        return "ok"

    agent = SimpleNamespace(id="agent-a", root_id="root-a")
    with agent_dispatch(agent, {"id": "call-1"}):
        await executor._try_tool("manage_process", handler, {}, 30, None)
    await executor._try_tool("manage_process", handler, {}, 30, None)

    assert seen == [AGENT, None]


async def test_the_agent_tool_cycle_reaches_the_handler_with_its_agent():
    # The production order: execute_cycle binds the dispatch, the agent's
    # callback awaits the executor, the executor runs the handler.
    executor = ToolExecutor()
    seen = []

    async def handler(_input):
        seen.append(current_job_origin())
        return "ok"

    async def callback(name, arguments):
        return await executor._try_tool(name, handler, arguments, 30, None)

    agent = SimpleNamespace(
        id="agent-a", root_id="root-a", max_lifetime=60, created_at=time.time(),
        _cancel_event=asyncio.Event(), _inbox=asyncio.Queue(), tool_execution_count=0,
        tools_used=[], set_phase=Mock(), messages=[],
    )
    await execute_cycle(agent, [{"id": "call-1", "name": "manage_process", "input": {}}],
                        callback, [], timeouts={}, default_timeout=10)

    assert seen == [AGENT]


async def test_the_origin_does_not_leak_into_tasks_the_handler_spawns():
    async def child():
        return current_job_origin()

    with bound_job_origin(AGENT):
        assert current_job_origin() == AGENT
        assert await asyncio.create_task(child()) is None


def _local_registry(monkeypatch, pid: int = 4242) -> ProcessRegistry:
    registry = ProcessRegistry()
    monkeypatch.setattr(
        "src.tools.local_supervisor.create_supervised_shell",
        AsyncMock(return_value=SimpleNamespace(pid=pid)),
    )
    monkeypatch.setattr(registry, "_read_output", AsyncMock())
    monkeypatch.setattr(registry, "_watch_exit", AsyncMock())
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    return registry


def _fake_kill(registry: ProcessRegistry, monkeypatch, *, delay: float = 0.0,
               reply: str | None = None) -> list[int]:
    killed: list[int] = []

    async def kill(pid, **_kw):
        await asyncio.sleep(delay)
        killed.append(pid)
        registry._processes[pid].status = "killed"
        registry._processes[pid].session_confirmed_empty = True
        return reply or f"Process {pid} killed."

    monkeypatch.setattr(registry, "kill", kill)
    return killed


async def test_started_jobs_record_their_agent(monkeypatch):
    registry = _local_registry(monkeypatch)

    await registry.start("localhost", "sleep 30", origin=AGENT)
    info = registry._processes[4242]

    assert (info.origin_agent_id, info.origin_root_id) == ("agent-a", "root-a")


async def test_reaping_stops_the_agents_running_jobs_only(monkeypatch):
    registry = _local_registry(monkeypatch, pid=1)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    monkeypatch.setattr("src.tools.local_supervisor.create_supervised_shell",
                        AsyncMock(return_value=SimpleNamespace(pid=2)))
    await registry.start("localhost", "sleep 30", origin=JobOrigin("agent-b", "root-b"))
    monkeypatch.setattr("src.tools.local_supervisor.create_supervised_shell",
                        AsyncMock(return_value=SimpleNamespace(pid=3)))
    await registry.start("localhost", "sleep 30")  # a chat job: no agent
    killed = _fake_kill(registry, monkeypatch)

    cleanup = registry.reap_agent_jobs({"agent-a"})
    outcome = await cleanup.wait(timeout=5)

    assert cleanup.pids == [1]
    assert outcome == {1: "stopped"}
    assert killed == [1]
    assert registry._processes[2].status == "running"
    assert registry._processes[3].status == "running"
    assert "Stopped 1 background job(s) it started (PID 1)." == cleanup.describe(outcome)


async def test_finished_job_with_unverified_cleanup_is_also_stopped(monkeypatch):
    registry = _local_registry(monkeypatch)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    info = registry._processes[4242]
    info.status, info.session_confirmed_empty = "completed", False
    killed = _fake_kill(registry, monkeypatch)

    await registry.reap_agent_jobs({"agent-a"}).wait(timeout=5)

    assert killed == [4242]


async def test_a_killed_agent_cannot_start_new_jobs(monkeypatch):
    registry = _local_registry(monkeypatch)
    registry.reap_agent_jobs({"agent-a"})

    local = await registry.start("localhost", "sleep 30", origin=AGENT)
    lease = _Lease()
    remote = await registry.start_remote(lease, "sleep 30", origin=AGENT)

    assert local == remote == (
        "Error: the agent that started this job was stopped; the job was not started."
    )
    assert registry._processes == {}
    assert lease.release_count == 1
    assert await registry.start("localhost", "sleep 30", origin=JobOrigin("other", "o"))


async def test_a_start_settling_while_its_agent_is_killed_is_terminated(monkeypatch):
    calls = []
    registry: ProcessRegistry

    async def remote_exec_once(_target, script, _timeout):
        registry.reap_agent_jobs({"agent-a"})  # the kill lands mid-start
        args = shlex.split(script.split("nohup python3 ", 1)[1].split(" </dev/null", 1)[0])
        return 0, json.dumps({"token": args[2], "pid": 101, "pgid": 101,
                              "sid": 99, "start_id": "77"})

    async def remote_exec(_target, command, _timeout):
        calls.append(command)
        return 0, json.dumps({"ok": True, "status": "exited", "empty": True,
                              "containment": "owned_descendants",
                              "exit": {"code": -15, "empty": True,
                                       "containment": "owned_descendants"}})

    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    registry = ProcessRegistry(remote_exec=remote_exec, remote_exec_once=remote_exec_once)

    result = await registry.start_remote(_Lease(), "sleep 30", origin=AGENT)

    assert result.startswith("Error: the agent that started this job was stopped while it started")
    assert calls, "the settled job must be killed"


async def test_cleanup_outlives_the_reporting_deadline(monkeypatch):
    registry = _local_registry(monkeypatch)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    killed = _fake_kill(registry, monkeypatch, delay=0.3)

    cleanup = registry.reap_agent_jobs({"agent-a"})
    assert await cleanup.wait(timeout=0.01) is None
    assert "cleanup is still settling" in cleanup.describe(None)

    waiter = asyncio.create_task(cleanup.wait(timeout=60))
    await asyncio.sleep(0.01)
    waiter.cancel()
    await asyncio.sleep(0.5)

    assert killed == [4242]
    assert cleanup.task.done() and cleanup.task.result() == {4242: "stopped"}


async def test_unverified_kill_is_reported_unknown(monkeypatch):
    registry = _local_registry(monkeypatch)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    _fake_kill(registry, monkeypatch,
               reply="Failed to kill PID 4242: cleanup unverified outcome_unknown=true.")

    cleanup = registry.reap_agent_jobs({"agent-a"})
    outcome = await cleanup.wait(timeout=5)

    assert outcome == {4242: "unknown"}
    assert "outcome_unknown=true" in cleanup.describe(outcome)


class _Machine:
    def __init__(self, active: bool) -> None:
        self.is_active = active


def _agent(agent_id: str, *, active: bool = True, parent: str | None = None, turn: str = "t"):
    return SimpleNamespace(id=agent_id, label=agent_id, status="running" if active else "completed",
                           parent_id=parent, turn_id=turn, _sm=_Machine(active))


def _manager(*agents) -> tuple[AgentManager, list[set[str]]]:
    manager = AgentManager.__new__(AgentManager)
    manager._agents = {a.id: a for a in agents}
    manager._retired_lineage = {}
    reaped: list[set[str]] = []
    manager._job_reaper = lambda ids: reaped.append(ids) or AgentJobCleanup(pids=[])
    manager._force_cancel = lambda agent: setattr(agent._sm, "is_active", False)
    manager.get_descendants = lambda agent_id: [
        a.id for a in agents if a.parent_id == agent_id
    ]
    return manager, reaped


def test_kill_reaps_the_agent_and_the_descendants_it_cancelled():
    manager, reaped = _manager(
        _agent("a"), _agent("b", parent="a"), _agent("c", parent="a", active=False),
    )

    message, _cleanup = manager.kill_with_receipt("a")

    assert message == "Kill signal sent to agent 'a' and 1 descendant(s)."
    assert reaped == [{"a", "b"}]


def test_a_finished_agent_is_not_reaped_by_a_later_kill():
    manager, reaped = _manager(_agent("a", active=False), _agent("b", parent="a"))

    manager.kill_with_receipt("a")

    assert reaped == [{"b"}]


def test_stop_cascade_reaps_the_turns_agents():
    manager, reaped = _manager(_agent("a", turn="t1"), _agent("b", turn="t2"))

    assert manager.kill_for_turn("t1") == ["a"]
    assert reaped == [{"a"}]


async def test_kill_agent_reports_the_jobs_it_stopped():
    cleanup = AgentJobCleanup(pids=[2791117])

    async def settled():
        return {2791117: "stopped"}

    cleanup.task = asyncio.create_task(settled())
    tools = AgentTaskTools.__new__(AgentTaskTools)
    tools._agent_manager = SimpleNamespace(
        kill_with_receipt=lambda agent_id: ("Kill signal sent to agent 'sleeper'.", cleanup),
    )

    result = await tools._handle_kill_agent({"agent_id": "3d24e0f2"})

    assert result == ("Kill signal sent to agent 'sleeper'. Stopped 1 background job(s) "
                      "it started (PID 2791117).")


@pytest.mark.parametrize("outcome,expected", [
    ({7: "stopped"}, "Stopped 1 background job(s) it started (PID 7)."),
    ({7: "unknown"}, "Could not confirm that job(s) PID 7 stopped (outcome_unknown=true)."),
    ({7: "stopped_group_only"},
     "Stopped 1 background job(s) it started (PID 7). PID 7: containment=process_group_only; "
     "escaped descendants are unverified."),
    (None, "Stopping 1 background job(s) it started (PID 7); cleanup is still settling."),
])
def test_cleanup_descriptions(outcome, expected):
    assert AgentJobCleanup(pids=[7]).describe(outcome) == expected


async def test_remote_group_only_cleanup_keeps_its_caveat(monkeypatch):
    registry = _local_registry(monkeypatch)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    _fake_kill(registry, monkeypatch, reply="Process 4242 killed. containment=process_group_only; "
                                            "escaped descendants are unverified.")

    outcome = await registry.reap_agent_jobs({"agent-a"}).wait(timeout=5)

    assert outcome == {4242: "stopped_group_only"}
