"""Pure fake RandR tests. Never connect to an X display."""

import copy
import importlib.util
from pathlib import Path
from types import SimpleNamespace as NS  # noqa: N814 - concise fake constructor

import pytest

SPEC = importlib.util.spec_from_file_location(
    "main_scratch_randr", Path(__file__).resolve().parents[1]
    / "scripts/computer-feasibility/main_scratch_randr.py")
rr = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rr)


def baseline():
    mode = dict.fromkeys(rr.MODE_FIELDS, 0)
    mode.update(id=17, width=800, height=600, name="duplicate", name_length=9)
    c = dict(id=5, x=0, y=0, width=800, height=600, mode=17, rotation=1,
             possible_rotations=63, outputs=[9], possible_outputs=[9],
             panning=dict.fromkeys(rr.PAN_FIELDS, 0), has_transforms=True)
    for kind in ("current", "pending"):
        c[kind + "_transform"] = rr.IDENTITY[:]
        c[kind + "_filter_name"] = ""
        c[kind + "_filter_params"] = []
    return dict(schema=1, root=1,
                screen=dict(width_in_pixels=800, height_in_pixels=600,
                            width_in_millimeters=200, height_in_millimeters=150),
                range=dict(min_width=1, min_height=1, max_width=4096, max_height=4096),
                primary=9, modes=[mode, dict(mode, id=18, dot_clock=999)],
                outputs=[dict(id=9, name="TEST", crtc=5, connection=0, crtcs=[5],
                              modes=[17, 18], clones=[], mm_width=200, mm_height=150,
                              subpixel_order=0, num_preferred=1)], crtcs=[c], monitors=[])


class Fake:
    def __init__(self, state):
        self.state = copy.deepcopy(state)
        self.writes = []
        self.handler = None
        self.display = NS(error_handler=None)
        self.id = 1
        self.grabbed = False

    def grab_server(self):
        self.grabbed = True

    def ungrab_server(self):
        self.grabbed = False

    def query_keymap(self):
        return [0] * 32

    def query_pointer(self):
        return NS(mask=0)

    def screen(self):
        return NS(root=self)

    def set_error_handler(self, handler):
        old, self.handler = self.handler, handler
        self.display.error_handler = handler
        return old

    def sync(self):
        pass

    def xrandr_get_screen_resources_current(self):
        return NS(config_timestamp=42)

    def xrandr_set_crtc_config(self, cid, stamp, x, y, mode, rotation, outputs, timestamp):
        assert self.grabbed
        self.writes.append(("crtc", cid, mode))
        c = self.state["crtcs"][0]
        m = next((m for m in self.state["modes"] if m["id"] == mode), None)
        c.update(x=x, y=y, mode=mode, rotation=rotation, outputs=outputs,
                 width=m["width"] if m else 0, height=m["height"] if m else 0)
        self.state["outputs"][0]["crtc"] = cid if mode else 0
        return NS(status=0)

    def xrandr_set_screen_size(self, w, h, mmw, mmh):
        assert self.grabbed
        self.writes.append(("screen", w, h, mmw, mmh))
        self.state["screen"] = dict(width_in_pixels=w, height_in_pixels=h,
                                    width_in_millimeters=mmw, height_in_millimeters=mmh)

    def xrandr_set_output_primary(self, oid):
        assert self.grabbed
        self.writes.append(("primary", oid))
        self.state["primary"] = oid


@pytest.fixture
def fake_capture(monkeypatch):
    monkeypatch.setattr(rr, "capture", lambda d: copy.deepcopy(d.state))


def test_valid_json_roundtrip():
    import json
    rr.validate(json.loads(json.dumps(baseline())))


@pytest.mark.parametrize("field,value", [("current_transform", [0] * 9),
    ("pending_transform", [0] * 9), ("pending_filter_name", "bilinear"),
    ("current_filter_params", [1])])
def test_unsupported_transforms(field, value):
    s = baseline()
    s["crtcs"][0][field] = value
    with pytest.raises(rr.UnsupportedTopology):
        rr.validate(s)


def test_panning_and_manual_monitor_rejected():
    for key in ("panning", "monitor"):
        s = baseline()
        if key == "panning":
            s["crtcs"][0]["panning"]["width"] = 800
        else:
            s["monitors"] = [{"automatic": False}]
        with pytest.raises(rr.UnsupportedTopology):
            rr.validate(s)


def test_noop_has_no_writes(fake_capture):
    s = baseline()
    d = Fake(s)
    assert rr.restore(d, s) is False
    assert not d.writes


def test_current_inventory_is_validated_under_grab_and_ungrabs_on_failure(monkeypatch):
    s, d = baseline(), Fake(baseline())

    def capture(value):
        assert value.grabbed
        result = copy.deepcopy(value.state)
        result['outputs'][0]['name'] = 'replaced'
        return result

    monkeypatch.setattr(rr, 'capture', capture)
    with pytest.raises(rr.UnsupportedTopology, match='inventory'):
        rr.restore(d, s)
    assert not d.grabbed and not d.writes


def test_held_input_fences_topology_without_releasing_it(fake_capture):
    s, d = baseline(), Fake(baseline())
    d.state['primary'] = 0
    d.query_keymap = lambda: [1] * 32
    with pytest.raises(rr.UnsupportedTopology, match='Input currently held'):
        rr.restore(d, s)
    assert not d.grabbed and not d.writes


def test_restore_exact_mode_id_not_ambiguous_name(fake_capture):
    s = baseline()
    d = Fake(s)
    d.state["crtcs"][0]["mode"] = 18
    assert rr.restore(d, s) is True
    assert d.writes == [("crtc", 5, 0), ("crtc", 5, 17)]
    assert d.state == s


def test_primary_only_does_not_modeset(fake_capture):
    s = baseline()
    d = Fake(s)
    d.state["primary"] = 0
    assert rr.restore(d, s)
    assert d.writes == [("primary", 9)]


def test_physical_dimensions_restored(fake_capture):
    s = baseline()
    d = Fake(s)
    d.state["screen"]["width_in_millimeters"] = 300
    assert rr.restore(d, s)
    assert d.writes == [("screen", 800, 600, 200, 150)]


@pytest.mark.parametrize("change", ["transform", "hotplug", "mode-replaced", "filter"])
def test_unsafe_current_state_refuses_before_writes(fake_capture, change):
    s = baseline()
    d = Fake(s)
    if change == "transform":
        d.state["crtcs"][0]["current_transform"][0] *= 2
    elif change == "hotplug":
        d.state["outputs"][0]["name"] = "OTHER"
    elif change == "mode-replaced":
        d.state["modes"][0]["dot_clock"] = 99
    else:
        for kind in ("current", "pending"):
            d.state["crtcs"][0][kind + "_filter_name"] = "nearest"
    with pytest.raises(rr.UnsupportedTopology):
        rr.restore(d, s)
    assert not d.writes


def test_monitor_geometry(fake_capture):
    assert rr.monitor_geometry(Fake(baseline()), "TEST") == dict(x=0, y=0, width=800, height=600)
    with pytest.raises(rr.UnsupportedTopology):
        rr.monitor_geometry(Fake(baseline()), "MISSING")


def test_capture_requires_two_equal_readonly_snapshots(monkeypatch):
    a, b = baseline(), baseline()
    b["primary"] = 0
    reads = iter([a, b])
    monkeypatch.setattr(rr, "_once", lambda d: next(reads))
    with pytest.raises(rr.UnsupportedTopology, match="changed"):
        rr.capture(object())


def test_isolated_xvfb_capture(tmp_path):
    """Allocate a NEW X server with -displayfd, never use inherited DISPLAY."""
    import os
    import select
    import shutil
    import subprocess

    from Xlib.display import Display

    if not shutil.which("Xvfb"):
        pytest.skip("Xvfb not installed")
    read_fd, write_fd = os.pipe()
    proc = subprocess.Popen(["Xvfb", "-displayfd", str(write_fd), "-screen", "0",
                             "800x600x24", "-nolisten", "tcp", "-ac"],
                            pass_fds=(write_fd,), stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            env={"PATH": os.environ.get("PATH", "/usr/bin:/bin")})
    os.close(write_fd)
    d = None
    try:
        assert select.select([read_fd], [], [], 5)[0], "isolated Xvfb startup timeout"
        number = os.read(read_fd, 128).decode().strip()
        assert number.isdecimal() and int(number) != 0
        d = Display(":" + number)
        snapshot = rr.capture(d)
        rr.validate(snapshot)
        assert snapshot["screen"]["width_in_pixels"] == 800
        assert snapshot["screen"]["height_in_pixels"] == 600
        assert rr.restore(d, snapshot) is False
    finally:
        if d is not None:
            d.close()
        os.close(read_fd)
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
