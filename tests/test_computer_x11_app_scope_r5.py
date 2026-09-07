"""Hermetic protocol and /proc stubs. No display, real input, or production bypass."""
from types import SimpleNamespace as NS  # noqa: N814 - Compact protocol reply fixtures.

import pytest

from src.computer.runtime import x11_app_scope as scope


class Window:
    def __init__(self, display, xid, parent=None):
        self.display, self.id, self.parent = display, xid, parent
        self.props = {}
        self.child = 0
        self.geometry = [20, 30, 300, 200]
        self.viewable = 2
        self.override = False

    def query_tree(self):
        return NS(parent=self.parent, children=[])

    def get_property(self, atom, kind, offset, length):
        assert kind == offset == 0 and length == 1024
        value = self.props.get(atom)
        if value is None:
            return None
        if isinstance(value, NS):
            return value
        return NS(format=8 if isinstance(value, bytes) else 32, bytes_after=0, value=value)

    def get_attributes(self):
        return NS(map_state=self.viewable, override_redirect=self.override)

    def get_geometry(self):
        return NS(width=self.geometry[2], height=self.geometry[3])

    def translate_coords(self, target, x, y):
        return NS(x=target.geometry[0], y=target.geometry[1], same_screen=True)

    def xrandr_get_monitors(self, active):
        assert active is True
        return NS(monitors=self.display.monitors)

    def query_pointer(self):
        return NS(same_screen=True, root_x=self.display.pointer[0],
                  root_y=self.display.pointer[1], child=self.child)


class Display:
    def __init__(self):
        self.name = ":177"
        self.root = Window(self, 10)
        self.root.geometry = [0, 0, 800, 600]
        self.target = Window(self, 20, self.root)
        self.leaf = Window(self, 21, self.target)
        self.windows = {w.id: w for w in (self.root, self.target, self.leaf)}
        self.target.props = {"WM_STATE": [1, 0], "_NET_WM_PID": [999999],
                             "WM_CLASS": b"xed\0Xed\0", "WM_NAME": b"Untitled"}
        self.focus = self.leaf
        self.pointer = (50, 60)
        self.root.child, self.target.child = self.target, self.leaf
        self.owners = {20: 1234, 21: 1234}
        self.version = (1, 2)
        self.pid_queries = []
        self.monitors = [NS(name=42, x=0, y=0, width_in_pixels=800,
                            height_in_pixels=600, crtcs=[88])]

    def get_display_name(self):
        return self.name

    def screen(self):
        return NS(root=self.root)

    def intern_atom(self, name, only_if_exists):
        assert only_if_exists
        return name

    def get_input_focus(self):
        return NS(focus=self.focus)

    def create_resource_object(self, kind, xid):
        assert kind == "window"
        return self.windows[xid]

    def res_query_version(self, major, minor):
        assert (major, minor) == (1, 2)
        return NS(server_major=self.version[0], server_minor=self.version[1])

    def res_query_client_ids(self, specs):
        assert len(specs) == 1 and specs[0]["mask"] == 2
        xid = specs[0]["client"]
        self.pid_queries.append(xid)
        return NS(ids=[{"spec": {"mask": 2, "client": 0x200000},
                        "value": [self.owners[xid]]}])


@pytest.fixture
def app(monkeypatch):
    display = Display()
    monkeypatch.setattr(scope, "_process_identity", lambda pid: {
        "pid": pid, "uid": 65534, "start_ticks": 101, "exe": "/usr/bin/xed"})
    return display, scope.AppScope(display), NS(x=0, y=0, width=800, height=600)


def test_snapshot_private_proof_and_spoofed_wm_pid_ignored(app):
    import json

    display, checker, monitor = app
    result = checker.snapshot(monitor)
    assert result["window"] == 20 and result["focus_window"] == 21
    assert result["process"]["pid"] == 1234
    assert result["rect"] == [20, 30, 300, 200]
    assert result["source_origin"] == [0, 0]
    assert result == json.loads(json.dumps(result))
    assert result["focused"] and not result["modal"]
    assert result["modal_kind"] is None
    assert len(result["fingerprint"]) == 64
    assert "Untitled" not in str(result) and "WM_NAME" not in result
    assert 999999 not in display.pid_queries
    assert checker.assert_snapshot(result, monitor, (50, 60)) == result


@pytest.mark.parametrize("name", ["localhost:177", "host:177", ""])
def test_main_session_and_remote_rejected_before_requests(name):
    display = Display()
    display.name = name
    with pytest.raises(scope.ScopeFailure):
        scope.AppScope(display)
    assert not display.pid_queries


@pytest.mark.parametrize("title", [b"Terminal", b"Password", b"Odin", b"Security dialog"])
def test_negative_metadata_is_not_approved(app, title):
    display, checker, monitor = app
    display.target.props["WM_NAME"] = title
    assert checker.snapshot(monitor) is None


def test_focus_other_owner_and_no_focus_rejected(app):
    display, checker, monitor = app
    display.owners[21] = 8888
    assert checker.snapshot(monitor) is None
    display.focus = 1
    assert checker.snapshot(monitor) is None


def test_xres_12_required(app):
    display, checker, monitor = app
    display.version = (1, 1)
    assert checker.snapshot(monitor) is None


def test_xres_absent_pid_not_replaced_with_wm_pid(app):
    display, checker, monitor = app
    display.res_query_client_ids = lambda specs: NS(ids=[])
    assert checker.snapshot(monitor) is None


def test_monitor_scope_clip_and_outside(app):
    display, checker, monitor = app
    display.target.geometry = [-10, -20, 100, 100]
    assert checker.snapshot(monitor)["rect"] == [0, 0, 90, 80]
    display.target.geometry = [900, 20, 100, 100]
    assert checker.snapshot(monitor) is None


def test_topology_change_invalidates(app):
    display, checker, monitor = app
    before = checker.snapshot(monitor)
    display.monitors[0].crtcs = [99]
    with pytest.raises(scope.ScopeFailure, match="application_scope_changed"):
        checker.assert_snapshot(before, monitor)


def test_focus_move_geometry_and_process_change_invalidates(app, monkeypatch):
    display, checker, monitor = app
    before = checker.snapshot(monitor)
    display.focus = display.target
    with pytest.raises(scope.ScopeFailure):
        checker.assert_snapshot(before, monitor)
    display.focus = display.leaf
    display.target.geometry[2] += 1
    with pytest.raises(scope.ScopeFailure):
        checker.assert_snapshot(before, monitor)
    display.target.geometry[2] -= 1
    monkeypatch.setattr(scope, "_process_identity", lambda *args: {"pid": 1234, "start_ticks": 102})
    with pytest.raises(scope.ScopeFailure):
        checker.assert_snapshot(before, monitor)


def test_pointer_overlay_or_wrong_position_rejected(app):
    display, checker, monitor = app
    before = checker.snapshot(monitor)
    display.root.child = 0
    with pytest.raises(scope.ScopeFailure, match="pointer_scope_changed"):
        checker.assert_snapshot(before, monitor, (50, 60))
    display.root.child = display.target
    with pytest.raises(scope.ScopeFailure, match="pointer_scope_changed"):
        checker.assert_snapshot(before, monitor, (51, 60))


def test_pointer_foreign_leaf_rejected(app):
    display, checker, monitor = app
    overlay = Window(display, 30, display.target)
    display.windows[30] = overlay
    display.owners[30] = 9999
    display.target.child = overlay
    before = checker.snapshot(monitor)
    with pytest.raises(scope.ScopeFailure, match="pointer_scope_changed"):
        checker.assert_snapshot(before, monitor, (50, 60))


def test_bounded_ancestor_cycle(app):
    display, checker, monitor = app
    display.target.parent = display.leaf
    assert checker.snapshot(monitor) is None


def test_bounded_property(app):
    display, checker, monitor = app
    display.target.props["WM_NAME"] = NS(format=8, value=b"anything", bytes_after=1)
    assert checker.snapshot(monitor) is None


@pytest.mark.parametrize("title,kind", [(b"Save As", "safe_application"),
                                      ("Save As…".encode(), "safe_application"),
                                      ("Save As… authentication".encode(), None),
                                      (b"Information", "safe_application"),
                                      (b"Confirmation", "safe_application")])
def test_same_process_dialog_classification(app, title, kind):
    display, checker, monitor = app
    main = Window(display, 30, display.root)
    main.props = {"WM_STATE": [1, 0], "WM_CLASS": b"xed\0Xed\0"}
    display.windows[30], display.owners[30] = main, 1234
    display.target.props.update({"WM_TRANSIENT_FOR": [30], "WM_NAME": title,
                                 "_NET_WM_WINDOW_TYPE": ["_NET_WM_WINDOW_TYPE_DIALOG"]})
    # Production atoms are ints, so model dialog/state constants numerically.
    original_atom = checker._atom
    checker._atom = lambda name: (
        700 if name == "_NET_WM_WINDOW_TYPE_DIALOG" else original_atom(name))
    display.target.props["_NET_WM_WINDOW_TYPE"] = [700]
    result = checker.snapshot(monitor)
    if kind is None:
        assert result is None
        return
    assert result is not None and result["modal"] and result["modal_kind"] == kind
    if kind == "unrecognized":
        with pytest.raises(scope.ScopeFailure):
            checker.assert_snapshot(result, monitor)
    else:
        assert checker.assert_snapshot(result, monitor) == result
    display.owners[30] = 7777
    assert checker.snapshot(monitor)["transient_processes"][0]["pid"] == 7777
    with pytest.raises(scope.ScopeFailure):
        checker.assert_snapshot(result, monitor)


def test_focused_override_redirect_allowed_and_unmapped_rejected(app):
    display, checker, monitor = app
    display.target.override = True
    assert checker.snapshot(monitor) is not None
    display.target.override = False
    display.target.viewable = 0
    assert checker.snapshot(monitor) is None


def test_actual_python_process_records_unverified_interpreter_evidence():
    import os

    result = scope._process_identity(os.getpid())
    assert result["pid"] == os.getpid()
    assert result["script_identity"]["verified"] is False


def test_lazy_xlib_import():
    import subprocess
    import sys

    result = subprocess.run([sys.executable, "-c",
                             "import sys; import src.computer.runtime.x11_app_scope; "
                             "assert 'Xlib' not in sys.modules"],
                            capture_output=True, timeout=10)
    assert result.returncode == 0


@pytest.fixture
def fake_proc(tmp_path, monkeypatch):
    import os
    from pathlib import Path

    proc = tmp_path / "1234"
    proc.mkdir()
    (proc / "stat").write_text("1234 (odd ) process) S " + "0 " * 18 + "3456 0 0\n")
    uid = os.geteuid()
    (proc / "status").write_text(f"Name:\txed\nUid:\t{uid}\t{uid}\t{uid}\t{uid}\n")
    (proc / "exe").symlink_to("/usr/bin/true")
    (proc / "cmdline").write_bytes(b"/usr/bin/xed\0")
    monkeypatch.setattr(scope, "Path", lambda value: tmp_path if value == "/proc" else Path(value))
    return proc


def test_proc_start_exe_uid_stable_identity(fake_proc):
    result = scope._process_identity(1234)
    assert result["pid"] == 1234 and result["start_ticks"] == 3456
    assert result["exe"] == "/usr/bin/true"


def test_proc_uid_mismatch_denied(fake_proc):
    (fake_proc / "status").write_text("Uid:\t4242\t4243\t4242\t4242\n")
    with pytest.raises(scope.ScopeFailure):
        scope._process_identity(1234)


def test_proc_arbitrary_executable_accepted(fake_proc):
    (fake_proc / "exe").unlink()
    (fake_proc / "exe").symlink_to("/usr/bin/true")
    assert scope._process_identity(1234)["exe"] == "/usr/bin/true"


@pytest.mark.parametrize("cmdline", [
    b"/usr/bin/python3\0/usr/bin/drawing\0",
    b"/usr/bin/python3\0-c\0/usr/bin/drawing\0",
    b"/usr/bin/python3\0/tmp/drawing\0",
    b"/usr/bin/python3\0/usr/bin/drawing\0--extra\0",
    b"/usr/bin/python3\0/usr/bin/drawing-evil\0",
])
def test_drawing_cmdline_never_proves_script_identity(fake_proc, cmdline):
    (fake_proc / "exe").unlink()
    (fake_proc / "exe").symlink_to("/usr/bin/python3")
    (fake_proc / "cmdline").write_bytes(cmdline)
    result = scope._process_identity(1234)
    assert result["script_identity"]["verified"] is False
    assert len(result["script_identity"]["argv_digest"]) == 64


def test_installed_identity_records_writable_ancestor(tmp_path):
    from pathlib import Path

    binary = tmp_path / "application"
    binary.write_bytes(b"not an approved install")
    binary.chmod(0o777)
    assert scope._trusted_file(Path(binary)) is False


def test_both_title_channels_reject_security(app):
    display, checker, monitor = app
    display.target.props["_NET_WM_NAME"] = b"Harmless"
    display.target.props["WM_NAME"] = b"Authentication"
    assert checker.snapshot(monitor) is None


def test_absent_atom_is_requeried_when_dialog_creates_it(app):
    display, checker, _ = app
    calls = iter([0, 771])
    display.intern_atom = lambda *args, **kwargs: next(calls)
    assert checker._atom("new_dialog_atom") == 0
    assert checker._atom("new_dialog_atom") == 771
    assert checker._atom("new_dialog_atom") == 771


def test_child_metadata_changes_fingerprint(app):
    display, checker, monitor = app
    old = checker.snapshot(monitor)
    display.leaf.props["WM_CLASS"] = b"changed-child-class"
    with pytest.raises(scope.ScopeFailure):
        checker.assert_snapshot(old, monitor)


def test_reparenting_wm_frame_does_not_need_app_pid(app):
    display, checker, monitor = app
    frame = Window(display, 45, display.root)
    display.windows[45] = frame
    display.target.parent = frame
    result = checker.snapshot(monitor)
    assert result["window"] == 20 and result["ancestor_path"] == [21, 20, 45]
    assert 45 not in display.pid_queries


def test_interpreted_application_cannot_self_attest_via_writable_argv():
    import os

    result = scope._process_identity(os.getpid())
    assert result["script_identity"]["verified"] is False
