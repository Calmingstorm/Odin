"""In-process qualification of private assets with fake GI and OS boundaries."""
import importlib.util
import io
import json
import stat
import types
from pathlib import Path
from unittest.mock import Mock

import pytest

ASSETS = Path(__file__).resolve().parents[1] / "src/computer/runtime/assets"
NS = types.SimpleNamespace


def load(name):
    spec = importlib.util.spec_from_file_location(name, ASSETS / f"wayland_probe_{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def receiver():
    m = load("receiver")
    gtk, glib, display, output = Mock(), Mock(), Mock(), Mock()
    masks = NS(**dict.fromkeys(("BUTTON_PRESS_MASK", "BUTTON_RELEASE_MASK", "KEY_PRESS_MASK",
                               "KEY_RELEASE_MASK", "POINTER_MOTION_MASK", "FOCUS_CHANGE_MASK"), 1))
    gdk = NS(EventMask=masks, EventType=NS(BUTTON_PRESS=1))
    r = m.Receiver(gtk, gdk, glib, display, output=output)
    r.win.get_window.return_value.get_device_position.return_value = (None, 12, 34, 256)
    return m, r


def event():
    return NS(type=1, get_keyval=lambda: (True, 65), get_keycode=lambda: (True, 38),
              get_button=lambda: (True, 1))


def test_receiver_success(receiver, capsys):
    m, r = receiver
    m.emit("test", value=4)
    assert json.loads(capsys.readouterr().out)["value"] == 4
    assert r.on_key_press(None, event())
    assert r.keys == {65}
    r.on_key_release(None, event())
    r.on_button_press(None, event())
    assert r.buttons == {1}
    assert not r.on_button_press(None, NS(type=2))
    r.on_button_release(None, event())
    assert r.ledger() == {"keys": [], "buttons": []}
    assert r.sample()
    assert r.output.call_args.kwargs["pointer_x"] == 12
    assert not r.on_map(None, None)
    assert not r.on_ready()
    assert r.ready
    assert not r.on_ready()
    assert r.run() == 0
    assert not r.expire()
    r.Gtk.main_quit.assert_called()


@pytest.mark.parametrize("field", ["get_keyval", "get_keycode"])
def test_receiver_event_failure(receiver, field):
    _, r = receiver
    e = event()
    setattr(e, field, lambda: (False, 0))
    assert r.on_key_press(None, e)
    assert r.failed
    assert r.record(e, "key_press")
    assert not r.sample()
    assert not r.on_ready()
    assert r.run() == 1


@pytest.mark.parametrize("fault", ["surface", "seat", "pointer", "shape"])
def test_receiver_sample_failure(receiver, fault):
    _, r = receiver
    if fault == "surface":
        r.win.get_window.return_value = None
    elif fault == "seat":
        r.display.get_default_seat.return_value = None
    elif fault == "pointer":
        r.display.get_default_seat.return_value.get_pointer.return_value = None
    else:
        r.win.get_window.return_value.get_device_position.return_value = (1, 2)
    assert not r.sample()
    assert r.failed
    assert r.output.call_args.kwargs["where"] == "sample"


def test_receiver_ready_failure(receiver):
    _, r = receiver
    r.area.get_window.return_value = None
    assert not r.on_ready()
    assert r.failed
    assert r.on_close()


@pytest.mark.parametrize("initialized,valid", [(True, True), (False, True), (True, False)])
def test_receiver_gtk(monkeypatch, initialized, valid):
    m = load("receiver")
    gtk, gdk, gi, glib = Mock(), Mock(), Mock(), Mock()
    gtk.init_check.return_value = (initialized, [])
    display = NS(__gtype__=NS(name="GdkWaylandDisplay"))
    gdk.Display.get_default.return_value = display if valid else None
    modules = {"gi": gi, "gi.repository.Gdk": gdk,
               "gi.repository.Gtk": gtk, "gi.repository.GLib": glib}
    monkeypatch.setattr(m, "importlib", NS(import_module=modules.__getitem__))
    monkeypatch.setattr(m, "os", NS(environ={}))
    if initialized and valid:
        assert m.initialize_gtk()[:3] == (gtk, gdk, glib)
    else:
        with pytest.raises(RuntimeError):
            m.initialize_gtk()
    assert m.os.environ["GDK_BACKEND"] == "wayland"


@pytest.mark.parametrize("mode", ["args", "success", "guard"])
def test_receiver_main(monkeypatch, mode):
    m = load("receiver")
    monkeypatch.setattr(m, "sys", NS(argv=["receiver"] + (["extra"] if mode == "args" else [])))
    monkeypatch.setattr(m, "signal", Mock(SIGALRM=14))
    guard = Mock(side_effect=RuntimeError("guard") if mode == "guard" else None)
    importer = NS(import_module=lambda _: NS(assert_private_environment=guard))
    monkeypatch.setattr(m, "importlib", importer)
    monkeypatch.setattr(m, "initialize_gtk", lambda: ())
    monkeypatch.setattr(m, "Receiver", Mock(return_value=NS(run=lambda: 0)))
    assert m.main() == {"args": 2, "success": 0, "guard": 1}[mode]
    if mode != "args":
        m.signal.alarm.assert_called_with(0)
    if mode == "guard":
        m.Receiver.assert_not_called()


def test_receiver_watchdog(monkeypatch):
    m = load("receiver")
    fake = Mock()
    fake.getpid.return_value = 123
    fake._exit.side_effect = SystemExit(124)
    monkeypatch.setattr(m, "os", fake)
    with pytest.raises(SystemExit) as exc:
        m.watchdog(None, None)
    assert exc.value.code == 124
    assert json.loads(fake.write.call_args.args[1])["where"] == "watchdog"
    fake.set_blocking.assert_called_once_with(1, False)


@pytest.mark.parametrize("fault", [None, "nonce", "env", "mode", "marker", "namespace",
                                   "rw", "devices", "bus", "display"])
def test_private_guard(monkeypatch, fault):
    m = load("private")
    nonce = "a" * 64
    env = dict(ODIN_WAYLAND_PROBE_NONCE=nonce, HOME="/home/probe", XDG_RUNTIME_DIR="/run/probe",
               WAYLAND_DISPLAY="wayland-probe", GDK_BACKEND="wayland")
    value = {"nonce": "wrong" if fault == "marker" else nonce,
             **{f"outer_{k}_namespace": "outer" for k in ("pid", "mnt", "net")}}
    path = Mock()
    path.stat.return_value = NS(st_uid=1000, st_mode=0o644 if fault == "mode" else 0o600)
    path.read_text.return_value = json.dumps(value)
    path.exists.return_value = fault == "devices"
    fake = Mock(environ=env, ST_RDONLY=1)
    fake.getuid.return_value = 1000
    fake.readlink.return_value = "outer" if fault == "namespace" else "inner"
    fake.statvfs.return_value = NS(f_flag=0 if fault == "rw" else 1)
    for case, key in [("nonce", "ODIN_WAYLAND_PROBE_NONCE"), ("env", "HOME"),
                      ("bus", "DBUS_SESSION_BUS_ADDRESS"), ("display", "DISPLAY")]:
        if fault == case:
            env[key] = "wrong"
    monkeypatch.setattr(m, "os", fake)
    monkeypatch.setattr(m, "Path", lambda _: path)
    if fault:
        with pytest.raises(RuntimeError, match="private_probe_"):
            m.assert_private_environment()
    else:
        assert m.assert_private_environment() == value


@pytest.mark.parametrize("fault", [None, "path", "owner", "changed", "overflow", "overflow_rw"])
def test_measure(monkeypatch, fault):
    m = load("private")
    data = io.BytesIO(b"immutable fixture")
    data.fileno = lambda: 50
    monkeypatch.setattr(m, "open", lambda *a: data, raising=False)
    owner = 65534 if fault in ("overflow", "overflow_rw") else 1000 if fault == "owner" else 0
    info = NS(st_uid=owner, st_mode=stat.S_IFREG | 0o644, st_size=17,
              st_mtime_ns=1, st_ctime_ns=2, st_dev=1, st_ino=9)
    after = NS(**vars(info))
    if fault == "changed":
        after.st_ctime_ns += 1
    fake = Mock(environ={"ODIN_WAYLAND_PROBE_NONCE": "a" * 64}, ST_RDONLY=1)
    fake.fstat.side_effect = [info, after]
    fake.fstatvfs.return_value = NS(f_flag=0 if fault == "overflow_rw" else 1)
    fake.major.return_value, fake.minor.return_value = 0, 1
    monkeypatch.setattr(m, "os", fake)
    monkeypatch.setattr(m, "assert_private_environment", Mock())
    path = "/tmp/bad" if fault == "path" else "/usr/lib/example"
    if fault in (None, "overflow"):
        result = m.measured_object(path)
        assert result["inode"] == 9 and len(result["sha256"]) == 64
    else:
        with pytest.raises(RuntimeError):
            m.measured_object(path)


def obj(path="/usr/lib/libEGL.so"):
    return dict(path=path, inode=9, device="00:01", sha256="abc")


def test_mapping(monkeypatch):
    m = load("private")
    assert m.device_equal("00:01", "0:1")
    assert not m.device_equal("not-hex", "0:1")
    maps = "short\n0-1 r--p 0 00:01 9 /usr/lib/no\n0-1 r-xp 0 00:01 9 /usr/lib/libEGL.so\n"
    monkeypatch.setattr(m, "Path", lambda _: NS(read_text=lambda: maps))
    monkeypatch.setattr(m, "measured_object", lambda p: obj(p))
    assert m.mapped_objects(123) == [obj()]
    maps = maps.replace("00:01 9 /usr/lib/libEGL", "00:01 10 /usr/lib/libEGL")
    with pytest.raises(RuntimeError, match="mapped_object_replaced"):
        m.mapped_objects(123)


@pytest.mark.parametrize("fault", [None, "exe", "missing", "different", "extra"])
def test_same_stack(monkeypatch, fault):
    m = load("private")
    expected = {"executable": obj("/usr/bin/compositor"), "libraries": [obj()]}
    monkeypatch.setattr(m, "os", NS(readlink=lambda _: "/usr/bin/compositor"))
    monkeypatch.setattr(m, "measured_object",
                        lambda p: obj("/usr/bin/other" if fault == "exe" else p))
    actual = [] if fault == "missing" else [obj()]
    if fault == "different":
        actual[0]["sha256"] = "wrong"
    if fault == "extra":
        actual.append(obj("/usr/lib/libGL.so"))
    monkeypatch.setattr(m, "mapped_objects", lambda _: actual)
    if fault:
        with pytest.raises(RuntimeError) as exc:
            m.require_same_stack(expected, 123)
        if fault in ("missing", "different"):
            assert isinstance(exc.value, m.StackMismatchError)
            assert exc.value.stack_detail["expected"] == obj()
    else:
        assert m.require_same_stack(expected, 123)["libraries"] == actual
    assert not m.relevant_library("/usr/lib/libglib.so")
    assert m.relevant_library("/usr/lib/iris_dri.so")


@pytest.fixture
def gate(monkeypatch):
    m = load("gate")
    fake = Mock()
    fake.getppid.return_value = 42
    fake.getpid.return_value = 123
    fake.read.return_value = b'["/usr/bin/bwrap", "--unshare-all"]\n'
    monkeypatch.setattr(m, "os", fake)
    monkeypatch.setattr(m, "sys", NS(argv=["gate", "42"]))
    monkeypatch.setattr(m, "ctypes", NS(CDLL=lambda *a, **k: NS(prctl=lambda *a: 0)))
    monkeypatch.setattr(m, "select", NS(select=lambda *a: ([0], [], [])))
    monkeypatch.setattr(m, "time", Mock(monotonic=Mock(return_value=0)))
    monkeypatch.setattr(m, "signal", Mock(SIGTERM=15, SIGKILL=9))
    return m


@pytest.mark.parametrize("fault", [None, "prctl", "parent", "select", "eof", "invalid", "oversize"])
def test_gate_main(gate, monkeypatch, fault):
    m = gate
    supervise = Mock(return_value=7)
    monkeypatch.setattr(m, "supervise", supervise)
    if fault == "prctl":
        monkeypatch.setattr(m, "ctypes", NS(CDLL=lambda *a, **k: NS(prctl=lambda *a: 1)))
    if fault == "parent":
        m.os.getppid.side_effect = [42, 43]
    if fault == "select":
        monkeypatch.setattr(m, "select", NS(select=lambda *a: ([], [], [])))
    if fault == "eof":
        m.os.read.return_value = b""
    if fault == "invalid":
        m.os.read.return_value = b'{}\n'
    if fault == "oversize":
        m.os.read.return_value = b"x" * 4096
    assert m.main() == (7 if fault is None else 2)
    if fault:
        supervise.assert_not_called()


@pytest.mark.parametrize("mode", ["done", "stop", "timeout"])
def test_gate_supervise(gate, monkeypatch, mode):
    m = gate
    child = Mock(returncode=0 if mode == "done" else None)
    child.poll.return_value = 0 if mode == "done" else None
    monkeypatch.setattr(m, "subprocess", NS(Popen=Mock(return_value=child), DEVNULL=-3))
    cleanup = Mock()
    monkeypatch.setattr(m, "reap_owned", cleanup)
    if mode == "stop":
        m.time.sleep.side_effect = lambda _: m.signal.signal.call_args.args[1](15, None)
    if mode == "timeout":
        m.time.monotonic.side_effect = [0, 0, 79]
    assert m.supervise(["fake"]) == (0 if mode == "done" else 124)
    cleanup.assert_called_once_with(child)


@pytest.mark.parametrize("mode", ["done", "terminate", "kill", "adopted", "stuck"])
def test_gate_cleanup(gate, monkeypatch, mode):
    m = gate
    child = Mock()
    child.poll.return_value = 0 if mode in ("done", "adopted", "stuck") else None
    if mode == "kill":
        child.wait.side_effect = [m.subprocess.TimeoutExpired("fake", 1), 0]
    reads = Mock(side_effect=["88 89", ""] if mode == "adopted" else None, return_value="")
    monkeypatch.setattr(m, "Path", lambda _: NS(read_text=reads))
    m.os.kill.side_effect = [None, ProcessLookupError()]
    m.os.waitpid.side_effect = [(88, 0), ChildProcessError()]
    if mode == "stuck":
        m.time.monotonic.side_effect = [0, 2]
        with pytest.raises(RuntimeError, match="probe_outer_cleanup_failed"):
            m.reap_owned(child)
    else:
        m.reap_owned(child)
    if mode in ("terminate", "kill"):
        child.terminate.assert_called_once()
    if mode == "kill":
        child.kill.assert_called_once()
    if mode == "adopted":
        assert m.os.kill.call_count == 2
