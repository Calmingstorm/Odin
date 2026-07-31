"""Tests for background process manager (src/tools/process_manager.py).

Covers ProcessInfo, ProcessRegistry: start, poll, write, kill, list_all,
shutdown, cleanup, concurrency limits, and lifetime enforcement.
"""
from __future__ import annotations

import asyncio
import time
from collections import deque
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.tools.process_manager import (
    MAX_CONCURRENT,
    MAX_LIFETIME_SECONDS,
    OUTPUT_BUFFER_LINES,
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
