"""Owned transport for the persistent independently leased libei guardian."""

from __future__ import annotations

import asyncio
import inspect
import json
import os
import pwd
import stat
from typing import Any, TypedDict

from ..models import ComputerError


class WaylandGuardianError(ComputerError):
    """Static failure; a sent action may have an unknown outcome."""

    details: dict[str, Any]


class _Credentials(TypedDict, total=False):
    user: int
    group: int
    extra_groups: list[int]


_ACTION_REASONS = frozenset(
    {
        "completed",
        "cancelled",
        "orderly",
        "unsupported_character",
        "unsupported_key",
        "keymap_unavailable",
        "modifier_state_active",
        "scroll_capability_unavailable",
        "lease-expired",
        "scope-evidence-expired",
        "scope-refused",
        "signal-cancel",
        "controller-timeout",
        "controller-eof",
        "input-path-lost",
        "mapping-changed",
        "topology-changed",
        "too-many-devices",
        "modifier-state-changed",
        "invalid-command",
        "transport-error",
        "poll-error",
        "wayland_guardian_input_path_lost",
    }
)


def _action_diagnostics(row):
    """Static reason vocabulary and bounded counters, not untrusted native prose."""
    raw = row.get("diagnostics")
    if not isinstance(raw, dict):
        return None
    if (
        raw.get("phase") not in {"preflight", "dispatch", "release", "verification", "complete"}
        or any(
            type(raw.get(k)) is not int or not 0 <= raw[k] <= 4096
            for k in ("steps_planned", "steps_completed")
        )
        or raw["steps_completed"] > raw["steps_planned"]
        or raw.get("release") not in {"confirmed", "unknown"}
        or raw.get("reason") not in _ACTION_REASONS
    ):
        return None
    return {
        key: raw[key] for key in ("phase", "steps_planned", "steps_completed", "release", "reason")
    }


def trusted_binary(path: str) -> None:
    if type(path) is not str or not path.startswith("/") or any(ord(c) < 32 for c in path):
        raise WaylandGuardianError("wayland_guardian_path_invalid")
    current = "/"
    for part in path.split("/")[1:]:
        current = os.path.join(current, part)
        info = os.lstat(current)
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise WaylandGuardianError("wayland_guardian_path_untrusted")
    if not stat.S_ISREG(info.st_mode) or not os.access(path, os.X_OK):
        raise WaylandGuardianError("wayland_guardian_binary_unavailable")


def _mapping(value):
    if (
        type(value) is not str
        or not 1 <= len(value) <= 128
        or any(not 33 <= ord(c) <= 126 for c in value)
    ):
        raise WaylandGuardianError("wayland_mapping_identifier_invalid")


class WaylandGuardian:
    def __init__(self, binary: str, expected_uid: int, on_spawn=None):
        self.binary, self.expected_uid, self.on_spawn = binary, expected_uid, on_spawn
        self._child: asyncio.subprocess.Process | None = None
        self._waiter: asyncio.Task[int] | None = None
        self._reader: asyncio.Task[None] | None = None
        self._heartbeat: asyncio.Task[None] | None = None
        self._cleanup: asyncio.Task[dict[str, bool]] | None = None
        self._events: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=128)
        self._write_lock = asyncio.Lock()
        self._action_lock = asyncio.Lock()
        self._closing = self._failed = self._active = False
        self._closed_receipt = self._release_submitted = False
        self._ready: dict[str, Any] = {}
        self._last_terminal: dict[str, Any] = {}

    @property
    def ready(self):
        return dict(self._ready)

    @property
    def alive(self):
        return bool(
            self._child
            and self._child.returncode is None
            and not self._closing
            and not self._failed
        )

    async def _identity(self, value):
        if self.on_spawn is not None:
            result = self.on_spawn(value)
            if inspect.isawaitable(result):
                await result

    async def start(self, fd: int, mapping_id: str):
        try:
            trusted_binary(self.binary)
            if self._child is not None or self._closing:
                raise WaylandGuardianError("wayland_guardian_single_use")
            _mapping(mapping_id)
            credentials: _Credentials = {}
            if self.expected_uid != os.geteuid():
                if os.geteuid() != 0:
                    raise WaylandGuardianError("wayland_guardian_uid_unavailable")
                credentials = {
                    "user": self.expected_uid,
                    "group": pwd.getpwuid(self.expected_uid).pw_gid,
                    "extra_groups": [],
                }
            await self._identity(None)
            self._child = await asyncio.create_subprocess_exec(
                self.binary,
                str(fd),
                mapping_id,
                pass_fds=(fd,),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                start_new_session=True,
                env={"PATH": "/usr/bin", "LANG": "C.UTF-8", "HOME": "/nonexistent"},
                limit=65536,
                **credentials,
            )
            self._waiter = asyncio.create_task(self._child.wait())
        finally:
            os.close(fd)
        try:
            from .recovery import process_identity

            await self._identity(process_identity(self._child.pid))
            self._reader = asyncio.create_task(self._read())
            self._ready = await self._receive("ready", timeout=8)
            self._heartbeat = asyncio.create_task(self._heartbeats())
            return self.ready
        except BaseException:
            await self.close()
            raise

    async def _read(self) -> None:
        try:
            if self._child is None or self._child.stdout is None:
                raise WaylandGuardianError("wayland_guardian_disconnected")
            while line := await self._child.stdout.readline():
                if len(line) > 16384:
                    raise ValueError("oversized guardian receipt")
                row = json.loads(line)
                event = row.get("event")
                if event == "release_sent":
                    self._release_submitted = True
                elif event == "closed":
                    self._closed_receipt = True
                    self._last_terminal = row
                elif event == "unsupported_release":
                    self._failed = True
                if event not in {"idle", "release_begin", "release_sent"}:
                    self._events.put_nowait(row)
        except (Exception, asyncio.CancelledError):
            self._failed = True
        finally:
            if not self._events.full():
                self._events.put_nowait({"event": "transport_end"})

    async def _send(self, data: str):
        async with self._write_lock:
            if self._closing and data != "C\n":
                raise WaylandGuardianError("wayland_guardian_revoked")
            if (
                self._child is None
                or self._child.returncode is not None
                or self._child.stdin is None
                or self._child.stdin.is_closing()
            ):
                raise WaylandGuardianError("wayland_guardian_disconnected")
            self._child.stdin.write(data.encode("ascii"))
            await self._child.stdin.drain()

    async def _receive(self, event: str, *, timeout: float, pixel_guard=None):
        async def receive():
            previous_step = 0
            while True:
                row = await self._events.get()
                if row.get("event") == "pixel_gate":
                    step = row.get("step")
                    if (
                        pixel_guard is None
                        or set(row) != {"event", "step"}
                        or type(step) is not int
                        or not previous_step < step <= 1_000_000
                    ):
                        raise WaylandGuardianError("wayland_guardian_unexpected_receipt")
                    # One fresh authenticated focus check per native dispatch.
                    await asyncio.wait_for(pixel_guard(), 0.45)
                    await self._send(f"G {step}\n")
                    previous_step = step
                    continue
                if row.get("event") == event:
                    return row
                if row.get("event") == "action_rejected" and event == "action_done":
                    return row
                if row.get("event") in {"closed", "unsupported_release", "transport_end"}:
                    error = WaylandGuardianError("wayland_guardian_input_path_lost")
                    error.details = row
                    raise error
                if row.get("event") not in {"begun", "begin", "selected", "held"}:
                    raise WaylandGuardianError("wayland_guardian_unexpected_receipt")

        return await asyncio.wait_for(receive(), timeout)

    async def _heartbeats(self) -> None:
        try:
            while self.alive:
                await asyncio.sleep(0.4)
                await self._send("N\n")
        except (Exception, asyncio.CancelledError):
            return

    async def select(self, mapping_id):
        _mapping(mapping_id)
        async with self._action_lock:
            if not self.alive:
                raise WaylandGuardianError("wayland_guardian_not_active")
            await self._send(f"S {mapping_id}\n")
            self._ready = await self._receive("selected", timeout=2)
            return self.ready

    async def refresh_scope(self, deadline_ns: int):
        if self._active:
            await self._send(f"O {deadline_ns // 1000}\n")

    async def act(self, command: str, *, pixel_guard=None, scope_deadline_ns=None):
        if (
            type(command) is not str
            or not command
            or len(command) > 32000
            or command[0] not in "MPDKTJQWVLYZE"
            or "\n" in command
            or "\r" in command
            or "\x00" in command
            or (command.startswith("E ") != (pixel_guard is not None))
        ):
            raise WaylandGuardianError("wayland_guardian_invalid_action")
        async with self._action_lock:
            if not self.alive:
                raise WaylandGuardianError("wayland_guardian_not_active")
            self._active = True
            if scope_deadline_ns is not None and (
                type(scope_deadline_ns) is not int or self._ready.get("scope_lease_v1") is not True
            ):
                self._active = False
                raise WaylandGuardianError("wayland_guardian_scope_lease_unavailable")
            self._release_submitted = False
            self._last_terminal = {}
            try:
                scope = f" {scope_deadline_ns // 1000}" if scope_deadline_ns is not None else ""
                await self._send(f"B 2000{scope}\n" + command + "\n")
                receipt = await self._receive("action_done", timeout=3, pixel_guard=pixel_guard)
                self._active = False
            except BaseException as exc:
                await self.close()
                if isinstance(exc, Exception):
                    detail = _action_diagnostics(self._last_terminal)
                    error = WaylandGuardianError("wayland_guardian_input_path_lost")
                    error.details = {
                        "input_was_sent": self._last_terminal.get("input_was_sent"),
                        "diagnostics": detail
                        or {
                            "phase": "dispatch",
                            "steps_planned": 0,
                            "steps_completed": 0,
                            "release": "unknown",
                            "reason": "wayland_guardian_input_path_lost",
                        },
                    }
                    raise error from None
                raise
            if receipt.get("event") == "action_rejected":
                reason = receipt.get("reason")
                if reason not in _ACTION_REASONS:
                    reason = "wayland_guardian_input_path_lost"
                error = WaylandGuardianError(reason)
                error.details = {
                    **receipt,
                    "reason": reason,
                    "diagnostics": {
                        "phase": "preflight",
                        "steps_planned": 0,
                        "steps_completed": 0,
                        "release": "confirmed",
                        "reason": reason,
                    },
                }
                raise error
            detail = _action_diagnostics(receipt)
            receipt.pop("diagnostics", None)
            return {
                **receipt,
                "release_submitted": self._release_submitted,
                **({"diagnostics": detail} if detail is not None else {}),
            }

    async def _close(self) -> dict[str, bool]:
        self._closing = True
        if self._heartbeat:
            self._heartbeat.cancel()
            await asyncio.gather(self._heartbeat, return_exceptions=True)
        if self._child is None:
            return {"process_reaped": True, "release_submitted": True, "input_was_sent": False}
        try:
            await asyncio.wait_for(self._send("C\n"), 0.2)
        except Exception:
            pass
        if self._child.stdin is not None:
            self._child.stdin.close()
        if self._waiter is None:
            # A missing owner waiter cannot establish reaping or release.
            return {
                "process_reaped": False,
                "release_submitted": False,
                "input_was_sent": self._active,
            }
        try:
            await asyncio.wait_for(asyncio.shield(self._waiter), 3)
        except TimeoutError:
            # Keep exact native ownership; never kill a release supervisor to
            # manufacture cleanup. The native lease remains independent.
            return {
                "process_reaped": False,
                "release_submitted": False,
                "input_was_sent": self._active,
            }
        if self._reader:
            await asyncio.gather(self._reader, return_exceptions=True)
        released = (
            not self._failed
            and self._closed_receipt
            and self._child.returncode == 0
            and (not self._active or self._release_submitted)
        )
        return {
            "process_reaped": True,
            "release_submitted": released,
            "input_was_sent": self._active,
        }

    async def close(self):
        # Fence before scheduling cleanup, including writers already queued on
        # the transport lock. Only the exact cancel message may cross this fence.
        self._closing = True
        if self._cleanup is None or (
            self._cleanup.done() and self._child is not None and self._child.returncode is None
        ):
            self._cleanup = asyncio.create_task(self._close())
        return await asyncio.shield(self._cleanup)
