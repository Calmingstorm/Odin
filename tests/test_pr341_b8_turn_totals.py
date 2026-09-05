import asyncio
import json
from types import SimpleNamespace

import pytest

from src.discord.turn_recorder import TurnRecorder
from src.llm.errors import LLMRequestError
from src.tools.result_validator import ToolResult
from src.trajectories.saver import ToolIteration, TrajectorySaver, TrajectoryTurn
from src.web.chat import WebMessage, process_web_chat
from tests.characterization.test_chat_tool_loop import build, run_loop
from tests.fakes import FakeMessage, text_response, tool_call_response
from tests.test_usage_rollup import drain, make_rollup


@pytest.mark.parametrize("surface", ["chat", "web"])
@pytest.mark.parametrize("failure", [False, True])
async def test_real_turn_to_jsonl_to_usage_has_generation_totals(
    tmp_path, monkeypatch, surface, failure,
):
    monkeypatch.chdir(tmp_path)
    rollup = make_rollup(tmp_path)
    saver = TrajectorySaver(str(tmp_path / "trajectories"), usage_observer=rollup)
    responses = ([LLMRequestError("invalid request")] * 5 if failure else [
        tool_call_response(("run_command", {"command": "fixture"})),
        text_response("done"),
    ])
    bot, _ = build(responses)
    bot.turn_recorder._trajectory_saver = saver

    async def slow_tool(*args, **kwargs):
        await asyncio.sleep(.08)
        return ToolResult(output="ok")

    bot.tool_executor.execute = slow_tool
    if surface == "web":
        result = await process_web_chat(
            bot, "go", "4242", user_id="123", username="tester", persist_channel_lock=False,
        )
        assert result["is_error"] == failure
    else:
        result = await run_loop(bot, FakeMessage("go"))
        assert result[2] == failure
    await drain(rollup)
    paths = list((tmp_path / "trajectories").glob("*.jsonl"))
    assert len(paths) == 1
    record = json.loads(paths[0].read_text().splitlines()[-1])
    assert record["source"] == ("web" if surface == "web" else "discord")
    total = sum(it["duration_ms"] for it in record["iterations"])
    assert record["total_duration_ms"] == total
    assert record["end_to_end_duration_ms"] > 0
    summary = await rollup.summary()
    activity = summary["activity"][0]
    if failure:
        assert total == 0 and not record["iterations"]
        assert activity["duration_ms"] is None and activity["duration_samples"] == 0
    else:
        assert total > 0
        assert record["iterations"][0]["tool_duration_ms"] >= 70
        assert record["end_to_end_duration_ms"] >= total + 70
        assert activity["duration_ms"] == total and activity["duration_samples"] == 1


@pytest.mark.parametrize("surface", ["chat", "web"])
async def test_positive_floor_and_total_at_real_recorder(tmp_path, monkeypatch, surface):
    from itertools import count

    monkeypatch.chdir(tmp_path)
    clock = count(1000)
    monkeypatch.setattr("src.llm.timing.time.monotonic_ns", lambda: next(clock))
    # The dataclass captured its default_factory at import time. Put its start
    # sample on the same synthetic clock without replacing recorder/finalizer.
    class TimedTurn(TrajectoryTurn):
        def __init__(self, **kwargs):
            super().__init__(**kwargs, _started_ns=next(clock))

    monkeypatch.setattr("src.trajectories.saver.TrajectoryTurn", TimedTurn)
    saver = TrajectorySaver(str(tmp_path / "trajectories"))
    bot, _ = build([text_response("done")])
    bot.turn_recorder._trajectory_saver = saver
    msg = (WebMessage(channel_id="4242", user_id="123", username="tester", content="go")
           if surface == "web" else FakeMessage("go"))
    await run_loop(bot, msg)
    record = json.loads(next(saver.directory.glob("*.jsonl")).read_text())
    assert record["total_duration_ms"] == record["iterations"][0]["duration_ms"] == 1
    assert record["end_to_end_duration_ms"] == 1


async def test_recorder_timing_preserves_flags_tools_tokens_and_checkpoint_policy(tmp_path):
    observed = []
    saver = TrajectorySaver(str(tmp_path), usage_observer=SimpleNamespace(
        schedule_trajectory=lambda *args: observed.append(args),
    ))
    recorder = TurnRecorder(
        get_config=lambda: None, trajectory_saver=saver, reflector=None,
        outbound_webhook_dispatcher=None, loop_reflection_gate=None,
    )
    turn = TrajectoryTurn(
        handoff=True, is_error=True, tools_used=["explicit"], final_response="preserved",
        system_prompt="no token fallback should be manufactured",
        iterations=[ToolIteration(0, duration_ms=3, tool_duration_ms=999)],
    )
    await recorder._save_turn_trajectory(turn, observe_usage=False)
    assert not observed
    assert turn.total_duration_ms == 3 and turn.end_to_end_duration_ms > 0
    assert turn.handoff and turn.is_error and turn.tools_used == ["explicit"]
    assert turn.final_response == "preserved" and turn.total_input_tokens == 0
    turn.iterations.append(ToolIteration(1, duration_ms=7, input_tokens=11, output_tokens=13))
    await recorder._save_turn_trajectory(turn, final_response="done", tools_used=["override"])
    record = observed[0][0]
    assert record["total_duration_ms"] == 10
    assert record["total_input_tokens"] == 11 and record["total_output_tokens"] == 13
    assert record["tools_used"] == ["override"] and record["final_response"] == "done"
    assert record["handoff"] and record["is_error"] and record["usage_settled"]
