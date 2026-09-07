"""Exercise runtime boundaries using fake native APIs, never a real display."""
import asyncio
import ctypes
import hashlib
import io
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.runtime import accessibility, primitives, profile, recovery

NS = SimpleNamespace


@pytest.fixture(autouse=True)
def no_native_effects(monkeypatch):
    def denied(*args, **kwargs):
        pytest.fail("Unexpected native operation")
    monkeypatch.setattr(subprocess, "Popen", denied)
    monkeypatch.setattr(ctypes, "CDLL", denied)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", denied)
    monkeypatch.setitem(sys.modules, "Xlib", NS(display=NS(Display=denied)))
    monkeypatch.setitem(sys.modules, "gi", None)


@pytest.mark.parametrize("name", [None, "", "../bad", "bad..name", "bad.", "bad ", "x" * 129])
def test_basename_refuses_ambiguous_paths(name):
    with pytest.raises(ValueError):
        profile.basename(name)


def test_profile_validation_and_preflight(monkeypatch):
    assert profile.basename("Drawing 1.png") == "Drawing 1.png"
    unit = profile.unit_for("session_1")
    assert profile.validate_unit(unit) == unit
    with pytest.raises(ValueError):
        profile.validate_unit("sshd.service")
    with pytest.raises(ValueError):
        profile.validate_session("../escape")
    assert profile.clean_environment() == {
        "PATH": "/usr/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}
    with pytest.raises(ValueError):
        profile.preflight("terminal")
    monkeypatch.setattr(profile.os, "access", lambda path, mode: True)
    assert profile.preflight() is None
    assert profile.preflight("drawing") is None
    monkeypatch.setattr(profile.os, "access", lambda path, mode: not path.endswith("/xed"))
    with pytest.raises(RuntimeError, match="xed"):
        profile.preflight("xed")
    monkeypatch.setattr(profile, "__file__", "/tmp/unsafe path/profile.py")
    with pytest.raises(ValueError, match="encoded safely"):
        profile.launch_argv("session_1", "xed")


def descriptor(kind="processes"):
    result = dict(version=1, session_id="s", kind=kind, boot_id="a" * 36,
                  launch_pending=False, processes=[dict(pid=42, start_ticks=123)])
    if kind == "isolated":
        token = hashlib.sha256(b"s").hexdigest()[:32] + "-" + "b" * 32
        result.update(token=token, unit=profile.unit_for(token))
    else:
        result.update(no_persistent_devices=True, input_was_enabled=False)
    return result


def proc_stat(start=123, group=0, session=0):
    fields = ["S", "1", str(group), str(session)] + ["0"] * 15 + [str(start)]
    return "42 (name with ) parens) " + " ".join(fields)


def test_recovery_identity_parser_and_boot_validation(monkeypatch):
    monkeypatch.setattr(recovery.Path, "read_text", lambda self: proc_stat())
    assert recovery.process_identity(42) == {"pid": 42, "start_ticks": 123}
    with pytest.raises(ValueError, match="boot identity"):
        recovery.boot_id()
    monkeypatch.setattr(recovery.Path, "read_text", lambda self: "a" * 36 + "\n")
    assert recovery.boot_id() == "a" * 36


@pytest.mark.parametrize("change", [
    dict(version=2), dict(processes=[{"pid": True, "start_ticks": 1}]),
    dict(no_persistent_devices=False)])
def test_descriptor_rejects_invalid_ownership(change):
    value = descriptor()
    value.update(change)
    with pytest.raises(ValueError):
        recovery.validate_descriptor(value, "s")


def test_process_tree_inspection_is_conservative(tmp_path, monkeypatch):
    value = descriptor("isolated")
    (tmp_path / "non-process").mkdir()
    child = tmp_path / "55"
    child.mkdir()
    (child / "stat").write_text(proc_stat(start=9, group=42))
    assert recovery._processes_gone(value, proc_root=tmp_path) == "owned_process_group_remaining"
    (child / "stat").write_text(proc_stat(start=9))
    assert recovery._processes_gone(value, proc_root=tmp_path) is None
    (child / "stat").write_text("invalid")
    assert recovery._processes_gone(value, proc_root=tmp_path) == "process_inspection_unavailable"
    (child / "stat").unlink()
    assert recovery._processes_gone(value, proc_root=tmp_path) is None
    clock = iter([0, 2])
    monkeypatch.setattr(recovery.time, "monotonic", lambda: next(clock))
    assert recovery._processes_gone(value, proc_root=tmp_path) == "process_inspection_unavailable"
    clock = iter([0, 0, 2])
    assert recovery._processes_gone(value, proc_root=tmp_path) == "process_inspection_unavailable"


@pytest.mark.asyncio
@pytest.mark.parametrize("code,data,expected", [
    (0, b"Id=u\nActiveState=inactive\nignored", {"Id": "u", "ActiveState": "inactive"}),
    (4, b"LoadState=not-found\n", {"LoadState": "not-found"}),
    (7, b"Id=u", None), (0, b"a" * 4097, None)])
async def test_unit_probe_parses_bounded_status(monkeypatch, code, data, expected):
    proc = NS(returncode=code, communicate=AsyncMock(return_value=(data, b"")))
    launch = AsyncMock(return_value=proc)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", launch)
    assert await recovery._unit_state("owned.service") == expected
    assert launch.call_args.args[:3] == ("/usr/bin/systemctl", "show", "--no-pager")
    assert launch.call_args.args[-1] == "owned.service"


@pytest.mark.asyncio
async def test_unit_probe_failure_reaps_only_probe(monkeypatch):
    proc = NS(returncode=None, communicate=AsyncMock(side_effect=TimeoutError),
              kill=Mock(), wait=AsyncMock())
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=proc))
    with pytest.raises(TimeoutError):
        await recovery._unit_state("owned.service")
    proc.kill.assert_called_once_with()
    proc.wait.assert_awaited_once_with()


def test_cgroup_malformed_events_fail_closed(tmp_path):
    path = tmp_path / "system.slice" / "owned.service"
    path.mkdir(parents=True)
    (path / "cgroup.events").write_text("malformed\n")
    assert not recovery._cgroup_empty("owned.service", root=tmp_path)


@pytest.mark.asyncio
async def test_verify_absence_returns_reason_not_exception(monkeypatch):
    assert await recovery.verify_absence(None) == {
        "status": "unknown", "reason": "inspection_unavailable"}
    monkeypatch.setattr(recovery, "boot_id", lambda: "a" * 36)
    monkeypatch.setattr(recovery, "_processes_gone", lambda value: "owned_process_remaining")
    assert await recovery.verify_absence(descriptor()) == {
        "status": "unknown", "reason": "owned_process_remaining"}


def fake_display(monkeypatch, nodes, root=None):
    display = NS(create_resource_object=lambda kind, ident: nodes[ident], close=Mock(),
                 screen=lambda: NS(root=root))
    opener = Mock(return_value=display)
    monkeypatch.setitem(sys.modules, "Xlib", NS(display=NS(Display=opener)))
    return display, opener


@pytest.mark.parametrize("chain,expected", [
    ({2: 3, 3: 9}, True), ({2: 1}, False), ({2: 3, 3: 2}, False), ({2: 0}, False),
    ({2: 100, **{i: i + 1 for i in range(100, 170)}}, False)])
def test_native_ancestry_bounded_and_display_closed(monkeypatch, chain, expected):
    nodes = {i: NS(query_tree=lambda p=p: NS(parent=NS(id=p), root=NS(id=1)))
             for i, p in chain.items()}
    display, opener = fake_display(monkeypatch, nodes)
    desktop = primitives.NativeDesktop(clock=lambda: 0)
    desktop._deadline = 10
    assert desktop._window_descendant(2, 9) is expected
    opener.assert_called_once_with(":77")
    display.close.assert_called_once_with()


def test_native_transient_and_frame_geometry(monkeypatch):
    parent = NS(id=3, query_tree=lambda: NS(parent=NS(id=1), root=NS(id=1)),
                get_geometry=lambda: NS(x=2, y=4, width=8, height=16))
    node = NS(get_wm_transient_for=lambda: parent,
              query_tree=lambda: NS(parent=parent, root=NS(id=1)))
    display, _ = fake_display(monkeypatch, {2: node})
    desktop = primitives.NativeDesktop(clock=lambda: 0, command_runner=lambda *a, **kw: "42")
    desktop._deadline = 10
    assert desktop._same_app_transient({"id": 2, "pid": 42})
    assert accessibility.Accessibility._native_frame_bounds({"id": 2}, Mock()) == (2, 4, 8, 16)
    assert display.close.call_count == 2
    parent.query_tree = lambda: NS(parent=parent, root=NS(id=1))
    assert accessibility.Accessibility._native_frame_bounds({"id": 2}, Mock()) is None


def test_identity_parser_and_missing_process(monkeypatch):
    monkeypatch.setattr("builtins.open", lambda *a, **kw: io.StringIO(proc_stat()))
    assert primitives.NativeDesktop._identity(42) == (1, 123)
    monkeypatch.setattr("builtins.open", Mock(side_effect=FileNotFoundError))
    assert primitives.NativeDesktop._identity(42) is None


def test_ownership_loop_and_depth_bounds(monkeypatch):
    desktop = primitives.NativeDesktop()
    monkeypatch.setattr(desktop, "_identity", lambda pid: (pid, 1))
    assert not desktop._owned(42)
    monkeypatch.setattr(desktop, "_identity", lambda pid: (pid + 1, 1))
    assert not desktop._owned(42)


@pytest.mark.parametrize("result,output", [(0, b" hello \n"), (1, b"failed"), (0, b"a" * 65537)])
def test_native_command_transport_exit_and_size(monkeypatch, result, output):
    class Process:
        returncode = result
        communicate = Mock(side_effect=[subprocess.TimeoutExpired("fake", .1), (output, None)])
        poll = Mock(return_value=result)
    launch = Mock(return_value=Process())
    monkeypatch.setattr(subprocess, "Popen", launch)
    desktop = primitives.NativeDesktop(clock=lambda: 0)
    desktop._deadline = 10
    if result or len(output) > 65536:
        with pytest.raises(primitives.PrimitiveError, match="failed|bounds"):
            desktop._run("getactivewindow")
    else:
        assert desktop._run("getactivewindow") == "hello"
    assert desktop._processes == set()
    assert launch.call_args.args[0] == [primitives.XDOTOOL, "getactivewindow"]


def test_launch_failed_identity_reaps_fake_child(monkeypatch):
    proc = NS(pid=42, poll=Mock(return_value=None), kill=Mock(), wait=Mock())
    monkeypatch.setattr(subprocess, "Popen", Mock(return_value=proc))
    desktop = primitives.NativeDesktop()
    monkeypatch.setattr(desktop, "_identity", lambda pid: None)
    assert desktop.launch("drawing")["status"] == "failed"
    proc.kill.assert_called_once_with()
    proc.wait.assert_called_once_with(timeout=.1)
    assert desktop._apps == {}
    monkeypatch.setattr(subprocess, "Popen", Mock(side_effect=OSError))
    assert desktop.launch("xed")["status"] == "unsupported"


class NativeFunction:
    def __init__(self, fn=lambda *a: 1):
        self.fn = fn
        self.calls = []

    def __call__(self, *args):
        self.calls.append(args)
        return self.fn(*args)


def xlibs(monkeypatch):
    names = ("XOpenDisplay", "XInternAtom", "XGetWindowProperty", "XFree", "XCloseDisplay",
             "XQueryKeymap", "XSync", "XTestFakeKeyEvent")
    lib = NS(**{name: NativeFunction() for name in names})
    monkeypatch.setattr(ctypes, "CDLL", lambda name: lib)
    return lib


@pytest.mark.parametrize("case", ["success", "absent", "open_failed", "property_failed"])
def test_modal_property_native_boundary(monkeypatch, case):
    lib = xlibs(monkeypatch)
    values = (ctypes.c_ulong * 1)(17)
    lib.XInternAtom.fn = lambda display, name, only: 17 if name.endswith(b"MODAL") else 16
    if case == "open_failed":
        lib.XOpenDisplay.fn = lambda *a: 0

    def property_result(*args):
        args[7]._obj.value = 4
        args[8]._obj.value = 32
        args[9]._obj.value = 1 if case == "success" else 0
        pointer = ctypes.POINTER(ctypes.c_ubyte)
        ctypes.cast(args[11], ctypes.POINTER(pointer))[0] = ctypes.cast(values, pointer)
        return 1 if case == "property_failed" else 0
    lib.XGetWindowProperty.fn = property_result
    desktop = primitives.NativeDesktop()
    if case in {"open_failed", "property_failed"}:
        with pytest.raises(primitives.PrimitiveError):
            desktop._modal(22)
    else:
        assert desktop._modal(22) is (case == "success")
    assert len(lib.XCloseDisplay.calls) == (case != "open_failed")
    assert len(lib.XFree.calls) == (case != "open_failed")


@pytest.mark.parametrize("case", [
    "success", "open_failed", "query_failed", "release_failed", "held"])
def test_typed_keys_native_release_verifies_keymap(monkeypatch, case):
    lib = xlibs(monkeypatch)
    desktop = primitives.NativeDesktop(clock=lambda: 0)
    desktop._deadline = 10
    queries = []

    def query(display, state):
        queries.append(1)
        state[2] = 1 if len(queries) == 1 or case == "held" else 0
        return 0 if case == "query_failed" else 1
    lib.XQueryKeymap.fn = query
    if case == "open_failed":
        lib.XOpenDisplay.fn = lambda *a: 0
    if case == "release_failed":
        lib.XTestFakeKeyEvent.fn = lambda *a: 0
    if case == "success":
        desktop._release_typed_keys()
        assert lib.XTestFakeKeyEvent.calls == [(1, 16, 0, 0)]
        assert len(queries) == 2
    else:
        with pytest.raises(primitives.PrimitiveError):
            desktop._release_typed_keys()
    assert len(lib.XCloseDisplay.calls) == (case != "open_failed")


def test_accessibility_load_uses_bounded_timeout_once(monkeypatch):
    api = NS(set_timeout=Mock())
    gi = NS(require_version=Mock())
    monkeypatch.setitem(sys.modules, "gi", gi)
    monkeypatch.setitem(sys.modules, "gi.repository", NS(Atspi=api))
    access = accessibility.Accessibility()
    assert access._load() is api
    assert access._load() is api
    gi.require_version.assert_called_once_with("Atspi", "2.0")
    api.set_timeout.assert_called_once_with(100, 100)


@pytest.mark.parametrize("problem,diagnostic", [
    ("name", "Accessible name is unbounded"),
    ("states", "Accessible states exceed metadata bounds"),
    ("bounds", "Accessible bounds are invalid"),
])
def test_accessibility_unbounded_metadata_refused(problem, diagnostic):
    access = accessibility.Accessibility()
    access.api = NS(CoordType=NS(SCREEN=0))
    node = NS(get_role_name=lambda: "frame",
              get_name=lambda: "x" * (16385 if problem == "name" else 1),
              get_state_set=lambda: NS(get_states=lambda: range(65 if problem == "states" else 1)),
              get_component_iface=lambda: NS(
                  get_extents=lambda coord: NS(
                      x=0, y=0, width=-1 if problem == "bounds" else 2, height=2)))
    with pytest.raises(accessibility.PrimitiveError, match=diagnostic) as exc:
        access._data(node)
    assert exc.value.status == "unsupported"
