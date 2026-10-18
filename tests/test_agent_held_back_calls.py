"""Calls an agent cycle holds back before dispatch say why they never ran.

A parent message, a stop or the lifetime limit holds back every call that has
not started. Only the parent-message case is read by a model (the other two end
the agent at its loop head), so that text must not suggest a stop or failure.
"""

import asyncio
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.agents import manager as manager_module
from src.agents import tool_cycle as tool_cycle_module
from src.agents.manager import AgentState, _run_agent
from src.agents.tool_cycle import NOT_RUN_FALLBACK, NOT_RUN_TEXTS, execute_cycle
from tests.test_agent_parent_activity import registry

PARENT_TEXT = NOT_RUN_TEXTS["parent_message"]


def _blocking_first_call():
    started, release = asyncio.Event(), asyncio.Event()

    async def execute(name, args):
        if not started.is_set():
            started.set()
            await release.wait()
        return "applied"

    return started, release, execute


async def test_a_parent_message_between_calls_holds_back_the_rest_with_the_parent_text():
    manager, parent = registry()
    started, release, execute = _blocking_first_call()
    calls = [
        {"id": "a", "name": "patch", "input": {}},
        {"id": "b", "name": "read_file", "input": {"path": "notes.md"}},
        {"id": "c", "name": "patch", "input": {}},
    ]
    requests = []

    async def callback(messages, *args, **kwargs):
        requests.append(list(messages))
        return {"tool_calls": calls} if len(requests) == 1 else {"text": "replanned"}

    task = asyncio.create_task(_run_agent(parent, "", [], callback, execute))
    await started.wait()
    manager.send(parent.id, "use the other file")
    release.set()
    await asyncio.wait_for(task, 5)

    results = parent.messages[2]["content"]
    assert [r["status"] for r in results] == ["succeeded", "not_executed", "not_executed"]
    # Both delivery paths (read_file skips output delivery) emit the exact text,
    # with no Error prefix, and the structured outcome is unchanged.
    for held_back in results[1:]:
        assert held_back["content"] == PARENT_TEXT
        assert held_back["is_error"] and not held_back["uncertain_outcome"]
    assert results[0]["content"] == "applied"
    # The model reads the held-back results, then the parent message they name.
    following = requests[1]
    assert [b["content"] for b in following[-2]["content"]][1:] == [PARENT_TEXT, PARENT_TEXT]
    assert following[-1]["content"] == "[Message from parent] use the other file"
    assert parent.result == "replanned"


@pytest.mark.parametrize(("signal", "cause"), [("inbox", "parent_message"), ("cancel", "stopped")])
async def test_the_dispatch_recheck_captures_its_own_cause(signal, cause, monkeypatch):
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
    assert parent.messages[2]["content"][0]["content"] == NOT_RUN_TEXTS[cause]
    # A stop ends the agent before another generation; a parent message does not.
    assert callback.await_count == (2 if signal == "inbox" else 1)


async def test_an_earlier_outcome_stays_truthful_and_a_retry_does_not_replay_it():
    manager, parent = registry()
    started, release = asyncio.Event(), asyncio.Event()
    ran = []

    async def execute(name, args):
        ran.append(args["n"])
        if args["n"] == 1:
            started.set()
            await release.wait()
            raise RuntimeError("broken")
        return "applied"

    callback = AsyncMock(
        side_effect=[
            {
                "tool_calls": [
                    {"id": "a", "name": "patch", "input": {"n": 1}},
                    {"id": "b", "name": "patch", "input": {"n": 2}},
                ]
            },
            {"tool_calls": [{"id": "b2", "name": "patch", "input": {"n": 2}}]},
            {"text": "done"},
        ]
    )
    task = asyncio.create_task(_run_agent(parent, "", [], callback, execute))
    await started.wait()
    manager.send(parent.id, "keep the second edit")
    release.set()
    await asyncio.wait_for(task, 5)

    first = parent.messages[2]["content"]
    assert [r["status"] for r in first] == ["outcome_unknown", "not_executed"]
    assert first[0]["content"].startswith("Error") and first[0]["uncertain_outcome"]
    assert first[1]["content"] == PARENT_TEXT
    # Only the held-back call was reissued; the failed one never ran twice.
    assert ran == [1, 2] and parent.result == "done"


@pytest.mark.parametrize("terminal", ["stopped", "lifetime"])
async def test_a_terminal_cause_outranks_a_parent_message_and_ends_the_agent(terminal):
    manager, parent = registry()
    started, release, execute = _blocking_first_call()
    calls = [{"id": "a", "name": "patch", "input": {}}, {"id": "b", "name": "patch", "input": {}}]
    callback = AsyncMock(side_effect=[{"tool_calls": calls}, {"text": "never generated"}])

    task = asyncio.create_task(_run_agent(parent, "", [], callback, execute))
    await started.wait()
    manager.send(parent.id, "also do this")
    if terminal == "stopped":
        parent._cancel_event.set()
    else:
        parent.created_at = time.time() - parent.max_lifetime - 1
    release.set()
    await asyncio.wait_for(task, 5)

    assert parent.messages[2]["content"][1]["content"] == NOT_RUN_TEXTS[terminal]
    assert callback.await_count == 1
    expected = AgentState.KILLED if terminal == "stopped" else AgentState.TIMEOUT
    assert parent.state == expected


async def test_cancellation_reads_stopped_and_any_other_unwind_the_neutral_fallback():
    calls = [{"id": str(i), "name": "patch", "input": {}} for i in range(3)]

    _, cancelled = registry()

    async def cancel(name, args):
        raise asyncio.CancelledError()

    records: list[dict] = []
    with pytest.raises(asyncio.CancelledError):
        await execute_cycle(cancelled, calls, cancel, records, timeouts={}, default_timeout=5)
    assert [r["status"] for r in records] == ["interrupted", "not_executed", "not_executed"]
    assert [r["result"] for r in records[1:]] == [NOT_RUN_TEXTS["stopped"]] * 2

    _, failing = registry()
    resolved = []

    def resolver(name, args):
        if resolved:
            raise RuntimeError("resolver broke")
        resolved.append(name)
        return 5.0

    records = []
    with pytest.raises(RuntimeError):
        await execute_cycle(
            failing,
            calls,
            AsyncMock(return_value="ok"),
            records,
            timeouts={},
            default_timeout=5,
            timeout_resolver=resolver,
        )
    # Not a stop: the batch ended for another reason, which keeps its own record.
    assert [r["status"] for r in records] == ["succeeded", "not_executed", "not_executed"]
    assert [r["result"] for r in records[1:]] == [NOT_RUN_FALLBACK] * 2
    assert failing.messages[-1]["content"][1]["content"] == NOT_RUN_FALLBACK


class _BoundaryClock:
    """The lifetime limit passes right after the cycle's first clock read.

    Reads before it (the agent's loop head included) see 0.1 s left; every read
    after it sees the limit passed.
    """

    def __init__(self, agent):
        self.before = agent.created_at + agent.max_lifetime - 0.1
        self.after = agent.created_at + agent.max_lifetime + 0.1
        self.passed = False

    def cycle_time(self):
        value = self.after if self.passed else self.before
        self.passed = True
        return value

    def manager_time(self):
        return self.after if self.passed else self.before


def _expiring_agent(monkeypatch, *, manager_clock=False):
    _, agent = registry()
    agent.created_at, agent.max_lifetime = 100.0, 10.0
    clock = _BoundaryClock(agent)
    monkeypatch.setattr(tool_cycle_module, "time", SimpleNamespace(time=clock.cycle_time))
    if manager_clock:
        monkeypatch.setattr(
            manager_module,
            "time",
            SimpleNamespace(
                time=clock.manager_time, monotonic=time.monotonic, monotonic_ns=time.monotonic_ns
            ),
        )
    return agent


TWO_PATCHES = [{"id": "a", "name": "patch", "input": {}}, {"id": "b", "name": "patch", "input": {}}]


async def test_expiry_right_after_admission_still_holds_the_call_back(monkeypatch):
    agent = _expiring_agent(monkeypatch)
    execute = AsyncMock(return_value="applied")
    records: list[dict] = []
    await execute_cycle(agent, TWO_PATCHES, execute, records, timeouts={}, default_timeout=5)
    # Never "timed out; external outcome unknown": the call was never dispatched.
    execute.assert_not_awaited()
    assert agent.tool_execution_count == 0
    for record in records:
        assert record["status"] == "not_executed"
        assert record["result"] == NOT_RUN_TEXTS["lifetime"]
        assert not record["ok"] and not record["uncertain_outcome"]
    assert all(block["is_error"] for block in agent.messages[-1]["content"])


async def test_expiry_right_after_admission_ends_the_agent_without_another_generation(
    monkeypatch,
):
    agent = _expiring_agent(monkeypatch, manager_clock=True)
    execute = AsyncMock(return_value="applied")
    callback = AsyncMock(side_effect=[{"tool_calls": TWO_PATCHES}, {"text": "never generated"}])
    await asyncio.wait_for(_run_agent(agent, "", [], callback, execute), 5)
    execute.assert_not_awaited()
    assert callback.await_count == 1 and agent.state == AgentState.TIMEOUT
    results = agent.messages[2]["content"]
    assert [r["status"] for r in results] == ["not_executed", "not_executed"]
    assert all(r["content"] == NOT_RUN_TEXTS["lifetime"] for r in results)
    assert not any(r["uncertain_outcome"] for r in results)
