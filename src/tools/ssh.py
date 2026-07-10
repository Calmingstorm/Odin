from __future__ import annotations

import asyncio
import os
import signal
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from ..llm.backoff import compute_backoff
from ..odin_log import get_logger

if TYPE_CHECKING:
    from .ssh_pool import SSHConnectionPool

# Optional async callback that receives each line of output as it arrives.
OutputCallback = Callable[[str], Awaitable[None]]

log = get_logger("ssh")

MAX_OUTPUT_CHARS = 16000

# Addresses considered "local" — commands run via subprocess, not SSH.
_LOCAL_ADDRESSES = frozenset({"127.0.0.1", "localhost", "::1"})

# SSH exit codes that indicate a connection-level failure (not a command failure).
# 255 is the canonical SSH connection error code.
_SSH_TRANSIENT_EXIT_CODES = frozenset({255})

# Substrings in SSH stderr that indicate transient connection problems worth retrying.
_SSH_TRANSIENT_PATTERNS = (
    "Connection refused",
    "Connection reset",
    "Connection timed out",
    "No route to host",
    "Network is unreachable",
    "ssh_exchange_identification",
    "kex_exchange_identification",
)


def is_local_address(address: str) -> bool:
    """Return True if *address* points to the local machine."""
    return address in _LOCAL_ADDRESSES


def _truncate_output(output: str) -> str:
    """Truncate output exceeding MAX_OUTPUT_CHARS, keeping head and tail."""
    if len(output) <= MAX_OUTPUT_CHARS:
        return output
    half = MAX_OUTPUT_CHARS // 2
    return output[:half] + "\n\n... (output truncated) ...\n\n" + output[-half:]


def _is_ssh_transient_failure(exit_code: int, output: str) -> bool:
    """Return True if the SSH result looks like a transient connection failure."""
    if exit_code in _SSH_TRANSIENT_EXIT_CODES:
        return any(p in output for p in _SSH_TRANSIENT_PATTERNS)
    return False


async def terminate_process_tree(
    proc: asyncio.subprocess.Process, grace: float = 3.0
) -> None:
    """Terminate a spawned child — and its whole process group when it leads
    one — escalating to SIGKILL after *grace* seconds, then reap it.

    Group signalling happens ONLY when ``os.getpgid(pid) == pid`` (the child
    was spawned with ``start_new_session=True``): a child still in the
    service's own group must never be group-signalled, or the signal would
    hit the whole service. Group ownership is snapshotted BEFORE signalling,
    and after the TERM pass the group is probed independently of the leader:
    a compliant leader exiting must not end cleanup while a TERM-immune
    descendant survives in the now-leaderless group. Process-lookup races
    and reap timeouts are swallowed; cancellation of the cleanup itself
    still propagates.
    """
    if proc.returncode is not None:
        return

    try:
        pgid: int | None = os.getpgid(proc.pid)
    except (ProcessLookupError, PermissionError):
        pgid = None
    owns_group = pgid is not None and pgid == proc.pid

    def _signal_tree(sig: int) -> None:
        try:
            if owns_group and pgid is not None:
                os.killpg(pgid, sig)
            elif proc.returncode is None:
                proc.send_signal(sig)
        except (ProcessLookupError, PermissionError):
            pass

    def _group_alive() -> bool:
        if not owns_group or pgid is None:
            return False
        try:
            os.killpg(pgid, 0)
            return True
        except (ProcessLookupError, PermissionError):
            return False

    _signal_tree(signal.SIGTERM)
    leader_exited = True
    try:
        await asyncio.wait_for(proc.wait(), timeout=grace)
    except TimeoutError:
        leader_exited = False
    if leader_exited and not _group_alive():
        return
    # Either the leader ignored TERM, or a descendant in its group did —
    # SIGKILL the remainder even though the leader may already be gone.
    _signal_tree(signal.SIGKILL)
    try:
        await asyncio.wait_for(proc.wait(), timeout=grace)
    except TimeoutError:
        log.warning("PID %d did not exit after SIGKILL", proc.pid)


async def _read_lines_with_callback(
    proc: asyncio.subprocess.Process,
    timeout: int,
    on_output: OutputCallback,
) -> tuple[int, str]:
    """Read stdout line by line, calling *on_output* for each line."""
    lines: list[str] = []
    try:
        async with asyncio.timeout(timeout):
            assert proc.stdout is not None
            while True:
                raw = await proc.stdout.readline()
                if not raw:
                    break
                line = raw.decode("utf-8", errors="replace")
                lines.append(line)
                try:
                    await on_output(line)
                except Exception:
                    log.debug("on_output callback error", exc_info=True)
        # Wait for process exit with a bounded timeout to avoid indefinite hang
        try:
            await asyncio.wait_for(proc.wait(), timeout=min(timeout, 10))
        except TimeoutError:
            await terminate_process_tree(proc)
    except TimeoutError:
        await terminate_process_tree(proc)
        return 1, f"Command timed out after {timeout} seconds"
    except asyncio.CancelledError:
        # Task cancellation (loop drain at shutdown/restart) must not leak
        # the child or its descendants past this process's lifetime.
        await terminate_process_tree(proc)
        raise
    output = "".join(lines)
    return proc.returncode or 0, _truncate_output(output)


async def run_local_command(
    command: str,
    timeout: int = 30,
    on_output: OutputCallback | None = None,
) -> tuple[int, str]:
    """Run a command locally via subprocess. Returns (exit_code, output).

    Used for localhost hosts — no SSH overhead, no key needed.
    When *on_output* is provided, stdout is streamed line-by-line to the
    callback in addition to being collected for the return value.
    """
    log.info("Local exec: %s", command)

    proc: asyncio.subprocess.Process | None = None
    try:
        # start_new_session puts the shell at the head of its own process
        # group, so timeout/cancellation cleanup can take out descendants
        # (`sh -c 'x & ...'`) instead of just the shell leader.
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            start_new_session=True,
        )
        if on_output is not None:
            return await _read_lines_with_callback(proc, timeout, on_output)
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        output = stdout.decode("utf-8", errors="replace")
        return proc.returncode or 0, _truncate_output(output)

    except TimeoutError:
        if proc is not None:
            await terminate_process_tree(proc)
        return 1, f"Command timed out after {timeout} seconds"
    except asyncio.CancelledError:
        # Loop drain at shutdown/restart cancels in-flight commands; the
        # child tree must die with this process, not outlive the exec.
        if proc is not None:
            await terminate_process_tree(proc)
        raise
    except Exception as e:
        log.error("Local command failed: %s", e)
        return 1, f"Local exec error: {e}"


async def run_ssh_command(
    host: str,
    command: str,
    ssh_key_path: str,
    known_hosts_path: str,
    timeout: int = 30,
    ssh_user: str = "root",
    max_retries: int = 1,
    retry_base_delay: float = 0.5,
    retry_max_delay: float = 10.0,
    pool: SSHConnectionPool | None = None,
    on_output: OutputCallback | None = None,
) -> tuple[int, str]:
    """Run a command on a remote host via SSH. Returns (exit_code, output).

    When *pool* is provided, uses OpenSSH ControlMaster multiplexing to
    reuse persistent connections. Otherwise falls back to one-shot SSH.

    Retries on transient SSH connection failures (exit code 255 with known
    error patterns). Command-level failures (nonzero exit from the remote
    command itself) are NOT retried — they represent valid remote results.
    """
    if pool is not None:
        ssh_args = pool.get_ssh_args(
            host,
            command,
            ssh_key_path,
            known_hosts_path,
            ssh_user,
        )
    else:
        ssh_args = [
            "ssh",
            "-i",
            ssh_key_path,
            "-o",
            f"UserKnownHostsFile={known_hosts_path}",
            "-o",
            "StrictHostKeyChecking=yes",
            "-o",
            "ConnectTimeout=10",
            "-o",
            "BatchMode=yes",
            f"{ssh_user}@{host}",
            command,
        ]

    log.info("SSH to %s@%s: %s", ssh_user, host, command)
    last_exit_code = 1
    last_output = ""

    for attempt in range(max_retries):
        proc: asyncio.subprocess.Process | None = None
        try:
            # The ssh client is a direct child (no new session: killing the
            # client is sufficient — the remote side is ssh's own domain, and
            # ControlMaster mux masters must stay untouched).
            proc = await asyncio.create_subprocess_exec(
                *ssh_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            if on_output is not None:
                exit_code, output = await _read_lines_with_callback(
                    proc,
                    timeout,
                    on_output,
                )
            else:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
                output = stdout.decode("utf-8", errors="replace")
                exit_code = proc.returncode or 0

            if exit_code == 0 or not _is_ssh_transient_failure(exit_code, output):
                return exit_code, _truncate_output(output)

            last_exit_code = exit_code
            last_output = output

            if attempt < max_retries - 1:
                wait = compute_backoff(attempt, retry_base_delay, retry_max_delay)
                log.warning(
                    "SSH transient failure to %s (attempt %d/%d): %s. Retrying in %.1fs...",
                    host,
                    attempt + 1,
                    max_retries,
                    output.strip()[:200],
                    wait,
                )
                await asyncio.sleep(wait)
            else:
                log.warning(
                    "SSH transient failure to %s (attempt %d/%d, exhausted): %s",
                    host,
                    attempt + 1,
                    max_retries,
                    output.strip()[:200],
                )

        except TimeoutError:
            last_exit_code = 1
            last_output = f"Command timed out after {timeout} seconds"
            # Reap the timed-out client on EVERY arm — the retry path used
            # to leave the previous ssh process running while spawning the
            # next attempt.
            if proc is not None:
                await terminate_process_tree(proc)
            if attempt < max_retries - 1:
                wait = compute_backoff(attempt, retry_base_delay, retry_max_delay)
                log.warning(
                    "SSH timeout to %s (attempt %d/%d). Retrying in %.1fs...",
                    host,
                    attempt + 1,
                    max_retries,
                    wait,
                )
                await asyncio.sleep(wait)
            else:
                return 1, last_output

        except asyncio.CancelledError:
            # Loop drain at shutdown/restart: the ssh client must not
            # outlive this process.
            if proc is not None:
                await terminate_process_tree(proc)
            raise

        except Exception as e:
            log.error("SSH command failed: %s", e)
            return 1, f"SSH error: {e}"

    return last_exit_code, _truncate_output(last_output)
