"""In-process worker contracts with synthetic X replies and OS lifecycle calls."""
import base64
import io
import json
import runpy
import sys
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime import x11_app_scope as scope
from src.computer.runtime import x11_attached as attached
from src.computer.runtime import x11_attached_worker as worker
from src.computer.runtime import x11_worker_lifecycle as lifecycle
from src.computer.runtime.x11_capture import Monitor, Topology, _XlibConnection
from tests.test_computer_x11_app_scope_r5 import Display


@pytest.fixture
def native(monkeypatch):
    # Scope imports X constants lazily; CI need not install python-xlib.
    monkeypatch.setitem(sys.modules, "Xlib", SimpleNamespace(
        X=SimpleNamespace(IsViewable=2)))
    monkeypatch.setitem(sys.modules, "Xlib.ext", SimpleNamespace(
        res=SimpleNamespace(LocalClientPIDMask=2)))
    display = Display()
    display.root.geometry = [0, 0, 8, 6]
    display.target.geometry = [0, 0, 8, 6]
    display.monitors[0].width_in_pixels = 8
    display.monitors[0].height_in_pixels = 6
    display.get_atom_name = lambda atom: {42: "screen", 43: "other"}[atom]
    topology = Topology(1, 8, 6, (Monitor((42, (88,)), 0, 0, 8, 6),))
    state = SimpleNamespace(display=display, topology=topology, closed=0, images=0,
                            race=0, fail=False)

    def init(connection, display_name):
        assert display_name == ":177"
        connection._display = display
        connection.bits, connection.pad = 24, 8

    def power_status(connection):
        return "on"

    def image(connection, monitor):
        state.images += 1
        if state.fail:
            raise OSError("private native diagnostic")
        if state.images <= state.race:
            display.focus = display.target if display.focus is display.leaf else display.leaf
        return b"\x12\x34\x56" * monitor.width * monitor.height

    def close(connection):
        state.closed += 1

    monkeypatch.setattr(_XlibConnection, "__init__", init)
    monkeypatch.setattr(_XlibConnection, "topology", lambda self: state.topology)
    monkeypatch.setattr(_XlibConnection, "power_status", power_status)
    monkeypatch.setattr(_XlibConnection, "image", image)
    monkeypatch.setattr(_XlibConnection, "close", close)
    def configuration(display_name, xauthority, monitor_names):
        return {"display_name": display_name, "xauthority": xauthority,
                "monitor_names": monitor_names}
    monkeypatch.setattr(worker, "attachment_configuration", configuration)
    monkeypatch.setattr(attached, "attachment_configuration", configuration)
    monkeypatch.setattr(scope, "_process_identity", lambda pid: {
        "pid": pid, "uid": 65534, "start_ticks": 101, "exe": "/usr/bin/xed"})
    return state


def request(operation="sources", **extra):
    return {"display_name": ":177", "xauthority": "", "monitor_names": ["screen"],
            "app_profile": "xed", "operation": operation, **extra}


def test_sources_sealed_and_filter_unselected(native):
    native.topology = Topology(1, 8, 6, (
        Monitor((42, (88,)), 0, 0, 4, 6), Monitor((43, (89,)), 4, 0, 4, 6)))
    reply = worker.run(request())
    assert reply["ok"] and len(reply["sources"]) == 1
    source = reply["sources"][0]
    assert (source["name"], source["index"], source["width"], source["height"]) == (
        "screen", 0, 4, 6)
    assert len(source["seal"]) == 64
    assert native.closed == 1 and native.images == 0


@pytest.mark.parametrize("ambiguous", [False, True])
def test_missing_or_ambiguous_sources_close(native, ambiguous):
    if ambiguous:
        native.topology = Topology(1, 8, 6, (
            Monitor((42, (88,)), 0, 0, 4, 6), Monitor((42, (89,)), 4, 0, 4, 6)))
    else:
        native.display.get_atom_name = lambda atom: "missing"
    with pytest.raises(ValueError, match="missing or ambiguous"):
        worker.run(request())
    assert native.closed == 1


@pytest.mark.parametrize("operation,selected,error", [
    ("unknown", None, "unsupported operation"),
    ("capture", {}, "renewed consent"),
])
def test_rejected_request_never_reads_pixels(native, operation, selected, error):
    with pytest.raises(ValueError, match=error):
        worker.run(request(operation, selected=selected))
    assert native.closed == 1 and native.images == 0


@pytest.mark.parametrize("enabled,race", [(False, 0), (True, 0), (True, 1), (True, 3)])
def test_capture_retries_fresh_observations_and_closes(native, monkeypatch, enabled, race):
    selected = worker.run(request())["sources"][0]
    native.race = race
    sleep = Mock()
    monkeypatch.setattr(worker.time, "sleep", sleep)
    req = request("capture", selected=selected, input_enabled=enabled)
    if race == 3:
        with pytest.raises(ValueError, match="application changed during capture"):
            worker.run(req)
        assert native.images == 3 and sleep.call_count == 2
    else:
        reply = worker.run(req)
        assert reply["ok"]
        assert (reply["source_width"], reply["source_height"]) == (8, 6)
        assert (reply["width"], reply["height"]) == (8, 6)
        assert base64.b64decode(reply["image"]).startswith(b"\x89PNG\r\n\x1a\n")
        assert bool(reply["input_scope"]) is enabled
        assert native.images == race + 1 and sleep.call_count == race
        assert reply["delivered_to_source"] and reply["resize_scale"]
    assert native.closed == 2


def test_native_capture_failure_closes(native):
    selected = worker.run(request())["sources"][0]
    native.fail = True
    with pytest.raises(ValueError, match="capture_failed"):
        worker.run(request("capture", selected=selected))
    assert native.closed == 2 and native.images == 1


@pytest.mark.parametrize("mode", ["plain", "gate", "unterminated", "oversized", "json"])
def test_script_protocol_without_subprocess_or_real_alarm(native, monkeypatch, mode):
    payload = json.dumps(request()).encode() + b"\n"
    if mode == "unterminated":
        payload = payload[:-1]
    elif mode == "oversized":
        payload = b"x" * 32769 + b"\n"
    elif mode == "json":
        payload = b"{broken}\n"
    output, ready = io.StringIO(), io.StringIO()
    alarm = Mock()
    monkeypatch.setattr(worker.signal, "alarm", alarm)
    monkeypatch.setattr(sys, "stdin", SimpleNamespace(buffer=io.BytesIO(payload)))
    monkeypatch.setattr(sys, "stdout", output)
    monkeypatch.setattr(sys, "__stdout__", ready)
    monkeypatch.setattr(sys, "argv", ["worker", *(["--identity-gate"] if mode == "gate" else [])])
    monkeypatch.setattr(sys, "path", list(sys.path))
    monkeypatch.setattr(lifecycle, "REVOKED", False)
    monkeypatch.setattr(lifecycle, "process_identity", lambda pid: {"pid": 77})
    monkeypatch.setattr(lifecycle.os, "getpid", lambda: 77)
    reader = io.BytesIO(payload)
    monkeypatch.setattr(lifecycle.os, "read", lambda fd, count: reader.read(count))
    monkeypatch.setattr(lifecycle.select, "select", lambda *args: ([0], [], []))
    runpy.run_path(worker.__file__, run_name="__main__")
    reply = json.loads(output.getvalue())
    alarm.assert_called_once_with(5)
    if mode in {"plain", "gate"}:
        assert reply["ok"] and reply["sources"][0]["name"] == "screen"
        assert native.closed == 1
    else:
        assert reply == {"ok": False, "error": "explicit_x11_capture_unavailable"}
        assert native.closed == 0
    if mode == "gate":
        assert json.loads(ready.getvalue()) == {"ready": "capture", "identity": {"pid": 77}}


@pytest.mark.parametrize("injector,changed,failed", [
    (False, False, False), (True, False, False), (True, True, False), (False, False, True),
])
def test_parent_watch_native_contract(monkeypatch, injector, changed, failed):
    monkeypatch.setattr(lifecycle, "REVOKED", False)
    pids = iter([21, 22 if changed else 21])
    monkeypatch.setattr(lifecycle.os, "getppid", lambda: next(pids))
    install, alarm, prctl = Mock(), Mock(), Mock(return_value=-1 if failed else 0)
    monkeypatch.setattr(lifecycle.signal, "signal", install)
    monkeypatch.setattr(lifecycle.signal, "alarm", alarm)
    library = Mock(return_value=SimpleNamespace(prctl=prctl))
    monkeypatch.setattr(lifecycle.ctypes, "CDLL", library)
    if failed:
        with pytest.raises(RuntimeError, match="parent_watch_unavailable"):
            lifecycle.parent_watch(injector=injector)
    else:
        lifecycle.parent_watch(injector=injector)
    library.assert_called_once_with(None, use_errno=True)
    assert [call.args for call in install.call_args_list] == [
        (sig, lifecycle.revoke) for sig in (
            lifecycle.signal.SIGTERM, lifecycle.signal.SIGHUP, lifecycle.signal.SIGINT)]
    death_signal = lifecycle.signal.SIGKILL if injector else lifecycle.signal.SIGTERM
    prctl.assert_called_once_with(1, death_signal, 0, 0, 0)
    assert lifecycle.REVOKED is changed
    assert alarm.call_count == int(injector and not failed)
    if injector and not failed:
        alarm.assert_called_once_with(4)


@pytest.mark.parametrize("mode,error", [
    ("ok", None), ("revoked", "launch_gate_revoked"), ("timeout", "launch_gate_revoked"),
    ("eof", "launch_gate_eof"), ("limit", "launch_gate_limit"), ("json", "json"),
])
def test_gate_low_level_stream_bounds(monkeypatch, mode, error):
    monkeypatch.setattr(lifecycle, "REVOKED", mode == "revoked")
    clock = iter([0, 3]) if mode == "timeout" else None
    monkeypatch.setattr(lifecycle.time, "monotonic", lambda: next(clock) if clock else 0)
    payload = {"ok": b'{"ack":7}\n', "eof": b"", "limit": b"x" * 65537,
               "json": b"{\n"}.get(mode, b"")
    reader = io.BytesIO(payload)
    reads = Mock(side_effect=lambda fd, count: reader.read(count))
    monkeypatch.setattr(lifecycle.os, "read", reads)
    polls = [0]

    def select_ready(read, write, errors, timeout):
        assert read == [57] and write == errors == [] and 0 <= timeout <= .05
        polls[0] += 1
        return ([], [], []) if polls[0] == 1 else ([57], [], [])

    monkeypatch.setattr(lifecycle.select, "select", select_ready)
    if error == "json":
        with pytest.raises(json.JSONDecodeError):
            lifecycle.read_gate(57)
    elif error:
        with pytest.raises(RuntimeError, match=error):
            lifecycle.read_gate(57)
    else:
        assert lifecycle.read_gate(57) == {"ack": 7}
    if mode in {"revoked", "timeout"}:
        reads.assert_not_called()
    if mode == "limit":
        assert reads.call_count == 65537


@pytest.mark.parametrize("pid", [None, 81])
def test_announce_returns_exact_identity(monkeypatch, pid):
    output = io.StringIO()
    identity = {"pid": 81 if pid else 72, "start_ticks": 999}
    lookup = Mock(return_value=identity)
    monkeypatch.setattr(lifecycle, "process_identity", lookup)
    monkeypatch.setattr(lifecycle.os, "getpid", lambda: 72)
    monkeypatch.setattr(sys, "__stdout__", output)
    assert lifecycle.announce("injector", pid) is identity
    lookup.assert_called_once_with(identity["pid"])
    assert json.loads(output.getvalue()) == {"ready": "injector", "identity": identity}


@pytest.mark.parametrize("payload,accepted", [(b'{"ack":{"pid":7}}\n', True),
                                             (b'{"ack":{"pid":8}}\n', False)])
def test_acknowledgement_requires_exact_identity(monkeypatch, payload, accepted):
    monkeypatch.setattr(lifecycle, "REVOKED", False)
    reader = io.BytesIO(payload)
    monkeypatch.setattr(lifecycle.os, "read", lambda fd, count: reader.read(count))
    monkeypatch.setattr(lifecycle.select, "select", lambda *args: ([0], [], []))
    if accepted:
        assert lifecycle.acknowledge({"pid": 7}) is None
    else:
        with pytest.raises(RuntimeError, match="launch_ack_mismatch"):
            lifecycle.acknowledge({"pid": 7})
