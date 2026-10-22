"""A failing tool batch settles every member before the turn fails (#723).

A batch member re-raises on purpose when its ledger settlement fails, so the
turn fails closed. Plain ``asyncio.gather`` propagated that first exception
while sibling calls were still running: the escape handler then cleared the
turn's active request and marked it FAILED with a tool still executing.
"""
from __future__ import annotations

import asyncio
import types

import pytest

from src.discord.tool_loop import ToolLoopRunner


class _SettleError(Exception):
    pass


class _Typing:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _Durability:
    async def on_llm_response(self, st, calls):
        return None


def _turn():
    return types.SimpleNamespace(
        durability=_Durability(),
        message=types.SimpleNamespace(channel=types.SimpleNamespace(typing=_Typing)),
        messages=[],
    )


def _block(name, call_id):
    return types.SimpleNamespace(name=name, id=call_id, input={})


async def test_failure_propagates_only_after_every_sibling_settled():
    runner = object.__new__(ToolLoopRunner)
    sibling_release = asyncio.Event()
    events = []

    async def fake_run(st, block):
        if block.name == "fails_settle":
            events.append("settlement failed")
            raise _SettleError("ledger settle failed")
        events.append("sibling started")
        await sibling_release.wait()
        events.append("sibling settled")
        return {"type": "tool_result", "tool_use_id": block.id, "content": "done"}

    runner._run_one_tool_with_timeout = fake_run
    st = _turn()
    batch = asyncio.create_task(runner._execute_tool_calls(
        st, [_block("slow_sibling", "a"), _block("fails_settle", "b")]))
    await asyncio.sleep(0.05)
    assert "settlement failed" in events
    assert not batch.done()  # the turn is still alive while the sibling runs
    sibling_release.set()
    with pytest.raises(_SettleError):
        await batch
    assert events[-1] == "sibling settled"
    assert st.messages == []  # a failed batch still appends no results


async def test_successful_batch_returns_results_in_call_order():
    runner = object.__new__(ToolLoopRunner)

    async def fake_run(st, block):
        await asyncio.sleep(0.02 if block.id == "a" else 0)
        return {"type": "tool_result", "tool_use_id": block.id, "content": block.id}

    runner._run_one_tool_with_timeout = fake_run
    st = _turn()
    results = await runner._execute_tool_calls(st, [_block("x", "a"), _block("y", "b")])
    assert [r["tool_use_id"] for r in results] == ["a", "b"]
    assert st.messages == [{"role": "user", "content": results}]


async def test_cancelling_the_turn_still_cancels_the_batch():
    runner = object.__new__(ToolLoopRunner)
    cancelled = []

    async def fake_run(st, block):
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.append(block.id)
            raise

    runner._run_one_tool_with_timeout = fake_run
    batch = asyncio.create_task(runner._execute_tool_calls(
        _turn(), [_block("x", "a"), _block("y", "b")]))
    await asyncio.sleep(0.02)
    batch.cancel()
    with pytest.raises(asyncio.CancelledError):
        await batch
    assert sorted(cancelled) == ["a", "b"]
