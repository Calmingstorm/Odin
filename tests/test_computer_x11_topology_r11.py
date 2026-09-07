"""RandR transient epochs, power fencing and crop, without touching a display."""
from dataclasses import replace
from types import SimpleNamespace as NS  # noqa: N814

import pytest

from src.computer.runtime.x11_capture import CaptureError, Monitor, Topology, X11MonitorCapture
from src.computer.runtime.x11_topology import RandRRevision, TopologyUnavailable, display_power
from src.computer.vision import FrameCrop


class Display:
    def __init__(self):
        self.events = []
        self.power = 0
        self.enabled = True
        self.extension = True

    def query_extension(self, name):
        return NS(present=True, first_event=90)

    def sync(self):
        pass

    def pending_events(self):
        return len(self.events)

    def next_event(self):
        return NS(type=self.events.pop(0))

    def has_extension(self, name):
        return self.extension

    def dpms_capable(self):
        return NS(capable=True)

    def dpms_info(self):
        return NS(state=self.enabled, power_level=self.power)


def test_randr_transient_change_restore_increments_even_when_snapshot_same():
    display = Display()
    masks = []
    revision = RandRRevision(display, NS(xrandr_select_input=masks.append))
    assert masks == [15]
    assert revision.drain() == 1
    display.events = [90, 91, 12, 91]
    assert revision.drain() == 4
    assert revision.drain() == 4


@pytest.mark.parametrize("level", [1, 2, 3])
def test_sleep_levels(level):
    display = Display()
    display.power = level
    assert display_power(display) == "display_asleep"
    display.enabled = False
    assert display_power(display) == "disabled"


def test_power_unavailable_and_unsupported():
    display = Display()
    assert display_power(display) == "on"
    display.power = 99
    with pytest.raises(TopologyUnavailable, match="display_power_unavailable"):
        display_power(display)
    display.extension = False
    assert display_power(display) == "unsupported"


class Connection:
    bits, pad = 32, 32

    def __init__(self, _):
        self.current = Topology(1, 8, 4, (Monitor((1,), 0, 0, 8, 4),))
        self.power = "on"
        self.images = 0
        self.change = False
        self.sleep = False

    def topology(self):
        return self.current

    def power_status(self):
        return self.power

    def image(self, monitor):
        self.images += 1
        if self.change:
            self.current = replace(self.current, event_revision=3)
        if self.sleep:
            self.power = "display_asleep"
        return bytes([1, 2, 3]) * 32

    def close(self):
        pass


def test_asleep_never_reads_frame_and_wake_allows_capture():
    capture = X11MonitorCapture(":177", enabled=True, connection_factory=Connection)
    capture._connection.power = "display_asleep"
    with pytest.raises(CaptureError, match="display_asleep"):
        capture.capture(capture.topology(), 0)
    assert capture._connection.images == 0
    capture._connection.power = "on"
    assert capture.capture(capture.topology(), 0).image_bytes


def test_crop_transform_and_stable_revision():
    capture = X11MonitorCapture(":177", enabled=True, connection_factory=Connection)
    a = capture.capture(capture.topology(), 0, crop=FrameCrop(2, 1, 3, 2))
    b = capture.capture(capture.topology(), 0)
    assert a.crop == (2, 1, 3, 2)
    assert (a.width, a.height) == (3, 2)
    assert a.delivered_to_source.map_point(0, 0) == (2, 1)
    assert a.source.source_revision == b.source.source_revision == 1


@pytest.mark.parametrize("change,reason", [("change", "topology_changed_during_capture"),
                                           ("sleep", "display_asleep")])
def test_changes_during_image_discard_frame(change, reason):
    capture = X11MonitorCapture(":177", enabled=True, connection_factory=Connection)
    setattr(capture._connection, change, True)
    with pytest.raises(CaptureError, match=reason):
        capture.capture(capture.topology(), 0)


def test_transient_revision_only_rejects_stale_observation():
    capture = X11MonitorCapture(":177", enabled=True, connection_factory=Connection)
    old = capture.topology()
    capture._connection.current = replace(old, event_revision=3)
    with pytest.raises(CaptureError, match="stale_capture_topology"):
        capture.capture(old, 0)
    assert capture._connection.images == 0


def test_worker_sleep_status_and_crop_contract(monkeypatch):
    from src.computer.runtime import x11_attached_worker as worker

    class Attached(Connection, worker.AttachedConnection):
        def named_sources(self, topology, names):
            return [{"name": "screen", "index": 0, "seal": "s", "width": 8, "height": 4}]

    monkeypatch.setattr(worker, "attachment_configuration", lambda d, a, m: {
        "display_name": d, "xauthority": a, "monitor_names": m})
    capture = X11MonitorCapture(":177", enabled=True, connection_factory=Attached)
    request = {"display_name": ":177", "xauthority": "/fake", "monitor_names": ["screen"],
               "operation": "sources"}
    selected = worker.run(request, capture)["sources"][0]
    request.update(operation="capture", selected=selected, crop={
        "x": 2, "y": 1, "width": 3, "height": 2})
    reply = worker.run(request, capture)
    assert reply["ok"] and reply["crop"] == (2, 1, 3, 2)
    assert reply["topology_revision"] == 1
    capture._connection.power = "display_asleep"
    reply = worker.run(request, capture)
    assert not reply["ok"] and reply["status"] == "display_asleep"
    assert "image" not in reply


def test_worker_static_error_redaction(monkeypatch):
    from src.computer.runtime import x11_attached_worker as worker

    def fail(request, capture):
        raise ValueError("secret native diagnostic")

    monkeypatch.setattr(worker, "run", fail)
    assert worker.safe_run({}) == {"ok": False, "error": "explicit_x11_capture_unavailable",
                                  "status": "explicit_x11_capture_unavailable"}
