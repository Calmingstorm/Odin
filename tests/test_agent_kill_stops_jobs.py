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
    capture_job_origin,
    current_job_origin,
)
from src.agents.manager import AgentManager
from src.agents.tool_cycle import execute_cycle
from src.discord.native_tools.agents_tasks import AgentTaskTools
from src.tools.executor import ToolExecutor
from src.tools.process_manager import AgentJobCleanup, ProcessRegistry, _AgentStart
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


async def test_the_origin_does_not_reach_a_worker_thread():
    # to_thread copies the context, but a worker thread runs no task to match.
    with bound_job_origin(AGENT):
        assert await asyncio.to_thread(current_job_origin) is None


async def test_an_agent_without_an_id_gives_its_jobs_no_origin():
    with agent_dispatch(SimpleNamespace(id="", root_id="root-a"), {"id": "call-1"}):
        assert capture_job_origin() is None


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

    first = registry._processes[1].generation
    assert cleanup.pids == [1] and cleanup.starts == 0
    assert outcome == {"jobs": {first: "stopped"}, "starts": []}
    assert stopped == [first]
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
    assert outcome == {"jobs": {first.generation: "stopped", second.generation: "stopped"},
                       "starts": []}
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

    generation = registry._processes[4242].generation
    assert stopped == [generation]
    assert cleanup.task.done() and cleanup.task.result() == {"jobs": {generation: "stopped"},
                                                             "starts": []}


async def test_unverified_stop_is_reported_unknown(monkeypatch):
    registry = _local_registry(monkeypatch)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    _fake_terminate(registry, monkeypatch, proven=False)

    cleanup = registry.reap_agent_jobs({"agent-a"})
    outcome = await cleanup.wait(timeout=5)

    assert outcome == {"jobs": {registry._processes[4242].generation: "unknown"}, "starts": []}
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
    manager._job_reaper = lambda ids: reaped.append(ids) or AgentJobCleanup(jobs=[])
    manager._force_cancel = lambda agent: setattr(agent._sm, "is_active", False)
    manager.get_descendants = lambda agent_id: [
        a.id for a in agents if a.parent_id == agent_id
    ]
    return manager, reaped


def test_kill_reaps_the_agent_and_the_descendants_it_cancelled():
    manager, reaped = _manager(
        _agent("a"), _agent("b", parent="a"), _agent("c", parent="a", active=False),
    )

    message, cleanup = manager.kill_with_receipt("a")

    assert message == "Kill signal sent to agent 'a' and 1 descendant(s)."
    assert reaped == [{"a", "b"}]
    assert isinstance(cleanup, AgentJobCleanup)  # the reaper ran without error


def test_a_finished_agent_is_not_reaped_by_a_later_kill():
    manager, reaped = _manager(_agent("a", active=False), _agent("b", parent="a"))

    manager.kill_with_receipt("a")

    assert reaped == [{"b"}]


def test_stop_cascade_reaps_the_turns_agents():
    manager, reaped = _manager(_agent("a", turn="t1"), _agent("b", turn="t2"))

    assert manager.kill_for_turn("t1") == ["a"]
    assert reaped == [{"a"}]


def test_killing_an_unknown_agent_reaps_nothing():
    manager, reaped = _manager(_agent("a"))

    assert manager.kill_with_receipt("nope") == ("Error: Agent 'nope' not found.", None)
    assert reaped == []


def test_a_failing_reaper_does_not_stop_the_kill():
    manager, _reaped = _manager(_agent("a"))

    def closed_registry(_ids):
        raise RuntimeError("registry closed")

    manager._job_reaper = closed_registry

    assert manager.kill_with_receipt("a") == ("Kill signal sent to agent 'a'.", None)
    assert manager._agents["a"]._sm.is_active is False


async def test_kill_agent_reports_the_jobs_it_stopped():
    cleanup = AgentJobCleanup(jobs=[("g1", 2791117)])

    async def settled():
        return {"jobs": {"g1": "stopped"}, "starts": []}

    cleanup.task = asyncio.create_task(settled())
    tools = AgentTaskTools.__new__(AgentTaskTools)
    tools._agent_manager = SimpleNamespace(
        kill_with_receipt=lambda agent_id: ("Kill signal sent to agent 'sleeper'.", cleanup),
    )

    result = await tools._handle_kill_agent({"agent_id": "3d24e0f2"})

    assert result == ("Kill signal sent to agent 'sleeper'. Stopped 1 background job(s) "
                      "it started (PID 2791117).")


async def test_kill_agent_reports_a_start_in_progress():
    cleanup = AgentJobCleanup(jobs=[], starts=1)

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
    (0, {"jobs": {"g7": "stopped"}, "starts": []},
     "Stopped 1 background job(s) it started (PID 7)."),
    (0, {"jobs": {"g7": "unknown"}, "starts": []},
     "Could not confirm that job(s) PID 7 stopped (outcome_unknown=true)."),
    (0, {"jobs": {"g7": "stopped_group_only"}, "starts": []},
     "Stopped 1 background job(s) it started (PID 7). PID 7: containment=process_group_only; "
     "escaped descendants are unverified."),
    (0, None, "Stopping 1 background job(s) it started (PID 7); cleanup is still settling."),
    (2, None, "Stopping 1 background job(s) it started (PID 7) and 2 start(s) it had in "
              "progress; cleanup is still settling."),
    (2, {"jobs": {"g7": "stopped"}, "starts": ["stopped", "unknown"]},
     "Stopped 1 background job(s) it started (PID 7). Stopped 1 job(s) whose start was in "
     "progress. Could not confirm the outcome of 1 start(s) in progress (outcome_unknown=true)."),
])
def test_cleanup_descriptions(starts, outcome, expected):
    assert AgentJobCleanup(jobs=[("g7", 7)], starts=starts).describe(outcome) == expected


async def test_receipts_keep_each_generation_even_when_pids_repeat(monkeypatch):
    registry = _local_registry(monkeypatch, pid=777)
    await registry.start("localhost", "sleep 30", origin=AGENT)
    first = registry._processes[777]
    first.status, first.session_confirmed_empty = "completed", False  # cleanup unverified
    await registry.start("localhost", "sleep 30", origin=AGENT)  # PID 777 reused
    second = registry._processes[777]

    async def terminate(generation):
        return generation == second.generation

    monkeypatch.setattr(registry, "terminate_generation", terminate)
    cleanup = registry.reap_agent_jobs({"agent-a"})
    outcome = await cleanup.wait(timeout=5)

    assert outcome["jobs"] == {first.generation: "unknown", second.generation: "stopped"}
    assert cleanup.describe(outcome) == (
        "Stopped 1 background job(s) it started (PID 777). Could not confirm that job(s) "
        "PID 777 stopped (outcome_unknown=true).")


def _failing_start_registry(monkeypatch, replies: dict, *, failure: str):
    async def remote_exec_once(_target, script, _timeout):
        if failure == "transport":
            raise RuntimeError("connection reset after dispatch")
        return 0, "not the supervisor's ready line"  # malformed settlement

    async def remote_exec(_target, _command, _timeout):
        return 0, json.dumps(replies["teardown"])

    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    return ProcessRegistry(remote_exec=remote_exec, remote_exec_once=remote_exec_once)


@pytest.mark.parametrize("failure", ["transport", "malformed"])
async def test_an_agent_start_that_may_still_run_keeps_its_lease_until_proven(monkeypatch, failure):
    replies = {"teardown": UNPROVEN_KILL}
    registry = _failing_start_registry(monkeypatch, replies, failure=failure)
    lease = _Lease()

    result = await registry.start_remote(lease, "sleep 30", origin=AGENT)

    assert "outcome_unknown=true" in result
    assert lease.release_count == 0 and len(registry._unsettled_remote_starts) == 1
    assert registry._active_count() == 1
    # Killing the agent retries the teardown; still unverified, it stays.
    cleanup = registry.reap_agent_jobs({"agent-a"})
    assert cleanup.starts == 1
    assert await cleanup.wait(timeout=5) == {"jobs": {}, "starts": ["unknown"]}
    assert lease.release_count == 0
    # Once a teardown is proven, the start and its lease go.
    replies["teardown"] = PROVEN_KILL
    cleanup = registry.reap_agent_jobs({"agent-a"})
    assert await cleanup.wait(timeout=5) == {"jobs": {}, "starts": ["stopped"]}
    assert lease.release_count == 1 and not registry._unsettled_remote_starts


async def test_a_chat_start_failure_still_releases_at_once(monkeypatch):
    registry = _failing_start_registry(monkeypatch, {"teardown": UNPROVEN_KILL},
                                       failure="transport")
    lease = _Lease()

    await registry.start_remote(lease, "sleep 30")

    assert lease.release_count == 1 and not registry._unsettled_remote_starts


async def test_shutdown_vetoes_a_start_that_may_still_run(monkeypatch):
    from src.tools.process_manager import ProcessCleanupError

    registry = _failing_start_registry(monkeypatch, {"teardown": UNPROVEN_KILL},
                                       failure="malformed")
    await registry.start_remote(_Lease(), "sleep 30", origin=AGENT)

    with pytest.raises(ProcessCleanupError, match="may still run"):
        await registry.shutdown()


async def test_shutdown_vetoes_while_an_agent_start_is_still_tearing_down(monkeypatch):
    from src.tools.process_manager import ProcessCleanupError

    monkeypatch.setattr("src.tools.process_manager.SHUTDOWN_START_SETTLE_TIMEOUT", 0.05)
    entered, teardown_gate = asyncio.Event(), asyncio.Event()

    async def remote_exec_once(_target, _script, _timeout):
        entered.set()
        await asyncio.Event().wait()  # never settles: shutdown cancels it

    async def remote_exec(_target, _command, _timeout):
        await teardown_gate.wait()  # the cancelled start's teardown is slow
        return 0, json.dumps(PROVEN_KILL)

    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    registry = ProcessRegistry(remote_exec=remote_exec, remote_exec_once=remote_exec_once)
    lease = _Lease()
    invocation = asyncio.create_task(registry.start_remote(lease, "sleep 30", origin=AGENT))
    await entered.wait()

    with pytest.raises(ProcessCleanupError, match="had not finished settling"):
        await registry.shutdown()
    teardown_gate.set()
    await _settled(registry)

    assert lease.release_count == 1 and not registry._start_tasks
    with pytest.raises(asyncio.CancelledError):
        await invocation


def _gated_teardown_registry(monkeypatch, *, failure: str):
    """A start that fails (or never settles), whose teardown waits on a gate.
    The teardown replies with ``state["reply"]`` when set, else proven or not."""
    gate, state = asyncio.Event(), {"proven": False, "reply": None, "entered": asyncio.Event()}

    async def remote_exec_once(_target, _script, _timeout):
        state["entered"].set()
        if failure == "transport":
            raise RuntimeError("connection reset after dispatch")
        if failure == "malformed":
            return 0, "not the supervisor's ready line"
        await asyncio.Event().wait()  # never settles: only cancellation ends it

    async def remote_exec(_target, _command, _timeout):
        await gate.wait()
        return 0, json.dumps(state["reply"] or (PROVEN_KILL if state["proven"] else UNPROVEN_KILL))

    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    monkeypatch.setattr("src.tools.process_manager.SHUTDOWN_START_SETTLE_TIMEOUT", 0.05)
    registry = ProcessRegistry(remote_exec=remote_exec, remote_exec_once=remote_exec_once)
    return registry, gate, state


@pytest.mark.parametrize("failure", ["transport", "malformed", "dispatch"])
async def test_cancelled_teardown_never_drops_an_agent_starts_ownership(monkeypatch, failure):
    from src.tools.process_manager import ProcessCleanupError

    registry, gate, state = _gated_teardown_registry(monkeypatch, failure=failure)
    lease = _Lease()
    invocation = asyncio.create_task(registry.start_remote(lease, "sleep 30", origin=AGENT))
    await state["entered"].wait()

    # Shutdown cancels the start while its teardown is pending, then again.
    for _ in range(2):
        with pytest.raises(ProcessCleanupError):
            await registry.shutdown()
        assert len(registry._unsettled_remote_starts) == 1
        assert lease.release_count == 0
        # One execution, one slot: retained, or still settling on its reservation.
        assert registry._active_count() + registry._pending_starts == 1
    cleanup = registry.reap_agent_jobs({"agent-a"})
    assert cleanup.starts == 1

    # A proven teardown, and only that, releases it.
    state["proven"] = True
    gate.set()
    assert await cleanup.wait(timeout=5) == {"jobs": {}, "starts": ["stopped"]}
    assert lease.release_count == 1 and not registry._unsettled_remote_starts
    assert await registry.shutdown() == 0
    with pytest.raises(asyncio.CancelledError):  # shutdown cancelled the start
        await invocation


async def _until(predicate, timeout: float = 5.0) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while not predicate():
        assert asyncio.get_running_loop().time() < deadline, "the condition never held"
        await asyncio.sleep(0.001)


@pytest.mark.parametrize("proven,receipt", [
    (True, "Stopped 1 job(s) whose start was in progress."),
    (False, "Could not confirm the outcome of 1 start(s) in progress (outcome_unknown=true)."),
], ids=["proven", "unverified"])
async def test_a_start_retained_mid_teardown_is_one_receipt_entry(monkeypatch, proven, receipt):
    registry, gate, state = _gated_teardown_registry(monkeypatch, failure="transport")
    lease = _Lease()
    invocation = asyncio.create_task(registry.start_remote(lease, "sleep 30", origin=AGENT))
    # Retained before its paused teardown, so it is still a settling start too.
    await _until(lambda: registry._unsettled_remote_starts)

    cleanup = registry.reap_agent_jobs({"agent-a"})
    assert cleanup.starts == 1
    state["proven"] = proven
    gate.set()
    outcome = await cleanup.wait(timeout=5)

    assert outcome == {"jobs": {}, "starts": ["stopped" if proven else "unknown"]}
    assert cleanup.describe(outcome) == receipt
    assert lease.release_count == (1 if proven else 0)
    assert len(registry._unsettled_remote_starts) == (0 if proven else 1)
    await invocation


async def test_starts_retained_mid_teardown_take_one_slot_each(monkeypatch):
    registry, gate, state = _gated_teardown_registry(monkeypatch, failure="transport")
    leases = [_Lease() for _ in range(11)]
    invocations = [asyncio.create_task(registry.start_remote(lease, "sleep 30", origin=AGENT))
                   for lease in leases[:10]]
    await _until(lambda: len(registry._unsettled_remote_starts) == 10)

    assert registry._active_count() + registry._pending_starts == 10
    # Ten of twenty slots: an eleventh start is admitted (and fails the same way).
    eleventh = asyncio.create_task(registry.start_remote(leases[10], "sleep 30", origin=AGENT))
    await _until(lambda: eleventh.done() or len(registry._unsettled_remote_starts) == 11)
    assert not eleventh.done(), eleventh.result()
    invocations.append(eleventh)

    # Settled with their teardowns unverified, each keeps exactly its one slot.
    gate.set()
    await asyncio.gather(*invocations)
    assert registry._pending_starts == 0 and registry._active_count() == 11
    # Proven teardowns then release every slot and lease.
    state["proven"] = True
    cleanup = registry.reap_agent_jobs({"agent-a"})
    assert cleanup.starts == 11
    assert await cleanup.wait(timeout=5) == {"jobs": {}, "starts": ["stopped"] * 11}
    assert registry._active_count() == 0
    assert [lease.release_count for lease in leases] == [1] * 11


async def test_a_kill_with_nothing_to_stop_has_an_empty_receipt():
    cleanup = ProcessRegistry().reap_agent_jobs({"agent-a"})

    assert cleanup.task is None
    assert await cleanup.wait(timeout=0) == {"jobs": {}, "starts": []}
    assert cleanup.describe(None) == ""


async def test_a_stop_that_raises_is_reported_unknown(monkeypatch):
    registry = _local_registry(monkeypatch)
    await registry.start("localhost", "sleep 30", origin=AGENT)

    async def terminate(_generation):
        raise RuntimeError("supervisor socket closed")

    monkeypatch.setattr(registry, "terminate_generation", terminate)
    cleanup = registry.reap_agent_jobs({"agent-a"})
    outcome = await cleanup.wait(timeout=5)

    assert outcome == {"jobs": {registry._processes[4242].generation: "unknown"}, "starts": []}
    assert cleanup.describe(outcome) == (
        "Could not confirm that job(s) PID 4242 stopped (outcome_unknown=true).")


GROUP_ONLY_KILL = {"ok": True, "killed": True, "empty": True, "group_empty": True,
                   "containment": "process_group_only",
                   "exit": {"exit_code": -15, "empty": True, "group_empty": True,
                            "containment": "process_group_only"}}
GROUP_ONLY_RECEIPT = (
    "Stopped 1 job(s) whose start was in progress. A job whose start was in progress: "
    "containment=process_group_only; escaped descendants are unverified.")


async def test_a_start_stopped_with_group_only_containment_keeps_its_caveat(monkeypatch):
    holder = {}
    registry, calls, _entered = _remote_registry(
        monkeypatch, GROUP_ONLY_KILL,
        on_start=lambda: holder.update(cleanup=registry.reap_agent_jobs({"agent-a"})))

    await registry.start_remote(_Lease(), "sleep 30", origin=AGENT)

    cleanup = holder["cleanup"]
    outcome = await cleanup.wait(timeout=5)
    assert calls, "the settled job must be killed"
    assert outcome == {"jobs": {}, "starts": ["stopped_group_only"]}
    assert cleanup.describe(outcome) == GROUP_ONLY_RECEIPT


async def test_a_failed_start_whose_teardown_proves_only_its_group_keeps_the_caveat(monkeypatch):
    registry, gate, state = _gated_teardown_registry(monkeypatch, failure="transport")
    lease = _Lease()
    invocation = asyncio.create_task(registry.start_remote(lease, "sleep 30", origin=AGENT))
    await _until(lambda: registry._unsettled_remote_starts)

    cleanup = registry.reap_agent_jobs({"agent-a"})
    state["reply"] = GROUP_ONLY_KILL  # the start's own teardown proves only the group empty
    gate.set()
    outcome = await cleanup.wait(timeout=5)

    assert outcome == {"jobs": {}, "starts": ["stopped_group_only"]}
    assert cleanup.describe(outcome) == GROUP_ONLY_RECEIPT
    assert lease.release_count == 1 and not registry._unsettled_remote_starts
    await invocation


@pytest.mark.parametrize("retry_reply,stop_state", [
    (PROVEN_KILL, "stopped"),
    (GROUP_ONLY_KILL, "stopped_group_only"),
], ids=["owned", "group-only"])
async def test_a_kill_retries_a_start_whose_own_teardown_was_unproven(monkeypatch, retry_reply,
                                                                    stop_state):
    gate = asyncio.Event()
    replies = [UNPROVEN_KILL, retry_reply]  # the start's own teardown, then the kill's retry

    async def remote_exec_once(_target, _script, _timeout):
        raise RuntimeError("connection reset after dispatch")

    async def remote_exec(_target, _command, _timeout):
        await gate.wait()
        return 0, json.dumps(replies.pop(0))

    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    registry = ProcessRegistry(remote_exec=remote_exec, remote_exec_once=remote_exec_once)
    lease = _Lease()
    invocation = asyncio.create_task(registry.start_remote(lease, "sleep 30", origin=AGENT))
    await _until(lambda: registry._unsettled_remote_starts)

    cleanup = registry.reap_agent_jobs({"agent-a"})
    gate.set()

    assert await cleanup.wait(timeout=5) == {"jobs": {}, "starts": [stop_state]}
    assert replies == []
    assert lease.release_count == 1 and not registry._unsettled_remote_starts
    assert "outcome_unknown=true" in await invocation


async def test_a_local_start_cancelled_mid_spawn_is_reported_unknown(monkeypatch):
    monkeypatch.setattr("src.tools.process_manager.SHUTDOWN_START_SETTLE_TIMEOUT", 0.05)
    registry = ProcessRegistry()
    entered = asyncio.Event()

    async def spawn(*_args, **_kwargs):
        entered.set()
        await asyncio.Event().wait()  # only shutdown's cancellation ends it

    monkeypatch.setattr("src.tools.local_supervisor.create_supervised_shell", spawn)
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    lease = _Lease()
    lease.revoked = False  # a host lease field the local start reads
    invocation = asyncio.create_task(
        registry.start("localhost", "sleep 30", origin=AGENT, host_lease=lease))
    await asyncio.wait_for(entered.wait(), timeout=5)
    cleanup = registry.reap_agent_jobs({"agent-a"})

    assert await registry.shutdown() == 0
    # A spawn cancelled mid-call may already have run: the receipt cannot say it did not.
    assert await cleanup.wait(timeout=5) == {"jobs": {}, "starts": ["unknown"]}
    assert lease.release_count == 1
    with pytest.raises(asyncio.CancelledError):
        await invocation


async def test_a_start_that_never_reached_its_host_never_started_a_job(monkeypatch):
    gate, entered = asyncio.Event(), asyncio.Event()
    teardowns: list[str] = []

    async def remote_exec_once(_target, _script, _timeout):
        entered.set()
        await gate.wait()
        return 255, "ssh: connect to host 10.0.0.9 port 22: No route to host\r\n"

    async def remote_exec(_target, command, _timeout):
        teardowns.append(command)
        return 0, json.dumps(PROVEN_KILL)

    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    registry = ProcessRegistry(remote_exec=remote_exec, remote_exec_once=remote_exec_once)
    lease = _Lease()
    invocation = asyncio.create_task(registry.start_remote(lease, "sleep 30", origin=AGENT))
    await asyncio.wait_for(entered.wait(), timeout=5)

    cleanup = registry.reap_agent_jobs({"agent-a"})
    gate.set()
    outcome = await cleanup.wait(timeout=5)

    assert outcome == {"jobs": {}, "starts": ["not_started"]}
    assert cleanup.describe(outcome) == "1 start(s) in progress never started a job."
    assert "nothing was started" in await invocation
    assert teardowns == [] and lease.release_count == 1


@pytest.mark.parametrize("reply,outcome", [
    ("Failed to start process: SSH settlement was not observed; outcome unknown "
     "outcome_unknown=true: ", "unknown"),
    ("Failed to start process: remote execution is unavailable", "not_started"),
], ids=["unknown", "not-started"])
async def test_a_start_that_registered_no_job_is_classified_by_its_reply(reply, outcome):
    registry = ProcessRegistry()
    agent_start = _AgentStart(AGENT)
    settled: list[bool] = []

    async def start():
        return reply

    assert await registry._own_agent_start(agent_start, start(),
                                           lambda: settled.append(True)) == reply
    assert agent_start.outcome == outcome and settled == [True]
    assert agent_start.settled.is_set() and agent_start not in registry._agent_starts


async def test_a_retained_start_retried_with_group_only_proof_keeps_the_caveat(monkeypatch):
    replies = {"teardown": UNPROVEN_KILL}
    registry = _failing_start_registry(monkeypatch, replies, failure="transport")
    lease = _Lease()
    await registry.start_remote(lease, "sleep 30", origin=AGENT)  # may still run: retained
    replies["teardown"] = GROUP_ONLY_KILL

    cleanup = registry.reap_agent_jobs({"agent-a"})
    outcome = await cleanup.wait(timeout=5)

    assert outcome == {"jobs": {}, "starts": ["stopped_group_only"]}
    assert cleanup.describe(outcome) == GROUP_ONLY_RECEIPT
    assert lease.release_count == 1 and not registry._unsettled_remote_starts


@pytest.mark.parametrize("proof,stop_state", [
    (PROVEN_KILL, "stopped"),
    (GROUP_ONLY_KILL, "stopped_group_only"),
], ids=["owned", "group-only"])
async def test_a_host_revoke_and_a_kill_release_a_retained_start_once(monkeypatch, proof,
                                                                     stop_state):
    replies = {"teardown": UNPROVEN_KILL}
    registry = _failing_start_registry(monkeypatch, replies, failure="transport")
    lease = _Lease()
    await registry.start_remote(lease, "sleep 30", origin=AGENT)  # may still run: retained
    replies["teardown"] = proof

    cleanup = registry.reap_agent_jobs({"agent-a"})  # selects the retained start
    # The host is revoked before the kill's cleanup runs, and the revoke proves the teardown;
    # the kill then reports the scope the revoke proved.
    assert await registry.force_revoke_host("remote") == {"attempted": 1, "killed": 1,
                                                           "unknown": 0}

    assert await cleanup.wait(timeout=5) == {"jobs": {}, "starts": [stop_state]}
    assert lease.release_count == 1 and not registry._unsettled_remote_starts


async def test_a_host_revoke_keeps_a_retained_start_it_cannot_prove_stopped(monkeypatch):
    registry = _failing_start_registry(monkeypatch, {"teardown": UNPROVEN_KILL},
                                       failure="transport")
    lease = _Lease()
    await registry.start_remote(lease, "sleep 30", origin=AGENT)

    assert await registry.force_revoke_host("remote") == {"attempted": 1, "killed": 0,
                                                           "unknown": 1}
    assert lease.release_count == 0 and len(registry._unsettled_remote_starts) == 1


async def test_a_teardown_retry_that_raises_keeps_the_start_and_its_lease(monkeypatch):
    registry = _failing_start_registry(monkeypatch, {"teardown": UNPROVEN_KILL},
                                       failure="transport")
    lease = _Lease()
    await registry.start_remote(lease, "sleep 30", origin=AGENT)

    async def broken_teardown(*_args):
        raise RuntimeError("controller unavailable")

    monkeypatch.setattr(registry, "_teardown_unsettled_remote", broken_teardown)
    cleanup = registry.reap_agent_jobs({"agent-a"})

    # The cleanup task survives the error and reports the start as unverified.
    assert await cleanup.wait(timeout=5) == {"jobs": {}, "starts": ["unknown"]}
    assert lease.release_count == 0 and len(registry._unsettled_remote_starts) == 1


def _scripted_teardown_registry(monkeypatch, script: list):
    """An agent start whose dispatch fails. Each teardown call takes the next
    step of *script*: a reply, an exception, or (gate, reply or exception)."""
    calls: list[int] = []

    async def remote_exec_once(_target, _script, _timeout):
        raise RuntimeError("connection reset after dispatch")

    async def remote_exec(_target, _command, _timeout):
        calls.append(len(calls))
        step = script.pop(0)
        if isinstance(step, tuple):
            gate, step = step
            await gate.wait()
        if isinstance(step, BaseException):
            raise step
        return 0, json.dumps(step)

    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    return ProcessRegistry(remote_exec=remote_exec, remote_exec_once=remote_exec_once), calls


@pytest.mark.parametrize("competitor", ["host-revoke", "second-kill"])
@pytest.mark.parametrize("first_result", [UNPROVEN_KILL, ConnectionError("controller lost")],
                         ids=["unproven", "exception"])
async def test_a_retry_that_loses_the_race_reports_the_winners_proof(monkeypatch, first_result,
                                                                    competitor):
    gate = asyncio.Event()
    # The start's own teardown, the kill's retry (held at the gate), the competing retry.
    script = [UNPROVEN_KILL, (gate, first_result), GROUP_ONLY_KILL]
    registry, calls = _scripted_teardown_registry(monkeypatch, script)
    lease = _Lease()
    await registry.start_remote(lease, "sleep 30", origin=AGENT)  # may still run: retained

    cleanup = registry.reap_agent_jobs({"agent-a"})
    await _until(lambda: len(calls) == 2)  # the kill's retry awaits its controller reply
    if competitor == "host-revoke":
        assert await registry.force_revoke_host("remote") == {"attempted": 1, "killed": 1,
                                                               "unknown": 0}
    else:
        second = registry.reap_agent_jobs({"agent-a"})
        assert await second.wait(timeout=5) == {"jobs": {}, "starts": ["stopped_group_only"]}
    assert lease.release_count == 1 and not registry._unsettled_remote_starts
    gate.set()  # the first retry now comes back unproven, or its transport fails

    outcome = await cleanup.wait(timeout=5)
    assert outcome == {"jobs": {}, "starts": ["stopped_group_only"]}
    assert cleanup.describe(outcome) == GROUP_ONLY_RECEIPT
    assert lease.release_count == 1 and script == []
