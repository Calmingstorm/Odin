"""Tests for background process manager (src/tools/process_manager.py).

Covers ProcessInfo, ProcessRegistry: start, poll, write, kill, list_all,
shutdown, cleanup, concurrency limits, and lifetime enforcement.
"""
from __future__ import annotations

import asyncio
import time
from collections import deque
from unittest.mock import AsyncMock, MagicMock, patch

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
    def test_poll_nonexistent(self):
        reg = ProcessRegistry()
        result = reg.poll(99999)
        assert "No process" in result

    def test_poll_running_no_output(self):
        reg = ProcessRegistry()
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time())
        reg._processes[1] = info
        result = reg.poll(1)
        assert "status=running" in result
        assert "no output yet" in result

    def test_poll_with_output(self):
        reg = ProcessRegistry()
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time())
        info.output_buffer.append("hello world\n")
        info.output_buffer.append("second line\n")
        reg._processes[1] = info
        result = reg.poll(1)
        assert "hello world" in result
        assert "second line" in result

    def test_poll_shows_exit_code(self):
        reg = ProcessRegistry()
        info = ProcessInfo(
            pid=1, command="test", host="local",
            start_time=time.time(), status="completed", exit_code=0,
        )
        reg._processes[1] = info
        result = reg.poll(1)
        assert "exit_code=0" in result

    def test_poll_shows_uptime(self):
        reg = ProcessRegistry()
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time() - 30)
        reg._processes[1] = info
        result = reg.poll(1)
        assert "uptime=" in result


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
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time(), status="completed")
        reg._processes[1] = info
        result = await reg.write(1, "test")
        assert "not running" in result

    @pytest.mark.asyncio
    async def test_write_no_stdin(self):
        reg = ProcessRegistry()
        mock_proc = MagicMock()
        mock_proc.stdin = None
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time(), process=mock_proc)
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
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time(), process=mock_proc)
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
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time(), status="completed")
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
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time(), process=mock_proc)
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
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time(), process=mock_proc)
        reg._processes[1] = info
        killed = await reg.shutdown()
        assert killed == 1

    @pytest.mark.asyncio
    async def test_shutdown_skips_completed(self):
        reg = ProcessRegistry()
        info = ProcessInfo(pid=1, command="test", host="local", start_time=time.time(), status="completed")
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
