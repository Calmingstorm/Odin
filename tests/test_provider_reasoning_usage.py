"""Real HTTP/SSE provider tests and pre-C5 outbound wire snapshots.

Only auth and the endpoint URL are substituted. Request construction, aiohttp
serialization, streaming, acceptance and response parsing remain real.
"""
import json
from contextlib import asynccontextmanager

import pytest
from aiohttp import web

from src.llm.errors import LLMTransportError
from src.llm.openai_codex import CodexChatClient
from src.llm.openai_compatible import OpenAICompatibleClient


class Auth:
    async def get_access_token(self):
        return "test-token"

    def get_account_id(self):
        return "test-account"


@asynccontextmanager
async def endpoint(events):
    requests = []

    async def respond(request):
        requests.append((await request.read(), dict(request.headers)))
        response = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
        await response.prepare(request)
        for event in events:
            frame = f"data: {json.dumps(event)}\n\n".encode()
            # Exercise actual HTTP streaming and partial SSE frame buffering.
            await response.write(frame[:7])
            await response.write(frame[7:])
        await response.write(b"data: [DONE]\n\n")
        await response.write_eof()
        return response

    app = web.Application()
    app.router.add_post("/{path:.*}", respond)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    try:
        yield f"http://127.0.0.1:{port}", requests
    finally:
        await runner.cleanup()


def client_for(provider, url, monkeypatch):
    if provider == "codex":
        monkeypatch.setattr("src.llm.openai_codex.CODEX_API_URL", url + "/responses")
        return CodexChatClient(auth=Auth(), model="fixture", max_retries=0)
    return OpenAICompatibleClient(
        "test-token", model="fixture", base_url=url, max_retries=0,
        reasoning_dialect="openai_reasoning_effort", max_tokens=2048,
    )


def accepted_events(provider, usage, terminal="completed"):
    if provider == "codex":
        response = {"usage": usage, "incomplete_details": {"reason": "max_output_tokens"}}
        return [
            {"type": "response.output_text.delta", "delta": "accepted"},
            {"type": f"response.{terminal}", "response": response},
        ]
    return [
        {"choices": [{"index": 0, "delta": {"content": "accepted"}}]},
        {"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]},
        {"choices": [], "usage": usage},
    ]


USAGE_CASES = [
    pytest.param({}, None, id="absent"),
    pytest.param(None, None, id="null-usage"),
    pytest.param([], None, id="malformed-usage"),
    pytest.param({"DETAILS": None}, None, id="null-details"),
    pytest.param({"DETAILS": []}, None, id="malformed-details"),
    pytest.param({"DETAILS": {}}, None, id="absent-counter"),
    *[
        pytest.param({"DETAILS": {"reasoning_tokens": value}}, expected, id=name)
        for name, value, expected in [
            ("null", None, None), ("negative", -1, None),
            ("boolean-true", True, None), ("boolean-false", False, None),
            ("float", 2.0, None), ("string", "2", None),
            ("list", [2], None), ("object", {"value": 2}, None),
            ("zero", 0, 0), ("positive", 73, 73),
        ]
    ],
]


@pytest.mark.parametrize("provider,details,terminal", [
    ("codex", "output_tokens_details", "completed"),
    ("codex", "output_tokens_details", "incomplete"),
    ("compatible", "completion_tokens_details", "completed"),
    ("compatible", "output_tokens_details", "completed"),
])
@pytest.mark.parametrize("raw_usage,expected", USAGE_CASES)
async def test_accepted_stream_reasoning_usage(
    provider, details, terminal, raw_usage, expected, monkeypatch,
):
    usage = (
        {details if key == "DETAILS" else key: value for key, value in raw_usage.items()}
        if isinstance(raw_usage, dict) else raw_usage
    )
    async with endpoint(accepted_events(provider, usage, terminal)) as (url, requests):
        client = client_for(provider, url, monkeypatch)
        try:
            result = await client.chat_with_tools([], "", [])
        finally:
            await client.close()
    assert len(requests) == 1
    assert result.text == "accepted"
    assert result.stop_reason == ("incomplete" if terminal == "incomplete" else "end_turn")
    assert result.reasoning_tokens == expected
    if expected is not None:
        assert type(result.reasoning_tokens) is int
    # No fabricated visible-output/input counts or reasoning content.
    assert result.server_input_tokens is None
    assert result.server_output_tokens is None
    assert result.reasoning_content is None


@pytest.mark.parametrize("details", ["completion_tokens_details", "output_tokens_details"])
@pytest.mark.parametrize("raw_usage,expected", USAGE_CASES)
def test_compatible_direct_response_reasoning_usage(details, raw_usage, expected):
    usage = (
        {details if key == "DETAILS" else key: value for key, value in raw_usage.items()}
        if isinstance(raw_usage, dict) else raw_usage
    )
    client = OpenAICompatibleClient("test-token", model="fixture")
    response = client._parse_response({
        "choices": [{"message": {"content": "accepted"}, "finish_reason": "stop"}],
        "usage": usage,
    })
    assert response.reasoning_tokens == expected
    if expected is not None:
        assert type(response.reasoning_tokens) is int


@pytest.mark.parametrize("primary,expected", [
    (None, None), ([], None), ({}, None), ({"reasoning_tokens": None}, None),
    ({"reasoning_tokens": True}, None), ({"reasoning_tokens": 0}, 0),
    ({"reasoning_tokens": 7}, 7),
])
async def test_compatible_primary_details_take_precedence(primary, expected, monkeypatch):
    usage = {"completion_tokens_details": primary,
             "output_tokens_details": {"reasoning_tokens": 99}}
    async with endpoint(accepted_events("compatible", usage)) as (url, _):
        client = client_for("compatible", url, monkeypatch)
        try:
            result = await client.chat_with_tools([], "", [])
        finally:
            await client.close()
    assert result.reasoning_tokens == expected


@pytest.mark.parametrize("provider,terminal", [
    ("codex", "completed"), ("codex", "incomplete"), ("compatible", "completed"),
])
async def test_reasoning_counter_is_separate_from_other_usage(provider, terminal, monkeypatch):
    if provider == "codex":
        usage = {"input_tokens": 101, "output_tokens": 8,
                 "input_tokens_details": {"cached_tokens": 9, "cache_write_tokens": 3},
                 "output_tokens_details": {"reasoning_tokens": 73}}
    else:
        usage = {"prompt_tokens": 101, "completion_tokens": 8,
                 "prompt_tokens_details": {"cached_tokens": 9, "cache_write_tokens": 3},
                 "completion_tokens_details": {"reasoning_tokens": 73}}
    async with endpoint(accepted_events(provider, usage, terminal)) as (url, _):
        client = client_for(provider, url, monkeypatch)
        try:
            result = await client.chat_with_tools([], "", [])
        finally:
            await client.close()
    # Counters are reported independently, not inferred/clamped from one another.
    assert result.reasoning_tokens == 73
    if terminal != "incomplete":
        assert (result.server_input_tokens, result.server_output_tokens) == (101, 8)
        assert (result.cached_tokens, result.cache_write_tokens) == (9, 3)
    else:
        # C5 does not change the existing incomplete input/output/cache policy.
        assert (result.server_input_tokens, result.server_output_tokens) == (None, None)
        assert (result.cached_tokens, result.cache_write_tokens) == (None, None)


@pytest.mark.parametrize("terminal", ["completed", "incomplete"])
async def test_codex_usage_only_from_accepted_terminal(terminal, monkeypatch):
    events = [
        {"type": "response.created", "response": {
            "usage": {"output_tokens_details": {"reasoning_tokens": 73}}}},
        *accepted_events("codex", {}, terminal),
    ]
    async with endpoint(events) as (url, _):
        client = client_for("codex", url, monkeypatch)
        try:
            result = await client.chat_with_tools([], "", [])
        finally:
            await client.close()
    assert result.reasoning_tokens is None


@pytest.mark.parametrize("terminal", ["created", "failed"])
async def test_codex_unaccepted_stream_does_not_return_usage(terminal, monkeypatch):
    events = accepted_events("codex", {"output_tokens_details": {"reasoning_tokens": 73}}, terminal)
    async with endpoint(events) as (url, _):
        client = client_for("codex", url, monkeypatch)
        try:
            with pytest.raises(LLMTransportError):
                await client.chat_with_tools([], "", [])
        finally:
            await client.close()


# Captured from the pre-C5 provider implementation via this loopback HTTP test.
# Literal bytes lock JSON key order/spacing too, not merely dictionary equality.
REQUEST_BYTES = {
    "codex": (
        b'{"model": "fixture", "instructions": "Follow the rules", "input": [{"type": '
        b'"message", "role": "user", "content": [{"type": "input_text", "text": "Find '
        b'the record"}]}, {"type": "function_call", "call_id": "call_previous", "name"'
        b': "lookup", "arguments": "{\\"q\\": \\"old\\"}"}, {"type": "function_call_ou'
        b'tput", "call_id": "call_previous", "output": "not found"}], "tools": [{"type'
        b'": "function", "name": "lookup", "description": "Look up a record", "paramet'
        b'ers": {"type": "object", "properties": {"json": {"type": "string", "descript'
        b'ion": "JSON object conforming to canonical input schema: {\\"properties\\"'
        b': {\\"q\\": {\\"type\\": \\"string\\"}}, \\"required\\": [\\"q\\"], \\"type'
        b'\\": \\"object\\"}"}}, "required": ["json"], "additionalProperties": false}'
        b'}], "tool_choice": "auto", "store": false, "stream": true, "reasoning": {"ef'
        b'fort": "high"}}'
    ),
    "compatible": (
        b'{"model": "fixture", "messages": [{"role": "system", "content": "Follow the '
        b'rules"}, {"role": "user", "content": "Find the record"}, {"role": "assistant'
        b'", "content": "", "tool_calls": [{"id": "call_previous", "type": "function",'
        b' "function": {"name": "lookup", "arguments": "{\\"q\\": \\"old\\"}"}}]}, {"r'
        b'ole": "tool", "tool_call_id": "call_previous", "content": "not found"}], "to'
        b'ols": [{"type": "function", "function": {"name": "lookup", "description": "L'
        b'ook up a record", "parameters": {"type": "object", "properties": {"q": {"typ'
        b'e": "string"}}, "required": ["q"]}}}], "tool_choice": "auto", "max_tokens": '
        b'2048, "stream": true, "stream_options": {"include_usage": true}, "reasoning_'
        b'effort": "high"}'
    ),
}


@pytest.mark.parametrize("provider", ["codex", "compatible"])
@pytest.mark.parametrize("reasoning_tokens", [None, 0, 73])
async def test_outbound_request_bytes_unchanged(provider, reasoning_tokens, monkeypatch):
    detail = "output_tokens_details" if provider == "codex" else "completion_tokens_details"
    usage = {detail: {"reasoning_tokens": reasoning_tokens}}
    messages = [
        {"role": "user", "content": "Find the record"},
        {"role": "assistant", "content": [
            {"type": "tool_use", "id": "call_previous", "name": "lookup", "input": {"q": "old"}},
        ]},
        {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "call_previous", "content": "not found"},
        ]},
    ]
    tools = [{"name": "lookup", "description": "Look up a record", "input_schema": {
        "type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"],
    }}]
    async with endpoint(accepted_events(provider, usage)) as (url, requests):
        client = client_for(provider, url, monkeypatch)
        try:
            result = await client.chat_with_tools(
                messages, "Follow the rules", tools, reasoning_effort="high",
            )
        finally:
            await client.close()
    assert result.text == "accepted"
    assert len(requests) == 1
    body, headers = requests[0]
    assert headers["Authorization"] == "Bearer test-token"
    assert headers["Content-Type"] == "application/json"
    assert body == REQUEST_BYTES[provider]
