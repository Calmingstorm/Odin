"""Tests for background process manager (src/tools/process_manager.py).

Covers ProcessInfo, ProcessRegistry: start, poll, write, kill, list_all,
shutdown, cleanup, concurrency limits, and lifetime enforcement.
"""
from __future__ import annotations

import asyncio
import os
import time
from collections import deque
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.tools.process_manager import (
    MAX_CONCURRENT,
    MAX_LIFETIME_SECONDS,
    OUTPUT_BUFFER_LINES,
    SHUTDOWN_REAP_TIMEOUT,
    ProcessInfo,
    ProcessRegistry,
)

# ---------------------------------------------------------------------------
# ProcessInfo
# ---------------------------------------------------------------------------

class TestProcessInfo:
    def test_defaults(self):
        info = ProcessInfo(pid=1, command="echo hi", host="localhost", start_time=1000.0)
        assert info.pid == 1
        assert info.command == "echo hi"
        assert info.host == "localhost"
        assert info.status == "running"
        assert info.exit_code is None
        assert isinstance(info.output_buffer, deque)
        assert info.output_buffer.maxlen == OUTPUT_BUFFER_LINES

    def test_output_buffer_max_len(self):
        info = ProcessInfo(pid=1, command="test", host="local", start_time=0)
        for i in range(OUTPUT_BUFFER_LINES + 50):
            info.output_buffer.append(f"line {i}\n")
        assert len(info.output_buffer) == OUTPUT_BUFFER_LINES


# ---------------------------------------------------------------------------
# ProcessRegistry — start
# ---------------------------------------------------------------------------

class TestProcessRegistryStart:
    @pytest.mark.asyncio
    async def test_start_process(self):
        reg = ProcessRegistry()
        result = await reg.start("localhost", "echo hello")
        assert "Process started" in result
        assert "PID" in result
        # Give process time to complete
        await asyncio.sleep(0.2)
        await reg.shutdown()

    @pytest.mark.asyncio
    async def test_start_tracks_process(self):
        reg = ProcessRegistry()
        await reg.start("localhost", "echo test")
        assert len(reg._processes) == 1
        await asyncio.sleep(0.2)
        await reg.shutdown()

    @pytest.mark.asyncio
    async def test_start_failed_command(self):
        reg = ProcessRegistry()
        # This should still "start" — the failure happens during execution
        result = await reg.start("localhost", "echo started")
        assert "Process started" in result
        await asyncio.sleep(0.2)
        await reg.shutdown()

    @pytest.mark.asyncio
    async def test_concurrency_limit(self):
        reg = ProcessRegistry()
        # Fill up with "running" processes by mocking
        for i in range(MAX_CONCURRENT):
            reg._processes[i] = ProcessInfo(
                pid=i, command="sleep 100", host="local",
                start_time=time.time(), status="running",
            )
        result = await reg.start("localhost", "echo nope")
        assert "Cannot start" in result
        assert str(MAX_CONCURRENT) in result


# ---------------------------------------------------------------------------
# ProcessRegistry — poll
# ---------------------------------------------------------------------------

class TestProcessRegistryPoll:
    async def test_poll_nonexistent(self):
        reg = ProcessRegistry()
        result = await reg.poll(99999)
        assert "No process" in result

    async def test_poll_running_no_output(self):
        reg = ProcessRegistry()
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time())
        reg._processes[1] = info
        result = await reg.poll(1)
        assert "status=running" in result
        assert "no output yet" in result

    async def test_poll_with_output(self):
        reg = ProcessRegistry()
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time())
        info.output_buffer.append("hello world\n")
        info.output_buffer.append("second line\n")
        reg._processes[1] = info
        result = await reg.poll(1)
        assert "hello world" in result
        assert "second line" in result

    async def test_poll_shows_exit_code(self):
        reg = ProcessRegistry()
        info = ProcessInfo(
            pid=1, command="test", host="local",
            start_time=time.time(), status="completed", exit_code=0,
        )
        reg._processes[1] = info
        result = await reg.poll(1)
        assert "exit_code=0" in result

    async def test_poll_shows_uptime(self):
        reg = ProcessRegistry()
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time() - 30)
        reg._processes[1] = info
        result = await reg.poll(1)
        assert "uptime=" in result

    async def test_poll_reports_total_output_bytes(self):
        reg = ProcessRegistry()
        info = ProcessInfo(
            pid=1, command="test", host="local", start_time=time.time(),
            total_output_bytes=4096,
        )
        reg._processes[1] = info
        result = await reg.poll(1)
        assert "output_bytes=4096" in result


class TestPollWaitSeconds:
    """wait_seconds semantics (design settled with Odin, 2026-07-31):
    terminal → immediate; running → wait until EXIT or deadline (never an
    early-output wakeup); cancellation aborts only the wait."""

    async def test_terminal_process_returns_immediately(self):
        reg = ProcessRegistry()
        info = ProcessInfo(
            pid=1, command="test", host="local",
            start_time=time.time(), status="completed", exit_code=0,
        )
        reg._processes[1] = info
        start = time.monotonic()
        result = await reg.poll(1, wait_seconds=60)
        assert time.monotonic() - start < 1.0
        assert "exit_code=0" in result

    async def test_running_process_waits_until_deadline(self):
        reg = ProcessRegistry()
        proc = await asyncio.create_subprocess_shell(
            "sleep 30", stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        info = ProcessInfo(
            pid=proc.pid, command="sleep 30", host="local",
            start_time=time.time(), process=proc,
        )
        reg._processes[proc.pid] = info
        try:
            start = time.monotonic()
            result = await reg.poll(proc.pid, wait_seconds=1.0)
            elapsed = time.monotonic() - start
            assert 0.9 <= elapsed < 5.0  # waited the deadline, not longer
            assert "status=running" in result
            assert proc.returncode is None  # wait never touched the process
        finally:
            proc.kill()
            await proc.wait()

    async def test_exit_during_wait_returns_early_with_terminal_state(self):
        reg = ProcessRegistry()
        result_start = await reg.start("localhost", "echo done-marker; exit 0")
        pid = int(result_start.split("PID ")[1].split(")")[0])
        start = time.monotonic()
        result = await reg.poll(pid, wait_seconds=30)
        elapsed = time.monotonic() - start
        assert elapsed < 10.0  # exited long before the 30s deadline
        assert "status=completed" in result
        assert "exit_code=0" in result
        assert "done-marker" in result  # reader drained before the report

    async def test_handler_rejects_invalid_wait_seconds(self):
        """Invalid wait_seconds is REJECTED, never clamped (the
        reasoning-effort validation rule). bool is an int subtype and
        must not slip through."""
        from src.tools.handlers.system import SystemTools

        reg = ProcessRegistry()
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time())
        reg._processes[1] = info
        h = SystemTools.__new__(SystemTools)
        h._process_registry = lambda: reg

        for bad in (-1, 121, float("nan"), float("inf"), "60", True, None):
            result = await h._handle_manage_process(
                {"action": "poll", "pid": 1, "wait_seconds": bad}
            )
            assert isinstance(result, tuple) and result[1] == 1, bad
            assert "wait_seconds must be" in result[0], bad

    async def test_handler_accepts_valid_wait_and_defaults_to_zero(self):
        from src.tools.handlers.system import SystemTools

        reg = ProcessRegistry()
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time())
        reg._processes[1] = info
        h = SystemTools.__new__(SystemTools)
        h._process_registry = lambda: reg

        # Omitted → default 0 → immediate report, exit 0.
        out, code = await h._handle_manage_process({"action": "poll", "pid": 1})
        assert code == 0 and "status=running" in out
        # Boundary values accepted.
        for ok in (0, 0.5, 120):
            out, code = await h._handle_manage_process(
                {"action": "poll", "pid": 1, "wait_seconds": ok}
            )
            assert code == 0, ok

    async def test_carriage_return_progress_advances_output_bytes(self):
        """PR #244 round-1 blocker #2: \\r progress bars and newline-free
        output must advance total_output_bytes — it is the wait-poll
        progress signal, and readline() left it at zero."""
        reg = ProcessRegistry()
        started = await reg.start(
            "localhost",
            r"printf 'step 1\rstep 2\rstep 3\r'; printf 'no newline tail'; sleep 0.3",
        )
        pid = int(started.split("PID ")[1].split(")")[0])
        result = await reg.poll(pid, wait_seconds=10)
        assert "status=completed" in result
        info = reg._processes[pid]
        assert info.total_output_bytes >= len("step 1\rstep 2\rstep 3\r")
        # \r segments render as display lines; the unterminated tail is
        # flushed at EOF.
        joined = "".join(info.output_buffer)
        assert "step 2" in joined
        assert "no newline tail" in joined

    async def test_over_limit_line_does_not_kill_drainage(self):
        """A single line beyond the asyncio stream limit (64KB) killed the
        old readline() drainer; bounded raw reads cannot overrun."""
        reg = ProcessRegistry()
        size = 200_000
        started = await reg.start(
            "localhost",
            f"python3 -c \"import sys; sys.stdout.write('x'*{size}); "
            'sys.stdout.flush()"',
        )
        pid = int(started.split("PID ")[1].split(")")[0])
        result = await reg.poll(pid, wait_seconds=15)
        assert "status=completed" in result
        assert reg._processes[pid].total_output_bytes == size

    async def test_leader_exit_publishes_status_despite_pipe_holding_descendant(self):
        """PR #244 round-1 blocker #3 (Odin's repro): `sleep 20 &` — the
        leader exits immediately while the descendant holds stdout open.
        Terminal state must publish at LEADER exit, and the group reap
        (which is what closes the pipe) must not stall behind EOF."""
        import os

        reg = ProcessRegistry()
        started = await reg.start("localhost", "sleep 20 & exit 0")
        pid = int(started.split("PID ")[1].split(")")[0])
        start = time.monotonic()
        result = await reg.poll(pid, wait_seconds=15)
        elapsed = time.monotonic() - start
        assert elapsed < 10.0  # never waited on EOF or the full deadline
        assert "status=completed" in result
        assert "exit_code=0" in result
        # The v3.59.1 contract: descendants are reaped at leader exit. Give
        # the reap a moment, then probe group existence with signal 0 (a
        # pure existence check, delivers nothing).
        for _ in range(40):
            try:
                os.killpg(pid, 0)
            except ProcessLookupError:
                break
            await asyncio.sleep(0.25)
        with pytest.raises(ProcessLookupError):
            os.killpg(pid, 0)

    async def test_wedged_reader_never_wedges_the_poll(self):
        """Process exits during the wait but the reader task hangs: the
        bounded (shielded) drain gives up and the poll still reports —
        a stuck reader must not turn a bounded wait into an unbounded one,
        and the shield must not cancel the reader."""

        class _ExitedProc:
            returncode = 0  # leader already exited (SIGCHLD-reaped)

            async def wait(self):
                return 0

        reg = ProcessRegistry()
        wedge = asyncio.Event()  # never set
        reader = asyncio.create_task(wedge.wait())
        info = ProcessInfo(
            pid=1, command="test", host="local", start_time=time.time(),
            process=_ExitedProc(),  # type: ignore[arg-type]
        )
        info._reader_task = reader
        reg._processes[1] = info
        try:
            start = time.monotonic()
            result = await reg.poll(1, wait_seconds=30)
            assert time.monotonic() - start < 12.0  # drain bound, not 30s
            assert "[PID 1]" in result
            assert not reader.cancelled()  # shield held
        finally:
            reader.cancel()

    async def test_cancellation_aborts_wait_not_process(self):
        reg = ProcessRegistry()
        proc = await asyncio.create_subprocess_shell(
            "sleep 30", stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        info = ProcessInfo(
            pid=proc.pid, command="sleep 30", host="local",
            start_time=time.time(), process=proc,
        )
        reg._processes[proc.pid] = info
        try:
            task = asyncio.create_task(reg.poll(proc.pid, wait_seconds=60))
            await asyncio.sleep(0.2)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert proc.returncode is None  # detached process untouched
        finally:
            proc.kill()
            await proc.wait()


# ---------------------------------------------------------------------------
# ProcessRegistry — write
# ---------------------------------------------------------------------------

class TestProcessRegistryWrite:
    @pytest.mark.asyncio
    async def test_write_nonexistent(self):
        reg = ProcessRegistry()
        result = await reg.write(999, "test")
        assert "No process" in result

    @pytest.mark.asyncio
    async def test_write_not_running(self):
        reg = ProcessRegistry()
        info = ProcessInfo(
            pid=1,
            command="test",
            host="local",
            start_time=time.time(),
            status="completed",
        )
        reg._processes[1] = info
        result = await reg.write(1, "test")
        assert "not running" in result

    @pytest.mark.asyncio
    async def test_write_no_stdin(self):
        reg = ProcessRegistry()
        mock_proc = MagicMock()
        mock_proc.stdin = None
        info = ProcessInfo(
            pid=1,
            command="test",
            host="local",
            start_time=time.time(),
            process=mock_proc,
        )
        reg._processes[1] = info
        result = await reg.write(1, "test")
        assert "no stdin" in result

    @pytest.mark.asyncio
    async def test_write_success(self):
        reg = ProcessRegistry()
        mock_stdin = MagicMock()
        mock_stdin.write = MagicMock()  # StreamWriter.write() is synchronous
        mock_stdin.drain = AsyncMock()  # StreamWriter.drain() is async
        mock_proc = MagicMock()
        mock_proc.stdin = mock_stdin
        info = ProcessInfo(
            pid=1,
            command="test",
            host="local",
            start_time=time.time(),
            process=mock_proc,
        )
        reg._processes[1] = info
        result = await reg.write(1, "hello")
        assert "Wrote" in result
        assert "5 bytes" in result
        mock_stdin.write.assert_called_once_with(b"hello")
        mock_stdin.drain.assert_awaited_once()


# ---------------------------------------------------------------------------
# ProcessRegistry — kill
# ---------------------------------------------------------------------------

class TestProcessRegistryKill:
    @pytest.mark.asyncio
    async def test_kill_nonexistent(self):
        reg = ProcessRegistry()
        result = await reg.kill(999)
        assert "No process" in result

    @pytest.mark.asyncio
    async def test_kill_already_completed(self):
        reg = ProcessRegistry()
        info = ProcessInfo(
            pid=1,
            command="test",
            host="local",
            start_time=time.time(),
            status="completed",
        )
        reg._processes[1] = info
        result = await reg.kill(1)
        assert "already completed" in result

    @pytest.mark.asyncio
    async def test_kill_running(self):
        reg = ProcessRegistry()
        mock_proc = AsyncMock()
        mock_proc.terminate = MagicMock()
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock()
        info = ProcessInfo(
            pid=1,
            command="test",
            host="local",
            start_time=time.time(),
            process=mock_proc,
        )
        reg._processes[1] = info
        result = await reg.kill(1)
        assert "killed" in result
        assert info.status == "failed"
        assert info.exit_code == -9


# ---------------------------------------------------------------------------
# ProcessRegistry — list_all
# ---------------------------------------------------------------------------

class TestProcessRegistryList:
    def test_list_empty(self):
        reg = ProcessRegistry()
        result = reg.list_all()
        assert "No processes" in result

    def test_list_with_processes(self):
        reg = ProcessRegistry()
        reg._processes[1] = ProcessInfo(
            pid=1, command="echo hello", host="local",
            start_time=time.time(), status="running",
        )
        reg._processes[2] = ProcessInfo(
            pid=2, command="sleep 100", host="remote",
            start_time=time.time() - 120, status="completed",
        )
        result = reg.list_all()
        assert "echo hello" in result
        assert "sleep 100" in result
        assert "running" in result
        assert "completed" in result

    def test_list_uptime_formats(self):
        reg = ProcessRegistry()
        # Seconds
        reg._processes[1] = ProcessInfo(
            pid=1, command="cmd1", host="l", start_time=time.time() - 30,
        )
        # Minutes
        reg._processes[2] = ProcessInfo(
            pid=2, command="cmd2", host="l", start_time=time.time() - 300,
        )
        # Hours
        reg._processes[3] = ProcessInfo(
            pid=3, command="cmd3", host="l", start_time=time.time() - 7200,
        )
        result = reg.list_all()
        assert "s" in result  # seconds
        assert "m" in result  # minutes
        assert "h" in result  # hours


# ---------------------------------------------------------------------------
# ProcessRegistry — shutdown
# ---------------------------------------------------------------------------

class TestProcessRegistryShutdown:
    @pytest.mark.asyncio
    async def test_shutdown_empty(self):
        reg = ProcessRegistry()
        killed = await reg.shutdown()
        assert killed == 0

    @pytest.mark.asyncio
    async def test_shutdown_kills_running(self):
        reg = ProcessRegistry()
        mock_proc = AsyncMock()
        mock_proc.terminate = MagicMock()
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock()
        info = ProcessInfo(
            pid=1,
            command="test",
            host="local",
            start_time=time.time(),
            process=mock_proc,
        )
        reg._processes[1] = info
        killed = await reg.shutdown()
        assert killed == 1

    @pytest.mark.asyncio
    async def test_shutdown_skips_completed(self):
        reg = ProcessRegistry()
        info = ProcessInfo(
            pid=1,
            command="test",
            host="local",
            start_time=time.time(),
            status="completed",
        )
        reg._processes[1] = info
        killed = await reg.shutdown()
        assert killed == 0


# ---------------------------------------------------------------------------
# ProcessRegistry — cleanup
# ---------------------------------------------------------------------------

class TestProcessRegistryCleanup:
    def test_cleanup_removes_old_dead(self):
        reg = ProcessRegistry()
        reg._processes[1] = ProcessInfo(
            pid=1, command="test", host="local",
            start_time=time.time() - MAX_LIFETIME_SECONDS - 100,
            status="completed",
        )
        removed = reg.cleanup()
        assert removed == 1
        assert 1 not in reg._processes

    def test_cleanup_keeps_running(self):
        reg = ProcessRegistry()
        reg._processes[1] = ProcessInfo(
            pid=1, command="test", host="local",
            start_time=time.time() - MAX_LIFETIME_SECONDS - 100,
            status="running",
        )
        removed = reg.cleanup()
        assert removed == 0
        assert 1 in reg._processes

    def test_cleanup_keeps_recent_dead(self):
        reg = ProcessRegistry()
        reg._processes[1] = ProcessInfo(
            pid=1, command="test", host="local",
            start_time=time.time() - 10,
            status="completed",
        )
        removed = reg.cleanup()
        assert removed == 0


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_max_concurrent(self):
        assert MAX_CONCURRENT == 20

    def test_max_lifetime(self):
        assert MAX_LIFETIME_SECONDS == 3600

    def test_output_buffer_lines(self):
        assert OUTPUT_BUFFER_LINES == 500


class TestRound2Blockers:
    async def test_cleanup_never_cancels_inflight_reap(self):
        """PR #244 round-2 blocker #1: cleanup() must never cancel a
        lifecycle task — cancellation propagates through the group reap
        and strands TERM-immune descendants (the v3.59.1 class). A record
        with running tasks is deferred, not cancelled."""
        reg = ProcessRegistry()
        gate = asyncio.Event()

        async def slow_reap():
            await gate.wait()

        task = asyncio.create_task(slow_reap())
        await asyncio.sleep(0)
        info = ProcessInfo(
            pid=1, command="test", host="local",
            start_time=time.time() - 7200,  # old enough to be eligible
            status="completed", exit_code=0,
        )
        info._exit_task = task
        reg._processes[1] = info

        removed = reg.cleanup()
        assert removed == 0  # deferred, present, NOT cancelled
        assert 1 in reg._processes
        assert not task.cancelled()

        gate.set()
        await task
        assert reg.cleanup() == 1  # next cycle removes it
        assert 1 not in reg._processes

    async def test_terminal_poll_waits_for_drain_completion(self):
        """PR #244 round-2 blocker #3: a poll landing between terminal
        status publication and drain completion must still report the
        final output, not a torn tail."""
        reg = ProcessRegistry()
        info = ProcessInfo(
            pid=1, command="test", host="local", start_time=time.time(),
            status="completed", exit_code=0,
        )

        async def late_drain():
            await asyncio.sleep(0.3)
            info.output_buffer.append("the final tail\n")

        info._reader_task = asyncio.create_task(late_drain())
        reg._processes[1] = info
        result = await reg.poll(1)  # wait_seconds=0 — still settles drain
        assert "the final tail" in result

    async def test_forced_flush_never_splits_multibyte_utf8(self):
        """PR #244 round-2 blocker #4: >4096 bytes of unterminated
        multibyte output crosses the forced-flush boundary — the split
        must land on a UTF-8 boundary, never mid-sequence."""
        reg = ProcessRegistry()
        # 3000 × 'я' (2 bytes) = 6000 bytes, no newline: guarantees a
        # forced flush with an odd chance of landing mid-character.
        started = await reg.start(
            "localhost",
            'python3 -c "import sys; sys.stdout.write(\'\\u044f\'*3000); '
            'sys.stdout.flush()"',
        )
        pid = int(started.split("PID ")[1].split(")")[0])
        result = await reg.poll(pid, wait_seconds=15)
        assert "status=completed" in result
        info = reg._processes[pid]
        assert info.total_output_bytes == 6000
        joined = "".join(info.output_buffer)
        assert "\ufffd" not in joined
        assert joined.count("я") == 3000


class TestUtf8BoundarySplit:
    def test_ascii_passthrough(self):
        from src.tools.process_manager import _utf8_boundary_split

        head, tail = _utf8_boundary_split(b"hello world")
        assert head == b"hello world" and tail == b""

    def test_carries_partial_sequences(self):
        from src.tools.process_manager import _utf8_boundary_split

        euro = "€".encode()  # 3 bytes
        for cut in (1, 2):
            head, tail = _utf8_boundary_split(b"abc" + euro[:cut])
            assert head == b"abc" and tail == euro[:cut]
        # Complete sequence at the end flushes whole.
        head, tail = _utf8_boundary_split(b"abc" + euro)
        assert head == b"abc" + euro and tail == b""
        # 4-byte lead with only 2 bytes present.
        clef = "\U0001d11e".encode()  # 4 bytes
        head, tail = _utf8_boundary_split(b"x" + clef[:2])
        assert head == b"x" and tail == clef[:2]

    def test_binary_garbage_bounded_carry(self):
        from src.tools.process_manager import _utf8_boundary_split

        # Pure continuation bytes: at most 3 carried, rest flushes.
        buf = b"data" + b"\x80\x80\x80\x80"
        head, tail = _utf8_boundary_split(buf)
        assert head + tail == buf
        assert len(tail) <= 3


class TestRound3Blockers:
    async def test_shutdown_hard_kills_group_before_abandoning_wedged_reap(self):
        """PR #244 round-3 blocker #2: a wedged async reap must not strand
        the owned group across re-exec — shutdown hard-KILLs the group
        synchronously before cancelling the task."""
        import os

        reg = ProcessRegistry()
        proc = await asyncio.create_subprocess_shell(
            "sleep 30", stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        gate = asyncio.Event()  # never set — the wedged "reaper"

        async def wedged():
            await gate.wait()

        info = ProcessInfo(
            pid=proc.pid, command="sleep 30", host="local",
            start_time=time.time(), status="completed", exit_code=0,
            process=proc,
        )
        info._exit_task = asyncio.create_task(wedged())
        reg._processes[proc.pid] = info
        try:
            start = time.monotonic()
            await reg.shutdown()
            assert time.monotonic() - start < SHUTDOWN_REAP_TIMEOUT + 10
            # COMPLETION BARRIER (round-4 blocker #1): shutdown returns only
            # after the cancellation landed, the leader was reaped, and the
            # group provably dissolved.
            assert info._exit_task.done()
            assert proc.returncode is not None  # leader reaped, no zombie
            with pytest.raises(ProcessLookupError):
                os.killpg(proc.pid, 0)  # group gone BEFORE shutdown returned
        finally:
            gate.set()
            if proc.returncode is None:
                proc.kill()
            await proc.wait()

    async def test_zero_wait_poll_settles_when_returncode_beats_publication(self):
        """PR #244 round-3 blocker #3: returncode set but status not yet
        published — a zero-wait poll must settle via the watcher instead
        of reporting stale running status with a torn tail."""
        reg = ProcessRegistry()
        proc = await asyncio.create_subprocess_shell(
            "echo tail-marker; exit 0",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        # Let the child exit (returncode set at SIGCHLD reap) WITHOUT any
        # watcher having run yet — status still says running.
        for _ in range(40):
            if proc.returncode is not None:
                break
            await asyncio.sleep(0.1)
        assert proc.returncode is not None
        info = ProcessInfo(
            pid=proc.pid, command="echo", host="local",
            start_time=time.time(), process=proc,  # status="running"
        )
        info._reader_task = asyncio.create_task(reg._read_output(info))
        info._exit_task = asyncio.create_task(reg._watch_exit(info))
        reg._processes[proc.pid] = info

        result = await reg.poll(proc.pid)  # wait_seconds=0
        assert "status=completed" in result
        assert "exit_code=0" in result
        assert "tail-marker" in result


class TestRaceFreeGroupTermination:
    """Round-5 blocker #2: every signal to a post-leader-exit group goes
    through a pidfd pinned BEFORE membership verification, so pid reuse
    between check and signal cannot misdirect it."""

    async def test_pins_only_true_group_members(self):
        from src.tools.process_manager import _close_pinned, _pinned_group_members

        proc = await asyncio.create_subprocess_shell(
            "sleep 5 & sleep 5", stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        try:
            await asyncio.sleep(0.4)
            pinned = _pinned_group_members(proc.pid)
            try:
                pids = {pid for pid, _fd in pinned}
                assert proc.pid in pids  # the leader
                assert len(pids) >= 2  # plus descendants
                # NOTHING outside the group: our own process is never pinned.
                assert os.getpid() not in pids
            finally:
                _close_pinned(pinned)
        finally:
            proc.kill()
            await proc.wait()

    async def test_reap_racefree_kills_term_immune_descendant(self):
        from src.tools.process_manager import _reap_group_racefree

        # A descendant that ignores SIGTERM: only the KILL escalation ends it.
        proc = await asyncio.create_subprocess_shell(
            "python3 -c \"import signal,time;"
            "signal.signal(signal.SIGTERM, signal.SIG_IGN);time.sleep(30)\" & "
            "exit 0",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        pgid = proc.pid
        try:
            await asyncio.sleep(0.5)
            await _reap_group_racefree(pgid, grace=0.5)
            from src.tools.process_manager import _pinned_group_members

            for _ in range(30):
                pinned = _pinned_group_members(pgid)
                alive = len(pinned)
                _close_pinned_local(pinned)
                if alive == 0:
                    break
                await asyncio.sleep(0.2)
            assert alive == 0  # TERM-immune descendant did NOT survive
        finally:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()

    async def test_empty_group_is_a_noop(self):
        from src.tools.process_manager import _kill_group_racefree_sync

        assert _kill_group_racefree_sync(4_000_000) == 0


def _close_pinned_local(pinned):
    from src.tools.process_manager import _close_pinned

    _close_pinned(pinned)


class TestShutdownBarrier:
    async def test_cancellation_resistant_task_cannot_hang_shutdown(self):
        """Round-5 blocker #1 (Odin's repro): a lifecycle task that
        SWALLOWS cancellation must not hold shutdown — the barrier is
        bounded by process state, never by awaiting the task."""
        reg = ProcessRegistry()
        resist = True  # cleared at teardown so the loop can close

        async def immortal():
            while True:
                try:
                    await asyncio.sleep(3600)
                except asyncio.CancelledError:
                    if not resist:
                        raise
                    continue  # refuses to die while under test

        proc = await asyncio.create_subprocess_shell(
            "sleep 30", stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        info = ProcessInfo(
            pid=proc.pid, command="sleep 30", host="local",
            start_time=time.time(), status="completed", exit_code=0,
            process=proc,
        )
        task = asyncio.create_task(immortal())
        info._exit_task = task
        reg._processes[proc.pid] = info
        try:
            start = time.monotonic()
            await asyncio.wait_for(reg.shutdown(), timeout=SHUTDOWN_REAP_TIMEOUT + 15)
            assert time.monotonic() - start < SHUTDOWN_REAP_TIMEOUT + 15
            # Barrier held: leader reaped and the group provably gone
            # BEFORE shutdown returned, despite the immortal task.
            assert proc.returncode is not None
            from src.tools.process_manager import _kill_group_racefree_sync

            assert _kill_group_racefree_sync(proc.pid) == 0
        finally:
            resist = False
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            if proc.returncode is None:
                proc.kill()
                await proc.wait()

    async def test_kill_group_until_gone_reports_failure_loudly(self, monkeypatch):
        """An unkillable survivor makes the barrier return False (the
        caller's loud report), never a silent success."""
        import src.tools.process_manager as pm

        reg = ProcessRegistry()
        monkeypatch.setattr(pm, "_kill_group_racefree_sync", lambda pgid: 1)
        stub = type("P", (), {"pid": 4242, "returncode": 0})()
        info = ProcessInfo(
            pid=4242, command="x", host="local", start_time=0.0, process=stub,
        )
        assert await reg._kill_group_until_gone(info, timeout=0.3) is False

    async def test_kill_group_until_gone_no_process_is_true(self):
        reg = ProcessRegistry()
        info = ProcessInfo(pid=1, command="x", host="local", start_time=0.0)
        assert await reg._kill_group_until_gone(info) is True


class TestRaceFreeHelperArms:
    """Defensive arms of the pidfd machinery — every one is a fail-safe
    path (skip the candidate / treat as exited), never a signal."""

    def test_stat_fields_missing_process(self):
        from src.tools.process_manager import _stat_fields

        assert _stat_fields(4_000_000) is None

    def test_stat_fields_malformed_stat(self, tmp_path, monkeypatch):
        import src.tools.process_manager as pm

        class FakePath:
            def __init__(self, _p):
                pass

            def read_text(self):
                return "1 (comm) S"  # too few fields after the parens

        monkeypatch.setattr(pm, "Path", FakePath)
        assert pm._stat_fields(1) is None

    def test_pinned_members_survives_unreadable_proc(self, monkeypatch):
        import src.tools.process_manager as pm

        def boom(_path):
            raise OSError("proc unavailable")

        monkeypatch.setattr(pm.os, "listdir", boom)
        assert pm._pinned_group_members(1234) == []

    def test_close_pinned_tolerates_bad_fd(self):
        from src.tools.process_manager import _close_pinned

        _close_pinned([(1, 999_999)])  # already-closed fd → swallowed

    def test_pidfd_exited_on_bad_fd_reports_exited(self, monkeypatch):
        """An unusable fd must read as EXITED (fail-safe): the caller then
        stops waiting on it rather than looping forever."""
        import select as _select

        from src.tools.process_manager import _pidfd_exited

        def boom(*_a, **_k):
            raise OSError("bad file descriptor")

        monkeypatch.setattr(_select, "select", boom)
        assert _pidfd_exited(999_999) is True

    async def test_reap_racefree_returns_when_nothing_pinned(self):
        from src.tools.process_manager import _reap_group_racefree

        await _reap_group_racefree(4_000_000, grace=0.1)  # returns immediately
