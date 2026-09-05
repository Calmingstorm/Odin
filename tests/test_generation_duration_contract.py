import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.agents.manager import _run_agent
from src.llm.errors import LLMRequestError
from src.llm.timing import elapsed_ms
from src.tools.result_validator import ToolResult
from tests.characterization.test_autonomous_loop import build as build_loop
from tests.characterization.test_autonomous_loop import run_iteration
from tests.characterization.test_chat_tool_loop import build, run_loop
from tests.fakes import FakeMessage, text_response, tool_call_response
from tests.test_agent_transcript_contract import agent
from tests.test_usage_rollup import make_rollup, turn_record


@pytest.mark.parametrize("entry", ["chat", "loop", "agent"])
async def test_slow_tools_excluded_from_generation(entry, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    records = []

    async def save(turn, **kwargs):
        if entry != "agent":
            turn.finalize(kwargs.get("final_response", "done"))
        records.append(turn)

    async def slow(*args, **kwargs):
        await asyncio.sleep(.08)
        return "ok" if entry == "agent" else ToolResult(output="ok")

    saver = SimpleNamespace(enabled=True, save=save)
    if entry == "agent":
        callback = AsyncMock(side_effect=[
            {"tool_calls": [{"id": "one", "name": "run_command", "input": {}}]},
            {"text": "done"},
        ])
        await _run_agent(agent(), "", [], callback, slow, trajectory_saver=saver)
    else:
        bot, _ = (build if entry == "chat" else build_loop)([
            tool_call_response(("run_command", {"command": "x"})), text_response("done"),
        ])
        bot.turn_recorder._trajectory_saver = saver
        bot.tool_executor.execute = slow
        if entry == "chat":
            await run_loop(bot, FakeMessage("go"))
        else:
            await run_iteration(bot)
    turn = records[-1]
    assert 0 < turn.iterations[0].duration_ms < 60
    assert turn.iterations[0].tool_duration_ms >= 70
    assert turn.total_duration_ms == sum(it.duration_ms for it in turn.iterations)
    assert turn.end_to_end_duration_ms >= 70


def test_positive_submillisecond_floor(monkeypatch):
    monkeypatch.setattr("src.llm.timing.time.monotonic_ns", lambda: 1001)
    assert elapsed_ms(1000) == 1


async def test_failed_turn_not_multiplied_by_generations(tmp_path):
    rollup = make_rollup(tmp_path)
    record = turn_record(iterations=[{"iteration": i, "provider": "test", "model": "m"}
                                     for i in range(3)])
    record["is_error"] = True
    await rollup.observe_trajectory(record, "turn")
    summary = await rollup.summary()
    assert summary["serving"][0]["terminal_error_turns"] == 1


@pytest.mark.parametrize("entry", ["chat", "loop", "agent"])
async def test_fully_failed_generation_has_no_row(entry, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    records = []

    async def save(turn, **kwargs):
        records.append(turn)

    saver = SimpleNamespace(enabled=True, save=save)
    failure = LLMRequestError("invalid request")
    if entry == "agent":
        await _run_agent(agent(), "", [], AsyncMock(side_effect=failure), AsyncMock(),
                         trajectory_saver=saver)
    else:
        bot, _ = (build if entry == "chat" else build_loop)([failure] * 5)
        bot.turn_recorder._trajectory_saver = saver
        if entry == "chat":
            await run_loop(bot, FakeMessage("go"))
        else:
            await run_iteration(bot)
    assert records and not records[-1].iterations
    assert records[-1].total_duration_ms == 0


@pytest.mark.parametrize("entry", ["chat", "loop", "agent"])
async def test_submillisecond_generation_persisted_at_production_seam(entry, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    # Advance one nanosecond per monotonic sample; no sleep or wall-clock dependence.
    from itertools import count

    clock = count(1000)
    monkeypatch.setattr("src.llm.timing.time.monotonic_ns", lambda: next(clock))
    records = []

    async def save(turn, **kwargs):
        records.append(turn)

    saver = SimpleNamespace(enabled=True, save=save)
    if entry == "agent":
        await _run_agent(agent(), "", [], AsyncMock(return_value={"text": "done"}),
                         AsyncMock(), trajectory_saver=saver)
    else:
        bot, _ = (build if entry == "chat" else build_loop)([text_response("done")])
        bot.turn_recorder._trajectory_saver = saver
        if entry == "chat":
            await run_loop(bot, FakeMessage("go"))
        else:
            await run_iteration(bot)
    assert records[-1].iterations[0].duration_ms == 1
