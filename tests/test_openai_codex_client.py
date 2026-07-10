"""Coverage for CodexChatClient conversion + auth adapters (RFC-006 P2 ≥85%).

Targets the pure request/response converters (internal → Codex Responses API
format), token estimation, the tool-cache, and the CodexAuthPool-vs-bare-auth
adapter branches. Network streaming is exercised separately where cheap.
"""
from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from src.llm.openai_codex import CodexChatClient


class _BareAuth:
    """Minimal single-account auth (not a CodexAuthPool)."""

    def __init__(self):
        self.marked = False
        self.refreshed = False

    async def get_access_token(self):
        return "tok"

    def get_account_id(self):
        return "acct"

    def mark_rate_limited(self):
        self.marked = True

    async def mark_current_auth_failed(self):
        return False

    async def force_refresh(self, stale):
        self.refreshed = True
        return True


def _client(auth=None):
    return CodexChatClient(auth=auth or _BareAuth(), model="gpt-5.5", max_tokens=1000)


class TestConvertMessages:
    def test_plain_string_roles(self):
        c = _client()
        out = c._convert_messages([
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "yo"},
        ])
        assert out[0]["content"][0]["type"] == "input_text"
        assert out[1]["content"][0]["type"] == "output_text"

    def test_unknown_role_maps_to_user(self):
        out = _client()._convert_messages([{"role": "tool", "content": "x"}])
        assert out[0]["role"] == "user"

    def test_list_content_text_and_tool_blocks(self):
        out = _client()._convert_messages([{"role": "user", "content": [
            {"type": "text", "text": "hello"},
            {"type": "tool_use", "name": "grep"},
            {"type": "tool_result", "content": "found it"},
        ]}])
        joined = out[0]["content"][0]["text"]
        assert "hello" in joined and "[Used tool: grep]" in joined
        assert "[Tool result: found it]" in joined

    def test_tool_result_list_content_summarized(self):
        out = _client()._convert_messages([{"role": "user", "content": [
            {"type": "tool_result", "content": [{"type": "text", "text": "abc"}]},
        ]}])
        assert "[Tool result: abc]" in out[0]["content"][0]["text"]

    def test_image_block_builds_multimodal(self):
        out = _client()._convert_messages([{"role": "user", "content": [
            {"type": "text", "text": "look"},
            {"type": "image", "source": {"type": "base64", "media_type": "image/png",
                                         "data": "AAAA"}},
        ]}])
        types = [b["type"] for b in out[0]["content"]]
        assert "input_text" in types and "input_image" in types

    def test_empty_and_non_str_skipped(self):
        out = _client()._convert_messages([
            {"role": "user", "content": []},          # empty list → skip
            {"role": "user", "content": 12345},       # non-str/list → skip
            {"role": "user", "content": "kept"},
        ])
        assert len(out) == 1 and out[0]["content"][0]["text"] == "kept"


class TestConvertMessagesWithTools:
    def test_string_content(self):
        out = _client()._convert_messages_with_tools([{"role": "user", "content": "hi"}])
        assert out[0]["type"] == "message" and out[0]["content"][0]["type"] == "input_text"

    def test_tool_use_flushes_text_and_builds_function_call(self):
        out = _client()._convert_messages_with_tools([{"role": "assistant", "content": [
            {"type": "text", "text": "thinking"},
            {"type": "tool_use", "id": "call-1", "name": "grep", "input": {"q": "x"}},
        ]}])
        assert out[0]["type"] == "message"  # flushed text
        assert out[1]["type"] == "function_call" and out[1]["call_id"] == "call-1"
        assert json.loads(out[1]["arguments"]) == {"q": "x"}

    def test_tool_result_becomes_function_output(self):
        out = _client()._convert_messages_with_tools([{"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "call-1", "content": "done"},
        ]}])
        assert out[0]["type"] == "function_call_output"
        assert out[0]["call_id"] == "call-1" and out[0]["output"] == "done"

    def test_tool_result_list_and_nonstring_content(self):
        out = _client()._convert_messages_with_tools([{"role": "user", "content": [
            {"type": "tool_result", "content": [{"type": "text", "text": "a"},
                                                {"type": "text", "text": "b"}]},
        ]}])
        assert out[0]["output"] == "a b"
        out2 = _client()._convert_messages_with_tools([{"role": "user", "content": [
            {"type": "tool_result", "content": {"weird": 1}},
        ]}])
        assert "weird" in out2[0]["output"]

    def test_image_block(self):
        out = _client()._convert_messages_with_tools([{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "data": "ZZ"}},
        ]}])
        assert out[0]["content"][0]["type"] == "input_image"

    def test_non_dict_block_and_non_list_content_skipped(self):
        out = _client()._convert_messages_with_tools([
            {"role": "user", "content": ["not-a-dict-block"]},
            {"role": "user", "content": 999},
            {"role": "user", "content": ""},
        ])
        assert out == []


class TestToolsAndEstimation:
    def test_convert_tools_format(self):
        out = CodexChatClient._convert_tools([
            {"name": "grep", "description": "search", "input_schema": {"type": "object"}}])
        assert out[0] == {"type": "function", "name": "grep", "description": "search",
                          "parameters": {"type": "object"}}

    def test_convert_tools_defaults(self):
        out = CodexChatClient._convert_tools([{"name": "bare"}])
        assert out[0]["parameters"] == {"type": "object", "properties": {}}

    def test_convert_tools_cached_identity(self):
        c = _client()
        tools = [{"name": "t"}]
        first = c._convert_tools_cached(tools)
        assert c._convert_tools_cached(tools) is first  # cache hit, same object
        assert c._convert_tools_cached([{"name": "t"}]) is not first  # new list → reconvert

    def test_estimate_body_input_tokens(self):
        body = {"instructions": "sys", "input": [
            {"content": [{"text": "hello"}], "arguments": "args", "output": "out"}]}
        assert CodexChatClient._estimate_body_input_tokens(body) >= 1
        assert CodexChatClient._estimate_body_input_tokens({}) == 1


class TestMetadataAndHeaders:
    def test_provider_and_model(self):
        c = _client()
        assert c.provider_name == "codex" and c.model_name == "gpt-5.5"

    def test_auth_headers_with_and_without_account(self):
        h = CodexChatClient._auth_headers("t", "acct")
        assert h["Authorization"] == "Bearer t" and h["ChatGPT-Account-Id"] == "acct"
        assert "ChatGPT-Account-Id" not in CodexChatClient._auth_headers("t", None)

    def test_pool_metrics_no_session(self):
        m = _client().get_pool_metrics()
        assert m["http_pool_active_connections"] == 0
        assert m["http_pool_max_connections"] == 10
        assert _client().pool_stats()["http_pool_total_requests"] == 0

    @pytest.mark.asyncio
    async def test_close_without_session_is_safe(self):
        await _client().close()  # no session → no error


class _FakeContent:
    """Async byte-line iterator standing in for resp.content."""

    def __init__(self, lines):
        self._lines = [ln.encode() if isinstance(ln, str) else ln for ln in lines]

    def __aiter__(self):
        async def gen():
            for ln in self._lines:
                yield ln
        return gen()


class _FakeResp:
    def __init__(self, lines):
        self.content = _FakeContent(lines)


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}"


class TestReadStream:
    @pytest.mark.asyncio
    async def test_deltas_concatenated(self):
        resp = _FakeResp([
            _sse({"type": "response.output_text.delta", "delta": "hel"}),
            _sse({"type": "response.output_text.delta", "delta": "lo"}),
            "data: [DONE]",
        ])
        assert await _client()._read_stream(resp) == "hello"

    @pytest.mark.asyncio
    async def test_done_text_used_when_no_deltas(self):
        resp = _FakeResp([_sse({"type": "response.output_text.done", "text": "final"})])
        assert await _client()._read_stream(resp) == "final"

    @pytest.mark.asyncio
    async def test_completed_fallback_and_ignored_noise(self):
        resp = _FakeResp([
            "ignored non-data line",
            "data: not-json",
            _sse({"type": "response.completed", "response": {"output": [
                {"type": "message", "content": [{"text": "from-completed"}]}]}}),
        ])
        assert await _client()._read_stream(resp) == "from-completed"

    @pytest.mark.asyncio
    async def test_failed_event_raises(self):
        from src.llm.openai_codex import CodexStreamError
        resp = _FakeResp([_sse({"type": "response.failed", "error": "quota"})])
        with pytest.raises(CodexStreamError, match="response.failed"):
            await _client()._read_stream(resp)

    @pytest.mark.asyncio
    async def test_incomplete_returns_partial(self):
        resp = _FakeResp([
            _sse({"type": "response.output_text.delta", "delta": "partial"}),
            _sse({"type": "response.incomplete",
                  "response": {"incomplete_details": {"reason": "max_tokens"}}}),
        ])
        assert await _client()._read_stream(resp) == "partial"

    @pytest.mark.asyncio
    async def test_empty_stream_returns_empty(self):
        assert await _client()._read_stream(_FakeResp([])) == ""


class TestReadToolStream:
    @pytest.mark.asyncio
    async def test_streamed_function_call(self):
        resp = _FakeResp([
            _sse({"type": "response.output_item.added", "output_index": 0,
                  "item": {"type": "function_call", "call_id": "c1", "name": "grep"}}),
            _sse({"type": "response.function_call_arguments.delta",
                  "output_index": 0, "delta": '{"q":'}),
            _sse({"type": "response.function_call_arguments.delta",
                  "output_index": 0, "delta": '"x"}'}),
            _sse({"type": "response.function_call_arguments.done", "output_index": 0}),
        ])
        out = await _client()._read_tool_stream(resp)
        assert out.stop_reason == "tool_use"
        assert out.tool_calls[0].name == "grep" and out.tool_calls[0].input == {"q": "x"}

    @pytest.mark.asyncio
    async def test_text_only_is_end_turn(self):
        resp = _FakeResp([_sse({"type": "response.output_text.delta", "delta": "hi"})])
        out = await _client()._read_tool_stream(resp)
        assert out.text == "hi" and out.stop_reason == "end_turn"

    @pytest.mark.asyncio
    async def test_malformed_args_flagged(self):
        resp = _FakeResp([
            _sse({"type": "response.output_item.added", "output_index": 0,
                  "item": {"type": "function_call", "call_id": "c1", "name": "grep"}}),
            _sse({"type": "response.function_call_arguments.delta",
                  "output_index": 0, "delta": "{not json"}),
            _sse({"type": "response.function_call_arguments.done", "output_index": 0}),
        ])
        out = await _client()._read_tool_stream(resp)
        assert out.tool_calls[0].parse_error and "malformed" in out.tool_calls[0].parse_error

    @pytest.mark.asyncio
    async def test_output_item_done_finalizes_unstreamed_call(self):
        resp = _FakeResp([
            _sse({"type": "response.output_item.added", "output_index": 0,
                  "item": {"type": "function_call", "call_id": "c2", "name": "ls"}}),
            _sse({"type": "response.output_item.done", "output_index": 0,
                  "item": {"type": "function_call", "arguments": '{"path":"/"}'}}),
        ])
        out = await _client()._read_tool_stream(resp)
        assert out.tool_calls[0].id == "c2" and out.tool_calls[0].input == {"path": "/"}

    @pytest.mark.asyncio
    async def test_completed_fallback_function_call(self):
        resp = _FakeResp([
            _sse({"type": "response.completed", "response": {"output": [
                {"type": "function_call", "call_id": "c3", "name": "cat",
                 "arguments": '{"f":"x"}'}]}}),
        ])
        out = await _client()._read_tool_stream(resp)
        assert out.tool_calls[0].id == "c3" and out.tool_calls[0].name == "cat"

    @pytest.mark.asyncio
    async def test_tool_stream_failed_raises(self):
        from src.llm.openai_codex import CodexStreamError
        resp = _FakeResp([_sse({"type": "error", "message": "boom"})])
        with pytest.raises(CodexStreamError):
            await _client()._read_tool_stream(resp)

    @pytest.mark.asyncio
    async def test_tool_stream_incomplete_reason(self):
        resp = _FakeResp([
            _sse({"type": "response.output_text.delta", "delta": "part"}),
            _sse({"type": "response.incomplete", "response": {}}),
        ])
        out = await _client()._read_tool_stream(resp)
        assert out.stop_reason == "incomplete" and out.text == "part"


class TestAuthAdapters:
    @pytest.mark.asyncio
    async def test_bare_auth_adapters(self):
        auth = _BareAuth()
        c = _client(auth)
        assert await c._acquire_auth() == ("tok", "acct", 0)
        assert await c._token_for(0) == ("tok", "acct")
        await c._mark_limited(0)
        assert auth.marked
        assert await c._mark_auth_failed(0) is False
        assert await c._force_refresh(0, "stale") is True and auth.refreshed

    @pytest.mark.asyncio
    async def test_pool_auth_adapters(self, tmp_path):
        from src.llm.codex_auth import CodexAuthPool

        p = tmp_path / "c.json"
        p.write_text(json.dumps([
            {"access_token": "a0", "refresh_token": "r", "expires_at": 9_999_999_999,
             "account_id": "0"},
            {"access_token": "a1", "refresh_token": "r", "expires_at": 9_999_999_999,
             "account_id": "1"},
        ]))
        c = _client(CodexAuthPool(str(p)))
        token, acct, idx = await c._acquire_auth()
        assert token == "a0" and idx == 0
        tok1, _ = await c._token_for(1)
        assert tok1 == "a1"
        await c._mark_limited(0)  # marks account 0
        assert await c._mark_auth_failed(1) is True  # rotate off, other available


class TestReasoningEffortBody:
    """The reasoning field is sent iff reasoning_effort is set — None (the
    auxiliary-client default) must omit it so untested models never see it."""

    @staticmethod
    def _capture_chat(client):
        captured = {}

        async def fake_stream(body):
            captured.update(body)
            return "ok"

        client._stream_request = fake_stream
        return captured

    @staticmethod
    def _capture_tools(client):
        from types import SimpleNamespace
        captured = {}

        async def fake_stream(body):
            captured.update(body)
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end")

        client._stream_tool_request = fake_stream
        return captured

    async def test_chat_includes_reasoning_when_set(self):
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5",
                                 max_tokens=1000, reasoning_effort="high")
        captured = self._capture_chat(client)
        await client.chat([{"role": "user", "content": "hi"}], "sys")
        assert captured["reasoning"] == {"effort": "high"}

    async def test_chat_omits_reasoning_when_unset(self):
        client = _client()
        captured = self._capture_chat(client)
        await client.chat([{"role": "user", "content": "hi"}], "sys")
        assert "reasoning" not in captured

    async def test_chat_with_tools_includes_reasoning_when_set(self):
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5",
                                 max_tokens=1000, reasoning_effort="xhigh")
        captured = self._capture_tools(client)
        tools = [{"name": "t", "description": "d",
                  "input_schema": {"type": "object", "properties": {}}}]
        await client.chat_with_tools([{"role": "user", "content": "hi"}], "sys", tools)
        assert captured["reasoning"] == {"effort": "xhigh"}

    async def test_chat_with_tools_omits_reasoning_when_unset(self):
        client = _client()
        captured = self._capture_tools(client)
        tools = [{"name": "t", "description": "d",
                  "input_schema": {"type": "object", "properties": {}}}]
        await client.chat_with_tools([{"role": "user", "content": "hi"}], "sys", tools)
        assert "reasoning" not in captured


class TestPerCallReasoningOverride:
    """chat_with_tools(reasoning_effort=...) overrides the configured effort
    for that single request WITHOUT mutating client state — a temporary
    self-assignment would race concurrent chat and agent calls."""

    _TOOLS = [{"name": "t", "description": "d",
               "input_schema": {"type": "object", "properties": {}}}]

    @staticmethod
    def _capture_tools_list(client):
        from types import SimpleNamespace
        bodies = []

        async def fake_stream(body):
            bodies.append(body)
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end")

        client._stream_tool_request = fake_stream
        return bodies

    async def test_override_wins_and_client_untouched(self):
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5",
                                 max_tokens=1000, reasoning_effort="medium")
        bodies = self._capture_tools_list(client)
        await client.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS,
            reasoning_effort="xhigh",
        )
        assert bodies[0]["reasoning"] == {"effort": "xhigh"}
        assert client.reasoning_effort == "medium"

    async def test_none_inherits_configured(self):
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5",
                                 max_tokens=1000, reasoning_effort="high")
        bodies = self._capture_tools_list(client)
        await client.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS,
            reasoning_effort=None,
        )
        assert bodies[0]["reasoning"] == {"effort": "high"}

    async def test_literal_none_string_is_an_effort(self):
        """The string "none" is a real effort level, not inherit."""
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5",
                                 max_tokens=1000, reasoning_effort="high")
        bodies = self._capture_tools_list(client)
        await client.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS,
            reasoning_effort="none",
        )
        assert bodies[0]["reasoning"] == {"effort": "none"}

    async def test_override_on_unset_client(self):
        client = _client()  # no configured effort
        bodies = self._capture_tools_list(client)
        await client.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS,
            reasoning_effort="low",
        )
        assert bodies[0]["reasoning"] == {"effort": "low"}

    async def test_concurrent_calls_do_not_leak_efforts(self):
        import asyncio
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5",
                                 max_tokens=1000, reasoning_effort="medium")
        bodies = self._capture_tools_list(client)
        msgs = [{"role": "user", "content": "hi"}]
        await asyncio.gather(
            client.chat_with_tools(msgs, "sys", self._TOOLS, reasoning_effort="xhigh"),
            client.chat_with_tools(msgs, "sys", self._TOOLS),
            client.chat_with_tools(msgs, "sys", self._TOOLS, reasoning_effort="low"),
        )
        efforts = sorted(b["reasoning"]["effort"] for b in bodies)
        assert efforts == ["low", "medium", "xhigh"]
        assert client.reasoning_effort == "medium"


class TestTransportTimeouts:
    def test_ctor_defaults(self):
        client = _client()
        assert client.request_timeout == 3600
        assert client.stream_stall_timeout == 180

    async def test_post_receives_configured_timeouts(self, monkeypatch):
        """The per-request ClientTimeout must be built from the configured
        values with NO fixed total cap: the old hardcoded total=600 killed
        healthy long reasoning streams at exactly 10 minutes, while a dead
        stream waited out the full window instead of failing on the first
        silent stretch (sock_read)."""
        client = CodexChatClient(auth=_BareAuth(), model="m", max_tokens=10,
                                 request_timeout=1234, stream_stall_timeout=56)
        recorded = {}

        class _CM:
            async def __aenter__(self):
                return SimpleNamespace(status=200)

            async def __aexit__(self, *exc):
                return False

        class _Sess:
            closed = False

            def post(self, url, **kwargs):
                recorded.update(kwargs)
                return _CM()

        async def _fake_session():
            return _Sess()

        monkeypatch.setattr(client, "_get_session", _fake_session)

        async def _reader(resp):
            return "ok"

        result = await client._send_with_retries({}, _reader, lambda r: not r)
        assert result == "ok"
        t = recorded["timeout"]
        assert t.total == 1234
        assert t.sock_read == 56
        assert t.sock_connect == 30
