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


def test_a_new_device_is_watched_from_its_first_event(seat):
    fake, native = seat
    fake.add_event(9, 13)  # before it exists on the seat: not ours to count
    plug(fake)
    fake.add_event(9, 13)  # a key on the newly plugged keyboard
    assert native.physical_events() == [("keys", 38, True)]
    assert any(row[0] == 9 for row in native._physical)
    unplug(fake)
    fake.add_event(9, 14)  # a late event from a removed device
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


def test_human_input_on_the_new_device_still_stops_the_stroke(seat, monkeypatch):
    fake, native = seat
    now = [0.0]
    monkeypatch.setattr(g.time, "sleep", lambda s: now.__setitem__(0, now[0] + s))
    receipt, plan = stroke(native, now, fake,
                           [(3, plug), (4, lambda f: f.add_event(9, 13))])
    assert receipt["reason"] == "human_input_overlap"
    assert receipt["diagnostics"]["steps_completed"] < len(plan)
    assert not [c for c in fake.calls if c[0] == "button"][-1][3]  # the last edge is a release
