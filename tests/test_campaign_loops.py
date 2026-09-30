"""Real autonomous runner/manager regressions, with scripted model boundaries."""
import asyncio

import pytest

from src.tools.autonomous_loop import LoopManager
from tests.characterization.test_autonomous_loop import build, run_iteration
from tests.fakes import FakeChannel, text_response, tool_call_response


@pytest.mark.parametrize("mode,text", [
    ("notify", "Final findings"), ("act", "Final findings"),
    ("silent", "[ALERT] Final findings"), ("silent", "unremarkable"),
])
async def test_terminal_findings_obey_mode_without_sentinel(mode, text):
    manager = LoopManager()
    channel = FakeChannel(id=777)

    async def iteration(*args):
        return text + "\nLOOP_STOP"

    loop_id = manager.start_loop("check", channel, "4242", "tester", iteration, mode=mode)
    await manager._loops[loop_id]._task
    sent = str(channel.sent)
    assert "LOOP_STOP" not in sent
    assert ("Final findings" in sent) == (mode != "silent" or "[ALERT]" in text)
    assert manager._loops[loop_id].status == "completed"


@pytest.mark.parametrize("failed", [False, True])
async def test_final_iteration_never_sleeps(failed):
    manager = LoopManager()
    waits = []

    async def wait(info, seconds):
        waits.append(seconds)
        return False

    manager._interruptible_wait = wait

    async def iteration(*args):
        if failed:
            raise RuntimeError("provider unavailable")
        return "done"

    channel = FakeChannel(id=777)
    loop_id = manager.start_loop("check", channel, "4242", "tester", iteration,
                                 max_iterations=1, interval_seconds=10000)
    await manager._loops[loop_id]._task
    assert waits == []
    assert manager._loops[loop_id].status == "completed"


@pytest.mark.parametrize("kind", ["provider", "cap", "absent"])
async def test_actual_failed_runner_stops_manager_after_five(tmp_path, monkeypatch, kind):
    monkeypatch.chdir(tmp_path)
    script = ([RuntimeError("provider failed")] * 6 if kind == "provider" else
              [tool_call_response(("parse_time", {"expression": "now"}))] * 6)
    bot, fake = build(script, tools={"max_tool_iterations_loop": 1})
    if kind == "absent":
        bot.llm_gateway.codex_client = None
    manager = bot.loop_manager
    waits = []

    async def wait(info, seconds):
        waits.append(seconds)
        return False

    manager._interruptible_wait = wait

    async def iteration(prompt, channel, prev, cancel_event):
        return await bot.tool_loop.run_autonomous(prompt, channel, prev, "4242",
                                                  cancel_event=cancel_event)

    channel = FakeChannel(id=777)
    loop_id = manager.start_loop("check", channel, "4242", "tester", iteration,
                                 max_iterations=6, mode="notify", interval_seconds=10)
    await manager._loops[loop_id]._task
    info = manager._loops[loop_id]
    assert info.status == "error"
    assert info.iteration_count == 5
    assert waits == [20, 40, 80, 160]
    assert "consecutive errors" in str(channel.sent)


async def test_empty_natural_completion_after_batched_tools_is_success(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    bot, fake = build([
        tool_call_response(("parse_time", {"expression": "now"}),
                           ("parse_time", {"expression": "now"})),
        text_response(""),
    ], tools={"max_tool_iterations_loop": 2})
    result = await run_iteration(bot)
    assert result == ""
    assert not result.is_error
    assert bot.turn_recorder._maybe_loop_reflect.calls[-1]["is_error"] is False
    assert len(fake.calls) == 2


async def test_legitimate_generation_is_awaited_and_error_quotes_are_not_failures():
    manager, channel = LoopManager(), FakeChannel(id=777)
    entered, release = asyncio.Event(), asyncio.Event()

    async def iteration(*args):
        entered.set()
        await release.wait()
        return "Quoted diagnostic: ERROR provider failed. Investigation completed."

    loop_id = manager.start_loop("investigate", channel, "4242", "tester", iteration,
                                 max_iterations=1)
    task = manager._loops[loop_id]._task
    await entered.wait()
    await asyncio.sleep(0)
    assert manager._loops[loop_id].status == "running" and not task.done()
    release.set()
    await task
    assert manager._loops[loop_id].status == "completed"
    assert "Investigation completed" in str(channel.sent)


async def test_real_success_resets_consecutive_failed_iteration_count(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    bot, fake = build([RuntimeError("failed")] * 4 + [text_response("recovered")]
                      + [RuntimeError("failed again")] * 4)
    manager = bot.loop_manager

    async def wait(*args):
        return False

    manager._interruptible_wait = wait

    async def iteration(prompt, channel, prev, cancel_event):
        return await bot.tool_loop.run_autonomous(prompt, channel, prev, "4242",
                                                  cancel_event=cancel_event)

    loop_id = manager.start_loop("check", FakeChannel(id=777), "4242", "tester", iteration,
                                 max_iterations=9)
    await manager._loops[loop_id]._task
    assert manager._loops[loop_id].status == "completed"
    assert manager._loops[loop_id].iteration_count == 9
    assert len(fake.calls) == 9
