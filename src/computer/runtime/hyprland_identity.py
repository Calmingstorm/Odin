"""Hyprland peer/process identity. Recognition alone is not input admission."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import socket
import stat
import struct
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from ..models import ComputerError


class HyprlandIdentityError(ComputerError):
    """Static failure codes only; never include socket paths or private replies."""


@dataclass(frozen=True)
class ExecutableTrust:
    """An explicitly approved build, not approval learned from the peer."""

    path: str
    sha256: str
    version: str
    commit: str
    owner_uid: int = 0

    def __post_init__(self):
        if (
            type(self.path) is not str or not self.path.startswith("/")
            or any(ord(c) < 32 for c in self.path)
            or type(self.sha256) is not str
            or not re.fullmatch(r"[0-9a-f]{64}", self.sha256)
            or type(self.version) is not str
            or not re.fullmatch(r"[A-Za-z0-9.+_~-]{1,128}", self.version)
            or type(self.commit) is not str
            or not re.fullmatch(r"[0-9a-f]{40,64}", self.commit)
            or type(self.owner_uid) is not int or self.owner_uid < 0
        ):
            raise HyprlandIdentityError("hyprland_explicit_build_trust_required")


@dataclass(frozen=True)
class ProcessPin:
    pid: int
    uid: int
    start_ticks: int
    boot_id: str
    device: int
    inode: int
    size: int
    mtime_ns: int
    ctime_ns: int
    sha256: str


@dataclass(frozen=True)
class HyprlandIdentity:
    process: ProcessPin
    trust: ExecutableTrust

    @property
    def digest(self) -> str:
        return hashlib.sha256(
            json.dumps(asdict(self), sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()


def remaining(deadline: float) -> float:
    left = deadline - time.monotonic()
    if left <= 0:
        raise HyprlandIdentityError("hyprland_identity_deadline")
    return left


def _proc_start(pid: int, uid: int) -> int:
    text = Path(f"/proc/{pid}/stat").read_text()
    fields = text[text.rindex(")") + 2 :].split()
    if fields[0] in {"Z", "X"} or os.stat(f"/proc/{pid}").st_uid != uid:
        raise HyprlandIdentityError("hyprland_process_changed")
    return int(fields[19])


def measure_process(pid: int, uid: int, trust: ExecutableTrust, deadline: float) -> ProcessPin:
    """Pin the actual executable inode, with bounded hashing and process rechecks."""
    try:
        if type(pid) is not int or pid <= 1 or type(uid) is not int or uid < 0:
            raise HyprlandIdentityError("hyprland_invalid_expected_peer")
        remaining(deadline)
        start = _proc_start(pid, uid)
        path = f"/proc/{pid}/exe"
        if os.readlink(path) != trust.path:
            raise HyprlandIdentityError("hyprland_executable_untrusted")
        fd = os.open(path, os.O_RDONLY | os.O_CLOEXEC)
        try:
            before = os.fstat(fd)
            if (
                not stat.S_ISREG(before.st_mode) or before.st_uid != trust.owner_uid
                or before.st_mode & 0o022 or not 0 < before.st_size <= 256 * 1024 * 1024
            ):
                raise HyprlandIdentityError("hyprland_executable_untrusted")
            digest = hashlib.sha256()
            total = 0
            while block := os.read(fd, 1024 * 1024):
                remaining(deadline)
                total += len(block)
                if total > before.st_size:
                    raise HyprlandIdentityError("hyprland_executable_changed")
                digest.update(block)
            after, current = os.fstat(fd), os.stat(path)
            keys = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
            if (
                any(getattr(before, k) != getattr(after, k) for k in keys)
                or any(getattr(before, k) != getattr(current, k) for k in keys)
                or total != before.st_size or digest.hexdigest() != trust.sha256
                or os.readlink(path) != trust.path or _proc_start(pid, uid) != start
            ):
                raise HyprlandIdentityError("hyprland_executable_changed")
            remaining(deadline)
            return ProcessPin(
                pid, uid, start, Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
                before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns,
                before.st_ctime_ns, digest.hexdigest(),
            )
        finally:
            os.close(fd)
    except HyprlandIdentityError:
        raise
    except (OSError, ValueError, IndexError, TypeError):
        raise HyprlandIdentityError("hyprland_identity_unavailable") from None


def peer_credentials(connection: socket.socket) -> tuple[int, int]:
    try:
        pid, uid, _gid = struct.unpack(
            "3i", connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)
        )
        if pid <= 1 or uid < 0:
            raise ValueError
        return pid, uid
    except (OSError, ValueError, struct.error):
        raise HyprlandIdentityError("hyprland_peer_unavailable") from None


async def connect_peer(path: str, pid: int, uid: int, deadline: float) -> socket.socket:
    if (
        type(path) is not str or not path.startswith("/")
        or any(ord(c) < 32 for c in path) or len(os.fsencode(path)) > 107
    ):
        raise HyprlandIdentityError("hyprland_explicit_socket_required")
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.setblocking(False)
    try:
        await asyncio.wait_for(
            asyncio.get_running_loop().sock_connect(connection, path), remaining(deadline)
        )
        if peer_credentials(connection) != (pid, uid):
            raise HyprlandIdentityError("hyprland_peer_mismatch")
        return connection
    except BaseException:
        connection.close()
        raise


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError
        result[key] = value
    return result


async def _version(connection: socket.socket, trust: ExecutableTrust, deadline: float):
    loop = asyncio.get_running_loop()
    await asyncio.wait_for(loop.sock_sendall(connection, b"j/version"), remaining(deadline))
    reply = bytearray()
    while True:
        chunk = await asyncio.wait_for(loop.sock_recv(connection, 4096), remaining(deadline))
        if not chunk:
            break
        reply.extend(chunk)
        if len(reply) > 16384:
            raise HyprlandIdentityError("hyprland_version_reply_invalid")
    try:
        value = json.loads(reply, object_pairs_hook=_unique_object)
        if (
            type(value) is not dict or value.get("version") != trust.version
            or value.get("commit") != trust.commit
        ):
            raise ValueError
    except (ValueError, UnicodeError, RecursionError):
        raise HyprlandIdentityError("hyprland_version_reply_invalid") from None


async def pin_connections(
    *, wayland_path: str, ipc_path: str, expected_pid: int, expected_uid: int,
    trust: ExecutableTrust, timeout_seconds: float = 3.0,
) -> tuple[HyprlandIdentity, socket.socket]:
    """Return an owned Wayland socket after cross-channel pinning; caller closes it.

    This does not authorize capture/input or establish lock state or scope.
    """
    if (
        type(timeout_seconds) not in {int, float} or not 0 < timeout_seconds <= 30
        or type(trust) is not ExecutableTrust
    ):
        raise HyprlandIdentityError("hyprland_identity_invalid_budget")
    deadline = time.monotonic() + timeout_seconds
    wayland = ipc = None
    try:
        before = await asyncio.to_thread(
            measure_process, expected_pid, expected_uid, trust, deadline
        )
        wayland = await connect_peer(wayland_path, expected_pid, expected_uid, deadline)
        ipc = await connect_peer(ipc_path, expected_pid, expected_uid, deadline)
        await _version(ipc, trust, deadline)
        after = await asyncio.to_thread(
            measure_process, expected_pid, expected_uid, trust, deadline
        )
        if before != after or peer_credentials(wayland) != (expected_pid, expected_uid):
            raise HyprlandIdentityError("hyprland_process_changed")
        result, wayland = wayland, None
        return HyprlandIdentity(before, trust), result
    except (OSError, TimeoutError):
        raise HyprlandIdentityError("hyprland_identity_transport_failed") from None
    finally:
        if ipc is not None:
            ipc.close()
        if wayland is not None:
            wayland.close()


async def revalidate(identity: HyprlandIdentity, deadline: float) -> None:
    if await asyncio.to_thread(
        measure_process, identity.process.pid, identity.process.uid, identity.trust, deadline
    ) != identity.process:
        raise HyprlandIdentityError("hyprland_process_changed")
