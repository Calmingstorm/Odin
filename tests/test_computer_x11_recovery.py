"""Fake-only recovery checks. No display, process, or native library access."""
import asyncio
import copy
import ctypes
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import x11_recovery as recovery
from tests.test_computer_adapters_r11 import backend, capture


@pytest.fixture(autouse=True)
def no_native(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Native desktop/process access forbidden")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    monkeypatch.setattr(ctypes, "CDLL", forbidden)


def binding():
    return {"window": 11, "process": {"pid": 20, "start_ticks": 5},
            "window_rect": [100, 200, 600, 400], "rect": [100, 200, 600, 400],
            "source_rect": [0, 0, 1000, 800], "source_origin": [0, 0],
            "topology": {"root": 1}, "transient_chain": [], "modal": False,
            "focused": True, "focus_window": 12, "window_kind": "normal",
            "states": [42], "fingerprint": "first"}


def test_scope_identity_excludes_epoch_not_geometry_or_process():
    old = binding()
    new = {**old, "fingerprint": "second", "focused": False, "keyboard_focus": 99}
    assert recovery.same_scope(old, new)
    for key, value in (("window", 13), ("process", {"pid": 20, "start_ticks": 6}),
                       ("window_rect", [110, 200, 600, 400]),
                       ("rect", [100, 200, 500, 400]), ("focus_window", 14),
                       ("modal", True), ("transient_chain", [1])):
        assert not recovery.same_scope(old, {**new, key: value}), key
    assert not recovery.same_scope({}, {})
    assert not recovery.same_scope(old, {k: v for k, v in new.items() if k != "process"})


def test_only_focused_wm_state_may_change():
    old = binding()
    assert recovery.same_scope(old, {**old, "states": []}, focus_state_atom=42)
    assert not recovery.same_scope(old, {**old, "states": [7]}, focus_state_atom=42)


class Clock:
    def __init__(self):
        self.now = 0.0
    def __call__(self):
        return self.now
    def sleep(self, seconds):
        self.now += seconds


class Native:
    def __init__(self, clock, *, edge_at=None, held_until=0):
        self.clock = clock
        self.edge_at = edge_at
        self.held_until = held_until
    def physical_held(self):
        return {"keys": {50} if self.clock() < self.held_until else set(), "buttons": set()}
    def physical_events(self, *, include_motion=False):
        assert include_motion is True
        if self.edge_at is not None and self.clock() >= self.edge_at:
            self.edge_at = None
            return [("motion", 0, True)]
        return []


@pytest.mark.parametrize("edge_at,held_until,min_time", [(None, 0, 1), (.9, 0, 1.9),
                                                        (None, .8, 1.775)])
def test_quiet_requires_whole_interval_and_no_held_input(edge_at, held_until, min_time):
    clock = Clock()
    calls = []
    native = Native(clock, edge_at=edge_at, held_until=held_until)
    result = recovery.wait_and_recover(native=native, candidate=lambda: True,
        focused=lambda: bool(calls), activate=lambda: calls.append(clock()), guard=lambda: None,
        clock=clock, sleep=clock.sleep)
    assert result["status"] == "recovered"
    assert len(calls) == 1 and calls[0] >= min_time
    assert result["released"] and result["attempts"] == 1


def test_native_return_never_requests_activation():
    clock = Clock()
    result = recovery.wait_and_recover(native=Native(clock), candidate=lambda: True,
        focused=lambda: clock() > .3,
        activate=lambda: pytest.fail("activation unnecessary"), guard=lambda: None,
        clock=clock, sleep=clock.sleep)
    assert result["status"] == "recovered" and not result["focus_requested"]
    assert clock() >= 1


def test_target_change_prevents_activation():
    clock = Clock()
    result = recovery.wait_and_recover(native=Native(clock), candidate=lambda: False,
        focused=lambda: False, activate=lambda: pytest.fail("wrong target"), guard=lambda: None,
        clock=clock, sleep=clock.sleep)
    assert result["status"] == "target_changed" and result["attempts"] == 0


def test_recent_takeover_yields_without_focus_fight():
    clock = Clock()
    result = recovery.wait_and_recover(native=Native(clock), candidate=lambda: True,
        focused=lambda: False, activate=lambda: pytest.fail("focus fight"), guard=lambda: None,
        recent_refocus=True, clock=clock, sleep=clock.sleep)
    assert result["status"] == "user_active" and result["attempts"] == 0


def test_denied_activation_at_most_two_attempts():
    clock = Clock()
    calls = []
    result = recovery.wait_and_recover(native=Native(clock), candidate=lambda: True,
        focused=lambda: False, activate=lambda: calls.append(clock()), guard=lambda: None,
        clock=clock, sleep=clock.sleep)
    assert result["status"] == "user_active" and result["attempts"] == len(calls) == 2


def test_cancel_during_wait_never_activates():
    clock = Clock()
    def guard():
        if clock() > .5:
            raise RuntimeError("revoked")
    with pytest.raises(RuntimeError, match="revoked"):
        recovery.wait_and_recover(native=Native(clock), candidate=lambda: True,
            focused=lambda: False, activate=lambda: pytest.fail("activated after revocation"),
            guard=guard, clock=clock, sleep=clock.sleep)


def test_activity_during_activation_proof_yields():
    clock = Clock()
    calls = []
    native = Native(clock)
    def activate():
        calls.append(clock())
        native.edge_at = clock()
    result = recovery.wait_and_recover(native=native, candidate=lambda: True,
        focused=lambda: False, activate=activate, guard=lambda: None,
        clock=clock, sleep=clock.sleep)
    assert result["status"] == "user_active" and len(calls) == 1


def test_activity_arriving_during_focus_proof_is_not_missed():
    clock = Clock()
    calls = []
    native = Native(clock)
    proof_edges = []

    def focused():
        if calls and not proof_edges:
            proof_edges.append(clock())
            native.edge_at = clock()
            return True
        return False

    result = recovery.wait_and_recover(
        native=native, candidate=lambda: True, focused=focused,
        activate=lambda: calls.append(clock()), guard=lambda: None,
        clock=clock, sleep=clock.sleep,
    )
    assert result["status"] == "user_active"
    assert len(calls) == 1 and native.edge_at is None


@pytest.mark.asyncio
async def test_backend_binding_deep_copy_and_fresh_capture_required(monkeypatch):
    b = backend()
    b._incarnation_epoch = 1
    monkeypatch.setattr(b, "_incarnation_barrier", AsyncMock(return_value=1))
    reply = capture()
    reply["input_scope"] = binding()
    monkeypatch.setattr(b, "_read_worker", AsyncMock(return_value=reply))
    await b.observe()
    before = b.recovery_binding()
    assert b.recovery_matches(before)
    assert not b.recovery_matches(before, allow_translation=True)
    changed = copy.deepcopy(before)
    changed["scope"]["process"]["start_ticks"] = 6
    assert b._scope["process"]["start_ticks"] == 5
    assert not b.recovery_matches(changed)
    worker = AsyncMock(return_value={"status": "recovered", "released": True,
                                    "focus_requested": True, "attempts": 1})
    monkeypatch.setattr(b, "_work", worker)
    result = await b.recover_target(before)
    assert result["status"] == "recovered" and b._frame is None
    assert not b.recovery_matches(before)
    assert worker.call_args.args[0] == "recovery"
    await b.observe()
    assert b.recovery_matches(before)


@pytest.mark.asyncio
async def test_missing_or_changed_incarnation_cannot_authorize_recovery(monkeypatch):
    b = backend()
    reply = capture()
    reply["input_scope"] = binding()
    monkeypatch.setattr(b, "_read_worker", AsyncMock(return_value=reply))
    await b.observe()
    assert b.recovery_binding() is None
    b._incarnation_epoch = 4
    monkeypatch.setattr(b, "_incarnation_barrier", AsyncMock(side_effect=[4, 5]))
    await b.observe()
    assert b.recovery_binding() is None


@pytest.mark.asyncio
async def test_backend_stale_generation_cannot_spawn(monkeypatch):
    b = backend()
    worker = AsyncMock()
    monkeypatch.setattr(b, "_work", worker)
    result = await b.recover_target({"generation": 99})
    assert result["status"] == "unavailable"
    worker.assert_not_awaited()


def test_incarnation_tracker_nested_children_and_destroy_reuse(monkeypatch):
    constants = SimpleNamespace(StructureNotifyMask=1, SubstructureNotifyMask=2,
                               CreateNotify=16, DestroyNotify=17, ReparentNotify=21)
    monkeypatch.setitem(sys.modules, "Xlib", SimpleNamespace(X=constants))
    subscribed = []

    class Window:
        def __init__(self, xid, children=()):
            self.id = xid
            self.children = children
        def change_attributes(self, **kwargs):
            assert kwargs["event_mask"] == 3
            subscribed.append(self.id)
        def query_tree(self):
            return SimpleNamespace(children=self.children)

    root = Window(1, [Window(2, [Window(3)])])
    events = [SimpleNamespace(type=17), SimpleNamespace(type=16)]
    watch = recovery.IncarnationWatch.__new__(recovery.IncarnationWatch)
    watch.epoch = 1
    watch.display = SimpleNamespace(screen=lambda: SimpleNamespace(root=root), sync=lambda: None,
                                    pending_events=lambda: bool(events),
                                    next_event=lambda: events.pop(0))
    assert watch.drain() == 3
    assert subscribed == [1, 2, 3]
    assert watch.drain() == 3


def test_incarnation_incomplete_subscription_fails_closed(monkeypatch):
    constants = SimpleNamespace(StructureNotifyMask=1, SubstructureNotifyMask=2)
    monkeypatch.setitem(sys.modules, "Xlib", SimpleNamespace(X=constants))
    root = SimpleNamespace(id=1)
    root.change_attributes = lambda **kwargs: kwargs["onerror"](None, None)
    root.query_tree = lambda: SimpleNamespace(children=[])
    watch = recovery.IncarnationWatch.__new__(recovery.IncarnationWatch)
    watch.display = SimpleNamespace(screen=lambda: SimpleNamespace(root=root), sync=lambda: None)
    with pytest.raises(RuntimeError, match="incarnation_subscription_unavailable"):
        watch._subscribe()


@pytest.mark.asyncio
async def test_incarnation_change_revokes_binding_without_source_revision_change(monkeypatch):
    b = backend()
    b._incarnation_epoch = 1
    monkeypatch.setattr(b, "_incarnation_barrier", AsyncMock(return_value=1))
    reply = capture()
    reply["input_scope"] = binding()
    monkeypatch.setattr(b, "_read_worker", AsyncMock(return_value=reply))
    frame = await b.observe()
    old = b.recovery_binding()
    assert old
    b._incarnation_epoch = 2
    assert b._frame.source.source_revision == frame.source.source_revision
    assert not b.recovery_matches(old)
    worker = AsyncMock()
    monkeypatch.setattr(b, "_work", worker)
    assert (await b.recover_target(old))["status"] == "unavailable"
    worker.assert_not_awaited()


def test_recovery_worker_is_explicitly_admitted_without_native_calls():
    b = backend()
    argv = b._worker_argv("x11_recovery.py")
    assert argv[-1].endswith("/x11_recovery.py")
    b._runtime_sudo = True
    argv = b._worker_argv("x11_recovery.py")
    assert argv[:3] == ["/usr/bin/sudo", "-n", "--"]
    assert argv[-1] == "--identity-gate"
