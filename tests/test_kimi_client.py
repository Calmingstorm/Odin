"""Tests for the Kimi LLM client."""
from __future__ import annotations

import json

import pytest

from src.llm.kimi import KimiClient, KIMI_TOOL_ENFORCEMENT
from src.llm.types import LLMResponse, ToolCall


@pytest.fixture
def client():
    return KimiClient(api_key="test-key", model="kimi-k2.6")


class TestConvertMessages:
    def test_system_prepended(self, client):
        msgs = client._convert_messages([{"role": "user", "content": "hi"}], "Be helpful")
        assert msgs[0] == {"role": "system", "content": "Be helpful"}
        assert msgs[1] == {"role": "user", "content": "hi"}

    def test_tool_result_with_id(self, client):
        msgs = client._convert_messages([
            {"role": "tool_result", "content": "done", "tool_use_id": "call_123"},
        ], "")
        assert msgs[0]["role"] == "tool"
        assert msgs[0]["tool_call_id"] == "call_123"
        assert msgs[0]["content"] == "done"

    def test_tool_use_blocks_preserved(self, client):
        msgs = client._convert_messages([{
            "role": "assistant",
            "content": [
                {"type": "text", "text": "Using tool"},
                {"type": "tool_use", "id": "tc1", "name": "read_file", "input": {"path": "/tmp"}},
            ],
        }], "")
        assert msgs[0]["role"] == "assistant"
        assert len(msgs[0]["tool_calls"]) == 1
        assert msgs[0]["tool_calls"][0]["function"]["name"] == "read_file"
        assert json.loads(msgs[0]["tool_calls"][0]["function"]["arguments"]) == {"path": "/tmp"}

    def test_multipart_text(self, client):
        msgs = client._convert_messages([{
            "role": "user",
            "content": [
                {"type": "text", "text": "hello"},
                {"type": "text", "text": "world"},
            ],
        }], "")
        assert msgs[0]["content"] == "hello\nworld"


class TestConvertTools:
    def test_basic(self, client):
        tools = client._convert_tools([{
            "name": "run_command",
            "description": "Run a shell command",
            "input_schema": {"type": "object", "properties": {"cmd": {"type": "string"}}},
        }])
        assert tools[0]["type"] == "function"
        assert tools[0]["function"]["name"] == "run_command"


class TestTemperatureClamping:
    def test_none_returns_default(self):
        assert KimiClient._clamp_temperature(None) == 0.6

    def test_high_value_clamped(self):
        assert KimiClient._clamp_temperature(1.5) == 1.0

    def test_negative_clamped(self):
        assert KimiClient._clamp_temperature(-0.5) == 0.0

    def test_valid_passes_through(self):
        assert KimiClient._clamp_temperature(0.7) == 0.7


class TestParseResponse:
    def test_text_only(self, client):
        resp = client._parse_response({
            "choices": [{"message": {"content": "Hello"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 50, "completion_tokens": 10},
        })
        assert resp.text == "Hello"
        assert resp.stop_reason == "end_turn"
        assert resp.input_tokens == 50
        assert resp.output_tokens == 10

    def test_tool_calls(self, client):
        resp = client._parse_response({
            "choices": [{
                "message": {
                    "content": None,
                    "tool_calls": [
                        {"id": "call_1", "type": "function", "function": {"name": "read_file", "arguments": '{"path": "/tmp"}'}},
                        {"id": "call_2", "type": "function", "function": {"name": "run_command", "arguments": '{"cmd": "ls"}'}},
                    ],
                },
                "finish_reason": "tool_calls",
            }],
            "usage": {"prompt_tokens": 100, "completion_tokens": 20},
        })
        assert resp.stop_reason == "tool_use"
        assert len(resp.tool_calls) == 2
        assert resp.tool_calls[0].id == "call_1"
        assert resp.tool_calls[0].input == {"path": "/tmp"}
        assert resp.tool_calls[1].name == "run_command"

    def test_malformed_arguments(self, client):
        resp = client._parse_response({
            "choices": [{
                "message": {
                    "content": "",
                    "tool_calls": [
                        {"id": "c1", "function": {"name": "test", "arguments": "not json"}},
                    ],
                },
                "finish_reason": "tool_calls",
            }],
        })
        assert resp.tool_calls[0].input == {"raw": "not json"}

    def test_empty_choices(self, client):
        resp = client._parse_response({"choices": []})
        assert resp.text == ""
        assert resp.tool_calls == []

    def test_null_content(self, client):
        resp = client._parse_response({
            "choices": [{"message": {"content": None}, "finish_reason": "stop"}],
        })
        assert resp.text == ""


class TestToolEnforcement:
    def test_enforcement_appended_to_system(self, client):
        assert "MUST use the provided tools" in KIMI_TOOL_ENFORCEMENT

    def test_chat_does_not_append_enforcement(self, client):
        msgs = client._convert_messages([{"role": "user", "content": "hi"}], "Be helpful")
        system_content = msgs[0]["content"]
        assert "MUST use the provided tools" not in system_content


class TestProperties:
    def test_provider_name(self, client):
        assert client.provider_name == "kimi"

    def test_model_name(self, client):
        assert client.model_name == "kimi-k2.6"

    def test_pool_stats(self, client):
        stats = client.pool_stats()
        assert stats["provider"] == "kimi"
        assert stats["model"] == "kimi-k2.6"
        assert "api.moonshot.ai" in stats["base_url"]


class TestKimiConfig:
    def test_defaults(self):
        from src.config.schema import KimiConfig
        cfg = KimiConfig()
        assert cfg.enabled is False
        assert cfg.model == "kimi-k2.6"
        assert "moonshot" in cfg.base_url

    def test_invalid_url(self):
        from src.config.schema import KimiConfig
        with pytest.raises(ValueError, match="http"):
            KimiConfig(base_url="ftp://bad")

    def test_empty_model(self):
        from src.config.schema import KimiConfig
        with pytest.raises(ValueError, match="model"):
            KimiConfig(model="")

    def test_provider_literal(self):
        from src.config.schema import LLMProviderConfig
        assert LLMProviderConfig(active_provider="kimi").active_provider == "kimi"

    def test_full_config(self):
        from src.config.schema import Config
        cfg = Config.model_validate({
            "discord": {"token": "test"},
            "kimi": {"enabled": True, "api_key": "sk-test", "model": "kimi-k2.5"},
            "llm_provider": {"active_provider": "kimi"},
        })
        assert cfg.kimi.enabled is True
        assert cfg.kimi.api_key == "sk-test"
        assert cfg.llm_provider.active_provider == "kimi"
