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


def _fake_terminate(registry: ProcessRegistry, monkeypatch, *, delay: float = 0.0,
                    proven: bool = True) -> list[str]:
    stopped: list[str] = []

    async def terminate(generation):
        await asyncio.sleep(delay)
        stopped.append(generation)
        if proven:
            info = registry._retained_generations[generation]
            info.status = "killed"
            info.session_confirmed_empty = True
        return proven

    monkeypatch.setattr(registry, "terminate_generation", terminate)
    return stopped


async def test_started_jobs_record_their_agent(monkeypatch):
    registry = _local_registry(monkeypatch)

    await registry.start("localhost", "sleep 30", origin=AGENT)
    info = registry._processes[4242]

    assert (info.origin_agent_id, info.origin_root_id) == ("agent-a", "root-a")


def _spawn_pid(monkeypatch, pid: int) -> None:
    monkeypatch.setattr("src.tools.local_supervisor.create_supervised_shell",
                        AsyncMock(return_value=SimpleNamespace(pid=pid)))


async def test_reaping_stops_the_agents_running_jobs_only(monkeypatch):
    registry = _local_registry(monkeypatch, pid=1)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    _spawn_pid(monkeypatch, 2)
    await registry.start("localhost", "sleep 30", origin=JobOrigin("agent-b", "root-b"))
    _spawn_pid(monkeypatch, 3)
    await registry.start("localhost", "sleep 30")  # a chat job: no agent
    stopped = _fake_terminate(registry, monkeypatch)

    cleanup = registry.reap_agent_jobs({"agent-a"})
    outcome = await cleanup.wait(timeout=5)

    assert cleanup.pids == [1] and cleanup.starts == 0
    assert outcome == {"jobs": {1: "stopped"}, "starts": []}
    assert stopped == [registry._processes[1].generation]
    assert registry._processes[2].status == "running"
    assert registry._processes[3].status == "running"
    assert cleanup.describe(outcome) == "Stopped 1 background job(s) it started (PID 1)."


async def test_finished_job_with_unverified_cleanup_is_also_stopped(monkeypatch):
    registry = _local_registry(monkeypatch)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    info = registry._processes[4242]
    info.status, info.session_confirmed_empty = "completed", False
    stopped = _fake_terminate(registry, monkeypatch)

    await registry.reap_agent_jobs({"agent-a"}).wait(timeout=5)

    assert stopped == [info.generation]


async def test_cleanup_targets_captured_generations_not_pid_slots(monkeypatch):
    registry = _local_registry(monkeypatch, pid=1)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    _spawn_pid(monkeypatch, 2)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    first, second = registry._processes[1], registry._processes[2]
    gate = asyncio.Event()
    stopped: list[str] = []

    async def terminate(generation):
        stopped.append(generation)
        if generation == first.generation:
            await gate.wait()
        info = registry._retained_generations[generation]
        info.status, info.session_confirmed_empty = "killed", True
        return True

    monkeypatch.setattr(registry, "terminate_generation", terminate)
    cleanup = registry.reap_agent_jobs({"agent-a"})
    await asyncio.sleep(0)
    # While the first stop is pending, PID slot 2 is reused by another agent's job.
    await registry.start("localhost", "sleep 30", origin=JobOrigin("agent-b", "root-b"))
    replacement = registry._processes[2]
    gate.set()
    outcome = await cleanup.wait(timeout=5)

    assert replacement is not second
    assert stopped == [first.generation, second.generation]
    assert outcome == {"jobs": {1: "stopped", 2: "stopped"}, "starts": []}
    assert replacement.status == "running"


async def test_a_killed_agent_cannot_start_new_jobs(monkeypatch):
    registry = _local_registry(monkeypatch)
    registry.reap_agent_jobs({"agent-a"})

    local_lease = _Lease()
    local = await registry.start("localhost", "sleep 30", origin=AGENT, host_lease=local_lease)
    lease = _Lease()
    remote = await registry.start_remote(lease, "sleep 30", origin=AGENT)

    assert local == remote == (
        "Error: the agent that started this job was stopped; the job was not started."
    )
    assert registry._processes == {}
    assert lease.release_count == local_lease.release_count == 1
    assert await registry.start("localhost", "sleep 30", origin=JobOrigin("other", "o"))


PROVEN_KILL = {"ok": True, "status": "exited", "empty": True,
               "containment": "owned_descendants",
               "exit": {"code": -15, "empty": True, "containment": "owned_descendants"}}
UNPROVEN_KILL = {"ok": False, "error": "remote cleanup unverified"}


def _remote_registry(monkeypatch, kill_reply: dict, *, gate: asyncio.Event | None = None,
                     on_start=None):
    entered = asyncio.Event()
    calls: list[str] = []

    async def remote_exec_once(_target, script, _timeout):
        entered.set()
        if on_start is not None:
            on_start()
        if gate is not None:
            await gate.wait()
        args = shlex.split(script.split("nohup python3 ", 1)[1].split(" </dev/null", 1)[0])
        return 0, json.dumps({"token": args[2], "pid": 101, "pgid": 101,
                              "sid": 99, "start_id": "77"})

    async def remote_exec(_target, command, _timeout):
        calls.append(command)
        return 0, json.dumps(kill_reply)

    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    registry = ProcessRegistry(remote_exec=remote_exec, remote_exec_once=remote_exec_once)
    return registry, calls, entered


async def _settled(registry: ProcessRegistry) -> None:
    if registry._start_tasks:
        await asyncio.wait(set(registry._start_tasks), timeout=5)


async def test_a_start_settling_while_its_agent_is_killed_is_terminated(monkeypatch):
    holder = {}
    registry, calls, _entered = _remote_registry(
        monkeypatch, PROVEN_KILL,
        on_start=lambda: holder.update(cleanup=registry.reap_agent_jobs({"agent-a"})))
    lease = _Lease()

    result = await registry.start_remote(lease, "sleep 30", origin=AGENT)

    assert result == ("Error: the agent that started this job was stopped while it started; "
                      "process terminated.")
    assert calls, "the settled job must be killed"
    cleanup = holder["cleanup"]
    assert (cleanup.pids, cleanup.starts) == ([], 1)
    assert await cleanup.wait(timeout=5) == {"jobs": {}, "starts": ["stopped"]}
    assert lease.release_count == 1


async def test_kill_during_remote_startup_settles_in_the_registry(monkeypatch):
    gate = asyncio.Event()
    registry, calls, entered = _remote_registry(monkeypatch, PROVEN_KILL, gate=gate)
    lease = _Lease()
    invocation = asyncio.create_task(registry.start_remote(lease, "sleep 30", origin=AGENT))
    await entered.wait()

    invocation.cancel()  # a killed agent cancels its own invocation
    cleanup = registry.reap_agent_jobs({"agent-a"})
    with pytest.raises(asyncio.CancelledError):
        await invocation
    assert (cleanup.pids, cleanup.starts) == ([], 1)
    assert "1 start(s) it had in progress" in cleanup.describe(None)
    gate.set()
    outcome = await cleanup.wait(timeout=5)

    assert outcome == {"jobs": {}, "starts": ["stopped"]}
    assert calls and lease.release_count == 1
    assert not registry._start_tasks and not registry._agent_starts
    assert cleanup.describe(outcome) == "Stopped 1 job(s) whose start was in progress."


async def test_unverified_cleanup_of_a_settling_start_keeps_the_lease(monkeypatch):
    gate = asyncio.Event()
    registry, _calls, entered = _remote_registry(monkeypatch, UNPROVEN_KILL, gate=gate)
    lease = _Lease()
    invocation = asyncio.create_task(registry.start_remote(lease, "sleep 30", origin=AGENT))
    await entered.wait()
    invocation.cancel()
    cleanup = registry.reap_agent_jobs({"agent-a"})
    gate.set()

    outcome = await cleanup.wait(timeout=5)

    assert outcome == {"jobs": {}, "starts": ["unknown"]}
    assert lease.release_count == 0  # the record still owns its generation
    assert "outcome_unknown=true" in cleanup.describe(outcome)
    with pytest.raises(asyncio.CancelledError):
        await invocation


async def test_a_cancelled_invocation_stops_the_job_it_would_have_received(monkeypatch):
    gate = asyncio.Event()
    registry, calls, entered = _remote_registry(monkeypatch, PROVEN_KILL, gate=gate)
    lease = _Lease()
    invocation = asyncio.create_task(registry.start_remote(lease, "sleep 30", origin=AGENT))
    await entered.wait()

    invocation.cancel()  # e.g. the agent's own tool deadline; the agent lives on
    with pytest.raises(asyncio.CancelledError):
        await invocation
    gate.set()
    await _settled(registry)

    assert calls and lease.release_count == 1
    assert all(info.session_confirmed_empty for info in registry._processes.values())


async def test_local_start_in_progress_is_part_of_the_receipt(monkeypatch):
    registry = ProcessRegistry()
    entered, gate = asyncio.Event(), asyncio.Event()

    async def spawn(*_args, **_kwargs):
        entered.set()
        await gate.wait()
        return SimpleNamespace(pid=4243)

    terminated: list[int] = []

    async def terminate(info):
        terminated.append(info.pid)
        info.status, info.session_confirmed_empty = "killed", True
        return True

    monkeypatch.setattr("src.tools.local_supervisor.create_supervised_shell", spawn)
    monkeypatch.setattr(registry, "_read_output", AsyncMock())
    monkeypatch.setattr(registry, "_watch_exit", AsyncMock())
    monkeypatch.setattr(registry, "_terminate_bound_host_job", terminate)
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    invocation = asyncio.create_task(registry.start("localhost", "sleep 30", origin=AGENT))
    await entered.wait()

    invocation.cancel()
    cleanup = registry.reap_agent_jobs({"agent-a"})
    with pytest.raises(asyncio.CancelledError):
        await invocation
    gate.set()

    assert await cleanup.wait(timeout=5) == {"jobs": {}, "starts": ["stopped"]}
    assert terminated == [4243]


async def test_shutdown_settles_agent_starts_before_its_sweep(monkeypatch):
    monkeypatch.setattr("src.tools.process_manager.SHUTDOWN_START_SETTLE_TIMEOUT", 0.05)
    registry, calls, entered = _remote_registry(monkeypatch, PROVEN_KILL, gate=asyncio.Event())
    lease = _Lease()
    invocation = asyncio.create_task(registry.start_remote(lease, "sleep 30", origin=AGENT))
    await entered.wait()

    await registry.shutdown()

    assert not registry._start_tasks and not registry._agent_starts
    assert calls, "the unsettled start was torn down"
    assert lease.release_count == 1
    with pytest.raises(asyncio.CancelledError):
        await invocation


async def test_cleanup_outlives_the_reporting_deadline(monkeypatch):
    registry = _local_registry(monkeypatch)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    stopped = _fake_terminate(registry, monkeypatch, delay=0.3)

    cleanup = registry.reap_agent_jobs({"agent-a"})
    assert await cleanup.wait(timeout=0.01) is None
    assert "cleanup is still settling" in cleanup.describe(None)

    waiter = asyncio.create_task(cleanup.wait(timeout=60))
    await asyncio.sleep(0.01)
    waiter.cancel()
    await asyncio.sleep(0.5)

    assert stopped == [registry._processes[4242].generation]
    assert cleanup.task.done() and cleanup.task.result() == {"jobs": {4242: "stopped"},
                                                             "starts": []}


async def test_unverified_stop_is_reported_unknown(monkeypatch):
    registry = _local_registry(monkeypatch)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    _fake_terminate(registry, monkeypatch, proven=False)

    cleanup = registry.reap_agent_jobs({"agent-a"})
    outcome = await cleanup.wait(timeout=5)

    assert outcome == {"jobs": {4242: "unknown"}, "starts": []}
    assert "outcome_unknown=true" in cleanup.describe(outcome)


async def test_remote_group_only_containment_keeps_its_caveat(monkeypatch):
    registry = ProcessRegistry()
    info = SimpleNamespace(remote=True, containment="process_group_only", generation="g1",
                           pid=-1, _remote_lock=asyncio.Lock())

    async def proven(_generation):
        return True

    monkeypatch.setattr(registry, "terminate_generation", proven)

    assert await registry._stop_generation(info) == "stopped_group_only"


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
        return {"jobs": {2791117: "stopped"}, "starts": []}

    cleanup.task = asyncio.create_task(settled())
    tools = AgentTaskTools.__new__(AgentTaskTools)
    tools._agent_manager = SimpleNamespace(
        kill_with_receipt=lambda agent_id: ("Kill signal sent to agent 'sleeper'.", cleanup),
    )

    result = await tools._handle_kill_agent({"agent_id": "3d24e0f2"})

    assert result == ("Kill signal sent to agent 'sleeper'. Stopped 1 background job(s) "
                      "it started (PID 2791117).")


async def test_kill_agent_reports_a_start_in_progress():
    cleanup = AgentJobCleanup(pids=[], starts=1)

    async def settled():
        return {"jobs": {}, "starts": ["not_started"]}

    cleanup.task = asyncio.create_task(settled())
    tools = AgentTaskTools.__new__(AgentTaskTools)
    tools._agent_manager = SimpleNamespace(
        kill_with_receipt=lambda agent_id: ("Kill signal sent to agent 'sleeper'.", cleanup),
    )

    result = await tools._handle_kill_agent({"agent_id": "3d24e0f2"})

    assert result == ("Kill signal sent to agent 'sleeper'. 1 start(s) in progress never "
                      "started a job.")


@pytest.mark.parametrize("starts,outcome,expected", [
    (0, {"jobs": {7: "stopped"}, "starts": []},
     "Stopped 1 background job(s) it started (PID 7)."),
    (0, {"jobs": {7: "unknown"}, "starts": []},
     "Could not confirm that job(s) PID 7 stopped (outcome_unknown=true)."),
    (0, {"jobs": {7: "stopped_group_only"}, "starts": []},
     "Stopped 1 background job(s) it started (PID 7). PID 7: containment=process_group_only; "
     "escaped descendants are unverified."),
    (0, None, "Stopping 1 background job(s) it started (PID 7); cleanup is still settling."),
    (2, None, "Stopping 1 background job(s) it started (PID 7) and 2 start(s) it had in "
              "progress; cleanup is still settling."),
    (2, {"jobs": {7: "stopped"}, "starts": ["stopped", "unknown"]},
     "Stopped 1 background job(s) it started (PID 7). Stopped 1 job(s) whose start was in "
     "progress. Could not confirm the outcome of 1 start(s) in progress (outcome_unknown=true)."),
])
def test_cleanup_descriptions(starts, outcome, expected):
    assert AgentJobCleanup(pids=[7], starts=starts).describe(outcome) == expected
