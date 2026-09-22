"""Machine-only telemetry must never finish, interrupt, or re-prompt an agent."""
import json
from dataclasses import asdict
from types import SimpleNamespace

import pytest

from src.agents.manager import AgentInfo
from src.agents.wait_results import render_wait_results, validate_wait_roster
from src.llm.openai_codex import CodexChatClient
from src.llm.openai_compatible import OpenAICompatibleClient
from src.llm.progress import GenerationProgress, emit_progress
from tests.test_compatible_streaming import Response, event, sse


def agent():
    return AgentInfo("id", "worker", "goal", "channel", "requester", "name")


def test_progress_is_not_model_visible_or_iteration_progress(monkeypatch):
    a = agent()
    monkeypatch.setattr("src.agents.manager.time.time", lambda: 100)
    a.set_phase("generating")
    initial = (a.messages[:], a.iteration_count, a.status, a.last_activity)
    monkeypatch.setattr("src.agents.manager.time.time", lambda: 110)
    a.observe_generation_progress(GenerationProgress("wire", "compat"))
    assert "awaiting first substantive delta" in a.activity()["activity"]
    a.observe_generation_progress(GenerationProgress("substantive", "compat"))
    monkeypatch.setattr("src.agents.manager.time.time", lambda: 150)
    a.observe_generation_progress(GenerationProgress("wire", "compat"))
    summary = a.activity()["activity"]
    assert "wire 0s ago" in summary and "substantive 40s ago" in summary
    assert initial == (a.messages, a.iteration_count, a.status, a.last_activity)
    a.observe_generation_progress(GenerationProgress("retry", "compat", attempt=1))
    a.observe_generation_progress(GenerationProgress("retry", "compat", attempt=2))
    a.observe_generation_progress(GenerationProgress("discarded", "compat",
                                                    discarded_text_chars=12))
    assert "attempt 2" in a.activity()["activity"]
    assert "discarded chars 12" in a.activity()["activity"]
    a.set_phase("generating")
    assert a.generation_discarded_text_chars == 0


async def test_codex_and_compatible_same_normalized_progress_and_atomic_result():
    codex_events = [
        {"type": "response.reasoning_summary_text.delta", "delta": "private"},
        {"type": "response.output_text.delta", "delta": "ok"},
        {"type": "response.completed", "response": {}},
    ]

    async def lines():
        yield b": keepalive\n"
        for e in codex_events:
            yield ("data: " + json.dumps(e) + "\n").encode()

    codex = object.__new__(CodexChatClient)
    c_seen = []
    c_result = await codex._read_tool_stream(
        SimpleNamespace(content=lines()), progress_observer=c_seen.append
    )
    compatible = OpenAICompatibleClient("test", "model")
    p_seen = []
    result = await compatible._read_sse_response(Response(sse([
        event({"reasoning": "private"}), event({"content": "ok"}), event(finish="stop"),
    ])), p_seen.append)
    assert c_result.text == compatible._parse_response(result).text == "ok"
    assert sum(e.kind == "substantive" for e in c_seen) == 2
    assert sum(e.kind == "substantive" for e in p_seen) == 2
    for seen in (c_seen, p_seen):
        assert any(e.kind == "wire" for e in seen)
        assert "private" not in str([asdict(e) for e in seen])


def test_wait_summary_and_worst_case_activity_budget():
    a = agent()
    a.set_phase("generating")
    snapshot = {"id": "id", "status": "running", "label": "worker", **a.activity()}
    rendered = render_wait_results(["id"], {"id": snapshot}, 2000)
    assert a.activity()["activity"] in rendered
    validate_wait_roster(["id"], {"id": snapshot}, 2000)
    with pytest.raises(ValueError, match="Split"):
        validate_wait_roster([str(i) for i in range(20)], {}, 12000)
    snapshot["activity"] = "x" * 10000
    assert "x" * 301 not in render_wait_results(["id"], {"id": snapshot}, 2000)


def test_broken_observer_cannot_fail_generation():
    emit_progress(lambda e: 1 / 0, GenerationProgress("wire", "codex"))
    emit_progress(None, GenerationProgress("wire", "compat"))


async def test_codex_observed_retry_is_atomic_and_counts_discarded_output(monkeypatch):
    from unittest.mock import AsyncMock

    from src.llm.openai_codex import CodexStreamError
    from tests.test_openai_codex_client import _client

    client = _client()
    seen = []

    async def fake_retries(body, reader, empty, **kwargs):
        observer = kwargs["progress_observer"]
        emit_progress(observer, GenerationProgress("retry", "codex"))
        with pytest.raises(CodexStreamError):
            await reader("broken")
        emit_progress(observer, GenerationProgress("retry", "codex", attempt=2))
        result = await reader("complete")
        assert not empty(result)
        return result

    async def reader(resp, *, progress_observer):
        from src.llm.types import LLMResponse

        emit_progress(progress_observer, GenerationProgress(
            "substantive", "codex", text_chars=9, tool_argument_chars=7,
        ))
        if resp == "broken":
            raise CodexStreamError("unexpected EOF")
        return LLMResponse(text="accepted")

    monkeypatch.setattr(client, "_send_with_retries", fake_retries)
    monkeypatch.setattr(client, "_read_tool_stream", reader)
    response = await client.chat_with_tools([], "", [], progress_observer=seen.append)
    assert response.text == "accepted"
    discarded = [e for e in seen if e.kind == "discarded"]
    assert len(discarded) == 1
    assert (discarded[0].discarded_text_chars, discarded[0].discarded_tool_argument_chars) == (9, 7)
    assert sum(e.kind == "retry" for e in seen) == 2
    monkeypatch.setattr(client, "_stream_tool_request", AsyncMock(return_value=response))
    await client.chat_with_tools([], "", [])
    assert "progress_observer" not in client._stream_tool_request.call_args.kwargs


async def test_codex_reasoning_and_tool_argument_progress_without_content():
    wire_events = [
        {"type": "response.reasoning_text.delta", "delta": "private"},
        {"type": "response.output_item.added", "output_index": 0,
         "item": {"type": "function_call", "call_id": "x", "name": "tool"}},
        {"type": "response.function_call_arguments.delta", "output_index": 0, "delta": "{}"},
        {"type": "response.function_call_arguments.done", "output_index": 0},
        {"type": "response.completed", "response": {}},
    ]

    async def lines():
        for e in wire_events:
            yield ("data: " + json.dumps(e) + "\n").encode()

    seen = []
    result = await object.__new__(CodexChatClient)._read_tool_stream(
        SimpleNamespace(content=lines()), progress_observer=seen.append
    )
    assert result.text == "" and len(result.tool_calls) == 1
    assert sum(e.kind == "substantive" for e in seen) == 3
    assert sum(e.tool_argument_chars for e in seen) == 2


@pytest.mark.parametrize("provider", ["codex", "compat"])
async def test_real_agent_callback_progress_cannot_complete_an_inflight_turn(provider):
    import asyncio
    from unittest.mock import AsyncMock

    from src.agents.manager import _run_agent
    from tests.test_agent_transcript_contract import agent as make_agent

    a = make_agent()
    entered, release = asyncio.Event(), asyncio.Event()

    async def callback(messages, system, tools, *, generation_state):
        observer = generation_state["progress_observer"]
        observer(GenerationProgress("retry", provider))
        observer(GenerationProgress("wire", provider))
        observer(GenerationProgress("substantive", provider))
        entered.set()
        await release.wait()
        return {"text": "completed only after terminal"}

    task = asyncio.create_task(_run_agent(a, "", [], callback, AsyncMock()))
    await entered.wait()
    assert not task.done() and a.status == "running" and a.iteration_count == 1
    assert not any(message.get("role") == "assistant" for message in a.messages)
    assert a.result == ""
    release.set()
    await task
    assert a.status == "completed" and a.result == "completed only after terminal"
