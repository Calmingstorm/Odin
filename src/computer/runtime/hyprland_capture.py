"""Unwired explicit-output screencopy client, never an implicit desktop selector.

The scope callback is a trusted integration seam, NOT public consent. No
qualified Hyprland compositor-loop scope provider is shipped by this module.
"""

from __future__ import annotations

import asyncio
import math
import os
import re
import signal
import socket
import struct
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from ..models import ComputerError
from .hyprland_identity import HyprlandIdentity, peer_credentials, remaining, revalidate

HEADER = struct.Struct("<8s6I")
MAX_BYTES = 128 * 1024 * 1024
SCOPE_LEASE_NS = 250_000_000


class HyprlandCaptureError(ComputerError):
    """Static errors; helper output never enters error messages."""


@dataclass(frozen=True)
class ExplicitOutput:
    name: str
    width: int
    height: int
    transform: int
    logical_x: int
    logical_y: int
    logical_width: int
    logical_height: int

    def __post_init__(self):
        if (
            type(self.name) is not str
            or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", self.name)
            or any(type(v) is not int for v in (
                self.width, self.height, self.transform, self.logical_x, self.logical_y,
                self.logical_width, self.logical_height,
            ))
            or not 0 <= self.transform <= 7
            or min(self.width, self.height, self.logical_width, self.logical_height) < 1
            or max(self.width, self.height, self.logical_width, self.logical_height) > 16384
            or self.width * self.height > 32_000_000
            or self.width * self.height * 8 > MAX_BYTES
            or max(abs(self.logical_x), abs(self.logical_y)) > 2**30
        ):
            raise HyprlandCaptureError("hyprland_invalid_explicit_output")

    @property
    def oriented_size(self) -> tuple[int, int]:
        return (self.height, self.width) if self.transform & 1 else (self.width, self.height)

    def native_to_local(self, x: int, y: int) -> tuple[float, float]:
        """Native pixel center -> output-local logical coordinates, never global.

        wl_output transforms are counter-clockwise; flipped variants reflect
        around the vertical axis before rotation. Integer source pixels only.
        """
        if (
            type(x) is not int or type(y) is not int
            or not 0 <= x < self.width or not 0 <= y < self.height
        ):
            raise HyprlandCaptureError("hyprland_pixel_out_of_bounds")
        u, v = (x + 0.5) / self.width, (y + 0.5) / self.height
        if self.transform & 4:
            u = 1 - u
        turn = self.transform & 3
        if turn == 1:
            u, v = v, 1 - u
        elif turn == 2:
            u, v = 1 - u, 1 - v
        elif turn == 3:
            u, v = 1 - v, u
        return u * self.logical_width, v * self.logical_height


@dataclass(frozen=True)
class ScopeProof:
    """Measured by a future authenticated provider; construction is not proof."""

    identity_digest: str
    output: ExplicitOutput
    revision: int
    consent_generation: int
    measured_ns: int
    locked: bool | None
    scope_digest: str

    def check(self, identity: HyprlandIdentity, output: ExplicitOutput) -> None:
        age = time.monotonic_ns() - self.measured_ns if type(self.measured_ns) is int else -1
        if (
            self.locked is not False or not 0 <= age < SCOPE_LEASE_NS
            or type(self.revision) is not int or self.revision < 1
            or type(self.consent_generation) is not int or self.consent_generation < 1
            or self.identity_digest != identity.digest or self.output != output
            or type(self.scope_digest) is not str
            or not re.fullmatch(r"[0-9a-f]{64}", self.scope_digest)
        ):
            raise HyprlandCaptureError("hyprland_scope_unknown_locked_or_stale")

    def binding(self):
        return (
            self.identity_digest, self.output, self.revision,
            self.consent_generation, self.scope_digest,
        )


@dataclass(frozen=True)
class NativeFrame:
    """Top-down packed BGRX native raster; transform is explicit metadata."""

    output: ExplicitOutput
    pixels: bytes
    scope: ScopeProof


def parse_header(header: bytes, output: ExplicitOutput) -> int:
    if len(header) != HEADER.size:
        raise HyprlandCaptureError("hyprland_capture_header_invalid")
    magic, width, height, stride, fmt, flags, size = HEADER.unpack(header)
    if (
        magic != b"ODINSC01" or width != output.width or height != output.height
        or stride != width * 4 or fmt != 1 or flags != 0
        or size != stride * height or size > MAX_BYTES // 2
    ):
        raise HyprlandCaptureError("hyprland_capture_header_invalid")
    return size


async def _reap(process: asyncio.subprocess.Process):
    if process.returncode is None:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    # Drain after killing: Process.wait can otherwise wait forever on a paused
    # stdout pipe when a rejected helper flooded the bounded reader.
    if process.stdout is not None:
        while await process.stdout.read(65536):
            pass
    await process.wait()


async def capture_explicit_output(
    *, helper: str, wayland: socket.socket, identity: HyprlandIdentity,
    output: ExplicitOutput, scope: Callable[[], Awaitable[ScopeProof]],
    timeout_seconds: float = 3.0,
) -> NativeFrame:
    """Consume a pinned unused socket; return only a post-fenced native frame.

    Requires an explicitly trusted helper and future qualified scope provider.
    Even preflight failure consumes/closes the connection. The scope seam must
    fence consent/revocation in the compositor loop; IPC polling is insufficient.
    Rechecking a Python object is not native proof. Not runtime-registered.
    """
    process = None
    try:
        if (
            type(helper) is not str or not helper.startswith("/")
            or any(ord(c) < 32 for c in helper)
            or type(timeout_seconds) not in {int, float}
            or not math.isfinite(timeout_seconds) or not 0.001 <= timeout_seconds <= 30
            or type(output) is not ExplicitOutput or type(identity) is not HyprlandIdentity
        ):
            raise HyprlandCaptureError("hyprland_capture_configuration_invalid")
        deadline = time.monotonic() + timeout_seconds
        if peer_credentials(wayland) != (identity.process.pid, identity.process.uid):
            raise HyprlandCaptureError("hyprland_capture_peer_mismatch")
        await revalidate(identity, deadline)
        before = await asyncio.wait_for(scope(), remaining(deadline))
        if type(before) is not ScopeProof:
            raise HyprlandCaptureError("hyprland_scope_unknown_locked_or_stale")
        before.check(identity, output)
        args = (
            helper, str(wayland.fileno()), str(identity.process.pid), str(identity.process.uid),
            output.name, str(output.width), str(output.height), str(output.transform),
            str(max(1, int(remaining(deadline) * 1000))),
        )
        spawning = asyncio.create_task(asyncio.create_subprocess_exec(
            *args, pass_fds=(wayland.fileno(),), stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            start_new_session=True, env={"LC_ALL": "C"}, limit=65536,
        ))
        try:
            process = await asyncio.shield(spawning)
        except asyncio.CancelledError:
            # Preserve ownership if cancellation races fork/exec completion.
            process = await spawning
            raise
        wayland.close()
        if process.stdout is None:
            raise HyprlandCaptureError("hyprland_capture_transport_failed")
        header = await asyncio.wait_for(
            process.stdout.readexactly(HEADER.size), remaining(deadline)
        )
        size = parse_header(header, output)
        pixels = await asyncio.wait_for(process.stdout.readexactly(size), remaining(deadline))
        extra = await asyncio.wait_for(process.stdout.read(1), remaining(deadline))
        status = await asyncio.wait_for(process.wait(), remaining(deadline))
        if extra or status != 0:
            raise HyprlandCaptureError("hyprland_capture_helper_failed")
        await revalidate(identity, deadline)
        after = await asyncio.wait_for(scope(), remaining(deadline))
        if type(after) is not ScopeProof:
            raise HyprlandCaptureError("hyprland_scope_unknown_locked_or_stale")
        after.check(identity, output)
        if before.binding() != after.binding():
            raise HyprlandCaptureError("hyprland_capture_scope_changed")
        return NativeFrame(output, pixels, after)
    except (OSError, TimeoutError, asyncio.IncompleteReadError):
        raise HyprlandCaptureError("hyprland_capture_transport_failed") from None
    finally:
        wayland.close()
        if process is not None:
            cleanup = asyncio.create_task(_reap(process))
            try:
                await asyncio.shield(cleanup)
            except asyncio.CancelledError:
                await cleanup
                raise
