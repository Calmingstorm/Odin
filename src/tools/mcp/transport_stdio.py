"""stdio transport: the MCP server runs as an owned subprocess.

Framing: one JSON-RPC message per newline-delimited UTF-8 line on
stdout/stdin. Lifecycle and safety rules (plan §3):

- The child is launched in its OWN process group (session leader), with a
  minimal allowlisted environment plus the server's configured ``env`` —
  never Odin's full service environment, which carries credentials.
- stdout lines are length-bounded before parsing.
- stderr is drained CONTINUOUSLY into a bounded ring buffer (a verbose
  server must never fill the pipe and deadlock) and surfaced for status/UI.
- Shutdown escalates: stdin close → bounded wait → SIGTERM to the group →
  bounded wait → SIGKILL to the group. Group signalling is guarded by the
  same invariant as the executor's process-tree kills (v3.59.1): the pgid
  must be > 1, equal to the child pid we spawned, and not our own group —
  a broadcast kill must be impossible by construction.
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import tempfile
from collections import deque
from collections.abc import Callable
from typing import Any

from ...odin_log import get_logger
from .errors import MCPConnectError, MCPProtocolError
from .protocol import (
    MAX_STDERR_STORE_BYTES,
    MAX_STDOUT_LINE_BYTES,
    parse_wire_payload,
)

log = get_logger("mcp.stdio")

# Minimal operational environment a spawned MCP server receives. Everything
# else must be explicitly configured per server.
_ENV_ALLOWLIST = ("PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "TMPDIR", "USER")

_STDIN_CLOSE_GRACE = 3.0
_TERM_GRACE = 4.0
_KILL_GRACE = 3.0


def build_child_env(configured: dict[str, str] | None) -> dict[str, str]:
    """Allowlisted base environment + the server's configured env."""
    env = {k: v for k in _ENV_ALLOWLIST if (v := os.environ.get(k)) is not None}
    if configured:
        for key, value in configured.items():
            env[str(key)] = str(value)
    return env


class StdioTransport:
    """Owns one MCP server subprocess and its message pump.

    ``on_message`` receives every parsed JSON-RPC message dict from stdout.
    ``on_closed`` fires exactly once when the pump stops (EOF, protocol
    violation, or shutdown) with a human-readable reason.
    """

    def __init__(
        self,
        server_name: str,
        command: str,
        args: list[str],
        *,
        env: dict[str, str] | None = None,
        cwd: str | None = None,
        on_message: Callable[[dict], None],
        on_closed: Callable[[str], None],
        negotiated_version: Callable[[], str | None],
    ) -> None:
        self.server_name = server_name
        self.command = command
        self.args = list(args)
        self.env = dict(env or {})
        self.cwd = cwd or None
        self._on_message = on_message
        self._on_closed = on_closed
        self._negotiated_version = negotiated_version

        self._process: asyncio.subprocess.Process | None = None
        self._spawned_pgid: int | None = None
        self._reader_task: asyncio.Task | None = None
        self._stderr_task: asyncio.Task | None = None
        self._stderr_ring: deque[bytes] = deque()
        self._stderr_bytes = 0
        self._write_lock = asyncio.Lock()
        self._closed_fired = False
        self._closing = False

    @property
    def running(self) -> bool:
        return self._process is not None and self._process.returncode is None

    @property
    def pid(self) -> int | None:
        return self._process.pid if self._process else None

    async def start(self) -> None:
        if self._process is not None:
            raise MCPConnectError(f"{self.server_name}: transport already started")
        if not self.command:
            raise MCPConnectError(f"{self.server_name}: stdio requires 'command'")
        if self.cwd and not os.path.isdir(self.cwd):
            raise MCPConnectError(f"{self.server_name}: cwd does not exist: {self.cwd}")
        # Never inherit Odin's process cwd implicitly (the 2026-07-27
        # relative-path hazard class): an unconfigured cwd runs the server
        # from the temp dir, where a stray relative path can hurt nothing.
        effective_cwd = self.cwd or tempfile.gettempdir()
        try:
            self._process = await asyncio.create_subprocess_exec(
                self.command,
                *self.args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=build_child_env(self.env),
                cwd=effective_cwd,
                start_new_session=True,  # own session ⇒ own process group
                limit=MAX_STDOUT_LINE_BYTES + 1024,
            )
        except FileNotFoundError:
            raise MCPConnectError(
                f"{self.server_name}: command not found: {self.command}"
            ) from None
        except OSError as e:
            raise MCPConnectError(f"{self.server_name}: failed to start: {e}") from e
        try:
            pgid = os.getpgid(self._process.pid)
            self._spawned_pgid = pgid if pgid == self._process.pid else None
        except OSError:
            self._spawned_pgid = None
        self._reader_task = asyncio.create_task(self._pump_stdout())
        self._stderr_task = asyncio.create_task(self._pump_stderr())

    async def send(self, message: dict[str, Any]) -> None:
        proc = self._process
        if proc is None or proc.stdin is None or proc.returncode is not None:
            raise MCPConnectError(f"{self.server_name}: server process not running")
        line = json.dumps(message, separators=(",", ":")) + "\n"
        async with self._write_lock:
            proc.stdin.write(line.encode("utf-8"))
            await proc.stdin.drain()

    # ------------------------------------------------------------------
    # Pumps
    # ------------------------------------------------------------------

    async def _pump_stdout(self) -> None:
        assert self._process and self._process.stdout
        reason = "server closed its output stream"
        try:
            while True:
                try:
                    line = await self._process.stdout.readline()
                except (ValueError, asyncio.LimitOverrunError):
                    reason = f"stdout line exceeded {MAX_STDOUT_LINE_BYTES} bytes"
                    break
                if not line:
                    break
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    messages = parse_wire_payload(
                        stripped, negotiated_version=self._negotiated_version()
                    )
                except MCPProtocolError as e:
                    log.warning("MCP %s: dropping stdout line: %s", self.server_name, e)
                    continue
                for msg in messages:
                    try:
                        self._on_message(msg)
                    except Exception:
                        log.exception("MCP %s: message handler failed", self.server_name)
        except asyncio.CancelledError:
            reason = "transport shut down"
        except Exception as e:  # reader must never die silently
            log.exception("MCP %s: stdout pump error", self.server_name)
            reason = f"stdout pump error: {e.__class__.__name__}"
        finally:
            self._fire_closed(reason)

    async def _pump_stderr(self) -> None:
        assert self._process and self._process.stderr
        try:
            while True:
                chunk = await self._process.stderr.read(4096)
                if not chunk:
                    break
                self._stderr_ring.append(chunk)
                self._stderr_bytes += len(chunk)
                while self._stderr_bytes > MAX_STDERR_STORE_BYTES and self._stderr_ring:
                    dropped = self._stderr_ring.popleft()
                    self._stderr_bytes -= len(dropped)
        except asyncio.CancelledError:
            pass
        except Exception:
            log.exception("MCP %s: stderr pump error", self.server_name)

    def stderr_tail(self, max_chars: int = 4000) -> str:
        """Bounded, decoded tail of the server's stderr (for status/UI)."""
        data = b"".join(self._stderr_ring)
        return data.decode("utf-8", errors="replace")[-max_chars:]

    def _fire_closed(self, reason: str) -> None:
        if self._closed_fired:
            return
        self._closed_fired = True
        if self._closing:
            reason = "transport shut down"
        try:
            self._on_closed(reason)
        except Exception:
            log.exception("MCP %s: on_closed handler failed", self.server_name)

    # ------------------------------------------------------------------
    # Shutdown
    # ------------------------------------------------------------------

    def _owned_pgid(self) -> int | None:
        """The child's process group, ONLY if it is safe to signal: pgid > 1,
        the group is led by the pid we spawned (start_new_session guarantees
        this while the leader lives), and it is not our own group. While ANY
        member of the group survives, the pgid cannot be recycled — so the
        value stays safe for the post-exit descendant sweep."""
        pgid = self._spawned_pgid
        if pgid is None or pgid <= 1 or pgid == os.getpgrp():
            return None
        return pgid

    def _signal_group(self, sig: int) -> None:
        proc = self._process
        pgid = self._owned_pgid()
        try:
            if pgid is not None:
                os.killpg(pgid, sig)
            elif proc is not None and proc.returncode is None:
                proc.send_signal(sig)
        except (ProcessLookupError, PermissionError, OSError):
            pass

    async def shutdown(self) -> None:
        """stdin close → bounded wait → TERM group → bounded wait → KILL
        group — then a final group SWEEP even when the leader exited
        gracefully: a leader that honors EOF can still orphan descendants in
        its group, and an unswept group leaks them (the v3.59.1 lesson).
        Idempotent; never raises."""
        self._closing = True
        proc = self._process
        if proc is None:
            self._fire_closed("transport shut down")
            return
        try:
            if proc.returncode is None and proc.stdin is not None:
                try:
                    proc.stdin.close()
                except Exception:
                    pass
                try:
                    await asyncio.wait_for(proc.wait(), timeout=_STDIN_CLOSE_GRACE)
                except TimeoutError:
                    pass
            if proc.returncode is None:
                self._signal_group(signal.SIGTERM)
                try:
                    await asyncio.wait_for(proc.wait(), timeout=_TERM_GRACE)
                except TimeoutError:
                    pass
            if proc.returncode is None:
                self._signal_group(signal.SIGKILL)
                try:
                    await asyncio.wait_for(proc.wait(), timeout=_KILL_GRACE)
                except TimeoutError:
                    log.warning(
                        "MCP %s: process %s survived SIGKILL grace",
                        self.server_name,
                        proc.pid,
                    )
            # Descendant sweep: the leader is gone (or wedged past KILL);
            # TERM then KILL whatever remains of the owned group. ESRCH
            # means the group is already empty — the common, silent case.
            self._signal_group(signal.SIGTERM)
            await asyncio.sleep(min(0.2, _TERM_GRACE))
            self._signal_group(signal.SIGKILL)
        finally:
            for task in (self._reader_task, self._stderr_task):
                if task is not None and not task.done():
                    task.cancel()
                    try:
                        await task
                    except (asyncio.CancelledError, Exception):
                        pass
            self._reader_task = None
            self._stderr_task = None
            self._fire_closed("transport shut down")
