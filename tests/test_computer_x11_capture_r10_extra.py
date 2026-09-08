"""In-process capture boundary tests; Xlib is always synthetic, never connected."""
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime import x11_capture as capture

NS = SimpleNamespace
MASKS = (0xFF0000, 0xFF00, 0xFF)


@pytest.fixture
def native(monkeypatch):
    visual = NS(visual_id=7, visual_class=4, red_mask=MASKS[0],
                green_mask=MASKS[1], blue_mask=MASKS[2])
    fmt = NS(depth=24, bits_per_pixel=32, scanline_pad=32)
    root = Mock()
    screen = NS(root=root, root_visual=7, root_depth=24,
                allowed_depths=[NS(visuals=[visual])])
    info = NS(pixmap_formats=[fmt], image_byte_order=0)
    display = Mock()
    display.screen.return_value = screen
    display.display = NS(info=info)
    module = ModuleType("Xlib")
    module.X = NS(TrueColor=4, ZPixmap=2)
    module.display = NS(Display=Mock(return_value=display))
    monkeypatch.setitem(sys.modules, "Xlib", module)
    revision = Mock()
    revision.drain.return_value = 1
    monkeypatch.setattr(capture, "RandRRevision", Mock(return_value=revision))
    return NS(module=module, display=display, root=root, screen=screen,
              visual=visual, fmt=fmt, info=info, revision=revision)


def test_native_initialization_topology_image_and_close(native):
    connection = capture._XlibConnection(":123")
    native.module.display.Display.assert_called_once_with(":123")
    native.root.xrandr_get_screen_resources_current.return_value = NS(
        config_timestamp=9, timestamp=10)
    native.root.get_geometry.return_value = NS(width=8, height=4)
    native.root.xrandr_get_monitors.return_value = NS(timestamp=11, monitors=[NS(
        name=42, crtcs=[13, 14], x=2, y=1, width_in_pixels=2, height_in_pixels=1)])
    topology = connection.topology()
    assert topology == capture.Topology(9, 8, 4, (
        capture.Monitor((42, (13, 14)), 2, 1, 2, 1),), 10, 11, 1)
    assert native.root.xrandr_get_screen_resources_current.call_count == 2
    native.root.xrandr_get_monitors.assert_called_once_with(True)
    assert native.revision.drain.call_count == 2
    native.root.get_image.return_value = NS(depth=24, data=bytes([3, 2, 1, 0]) * 2)
    assert connection.image(topology.monitors[0]) == bytes([1, 2, 3]) * 2
    native.root.get_image.assert_called_once_with(2, 1, 2, 1, 2, 0xFFFFFFFF)
    connection.close()
    native.display.close.assert_called_once_with()


@pytest.mark.parametrize("failure", ["class", "mask", "order", "bits", "pad",
                                     "missing_visual", "missing_format", "screen"])
def test_native_initialization_failure_closes_owned_connection(native, failure):
    if failure == "class":
        native.visual.visual_class = 0
    elif failure == "mask":
        native.visual.red_mask = 31
    elif failure == "order":
        native.info.image_byte_order = 2
    elif failure == "bits":
        native.fmt.bits_per_pixel = 16
    elif failure == "pad":
        native.fmt.scanline_pad = 64
    elif failure == "missing_visual":
        native.screen.root_visual = 99
    elif failure == "missing_format":
        native.info.pixmap_formats = []
    else:
        native.display.screen.side_effect = RuntimeError("synthetic private error")
    error = (StopIteration if failure.startswith("missing") else
             RuntimeError if failure == "screen" else capture.CaptureError)
    with pytest.raises(error):
        capture._XlibConnection(":123")
    native.display.close.assert_called_once_with()


def test_missing_optional_dependency(monkeypatch):
    monkeypatch.setitem(sys.modules, "Xlib", None)
    with pytest.raises(capture.CaptureError, match="capture_dependency_unavailable"):
        capture._XlibConnection(":123")


@pytest.mark.parametrize("reply", [None, NS(depth=16, data=bytes(4)),
                                   NS(depth=24, data=bytes(3)),
                                   NS(depth=24, data=bytes(8))])
def test_native_reply_must_match_exact_wire_size_and_depth(native, reply):
    connection = capture._XlibConnection(":123")
    native.root.get_image.return_value = reply
    with pytest.raises(capture.CaptureError, match="capture_reply_mismatch"):
        connection.image(capture.Monitor((1,), 0, 0, 1, 1))


@pytest.mark.parametrize("field,value", [
    ("epoch", -1), ("epoch", True), ("epoch", 2**32),
    ("configuration_time", -1), ("monitor_time", 2**32),
    ("width", True), ("height", 1.5), ("width", 0), ("height", 32768),
    ("monitors", []), ("monitors", ()), ("monitors", (object(),)),
    ("monitors", tuple(capture.Monitor((i,), 0, 0, 1, 1) for i in range(17))),
])
def test_invalid_topology_fields(field, value):
    fields = dict(epoch=1, width=4, height=4,
                  monitors=(capture.Monitor((1,), 0, 0, 1, 1),))
    fields[field] = value
    with pytest.raises(capture.CaptureError, match="unsupported_topology"):
        capture.Topology(**fields)


def test_ambiguous_native_monitor_identity():
    monitor = capture.Monitor((1,), 0, 0, 1, 1)
    with pytest.raises(capture.CaptureError, match="ambiguous_monitor_identity"):
        capture.Topology(1, 4, 4, (monitor, monitor))


@pytest.mark.parametrize("rect", [(True, 0, 1, 1), (-1, 0, 1, 1), (0, -1, 1, 1),
                                  (0, 0, 0, 1), (0, 0, 1, 0), (3, 0, 2, 1),
                                  (0, 3, 1, 2)])
def test_monitor_rectangle_rejection(rect):
    with pytest.raises(capture.CaptureError, match="monitor_outside_root"):
        capture.Topology(1, 4, 4, (capture.Monitor((1,), *rect),))


@pytest.mark.parametrize("limit", ["MAX_SOURCE_BYTES", "MAX_CAPTURE_WORKING_BYTES"])
def test_wire_and_working_set_budget_refuse_before_allocating(monkeypatch, limit):
    monkeypatch.setattr(capture, limit, 3)
    with pytest.raises(capture.CaptureError, match="capture_allocation_limit"):
        capture.capture_budget(1, 1, 32, 32)


def test_bytearray_is_not_an_accepted_wire_reply():
    with pytest.raises(capture.CaptureError, match="unsupported_or_malformed_pixels"):
        capture.packed_rgb(bytearray(4), 1, 1, bits=32, pad=32,
                           byte_order=0, masks=MASKS)


def test_connection_failure_has_static_public_error(native):
    native.module.display.Display.side_effect = RuntimeError("private display details")
    with pytest.raises(capture.CaptureError) as caught:
        capture.X11MonitorCapture(":123", enabled=True)
    assert str(caught.value) == "capture_connection_unavailable"
    assert caught.value.__suppress_context__


@pytest.mark.parametrize("failure", ["wrong_type", "exception", "image"])
def test_attachment_sanitizes_native_failures(failure):
    topology = capture.Topology(1, 4, 4, (capture.Monitor((1,), 0, 0, 1, 1),))
    connection = Mock(bits=32, pad=32)
    connection.topology.return_value = topology
    attached = capture.X11MonitorCapture(":123", enabled=True,
                                         connection_factory=lambda _: connection)
    if failure == "wrong_type":
        connection.topology.return_value = object()
    elif failure == "exception":
        connection.topology.side_effect = RuntimeError("private topology details")
    else:
        connection.image.side_effect = RuntimeError("private pixels")
    with pytest.raises(capture.CaptureError) as caught:
        attached.capture(topology, 0)
    assert str(caught.value) == ("capture_failed" if failure == "image" else
                                 "capture_topology_unavailable")
    assert caught.value.__suppress_context__
    attached.close()
    attached.close()
    connection.close.assert_called_once_with()
