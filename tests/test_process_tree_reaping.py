"""Command children must not outlive their controlling task or this process.

Pins the PR #227 review repros: cancelling an in-flight command (what the
shutdown/restart loop drain does) or timing it out used to leak the child —
and `sh -c 'x & …'` descendants — past the process's lifetime, which an
in-place exec restart would then inherit unrecorded. Likewise
ProcessRegistry killed only the shell leader, never its group.

The spawned processes here are short `sleep`s (self-expiring, killed again
in finally) — harmless by construction; no destructive commands.
"""
from __future__ import annotations

import asyncio
import os
import signal
import time
from pathlib import Path

import pytest

from src.tools.process_manager import ProcessInfo, ProcessRegistry
from src.tools.ssh import run_local_command, run_ssh_command, terminate_process_tree


def _pid_dead(pid: int) -> bool:
    """Dead means DEAD — including a zombie awaiting reap.

    The process runs as a child subreaper (like production), so a killed
    orphan reparents to us and lingers as a zombie until swept.
    ``os.kill(pid, 0)`` still succeeds for it, so liveness is read from
    /proc state instead.
    """
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return True
    try:
        raw = Path(f"/proc/{pid}/stat").read_bytes()
        return raw.rsplit(b")", 1)[1].split()[0] == b"Z"
    except (OSError, IndexError):
        return True


async def _assert_pid_gone(pid: int, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _pid_dead(pid):
            return
        await asyncio.sleep(0.05)
    pytest.fail(f"PID {pid} is still alive")


def _best_effort_kill(pid: int) -> None:
    try:
        os.kill(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


async def _read_pidfile(path, timeout: float = 5.0) -> int:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists() and path.read_text().strip():
            return int(path.read_text().strip())
        await asyncio.sleep(0.05)
    pytest.fail("pidfile never appeared")


class TestLocalCommandReaping:
    async def test_cancellation_reaps_descendants_streaming_path(self):
        # Review repro 1: run_local_command task cancelled →
        # alive_after_task_cancellation was True.
        got_line = asyncio.Event()
        lines: list[str] = []

        async def on_out(line: str) -> None:
            lines.append(line)
            got_line.set()

        task = asyncio.create_task(
            run_local_command("sleep 30 & echo $!; wait $!", timeout=30, on_output=on_out)
        )
        await asyncio.wait_for(got_line.wait(), timeout=5)
        grandchild = int(lines[0].strip())
        try:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            await _assert_pid_gone(grandchild)
        finally:
            _best_effort_kill(grandchild)

    async def test_cancellation_reaps_descendants_plain_path(self, tmp_path):
        pidfile = tmp_path / "pid"
        task = asyncio.create_task(
            run_local_command(f"sleep 30 & echo $! > {pidfile}; wait $!", timeout=30)
        )
        grandchild = await _read_pidfile(pidfile)
        try:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            await _assert_pid_gone(grandchild)
        finally:
            _best_effort_kill(grandchild)

    async def test_timeout_reaps_descendants(self, tmp_path):
        # The old timeout arm killed only the shell leader; the descendant
        # kept running.
        pidfile = tmp_path / "pid"
        code, output = await run_local_command(
            f"sleep 30 & echo $! > {pidfile}; wait $!", timeout=1
        )
        assert code == 1 and "timed out" in output
        grandchild = await _read_pidfile(pidfile)
        try:
            await _assert_pid_gone(grandchild)
        finally:
            _best_effort_kill(grandchild)


class TestSSHClientReaping:
    """The ssh client is a direct child — simulated here by pointing the
    exec spawn at a plain `sleep`, so no network or daemon is involved."""

    @pytest.fixture
    def fake_ssh_spawn(self, monkeypatch):
        real = asyncio.create_subprocess_exec
        procs: list[asyncio.subprocess.Process] = []

        async def _spawn(*args, **kwargs):
            proc = await real(
                "sleep",
                "30",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            procs.append(proc)
            return proc

        monkeypatch.setattr(asyncio, "create_subprocess_exec", _spawn)
        yield procs
        for proc in procs:
            if proc.returncode is None:
                proc.kill()

    async def test_cancellation_reaps_ssh_client(self, fake_ssh_spawn, tmp_path):
        task = asyncio.create_task(
            run_ssh_command("host", "cmd", str(tmp_path / "k"), str(tmp_path / "kh"), timeout=30)
        )
        while not fake_ssh_spawn:
            await asyncio.sleep(0.02)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert fake_ssh_spawn[0].returncode is not None  # reaped, not leaked

    async def test_timeout_retries_do_not_leak_clients(self, fake_ssh_spawn, tmp_path):
        # The retry arm used to spawn the next attempt while the timed-out
        # client was still running.
        code, output = await run_ssh_command(
            "host",
            "cmd",
            str(tmp_path / "k"),
            str(tmp_path / "kh"),
            timeout=1,
            max_retries=2,
            retry_base_delay=0.01,
        )
        assert code == 1 and "timed out" in output
        assert len(fake_ssh_spawn) == 2
        assert all(proc.returncode is not None for proc in fake_ssh_spawn)


class TestProcessRegistryGroupKill:
    async def test_shutdown_kills_descendants(self, tmp_path):
        # Review repro 2: ProcessRegistry.shutdown() after a managed shell
        # spawned `sleep 30` → alive_after_registry_shutdown was True.
        pidfile = tmp_path / "pid"
        registry = ProcessRegistry()
        result = await registry.start(
            "localhost", f"sleep 30 & echo $! > {pidfile}; wait $!"
        )
        assert "Process started" in result
        grandchild = await _read_pidfile(pidfile)
        try:
            await registry.shutdown()
            await _assert_pid_gone(grandchild)
        finally:
            _best_effort_kill(grandchild)

    async def test_kill_reports_and_reaps_group(self, tmp_path):
        pidfile = tmp_path / "pid"
        registry = ProcessRegistry()
        await registry.start("localhost", f"sleep 30 & echo $! > {pidfile}; wait $!")
        grandchild = await _read_pidfile(pidfile)
        (pid,) = registry._processes.keys()
        try:
            result = await registry.kill(pid)
            assert f"Process {pid} killed" in result
            await _assert_pid_gone(grandchild)
            await _assert_pid_gone(pid)
        finally:
            _best_effort_kill(grandchild)

    async def test_shutdown_awaits_inflight_reaper_not_cancels(self):
        # A leader that exited on its own can leave its reader task mid group-reap
        # (TERM grace + SIGKILL escalation) with the record already terminal.
        # shutdown() must AWAIT that reaper — the old code skipped the terminal
        # record and cancelled the reader, and cancellation propagates through
        # terminate_process_tree, stranding a TERM-immune descendant across the
        # in-place exec. Model the reaper as a task that finishes its cleanup
        # ONLY if awaited, not cancelled. (PR #227 round-5 blocker.)
        registry = ProcessRegistry()
        reaped = asyncio.Event()

        async def fake_reaper():
            await asyncio.sleep(0.2)  # the TERM grace + SIGKILL escalation
            reaped.set()  # the descendant is actually killed here

        info = ProcessInfo(
            pid=4242,
            command="x",
            host="localhost",
            start_time=time.time(),
            status="completed",  # leader already terminal; reaper still running
        )
        info._reader_task = asyncio.create_task(fake_reaper())
        registry._processes[4242] = info

        await registry.shutdown()

        assert reaped.is_set(), "shutdown cancelled the in-flight reaper instead of awaiting it"
        assert info._reader_task.done() and not info._reader_task.cancelled()

    async def test_leaderless_group_descendant_reaped_on_leader_exit(self, tmp_path):
        # The shell exits naturally while a REDIRECTED background descendant
        # (its stdout on /dev/null, so it never holds the registry's pipe)
        # survives. The entry goes 'completed'; shutdown() skips completed
        # entries, so the descendant would leak across an in-place restart. It
        # must be reaped when the leader exits, while group ownership is fresh.
        # (PR #227 round-4 blocker 1.)
        pidfile = tmp_path / "pid"
        registry = ProcessRegistry()
        await registry.start(
            "localhost", f"sleep 30 >/dev/null 2>&1 & echo $! > {pidfile}"
        )
        grandchild = await _read_pidfile(pidfile)
        try:
            await _assert_pid_gone(grandchild)  # reaped at leader-exit, not leaked
            (pid,) = registry._processes.keys()
            assert registry._processes[pid].status in ("completed", "failed")
        finally:
            _best_effort_kill(grandchild)


class TestLeaderAlreadyExited:
    """A shell can exit naturally while a descendant lives on holding stdout
    — cleanup then runs with returncode already set and must still be able
    to signal the owned group (round-3 review repro)."""

    async def test_helper_kills_group_after_leader_reaped(self, tmp_path):
        pidfile = tmp_path / "pid"
        # DEVNULL, not PIPE: the backgrounded sleep inherits the leader's
        # stdout, so a PIPE would keep proc.wait() blocked on pipe-EOF until the
        # sleep itself dies — making the descendant's liveness a race (it can be
        # gone by the time we check). With no inherited pipe the leader is reaped
        # immediately while the descendant is deterministically still alive.
        proc = await asyncio.create_subprocess_shell(
            f"sleep 30 & echo $! > {pidfile}",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            start_new_session=True,
        )
        await proc.wait()  # leader exits at once; returncode set, descendant lives
        assert proc.returncode == 0
        stubborn = await _read_pidfile(pidfile)
        try:
            os.kill(stubborn, 0)  # descendant is alive right now
            await terminate_process_tree(proc, grace=0.5, owned_pgid=proc.pid)
            await _assert_pid_gone(stubborn)
        finally:
            _best_effort_kill(stubborn)

    async def test_cancelled_local_command_reaps_after_natural_leader_exit(
        self, tmp_path
    ):
        # Through the real path: the shell exits immediately, the sleep holds
        # stdout open so communicate() stays blocked, the child watcher reaps
        # the shell (returncode set), THEN the task is cancelled — the
        # descendant must still die.
        pidfile = tmp_path / "pid"
        task = asyncio.create_task(
            run_local_command(f"sleep 30 & echo $! > {pidfile}", timeout=30)
        )
        stubborn = await _read_pidfile(pidfile)
        await asyncio.sleep(0.3)  # let the child watcher reap the exited shell
        try:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            await _assert_pid_gone(stubborn)
        finally:
            _best_effort_kill(stubborn)


class TestNeverBroadcasts:
    """A poisoned pgid must NEVER reach os.killpg as a broadcast/own-group
    target. os.killpg(1, sig) == kill(-1, sig) signals every process the user
    owns — run bare in a desktop session it SIGTERMs the login manager and
    Cinnamon; run as the service user it reaps the live bot. Whatever produces a
    pgid of 0/1 or our own group (a bad owned_pgid, a recycled pid), cleanup
    must fall back to child-only signalling and never call killpg with it.
    """

    @pytest.mark.parametrize("poison", [0, 1, -1])
    async def test_poisoned_owned_pgid_never_reaches_killpg(self, poison, monkeypatch):
        from unittest.mock import AsyncMock

        calls: list[tuple[int, int]] = []

        def _record_killpg(pgid, sig):
            calls.append((pgid, sig))
            # Emulate the kernel: signal 0 to a "live" broadcast target succeeds,
            # so a missing guard would loop/escalate rather than error out.
            if sig != 0:
                raise ProcessLookupError

        monkeypatch.setattr(os, "killpg", _record_killpg)

        proc = AsyncMock()
        proc.returncode = None
        proc.pid = poison  # owned_pgid == proc.pid → would-be "owns_group"
        proc.wait = AsyncMock(return_value=0)
        sent: list[int] = []
        proc.send_signal = lambda sig: sent.append(sig)

        await terminate_process_tree(proc, grace=0.05, owned_pgid=poison)

        assert calls == [], f"killpg called with poisoned pgid: {calls}"
        # Cleanup still happened — via the single child, not a group broadcast.
        assert signal.SIGTERM in sent

    async def test_own_process_group_is_never_signalled(self, monkeypatch):
        from unittest.mock import AsyncMock

        own = os.getpgrp()
        calls: list[tuple[int, int]] = []
        monkeypatch.setattr(os, "killpg", lambda pgid, sig: calls.append((pgid, sig)))

        proc = AsyncMock()
        proc.returncode = None
        proc.pid = own  # a recycled pid that aliases the runner's own group
        proc.wait = AsyncMock(return_value=0)
        sent: list[int] = []
        proc.send_signal = lambda sig: sent.append(sig)

        await terminate_process_tree(proc, grace=0.05, owned_pgid=own)

        assert calls == [], f"killpg targeted our own group: {calls}"
        assert signal.SIGTERM in sent


class TestTerminateProcessTreeGuard:
    async def test_never_group_signals_a_child_in_our_own_group(self):
        # A child spawned WITHOUT start_new_session shares this process's
        # group — group-signalling it would SIGTERM the test runner itself.
        # The guard must fall back to child-only signalling.
        proc = await asyncio.create_subprocess_exec(
            "sleep",
            "30",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert os.getpgid(proc.pid) == os.getpgid(0)  # same group as us
        await terminate_process_tree(proc, grace=2.0)
        assert proc.returncode is not None  # child reaped, we are still here

    async def test_already_reaped_child_is_a_noop(self):
        proc = await asyncio.create_subprocess_exec(
            "true", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
        )
        await proc.wait()
        await terminate_process_tree(proc)  # returncode set → immediate return
        assert proc.returncode == 0

    async def test_sigterm_immune_tree_is_sigkill_escalated(self):
        # trap-ignored SIGTERM is inherited by the sleep child — the whole
        # group survives the TERM pass and must die to the KILL escalation.
        proc = await asyncio.create_subprocess_shell(
            'trap "" TERM; sleep 30',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            start_new_session=True,
        )
        await terminate_process_tree(proc, grace=0.3)
        assert proc.returncode is not None
        await _assert_pid_gone(proc.pid)

    async def test_compliant_leader_with_term_immune_descendant(self, tmp_path):
        # Re-review repro: the leader exits on TERM (returncode -15) while a
        # trap-ignoring descendant survives in the now-leaderless group. The
        # helper used to return as soon as the leader was reaped — the group
        # must be probed independently and SIGKILLed even without its leader.
        pidfile = tmp_path / "pid"
        proc = await asyncio.create_subprocess_shell(
            f"sh -c 'trap \"\" TERM; sleep 30' & echo $! > {pidfile}; wait $!",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            start_new_session=True,
        )
        stubborn = await _read_pidfile(pidfile)
        try:
            await terminate_process_tree(proc, grace=0.3)
            assert proc.returncode is not None
            await _assert_pid_gone(stubborn)
        finally:
            _best_effort_kill(stubborn)

    async def test_child_vanishing_before_getpgid_is_tolerated(self, monkeypatch):
        from unittest.mock import AsyncMock

        monkeypatch.setattr(os, "getpgid", lambda pid: (_ for _ in ()).throw(ProcessLookupError()))
        proc = AsyncMock()
        proc.returncode = None
        proc.pid = 424242
        proc.wait = AsyncMock(return_value=0)
        await terminate_process_tree(proc, grace=0.1)  # no signal sent, no raise

    async def test_group_signal_permission_error_is_tolerated(self, monkeypatch):
        from unittest.mock import AsyncMock

        proc = AsyncMock()
        proc.returncode = None
        proc.pid = 424242
        proc.wait = AsyncMock(return_value=0)
        monkeypatch.setattr(os, "getpgid", lambda pid: pid)  # child leads its group
        monkeypatch.setattr(
            os, "killpg", lambda pgid, sig: (_ for _ in ()).throw(PermissionError())
        )
        await terminate_process_tree(proc, grace=0.1)  # swallowed, no raise

    async def test_unkillable_child_logs_and_returns(self, monkeypatch):
        from unittest.mock import AsyncMock

        async def hang():
            await asyncio.sleep(999)

        monkeypatch.setattr(os, "getpgid", lambda pid: (_ for _ in ()).throw(ProcessLookupError()))
        proc = AsyncMock()
        proc.returncode = None
        proc.pid = 424242
        proc.wait = hang
        # both bounded waits expire; the helper must give up without raising
        await terminate_process_tree(proc, grace=0.05)
