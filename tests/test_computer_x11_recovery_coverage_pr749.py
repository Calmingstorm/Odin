"""Recovery boundary coverage using only in-memory X11 transports and virtual time."""

import asyncio
import copy
import ctypes
import io
import json
import runpy
import subprocess
import sys
from collections import deque
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime import x11_recovery as recovery


@pytest.fixture(autouse=True)
def forbid_native(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Live display, native input, and process creation are forbidden")

    monkeypatch.delenv("DISPLAY", raising=False)
    monkeypatch.delenv("WAYLAND_DISPLAY", raising=False)
    # The worker entrypoint prepends its import root; do not leak that to later tests.
    monkeypatch.setattr(sys, "path", list(sys.path))
    monkeypatch.setattr(ctypes, "CDLL", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)
    constants = SimpleNamespace(
        StructureNotifyMask=1, SubstructureNotifyMask=2, SubstructureRedirectMask=4,
        CreateNotify=16, DestroyNotify=17, ReparentNotify=21, CurrentTime=0,
    )
    monkeypatch.setitem(sys.modules, "Xlib", SimpleNamespace(
        X=constants, display=SimpleNamespace(Display=forbidden),
        protocol=SimpleNamespace(event=SimpleNamespace(ClientMessage=lambda **kw: kw)),
    ))


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


def binding():
    return {
        "window": 11, "focus_window": 12, "process": {"pid": 20, "start_ticks": 5},
        "window_rect": [100, 200, 600, 400], "rect": [100, 200, 600, 400],
        "source_rect": [0, 0, 1000, 800], "source_origin": [0, 0],
        "topology": {"root": 1}, "transient_chain": [], "modal": False,
        "focused": True, "window_kind": "normal", "states": [42], "fingerprint": "old",
    }


class Window:
    def __init__(self, xid, children=(), *, error=False):
        self.id = xid
        self.children = children
        self.error = error
        self.subscriptions = []

    def change_attributes(self, **kwargs):
        self.subscriptions.append(kwargs["event_mask"])
        if self.error:
            kwargs["onerror"]("BadWindow")

    def query_tree(self):
        return SimpleNamespace(children=self.children)


class Display:
    def __init__(self, root=None, events=()):
        self.root = root or Window(1)
        self.events = deque(SimpleNamespace(type=value) for value in events)
        self.sync = Mock()
        self.close = Mock()

    def screen(self):
        return SimpleNamespace(root=self.root)

    def pending_events(self):
        return bool(self.events)

    def next_event(self):
        return self.events.popleft()


def install_display(monkeypatch, display):
    factory = Mock(return_value=display)
    monkeypatch.setattr(sys.modules["Xlib"].display, "Display", factory)
    return factory


def test_incarnation_initial_subscription_and_synthetic_event_invalidation(monkeypatch):
    child = Window(3)
    parent = Window(2, [child])
    display = Display(Window(1, [parent]), [2, 17 | 0x80, 16, 21])
    factory = install_display(monkeypatch, display)
    watch = recovery.IncarnationWatch(":memory")
    factory.assert_called_once_with(":memory")
    assert watch.epoch == 4
    assert all(window.subscriptions == [3, 3] for window in [display.root, parent, child])
    assert watch.drain() == 4
    watch.close()
    display.close.assert_called_once_with()


@pytest.mark.parametrize("failure", ["cycle", "depth", "fanout", "callback", "deadline"])
def test_incarnation_incomplete_subscription_closes_and_fails(monkeypatch, failure):
    root = Window(1)
    if failure == "cycle":
        root.children = [root]
    elif failure == "depth":
        leaf = root
        for xid in range(2, 35):
            child = Window(xid)
            leaf.children = [child]
            leaf = child
    elif failure == "fanout":
        root.children = [Window(xid) for xid in range(2, 2050)]
    elif failure == "callback":
        root.error = True
    elif failure == "deadline":
        monkeypatch.setattr(recovery, "time", SimpleNamespace(
            monotonic=Mock(side_effect=[0.0, 0.5]),
        ))
    display = Display(root)
    install_display(monkeypatch, display)
    with pytest.raises(RuntimeError, match="^incarnation_subscription_unavailable$"):
        recovery.IncarnationWatch(":memory")
    display.close.assert_called_once_with()


def test_incarnation_initial_drain_failure_closes_display(monkeypatch):
    display = Display(events=[2] * 4096)
    install_display(monkeypatch, display)
    with pytest.raises(RuntimeError, match="^incarnation_event_overflow$"):
        recovery.IncarnationWatch(":memory")
    assert not display.events
    display.close.assert_called_once_with()


def test_enduring_retry_never_reuses_native_epoch_and_suppresses_close_errors():
    clock = Clock()
    first = SimpleNamespace(drain=Mock(side_effect=[7, 7, 8, RuntimeError("lost")]),
                            close=Mock(side_effect=RuntimeError("already gone")))
    second = SimpleNamespace(drain=Mock(side_effect=[7, 7]), close=Mock())
    factory = Mock(side_effect=[first, second])
    watch = recovery.EnduringIncarnationWatch(":memory", factory=factory, clock=clock)
    assert [watch.drain(), watch.drain(), watch.drain(), watch.drain()] == [1, 1, 2, None]
    first.close.assert_called_once_with()
    assert watch.drain() is None
    factory.assert_called_once_with(":memory")
    clock.now = 1
    assert watch.drain() == 3
    assert watch.drain() == 3
    watch.close()
    watch.close()
    second.close.assert_called_once_with()
    assert watch.drain() is None


def test_enduring_four_subscription_failures_exhaust_retry_budget():
    clock = Clock()
    partial = SimpleNamespace(drain=Mock(side_effect=RuntimeError("BadWindow")), close=Mock())
    factory = Mock(side_effect=[partial, RuntimeError("gone"), RuntimeError("gone"),
                                RuntimeError("gone")])
    watch = recovery.EnduringIncarnationWatch(":memory", factory=factory, clock=clock)
    for now in [0, .5, 1, 2, 3, 100]:
        clock.now = now
        assert watch.drain() is None
    assert factory.call_count == 4
    partial.close.assert_called_once_with()


def test_scope_comparison_preserves_identity_and_ignores_only_focus_bookkeeping():
    before = binding()
    after = {**before, "focused": False, "keyboard_focus": 99, "fingerprint": "new",
             "states": []}
    assert recovery.same_scope(before, after, 42)
    assert before["states"] == [42]
    assert not recovery.same_scope(before, {**after, "states": [43]}, 42)
    for key in ["window", "process", "rect", "source_rect", "source_origin", "topology",
                "window_rect", "transient_chain", "modal"]:
        assert not recovery.same_scope(before, {k: v for k, v in before.items() if k != key})
    for invalid in [None, [], SimpleNamespace(), {}]:
        assert recovery.scope_material(invalid) == ({} if invalid == {} else None)
        assert not recovery.same_scope(invalid, before)
        assert not recovery.same_scope(before, invalid)
        assert not recovery.recoverable_scope(invalid)
    assert not recovery.same_scope({**before, "process": {}}, before)
    assert not recovery.same_scope({**before, "window": 0}, before)


@pytest.mark.parametrize("changes,expected", [
    ({}, True), ({"window_kind": "menu"}, False), ({"process": None}, False),
    ({"window": None}, False),
    ({"modal": True, "window_kind": "dialog", "modal_kind": "safe_application",
      "transient_chain": [10, 9], "transient_processes": [{"pid": 20, "start_ticks": 5}] * 2},
     True),
    ({"modal": True}, False),
])
def test_recoverable_scope_requires_own_process_dialog_chain(changes, expected):
    assert recovery.recoverable_scope({**binding(), **changes}) is expected


@pytest.mark.parametrize("change", [
    {"transient_chain": []}, {"transient_chain": (10,)}, {"transient_processes": []},
    {"transient_processes": ({"pid": 20, "start_ticks": 5},)},
    {"transient_processes": [{"pid": 99}]}, {"modal_kind": "security"},
    {"window_kind": "normal"},
])
def test_unsafe_modal_is_never_recoverable(change):
    scope = {**binding(), "modal": True, "window_kind": "dialog",
             "modal_kind": "safe_application", "transient_chain": [10],
             "transient_processes": [binding()["process"]]}
    assert not recovery.recoverable_scope({**scope, **change})


class Native:
    def __init__(self):
        self.edges = []
        self.keys = set()
        self.buttons = set()
        self.close = Mock()

    def physical_held(self):
        return {"keys": self.keys, "buttons": self.buttons}

    def physical_events(self, *, include_motion):
        assert include_motion is True
        events, self.edges = self.edges, []
        return events


@pytest.mark.parametrize("stage", ["focused_proof", "pre_activation", "activation_proof",
                                   "post_activation_proof"])
def test_activity_racing_native_queries_restarts_quiet_or_yields(stage):
    clock, native = Clock(), Native()
    activations = []
    injected = False

    def candidate():
        nonlocal injected
        if stage == "pre_activation" and clock() >= 1 and not injected:
            native.edges = ["motion"]
            injected = True
        return True

    def focused():
        nonlocal injected
        if stage == "focused_proof":
            if clock() >= 1 and not injected:
                native.edges = ["motion"]
                injected = True
            return True
        if stage == "post_activation_proof" and activations and not injected:
            native.edges = ["motion"]
            injected = True
            return True
        return bool(activations) and stage == "pre_activation"

    def activate():
        nonlocal injected
        activations.append(clock())
        if stage == "activation_proof":
            native.edges = ["motion"]
            injected = True

    result = recovery.wait_and_recover(
        native=native, candidate=candidate, focused=focused, activate=activate,
        guard=lambda: None, clock=clock, sleep=clock.sleep,
    )
    assert injected
    assert result["released"] is True
    assert result["attempts"] == len(activations)
    if stage in {"activation_proof", "post_activation_proof"}:
        assert result["status"] == "user_active"
        assert len(activations) == 1
    else:
        assert result["status"] == "recovered"
        assert clock() >= 2
        assert len(activations) == (stage == "pre_activation")


@pytest.mark.parametrize("change_at", ["initial", "before_request", "during_proof"])
def test_target_change_terminates_before_further_focus_request(change_at):
    clock, native = Clock(), Native()
    activations = []
    calls = 0

    def candidate():
        nonlocal calls
        calls += 1
        if change_at == "initial":
            return False
        if change_at == "before_request":
            return not (clock() >= 1 and calls >= 2 and last_candidate_time[0] == clock())
        return not activations

    last_candidate_time = [-1]

    def tracked_candidate():
        result = candidate()
        last_candidate_time[0] = clock()
        return result

    result = recovery.wait_and_recover(
        native=native, candidate=tracked_candidate, focused=lambda: False,
        activate=lambda: activations.append(clock()), guard=lambda: None,
        clock=clock, sleep=clock.sleep,
    )
    assert result["status"] == "target_changed"
    assert result["attempts"] == len(activations) == (change_at == "during_proof")


@pytest.mark.parametrize("mode,attempts", [("held", 0), ("denied", 2), ("recent", 0)])
def test_wait_budget_and_focus_fight_limits(mode, attempts):
    clock, native = Clock(), Native()
    if mode == "held":
        native.buttons = {1}
    activate = Mock()
    result = recovery.wait_and_recover(
        native=native, candidate=lambda: True, focused=lambda: False,
        activate=activate, guard=lambda: None, recent_refocus=mode == "recent",
        clock=clock, sleep=clock.sleep,
    )
    assert result["status"] == "user_active"
    assert result["focus_requested"] is bool(attempts)
    assert result["attempts"] == activate.call_count == attempts
    if mode == "held":
        assert clock() >= recovery.WAIT_SECONDS
    assert result["phase_timings_ms"]["total_ms"] == round(clock() * 1000, 3)


@pytest.fixture
def boundary(monkeypatch):
    """Replace every native import before execute can construct a resource."""
    scope = binding()
    selected = {"index": 0, "name": "memory"}
    topology = SimpleNamespace(monitors=[object()])
    root = SimpleNamespace(send_event=Mock())
    display = SimpleNamespace(screen=lambda: SimpleNamespace(root=root), sync=Mock())
    connection = SimpleNamespace(
        _display=display, topology=Mock(return_value=topology),
        named_sources=Mock(return_value=[selected]), power_status=Mock(return_value="awake"),
        close=Mock(),
    )
    native = Native()
    native.identity = Mock(return_value={"device": (2, 3)})
    native.owned_release_state = Mock(return_value={"keys": False, "buttons": False})
    incarnation = SimpleNamespace(drain=Mock(return_value=1), close=Mock())
    state = SimpleNamespace(activated=False)

    def snapshot(monitor):
        assert monitor is topology.monitors[0]
        return {**scope, "focused": state.activated}

    app_scope = SimpleNamespace(
        _atom=Mock(side_effect=lambda name: {"_NET_WM_STATE_FOCUSED": 42,
                                            "_NET_ACTIVE_WINDOW": 43}[name]),
        _window=Mock(return_value="exact-focus-window"),
        _snapshot=Mock(return_value=copy.deepcopy(scope)), snapshot=Mock(side_effect=snapshot),
        _values=Mock(return_value=[43]),
    )
    lifecycle = SimpleNamespace(REVOKED=False)
    config = {"display_name": ":memory", "xauthority": "/not-a-real-file",
              "monitor_names": ["memory"]}
    configuration = Mock(return_value=config)
    constructors = {}
    for module, attributes in {
        "x11_worker_lifecycle": lifecycle,
        "x11_app_scope": SimpleNamespace(AppScope=Mock(return_value=app_scope)),
        "x11_attached": SimpleNamespace(attachment_configuration=configuration),
        "x11_attached_worker": SimpleNamespace(
            AttachedConnection=Mock(return_value=connection)),
        "x11_owned_device": SimpleNamespace(ExistingXTest=Mock(return_value=native)),
    }.items():
        monkeypatch.setitem(sys.modules, f"src.computer.runtime.{module}", attributes)
        monkeypatch.setattr(sys.modules["src.computer.runtime"], module, attributes, raising=False)
        constructors[module] = attributes
    monkeypatch.setattr(recovery, "IncarnationWatch", Mock(return_value=incarnation))
    select_mock = Mock(return_value=([], [], []))
    monkeypatch.setattr(recovery, "select", SimpleNamespace(select=select_mock))
    clock = Clock()
    monkeypatch.setattr(recovery, "time", SimpleNamespace(monotonic=clock))
    coordinator = recovery.wait_and_recover

    def run_coordinator(**kwargs):
        return coordinator(**kwargs, clock=clock, sleep=clock.sleep)

    monkeypatch.setattr(recovery, "wait_and_recover", run_coordinator)

    def send_event(event, *, event_mask):
        assert event == {"window": 11, "client_type": 43, "data": (32, [1, 0, 0, 0, 0])}
        assert event_mask == 6
        state.activated = True

    root.send_event.side_effect = send_event
    request = {**config, "selected": selected, "scope": copy.deepcopy(scope),
               "expected_device_identity": {"device": [2, 3]}}
    return SimpleNamespace(
        request=request, connection=connection, native=native, incarnation=incarnation,
        scope=app_scope, lifecycle=lifecycle, root=root, state=state, clock=clock,
        select=select_mock, constructors=constructors, configuration=configuration,
    )


def assert_closed(boundary):
    for resource in [boundary.native, boundary.connection, boundary.incarnation]:
        resource.close.assert_called_once_with()


def test_execute_success_sends_only_ewmh_request_after_authorization(boundary):
    def authorize():
        assert boundary.incarnation.drain.call_count == 1
        boundary.native.identity.assert_called_once_with()
        boundary.root.send_event.assert_not_called()

    result = recovery.execute(boundary.request, controller_fd=97, authorize=authorize)
    assert result["status"] == "recovered"
    assert result["attempts"] == 1 and result["focus_requested"] is True
    assert result["released"] is True
    boundary.root.send_event.assert_called_once()
    boundary.scope._window.assert_called_with(12)
    assert boundary.scope._snapshot.call_args.kwargs == {
        "candidate": "exact-focus-window", "allow_unfocused": True,
    }
    boundary.select.assert_called_with([97], [], [], 0)
    assert_closed(boundary)


@pytest.mark.parametrize("failure", ["source", "modal", "device", "owned", "authorize"])
def test_execute_setup_failure_never_dispatches_and_closes_partial_resources(boundary, failure):
    authorize = Mock()
    if failure == "source":
        boundary.connection.named_sources.return_value = []
    elif failure == "modal":
        boundary.request["scope"]["window_kind"] = "menu"
    elif failure == "device":
        boundary.request["expected_device_identity"] = {"device": [9]}
    elif failure == "owned":
        boundary.native.owned_release_state.return_value = {"buttons": True}
    else:
        authorize.side_effect = RuntimeError("revoked")
    result = recovery.execute(boundary.request, authorize=authorize)
    assert result == {"ok": True, "status": "unavailable", "focus_requested": False,
                      "released": True, "attempts": 0}
    boundary.root.send_event.assert_not_called()
    boundary.connection.close.assert_called_once_with()
    if failure not in {"source", "modal"}:
        boundary.native.close.assert_called_once_with()
        boundary.incarnation.close.assert_called_once_with()
    else:
        boundary.native.close.assert_not_called()
        boundary.incarnation.close.assert_not_called()
    assert authorize.call_count == (failure == "authorize")


@pytest.mark.parametrize("failure", ["revoked", "deadline", "controller", "incarnation",
                                    "asleep", "topology"])
def test_execute_guard_revocations_never_activate(boundary, monkeypatch, failure):
    if failure == "revoked":
        boundary.lifecycle.REVOKED = True
    elif failure == "deadline":
        def expired_guard(**callbacks):
            boundary.clock.now = 32
            callbacks["guard"]()
            pytest.fail("Expired native guard must reject recovery")

        monkeypatch.setattr(recovery, "wait_and_recover", expired_guard)
    elif failure == "controller":
        boundary.select.return_value = ([97], [], [])
    elif failure == "incarnation":
        boundary.incarnation.drain.side_effect = [1, 2]
    elif failure == "asleep":
        boundary.connection.power_status.return_value = "display_asleep"
    else:
        boundary.connection.topology.side_effect = [boundary.connection.topology(), object()]
    result = recovery.execute(boundary.request)
    assert result["status"] == ("target_changed" if failure == "incarnation" else "unavailable")
    assert result["attempts"] == 0 and not result["focus_requested"]
    boundary.root.send_event.assert_not_called()
    assert_closed(boundary)


@pytest.mark.parametrize("failure", ["candidate", "activity", "atom", "support", "dispatch"])
def test_execute_activation_rechecks_fail_closed_without_replay(boundary, monkeypatch, failure):
    if failure == "candidate":
        boundary.scope._snapshot.return_value = None
    elif failure == "activity":
        boundary.native.edges = ["motion"]
    elif failure == "atom":
        boundary.scope._atom.side_effect = [42, 0]
    elif failure == "support":
        boundary.scope._values.return_value = []
    else:
        boundary.root.send_event.side_effect = RuntimeError("dispatch outcome unknown")

    def exercise_activation(**callbacks):
        callbacks["activate"]()
        pytest.fail("Failed activation must not return success")

    monkeypatch.setattr(recovery, "wait_and_recover", exercise_activation)
    result = recovery.execute(boundary.request)
    expected_status = {"candidate": "target_changed", "activity": "user_active"}.get(
        failure, "unavailable")
    assert result["status"] == expected_status
    assert result["attempts"] == (failure == "dispatch")
    assert result["focus_requested"] is (failure == "dispatch")
    assert boundary.root.send_event.call_count == (failure == "dispatch")
    assert_closed(boundary)


def test_execute_closes_all_resources_even_when_each_close_raises(boundary):
    for resource in [boundary.native, boundary.connection, boundary.incarnation]:
        resource.close.side_effect = RuntimeError("close failed")
    boundary.request["recent_refocus"] = True
    result = recovery.execute(boundary.request)
    assert result["status"] == "user_active"
    assert result["attempts"] == 0 and not result["focus_requested"]
    assert_closed(boundary)


@pytest.mark.parametrize("allowed", [True, False])
def test_authorization_prints_prepared_before_gate_and_arms_only_on_proceed(monkeypatch, allowed):
    output, alarms = io.StringIO(), []
    monkeypatch.setattr(recovery.sys, "__stdout__", output)
    monkeypatch.setattr(recovery.signal, "alarm", alarms.append)

    def gate():
        assert json.loads(output.getvalue()) == {"prepared": "recovery"}
        assert not alarms
        return {"proceed": allowed}

    if allowed:
        recovery.authorize_recovery(gate)
        assert alarms == [32]
    else:
        with pytest.raises(RuntimeError, match="^recovery_revoked$"):
            recovery.authorize_recovery(gate)
        assert not alarms


def test_script_gate_failure_emits_safe_reply_without_native_setup(monkeypatch, capsys):
    announce, parent_watch, alarms = Mock(), Mock(), []
    gate = Mock(side_effect=RuntimeError("parent disconnected"))
    lifecycle = SimpleNamespace(announce=announce, parent_watch=parent_watch, read_gate=gate)
    monkeypatch.setitem(sys.modules, "src.computer.runtime.x11_worker_lifecycle", lifecycle)
    monkeypatch.setattr(recovery.signal, "alarm", alarms.append)
    monkeypatch.setattr(sys, "argv", ["x11_recovery.py", "--identity-gate"])
    runpy.run_path(str(Path(recovery.__file__)), run_name="__main__")
    assert json.loads(capsys.readouterr().out) == {
        "ok": True, "status": "unavailable", "focus_requested": False,
        "released": True, "attempts": 0,
    }
    assert alarms == [35]
    parent_watch.assert_called_once_with()
    announce.assert_called_once_with("recovery")


def test_script_prepared_gate_refusal_closes_fake_native_resources(boundary, monkeypatch, capsys):
    display = Display()
    install_display(monkeypatch, display)
    prepared = io.StringIO()
    monkeypatch.setattr(sys, "__stdout__", prepared)
    gate = Mock(side_effect=[boundary.request, {"proceed": False}])
    boundary.lifecycle.announce = Mock()
    boundary.lifecycle.parent_watch = Mock()
    boundary.lifecycle.read_gate = gate
    alarms = []
    monkeypatch.setattr(recovery.signal, "alarm", alarms.append)
    monkeypatch.setattr(sys, "argv", ["x11_recovery.py"])
    runpy.run_path(str(Path(recovery.__file__)), run_name="__main__")
    assert json.loads(capsys.readouterr().out) == {
        "ok": True, "status": "unavailable", "focus_requested": False,
        "released": True, "attempts": 0,
    }
    assert json.loads(prepared.getvalue()) == {"prepared": "recovery"}
    assert alarms == [35]
    assert gate.call_count == 2
    boundary.lifecycle.announce.assert_not_called()
    boundary.root.send_event.assert_not_called()
    boundary.native.close.assert_called_once_with()
    boundary.connection.close.assert_called_once_with()
    display.close.assert_called_once_with()
