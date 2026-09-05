"""Response terminals, not iterator exhaustion, authorize tool execution."""

from unittest.mock import AsyncMock

import pytest

from src.agents.manager import _run_agent
from src.llm.openai_codex import CodexStreamError
from src.tools.result_validator import ToolResult
from tests.characterization.test_autonomous_loop import build as build_loop
from tests.characterization.test_autonomous_loop import run_iteration
from tests.characterization.test_chat_tool_loop import build, run_loop
from tests.fakes import FakeMessage
from tests.test_agent_transcript_contract import agent
from tests.test_codex_reliability import FakeResp, FakeSession, _client, _sse


def events(stage):
    output = [{"type": "response.output_text.delta", "delta": "partial"}]
    if stage == "text":
        return output
    output += [
        {"type": "response.output_item.added", "output_index": 0,
         "item": {"type": "function_call", "call_id": "once", "name": "run_command"}},
        {"type": "response.function_call_arguments.delta", "output_index": 0, "delta": "{}"},
    ]
    if stage == "delta":
        return output
    output.append({"type": "response.function_call_arguments.done", "output_index": 0})
    if stage == "item":
        output.append({"type": "response.output_item.done", "output_index": 0,
                       "item": {"type": "function_call", "arguments": "{}"}})
    return output


@pytest.mark.parametrize("stage", ["text", "delta", "arguments", "item"])
@pytest.mark.parametrize("done", [False, True])
async def test_unaccepted_eof_never_returns_generation(stage, done):
    client = _client()
    with pytest.raises(CodexStreamError, match="Unexpected stream EOF"):
        await client._read_tool_stream(FakeResp(200, sse_lines=_sse(events(stage), done=done)))


@pytest.mark.parametrize("terminal", ["response.completed", "response.incomplete"])
async def test_terminal_controls_call_acceptance(terminal):
    client = _client()
    result = await client._read_tool_stream(FakeResp(200, sse_lines=_sse(
        events("arguments") + [{"type": terminal, "response": {}}],
    )))
    assert len(result.tool_calls) == (1 if terminal == "response.completed" else 0)
    assert result.stop_reason == ("tool_use" if result.tool_calls else "incomplete")


async def test_eof_transport_retry_discards_first_generation(monkeypatch):
    client = _client(max_retries=2)
    session = FakeSession([
        FakeResp(200, sse_lines=_sse(events("arguments"))),
        FakeResp(200, sse_lines=_sse([
            {"type": "response.output_text.delta", "delta": "accepted"},
            {"type": "response.completed", "response": {}},
        ])),
    ])
    monkeypatch.setattr(client, "_get_session", AsyncMock(return_value=session))
    result = await client._stream_tool_request({"model": "test"})
    assert result.text == "accepted" and not result.tool_calls


@pytest.mark.parametrize("entry", ["chat", "loop", "agent"])
@pytest.mark.parametrize("prior_effect", [False, True])
async def test_transport_recovery_through_dispatch(entry, prior_effect, tmp_path, monkeypatch):
    """A wire EOF cannot execute, nor replay an earlier accepted effect."""
    monkeypatch.chdir(tmp_path)
    client = _client(max_retries=2)
    accepted = events("arguments") + [{"type": "response.completed", "response": {}}]
    script = ([FakeResp(200, sse_lines=_sse(accepted))] if prior_effect else []) + [
        FakeResp(200, sse_lines=_sse(events("arguments"))),
        FakeResp(200, sse_lines=_sse([
            {"type": "response.output_text.delta", "delta": "Paris is in France."},
            {"type": "response.completed", "response": {}},
        ])),
    ]
    session = FakeSession(script)
    monkeypatch.setattr(client, "_get_session", AsyncMock(return_value=session))
    effect = AsyncMock(return_value="ok" if entry == "agent" else ToolResult(output="ok"))
    if entry == "agent":
        async def callback(messages, system, tools, **kwargs):
            result = await client.chat_with_tools(messages, system, tools)
            return {"text": result.text, "tool_calls": result.tool_calls}

        await _run_agent(agent(), "", [], callback, effect, max_iterations=3)
    else:
        bot, _ = (build if entry == "chat" else build_loop)([])
        bot.llm_gateway.codex_client = client
        monkeypatch.setattr(client, "chat", AsyncMock(return_value="COMPLETE"))
        bot.tool_executor.execute = effect
        if entry == "chat":
            await run_loop(bot, FakeMessage("go"))
        else:
            await run_iteration(bot)
    assert effect.await_count == int(prior_effect)
    assert session.calls == 2 + int(prior_effect)
