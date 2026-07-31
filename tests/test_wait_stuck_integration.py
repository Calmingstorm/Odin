"""Wait-class stuck detection through the real chat tool loop.

Pins the post-execution judgment path (design settled with Odin,
2026-07-31): an iteration that is exactly one wait-class call is judged on
a result-aware fingerprint AFTER execution — progressing waits never trip,
frozen waits walk the same warn-once-then-terminate ladder, and mixed
batches keep the pre-execution argument-only detector byte-for-byte.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from src.tools.result_validator import ToolResult
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


def poll_call():
    return tool_call_response(("manage_process", {"action": "poll", "pid": 77}))


def poll_result(*, status="running", exit_code=None, uptime=3, out_bytes=100):
    line = f"[PID 77] status={status}"
    if exit_code is not None:
        line += f" exit_code={exit_code}"
    line += f" uptime={uptime}s output_bytes={out_bytes}"
    return ToolResult(output=line + "\nbuild output\n", tool_name="manage_process")


def build(script):
    fake = FakeLLM(script)
    bot = make_bot(fake_llm=fake)
    return bot, fake


async def run_loop(bot, msg):
    return await bot.tool_loop.run(msg, history=[], system_prompt_override=None)


def _developer_texts(fake):
    return [
        dev
        for i in range(len(fake.calls))
        for dev in fake.developer_messages_of_call(i)
    ]


class TestProgressingWaitNeverTrips:
    async def test_advancing_output_bytes_poll_forever(self):
        """Six identical-argument polls with growing output: no nudge, no
        termination — the exact false positive that killed the 2026-07-30
        animal-gif-catalog build turn."""
        bot, fake = build([poll_call() for _ in range(6)] + [text_response("build finished")])
        bot.tool_executor.execute = AsyncMock(
            side_effect=[
                poll_result(uptime=3 * (i + 1), out_bytes=100 * (i + 1)) for i in range(6)
            ]
        )
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("watch the build"))
        assert text == "build finished"
        assert is_error is False
        assert bot.tool_executor.execute.await_count == 6
        assert not any("no new output" in d for d in _developer_texts(fake))

    async def test_status_transition_counts_as_progress(self):
        """running → completed with identical bytes is progress, not a
        repeat — the silent-finish transition must never be penalized."""
        bot, fake = build(
            [poll_call(), poll_call(), poll_call(), text_response("done")]
        )
        bot.tool_executor.execute = AsyncMock(
            side_effect=[
                poll_result(uptime=3),
                poll_result(uptime=6),
                poll_result(status="completed", exit_code=0, uptime=9),
            ]
        )
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("watch"))
        assert text == "done"
        assert is_error is False


class TestFrozenWaitLadder:
    async def test_frozen_poll_nudges_then_terminates_post_execution(self):
        """Identical signatures (uptime advancing, bytes frozen) walk the
        ladder — and unlike the argument detector, EVERY iteration
        executed: the fourth poll's result was recorded before the kill
        (Odin's ordering: terminate only after the latest result is
        durable)."""
        bot, fake = build([poll_call() for _ in range(5)])
        bot.tool_executor.execute = AsyncMock(
            side_effect=[poll_result(uptime=3 * (i + 1), out_bytes=500) for i in range(5)]
        )
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("watch"))
        assert is_error is True
        assert "no observable progress" in text
        assert "was not touched" in text  # the detached work is never killed
        # Post-execution semantics: the tripping iterations all executed.
        assert bot.tool_executor.execute.await_count == 4
        # The wait-aware nudge (not the generic one) was injected once.
        final_devs = fake.developer_messages_of_call(len(fake.calls) - 1)
        assert sum("wait_seconds" in d for d in final_devs) == 1
        assert not any(
            "repeating the same tool-call sequence" in d for d in final_devs
        )

    async def test_nudge_respected_breaks_the_pattern(self):
        """A different call after the nudge breaks the tail — no kill."""
        bot, fake = build(
            [
                poll_call(),
                poll_call(),
                poll_call(),  # third frozen signature → nudge
                tool_call_response(("parse_time", {"text": "now"})),
                text_response("acted on it"),
            ]
        )
        bot.tool_executor.execute = AsyncMock(
            side_effect=[poll_result(uptime=3 * (i + 1), out_bytes=500) for i in range(3)]
        )
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("watch"))
        assert text == "acted on it"
        assert is_error is False

    async def test_warned_is_one_shot_across_later_freeze(self):
        """Progress after the nudge never re-arms the warning budget: a
        later frozen trio terminates immediately, no second nudge."""
        script = (
            [poll_call(), poll_call(), poll_call()]  # freeze → nudge
            + [tool_call_response(("parse_time", {"text": "now"}))]  # breaks tail
            + [poll_call(), poll_call(), poll_call()]  # freezes again → kill
        )
        bot, fake = build(script)
        results = [poll_result(uptime=3 * (i + 1), out_bytes=500) for i in range(3)] + [
            poll_result(uptime=60 + 3 * (i + 1), out_bytes=500) for i in range(3)
        ]
        bot.tool_executor.execute = AsyncMock(side_effect=results)
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("watch"))
        assert is_error is True
        assert "no observable progress" in text
        # The transcript accumulates, so the FINAL call's developer messages
        # hold every injection exactly once: one nudge total, ever.
        final_devs = fake.developer_messages_of_call(len(fake.calls) - 1)
        assert sum("wait_seconds" in d for d in final_devs) == 1

    async def test_terminal_target_repetition_gets_ordinary_guidance(self):
        """Re-polling a finished process is not 'still running' — the nudge
        must not claim the target is alive."""
        bot, fake = build(
            [poll_call(), poll_call(), poll_call(), text_response("ok, it exited 0")]
        )
        bot.tool_executor.execute = AsyncMock(
            side_effect=[
                poll_result(status="completed", exit_code=0, uptime=9 + i)
                for i in range(3)
            ]
        )
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("watch"))
        assert text == "ok, it exited 0"
        assert is_error is False
        devs = _developer_texts(fake)
        assert any("finished or missing target" in d for d in devs)
        assert not any("wait_seconds" in d for d in devs)


class TestMixedBatchKeepsStrictDetector:
    async def test_poll_plus_side_effect_uses_pre_execution_detector(self):
        """Two-call batches never take the wait path: the argument-only
        detector fires BEFORE execution with the original messages."""
        batch = tool_call_response(
            ("manage_process", {"action": "poll", "pid": 77}),
            ("run_command", {"command": "date"}),
        )
        bot, fake = build([batch, batch, batch, batch])
        bot.tool_executor.execute = AsyncMock(
            side_effect=lambda *a, **k: poll_result(out_bytes=999)
        )
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("watch"))
        assert is_error is True
        assert "stuck tool-call cycle" in text  # the ORIGINAL terminal text
        devs = _developer_texts(fake)
        assert any("repeating the same tool-call sequence" in d for d in devs)
        assert not any("wait_seconds" in d for d in devs)
        # Pre-execution kill: the third (nudge) and fourth (kill) batches
        # never executed — 2 batches × 2 calls.
        assert bot.tool_executor.execute.await_count == 4
