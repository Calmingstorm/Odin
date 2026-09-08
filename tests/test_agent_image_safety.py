"""Real spawned-agent callback/history regression without executing real tools."""
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.agents.manager import AgentInfo, _run_agent
from src.llm.kimi import KimiClient
from src.llm.ollama import OllamaClient
from src.llm.openai_codex import CodexChatClient
from src.tools.result_validator import ToolResult
from tests.test_native_agents_tasks import _message, _tools


async def callback(result):
    tools = _tools()
    tools._agent_manager.spawn.return_value = "agent"
    tools._agent_manager._agents = {}
    tools._tool_loop.dispatch_loop_tool = AsyncMock(return_value=result)
    await tools._handle_spawn_agent(_message(), {"label": "image", "goal": "inspect"})
    return tools._agent_manager.spawn.call_args.kwargs["tool_executor_callback"]


class NeverStringify(dict):
    def __str__(self):
        raise AssertionError("image marker was stringified")


@pytest.mark.parametrize("marker", [None, {}, {"data": "BASE64_SENTINEL" * 200_000}])
async def test_marker_refused_without_stringification(marker):
    cb = await callback(NeverStringify(__image_block__=marker, __prompt__="SECRET_PROMPT"))
    result = await cb("analyze_image", {})
    assert isinstance(result, ToolResult) and not result.ok
    assert result.error == "unsupported_agent_image"
    assert len(result.output) < 256
    assert "SECRET_PROMPT" not in result.output and "BASE64_SENTINEL" not in result.output


@pytest.mark.parametrize("original, expected", [(None, ""), (12, "12"), ("hello", "hello"),
                                                ({"ordinary": True}, "{'ordinary': True}")])
async def test_ordinary_conversion_preserved(original, expected):
    assert await (await callback(original))("test", {}) == expected


async def test_tool_result_identity_preserved():
    original = ToolResult("failed", ok=False, error="known", uncertain_outcome=True)
    assert await (await callback(original))("test", {}) is original


@pytest.mark.parametrize("provider", ["codex", "kimi", "ollama"])
async def test_agent_history_trajectory_and_provider_conversion_never_contain_pixels(provider):
    payload = "BASE64_SENTINEL" * 200_000
    cb = await callback({"__image_block__": {"source": {"data": payload}},
                         "__prompt__": "SECRET_PROMPT"})
    agent = AgentInfo(id="a", label="a", goal="look", channel_id="c", requester_id="u",
                      requester_name="u", messages=[{"role": "user", "content": "look"}])
    saver = SimpleNamespace(save=AsyncMock())
    iteration = AsyncMock(side_effect=[
        {"tool_calls": [{"id": "image-call", "name": "analyze_image", "input": {}}]},
        {"text": "Image unavailable"},
    ])
    await _run_agent(agent, "", [], iteration, cb, max_iterations=2, trajectory_saver=saver)
    if provider == "codex":
        wire = CodexChatClient._convert_messages_with_tools(None, agent.messages)
        outputs = [x for x in wire if x.get("type") == "function_call_output"]
        assert outputs[0]["call_id"] == "image-call"
    else:
        client = KimiClient if provider == "kimi" else OllamaClient
        wire = client._convert_messages(None, agent.messages, "")
        outputs = [x for x in wire if x.get("role") == "tool"]
    assert len(outputs) == 1
    transcript = json.dumps({"wire": wire, "history": agent.messages,
                             "trajectory": saver.save.call_args.args[0].to_dict()})
    assert "BASE64_SENTINEL" not in transcript and "SECRET_PROMPT" not in transcript
    assert "image results are unsupported in spawned agents" in transcript
    result = agent.messages[2]["content"][0]
    assert result["is_error"] and result["tool_use_id"] == "image-call"
