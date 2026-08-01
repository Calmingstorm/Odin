from __future__ import annotations

import asyncio
import os
import shlex
import signal
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import TYPE_CHECKING

from ..llm.backoff import compute_backoff
from ..odin_log import get_logger
from .workspace import workspace_env

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


def _is_signallable_group(pgid: int | None) -> bool:
    """Whether *pgid* is safe to hand to ``os.killpg``.

    ``os.killpg(pgid, sig)`` is ``kill(-pgid, sig)`` at the syscall level, so a
    pgid of 1 becomes ``kill(-1)`` — SIGTERM/SIGKILL to *every process the user
    can signal*. Run bare in a desktop session that reaps the login manager and
    Cinnamon; run as the ``odin`` service user it reaps the live bot. ``pgid``
    of 0 means ``kill(0)`` — the caller's OWN group (the test runner / service).
    Our own process group is likewise off limits. A managed child is always a
    session leader with a large, foreign pgid, so this rejects ONLY the
    catastrophic targets and never a legitimate group kill.
    """
    if not isinstance(pgid, int) or pgid <= 1:
        return False
    try:
        if pgid == os.getpgrp():
            return False
    except OSError:
        return False
    return True


async def terminate_process_tree(
    proc: asyncio.subprocess.Process,
    grace: float = 3.0,
    owned_pgid: int | None = None,
) -> None:
    """Terminate a spawned child — and its whole process group when it leads
    one — escalating to SIGKILL after *grace* seconds per pass, then reap it.

    ``owned_pgid`` is the by-construction group id (``proc.pid``) and must be
    passed ONLY by callers that spawned the child with
    ``start_new_session=True``. It keeps the group signallable after the
    leader has already exited and been reaped — a shell can finish naturally
    (``returncode`` set) while a descendant lives on holding stdout, and at
    that point ``getpgid`` can no longer discover the group. Without it,
    group ownership is discovered — and verified — via
    ``os.getpgid(pid) == pid`` while the leader is alive; a child still in
    the service's own group is never group-signalled, or the signal would
    hit the whole service. Each pass probes the group independently of the
    leader (``killpg(pgid, 0)``), so a compliant leader exiting never ends
    cleanup while TERM-immune descendants survive. Process-lookup races and
    reap timeouts are swallowed; cancellation of the cleanup itself still
    propagates.
    """
    pgid = owned_pgid
    if pgid is None and proc.returncode is None:
        try:
            discovered = os.getpgid(proc.pid)
        except (ProcessLookupError, PermissionError):
            discovered = None
        if discovered is not None and discovered == proc.pid:
            pgid = discovered
    # Group-signalling requires a pgid that is (a) led by the child we spawned
    # (``pgid == proc.pid``) and (b) a safe, foreign target. A pgid that is
    # broadcast/own-group — however it arose (a bad owned_pgid, a recycled pid) —
    # is dropped here and cleanup falls back to signalling the child alone.
    owns_group = pgid is not None and pgid == proc.pid and _is_signallable_group(pgid)

    if proc.returncode is not None and not owns_group:
        return  # child-only cleanup and the child is already reaped

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

    async def _phase_wait(timeout: float) -> bool:
        """True once the leader is reaped AND its owned group is empty."""
        deadline = asyncio.get_running_loop().time() + timeout
        if proc.returncode is None:
            remaining = deadline - asyncio.get_running_loop().time()
            try:
                await asyncio.wait_for(proc.wait(), timeout=max(remaining, 0.05))
            except TimeoutError:
                return False
        while _group_alive():
            if asyncio.get_running_loop().time() >= deadline:
                return False
            await asyncio.sleep(0.05)
        return True

    _signal_tree(signal.SIGTERM)
    if await _phase_wait(grace):
        return
    # Leader, descendants, or both ignored TERM — SIGKILL the remainder even
    # though the leader may already be gone.
    _signal_tree(signal.SIGKILL)
    if not await _phase_wait(grace):
        log.warning("PID %d process tree did not exit after SIGKILL", proc.pid)


async def _read_lines_with_callback(
    proc: asyncio.subprocess.Process,
    timeout: int,
    on_output: OutputCallback,
    owned_pgid: int | None = None,
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
            await terminate_process_tree(proc, owned_pgid=owned_pgid)
    except TimeoutError:
        await terminate_process_tree(proc, owned_pgid=owned_pgid)
        return 1, f"Command timed out after {timeout} seconds"
    except asyncio.CancelledError:
        # Task cancellation (loop drain at shutdown/restart) must not leak
        # the child or its descendants past this process's lifetime.
        await terminate_process_tree(proc, owned_pgid=owned_pgid)
        raise
    output = "".join(lines)
    return proc.returncode or 0, _truncate_output(output)


async def run_local_command(
    command: str,
    timeout: int = 30,
    on_output: OutputCallback | None = None,
    cwd: str | None = None,
) -> tuple[int, str]:
    """Run a command locally via subprocess. Returns (exit_code, output).

    Used for localhost hosts — no SSH overhead, no key needed.
    When *on_output* is provided, stdout is streamed line-by-line to the
    callback in addition to being collected for the return value.

    *cwd* is the resolved local workspace (``tools.local_working_dir``). It only
    changes where a BARE RELATIVE path lands: explicit ``cd``, absolute paths,
    and ``git -C <path>`` are unaffected, so deliberately working inside the
    install remains possible. ``None`` inherits the process cwd — the
    pre-2026-07-27 behaviour, kept only for internal callers that legitimately
    depend on the application directory.
    """
    log.info("Local exec: %s", command)

    proc: asyncio.subprocess.Process | None = None
    try:
        # PWD/OLDPWD are normalized alongside cwd: cwd= alone leaves an
        # inherited OLDPWD pointing at the install, so a bare `cd -` would walk
        # right back into it (review finding, 2026-07-27).
        env = workspace_env(Path(cwd)) if cwd else None
        # start_new_session puts the shell at the head of its own process
        # group, so timeout/cancellation cleanup can take out descendants
        # (`sh -c 'x & ...'`) instead of just the shell leader.
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            start_new_session=True,
            cwd=cwd,
            env=env,
        )
        if on_output is not None:
            return await _read_lines_with_callback(proc, timeout, on_output, owned_pgid=proc.pid)
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        output = stdout.decode("utf-8", errors="replace")
        return proc.returncode or 0, _truncate_output(output)

    except TimeoutError:
        if proc is not None:
            await terminate_process_tree(proc, owned_pgid=proc.pid)
        return 1, f"Command timed out after {timeout} seconds"
    except asyncio.CancelledError:
        # Loop drain at shutdown/restart cancels in-flight commands; the
        # child tree must die with this process, not outlive the exec —
        # owned_pgid keeps the group signallable even when the shell already
        # exited naturally, leaving a descendant holding stdout.
        if proc is not None:
            await terminate_process_tree(proc, owned_pgid=proc.pid)
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
        ssh_args: list[str] = []
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
        pool_acquired = False
        try:
            if pool is not None:
                # Establish a foreground, asyncio-owned master before the
                # command. The lease survives every return/exception arm via
                # finally; release starts the configured idle-expiry timer.
                was_connected = pool.is_connected(host, ssh_user)
                pool_acquired = await pool.acquire(
                    host, ssh_key_path, known_hosts_path, ssh_user
                )
                ssh_args = pool.get_ssh_args(
                    host,
                    command,
                    ssh_key_path,
                    known_hosts_path,
                    ssh_user,
                    was_connected=was_connected,
                )
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

            if pool is not None:
                # Compatibility with a live socket inherited from the old
                # daemonizing pool during an in-place update. New explicit
                # masters are direct asyncio children and return immediately.
                await pool.ensure_master_registered(host, ssh_user)

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
            if pool is not None:
                # A legacy socket may still name a detached master; preserve
                # its positive registration evidence until it is replaced.
                await pool.ensure_master_registered(host, ssh_user)
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
        finally:
            if pool is not None and pool_acquired:
                pool.release(host, ssh_user)

    return last_exit_code, _truncate_output(last_output)


# Binary payloads must NEVER travel the text pipeline. run_local_command and
# run_ssh_command decode to str and truncate at MAX_OUTPUT_CHARS, so a
# base64-over-stdout read silently lost its tail: base64 crosses 16,000 chars
# at roughly 12,000 source bytes, and the caller got "Incorrect padding" for
# any ordinary PDF or image on a managed host (adversarial review of v3.65.1,
# reproduced with a valid 20,853-byte PDF). This path returns raw bytes with an
# explicit size bound and no truncation.
async def read_binary_file(
    address: str,
    path: str,
    *,
    max_bytes: int,
    ssh_key_path: str = "",
    known_hosts_path: str = "",
    ssh_user: str = "root",
    timeout: int = 60,
) -> tuple[bytes | None, str]:
    """Read a file as BYTES from a local or remote host.

    Returns ``(data, "")`` on success or ``(None, error_message)``. Oversize is
    an explicit error rather than a silent truncation, because a partial binary
    is indistinguishable from a corrupt one.
    """
    if max_bytes < 0:
        return None, "max_bytes must be >= 0"

    if is_local_address(address):
        def _read() -> tuple[bytes | None, str]:
            try:
                size = os.path.getsize(path)
            except OSError as exc:
                return None, f"cannot stat {path}: {exc}"
            if size > max_bytes:
                return None, f"file is {size} bytes, over the {max_bytes}-byte limit"
            try:
                with open(path, "rb") as handle:
                    return handle.read(max_bytes + 1), ""
            except OSError as exc:
                return None, f"cannot read {path}: {exc}"

        data, err = await asyncio.to_thread(_read)
        if err:
            return None, err
        if data is not None and len(data) > max_bytes:
            return None, f"file exceeds the {max_bytes}-byte limit"
        return data, ""

    # Remote: cap stdout at the SOURCE. `communicate()` buffers all output, so
    # `cat` followed by a post-read length check still let an arbitrarily large
    # remote file exhaust Odin's memory before being rejected. Reading exactly
    # max+1 bytes bounds the transport and preserves an unambiguous oversize
    # signal. `--` stops option parsing for option-like paths.
    quoted = shlex.quote(path)
    remote_command = f"head -c {max_bytes + 1} -- {quoted}"
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
        f"{ssh_user}@{address}",
        remote_command,
    ]
    log.info("SSH binary read from %s@%s: %s", ssh_user, address, path)
    proc: asyncio.subprocess.Process | None = None
    try:
        proc = await asyncio.create_subprocess_exec(
            *ssh_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError:
        if proc is not None:
            await terminate_process_tree(proc)
        return None, f"timed out reading {path} after {timeout}s"
    except asyncio.CancelledError:
        if proc is not None:
            await terminate_process_tree(proc)
        raise
    except OSError as exc:
        return None, f"ssh failed: {exc}"
    if proc.returncode != 0:
        detail = stderr.decode("utf-8", errors="replace").strip()[:200]
        return None, detail or f"remote read failed (exit {proc.returncode})"
    if len(stdout) > max_bytes:
        return None, f"file is over the {max_bytes}-byte limit"
    return stdout, ""
