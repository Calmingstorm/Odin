"""In-process lifecycle coverage for the native X11 guardian and attached worker.

Everything below is a fake protocol endpoint.  It deliberately never opens X,
spawns a child, or touches the workstation desktop.
"""

from __future__ import annotations

import io
import json
import sys
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime import x11_attached_worker as worker
from src.computer.runtime import x11_guardian as guardian
from src.computer.runtime import x11_worker_lifecycle as lifecycle


class Native:
    def __init__(self, *, independent=False):
        self.independent_pointer = independent
        self._held = {"keys": set(), "buttons": set()}
        self.calls = []
        self.closed = False
        self.keyboard_mapping_identity = "mapping-v1"
        self._pointer = (10, 20)

    def identity(self):
        return (71, 72)

    def held(self):
        return {kind: set(values) for kind, values in self._held.items()}

    def physical_held(self):
        return {"keys": set(), "buttons": set()}

    def physical_events(self):
        return []

    def owned_release_state(self):
        return self.held()

    def release_owned(self, kind, code):
        self.calls.append(("release_owned", kind, code))
        self._held["keys" if kind == "key" else "buttons"].discard(code)

    def key(self, code, down):
        self.calls.append(("key", code, down))
        (self._held["keys"].add if down else self._held["keys"].discard)(code)

    def button(self, code, down):
        self.calls.append(("button", code, down))
        (self._held["buttons"].add if down else self._held["buttons"].discard)(code)

    def move(self, x, y):
        self.calls.append(("move", x, y))
        self._pointer = (x, y)

    def sync(self):
        self.calls.append(("sync",))

    def pointer(self):
        return self._pointer

    def query_pointer(self):
        return self._pointer

    def focus(self, window):
        self.calls.append(("focus", window))

    def close(self):
        self.closed = True


class InjectorStream:
    def __init__(self, first, commands=b""):
        self.first = first
        self.commands = bytearray(commands)
        self.writes = []
        self.closed = False

    def readline(self, _limit):
        first, self.first = self.first, b""
        return first

    def read(self, size):
        value, self.commands = bytes(self.commands[:size]), self.commands[size:]
        return value

    def write(self, value):
        self.writes.append(value)

    def close(self):
        self.closed = True


class InjectorSocket:
    def __init__(self, stream):
        self.stream = stream
        self.closed = False

    def makefile(self, *_args, **_kwargs):
        return self.stream

    def recv(self, *_args, **_kwargs):
        return b""

    def close(self):
        self.closed = True


def _injector_modules(monkeypatch, native, stream):
    sock = InjectorSocket(stream)
    monkeypatch.setattr(guardian.socket, "socket", lambda **_kwargs: sock)
    monkeypatch.setattr(lifecycle, "parent_watch", Mock())
    monkeypatch.setattr(lifecycle, "REVOKED", False)
    monkeypatch.setitem(
        sys.modules,
        "src.computer.runtime.x11_owned_device",
        SimpleNamespace(open_input=lambda *_args, **_kwargs: native),
    )
    return sock


def test_injector_independent_dual_ledger_releases_on_controller_eof(monkeypatch):
    native = Native(independent=True)
    stream = InjectorStream(
        b'{"display_name":":fake","mode":"independent","expected_device_identity":[71,72]}\n',
        b'{"op":"key","args":[38,true]}\n',
    )
    sock = _injector_modules(monkeypatch, native, stream)

    def readiness(items, _write, _error, timeout):
        # dispatch_check's zero-time probe finds no controller EOF.  The owned
        # injector loop receives one byte at a time and then observes EOF.
        return ([items[0]], [], []) if timeout else ([], [], [])

    monkeypatch.setattr(guardian.select, "select", readiness)
    guardian.injector(42)

    assert ("key", 38, True) in native.calls
    assert ("release_owned", "key", 38) in native.calls
    assert native.held() == {"keys": set(), "buttons": set()}
    assert stream.writes == [b'{"ok":true}\n']
    assert native.closed and stream.closed and sock.closed


@pytest.mark.parametrize("cause", ["revoked", "lease"])
def test_injector_independent_stops_on_revocation_or_fixed_lease(monkeypatch, cause):
    native = Native(independent=True)
    stream = InjectorStream(b'{"display_name":":fake","mode":"independent"}\n')
    _injector_modules(monkeypatch, native, stream)
    monkeypatch.setattr(guardian.select, "select", lambda *_args: ([], [], []))
    if cause == "revoked":
        monkeypatch.setattr(lifecycle, "REVOKED", True)
    else:
        # First monotonic call constructs deadline; the next check is expired.
        monkeypatch.setattr(
            guardian.time, "monotonic", Mock(side_effect=[0.0, guardian.LEASE_SECONDS])
        )
    guardian.injector(42)
    assert native.calls == []
    assert native.closed and stream.closed


class ExecuteHelper:
    def __init__(self, _display, _environment, **kwargs):
        self.kwargs = kwargs
        self.process = SimpleNamespace(poll=lambda: None)
        self.fenced = False

    def exchange(self, command, check):
        check()
        getattr(EXECUTE_NATIVE, command["op"])(*command["args"])
        EXECUTE_NATIVE.sync()

    def fence(self):
        self.fenced = True
        return True


EXECUTE_NATIVE: Native


def _execute_environment(monkeypatch, native, *, mode="independent", expected=(71, 72)):
    global EXECUTE_NATIVE
    EXECUTE_NATIVE = native
    selected = {"index": 0, "name": "screen"}
    monitor = SimpleNamespace(x=0, y=0, width=100, height=100)
    topology = SimpleNamespace(monitors=[monitor])
    connection = SimpleNamespace(
        power_status=lambda: "on",
        topology=lambda: topology,
        named_sources=lambda _topology, _names: [selected],
        _display=object(),
        close=Mock(),
    )
    scope = SimpleNamespace(assert_snapshot=Mock())
    config = {"display_name": ":fake", "xauthority": "", "monitor_names": ["screen"]}
    modules = {
        "x11_attached": SimpleNamespace(
            attachment_configuration=lambda *_args: config,
            worker_environment=lambda *_args: {"DISPLAY": ":fake"},
        ),
        "x11_attached_worker": SimpleNamespace(AttachedConnection=lambda *_args: connection),
        "x11_app_scope": SimpleNamespace(AppScope=lambda *_args: scope),
        "x11_owned_device": SimpleNamespace(
            open_input=lambda *_args, **_kwargs: native,
            UnsupportedCharacters=RuntimeError,
            X11DeviceError=RuntimeError,
        ),
    }
    for name, module in modules.items():
        monkeypatch.setitem(sys.modules, f"src.computer.runtime.{name}", module)
    monkeypatch.setattr(guardian, "InjectionHelper", ExecuteHelper)
    request = {
        **config,
        "selected": selected,
        "scope": {"rect": [0, 0, 100, 100], "focus_window": 91},
        "input_mode": mode,
        "expected_device_identity": expected,
        "action": {"type": "click", "x": 10, "y": 20},
    }
    return request, connection, scope


def test_execute_current_admission_identity_mode_and_independent_focus(monkeypatch):
    native = Native(independent=True)
    request, connection, scope = _execute_environment(monkeypatch, native)
    receipt = guardian.execute(request, controller_fd=None)
    assert receipt["status"] == "executed"
    assert ("focus", 91) in native.calls
    assert native.closed and connection.close.called
    assert scope.assert_snapshot.call_count >= 2


@pytest.mark.parametrize(
    "field,value,reason",
    [
        ("input_mode", None, "input_mode_required"),
        ("expected_device_identity", None, "input_device_identity_changed"),
    ],
)
def test_execute_rejects_unadmitted_mode_or_identity_before_injection(
    monkeypatch, field, value, reason
):
    native = Native()
    request, connection, _scope = _execute_environment(monkeypatch, native)
    request[field] = value
    receipt = guardian.execute(request, controller_fd=None)
    assert receipt["status"] == "unavailable" and not receipt["injected"]
    assert receipt["released"]
    # Missing mode is deliberately not in the public reason vocabulary.
    public_reason = "input_scope_or_native_failed" if field == "input_mode" else reason
    assert receipt["reason"] == public_reason
    assert receipt["diagnostics"] == {
        "phase": "preflight",
        "steps_planned": 0,
        "steps_completed": 0,
        "release": "confirmed",
        "reason": public_reason,
    }
    assert native.calls == []
    # Mode admission occurs before an input endpoint exists; identity admission
    # occurs immediately after opening it.  Both paths still close attachment.
    assert connection.close.called
    assert native.closed is (field == "expected_device_identity")


class WorkerCapture:
    def __init__(self):
        self.closed = 0

    def close(self):
        self.closed += 1


def _worker_request():
    return {
        "display_name": ":fake",
        "xauthority": "",
        "monitor_names": ["screen"],
        "operation": "sources",
    }


def test_serve_retains_attachment_and_rejects_redirect_without_recapturing(monkeypatch, capsys):
    capture = WorkerCapture()
    request = _worker_request()
    redirected = {**request, "display_name": ":other"}
    calls = []
    monkeypatch.setattr(
        worker,
        "attachment_configuration",
        lambda *args: {"display_name": args[0], "xauthority": args[1], "monitor_names": args[2]},
    )
    monkeypatch.setattr(worker, "X11MonitorCapture", lambda *_args, **_kwargs: capture)
    monkeypatch.setattr(
        worker, "safe_run", lambda req, actual: calls.append((req, actual)) or {"ok": True}
    )
    monkeypatch.setattr(worker.signal, "alarm", Mock())
    monkeypatch.setattr(
        sys, "stdin", SimpleNamespace(buffer=io.BytesIO(json.dumps(redirected).encode() + b"\n"))
    )
    worker.serve(request)
    replies = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert replies == [{"ok": True}, {"ok": False, "error": "attachment_changed"}]
    assert calls == [(request, capture)]
    assert capture.closed == 1


def test_watch_topology_emits_only_state_changes_then_closes(monkeypatch, capsys):
    capture = WorkerCapture()
    request = _worker_request()
    records = iter(
        [
            {"ok": True, "sources": ["one"], "topology_revision": 1, "power_status": "on"},
            {"ok": True, "sources": ["one"], "topology_revision": 1, "power_status": "on"},
            {"ok": True, "sources": ["two"], "topology_revision": 2, "power_status": "on"},
            {"ok": False, "error": "display_asleep"},
        ]
    )
    monkeypatch.setattr(
        worker,
        "attachment_configuration",
        lambda *args: {"display_name": args[0], "xauthority": args[1], "monitor_names": args[2]},
    )
    monkeypatch.setattr(worker, "X11MonitorCapture", lambda *_args, **_kwargs: capture)
    monkeypatch.setattr(worker, "safe_run", lambda *_args: next(records))
    monkeypatch.setattr(worker.signal, "alarm", Mock())
    monkeypatch.setattr(worker.select, "select", lambda *_args: ([], [], []))
    monkeypatch.setattr(sys, "stdin", SimpleNamespace(buffer=io.BytesIO()))
    worker.watch_topology(request)
    replies = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert [item["event"] for item in replies] == [
        "topology_ready",
        "topology_changed",
        "topology_changed",
    ]
    assert replies[-2]["sources"] == ["two"]
    assert replies[-1]["ok"] is False
    assert capture.closed == 1
