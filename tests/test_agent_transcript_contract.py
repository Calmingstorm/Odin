"""Hermetic replay acceptance: fake providers, real callbacks and agent loop."""

import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.agents.manager import (
    AgentInfo,
    AgentState,
    _get_last_progress,
    _run_agent,
    _synthesize_fallback,
)
from src.llm.context_compressor import (
    compress_tool_context,
    emergency_compress_for_window,
    summarize_iteration,
)
from src.llm.kimi import KimiClient
from src.llm.ollama import OllamaClient
from src.llm.openai_codex import CodexChatClient
from src.llm.tool_history import (
    assistant_content,
    content_text,
    normalize_tool_calls,
    settled_call_ids,
)
from src.llm.types import LLMResponse, ToolCall
from src.tools.result_validator import ToolResult
from tests.test_native_agents_tasks import _fake_gateway, _message, _tools


def agent():
    return AgentInfo(
        id="test",
        label="test",
        goal="run once",
        channel_id="c",
        requester_id="u",
        requester_name="user",
        messages=[{"role": "user", "content": "run once"}],
    )


def convert(messages, provider):
    if provider == "responses":
        return CodexChatClient._convert_messages_with_tools(None, messages)
    cls = KimiClient if provider == "kimi" else OllamaClient
    return cls._convert_messages(None, messages, "")


@pytest.mark.parametrize("entry", ["direct", "loop"])
@pytest.mark.parametrize("provider", ["responses", "kimi", "ollama"])
@pytest.mark.parametrize("malformed", [False, True])
async def test_manager_callback_converter_replay_executes_once(entry, provider, malformed):
    wire_requests = []

    async def generate(**kwargs):
        wire = convert(kwargs["messages"], provider)
        wire_requests.append(wire)
        if provider == "responses":
            calls = [x for x in wire if x.get("type") == "function_call"]
            outputs = [x for x in wire if x.get("type") == "function_call_output"]
            paired = calls and outputs and calls[0]["call_id"] == outputs[0]["call_id"]
        else:
            calls = [x for x in wire if x.get("tool_calls")]
            outputs = [x for x in wire if x.get("role") == "tool"]
            paired = calls and outputs
            if provider == "kimi" and paired:
                paired = calls[0]["tool_calls"][0]["id"] == outputs[0]["tool_call_id"]
        return LLMResponse(
            text="done" if paired else "",
            tool_calls=[]
            if paired
            else [
                ToolCall(
                    id="once",
                    name="run_command",
                    input={"command": "echo ok"},
                    parse_error="malformed JSON" if malformed else None,
                )
            ],
        )

    client = SimpleNamespace(model="test", generate=generate)
    tools = _tools(llm_gateway=_fake_gateway(client))
    tools._agent_manager.spawn.return_value = "test"
    tools._agent_manager._agents = {}
    if entry == "direct":
        await tools._handle_spawn_agent(_message(), {"label": "t", "goal": "run once"})
        cb = tools._agent_manager.spawn.call_args.kwargs["iteration_callback"]
    else:
        tools._loop_manager._loops = {
            "loop": SimpleNamespace(
                status="running",
                requester_id="u",
                requester_name="user",
                goal="run once",
                iteration_count=1,
            )
        }
        tools._loop_agent_bridge.spawn_agents_for_loop.return_value = ["test"]
        await tools._handle_spawn_loop_agents(
            _message(), {"loop_id": "loop", "tasks": [{"label": "t", "goal": "g"}]}
        )
        cb = tools._loop_agent_bridge.spawn_agents_for_loop.call_args.kwargs[
            "iteration_callback_factory"
        ](None, None)
    # Exercise both callback plumbing paths without live model or dispatcher.
    tools._agent_generate = AsyncMock(side_effect=lambda _client, **kw: None)

    async def adapter(_client, **kwargs):
        return await generate(messages=kwargs["messages"])

    tools._agent_generate.side_effect = adapter
    execute = AsyncMock(return_value="ok")
    a = agent()
    await _run_agent(a, "", [], cb, execute, max_iterations=4)
    assert a.state == AgentState.COMPLETED and a.result == "done"
    assert execute.await_count == (0 if malformed else 1) and len(wire_requests) == 2
    if malformed:
        assert a.messages[2]["content"][0]["status"] == "invalid_arguments"
    assert a.messages[1]["content"][0]["id"] == "once"
    assert a.messages[2]["content"][0]["tool_use_id"] == "once"


@pytest.mark.parametrize("provider", ["responses", "kimi", "ollama"])
async def test_multi_call_repeated_names_order_and_identity(provider):
    a = agent()
    calls = [{"id": str(i), "name": "same", "input": {"n": i}} for i in range(3)]
    cb = AsyncMock(side_effect=[{"tool_calls": calls, "text": "work"}, {"text": "done"}])
    execute = AsyncMock(side_effect=["one", "two", "three"])
    await _run_agent(a, "", [], cb, execute)
    wire = convert(a.messages, provider)
    if provider == "responses":
        assert [x["call_id"] for x in wire if x.get("type") == "function_call"] == ["0", "1", "2"]
        assert [x["output"] for x in wire if x.get("type") == "function_call_output"] == [
            "one",
            "two",
            "three",
        ]
    else:
        assert [x["content"] for x in wire if x.get("role") == "tool"] == ["one", "two", "three"]
        native = next(x["tool_calls"] for x in wire if x.get("tool_calls"))
        assert [x["function"]["name"] for x in native] == ["same"] * 3
        if provider == "kimi":
            assert [x["id"] for x in native] == ["0", "1", "2"]
    assert a.tool_execution_count == 3 and a.tools_used == ["same"]


def test_normalization_no_mutation_and_ambiguous_identity_is_not_executed():
    calls = [
        ToolCall(id="id", name="t", input={"x": 1}),
        {"id": "id", "name": "t", "input": {}},
        {"name": "t", "input": []},
        {"id": " ", "name": "t", "input": {}, "parse_error": "bad JSON"},
    ]
    normalized = normalize_tool_calls(calls)
    assert len({c["id"] for c in normalized}) == 4
    assert normalized[0]["id"] == "id"
    assert all(c["parse_error"] for c in normalized[1:])
    normalized[0]["input"]["x"] = 2
    assert calls[0].input == {"x": 1}
    assert normalize_tool_calls(normalized) == normalized


async def test_parse_error_denied_failed_timeout_and_partial_cancellation():
    a = agent()
    calls = [{"id": str(i), "name": "t", "input": {}} for i in range(7)]
    calls[0]["parse_error"] = "bad JSON"

    async def execute(name, args):
        n = a.tool_execution_count
        if n == 1:
            return ToolResult("rejected", ok=False, error="host_denied")
        if n == 2:
            raise RuntimeError("broken")
        if n == 3:
            raise TimeoutError()
        if n == 4:
            return "ok"
        raise asyncio.CancelledError()

    saver = SimpleNamespace(save=AsyncMock())
    await _run_agent(
        a, "", [], AsyncMock(return_value={"tool_calls": calls}), execute, trajectory_saver=saver
    )
    assert a.state == AgentState.KILLED
    turn = saver.save.call_args.args[0]
    records = turn.iterations[0].tool_results
    assert [r["status"] for r in records] == [
        "invalid_arguments",
        "denied",
        "failed",
        "timed_out",
        "succeeded",
        "interrupted",
        "not_executed",
    ]
    assert [r["tool_use_id"] for r in records] == [str(i) for i in range(7)]
    assert records[3]["uncertain_outcome"] and records[5]["uncertain_outcome"]
    assert not records[-1]["uncertain_outcome"]
    assert isinstance(turn.to_dict()["iterations"][0]["llm_text"], str)


def cycle(n, size=2000):
    return [
        {
            "role": "assistant",
            "content": assistant_content("", [{"id": str(n), "name": "t", "input": {}}]),
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": str(n),
                    "content": "x" * size,
                    "is_error": True,
                }
            ],
        },
    ]


@pytest.mark.parametrize("legacy", [False, True])
def test_mixed_compression_preserves_parent_newest_pairs_and_unfit_arguments(legacy):
    a = agent()
    older = (
        [
            {"role": "assistant", "content": "legacy"},
            {"role": "user", "content": "[Tool result: t]\nold"},
        ]
        if legacy
        else cycle(0)
    )
    directive = {
        "role": "user",
        "content": "[Tool result: not a tool] stop editing",
        "provenance": "agent_parent",
    }
    messages = a.messages + older + [directive] + cycle(1) + cycle(2)
    soft, _ = compress_tool_context(messages, max_context_chars=100, keep_recent=1)
    assert directive in soft and soft[-2:] == messages[-2:]
    small, report = emergency_compress_for_window(messages, target_chars=700)
    assert report["fits"] and directive in small
    assert small[-2]["content"][0]["id"] == small[-1]["content"][0]["tool_use_id"] == "2"
    again, report = emergency_compress_for_window(small, target_chars=500)
    assert report["fits"] and directive in again
    same, _ = emergency_compress_for_window(again, target_chars=500)
    assert same is again
    large = deepcopy(messages)
    large[-2]["content"][0]["input"] = {"patch_text": "huge" * 2000}
    unchanged, report = emergency_compress_for_window(large, target_chars=500)
    assert not report["fits"] and unchanged is large
    assert "ERR" in summarize_iteration(cycle(1))
    a.messages = small
    assert _get_last_progress(a) in {"legacy", "(no output)"}
    assert isinstance(_synthesize_fallback(a, 4), str)


def test_summary_uses_matching_id_not_result_order():
    calls = [{"id": str(i), "name": f"t{i}", "input": {}} for i in range(2)]
    history = [
        {"role": "assistant", "content": assistant_content("hello", calls)},
        {
            "role": "user",
            "content": [
                {"type": "tool_result", "tool_use_id": "1", "content": "plain", "status": "denied"},
                {
                    "type": "tool_result",
                    "tool_use_id": "0",
                    "content": "Error but successful text",
                    "is_error": False,
                },
            ],
        },
    ]
    assert summarize_iteration(history) == "t0→OK, t1→denied"
    a = agent()
    a.messages.extend(history)
    assert _get_last_progress(a) == "hello"


@pytest.mark.parametrize(
    "history",
    [
        [{"role": "assistant", "content": [{"type": "tool_use", "id": "a"}]}],
        [{"role": "user", "content": [{"type": "tool_result", "tool_use_id": "missing"}]}],
        [{"role": "assistant", "content": [{"type": "tool_use", "id": ""}]}],
        cycle(1) + cycle(1),
        cycle(1)[:1] + cycle(2),
    ],
)
async def test_unresolved_or_invalid_native_history_never_reaches_generation(history):
    a = agent()
    a.messages.extend(history)
    cb = AsyncMock()
    execute = AsyncMock()
    await _run_agent(a, "", [], cb, execute)
    assert a.state == AgentState.FAILED
    cb.assert_not_called()
    execute.assert_not_called()


def test_legacy_history_is_not_upgraded_and_nonblocks_are_ignored():
    assert content_text({}) == ""
    history = [
        {"role": "user", "content": "[Tool result: t] old"},
        {"role": "assistant", "content": [None, {"type": "text", "text": "old"}]},
    ]
    assert settled_call_ids(history) == set()
    assert "tool_use" not in str(history)


@pytest.mark.parametrize("error", [False, True])
async def test_soft_compression_native_replay_with_budget_warnings(error, monkeypatch):
    a = agent()
    a.messages.extend(cycle(0, 10000) + cycle(1, 10000))
    if error:

        def fail(*args, **kwargs):
            raise RuntimeError("injected")

        monkeypatch.setattr("src.llm.context_compressor.compress_tool_context", fail)

    async def callback(messages, *args, **kwargs):
        if a.iteration_count > 1 and not error:
            assert any("Earlier tool calls" in str(m["content"]) for m in messages)
        return {
            "tool_calls": [
                {
                    "id": "new" + str(a.iteration_count),
                    "name": "t",
                    "input": {"n": a.iteration_count},
                }
            ]
        }

    await _run_agent(
        a,
        "",
        [],
        callback,
        AsyncMock(return_value="output"),
        max_iterations=7,
        context_compression_enabled=True,
        max_context_chars=100,
        keep_recent_iterations=1,
        budget_warnings=[7, 5, 1],
    )
    assert a.state == AgentState.COMPLETED
    settled_call_ids(a.messages)


async def test_uncertain_structured_result_and_string_denial_are_distinct():
    a = agent()
    callback = AsyncMock(
        side_effect=[
            {
                "tool_calls": [
                    {"id": "a", "name": "t", "input": {}},
                    {"id": "b", "name": "t", "input": {}},
                ]
            },
            {"text": "done"},
        ]
    )
    execute = AsyncMock(
        side_effect=[
            ToolResult("uncertain", ok=False, uncertain_outcome=True),
            "Permission denied: no",
        ]
    )
    await _run_agent(a, "", [], callback, execute)
    assert [b["status"] for b in a.messages[2]["content"]] == ["outcome_unknown", "denied"]
