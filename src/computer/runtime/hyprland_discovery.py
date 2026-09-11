"""Bounded read-only discovery of a uniquely pinned Hyprland session."""
# ruff: noqa: E501
from __future__ import annotations

import asyncio
import hashlib
import os
import re
import stat
import time
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from inspect import isawaitable

from .hyprland_identity import (
    ExecutableTrust,
    HyprlandIdentity,
    HyprlandIdentityError,
    pin_connections,
)

_MAX_CANDIDATES = 32
_DISPLAY = re.compile(r"wayland-[A-Za-z0-9_.-]{1,96}\Z")
_SIGNATURE = re.compile(r"[A-Za-z0-9_.:-]{1,128}\Z")


class HyprlandDiscoveryError(RuntimeError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class HyprlandDiscoveryPolicy:
    expected_uid: int
    runtime_dir: str
    trust: ExecutableTrust
    max_candidates: int = _MAX_CANDIDATES
    timeout_seconds: float = 3.0

    def __post_init__(self):
        if (type(self.expected_uid) is not int or self.expected_uid < 0 or type(self.runtime_dir) is not str
                or not self.runtime_dir.startswith("/") or "\0" in self.runtime_dir
                or any(p in {"", ".", ".."} for p in self.runtime_dir.split("/")[1:])
                or type(self.trust) is not ExecutableTrust or type(self.max_candidates) is not int
                or not 1 <= self.max_candidates <= _MAX_CANDIDATES or not 0 < self.timeout_seconds <= 30):
            raise HyprlandDiscoveryError("hyprland_discovery_policy_invalid")


def stable_runtime_root(expected_uid: int) -> str:
    """Return the one per-user runtime root we will inspect, or fail closed."""
    root = f"/run/user/{expected_uid}"
    try:
        st = os.stat(root, follow_symlinks=False)
    except OSError as exc:
        raise HyprlandDiscoveryError("hyprland_discovery_runtime_unavailable") from exc
    if not os.path.isdir(root) or st.st_uid != expected_uid or st.st_mode & 0o022:
        raise HyprlandDiscoveryError("hyprland_discovery_runtime_untrusted")
    return root


def runtime_inventory(policy: HyprlandDiscoveryPolicy, _deadline: float):
    """Bounded untrusted hint inventory. Candidates are pinned before selection."""
    root = stable_runtime_root(policy.expected_uid)
    if root != policy.runtime_dir:
        return ()
    try:
        displays = [entry.name for entry in os.scandir(root)
                    if _DISPLAY.fullmatch(entry.name)
                    and stat.S_ISSOCK(entry.stat(follow_symlinks=False).st_mode)]
        hypr = os.path.join(root, "hypr")
        signatures = [entry.name for entry in os.scandir(hypr)
                      if _SIGNATURE.fullmatch(entry.name) and entry.is_dir(follow_symlinks=False)]
        pids: list[int] = []
        for entry in os.scandir("/proc"):
            if not entry.name.isdecimal() or len(pids) >= policy.max_candidates:
                continue
            try:
                pid = int(entry.name)
                if (pid > 1 and entry.stat(follow_symlinks=False).st_uid == policy.expected_uid
                        and os.readlink(f"/proc/{pid}/exe") == policy.trust.path):
                    pids.append(pid)
            except (OSError, ValueError):
                continue
    except OSError:
        return ()
    result: list[HyprlandCandidateHint] = []
    for pid in pids:
        for display in displays:
            for signature in signatures:
                if len(result) >= policy.max_candidates:
                    return tuple(result)
                result.append(HyprlandCandidateHint(pid, root, display, signature))
    return tuple(result)


@dataclass(frozen=True)
class HyprlandCandidateHint:
    pid: int
    runtime_dir: str
    wayland_display: str
    instance_signature: str

    @property
    def candidate_id(self):
        return hashlib.sha256("\0".join((str(self.pid), self.runtime_dir, self.wayland_display, self.instance_signature)).encode()).hexdigest()[:32]


@dataclass(frozen=True)
class ResolvedHyprlandSession:
    pid: int
    runtime_dir: str
    wayland_display: str
    instance_signature: str
    identity: HyprlandIdentity


InventoryResult = Iterable[HyprlandCandidateHint] | Awaitable[Iterable[HyprlandCandidateHint]]
Inventory = Callable[[HyprlandDiscoveryPolicy, float], InventoryResult]


def _remaining(deadline):
    value = deadline - time.monotonic()
    if value <= 0:
        raise HyprlandDiscoveryError("hyprland_discovery_deadline")
    return value


class HyprlandDiscoveryResolver:
    """Hints are validated first; only one validated session is selectable."""
    def __init__(self, policy, *, inventory: Inventory = runtime_inventory, pin=pin_connections):
        self.policy, self.inventory, self.pin = policy, inventory, pin

    async def resolve(self):
        deadline = time.monotonic() + self.policy.timeout_seconds
        try:
            hints = self.inventory(self.policy, deadline)
            if isawaitable(hints):
                hints = await asyncio.wait_for(hints, _remaining(deadline))
            valid, seen = [], set[str]()
            for hint in hints:
                _remaining(deadline)
                if len(seen) >= self.policy.max_candidates:
                    raise HyprlandDiscoveryError("hyprland_discovery_candidate_limit")
                if type(hint) is not HyprlandCandidateHint or hint.candidate_id in seen:
                    raise HyprlandDiscoveryError("hyprland_discovery_hint_invalid")
                seen.add(hint.candidate_id)
                if (hint.runtime_dir != self.policy.runtime_dir or hint.pid <= 1
                        or not _DISPLAY.fullmatch(hint.wayland_display) or not _SIGNATURE.fullmatch(hint.instance_signature)):
                    continue
                wayland = hint.runtime_dir + "/" + hint.wayland_display
                ipc = hint.runtime_dir + "/hypr/" + hint.instance_signature + "/.socket.sock"
                try:
                    identity, connection = await self.pin(wayland_path=wayland, ipc_path=ipc, expected_pid=hint.pid,
                        expected_uid=self.policy.expected_uid, trust=self.policy.trust, timeout_seconds=_remaining(deadline))
                    try:
                        valid.append((hint, identity))
                    finally:
                        connection.close()
                except (HyprlandIdentityError, OSError, TimeoutError):
                    continue
            if len(valid) != 1:
                raise HyprlandDiscoveryError("hyprland_discovery_not_found" if not valid else "hyprland_discovery_ambiguous")
            hint, identity = valid[0]
            return ResolvedHyprlandSession(hint.pid, hint.runtime_dir, hint.wayland_display, hint.instance_signature, identity)
        except HyprlandDiscoveryError:
            raise
        except HyprlandIdentityError as exc:
            raise HyprlandDiscoveryError(exc.code) from None
        except TimeoutError:
            raise HyprlandDiscoveryError("hyprland_discovery_deadline") from None
        except (OSError, TypeError, ValueError):
            raise HyprlandDiscoveryError("hyprland_discovery_unavailable") from None
