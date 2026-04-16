"""Tests for src/tools/output_streamer.py — tool output streaming."""
from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.tools.output_streamer import (
    StreamChunk,
    ToolOutputStreamer,
    _ActiveStream,
)


# ---------------------------------------------------------------------------
# StreamChunk
# ---------------------------------------------------------------------------

class TestStreamChunk:
    def test_basic_fields(self):
        c = StreamChunk(
            tool_name="run_command",
            chunk="hello\n",
            sequence=0,
            timestamp="2026-01-01T00:00:00+00:00",
            channel_id="web-default",
        )
        assert c.tool_name == "run_command"
        assert c.chunk == "hello\n"
        assert c.sequence == 0
        assert c.finished is False

    def test_finished_flag(self):
        c = StreamChunk(
            tool_name="x", chunk="", sequence=1,
            timestamp="t", channel_id="c", finished=True,
        )
        assert c.finished is True

    def test_to_dict(self):
        c = StreamChunk(
            tool_name="run_command", chunk="data",
            sequence=3, timestamp="ts", channel_id="ch",
        )
        d = c.to_dict()
        assert d["tool_name"] == "run_command"
        assert d["chunk"] == "data"
        assert d["sequence"] == 3
        assert d["timestamp"] == "ts"
        assert d["channel_id"] == "ch"
        assert d["finished"] is False

    def test_to_dict_finished(self):
        c = StreamChunk(
            tool_name="t", chunk="", sequence=0,
            timestamp="ts", channel_id="c", finished=True,
        )
        assert c.to_dict()["finished"] is True

    def test_to_dict_all_keys(self):
        d = StreamChunk(
            tool_name="t", chunk="c", sequence=0,
            timestamp="ts", channel_id="ch",
        ).to_dict()
        expected_keys = {"tool_name", "chunk", "sequence", "timestamp", "channel_id", "finished"}
        assert set(d.keys()) == expected_keys


# ---------------------------------------------------------------------------
# _ActiveStream
# ---------------------------------------------------------------------------

class TestActiveStream:
    def test_default_values(self):
        s = _ActiveStream(tool_name="t", channel_id="c", started_at=1.0)
        assert s.sequence == 0
        assert s.last_emit == 0.0
        assert s.buffered == ""
        assert s.total_chars == 0

    def test_mutable_fields(self):
        s = _ActiveStream(tool_name="t", channel_id="c", started_at=1.0)
        s.sequence = 5
        s.buffered = "abc"
        s.total_chars = 100
        assert s.sequence == 5
        assert s.buffered == "abc"
        assert s.total_chars == 100


# ---------------------------------------------------------------------------
# ToolOutputStreamer — construction & properties
# ---------------------------------------------------------------------------

class TestStreamerInit:
    def test_default_construction(self):
        s = ToolOutputStreamer()
        assert s.enabled_tools == set()
        assert s.chunk_interval == 1.0
        assert s.active_stream_count == 0

    def test_custom_enabled_tools(self):
        s = ToolOutputStreamer(enabled_tools={"run_command", "run_script"})
        assert s.enabled_tools == {"run_command", "run_script"}

    def test_custom_chunk_interval(self):
        s = ToolOutputStreamer(chunk_interval=2.5)
        assert s.chunk_interval == 2.5

    def test_chunk_interval_minimum(self):
        s = ToolOutputStreamer(chunk_interval=0.01)
        assert s.chunk_interval == 0.1

    def test_enabled_tools_returns_copy(self):
        s = ToolOutputStreamer(enabled_tools={"run_command"})
        tools = s.enabled_tools
        tools.add("other")
        assert "other" not in s.enabled_tools


# ---------------------------------------------------------------------------
# ToolOutputStreamer — is_enabled
# ---------------------------------------------------------------------------

class TestIsEnabled:
    def test_enabled_tool(self):
        s = ToolOutputStreamer(enabled_tools={"run_command"})
        assert s.is_enabled("run_command") is True

    def test_disabled_tool(self):
        s = ToolOutputStreamer(enabled_tools={"run_command"})
        assert s.is_enabled("read_file") is False

    def test_empty_enabled_set(self):
        s = ToolOutputStreamer()
        assert s.is_enabled("run_command") is False

    def test_none_enabled_set(self):
        s = ToolOutputStreamer(enabled_tools=None)
        assert s.is_enabled("run_command") is False


# ---------------------------------------------------------------------------
# ToolOutputStreamer — listeners
# ---------------------------------------------------------------------------

class TestListeners:
    def test_add_listener(self):
        s = ToolOutputStreamer()
        cb = AsyncMock()
        s.add_listener(cb)
        assert cb in s._listeners

    def test_add_listener_no_duplicates(self):
        s = ToolOutputStreamer()
        cb = AsyncMock()
        s.add_listener(cb)
        s.add_listener(cb)
        assert s._listeners.count(cb) == 1

    def test_remove_listener(self):
        s = ToolOutputStreamer()
        cb = AsyncMock()
        s.add_listener(cb)
        s.remove_listener(cb)
        assert cb not in s._listeners

    def test_remove_nonexistent_listener(self):
        s = ToolOutputStreamer()
        cb = AsyncMock()
        s.remove_listener(cb)  # should not raise

    @pytest.mark.asyncio
    async def test_emit_calls_listeners(self):
        s = ToolOutputStreamer()
        cb1 = AsyncMock()
        cb2 = AsyncMock()
        s.add_listener(cb1)
        s.add_listener(cb2)
        chunk = StreamChunk(
            tool_name="t", chunk="x", sequence=0,
            timestamp="ts", channel_id="c",
        )
        await s._emit(chunk)
        cb1.assert_awaited_once_with(chunk)
        cb2.assert_awaited_once_with(chunk)

    @pytest.mark.asyncio
    async def test_emit_ignores_listener_errors(self):
        s = ToolOutputStreamer()
        bad = AsyncMock(side_effect=RuntimeError("boom"))
        good = AsyncMock()
        s.add_listener(bad)
        s.add_listener(good)
        chunk = StreamChunk(
            tool_name="t", chunk="x", sequence=0,
            timestamp="ts", channel_id="c",
        )
        await s._emit(chunk)
        good.assert_awaited_once_with(chunk)

    @pytest.mark.asyncio
    async def test_emit_no_listeners(self):
        s = ToolOutputStreamer()
        chunk = StreamChunk(
            tool_name="t", chunk="x", sequence=0,
            timestamp="ts", channel_id="c",
        )
        await s._emit(chunk)  # should not raise


# ---------------------------------------------------------------------------
# ToolOutputStreamer — create_callback
# ---------------------------------------------------------------------------

class TestCreateCallback:
    def test_returns_three_tuple(self):
        s = ToolOutputStreamer(enabled_tools={"run_command"})
        stream_id, on_output, finish = s.create_callback("run_command", "ch1")
        assert isinstance(stream_id, str)
        assert callable(on_output)
        assert callable(finish)

    def test_active_stream_registered(self):
        s = ToolOutputStreamer(enabled_tools={"run_command"})
        assert s.active_stream_count == 0
        stream_id, _, _ = s.create_callback("run_command")
        assert s.active_stream_count == 1

    @pytest.mark.asyncio
    async def test_finish_removes_stream(self):
        s = ToolOutputStreamer(enabled_tools={"run_command"})
        s.add_listener(AsyncMock())
        _, _, finish = s.create_callback("run_command")
        assert s.active_stream_count == 1
        await finish()
        assert s.active_stream_count == 0

    @pytest.mark.asyncio
    async def test_on_output_buffers_text(self):
        s = ToolOutputStreamer(
            enabled_tools={"run_command"}, chunk_interval=100.0,
        )
        listener = AsyncMock()
        s.add_listener(listener)
        _, on_output, _ = s.create_callback("run_command")
        await on_output("line1\n")
        await on_output("line2\n")
        # chunk_interval is very long, so nothing emitted yet
        listener.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_on_output_emits_after_interval(self):
        s = ToolOutputStreamer(
            enabled_tools={"run_command"}, chunk_interval=0.1,
        )
        listener = AsyncMock()
        s.add_listener(listener)
        _, on_output, _ = s.create_callback("run_command")
        # Force last_emit into the past so first call passes interval check
        stream = list(s._active_streams.values())[0]
        stream.last_emit = 0.0
        await on_output("line1\n")
        assert listener.await_count == 1
        chunk = listener.call_args[0][0]
        assert chunk.chunk == "line1\n"
        assert chunk.sequence == 0
        assert chunk.finished is False

    @pytest.mark.asyncio
    async def test_finish_flushes_buffer(self):
        s = ToolOutputStreamer(
            enabled_tools={"run_command"}, chunk_interval=100.0,
        )
        listener = AsyncMock()
        s.add_listener(listener)
        _, on_output, finish = s.create_callback("run_command", "ch")
        await on_output("buffered data")
        assert listener.await_count == 0
        await finish()
        # Should have emitted buffered chunk + final finished chunk
        assert listener.await_count == 2
        buffered = listener.call_args_list[0][0][0]
        assert buffered.chunk == "buffered data"
        assert buffered.finished is False
        final = listener.call_args_list[1][0][0]
        assert final.chunk == ""
        assert final.finished is True

    @pytest.mark.asyncio
    async def test_finish_empty_buffer(self):
        s = ToolOutputStreamer(
            enabled_tools={"run_command"}, chunk_interval=0.1,
        )
        listener = AsyncMock()
        s.add_listener(listener)
        _, _, finish = s.create_callback("run_command")
        await finish()
        # Only the final finished chunk
        assert listener.await_count == 1
        final = listener.call_args[0][0]
        assert final.finished is True
        assert final.chunk == ""

    @pytest.mark.asyncio
    async def test_total_chars_tracked(self):
        s = ToolOutputStreamer(
            enabled_tools={"run_command"}, chunk_interval=100.0,
        )
        s.add_listener(AsyncMock())
        stream_id, on_output, _ = s.create_callback("run_command")
        await on_output("12345")
        await on_output("678")
        stream = s._active_streams[stream_id]
        assert stream.total_chars == 8

    @pytest.mark.asyncio
    async def test_max_chunk_chars_truncation(self):
        s = ToolOutputStreamer(
            enabled_tools={"run_command"},
            chunk_interval=0.1,
            max_chunk_chars=10,
        )
        listener = AsyncMock()
        s.add_listener(listener)
        _, on_output, _ = s.create_callback("run_command")
        stream = list(s._active_streams.values())[0]
        stream.last_emit = 0.0  # force past interval
        await on_output("a" * 20)
        chunk = listener.call_args[0][0]
        assert len(chunk.chunk) == 10

    @pytest.mark.asyncio
    async def test_channel_id_passed_through(self):
        s = ToolOutputStreamer(
            enabled_tools={"run_command"}, chunk_interval=0.1,
        )
        listener = AsyncMock()
        s.add_listener(listener)
        _, on_output, _ = s.create_callback("run_command", "my-channel")
        stream = list(s._active_streams.values())[0]
        stream.last_emit = 0.0  # force past interval
        await on_output("data")
        chunk = listener.call_args[0][0]
        assert chunk.channel_id == "my-channel"

    @pytest.mark.asyncio
    async def test_sequence_increments(self):
        s = ToolOutputStreamer(
            enabled_tools={"run_command"}, chunk_interval=0.1,
        )
        listener = AsyncMock()
        s.add_listener(listener)
        _, on_output, finish = s.create_callback("run_command")
        stream = list(s._active_streams.values())[0]
        stream.last_emit = 0.0  # force past interval
        await on_output("a")
        # Force interval to pass again
        stream.last_emit = 0.0
        await on_output("b")
        assert listener.await_count == 2
        seq0 = listener.call_args_list[0][0][0].sequence
        seq1 = listener.call_args_list[1][0][0].sequence
        assert seq0 == 0
        assert seq1 == 1


# ---------------------------------------------------------------------------
# ToolOutputStreamer — get_active_streams
# ---------------------------------------------------------------------------

class TestGetActiveStreams:
    def test_empty(self):
        s = ToolOutputStreamer()
        assert s.get_active_streams() == []

    def test_with_active_stream(self):
        s = ToolOutputStreamer(enabled_tools={"run_command"})
        stream_id, _, _ = s.create_callback("run_command", "ch1")
        streams = s.get_active_streams()
        assert len(streams) == 1
        info = streams[0]
        assert info["stream_id"] == stream_id
        assert info["tool_name"] == "run_command"
        assert info["channel_id"] == "ch1"
        assert info["total_chars"] == 0
        assert info["chunks_sent"] == 0
        assert "elapsed_seconds" in info

    @pytest.mark.asyncio
    async def test_after_finish_stream_removed(self):
        s = ToolOutputStreamer(enabled_tools={"run_command"})
        s.add_listener(AsyncMock())
        _, _, finish = s.create_callback("run_command")
        await finish()
        assert s.get_active_streams() == []

    def test_multiple_streams(self):
        s = ToolOutputStreamer(enabled_tools={"run_command", "run_script"})
        s.create_callback("run_command")
        s.create_callback("run_script")
        assert len(s.get_active_streams()) == 2


# ---------------------------------------------------------------------------
# run_local_command with on_output
# ---------------------------------------------------------------------------

class TestRunLocalCommandStreaming:
    @pytest.mark.asyncio
    async def test_no_callback_returns_normally(self):
        from src.tools.ssh import run_local_command
        code, output = await run_local_command("echo hello", timeout=10)
        assert code == 0
        assert "hello" in output

    @pytest.mark.asyncio
    async def test_callback_receives_lines(self):
        from src.tools.ssh import run_local_command
        lines: list[str] = []

        async def on_output(line: str) -> None:
            lines.append(line)

        code, output = await run_local_command(
            "echo line1 && echo line2", timeout=10, on_output=on_output,
        )
        assert code == 0
        assert len(lines) == 2
        assert "line1" in lines[0]
        assert "line2" in lines[1]

    @pytest.mark.asyncio
    async def test_callback_output_matches_return(self):
        from src.tools.ssh import run_local_command
        lines: list[str] = []

        async def on_output(line: str) -> None:
            lines.append(line)

        code, output = await run_local_command(
            "echo abc", timeout=10, on_output=on_output,
        )
        assert code == 0
        assert "".join(lines).strip() == output.strip()

    @pytest.mark.asyncio
    async def test_callback_with_stderr(self):
        from src.tools.ssh import run_local_command
        lines: list[str] = []

        async def on_output(line: str) -> None:
            lines.append(line)

        code, output = await run_local_command(
            "echo out && echo err >&2", timeout=10, on_output=on_output,
        )
        assert len(lines) >= 1  # stderr merged to stdout

    @pytest.mark.asyncio
    async def test_callback_with_failing_command(self):
        from src.tools.ssh import run_local_command
        lines: list[str] = []

        async def on_output(line: str) -> None:
            lines.append(line)

        code, output = await run_local_command(
            "echo before && false", timeout=10, on_output=on_output,
        )
        assert code != 0
        assert len(lines) >= 1

    @pytest.mark.asyncio
    async def test_callback_timeout(self):
        from src.tools.ssh import run_local_command
        lines: list[str] = []

        async def on_output(line: str) -> None:
            lines.append(line)

        code, output = await run_local_command(
            "echo start && sleep 30", timeout=1, on_output=on_output,
        )
        assert code == 1
        assert "timed out" in output.lower()

    @pytest.mark.asyncio
    async def test_callback_exception_ignored(self):
        from src.tools.ssh import run_local_command

        async def bad_callback(line: str) -> None:
            raise RuntimeError("boom")

        code, output = await run_local_command(
            "echo test", timeout=10, on_output=bad_callback,
        )
        assert code == 0
        assert "test" in output

    @pytest.mark.asyncio
    async def test_callback_multiline(self):
        from src.tools.ssh import run_local_command
        lines: list[str] = []

        async def on_output(line: str) -> None:
            lines.append(line)

        code, output = await run_local_command(
            "printf 'a\\nb\\nc\\n'", timeout=10, on_output=on_output,
        )
        assert code == 0
        assert len(lines) == 3


# ---------------------------------------------------------------------------
# run_ssh_command with on_output (mocked)
# ---------------------------------------------------------------------------

class TestRunSSHCommandStreaming:
    @pytest.mark.asyncio
    async def test_on_output_parameter_accepted(self):
        from src.tools.ssh import run_ssh_command
        lines: list[str] = []

        async def on_output(line: str) -> None:
            lines.append(line)

        with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec:
            proc = AsyncMock()
            proc.stdout.readline = AsyncMock(
                side_effect=[b"line1\n", b"line2\n", b""],
            )
            proc.wait = AsyncMock()
            proc.returncode = 0
            mock_exec.return_value = proc

            code, output = await run_ssh_command(
                host="10.0.0.1",
                command="echo test",
                ssh_key_path="/tmp/key",
                known_hosts_path="/tmp/known",
                timeout=10,
                on_output=on_output,
            )
            assert code == 0
            assert len(lines) == 2
            assert "line1" in lines[0]

    @pytest.mark.asyncio
    async def test_without_on_output_uses_communicate(self):
        from src.tools.ssh import run_ssh_command

        with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec:
            proc = AsyncMock()
            proc.communicate = AsyncMock(return_value=(b"output\n", None))
            proc.returncode = 0
            mock_exec.return_value = proc

            code, output = await run_ssh_command(
                host="10.0.0.1",
                command="echo test",
                ssh_key_path="/tmp/key",
                known_hosts_path="/tmp/known",
                timeout=10,
            )
            assert code == 0
            proc.communicate.assert_awaited_once()


# ---------------------------------------------------------------------------
# _exec_command passes on_output through
# ---------------------------------------------------------------------------

class TestExecCommandStreaming:
    @pytest.mark.asyncio
    async def test_local_passes_on_output(self):
        from src.tools.executor import ToolExecutor

        executor = ToolExecutor.__new__(ToolExecutor)
        executor.config = MagicMock()
        executor.config.command_timeout_seconds = 30
        executor.bulkheads = MagicMock()
        executor.bulkheads.get.return_value = None
        executor.ssh_pool = None

        cb = AsyncMock()
        with patch("src.tools.executor.is_local_address", return_value=True), \
             patch("src.tools.executor.run_local_command", new_callable=AsyncMock, return_value=(0, "ok")) as mock_run:
            await executor._exec_command("127.0.0.1", "echo hi", on_output=cb)
            mock_run.assert_awaited_once()
            _, kwargs = mock_run.call_args
            assert kwargs["on_output"] is cb

    @pytest.mark.asyncio
    async def test_ssh_passes_on_output(self):
        from src.tools.executor import ToolExecutor

        executor = ToolExecutor.__new__(ToolExecutor)
        executor.config = MagicMock()
        executor.config.command_timeout_seconds = 30
        executor.config.ssh_key_path = "/key"
        executor.config.ssh_known_hosts_path = "/known"
        executor.config.ssh_retry = MagicMock(max_retries=1, base_delay=0.5, max_delay=10.0)
        executor.bulkheads = MagicMock()
        executor.bulkheads.get.return_value = None
        executor.ssh_pool = None

        cb = AsyncMock()
        with patch("src.tools.executor.is_local_address", return_value=False), \
             patch("src.tools.executor.run_ssh_command", new_callable=AsyncMock, return_value=(0, "ok")) as mock_run:
            await executor._exec_command("10.0.0.1", "echo hi", on_output=cb)
            mock_run.assert_awaited_once()
            _, kwargs = mock_run.call_args
            assert kwargs["on_output"] is cb

    @pytest.mark.asyncio
    async def test_no_on_output_default(self):
        from src.tools.executor import ToolExecutor

        executor = ToolExecutor.__new__(ToolExecutor)
        executor.config = MagicMock()
        executor.config.command_timeout_seconds = 30
        executor.bulkheads = MagicMock()
        executor.bulkheads.get.return_value = None
        executor.ssh_pool = None

        with patch("src.tools.executor.is_local_address", return_value=True), \
             patch("src.tools.executor.run_local_command", new_callable=AsyncMock, return_value=(0, "ok")) as mock_run:
            await executor._exec_command("127.0.0.1", "echo hi")
            _, kwargs = mock_run.call_args
            assert kwargs["on_output"] is None


# ---------------------------------------------------------------------------
# _handle_run_command streaming integration
# ---------------------------------------------------------------------------

class TestHandleRunCommandStreaming:
    @pytest.mark.asyncio
    async def test_streaming_enabled_creates_callback(self):
        from src.tools.executor import ToolExecutor

        executor = ToolExecutor.__new__(ToolExecutor)
        executor.config = MagicMock()
        executor.config.command_timeout_seconds = 30
        executor.config.hosts = {"myhost": MagicMock(address="127.0.0.1", ssh_user="root", os="linux")}
        executor.bulkheads = MagicMock()
        executor.bulkheads.get.return_value = None
        executor.ssh_pool = None
        executor._branch_freshness_enabled = False

        streamer = MagicMock(spec=ToolOutputStreamer)
        streamer.is_enabled.return_value = True
        finish = AsyncMock()
        streamer.create_callback.return_value = ("sid", AsyncMock(), finish)
        executor.output_streamer = streamer

        with patch("src.tools.executor.is_local_address", return_value=True), \
             patch("src.tools.executor.run_local_command", new_callable=AsyncMock, return_value=(0, "output")):
            result = await executor._handle_run_command({"host": "myhost", "command": "ls"})

        streamer.create_callback.assert_called_once_with("run_command", channel_id="myhost")
        finish.assert_awaited_once()
        assert "output" in result

    @pytest.mark.asyncio
    async def test_streaming_disabled_no_callback(self):
        from src.tools.executor import ToolExecutor

        executor = ToolExecutor.__new__(ToolExecutor)
        executor.config = MagicMock()
        executor.config.command_timeout_seconds = 30
        executor.config.hosts = {"myhost": MagicMock(address="127.0.0.1", ssh_user="root", os="linux")}
        executor.bulkheads = MagicMock()
        executor.bulkheads.get.return_value = None
        executor.ssh_pool = None
        executor._branch_freshness_enabled = False

        streamer = MagicMock(spec=ToolOutputStreamer)
        streamer.is_enabled.return_value = False
        executor.output_streamer = streamer

        with patch("src.tools.executor.is_local_address", return_value=True), \
             patch("src.tools.executor.run_local_command", new_callable=AsyncMock, return_value=(0, "output")) as mock_run:
            await executor._handle_run_command({"host": "myhost", "command": "ls"})

        streamer.create_callback.assert_not_called()
        _, kwargs = mock_run.call_args
        assert kwargs["on_output"] is None

    @pytest.mark.asyncio
    async def test_no_streamer_works(self):
        from src.tools.executor import ToolExecutor

        executor = ToolExecutor.__new__(ToolExecutor)
        executor.config = MagicMock()
        executor.config.command_timeout_seconds = 30
        executor.config.hosts = {"myhost": MagicMock(address="127.0.0.1", ssh_user="root", os="linux")}
        executor.bulkheads = MagicMock()
        executor.bulkheads.get.return_value = None
        executor.ssh_pool = None
        executor._branch_freshness_enabled = False
        executor.output_streamer = None

        with patch("src.tools.executor.is_local_address", return_value=True), \
             patch("src.tools.executor.run_local_command", new_callable=AsyncMock, return_value=(0, "output")):
            result = await executor._handle_run_command({"host": "myhost", "command": "ls"})
            assert "output" in result

    @pytest.mark.asyncio
    async def test_unknown_host_calls_finish(self):
        from src.tools.executor import ToolExecutor

        executor = ToolExecutor.__new__(ToolExecutor)
        executor.config = MagicMock()
        executor.config.hosts = {}
        executor._branch_freshness_enabled = False

        streamer = MagicMock(spec=ToolOutputStreamer)
        streamer.is_enabled.return_value = True
        finish = AsyncMock()
        streamer.create_callback.return_value = ("sid", AsyncMock(), finish)
        executor.output_streamer = streamer

        result = await executor._handle_run_command({"host": "badhost", "command": "ls"})
        assert "Unknown" in result
        finish.assert_awaited_once()


# ---------------------------------------------------------------------------
# _handle_run_script streaming integration
# ---------------------------------------------------------------------------

class TestHandleRunScriptStreaming:
    @pytest.mark.asyncio
    async def test_streaming_enabled(self):
        from src.tools.executor import ToolExecutor

        executor = ToolExecutor.__new__(ToolExecutor)
        executor.config = MagicMock()
        executor.config.command_timeout_seconds = 30
        executor.config.hosts = {"myhost": MagicMock(address="127.0.0.1", ssh_user="root", os="linux")}
        executor.bulkheads = MagicMock()
        executor.bulkheads.get.return_value = None
        executor.ssh_pool = None
        executor._branch_freshness_enabled = False

        streamer = MagicMock(spec=ToolOutputStreamer)
        streamer.is_enabled.return_value = True
        finish = AsyncMock()
        streamer.create_callback.return_value = ("sid", AsyncMock(), finish)
        executor.output_streamer = streamer

        with patch("src.tools.executor.is_local_address", return_value=True), \
             patch("src.tools.executor.run_local_command", new_callable=AsyncMock, return_value=(0, "output")):
            result = await executor._handle_run_script({
                "host": "myhost", "script": "echo hi", "interpreter": "bash",
            })

        streamer.create_callback.assert_called_once_with("run_script", channel_id="myhost")
        finish.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_streaming_disabled(self):
        from src.tools.executor import ToolExecutor

        executor = ToolExecutor.__new__(ToolExecutor)
        executor.config = MagicMock()
        executor.config.command_timeout_seconds = 30
        executor.config.hosts = {"myhost": MagicMock(address="127.0.0.1", ssh_user="root", os="linux")}
        executor.bulkheads = MagicMock()
        executor.bulkheads.get.return_value = None
        executor.ssh_pool = None
        executor._branch_freshness_enabled = False
        executor.output_streamer = None

        with patch("src.tools.executor.is_local_address", return_value=True), \
             patch("src.tools.executor.run_local_command", new_callable=AsyncMock, return_value=(0, "output")):
            result = await executor._handle_run_script({
                "host": "myhost", "script": "echo hi", "interpreter": "bash",
            })
            assert "output" in result


# ---------------------------------------------------------------------------
# Config — StreamingConfig
# ---------------------------------------------------------------------------

class TestStreamingConfig:
    def test_default_values(self):
        from src.config.schema import StreamingConfig
        cfg = StreamingConfig()
        assert cfg.enabled is False
        assert cfg.tools == []
        assert cfg.chunk_interval_seconds == 1.0
        assert cfg.max_chunk_chars == 2000

    def test_custom_values(self):
        from src.config.schema import StreamingConfig
        cfg = StreamingConfig(
            enabled=True,
            tools=["run_command", "run_script"],
            chunk_interval_seconds=2.0,
            max_chunk_chars=5000,
        )
        assert cfg.enabled is True
        assert cfg.tools == ["run_command", "run_script"]
        assert cfg.chunk_interval_seconds == 2.0
        assert cfg.max_chunk_chars == 5000

    def test_tools_config_has_streaming(self):
        from src.config.schema import ToolsConfig
        cfg = ToolsConfig()
        assert hasattr(cfg, "streaming")
        assert cfg.streaming.enabled is False

    def test_tools_config_streaming_custom(self):
        from src.config.schema import ToolsConfig
        cfg = ToolsConfig(streaming={"enabled": True, "tools": ["run_command"]})
        assert cfg.streaming.enabled is True
        assert cfg.streaming.tools == ["run_command"]


# ---------------------------------------------------------------------------
# REST API endpoint
# ---------------------------------------------------------------------------

class TestAPIEndpoint:
    @pytest.mark.asyncio
    async def test_no_executor(self):
        from aiohttp.test_utils import AioHTTPTestCase, TestClient, TestServer
        from aiohttp import web
        from src.web.api import create_api_routes

        bot = MagicMock()
        bot.tool_executor = None

        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        from aiohttp.test_utils import TestClient, TestServer
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/tool-streams")
            assert resp.status == 200
            data = await resp.json()
            assert data["enabled"] is False
            assert data["streams"] == []

    @pytest.mark.asyncio
    async def test_with_streamer(self):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        streamer = ToolOutputStreamer(enabled_tools={"run_command"})
        executor = MagicMock()
        executor.output_streamer = streamer

        bot = MagicMock()
        bot.tool_executor = executor

        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/tool-streams")
            assert resp.status == 200
            data = await resp.json()
            assert data["enabled"] is True
            assert "run_command" in data["enabled_tools"]
            assert data["active_streams"] == []

    @pytest.mark.asyncio
    async def test_with_active_stream(self):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        streamer = ToolOutputStreamer(enabled_tools={"run_command"})
        stream_id, _, _ = streamer.create_callback("run_command", "ch1")
        executor = MagicMock()
        executor.output_streamer = streamer

        bot = MagicMock()
        bot.tool_executor = executor

        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/tool-streams")
            data = await resp.json()
            assert len(data["active_streams"]) == 1
            assert data["active_streams"][0]["tool_name"] == "run_command"


# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------

class TestExports:
    def test_tools_init_exports(self):
        from src.tools import StreamChunk, ToolOutputStreamer
        assert StreamChunk is not None
        assert ToolOutputStreamer is not None

    def test_output_streamer_module_imports(self):
        from src.tools.output_streamer import (
            StreamChunk,
            ToolOutputStreamer,
            _ActiveStream,
        )
        assert StreamChunk is not None
        assert ToolOutputStreamer is not None
        assert _ActiveStream is not None

    def test_ssh_output_callback_type(self):
        from src.tools.ssh import OutputCallback
        assert OutputCallback is not None


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    @pytest.mark.asyncio
    async def test_concurrent_streams(self):
        s = ToolOutputStreamer(
            enabled_tools={"run_command", "run_script"}, chunk_interval=0.1,
        )
        listener = AsyncMock()
        s.add_listener(listener)

        _, on1, finish1 = s.create_callback("run_command", "ch1")
        _, on2, finish2 = s.create_callback("run_script", "ch2")
        assert s.active_stream_count == 2

        # Force both streams past interval
        for stream in s._active_streams.values():
            stream.last_emit = 0.0
        await on1("cmd output\n")
        await on2("script output\n")
        assert listener.await_count == 2

        await finish1()
        assert s.active_stream_count == 1
        await finish2()
        assert s.active_stream_count == 0

    @pytest.mark.asyncio
    async def test_finish_called_twice_is_safe(self):
        s = ToolOutputStreamer(enabled_tools={"run_command"})
        s.add_listener(AsyncMock())
        _, _, finish = s.create_callback("run_command")
        await finish()
        await finish()  # should not raise
        assert s.active_stream_count == 0

    @pytest.mark.asyncio
    async def test_on_output_empty_string(self):
        s = ToolOutputStreamer(
            enabled_tools={"run_command"}, chunk_interval=0.1,
        )
        listener = AsyncMock()
        s.add_listener(listener)
        _, on_output, _ = s.create_callback("run_command")
        await on_output("")
        # Empty strings should not be emitted (buffered is still "")
        assert listener.await_count == 0

    @pytest.mark.asyncio
    async def test_rate_limiting_prevents_flood(self):
        s = ToolOutputStreamer(
            enabled_tools={"run_command"}, chunk_interval=100.0,
        )
        listener = AsyncMock()
        s.add_listener(listener)
        _, on_output, _ = s.create_callback("run_command")

        # With chunk_interval=100 and last_emit=now, nothing should emit
        for i in range(50):
            await on_output(f"line{i}\n")
        assert listener.await_count == 0

    def test_streamer_from_config(self):
        from src.config.schema import StreamingConfig
        cfg = StreamingConfig(
            enabled=True,
            tools=["run_command", "run_script"],
            chunk_interval_seconds=0.5,
            max_chunk_chars=3000,
        )
        s = ToolOutputStreamer(
            enabled_tools=set(cfg.tools),
            chunk_interval=cfg.chunk_interval_seconds,
            max_chunk_chars=cfg.max_chunk_chars,
        )
        assert s.is_enabled("run_command")
        assert s.is_enabled("run_script")
        assert not s.is_enabled("read_file")
        assert s.chunk_interval == 0.5

    @pytest.mark.asyncio
    async def test_read_lines_with_callback_helper(self):
        from src.tools.ssh import _read_lines_with_callback

        proc = AsyncMock()
        proc.stdout.readline = AsyncMock(
            side_effect=[b"hello\n", b"world\n", b""],
        )
        proc.wait = AsyncMock()
        proc.returncode = 0

        lines: list[str] = []

        async def cb(line: str) -> None:
            lines.append(line)

        code, output = await _read_lines_with_callback(proc, timeout=10, on_output=cb)
        assert code == 0
        assert len(lines) == 2
        assert "hello" in output
        assert "world" in output

    @pytest.mark.asyncio
    async def test_executor_init_with_streamer(self):
        from src.tools.executor import ToolExecutor
        streamer = ToolOutputStreamer(enabled_tools={"run_command"})
        executor = ToolExecutor(output_streamer=streamer)
        assert executor.output_streamer is streamer

    @pytest.mark.asyncio
    async def test_executor_init_without_streamer(self):
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()
        assert executor.output_streamer is None

    @pytest.mark.asyncio
    async def test_chunk_timestamp_is_iso(self):
        s = ToolOutputStreamer(
            enabled_tools={"run_command"}, chunk_interval=0.1,
        )
        listener = AsyncMock()
        s.add_listener(listener)
        _, on_output, _ = s.create_callback("run_command")
        stream = list(s._active_streams.values())[0]
        stream.last_emit = 0.0  # force past interval
        await on_output("data")
        chunk = listener.call_args[0][0]
        from datetime import datetime
        # Should parse as valid ISO timestamp
        datetime.fromisoformat(chunk.timestamp)
