"""Quiet process permission is bounded waiting, never manufactured progress.

Wait fingerprints also read the poll header the process manager really writes.
"""
import json
import time
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


# The header the process manager really writes (2026-11-17 battery). Every local
# start sets effective_shell (since v4.12.0), which the header puts between the
# status and output_bytes. A fixed field order lost the byte count, so every
# running poll fingerprinted alike and a job printing a line a second walked the
# frozen-wait ladder. These render through _output_page, never a typed header.


def real_poll(*, data=b"tick 1\n", uptime=7, effective_shell="bash", pid=142784, **fields):
    info = ProcessInfo(
        pid, "sh -c 'echo tick'", "localhost", time.time() - uptime,
        effective_shell=effective_shell, total_output_bytes=len(data),
        retained_bytes=len(data), **fields,
    )
    return ProcessRegistry._output_page(info, data, 0, 4000, 8000, preview=True)


def ticks(n):
    return b"".join(b"tick %d\n" % i for i in range(1, n + 1))


def test_real_header_has_fields_between_status_and_bytes():
    header = real_poll().split("\n", 1)[0]
    assert header.startswith("[PID 142784] status=running effective_shell=bash uptime=")
    assert header.endswith(" output_bytes=7")


def test_real_header_output_growth_is_progress():
    a = guards.wait_iteration_fingerprint("manage_process", {}, real_poll(data=ticks(1)))
    b = guards.wait_iteration_fingerprint(
        "manage_process", {}, real_poll(data=ticks(2), uptime=8),
    )
    assert a == "wait:mp:142784:running::7"
    assert b == "wait:mp:142784:running::14"


def test_real_header_frozen_output_still_matches():
    """Uptime alone is still not progress: a silent job keeps tripping."""
    a = guards.wait_iteration_fingerprint("manage_process", {}, real_poll(uptime=7))
    b = guards.wait_iteration_fingerprint("manage_process", {}, real_poll(uptime=300))
    assert a == b


@pytest.mark.parametrize("fields", [
    {"effective_shell": None},
    {"effective_shell": "sh"},
    {"transport_unknown": True},
    {"status": "completed", "exit_code": 0},
    {"status": "failed", "exit_code": 4},
    {"status": "killed", "exit_code": -15, "termination_reason": "cancellation"},
    {"status": "killed", "exit_code": -9, "termination_reason": "timeout",
     "transport_unknown": True},
])
def test_every_rendered_header_shape(fields):
    data = ticks(2)
    text = real_poll(data=data, **fields)
    status = fields.get("status", "running")
    exit_code = fields.get("exit_code")
    expected_exit = "" if exit_code is None else exit_code
    assert guards.wait_iteration_fingerprint("manage_process", {}, text) == (
        f"wait:mp:142784:{status}:{expected_exit}:{len(data)}"
    )
    assert guards.wait_target_alive("manage_process", text) is (status == "running")


def test_bytes_come_from_the_header_line_only():
    """Output text can't stand in for the byte count, and a header that has
    none (an unknown remote outcome) stays without one."""
    text = "[PID 5] status=unknown outcome_unknown=true\nreply said output_bytes=12"
    assert guards.wait_iteration_fingerprint("manage_process", {}, text) == "wait:mp:5:unknown::"


def quick_polls(n):
    return [tool_call_response(("manage_process", {"action": "poll", "pid": 77}))
            for _ in range(n)]


def real_results(sizes):
    return [ToolResult(output=real_poll(pid=77, uptime=8 * (i + 1), data=ticks(n)),
                       tool_name="manage_process") for i, n in enumerate(sizes)]


def wait_nudges(fake):
    """The transcript accumulates, so the final call holds every injection."""
    return sum("no new output" in d.lower()
               for d in fake.developer_messages_of_call(len(fake.calls) - 1))


async def test_real_header_growing_output_never_trips():
    bot, fake = build(quick_polls(6) + [text_response("ticks done")])
    bot.tool_executor.execute = AsyncMock(side_effect=real_results([8, 16, 24, 32, 40, 48]))
    text, _, error, _, _ = await run_loop(bot, FakeMessage("watch the ticks"))
    assert text == "ticks done" and not error
    assert bot.tool_executor.execute.await_count == 6
    assert wait_nudges(fake) == 0


async def test_real_header_frozen_output_still_walks_the_ladder():
    bot, fake = build(quick_polls(5))
    bot.tool_executor.execute = AsyncMock(side_effect=real_results([3] * 5))
    text, _, error, _, _ = await run_loop(bot, FakeMessage("watch the ticks"))
    assert error and "no observable progress" in text
    assert bot.tool_executor.execute.await_count == 4
    assert wait_nudges(fake) == 1
