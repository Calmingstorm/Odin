"""All native/X/app operations are fakes. These tests never open a display."""

import builtins
import importlib
import struct
import subprocess
import threading
import zlib
from types import SimpleNamespace

import pytest

from src.computer.runtime import primitives as native
from src.computer.runtime.accessibility import Accessibility, PrimitiveError


@pytest.fixture(autouse=True)
def prohibit_native_calls(monkeypatch):
    def prohibited(*args, **kwargs):
        pytest.fail("Test attempted a real process launch or native display operation")

    original = builtins.__import__

    def safe_import(name, *args, **kwargs):
        if name == "gi" or name.startswith("gi."):
            raise ImportError("GI intentionally unavailable in native primitive tests")
        return original(name, *args, **kwargs)

    monkeypatch.setattr(subprocess, "Popen", prohibited)
    monkeypatch.setattr(native.ctypes, "CDLL", prohibited)
    monkeypatch.setattr(builtins, "__import__", safe_import)


def chunk(kind, payload):
    return (struct.pack(">I", len(payload)) + kind + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF))


def png(*, width=120, height=100, color=2, depth=8, interlace=0, ancillary=False):
    head = struct.pack(">IIBBBBB", width, height, depth, color, 0, 0, interlace)
    raw = bytes((width * (4 if color == 6 else 3) + 1) * height)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head)
            + (chunk(b"tEXt", b"comment\x00untrusted image metadata") if ancillary else b"")
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


WINDOW = {"id": 17, "title": "Test document", "x": 10, "y": 10, "width": 90,
          "height": 80, "pid": 1001, "modal": False}


class Commands:
    def __init__(self):
        self.calls = []
        self.window = dict(WINDOW)
        self.focus = 17
        self.pointer = (20, 20)
        self.pointer_window = 17
        self.hook = None

    def __call__(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        if self.hook:
            self.hook(argv)
        command = argv[1]
        if command == "getactivewindow":
            return str(self.window["id"])
        if command == "getwindowfocus":
            return str(self.focus)
        if command == "getwindowpid":
            return str(self.window["pid"])
        if command == "getwindowname":
            return self.window["title"]
        if command == "mousemove":
            self.pointer = (int(argv[2]), int(argv[3]))
        if command == "getmouselocation":
            return (f"X={self.pointer[0]}\nY={self.pointer[1]}\nSCREEN=0\n"
                    f"WINDOW={self.pointer_window}")
        if command == "getwindowgeometry":
            values = {"WINDOW": self.window["id"], "SCREEN": 0,
                      **{key.upper(): self.window[key] for key in ("x", "y", "width", "height")}}
            return "\n".join(f"{key}={value}" for key, value in values.items())
        return ""


class Desktop(native.NativeDesktop):
    def __init__(self, **kwargs):
        self.commands = Commands()
        self.owned = True
        self.identity = (700, 991)
        self.typed_releases = 0
        super().__init__(command_runner=self.commands, capture_backend=png, **kwargs)

    def _owned(self, pid):
        return self.owned and pid == WINDOW["pid"]

    def _identity(self, pid):
        return self.identity

    def _modal(self, window_id):
        return self.commands.window["modal"]

    def _release_typed_keys(self):
        self.typed_releases += 1


def ready(**kwargs):
    desktop = Desktop(**kwargs)
    observation = desktop.snapshot()
    desktop.commands.calls.clear()
    return desktop, observation


def act(desktop, observation, kind, event=None, **kwargs):
    return desktop.execute({"type": kind, "expected_window": observation["window"],
                            "observation_id": observation["observation_id"], **kwargs},
                           event if event is not None else threading.Event())


def inputs(desktop):
    return [argv[1:] for argv, _ in desktop.commands.calls if not argv[1].startswith("get")]


def test_import_is_lazy_and_construction_has_no_native_effect():
    importlib.reload(native)
    native.NativeDesktop()
    assert native.PROFILES.keys() == {"drawing", "xed"}


@pytest.mark.parametrize("kwargs", [{"display": ":0"}, {"workspace": "/tmp"}])
def test_private_display_and_workspace_are_fixed(kwargs):
    with pytest.raises(ValueError):
        native.NativeDesktop(**kwargs)


@pytest.mark.parametrize("color", [2, 6])
def test_png_capture_is_canonical_and_ancillary_chunks_removed(color):
    image, width, height = native.sanitize_png(png(color=color, ancillary=True))
    assert (width, height) == (120, 100)
    assert b"tEXt" not in image
    assert image == png(color=color)


@pytest.mark.parametrize("image", [b"", png()[:-1], png() + b"extra",
                                      png(color=3), png(depth=16), png(interlace=1),
                                      png()[:25] + b"bad", png(width=0)])
def test_png_invalid_encodings_rejected(image):
    with pytest.raises(PrimitiveError):
        native.sanitize_png(image)


def test_png_rejects_invalid_deflate_and_decompression_bomb():
    prefix = png()[:33]
    for compressed in (b"invalid", zlib.compress(b"\x00" * 100000)):
        image = prefix + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
        with pytest.raises(PrimitiveError):
            native.sanitize_png(image)


def test_snapshot_native_image_window_and_explicit_unsupported_accessibility():
    desktop, snapshot = ready()
    assert snapshot["window"] == WINDOW
    assert snapshot["image_bytes"] == png()
    assert snapshot["accessibility_status"] == "unsupported"
    assert snapshot["accessibility"] == []
    assert not snapshot["modal"]
    assert snapshot["observation_id"] != desktop.snapshot()["observation_id"]


@pytest.mark.parametrize("problem", ["no_owner", "focus", "pid", "id", "geometry"])
def test_snapshot_fails_closed_unknown_focus_pid_and_geometry(problem):
    desktop = Desktop()
    if problem == "no_owner":
        desktop.owned = False
    elif problem == "focus":
        desktop.commands.focus = 0
    elif problem == "pid":
        desktop.commands.window["pid"] = 0
    elif problem == "id":
        desktop.commands.window["id"] = 0
    else:
        desktop.commands.window["width"] = -1
    with pytest.raises(PrimitiveError):
        desktop.snapshot()


@pytest.mark.parametrize("field,value", [("title", "Different document"), ("x", 11),
                                        ("modal", True), ("pid", 2000)])
def test_changed_window_never_receives_input(field, value):
    desktop, observation = ready()
    desktop.commands.window[field] = value
    receipt = act(desktop, observation, "click", x=20, y=20)
    assert not receipt["ok"] and not receipt["injected"]
    assert inputs(desktop) == []


def test_pid_reuse_and_missing_expected_window_fail_closed():
    desktop, observation = ready()
    desktop.identity = (700, 992)
    assert not act(desktop, observation, "move", x=20, y=20)["ok"]
    assert not desktop.execute({"type": "move", "x": 20, "y": 20}, threading.Event())["ok"]
    assert inputs(desktop) == []


@pytest.mark.parametrize("kind,arguments,count", [
    ("move", {"x": 20, "y": 20}, 1),
    ("click", {"x": 20, "y": 20}, 3),
    ("double_click", {"x": 20, "y": 20}, 5),
    ("scroll", {"x": 20, "y": 20, "direction": "down", "count": 2}, 5),
    ("key", {"chord": "ctrl+a"}, 4),
    ("type", {"text": "A bounded note\nsecond line"}, 1),
    ("polyline", {"points": [[20, 20], [21, 21], [22, 23]]}, 5),
])
def test_physical_receipts_argv_and_release(kind, arguments, count):
    desktop, observation = ready()
    receipt = act(desktop, observation, kind, **arguments)
    assert receipt["ok"] and receipt["status"] == "injected"
    assert receipt["injected"] and receipt["released"] and not receipt["effect_uncertain"]
    assert len(inputs(desktop)) == count
    assert desktop._buttons == desktop._keys == set()
    for argv, kwargs in desktop.commands.calls:
        assert argv[0] == "/usr/bin/xdotool"
        assert isinstance(argv, list)
        assert "shell" not in kwargs
        assert 0 < kwargs["timeout"] <= 2.0
        assert kwargs["env"]["DISPLAY"] == ":77" and kwargs["cwd"] == "/workspace"
    if kind == "type":
        first, second = arguments["text"].split("\n")
        assert inputs(desktop)[0] == [
            "type", "--delay", "0", "--args", "1", "--", first,
            "key", "Return",
            "type", "--delay", "0", "--args", "1", "--", second,
        ]
        assert desktop.typed_releases == 1
    if kind == "key":
        assert inputs(desktop)[-2:] == [["keyup", "a"], ["keyup", "ctrl"]]


@pytest.mark.parametrize("kind,arguments", [
    ("move", {"x": float("nan"), "y": 20}),
    ("move", {"x": float("inf"), "y": 20}),
    ("move", {"x": True, "y": 20}),
    ("move", {"x": 9, "y": 20}),
    ("move", {"x": 20.5, "y": 20}),
    ("click", {"x": 20, "y": 20, "button": "extra"}),
    ("click", {"x": 20, "y": 20, "unknown": True}),
    ("right_click", {"x": 20, "y": 20, "button": "left"}),
    ("move", {"x": 20, "y": 20, "chord": "Return"}),
    ("key", {"chord": "Return", "x": 20}),
    ("scroll", {"x": 20, "y": 20, "direction": "down", "count": 21}),
    ("scroll", {"x": 20, "y": 20, "direction": "down", "count": True}),
    ("key", {"chord": "ctrl++F12"}),
    ("type", {"text": "x" * 513}),
    ("type", {"text": "nul\x00text"}),
    ("type", {"text": "\ud800"}),
    ("polyline", {"points": [[20, 20]] * 257}),
    ("polyline", {"points": [[20, 20], [999, 999]]}),
    ("polyline", {"points": [[20, 20], [21, 21]], "duration": float("inf")}),
    ("polyline", {"points": [[20, 20], [21, 21]], "duration": 2.01}),
    ("unsupported", {}),
])
def test_invalid_action_never_injects(kind, arguments):
    desktop, observation = ready()
    receipt = act(desktop, observation, kind, **arguments)
    assert not receipt["ok"] and not receipt["injected"]
    assert inputs(desktop) == []


def test_pre_cancelled_action_does_nothing():
    desktop, observation = ready()
    event = threading.Event()
    event.set()
    receipt = act(desktop, observation, "click", event, x=20, y=20)
    assert receipt["status"] == "cancelled"
    assert desktop.commands.calls == []


@pytest.mark.parametrize("kind,args,trigger,release", [
    ("click", {"x": 20, "y": 20}, "mousedown", "mouseup"),
    ("key", {"chord": "ctrl+a"}, "keydown", "keyup"),
    ("polyline", {"points": [[20, 20], [21, 21]]}, "mousedown", "mouseup"),
])
def test_cancel_during_input_releases_held_state(kind, args, trigger, release):
    desktop, observation = ready()
    event = threading.Event()

    def hook(argv):
        if argv[1] == trigger:
            event.set()

    desktop.commands.hook = hook
    receipt = act(desktop, observation, kind, event, **args)
    assert not receipt["ok"] and receipt["status"] == "cancelled"
    assert receipt["released"] and receipt["effect_uncertain"]
    assert any(argv[0] == release for argv in inputs(desktop))
    assert not desktop._buttons and not desktop._keys


def test_failed_typing_still_cleans_up_and_reports_uncertainty():
    desktop, observation = ready()

    def hook(argv):
        if argv[1] == "type":
            raise PrimitiveError("timeout", "Fake timeout")

    desktop.commands.hook = hook
    receipt = act(desktop, observation, "type", text="A small note")
    assert not receipt["ok"] and receipt["effect_uncertain"]
    assert receipt["released"] and desktop.typed_releases == 1


def test_window_change_between_move_and_press_prevents_press():
    desktop, observation = ready()

    def hook(argv):
        if argv[1] == "mousemove":
            desktop.commands.window["title"] = "New window"

    desktop.commands.hook = hook
    receipt = act(desktop, observation, "click", x=20, y=20)
    assert not receipt["ok"] and receipt["effect_uncertain"]
    assert not any(command[0] == "mousedown" for command in inputs(desktop))


def test_overlapping_window_never_receives_a_button_press():
    desktop, observation = ready()
    desktop.commands.pointer_window = 99
    receipt = act(desktop, observation, "click", x=20, y=20)
    assert not receipt["ok"] and receipt["status"] == "unsupported"
    assert not any(command[0] == "mousedown" for command in inputs(desktop))


def test_cleanup_failure_is_not_claimed_success():
    desktop, observation = ready()

    def hook(argv):
        if argv[1] == "keyup":
            raise PrimitiveError("failed", "Fake release failure")

    desktop.commands.hook = hook
    receipt = act(desktop, observation, "key", chord="Return")
    assert not receipt["ok"] and not receipt["released"] and receipt["effect_uncertain"]
    assert desktop._keys == {"Return"}
    desktop.commands.hook = None
    assert desktop.release_all() == {"ok": True}


def test_time_budget_is_reserved_for_cleanup():
    now = [10.0]
    desktop, observation = ready(clock=lambda: now[0])

    def hook(argv):
        if argv[1] == "mousedown":
            now[0] += 1.8

    desktop.commands.hook = hook
    receipt = act(desktop, observation, "click", x=20, y=20)
    assert receipt["status"] == "timeout" and receipt["released"]
    release = [kwargs for argv, kwargs in desktop.commands.calls if argv[1] == "mouseup"]
    assert release and 0 < release[0]["timeout"] < 0.21


def test_launch_fixed_profiles_only_and_pid_ownership(monkeypatch):
    desktop = native.NativeDesktop()
    calls = []
    child = SimpleNamespace(pid=1001, poll=lambda: None)

    def popen(argv, **kwargs):
        calls.append((argv, kwargs))
        return child

    monkeypatch.setattr(subprocess, "Popen", popen)
    identities = {1001: (700, 12345), 1002: (1001, 12346), 1003: (701, 12347)}
    monkeypatch.setattr(desktop, "_identity", lambda pid: identities.get(pid))
    assert not desktop.launch("unapproved")["ok"]
    assert not desktop.launch({"executable": "unapproved"})["ok"]
    assert desktop.launch("xed")["ok"]
    assert calls[0][0] == ("/usr/bin/xed", "--standalone", "--new-window")
    assert desktop._owned(1001) and desktop._owned(1002)
    assert not desktop._owned(1003)
    identities[1001] = (700, 99999)
    assert not desktop._owned(1001) and not desktop._owned(1002)


def test_subprocess_timeout_kills_only_owned_child(monkeypatch):
    event = threading.Event()

    class Child:
        returncode = None
        killed = False

        def communicate(self, timeout):
            assert 0 < timeout <= 0.05
            event.set()
            raise subprocess.TimeoutExpired("fixed utility", timeout)

        def poll(self):
            return self.returncode

        def kill(self):
            self.killed, self.returncode = True, -9

        def wait(self, timeout):
            return self.returncode

    child = Child()

    def popen(argv, **kwargs):
        assert argv == ["/usr/bin/xdotool", "getactivewindow"]
        assert "shell" not in kwargs
        return child

    monkeypatch.setattr(subprocess, "Popen", popen)
    desktop = native.NativeDesktop()
    desktop._deadline, desktop._cancelled = desktop._clock() + 1.0, event
    with pytest.raises(PrimitiveError, match="cancelled"):
        desktop._run("getactivewindow")
    assert child.killed and not desktop._processes


class Node:
    def __init__(self, name="Target", role="push button", children=()):
        self.name, self.role = name, role
        self.children = list(children)
        self.parent = None
        self.bounds = (10, 10, 90, 80)
        self.states = {1, 2, 3, 4, 6}
        self.calls = []
        self.pid = WINDOW["pid"]
        for child in self.children:
            child.parent = self

    def get_role_name(self):
        return self.role

    def get_name(self):
        return self.name

    def get_process_id(self):
        return self.pid

    def get_state_set(self):
        return SimpleNamespace(get_states=lambda: self.states, contains=self.states.__contains__)

    def get_component_iface(self):
        return SimpleNamespace(get_extents=lambda coord: SimpleNamespace(
            **dict(zip(("x", "y", "width", "height"), self.bounds, strict=True))),
            grab_focus=lambda: self.record("focus"))

    def get_interfaces(self):
        return ["Component", "Action", "Text", "EditableText", "Selection", "Value"]

    def get_text_iface(self):
        return SimpleNamespace(get_text=lambda start, end: "t" * 1000)

    def get_action_iface(self):
        return SimpleNamespace(get_n_actions=lambda: 1, get_action_name=lambda i: "click",
                               do_action=lambda i: self.record("invoke", i))

    def get_editable_text_iface(self):
        return SimpleNamespace(set_text_contents=lambda text: self.record("set_text", text))

    def get_selection_iface(self):
        return SimpleNamespace(select_child=lambda index: self.record("select", index))

    def get_value_iface(self):
        return SimpleNamespace(get_minimum_value=lambda: 0, get_maximum_value=lambda: 10,
                               set_current_value=lambda value: self.record("value", value))

    def get_child_count(self):
        return len(self.children)

    def get_child_at_index(self, index):
        return self.children[index]

    def get_parent(self):
        return self.parent

    def record(self, *args):
        self.calls.append(args)
        return True


def accessibility(children=()):
    root = Node(WINDOW["title"], "frame", children)
    app = Node(children=[root])
    desktop = Node(children=[app])
    a11y = Accessibility()
    a11y.api = SimpleNamespace(
        StateType=SimpleNamespace(ENABLED=1, SENSITIVE=2, SHOWING=3, VISIBLE=4, DEFUNCT=5,
                                  FOCUSABLE=6),
        CoordType=SimpleNamespace(SCREEN=0), get_desktop=lambda i: desktop,
    )
    return a11y, root


def test_accessibility_metadata_bound_depth_and_opaque_handles():
    chain = Node()
    for _ in range(10):
        chain = Node(children=[chain])
    a11y, root = accessibility([Node(name="n" * 500) for _ in range(200)] + [chain])
    nodes, status = a11y.snapshot(WINDOW, "observation", lambda: None)
    assert status == "available" and len(nodes) <= 128
    assert max(node["depth"] for node in nodes) <= 6
    assert all(len(node["name"]) <= 128 and len(node["text"]) <= 512 for node in nodes)
    assert len({node["handle"] for node in nodes}) == len(nodes)
    assert all(str(id(ref.node)) != handle for handle, ref in a11y.references.items())
    a11y, root = accessibility([chain])
    nodes, _ = a11y.snapshot(WINDOW, "deep", lambda: None)
    assert max(node["depth"] for node in nodes) == 6 and len(nodes) == 7


@pytest.mark.parametrize("kind,args", [("invoke", {}), ("focus", {}),
                                      ("set_text", {"text": "A bounded note"}),
                                      ("select", {"index": 0}), ("value", {"value": 5})])
def test_semantic_actions_use_real_node_references(kind, args):
    target = Node(children=[Node()])
    a11y, root = accessibility([target])
    desktop, observation = ready(accessibility_backend=a11y)
    handle = observation["accessibility"][1]["handle"]
    receipt = act(desktop, observation, kind, target=handle, **args)
    assert receipt["ok"] and target.calls[0][0] == kind
    assert inputs(desktop) == []


@pytest.mark.parametrize("change", ["name", "role", "bounds", "states", "pid", "parent"])
def test_changed_accessible_target_is_rejected(change):
    target = Node()
    a11y, root = accessibility([target])
    nodes, _ = a11y.snapshot(WINDOW, "old", lambda: None)
    setattr(target, change, {"name": "New", "role": "entry", "bounds": (1, 1, 2, 2),
                             "states": {1, 2}, "pid": 2000, "parent": None}[change])
    with pytest.raises(PrimitiveError):
        a11y.execute({"type": "invoke", "observation_id": "old", "target": nodes[1]["handle"]},
                     WINDOW, lambda: None)
    assert target.calls == []


def test_observation_scopes_handles_and_new_snapshot_invalidates_old():
    a11y, root = accessibility([Node()])
    nodes, _ = a11y.snapshot(WINDOW, "old", lambda: None)
    a11y.snapshot(WINDOW, "new", lambda: None)
    for observation in ("old", "new"):
        with pytest.raises(PrimitiveError):
            a11y.execute({"type": "focus", "target": nodes[1]["handle"],
                          "observation_id": observation}, WINDOW, lambda: None)


def test_selection_revalidates_observed_child_reference():
    target = Node(children=[Node()])
    a11y, root = accessibility([target])
    nodes, _ = a11y.snapshot(WINDOW, "obs", lambda: None)
    target.children[0] = Node(name="Replaced")
    with pytest.raises(PrimitiveError, match="changed"):
        a11y.execute({"type": "select", "index": 0, "observation_id": "obs",
                      "target": nodes[1]["handle"]}, WINDOW, lambda: None)
    assert target.calls == []


def test_unsupported_semantics_and_password_fields_are_explicit():
    target = Node(role="password text")
    a11y, root = accessibility([target])
    nodes, _ = a11y.snapshot(WINDOW, "obs", lambda: None)
    assert nodes[1]["text"] == "" and "set_text" not in nodes[1]["capabilities"]
    with pytest.raises(PrimitiveError) as caught:
        a11y.execute({"type": "set_text", "text": "Test text", "observation_id": "obs",
                      "target": nodes[1]["handle"]}, WINDOW, lambda: None)
    assert caught.value.status == "unsupported"
