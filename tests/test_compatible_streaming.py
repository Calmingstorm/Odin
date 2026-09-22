"""Streaming is atomic to callers, including reasoning-only tool turns."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import aiohttp
import pytest

from src.llm.errors import LLMRequestError, LLMTransportError
from src.llm.openai_compatible import CompatibleStreamError, OpenAICompatibleClient


def event(delta=None, *, finish=None, **fields):
    return {"choices": [{"index": 0, "delta": delta or {}, "finish_reason": finish}], **fields}


def sse(events, *, done=True, space=True):
    prefix = "data: " if space else "data:"
    wire = ": keepalive\r\n\r\n" + "".join(
        prefix + json.dumps(e, ensure_ascii=False) + "\r\n\r\n" for e in events
    )
    return (wire + (prefix + "[DONE]\r\n\r\n" if done else "")).encode()


class Content:
    def __init__(self, wire, fragment=13, failure=None):
        self.wire, self.fragment, self.failure = wire, fragment, failure

    async def iter_any(self):
        for i in range(0, len(self.wire), self.fragment):
            yield self.wire[i:i + self.fragment]
        if self.failure:
            raise self.failure


class Response:
    status = 200

    def __init__(self, wire, *, content_type="text/event-stream", failure=None):
        self.headers = {"Content-Type": content_type}
        self.content = Content(wire, failure=failure)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None


def install(client, responses):
    sent = []
    responses = iter(responses)

    def post(url, **kwargs):
        sent.append(kwargs)
        return next(responses)

    client._get_session = AsyncMock(return_value=SimpleNamespace(post=post))
    return sent


@pytest.mark.parametrize("space", [True, False])
async def test_fragmented_interleaved_tools_reasoning_usage_and_provenance(space):
    client = OpenAICompatibleClient(
        "test", "requested", provider_name="compat", reasoning_dialect="glm_thinking",
        glm_clear_thinking=False, reasoning_content_feedback_policy="preserve",
    )
    events = [event({"reasoning": f"reason-{i};"}) for i in range(40)]
    events += [
        event({"tool_calls": [
            {"index": 1, "id": "call_", "function": {"name": "sec", "arguments": '{"b":'}},
            {"index": 0, "id": "ca", "function": {"name": "fir", "arguments": '{"a":'}},
        ]}, model="served", provider="upstream"),
        event({"tool_calls": [
            {"index": 0, "id": "ll_zero", "function": {"name": "st", "arguments": '"é"}'}},
            {"index": 1, "id": "one", "function": {"name": "ond", "arguments": "2}"}},
        ]}),
        event(finish="tool_calls"),
        {"choices": [], "usage": {
            "prompt_tokens": 100, "completion_tokens": 81, "cost": .002,
            "prompt_tokens_details": {"cached_tokens": 80, "cache_write_tokens": 5},
            "completion_tokens_details": {"reasoning_tokens": 70},
        }},
    ]
    sent = install(client, [Response(sse(events, space=space))])
    progress = []
    response = await client.chat_with_tools([], "", [], progress_observer=progress.append)
    assert response.text == ""
    assert response.reasoning_content == "".join(f"reason-{i};" for i in range(40))
    assert [(tc.id, tc.name, tc.input) for tc in response.tool_calls] == [
        ("call_zero", "first", {"a": "é"}), ("call_one", "second", {"b": 2}),
    ]
    assert response.stop_reason == "tool_use"
    assert response.provenance_model == "served"
    assert response.provenance_upstream_provider == "upstream"
    assert (response.server_input_tokens, response.server_output_tokens) == (100, 81)
    assert (response.cached_tokens, response.cache_write_tokens) == (80, 5)
    assert response.actual_cost_usd == .002 and response.reasoning_tokens == 70
    assert sent[0]["json"]["stream"] is True
    assert sent[0]["json"]["stream_options"] == {"include_usage": True}
    assert sent[0]["timeout"].total == 3600
    assert sent[0]["timeout"].sock_read == 180
    assert sent[0]["timeout"].sock_connect == 30
    assert sum(e.kind == "substantive" for e in progress) == 42
    assert all(not hasattr(e, "text") for e in progress)


async def test_chat_and_tools_share_transport_without_observer_and_reasoning_is_private():
    client = OpenAICompatibleClient("test", "model")
    data = sse([event({"reasoning": "private", "content": "hello"}), event(finish="stop")])
    sent = install(client, [Response(data), Response(data)])
    assert await client.chat([], "") == "hello"
    response = await client.chat_with_tools([], "", [])
    assert response.text == "hello" and response.reasoning_content is None
    assert all(request["json"]["stream_options"] == {"include_usage": True} for request in sent)


@pytest.mark.parametrize("tail", [
    [], [event(finish="stop")], [{"error": "malformed"}],
    [{"error": {"message": "private error"}}], [event(finish="error")],
])
async def test_partial_responses_never_settle_without_successful_terminal(tail):
    client = OpenAICompatibleClient("test", "model", max_retries=0)
    partial = event({"content": "private partial", "tool_calls": [
        {"index": 0, "function": {"name": "x", "arguments": '{"a":'}}
    ]})
    install(client, [Response(sse([partial, *tail], done=False))])
    with pytest.raises(LLMTransportError) as error:
        await client.chat_with_tools([], "", [])
    assert "private" not in str(error.value)
    assert "discarded_text_chars=15" in str(error.value)
    assert "discarded_tool_argument_chars=5" in str(error.value)


@pytest.mark.parametrize("failure", [TimeoutError(), aiohttp.ClientPayloadError()])
async def test_connection_loss_discards_and_retries_with_counts_only(failure, caplog):
    client = OpenAICompatibleClient("test", "model", max_retries=1, retry_base_delay=0)
    install(client, [
        Response(sse([event({"content": "secretpartial"})], done=False), failure=failure),
        Response(sse([event({"content": "accepted"}), event(finish="stop")])),
    ])
    seen = []
    response = await client.chat_with_tools([], "", [], progress_observer=seen.append)
    assert response.text == "accepted"
    assert "discarded_text_chars=13" in caplog.text
    assert "secretpartial" not in caplog.text
    assert any(e.discarded_text_chars == 13 for e in seen)


@pytest.mark.parametrize(
    "finish,code", [("length", "output_truncated"), ("stop", "empty_response")]
)
async def test_existing_rejections_survive_streaming(finish, code):
    client = OpenAICompatibleClient("test", "model", max_retries=0)
    install(client, [Response(sse([event({"reasoning": "private"}), event(finish=finish)]))])
    with pytest.raises(LLMRequestError) as exc:
        await client.chat_with_tools([], "", [])
    assert exc.value.code == code


async def test_no_nonstreaming_fallback():
    client = OpenAICompatibleClient("test", "model", max_retries=3)
    sent = install(client, [Response(b'{}', content_type="application/json")])
    with pytest.raises(LLMRequestError, match="required SSE streaming") as exc:
        await client.chat([], "")
    assert exc.value.code == "streaming_not_supported" and len(sent) == 1


@pytest.mark.parametrize("code", ["context_length_exceeded", "invalid_request_error"])
async def test_deterministic_terminal_stream_errors_do_not_retry(code):
    client = OpenAICompatibleClient("test", "model", max_retries=3)
    sent = install(client, [Response(sse([{"error": {"code": code, "message": "private"}}]))])
    with pytest.raises(LLMRequestError) as exc:
        await client.chat([], "")
    assert exc.value.code == code and len(sent) == 1
    assert "private" not in str(exc.value)


async def test_multiline_frame_malformed_data_and_incomplete_frame():
    client = OpenAICompatibleClient("test", "model")
    wire = (
        b'data:{"choices":\ndata:[{"delta":{"content":"ok"},"finish_reason":"stop"}]}'
        b'\n\ndata:[DONE]\n\n'
    )
    result = await client._read_sse_response(Response(wire), None)
    assert result["choices"][0]["message"]["content"] == "ok"
    for wire in (b"data:bad\n\n", b'data:{"choices":'):
        with pytest.raises(CompatibleStreamError):
            await client._read_sse_response(Response(wire), None)


async def test_real_socket_stall_vs_active_keepalives():
    from aiohttp import web
    from aiohttp.test_utils import TestServer

    async def handler(request):
        response = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
        await response.prepare(request)
        try:
            if request.query.get("silent"):
                await asyncio.sleep(.15)
            else:
                for _ in range(8):
                    await response.write(b": keepalive\n\n")
                    await asyncio.sleep(.02)
            await response.write(sse([event({"content": "ok"}), event(finish="stop")]))
        except (ConnectionResetError, RuntimeError):
            pass
        return response

    app = web.Application()
    app.router.add_get("/", handler)
    server = TestServer(app)
    await server.start_server()
    client = OpenAICompatibleClient("test", "model")
    timeout = aiohttp.ClientTimeout(total=2, sock_read=.08)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        seen = []
        async with session.get(server.make_url("/")) as response:
            result = await client._read_sse_response(response, seen.append)
        assert result["choices"][0]["message"]["content"] == "ok"
        assert sum(e.kind == "substantive" for e in seen) == 1
        async with session.get(server.make_url("/?silent=1")) as response:
            with pytest.raises(CompatibleStreamError, match="stalled"):
                await client._read_sse_response(response, None)
    await server.close()


async def test_reload_probe_requires_actual_stream_and_usage():
    from tests.test_llm_gateway import _cfg, _gw

    gateway = _gw(_cfg())
    candidate = OpenAICompatibleClient("test", "model", max_retries=0)
    candidate.health_check = AsyncMock(return_value={"healthy": True})
    install(candidate, [Response(sse([event({"content": "ok"}), event(finish="stop")]))])
    assert "omitted requested stream usage" in await gateway._probe_openai_compatible(candidate)
    install(candidate, [Response(sse([
        event({"content": "ok"}), event(finish="stop"),
        {"choices": [], "usage": {"prompt_tokens": 1, "completion_tokens": 1}},
    ]))])
    assert await gateway._probe_openai_compatible(candidate) is None
    install(candidate, [Response(b"{}", content_type="application/json")])
    assert "SSE and stream_options.include_usage required" in (
        await gateway._probe_openai_compatible(candidate)
    )


async def test_rejected_stream_options_are_clear_and_not_retried():
    client = OpenAICompatibleClient("test", "model")
    response = Response(b"")
    response.status = 400
    response.text = AsyncMock(return_value=json.dumps({
        "error": {"message": "stream_options include_usage is unsupported"}
    }))
    sent = install(client, [response])
    with pytest.raises(LLMRequestError, match="no non-streaming fallback"):
        await client.chat([], "")
    assert len(sent) == 1


@pytest.mark.parametrize("wire", [
    b'event: error\ndata: {}\n\n',
    b'event: response.failed\n\n',
    b'data: {"error":{"code":{}}}\n\n',
])
async def test_named_and_malformed_error_events_never_return_partial_output(wire):
    client = OpenAICompatibleClient("test", "model", max_retries=0)
    partial = sse([event({"content": "private"}), event(finish="stop")], done=False)
    install(client, [Response(partial + wire + b'data: [DONE]\n\n')])
    with pytest.raises(LLMTransportError) as exc:
        await client.chat([], "")
    assert "private" not in str(exc.value)
