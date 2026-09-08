"""Compositor identity measured from authenticated scope, EIS peer and mapped files."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import stat
from dataclasses import asdict, dataclass
from pathlib import Path

from ..admission import CompositorIdentity
from ..models import ComputerError


class WaylandIdentityError(ComputerError):
    """Safe static identity failure."""


@dataclass(frozen=True)
class CompositorAdapter:
    name: str
    executable: str
    bus_name: str
    library_prefix: str
    minimum_version: tuple[int, int] = (0, 0)


# Recognition is not admission: fresh authenticated scope and trial are required.
COMPOSITOR_REGISTRY = (
    CompositorAdapter("gnome-shell", "/usr/bin/gnome-shell", "org.gnome.Shell", "libmutter-"),
    CompositorAdapter("kwin_wayland", "/usr/bin/kwin_wayland", "org.kde.KWin", "libkwin", (6, 1)),
)


def compositor_adapter(executable: str, version: str) -> CompositorAdapter:
    if executable in {"/usr/bin/sway", "/usr/bin/wayfire", "/usr/bin/labwc"}:
        raise WaylandIdentityError("portal_remotedesktop_eis_unavailable")
    if executable in {"/usr/bin/Hyprland", "/usr/bin/hyprland"}:
        raise WaylandIdentityError("hyprland_remote_portal_unqualified")
    adapter = next((item for item in COMPOSITOR_REGISTRY if item.executable == executable), None)
    if adapter is None:
        raise WaylandIdentityError("wayland_compositor_executable_unqualified")
    if adapter.minimum_version != (0, 0):
        match = re.fullmatch(r"(\d+)\.(\d+)(?:\.\d+)?(?:[-+~][A-Za-z0-9.+~_-]+)?", version)
        if not match or tuple(map(int, match.group(1, 2))) < adapter.minimum_version:
            raise WaylandIdentityError("kwin_connect_to_eis_requires_6_1")
    return adapter


@dataclass(frozen=True)
class MappedObject:
    path: str
    device: str
    inode: int
    sha256: str


@dataclass(frozen=True)
class CompositorRuntimeIdentity:
    pid: int
    start_ticks: int
    uid: int
    boot_id: str
    session_id: int
    compositor_name: str
    version: str
    backend: str
    executable: MappedObject
    libraries: tuple[MappedObject, ...]
    shell_owner: str
    eis_peer_pid: int
    eis_peer_uid: int

    @property
    def binding_digest(self) -> str:
        return hashlib.sha256(
            json.dumps(asdict(self), sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()

    def public(self) -> CompositorIdentity:
        return CompositorIdentity(
            self.compositor_name, self.version, self.backend, self.binding_digest
        )


def _process(pid: int) -> tuple[int, int, int]:
    text = Path(f"/proc/{pid}/stat").read_text()
    fields = text[text.rindex(")") + 2 :].split()
    if fields[0] == "Z":
        raise WaylandIdentityError("wayland_compositor_exited")
    return int(fields[19]), int(fields[3]), os.stat(f"/proc/{pid}").st_uid


def _device(value: int) -> str:
    return f"{os.major(value):x}:{os.minor(value):x}"


def _hash_object(path: str, device: str, inode: int, *, proc_path: str) -> MappedObject:
    fd = os.open(proc_path, os.O_RDONLY | os.O_CLOEXEC)
    try:
        before = os.fstat(fd)
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_ino != inode
            or _device(before.st_dev) != device
            or before.st_size > 256 * 1024 * 1024
            or before.st_uid != 0
            or before.st_mode & 0o022
        ):
            raise WaylandIdentityError("wayland_mapped_object_untrusted_or_replaced")
        digest = hashlib.sha256()
        while block := os.read(fd, 1024 * 1024):
            digest.update(block)
        after = os.fstat(fd)
        if (
            before.st_dev,
            before.st_ino,
            before.st_size,
            before.st_mtime_ns,
            before.st_ctime_ns,
        ) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise WaylandIdentityError("wayland_mapped_object_changed")
        return MappedObject(path, device, inode, digest.hexdigest())
    finally:
        os.close(fd)


def _capture(scope: dict, eis_peer: dict) -> CompositorRuntimeIdentity:
    try:
        pid, uid = scope["pid"], scope["uid"]
        if (
            type(pid) is not int
            or pid <= 1
            or type(uid) is not int
            or uid < 0
            or eis_peer.get("pid") != pid
            or eis_peer.get("uid") != uid
            or not isinstance(scope.get("owner"), str)
            or not scope["owner"].startswith(":")
        ):
            raise WaylandIdentityError("wayland_eis_compositor_peer_mismatch")
        before = _process(pid)
        if before[2] != uid:
            raise WaylandIdentityError("wayland_compositor_uid_changed")
        claimed_start = scope.get("start_ticks", scope.get("start_time"))
        if claimed_start is not None and claimed_start != before[0]:
            raise WaylandIdentityError("wayland_compositor_start_changed")
        version = scope.get("compositor_version", scope.get("version"))
        backend = scope.get("backend")
        if (
            backend not in {"native", "x11-nested"}
            or type(version) is not str
            or not version
            or len(version) > 160
            or any(ord(c) < 32 for c in version)
        ):
            raise WaylandIdentityError("wayland_compositor_backend_unidentified")
        executable_path = os.readlink(f"/proc/{pid}/exe")
        adapter = compositor_adapter(executable_path, version)
        if scope.get("compositor_name", adapter.name) != adapter.name:
            raise WaylandIdentityError("wayland_compositor_name_mismatch")
        executable_stat = os.stat(f"/proc/{pid}/exe")
        executable = _hash_object(
            executable_path,
            _device(executable_stat.st_dev),
            executable_stat.st_ino,
            proc_path=f"/proc/{pid}/exe",
        )
        mapped = {}
        for line in Path(f"/proc/{pid}/maps").read_text().splitlines():
            fields = line.split(None, 5)
            if len(fields) < 6 or not fields[5].startswith("/"):
                continue
            _address, _perms, _offset, device, inode_text, path = fields
            name = path.rsplit("/", 1)[-1]
            if not (
                name.startswith(
                    (
                        "libmutter",
                        "libkwin",
                        "libei",
                        "libeis",
                        "libxkbcommon",
                        "libinput",
                        "libEGL",
                        "libGL",
                        "libgbm",
                        "libdrm",
                    )
                )
                or path.endswith("/kwin/plugins/eis.so")
                or "_dri.so" in name
                or "nvidia" in name
            ):
                continue
            if path.endswith(" (deleted)") or int(inode_text) <= 0:
                raise WaylandIdentityError("wayland_mapped_object_deleted")
            major, minor = device.split(":")
            device = f"{int(major, 16):x}:{int(minor, 16):x}"
            key = (path, device, int(inode_text))
            if key not in mapped:
                mapped[key] = _hash_object(
                    path, device, int(inode_text), proc_path=f"/proc/{pid}/root{path}"
                )
        if not any(Path(x.path).name.startswith(adapter.library_prefix) for x in mapped.values()):
            code = (
                "wayland_mutter_mapping_unavailable"
                if adapter.name == "gnome-shell"
                else "wayland_kwin_mapping_unavailable"
            )
            raise WaylandIdentityError(code)
        if _process(pid) != before:
            raise WaylandIdentityError("wayland_compositor_identity_changed")
        from .recovery import boot_id

        return CompositorRuntimeIdentity(
            pid,
            before[0],
            uid,
            boot_id(),
            before[1],
            adapter.name,
            version,
            backend,
            executable,
            tuple(sorted(mapped.values(), key=lambda x: x.path)),
            scope["owner"],
            pid,
            uid,
        )
    except WaylandIdentityError:
        raise
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        raise WaylandIdentityError("wayland_compositor_identity_unavailable") from None


async def capture_identity(scope: dict, eis_peer: dict) -> CompositorRuntimeIdentity:
    return await asyncio.to_thread(_capture, scope, eis_peer)


async def revalidate_identity(
    identity: CompositorRuntimeIdentity, scope: dict, eis_peer: dict
) -> bool:
    try:
        return (await capture_identity(scope, eis_peer)) == identity
    except WaylandIdentityError:
        return False
