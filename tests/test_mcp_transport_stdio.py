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
        conn = _conn("legacy")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            lost: list[str] = []
            conn._on_connection_lost = lost.append  # noqa: SLF001
            big = "x" * (transport_stdio.MAX_STDOUT_LINE_BYTES + 4096)
            outcome = await conn.call_tool(echo, {"text": big}, timeout=30)
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
