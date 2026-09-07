"""Guardian protocol contracts without real X or child processes."""
import json
import runpy
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime import x11_guardian as g
from src.computer.runtime import x11_owned_device as devices
from src.computer.runtime import x11_worker_lifecycle as lifecycle


def native():
    n = Mock()
    n.independent_pointer = False
    n.identity.return_value = (11, 12)
    n.held.return_value = {"keys": set(), "buttons": set()}
    n.physical_held.return_value = {"keys": set(), "buttons": set()}
    n.physical_events.return_value = []
    return n


@pytest.mark.parametrize("chunks,error", [
    ([b'{"ok":true}\n'], None), ([b""], "input_helper_eof"),
    ([b"x" * 4097], "input_helper_protocol"), ([b'{}\n'], "input_helper_failed"),
])
def test_helper_exchange_protocol(monkeypatch, chunks, error):
    helper = object.__new__(g.InjectionHelper)
    helper.sock = Mock()
    helper.sock.recv.side_effect = chunks
    helper.buffer = b""
    check = Mock()
    monkeypatch.setattr(g.select, "select", lambda *a: ([helper.sock], [], []))
    if error:
        with pytest.raises(g.GuardianFailure, match=error):
            helper.exchange({"op": "move", "args": [1, 2]}, check)
    else:
        helper.exchange({"op": "move", "args": [1, 2]}, check)
        assert helper.buffer == b""
    assert json.loads(helper.sock.sendall.call_args.args[0]) == {"op": "move", "args": [1, 2]}
    assert check.call_count == 2


@pytest.mark.parametrize("fail", [False, True])
def test_helper_initialization_closes_child_socket(monkeypatch, fail):
    parent, child = Mock(), Mock()
    child.fileno.return_value = 19
    monkeypatch.setattr(g.socket, "socketpair", lambda: (parent, child))
    popen = Mock(side_effect=OSError("spawn") if fail else None)
    monkeypatch.setattr(g.subprocess, "Popen", popen)
    if fail:
        with pytest.raises(OSError, match="spawn"):
            g.InjectionHelper(":fake", {"A": "B"})
        parent.close.assert_called_once()
    else:
        helper = g.InjectionHelper(":fake", {"A": "B"})
        assert helper.sock is parent
        assert popen.call_args.kwargs["pass_fds"] == (19,)
        assert json.loads(parent.sendall.call_args.args[0]) == {
            "display_name": ":fake", "mode": "shared", "expected_device_identity": None,
            "keyboard_mapping_identity": None}
    child.close.assert_called_once()


@pytest.mark.parametrize("timeouts", [0, 1, 2])
def test_helper_fence_escalates_only_owned_child(timeouts):
    helper = object.__new__(g.InjectionHelper)
    helper.sock, helper.process = Mock(), Mock(returncode=0)
    helper.process.wait.side_effect = [subprocess.TimeoutExpired("owned", .15)] * timeouts + [0]
    assert helper.fence()
    helper.sock.close.assert_called_once()
    assert helper.process.terminate.call_count == int(timeouts >= 1)
    assert helper.process.kill.call_count == int(timeouts == 2)


@pytest.mark.parametrize("case,reason", [
    ("revoked", "supervisor_parent_revoked"), ("identity", "input_device_identity_changed"),
    ("synthetic", "other_synthetic_input_held"), ("physical", "human_input_overlap"),
])
def test_guard_rejects_changed_ownership(monkeypatch, case, reason):
    monkeypatch.setattr(lifecycle, "REVOKED", False)
    n, helper = native(), Mock()
    helper.process.poll.return_value = None
    guard = g.Guardian(n, helper, Mock(), controller_fd=None)
    if case == "revoked":
        monkeypatch.setattr(lifecycle, "REVOKED", True)
    elif case == "identity":
        n.identity.return_value = (33, 34)
    elif case == "synthetic":
        n.held.return_value["buttons"].add(1)
    else:
        n.physical_events.return_value = ["motion"]
    with pytest.raises(g.GuardianFailure, match=reason):
        guard.guard()
    helper.exchange.assert_not_called()


@pytest.mark.parametrize("lease", [0, -1, 3])
def test_invalid_fixed_lease(lease):
    with pytest.raises(g.GuardianFailure, match="invalid_lease"):
        g.Guardian(native(), Mock(), Mock(), lease_seconds=lease)


def test_wait_and_cleanup_observation_failures(monkeypatch):
    monkeypatch.setattr(lifecycle, "REVOKED", False)
    n, helper, now = native(), Mock(), [0.0]
    helper.process.poll.return_value = None
    helper.fence.return_value = True
    monkeypatch.setattr(g.time, "sleep", lambda seconds: now.__setitem__(0, now[0] + seconds))
    guard = g.Guardian(n, helper, Mock(), controller_fd=None, clock=lambda: now[0])
    result = guard.run([("wait", .02)])
    assert result["status"] == "executed" and not result["injected"]
    assert now[0] >= .02
    helper.exchange.assert_not_called()
    n.physical_events.side_effect = RuntimeError("lost event stream")
    guard.injected = True
    result = guard.run([])
    assert result["overlap_uncertain"] and result["status"] == "unknown"
    helper.fence.side_effect = RuntimeError("unfenced")
    assert not guard.run([])["released"]


def test_ledger_native_owned_release_and_uncertain_physical_query():
    n = native()
    ledger = g.OwnedLedger(n)
    ledger.keys.add(38)
    n.physical_held.side_effect = OSError("lost")
    n.owned_release_state.return_value = {"keys": set(), "buttons": set()}
    assert ledger.release() and ledger.uncertain
    n.release_owned.assert_called_once_with("key", 38)
    assert not ledger.keys


@pytest.mark.parametrize("action", [
    {"type": "polyline", "points": [], "duration": 0}, {"type": "type", "text": ""},
    {"type": "type", "text": 1}, {"type": "bogus"},
])
def test_invalid_action_vocabulary(action):
    with pytest.raises(g.GuardianFailure):
        g.input_steps(action, native())


def test_action_translation_releases_chords_in_reverse():
    n = native()
    n.text_keys.return_value = [[50, 38], [39]]
    assert g.input_steps({"type": "type", "text": "Ab"}, n) == [
        ("key", 50, True), ("key", 38, True), ("key", 38, False),
        ("key", 50, False), ("key", 39, True), ("key", 39, False),
    ]
    n.keycode.side_effect = [37, 39]
    assert len(g.input_steps({"type": "key", "chord": "ctrl+s"}, n)) == 4
    assert n.keycode.call_args_list[0].args == ("Control_L",)
    action = {"type": "polyline", "points": [[1, 2], [3, 4]], "duration": .5}
    assert g.input_steps(action, n) == [
        ("move", 1, 2), ("button", 1, True), ("wait", .5),
        ("move", 3, 4), ("button", 1, False),
    ]


@pytest.mark.parametrize("case,reason", [
    ("ok", None), ("popup", None), ("stale", "stale_source"), ("topology", "stale_source"),
    ("invalid", "invalid_point"), ("outside", "point_outside_source"),
    ("drag_outside", "point_outside_application"),
    ("pointer_move", "shared_pointer_changed"),
    ("pointer_button", "shared_pointer_changed"), ("key", None),
])
def test_execute_revalidates_application_and_always_closes(monkeypatch, case, reason):
    selected = {"index": 0}
    topology = SimpleNamespace(monitors=[SimpleNamespace(x=0, y=0, width=100, height=100)])
    connection, scope, n, helper = Mock(), Mock(unsafe=True), native(), Mock()
    connection.topology.return_value = topology
    connection.named_sources.return_value = [] if case == "stale" else [selected]
    helper.process.poll.return_value = None
    n.pointer.return_value = (99, 99) if case in {"pointer_move", "pointer_button"} else (10, 20)
    config = dict(display_name=":fake", xauthority=None, monitor_names=["fake"], app_profile="xed")
    for name, module in {
        "x11_attached": SimpleNamespace(attachment_configuration=lambda *a: config,
                                        worker_environment=lambda *a: {}),
        "x11_attached_worker": SimpleNamespace(AttachedConnection=lambda *a: connection),
        "x11_owned_device": SimpleNamespace(open_input=lambda *a, **k: n,
                                            UnsupportedCharacters=devices.UnsupportedCharacters,
                                            X11DeviceError=devices.X11DeviceError),
        "x11_app_scope": SimpleNamespace(AppScope=lambda *a: scope),
    }.items():
        monkeypatch.setitem(sys.modules, "src.computer.runtime." + name, module)
    monkeypatch.setattr(g, "InjectionHelper", lambda *a, **k: helper)
    steps = [("key", 38, True)] if case == "key" else [("move", 10, 20), ("button", 1, True)]
    if case in {"popup", "drag_outside"}:
        steps = [("move", 70, 80), ("button", 1, True)]
        n.pointer.return_value = (70, 80)
    if case == "invalid":
        steps = [("move", 1.5, 2)]
    if case == "outside":
        steps = [("move", 101, 2)]
    if case == "pointer_move":
        steps = [("move", 10, 20), ("move", 11, 21)]
    monkeypatch.setattr(g, "input_steps", lambda *a: steps)
    class Exerciser:
        def __init__(self, native, child, validate, **kwargs):
            self.validate = validate
        def run(self, actual):
            assert actual == steps
            if case == "topology":
                connection.topology.return_value = None
            for step in actual:
                self.validate(step)
            return {"status": "executed"}
    monkeypatch.setattr(g, "Guardian", Exerciser)
    request = dict(config, selected=selected, scope={"rect": [0, 0, 50, 50]},
                   action={"type": "click"}, input_mode="shared", expected_device_identity=[11, 12])
    if case == "drag_outside":
        request["action"]["type"] = "polyline"
    authorize = Mock()
    if reason:
        with pytest.raises(g.GuardianFailure, match=reason):
            g.execute(request, authorize=authorize)
    else:
        assert g.execute(request, authorize=authorize) == {"status": "executed"}
        authorize.assert_called_once_with(helper)
        assert scope.assert_snapshot.call_count >= 2
        if case == "popup":
            scope.assert_snapshot.assert_called_with(
                request["scope"], topology.monitors[0], point=(70, 80),
                pointer_query=n.query_pointer)
    connection.close.assert_called_once()
    if case != "stale":
        n.close.assert_called_once()
        helper.fence.assert_called_once()


@pytest.mark.parametrize("op", ["key", "invalid", "quit"])
def test_injector_protocol_and_resource_closure(monkeypatch, op):
    n = native()
    monkeypatch.setattr(lifecycle, "REVOKED", False)
    monkeypatch.setattr(g.select, "select", lambda *args: ([], [], []))
    stream = Mock()
    stream.readline.side_effect = [
        b'{"display_name":":fake"}\n',
        json.dumps({"op": op, "args": [38, True]}).encode() + b"\n", b"",
    ]
    sock = Mock()
    sock.makefile.return_value = stream
    monkeypatch.setattr(g.socket, "socket", lambda **kwargs: sock)
    monkeypatch.setattr(lifecycle, "parent_watch", Mock())
    monkeypatch.setitem(sys.modules, "src.computer.runtime.x11_owned_device",
                        SimpleNamespace(open_input=lambda *a, **k: n))
    monkeypatch.setattr(g.os, "_exit", Mock(side_effect=SystemExit(0)))
    if op == "invalid":
        with pytest.raises(g.GuardianFailure, match="unsupported_helper_operation"):
            g.injector(99)
    elif op == "quit":
        with pytest.raises(SystemExit):
            g.injector(99)
    else:
        g.injector(99)
        n.key.assert_called_once_with(38, True)
        stream.write.assert_called_once_with(b'{"ok":true}\n')
    n.close.assert_called_once()
    stream.close.assert_called_once()


def test_main_failure_emits_fail_closed_receipt(monkeypatch, capsys):
    monkeypatch.setattr(sys, "path", list(sys.path))
    monkeypatch.setattr(lifecycle, "parent_watch", Mock())
    monkeypatch.setattr(lifecycle, "announce", Mock())
    monkeypatch.setattr(lifecycle, "read_gate", Mock(side_effect=ValueError("invalid gate")))
    monkeypatch.setattr(g.sys, "argv", [g.__file__, "--identity-gate"])
    runpy.run_path(g.__file__, run_name="__main__")
    result = json.loads(capsys.readouterr().out)
    assert result == {"status": "unknown", "injected": True, "released": False,
                      "reason": "input_guardian_unavailable"}
