"""Coverage for src/llm/kimi.py (RFC-006 P8).

KimiClient's message/schema/tool/response conversion is pure logic tested
directly; the HTTP request/retry/chat/health paths use a fake aiohttp session
(no network) with asyncio.sleep patched so retry backoff is instant.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from src.llm.kimi import KimiClient


def _client(model="kimi-k2", max_retries=1):
    return KimiClient(api_key="test-key", model=model, max_retries=max_retries)


class _Resp:
    def __init__(self, status=200, json_data=None, text="", headers=None):
        self.status = status
        self._json = json_data if json_data is not None else {}
        self._text = text
        self.headers = headers or {}

    async def json(self):
        return self._json

    async def text(self):
        return self._text

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _Session:
    def __init__(self, *resps):
        self._resps = list(resps)
        self.closed = False

    def post(self, *a, **k):
        return self._resps.pop(0)

    def get(self, *a, **k):
        return self._resps.pop(0)

    async def close(self):
        self.closed = True


def _with_session(client, *resps):
    client._get_session = AsyncMock(return_value=_Session(*resps))


# --------------------------------------------------------------------------- #
# pure metadata
# --------------------------------------------------------------------------- #
class TestMetadata:
    def test_headers_and_stats(self):
        c = _client()
        assert c._headers()["Authorization"] == "Bearer test-key"
        assert c.provider_name == "kimi" and c.model_name == "kimi-k2"
        stats = c.pool_stats()
        assert stats["provider"] == "kimi" and stats["model"] == "kimi-k2"

    def test_resolve_temperature(self):
        assert _client(model="kimi-k2.6")._resolve_temperature(0.2) == 1.0  # k2.6 pinned
        c = _client(model="kimi-k2")
        assert c._resolve_temperature(None) == 0.6
        assert c._resolve_temperature(5.0) == 1.0 and c._resolve_temperature(-1.0) == 0.0


class TestConvertMessages:
    def test_system_and_simple(self):
        msgs = _client()._convert_messages([{"role": "user", "content": "hi"}], "SYS")
        assert msgs[0] == {"role": "system", "content": "SYS"}
        assert msgs[1] == {"role": "user", "content": "hi"}

    def test_tool_result_role(self):
        out = _client()._convert_messages(
            [{"role": "tool_result", "tool_use_id": "t1", "content": {"k": "v"}}], "")
        assert out[0]["role"] == "tool" and out[0]["tool_call_id"] == "t1"
        assert json.loads(out[0]["content"]) == {"k": "v"}

    def test_list_content_blocks(self):
        content = [
            {"type": "text", "text": "thinking"},
            {"type": "tool_use", "id": "u1", "name": "grep", "input": {"q": "x"}},
            {"type": "tool_result", "tool_use_id": "u1", "content": "result data"},
            "trailing string",
        ]
        out = _client()._convert_messages([{"role": "assistant", "content": content}], "")
        assistant = out[0]
        assert assistant["role"] == "assistant" and "thinking" in assistant["content"]
        assert assistant["tool_calls"][0]["function"]["name"] == "grep"
        # the tool_result block becomes its own tool message
        assert any(m.get("role") == "tool" and m.get("content") == "result data" for m in out)

    def test_developer_and_assistant_toolcalls(self):
        out = _client()._convert_messages([
            {"role": "developer", "content": "note"},
            {"role": "assistant", "content": "done", "tool_calls": [{"id": "x"}]},
        ], "")
        assert out[0]["role"] == "system"
        assert out[1]["reasoning_content"] == ""

    def test_tool_use_only_no_text(self):
        # assistant block with only a tool_use (no text) → content defaults to ""
        content = [{"type": "tool_use", "id": "u1", "name": "grep", "input": {}}]
        out = _client()._convert_messages([{"role": "assistant", "content": content}], "")
        assert out[0]["content"] == "" and out[0]["tool_calls"]


class TestSchemaAndTools:
    def test_sanitize_strips_and_defaults(self):
        schema = {"type": "object", "title": "T", "$ref": "#/x",
                  "properties": {"a": {"type": "string", "format": "email"}},
                  "items": [{"type": "integer", "$comment": "c"}]}
        clean = _client()._sanitize_schema(schema)
        assert "title" not in clean and "$ref" not in clean
        assert "format" not in clean["properties"]["a"]
        assert clean["items"][0] == {"type": "integer"}
        assert clean["required"] == []  # object default added

    def test_convert_tools(self):
        tools = [
            {"name": "grep", "description": "search",
             "input_schema": {"type": "object", "properties": {}}},
            {"name": "bare"},  # no schema → default object schema
        ]
        out = _client()._convert_tools(tools)
        assert out[0]["function"]["name"] == "grep"
        assert out[1]["function"]["parameters"]["type"] == "object"
        assert out[1]["function"]["description"] == "bare"  # falls back to name

    def test_convert_tools_params_without_type(self):
        # a schema dict with no "type" gets object + defaults backfilled
        tools = [{"name": "t", "input_schema": {"properties": {"a": {"type": "string"}}}}]
        out = _client()._convert_tools(tools)
        assert out[0]["function"]["parameters"]["type"] == "object"
        assert out[0]["function"]["parameters"]["required"] == []


class TestParseResponse:
    def test_empty(self):
        r = _client()._parse_response({})
        assert r.text == "" and r.tool_calls == []

    def test_text_and_tools(self):
        data = {"choices": [{"finish_reason": "tool_calls", "message": {
            "content": "answer",
            "tool_calls": [
                {"id": "c1", "function": {"name": "grep", "arguments": '{"q":"x"}'}},
                {"function": {"name": "bad", "arguments": "not json"}},  # → {"raw": ...}
            ],
        }}], "usage": {"prompt_tokens": 10, "completion_tokens": 5}}
        r = _client()._parse_response(data)
        assert r.text == "answer" and r.stop_reason == "tool_use"
        assert r.tool_calls[0].input == {"q": "x"}
        assert r.tool_calls[1].input == {"raw": "not json"}
        assert r.input_tokens == 10 and r.output_tokens == 5

    def test_tool_args_already_dict(self):
        data = {"choices": [{"finish_reason": "stop", "message": {
            "content": "", "tool_calls": [
                {"id": "c", "function": {"name": "g", "arguments": {"q": "x"}}}]}}]}
        r = _client()._parse_response(data)
        assert r.tool_calls[0].input == {"q": "x"} and r.stop_reason == "tool_use"


# --------------------------------------------------------------------------- #
# HTTP paths (fake session, instant backoff)
# --------------------------------------------------------------------------- #
class TestRequestRetry:
    async def test_success(self):
        c = _client()
        _with_session(c, _Resp(200, {"ok": True}))
        assert await c._request_with_retry({}) == {"ok": True}

    async def test_429_then_success(self):
        c = _client(max_retries=2)
        _with_session(c, _Resp(429, text="slow down", headers={"Retry-After": "0"}),
                      _Resp(200, {"ok": 1}))
        with patch("asyncio.sleep", new=AsyncMock()):
            assert await c._request_with_retry({}) == {"ok": 1}

    async def test_429_exhausted(self):
        c = _client(max_retries=0)
        _with_session(c, _Resp(429, text="limited"))
        with patch("asyncio.sleep", new=AsyncMock()):
            with pytest.raises(RuntimeError, match="rate limited"):
                await c._request_with_retry({})

    async def test_5xx_retry_then_error(self):
        c = _client(max_retries=1)
        _with_session(c, _Resp(503, text="down"), _Resp(500, text="still down"))
        with patch("asyncio.sleep", new=AsyncMock()):
            with pytest.raises(RuntimeError, match="Kimi 500"):
                await c._request_with_retry({})

    async def test_other_status_raises(self):
        c = _client()
        _with_session(c, _Resp(400, text="bad request"))
        with pytest.raises(RuntimeError, match="Kimi 400"):
            await c._request_with_retry({})

    async def test_429_bad_retry_after_uses_backoff(self):
        c = _client(max_retries=1)
        _with_session(c, _Resp(429, text="slow", headers={"Retry-After": "notanumber"}),
                      _Resp(200, {"ok": 1}))
        with patch("asyncio.sleep", new=AsyncMock()):
            assert await c._request_with_retry({}) == {"ok": 1}  # bad header → computed backoff

    async def test_connection_error_retry_then_raise(self):
        import aiohttp
        c = _client(max_retries=1)
        session = AsyncMock()
        session.post = lambda *a, **k: (_ for _ in ()).throw(aiohttp.ClientError("conn"))
        c._get_session = AsyncMock(return_value=session)
        with patch("asyncio.sleep", new=AsyncMock()):
            with pytest.raises(RuntimeError, match="connection error"):
                await c._request_with_retry({})


class TestChatAndHealth:
    async def test_chat(self):
        c = _client()
        _with_session(c, _Resp(200, {"choices": [{"message": {"content": "hello"}}]}))
        assert await c.chat([{"role": "user", "content": "hi"}], "sys") == "hello"

    async def test_chat_no_choices(self):
        c = _client()
        _with_session(c, _Resp(200, {"choices": []}))
        assert await c.chat([], "") == ""

    async def test_chat_with_tools(self):
        c = _client()
        _with_session(c, _Resp(200, {"choices": [{"finish_reason": "stop",
                                                  "message": {"content": "answer"}}]}))
        r = await c.chat_with_tools([{"role": "user", "content": "q"}], "sys",
                                    [{"name": "grep"}])
        assert r.text == "answer"

    async def test_chat_with_tools_ignores_reasoning_effort(self):
        """LLMProvider signature parity: the kwarg is accepted and ignored."""
        c = _client()
        _with_session(c, _Resp(200, {"choices": [{"finish_reason": "stop",
                                                  "message": {"content": "answer"}}]}))
        r = await c.chat_with_tools([{"role": "user", "content": "q"}], "sys",
                                    [{"name": "grep"}], reasoning_effort="xhigh")
        assert r.text == "answer"

    async def test_chat_with_tools_ignores_model_override(self):
        """Signature parity: the Codex-scoped model override is accepted and
        ignored."""
        c = _client()
        _with_session(c, _Resp(200, {"choices": [{"finish_reason": "stop",
                                                  "message": {"content": "answer"}}]}))
        r = await c.chat_with_tools([{"role": "user", "content": "q"}], "sys",
                                    [{"name": "grep"}], model="gpt-5.6-luna")
        assert r.text == "answer"

    async def test_chat_with_tools_tokenization_error(self):
        c = _client()
        c._request_with_retry = AsyncMock(side_effect=RuntimeError("tokenization failed"))
        with pytest.raises(RuntimeError, match="tokenization"):
            await c.chat_with_tools([], "sys", [{"name": "g"}])

    async def test_get_session_creates_and_reuses(self):
        c = _client()
        s1 = await c._get_session()
        assert s1 is await c._get_session()  # reused while open
        await c.close()

    async def test_health_check_exception(self):
        c = _client()
        session = AsyncMock()
        session.get = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))
        c._get_session = AsyncMock(return_value=session)
        assert (await c.health_check())["healthy"] is False

    async def test_health_check(self):
        c = _client(model="kimi-k2")
        _with_session(c, _Resp(200, {"data": [{"id": "kimi-k2"}, {"id": "other"}]}))
        h = await c.health_check()
        assert h["healthy"] is True and h["model_available"] is True
        _with_session(c, _Resp(401))
        assert (await c.health_check())["error"] == "Invalid API key"
        _with_session(c, _Resp(500))
        assert "HTTP 500" in (await c.health_check())["error"]

    async def test_close(self):
        c = _client()
        session = _Session()
        c._session = session
        await c.close()
        assert session.closed and c._session is None
