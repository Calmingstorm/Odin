"""Quiet process permission is bounded waiting, never manufactured progress."""
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.discord import response_guards as guards
from src.discord import tool_loop
from src.tools.process_manager import MAX_LIFETIME_SECONDS, ProcessInfo, ProcessRegistry
from src.tools.result_validator import ToolResult
from tests.fakes import FakeMessage, text_response, tool_call_response
from tests.test_wait_stuck_integration import build, run_loop


def report(**changes):
    meta = dict(kind="process_output", pid=77, generation="a" * 32,
                status="running", exit_code=None, lifetime_deadline=13600)
    meta.update(changes)
    return ("[PID 77] status=running uptime=1s output_bytes=0\n(no output yet)"
            "\n[output retention] " + json.dumps(meta))


def fingerprint(text=None, elapsed=60, **args):
    return guards.wait_iteration_fingerprint(
        "manage_process", dict(action="poll", pid=77, wait_seconds=60, **args),
        report() if text is None else text, elapsed_seconds=elapsed,
    )


@pytest.fixture(autouse=True)
def clock(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    now = [10000.0]
    fake = SimpleNamespace(time=lambda: now[0], monotonic=lambda: now[0])
    monkeypatch.setattr(guards, "time", fake)
    monkeypatch.setattr(tool_loop, "time", fake)
    return now


def test_deadline_not_renewed_and_not_progress(clock):
    fp = fingerprint()
    tracker = guards.StuckLoopTracker()
    for _ in range(40):
        clock[0] += 60
        assert fingerprint() == fp
        tracker.record_fingerprint(fp)
        assert guards.bounded_process_wait_active(fp)
    assert tracker.check()  # strict judgment itself has NOT been weakened
    clock[0] = 13600
    assert not guards.bounded_process_wait_active(fp)
    assert not fingerprint().startswith("wait:bounded-process:")


@pytest.mark.parametrize("changes", [
    {"lifetime_deadline": None}, {"lifetime_deadline": True},
    {"lifetime_deadline": "13600"}, {"lifetime_deadline": float("nan")},
    {"lifetime_deadline": float("inf")}, {"lifetime_deadline": 9999},
    {"lifetime_deadline": 13601}, {"status": "completed"},
    {"exit_code": 0}, {"kind": "other"}, {"pid": 78},
    {"generation": "invalid"},
])
def test_bad_metadata_fails_closed(changes):
    assert not fingerprint(report(**changes)).startswith("wait:bounded-process:")


@pytest.mark.parametrize("text", [
    "No process with PID 77.", "Error: denied", "",
    report().split("\n[output retention]")[0],
    report().split("\n[output retention]")[0] + "\n[output retention] {",
    report().split("\n[output retention]")[0] + "\n[output retention] []",
    report().replace('"lifetime_deadline": 13600', '"missing": 13600'),
    report().replace("status=running", "status=completed"),
    json.dumps(dict(kind="process_output", status="running")),
])
def test_error_legacy_and_page_reads_keep_ladder(text):
    assert not fingerprint(text).startswith("wait:bounded-process:")


@pytest.mark.parametrize("elapsed", [0, 29.9, -1, float("nan"), float("inf")])
def test_requested_wait_alone_is_not_enough(elapsed):
    assert not fingerprint(elapsed=elapsed).startswith("wait:bounded-process:")


@pytest.mark.parametrize("requested", [None, True, "60", 0, 29, 121, float("nan")])
def test_requires_bounded_slow_request(requested):
    fp = guards.wait_iteration_fingerprint(
        "manage_process", {"pid": 77, "wait_seconds": requested}, report(), elapsed_seconds=60,
    )
    assert not fp.startswith("wait:bounded-process:")


def test_mismatched_pid_and_bad_saved_marker():
    fp = guards.wait_iteration_fingerprint(
        "manage_process", {"pid": 78, "wait_seconds": 60}, report(), elapsed_seconds=60,
    )
    assert not guards.bounded_process_wait_active(fp)
    assert not guards.bounded_process_wait_active("wait:bounded-process:a:bad")


def test_native_output_supplies_fixed_generation_deadline():
    info = ProcessInfo(77, "sleep 1", "localhost", 10000)
    text = ProcessRegistry._output_page(info, b"", 0, 4000, 8000, preview=True)
    meta = json.loads(text.rsplit("\n[output retention] ", 1)[1])
    assert meta["lifetime_deadline"] == info.start_time + MAX_LIFETIME_SECONDS
    assert guards.bounded_process_wait_active(fingerprint(text))


async def test_forty_silent_polls_finish_without_nudge(clock):
    call = tool_call_response(("manage_process", {"action": "poll", "pid": 77, "wait_seconds": 60}))
    bot, fake = build([call for _ in range(40)] + [text_response("finished")])

    async def execute(*a, **kw):
        clock[0] += 31
        return ToolResult(output=report(), tool_name="manage_process")

    bot.tool_executor.execute = AsyncMock(side_effect=execute)
    text, _, error, _, _ = await run_loop(bot, FakeMessage("watch quiet build"))
    assert text == "finished" and not error
    assert bot.tool_executor.execute.await_count == 40
    assert not any("no new output" in d.lower() for i in range(len(fake.calls))
                   for d in fake.developer_messages_of_call(i))


async def test_quiet_permission_expires_without_killing_job(clock):
    call = tool_call_response(("manage_process", {"action": "poll", "pid": 77, "wait_seconds": 60}))
    bot, _ = build([call for _ in range(8)])
    clock[0] = 13500

    async def execute(*a, **kw):
        clock[0] += 60
        return ToolResult(output=report(), tool_name="manage_process")

    bot.tool_executor.execute = AsyncMock(side_effect=execute)
    text, _, error, _, _ = await run_loop(bot, FakeMessage("watch"))
    assert error and "was not touched" in text
    assert bot.tool_executor.execute.await_count == 5


async def test_resume_rechecks_original_deadline(clock):
    from src.turn_state.codec import export_stuck_tracker, import_stuck_tracker

    tracker = guards.StuckLoopTracker()
    for _ in range(4):
        tracker.record_fingerprint(fingerprint())
    tracker.warned = True  # permission does not re-arm the existing warning
    restored = import_stuck_tracker(export_stuck_tracker(tracker), guards.StuckLoopTracker)
    st = SimpleNamespace(wait_judgment_pending=True, stuck_tracker=restored)
    bot, _ = build([])
    assert await bot.tool_loop._judge_entry_stuck(st) is None
    assert restored.warned and not st.wait_judgment_pending
    clock[0] = 13600
    assert not guards.bounded_process_wait_active(restored.last_fingerprint)


async def test_mixed_batch_still_stops_before_third_execution(clock):
    batch = tool_call_response(
        ("manage_process", {"action": "poll", "pid": 77, "wait_seconds": 60}),
        ("run_command", {"command": "date"}),
    )
    bot, _ = build([batch] * 4)

    async def execute(*a, **kw):
        clock[0] += 31
        return ToolResult(output=report(), tool_name="manage_process")

    bot.tool_executor.execute = AsyncMock(side_effect=execute)
    text, _, error, _, _ = await run_loop(bot, FakeMessage("watch"))
    assert error and "stuck tool-call cycle" in text
    assert bot.tool_executor.execute.await_count == 4
