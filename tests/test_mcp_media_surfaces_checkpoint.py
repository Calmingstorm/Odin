"""Checkpoint: typed MCP image evidence crosses every model-turn surface."""
from __future__ import annotations

import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.agents.manager import AgentInfo, _run_agent
from src.discord.mcp_dispatch import dispatch_mcp_tool
from src.llm.kimi import KimiClient
from src.llm.ollama import OllamaClient
from src.llm.openai_codex import CodexChatClient
from src.tools.mcp.outcomes import OUTCOME_UNCERTAIN, MCPToolOutcome
from src.tools.media_result import BinaryAttachment
from src.tools.result_validator import ToolResult
from src.web.api.sessions_chat import register_chat
from tests.fakes import FakeLLM, FakeMessage, make_bot, text_response, tool_call_response

PIXELS = ("MCP_PIXELS_A", "MCP_PIXELS_B", "MCP_PIXELS_C")
BINARY = b"private-binary-checkpoint\x00\xff"


def image(data: str) -> dict:
    return {"type": "image", "source": {
        "type": "base64", "media_type": "image/png", "data": data,
    }}


def outcome(text="mixed text", *pixels: str, status="ok") -> MCPToolOutcome:
    return MCPToolOutcome(status=status, text=text, server="fixture", tool="inspect",
                          generation=8, negotiated_version="test",
                          attachments=(BinaryAttachment(
                              4, "resource", "application/octet-stream", BINARY),),
                          image_blocks=tuple(image(pixel) for pixel in pixels))


def manager(*outcomes):
    return SimpleNamespace(has_tool=lambda name: name.startswith("mcp_fixture_"),
                           execute=AsyncMock(side_effect=list(outcomes)))


def install(bot, mcp):
    bot.mcp_manager = mcp
    bot.tool_loop._mcp_manager = mcp


def image_messages(messages):
    return [m["content"] for m in messages if isinstance(m, dict) and m.get("role") == "user"
            and isinstance(m.get("content"), list)
            and any(isinstance(b, dict) and b.get("type") == "image" for b in m["content"])]


def assert_grouping(messages, expected):
    actual = {}
    groups = image_messages(messages)
    assert len(groups) == len(expected)
    for group in groups:
        assert group[0]["type"] == "text"
        call_id = next(key for key in expected if f"call {key}," in group[0]["text"])
        actual[call_id] = [block["source"]["data"] for block in group[1:]]
    assert actual == expected


@pytest.fixture(autouse=True)
def isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


class TestChatApiAndProviderCheckpoint:
    @pytest.mark.parametrize("status", ["ok", "failed", OUTCOME_UNCERTAIN])
    async def test_chat_parallel_calls_keep_labels_images_and_result_text_separate(self, status):
        fake = FakeLLM([
            tool_call_response(("mcp_fixture_one", {}), ("mcp_fixture_two", {})),
            text_response("done"),
        ])
        bot = make_bot(fake_llm=fake)
        install(bot, manager(outcome("one", PIXELS[0], PIXELS[1], status=status),
                             outcome("two", PIXELS[2])))
        result = await bot.tool_loop.run(
            FakeMessage("inspect"), [{"role": "user", "content": "inspect"}])
        assert result[0] == "done" and result[2] is False
        continuation = fake.messages_of_call(1)
        assert_grouping(continuation, {"call-1": list(PIXELS[:2]), "call-2": [PIXELS[2]]})
        result_blocks = json.dumps(continuation[-3])
        assert "one" in result_blocks and "two" in result_blocks
        assert all(pixel not in result_blocks for pixel in PIXELS)
        assert base64.b64encode(BINARY).decode() not in result_blocks
        records = await bot.audit.search()
        assert records
        audit = json.dumps(records, default=str)
        assert all(pixel not in audit for pixel in PIXELS)
        assert base64.b64encode(BINARY).decode() not in audit
        if status != "ok":
            assert status in audit

        # Every supported adapter preserves typed vision, including Kimi's
        # OpenAI-compatible image_url form. Labels remain in two user messages.
        codex = CodexChatClient._convert_messages_with_tools(None, continuation)
        assert len([b for item in codex for b in item.get("content", [])
                    if b.get("type") == "input_image"]) == 3
        ollama = OllamaClient(base_url="http://localhost", model="test")._convert_messages(
            continuation, "")
        assert [p for item in ollama for p in item.get("images", [])] == list(PIXELS)
        kimi = KimiClient(api_key="test", model="kimi-k2.6")._convert_messages(continuation, "")
        vision = [item for item in kimi if isinstance(item.get("content"), list)]
        assert len(vision) == 2
        converted_pixels = [part["image_url"]["url"].rsplit(",", 1)[1]
                            for item in vision for part in item["content"]
                            if part.get("type") == "image_url"]
        assert converted_pixels == list(PIXELS)

    async def test_api_chat_exercises_same_typed_media_continuation(self):
        fake = FakeLLM([tool_call_response(("mcp_fixture_inspect", {})), text_response("API done")])
        bot = make_bot(fake_llm=fake)
        install(bot, manager(outcome("api", PIXELS[0], PIXELS[1])))
        app, routes = web.Application(), web.RouteTableDef()
        register_chat(routes, bot)
        app.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            response = await client.post("/api/chat", json={"content": "inspect"})
            assert response.status == 200
            assert (await response.json())["response"] == "API done"
        continuation = fake.messages_of_call(1)
        assert_grouping(continuation, {"call-1": list(PIXELS[:2])})
        assert "api" in json.dumps(continuation[-2])
        assert all(pixel not in json.dumps(continuation[-2]) for pixel in PIXELS[:2])

    async def test_uncertain_typed_mcp_metadata_does_not_become_success_or_pixel_text(self):
        result = await dispatch_mcp_tool(
            manager(outcome("effect UNKNOWN", PIXELS[0], status=OUTCOME_UNCERTAIN)),
            "mcp_fixture_inspect", {})
        assert not result.ok and result.uncertain_outcome
        assert result.audit_metadata["outcome"] == OUTCOME_UNCERTAIN
        assert result.image_blocks[0]["source"]["data"] == PIXELS[0]
        assert PIXELS[0] not in result.output
        assert PIXELS[0] not in repr(result)
        assert PIXELS[0] not in json.dumps(result.as_dict())


class TestLoopAndAgentCheckpoint:
    async def test_autonomous_loop_keeps_multiple_calls_grouped_and_audit_pixel_free(self):
        fake = FakeLLM([tool_call_response(("mcp_fixture_one", {}), ("mcp_fixture_two", {})),
                        text_response("loop done")])
        bot = make_bot(fake_llm=fake)
        install(bot, manager(outcome("one", PIXELS[0]), outcome("two", PIXELS[1], PIXELS[2])))
        bot.turn_recorder._maybe_loop_reflect = lambda **kwargs: None
        answer = await bot.tool_loop.run_autonomous(
            "inspect", SimpleNamespace(id="room"), None, "owner")
        assert answer == "loop done"
        assert_grouping(fake.messages_of_call(1), {
            "call-1": [PIXELS[0]], "call-2": list(PIXELS[1:]),
        })
        records = await bot.audit.search()
        assert records
        audit = json.dumps(records, default=str)
        assert all(pixel not in audit for pixel in PIXELS)
        assert base64.b64encode(BINARY).decode() not in audit

    async def test_loop_uncertain_result_is_visible_as_unknown_not_success(self):
        fake = FakeLLM([tool_call_response(("mcp_fixture_inspect", {})), text_response("noted")])
        bot = make_bot(fake_llm=fake)
        install(bot, manager(outcome("effect UNKNOWN", PIXELS[0], status=OUTCOME_UNCERTAIN)))
        bot.turn_recorder._maybe_loop_reflect = lambda **kwargs: None
        answer = await bot.tool_loop.run_autonomous(
            "inspect", SimpleNamespace(id="room"), None, "owner")
        assert answer == "noted"
        text = json.dumps(fake.messages_of_call(1)[-2])
        assert "UNKNOWN" in text and PIXELS[0] not in text
        audit = json.dumps(await bot.audit.search(), default=str)
        assert OUTCOME_UNCERTAIN in audit and PIXELS[0] not in audit

    @pytest.mark.parametrize("ok", [True, False])
    async def test_agent_typed_vision_private_trajectory_and_native_refusal(self, ok):
        agent = AgentInfo(id="media", label="media", goal="inspect", channel_id="room",
                          requester_id="owner", requester_name="Owner",
                          messages=[{"role": "user", "content": "inspect"}])
        saver = SimpleNamespace(save=AsyncMock())
        iteration = AsyncMock(side_effect=[
            {"tool_calls": [{"id": "agent-1", "name": "mcp_fixture_one", "input": {}},
                            {"id": "agent-2", "name": "mcp_fixture_two", "input": {}}]},
            {"text": "done"},
        ])
        results = [ToolResult("one", ok=ok, image_blocks=(image(PIXELS[0]), image(PIXELS[1])),
                              attachments=(BinaryAttachment(
                                  4, "resource", "application/octet-stream", BINARY),)),
                   ToolResult("two", image_blocks=(image(PIXELS[2]),))]
        await _run_agent(agent, "", [], iteration, AsyncMock(side_effect=results), max_iterations=2,
                         trajectory_saver=saver)
        assert_grouping(agent.messages, {"agent-1": list(PIXELS[:2]), "agent-2": [PIXELS[2]]})
        trajectory = json.dumps(saver.save.call_args.args[0].to_dict())
        assert "one" in trajectory and "two" in trajectory
        assert all(pixel not in trajectory for pixel in PIXELS)
        assert base64.b64encode(BINARY).decode() not in trajectory
        first = agent.messages[2]["content"][0]
        assert first["status"] == ("succeeded" if ok else "failed")

        from tests.test_agent_image_safety import callback
        legacy = await callback({"__image_block__": image(PIXELS[0]), "__prompt__": "private"})
        refused = await legacy("computer_observe", {})
        assert not refused.ok and refused.error == "unsupported_agent_image"
        assert PIXELS[0] not in refused.output

    async def test_agent_uncertain_typed_result_retains_unknown_metadata_without_pixels(self):
        agent = AgentInfo(id="uncertain", label="uncertain", goal="inspect", channel_id="room",
                          requester_id="owner", requester_name="Owner",
                          messages=[{"role": "user", "content": "inspect"}])
        saver = SimpleNamespace(save=AsyncMock())
        iteration = AsyncMock(side_effect=[
            {"tool_calls": [{"id": "unknown-1", "name": "mcp_fixture_inspect", "input": {}}]},
            {"text": "done"},
        ])
        unknown = ToolResult(
            "effect UNKNOWN", ok=False, error="effect UNKNOWN", uncertain_outcome=True,
            audit_metadata={"outcome": OUTCOME_UNCERTAIN}, image_blocks=(image(PIXELS[0]),))
        await _run_agent(
            agent, "", [], iteration, AsyncMock(return_value=unknown), max_iterations=2,
            trajectory_saver=saver)
        record = agent.messages[2]["content"][0]
        assert record["status"] == "outcome_unknown" and record["uncertain_outcome"]
        assert PIXELS[0] not in json.dumps(record)
        assert PIXELS[0] not in json.dumps(saver.save.call_args.args[0].to_dict())


class TestComputerFreshnessCheckpoint:
    @pytest.mark.parametrize("tool_name", ["analyze_image", "computer_observe", "mcp_fixture_one"])
    async def test_only_validated_computer_image_repairs_freshness(self, tool_name):
        bot = make_bot(fake_llm=FakeLLM([]))
        marker = {"__image_block__": image(PIXELS[0]), "__prompt__": "inspect legacy"}
        bot.native_tools.handles = lambda name: name in {"analyze_image", "computer_observe"}
        bot.native_tools.dispatch = AsyncMock(return_value=(
            marker, SimpleNamespace(rebuild_system_prompt=False)))
        install(bot, manager(outcome("MCP text", PIXELS[0], PIXELS[1])))
        computer = SimpleNamespace(
            reserves_tool=lambda _name: False, validate_delivery=AsyncMock())
        bot.tool_loop._computer_service = lambda: computer
        message = FakeMessage("observe")
        state = SimpleNamespace(
            message=message, user_id=str(message.author.id), iteration=1,
            policy=SimpleNamespace(skill_file_delivery="send"),
            durability=SimpleNamespace(before_tool=AsyncMock(), after_tool=AsyncMock()),
            _pending_validations=[], pending_image_blocks=[], _computer_frame_error=True)
        result = await bot.tool_loop._run_one_tool(
            state, SimpleNamespace(name=tool_name, input={}, id="freshness-1"))
        assert state.pending_image_blocks
        assert PIXELS[0] not in str(result["content"])
        if tool_name == "computer_observe":
            computer.validate_delivery.assert_awaited_once()
            assert state._computer_frame_error is False
        else:
            computer.validate_delivery.assert_not_awaited()
            assert state._computer_frame_error is True
        if tool_name == "analyze_image":
            assert state.pending_image_blocks == [image(PIXELS[0])]
            assert "inspect legacy" in result["content"]

    async def test_legacy_computer_marker_cannot_repair_stale_foreground_evidence(self):
        fake = FakeLLM([])
        bot = make_bot(fake_llm=fake)
        marker = {"__image_block__": image(PIXELS[0]), "__prompt__": "inspect"}
        bot.native_tools.handles = lambda name: name == "computer_observe"
        bot.native_tools.dispatch = AsyncMock(return_value=(
            marker, SimpleNamespace(rebuild_system_prompt=False)))
        computer = SimpleNamespace(
            reserves_tool=lambda _name: False,
            validate_delivery=AsyncMock(side_effect=PermissionError("stale")),
        )
        bot.tool_loop._computer_service = lambda: computer
        message = FakeMessage("observe")
        state = SimpleNamespace(message=message, user_id=str(message.author.id), iteration=1,
                                policy=SimpleNamespace(skill_file_delivery="send"),
                                durability=SimpleNamespace(
                                    before_tool=AsyncMock(), after_tool=AsyncMock()),
                                _pending_validations=[], pending_image_blocks=[],
                                _computer_frame_error=True)
        result = await bot.tool_loop._run_one_tool(
            state, SimpleNamespace(name="computer_observe", input={}, id="computer-1"))
        assert "Computer observation rejected" in result["content"]
        assert state.pending_image_blocks == [] and state._computer_frame_error is True
        computer.validate_delivery.assert_awaited_once()
        assert PIXELS[0] not in str(result["content"])
