from __future__ import annotations

import asyncio
import hashlib
import os
import re
import time
from pathlib import Path

from ..odin_log import get_logger

log = get_logger("ssh_pool")

_MASTER_PID_RE = re.compile(rb"pid=(\d+)")

DEFAULT_CONTROL_PERSIST = 60
DEFAULT_SOCKET_DIR = "/tmp/odin_ssh_sockets"


def _socket_path(
    socket_dir: str,
    host: str,
    ssh_user: str = "",
    target_id: str = "",
) -> str:
    """Socket path for a connection identity.

    Legacy direct callers retain their historical path. Registry-backed calls
    supply a stable host-generation id and get a bounded opaque path that never
    embeds operator-controlled endpoint text.
    """
    if not target_id:
        return os.path.join(socket_dir, f"{ssh_user}@{host}")
    digest = hashlib.sha256(target_id.encode("utf-8", "replace")).hexdigest()[:32]
    return os.path.join(socket_dir, f"host-{digest}")


class SSHConnectionPool:
    """Manages persistent SSH connections via OpenSSH ControlMaster.

    Masters are explicit foreground asyncio children. OpenSSH's built-in
    ``ControlPersist`` detachment double-forks; under Odin's child-subreaper
    containment its short-lived setsid intermediate is adopted after it has
    already exited, so neither transition observation nor ``ssh -O check``
    can positively identify it. Keeping the master in the foreground avoids
    that unobservable orphan entirely. This class implements the configured
    idle lifetime and closes/reaps the direct master itself.
    """

    def __init__(
        self,
        control_persist: int = DEFAULT_CONTROL_PERSIST,
        socket_dir: str = DEFAULT_SOCKET_DIR,
    ) -> None:
        self.control_persist = control_persist
        self.socket_dir = socket_dir
        self._connections: dict[str, float] = {}
        # Legacy/detached masters whose identity was captured by -O check.
        # Explicit masters below are direct asyncio children and do not need
        # adopted-zombie registration.
        self._registered_masters: dict[str, tuple[int, int]] = {}
        self._masters: dict[str, asyncio.subprocess.Process] = {}
        self._master_locks: dict[str, asyncio.Lock] = {}
        self._active_leases: dict[str, int] = {}
        self._expiry_tasks: dict[str, asyncio.Task] = {}
        self._total_reused: int = 0
        self._total_opened: int = 0
        os.makedirs(self.socket_dir, mode=0o700, exist_ok=True)

    def _key(self, host: str, ssh_user: str, target_id: str = "") -> str:
        return target_id or f"{ssh_user}@{host}"

    def _lock(self, key: str) -> asyncio.Lock:
        lock = self._master_locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._master_locks[key] = lock
        return lock

    def get_socket_path(self, host: str, ssh_user: str, target_id: str = "") -> str:
        return _socket_path(self.socket_dir, host, ssh_user, target_id)

    @staticmethod
    def _base_args(
        ssh_key_path: str,
        known_hosts_path: str,
        socket: str,
    ) -> list[str]:
        return [
            "ssh",
            "-i",
            ssh_key_path,
            "-o",
            f"UserKnownHostsFile={known_hosts_path}",
            "-o",
            "StrictHostKeyChecking=yes",
            "-o",
            "IdentitiesOnly=yes",
            "-o",
            "ConnectTimeout=10",
            "-o",
            "BatchMode=yes",
            "-o",
            f"ControlPath={socket}",
        ]

    def get_ssh_args(
        self,
        host: str,
        command: str,
        ssh_key_path: str,
        known_hosts_path: str,
        ssh_user: str = "root",
        *,
        was_connected: bool | None = None,
        port: int = 22,
        host_key_alias: str = "",
        target_id: str = "",
    ) -> list[str]:
        """Build SSH command args using an explicitly managed master.

        ``ControlPersist=no`` is a safety boundary, not an optimization
        toggle: if the explicit master disappears between acquisition and
        command spawn, ``ControlMaster=auto`` may temporarily make the
        command the master, but it must never daemonize and create an
        unattributable fast-double-fork zombie.
        """
        socket = self.get_socket_path(host, ssh_user, target_id)
        key = self._key(host, ssh_user, target_id)

        connected = (
            self.is_connected(host, ssh_user, target_id)
            if was_connected is None
            else was_connected
        )
        if connected:
            self._total_reused += 1
        else:
            self._total_opened += 1
            self._connections[key] = time.monotonic()

        return [
            *self._base_args(ssh_key_path, known_hosts_path, socket),
            "-p",
            str(port),
            *(["-o", f"HostKeyAlias={host_key_alias}"] if host_key_alias else []),
            "-o",
            "ControlMaster=auto",
            "-o",
            "ControlPersist=no",
            f"{ssh_user}@{host}",
            command,
        ]

    def is_connected(self, host: str, ssh_user: str, target_id: str = "") -> bool:
        """Check if a ControlMaster socket exists for this host."""
        socket = self.get_socket_path(host, ssh_user, target_id)
        return os.path.exists(socket)

    def _cancel_expiry(self, key: str) -> None:
        task = self._expiry_tasks.pop(key, None)
        if task is not None and task is not asyncio.current_task():
            task.cancel()

    async def _stop_process(self, proc: asyncio.subprocess.Process) -> None:
        """Boundedly stop and reap one explicit master/probe child."""
        if proc.returncode is None:
            try:
                proc.terminate()
            except (OSError, ProcessLookupError):
                pass
        try:
            await asyncio.wait_for(proc.wait(), timeout=3)
            return
        except TimeoutError:
            pass
        if proc.returncode is None:
            try:
                proc.kill()
            except (OSError, ProcessLookupError):
                pass
        try:
            await asyncio.wait_for(proc.wait(), timeout=3)
        except (TimeoutError, OSError, ProcessLookupError):
            pass

    async def _start_explicit_master(
        self,
        host: str,
        ssh_key_path: str,
        known_hosts_path: str,
        ssh_user: str,
        *,
        port: int = 22,
        host_key_alias: str = "",
        target_id: str = "",
    ) -> bool:
        """Start a non-daemonizing ControlMaster and wait for its socket."""
        key = self._key(host, ssh_user, target_id)
        socket = self.get_socket_path(host, ssh_user, target_id)
        proc = self._masters.get(key)
        if proc is not None and proc.returncode is None and os.path.exists(socket):
            return True
        if proc is not None:
            await self._stop_process(proc)
            self._masters.pop(key, None)

        # A socket without our direct live master may be a legacy master from
        # the previous implementation. It remains usable and is handled by
        # ensure_master_registered(); never start a competing master on it.
        if os.path.exists(socket):
            return True

        proc = await asyncio.create_subprocess_exec(
            *self._base_args(ssh_key_path, known_hosts_path, socket),
            "-p",
            str(port),
            *(["-o", f"HostKeyAlias={host_key_alias}"] if host_key_alias else []),
            "-o",
            "ControlMaster=yes",
            "-o",
            "ControlPersist=no",
            "-N",
            f"{ssh_user}@{host}",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        deadline = asyncio.get_running_loop().time() + 12.0
        try:
            while asyncio.get_running_loop().time() < deadline:
                if proc.returncode is not None:
                    await proc.wait()
                    return False
                if os.path.exists(socket):
                    self._masters[key] = proc
                    self._connections[key] = time.monotonic()
                    return True
                await asyncio.sleep(0.05)
        except asyncio.CancelledError:
            await self._stop_process(proc)
            raise
        await self._stop_process(proc)
        return False

    async def acquire(
        self,
        host: str,
        ssh_key_path: str,
        known_hosts_path: str,
        ssh_user: str = "root",
        *,
        port: int = 22,
        host_key_alias: str = "",
        target_id: str = "",
    ) -> bool:
        """Acquire one active-use lease, establishing a direct master.

        Returns False when the master could not be established. The caller
        may still execute safely: command args use ``ControlPersist=no`` and
        therefore cannot create the leaking daemonization shape.
        """
        key = self._key(host, ssh_user, target_id)
        async with self._lock(key):
            self._cancel_expiry(key)
            ready = await self._start_explicit_master(
                host,
                ssh_key_path,
                known_hosts_path,
                ssh_user,
                port=port,
                host_key_alias=host_key_alias,
                target_id=target_id,
            )
            if ready:
                self._active_leases[key] = self._active_leases.get(key, 0) + 1
            return ready

    def release(self, host: str, ssh_user: str = "root", target_id: str = "") -> None:
        """Release an active-use lease and arm the configured idle expiry."""
        key = self._key(host, ssh_user, target_id)
        active = self._active_leases.get(key, 0)
        if active <= 1:
            self._active_leases.pop(key, None)
            self._cancel_expiry(key)
            self._expiry_tasks[key] = asyncio.create_task(
                self._expire_after_idle(host, ssh_user, target_id),
                name=f"ssh-master-expiry:{key}",
            )
        else:
            self._active_leases[key] = active - 1

    async def _expire_after_idle(self, host: str, ssh_user: str, target_id: str = "") -> None:
        key = self._key(host, ssh_user, target_id)
        try:
            await asyncio.sleep(max(0, self.control_persist))
            if self._active_leases.get(key, 0) == 0:
                await self.close_host(host, ssh_user, target_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Failed to expire SSH master %s", key)
        finally:
            if self._expiry_tasks.get(key) is asyncio.current_task():
                self._expiry_tasks.pop(key, None)

    async def ensure_master_registered(self, host: str, ssh_user: str = "root") -> bool:
        """Register a live legacy/detached ControlMaster as ours-to-reap.

        New masters are foreground asyncio children and need no registration.
        This compatibility path covers a live socket inherited from the old
        implementation during a rolling/in-place update.
        """
        from .process_manager import (
            _proc_live_starttime,
            _proc_starttime,
            register_reap_identity,
        )

        key = self._key(host, ssh_user)
        direct = self._masters.get(key)
        if direct is not None and direct.returncode is None:
            return True
        recorded = self._registered_masters.get(key)
        if recorded is not None:
            pid, start = recorded
            if _proc_live_starttime(pid) == start:
                register_reap_identity(pid, start, source=f"ssh-master:{key}")
                return True
            self._registered_masters.pop(key, None)
        socket = self.get_socket_path(host, ssh_user)
        if not os.path.exists(socket):
            return False
        proc = None
        try:
            proc = await asyncio.create_subprocess_exec(
                "ssh",
                "-o",
                f"ControlPath={socket}",
                "-O",
                "check",
                f"{ssh_user}@{host}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
        except asyncio.CancelledError:
            if proc is not None:
                try:
                    proc.kill()
                    await proc.wait()
                except (OSError, ProcessLookupError):
                    pass
            raise
        except Exception:
            if proc is not None:
                try:
                    proc.kill()
                    await proc.wait()
                except (OSError, ProcessLookupError):
                    pass
            return False
        match = _MASTER_PID_RE.search(out)
        if match is None:
            return False
        pid = int(match.group(1))
        try:
            comm = Path(f"/proc/{pid}/comm").read_bytes().strip()
        except OSError:
            return False
        if comm != b"ssh":
            return False
        master_start = _proc_starttime(pid)
        if master_start is None:
            return False
        register_reap_identity(pid, master_start, source=f"ssh-master:{key}")
        self._registered_masters[key] = (pid, master_start)
        log.debug(
            "Registered legacy ControlMaster %s (pid=%d) with the zombie reaper",
            key,
            pid,
        )
        return True

    def get_active_hosts(self) -> list[str]:
        """Return list of host keys with active sockets."""
        active: list[str] = []
        for key in self._connections:
            if "@" in key:
                ssh_user, host = key.split("@", 1)
                socket = _socket_path(self.socket_dir, host, ssh_user)
            else:
                socket = _socket_path(self.socket_dir, "", target_id=key)
            if os.path.exists(socket):
                active.append(key)
        return active

    async def close_host(
        self, host: str, ssh_user: str = "root", target_id: str = ""
    ) -> bool:
        """Explicitly close and reap a ControlMaster connection."""
        socket = self.get_socket_path(host, ssh_user, target_id)
        key = self._key(host, ssh_user, target_id)
        async with self._lock(key):
            self._cancel_expiry(key)
            master = self._masters.pop(key, None)
            had_connection = os.path.exists(socket) or master is not None
            if os.path.exists(socket):
                proc = None
                try:
                    proc = await asyncio.create_subprocess_exec(
                        "ssh",
                        "-o",
                        f"ControlPath={socket}",
                        "-O",
                        "exit",
                        f"{ssh_user}@{host}",
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                    await asyncio.wait_for(proc.communicate(), timeout=5)
                except asyncio.CancelledError:
                    if proc is not None:
                        await self._stop_process(proc)
                    raise
                except TimeoutError:
                    if proc is not None:
                        try:
                            proc.kill()
                        except (OSError, ProcessLookupError):
                            pass
                        try:
                            await asyncio.wait_for(proc.wait(), timeout=3)
                        except (TimeoutError, OSError, ProcessLookupError):
                            pass
                except Exception:
                    if proc is not None:
                        await self._stop_process(proc)
            if master is not None:
                try:
                    await asyncio.wait_for(master.wait(), timeout=5)
                except TimeoutError:
                    await self._stop_process(master)
            try:
                os.unlink(socket)
            except OSError:
                pass
            self._connections.pop(key, None)
            self._active_leases.pop(key, None)
            if had_connection:
                log.info("Closed SSH connection to %s@%s", ssh_user, host)
            return had_connection

    async def close_target(self, target) -> bool:
        return await self.close_host(
            target.address, target.ssh_user, target.runtime_key
        )

    async def close_all(self) -> int:
        """Close all active ControlMaster connections. Returns count closed."""
        closed = 0
        keys = set(self._connections) | set(self._masters) | set(self._expiry_tasks)
        for key in list(keys):
            if "@" in key:
                ssh_user, host = key.split("@", 1)
                target_id = ""
            else:
                ssh_user, host, target_id = "invalid", "invalid", key
            if await self.close_host(host, ssh_user, target_id):
                closed += 1
        return closed

    def get_metrics(self) -> dict:
        """Return pool metrics for observability."""
        active = self.get_active_hosts()
        return {
            "active_connections": len(active),
            "active_hosts": active,
            "total_opened": self._total_opened,
            "total_reused": self._total_reused,
            "control_persist": self.control_persist,
            "socket_dir": self.socket_dir,
        }

    def get_prometheus_metrics(self) -> dict:
        """Return flat metrics dict for Prometheus collector."""
        active = len(self.get_active_hosts())
        return {
            "ssh_pool_active_connections": active,
            "ssh_pool_total_opened": self._total_opened,
            "ssh_pool_total_reused": self._total_reused,
        }
