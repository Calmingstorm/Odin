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

        reg = ProcessRegistry()
        started = await reg.start("localhost", "sleep 20 & exit 0")
        pid = int(started.split("PID ")[1].split(")")[0])
        start = time.monotonic()
        result = await reg.poll(pid, wait_seconds=15)
        elapsed = time.monotonic() - start
        assert elapsed < 10.0  # never waited on EOF or the full deadline
        assert "status=completed" in result
        assert "exit_code=0" in result
        # The v3.59.1 contract: descendants are reaped at leader exit.
        # Asserted through the ownership scan rather than killpg: an
        # adopted orphan lingers as a ZOMBIE until reaped, which killpg
        # still sees but which is dead by every meaningful measure.
        from src.tools.process_manager import _close_pinned, _scan_owned_members

        for _ in range(40):
            pinned, complete = _scan_owned_members(pid, leader_pid=pid)
            alive = len(pinned)
            _close_pinned(pinned)
            if complete and alive == 0:
                break
            await asyncio.sleep(0.25)
        assert alive == 0

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
            # Ownership scan, not killpg: an adopted orphan lingers as a
            # ZOMBIE until reaped, which killpg still reports as present
            # though it is dead by every meaningful measure.
            from src.tools.process_manager import _close_pinned, _scan_owned_members

            pinned, complete = _scan_owned_members(proc.pid, leader_pid=proc.pid)
            alive = len(pinned)
            _close_pinned(pinned)
            assert complete and alive == 0  # gone BEFORE shutdown returned
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
    """Round-5 #2 / round-6 #1-#2: every signal goes to a pidfd pinned
    BEFORE membership verification (no pid-reuse window), every pass
    RE-ENUMERATES (fork-on-TERM cannot escape), and a scan that could not
    complete is never mistaken for an empty group."""

    async def test_pins_only_true_group_members(self):
        from src.tools.process_manager import _close_pinned, _scan_owned_members

        proc = await asyncio.create_subprocess_shell(
            "sleep 5 & sleep 5", stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        try:
            await asyncio.sleep(0.4)
            pinned, complete = _scan_owned_members(proc.pid)
            try:
                pids = {pid for pid, _fd in pinned}
                assert complete is True
                assert proc.pid in pids and len(pids) >= 2
                assert os.getpid() not in pids  # nothing outside the group
            finally:
                _close_pinned(pinned)
        finally:
            proc.kill()
            await proc.wait()

    async def test_fork_on_term_descendant_cannot_escape(self):
        """Round-6 blocker #1 (Odin's repro): a TERM handler that forks a
        fresh same-session TERM-immune child is caught by the NEXT
        enumeration pass — a one-shot pinned set would miss it."""
        from src.tools.process_manager import (
            _scan_owned_members,
            _terminate_session_until_empty,
        )

        script = (
            "import os, signal, sys, time\n"
            "def handler(sig, frm):\n"
            "    if os.fork() == 0:\n"
            "        signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
            "        time.sleep(60)\n"
            "        os._exit(0)\n"
            "    os._exit(0)\n"
            "signal.signal(signal.SIGTERM, handler)\n"
            "time.sleep(60)\n"
        )
        proc = await asyncio.create_subprocess_exec(
            "python3", "-c", script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        pgid = proc.pid
        try:
            await asyncio.sleep(0.5)
            gone = await _terminate_session_until_empty(pgid, grace=0.5, timeout=10.0)
            assert gone is True  # affirmative empty observation
            pinned, complete = _scan_owned_members(pgid)
            try:
                assert complete and not pinned  # the forked child died too
            finally:
                from src.tools.process_manager import _close_pinned

                _close_pinned(pinned)
        finally:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()

    async def test_term_immune_descendant_is_killed(self):
        from src.tools.process_manager import _terminate_session_until_empty

        proc = await asyncio.create_subprocess_shell(
            "python3 -c \"import signal,time;"
            "signal.signal(signal.SIGTERM, signal.SIG_IGN);time.sleep(30)\" & "
            "exit 0",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        try:
            await asyncio.sleep(0.5)
            assert await _terminate_session_until_empty(
                proc.pid, grace=0.5, timeout=10.0
            ) is True
        finally:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()

    async def test_empty_group_is_immediately_complete(self):
        from src.tools.process_manager import _terminate_session_until_empty

        assert await _terminate_session_until_empty(4_000_000, timeout=1.0) is True


class TestScanCompleteness:
    """Round-6 blocker #2: inspection failure is NOT absence."""

    def test_unreadable_proc_is_incomplete(self, monkeypatch):
        import src.tools.process_manager as pm

        monkeypatch.setattr(
            pm.os, "listdir", lambda _p: (_ for _ in ()).throw(OSError("nope"))
        )
        pinned, complete = pm._scan_owned_members(1234)
        assert pinned == [] and complete is False

    def test_pidfd_exhaustion_is_incomplete_not_empty(self, monkeypatch):
        """Odin's EMFILE repro: pidfd_open failing for LIVE processes must
        not render the group empty."""
        import src.tools.process_manager as pm

        def emfile(_pid):
            raise OSError(24, "Too many open files")

        monkeypatch.setattr(pm.os, "pidfd_open", emfile)
        pinned, complete = pm._scan_owned_members(1234)
        assert pinned == [] and complete is False

    def test_vanished_candidate_does_not_spoil_the_scan(self, monkeypatch):
        """A process that exits mid-scan is genuinely gone — ESRCH from
        pidfd_open keeps the scan COMPLETE."""
        import src.tools.process_manager as pm

        monkeypatch.setattr(
            pm.os, "pidfd_open",
            lambda _pid: (_ for _ in ()).throw(ProcessLookupError()),
        )
        pinned, complete = pm._scan_owned_members(1234)
        assert pinned == [] and complete is True

    def test_stat_read_error_is_unknown_not_gone(self, monkeypatch):
        import src.tools.process_manager as pm

        class FakePath:
            def __init__(self, _p):
                pass

            def read_bytes(self):
                raise OSError(24, "Too many open files")

        monkeypatch.setattr(pm, "Path", FakePath)
        assert pm._proc_session(1) == "unknown"

    def test_stat_missing_is_gone(self):
        import src.tools.process_manager as pm

        assert pm._proc_session(4_000_000) is None


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
            await asyncio.wait_for(reg.shutdown(), timeout=SHUTDOWN_REAP_TIMEOUT + 20)
            assert time.monotonic() - start < SHUTDOWN_REAP_TIMEOUT + 20
            assert proc.returncode is not None  # leader reaped
            from src.tools.process_manager import _scan_owned_members

            pinned, complete = _scan_owned_members(proc.pid)
            assert complete and not pinned  # group provably empty
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

    async def test_barrier_reports_failure_when_scan_cannot_complete(
        self, monkeypatch
    ):
        """Round-6 #2 end-to-end: a scan that cannot complete makes the
        barrier return False — never a false success with a live group."""
        import src.tools.process_manager as pm

        reg = ProcessRegistry()
        monkeypatch.setattr(
            pm.os, "listdir", lambda _p: (_ for _ in ()).throw(OSError("nope"))
        )
        stub = type("P", (), {"pid": 4242, "returncode": 0})()
        info = ProcessInfo(
            pid=4242, command="x", host="local", start_time=0.0, process=stub,
        )
        assert await reg._kill_group_until_gone(info, timeout=0.5) is False

    async def test_kill_group_until_gone_no_process_is_true(self):
        reg = ProcessRegistry()
        info = ProcessInfo(pid=1, command="x", host="local", start_time=0.0)
        assert await reg._kill_group_until_gone(info) is True


class TestRaceFreeHelperArms:
    def test_close_pinned_tolerates_bad_fd(self):
        from src.tools.process_manager import _close_pinned

        _close_pinned([(1, 999_999)])  # already-closed fd → swallowed

    def test_pidfd_exited_on_bad_fd_reports_exited(self, monkeypatch):
        import select as _select

        from src.tools.process_manager import _pidfd_exited

        monkeypatch.setattr(
            _select, "select",
            lambda *a, **k: (_ for _ in ()).throw(OSError("bad fd")),
        )
        assert _pidfd_exited(999_999) is True

    def test_malformed_stat_is_unknown_not_gone(self, monkeypatch):
        """Round-7 #2: only provable disappearance may read as GONE."""
        import src.tools.process_manager as pm

        class FakePath:
            def __init__(self, _p):
                pass

            def read_bytes(self):
                return b"1 (comm) S"  # too few fields after the parens

        monkeypatch.setattr(pm, "Path", FakePath)
        assert pm._proc_session(1) == "unknown"

    def test_non_utf8_comm_is_parsed_not_raised(self, monkeypatch):
        """Round-7 #2: comm may hold arbitrary bytes — parsing on BYTES
        means a non-UTF-8 name neither raises nor reads as absence."""
        import src.tools.process_manager as pm

        class FakePath:
            def __init__(self, _p):
                pass

            def read_bytes(self):
                return b"7 (od\xffin) S 1 42 4242 " + b"0 " * 40

        monkeypatch.setattr(pm, "Path", FakePath)
        assert pm._proc_session(7) == 4242

    def test_pinned_member_with_unreadable_stat_is_incomplete(self, monkeypatch):
        """A candidate we pinned but cannot classify (stat unreadable)
        leaves the scan INCOMPLETE — never silently skipped as absent."""
        import src.tools.process_manager as pm

        real_ids = pm._proc_ids
        target = os.getpid()

        def flaky(pid):
            return "unknown" if pid == target else real_ids(pid)

        monkeypatch.setattr(pm, "_proc_ids", flaky)
        pinned, complete = pm._scan_owned_members(4_000_001)
        assert complete is False
        pm._close_pinned(pinned)

    def test_signal_to_dead_pidfd_is_swallowed(self):
        """Signalling a pidfd whose process already exited must not raise
        out of a termination pass."""
        import src.tools.process_manager as pm

        assert pm._signal_pinned([(1, 999_999)], 15) is None  # bad fd → debug log

    async def test_pidfd_exited_true_after_exit(self):
        """The positive arm: a pidfd polls readable once its process is
        gone (the loop's completion signal)."""
        import src.tools.process_manager as pm

        proc = await asyncio.create_subprocess_shell(
            "true", stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        fd = os.pidfd_open(proc.pid)
        try:
            await proc.wait()
            for _ in range(30):
                if pm._pidfd_exited(fd):
                    break
                await asyncio.sleep(0.1)
            assert pm._pidfd_exited(fd) is True
        finally:
            os.close(fd)


class TestSessionFenceEscapes:
    """Round-7 #1: leaving the process GROUP does not leave the session."""

    async def test_setpgid_escapee_is_still_terminated(self):
        """Odin's repro: a TERM-immune descendant calls setpgid(0, 0) to
        leave the original group while staying in our session. Group-based
        membership made it invisible; session-based membership does not."""
        from src.tools.process_manager import (
            _close_pinned,
            _scan_owned_members,
            _terminate_session_until_empty,
        )

        # setpgid(0, 0) → new GROUP, SAME session; TERM ignored.
        escapee = (
            "import os,signal,time; "
            "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
            "os.setpgid(0,0); time.sleep(60)"
        )
        proc = await asyncio.create_subprocess_shell(
            f'python3 -c "{escapee}" & exit 0',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        sid = proc.pid
        try:
            await asyncio.sleep(0.6)
            pinned, complete = _scan_owned_members(sid)
            try:
                # The escapee is VISIBLE: it left the group, not the session.
                assert complete and len(pinned) >= 1
            finally:
                _close_pinned(pinned)
            assert await _terminate_session_until_empty(
                sid, grace=0.5, timeout=12.0
            ) is True
            pinned, complete = _scan_owned_members(sid)
            try:
                assert complete and not pinned  # escapee is gone
            finally:
                _close_pinned(pinned)
        finally:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()


class TestShutdownAffirmativeProof:
    """Round-7 #3: a completed watcher is not proof; shutdown re-verifies
    and escalates anything it cannot prove."""

    async def test_failed_watcher_reap_is_reverified_and_escalated(
        self, monkeypatch
    ):
        import src.tools.process_manager as pm

        reg = ProcessRegistry()
        stub = type("P", (), {"pid": 4242, "returncode": 0})()
        info = ProcessInfo(
            pid=4242, command="x", host="local", start_time=0.0,
            status="completed", exit_code=0, process=stub,
        )
        info.session_confirmed_empty = False  # the watcher's reap FAILED
        info._exit_task = None
        reg._processes[4242] = info

        # Verification cannot complete either → shutdown must escalate.
        monkeypatch.setattr(
            pm.os, "listdir", lambda _p: (_ for _ in ()).throw(OSError("nope"))
        )
        with pytest.raises(pm.ProcessCleanupError) as exc:
            await reg.shutdown()
        assert "4242" in str(exc.value)

    async def test_confirmed_record_needs_no_reverification(self, monkeypatch):
        import src.tools.process_manager as pm

        reg = ProcessRegistry()
        stub = type("P", (), {"pid": 4242, "returncode": 0})()
        info = ProcessInfo(
            pid=4242, command="x", host="local", start_time=0.0,
            status="completed", exit_code=0, process=stub,
        )
        info.session_confirmed_empty = True  # the watcher PROVED it
        reg._processes[4242] = info
        called = False

        def boom(_p):
            nonlocal called
            called = True
            raise OSError("must not be re-scanned")

        monkeypatch.setattr(pm.os, "listdir", boom)
        assert await reg.shutdown() == 0
        assert called is False

    async def test_watcher_records_its_verdict(self):
        """The verdict reaches ProcessInfo instead of being discarded."""
        reg = ProcessRegistry()
        started = await reg.start("localhost", "echo hi; exit 0")
        pid = int(started.split("PID ")[1].split(")")[0])
        await reg.poll(pid, wait_seconds=15)
        for _ in range(40):
            if reg._processes[pid].session_confirmed_empty:
                break
            await asyncio.sleep(0.25)
        assert reg._processes[pid].session_confirmed_empty is True
        assert await reg.shutdown() == 0  # no escalation

    async def test_final_verification_exception_is_escalated(self, monkeypatch):
        """A verification that RAISES is as unproven as one returning
        False — both escalate rather than passing teardown."""
        import src.tools.process_manager as pm

        reg = ProcessRegistry()
        stub = type("P", (), {"pid": 4242, "returncode": 0})()
        info = ProcessInfo(
            pid=4242, command="x", host="local", start_time=0.0,
            status="completed", exit_code=0, process=stub,
        )
        reg._processes[4242] = info

        async def boom(_info, timeout=8.0):
            raise RuntimeError("verification exploded")

        monkeypatch.setattr(reg, "_kill_group_until_gone", boom)
        with pytest.raises(pm.ProcessCleanupError):
            await reg.shutdown()

    async def test_watcher_records_failure_when_reap_raises(self, monkeypatch):
        """A reap that raises inside the watcher leaves the record
        UNCONFIRMED (never silently 'clean')."""
        import src.tools.process_manager as pm

        reg = ProcessRegistry()

        async def boom(*_a, **_k):
            raise RuntimeError("reap exploded")

        monkeypatch.setattr(pm, "_terminate_session_until_empty", boom)
        proc = await asyncio.create_subprocess_shell(
            "true", stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        info = ProcessInfo(
            pid=proc.pid, command="true", host="local",
            start_time=time.time(), process=proc,
        )
        reg._processes[proc.pid] = info
        await reg._watch_exit(info)
        assert info.session_confirmed_empty is False


class TestSetsidEscapeAndSettleWindow:
    """Round-8 #1/#2: ancestry catches a setsid escapee whose parent chain
    still reaches our leader; emptiness needs consecutive clean scans."""

    async def test_setsid_child_is_still_owned_via_ancestry(self):
        from src.tools.process_manager import (
            _close_pinned,
            _scan_owned_members,
            _terminate_session_until_empty,
        )

        # Child calls setsid() → leaves our SESSION entirely, but its
        # parent (the managed shell) stays alive, so ancestry still owns it.
        escapee = (
            "import os,signal,time; "
            "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
            "os.setsid(); time.sleep(60)"
        )
        proc = await asyncio.create_subprocess_shell(
            f'python3 -c "{escapee}" & sleep 60',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        sid = proc.pid
        try:
            await asyncio.sleep(0.7)
            pinned, complete = _scan_owned_members(sid, leader_pid=sid)
            try:
                assert complete
                # The setsid escapee is OWNED through the ancestry relation.
                assert len(pinned) >= 3  # shell + sleep + escapee
            finally:
                _close_pinned(pinned)
            assert await _terminate_session_until_empty(
                sid, grace=0.5, timeout=15.0
            ) is True
        finally:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()

    async def test_single_clean_scan_is_not_enough(self, monkeypatch):
        """Round-8 #2: one complete-and-empty snapshot must NOT prove
        emptiness — a member can fork after enumeration and exit."""
        import src.tools.process_manager as pm

        scans = {"n": 0}

        def scan(_sid, leader_pid=None, **_kw):
            scans["n"] += 1
            if scans["n"] == 1:
                return [], True  # first snapshot looks empty…
            if scans["n"] == 2:
                return [(4242, -1)], True  # …but a forked child appears
            return [], True

        monkeypatch.setattr(pm, "_scan_owned_members", scan)
        monkeypatch.setattr(pm, "_signal_pinned", lambda *_a: None)
        monkeypatch.setattr(pm, "_close_pinned", lambda *_a: None)
        assert await pm._terminate_session_until_empty(
            1234, timeout=5.0, term_first=False
        ) is True
        # It kept scanning past the first clean look and caught the child.
        assert scans["n"] >= 4

    async def test_settle_window_counts_consecutive_only(self, monkeypatch):
        import src.tools.process_manager as pm

        seq = [([], True), ([(1, -1)], True), ([], True), ([], True)]
        calls = {"n": 0}

        def scan(_sid, leader_pid=None, **_kw):
            i = min(calls["n"], len(seq) - 1)
            calls["n"] += 1
            return seq[i]

        monkeypatch.setattr(pm, "_scan_owned_members", scan)
        monkeypatch.setattr(pm, "_signal_pinned", lambda *_a: None)
        monkeypatch.setattr(pm, "_close_pinned", lambda *_a: None)
        assert await pm._terminate_session_until_empty(
            1, timeout=5.0, term_first=False
        ) is True
        assert calls["n"] == 4  # the non-empty scan RESET the counter


class TestReexecVeto:
    """Round-8 #3: unprovable cleanup must PREVENT the in-place re-exec."""

    def test_block_and_read_veto(self):
        from src import restart

        restart.reset()
        assert restart.reexec_blocked() is None
        restart.block_reexec("cleanup unverified: PID [42]")
        assert "PID [42]" in (restart.reexec_blocked() or "")
        restart.reset()
        assert restart.reexec_blocked() is None

    async def test_wiring_vetoes_on_cleanup_error(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        from src import restart
        from src.discord.wiring import shutdown_services
        from src.tools.process_manager import ProcessCleanupError

        restart.reset()
        registry = SimpleNamespace(
            shutdown=AsyncMock(side_effect=ProcessCleanupError("PID [4242] unproven"))
        )
        bot = SimpleNamespace(
            tool_executor=SimpleNamespace(_process_registry=registry)
        )
        try:
            await shutdown_services(bot)
            veto = restart.reexec_blocked()
            assert veto is not None and "4242" in veto
        finally:
            restart.reset()

    def test_ancestry_walk_is_bounded_and_cycle_safe(self, monkeypatch):
        """The ppid walk must terminate on a chain that leaves our
        snapshot, and on a (kernel-impossible but cheap to guard) cycle —
        neither may loop or claim ownership."""
        import src.tools.process_manager as pm

        # /proc lists two pids; one's parent is OUTSIDE the snapshot, the
        # other pair points at each other.
        monkeypatch.setattr(pm.os, "listdir", lambda _p: ["100", "200", "300"])
        monkeypatch.setattr(pm.os, "pidfd_open", lambda pid: os.open("/dev/null", os.O_RDONLY))
        table = {
            100: (999, 5),   # parent 999 not in the snapshot → unowned
            200: (300, 5),   # 200 ↔ 300 cycle, neither in our session
            300: (200, 5),
        }
        monkeypatch.setattr(pm, "_proc_ids", lambda pid: table.get(pid, "unknown"))
        pinned, complete = pm._scan_owned_members(7, leader_pid=7)
        assert pinned == []  # nothing claimed
        assert complete is True


class TestSubreaperContainment:
    """Round-9 #1: kernel-backed containment. A descendant that BOTH
    double-forks and calls setsid() leaves session AND ancestry, but as a
    child subreaper we ADOPT it — so it stays attributable and cleanup can
    never report success while it lives."""

    async def test_double_fork_setsid_escapee_is_adopted_and_killed(self):
        from src.tools.process_manager import (
            _close_pinned,
            _scan_owned_members,
            child_subreaper_active,
            reap_adopted_zombies,
            set_child_subreaper,
        )

        # Containment is PROCESS state set once at the app boundary; a
        # library constructor must never flip it. Enable it explicitly
        # here and restore it, so no other test inherits adoption.
        previously = child_subreaper_active()
        assert set_child_subreaper(True) is True
        reg = ProcessRegistry()
        assert reg._containment is True

        # Double-fork + setsid: the grandchild orphans itself past our
        # ancestry AND leaves our session, then ignores TERM.
        # exec() so PYTHON interprets the newlines: passing them through
        # the shell as literals is a SyntaxError, and the escapee would
        # never start.
        escape = (
            "import os,signal,sys,time\n"
            "if os.fork()==0:\n"
            " os.setsid()\n"
            " signal.signal(signal.SIGTERM,signal.SIG_IGN)\n"
            " time.sleep(60)\n"
            " os._exit(0)\n"
            "sys.exit(0)\n"
        )
        started = await reg.start(
            "localhost", f'python3 -c "exec({escape!r})"'
        )
        pid = int(started.split("PID ")[1].split(")")[0])
        try:
            await asyncio.sleep(1.0)
            # The escapee reparented to US (subreaper), so it is owned.
            pinned, complete = _scan_owned_members(
                pid, leader_pid=pid,
                adopted_by=os.getpid(),
                known_own_children=frozenset(reg._own_children),
                job_token=reg._processes[pid].job_token,
            )
            adopted = len(pinned)
            _close_pinned(pinned)
            assert complete and adopted >= 1  # escapee visible

            # Cleanup must actually remove it before claiming success.
            assert await reg._kill_group_until_gone(
                reg._processes[pid], timeout=12.0
            ) is True
            pinned, complete = _scan_owned_members(
                pid, leader_pid=pid,
                adopted_by=os.getpid(),
                known_own_children=frozenset(reg._own_children),
                job_token=reg._processes[pid].job_token,
            )
            left = len(pinned)
            _close_pinned(pinned)
            assert complete and left == 0
        finally:
            await reg.shutdown()
            reap_adopted_zombies(frozenset(reg._adopted_pids))
            set_child_subreaper(previously)

    def test_registry_does_not_flip_process_state(self):
        """Constructing a registry must not enable containment as a side
        effect — it reads what the application set."""
        from src.tools.process_manager import child_subreaper_active

        before = child_subreaper_active()
        ProcessRegistry()
        assert child_subreaper_active() is before

    async def test_without_containment_emptiness_is_never_claimed(self):
        """No subreaper ⇒ an escape would be undetectable ⇒ the terminator
        refuses to claim emptiness at all (honest failure, not false
        success)."""
        from src.tools.process_manager import _terminate_session_until_empty

        assert await _terminate_session_until_empty(
            4_000_000, timeout=0.5, term_first=False, containment=False
        ) is False


class TestAncestryBoundIsUncertainty:
    """Round-9 #3: walk exhaustion is UNKNOWN, never 'not ours'."""

    def test_deep_chain_makes_the_scan_incomplete(self, monkeypatch):
        import src.tools.process_manager as pm

        # A 70-deep chain: pid N's parent is N-1, root pid 2 is unrelated.
        depth = 70
        pids = list(range(2, 2 + depth))
        table = {p: (p - 1, 999) for p in pids}
        monkeypatch.setattr(pm.os, "listdir", lambda _p: [str(p) for p in pids])
        monkeypatch.setattr(
            pm.os, "pidfd_open", lambda _pid: os.open("/dev/null", os.O_RDONLY)
        )
        monkeypatch.setattr(pm, "_proc_ids", lambda pid: table.get(pid, "unknown"))
        # Leader pid deliberately OUTSIDE the chain, so no walk short-
        # circuits on it: the deepest members exhaust the bound.
        pinned, complete = pm._scan_owned_members(500_000, leader_pid=500_000)
        pm._close_pinned(pinned)
        # Bound exhaustion → uncertainty → incomplete, so emptiness can
        # never be affirmed from this scan.
        assert complete is False


class TestAnyTeardownFailureVetoesReexec:
    """Round-9 #2: an unexpected verifier error is as unproven as an
    explicit ProcessCleanupError."""

    async def test_generic_registry_error_blocks_reexec(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        from src import restart
        from src.discord.wiring import shutdown_services

        restart.reset()
        registry = SimpleNamespace(
            shutdown=AsyncMock(side_effect=RuntimeError("verifier exploded"))
        )
        bot = SimpleNamespace(
            tool_executor=SimpleNamespace(_process_registry=registry)
        )
        try:
            await shutdown_services(bot)
            veto = restart.reexec_blocked()
            assert veto is not None
            assert "RuntimeError" in veto and "verifier exploded" in veto
        finally:
            restart.reset()


class TestContainmentHelpers:
    """The prctl wrappers and the adopted-zombie sweeper."""

    def test_set_and_read_back(self):
        from src.tools.process_manager import child_subreaper_active, set_child_subreaper

        before = child_subreaper_active()
        try:
            assert set_child_subreaper(True) is True
            assert child_subreaper_active() is True
            assert set_child_subreaper(False) is False
            assert child_subreaper_active() is False
        finally:
            set_child_subreaper(before)

    def test_libc_failure_reads_as_inactive(self, monkeypatch):
        import src.tools.process_manager as pm

        def boom(*_a, **_k):
            raise OSError("no libc")

        monkeypatch.setattr(pm.ctypes, "CDLL", boom)
        assert pm.child_subreaper_active() is False
        assert pm.set_child_subreaper(True) is False

    async def test_sweeper_reaps_recorded_adopted_zombie(self):
        """Attribution happens while the process is ALIVE (a zombie's
        environ is unreadable), so the sweeper works from recorded pids —
        and only reaps zombies that are actually parented to us."""
        import src.tools.process_manager as pm

        before = pm.child_subreaper_active()
        pm.set_child_subreaper(True)
        try:
            src = (
                "import os,sys,time\n"
                "if os.fork()==0:\n"
                " time.sleep(0.6)\n"
                " os._exit(0)\n"
                "sys.exit(0)\n"
            )
            env = dict(os.environ)
            env[pm.JOB_TOKEN_ENV] = "sweeper-test-token"
            proc = await asyncio.create_subprocess_shell(
                f'python3 -c "exec({src!r})"',
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
                env=env,
            )
            await proc.wait()
            # Identify the orphan WHILE ALIVE, by provenance.
            grandchild = None
            for _ in range(40):
                for entry in os.listdir("/proc"):
                    if not entry.isdigit():
                        continue
                    pid = int(entry)
                    ids = pm._proc_ids(pid)
                    if (
                        isinstance(ids, tuple)
                        and ids[0] == os.getpid()
                        and pid != proc.pid
                        and pm._read_job_token(pid) == "sweeper-test-token"
                    ):
                        grandchild = pid
                        break
                if grandchild is not None:
                    break
                await asyncio.sleep(0.05)
            assert grandchild is not None, "orphan never reparented to us"
            identity = (grandchild, pm._proc_starttime(grandchild))
            assert identity[1] is not None
            # Once it dies it is a zombie; the recorded IDENTITY reaps it.
            for _ in range(60):
                if pm.reap_adopted_zombies({identity}) >= 1:
                    break
                await asyncio.sleep(0.1)
            else:
                pytest.fail("adopted zombie was never reaped")
        finally:
            pm.set_child_subreaper(before)

    def test_sweeper_is_a_noop_without_tokens(self, monkeypatch):
        """No job tokens ⇒ nothing is provably ours ⇒ nothing is reaped."""
        import src.tools.process_manager as pm

        waited: list[int] = []
        monkeypatch.setattr(
            pm.os, "waitpid", lambda pid, _f: waited.append(pid) or (pid, 0)
        )
        assert pm.reap_adopted_zombies() == 0  # no recorded pids → no-op
        assert waited == []

    def test_sweeper_survives_unreadable_proc(self, monkeypatch):
        import src.tools.process_manager as pm

        monkeypatch.setattr(pm, "_proc_starttime", lambda _pid: 111)

        class FakePath:
            def __init__(self, _p):
                pass

            def read_bytes(self):
                raise OSError("unreadable")

        monkeypatch.setattr(pm, "Path", FakePath)
        assert pm.reap_adopted_zombies({(4242, 111)}) == 0

    def test_prctl_nonzero_return_reads_state(self, monkeypatch):
        """A failing prctl must not be reported as success — the value is
        always read back from the kernel."""
        import src.tools.process_manager as pm

        class FakeLibc:
            def prctl(self, op, *_a):
                return -1  # every prctl fails

        monkeypatch.setattr(pm.ctypes, "CDLL", lambda *_a, **_k: FakeLibc())
        assert pm.child_subreaper_active() is False
        assert pm.set_child_subreaper(True) is False

    def test_sweeper_skips_unreadable_and_unwaitable_entries(self, monkeypatch):
        """Unreadable /proc entries and non-children are skipped, never
        raised."""
        """A vanished/unreadable /proc entry and a pid that is not our
        child are both skipped, never raised."""
        import src.tools.process_manager as pm

        class FakePath:
            def __init__(self, path):
                self.path = str(path)

            def read_bytes(self):
                if "111" in self.path:
                    raise OSError("vanished")  # unreadable → skipped
                return b"222 (x) Z " + str(os.getpid()).encode() + b" 0 0 " + b"0 " * 40

        monkeypatch.setattr(pm, "Path", FakePath)

        def not_our_child(_pid, _flags):
            raise ChildProcessError("not ours")

        monkeypatch.setattr(pm.os, "waitpid", not_our_child)
        monkeypatch.setattr(pm, "_proc_starttime", lambda _pid: 5)
        assert pm.reap_adopted_zombies({(111, 5), (222, 5)}) == 0

    def test_inline_reap_skips_own_children(self, monkeypatch):
        """The in-loop reap after KILL uses the same asyncio-safety rule:
        deliberate children are never waited on here."""
        import src.tools.process_manager as pm

        waited: list[int] = []
        monkeypatch.setattr(
            pm.os, "waitpid", lambda pid, _f: waited.append(pid) or (pid, 0)
        )
        monkeypatch.setattr(pm, "_proc_starttime", lambda _pid: 42)
        pm._reap_adopted({(100, 42), (200, 42)}, frozenset({100}))
        assert waited == [200]  # 100 is ours → left to asyncio's watcher


class TestNoCollateralDamage:
    """Round-10: adoption is containment, NOT attribution. Cleanup of one
    managed job must never touch another subsystem's direct child."""

    async def test_unrelated_asyncio_child_is_never_signalled(self):
        from src.tools.process_manager import (
            child_subreaper_active,
            set_child_subreaper,
        )

        previously = child_subreaper_active()
        set_child_subreaper(True)
        reg = ProcessRegistry()
        # A direct child of THIS process created outside the registry —
        # exactly what another Odin subsystem (ssh, run_command) has.
        unrelated = await asyncio.create_subprocess_shell(
            "sleep 30", stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            started = await reg.start("localhost", "true")
            pid = int(started.split("PID ")[1].split(")")[0])
            info = reg._processes[pid]
            assert info.job_token  # provenance minted at spawn
            gone = await reg._kill_group_until_gone(info, timeout=10.0)
            assert gone is True  # managed job cleaned up…
            await asyncio.sleep(0.3)
            # …and the unrelated child is untouched: not signalled, alive.
            assert unrelated.returncode is None
        finally:
            unrelated.kill()
            await unrelated.wait()
            await reg.shutdown()
            set_child_subreaper(previously)

    async def test_escapee_of_another_job_is_not_ours(self):
        """Two managed jobs: job A's cleanup must not claim job B's
        adopted escapee — tokens differ."""
        import src.tools.process_manager as pm

        previously = pm.child_subreaper_active()
        pm.set_child_subreaper(True)
        reg = ProcessRegistry()
        try:
            a = await reg.start("localhost", "sleep 20")
            b = await reg.start("localhost", "sleep 20")
            pid_a = int(a.split("PID ")[1].split(")")[0])
            pid_b = int(b.split("PID ")[1].split(")")[0])
            info_a, info_b = reg._processes[pid_a], reg._processes[pid_b]
            assert info_a.job_token != info_b.job_token
            # Job B's leader, seen from job A's scan with A's token, is
            # NOT owned by A (different provenance, different session).
            pinned, complete = pm._scan_owned_members(
                pid_a, leader_pid=pid_a,
                adopted_by=os.getpid(),
                known_own_children=frozenset(reg._own_children),
                job_token=info_a.job_token,
            )
            owned = {p for p, _fd in pinned}
            pm._close_pinned(pinned)
            assert pid_b not in owned
        finally:
            await reg.shutdown()
            pm.set_child_subreaper(previously)

    def test_ambiguous_direct_child_is_untouched_and_incomplete(self, monkeypatch):
        """A direct child whose provenance cannot be READ is left alone
        AND makes the scan incomplete — ambiguity never authorizes a kill
        nor permits affirmative emptiness."""
        import src.tools.process_manager as pm

        mypid = os.getpid()
        monkeypatch.setattr(pm.os, "listdir", lambda _p: ["4242"])
        monkeypatch.setattr(
            pm.os, "pidfd_open", lambda _pid: os.open("/dev/null", os.O_RDONLY)
        )
        monkeypatch.setattr(pm, "_proc_ids", lambda _pid: (mypid, 999))
        monkeypatch.setattr(pm, "_read_env_tokens", lambda _pid: pm._UNKNOWN)
        pinned, complete = pm._scan_owned_members(
            7, leader_pid=7, adopted_by=mypid, job_token="tok", proc_token="P"
        )
        pm._close_pinned(pinned)
        assert pinned == []  # untouched
        assert complete is False  # emptiness cannot be affirmed

    def test_stripped_provenance_fails_closed(self, monkeypatch):
        """Round-11 #1: the environment is CHILD-CONTROLLED (`env -i`),
        so a MISSING token can never mean 'not ours' — an escapee could
        erase its own provenance and be certified gone while alive. It is
        ambiguous: untouched, and the scan is incomplete."""
        import src.tools.process_manager as pm

        mypid = os.getpid()
        monkeypatch.setattr(pm.os, "listdir", lambda _p: ["4242"])
        monkeypatch.setattr(
            pm.os, "pidfd_open", lambda _pid: os.open("/dev/null", os.O_RDONLY)
        )
        monkeypatch.setattr(pm, "_proc_ids", lambda _pid: (mypid, 999))
        # No Odin process marker at all: the environment was discarded.
        monkeypatch.setattr(pm, "_read_env_tokens", lambda _pid: {})
        pinned, complete = pm._scan_owned_members(
            7, leader_pid=7, adopted_by=mypid, job_token="tok", proc_token="P"
        )
        pm._close_pinned(pinned)
        assert pinned == []  # never killed on a guess
        assert complete is False  # emptiness cannot be affirmed

    def test_foreign_token_is_explicitly_not_ours(self, monkeypatch):
        import src.tools.process_manager as pm

        mypid = os.getpid()
        monkeypatch.setattr(pm.os, "listdir", lambda _p: ["4242"])
        monkeypatch.setattr(
            pm.os, "pidfd_open", lambda _pid: os.open("/dev/null", os.O_RDONLY)
        )
        monkeypatch.setattr(pm, "_proc_ids", lambda _pid: (mypid, 999))
        # Carries our PROCESS marker but a different job token.
        monkeypatch.setattr(
            pm, "_read_env_tokens",
            lambda _pid: {pm.PROC_TOKEN_ENV: "P", pm.JOB_TOKEN_ENV: "someone-elses"},
        )
        pinned, complete = pm._scan_owned_members(
            7, leader_pid=7, adopted_by=mypid, job_token="tok", proc_token="P"
        )
        pm._close_pinned(pinned)
        # A DIFFERENT job's token is positive evidence, so this one is
        # decided (not ours) and the scan stays complete.
        assert pinned == [] and complete is True

    def test_reap_never_touches_foreign_provenance(self, monkeypatch):
        import src.tools.process_manager as pm

        waited: list[int] = []
        monkeypatch.setattr(
            pm.os, "waitpid", lambda pid, _f: waited.append(pid) or (pid, 0)
        )
        monkeypatch.setattr(pm, "_read_job_token", lambda pid: "ours" if pid == 1 else "theirs")
        # Only identities VERIFIED as ours (recorded at scan time) are
        # reaped, and the incarnation must still match.
        monkeypatch.setattr(pm, "_proc_starttime", lambda _pid: 111)
        pm._reap_adopted({(1, 111)}, frozenset())
        assert waited == [1]
        waited.clear()
        pm._reap_adopted(set(), frozenset())  # nothing verified → no reaping
        assert waited == []


class TestProvenanceArms:
    """Defensive arms of the per-job provenance reader."""

    def test_no_token_means_adoption_cannot_attribute(self, monkeypatch):
        """Without a job token there is no way to attribute an adopted
        child, so it is ambiguous: untouched, and the scan is incomplete."""
        import src.tools.process_manager as pm

        mypid = os.getpid()
        monkeypatch.setattr(pm.os, "listdir", lambda _p: ["4242"])
        monkeypatch.setattr(
            pm.os, "pidfd_open", lambda _pid: os.open("/dev/null", os.O_RDONLY)
        )
        monkeypatch.setattr(pm, "_proc_ids", lambda _pid: (mypid, 999))
        pinned, complete = pm._scan_owned_members(
            7, leader_pid=7, adopted_by=mypid, job_token=None
        )
        pm._close_pinned(pinned)
        assert pinned == [] and complete is False

    def test_token_reader_states(self, monkeypatch):
        import src.tools.process_manager as pm

        # Gone → None (absence is provable).
        assert pm._read_job_token(4_000_000) is None

        class GonePath:
            def __init__(self, _p):
                pass

            def read_bytes(self):
                raise FileNotFoundError()

        monkeypatch.setattr(pm, "Path", GonePath)
        assert pm._read_job_token(1) is None

        class UnreadablePath:
            def __init__(self, _p):
                pass

            def read_bytes(self):
                raise PermissionError("denied")

        monkeypatch.setattr(pm, "Path", UnreadablePath)
        assert pm._read_job_token(1) is pm._UNKNOWN  # ambiguity, not absence

        class TokenPath:
            def __init__(self, _p):
                pass

            def read_bytes(self):
                return b"PATH=/usr/bin\x00ODIN_BG_JOB=abc123\x00HOME=/root\x00"

        monkeypatch.setattr(pm, "Path", TokenPath)
        assert pm._read_job_token(1) == "abc123"

        class NoTokenPath:
            def __init__(self, _p):
                pass

            def read_bytes(self):
                return b"PATH=/usr/bin\x00HOME=/root\x00"

        monkeypatch.setattr(pm, "Path", NoTokenPath)
        assert pm._read_job_token(1) is None  # carries no token

    def test_reap_swallows_unwaitable(self, monkeypatch):
        import src.tools.process_manager as pm

        def boom(_pid, _flags):
            raise ChildProcessError("not our child")

        monkeypatch.setattr(pm.os, "waitpid", boom)
        monkeypatch.setattr(pm, "_proc_starttime", lambda _pid: 111)
        pm._reap_adopted({(4242, 111)}, frozenset())  # must not raise


class TestPidReuseSafety:
    """Round-11 #2: a bare pid is not an identity. Records carry the
    process's starttime so a reused pid can never redirect a waitpid."""

    def test_reap_skips_reused_pid_and_prunes_it(self, monkeypatch):
        import src.tools.process_manager as pm

        waited: list[int] = []
        monkeypatch.setattr(
            pm.os, "waitpid", lambda pid, _f: waited.append(pid) or (pid, 0)
        )
        monkeypatch.setattr(pm, "_proc_starttime", lambda _pid: 999)  # different
        recorded = {(4242, 111)}
        pm._reap_adopted(recorded, frozenset())
        assert waited == []  # the incarnation differs → never waited on
        assert recorded == set()  # stale record pruned

    def test_reap_prunes_vanished_identity(self, monkeypatch):
        import src.tools.process_manager as pm

        monkeypatch.setattr(pm, "_proc_starttime", lambda _pid: None)
        recorded = {(4242, 111)}
        pm._reap_adopted(recorded, frozenset())
        assert recorded == set()  # provably gone → pruned

    def test_sweeper_skips_reused_pid(self, monkeypatch):
        import src.tools.process_manager as pm

        waited: list[int] = []
        monkeypatch.setattr(
            pm.os, "waitpid", lambda pid, _f: waited.append(pid) or (pid, 0)
        )
        monkeypatch.setattr(pm, "_proc_starttime", lambda _pid: 999)
        recorded = {(4242, 111)}
        assert pm.reap_adopted_zombies(recorded) == 0
        assert waited == [] and recorded == set()

    def test_recorded_identity_carries_starttime(self, monkeypatch):
        """The scan records (pid, starttime), not a bare pid."""
        import src.tools.process_manager as pm

        mypid = os.getpid()
        monkeypatch.setattr(pm.os, "listdir", lambda _p: ["4242"])
        monkeypatch.setattr(
            pm.os, "pidfd_open", lambda _pid: os.open("/dev/null", os.O_RDONLY)
        )
        monkeypatch.setattr(pm, "_proc_ids", lambda _pid: (mypid, 999))
        monkeypatch.setattr(
            pm, "_read_env_tokens",
            lambda _pid: {pm.PROC_TOKEN_ENV: "P", pm.JOB_TOKEN_ENV: "tok"},
        )
        monkeypatch.setattr(pm, "_proc_starttime", lambda _pid: 777)
        sink: set[tuple[int, int]] = set()
        pinned, complete = pm._scan_owned_members(
            7, leader_pid=7, adopted_by=mypid, job_token="tok",
            proc_token="P", adopted_sink=sink,
        )
        pm._close_pinned(pinned)
        assert sink == {(4242, 777)}

    def test_starttime_reader_states(self):
        import src.tools.process_manager as pm

        assert pm._proc_starttime(4_000_000) is None  # gone
        assert isinstance(pm._proc_starttime(os.getpid()), int)  # live

    def test_sweeper_prunes_vanished_identity(self, monkeypatch):
        """A recorded escapee that is provably gone is pruned from the
        record rather than retained forever."""
        import src.tools.process_manager as pm

        monkeypatch.setattr(pm, "_proc_starttime", lambda _pid: None)
        recorded = {(4242, 111)}
        assert pm.reap_adopted_zombies(recorded) == 0
        assert recorded == set()


class TestSelectiveProvenanceErasure:
    """Round-12: deleting only the JOB token (keeping the process marker)
    must not read as 'another subsystem's child'."""

    def test_absent_job_token_is_ambiguous(self, monkeypatch):
        import src.tools.process_manager as pm

        mypid = os.getpid()
        monkeypatch.setattr(pm.os, "listdir", lambda _p: ["4242"])
        monkeypatch.setattr(
            pm.os, "pidfd_open", lambda _pid: os.open("/dev/null", os.O_RDONLY)
        )
        monkeypatch.setattr(pm, "_proc_ids", lambda _pid: (mypid, 999))
        # Process marker kept, job token deleted — selective erasure.
        monkeypatch.setattr(
            pm, "_read_env_tokens", lambda _pid: {pm.PROC_TOKEN_ENV: "P"}
        )
        pinned, complete = pm._scan_owned_members(
            7, leader_pid=7, adopted_by=mypid, job_token="tok", proc_token="P"
        )
        pm._close_pinned(pinned)
        assert pinned == []  # never killed on a guess
        assert complete is False  # and emptiness is NOT affirmed

    async def test_forged_or_erased_token_cannot_survive_teardown(self):
        """Round-13 (Odin's token-REPLACEMENT repro): environment markers
        are child-controlled, so they can be deleted OR forged and can
        never prove a process foreign. At teardown, adoption alone is
        sufficient — a descendant that forges its provenance, double-forks
        and setsid()s is still ended, and cleanup's verdict is honest.

        Unconditional: the escapee is located deterministically (it writes
        its pid to a file) rather than by a search that could pass
        vacuously — the flaw Odin found in the previous pin.
        """
        import src.tools.process_manager as pm

        previously = pm.child_subreaper_active()
        pm.set_child_subreaper(True)
        reg = ProcessRegistry()
        pidfile = None
        escaped = None
        try:
            import tempfile

            fd, pidfile = tempfile.mkstemp(prefix="escapee-", suffix=".pid")
            os.close(fd)
            # Script goes to a FILE: quoting a python source string through
            # the shell is how earlier attempts silently produced a dead
            # escapee (repr picks double quotes when the body contains
            # single ones, and the shell then breaks on the parens).
            script = f"""
import os, signal, sys, time
if os.fork() == 0:
    os.setsid()
    os.environ['ODIN_BG_JOB'] = 'forged-not-a-real-job'
    with open({pidfile!r}, 'w') as fh:
        fh.write(str(os.getpid()))
    os.execve(
        sys.executable,
        [sys.executable, '-c',
         'import signal,time\\n'
         'signal.signal(signal.SIGTERM, signal.SIG_IGN)\\n'
         'time.sleep(45)\\n'],
        os.environ,
    )
sys.exit(0)
"""
            script_path = pidfile + ".py"
            with open(script_path, "w") as fh:
                fh.write(script)
            started = await reg.start("localhost", f"python3 {script_path}")
            pid = int(started.split("PID ")[1].split(")")[0])

            for _ in range(60):
                text = open(pidfile).read().strip()
                if text:
                    escaped = int(text)
                    break
                await asyncio.sleep(0.1)
            assert escaped is not None, "escapee never reported its pid"
            assert pm._read_job_token(escaped) == "forged-not-a-real-job"
            assert pm._proc_starttime(escaped) is not None  # alive

            info = reg._processes[pid]
            gone = await reg._kill_group_until_gone(info, timeout=15.0)

            assert gone is True  # teardown resolves adoption as ours…
            # …and the forged escapee is actually DEAD, not just claimed.
            for _ in range(40):
                ids = pm._proc_ids(escaped)
                if ids is None:
                    break
                await asyncio.sleep(0.25)
            assert pm._proc_ids(escaped) is None, "forged escapee survived teardown"
        finally:
            if escaped is not None:
                try:
                    os.kill(escaped, 9)
                except ProcessLookupError:
                    pass
            if pidfile is not None:
                for path in (pidfile, pidfile + ".py"):
                    try:
                        os.unlink(path)
                    except OSError:
                        pass
            await reg.shutdown()
            pm.set_child_subreaper(previously)

    def test_live_cleanup_still_refuses_to_guess(self, monkeypatch):
        """Outside teardown the rule is unchanged: a forged/absent token
        is ambiguous — untouched, and emptiness is not affirmed."""
        import src.tools.process_manager as pm

        mypid = os.getpid()
        monkeypatch.setattr(pm.os, "listdir", lambda _p: ["4242"])
        monkeypatch.setattr(
            pm.os, "pidfd_open", lambda _pid: os.open("/dev/null", os.O_RDONLY)
        )
        monkeypatch.setattr(pm, "_proc_ids", lambda _pid: (mypid, 999))
        monkeypatch.setattr(
            pm, "_read_env_tokens", lambda _pid: {pm.PROC_TOKEN_ENV: "P"}
        )
        pinned, complete = pm._scan_owned_members(
            7, leader_pid=7, adopted_by=mypid, job_token="tok", proc_token="P"
        )
        pm._close_pinned(pinned)
        assert pinned == [] and complete is False

    def test_unavailable_own_session_never_sweeps(self, monkeypatch):
        """If our own session id cannot be read, the teardown arm must not
        fire — an unknown 'own session' would make every adopted child
        look like an escapee."""
        import src.tools.process_manager as pm

        mypid = os.getpid()
        monkeypatch.setattr(
            pm.os, "getsid", lambda _p: (_ for _ in ()).throw(OSError("no sid"))
        )
        monkeypatch.setattr(pm.os, "listdir", lambda _p: ["4242"])
        monkeypatch.setattr(
            pm.os, "pidfd_open", lambda _pid: os.open("/dev/null", os.O_RDONLY)
        )
        # A direct child in session -1 would "differ" from an unreadable
        # own-session sentinel; provenance must still decide it.
        monkeypatch.setattr(pm, "_proc_ids", lambda _pid: (mypid, -1))
        monkeypatch.setattr(
            pm, "_read_env_tokens", lambda _pid: {pm.PROC_TOKEN_ENV: "P"}
        )
        pinned, complete = pm._scan_owned_members(
            7, leader_pid=7, adopted_by=mypid, job_token="tok",
            proc_token="P", teardown=True,
        )
        pm._close_pinned(pinned)
        assert pinned == []  # not swept on an unknown own-session
        assert complete is False  # and emptiness is not affirmed


class TestAdoptedZombieReaper:
    """PR #244 soak finding: containment reparents escaped descendants to
    us, so nothing else will ever wait on them — without a reaper they
    accumulate as zombies for the process lifetime. Ownership is decided
    by evidence (open pidfd, registered identity), never by age alone."""

    @staticmethod
    async def _make_real_orphan_zombie() -> int:
        """A REAL double-forked orphan that dies immediately: reparented to
        us by containment, and owned by nobody (Odin's amendment: test the
        real behavior, not a mocked zombie)."""
        import tempfile

        fd, pidfile = tempfile.mkstemp(prefix="orphan-", suffix=".pid")
        os.close(fd)
        script_path = pidfile + ".py"
        with open(script_path, "w") as fh:
            fh.write(
                "import os, sys, time\n"
                "if os.fork() == 0:\n"
                f"    with open({pidfile!r}, 'w') as fh:\n"
                "        fh.write(str(os.getpid()))\n"
                "    time.sleep(0.2)\n"
                "    os._exit(0)\n"
                "sys.exit(0)\n"
            )
        proc = await asyncio.create_subprocess_exec(
            "python3", script_path,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        orphan = None
        for _ in range(60):
            text = open(pidfile).read().strip()
            if text:
                orphan = int(text)
                break
            await asyncio.sleep(0.05)
        for path in (pidfile, script_path):
            try:
                os.unlink(path)
            except OSError:
                pass
        assert orphan is not None, "orphan never reported its pid"
        return orphan

    async def test_real_orphan_zombie_is_reaped_after_grace(self):
        import src.tools.process_manager as pm

        previously = pm.child_subreaper_active()
        pm.set_child_subreaper(True)
        try:
            orphan = await self._make_real_orphan_zombie()
            # Wait for it to actually become OUR zombie.
            for _ in range(60):
                if (orphan, ) and any(
                    pid == orphan for pid, _st in pm._zombie_children(os.getpid())
                ):
                    break
                await asyncio.sleep(0.1)
            zombies = pm._zombie_children(os.getpid())
            assert any(pid == orphan for pid, _st in zombies), "never became our zombie"

            reaper = pm.AdoptedZombieReaper(grace=0.0)
            assert reaper.sweep_once() >= 1
            assert reaper.reaped_total >= 1
            # Gone for good.
            assert not any(
                pid == orphan for pid, _st in pm._zombie_children(os.getpid())
            )
        finally:
            pm.set_child_subreaper(previously)

    async def test_grace_period_holds_a_fresh_zombie(self):
        """A zombie younger than the grace is left alone — it may still be
        settling in a watcher."""
        import src.tools.process_manager as pm

        previously = pm.child_subreaper_active()
        pm.set_child_subreaper(True)
        try:
            orphan = await self._make_real_orphan_zombie()
            for _ in range(60):
                if any(pid == orphan for pid, _st in pm._zombie_children(os.getpid())):
                    break
                await asyncio.sleep(0.1)
            reaper = pm.AdoptedZombieReaper(grace=3600.0)  # effectively never
            assert reaper.sweep_once() == 0
            assert reaper.pending_zombies >= 1  # tracked, not reaped
            assert any(pid == orphan for pid, _st in pm._zombie_children(os.getpid()))
            # Teardown drain ignores the grace and takes it.
            assert reaper.drain_at_teardown() >= 1
        finally:
            pm.set_child_subreaper(previously)

    async def test_pidfd_owned_child_is_never_reaped(self, monkeypatch):
        """The decisive exclusion: an open pidfd means asyncio still owns
        that exit status, so the reaper must not take it — even when the
        process IS a zombie and past the grace."""
        import src.tools.process_manager as pm

        proc = await asyncio.create_subprocess_exec(
            "true", stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
        )
        held = os.pidfd_open(proc.pid)  # stand in for the watcher's pidfd
        try:
            owned = pm._pidfd_owned_pids()
            assert owned is not None and proc.pid in owned
            # Present it as a settled zombie of ours, past any grace.
            monkeypatch.setattr(
                pm, "_zombie_children", lambda _p: {(proc.pid, 12345): None}
            )
            waited: list[int] = []
            monkeypatch.setattr(
                pm.os, "waitpid", lambda pid, _f: waited.append(pid) or (pid, 0)
            )
            reaper = pm.AdoptedZombieReaper(grace=0.0)
            assert reaper.sweep_once() == 0
            assert waited == []  # its status was never consumed by us
            assert reaper.reaped_total == 0
        finally:
            os.close(held)
            await proc.wait()

    def test_unreadable_fd_table_reaps_nothing(self, monkeypatch):
        """If we cannot enumerate our own fds we cannot prove abandonment,
        so the pass must reap nothing — even with an eligible zombie
        present and the grace elapsed."""
        import src.tools.process_manager as pm

        real_listdir = pm.os.listdir

        def selective(path):
            if str(path).startswith("/proc/self/fd"):
                raise OSError("fd table unreadable")
            return real_listdir(path)

        monkeypatch.setattr(pm.os, "listdir", selective)
        assert pm._pidfd_owned_pids() is None
        # An eligible zombie IS present and past the grace…
        monkeypatch.setattr(
            pm, "_zombie_children", lambda _p: {(4242, 111): None}
        )
        waited: list[int] = []
        monkeypatch.setattr(
            pm.os, "waitpid", lambda pid, _f: waited.append(pid) or (pid, 0)
        )
        reaper = pm.AdoptedZombieReaper(grace=0.0)
        assert reaper.sweep_once() == 0  # …and is still not reaped
        assert waited == []

    def test_registered_identity_is_skipped(self, monkeypatch):
        import src.tools.process_manager as pm

        identity = (4242, 111)
        monkeypatch.setattr(pm, "_pidfd_owned_pids", lambda: set())
        monkeypatch.setattr(pm, "_zombie_children", lambda _p: {identity: None})
        waited: list[int] = []
        monkeypatch.setattr(
            pm.os, "waitpid", lambda pid, _f: waited.append(pid) or (pid, 0)
        )
        reaper = pm.AdoptedZombieReaper(
            grace=0.0, registered=lambda: frozenset({identity})
        )
        assert reaper.sweep_once() == 0
        assert waited == []

    def test_identity_change_between_observations_is_dropped(self, monkeypatch):
        """A pid whose incarnation changed between passes is not the
        process we saw — it is dropped, never waited on."""
        import src.tools.process_manager as pm

        monkeypatch.setattr(pm, "_pidfd_owned_pids", lambda: set())
        seq = [{(4242, 111): None}, {(4242, 999): None}]
        monkeypatch.setattr(pm, "_zombie_children", lambda _p: seq[0])
        reaper = pm.AdoptedZombieReaper(grace=3600.0)
        reaper.sweep_once()
        assert reaper.pending_zombies == 1
        seq[0] = seq[1]  # pid reused by a different incarnation
        reaper.sweep_once()
        assert (4242, 111) not in reaper._first_seen  # old identity forgotten

    async def test_sweep_failure_does_not_kill_the_task(self, monkeypatch):
        import src.tools.process_manager as pm

        reaper = pm.AdoptedZombieReaper(scan_interval=0.05, grace=0.0)
        calls = {"n": 0}

        def boom():
            calls["n"] += 1
            raise RuntimeError("sweep exploded")

        monkeypatch.setattr(reaper, "sweep_once", boom)
        pm.set_child_subreaper(True)
        reaper.start()
        try:
            for _ in range(40):
                if calls["n"] >= 2:
                    break
                await asyncio.sleep(0.05)
            assert calls["n"] >= 2  # survived the first failure
            assert reaper._task is not None and not reaper._task.done()
        finally:
            await reaper.stop()

    async def test_start_requires_containment_and_stop_is_clean(self, monkeypatch):
        import src.tools.process_manager as pm

        monkeypatch.setattr(pm, "child_subreaper_active", lambda: False)
        reaper = pm.AdoptedZombieReaper()
        reaper.start()
        assert reaper._task is None  # no containment ⇒ nothing to reap

        monkeypatch.setattr(pm, "child_subreaper_active", lambda: True)
        reaper.start()
        assert reaper._task is not None
        await reaper.stop()
        assert reaper._task is None

    def test_stats_surface(self):
        import src.tools.process_manager as pm

        reaper = pm.AdoptedZombieReaper()
        assert reaper.stats == {"pending_zombies": 0, "reaped_total": 0}

    def test_pidfd_scan_tolerates_malformed_fdinfo(self, monkeypatch, tmp_path):
        """A malformed or racing fdinfo entry is skipped, never raised."""
        import src.tools.process_manager as pm

        monkeypatch.setattr(pm.os, "listdir", lambda _p: ["3", "4"])

        class FakePath:
            def __init__(self, path):
                self.path = str(path)

            def read_text(self):
                if self.path.endswith("/3"):
                    return "pos:\t0\nPid:\tnot-a-number\n"  # malformed
                raise OSError("fd closed under us")  # racing close

        monkeypatch.setattr(pm, "Path", FakePath)
        assert pm._pidfd_owned_pids() == set()  # neither raised

    def test_zombie_scan_tolerates_unreadable_proc(self, monkeypatch):
        import src.tools.process_manager as pm

        monkeypatch.setattr(
            pm.os, "listdir", lambda _p: (_ for _ in ()).throw(OSError("gone"))
        )
        assert pm._zombie_children(os.getpid()) == {}

    async def test_stop_is_idempotent_without_a_task(self):
        import src.tools.process_manager as pm

        reaper = pm.AdoptedZombieReaper()
        await reaper.stop()  # never started — must be a clean no-op
        await reaper.stop()

    async def test_cancellation_propagates_out_of_the_loop(self, monkeypatch):
        """CancelledError must end the task, not be swallowed as a
        per-pass failure."""
        import src.tools.process_manager as pm

        reaper = pm.AdoptedZombieReaper(scan_interval=0.01, grace=0.0)
        monkeypatch.setattr(pm, "child_subreaper_active", lambda: True)

        def cancel_now():
            raise asyncio.CancelledError()

        monkeypatch.setattr(reaper, "sweep_once", cancel_now)
        reaper.start()
        task = reaper._task
        assert task is not None
        for _ in range(60):
            if task.done():
                break
            await asyncio.sleep(0.02)
        assert task.done() and task.cancelled()
        await reaper.stop()

    def test_vanished_between_verify_and_reap_is_dropped(self, monkeypatch):
        """The re-verification immediately before waitpid: an identity that
        stopped being our zombie is dropped, never waited on."""
        import src.tools.process_manager as pm

        identity = (4242, 111)
        monkeypatch.setattr(pm, "_pidfd_owned_pids", lambda: set())
        calls = {"n": 0}

        def zombies(_p):
            calls["n"] += 1
            return {identity: None} if calls["n"] == 1 else {}

        monkeypatch.setattr(pm, "_zombie_children", zombies)
        waited: list[int] = []
        monkeypatch.setattr(
            pm.os, "waitpid", lambda pid, _f: waited.append(pid) or (pid, 0)
        )
        reaper = pm.AdoptedZombieReaper(grace=0.0)
        assert reaper.sweep_once() == 0
        assert waited == []  # re-verify said it was gone
        assert reaper.pending_zombies == 0

    def test_waitpid_error_is_swallowed(self, monkeypatch):
        """Losing the race to another owner is not an error."""
        import src.tools.process_manager as pm

        identity = (4242, 111)
        monkeypatch.setattr(pm, "_pidfd_owned_pids", lambda: set())
        monkeypatch.setattr(pm, "_zombie_children", lambda _p: {identity: None})

        def not_ours(_pid, _flags):
            raise ChildProcessError("someone else took it")

        monkeypatch.setattr(pm.os, "waitpid", not_ours)
        reaper = pm.AdoptedZombieReaper(grace=0.0)
        assert reaper.sweep_once() == 0
        assert reaper.reaped_total == 0

    def test_zombie_scan_skips_vanished_and_malformed_entries(self, monkeypatch):
        """A process that exits mid-scan, or a truncated stat line, is
        skipped rather than raising out of the sweep."""
        import src.tools.process_manager as pm

        monkeypatch.setattr(pm.os, "listdir", lambda _p: ["111", "222", "notapid"])

        class FakePath:
            def __init__(self, path):
                self.path = str(path)

            def read_bytes(self):
                if "/111/" in self.path:
                    raise FileNotFoundError()  # vanished mid-scan
                return b"222 (x) Z"  # truncated — no fields after comm

        monkeypatch.setattr(pm, "Path", FakePath)
        assert pm._zombie_children(os.getpid()) == {}
