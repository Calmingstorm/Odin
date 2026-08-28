"""stdio transport pins: env allowlist, stderr drain, process-group
teardown, bounded shutdown — against the real fake subprocess."""

from __future__ import annotations

import asyncio
import os
import sys
import time
from pathlib import Path

import pytest

from src.tools.mcp import transport_stdio
from src.tools.mcp.client import MCPServerConnection
from src.tools.mcp.transport_stdio import StdioTransport, build_child_env

FAKE = str(Path(__file__).parent / "fakes" / "mcp_stdio_server.py")


def _conn(mode: str, **kwargs) -> MCPServerConnection:
    return MCPServerConnection(
        f"fake_{mode.replace('-', '_')}",
        "stdio",
        command=sys.executable,
        args=[FAKE, mode],
        **kwargs,
    )


class TestChildEnv:
    def test_allowlist_only(self, monkeypatch):
        monkeypatch.setenv("ODIN_FAKE_SECRET", "credential")
        monkeypatch.setenv("PATH", "/usr/bin")
        env = build_child_env({"MARKER": "yes"})
        assert env["MARKER"] == "yes"
        assert env["PATH"] == "/usr/bin"
        assert "ODIN_FAKE_SECRET" not in env

    def test_configured_env_stringified(self):
        env = build_child_env({"NUM": 7})  # type: ignore[dict-item]
        assert env["NUM"] == "7"


class TestEnvLeakage:
    async def test_spawned_server_never_sees_service_env(self, monkeypatch):
        monkeypatch.setenv("ODIN_FAKE_SECRET", "credential")
        conn = _conn("legacy", env={"MARKER": "present"})
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "env_keys")
            outcome = await conn.call_tool(echo, {})
            assert outcome.ok
            keys = outcome.text.replace("echo: ", "").split(",")
            assert "MARKER" in keys
            assert "ODIN_FAKE_SECRET" not in keys
            assert "PATH" in keys
        finally:
            await conn.disconnect()


class TestStderr:
    async def test_flooding_stderr_never_deadlocks(self):
        conn = _conn("stderr-flood")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            # Give the flood a moment to produce far more than the ring cap.
            await asyncio.sleep(0.5)
            outcome = await conn.call_tool(echo, {"text": "alive"})
            assert outcome.ok and "alive" in outcome.text
            tail = conn.status()["stderr_tail"]
            assert tail and len(tail) <= 4000
        finally:
            await conn.disconnect()


class TestShutdown:
    async def test_hang_shutdown_escalates_to_kill_bounded(self, monkeypatch):
        monkeypatch.setattr(transport_stdio, "_STDIN_CLOSE_GRACE", 0.3)
        monkeypatch.setattr(transport_stdio, "_TERM_GRACE", 0.5)
        monkeypatch.setattr(transport_stdio, "_KILL_GRACE", 3.0)
        conn = _conn("hang-shutdown")
        await conn.connect()
        pid = conn._stdio.pid  # noqa: SLF001
        assert pid
        start = time.monotonic()
        await conn.disconnect()
        elapsed = time.monotonic() - start
        assert elapsed < 10
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)

    async def test_process_group_teardown_reaps_grandchild(self):
        conn = _conn("grandchild")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            tool = next(t for t in discovery.tools if t.name == "child_pid")
            outcome = await conn.call_tool(tool, {})
            assert outcome.ok
            grandchild = int(outcome.text.replace("echo: ", "").strip() or "0")
            assert grandchild > 1
        finally:
            await conn.disconnect()
        await asyncio.sleep(0.3)  # let the kernel finish reaping
        # The grandchild was in the server's process group: it must be gone
        # (or a zombie awaiting its dead parent's reaper — not running).
        try:
            os.kill(grandchild, 0)
            with open(f"/proc/{grandchild}/stat") as fh:
                assert fh.read().split()[2] == "Z"
        except ProcessLookupError:
            pass

    async def test_double_shutdown_is_idempotent(self):
        conn = _conn("legacy")
        await conn.connect()
        await conn.disconnect()
        await conn.disconnect()


class TestBoundedLines:
    async def test_oversized_response_line_closes_connection(self, monkeypatch):
        # Shrink the ceiling so the fake's echo of a large payload overflows
        # the reader limit; the pump must close and the call classify
        # UNCERTAIN (the request was written; the reply was unreadable).
        conn = _conn("oversized-response")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            lost: list[str] = []
            conn._on_connection_lost = lost.append  # noqa: SLF001
            outcome = await conn.call_tool(echo, {"text": "small request"}, timeout=30)
            assert outcome.uncertain
            assert lost and "exceeded" in lost[0]
        finally:
            await conn.disconnect()

    async def test_garbage_stdout_lines_are_dropped(self):
        conn = _conn("garbage")
        await conn.connect()
        try:
            assert conn.era == "legacy"
            discovery = await conn.discover_tools()
            assert any(t.name == "echo" for t in discovery.tools)
        finally:
            await conn.disconnect()


class TestSpawnFailures:
    async def test_missing_command(self):
        conn = MCPServerConnection("missing", "stdio", command="/nonexistent/mcp-server-binary")
        from src.tools.mcp.errors import MCPConnectError

        with pytest.raises(MCPConnectError, match="not found"):
            await conn.connect()

    async def test_bad_cwd(self):
        conn = MCPServerConnection(
            "badcwd",
            "stdio",
            command=sys.executable,
            args=[FAKE, "legacy"],
            cwd="/nonexistent/dir",
        )
        from src.tools.mcp.errors import MCPConnectError

        with pytest.raises(MCPConnectError, match="cwd"):
            await conn.connect()

    async def test_transport_reports_running(self):
        transport = StdioTransport(
            "t",
            sys.executable,
            [FAKE, "legacy"],
            on_message=lambda m: None,
            on_closed=lambda r: None,
            negotiated_version=lambda: None,
        )
        assert not transport.running
        await transport.start()
        assert transport.running
        await transport.shutdown()
        assert not transport.running


class TestCwdIsolation:
    async def test_unconfigured_cwd_never_inherits_odin_process_cwd(self):
        # The 2026-07-27 hazard class: a spawned process inheriting the
        # service cwd turns any relative path destructive. Unconfigured
        # servers must run from the temp dir instead.
        import tempfile

        conn = _conn("legacy")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            tool = next(t for t in discovery.tools if t.name == "report_cwd")
            outcome = await conn.call_tool(tool, {})
            assert outcome.ok
            reported = outcome.text.replace("echo: ", "").strip()
            assert reported == tempfile.gettempdir()
            assert reported != os.getcwd()
        finally:
            await conn.disconnect()

    async def test_configured_cwd_is_honored(self, tmp_path):
        conn = _conn("legacy", cwd=str(tmp_path))
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            tool = next(t for t in discovery.tools if t.name == "report_cwd")
            outcome = await conn.call_tool(tool, {})
            assert outcome.ok
            assert outcome.text.replace("echo: ", "").strip() == str(tmp_path)
        finally:
            await conn.disconnect()


class TestCancellationSafeShutdown:
    async def test_cancellation_waits_for_full_teardown(self, monkeypatch):
        monkeypatch.setattr(transport_stdio, "_STDIN_CLOSE_GRACE", 0.2)
        monkeypatch.setattr(transport_stdio, "_TERM_GRACE", 0.2)
        monkeypatch.setattr(transport_stdio, "_KILL_GRACE", 2.0)
        closed: list[str] = []
        transport = StdioTransport(
            "cancel-shutdown",
            sys.executable,
            [FAKE, "hang-shutdown"],
            on_message=lambda _m: None,
            on_closed=closed.append,
            negotiated_version=lambda: None,
        )
        await transport.start()
        pid = transport.pid
        assert pid is not None
        task = asyncio.create_task(transport.shutdown())
        await asyncio.sleep(0.05)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)
        assert closed == ["transport shut down"]


class TestBoundedWrites:
    async def test_request_budget_covers_write_and_response(self, monkeypatch):
        conn = _conn("legacy")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            assert conn._stdio is not None  # noqa: SLF001
            original_send = conn._stdio.send  # noqa: SLF001

            async def stalled_send(message, *, timeout=None):
                if message.get("method") == "tools/call":
                    await asyncio.sleep(timeout or 60)
                    raise TimeoutError
                await original_send(message, timeout=timeout)

            monkeypatch.setattr(conn._stdio, "send", stalled_send)  # noqa: SLF001
            started = time.monotonic()
            outcome = await conn.call_tool(echo, {"text": "blocked"}, timeout=0.1)
            assert outcome.uncertain
            assert time.monotonic() - started < 2
        finally:
            await conn.disconnect()

    async def test_oversized_outbound_frame_rejected_before_write(self):
        transport = StdioTransport(
            "bounded-send",
            sys.executable,
            [FAKE, "legacy"],
            on_message=lambda _m: None,
            on_closed=lambda _r: None,
            negotiated_version=lambda: None,
        )
        await transport.start()
        try:
            from src.tools.mcp.errors import MCPProtocolError

            with pytest.raises(MCPProtocolError, match="outbound frame exceeds"):
                await transport.send(
                    {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "tools/call",
                        "params": {"value": "x" * transport_stdio.MAX_STDIN_FRAME_BYTES},
                    }
                )
        finally:
            await transport.shutdown()

    async def test_repeated_cancellation_cannot_abort_teardown(self, monkeypatch):
        monkeypatch.setattr(transport_stdio, "_STDIN_CLOSE_GRACE", 0.2)
        monkeypatch.setattr(transport_stdio, "_TERM_GRACE", 0.2)
        monkeypatch.setattr(transport_stdio, "_KILL_GRACE", 2.0)
        transport = StdioTransport(
            "repeat-cancel-shutdown",
            sys.executable,
            [FAKE, "hang-shutdown"],
            on_message=lambda _m: None,
            on_closed=lambda _r: None,
            negotiated_version=lambda: None,
        )
        await transport.start()
        pid = transport.pid
        assert pid is not None
        task = asyncio.create_task(transport.shutdown())
        await asyncio.sleep(0.03)
        task.cancel()
        await asyncio.sleep(0.03)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)

    async def test_real_blocked_pipe_write_is_bounded(self):
        transport = StdioTransport(
            "real-blocked-write",
            sys.executable,
            [FAKE, "blocked-write"],
            on_message=lambda _m: None,
            on_closed=lambda _r: None,
            negotiated_version=lambda: None,
        )
        await transport.start()
        assert transport._process is not None  # noqa: SLF001
        ready = await asyncio.wait_for(transport._process.stdout.readline(), timeout=2)  # noqa: SLF001
        assert ready == b"READY\n"
        payload = {
            "jsonrpc": "2.0",
            "method": "notice",
            "params": {"x": "x" * (1024 * 1024)},
        }
        try:
            with pytest.raises(TimeoutError):
                await transport.send(payload, timeout=0.05)
        finally:
            await transport.shutdown()

    async def test_cancelled_shutdown_waits_for_grandchild_group(self, monkeypatch):
        monkeypatch.setattr(transport_stdio, "_STDIN_CLOSE_GRACE", 0.2)
        monkeypatch.setattr(transport_stdio, "_TERM_GRACE", 0.2)
        monkeypatch.setattr(transport_stdio, "_KILL_GRACE", 2.0)
        conn = _conn("grandchild")
        await conn.connect()
        discovery = await conn.discover_tools()
        tool = next(t for t in discovery.tools if t.name == "child_pid")
        grandchild = int((await conn.call_tool(tool, {})).text)
        task = asyncio.create_task(conn.disconnect())
        await asyncio.sleep(0.03)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        try:
            os.kill(grandchild, 0)
            with open(f"/proc/{grandchild}/stat") as fh:
                assert fh.read().split()[2] == "Z"
        except ProcessLookupError:
            pass
