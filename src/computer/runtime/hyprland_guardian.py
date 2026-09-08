"""Bounded native Hyprland owner. Native acknowledgement is not receiver proof.

The native child opens Wayland itself: an inherited connection retains the
Python connector's SO_PEERCRED PID. Plugin activation is never automatic here.
Guardian SIGKILL and same-button physical/virtual overlap remain residuals.
"""
from __future__ import annotations

import asyncio
import logging
import os
import pwd
import re
import time
from typing import Any

from .hyprland_identity import connect_peer
from .hyprland_scope import _TOKEN, LEASE_NS
from .wayland_guardian import (
    WaylandGuardian,
    WaylandGuardianError,
    _action_diagnostics,
    _Credentials,
    trusted_binary,
)

log = logging.getLogger("odin.computer.hyprland_guardian")


class HyprlandGuardianError(WaylandGuardianError):
    """Static failures, never native tokens or window information."""


_SCOPE_ERRORS = frozenset({
    "none", "absolute-scope-deadline-required", "invalid-lease-or-cleanup-failed",
    "renew-binding-refused", "already-armed", "stale-snapshot", "ambiguous-keyboard",
    "missing-guardian-keyboard", "ambiguous-pointer", "missing-or-wrong-output-pointer",
    "human-input-held", "unknown-operation", "invalid-json", "unrecognized-scope-error",
    "missing-scope-token", "local-deadline-invalid", "scope-exchange-failed",
    "scope-operation-refused", "scope-ack-invalid", "scope-rejected-input", "scope-ack-expired",
})


def _native_diagnostics(row):
    """Malformed native enums must not replace the original dispatch failure."""
    if type(row) is not dict:
        return None
    raw = row.get("diagnostics")
    if (type(raw) is not dict
            or not all(type(raw.get(k)) is str for k in ("phase", "release", "reason"))):
        return None
    return _action_diagnostics(row)


def native_failure(row):
    """Sanitize native evidence without promoting execution or cleanup state."""
    if type(row) is not dict:
        return None
    raw = row.get("native_failure")
    if type(raw) is not dict:
        return None
    command, operation, error = (raw.get(k) for k in ("command", "scope_operation", "scope_error"))
    if (type(command) is not str or command not in {
            "none", "begin", "renew", "bind", "select", "pixel-permit", "action"}
            or type(operation) is not str or operation not in {"none", "arm", "renew"}
            or type(error) is not str or error not in _SCOPE_ERRORS):
        return None
    result: dict[str, Any] = {
        "command": command, "scope_operation": operation, "scope_error": error,
    }
    for key in ("input_was_sent", "release_sent", "release_acknowledged"):
        if type(row.get(key)) is bool:
            result[key] = row[key]
    diagnostics = _native_diagnostics(row)
    if diagnostics is not None:
        result["diagnostics"] = diagnostics
    return result


def _path(value):
    if (type(value) is not str or not value.startswith("/")
            or len(os.fsencode(value)) > 107 or any(ord(c) < 32 for c in value)):
        raise HyprlandGuardianError("hyprland_explicit_socket_required")


class HyprlandGuardian(WaylandGuardian):
    """Compatible action/ready/close interface; native scope is mandatory."""

    def __init__(self, binary: str, expected_uid: int, on_spawn=None):
        super().__init__(binary, expected_uid, on_spawn)
        self._scope_deadline = 0
        self._scope_binding: tuple[Any, ...] | None = None
        self._mapping_id: str | None = None
        self._spawning: asyncio.Task[asyncio.subprocess.Process] | None = None

    async def start(  # type: ignore[override]  # Native connector intentionally owns its sockets.
        self, wayland_path, mapping_id, scope_path, compositor_pid, logical_width, logical_height,
    ):
        trusted_binary(self.binary)
        _path(wayland_path)
        _path(scope_path)
        if (self._child is not None or self._closing
                or type(self.expected_uid) is not int or self.expected_uid < 0
                or type(compositor_pid) is not int or compositor_pid <= 1
                or any(type(v) is not int or not 1 <= v <= 16384
                       for v in (logical_width, logical_height))
                or type(mapping_id) is not str
                or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", mapping_id)):
            raise HyprlandGuardianError("hyprland_guardian_configuration_invalid")
        credentials: _Credentials = {}
        if self.expected_uid != os.geteuid():
            if os.geteuid() != 0:
                raise HyprlandGuardianError("hyprland_guardian_uid_unavailable")
            credentials = {"user": self.expected_uid,
                           "group": pwd.getpwuid(self.expected_uid).pw_gid, "extra_groups": []}
        for path in (wayland_path, scope_path):
            peer = await connect_peer(path, compositor_pid, self.expected_uid, time.monotonic() + 1)
            peer.close()
        await self._identity(None)
        spawning = asyncio.create_task(asyncio.create_subprocess_exec(
            self.binary, wayland_path, str(compositor_pid), str(self.expected_uid),
            mapping_id, scope_path, str(logical_width), str(logical_height),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, start_new_session=True, cwd="/",
            env={"PATH": "/usr/bin", "LANG": "C.UTF-8", "HOME": "/nonexistent"},
            limit=65536, **credentials,
        ))
        self._spawning = spawning
        try:
            try:
                self._child = await asyncio.shield(spawning)
            except asyncio.CancelledError:
                self._child = await spawning
                self._waiter = asyncio.create_task(self._child.wait())
                self._reader = asyncio.create_task(self._read())
                raise
            self._waiter = asyncio.create_task(self._child.wait())
            if self._closing:
                raise HyprlandGuardianError("hyprland_guardian_revoked")
            from .recovery import process_identity

            await self._identity(process_identity(self._child.pid))
            self._reader = asyncio.create_task(self._read())
            self._ready = await self._receive("ready", timeout=8)
            if (self._ready.get("scope_lease_v1") is not True
                    or self._ready.get("peer_pid") != compositor_pid):
                raise HyprlandGuardianError("hyprland_guardian_scope_unavailable")
            self._mapping_id = mapping_id
            self._heartbeat = asyncio.create_task(self._heartbeats())
            return self.ready
        except BaseException:
            await self.close()
            raise

    async def select(self, mapping_id):
        if mapping_id != self._mapping_id or not self.alive:
            raise HyprlandGuardianError("hyprland_guardian_mapping_changed")
        return self.ready

    async def bind_scope(self, snapshot):
        now = time.monotonic_ns()
        if type(snapshot) is not dict:
            raise HyprlandGuardianError("hyprland_guardian_scope_invalid")
        measured, token = snapshot.get("observed_monotonic_ns"), snapshot.get("native_scope_token")
        binding = tuple(snapshot.get(k) for k in ("source_digest", "focus_digest", "bounds_digest"))
        if (snapshot.get("locked") is not False or snapshot.get("authenticated") is not True
                or type(measured) is not int or not 0 <= now - measured < LEASE_NS
                or type(token) is not str or not _TOKEN.fullmatch(token)
                or any(type(v) is not str or not re.fullmatch(r"[0-9a-f]{64}", v) for v in binding)
                or (self._active and binding != self._scope_binding)):
            raise HyprlandGuardianError("hyprland_guardian_scope_invalid")
        await self._send(f"F {token}\n")
        self._scope_binding = binding
        self._scope_deadline = measured + LEASE_NS

    async def refresh_scope(self, deadline_ns: int):
        if (type(deadline_ns) is not int or not time.monotonic_ns() < deadline_ns
                or deadline_ns > self._scope_deadline):
            raise HyprlandGuardianError("hyprland_guardian_scope_expired")
        await super().refresh_scope(deadline_ns)

    async def act(self, command: str, *, pixel_guard=None, scope_deadline_ns=None):
        if (type(scope_deadline_ns) is not int
                or not time.monotonic_ns() < scope_deadline_ns <= self._scope_deadline):
            raise HyprlandGuardianError("hyprland_guardian_scope_expired")
        try:
            receipt = await super().act(
                command, pixel_guard=pixel_guard, scope_deadline_ns=scope_deadline_ns)
        except Exception as exc:
            # Controller receipts conservatively collapse dispatch exceptions.
            # Preserve bounded native facts in the journal, never commands,
            # coordinates, socket tokens, application text or raw exceptions.
            failure = native_failure(self._last_terminal)
            if isinstance(exc, WaylandGuardianError) and failure is not None:
                exc.details = {**getattr(exc, "details", {}), "native_failure": failure}
            log.warning(
                "Hyprland native action failed: diagnostics=%s input_was_sent=%s "
                "release_sent=%s release_acknowledged=%s native_failure=%s",
                _native_diagnostics(self._last_terminal),
                *(self._last_terminal.get(key)
                  if type(self._last_terminal.get(key)) is bool else None
                  for key in ("input_was_sent", "release_sent", "release_acknowledged")),
                failure,
            )
            raise
        receipt["release_ack"] = receipt.pop("release_acknowledged", False) is True
        receipt["receiver_release_verified"] = False
        return receipt

    async def close(self):
        self._closing = True
        if self._child is None and self._spawning is not None:
            try:
                self._child = await asyncio.shield(self._spawning)
            except Exception:
                # Failed exec never owns input; cancellation must propagate.
                pass
            if self._child is not None:
                if self._waiter is None:
                    self._waiter = asyncio.create_task(self._child.wait())
                if self._reader is None:
                    self._reader = asyncio.create_task(self._read())
        receipt = await super().close()
        if self._child is None:
            # No owner was ever spawned, so cleanup is vacuous, not a native
            # acknowledgement. Expose that distinction explicitly to admission.
            return {**receipt, "release_ack": True, "release_not_required": True,
                    "native_release_acknowledged": False, "receiver_release_verified": False}
        return {**receipt,
                "release_ack": bool(receipt.get("release_submitted")
                                    and self._last_terminal.get("release_acknowledged") is True),
                "native_release_acknowledged": bool(receipt.get("release_submitted")
                    and self._last_terminal.get("release_acknowledged") is True),
                "release_not_required": False,
                "receiver_release_verified": False}
