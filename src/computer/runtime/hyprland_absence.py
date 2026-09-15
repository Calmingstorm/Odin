"""Original process-local retirement, never release or queued-event proof.

The source-pinned guardian uses CLOEXEC sockets and no fork/exec, SCM_RIGHTS or
kernel input devices. Native seals exact virtual resources on one wl_client and
checks FD_CLOEXEC. These objects dispatch inside the original compositor, not a
persistent input server. Spawned applications exec without that endpoint; copied
fds cannot resurrect an exited process's dispatch objects. old_connections_absent
means no original endpoint can process NEW input, not global fd nonexistence.
Only the surviving original controller retains this witness. No reconstruction.

Containment audit of Hyprland 39d7e209c79d451efab1b21151d5938289da838d:
VirtualKeyboard.cpp and VirtualPointer.cpp install in-process protocol callbacks;
EventLoopManager.cpp runs wl_display_run. Executor.cpp:177-207 child execs or
_exits, SignalSafe.hpp:144-166 child execs or aborts, and XWayland Server.cpp:
384-391 child calls runXWayland then _exits (runXWayland execs or _exits).
None resumes the inherited Wayland dispatch loop. XWayland clears CLOEXEC only
on its own separately constructed socketpair, not our captured wl_client fd.
The guardian inherits startup's root-owned non-writable executable trust. The
provider also requires a build ID from independently verified mapped-plugin
approval. The digest binds that build, owner and opaque native inventory nonce;
it is NOT a persisted independently auditable inventory of native pointers.
"""

from __future__ import annotations

import asyncio
import copy
import os
import re
import secrets
import select
import time
from pathlib import Path
from typing import TYPE_CHECKING, NoReturn

from .hyprland_identity import HyprlandIdentity, _proc_start, revalidate

if TYPE_CHECKING:
    from .hyprland_recovery import HyprlandResourceAbsenceProof

# Bounded KVM evidence: original sealed inventory, retained pidfds, both exits,
# same-boot independently pinned successor. Not the other recovery capabilities.
# See docs/computer-use/HYPRLAND-CROSS-COMPOSITOR-RETIREMENT-2026-09-15.md.
RUNTIME_QUALIFIED = True
RUNTIME_QUALIFICATION_SCOPE = "same-boot-retained-original-witness-v1"
RESOURCE_MODEL = "wayland-process-local-v1"


def _fail() -> NoReturn:
    from .hyprland_scope import HyprlandScopeFailure

    raise HyprlandScopeFailure("hyprland_resource_absence_unproven")


def _owner_digest(handle):
    from ..store import canonical_hash
    from .hyprland_scope import owner_handle_to_record

    return canonical_hash(owner_handle_to_record(handle))


def _exited(fd):
    if fd is None:
        return False
    poll = select.poll()
    poll.register(fd, select.POLLIN)
    events = poll.poll(0)
    return bool(len(events) == 1 and events[0][0] == fd
                and events[0][1] & select.POLLIN
                and not events[0][1] & (select.POLLERR | select.POLLNVAL))


def _alive(fd):
    poll = select.poll()
    poll.register(fd, select.POLLIN)
    return not poll.poll(0)


class ResourceContainmentWitness:
    """Owns two original pidfds and private one-use proofs, never serialized."""

    def __init__(self):
        self._compositor_fd = self._guardian_fd = None
        self._handle = None
        self._inventory = None
        self._inventory_digest = None
        self._build_id = None
        self._proofs: dict[str, HyprlandResourceAbsenceProof] = {}
        self._commands = set()
        self._lock = asyncio.Lock()

    @classmethod
    async def capture(cls, handle, row):
        from ..store import canonical_hash
        from .wayland_guardian import trusted_binary

        _owner_digest(handle)
        inventory = row.get("resource_containment")
        build_id = row.get("companion_build_id")
        if (type(build_id) is not str or not re.fullmatch(r"[0-9a-f]{64}", build_id)
                or type(inventory) is not dict or set(inventory) != {
                "version", "resource_model", "inventory_id", "keyboard_count",
                "pointer_count", "persistent_devices", "kernel_devices", "endpoint_semantics"}
                or type(inventory["version"]) is not int or inventory["version"] != 1
                or inventory["resource_model"] != RESOURCE_MODEL
                or type(inventory["inventory_id"]) is not str
                or not re.fullmatch(r"[0-9a-f]{48}", inventory["inventory_id"])
                or any(type(inventory[k]) is not int or inventory[k] != 1
                       for k in ("keyboard_count", "pointer_count"))
                or inventory["persistent_devices"] is not False
                or inventory["kernel_devices"] is not False
                or inventory["endpoint_semantics"] != "original-process-protocol-dispatch"):
            _fail()
        witness = cls()
        try:
            witness._handle = copy.deepcopy(handle)
            witness._check_controller(handle)
            await revalidate(handle.compositor, time.monotonic() + 0.5)
            if (str(_proc_start(handle.guardian_pid, handle.guardian_uid))
                    != handle.guardian_start_ticks):
                _fail()
            executable = os.readlink(f"/proc/{handle.guardian_pid}/exe")
            trusted_binary(executable)
            before = os.stat(f"/proc/{handle.guardian_pid}/exe")
            witness._compositor_fd = os.pidfd_open(handle.compositor.process.pid, 0)
            witness._guardian_fd = os.pidfd_open(handle.guardian_pid, 0)
            await revalidate(handle.compositor, time.monotonic() + 0.5)
            after = os.stat(f"/proc/{handle.guardian_pid}/exe")
            if (str(_proc_start(handle.guardian_pid, handle.guardian_uid))
                    != handle.guardian_start_ticks
                    or (before.st_dev, before.st_ino, before.st_size, before.st_ctime_ns)
                    != (after.st_dev, after.st_ino, after.st_size, after.st_ctime_ns)
                    or not _alive(witness._compositor_fd) or not _alive(witness._guardian_fd)):
                _fail()
            witness._inventory = copy.deepcopy(inventory)
            witness._build_id = build_id
            witness._inventory_digest = canonical_hash({
                "owner_digest": _owner_digest(handle), "companion_build_id": build_id,
                "inventory": inventory})
            return witness
        except BaseException:
            witness.close()
            raise

    def _check_controller(self, handle):
        if (self._handle != handle or os.getpid() != handle.recovery_pid
                or os.geteuid() != handle.recovery_uid
                or str(_proc_start(os.getpid(), os.geteuid())) != handle.recovery_start_ticks
                or Path("/proc/sys/kernel/random/boot_id").read_text().strip()
                != handle.compositor.process.boot_id):
            _fail()

    async def _check(self, handle, successor):
        from ..store import canonical_hash

        self._check_controller(handle)
        if (self._inventory is None or self._inventory_digest != canonical_hash({
                "owner_digest": _owner_digest(handle), "companion_build_id": self._build_id,
                "inventory": self._inventory})
                or not _exited(self._compositor_fd) or not _exited(self._guardian_fd)
                or type(successor) is not HyprlandIdentity
                or successor.digest == handle.compositor.digest
                or (successor.process.pid == handle.compositor.process.pid
                    and successor.process.start_ticks == handle.compositor.process.start_ticks)
                or successor.process.boot_id != handle.compositor.process.boot_id
                or successor.process.uid != handle.compositor.process.uid
                or successor.trust != handle.compositor.trust):
            _fail()
        await revalidate(successor, time.monotonic() + 0.5)
        self._check_controller(handle)

    async def prove_resource_absence(self, handle, *, command_id, successor,
                                     local_closure_confirmed=False):
        from .hyprland_recovery import HyprlandResourceAbsenceProof

        async with self._lock:
            if (local_closure_confirmed is not True or type(command_id) is not str
                    or not re.fullmatch(r"[A-Za-z0-9-]{1,128}", command_id)
                    or command_id in self._commands or len(self._commands) >= 128):
                _fail()
            await self._check(handle, successor)
            inventory_digest = self._inventory_digest
            if type(inventory_digest) is not str:
                _fail()
            certificate = secrets.token_hex(32)
            proof = HyprlandResourceAbsenceProof(
                protocol="hyprland-resource-absence-v1", command_id=command_id,
                owner_digest=_owner_digest(handle), predecessor_digest=handle.compositor.digest,
                successor_digest=successor.digest, native_certificate=certificate,
                owned_virtual_devices_absent=True, old_connections_absent=True,
                inventory_digest=inventory_digest)
            self._commands.add(command_id)
            self._proofs[certificate] = proof
            return proof

    async def verify_resource_absence(self, proof: object, *, handle, successor):
        from .hyprland_recovery import HyprlandResourceAbsenceProof

        async with self._lock:
            if type(proof) is not HyprlandResourceAbsenceProof:
                return False
            if self._proofs.get(proof.native_certificate) is not proof:
                return False
            del self._proofs[proof.native_certificate]
            try:
                await self._check(handle, successor)
                return (proof.owner_digest == _owner_digest(handle)
                        and proof.predecessor_digest == handle.compositor.digest
                        and proof.successor_digest == successor.digest
                        and proof.inventory_digest == self._inventory_digest)
            except Exception:
                return False

    def close(self):
        self._proofs.clear()
        self._inventory = None
        for name in ("_compositor_fd", "_guardian_fd"):
            fd = getattr(self, name)
            setattr(self, name, None)
            if fd is not None:
                os.close(fd)
