"""Provider wire arguments pass through real chat, loop and agent dispatch."""

from unittest.mock import AsyncMock

import pytest

from src.agents.manager import _run_agent
from src.llm.kimi import KimiClient
from src.llm.ollama import OllamaClient
from tests.characterization.test_autonomous_loop import build as build_loop
from tests.characterization.test_autonomous_loop import run_iteration
from tests.characterization.test_chat_tool_loop import build, run_loop
from tests.fakes import FakeMessage, text_response
from tests.test_agent_transcript_contract import agent


def parsed(provider, arguments):
    message = {"tool_calls": [{"id": "original", "function": {
        "name": "run_command", "arguments": arguments,
    }}]}
    if provider == "kimi":
        return KimiClient._parse_response(None, {"choices": [{"message": message}]})
    return OllamaClient._parse_response(None, {"message": message})


@pytest.mark.parametrize("provider", ["kimi", "ollama"])
@pytest.mark.parametrize("arguments", ["not json", "[]", "null", "42", '"text"', [], None, 1])
@pytest.mark.parametrize("entry", ["chat", "loop", "agent"])
async def test_rejected_arguments_pair_without_effects(
    provider, arguments, entry, tmp_path, monkeypatch,
):
    monkeypatch.chdir(tmp_path)
    response = parsed(provider, arguments)
    assert response.tool_calls[0].id == "original"
    if entry == "agent":
        a = agent()
        callback = AsyncMock(side_effect=[
            {"tool_calls": response.tool_calls}, {"text": "done"},
        ])
        execute = AsyncMock(return_value="ok")
        await _run_agent(a, "", [], callback, execute, max_iterations=3)
        execute.assert_not_awaited()
        result = a.messages[2]["content"][0]
        assert result["status"] == "invalid_arguments"
    else:
        bot, fake = (build if entry == "chat" else build_loop)([response, text_response("done")])
        bot.tool_executor.execute = AsyncMock(return_value="ok")
        if entry == "chat":
            await run_loop(bot, FakeMessage("go"))
        else:
            await run_iteration(bot)
        bot.tool_executor.execute.assert_not_awaited()
        result = fake.messages_of_call(1)[-1]["content"][0]
        assert "NOT executed" in result["content"]
    assert result["tool_use_id"] == "original"


@pytest.mark.parametrize("provider", ["kimi", "ollama"])
@pytest.mark.parametrize("arguments", ["{}", {}])
def test_valid_empty_object_unchanged(provider, arguments):
    call = parsed(provider, arguments).tool_calls[0]
    assert call.id == "original" and call.input == {} and call.parse_error is None
