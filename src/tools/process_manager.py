"""Background process lifecycle management.

Provides start/poll/write/kill/list operations for long-running processes
spawned locally or on remote hosts. Each process gets a ring buffer of
output lines (max 500) and is auto-killed after 1 hour.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field

from ..odin_log import get_logger

log = get_logger("process_manager")

MAX_CONCURRENT = 20
MAX_LIFETIME_SECONDS = 3600  # 1 hour
OUTPUT_BUFFER_LINES = 500
# Upper bound on awaiting an in-flight group reap at shutdown before giving up
# and cancelling it — comfortably exceeds a reader's TERM-grace + KILL-grace so
# a compliant descendant always finishes, while a wedged one can't hang re-exec.
SHUTDOWN_REAP_TIMEOUT = 12.0


@dataclass
class ProcessInfo:
    """Metadata and handles for a managed process."""

    pid: int
    command: str
    host: str
    start_time: float
    status: str = "running"  # running | completed | failed
    output_buffer: deque = field(default_factory=lambda: deque(maxlen=OUTPUT_BUFFER_LINES))
    process: asyncio.subprocess.Process | None = None
    _reader_task: asyncio.Task | None = field(default=None, repr=False)
    exit_code: int | None = None


class ProcessRegistry:
    """Registry for background processes with full lifecycle management."""

    def __init__(self) -> None:
        self._processes: dict[int, ProcessInfo] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def start(self, host: str, command: str, timeout: int = 300) -> str:
        """Start a background process locally. Returns confirmation with PID."""
        from ..tools.ssh import is_local_address

        if not is_local_address(host):
            return (
                f"manage_process only supports local execution. "
                f"Host '{host}' is remote — use run_command or run_script for remote hosts."
            )

        # Enforce concurrency limit (only count running)
        running = sum(1 for p in self._processes.values() if p.status == "running")
        if running >= MAX_CONCURRENT:
            return f"Cannot start: {running} processes already running (max {MAX_CONCURRENT})."

        try:
            # start_new_session puts the shell at the head of its own process
            # group, so kill()/shutdown() can take out descendants
            # (`sh -c 'x & ...'`) instead of just the shell leader.
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                stdin=asyncio.subprocess.PIPE,
                start_new_session=True,
            )
        except Exception as e:
            return f"Failed to start process: {e}"

        pid = proc.pid
        info = ProcessInfo(
            pid=pid,
            command=command,
            host=host,
            start_time=time.time(),
            process=proc,
        )
        self._processes[pid] = info

        # Background reader task to drain stdout into the ring buffer
        info._reader_task = asyncio.create_task(self._read_output(info))

        # Auto-kill after max lifetime
        from ..async_utils import fire_and_forget

        fire_and_forget(
            self._enforce_lifetime(pid, MAX_LIFETIME_SECONDS), name=f"process_lifetime:{pid}"
        )

        log.info("Started process PID %d: %s", pid, command[:80])
        return f"Process started (PID {pid}): {command[:120]}"

    def poll(self, pid: int) -> str:
        """Return recent output lines from a process."""
        info = self._processes.get(pid)
        if not info:
            return f"No process with PID {pid}."

        lines = list(info.output_buffer)
        status_line = f"[PID {pid}] status={info.status}"
        if info.exit_code is not None:
            status_line += f" exit_code={info.exit_code}"
        elapsed = time.time() - info.start_time
        status_line += f" uptime={elapsed:.0f}s"

        if not lines:
            return f"{status_line}\n(no output yet)"
        # Show last 50 lines by default
        recent = lines[-50:]
        return f"{status_line}\n" + "".join(recent)

    async def write(self, pid: int, text: str) -> str:
        """Write text to a process's stdin."""
        info = self._processes.get(pid)
        if not info:
            return f"No process with PID {pid}."
        if info.status != "running":
            return f"Process {pid} is not running (status: {info.status})."
        if not info.process or not info.process.stdin:
            return f"Process {pid} has no stdin."

        try:
            info.process.stdin.write(text.encode())
            await info.process.stdin.drain()
            return f"Wrote {len(text)} bytes to PID {pid}."
        except Exception as e:
            return f"Failed to write to PID {pid}: {e}"

    async def kill(self, pid: int) -> str:
        """Kill a running process — and its process group when it leads one."""
        info = self._processes.get(pid)
        if not info:
            return f"No process with PID {pid}."
        if info.status != "running":
            return f"Process {pid} already {info.status}."

        try:
            if info.process:
                from ..tools.ssh import terminate_process_tree

                # Group-aware TERM → bounded grace → KILL → reap. Descendants
                # of the managed shell die with it instead of leaking (they
                # would otherwise outlive an in-place restart's exec).
                # owned_pgid: start() spawns with start_new_session=True, so
                # the group stays signallable after the leader exits.
                await terminate_process_tree(
                    info.process, grace=5.0, owned_pgid=info.process.pid
                )
            info.status = "failed"
            info.exit_code = -9
            log.info("Killed process PID %d", pid)
            return f"Process {pid} killed."
        except Exception as e:
            return f"Failed to kill PID {pid}: {e}"

    def list_all(self) -> str:
        """Return a formatted table of all tracked processes."""
        if not self._processes:
            return "No processes tracked."

        lines = [f"{'PID':<8} {'STATUS':<12} {'UPTIME':<10} {'COMMAND'}"]
        lines.append("-" * 60)
        now = time.time()
        for pid, info in sorted(self._processes.items()):
            elapsed = now - info.start_time
            if elapsed < 60:
                uptime = f"{elapsed:.0f}s"
            elif elapsed < 3600:
                uptime = f"{elapsed / 60:.1f}m"
            else:
                uptime = f"{elapsed / 3600:.1f}h"
            cmd_short = info.command[:40]
            lines.append(f"{pid:<8} {info.status:<12} {uptime:<10} {cmd_short}")
        return "\n".join(lines)

    async def shutdown(self) -> int:
        """Terminate all managed processes and their groups before returning.

        Returns the number of processes that were still running.

        Callers re-exec in place once this returns, so NOTHING the registry
        owns may still be alive or mid-cleanup afterwards. A leader that already
        exited on its own may have its reader task mid-reap of a TERM-immune
        descendant, with the record already marked terminal — so we must AWAIT
        every reader/reaper to completion, never cancel it out from under an
        in-flight group kill (cancellation propagates through
        terminate_process_tree and would strand the descendant across the exec).
        """
        killed = 0
        # 1) TERM/KILL every still-running leader. This also unblocks its reader
        #    (readline hits EOF), which then reaps any surviving group members.
        for pid, info in list(self._processes.items()):
            if info.status == "running":
                try:
                    await self.kill(pid)
                    killed += 1
                except Exception:
                    log.warning("Failed to kill PID %d during shutdown", pid)
        # 2) Let every reader/reaper finish so no group cleanup is left pending.
        for pid, info in list(self._processes.items()):
            task = info._reader_task
            if task is None or task.done():
                continue
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=SHUTDOWN_REAP_TIMEOUT)
            except TimeoutError:
                log.warning("Reaper for PID %d did not finish; cancelling", pid)
                task.cancel()
            except Exception:
                log.debug("Reaper for PID %d errored during shutdown", pid, exc_info=True)
        if killed:
            log.info("Shutdown: terminated %d running process(es)", killed)
        return killed

    def cleanup(self) -> int:
        """Remove dead processes older than 1 hour. Returns count removed."""
        now = time.time()
        to_remove = [
            pid
            for pid, info in self._processes.items()
            if info.status != "running" and (now - info.start_time) > MAX_LIFETIME_SECONDS
        ]
        for pid in to_remove:
            info = self._processes.pop(pid)
            if info._reader_task and not info._reader_task.done():
                info._reader_task.cancel()
        return len(to_remove)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _read_output(self, info: ProcessInfo) -> None:
        """Continuously read stdout and append to the output buffer."""
        try:
            while info.process and info.process.stdout:
                line = await info.process.stdout.readline()
                if not line:
                    break
                info.output_buffer.append(line.decode("utf-8", errors="replace"))
        except Exception:
            pass

        # Process finished — update status
        if info.process:
            try:
                await info.process.wait()
                info.exit_code = info.process.returncode
                info.status = "completed" if info.exit_code == 0 else "failed"
            except Exception:
                info.status = "failed"

            # The leader has exited, but `&`-backgrounded descendants can still
            # be alive in its process group — a redirected one that doesn't hold
            # stdout lets this task finish while it lingers. Reap the group NOW,
            # while ownership is fresh: a non-empty group keeps the leader pid
            # from being recycled, so owned_pgid still uniquely names OUR group.
            # After this, shutdown() need not (and must not) signal a stale,
            # possibly-recycled pgid for an already-terminal record.
            from ..tools.ssh import terminate_process_tree

            try:
                await terminate_process_tree(
                    info.process, grace=2.0, owned_pgid=info.process.pid
                )
            except Exception:
                log.debug("group reap after PID %d exit failed", info.pid, exc_info=True)

    async def _enforce_lifetime(self, pid: int, max_seconds: int) -> None:
        """Auto-kill process after max lifetime."""
        await asyncio.sleep(max_seconds)
        info = self._processes.get(pid)
        if info and info.status == "running":
            log.warning("Auto-killing PID %d after %ds lifetime limit", pid, max_seconds)
            await self.kill(pid)
