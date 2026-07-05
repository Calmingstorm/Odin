"""Characterization: mutation semantics the P1 seam-carve must preserve.

The RFC-002 P1 carve moved the chat/loop closure state onto per-turn
dataclasses. These tests pin the mutation-order properties the closures
provided implicitly (RFC-002 R1 gate): the caller's history list is never
mutated, tool results keep gather (call) order even when completion order
reverses, and op-details accumulate across iterations in execution order.
The retry-flag one-shot semantics, cascade order, cancel-check placement,
and validation state transitions are already pinned by
test_chat_tool_loop.py.
"""

from __future__ import annotations

import asyncio
import copy

import pytest

from tests.fakes import (
    FakeLLM,
    FakeMessage,
    make_bot,
    text_response,
    tool_call_response,
)


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def build(script):
    fake = FakeLLM(script)
    bot = make_bot(fake_llm=fake)
    return bot, fake


class TestCarveMutationSemantics:
    async def test_caller_history_list_not_mutated(self):
        """run() works on a COPY of history — preamble insertion, guard
        retries, and tool-result appends must never leak into the caller's
        session list."""
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                text_response("done"),
            ]
        )
        history = [
            {"role": "user", "content": "earlier request"},
            {"role": "assistant", "content": "earlier answer"},
            {"role": "user", "content": "parse the time"},
        ]
        snapshot = copy.deepcopy(history)
        history_id = id(history)

        await bot.tool_loop.run(FakeMessage("parse the time"), history)

        assert id(history) == history_id
        assert history == snapshot, "caller's history list was mutated by the turn"
        # ...while the LLM-visible list grew: preamble + assistant + results
        assert len(fake.messages_of_call(1)) > len(snapshot)

    async def test_gather_results_keep_call_order_under_reversed_completion(self):
        """Two parallel tools where the FIRST is slower: completion order
        reverses, but the single tool_result message preserves CALL order
        (asyncio.gather ordering — the trajectory/audit pairing relies on it)."""
        bot, fake = build(
            [
                tool_call_response(
                    ("parse_time", {"text": "slow"}),
                    ("list_schedules", {}),
                ),
                text_response("both done"),
            ]
        )
        completion_order: list[str] = []

        async def slow_parse_time(inp):
            await asyncio.sleep(0.05)
            completion_order.append("parse_time")
            return "slow-result"

        async def fast_list_schedules():
            completion_order.append("list_schedules")
            return "fast-result"

        bot.scheduling_tools._handle_parse_time = slow_parse_time
        bot.scheduling_tools._handle_list_schedules = fast_list_schedules

        text, _, is_error, tools_used, _ = await bot.tool_loop.run(
            FakeMessage("do both"), [{"role": "user", "content": "do both"}]
        )

        assert not is_error
        assert completion_order == ["list_schedules", "parse_time"], (
            "test premise broken: the fast tool should complete first"
        )
        results = fake.messages_of_call(1)[-1]["content"]
        assert [r["tool_use_id"] for r in results] == ["call-1", "call-2"], (
            "tool results must keep call order regardless of completion order"
        )
        assert results[0]["content"] == "slow-result"
        assert results[1]["content"] == "fast-result"

    async def test_op_details_accumulate_in_order_across_iterations(self):
        """_last_op_details holds ONE list per turn that grows across
        iterations in execution order (reflection reads the whole turn)."""
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                tool_call_response(("list_schedules", {})),
                text_response("done"),
            ]
        )
        msg = FakeMessage("two steps")
        await bot.tool_loop.run(msg, [{"role": "user", "content": "two steps"}])

        details = bot.channel_state.last_op_details[str(msg.channel.id)]
        assert [d["tool"] for d in details] == ["parse_time", "list_schedules"], (
            "op-details must accumulate across iterations in execution order"
        )
        # Same object is re-stashed each iteration — not reset between them
        assert all(set(d) >= {"tool", "input", "result", "error"} for d in details)
