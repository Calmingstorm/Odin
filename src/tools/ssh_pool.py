from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path

from ..odin_log import get_logger

log = get_logger("ssh_pool")

DEFAULT_CONTROL_PERSIST = 60
DEFAULT_SOCKET_DIR = "/tmp/odin_ssh_sockets"


def _socket_path(socket_dir: str, host: str, ssh_user: str) -> str:
    return os.path.join(socket_dir, f"{ssh_user}@{host}")


class SSHConnectionPool:
    """Manages persistent SSH connections via OpenSSH ControlMaster.

    Each unique (host, ssh_user) pair gets a single multiplexed master
    connection. Subsequent SSH commands to the same host reuse the
    existing TCP connection — no new handshake, key exchange, or auth.
    """

    def __init__(
        self,
        control_persist: int = DEFAULT_CONTROL_PERSIST,
        socket_dir: str = DEFAULT_SOCKET_DIR,
    ) -> None:
        self.control_persist = control_persist
        self.socket_dir = socket_dir
        self._connections: dict[str, float] = {}
        self._total_reused: int = 0
        self._total_opened: int = 0
        os.makedirs(self.socket_dir, mode=0o700, exist_ok=True)

    def _key(self, host: str, ssh_user: str) -> str:
        return f"{ssh_user}@{host}"

    def get_socket_path(self, host: str, ssh_user: str) -> str:
        return _socket_path(self.socket_dir, host, ssh_user)

    def get_ssh_args(
        self,
        host: str,
        command: str,
        ssh_key_path: str,
        known_hosts_path: str,
        ssh_user: str = "root",
    ) -> list[str]:
        """Build SSH command args with ControlMaster multiplexing."""
        socket = self.get_socket_path(host, ssh_user)
        key = self._key(host, ssh_user)

        if self.is_connected(host, ssh_user):
            self._total_reused += 1
        else:
            self._total_opened += 1
            self._connections[key] = time.monotonic()

        return [
            "ssh",
            "-i", ssh_key_path,
            "-o", f"UserKnownHostsFile={known_hosts_path}",
            "-o", "StrictHostKeyChecking=yes",
            "-o", "ConnectTimeout=10",
            "-o", "BatchMode=yes",
            "-o", "ControlMaster=auto",
            "-o", f"ControlPath={socket}",
            "-o", f"ControlPersist={self.control_persist}",
            f"{ssh_user}@{host}",
            command,
        ]

    def is_connected(self, host: str, ssh_user: str) -> bool:
        """Check if a ControlMaster socket exists for this host."""
        socket = self.get_socket_path(host, ssh_user)
        return os.path.exists(socket)

    def get_active_hosts(self) -> list[str]:
        """Return list of host keys with active sockets."""
        return [
            key for key in self._connections
            if os.path.exists(os.path.join(self.socket_dir, key))
        ]

    async def close_host(self, host: str, ssh_user: str = "root") -> bool:
        """Explicitly close a ControlMaster connection for a host."""
        socket = self.get_socket_path(host, ssh_user)
        key = self._key(host, ssh_user)

        if not os.path.exists(socket):
            self._connections.pop(key, None)
            return False

        try:
            proc = await asyncio.create_subprocess_exec(
                "ssh", "-o", f"ControlPath={socket}", "-O", "exit",
                f"{ssh_user}@{host}",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.communicate(), timeout=5)
            self._connections.pop(key, None)
            log.info("Closed SSH connection to %s@%s", ssh_user, host)
            return True
        except Exception as e:
            log.warning("Failed to close SSH connection to %s@%s: %s", ssh_user, host, e)
            # Try removing the socket file as fallback
            try:
                os.unlink(socket)
            except OSError:
                pass
            self._connections.pop(key, None)
            return False

    async def close_all(self) -> int:
        """Close all active ControlMaster connections. Returns count closed."""
        closed = 0
        for key in list(self._connections):
            parts = key.split("@", 1)
            if len(parts) == 2:
                ssh_user, host = parts
                if await self.close_host(host, ssh_user):
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
