"""Real audit persistence and event linkage across all three invocation routes."""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.agents.manager import AgentInfo
from src.agents.tool_cycle import execute_cycle
from src.audit.logger import AuditLogger
from src.audit.tool_context import _pending_observers
from src.discord.tool_loop import ToolLoopRunner
from src.observability.correlation import reset_turn, set_turn
from src.tools.result_validator import ToolResult


def harness(tmp_path, native=False, failure=None):
    runner = object.__new__(ToolLoopRunner)
    events = []

    async def emitted(entry):
        events.append(entry)

    runner._audit = AuditLogger(str(tmp_path / "audit.jsonl"))
    runner._audit.set_event_callback(emitted)
    result = ToolResult(output="ordinary result", ok=True)
    runner._tool_executor = SimpleNamespace(
        check_permission=Mock(return_value=None),
        execute=AsyncMock(return_value=result, side_effect=failure),
    )
    runner._native_tools = SimpleNamespace(
        handles=lambda _: native,
        dispatch=AsyncMock(
            return_value=(result, SimpleNamespace(rebuild_system_prompt=False)),
            side_effect=failure,
        ),
    )
    runner._mcp_manager = None
    runner._delivery = SimpleNamespace(set_status=AsyncMock())
    runner._channel_state = SimpleNamespace(track_action=Mock())
    proxy = SimpleNamespace(channel=SimpleNamespace(id="c"), author=SimpleNamespace(id="u"))
    st = SimpleNamespace(
        message=proxy,
        msg_proxy=proxy,
        user_id="u",
        iteration=3,
        _iteration_index=3,
        channel_id_str="c",
        requester_name="User",
        tool_timeout=1,
        durability=SimpleNamespace(before_tool=AsyncMock(), after_tool=AsyncMock()),
        policy=SimpleNamespace(skill_file_delivery="stage"),
        pending_image_blocks=[],
    )
    return runner, st, events


def block(call_id="call-1", tool="run_script"):
    return SimpleNamespace(
        id=call_id,
        name=tool,
        parse_error=None,
        input={
            "host": "localhost",
            "script": "private shell body",
            "nested": {"password": "test-secret-never-store"},
        },
    )


def correlation(record):
    """Same explicit dimensions as the UI; no name/time based guessing."""
    metadata = record.get("metadata", {})
    return (
        record.get("originating_turn_id") or record.get("turn", {}).get("turn_id"),
        record.get("agent_id", ""),
        record.get("iteration", metadata.get("iteration")),
        record.get("call_id", metadata.get("call_id")),
        record["tool_name"],
        record.get("channel_id"),
        record["user_id"],
    )


@pytest.mark.parametrize("route", ["foreground", "autonomous", "agent"])
@pytest.mark.parametrize("native", [False, True])
@pytest.mark.parametrize("failure", [None, ValueError("ordinary failure")])
async def test_real_execution_has_one_correlated_canonical_record(tmp_path, route, native, failure):
    runner, st, events = harness(tmp_path, native, failure)
    call = block(tool="read_channel" if native else "run_script")
    token = set_turn(turn_id="turn-a", source=route, loop_id="loop-a", loop_iteration=8)
    try:
        if route == "foreground":
            result = await runner._run_one_tool(st, call)
        elif route == "autonomous":
            result = await runner._run_one_loop_tool(st, call)
        else:
            agent = AgentInfo(
                id="agent-a",
                label="worker",
                goal="test",
                channel_id="c",
                requester_id="u",
                requester_name="User",
                turn_id="turn-a",
            )
            agent.iteration_count = 3

            async def execute(name, arguments):
                return await runner.dispatch_loop_tool(name, arguments, st.msg_proxy, "u")

            results = []
            await execute_cycle(
                agent,
                [{"id": call.id, "name": call.name, "input": call.input}],
                execute,
                results,
                timeouts={},
                default_timeout=1,
            )
            result = results[0]
            if _pending_observers:
                await asyncio.gather(*list(_pending_observers))
    finally:
        reset_turn(token)
    assert result
    records = list(reversed(await runner._audit.search()))
    assert records == events  # Live event payloads and persisted rows share identity.
    assert len(records) == (2 if route == "autonomous" else 3)
    assert len({correlation(record) for record in records}) == 1
    assert correlation(records[0])[2:4] == (3, "call-1")
    assert records[0]["turn"]["loop_iteration"] == 8
    executions = [row for row in records if "result_summary" in row]
    assert len(executions) == 1
    assert bool(executions[0]["error"]) is (failure is not None)
    assert executions[0]["tool_input"]["nested"]["password"] == "[REDACTED]"
    assert "test-secret-never-store" not in json.dumps(records)
    if not native:
        assert executions[0]["tool_input"]["script"] == "<shell command: 18 bytes>"
    assert await runner._audit.count_by_tool() == {call.name: 1}
    executor = runner._native_tools.dispatch if native else runner._tool_executor.execute
    executor.assert_awaited_once()
    assert executor.call_args.args[1] == call.input


@pytest.mark.parametrize("route", ["foreground", "autonomous"])
async def test_parallel_same_name_reverse_completion_and_reused_ids(tmp_path, route):
    runner, st, _ = harness(tmp_path)
    slow_started, fast_done = asyncio.Event(), asyncio.Event()

    async def execute(name, arguments, **kwargs):
        if arguments["order"] == "slow":
            slow_started.set()
            await fast_done.wait()
            await asyncio.sleep(0.01)
        else:
            await slow_started.wait()
            fast_done.set()
        return ToolResult(output=arguments["order"], ok=True)

    runner._tool_executor.execute = execute
    run = runner._run_one_tool if route == "foreground" else runner._run_one_loop_tool
    slow, fast = block("slow"), block("fast")
    slow.input["order"], fast.input["order"] = "slow", "fast"
    for turn in ("turn-a", "turn-b"):
        token = set_turn(turn_id=turn, source=route)
        try:
            await asyncio.gather(run(st, slow), run(st, fast))
        finally:
            reset_turn(token)
    records = list(reversed(await runner._audit.search(limit=30)))
    groups = {}
    for record in records:
        groups.setdefault(correlation(record), []).append(record)
    assert len(groups) == 4
    for key, rows in groups.items():
        executions = [row for row in rows if "result_summary" in row]
        assert len(executions) == 1
        assert executions[0]["result_summary"] == key[3]
    assert [row["call_id"] for row in records if "result_summary" in row] == [
        "fast",
        "slow",
        "fast",
        "slow",
    ]


@pytest.mark.parametrize("route", ["foreground", "autonomous"])
async def test_timeout_keeps_single_terminal_with_identity(tmp_path, route):
    runner, st, _ = harness(tmp_path)
    st.tool_timeout = 0.01
    st._cancel = asyncio.Event()
    st.durability.after_tool_interrupted = AsyncMock()
    cancelled = asyncio.Event()

    async def execute(*args, **kwargs):
        try:
            await asyncio.sleep(20)
        finally:
            cancelled.set()

    runner._tool_executor.execute = execute
    token = set_turn(turn_id="turn-timeout")
    try:
        if route == "foreground":
            result = await runner._run_one_tool_with_timeout(st, block(), st.tool_timeout)
        else:
            result = await runner._run_one_loop_tool(st, block())
    finally:
        reset_turn(token)
    assert "timed out" in result["content"]
    assert cancelled.is_set()
    records = await runner._audit.search()
    assert len(records) == 2
    assert len({correlation(record) for record in records}) == 1
    assert records[0]["error"]


async def test_autonomous_start_observer_failure_does_not_suppress_execution(tmp_path):
    runner, st, _ = harness(tmp_path)
    runner._audit.log_event = AsyncMock(side_effect=RuntimeError("audit unavailable"))
    assert (await runner._run_one_loop_tool(st, block()))["content"] == "ordinary result"
    records = await runner._audit.search()
    assert len(records) == 1
    assert records[0]["call_id"] == "call-1"


@pytest.mark.parametrize("route", ["foreground", "autonomous"])
async def test_mcp_dispatch_retains_correlation_and_structured_failure(
    tmp_path, monkeypatch, route
):
    runner, st, _ = harness(tmp_path)
    dispatch = AsyncMock(
        return_value=ToolResult(
            output="remote failure",
            ok=False,
            error="remote failed",
            uncertain_outcome=True,
        )
    )
    monkeypatch.setattr("src.discord.tool_loop.is_mcp_tool", lambda *_: True)
    monkeypatch.setattr("src.discord.tool_loop.dispatch_mcp_tool", dispatch)
    token = set_turn(turn_id="turn-mcp")
    try:
        run = runner._run_one_tool if route == "foreground" else runner._run_one_loop_tool
        await run(st, block(tool="mcp_test"))
    finally:
        reset_turn(token)
    records = await runner._audit.search()
    assert len({correlation(record) for record in records}) == 1
    canonical = [record for record in records if "result_summary" in record]
    assert len(canonical) == 1
    assert canonical[0]["error"] == "remote failed"
    dispatch.assert_awaited_once()
    runner._tool_executor.execute.assert_not_awaited()


@pytest.mark.parametrize("available", [False, True])
async def test_rejected_post_action_image_keeps_single_failed_receipt(tmp_path, available):
    runner, st, _ = harness(tmp_path, native=True)
    receipt = {"status": "unknown", "action_id": "stroke-1"}
    image = {
        "__computer_frame__": {},
        "__image_block__": {},
        "__computer_action_receipt__": receipt,
    }
    runner._native_tools.dispatch.return_value = (
        image,
        SimpleNamespace(rebuild_system_prompt=False),
    )
    computer = SimpleNamespace(
        validate_delivery=AsyncMock(side_effect=ValueError("expired")),
        reserves_tool=lambda _: False,
    )
    runner._computer_service = lambda: computer if available else None
    token = set_turn(turn_id="turn-image")
    try:
        result = await runner._run_one_tool(st, block(tool="computer_act"))
    finally:
        reset_turn(token)
    assert "already settled; do not replay" in result["content"]
    assert '"action_id": "stroke-1"' in result["content"]
    assert st.pending_image_blocks == []
    assert st._computer_frame_error
    records = await runner._audit.search()
    assert len(records) == 2
    assert len({correlation(record) for record in records}) == 1
    assert records[0]["type"] == "tool_end"
    assert records[0]["error"] == "computer_observation_rejected"
    assert await runner._audit.count_by_tool() == {"computer_act": 1}
