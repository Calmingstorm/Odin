"""Background process lifecycle management.

Provides start/poll/write/kill/list operations for long-running processes
spawned locally or on remote hosts. Each process gets a ring buffer of
output lines (max 500) and is auto-killed after 1 hour.
"""

from __future__ import annotations

import asyncio
import ctypes
import os
import re
import secrets
import signal
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from ..odin_log import get_logger
from .workspace import WorkspaceError, workspace_env

log = get_logger("process_manager")


_UNKNOWN = object()  # "could not determine" — never means "absent"

_PR_SET_CHILD_SUBREAPER = 36
_PR_GET_CHILD_SUBREAPER = 37


def child_subreaper_active() -> bool:
    """Whether THIS process is already a child subreaper (read-only)."""
    try:
        libc = ctypes.CDLL("libc.so.6", use_errno=True)
        value = ctypes.c_int(0)
        if libc.prctl(_PR_GET_CHILD_SUBREAPER, ctypes.byref(value), 0, 0, 0) != 0:
            return False
        return value.value == 1
    except Exception:
        return False


def set_child_subreaper(enabled: bool = True) -> bool:
    """Set (or clear) the child-subreaper flag; returns the verified state."""
    try:
        libc = ctypes.CDLL("libc.so.6", use_errno=True)
        if libc.prctl(_PR_SET_CHILD_SUBREAPER, 1 if enabled else 0, 0, 0, 0) != 0:
            return child_subreaper_active()
    except Exception:
        log.exception("Could not change child-subreaper containment")
        return child_subreaper_active()
    return child_subreaper_active()


def reap_adopted_zombies(adopted_pids: frozenset[int] = frozenset()) -> int:
    """Reap zombies among orphans we previously VERIFIED as ours.

    Attribution happened while each process was alive (a zombie's
    environment is unreadable), so this works from recorded pids. Only
    zombies parented to us are touched, and ``waitpid`` on anything that
    is not our child raises and is swallowed — another subsystem's status
    is never taken.
    """
    if not adopted_pids:
        return 0
    reaped = 0
    mypid = os.getpid()
    for pid in adopted_pids:
        try:
            raw = Path(f"/proc/{pid}/stat").read_bytes()
            rest = raw.rsplit(b")", 1)[1].split()
            if rest[0] != b"Z" or int(rest[1]) != mypid:
                continue
        except (OSError, IndexError, ValueError):
            continue
        try:
            if os.waitpid(pid, os.WNOHANG)[0]:
                reaped += 1
        except (ChildProcessError, OSError):
            pass
    return reaped


class ProcessCleanupError(RuntimeError):
    """Shutdown could not affirmatively prove the owned session is empty.

    Raised so the caller — which re-execs in place after teardown — sees
    that descendants may survive, rather than shutdown returning normally
    on unverified state (round-7 #3).
    """

MAX_CONCURRENT = 20
MAX_LIFETIME_SECONDS = 3600  # 1 hour
OUTPUT_BUFFER_LINES = 500
# Ceiling for one poll's server-side wait: comfortably under the executor's
# 300s per-tool wall (an unbounded wait would die THERE as a tool error).
# Monitoring longer work = chained poll calls, each ≤ this.
MAX_POLL_WAIT_SECONDS = 120.0
# Upper bound on awaiting an in-flight group reap at shutdown before giving up
# and cancelling it — comfortably exceeds a reader's TERM-grace + KILL-grace so
# a compliant descendant always finishes, while a wedged one can't hang re-exec.
SHUTDOWN_REAP_TIMEOUT = 12.0
# Display segmentation for the ring buffer: newline AND carriage return
# both end a display segment (progress bars redraw with bare \r).
_SEGMENT_SPLIT = re.compile(rb"[\r\n]")


def _utf8_boundary_split(buf: bytes) -> tuple[bytes, bytes]:
    """Split ``buf`` so the head never ends mid-UTF-8-sequence.

    Backs off past trailing continuation bytes (0b10xxxxxx) and, if the
    byte before them is a multibyte lead whose sequence is incomplete,
    past the lead too. Arbitrary binary output degrades gracefully: at
    most 3 bytes are carried, everything else flushes with
    errors='replace' as before.
    """
    i = len(buf)
    while i > 0 and (len(buf) - i) < 3 and (buf[i - 1] & 0xC0) == 0x80:
        i -= 1
    if i > 0:
        lead = buf[i - 1]
        expected = 0
        if (lead & 0xE0) == 0xC0:
            expected = 2
        elif (lead & 0xF0) == 0xE0:
            expected = 3
        elif (lead & 0xF8) == 0xF0:
            expected = 4
        if expected and (len(buf) - (i - 1)) < expected:
            # Incomplete trailing sequence: carry lead + continuations.
            return buf[: i - 1], buf[i - 1 :]
    # Trailing unit is complete (or not UTF-8 at all): flush everything.
    return buf, b""



def _proc_ids(pid: int) -> tuple[int, int] | None | str:
    """``(ppid, session)`` from /proc/<pid>/stat.

    Returns ``None`` only when the process is PROVABLY gone
    (ENOENT/ESRCH), or the sentinel ``"unknown"`` for any other failure —
    a malformed or unreadable stat must never read as absence. Parsing is
    done on BYTES: ``comm`` may hold arbitrary non-UTF-8.
    """
    try:
        raw = Path(f"/proc/{pid}/stat").read_bytes()
    except (FileNotFoundError, ProcessLookupError):
        return None  # exited between listdir and read — genuinely gone
    except OSError:
        return "unknown"  # EMFILE/EACCES/… — we do NOT know
    try:
        rest = raw.rsplit(b")", 1)[1].split()
        if rest[0] == b"Z":
            return None  # zombie: dead, awaiting reap — not a live member
        return int(rest[1]), int(rest[3])  # ppid, session
    except (IndexError, ValueError):
        return "unknown"  # malformed — never treated as absence


def _proc_session(pid: int) -> int | None | str:
    """Session id alone (see :func:`_proc_ids` for the sentinel contract)."""
    ids = _proc_ids(pid)
    if isinstance(ids, tuple):
        return ids[1]
    return ids


def _scan_owned_members(
    sid: int,
    leader_pid: int | None = None,
    *,
    adopted_by: int | None = None,
    known_own_children: frozenset[int] = frozenset(),
    job_token: str | None = None,
    adopted_sink: set[int] | None = None,
) -> tuple[list[tuple[int, int]], bool]:
    """Enumerate every process we own, each PINNED with a pidfd.

    Ownership is the union of THREE relations, because no one of them
    covers every escape:

    - **Session** ``session == sid`` — the default for descendants of a
      leader spawned with ``start_new_session``.
    - **Ancestry** — a descendant that called ``setsid()`` left the
      session but is still ours while its parent chain reaches the
      leader (round-8 #1).
    - **Adoption + provenance** — a descendant that ALSO double-forked
      left the ancestry chain too; as a child subreaper we adopt it
      instead of PID 1 (round-9 #1). Adoption alone is NOT attribution:
      other Odin subsystems have direct children too, and killing those
      would be collateral damage (round-10). An adopted process must
      ALSO carry this job's ``ODIN_BG_JOB`` token, injected at spawn and
      inherited across fork, exec and setsid.

    A direct child whose provenance cannot be established is left
    UNTOUCHED and makes the scan incomplete — ambiguity never authorizes
    a kill, and never permits affirmative emptiness either.

    The pin happens BEFORE membership is verified, so verification and
    every later signal act on the exact process the fd names. ``complete``
    is False whenever any candidate could not be inspected or pinned for
    a reason other than provable disappearance, AND whenever an ancestry
    walk exhausts its bound — uncertainty is never non-ownership
    (round-9 #3). Caller owns the returned fds.
    """
    pinned: list[tuple[int, int]] = []
    try:
        entries = os.listdir("/proc")
    except OSError:
        return pinned, False
    ids: dict[int, tuple[int, int]] = {}
    complete = True
    candidates: list[tuple[int, int]] = []
    for entry in entries:
        if not entry.isdigit():
            continue
        pid = int(entry)
        try:
            fd = os.pidfd_open(pid)
        except ProcessLookupError:
            continue  # exited — not a member
        except OSError:
            # Could not pin: membership UNKNOWN unless provably gone.
            if _proc_ids(pid) is not None:
                complete = False
            continue
        info = _proc_ids(pid)
        if isinstance(info, tuple):
            ids[pid] = info
            candidates.append((pid, fd))
            continue
        if info == "unknown":
            complete = False
        os.close(fd)

    def _owned(pid: int) -> bool | None:
        """True/False, or None when the walk could not decide."""
        seen: set[int] = set()
        cur = pid
        for _ in range(64):  # bounded: no unbounded walk, no cycles
            if cur in seen:
                return False  # cycle — cannot be a chain to our leader
            if cur <= 1:
                return False
            entry = ids.get(cur)
            if entry is None:
                return False  # chain left our snapshot — not provably ours
            seen.add(cur)
            ppid, session = entry
            if session == sid:
                return True
            if leader_pid is not None and (cur == leader_pid or ppid == leader_pid):
                return True
            if (
                adopted_by is not None
                and ppid == adopted_by
                and cur not in known_own_children
            ):
                if job_token is None:
                    return None  # cannot attribute — ambiguous, never killed
                token = _read_job_token(cur)
                if token == job_token:
                    # Record provenance NOW: a zombie has no address
                    # space, so /proc/<pid>/environ becomes unreadable the
                    # moment it dies — identification must happen while it
                    # is alive, and reaping later goes by recorded pid.
                    if adopted_sink is not None:
                        adopted_sink.add(cur)
                    return True  # our escapee: adopted AND provably ours
                if token is _UNKNOWN:
                    return None  # unreadable provenance — ambiguous
                return False  # another subsystem's child — NOT ours
            cur = ppid
        return None  # bound exhausted — UNKNOWN, never "not ours"

    for pid, fd in candidates:
        verdict = _owned(pid)
        if verdict:
            pinned.append((pid, fd))
            continue
        if verdict is None:
            complete = False
        os.close(fd)
    return pinned, complete


JOB_TOKEN_ENV = "ODIN_BG_JOB"


def _read_job_token(pid: int) -> str | None | object:
    """This process's managed-job token from /proc/<pid>/environ.

    Returns the token, ``None`` when the process carries none (or is
    gone), or :data:`_UNKNOWN` when the environment could not be read —
    ambiguity, never absence.

    The token is injected at spawn and inherited across fork AND exec, so
    it follows a descendant that double-forks or calls ``setsid()``. It
    is per-JOB, which process-wide subreaping cannot provide: adoption
    alone cannot tell OUR escapee from an unrelated subprocess another
    Odin subsystem started (round-10).
    """
    try:
        raw = Path(f"/proc/{pid}/environ").read_bytes()
    except (FileNotFoundError, ProcessLookupError):
        return None
    except OSError:
        return _UNKNOWN
    marker = JOB_TOKEN_ENV.encode() + b"="
    for item in raw.split(b"\0"):
        if item.startswith(marker):
            return item[len(marker):].decode("utf-8", "replace")
    return None


def _reap_adopted(pids: set[int], known_own_children: frozenset[int]) -> None:
    """Non-blocking reap of orphans already VERIFIED as ours.

    ``pids`` were attributed to this job by provenance while they were
    alive — a zombie has no address space, so its environment cannot be
    re-read afterwards. Pids we deliberately spawned are still excluded:
    asyncio's child watcher owns those statuses and stealing one would
    break it. Never ``waitpid(-1)`` for the same reason.
    """
    for pid in list(pids):
        if pid in known_own_children:
            continue
        try:
            os.waitpid(pid, os.WNOHANG)
        except (ChildProcessError, OSError):
            pass  # not our child, or already reaped


def _signal_pinned(pinned: list[tuple[int, int]], sig: int) -> None:
    for pid, fd in pinned:
        try:
            signal.pidfd_send_signal(fd, sig)
        except OSError:
            log.debug("pidfd signal %d to PID %d failed", sig, pid)


def _close_pinned(pinned: list[tuple[int, int]]) -> None:
    for _pid, fd in pinned:
        try:
            os.close(fd)
        except OSError:
            pass


def _pidfd_exited(fd: int) -> bool:
    """A pidfd polls readable exactly when its process has exited."""
    import select

    try:
        r, _w, _x = select.select([fd], [], [], 0)
        return bool(r)
    except OSError:
        return True


async def _terminate_session_until_empty(
    sid: int,
    *,
    grace: float = 2.0,
    timeout: float = 10.0,
    term_first: bool = True,
    settle_scans: int = 2,
    settle_delay: float = 0.2,
    adopted_by: int | None = None,
    known_own_children: frozenset[int] = frozenset(),
    containment: bool = True,
    job_token: str | None = None,
    adopted_sink: set[int] | None = None,
) -> bool:
    """Drive everything we own to provably empty.

    Every pass RE-ENUMERATES (round-6 #1), so a signal handler that forks
    a fresh child — or one that changes its process group (round-7 #1) —
    is caught by the next pass. TERM is offered once per pid (when
    ``term_first``), then passes escalate to KILL, which cannot be caught
    or forked around.

    Emptiness requires ``settle_scans`` CONSECUTIVE complete-and-empty
    scans separated by ``settle_delay`` (round-8 #2): a single snapshot
    can miss a member that forked after enumeration and exited before the
    scan finished, leaving a child behind. The repeated scans also give
    any such child time to appear in /proc.

    Returns True only on that repeated affirmative observation — an
    unreadable /proc, fd exhaustion, a malformed stat, or an exhausted
    ancestry walk returns False, never a false success. ``containment``
    False (child-subreaper unavailable) means a double-fork+setsid
    escape would be undetectable, so emptiness is never claimed at all
    (round-9 #1).
    """
    deadline = time.monotonic() + timeout
    adopted: set[int] = adopted_sink if adopted_sink is not None else set()
    termed: set[int] = set()
    escalate_at = time.monotonic() + grace if term_first else 0.0
    clean_scans = 0
    while True:
        pinned, complete = _scan_owned_members(
            sid,
            leader_pid=sid,
            adopted_by=adopted_by,
            known_own_children=known_own_children,
            job_token=job_token,
            adopted_sink=adopted,
        )
        try:
            if complete and not pinned and containment:
                clean_scans += 1
                if clean_scans >= settle_scans:
                    return True
            else:
                clean_scans = 0
                if term_first and time.monotonic() < escalate_at:
                    fresh = [(p, fd) for p, fd in pinned if p not in termed]
                    _signal_pinned(fresh, signal.SIGTERM)
                    termed.update(p for p, _fd in fresh)
                else:
                    _signal_pinned(pinned, signal.SIGKILL)
                    # Adopted orphans become zombies once killed — reap
                    # them so a long-running process does not accumulate
                    # entries (our own children stay with asyncio).
                    _reap_adopted(adopted, known_own_children)
        finally:
            _close_pinned(pinned)
        if time.monotonic() >= deadline:
            if not containment:
                log.error(
                    "Cannot prove session %d is empty: child-subreaper "
                    "containment is unavailable, so an escaped descendant "
                    "would be undetectable", sid,
                )
            return False
        await asyncio.sleep(settle_delay if clean_scans else 0.1)


async def _wait_leader_exit(
    proc: asyncio.subprocess.Process, timeout: float | None = None
) -> bool:
    """Pipe-independent wait for LEADER exit.

    ``Process.wait()`` resolves only after every pipe transport closes
    (asyncio ``_try_finish``), so a ``&``-descendant holding stdout blocks
    it long past leader death — the PR #244 round-1 repro. ``returncode``
    is published at SIGCHLD reap regardless of pipes, so poll it. Returns
    True when the leader exited, False on deadline. Cancellation
    propagates (the sleep is the await point).
    """
    deadline = None if timeout is None else time.monotonic() + timeout
    while proc.returncode is None:
        if deadline is not None and time.monotonic() >= deadline:
            return False
        await asyncio.sleep(0.25)
    return True


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
    _exit_task: asyncio.Task | None = field(default=None, repr=False)
    exit_code: int | None = None
    # Monotonic progress signal: total bytes ever read from the process,
    # NOT bounded by the ring buffer — a full ring of repeated lines can
    # look frozen while output is still arriving; this counter cannot.
    total_output_bytes: int = 0
    # Affirmative cleanup proof (round-7 #3): True only once the owned
    # session was OBSERVED empty by a complete scan. shutdown() requires
    # this before it may report clean teardown / permit re-exec.
    session_confirmed_empty: bool = False
    # Per-job provenance (round-10): injected into the spawn environment
    # and inherited across fork/exec/setsid, so an escaped descendant is
    # attributable to THIS job and never confused with another
    # subsystem's direct child.
    job_token: str = ""


class ProcessRegistry:
    """Registry for background processes with full lifecycle management."""

    def __init__(self, workspace: str | Callable[[], str] | None = None) -> None:
        self._processes: dict[int, ProcessInfo] = {}
        # Background starts share the foreground workspace. Without this,
        # `manage_process start` stays an alternate route to the 2026-07-27
        # incident: a bare relative path resolving against the live install
        # (29 historical background starts had no explicit cd).
        #
        # A CALLABLE is preferred: the workspace's existence, type, ownership
        # and mode are mutable, so they must be re-verified immediately before
        # each spawn rather than trusted from construction time (PR #239
        # round-3 review — a cached path accepted a directory later replaced
        # by a symlink into the install).
        self._workspace = workspace
        # Kernel-backed containment for escaped descendants (round-9 #1):
        # as a child subreaper the PROCESS adopts orphans instead of PID
        # 1, so a double-fork+setsid escape stays attributable. Enabled
        # once at application startup (``src/__main__``) — a library
        # constructor must not flip process-wide state — and only READ
        # here. Its absence makes the terminator refuse to claim
        # emptiness rather than report a false success.
        # Pids WE deliberately spawned here: an adopted orphan is any
        # child of ours that is NOT one of these.
        self._own_children: set[int] = set()
        # Orphans verified as OURS by provenance while alive — reaping
        # goes by recorded pid because a zombie's environment is
        # unreadable (round-10).
        self._adopted_pids: set[int] = set()

    @property
    def _containment(self) -> bool:
        """Live read — containment is process state, not construction state."""
        return child_subreaper_active()

    def _resolve_workspace(self) -> str | None:
        if callable(self._workspace):
            return self._workspace()
        return self._workspace

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
            workspace = self._resolve_workspace()
            job_token = secrets.token_hex(8)
            env = dict(workspace_env(Path(workspace))) if workspace else dict(os.environ)
            env[JOB_TOKEN_ENV] = job_token
        except WorkspaceError as e:
            # The workspace is unusable. This is a REFUSAL, not a spawn error:
            # it must read as a failure to the tool loop, not as a started
            # process (PR #239 round-4 — the plain string was classified ok).
            return f"Error: cannot start background process — {e}"
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                stdin=asyncio.subprocess.PIPE,
                start_new_session=True,
                cwd=workspace,
                env=env,
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
            job_token=job_token,
        )
        self._processes[pid] = info
        self._own_children.add(pid)

        # Drainage and terminal-state publication are SEPARATE tasks:
        # the reader drains stdout; the watcher publishes status at
        # leader exit and reaps the group (which closes the pipe).
        info._reader_task = asyncio.create_task(self._read_output(info))
        info._exit_task = asyncio.create_task(self._watch_exit(info))

        # Auto-kill after max lifetime
        from ..async_utils import fire_and_forget

        fire_and_forget(
            self._enforce_lifetime(pid, MAX_LIFETIME_SECONDS), name=f"process_lifetime:{pid}"
        )

        log.info("Started process PID %d: %s", pid, command[:80])
        return f"Process started (PID {pid}): {command[:120]}"

    async def poll(self, pid: int, wait_seconds: float = 0.0) -> str:
        """Return recent output lines from a process.

        ``wait_seconds > 0`` waits server-side until the process EXITS or
        the deadline elapses, then reports — never an error, never a wake
        on intermediate output (early-output wakeup would return almost
        immediately on a streaming build and defeat the purpose; design
        settled with Odin, 2026-07-31). A terminal process reports
        immediately. Cancellation aborts only this wait — the detached
        process is never touched.
        """
        info = self._processes.get(pid)
        if not info:
            return f"No process with PID {pid}."

        # Exit detection must not depend on the watcher having PUBLISHED
        # yet (round-3 blocker #3): returncode is set at SIGCHLD reap, so a
        # zero-wait poll landing in the publication window still settles.
        exited = info.status != "running" or (
            info.process is not None and info.process.returncode is not None
        )
        if wait_seconds > 0 and not exited and info.process is not None:
            exited = await _wait_leader_exit(info.process, timeout=wait_seconds)
        if exited:
            # Terminal report discipline (PR #244 round-2 blocker #3): the
            # leader is gone — whether it exited during OUR wait or before
            # this poll — so give the watcher a bounded moment to publish
            # status/exit_code and reap the group (closing the pipe), then
            # the reader to drain the tail. Without this, a poll landing
            # between status publication and drain completion reports a
            # terminal process with its final output missing. Shielded —
            # our bound must not cancel either task; normally both are
            # already done and this costs nothing.
            for settling in (info._exit_task, info._reader_task):
                if settling is not None and not settling.done():
                    try:
                        await asyncio.wait_for(asyncio.shield(settling), timeout=5.0)
                    except TimeoutError:
                        pass

        lines = list(info.output_buffer)
        status_line = f"[PID {pid}] status={info.status}"
        if info.exit_code is not None:
            status_line += f" exit_code={info.exit_code}"
        elapsed = time.time() - info.start_time
        status_line += f" uptime={elapsed:.0f}s"
        status_line += f" output_bytes={info.total_output_bytes}"

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
                # No owned_pgid (round-5 blocker #2): kill() runs only
                # while status is running, so terminate_process_tree
                # discovers and VERIFIES the group against the live leader
                # rather than trusting a stale-capable number; the exit
                # watcher's race-free pidfd sweep finishes any survivors.
                await terminate_process_tree(info.process, grace=5.0)
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
        # 1) TERM/KILL every still-running leader. Its exit watcher then
        #    publishes terminal state and reaps surviving group members,
        #    which closes the pipe and unblocks the drainer.
        for pid, info in list(self._processes.items()):
            if info.status == "running":
                try:
                    await self.kill(pid)
                    killed += 1
                except Exception:
                    log.warning("Failed to kill PID %d during shutdown", pid)
        # 2) Let every reader/reaper finish so no group cleanup is left pending.
        for pid, info in list(self._processes.items()):
            for task in (info._exit_task, info._reader_task):
                if task is None or task.done():
                    continue
                try:
                    await asyncio.wait_for(
                        asyncio.shield(task), timeout=SHUTDOWN_REAP_TIMEOUT
                    )
                except TimeoutError:
                    # A wedged async reap must not strand TERM-immune
                    # descendants across re-exec. The BARRIER is ordered so
                    # that the process state — not the task — decides when
                    # shutdown may return (round-5 blocker #1): a
                    # cancellation-resistant task can never hold us, because
                    # we never await it unboundedly.
                    log.warning(
                        "Reaper for PID %d did not finish; hard-killing group "
                        "before abandoning", pid,
                    )
                    task.cancel()  # best effort; NEVER awaited unbounded
                    await self._kill_group_until_gone(info)
                except Exception:
                    log.debug(
                        "Reaper for PID %d errored during shutdown", pid, exc_info=True
                    )
        # 3) FINAL AFFIRMATIVE PROOF (round-7 #3). A completed watcher is
        #    not proof by itself: it may have recorded a FAILED reap, and
        #    the timeout fallback's verdict must not be discarded either.
        #    Every record that has not been OBSERVED session-empty is
        #    re-verified here; anything still unproven is escalated to the
        #    caller, which owns the re-exec decision.
        unproven: list[int] = []
        for pid, info in list(self._processes.items()):
            if info.session_confirmed_empty or info.process is None:
                continue
            try:
                if not await self._kill_group_until_gone(info):
                    unproven.append(pid)
            except Exception:
                log.exception("Final cleanup verification failed for PID %d", pid)
                unproven.append(pid)
        if killed:
            log.info("Shutdown: terminated %d running process(es)", killed)
        if unproven:
            raise ProcessCleanupError(
                "could not confirm the owned session is empty for "
                f"PID(s) {sorted(unproven)} — descendants may survive a "
                "re-exec"
            )
        return killed

    def cleanup(self) -> int:
        """Remove dead processes older than 1 hour. Returns count removed.

        NEVER cancels lifecycle tasks (PR #244 round-2 blocker #1): the
        exit watcher may be mid-group-reap, and cancellation propagates
        through ``terminate_process_tree`` — stranding a TERM-immune
        descendant is exactly the v3.59.1 shutdown bug reinvented. A
        record whose tasks are still running simply stays until the next
        cycle; the reap is self-terminating (TERM grace then KILL), so
        deferral is bounded by nature, not by us.
        """
        now = time.time()
        to_remove = [
            pid
            for pid, info in self._processes.items()
            if info.status != "running"
            and (now - info.start_time) > MAX_LIFETIME_SECONDS
            and all(
                t is None or t.done()
                for t in (info._reader_task, info._exit_task)
            )
        ]
        for pid in to_remove:
            self._processes.pop(pid)
        # Adopted orphans die as zombies (nothing else will wait on them);
        # sweep them here so a long-running process cannot accumulate.
        reap_adopted_zombies(frozenset(self._adopted_pids))
        return len(to_remove)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _kill_group_until_gone(
        self, info: ProcessInfo, timeout: float = 8.0
    ) -> bool:
        """Bounded, race-free termination of everything we still own.

        The shutdown completion barrier: drive the owned session empty
        with repeated COMPLETE enumeration (fork-on-signal descendants
        are caught by the next pass) and reap the leader, then return
        only on an AFFIRMATIVE observation — an unreadable /proc or fd
        exhaustion yields False, never assumed success (round-6).

        A False return is LOUD (error) and is what the caller reports.
        """
        proc = info.process
        if proc is None:
            return True
        gone = await _terminate_session_until_empty(
            proc.pid,
            timeout=timeout,
            term_first=False,
            adopted_by=os.getpid(),
            known_own_children=frozenset(self._own_children),
            containment=self._containment,
            job_token=info.job_token or None,
            adopted_sink=self._adopted_pids,
        )
        info.session_confirmed_empty = gone
        if proc.returncode is None:
            # Reap the leader (bounded) so no zombie crosses the exec.
            await _wait_leader_exit(proc, timeout=1.0)
        if gone and proc.returncode is not None:
            return True
        log.error(
            "Shutdown could not confirm PID %d's owned group is gone "
            "(group_empty_observed=%s, leader_rc=%r) — re-exec may inherit "
            "orphaned descendants",
            info.pid, gone, proc.returncode,
        )
        return False

    async def _read_output(self, info: ProcessInfo) -> None:
        """Drain stdout into the ring buffer. Pure drainage — terminal
        status and group reaping live in ``_watch_exit`` (PR #244 round-1:
        a ``&``-descendant holding the stdout pipe kept EOF from arriving,
        so an exited leader reported ``running`` forever and the reap
        stalled behind drainage).

        Bounded RAW reads, not ``readline()``: newline-free output and
        carriage-return progress bars must still advance
        ``total_output_bytes`` (it is the wait-poll progress signal), and
        an over-limit line must not kill drainage (``readline`` raises on
        lines beyond the stream limit; ``read(n)`` cannot).
        """
        pending = b""
        try:
            while info.process and info.process.stdout:
                chunk = await info.process.stdout.read(4096)
                if not chunk:
                    break
                info.total_output_bytes += len(chunk)
                pending += chunk
                # Display buffering: split on both \n and \r so progress
                # bars render as lines; keep the unterminated tail bounded.
                segments = _SEGMENT_SPLIT.split(pending)
                pending = segments.pop()
                for seg in segments:
                    if seg:
                        info.output_buffer.append(
                            seg.decode("utf-8", errors="replace") + "\n"
                        )
                if len(pending) > 4096:
                    # Forced flush of an unterminated tail must not split a
                    # multibyte sequence (PR #244 round-2 blocker #4): cut
                    # at a UTF-8 boundary and carry the partial sequence.
                    flush, pending = _utf8_boundary_split(pending)
                    if flush:
                        info.output_buffer.append(
                            flush.decode("utf-8", errors="replace") + "\n"
                        )
        except Exception:
            pass
        if pending:
            info.output_buffer.append(pending.decode("utf-8", errors="replace") + "\n")

    async def _watch_exit(self, info: ProcessInfo) -> None:
        """Publish terminal state at LEADER exit, then reap the group.

        Separated from stdout drainage (PR #244 round-1): ``process.wait()``
        returns when the leader exits regardless of who still holds the
        pipe, so status/exit_code publication never waits on EOF, and the
        reap (which kills lingering descendants — the v3.59.1 contract:
        managed descendants are reaped when their leader exits) is what
        CLOSES the pipe and lets the drainer finish naturally.
        """
        if info.process is None:
            return
        try:
            await _wait_leader_exit(info.process)
            info.exit_code = info.process.returncode
            if info.status == "running":
                info.status = "completed" if info.exit_code == 0 else "failed"
        except Exception:
            if info.status == "running":
                info.status = "failed"

        # Reap while ownership is fresh: a non-empty group keeps the leader
        # pid from being recycled — but ONLY while a member survives, so a
        # numeric pgid is stale-capable here (round-5 blocker #2). Every
        # signal now goes through pidfds pinned BEFORE membership
        # verification: TERM, bounded grace, then KILL for survivors.
        try:
            info.session_confirmed_empty = await _terminate_session_until_empty(
                info.process.pid,
                grace=2.0,
                timeout=10.0,
                adopted_by=os.getpid(),
                known_own_children=frozenset(self._own_children),
                containment=self._containment,
                job_token=info.job_token or None,
                adopted_sink=self._adopted_pids,
            )
        except Exception:
            info.session_confirmed_empty = False
            log.debug("session reap after PID %d exit failed", info.pid, exc_info=True)
        if not info.session_confirmed_empty:
            log.error(
                "Could not confirm PID %d's owned session is empty after "
                "leader exit — shutdown will re-verify", info.pid,
            )

    async def _enforce_lifetime(self, pid: int, max_seconds: int) -> None:
        """Auto-kill process after max lifetime."""
        await asyncio.sleep(max_seconds)
        info = self._processes.get(pid)
        if info and info.status == "running":
            log.warning("Auto-killing PID %d after %ds lifetime limit", pid, max_seconds)
            await self.kill(pid)
