"""Tests for the Ollama LLM client."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.llm.ollama import OllamaClient
from src.llm.types import LLMResponse, ToolCall


@pytest.fixture
def client():
    return OllamaClient(
        base_url="http://localhost:11434",
        model="llama3.1:8b",
        max_tokens=4096,
    )


# --- Message conversion ---


class TestConvertMessages:
    def test_system_prepended(self, client):
        msgs = client._convert_messages([{"role": "user", "content": "hi"}], "Be helpful")
        assert msgs[0] == {"role": "system", "content": "Be helpful"}
        assert msgs[1] == {"role": "user", "content": "hi"}

    def test_no_system_when_empty(self, client):
        msgs = client._convert_messages([{"role": "user", "content": "hi"}], "")
        assert msgs[0]["role"] == "user"

    def test_tool_result_role(self, client):
        msgs = client._convert_messages([
            {"role": "tool_result", "content": {"key": "value"}},
        ], "")
        assert msgs[0]["role"] == "tool"
        assert msgs[0]["content"] == '{"key": "value"}'

    def test_tool_result_string(self, client):
        msgs = client._convert_messages([
            {"role": "tool_result", "content": "done"},
        ], "")
        assert msgs[0]["content"] == "done"

    def test_multipart_content_text(self, client):
        msgs = client._convert_messages([{
            "role": "user",
            "content": [
                {"type": "text", "text": "hello"},
                {"type": "text", "text": "world"},
            ],
        }], "")
        assert msgs[0]["content"] == "hello\nworld"

    def test_image_blocks_extracted(self, client):
        msgs = client._convert_messages([{
            "role": "user",
            "content": [
                {"type": "text", "text": "describe this"},
                {"type": "image", "source": {"type": "base64", "data": "abc123"}},
            ],
        }], "")
        assert msgs[0]["content"] == "describe this"
        assert msgs[0]["images"] == ["abc123"]

    def test_tool_use_blocks_skipped(self, client):
        msgs = client._convert_messages([{
            "role": "assistant",
            "content": [
                {"type": "text", "text": "Using tool"},
                {"type": "tool_use", "id": "tc1", "name": "read_file"},
            ],
        }], "")
        assert msgs[0]["content"] == "Using tool"

    def test_assistant_role_mapping(self, client):
        msgs = client._convert_messages([
            {"role": "assistant", "content": "sure"},
        ], "")
        assert msgs[0]["role"] == "assistant"

    def test_tool_role_mapping(self, client):
        msgs = client._convert_messages([
            {"role": "tool", "content": "result"},
        ], "")
        assert msgs[0]["role"] == "tool"


# --- Tool conversion ---


class TestConvertTools:
    def test_basic_tool(self, client):
        tools = client._convert_tools([{
            "name": "read_file",
            "description": "Read a file",
            "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}},
        }])
        assert len(tools) == 1
        assert tools[0]["type"] == "function"
        assert tools[0]["function"]["name"] == "read_file"
        assert "path" in tools[0]["function"]["parameters"]["properties"]

    def test_fallback_to_parameters(self, client):
        tools = client._convert_tools([{
            "name": "test",
            "description": "test",
            "parameters": {"type": "object"},
        }])
        assert tools[0]["function"]["parameters"] == {"type": "object"}


# --- Response parsing ---


class TestParseResponse:
    def test_text_only(self, client):
        resp = client._parse_response({
            "message": {"role": "assistant", "content": "Hello there"},
            "prompt_eval_count": 50,
            "eval_count": 10,
        })
        assert isinstance(resp, LLMResponse)
        assert resp.text == "Hello there"
        assert resp.tool_calls == []
        assert resp.stop_reason == "end_turn"
        assert resp.input_tokens == 50
        assert resp.output_tokens == 10

    def test_tool_calls(self, client):
        resp = client._parse_response({
            "message": {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {"function": {"name": "read_file", "arguments": {"path": "/etc/hosts"}}},
                    {"function": {"name": "run_bash", "arguments": {"command": "ls"}}},
                ],
            },
        })
        assert resp.stop_reason == "tool_use"
        assert len(resp.tool_calls) == 2
        assert resp.tool_calls[0].name == "read_file"
        assert resp.tool_calls[0].input == {"path": "/etc/hosts"}
        assert resp.tool_calls[1].name == "run_bash"
        # IDs should be unique
        assert resp.tool_calls[0].id != resp.tool_calls[1].id
        assert resp.tool_calls[0].id.startswith("ollama_")

    def test_arguments_as_string(self, client):
        resp = client._parse_response({
            "message": {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {"function": {"name": "test", "arguments": '{"key": "value"}'}},
                ],
            },
        })
        assert resp.tool_calls[0].input == {"key": "value"}

    def test_arguments_unparseable_string(self, client):
        resp = client._parse_response({
            "message": {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {"function": {"name": "test", "arguments": "not json"}},
                ],
            },
        })
        assert resp.tool_calls[0].input == {"raw": "not json"}

    def test_empty_tool_calls(self, client):
        resp = client._parse_response({
            "message": {"role": "assistant", "content": "ok", "tool_calls": []},
        })
        assert resp.stop_reason == "end_turn"
        assert resp.tool_calls == []

    def test_missing_eval_counts(self, client):
        resp = client._parse_response({
            "message": {"role": "assistant", "content": "hello world"},
        })
        assert resp.input_tokens > 0
        assert resp.output_tokens > 0


# --- Properties ---


class TestProperties:
    def test_provider_name(self, client):
        assert client.provider_name == "ollama"

    def test_model_name(self, client):
        assert client.model_name == "llama3.1:8b"

    def test_pool_stats(self, client):
        stats = client.pool_stats()
        assert stats["provider"] == "ollama"
        assert stats["base_url"] == "http://localhost:11434"
        assert stats["model"] == "llama3.1:8b"


# --- Config ---


class TestOllamaConfig:
    def test_defaults(self):
        from src.config.schema import OllamaConfig
        cfg = OllamaConfig()
        assert cfg.enabled is False
        assert cfg.base_url == "http://127.0.0.1:11434"
        assert cfg.model == "llama3.1:8b"
        assert cfg.max_tokens == 4096

    def test_invalid_url(self):
        from src.config.schema import OllamaConfig
        with pytest.raises(ValueError, match="http"):
            OllamaConfig(base_url="ftp://localhost")

    def test_invalid_timeout(self):
        from src.config.schema import OllamaConfig
        with pytest.raises(ValueError, match="timeout"):
            OllamaConfig(timeout=5)

    def test_invalid_max_tokens(self):
        from src.config.schema import OllamaConfig
        with pytest.raises(ValueError, match="max_tokens"):
            OllamaConfig(max_tokens=0)

    def test_empty_model(self):
        from src.config.schema import OllamaConfig
        with pytest.raises(ValueError, match="model"):
            OllamaConfig(model="")


class TestLLMProviderConfig:
    def test_default(self):
        from src.config.schema import LLMProviderConfig
        cfg = LLMProviderConfig()
        assert cfg.active_provider == "codex"

    def test_valid_providers(self):
        from src.config.schema import LLMProviderConfig
        assert LLMProviderConfig(active_provider="codex").active_provider == "codex"
        assert LLMProviderConfig(active_provider="ollama").active_provider == "ollama"

    def test_invalid_provider(self):
        from src.config.schema import LLMProviderConfig
        with pytest.raises(ValueError):
            LLMProviderConfig(active_provider="gemini")


class TestConfigParsing:
    def test_full_config_with_ollama(self):
        from src.config.schema import Config
        cfg = Config.model_validate({
            "discord": {"token": "test"},
            "ollama": {
                "enabled": True,
                "base_url": "http://192.168.1.3:11434",
                "model": "qwen2.5:14b",
            },
            "llm_provider": {"active_provider": "ollama"},
        })
        assert cfg.ollama.enabled is True
        assert cfg.ollama.model == "qwen2.5:14b"
        assert cfg.llm_provider.active_provider == "ollama"
