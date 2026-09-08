"""Explicit, read-only X11 monitor capture. No input, desktop discovery or fallback.

Not an attached input backend: each capture gets a new source identity and NO
input mapping. Callers supply consent and enforce a subprocess deadline because
the Xlib reply path is synchronous. Native origins/IDs remain inside this module.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

from ..geometry import SourceGeometry
from ..models import BackendObservation, CaptureScope
from ..render import MAX_SOURCE_BYTES, render_frame, source_allocation_bytes
from ..vision import FrameCrop
from .x11_topology import RandRRevision, display_power

MAX_MONITORS = 16
MAX_CAPTURE_WORKING_BYTES = 128 * 1024 * 1024


class CaptureError(ValueError):
    """Static pixel-free failure; native server exceptions are not public output."""


@dataclass(frozen=True)
class Monitor:
    """Backend-private rectangle, never a public action coordinate plane."""

    identity: tuple = field(repr=False)
    x: int = field(repr=False)
    y: int = field(repr=False)
    width: int
    height: int


@dataclass(frozen=True)
class Topology:
    epoch: int
    width: int
    height: int
    monitors: tuple[Monitor, ...]
    configuration_time: int = 0
    monitor_time: int = 0
    event_revision: int = 1

    def __post_init__(self):
        if (
            type(self.event_revision) is not int
            or self.event_revision < 1
            or any(
                type(v) is not int or not 0 <= v < 2**32
                for v in (self.epoch, self.configuration_time, self.monitor_time)
            )
            or type(self.width) is not int
            or type(self.height) is not int
            or not 1 <= self.width <= 32767
            or not 1 <= self.height <= 32767
            or type(self.monitors) is not tuple
            or not 1 <= len(self.monitors) <= MAX_MONITORS
        ):
            raise CaptureError("unsupported_topology")
        if any(type(m) is not Monitor for m in self.monitors):
            raise CaptureError("unsupported_topology")
        if len({m.identity for m in self.monitors}) != len(self.monitors):
            raise CaptureError("ambiguous_monitor_identity")
        for monitor in self.monitors:
            if (
                type(monitor) is not Monitor
                or any(
                    type(v) is not int
                    for v in (monitor.x, monitor.y, monitor.width, monitor.height)
                )
                or monitor.x < 0
                or monitor.y < 0
                or min(monitor.width, monitor.height) < 1
                or monitor.x + monitor.width > self.width
                or monitor.y + monitor.height > self.height
            ):
                raise CaptureError("monitor_outside_root")


def capture_budget(width: int, height: int, bits: int, pad: int) -> tuple[int, int]:
    """Budget padded wire bytes AND simultaneous reply/RGB copies before GetImage."""
    packed = source_allocation_bytes(width, height, "RGB")
    if bits not in (24, 32) or pad not in (8, 16, 32):
        raise CaptureError("unsupported_pixel_format")
    stride = ((width * bits + pad - 1) // pad) * (pad // 8)
    payload = stride * height
    wire = (payload + 3) // 4 * 4  # X11 reply padding, distinct from scanline padding.
    # Allow protocol receive/reply buffers and both packed bytearray/bytes copies.
    # Rendering has a separate bounded delivered allocation. Not a total RSS claim.
    if wire > MAX_SOURCE_BYTES or 2 * wire + 2 * packed > MAX_CAPTURE_WORKING_BYTES:
        raise CaptureError("capture_allocation_limit")
    return stride, payload


def packed_rgb(
    data: bytes,
    width: int,
    height: int,
    *,
    bits: int,
    pad: int,
    byte_order: int,
    masks: tuple[int, int, int],
) -> bytes:
    """Decode only the measured TrueColor8 layout; unsupported visuals fail closed."""
    stride, expected = capture_budget(width, height, bits, pad)
    if (
        type(data) is not bytes
        or len(data) != expected
        or byte_order not in (0, 1)
        or masks != (0xFF0000, 0xFF00, 0xFF)
    ):
        raise CaptureError("unsupported_or_malformed_pixels")
    channels = bits // 8
    out = bytearray(width * height * 3)
    positions = (2, 1, 0) if byte_order == 0 else ((1, 2, 3) if bits == 32 else (0, 1, 2))
    for row in range(height):
        start, target = row * stride, row * width * 3
        for channel, position in enumerate(positions):
            out[target + channel : target + width * 3 : 3] = data[
                start + position : start + width * channels : channels
            ]
    return bytes(out)


class _XlibConnection:
    def __init__(self, display_name: str):
        try:
            from Xlib import X, display  # type: ignore[import-untyped]
        except ImportError:
            raise CaptureError("capture_dependency_unavailable: python-xlib required") from None
        self._x = X
        self._display = display.Display(display_name)
        try:
            self._screen = self._display.screen()
            self._root = self._screen.root
            visual = next(
                v
                for d in self._screen.allowed_depths
                for v in d.visuals
                if v.visual_id == self._screen.root_visual
            )
            fmt = next(
                f
                for f in self._display.display.info.pixmap_formats
                if f.depth == self._screen.root_depth
            )
            self.bits, self.pad = int(fmt.bits_per_pixel), int(fmt.scanline_pad)
            self.byte_order = int(self._display.display.info.image_byte_order)
            self.masks = (int(visual.red_mask), int(visual.green_mask), int(visual.blue_mask))
            if (
                visual.visual_class != X.TrueColor
                or self.masks != (0xFF0000, 0xFF00, 0xFF)
                or self.byte_order not in (0, 1)
            ):
                raise CaptureError("unsupported_pixel_format")
            capture_budget(1, 1, self.bits, self.pad)
            self._topology_events = RandRRevision(self._display, self._root)
        except BaseException:
            self._display.close()
            raise

    def topology(self) -> Topology:
        revision = self._topology_events.drain()
        resources = self._root.xrandr_get_screen_resources_current()
        geometry = self._root.get_geometry()
        reply = self._root.xrandr_get_monitors(True)
        after = self._root.xrandr_get_screen_resources_current()
        if revision != self._topology_events.drain() or (
            resources.config_timestamp,
            resources.timestamp,
        ) != (after.config_timestamp, after.timestamp):
            raise CaptureError("topology_changed_during_snapshot")
        return Topology(
            int(resources.config_timestamp),
            int(geometry.width),
            int(geometry.height),
            tuple(
                Monitor(
                    (int(m.name), tuple(int(v) for v in m.crtcs)),
                    int(m.x),
                    int(m.y),
                    int(m.width_in_pixels),
                    int(m.height_in_pixels),
                )
                for m in reply.monitors
            ),
            int(resources.timestamp),
            int(reply.timestamp),
            revision,
        )

    def power_status(self):
        return display_power(self._display)

    def image(self, monitor: Monitor) -> bytes:
        _, expected = capture_budget(monitor.width, monitor.height, self.bits, self.pad)
        reply = self._root.get_image(
            monitor.x, monitor.y, monitor.width, monitor.height, self._x.ZPixmap, 0xFFFFFFFF
        )
        reply_bytes = (expected + 3) // 4 * 4
        if (
            reply is None
            or reply.depth != self._screen.root_depth
            or len(reply.data) != reply_bytes
        ):
            raise CaptureError("capture_reply_mismatch")
        return packed_rgb(
            reply.data[:expected],
            monitor.width,
            monitor.height,
            bits=self.bits,
            pad=self.pad,
            byte_order=self.byte_order,
            masks=self.masks,
        )

    def close(self):
        self._display.close()


class X11MonitorCapture:
    """Server-internal explicit attachment; no connection unless enabled=True.

    Its owner must run this synchronous helper with an external hard deadline and
    close it on revocation. It has no API for input, focus, wake, device or settings
    changes. No integration factory or public tool currently instantiates it.
    """

    def __init__(
        self,
        display_name: str,
        *,
        enabled: bool = False,
        consent_generation: int = 1,
        connection_factory=None,
    ):
        if not enabled:
            raise CaptureError("capture_disabled")
        if (
            type(display_name) is not str
            or not display_name.startswith(":")
            or not display_name[1:].isdigit()
            or len(display_name) > 6
        ):
            raise CaptureError("explicit_local_display_required")
        CaptureScope(consent_generation, frozenset())
        self._generation = consent_generation
        self._closed = False
        factory = connection_factory or _XlibConnection
        try:
            self._connection = factory(display_name)
        except Exception:
            raise CaptureError("capture_connection_unavailable") from None

    def topology(self) -> Topology:
        if self._closed:
            raise CaptureError("capture_revoked")
        try:
            result = self._connection.topology()
            if type(result) is not Topology:
                raise CaptureError("unsupported_topology")
            return result
        except Exception:
            raise CaptureError("capture_topology_unavailable") from None

    def power_status(self):
        if self._closed:
            raise CaptureError("capture_revoked")
        return self._connection.power_status()

    def capture(
        self, topology: Topology, index: int, *, crop: FrameCrop | None = None
    ) -> BackendObservation:
        if (
            type(topology) is not Topology
            or type(index) is not int
            or not 0 <= index < len(topology.monitors)
        ):
            raise CaptureError("invalid_monitor_selection")
        if self.topology() != topology:
            raise CaptureError("stale_capture_topology")
        if self.power_status() == "display_asleep":
            raise CaptureError("display_asleep")
        monitor = topology.monitors[index]
        # The full desktop may exceed budget. Never allocate it and crop afterward.
        capture_budget(monitor.width, monitor.height, self._connection.bits, self._connection.pad)
        started = time.monotonic_ns()
        try:
            pixels = self._connection.image(monitor)
        except Exception:
            raise CaptureError("capture_failed") from None
        if self.topology() != topology:
            raise CaptureError("topology_changed_during_capture")
        if self.power_status() == "display_asleep":
            raise CaptureError("display_asleep")
        source = SourceGeometry(
            uuid.uuid4().hex,
            topology.event_revision,
            self._generation,
            monitor.width,
            monitor.height,
        )
        rendered = render_frame(
            pixels,
            source,
            mode="RGB",
            observation_id=uuid.uuid4().hex,
            session_id=uuid.uuid4().hex,
            generation=1,
            captured_monotonic_ns=started,
            crop=crop,
        )
        if self.topology() != topology:
            raise CaptureError("topology_changed_during_render")
        if self.power_status() == "display_asleep":
            raise CaptureError("display_asleep")
        meta = rendered.metadata
        return BackendObservation(
            source,
            CaptureScope(self._generation, frozenset({source.source_id})),
            meta.width,
            meta.height,
            meta.delivered_to_source,
            rendered.png,
            resize_scale=meta.resize_scale,
            crop=(crop.x, crop.y, crop.width, crop.height) if crop else None,
        )

    def close(self):
        if not self._closed:
            self._closed = True
            self._connection.close()
