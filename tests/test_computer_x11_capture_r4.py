"""Read-only monitor capture, format budgets and topology fencing without a display."""
import importlib
import subprocess
import sys
from types import SimpleNamespace

import pytest

from src.computer.runtime.x11_capture import (
    CaptureError,
    Monitor,
    Topology,
    X11MonitorCapture,
    _XlibConnection,
    capture_budget,
    packed_rgb,
)

MASKS = (0xFF0000, 0xFF00, 0xFF)


@pytest.mark.parametrize("bits,pad,order,data", [
    (32, 32, 0, bytes([3, 2, 1, 0, 6, 5, 4, 0])),
    (32, 32, 1, bytes([0, 1, 2, 3, 0, 4, 5, 6])),
    (24, 8, 0, bytes([3, 2, 1, 6, 5, 4])),
    (24, 8, 1, bytes([1, 2, 3, 4, 5, 6])),
    (24, 32, 0, bytes([3, 2, 1, 6, 5, 4, 0, 0])),
])
def test_pixel_decode(bits, pad, order, data):
    assert packed_rgb(data * 2, 2, 2, bits=bits, pad=pad, byte_order=order,
                      masks=MASKS) == bytes([1, 2, 3, 4, 5, 6]) * 2


@pytest.mark.parametrize("width,height", [(1920, 1080), (2560, 1440), (3440, 1440),
                                         (3840, 2160)])
def test_each_actual_monitor_and_4k_fits(width, height):
    assert capture_budget(width, height, 32, 32) == (width * 4, width * height * 4)


def test_spanned_root_must_not_be_captured_then_cropped():
    with pytest.raises(ValueError, match="allocation_limit"):
        capture_budget(7920, 2520, 32, 32)


@pytest.mark.parametrize("bits,pad", [(16, 32), (32, 64), (8, 8)])
def test_unsupported_native_formats(bits, pad):
    with pytest.raises(CaptureError):
        capture_budget(2, 2, bits, pad)


@pytest.mark.parametrize("data,order,masks", [(b"", 0, MASKS), (bytes(16), 2, MASKS),
                                             (bytes(16), 0, (31, 63, 31))])
def test_malformed_reply(data, order, masks):
    with pytest.raises(CaptureError):
        packed_rgb(data, 2, 2, bits=32, pad=32, byte_order=order, masks=masks)


class FakeConnection:
    bits, pad = 32, 32

    def __init__(self):
        self.current = Topology(4, 30, 20, (Monitor((1,), 12, 5, 8, 4),))
        self.closed, self.images = False, []
        self.change_during_capture = False

    def topology(self):
        return self.current

    def power_status(self):
        return "on"

    def image(self, monitor):
        self.images.append(monitor)
        if self.change_during_capture:
            self.current = Topology(5, 30, 20, (Monitor((2,), 12, 5, 8, 4),))
        return bytes([128, 10, 20]) * monitor.width * monitor.height

    def close(self):
        self.closed = True


def opened():
    connection = FakeConnection()
    return X11MonitorCapture(":177", enabled=True,
                             connection_factory=lambda _: connection), connection


def test_disabled_never_connects():
    with pytest.raises(CaptureError, match="disabled"):
        X11MonitorCapture(":177", connection_factory=lambda _: pytest.fail("connected"))


@pytest.mark.parametrize("display", ["", None, "hostname:0", ":", ":0.0", ":0\n"])
def test_no_discovery_or_remote_fallback(display):
    with pytest.raises(CaptureError, match="explicit_local_display"):
        X11MonitorCapture(display, enabled=True,
                          connection_factory=lambda _: pytest.fail("connected"))


def test_source_local_fresh_capture_only_and_close():
    capture, connection = opened()
    topology = capture.topology()
    first = capture.capture(topology, 0)
    second = capture.capture(topology, 0)
    assert (first.width, first.height) == (8, 4)
    assert first.source.source_id != second.source.source_id
    assert first.source.pixel_to_input is None and not first.scope.input_sources
    assert not first.focused
    assert first.delivered_to_source.map_point(0, 0) == (0, 0)
    assert connection.images == [topology.monitors[0]] * 2
    capture.close()
    capture.close()
    assert connection.closed
    with pytest.raises(CaptureError, match="revoked"):
        capture.capture(topology, 0)


def test_same_geometry_replacement_before_capture_refuses():
    capture, connection = opened()
    old = capture.topology()
    connection.current = Topology(5, 30, 20, (Monitor((2,), 12, 5, 8, 4),))
    with pytest.raises(CaptureError, match="stale_capture"):
        capture.capture(old, 0)
    assert not connection.images


@pytest.mark.parametrize("which", ["configuration_time", "monitor_time"])
def test_change_and_restore_timestamps_invalidate_capture(which):
    capture, connection = opened()
    old = capture.topology()
    connection.current = Topology(old.epoch, old.width, old.height, old.monitors, **{which: 1})
    with pytest.raises(CaptureError, match="stale_capture"):
        capture.capture(old, 0)
    assert not connection.images


def test_native_getimage_trailing_protocol_padding():
    connection = _XlibConnection.__new__(_XlibConnection)
    connection.bits, connection.pad, connection.byte_order = 24, 8, 0
    connection.masks = MASKS
    connection._screen = SimpleNamespace(root_depth=24)
    connection._x = SimpleNamespace(ZPixmap=2)
    connection._root = SimpleNamespace(get_image=lambda *a: SimpleNamespace(
        depth=24, data=bytes([3, 2, 1, 0])))
    assert connection.image(Monitor((1,), 0, 0, 1, 1)) == bytes([1, 2, 3])


def test_native_topology_snapshot_is_bracketed():
    connection = _XlibConnection.__new__(_XlibConnection)
    connection._topology_events = SimpleNamespace(drain=lambda: 1)
    times = iter([SimpleNamespace(config_timestamp=2, timestamp=1),
                  SimpleNamespace(config_timestamp=2, timestamp=3)])
    connection._root = SimpleNamespace(
        xrandr_get_screen_resources_current=lambda: next(times),
        get_geometry=lambda: SimpleNamespace(width=30, height=20),
        xrandr_get_monitors=lambda _: SimpleNamespace(monitors=[], timestamp=4))
    with pytest.raises(CaptureError, match="during_snapshot"):
        connection.topology()


def test_observation_repr_does_not_dump_private_pixels():
    capture, _ = opened()
    observation = capture.capture(capture.topology(), 0)
    assert "image_bytes=" not in repr(observation)


def test_same_geometry_replacement_during_capture_refuses():
    capture, connection = opened()
    connection.change_during_capture = True
    with pytest.raises(CaptureError, match="changed_during_capture"):
        capture.capture(capture.topology(), 0)


def test_topology_changed_while_rendering_refuses(monkeypatch):
    module = importlib.import_module("src.computer.runtime.x11_capture")
    original = module.render_frame
    capture, connection = opened()

    def changed(*args, **kwargs):
        result = original(*args, **kwargs)
        connection.current = Topology(5, 30, 20, (Monitor((2,), 12, 5, 8, 4),))
        return result

    monkeypatch.setattr(module, "render_frame", changed)
    with pytest.raises(CaptureError, match="changed_during_render"):
        capture.capture(capture.topology(), 0)


@pytest.mark.parametrize("index", [-1, 1, True, 0.0, None])
def test_selection_is_bounded(index):
    capture, connection = opened()
    with pytest.raises(CaptureError, match="invalid_monitor"):
        capture.capture(capture.topology(), index)
    assert not connection.images


def test_import_does_not_import_optional_dependencies():
    result = subprocess.run([sys.executable, "-c", "import sys; "
                             "import src.computer.runtime.x11_capture; "
                             "assert 'Xlib' not in sys.modules; "
                             "assert 'PIL' not in sys.modules"],
                            capture_output=True, text=True, timeout=5)
    assert result.returncode == 0, result.stderr


def test_capture_class_has_no_input_or_desktop_mutation_api():
    public = {name for name in vars(X11MonitorCapture) if not name.startswith("_")}
    assert public == {"topology", "power_status", "capture", "close"}
