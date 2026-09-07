"""Metadata-only fakes. No Display connection or desktop access."""
import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace as NS  # noqa: N814 - concise fake constructor

import pytest

spec = importlib.util.spec_from_file_location(
    "scratch_windows",
    Path(__file__).resolve().parents[1] / "scripts/computer-feasibility/main_scratch_windows.py",
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def baseline():
    atoms = {name: i + 100 for i, name in enumerate(sorted(m.MUTABLE | m.COMPUTED))}
    def record(wid):
        return {"identity": {"xid": wid, "pid": 4, "uid": 1000, "start_ticks": 50},
                          "geometry": (20, 30, 500, 400), "border": 0, "extents": (2, 2, 20, 2),
                          "workspace": (0,), "states": (), "map_state": m.X.IsViewable}
    return {"clients": (10, 20), "stacking": (20, 10), "windows": {w: record(w) for w in (10, 20)},
            "atoms": atoms, "required": {n: i for i, n in enumerate(m.REQUIRED)},
            "supported": tuple(range(5)) + tuple(atoms.values()), "workspace": (0,),
            "active": (10,), "focus": 11, "focus_revert": 1,
            "focus_identity": {"xid": 11, "pid": 4, "uid": 1000, "start_ticks": 50},
            "pointer": [50, 70, 2], "keymap": [0] * 32}


def test_process_identity_kernel_metadata_only():
    value = m.process_identity(os.getpid())
    assert value == {"pid": os.getpid(), "uid": os.getuid(), "start_ticks": value["start_ticks"]}
    assert value["start_ticks"] > 0


def test_identity_requires_xres_not_client_pid(monkeypatch):
    d = NS(res_query_client_ids=lambda specs: NS(
        ids=[NS(spec=NS(mask=m.res.LocalClientPIDMask), value=[123])]))
    monkeypatch.setattr(m, "process_identity", lambda pid: {"pid": pid, "uid": 9, "start_ticks": 8})
    assert m.identity(d, 4) == {"xid": 4, "pid": 123, "uid": 9, "start_ticks": 8}
    d.res_query_client_ids = lambda specs: NS(ids=[])
    with pytest.raises(m.PreflightError):
        m.identity(d, 4)


@pytest.mark.parametrize(
    "change", ["key", "button", "hidden", "unknown", "border", "extents", "capability", "stacking"]
)
def test_preflight_rejections(change):
    b = baseline()
    if change == "key":
        b["keymap"][3] = 4
    if change == "button":
        b["pointer"][2] = 0x100
    if change == "hidden":
        b["windows"][10]["map_state"] = m.X.IsUnmapped
    if change == "unknown":
        b["windows"][10]["states"] = (999,)
    if change == "border":
        b["windows"][10]["border"] = 1
    if change == "extents":
        b["windows"][10]["extents"] = ()
    if change == "capability":
        b["supported"] = ()
    if change == "stacking":
        b["stacking"] = ()
    with pytest.raises(m.PreflightError):
        m.validate(b)


def test_normal_max_fullscreen_and_lock_modifier_allowed():
    b = baseline()
    b["windows"][10]["states"] = tuple(b["atoms"][n] for n in (
        "_NET_WM_STATE_MAXIMIZED_VERT", "_NET_WM_STATE_MAXIMIZED_HORZ", "_NET_WM_STATE_FULLSCREEN"
    ))
    m.validate(b)


def test_bounded_property_rejects_truncation():
    calls = []
    def get(*args):
        calls.append(args)
        return NS(bytes_after=4, format=32, property_type=m.Xatom.CARDINAL, value=[1])
    with pytest.raises(m.PreflightError):
        m._prop(NS(intern_atom=lambda n: 1), NS(get_property=get), "_NET_WM_DESKTOP", limit=1)
    assert calls == [(1, m.Xatom.CARDINAL, 0, 1)]


def test_unchanged_and_reused_windows_never_touched(monkeypatch):
    b = baseline()
    monkeypatch.setattr(
        m, "identity", lambda d, wid: b["windows"][wid]["identity"] if wid == 10 else {}
    )
    monkeypatch.setattr(m, "_record", lambda d, wid, atoms: b["windows"][wid])
    monkeypatch.setattr(m, "_send", lambda *args: pytest.fail("unexpected mutation"))
    result = m.restore_windows(None, b)
    assert result == {"restored": [], "unchanged": [10], "skipped": [20], "errors": []}


def test_failure_on_first_window_does_not_abort_second(monkeypatch):
    b = baseline()
    def ident(d, wid):
        if wid == 10:
            raise RuntimeError("disappeared")
        return b["windows"][wid]["identity"]
    monkeypatch.setattr(m, "identity", ident)
    monkeypatch.setattr(m, "_record", lambda d, wid, atoms: b["windows"][wid])
    result = m.restore_windows(None, b)
    assert result["unchanged"] == [20]
    assert result["errors"][0]["xid"] == 10


def test_geometry_static_gravity_and_negative_root_coordinates(monkeypatch):
    b = baseline()
    b["windows"][10]["geometry"] = (-500, 30, 500, 400)
    current = {w: dict(v) for w, v in b["windows"].items()}
    current[10]["geometry"] = (0, 0, 100, 100)
    calls = []
    monkeypatch.setattr(m, "identity", lambda d, wid: b["windows"][wid]["identity"])
    monkeypatch.setattr(m, "_record", lambda d, wid, atoms: current[wid])
    monkeypatch.setattr(m, "_owned", lambda d, ident, action: action())
    def send(d, wid, name, values):
        calls.append((wid, name, values))
        if name == "_NET_MOVERESIZE_WINDOW":
            current[wid]["geometry"] = tuple(values[1:])
    monkeypatch.setattr(m, "_send", send)
    result = m.restore_windows(None, b)
    assert result["restored"] == [10]
    assert calls == [
        (10, "_NET_MOVERESIZE_WINDOW", [10 | (0xF << 8) | (2 << 12), -500, 30, 500, 400])
    ]


def test_exact_child_focus_and_pointer_independently(monkeypatch):
    b, calls = baseline(), []
    root = NS(id=1, query_pointer=lambda: NS(mask=0, root_x=50, root_y=70),
              warp_pointer=lambda x, y: calls.append(("pointer", x, y)))
    d = NS(screen=lambda: NS(root=root), query_keymap=lambda: [0] * 32,
           sync=lambda: None, get_input_focus=lambda: NS(focus=NS(id=11)))
    monkeypatch.setattr(m, "_prop", lambda d, root, name, *args, **kw:
                       (0,) if name == "_NET_CURRENT_DESKTOP" else (10,))
    monkeypatch.setattr(m, "_owned", lambda d, ident, action: action())
    monkeypatch.setattr(m, "_window", lambda d, wid: NS(
        set_input_focus=lambda revert, timestamp: calls.append(("focus", wid))))
    result = m.restore_focus_pointer(d, b)
    assert not result["errors"]
    assert calls == [("focus", 11), ("pointer", 50, 70)]


def test_held_input_refuses_focus_and_pointer_no_release():
    b = baseline()
    d = NS(screen=lambda: NS(root=NS()), query_keymap=lambda: [1] * 32)
    result = m.restore_focus_pointer(d, b)
    assert result["errors"][0]["stage"] == "input"
    assert not result["restored"]


def test_maximize_restore_does_not_overwrite_wm_normal_bounds(monkeypatch):
    b, calls = baseline(), []
    state = b["atoms"]["_NET_WM_STATE_MAXIMIZED_VERT"]
    b["windows"][10]["states"] = (state,)
    current = {w: dict(v) for w, v in b["windows"].items()}
    current[10]["states"] = ()
    current[10]["geometry"] = (1, 2, 3, 4)
    monkeypatch.setattr(m, "identity", lambda d, wid: b["windows"][wid]["identity"])
    monkeypatch.setattr(m, "_record", lambda d, wid, atoms: current[wid])
    monkeypatch.setattr(m, "_owned", lambda d, ident, action: action())
    def send(d, wid, name, values):
        calls.append((name, values))
        assert name == "_NET_WM_STATE"
        current[wid]["states"] = (state,)
        current[wid]["geometry"] = b["windows"][wid]["geometry"]
    monkeypatch.setattr(m, "_send", send)
    assert m.restore_windows(None, b)["restored"] == [10]
    assert calls == [("_NET_WM_STATE", [1, state, 0, 2, 0])]


def test_identity_check_under_server_grab_ungrabs_on_failure(monkeypatch):
    calls = []
    d = NS(grab_server=lambda: calls.append("grab"), ungrab_server=lambda: calls.append("ungrab"),
           sync=lambda: calls.append("sync"))
    monkeypatch.setattr(m, "identity", lambda d, wid: {})
    with pytest.raises(RuntimeError, match="identity changed"):
        m._owned(d, {"xid": 4}, lambda: calls.append("effect"))
    assert calls == ["grab", "ungrab", "sync"]


def test_reused_child_does_not_prevent_pointer_restore(monkeypatch):
    b, calls = baseline(), []
    root = NS(id=1, query_pointer=lambda: NS(mask=0, root_x=50, root_y=70),
              warp_pointer=lambda x, y: calls.append((x, y)))
    d = NS(screen=lambda: NS(root=root), query_keymap=lambda: [0] * 32, sync=lambda: None)
    monkeypatch.setattr(m, "_prop", lambda d, root, name, *args, **kw:
                       (0,) if name == "_NET_CURRENT_DESKTOP" else (10,))
    def refuse(*args):
        raise RuntimeError("identity changed")
    monkeypatch.setattr(m, "_owned", refuse)
    result = m.restore_focus_pointer(d, b)
    assert result["errors"] == [{"stage": "focus", "detail": "identity changed"}]
    assert "pointer" in result["restored"]
    assert calls == [(50, 70)]
