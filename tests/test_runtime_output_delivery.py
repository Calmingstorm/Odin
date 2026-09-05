"""Production dispatch regressions: capture before cuts and stable envelopes."""

import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.agents.tool_cycle import execute_cycle
from src.discord.background_task import _execute_tool
from src.discord.response_guards import truncate_tool_output
from src.discord.tool_loop import ToolLoopRunner
from src.llm.secret_scrubber import scrub_output_secrets
from src.tools.output_delivery import DeliveredOutput, RankedOutput, deliver, delivery_scope
from src.tools.output_retention import OutputStore
from src.tools.result_capture import capture_active
from src.tools.result_validator import ToolResult, validate_tool_result


class Executor:
    """Real retention owner with fake side effects; never touches live state."""

    def __init__(self, path):
        self.store = OutputStore(path)
        self.check_permission = Mock(return_value=None)

    def deliver_output(self, text, *, tool_name, tool_input, user_id,
                       channel_id=None, status="succeeded"):
        if tool_name == "read_file":
            return text
        return deliver(scrub_output_secrets(text), store=self.store, owner=user_id,
                       channel=channel_id or delivery_scope.get()[1], tool=tool_name,
                       status=status)


def runner_for(tmp_path, native):
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._tool_executor = Executor(tmp_path / "retained.sqlite")
    runner._native_tools = SimpleNamespace(handles=lambda _: True, dispatch=native)
    runner._delivery = SimpleNamespace(set_status=AsyncMock())
    runner._audit = SimpleNamespace(log_event=AsyncMock(), log_execution=AsyncMock())
    runner._audit_tool_outcome = AsyncMock()
    runner._channel_state = SimpleNamespace(track_action=Mock())
    runner._mcp_manager = None
    return runner


def state():
    msg = SimpleNamespace(author=SimpleNamespace(id="reader"),
                          channel=SimpleNamespace(id="room"),
                          allowed_tools=["search_history", "get_tool_output"])
    return SimpleNamespace(
        user_id="reader", message=msg, iteration=1,
        policy=SimpleNamespace(skill_file_delivery="send"),
        durability=SimpleNamespace(before_tool=AsyncMock(), after_tool=AsyncMock()),
        _pending_validations=[], pending_image_blocks=[],
    )


def reconstruct(executor, first):
    page = json.loads(first)
    parts = [page["head"]]
    while page["cursor"]:
        snapshot, offset = executor.store.read(
            page["cursor"], owner="reader", channel="room", authorize=lambda *_: True)
        from src.tools.output_delivery import render_page

        rendered = render_page(snapshot, offset=offset)
        assert len(rendered) <= 12000
        page = json.loads(rendered)
        parts.append(page["text"])
    return "".join(parts)


@pytest.mark.asyncio
async def test_chat_web_native_retains_ranked_matches_before_str(tmp_path):
    full = ("match one " + "x" * 15000, "match two " + "界" * 7000)

    async def native(*args, **kwargs):
        assert capture_active()
        assert delivery_scope.get() == ("reader", "room")
        from src.tools.output_authorization import request_tool_scope

        assert "search_history" in request_tool_scope.get()
        return RankedOutput("old clipped preview", matches=full), SimpleNamespace(
            rebuild_system_prompt=False)

    runner = runner_for(tmp_path, native)
    before = delivery_scope.get()
    result = await runner._run_one_tool(
        state(), SimpleNamespace(name="search_history", input={}, id="call"))
    assert isinstance(result["content"], DeliveredOutput)
    assert len(result["content"]) <= 12000
    assert reconstruct(runner._tool_executor, result["content"]) == "\n\n".join(full)
    assert delivery_scope.get() == before
    assert not capture_active()


@pytest.mark.asyncio
async def test_native_failure_envelope_survives_agent_cycle(tmp_path):
    async def native(*args, **kwargs):
        return ToolResult(output="failed details\n" * 3000, ok=False), None

    runner = runner_for(tmp_path, native)
    result = await runner.dispatch_loop_tool_inner("native", {}, state().message, "reader")
    assert json.loads(result.output)["status"] == "failed"
    agent = SimpleNamespace(
        max_lifetime=60, created_at=time.time(), _cancel_event=asyncio.Event(),
        _inbox=asyncio.Queue(), tool_execution_count=0, tools_used=[],
        set_phase=Mock(), messages=[],
    )
    results = []
    await execute_cycle(agent, [{"name": "native", "input": {}, "id": "call"}],
                        AsyncMock(return_value=result), results,
                        timeouts={}, default_timeout=10)
    assert not results[0]["ok"]
    assert results[0]["result"] is result.output
    assert json.loads(agent.messages[-1]["content"][0]["content"])["status"] == "failed"


@pytest.mark.asyncio
async def test_background_wrapper_retains_full_skill(tmp_path):
    executor = Executor(tmp_path / "retained.sqlite")
    text = "START\n" + "\\\"界\n" * 9000 + "\nEND"

    async def execute(*args, **kwargs):
        assert capture_active()
        return text

    skills = SimpleNamespace(has_skill=lambda _: True, execute=execute)
    from src.tools.runtime_delivery import execution_delivery_scope

    with execution_delivery_scope("reader", "room"):
        result = await _execute_tool("skill", {}, executor, skills, None, None,
                                     "reader", requester_id="reader")
    assert reconstruct(executor, result) == text
    assert not capture_active()


@pytest.mark.asyncio
async def test_cancelled_dispatch_restores_scope(tmp_path):
    async def native(*args, **kwargs):
        assert capture_active()
        raise asyncio.CancelledError

    runner = runner_for(tmp_path, native)
    before = delivery_scope.get()
    with pytest.raises(asyncio.CancelledError):
        await runner.dispatch_loop_tool_inner("native", {}, state().message, "reader")
    assert delivery_scope.get() == before
    assert not capture_active()


def test_json_scrubber_preserves_structure_and_offsets():
    text = json.dumps({"text": "password=" + "synthetic-value\nnext line",
                       "cursor": "opaque:3", "end": 3})
    clean = json.loads(scrub_output_secrets(text))
    assert clean["text"] == "[REDACTED]\nnext line"
    assert clean["cursor"] == "opaque:3"
    assert clean["end"] == 3


def test_real_guards_preserve_canonical_envelope(tmp_path):
    executor = Executor(tmp_path / "retained.sqlite")
    value = executor.deliver_output("x\n" * 10000, tool_name="native", tool_input={},
                                    user_id="reader", channel_id="room")
    assert scrub_output_secrets(value) is value
    assert truncate_tool_output(value) is value
    assert validate_tool_result("native", value).normalized is value


@pytest.mark.parametrize("raw", [False, True])
@pytest.mark.asyncio
async def test_read_file_transport_not_cut_by_native_loop(tmp_path, raw):
    content = " source bytes \n" * 2000

    async def native(*args, **kwargs):
        return content, SimpleNamespace(rebuild_system_prompt=False)

    runner = runner_for(tmp_path, native)
    result = await runner._run_one_tool(
        state(), SimpleNamespace(name="read_file", input={"raw": raw}, id="call"))
    assert result["content"] == content
    assert validate_tool_result("read_file", content).normalized == content


def test_scrubber_preserves_ranked_normal_path():
    value = RankedOutput("short\nmatch", matches=("short", "match"), recovery_required=False)
    clean = scrub_output_secrets(value)
    assert clean.matches == value.matches
    assert not clean.recovery_required
    assert deliver(clean) == "short\nmatch"


@pytest.mark.asyncio
async def test_autonomous_mcp_dispatch_retains_before_model_cap(tmp_path):
    text = "MCP beginning\n" + "\\\"界\n" * 9000 + "MCP end"

    async def unused_native(*args, **kwargs):
        raise AssertionError("MCP must not use native dispatch")

    runner = runner_for(tmp_path, unused_native)
    runner._native_tools.handles = lambda _: False
    runner._mcp_manager = SimpleNamespace(
        has_tool=lambda _: True,
        execute=AsyncMock(return_value=SimpleNamespace(
            text=text, ok=True, server="fixture", tool="echo", generation=1,
            negotiated_version="test", status="ok")),
    )
    result = await runner.dispatch_loop_tool_inner(
        "mcp_fixture_echo", {}, state().message, "reader")
    assert result.ok
    assert len(result.output) <= 12000
    assert reconstruct(runner._tool_executor, result.output) == text
    runner._mcp_manager.execute.assert_awaited_once()


def test_configured_larger_envelope_not_recut_by_legacy_guards(tmp_path):
    value = deliver("x" * 50000, store=OutputStore(tmp_path / "large.sqlite"),
                    owner="reader", channel="room", budget=20000)
    assert isinstance(value, DeliveredOutput)
    assert truncate_tool_output(value, max_chars=1024) is value
    assert validate_tool_result("native", value).normalized is value


@pytest.mark.parametrize("text,expected", [
    ("Failed to ingest 'doc.md' durably.", "Failed to ingest 'doc.md' durably."),
    ("apparently ordinary output", "Error (tool reported failure):\napparently ordinary output"),
])
def test_runtime_failure_preserves_existing_message(tmp_path, text, expected):
    from src.tools.runtime_delivery import deliver_runtime_result

    result = ToolResult(output=text, ok=False, error=text, tool_name="ingest_document")
    delivered = deliver_runtime_result(
        Executor(tmp_path / "evidence.sqlite"), result,
        tool_name="ingest_document", tool_input={}, user_id="reader")
    assert delivered.output == expected
    assert delivered.ok is False
    assert delivered.error == text
    assert result.output == text


def test_embedded_dispatcher_fallback_does_not_promise_unretained_output():
    from src.tools.runtime_delivery import deliver_runtime_result

    executor = SimpleNamespace(config=None)
    kwargs = dict(tool_name="fixture", tool_input={}, user_id="reader")
    assert deliver_runtime_result(executor, "short result", **kwargs) == "short result"
    result = json.loads(deliver_runtime_result(executor, "x" * 20000, **kwargs))
    assert result["retention"] != "retained"
    assert not result.get("cursor")
    image = {"__image_block__": {"type": "image", "data": "synthetic"}}
    assert deliver_runtime_result(executor, image, **kwargs) is image
