"""Spawned-agent image markers: native delivery, never stringification.

A valid native marker (``analyze_image``) reaches the agent as typed image
blocks that the agent cycle sends natively; a malformed one is a bounded,
pixel-free error. Neither is ever ``str()``-ed into tool text. Real
spawned-agent callback/history regression without executing real tools.
"""
import copy
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.agents.manager import AgentInfo, _run_agent
from src.llm.kimi import KimiClient
from src.llm.ollama import OllamaClient
from src.llm.openai_codex import CodexChatClient
from src.llm.openai_compatible import OpenAICompatibleClient
from src.tools.media_result import image_result_parts
from src.tools.result_validator import ToolResult
from tests.test_native_agents_tasks import _message, _tools

SENTINEL = "BASE64_SENTINEL"


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

    __repr__ = __str__


def image(data: str = SENTINEL * 1000, media_type: str = "image/png") -> dict:
    return {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}}


@pytest.mark.parametrize("marker", [
    {"__image_block__": image(), "__prompt__": "Describe the chart."},
    {"__image_blocks__": [image(SENTINEL + "A" * 500), image(SENTINEL + "B" * 500)],
     "__text__": "two panels"},
])
async def test_valid_marker_becomes_typed_media_without_stringification(marker):
    cb = await callback(NeverStringify(marker))
    result = await cb("analyze_image", {})
    assert isinstance(result, ToolResult) and result.ok and result.tool_name == "analyze_image"
    text, blocks = image_result_parts(dict(marker))
    assert result.output == text
    assert list(result.image_blocks) == blocks
    assert SENTINEL not in result.output
    assert SENTINEL not in json.dumps(result.as_dict()) and SENTINEL not in repr(result)


MALFORMED_BLOCKS = [
    None,
    {},
    {"type": "image"},
    {"type": "image", "source": SENTINEL},
    {"type": "image", "source": {"type": "url", "url": SENTINEL}},
    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": ""}},
    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": 123}},
    {"type": "image", "source": {"type": "base64", "media_type": "text/plain", "data": SENTINEL}},
    {"type": "image", "source": {"type": "base64", "data": SENTINEL}},
    {"type": "text", "text": SENTINEL},
]


@pytest.mark.parametrize("marker", [
    *({"__image_block__": block, "__prompt__": "SECRET_PROMPT"} for block in MALFORMED_BLOCKS),
    {"__image_blocks__": SENTINEL},
    {"__image_blocks__": []},
    {"__image_blocks__": [image(), {"type": "image", "source": {"type": "base64", "data": "x"}}]},
    {"__image_block__": image(), "__prompt__": {"nested": SENTINEL}},
    {"__image_blocks__": [image()], "__text__": [SENTINEL]},
])
async def test_malformed_marker_refused_without_stringification(marker):
    cb = await callback(NeverStringify(marker))
    result = await cb("analyze_image", {})
    assert isinstance(result, ToolResult) and not result.ok
    assert result.error == "malformed_image_result"
    assert len(result.output) < 256 and not result.image_blocks
    assert SENTINEL not in result.output and "SECRET_PROMPT" not in result.output


@pytest.mark.parametrize("original, expected", [(None, ""), (12, "12"), ("hello", "hello"),
                                                ({"ordinary": True}, "{'ordinary': True}")])
async def test_ordinary_conversion_preserved(original, expected):
    assert await (await callback(original))("test", {}) == expected


@pytest.mark.parametrize("original", [
    ToolResult("failed", ok=False, error="known", uncertain_outcome=True),
    ToolResult("typed media", image_blocks=(image(),)),
])
async def test_tool_result_identity_preserved(original):
    assert await (await callback(original))("test", {}) is original


def _wire(provider: str, messages: list[dict]) -> tuple[list[str], list[str]]:
    """(tool result texts, native image payloads) as each provider serializes them."""
    if provider == "codex":
        wire = CodexChatClient._convert_messages_with_tools(None, messages)
        outputs = [x["output"] for x in wire if x.get("type") == "function_call_output"]
        images = [part["image_url"].rsplit(",", 1)[1] for x in wire
                  if isinstance(x.get("content"), list) for part in x["content"]
                  if part.get("type") == "input_image"]
        return outputs, images
    if provider == "ollama":
        wire = OllamaClient._convert_messages(None, messages, "")
        outputs = [m["content"] for m in wire if m.get("role") == "tool"]
        return outputs, [data for m in wire for data in m.get("images", [])]
    client = KimiClient if provider == "kimi" else OpenAICompatibleClient
    wire = client._convert_messages(None, messages, "")
    outputs = [m["content"] for m in wire if m.get("role") == "tool"]
    images = [part["image_url"]["url"].rsplit(",", 1)[1] for m in wire
              if isinstance(m.get("content"), list) for part in m["content"]
              if part.get("type") == "image_url"]
    return outputs, images


@pytest.mark.parametrize("provider", ["codex", "compatible", "kimi", "ollama"])
async def test_native_image_reaches_providers_only_as_image_parts(provider):
    payload = SENTINEL * 20_000
    cb = await callback({"__image_block__": image(payload), "__prompt__": "Describe it."})
    agent = AgentInfo(id="a", label="a", goal="look", channel_id="c", requester_id="u",
                      requester_name="u", messages=[{"role": "user", "content": "look"}])
    saver = SimpleNamespace(save=AsyncMock())
    responses = [{"tool_calls": [{"id": "image-call", "name": "analyze_image", "input": {}}]},
                 {"text": "It is a chart"}]
    requests = []

    async def iteration(messages, *args, **kwargs):
        requests.append(copy.deepcopy(messages))
        return responses.pop(0)

    await _run_agent(agent, "", [], iteration, cb, max_iterations=2, trajectory_saver=saver)
    assert agent.result == "It is a chart" and len(requests) == 2
    outputs, images = _wire(provider, requests[1])
    assert outputs == ["[Image loaded. Analyze it with this instruction: Describe it.]"]
    assert images == [payload]
    result = requests[1][2]["content"][0]
    assert not result["is_error"] and result["tool_use_id"] == "image-call"
    assert SENTINEL not in json.dumps(requests[1][2])
    trajectory = json.dumps(saver.save.call_args.args[0].to_dict())
    assert SENTINEL not in trajectory and "Describe it." in trajectory
