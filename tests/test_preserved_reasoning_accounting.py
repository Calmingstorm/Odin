"""Regression coverage for GLM preserved reasoning in context sizing (#385)."""

from __future__ import annotations

import json
from types import SimpleNamespace

from src.agents.manager import AgentInfo, _call_llm_with_recovery
from src.config.schema import ContextCompressionConfig
from src.discord.tool_loop import ToolLoopRunner, build_assistant_content
from src.llm.context_compressor import (
    SurfaceBoundary,
    compress_tool_context,
    emergency_compress_for_window,
    estimate_message_chars,
)
from src.llm.errors import LLMContextLengthError
from src.llm.openai_compatible import OpenAICompatibleClient


def _client(*, preserve: bool = True) -> OpenAICompatibleClient:
    return OpenAICompatibleClient(
        "test",
        model="glm-fixture",
        base_url="https://example.invalid/v4",
        reasoning_dialect="glm_thinking",
        glm_clear_thinking=not preserve,
        reasoning_content_feedback_policy="preserve" if preserve else "do_not_echo",
    )


def _transcript(n: int, reasoning_chars: int, result_chars: int = 2) -> list[dict]:
    messages: list[dict] = [{"role": "user", "content": "TASK"}]
    for i in range(n):
        content = []
        if reasoning_chars:
            content.append(
                {"type": "reasoning_content", "reasoning_content": "r" * reasoning_chars}
            )
        content.append(
            {"type": "tool_use", "id": f"tu_{i}", "name": "read_file", "input": {"path": f"f{i}"}}
        )
        messages.extend(
            [
                {"role": "assistant", "content": content},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": f"tu_{i}",
                            "content": "x" * result_chars,
                        }
                    ],
                },
            ]
        )
    return messages


def _wire_reasoning_chars(messages: list[dict]) -> int:
    wire = _client()._convert_messages(messages, "")
    return sum(len(entry.get("reasoning_content") or "") for entry in wire)


def _blocks(messages: list[dict], block_type: str) -> list[dict]:
    return [
        block
        for msg in messages
        if isinstance(msg.get("content"), list)
        for block in msg["content"]
        if isinstance(block, dict) and block.get("type") == block_type
    ]


def test_estimate_counts_every_replayed_reasoning_char():
    messages = _transcript(3, 10_000)
    assert _wire_reasoning_chars(messages) == 30_000
    # Guard: the default mode still never puts reasoning in history.
    raw = {
        "choices": [
            {
                "message": {
                    "content": "",
                    "reasoning_content": "r" * 500,
                    "tool_calls": [
                        {"id": "c1", "function": {"name": "read_file", "arguments": "{}"}}
                    ],
                }
            }
        ]
    }
    response = _client(preserve=False)._parse_response(raw)
    assert response.reasoning_content is None
    assert [b["type"] for b in build_assistant_content(response)] == ["tool_use"]
    assert estimate_message_chars(messages) - estimate_message_chars(_transcript(3, 0)) == 30_000


def test_estimate_charges_list_tool_results_as_openai_wire_json_without_mutating():
    structured_result = [
        {"type": "text", "text": "payload"},
        {"type": "resource", "uri": "file://large", "metadata": {"size": 12345}},
    ]
    messages = [
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "c1",
                                         "content": structured_result}]}
    ]
    wire = _client()._convert_messages(messages, "")
    expected = len(json.dumps(structured_result))

    assert wire == [
        {"role": "tool", "tool_call_id": "c1", "content": json.dumps(structured_result)}
    ]
    assert estimate_message_chars(messages) == len("user") + expected
    assert messages[0]["content"][0]["content"] is structured_result
    assert messages[0]["content"][0]["content"] == structured_result


def test_estimate_preserves_string_tool_result_accounting():
    messages = [{"role": "user", "content": [{"type": "tool_result", "content": "plain"}]}]
    assert estimate_message_chars(messages) == len("user") + len("plain")


def test_estimate_preserves_dict_block_accounting():
    value = {"path": "file.txt", "nested": {"size": 12}}
    messages = [{"role": "assistant", "content": [{"type": "tool_use", "input": value}]}]
    assert estimate_message_chars(messages) == len("assistant") + len(json.dumps(value))


def test_soft_compaction_triggers_on_reasoning_growth():
    out, compressed = compress_tool_context(
        _transcript(6, 10_000), max_context_chars=5_000, keep_recent=2
    )
    assert compressed == 4
    assert [b["reasoning_content"] for b in _blocks(out, "reasoning_content")] == ["r" * 10_000] * 2


def test_emergency_refuses_fit_while_newest_reasoning_exceeds_target():
    messages = _transcript(1, 10_000)
    out, report = emergency_compress_for_window(messages, target_chars=500)
    assert report["fits"] is False
    assert out is messages
    assert report["compressed_chars"] >= _wire_reasoning_chars(messages)


def test_emergency_counts_kept_reasoning_and_never_edits_it():
    messages = _transcript(3, 10_000, result_chars=30_000)
    out, report = emergency_compress_for_window(messages, target_chars=25_000)
    assert report["fits"] is True
    assert _wire_reasoning_chars(out) <= report["compressed_chars"] <= 25_000
    assert report["compressed_chars"] == estimate_message_chars(out)
    assert all(b["reasoning_content"] == "r" * 10_000 for b in _blocks(out, "reasoning_content"))
    assert len(_blocks(out, "tool_result")[-1]["content"]) > 0
    # Guard: fair-share truncation without reasoning remains byte-identical.
    out, report = emergency_compress_for_window(
        _transcript(3, 0, result_chars=30_000), target_chars=25_000
    )
    assert (report["fits"], report["compressed_chars"], report["iterations_kept"]) == (
        True,
        24_998,
        3,
    )
    assert [len(b["content"]) for b in _blocks(out, "tool_result")] == [8_303] * 3


def test_boundary_mode_counts_reasoning():
    messages = [{"role": "user", "content": "old history"}, {"role": "user", "content": "REQ"}]
    messages += _transcript(3, 10_000, result_chars=30_000)[1:]
    out, report = emergency_compress_for_window(
        messages, target_chars=25_000, boundary=SurfaceBoundary(request_start=1, envelope_len=1)
    )
    assert report["fits"] is True
    assert _wire_reasoning_chars(out) <= report["compressed_chars"] <= 25_000


def test_chat_soft_pass_compacts_on_preserved_reasoning_growth():
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._get_context_compressor = lambda: ContextCompressionConfig(keep_recent_iterations=2)
    runner._get_compression_stats = lambda: None
    runner._window_observer = None
    st = SimpleNamespace(iteration=6, messages=_transcript(6, 10_000), _boundary_envelope_len=1)
    assert runner._maybe_compress(st, budget_snapshot=SimpleNamespace(primary_chars=5_000))
    assert len(_blocks(st.messages, "reasoning_content")) == 2


def _agent(messages: list[dict]) -> AgentInfo:
    agent = AgentInfo(
        id="reasoning",
        label="t",
        goal="g",
        channel_id="c",
        requester_id="u",
        requester_name="user",
    )
    agent.messages = messages
    agent.iteration_timeout = 30
    return agent


async def test_preserved_reasoning_overflow_is_not_resent_as_fitting():
    agent = _agent(_transcript(1, 10_000))
    sent = []

    async def callback(messages, system_prompt, tools, generation_state=None):
        sent.append(_wire_reasoning_chars(messages))
        raise LLMContextLengthError("overflow", provider="compat", code="context_length_exceeded")

    assert (
        await _call_llm_with_recovery(
            agent, callback, "sys", [], rescue_ladder=(500, 250), generation_state={}
        )
        is None
    )
    assert sent == [10_000]
    assert [r["fits"] for r in agent.context_recoveries] == [False]


async def test_preserved_reasoning_rescue_drops_older_iterations_and_keeps_newest():
    agent = _agent(_transcript(3, 10_000))
    sent = []

    async def callback(messages, system_prompt, tools, generation_state=None):
        sent.append((estimate_message_chars(messages), _wire_reasoning_chars(messages)))
        if len(sent) == 1:
            raise LLMContextLengthError(
                "overflow", provider="compat", code="context_length_exceeded"
            )
        return {"text": "DONE", "tool_calls": [], "stop_reason": "end_turn"}

    assert (
        await _call_llm_with_recovery(
            agent, callback, "sys", [], rescue_ladder=(15_000,), generation_state={}
        )
        is not None
    )
    assert len(sent) == 2
    assert sent[1][1] == 10_000
    assert sent[1][0] <= 15_000
