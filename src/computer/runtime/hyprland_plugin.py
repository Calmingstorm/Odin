"""Pinned, native-only Hyprland plugin lifecycle primitives.

This module deliberately does not discover a session, run ``hyprctl``, or open
an ambient socket.  Its caller supplies an already authenticated, compositor-
pinned IPC adapter.  Until the native plugin exposes an instance-scoped endpoint
which can prove its peer and executing image, activation remains blocked after
the (owner-authorised) load attempt rather than pretending an on-disk ELF is
the mapped ELF.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import stat
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .hyprland_identity import HyprlandIdentity, _unique_object, connect_peer, revalidate

_DIGEST = re.compile(r"[0-9a-f]{64}\Z")
_COMMIT = re.compile(r"[0-9a-f]{40,64}\Z")
_BUILD_ID = re.compile(r"[0-9a-f]{64}\Z")
_MANIFEST_MAX_BYTES = 16 * 1024


class HyprlandPluginError(RuntimeError):
    """Static lifecycle failure code.  Do not put paths or peer replies here."""


@dataclass(frozen=True)
class _TrustedPluginManifest:
    """Private validator output, never an operator/model supplied dictionary."""

    path: str
    approval: PluginApproval


def read_trusted_plugin_manifest(manifest_path: str) -> _TrustedPluginManifest:
    """Read one root-owned identity and derive its sibling content-addressed ELF."""
    if type(manifest_path) is not str or not manifest_path:
        raise HyprlandPluginError("hyprland_plugin_manifest_required")
    path = Path(manifest_path)
    if not path.is_absolute() or ".." in path.parts:
        raise HyprlandPluginError("hyprland_plugin_manifest_untrusted")
    try:
        components = (Path("/"), *reversed(path.parents[:-1]), path)
        for component in components:
            item = os.lstat(component)
            if (stat.S_ISLNK(item.st_mode) or item.st_uid != 0 or item.st_mode & 0o022
                    or (component != path and not stat.S_ISDIR(item.st_mode))):
                raise ValueError
        item = os.lstat(path)
        if not stat.S_ISREG(item.st_mode) or item.st_uid != 0 or item.st_mode & 0o022:
            raise ValueError
        fd = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
        try:
            before = os.fstat(fd)
            raw = os.read(fd, _MANIFEST_MAX_BYTES + 1)
            after, current = os.fstat(fd), os.lstat(path)
        finally:
            os.close(fd)
        identity_keys = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
        if (len(raw) > _MANIFEST_MAX_BYTES
                or any(getattr(before, key) != getattr(after, key) for key in identity_keys)
                or any(getattr(before, key) != getattr(current, key) for key in identity_keys)):
            raise ValueError
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object)
        required = {"schema", "hyprland_version", "hyprland_commit", "runtime_qualified",
                    "companion_build_id", "plugin_sha256", "plugin_filename"}
        optional = {
            "wayland_protocols_version", "wayland_protocols_commit",
            "hyprwayland_scanner_commit", "runtime_loaded",
        }
        if (
            type(value) is not dict or not required <= set(value)
            or set(value) - required - optional
            or type(value["schema"]) is not int or value["schema"] != 1
            or value["runtime_qualified"] is not True
        ):
            raise ValueError
        filename = value["plugin_filename"]
        if type(filename) is not str or not re.fullmatch(
            r"odin-hyprland-scope-[0-9a-f]{64}\.so", filename
        ):
            raise ValueError
        artifact = str(path.parent / filename)
        # Compilation and mapped-image identity are not runtime qualification.
        # A provisioned qualification record must explicitly approve this tuple.
        approval = PluginApproval.from_manifest(artifact, value)
        approval.verify_artifact(approved_root=str(path.parent))
        return _TrustedPluginManifest(artifact, approval)
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError, HyprlandPluginError):
        raise HyprlandPluginError("hyprland_plugin_manifest_invalid") from None


class NativePluginIPC(Protocol):
    """Authenticated IPC to the exact compositor already pinned by identity."""

    async def loaded_plugins(self) -> tuple[str, ...]: ...

    async def load_fixed_plugin(self, path: str) -> None: ...

    async def plugin_instance_status(self, path: str) -> str: ...

class HyprlandPluginIPC:
    """Narrow authenticated adapter for Hyprland's command socket.

    This is deliberately not a general hyprctl wrapper.  The only writes it can
    issue are the fixed plugin-load grammar for the already approved pathname.
    """
    def __init__(self, *, identity: HyprlandIdentity, ipc_path: str) -> None:
        if not isinstance(identity, HyprlandIdentity) or type(ipc_path) is not str:
            raise HyprlandPluginError("hyprland_plugin_identity_required")
        self.identity, self.ipc_path = identity, ipc_path

    async def _request(self, command: bytes) -> bytes:
        deadline = time.monotonic() + 0.5
        connection = await connect_peer(self.ipc_path, self.identity.process.pid,
                                        self.identity.process.uid, deadline)
        try:
            await revalidate(self.identity, deadline)
            loop = asyncio.get_running_loop()
            await asyncio.wait_for(
                loop.sock_sendall(connection, command), deadline - time.monotonic())
            data = bytearray()
            while True:
                chunk = await asyncio.wait_for(
                    loop.sock_recv(connection, 4096), deadline - time.monotonic())
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > 16384:
                    raise HyprlandPluginError("hyprland_plugin_reply_invalid")
            await revalidate(self.identity, deadline)
            return bytes(data)
        except HyprlandPluginError:
            raise
        except (OSError, TimeoutError, ValueError):
            raise HyprlandPluginError("hyprland_plugin_ipc_unavailable") from None
        finally:
            connection.close()

    async def loaded_plugins(self) -> tuple[str, ...]:
        try:
            value = json.loads(await self._request(b"j/plugins"), object_pairs_hook=_unique_object)
            rows = value.get("plugins") if type(value) is dict else None
            if type(rows) is not list or len(rows) > 128:
                raise ValueError
            result = []
            for row in rows:
                path = row.get("path") if type(row) is dict else None
                if type(path) is not str or not path.startswith("/") or len(path) > 4096:
                    raise ValueError
                result.append(path)
            return tuple(result)
        except (ValueError, TypeError, UnicodeError, RecursionError):
            raise HyprlandPluginError("hyprland_plugin_reply_invalid") from None

    async def load_fixed_plugin(self, path: str) -> None:
        if type(path) is not str or not path.startswith("/") or "\x00" in path or "\n" in path:
            raise HyprlandPluginError("hyprland_plugin_command_refused")
        # Hyprland's plugin command endpoint accepts this exact command grammar.
        reply = await self._request(b"plugin load " + path.encode("ascii"))
        if len(reply) > 1024 or reply.strip() not in {b"ok", b"OK"}:
            raise HyprlandPluginError("hyprland_plugin_load_unconfirmed")

    async def plugin_instance_status(self, path: str) -> str:
        """Read the companion's instance-scoped build identity, never a digest claim."""
        if type(path) is not str or not path.startswith("/") or "\x00" in path:
            raise HyprlandPluginError("hyprland_plugin_command_refused")
        try:
            value = json.loads(
                await self._request(b"j/odin-plugin-status"), object_pairs_hook=_unique_object
            )
            if type(value) is not dict or set(value) != {"path", "companion_build_id"}:
                raise ValueError
            actual_path, build_id = value["path"], value["companion_build_id"]
            if (actual_path != path or type(build_id) is not str
                    or not _BUILD_ID.fullmatch(build_id)):
                raise ValueError
            return build_id
        except (ValueError, TypeError, UnicodeError, RecursionError):
            raise HyprlandPluginError("hyprland_plugin_instance_status_invalid") from None


@dataclass(frozen=True)
class PluginApproval:
    """Operator-approved tuple for one immutable plugin image and compositor ABI."""

    path: str
    sha256: str
    hyprland_version: str
    hyprland_commit: str
    companion_build_id: str
    runtime_qualified: bool

    def __post_init__(self) -> None:
        filename = f"odin-hyprland-scope-{self.sha256}.so"
        if (
            type(self.path) is not str or not self.path.startswith("/")
            or "\x00" in self.path or Path(self.path).name != filename
            or type(self.sha256) is not str or not _DIGEST.fullmatch(self.sha256)
            or type(self.hyprland_version) is not str or not self.hyprland_version
            or len(self.hyprland_version) > 128 or any(c.isspace() for c in self.hyprland_version)
            or type(self.hyprland_commit) is not str or not _COMMIT.fullmatch(self.hyprland_commit)
            or type(self.companion_build_id) is not str
            or not _BUILD_ID.fullmatch(self.companion_build_id)
            or self.runtime_qualified is not True
        ):
            raise HyprlandPluginError("hyprland_plugin_approved_tuple_required")

    @classmethod
    def from_manifest(cls, path: str, manifest: dict[str, Any]) -> PluginApproval:
        """Accept only the qualified manifest fields, never a mutable alias."""
        if type(manifest) is not dict:
            raise HyprlandPluginError("hyprland_plugin_manifest_invalid")
        try:
            approval = cls(
                path=path,
                sha256=manifest["plugin_sha256"],
                hyprland_version=manifest["hyprland_version"],
                hyprland_commit=manifest["hyprland_commit"],
                companion_build_id=manifest["companion_build_id"],
                runtime_qualified=manifest["runtime_qualified"],
            )
            if manifest.get("plugin_filename") != Path(path).name:
                raise ValueError
            return approval
        except (KeyError, TypeError, ValueError, HyprlandPluginError):
            raise HyprlandPluginError("hyprland_plugin_manifest_invalid") from None

    @property
    def pin(self) -> tuple[str, str, str, str, str]:
        return (self.sha256, self.hyprland_version, self.hyprland_commit,
                self.companion_build_id, self.path)

    def verify_artifact(self, *, approved_root: str = "/usr/local/lib/odin") -> None:
        """Verify every path component and the exact immutable ELF before load."""
        root = Path(approved_root)
        target = Path(self.path)
        try:
            if not root.is_absolute() or target.parent != root:
                raise ValueError
            # lstat, not stat: an approval must never traverse a mutable alias.
            components = (Path("/"), *reversed(root.parents[:-1]), root, target)
            for current_path in components:
                component_stat = os.lstat(current_path)
                if (
                    stat.S_ISLNK(component_stat.st_mode)
                    or component_stat.st_uid != 0
                    or component_stat.st_mode & 0o022
                ):
                    raise ValueError
                if current_path != target and not stat.S_ISDIR(component_stat.st_mode):
                    raise ValueError
            target_stat = os.lstat(target)
            if not stat.S_ISREG(target_stat.st_mode) or target_stat.st_size <= 0:
                raise ValueError
            fd = os.open(target, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
            try:
                before = os.fstat(fd)
                digest = hashlib.sha256()
                while block := os.read(fd, 1024 * 1024):
                    digest.update(block)
                after, target_lstat = os.fstat(fd), os.lstat(target)
            finally:
                os.close(fd)
            keys = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
            if (any(getattr(before, key) != getattr(after, key) for key in keys)
                    or any(getattr(before, key) != getattr(target_lstat, key) for key in keys)
                    or digest.hexdigest() != self.sha256):
                raise ValueError
        except (OSError, ValueError):
            raise HyprlandPluginError("hyprland_plugin_artifact_untrusted") from None


@dataclass(frozen=True)
class PluginState:
    loaded: bool
    ready: bool
    code: str | None = None


class ProcMappedPluginVerifier:
    """Root-only verifier for the exact file mapped by the pinned compositor."""

    _MAP = re.compile(r"^[0-9a-f]+-[0-9a-f]+\s+\S+\s+\S+\s+\S+\s+\S+\s+(/.*)$")

    def __init__(self, *, proc_root: str = "/proc", geteuid=os.geteuid) -> None:
        self.proc_root, self._geteuid = proc_root, geteuid

    def verify(self, *, pid: int, approval: PluginApproval) -> None:
        if self._geteuid() != 0:
            raise HyprlandPluginError("hyprland_plugin_mapped_image_unavailable")
        artifact = os.stat(approval.path, follow_symlinks=False)
        try:
            with open(Path(self.proc_root) / str(pid) / "maps", "rb") as maps:
                raw = maps.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                raise ValueError
            candidates: list[str] = []
            for line in raw.decode("ascii").splitlines():
                match = self._MAP.fullmatch(line)
                if match is not None and match.group(1) == approval.path:
                    candidates.append(line.split(None, 1)[0])
            for address in candidates:
                mapped = Path(self.proc_root) / str(pid) / "map_files" / address
                mapped_stat = os.stat(mapped)
                if (mapped_stat.st_dev, mapped_stat.st_ino) != (artifact.st_dev, artifact.st_ino):
                    continue
                digest = hashlib.sha256()
                with open(mapped, "rb") as image:
                    while block := image.read(1024 * 1024):
                        digest.update(block)
                if digest.hexdigest() == approval.sha256:
                    return
            raise ValueError
        except (OSError, UnicodeError, ValueError):
            raise HyprlandPluginError("hyprland_plugin_mapped_image_unverified") from None


class ManagedHyprlandPlugin:
    """Serializes one approved load and never retries an uncertain load command."""

    _locks: dict[tuple[int, str, tuple[str, str, str, str, str]], asyncio.Lock] = {}

    def __init__(
        self, *, approval: PluginApproval, identity: HyprlandIdentity,
        ipc: NativePluginIPC, mapped_verifier: ProcMappedPluginVerifier | None = None,
    ) -> None:
        if type(approval) is not PluginApproval or not isinstance(identity, HyprlandIdentity):
            raise HyprlandPluginError("hyprland_plugin_identity_required")
        if (
            approval.hyprland_version != identity.trust.version
            or approval.hyprland_commit != identity.trust.commit
        ):
            raise HyprlandPluginError("hyprland_plugin_compositor_pin_mismatch")
        self.approval = approval
        self.identity = identity
        self.ipc = ipc
        self.mapped_verifier = mapped_verifier

    async def status(self) -> PluginState:
        """Observation only.  Status must never cause a plugin load."""
        loaded = self.approval.path in await self.ipc.loaded_plugins()
        if not loaded:
            return PluginState(False, False)
        return await self._ready_state()

    async def activate(self, *, authorized_task: bool) -> PluginState:
        """Inspect, load the one immutable path at most once, then inspect once."""
        if authorized_task is not True:
            raise HyprlandPluginError("hyprland_plugin_task_authorization_required")
        self.approval.verify_artifact()
        key = (id(asyncio.get_running_loop()), self.identity.digest, self.approval.pin)
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            inventory = await self.ipc.loaded_plugins()
            if self.approval.path not in inventory:
                try:
                    await self.ipc.load_fixed_plugin(self.approval.path)
                except Exception:
                    # An ACK can vanish after the compositor accepted the command.
                    # Inspect exactly once.  Never resend a potentially successful load.
                    inventory = await self.ipc.loaded_plugins()
                    if self.approval.path not in inventory:
                        raise HyprlandPluginError("hyprland_plugin_load_unconfirmed") from None
                else:
                    inventory = await self.ipc.loaded_plugins()
                    if self.approval.path not in inventory:
                        raise HyprlandPluginError("hyprland_plugin_load_unconfirmed")
            return await self._ready_state()

    async def _ready_state(self) -> PluginState:
        if self.mapped_verifier is None:
            return PluginState(True, False, "hyprland_plugin_runtime_unqualified")
        try:
            self.mapped_verifier.verify(pid=self.identity.process.pid, approval=self.approval)
            build_id = await self.ipc.plugin_instance_status(self.approval.path)
            if build_id != self.approval.companion_build_id:
                raise HyprlandPluginError("hyprland_plugin_companion_identity_mismatch")
            return PluginState(True, True)
        except HyprlandPluginError as error:
            return PluginState(True, False, str(error))
