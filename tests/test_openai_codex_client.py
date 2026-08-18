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
    return CodexChatClient(auth=auth or _BareAuth(), model="gpt-5.5")


class TestEligibleAccountKeys:
    def test_bare_auth_key_snapshot(self, monkeypatch):
        monkeypatch.setattr(
            "src.llm.account_key.opaque_account_key", lambda account_id: f"key-{account_id}"
        )
        assert _client().eligible_account_keys_snapshot() == frozenset({"key-acct"})

    def test_key_derivation_failure_is_conservative(self, monkeypatch):
        monkeypatch.setattr(
            "src.llm.account_key.opaque_account_key", lambda _account_id: None
        )
        assert _client().eligible_account_keys_snapshot() == frozenset()


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
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5", reasoning_effort="high")
        captured = self._capture_chat(client)
        await client.chat([{"role": "user", "content": "hi"}], "sys")
        assert captured["reasoning"] == {"effort": "high"}

    async def test_chat_omits_reasoning_when_unset(self):
        client = _client()
        captured = self._capture_chat(client)
        await client.chat([{"role": "user", "content": "hi"}], "sys")
        assert "reasoning" not in captured

    async def test_chat_with_tools_includes_reasoning_when_set(self):
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5", reasoning_effort="xhigh")
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
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5", reasoning_effort="medium")
        bodies = self._capture_tools_list(client)
        await client.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS,
            reasoning_effort="xhigh",
        )
        assert bodies[0]["reasoning"] == {"effort": "xhigh"}
        assert client.reasoning_effort == "medium"

    async def test_none_inherits_configured(self):
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5", reasoning_effort="high")
        bodies = self._capture_tools_list(client)
        await client.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS,
            reasoning_effort=None,
        )
        assert bodies[0]["reasoning"] == {"effort": "high"}

    async def test_literal_none_string_is_an_effort(self):
        """The string "none" is a real effort level, not inherit."""
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5", reasoning_effort="high")
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
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5", reasoning_effort="medium")
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


class TestPerCallModelOverride:
    """chat_with_tools(model=...) overrides the configured model for that
    single request WITHOUT mutating client state — same locality rule as the
    reasoning override (concurrent chat and agent calls share self)."""

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
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.6-sol", reasoning_effort="medium")
        bodies = self._capture_tools_list(client)
        resp = await client.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS,
            model="gpt-5.6-luna",
        )
        assert bodies[0]["model"] == "gpt-5.6-luna"
        assert client.model == "gpt-5.6-sol"
        # provenance echoes the exact body values
        assert resp.provenance_model == "gpt-5.6-luna" == bodies[0]["model"]
        assert resp.provenance_provider == "codex"

    async def test_none_and_empty_inherit_configured(self):
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.6-sol", reasoning_effort="medium")
        bodies = self._capture_tools_list(client)
        r1 = await client.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS,
            model=None,
        )
        r2 = await client.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS,
            model="",
        )
        assert bodies[0]["model"] == "gpt-5.6-sol"
        assert bodies[1]["model"] == "gpt-5.6-sol"
        assert r1.provenance_model == r2.provenance_model == "gpt-5.6-sol"

    async def test_concurrent_calls_do_not_leak_models(self):
        import asyncio
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.6-sol", reasoning_effort="medium")
        bodies = self._capture_tools_list(client)
        msgs = [{"role": "user", "content": "hi"}]
        await asyncio.gather(
            client.chat_with_tools(msgs, "sys", self._TOOLS, model="gpt-5.6-luna"),
            client.chat_with_tools(msgs, "sys", self._TOOLS),
            client.chat_with_tools(msgs, "sys", self._TOOLS, model="gpt-5.5"),
        )
        models = sorted(b["model"] for b in bodies)
        assert models == ["gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol"]
        assert client.model == "gpt-5.6-sol"


class TestResponseProvenance:
    """chat_with_tools stamps execution provenance from the SAME pre-await
    locals the request body was built from — the response is the single
    truthful record of what was actually sent (survives routing/retries/
    live reloads that make any call-site snapshot a guess)."""

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

    async def test_inherited_paths_match_body(self):
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.6-sol", reasoning_effort="medium")
        bodies = self._capture_tools_list(client)
        resp = await client.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS)
        assert resp.provenance_provider == "codex"
        assert resp.provenance_model == bodies[0]["model"] == "gpt-5.6-sol"
        assert resp.provenance_reasoning_effort == "medium"
        assert bodies[0]["reasoning"] == {"effort": "medium"}

    async def test_overridden_paths_match_body(self):
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.6-sol", reasoning_effort="medium")
        bodies = self._capture_tools_list(client)
        resp = await client.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS,
            model="gpt-5.6-luna", reasoning_effort="xhigh")
        assert resp.provenance_model == bodies[0]["model"] == "gpt-5.6-luna"
        assert resp.provenance_reasoning_effort == "xhigh"
        assert bodies[0]["reasoning"] == {"effort": "xhigh"}

    async def test_effort_none_string_vs_not_sent(self):
        """The literal effort "none" is recorded as sent; a client with no
        configured effort records None (nothing was serialized)."""
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5", reasoning_effort="medium")
        bodies = self._capture_tools_list(client)
        resp = await client.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS,
            reasoning_effort="none")
        assert resp.provenance_reasoning_effort == "none"
        assert bodies[0]["reasoning"] == {"effort": "none"}

        bare = _client()  # no configured effort
        bodies2 = self._capture_tools_list(bare)
        resp2 = await bare.chat_with_tools(
            [{"role": "user", "content": "hi"}], "sys", self._TOOLS)
        assert resp2.provenance_reasoning_effort is None
        assert "reasoning" not in bodies2[0]


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
        client = CodexChatClient(auth=_BareAuth(), model="m",
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


class TestKnownBadPairGuard:
    """Request-construction boundary (4 of 4): a KNOWN-incompatible
    model/effort pair raises LLMRequestError with NO HTTP attempt — the retry
    engine, account rotation, and capacity breaker never see a request that
    was never sent. This is the only boundary that can catch live-config
    drift: an agent holding a fixed model override while its non-overridden
    effort tracks live config (or vice versa)."""

    _TOOLS = [{"name": "t", "description": "d",
               "input_schema": {"type": "object", "properties": {}}}]
    _MSGS = [{"role": "user", "content": "hi"}]

    @staticmethod
    def _arm_transport(client):
        """Record any transport call — the guard must fire before either."""
        calls = []

        async def fake_chat_stream(body):
            calls.append(("chat", body))
            return "ok"

        async def fake_tool_stream(body):
            calls.append(("tools", body))
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end")

        client._stream_request = fake_chat_stream
        client._stream_tool_request = fake_tool_stream
        return calls

    async def test_chat_rejects_before_transport(self):
        from src.llm.errors import LLMRequestError
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5", reasoning_effort="max")
        calls = self._arm_transport(client)
        with pytest.raises(LLMRequestError) as ei:
            await client.chat(self._MSGS, "sys")
        assert "gpt-5.5" in str(ei.value) and "'max'" in str(ei.value)
        assert "allowed for this model" in str(ei.value)
        assert calls == []

    async def test_chat_with_tools_rejects_before_transport(self):
        from src.llm.errors import LLMRequestError
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5", reasoning_effort="max")
        calls = self._arm_transport(client)
        with pytest.raises(LLMRequestError):
            await client.chat_with_tools(self._MSGS, "sys", self._TOOLS)
        assert calls == []

    async def test_per_call_override_pair_rejected(self):
        # A healthy sol@medium client asked for (gpt-5.5, max) for ONE call —
        # the drift shape the earlier boundaries cannot see.
        from src.llm.errors import LLMRequestError
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.6-sol", reasoning_effort="medium")
        calls = self._arm_transport(client)
        with pytest.raises(LLMRequestError):
            await client.chat_with_tools(
                self._MSGS, "sys", self._TOOLS,
                model="gpt-5.5", reasoning_effort="max")
        assert calls == []
        # client state untouched; the next healthy call proceeds normally
        resp = await client.chat_with_tools(self._MSGS, "sys", self._TOOLS)
        assert resp.text == "ok"
        assert calls and calls[0][1]["model"] == "gpt-5.6-sol"

    async def test_override_effort_onto_bad_configured_model_rejected(self):
        # Configured gpt-5.5 client + per-call effort=max only.
        from src.llm.errors import LLMRequestError
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.5", reasoning_effort="medium")
        calls = self._arm_transport(client)
        with pytest.raises(LLMRequestError):
            await client.chat_with_tools(
                self._MSGS, "sys", self._TOOLS, reasoning_effort="max")
        assert calls == []

    async def test_unknown_model_with_max_passes_through(self):
        # The server stays the authority for models the map doesn't know.
        client = CodexChatClient(auth=_BareAuth(), model="gpt-7-future", reasoning_effort="max")
        calls = self._arm_transport(client)
        await client.chat(self._MSGS, "sys")
        assert calls[0][1]["reasoning"] == {"effort": "max"}

    async def test_max_serializes_on_capable_model_both_paths(self):
        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.6-sol", reasoning_effort="max")
        calls = self._arm_transport(client)
        await client.chat(self._MSGS, "sys")
        resp = await client.chat_with_tools(self._MSGS, "sys", self._TOOLS)
        assert calls[0][1]["reasoning"] == {"effort": "max"}
        assert calls[1][1]["reasoning"] == {"effort": "max"}
        # provenance carries the effort that was actually requested
        assert resp.provenance_reasoning_effort == "max"
