"""A silent loop's quiet iteration ends with an empty reply by design.

Only that caller opts in (``allow_empty_reply``). Each provider then accepts a
settled, normally finished empty final on its first attempt, with success
bookkeeping. Refusals, filtered, truncated, unfinished and malformed results,
and every caller that did not opt in, keep their existing handling.
"""
from __future__ import annotations

import asyncio
import logging
from unittest.mock import AsyncMock

import pytest

from src.llm.errors import LLMRequestError, LLMTransportError
from src.llm.ollama import OllamaClient
from src.llm.openai_compatible import OpenAICompatibleClient
from src.tools.result_validator import ToolResult
from tests.characterization.test_autonomous_loop import build as build_loop
from tests.fakes import FakeChannel, text_response, tool_call_response
from tests.test_codex_reliability import FakeResp, FakeSession, _client, _sse
from tests.test_compatible_streaming import Response, event, install, sse

MESSAGES = [{"role": "user", "content": "check the queue"}]
USAGE = {"input_tokens": 120, "output_tokens": 3, "input_tokens_details": {"cached_tokens": 100}}
REASONING = {"type": "reasoning", "id": "rs_1", "summary": []}
EMPTY_MESSAGE = {
    "type": "message",
    "id": "msg_1",
    "role": "assistant",
    "status": "completed",
    "content": [{"type": "output_text", "text": "", "annotations": []}],
}


def completed(output, **response):
    return {
        "type": "response.completed",
        "response": {"status": "completed", "output": output, "usage": USAGE, **response},
    }


# The shape of the quiet iterations in the 2026-10-21 battery: a message whose
# only text part is empty, then a completed response.
REAL_SHAPE = [
    {"type": "response.created", "response": {"status": "in_progress"}},
    {"type": "response.output_item.added", "output_index": 0, "item": REASONING},
    {"type": "response.output_item.done", "output_index": 0, "item": REASONING},
    {
        "type": "response.output_item.added",
        "output_index": 1,
        "item": {**EMPTY_MESSAGE, "status": "in_progress", "content": []},
    },
    {
        "type": "response.content_part.added",
        "output_index": 1,
        "part": {"type": "output_text", "text": ""},
    },
    {"type": "response.output_text.done", "output_index": 1, "text": ""},
    {"type": "response.output_item.done", "output_index": 1, "item": EMPTY_MESSAGE},
    completed([REASONING, EMPTY_MESSAGE]),
]

SETTLED_EMPTY = {
    "battery shape": REAL_SHAPE,
    "no output items": [completed([])],
    "reasoning only": [completed([REASONING])],
    "message without parts": [completed([{**EMPTY_MESSAGE, "content": []}])],
    "status not sent": [{"type": "response.completed", "response": {"output": [EMPTY_MESSAGE]}}],
    "explicit empty text events": [
        {"type": "response.output_text.delta", "output_index": 0, "delta": ""},
        {"type": "response.output_text.done", "output_index": 0, "text": ""},
        completed([EMPTY_MESSAGE]),
    ],
}

REFUSAL_MESSAGE = {
    "type": "message",
    "status": "completed",
    "content": [{"type": "refusal", "refusal": "I can't help with that."}],
}

# Never proof of a deliberate empty reply. Each one must behave exactly as it
# does for a caller that did not opt in.
NOT_SETTLED = {
    "refusal in the completed payload": [completed([REFUSAL_MESSAGE])],
    "streamed refusal": [
        {"type": "response.refusal.delta", "output_index": 0, "delta": "I can't"},
        {"type": "response.refusal.done", "output_index": 0, "refusal": "I can't"},
        completed([]),
    ],
    "refusal content part": [
        {"type": "response.content_part.added", "part": {"type": "refusal", "refusal": ""}},
        completed([]),
    ],
    "refusal item": [
        {"type": "response.output_item.done", "output_index": 0, "item": REFUSAL_MESSAGE},
        completed([]),
    ],
    "payload absent": [{"type": "response.completed"}],
    "payload null": [{"type": "response.completed", "response": None}],
    "payload not an object": [{"type": "response.completed", "response": "done"}],
    "output absent": [{"type": "response.completed", "response": {"status": "completed"}}],
    "output not a list": [completed({})],
    "output item not an object": [completed(["text"])],
    "unknown output item": [completed([{"type": "web_search_call", "status": "completed"}])],
    "message part not output text": [completed([{**EMPTY_MESSAGE, "content": [{"type": "x"}]}])],
    "message content not a list": [completed([{**EMPTY_MESSAGE, "content": None}])],
    # Review F3: a text part whose text is not a string is malformed.
    "output text null": [completed([{**EMPTY_MESSAGE, "content": [
        {"type": "output_text", "text": None}]}])],
    "output text list": [completed([{**EMPTY_MESSAGE, "content": [
        {"type": "output_text", "text": []}]}])],
    "output text false": [completed([{**EMPTY_MESSAGE, "content": [
        {"type": "output_text", "text": False}]}])],
    "output text missing": [completed([{**EMPTY_MESSAGE, "content": [
        {"type": "output_text"}]}])],
    "streamed text delta not a string": [
        {"type": "response.output_text.delta", "delta": []}, completed([])],
    "streamed text done not a string": [
        {"type": "response.output_text.done", "text": None}, completed([])],
    # Review 12: a text event that omits its required text value.
    "streamed text delta missing": [
        {"type": "response.output_text.delta", "item_id": "msg_1", "output_index": 0,
         "content_index": 0, "sequence_number": 3},
        completed([EMPTY_MESSAGE])],
    "streamed text done missing": [
        {"type": "response.output_text.done", "item_id": "msg_1", "output_index": 0,
         "content_index": 0, "sequence_number": 4},
        completed([EMPTY_MESSAGE])],
    "response still in progress": [completed([], status="in_progress")],
    "response carries an error": [completed([], error={"code": "server_error"})],
    "incomplete details": [completed([], incomplete_details={"reason": "max_output_tokens"})],
    "incomplete message item": [completed([{**EMPTY_MESSAGE, "status": "incomplete"}])],
    "unfinished call item": [
        {
            "type": "response.output_item.added",
            "output_index": 0,
            "item": {"type": "function_call", "call_id": "c1", "name": "run_command"},
        },
        completed([]),
    ],
    "incomplete terminal": [
        {"type": "response.incomplete", "response": {"incomplete_details": {"reason": "x"}}},
    ],
    "failed terminal": [{"type": "response.failed", "response": {"error": {"code": "x"}}}],
    "no terminal": [{"type": "response.output_text.done", "text": ""}],
}


def malformed_then(events):
    return ["data: {not json\n", *_sse(events)]


def _codex(script_lines, *, retries=3):
    client = _client(max_retries=retries)
    session = FakeSession([FakeResp(200, sse_lines=list(script_lines)) for _ in range(retries)])
    client._get_session = AsyncMock(return_value=session)
    return client, session


def _kwargs(*, allow, observed):
    kwargs = {}
    if allow:
        kwargs["allow_empty_reply"] = True
    if observed:
        kwargs["progress_observer"] = lambda _event: None
    return kwargs


async def _outcome(lines, *, allow, observed):
    client, session = _codex(lines)
    client.breaker._failure_count = 1
    try:
        result = await client.chat_with_tools(
            MESSAGES, "system", [], **_kwargs(allow=allow, observed=observed)
        )
        outcome = ("returned", result.text, len(result.tool_calls), result.stop_reason)
    except Exception as exc:
        outcome = ("raised", type(exc).__name__)
    return outcome, session.calls, client.breaker._failure_count


def _warnings(caplog):
    return [
        r.getMessage()
        for r in caplog.records
        if r.name == "odin.codex" and r.levelno >= logging.WARNING
    ]


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


# ---------------------------------------------------------------------------
# Codex
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("observed", [False, True])
@pytest.mark.parametrize("name", SETTLED_EMPTY)
async def test_codex_settled_empty_final_is_one_successful_request(name, observed, caplog):
    client, session = _codex(_sse(SETTLED_EMPTY[name]))
    # Two earlier failures: a third one would open the breaker for everyone.
    client.breaker._failure_count = 2
    with caplog.at_level(logging.DEBUG, logger="odin.codex"):
        result = await client.chat_with_tools(
            MESSAGES, "system", [], **_kwargs(allow=True, observed=observed)
        )
    assert session.calls == 1
    assert (result.text, result.tool_calls, result.stop_reason) == ("", [], "end_turn")
    assert client.breaker._failure_count == 0
    assert client.breaker.state == "closed"
    assert (result.provenance_provider, result.provenance_model) == ("codex", "gpt-test")
    if name != "status not sent":
        assert (result.server_input_tokens, result.cached_tokens) == (120, 100)
    assert _warnings(caplog) == []


@pytest.mark.parametrize("observed", [False, True])
async def test_codex_without_the_opt_in_the_same_stream_keeps_its_retries(observed, caplog):
    client, session = _codex(_sse(REAL_SHAPE))
    client.breaker._failure_count = 2
    with caplog.at_level(logging.DEBUG, logger="odin.codex"):
        result = await client.chat_with_tools(
            MESSAGES, "system", [], **_kwargs(allow=False, observed=observed)
        )
    assert session.calls == 3
    assert (result.text, result.tool_calls) == ("", [])
    assert client.breaker.state == "open"
    warnings = _warnings(caplog)
    assert sum("tool stream empty" in w for w in warnings) == 3
    assert sum("returned 200 with empty response" in w for w in warnings) == 3


@pytest.mark.parametrize("observed", [False, True])
@pytest.mark.parametrize("name", [*NOT_SETTLED, "malformed frame"])
async def test_codex_opt_in_never_accepts_what_is_not_a_settled_empty_final(
    name, observed, caplog
):
    lines = malformed_then([completed([])]) if name == "malformed frame" else _sse(
        NOT_SETTLED[name]
    )
    with caplog.at_level(logging.DEBUG, logger="odin.codex"):
        allowed = await _outcome(lines, allow=True, observed=observed)
        allowed_warnings = _warnings(caplog)
        caplog.clear()
        default = await _outcome(lines, allow=False, observed=observed)
    assert allowed == default
    assert allowed_warnings == _warnings(caplog)


async def test_codex_the_reader_decides_per_attempt():
    """A rejected attempt cannot lend its evidence to the next one."""
    client = _client(max_retries=3)
    session = FakeSession([
        FakeResp(200, sse_lines=_sse([completed([REFUSAL_MESSAGE])])),
        FakeResp(200, sse_lines=_sse(REAL_SHAPE)),
    ])
    client._get_session = AsyncMock(return_value=session)
    result = await client.chat_with_tools(MESSAGES, "system", [], allow_empty_reply=True)
    assert session.calls == 2
    assert result.text == ""
    assert client.breaker._failure_count == 0


async def test_codex_silent_and_ordinary_callers_keep_their_own_policy(caplog):
    client = _client(max_retries=3)
    session = FakeSession([FakeResp(200, sse_lines=_sse(REAL_SHAPE)) for _ in range(4)])
    client._get_session = AsyncMock(return_value=session)
    with caplog.at_level(logging.DEBUG, logger="odin.codex"):
        silent, ordinary = await asyncio.gather(
            client.chat_with_tools(MESSAGES, "system", [], allow_empty_reply=True),
            client.chat_with_tools(MESSAGES, "system", []),
        )
    assert session.calls == 4  # one for the silent caller, three for the other
    assert silent.text == ordinary.text == ""
    assert client.breaker._failure_count == 1
    assert sum("returned 200 with empty response" in w for w in _warnings(caplog)) == 3


# ---------------------------------------------------------------------------
# OpenAI-compatible
# ---------------------------------------------------------------------------


def _compat(wire):
    client = OpenAICompatibleClient("key", "requested", provider_name="compat")
    install(client, [Response(wire)])
    return client


QUIET_STREAM = [
    event({"role": "assistant", "content": ""}),
    event(finish="stop"),
    {"choices": [], "usage": {"prompt_tokens": 80, "completion_tokens": 1}},
]


async def test_compatible_settled_empty_stream_is_accepted_only_with_the_opt_in():
    with pytest.raises(LLMRequestError) as default:
        await _compat(sse(QUIET_STREAM)).chat_with_tools(MESSAGES, "system", [])
    assert default.value.code == "empty_response"

    client = _compat(sse(QUIET_STREAM))
    result = await client.chat_with_tools(MESSAGES, "system", [], allow_empty_reply=True)
    assert (result.text, result.tool_calls, result.stop_reason) == ("", [], "end_turn")
    assert (result.provenance_provider, result.server_input_tokens) == ("compat", 80)
    assert client.breaker.state == "closed"


@pytest.mark.parametrize("stream", [
    [event({"refusal": "I can't help with that."}), event(finish="stop")],
    [event({"content": ""}), event(finish="content_filter")],
    [event({"content": ""}), event(finish="tool_calls")],
    # Review F2: what normalization would erase must still count.
    [event({"content": [{"type": "text", "text": "[ALERT] disk full"}]}), event(finish="stop")],
    [event({"content": True}), event(finish="stop")],
    [event({"content": False}), event(finish="stop")],
    [event({"refusal": {"reason": "policy"}}), event(finish="stop")],
    [{"choices": [{"index": 0, "delta": "not an object", "finish_reason": None}]},
     event(finish="stop")],
])
async def test_compatible_streamed_refusals_and_other_finishes_stay_errors(stream):
    for allow in (False, True):
        client = _compat(sse(stream))
        with pytest.raises(LLMRequestError) as caught:
            await client.chat_with_tools(
                MESSAGES, "system", [], **({"allow_empty_reply": True} if allow else {})
            )
        assert caught.value.code == "empty_response"


async def test_compatible_malformed_delta_does_not_change_a_text_reply():
    """The evidence only gates empty acceptance; a reply with text is unchanged."""
    stream = [event({"content": [1]}), event({"content": "hello"}), event(finish="stop")]
    for allow in (False, True):
        result = await _compat(sse(stream)).chat_with_tools(
            MESSAGES, "system", [], **({"allow_empty_reply": True} if allow else {})
        )
        assert (result.text, result.stop_reason) == ("hello", "end_turn")


async def test_compatible_streamed_refusal_survives_normalization():
    client = OpenAICompatibleClient("key", "requested", provider_name="compat")
    install(client, [Response(sse([event({"refusal": "No."}), event(finish="stop")]))])
    data = await client._request_with_retry({"model": "requested", "messages": []})
    assert data["choices"][0]["message"]["refusal"] == "No."


@pytest.mark.parametrize("choice", [
    {"finish_reason": "stop", "message": {"content": "", "refusal": "I can't."}},
    {"finish_reason": "stop", "message": {"content": None, "refusal": {"x": 1}}},
    {"finish_reason": "content_filter", "message": {"content": ""}},
    {"message": {"content": ""}},  # a missing finish reason is not a stop
    {"finish_reason": None, "message": {"content": ""}},
    {"finish_reason": "stop", "message": {"content": [{"type": "text", "text": ""}]}},
    {"finish_reason": "stop", "message": "not an object"},
    {"finish_reason": "stop"},
])
def test_compatible_parser_rejects_what_is_not_a_settled_empty_final(choice):
    client = OpenAICompatibleClient("key", "requested", provider_name="compat")
    for allow in (False, True):
        # A message that is not an object already fails before the empty check.
        with pytest.raises((LLMRequestError, AttributeError)) as caught:
            client._parse_response({"choices": [choice]}, allow_empty_reply=allow)
        if isinstance(caught.value, LLMRequestError):
            assert caught.value.code == "empty_response"


@pytest.mark.parametrize("message", [
    {"role": "assistant", "content": ""},
    {"role": "assistant", "content": None},
    {"role": "assistant", "content": "  ", "refusal": None},
    {"role": "assistant"},
    # No calls: the field absent (above), null or an empty list.
    {"role": "assistant", "content": "", "tool_calls": None},
    {"role": "assistant", "content": "", "tool_calls": []},
])
def test_compatible_parser_accepts_a_stop_with_text_or_absent_content(message):
    client = OpenAICompatibleClient("key", "requested", provider_name="compat")
    data = {"choices": [{"finish_reason": "stop", "message": message}]}
    with pytest.raises(LLMRequestError):
        client._parse_response(data)
    result = client._parse_response(data, allow_empty_reply=True)
    assert (result.tool_calls, result.stop_reason) == ([], "end_turn")


def test_compatible_length_finish_stays_truncated_with_the_opt_in():
    client = OpenAICompatibleClient("key", "requested", provider_name="compat")
    data = {"choices": [{"finish_reason": "length", "message": {"content": ""}}]}
    with pytest.raises(LLMRequestError) as caught:
        client._parse_response(data, allow_empty_reply=True)
    assert caught.value.code == "output_truncated"


# A falsey tool_calls value that is not a list parses as no calls, but it is
# malformed: it never makes an empty reply a settled one (Odin's Desktop 1.5.0
# design review, F1). Replies with text keep their text.
FALSEY_NON_LIST_CALLS = [{}, False, 0, ""]


def _allow(allow):
    return {"allow_empty_reply": True} if allow else {}


@pytest.mark.parametrize("calls", FALSEY_NON_LIST_CALLS)
def test_compatible_malformed_falsey_tool_calls_are_not_a_settled_empty_final(calls):
    client = OpenAICompatibleClient("key", "requested", provider_name="compat")
    data = {"choices": [{"finish_reason": "stop", "message": {
        "role": "assistant", "content": "", "tool_calls": calls,
    }}]}
    for allow in (False, True):
        with pytest.raises(LLMRequestError) as caught:
            client._parse_response(data, allow_empty_reply=allow)
        assert caught.value.code == "empty_response"


@pytest.mark.parametrize("calls", FALSEY_NON_LIST_CALLS)
def test_compatible_text_reply_with_a_falsey_tool_calls_field_is_unchanged(calls):
    client = OpenAICompatibleClient("key", "requested", provider_name="compat")
    data = {"choices": [{"finish_reason": "stop", "message": {
        "role": "assistant", "content": "hello", "tool_calls": calls,
    }}]}
    for allow in (False, True):
        result = client._parse_response(data, allow_empty_reply=allow)
        assert (result.text, result.tool_calls, result.stop_reason) == ("hello", [], "end_turn")


@pytest.mark.parametrize("calls", FALSEY_NON_LIST_CALLS)
async def test_compatible_streamed_falsey_tool_call_delta_is_not_a_settled_empty_final(calls):
    stream = [event({"role": "assistant", "content": "", "tool_calls": calls}),
              event(finish="stop")]
    for allow in (False, True):
        with pytest.raises(LLMRequestError) as caught:
            await _compat(sse(stream)).chat_with_tools(MESSAGES, "system", [], **_allow(allow))
        assert caught.value.code == "empty_response"


@pytest.mark.parametrize("calls", [None, []])
async def test_compatible_streamed_null_or_empty_tool_call_delta_still_settles(calls):
    stream = [event({"role": "assistant", "content": "", "tool_calls": calls}),
              event(finish="stop")]
    result = await _compat(sse(stream)).chat_with_tools(
        MESSAGES, "system", [], allow_empty_reply=True
    )
    assert (result.text, result.tool_calls, result.stop_reason) == ("", [], "end_turn")


@pytest.mark.parametrize("calls", FALSEY_NON_LIST_CALLS)
async def test_compatible_streamed_text_reply_with_a_falsey_tool_call_delta_is_unchanged(calls):
    stream = [event({"content": "hello", "tool_calls": calls}), event(finish="stop")]
    for allow in (False, True):
        result = await _compat(sse(stream)).chat_with_tools(
            MESSAGES, "system", [], **_allow(allow)
        )
        assert (result.text, result.tool_calls, result.stop_reason) == ("hello", [], "end_turn")


@pytest.mark.parametrize("observed", [False, True])
@pytest.mark.parametrize("order", ["malformed first", "malformed last"])
async def test_compatible_malformed_tool_call_delta_disqualifies_beside_a_legal_one(
    order, observed
):
    """The malformed mark is sticky: a legal no-calls delta before or after it never clears it."""
    bad = event({"content": "", "tool_calls": {}})
    good = event({"content": "", "tool_calls": None})
    deltas = [bad, good] if order == "malformed first" else [good, bad]
    seen = []
    with pytest.raises(LLMRequestError) as caught:
        await _compat(sse([*deltas, event(finish="stop")])).chat_with_tools(
            MESSAGES, "system", [], allow_empty_reply=True,
            **({"progress_observer": seen.append} if observed else {}),
        )
    assert caught.value.code == "empty_response"


@pytest.mark.parametrize("calls", FALSEY_NON_LIST_CALLS)
def test_compatible_legacy_static_seam_rejects_a_malformed_tool_calls_field(calls):
    """``OpenAICompatibleClient._parse_response(None, payload)`` obeys the same check."""
    data = {"choices": [{"finish_reason": "stop", "message": {
        "role": "assistant", "content": "", "tool_calls": calls,
    }}]}
    with pytest.raises(LLMRequestError) as caught:
        OpenAICompatibleClient._parse_response(None, data, allow_empty_reply=True)
    assert caught.value.code == "empty_response"


@pytest.mark.parametrize("calls", [None, []])
def test_compatible_legacy_static_seam_still_settles_null_or_empty_tool_calls(calls):
    data = {"choices": [{"finish_reason": "stop", "message": {
        "role": "assistant", "content": "", "tool_calls": calls,
    }}]}
    result = OpenAICompatibleClient._parse_response(None, data, allow_empty_reply=True)
    assert (result.text, result.tool_calls, result.stop_reason) == ("", [], "end_turn")


@pytest.mark.parametrize("calls", [{"index": 0}, "call", 1, True])
async def test_compatible_streamed_truthy_non_list_tool_call_delta_still_fails_the_stream(calls):
    """A value that might be a call is never read as no calls: the stream fails."""
    for allow in (False, True):
        client = OpenAICompatibleClient("key", "requested", provider_name="compat",
                                        max_retries=0)
        install(client, [Response(sse([event({"content": "hello", "tool_calls": calls}),
                                       event(finish="stop")]))])
        with pytest.raises(LLMTransportError, match="malformed tool-call delta list"):
            await client.chat_with_tools(MESSAGES, "system", [], **_allow(allow))


# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------

OLLAMA_QUIET = {
    "model": "qwen3:8b",
    "created_at": "2026-10-21T18:00:00Z",
    "message": {"role": "assistant", "content": ""},
    "done": True,
    "done_reason": "stop",
    "prompt_eval_count": 50,
    "eval_count": 1,
}


async def test_ollama_settled_empty_reply_is_accepted_only_with_the_opt_in():
    client = OllamaClient(model="qwen3:8b")
    client._request_with_retry = AsyncMock(return_value=dict(OLLAMA_QUIET))
    with pytest.raises(LLMRequestError) as default:
        await client.chat_with_tools(MESSAGES, "system", [])
    assert default.value.code == "empty_response"
    result = await client.chat_with_tools(MESSAGES, "system", [], allow_empty_reply=True)
    assert (result.text, result.tool_calls, result.stop_reason) == ("", [], "end_turn")
    assert (result.provenance_provider, result.server_input_tokens) == ("ollama", 50)


@pytest.mark.parametrize("change", [
    {"done_reason": None},
    {"done_reason": "unload"},
    {"done": "true"},
    {"message": "not an object"},
    {"message": {"role": "assistant", "content": ["x"]}},
])
def test_ollama_parser_rejects_what_is_not_a_settled_empty_final(change):
    data = {**OLLAMA_QUIET, **change}
    for allow in (False, True):
        with pytest.raises((LLMRequestError, AttributeError)) as caught:
            OllamaClient()._parse_response(dict(data), allow_empty_reply=allow)
        if isinstance(caught.value, LLMRequestError):
            assert caught.value.code == "empty_response"


def test_ollama_reply_without_a_message_is_not_a_settled_empty_final():
    data = dict(OLLAMA_QUIET)
    del data["message"]
    for allow in (False, True):
        with pytest.raises(LLMRequestError) as caught:
            OllamaClient()._parse_response(dict(data), allow_empty_reply=allow)
        assert caught.value.code == "empty_response"


@pytest.mark.parametrize("change", [{"done_reason": "length"}, {"done": False}])
def test_ollama_unfinished_reply_stays_incomplete_with_the_opt_in(change):
    result = OllamaClient()._parse_response({**OLLAMA_QUIET, **change}, allow_empty_reply=True)
    assert result.stop_reason == "incomplete"


def _ollama(message, **change):
    return {**OLLAMA_QUIET, **change, "message": {"role": "assistant", **message}}


@pytest.mark.parametrize("calls", FALSEY_NON_LIST_CALLS)
def test_ollama_malformed_falsey_tool_calls_are_not_a_settled_empty_final(calls):
    for allow in (False, True):
        with pytest.raises(LLMRequestError) as caught:
            OllamaClient()._parse_response(
                _ollama({"content": "", "tool_calls": calls}), allow_empty_reply=allow
            )
        assert caught.value.code == "empty_response"


@pytest.mark.parametrize("message", [
    {"content": ""},
    {"content": "", "tool_calls": None},
    {"content": "", "tool_calls": []},
])
def test_ollama_absent_null_or_empty_tool_calls_still_settle(message):
    with pytest.raises(LLMRequestError):
        OllamaClient()._parse_response(_ollama(message))
    result = OllamaClient()._parse_response(_ollama(message), allow_empty_reply=True)
    assert (result.text, result.tool_calls, result.stop_reason) == ("", [], "end_turn")


@pytest.mark.parametrize("calls", [*FALSEY_NON_LIST_CALLS, None])
def test_ollama_text_reply_with_a_falsey_tool_calls_field_keeps_its_text(calls):
    for allow in (False, True):
        result = OllamaClient()._parse_response(
            _ollama({"content": "hello", "tool_calls": calls}), allow_empty_reply=allow
        )
        assert (result.text, result.tool_calls, result.stop_reason) == ("hello", [], "end_turn")


async def test_ollama_null_content_is_a_reply_with_no_text():
    """Odin's Desktop 1.5.0 design review, F4: the predicate's null-content
    allowance is reachable instead of failing on ``None.strip()``."""
    client = OllamaClient(model="qwen3:8b")
    client._request_with_retry = AsyncMock(return_value=_ollama({"content": None}))
    with pytest.raises(LLMRequestError) as default:
        await client.chat_with_tools(MESSAGES, "system", [])
    assert default.value.code == "empty_response"
    result = await client.chat_with_tools(MESSAGES, "system", [], allow_empty_reply=True)
    assert (result.text, result.tool_calls, result.stop_reason) == ("", [], "end_turn")


@pytest.mark.parametrize("content", [["x"], 5, {"text": "x"}])
def test_ollama_non_text_content_is_not_a_settled_empty_final(content):
    for allow in (False, True):
        with pytest.raises(LLMRequestError) as caught:
            OllamaClient()._parse_response(_ollama({"content": content}), allow_empty_reply=allow)
        assert caught.value.code == "empty_response"


@pytest.mark.parametrize("change", [{"done_reason": "length"}, {"done": False}])
def test_ollama_unfinished_reply_with_null_content_stays_incomplete(change):
    result = OllamaClient()._parse_response(_ollama({"content": None}, **change),
                                            allow_empty_reply=True)
    assert (result.text, result.stop_reason) == ("", "incomplete")


# ---------------------------------------------------------------------------
# The loop
# ---------------------------------------------------------------------------


def _start_message(channel):
    author = type("Author", (), {"id": 4242, "__str__": lambda self: "tester"})()
    return type("LoopStartMessage", (), {"channel": channel, "author": author})()


async def _no_wait(*_args):
    return False


@pytest.mark.parametrize("mode", ["silent", "notify", "act", "unknown"])
async def test_only_a_silent_loop_asks_for_the_opt_in(mode):
    bot, fake = build_loop([text_response("nothing new")])
    channel = FakeChannel(id=777)
    started = bot.agent_task_tools._handle_start_loop(
        _start_message(channel), {"goal": "watch the queue", "mode": mode, "max_iterations": 1}
    )
    assert started.startswith("Loop started")
    loop_id = next(iter(bot.loop_manager._loops))
    await asyncio.wait_for(bot.loop_manager._loops[loop_id]._task, timeout=5)
    assert fake.calls[0]["kwargs"].get("allow_empty_reply") is (True if mode == "silent" else None)


async def test_earlier_narration_never_becomes_a_silent_iterations_answer():
    script = [
        tool_call_response(("parse_time", {"text": "now"}), text="[NOTIFY] checking now"),
        text_response(""),
    ]
    bot, fake = build_loop(list(script))
    result = await bot.tool_loop.run_autonomous(
        "do the loop work", FakeChannel(id=777), None, "4242", allow_empty_reply=True
    )
    assert result == "" and not result.is_error
    # The narration stays in the conversation the model saw.
    assert any(
        message["role"] == "assistant" and "[NOTIFY] checking now" in str(message["content"])
        for message in fake.messages_of_call(1)
    )

    # Other modes keep today's behavior.
    bot, _ = build_loop(list(script))
    kept = await bot.tool_loop.run_autonomous(
        "do the loop work", FakeChannel(id=777), None, "4242"
    )
    assert kept == "[NOTIFY] checking now"


async def test_quiet_silent_iterations_post_nothing_count_no_error_and_alerts_still_work():
    quiet = [text_response("") for _ in range(4)]
    bot, fake = build_loop([*quiet, text_response("[ALERT] disk full\nLOOP_STOP")])
    bot.loop_manager._interruptible_wait = _no_wait
    channel = FakeChannel(id=777)
    bot.agent_task_tools._handle_start_loop(
        _start_message(channel),
        {"goal": "watch the disk", "mode": "silent", "max_iterations": 10},
    )
    loop_id = next(iter(bot.loop_manager._loops))
    info = bot.loop_manager._loops[loop_id]
    await asyncio.wait_for(info._task, timeout=5)
    assert [entry["content"] for entry in channel.sent] == ["[ALERT] disk full"]
    assert info.status == "completed"
    assert info.interval_seconds == 60  # no identical-output backoff
    assert len(fake.calls) == 5
    assert all(call["kwargs"].get("allow_empty_reply") is True for call in fake.calls)


async def test_silent_iteration_through_the_codex_client_makes_one_final_request(
    tmp_path, monkeypatch, caplog
):
    monkeypatch.chdir(tmp_path)
    client = _client(max_retries=3)
    call = [
        {
            "type": "response.output_item.added",
            "output_index": 0,
            "item": {"type": "function_call", "call_id": "c1", "name": "run_command"},
        },
        {
            "type": "response.output_item.done",
            "output_index": 0,
            "item": {
                "type": "function_call",
                "call_id": "c1",
                "name": "run_command",
                "arguments": '{"host":null,"command":"date"}',
            },
        },
        {"type": "response.completed", "response": {}},
    ]
    session = FakeSession([
        FakeResp(200, sse_lines=_sse(call)),
        FakeResp(200, sse_lines=_sse(REAL_SHAPE)),
    ])
    client._get_session = AsyncMock(return_value=session)
    monkeypatch.setattr(client, "chat", AsyncMock(return_value="COMPLETE"))
    bot, _ = build_loop([])
    bot.llm_gateway.codex_client = client
    bot.tool_executor.execute = AsyncMock(return_value=ToolResult(output="Tue Oct 21"))
    with caplog.at_level(logging.DEBUG, logger="odin.codex"):
        result = await bot.tool_loop.run_autonomous(
            "do the loop work", FakeChannel(id=777), None, "4242", allow_empty_reply=True
        )
    assert result == "" and not result.is_error
    assert session.calls == 2
    assert client.breaker._failure_count == 0
    assert _warnings(caplog) == []
