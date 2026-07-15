"""Tests for the Ollama LLM client."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import aiohttp
import pytest

from src.llm.ollama import OllamaClient
from src.llm.types import LLMResponse


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


# --- HTTP transport (faked aiohttp session — no real network) ---


class _FakeResp:
    """Stands in for an aiohttp response context manager."""

    def __init__(self, status=200, payload=None, text="", raise_on_enter=None):
        self.status = status
        self._payload = payload if payload is not None else {}
        self._text = text
        self._raise = raise_on_enter

    async def __aenter__(self):
        if self._raise is not None:
            raise self._raise
        return self

    async def __aexit__(self, *exc):
        return False

    async def json(self):
        return self._payload

    async def text(self):
        return self._text


class _FakeSession:
    """Pops a queued _FakeResp per request; records calls; never touches network."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.closed = False
        self.calls: list = []

    def post(self, url, json=None, headers=None):
        self.calls.append(("post", url, json, headers))
        return self._responses.pop(0)

    def get(self, url, headers=None, timeout=None):
        self.calls.append(("get", url, headers))
        return self._responses.pop(0)

    async def close(self):
        self.closed = True


def _client(**kw):
    params = dict(base_url="http://localhost:11434", model="llama3.1:8b",
                  max_tokens=256, max_retries=1, retry_base_delay=0.0,
                  retry_max_delay=0.0)
    params.update(kw)
    return OllamaClient(**params)  # type: ignore[arg-type]  # test-helper kwargs merge


class TestHeaders:
    def test_without_and_with_api_key(self):
        assert "Authorization" not in _client()._headers()
        h = _client(api_key="sk-abc")._headers()
        assert h["Authorization"] == "Bearer sk-abc"
        assert h["Content-Type"] == "application/json"


class TestSessionLifecycle:
    async def test_get_session_creates_and_close(self):
        c = _client()
        session = await c._get_session()            # real ClientSession object, no network
        assert session is await c._get_session()    # reused while open
        assert c._session is not None
        await c.close()
        assert c._session is None                    # closed + cleared


class TestRequestWithRetry:
    async def test_success_first_try(self):
        c = _client()
        c._session = _FakeSession([_FakeResp(200, {"ok": 1})])  # type: ignore[assignment]
        assert await c._request_with_retry({"model": "x"}) == {"ok": 1}
        assert c._total_requests == 1

    async def test_retryable_then_success(self):
        c = _client(max_retries=2)
        c._session = _FakeSession([  # type: ignore[assignment]
            _FakeResp(503, text="busy"), _FakeResp(200, {"ok": 2})])
        with patch("src.llm.ollama.asyncio.sleep", new=AsyncMock()) as slept:
            assert await c._request_with_retry({}) == {"ok": 2}
        slept.assert_awaited()  # backed off before the retry

    async def test_retryable_exhausted_raises(self):
        c = _client(max_retries=1)
        c._session = _FakeSession([  # type: ignore[assignment]
            _FakeResp(500, text="boom"), _FakeResp(500, text="boom")])
        with patch("src.llm.ollama.asyncio.sleep", new=AsyncMock()):
            with pytest.raises(RuntimeError, match="500"):
                await c._request_with_retry({})

    async def test_non_retryable_status_raises(self):
        c = _client()
        c._session = _FakeSession([_FakeResp(400, text="bad request")])  # type: ignore[assignment]
        with pytest.raises(RuntimeError, match="400"):
            await c._request_with_retry({})

    async def test_client_error_then_success(self):
        c = _client(max_retries=2)
        c._session = _FakeSession([  # type: ignore[assignment]
            _FakeResp(raise_on_enter=aiohttp.ClientError("neterr")),
            _FakeResp(200, {"ok": 3})])
        with patch("src.llm.ollama.asyncio.sleep", new=AsyncMock()):
            assert await c._request_with_retry({}) == {"ok": 3}

    async def test_client_error_exhausted_raises(self):
        c = _client(max_retries=1)
        c._session = _FakeSession([  # type: ignore[assignment]
            _FakeResp(raise_on_enter=aiohttp.ClientError("neterr")),
            _FakeResp(raise_on_enter=aiohttp.ClientError("neterr"))])
        with patch("src.llm.ollama.asyncio.sleep", new=AsyncMock()):
            with pytest.raises(RuntimeError, match="connection error after"):
                await c._request_with_retry({})


class TestChatEndpoints:
    async def test_chat_returns_content(self):
        c = _client()
        c._session = _FakeSession([  # type: ignore[assignment]
            _FakeResp(200, {"message": {"content": "hello there"}})])
        assert await c.chat([{"role": "user", "content": "hi"}], "sys") == "hello there"
        # body carried the converted messages + num_predict override honoured
        _, url, body, _ = c._session.calls[0]  # type: ignore[union-attr]
        assert url.endswith("/api/chat") and body["stream"] is False

    async def test_chat_with_tools_parses_response(self):
        c = _client()
        c._session = _FakeSession([  # type: ignore[assignment]
            _FakeResp(200, {"message": {
                "content": "",
                "tool_calls": [{"function": {"name": "get_time", "arguments": {"tz": "utc"}}}],
            }})])
        resp = await c.chat_with_tools([{"role": "user", "content": "time?"}], "sys",
                                       [{"name": "get_time", "description": "d",
                                         "input_schema": {}}])
        assert isinstance(resp, LLMResponse)
        assert resp.stop_reason == "tool_use"
        assert resp.tool_calls[0].name == "get_time"

    async def test_chat_with_tools_ignores_reasoning_effort(self):
        """LLMProvider signature parity: accepted, never forwarded upstream."""
        c = _client()
        c._session = _FakeSession([  # type: ignore[assignment]
            _FakeResp(200, {"message": {"content": "ok"}})])
        resp = await c.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys",
            [{"name": "t", "description": "d", "input_schema": {}}],
            reasoning_effort="xhigh",
        )
        assert isinstance(resp, LLMResponse)
        _, _, body, _ = c._session.calls[0]  # type: ignore[union-attr]
        assert "reasoning" not in body and "reasoning_effort" not in body

    async def test_chat_with_tools_ignores_model_override(self):
        """Signature parity for the Codex-scoped model override: accepted and
        ignored — the pinned model goes upstream AND into the response
        provenance (an ignored override must never be reported as used)."""
        c = _client()
        c._session = _FakeSession([  # type: ignore[assignment]
            _FakeResp(200, {"message": {"content": "ok"}})])
        resp = await c.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys",
            [{"name": "t", "description": "d", "input_schema": {}}],
            model="gpt-5.6-luna",
        )
        assert isinstance(resp, LLMResponse)
        _, _, body, _ = c._session.calls[0]  # type: ignore[union-attr]
        assert body["model"] == c.model
        assert resp.provenance_model == body["model"] == c.model
        assert resp.provenance_provider == "ollama"
        assert resp.provenance_reasoning_effort is None


class TestHealthCheck:
    async def test_healthy_with_exact_model(self):
        c = _client(model="llama3.1:8b")
        c._session = _FakeSession([  # type: ignore[assignment]
            _FakeResp(200, {"models": [{"name": "llama3.1:8b"}]})])
        r = await c.health_check()
        assert r["healthy"] is True and r["model_available"] is True

    async def test_healthy_with_base_name_match(self):
        c = _client(model="llama3.1:8b")
        c._session = _FakeSession([  # type: ignore[assignment]
            _FakeResp(200, {"models": [{"name": "llama3.1:70b"}]})])
        r = await c.health_check()
        assert r["healthy"] is True and r["model_available"] is True  # base-name prefix match

    async def test_non_200_unhealthy(self):
        c = _client()
        c._session = _FakeSession([_FakeResp(500, text="down")])  # type: ignore[assignment]
        r = await c.health_check()
        assert r["healthy"] is False and "500" in r["error"]

    async def test_exception_unhealthy(self):
        c = _client()
        c._session = _FakeSession([  # type: ignore[assignment]
            _FakeResp(raise_on_enter=aiohttp.ClientError("refused"))])
        r = await c.health_check()
        assert r["healthy"] is False and "refused" in r["error"]
