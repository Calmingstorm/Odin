"""Audit-only agent parity: real persistence, unchanged execution outcomes."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.agents.manager import AgentInfo
from src.agents.tool_cycle import execute_cycle
from src.audit.logger import AuditLogger, _cap_audit_text, _cap_tool_input
from src.audit.tool_context import _pending_observers, agent_tool_context, get_agent_tool_context
from src.discord.tool_loop import ToolLoopRunner
from src.observability.correlation import reset_turn, set_turn
from src.tools.result_validator import ToolResult


def harness(tmp_path, result="ok", error=None):
    runner = object.__new__(ToolLoopRunner)
    runner._audit = AuditLogger(str(tmp_path / "audit.jsonl"))
    runner.dispatch_loop_tool_inner = AsyncMock(return_value=result, side_effect=error)
    proxy = SimpleNamespace(channel=SimpleNamespace(id="c"),
                            author=SimpleNamespace(display_name="User"))
    agent = AgentInfo(id="a", label="worker " + "x" * 300, goal="test", channel_id="c",
                      requester_id="u", requester_name="User", parent_id="p",
                      root_id="root", turn_id="origin")
    agent.iteration_count = 3
    return runner, proxy, agent


async def invoke(runner, proxy, agent, tool="run_script", arguments=None):
    results = []
    async def execute(name, arguments):
        return await runner.dispatch_loop_tool(name, arguments, proxy, "u")
    await execute_cycle(agent, [{"id": "call-1", "name": tool, "input": arguments or {
        "host": "localhost", "script": "private shell body", "nested": [{
            "api_key": "never-store-me", "authorization": "Bearer never-store-either",
        }],
    }}], execute, results, timeouts={}, default_timeout=5)
    if _pending_observers:
        await asyncio.shield(asyncio.gather(*list(_pending_observers), return_exceptions=True))
    return results


@pytest.mark.parametrize("raw,error,expected", [
    ("ok", None, "succeeded"),
    ("Command failed (exit 1): nope", None, "failed"),
    (ToolResult(output="nope", ok=False, error="denied"), None, "denied"),
    (None, ValueError("bad input"), "failed"),
    (None, asyncio.CancelledError(), "cancelled"),
])
async def test_agent_audit_parity(tmp_path, raw, error, expected):
    runner, proxy, agent = harness(tmp_path, raw, error)
    token = set_turn(turn_id="agent-turn", source="agent")
    try:
        if isinstance(error, asyncio.CancelledError):
            with pytest.raises(asyncio.CancelledError):
                await invoke(runner, proxy, agent)
        else:
            await invoke(runner, proxy, agent)
    finally:
        reset_turn(token)
    if _pending_observers:
        await asyncio.gather(*list(_pending_observers))
    records = list(reversed(await runner._audit.search(limit=20)))
    assert len(records) == 3
    start, execution, terminal = records
    assert start["type"] == "loop_tool_start"
    assert "type" not in execution
    assert terminal["type"] == "loop_tool"
    assert execution["status"] == terminal["metadata"]["status"] == expected
    for record in records:
        assert record["agent_id"] == "a"
        assert record["parent_agent_id"] == "p"
        assert record["root_agent_id"] == "root"
        assert record["originating_turn_id"] == "origin"
        assert record["turn"]["turn_id"] == "agent-turn"
        assert record["iteration"] == 3
        assert record["call_id"] == "call-1"
        assert len(record["agent_label"]) <= 200
        assert record["tool_input"]["script"] == "<shell command: 18 bytes>"
        assert record["tool_input"]["nested"][0]["api_key"] == "[REDACTED]"
        assert "never-store" not in json.dumps(record)
    assert await runner._audit.count_by_tool() == {"run_script": 1}
    runner.dispatch_loop_tool_inner.assert_awaited_once()
    assert runner.dispatch_loop_tool_inner.call_args.args[1]["script"] == "private shell body"


async def test_email_input_uses_existing_storage_policy(tmp_path):
    runner, proxy, agent = harness(tmp_path)
    await invoke(runner, proxy, agent, "email_send", {
        "body": "private", "attachments": ["/tmp/a.txt"],
    })
    for record in await runner._audit.search():
        assert record["tool_input"] == {
            "body": "[redacted email body: 7 chars]", "attachments": ["a.txt"],
        }


async def test_loop_dispatch_does_not_add_execution(tmp_path):
    runner, proxy, agent = harness(tmp_path)
    assert await runner.dispatch_loop_tool("run_command", {"command": "uptime"}, proxy, "u") == "ok"
    records = await runner._audit.search()
    assert len(records) == 1
    assert records[0]["type"] == "loop_tool"
    assert "agent_id" not in records[0]


async def test_context_does_not_leak_to_child_tasks(tmp_path):
    _, _, agent = harness(tmp_path)
    async def child():
        return get_agent_tool_context()
    with agent_tool_context(agent, {"id": "parent-call"}):
        assert get_agent_tool_context()["call_id"] == "parent-call"
        assert await asyncio.create_task(child()) is None
    assert get_agent_tool_context() is None


@pytest.mark.parametrize("method", ["log_event", "log_execution"])
async def test_observer_failure_does_not_change_return_or_execution(tmp_path, method):
    runner, proxy, agent = harness(tmp_path)
    setattr(runner._audit, method, AsyncMock(side_effect=RuntimeError("observer failed")))
    results = await invoke(runner, proxy, agent)
    assert results[0]["ok"] is True
    assert results[0]["result"] == "ok"
    runner.dispatch_loop_tool_inner.assert_awaited_once()


@pytest.mark.parametrize("cap", [32, 100, 200, 4000])
@pytest.mark.parametrize("body", ['"\\\n' * 5000, "é" * 9000])
def test_json_clipping_complete_budget(cap, body):
    raw = json.dumps({
        "kind": "tool_output", "truncated": False, "retention": "failed", "head": body,
    })
    clipped = _cap_audit_text(raw, cap)
    parsed = json.loads(clipped)
    assert len(clipped) <= cap
    assert parsed["audit_clipped"] is True
    if "source" in parsed:
        assert parsed["source"]["truncated"] is False
        assert parsed["source"]["retention"] == "failed"
    assert "truncated" not in parsed
    inp = _cap_tool_input({"content": body}, cap)
    assert len(json.dumps(inp)) <= cap


async def test_persisted_json_is_valid_and_scrubbed_after_all_passes(tmp_path):
    logger = AuditLogger(str(tmp_path / "audit.jsonl"), result_cap=800)
    raw = json.dumps({"kind": "process_output", "truncated": False, "capture_loss": True,
                      "retention": "retained", "api_key": "secretvalue", "head": "a\n" * 9000})
    await logger.log_event(event_type="test", action="tool", detail=raw)
    await logger.log_execution(user_id="u", user_name="U", channel_id="c", tool_name="tool",
                               tool_input={}, approved=True, result_summary=raw,
                               execution_time_ms=1)
    for record in await logger.search():
        text = record.get("detail", record.get("result_summary"))
        parsed = json.loads(text)
        assert len(text) <= 800
        assert "secretvalue" not in text
        assert parsed["audit_clipped"] is True
        assert parsed["source"] == {"kind": "process_output", "truncated": False,
                                    "capture_loss": True, "retention": "retained",
                                    "offset_unit": "utf8_bytes"}
    uncut = json.loads(_cap_audit_text('{"password":"opaque", "ok":true}', 800))
    assert uncut["password"] == "[REDACTED]"


async def test_uncut_json_secret_remains_valid_on_disk(tmp_path):
    logger = AuditLogger(str(tmp_path / "audit.jsonl"))
    raw = '{"password":"opaque", "nested":{"token":"hidden"}, "message":"é\\nline"}'
    await logger.log_event(event_type="test", action="t", detail=raw)
    await logger.log_execution(user_id="u", user_name="U", channel_id="c", tool_name="t",
                               tool_input={}, approved=True, result_summary=raw,
                               execution_time_ms=0)
    for entry in await logger.search():
        value = json.loads(entry.get("detail", entry.get("result_summary")))
        assert value["password"] == value["nested"]["token"] == "[REDACTED]"
        assert value["message"] == "é\nline"


@pytest.mark.parametrize("boundary", ["start", "execution", "terminal"])
async def test_cancellation_during_durable_audit_keeps_terminal_pair(tmp_path, boundary):
    runner, proxy, agent = harness(tmp_path)
    original = runner._audit._append_durable
    entered, release = asyncio.Event(), asyncio.Event()
    async def append(line):
        entry = json.loads(line)
        kind = entry.get("type", "execution")
        target = {"start": "loop_tool_start", "execution": "execution", "terminal": "loop_tool"}
        if kind == target[boundary]:
            entered.set()
            await release.wait()
        await original(line)
    runner._audit._append_durable = append
    task = asyncio.create_task(invoke(runner, proxy, agent))
    await asyncio.wait_for(entered.wait(), 2)
    task.cancel()
    await asyncio.sleep(0)
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(task, 2)
    if _pending_observers:
        await asyncio.wait_for(asyncio.gather(*list(_pending_observers)), 2)
    entries = list(reversed(await runner._audit.search()))
    assert [entry.get("type", "execution") for entry in entries] == [
        "loop_tool_start", "execution", "loop_tool",
    ]
    assert len({entry["call_id"] for entry in entries}) == 1
    assert runner.dispatch_loop_tool_inner.await_count == 1
    assert entries[1]["status"] == entries[2]["metadata"]["status"] == "succeeded"


async def test_observer_raised_cancel_is_not_caller_cancellation(tmp_path):
    runner, proxy, agent = harness(tmp_path)
    runner._audit.log_event = AsyncMock(side_effect=asyncio.CancelledError())
    runner._audit.log_execution = AsyncMock(side_effect=asyncio.CancelledError())
    results = await invoke(runner, proxy, agent)
    assert results[0]["ok"] is True
    runner.dispatch_loop_tool_inner.assert_awaited_once()


async def test_dispatch_preserves_input_and_result_identity(tmp_path):
    raw = ToolResult(output="exact\nbytes", ok=True)
    runner, proxy, agent = harness(tmp_path, raw)
    arguments = {"script": "sensitive input", "nested": {"token": "opaque"}}
    with agent_tool_context(agent, {"id": "same-call"}):
        returned = await runner.dispatch_loop_tool("run_script", arguments, proxy, "u")
    assert returned is raw
    assert runner.dispatch_loop_tool_inner.call_args.args[1] is arguments
    assert arguments == {"script": "sensitive input", "nested": {"token": "opaque"}}
    assert returned.output == "exact\nbytes"


@pytest.mark.parametrize("tool,uncertain", [("run_script", True), ("wait_for_agents", False)])
async def test_timeout_is_dispatch_cancellation_not_invented_outer_cause(tmp_path, tool, uncertain):
    runner, proxy, agent = harness(tmp_path)
    entered = asyncio.Event()
    async def blocked(*args):
        entered.set()
        await asyncio.Event().wait()
    runner.dispatch_loop_tool_inner = blocked
    async def dispatch():
        with agent_tool_context(agent, {"id": "deadline"}):
            return await runner.dispatch_loop_tool(tool, {}, proxy, "u")
    with pytest.raises(TimeoutError):
        await asyncio.wait_for(dispatch(), .05)
    assert entered.is_set()
    if _pending_observers:
        await asyncio.gather(*list(_pending_observers))
    execution = (await runner._audit.search(include_agent_events=False))[0]
    assert execution["status"] == "cancelled"
    assert execution["audit_metadata"]["outcome_scope"] == "dispatch"
    assert execution["audit_metadata"]["uncertain_outcome"] is uncertain


async def test_stop_does_not_wait_for_hung_terminal_observer(tmp_path):
    runner, proxy, agent = harness(tmp_path)
    entered, release = asyncio.Event(), asyncio.Event()
    original = runner._audit.log_execution
    async def blocked(**kwargs):
        entered.set()
        await release.wait()
        await original(**kwargs)
    runner._audit.log_execution = blocked
    task = asyncio.create_task(invoke(runner, proxy, agent))
    await asyncio.wait_for(entered.wait(), 2)
    task.cancel()
    try:
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, .2)
        assert _pending_observers
    finally:
        release.set()
        await asyncio.wait_for(asyncio.gather(*list(_pending_observers)), 2)
    assert len(await runner._audit.search()) == 3


async def test_search_audit_renders_rich_agent_execution_with_limit(tmp_path):
    from src.discord.native_tools.knowledge import KnowledgeTools
    from src.usage.rollup import UsageRollup

    runner, proxy, agent = harness(tmp_path)
    await invoke(runner, proxy, agent)
    tools = SimpleNamespace(audit=runner._audit)
    text = await KnowledgeTools._handle_search_audit(tools, {"limit": 1})
    assert "1 entries" in text
    assert '"agent_id": "a"' in text
    assert '"originating_turn_id": "origin"' in text
    assert "<shell command: 18 bytes>" in text
    assert "private shell body" not in text
    assert "never-store" not in text
    entries = await runner._audit.search(include_agent_events=False, limit=1)
    assert len(entries) == 1 and "type" not in entries[0]
    for entry in await runner._audit.search():
        assert UsageRollup._tool_fact(json.dumps(entry).encode()) is None


@pytest.mark.parametrize("payload", [
    {"kind": "tool_output", "status": "succeeded", "retention": "retained",
     "head": "first\nsecond\n" * 1000, "truncated": True},
    {"kind": "process_output", "pid": 123, "retained_bytes": 5000,
     "output": "first\nsecond\n" * 1000, "capture_limit_loss_bytes": 200,
     "not_retained_bytes": 200, "capture_error": None, "truncated": False},
    {"id": "agent", "original_bytes": 5000, "result_bytes": 5000,
     "preview": "first\nsecond\n" * 1000, "truncated": True},
])
def test_real_envelopes_have_decoded_audit_previews(payload):
    result = json.loads(_cap_audit_text(json.dumps(payload), 900))
    assert result["preview"].startswith("first\nsecond\n")
    assert result["source"]["truncated"] == payload["truncated"]
    if "capture_limit_loss_bytes" in payload:
        assert result["source"]["capture_limit_loss_bytes"] == 200


def test_process_preview_footer_survives_audit_clipping():
    meta = {"kind": "process_output", "pid": 42, "status": "running",
            "emitted_bytes": 9000, "retained_bytes": 8000, "shown_bytes": 7000,
            "capture_limit_loss_bytes": 1000, "not_retained_bytes": 1000,
            "capture_error": "retention quota exhausted", "truncated": True,
            "cursor": "generation:0"}
    raw = "Process 42 running\n" + "line\n" * 2000 + "\n[output retention] " + json.dumps(meta)
    clipped = json.loads(_cap_audit_text(raw, 1000))
    assert clipped["preview"].startswith("Process 42 running\nline\n")
    assert clipped["source"]["cursor_present"] is True
    assert clipped["source"]["capture_limit_loss_bytes"] == 1000
    assert clipped["source"]["capture_error"] == "retention quota exhausted"
    assert clipped["source"]["offset_unit"] == "utf8_bytes"
    assert "cursor" not in clipped and "cursor" not in clipped["source"]


async def test_full_autonomous_iteration_has_exactly_one_execution(tmp_path, monkeypatch):
    from tests.characterization.test_autonomous_loop import build, run_iteration
    from tests.fakes import text_response, tool_call_response

    monkeypatch.chdir(tmp_path)
    bot, _ = build([
        tool_call_response(("parse_time", {"expression": "now"})),
        text_response("complete"),
    ])
    audit = AuditLogger(str(tmp_path / "audit.jsonl"))
    bot.tool_loop._audit = audit
    assert await run_iteration(bot) == "complete"
    entries = await audit.search(tool_name="parse_time")
    assert sum("type" not in entry for entry in entries) == 1
    assert sum(entry.get("type") == "loop_tool" for entry in entries) == 1
    assert not any(entry.get("type") == "loop_tool_start" for entry in entries)


async def test_concurrent_same_name_calls_preserve_identity_and_raw_payload(tmp_path):
    runner, proxy, first = harness(tmp_path)
    second = AgentInfo(
        id="sibling", label="Second", goal="test", channel_id="c", requester_id="u",
        requester_name="User", parent_id="p", root_id="root", turn_id="origin",
    )
    first_entered, second_done = asyncio.Event(), asyncio.Event()
    first_input = {"path": "/example/one", "nested": {"token": "first-private"}}
    second_input = {"path": "/example/two", "nested": {"token": "second-private"}}
    raw_result = ToolResult(output="raw result", ok=True, audit_metadata={"test": True})

    async def dispatch(name, arguments, message, user):
        if arguments is first_input:
            first_entered.set()
            await second_done.wait()
        else:
            assert arguments is second_input
            await first_entered.wait()
            second_done.set()
        return raw_result

    runner.dispatch_loop_tool_inner = dispatch

    async def call(agent, arguments):
        with agent_tool_context(agent, {"id": "same-provider-call"}):
            result = await runner.dispatch_loop_tool("read_file", arguments, proxy, "u")
            assert result is raw_result

    await asyncio.gather(call(first, first_input), call(second, second_input))
    if _pending_observers:
        await asyncio.gather(*list(_pending_observers), return_exceptions=True)
    records = await runner._audit.search(limit=20)
    assert len(records) == 6
    for agent_id, path in [("a", "/example/one"), ("sibling", "/example/two")]:
        owned = [entry for entry in records if entry["agent_id"] == agent_id]
        assert len(owned) == 3
        assert sum("type" not in entry for entry in owned) == 1
        assert all(entry["tool_input"]["path"] == path for entry in owned)
        assert all(entry["call_id"] == "same-provider-call" for entry in owned)
    assert "first-private" not in json.dumps(records)
    assert "second-private" not in json.dumps(records)
    assert first_input["nested"]["token"] == "first-private"
    assert second_input["nested"]["token"] == "second-private"
    assert await runner._audit.count_by_tool() == {"read_file": 2}


@pytest.mark.parametrize("stop", [False, True])
async def test_stalled_start_audit_never_blocks_dispatch_completion_or_stop(tmp_path, stop):
    runner, proxy, agent = harness(tmp_path)
    audit_entered, release_audit, tool_entered = asyncio.Event(), asyncio.Event(), asyncio.Event()
    original_append = runner._audit._append_durable

    async def blocked_append(line):
        if json.loads(line).get("type") == "loop_tool_start":
            audit_entered.set()
            await release_audit.wait()
        await original_append(line)

    async def tool(*args):
        tool_entered.set()
        await audit_entered.wait()
        if stop:
            await asyncio.Event().wait()
        return "unchanged result"

    runner._audit._append_durable = blocked_append
    runner.dispatch_loop_tool_inner = tool

    async def dispatch():
        with agent_tool_context(agent, {"id": "blocked-start"}):
            return await runner.dispatch_loop_tool("read_file", {}, proxy, "u")

    task = asyncio.create_task(dispatch())
    try:
        await asyncio.wait_for(tool_entered.wait(), .2)
        await asyncio.wait_for(audit_entered.wait(), .2)
        if stop:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await asyncio.wait_for(task, .2)
        else:
            assert await asyncio.wait_for(task, .2) == "unchanged result"
        assert not release_audit.is_set()
        assert _pending_observers
    finally:
        release_audit.set()
        await asyncio.wait_for(asyncio.gather(*list(_pending_observers)), 2)
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    records = list(reversed(await runner._audit.search()))
    assert [entry.get("type", "execution") for entry in records] == [
        "loop_tool_start", "execution", "loop_tool",
    ]
    assert records[1]["status"] == ("cancelled" if stop else "succeeded")
