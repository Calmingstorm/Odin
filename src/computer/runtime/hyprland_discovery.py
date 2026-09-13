"""Bounded read-only discovery of a uniquely pinned Hyprland session."""

from __future__ import annotations

import asyncio
import hashlib
import math
import os
import re
import stat
import time
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from inspect import isawaitable
from typing import cast

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
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _text(value: object) -> bool:
    if type(value) is not str:
        return False
    try:
        value.encode("utf-8", "strict")
    except UnicodeError:
        return False
    return True


def _remaining(deadline: float) -> float:
    value = deadline - time.monotonic()
    if value <= 0:
        raise HyprlandDiscoveryError("hyprland_discovery_deadline")
    return value


def _trusted_dir(path: str, uid: int) -> os.stat_result:
    st = os.stat(path, follow_symlinks=False)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != uid or st.st_mode & 0o022:
        raise HyprlandDiscoveryError("hyprland_discovery_runtime_untrusted")
    return st


@dataclass(frozen=True)
class HyprlandDiscoveryPolicy:
    expected_uid: int
    runtime_dir: str
    trust: ExecutableTrust
    max_candidates: int = _MAX_CANDIDATES
    timeout_seconds: float = 3.0

    def __post_init__(self) -> None:
        timeout_ok = type(self.timeout_seconds) in {int, float} and not isinstance(
            self.timeout_seconds, bool
        )
        if (
            type(self.expected_uid) is not int
            or self.expected_uid < 0
            or not _text(self.runtime_dir)
            or not self.runtime_dir.startswith("/")
            or "\0" in self.runtime_dir
            or any(p in {"", ".", ".."} for p in self.runtime_dir.split("/")[1:])
            or type(self.trust) is not ExecutableTrust
            or type(self.max_candidates) is not int
            or not 1 <= self.max_candidates <= _MAX_CANDIDATES
            or not timeout_ok
            or not math.isfinite(self.timeout_seconds)
            or not 0 < self.timeout_seconds <= 30
        ):
            raise HyprlandDiscoveryError("hyprland_discovery_policy_invalid")


def stable_runtime_root(expected_uid: int) -> str:
    """Return the one per-user runtime root we will inspect, or fail closed."""
    root = f"/run/user/{expected_uid}"
    try:
        _trusted_dir("/run", 0)
        _trusted_dir("/run/user", 0)
        _trusted_dir(root, expected_uid)
    except OSError as exc:
        raise HyprlandDiscoveryError("hyprland_discovery_runtime_unavailable") from exc
    return root


def _socket_entry(entry: os.DirEntry[str], uid: int) -> bool:
    try:
        st = entry.stat(follow_symlinks=False)
    except OSError:
        return False
    return stat.S_ISSOCK(st.st_mode) and st.st_uid == uid and not st.st_mode & 0o022


def runtime_inventory(
    policy: HyprlandDiscoveryPolicy, deadline: float
) -> tuple[HyprlandCandidateHint, ...]:
    """Inventory potential hints up to the cap, never silently truncating them."""
    root = stable_runtime_root(policy.expected_uid)
    if root != policy.runtime_dir:
        return ()
    try:
        displays: list[str] = []
        with os.scandir(root) as entries:
            for entry in entries:
                _remaining(deadline)
                if _DISPLAY.fullmatch(entry.name) and _socket_entry(entry, policy.expected_uid):
                    if len(displays) >= policy.max_candidates:
                        raise HyprlandDiscoveryError("hyprland_discovery_candidate_limit")
                    displays.append(entry.name)
        hypr = os.path.join(root, "hypr")
        _trusted_dir(hypr, policy.expected_uid)
        signatures: list[str] = []
        with os.scandir(hypr) as entries:
            for entry in entries:
                _remaining(deadline)
                if _SIGNATURE.fullmatch(entry.name):
                    try:
                        child = entry.stat(follow_symlinks=False)
                    except OSError:
                        continue
                    if (
                        stat.S_ISDIR(child.st_mode)
                        and child.st_uid == policy.expected_uid
                        and not child.st_mode & 0o022
                    ):
                        socket_path = os.path.join(hypr, entry.name, ".socket.sock")
                        socket_stat = os.stat(socket_path, follow_symlinks=False)
                        if (
                            not stat.S_ISSOCK(socket_stat.st_mode)
                            or socket_stat.st_uid != policy.expected_uid
                            or socket_stat.st_mode & 0o022
                        ):
                            continue
                        if len(signatures) >= policy.max_candidates:
                            raise HyprlandDiscoveryError("hyprland_discovery_candidate_limit")
                        signatures.append(entry.name)
        pids: list[int] = []
        with os.scandir("/proc") as entries:
            for entry in entries:
                _remaining(deadline)
                if not entry.name.isdecimal():
                    continue
                try:
                    pid = int(entry.name)
                    if (
                        pid > 1
                        and entry.stat(follow_symlinks=False).st_uid == policy.expected_uid
                        and os.readlink(f"/proc/{pid}/exe") == policy.trust.path
                    ):
                        if len(pids) >= policy.max_candidates:
                            raise HyprlandDiscoveryError("hyprland_discovery_candidate_limit")
                        pids.append(pid)
                except (OSError, ValueError):
                    continue
    except HyprlandDiscoveryError:
        raise
    except OSError:
        return ()
    if len(pids) * len(displays) * len(signatures) > policy.max_candidates:
        raise HyprlandDiscoveryError("hyprland_discovery_candidate_limit")
    return tuple(
        HyprlandCandidateHint(pid, root, display, signature)
        for pid in pids
        for display in displays
        for signature in signatures
    )


@dataclass(frozen=True)
class HyprlandCandidateHint:
    pid: int
    runtime_dir: str
    wayland_display: str
    instance_signature: str

    @property
    def candidate_id(self) -> str:
        text = "\0".join(
            (str(self.pid), self.runtime_dir, self.wayland_display, self.instance_signature)
        )
        return hashlib.sha256(text.encode("utf-8", "strict")).hexdigest()[:32]


@dataclass(frozen=True)
class ResolvedHyprlandSession:
    pid: int
    runtime_dir: str
    wayland_display: str
    instance_signature: str
    identity: HyprlandIdentity


InventoryResult = Iterable[HyprlandCandidateHint] | Awaitable[Iterable[HyprlandCandidateHint]]
Inventory = Callable[[HyprlandDiscoveryPolicy, float], InventoryResult]


def _valid_hint(hint: object, policy: HyprlandDiscoveryPolicy) -> bool:
    return (
        type(hint) is HyprlandCandidateHint
        and type(hint.pid) is int
        and hint.pid > 1
        and _text(hint.runtime_dir)
        and _text(hint.wayland_display)
        and _text(hint.instance_signature)
        and hint.runtime_dir == policy.runtime_dir
        and bool(_DISPLAY.fullmatch(hint.wayland_display))
        and bool(_SIGNATURE.fullmatch(hint.instance_signature))
    )


class HyprlandDiscoveryResolver:
    """Hints are validated first; only one validated session is selectable."""

    def __init__(self, policy, *, inventory: Inventory = runtime_inventory, pin=pin_connections):
        self.policy, self.inventory, self.pin = policy, inventory, pin

    async def resolve(self):
        deadline = time.monotonic() + self.policy.timeout_seconds
        try:
            if self.inventory is runtime_inventory:
                hints: Iterable[HyprlandCandidateHint] = await asyncio.wait_for(
                    asyncio.to_thread(self.inventory, self.policy, deadline), _remaining(deadline)
                )
            else:
                inventory_result = self.inventory(self.policy, deadline)
                if isawaitable(inventory_result):
                    inventory_result = await asyncio.wait_for(
                        inventory_result, _remaining(deadline)
                    )
                hints = cast(Iterable[HyprlandCandidateHint], inventory_result)
            valid, seen = [], set[str]()
            for hint in hints:
                _remaining(deadline)
                if not _valid_hint(hint, self.policy):
                    raise HyprlandDiscoveryError("hyprland_discovery_hint_invalid")
                candidate_id = hint.candidate_id
                if candidate_id in seen or len(seen) >= self.policy.max_candidates:
                    raise HyprlandDiscoveryError(
                        "hyprland_discovery_hint_invalid"
                        if candidate_id in seen
                        else "hyprland_discovery_candidate_limit"
                    )
                seen.add(candidate_id)
                try:
                    identity, connection = await self.pin(
                        wayland_path=hint.runtime_dir + "/" + hint.wayland_display,
                        ipc_path=hint.runtime_dir
                        + "/hypr/"
                        + hint.instance_signature
                        + "/.socket.sock",
                        expected_pid=hint.pid,
                        expected_uid=self.policy.expected_uid,
                        trust=self.policy.trust,
                        timeout_seconds=_remaining(deadline),
                    )
                    try:
                        valid.append((hint, identity))
                    finally:
                        connection.close()
                except HyprlandIdentityError as exc:
                    # A timeout leaves later candidates unvalidated, so an
                    # earlier successful pin cannot establish uniqueness.
                    if exc.code == "hyprland_identity_deadline":
                        raise HyprlandDiscoveryError("hyprland_discovery_deadline") from None
                    continue
                except OSError:
                    continue
            if len(valid) != 1:
                raise HyprlandDiscoveryError(
                    "hyprland_discovery_not_found" if not valid else "hyprland_discovery_ambiguous"
                )
            hint, identity = valid[0]
            return ResolvedHyprlandSession(
                hint.pid, hint.runtime_dir, hint.wayland_display, hint.instance_signature, identity
            )
        except HyprlandDiscoveryError:
            raise
        except TimeoutError:
            raise HyprlandDiscoveryError("hyprland_discovery_deadline") from None
        except HyprlandIdentityError as exc:
            raise HyprlandDiscoveryError(exc.code) from None
        except (OSError, TypeError, ValueError):
            raise HyprlandDiscoveryError("hyprland_discovery_unavailable") from None
