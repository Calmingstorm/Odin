"""Another input device plugging in or out never ends a stroke or quarantines a session.

On 2026-11-01 at 18:21:10 Aaron's USB webcam (0c45:636b, which registers a
keyboard for its snapshot button) dropped off USB and came back, 33 times that
day. Mid-stroke, the XI2 hierarchy event poisoned Odin's input connection: the
stroke stopped after 7 of 11 steps, the release could not be proven
(input_release_unknown), the session was quarantined, and reconcile refused
the changed device list. Only Odin's own endpoints (the seat's masters and
their XTEST slaves) identify his input; other slaves are re-counted and
watched for human input from their first event. Fake XInput only.
"""

import ctypes as C  # noqa: N812 - conventional ctypes ABI alias
from unittest.mock import Mock

import pytest

from src.computer.runtime import x11_guardian as g
from src.computer.runtime import x11_owned_device as m
from tests.test_computer_dispatch_cleanup_r19 import Helper
from tests.test_computer_x11_owned_device_r5 import TOPOLOGY, Fake

CAMERA = (9, "USB 2.0 Camera: USB Camera", 4, 3, True)


@pytest.fixture
def seat(monkeypatch):
    fake = Fake()
    fake.states = {4: {"buttons": set()}, 5: {"keys": set()}, 6: {"keys": set()},
                   7: {"buttons": set()}, 9: {"keys": set()}}
    monkeypatch.setattr(m, "_load_native", lambda: (fake.x, fake.xi, fake.xt))
    monkeypatch.setattr(m, "_endpoint_keymap", lambda *_: "same_map")
    monkeypatch.setattr(m.C, "CDLL", Mock(side_effect=AssertionError("real ABI forbidden")))
    native = m.ExistingXTest(":987")
    yield fake, native
    native.close()


def plug(fake, row=CAMERA):
    fake.rows.append(row)
    fake.add_event(row[0], 11)


def unplug(fake, row=CAMERA):
    fake.rows.remove(row)
    fake.add_event(row[0], 11)


def test_identity_ignores_other_devices_coming_and_going(seat):
    fake, native = seat
    before = native.identity()
    assert before == tuple(TOPOLOGY[:4])
    plug(fake)
    assert native.physical_events() == [] and native.identity() == before
    unplug(fake)
    assert native.physical_events() == [] and native.identity() == before
    native.key(38, True)
    native.key(38, False)
    assert ("key", 5, 38, True) in fake.calls


def plug_tap_unplug(fake):
    plug(fake)
    fake.add_event(9, 13)
    fake.add_event(9, 14)
    unplug(fake)


def test_a_device_used_and_unplugged_before_the_drain_still_counts(seat):
    """Odin's PR #754 review: a census taken at drain time had already lost it."""
    fake, native = seat
    plug_tap_unplug(fake)
    assert native.physical_events() == [("keys", 38, True), ("keys", 38, False)]
    assert not any(row[0] == 9 for row in native._physical)


def test_an_existing_keyboard_counts_across_an_earlier_unrelated_hotplug(seat):
    fake, native = seat
    plug(fake)  # the camera's hierarchy event is queued first
    fake.add_event(6, 13)
    fake.add_event(6, 14)
    fake.rows.remove(TOPOLOGY[4])  # then the keyboard is unplugged before the drain
    fake.add_event(6, 11)
    assert native.physical_events() == [("keys", 38, True), ("keys", 38, False)]


def test_other_seats_and_our_own_endpoints_are_not_human_input(seat):
    fake, native = seat
    fake.add_event(8, 13)  # a keyboard on another master
    fake.add_event(5, 13)  # our XTEST keyboard
    assert native.physical_events() == []


def test_held_state_skips_a_device_unplugged_since_the_census(seat):
    fake, native = seat
    plug(fake)
    native.physical_events()
    fake.rows.remove(CAMERA)  # gone, its hierarchy event not drained yet
    open_device = fake.xi.XOpenDevice
    fake.xi.XOpenDevice = lambda d, ident: None if ident == 9 else open_device(d, ident)
    assert native.physical_held() == {"keys": set(), "buttons": set()}
    fake.rows.append(CAMERA)  # still present: a failure to read it is a failure
    with pytest.raises(m.X11DeviceError, match="physical_device_unavailable"):
        native.physical_held()


def bad_device_on_close(fake):
    """XCloseDevice reports BadDevice for a removed device, through _checked."""
    handler, pending, close = [None], [], fake.xi.XCloseDevice

    def set_handler(value):
        previous, handler[0] = handler[0], value
        return previous

    def sync(*_):
        while pending:
            pending.pop()
            C.cast(handler[0], m._ERROR_HANDLER)(123, None)
        return 0

    def close_device(display, device):
        close(display, device)
        if device.contents.device_id not in {row[0] for row in fake.rows}:
            pending.append("BadDevice")
        return 0

    fake.x.XSetErrorHandler, fake.x.XSync, fake.xi.XCloseDevice = set_handler, sync, close_device


def unplug_during_state(fake, *, readable):
    query = fake.xi.XQueryDeviceState

    def state(display, device):
        if device.contents.device_id != CAMERA[0]:
            return query(display, device)
        result = query(display, device) if readable else None
        unplug(fake)
        return result

    fake.xi.XQueryDeviceState = state


@pytest.mark.parametrize("readable", [False, True])
def test_an_unplug_between_open_and_close_is_harmless(seat, readable):
    """Odin's PR #754 review: the handle close raised BadDevice."""
    fake, native = seat
    plug(fake)
    native.physical_events()
    bad_device_on_close(fake)
    unplug_during_state(fake, readable=readable)
    assert native.physical_held() == {"keys": set(), "buttons": set()}


def test_a_close_failure_on_a_device_still_present_is_a_failure(seat):
    fake, native = seat
    plug(fake)
    native.physical_events()
    bad_device_on_close(fake)
    close = fake.xi.XCloseDevice

    def close_device(display, device):
        if device.contents.device_id == CAMERA[0]:
            fake.rows.remove(CAMERA)  # absent while closing, so BadDevice is raised...
            try:
                return close(display, device)
            finally:
                fake.rows.append(CAMERA)  # ...but present again when checked
        return close(display, device)

    fake.xi.XCloseDevice = close_device
    with pytest.raises(m.X11DeviceError):
        native.physical_held()


def test_a_change_to_our_own_endpoints_still_poisons(seat):
    fake, native = seat
    fake.rows[2] = (11, "Virtual core XTEST pointer", 3, 2, True)
    fake.add_event(11, 11)
    with pytest.raises(m.X11DeviceError, match="device_topology_changed"):
        native.physical_events()
    fake.rows[2] = TOPOLOGY[2]  # restored identically: still poisoned
    with pytest.raises(m.X11DeviceError, match="device_topology_changed"):
        native.identity()


class Webcam(Helper):
    """A webcam drops off USB and comes back while the stroke's button is held."""

    def __init__(self, native, now, fake, events):
        super().__init__(native, now)
        self.fake, self.events = fake, events

    def exchange(self, command, guard):
        super().exchange(command, guard)
        for step, action in self.events:
            if len(self.commands) == step:
                action(self.fake)


def stroke(native, now, fake, events):
    plan = [("move", 10, 10), ("button", 1, True)]
    plan += [("move", 10 + i, 10) for i in range(1, 8)] + [("button", 1, False)]
    guardian = g.Guardian(native, Webcam(native, now, fake, events), lambda step: None,
                          controller_fd=None, clock=lambda: now[0])
    return guardian.run(plan), plan


def test_a_stroke_survives_a_webcam_reconnect_with_its_release_proven(seat, monkeypatch):
    """The 18:21 failure: drop at step 3, back at step 6, button held throughout."""
    fake, native = seat
    now = [0.0]
    monkeypatch.setattr(g.time, "sleep", lambda s: now.__setitem__(0, now[0] + s))
    receipt, plan = stroke(native, now, fake, [(3, plug), (6, unplug)])
    assert receipt["status"] == "executed" and receipt["released"] is True
    assert receipt["reason"] == "complete" and receipt["overlap_uncertain"] is False
    assert receipt["diagnostics"]["steps_completed"] == len(plan)


def test_a_stroke_survives_an_unplug_during_its_held_state_check(seat, monkeypatch):
    fake, native = seat
    plug(fake)
    native.physical_events()
    bad_device_on_close(fake)
    now = [0.0]
    monkeypatch.setattr(g.time, "sleep", lambda s: now.__setitem__(0, now[0] + s))
    receipt, plan = stroke(native, now, fake,
                           [(3, lambda f: unplug_during_state(f, readable=False))])
    assert receipt["status"] == "executed" and receipt["released"] is True
    assert receipt["diagnostics"]["steps_completed"] == len(plan)


@pytest.mark.parametrize("burst", ["new_device", "existing_keyboard"])
def test_a_tap_hidden_by_a_quick_hotplug_still_stops_the_stroke(seat, monkeypatch, burst):
    fake, native = seat
    now = [0.0]
    monkeypatch.setattr(g.time, "sleep", lambda s: now.__setitem__(0, now[0] + s))
    open_device = fake.xi.XOpenDevice
    fake.xi.XOpenDevice = lambda d, i: (
        open_device(d, i) if any(r[0] == i for r in fake.rows) else None)

    def existing_keyboard(f):
        plug(f)
        f.add_event(6, 13)
        f.add_event(6, 14)
        f.rows.remove(TOPOLOGY[4])
        f.add_event(6, 11)

    receipt, plan = stroke(native, now, fake, [
        (3, plug_tap_unplug if burst == "new_device" else existing_keyboard)])
    assert receipt["reason"] == "human_input_overlap"
    assert [c for c in fake.calls if c[0] == "button"][-1][3] in (0, False)


def test_human_input_on_the_new_device_still_stops_the_stroke(seat, monkeypatch):
    fake, native = seat
    now = [0.0]
    monkeypatch.setattr(g.time, "sleep", lambda s: now.__setitem__(0, now[0] + s))
    receipt, plan = stroke(native, now, fake,
                           [(3, plug), (4, lambda f: f.add_event(9, 13))])
    assert receipt["reason"] == "human_input_overlap"
    assert receipt["diagnostics"]["steps_completed"] < len(plan)
    assert not [c for c in fake.calls if c[0] == "button"][-1][3]  # the last edge is a release
