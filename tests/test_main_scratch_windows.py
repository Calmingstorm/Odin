"""Metadata-only fakes. No Display connection or desktop access."""
import copy
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
    atoms = {name: i + 100 for i, name in enumerate(sorted(
        m.MUTABLE | m.COMPUTED | m.IMMUTABLE | m.SURFACE_TYPES))}
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


@pytest.mark.parametrize('change', ['position', 'size', 'state', 'identity', 'race'])
def test_exclusive_hidden_position_repair_never_maps_or_resizes(monkeypatch, change):
    b, calls = baseline(), []
    b['windows'][10]['states'] = (b['atoms']['_NET_WM_STATE_HIDDEN'],)
    current = copy.deepcopy(b['windows'])
    current[10]['geometry'] = (21, 30, 500, 400)
    if change == 'size':
        current[10]['geometry'] = (21, 30, 501, 400)
    if change == 'state':
        current[10]['states'] += (b['atoms']['_NET_WM_STATE_ABOVE'],)
    if change == 'identity':
        current[10]['identity']['start_ticks'] += 1
    monkeypatch.setattr(m, 'identity', lambda d, wid: current[wid]['identity'])
    monkeypatch.setattr(m, '_record', lambda d, wid, atoms: copy.deepcopy(current[wid]))

    def owned(d, ident, action):
        if change == 'race':
            current[10]['geometry'] = (22, 30, 500, 400)
        action()

    monkeypatch.setattr(m, '_owned', owned)

    def send(d, wid, name, values):
        calls.append((wid, name, values))
        assert name == '_NET_MOVERESIZE_WINDOW'
        assert values == [10 | (0x3 << 8) | (2 << 12), 20, 30, 0, 0]
        current[wid]['geometry'] = (*values[1:3], *current[wid]['geometry'][2:])

    monkeypatch.setattr(m, '_send', send)
    result = m.restore_windows(None, b, restore_hidden_position=True)
    if change == 'position':
        assert result['restored'] == [10] and len(calls) == 1
        assert current == b['windows']
    else:
        assert not calls and not result['restored']
        assert result['errors'] or result['skipped']


def test_exact_child_focus_and_pointer_independently(monkeypatch):
    b, calls = baseline(), []
    root = NS(id=1, query_pointer=lambda: NS(mask=0, root_x=50, root_y=70),
              warp_pointer=lambda x, y: calls.append(("pointer", x, y)))
    focus_state = NS(focus=NS(id=99), revert_to=1)
    d = NS(screen=lambda: NS(root=root), query_keymap=lambda: [0] * 32,
           sync=lambda: None, get_input_focus=lambda: focus_state)
    monkeypatch.setattr(m, "_prop", lambda d, root, name, *args, **kw:
                       (0,) if name == "_NET_CURRENT_DESKTOP" else (10,))
    monkeypatch.setattr(m, "_owned", lambda d, ident, action: action())
    monkeypatch.setattr(m, "identity", lambda d, wid: b["focus_identity"])
    def set_focus(revert, timestamp):
        calls.append(("focus", 11))
        focus_state.focus.id = 11
    monkeypatch.setattr(m, "_window", lambda d, wid: NS(
        set_input_focus=set_focus))
    result = m.restore_focus_pointer(d, b)
    assert not result["errors"]
    assert calls == [("focus", 11)]


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
    monkeypatch.setattr(m, "identity", lambda d, wid: {})
    result = m.restore_focus_pointer(d, b)
    assert result["errors"] == [{"stage": "focus", "detail": "focus identity changed; untouched"}]
    assert "pointer" in result["restored"]
    assert calls == []


def idle_baseline():
    b = baseline()
    b["active"] = (0,)
    for w in b["windows"].values():
        w["states"] = tuple(b["atoms"][n] for n in m.IMMUTABLE)
    return b


@pytest.mark.parametrize("map_state", [m.X.IsUnmapped, m.X.IsUnviewable, m.X.IsViewable])
def test_hidden_sticky_idle_baseline_is_immutable_even_when_viewable(monkeypatch, map_state):
    b = idle_baseline()
    for w in b["windows"].values():
        w["map_state"] = map_state
    m.validate(b)
    monkeypatch.setattr(m, "identity", lambda d, wid: b["windows"][wid]["identity"])
    monkeypatch.setattr(m, "_record", lambda d, wid, atoms: copy.deepcopy(b["windows"][wid]))
    monkeypatch.setattr(m, "_owned", lambda *args: pytest.fail("unexpected mutation"))
    result = m.restore_windows(None, b)
    assert result == {"restored": [], "unchanged": [10, 20], "skipped": [], "errors": []}


@pytest.mark.parametrize("change", ["visible", "empty", "root", "managed", "missing_identity",
                                   "wrong_xid", "dead_pid", "missing_start", "key", "button"])
def test_idle_absent_active_requires_known_all_hidden_and_nonclient_identity(change):
    b = idle_baseline()
    if change == "visible":
        b["windows"][10]["states"] = ()
    elif change == "empty":
        b["clients"], b["stacking"], b["windows"] = (), (), {}
    elif change == "root":
        b["focus"] = 1
    elif change == "managed":
        b["focus"] = 10
    elif change == "missing_identity":
        b["focus_identity"] = None
    elif change == "wrong_xid":
        b["focus_identity"]["xid"] = 12
    elif change == "dead_pid":
        b["focus_identity"]["pid"] = 0
    elif change == "missing_start":
        b["focus_identity"].pop("start_ticks")
    elif change == "key":
        b["keymap"][0] = 1
    elif change == "button":
        b["pointer"][2] = 0x100
    with pytest.raises(m.PreflightError):
        m.validate(b)


@pytest.mark.parametrize("field,value", [
    ("geometry", (1, 2, 3, 4)), ("workspace", (1,)), ("states", ()),
    ("border", 1), ("extents", (1, 1, 1, 1)), ("map_state", m.X.IsUnmapped),
])
def test_changed_immutable_baseline_refuses_repair(monkeypatch, field, value):
    b = idle_baseline()
    current = copy.deepcopy(b["windows"])
    current[10][field] = value
    monkeypatch.setattr(m, "identity", lambda d, wid: b["windows"][wid]["identity"])
    monkeypatch.setattr(m, "_record", lambda d, wid, atoms: current[wid])
    monkeypatch.setattr(m, "_owned", lambda *args: pytest.fail("immutable mutation"))
    result = m.restore_windows(None, b)
    assert result["unchanged"] == [20]
    assert result["errors"][0]["xid"] == 10
    assert "immutable window untouched" in result["errors"][0]["detail"]
    assert not result["restored"]


@pytest.mark.parametrize("active,identity_ok", [(0, True), (10, True), (0, False)])
def test_idle_focus_waits_for_wm_never_forges_active(monkeypatch, active, identity_ok):
    b, calls = idle_baseline(), []
    f = NS(focus=NS(id=99), revert_to=1)
    root = NS(id=1, query_pointer=lambda: NS(mask=0, root_x=50, root_y=70),
              warp_pointer=lambda *args: pytest.fail("unnecessary pointer mutation"))
    d = NS(screen=lambda: NS(root=root), query_keymap=lambda: [0] * 32,
           get_input_focus=lambda: f, sync=lambda: None)
    monkeypatch.setattr(m, "_prop", lambda d, root, name, *args, **kwargs:
                        (0,) if name == "_NET_CURRENT_DESKTOP" else (active,))
    monkeypatch.setattr(m, "_send", lambda *args: pytest.fail("EWMH mutation"))
    monkeypatch.setattr(m, "identity", lambda d, wid: b["focus_identity"] if identity_ok else {})
    monkeypatch.setattr(m, "_owned", lambda d, ident, action: action())
    def set_focus(revert, timestamp):
        calls.append("focus")
        f.focus.id, f.revert_to = b["focus"], revert
    monkeypatch.setattr(m, "_window", lambda d, wid: NS(set_input_focus=set_focus))
    result = m.restore_focus_pointer(d, b)
    assert calls == (["focus"] if identity_ok else [])
    assert bool(result["errors"]) == (active != 0 or not identity_ok)


@pytest.mark.parametrize("kind", sorted(m.SURFACE_TYPES))
def test_idle_typed_sticky_surfaces_allowed(kind):
    b = idle_baseline()
    w = b["windows"][10]
    w["states"] = tuple(b["atoms"][n] for n in (
        "_NET_WM_STATE_STICKY", "_NET_WM_STATE_SKIP_TASKBAR", "_NET_WM_STATE_SKIP_PAGER"))
    w["window_types"] = (b["atoms"][kind],)
    m.validate(b)
    for invalid in ((), (999,), (b["atoms"][kind], 999)):
        w["window_types"] = invalid
        with pytest.raises(m.PreflightError):
            m.validate(b)
    w["window_types"] = (b["atoms"][kind],)
    w["states"] = (b["atoms"]["_NET_WM_STATE_STICKY"],)
    with pytest.raises(m.PreflightError):
        m.validate(b)


def test_immutable_computed_focus_state_change_is_not_ignored(monkeypatch):
    b = idle_baseline()
    current = copy.deepcopy(b["windows"])
    current[10]["states"] += (b["atoms"]["_NET_WM_STATE_FOCUSED"],)
    monkeypatch.setattr(m, "identity", lambda d, wid: b["windows"][wid]["identity"])
    monkeypatch.setattr(m, "_record", lambda d, wid, atoms: current[wid])
    monkeypatch.setattr(m, "_owned", lambda *args: pytest.fail("immutable mutation"))
    result = m.restore_windows(None, b)
    assert result["unchanged"] == [20]
    assert result["errors"][0]["xid"] == 10


def test_idle_exact_focus_and_pointer_do_not_receive_redundant_requests(monkeypatch):
    b = idle_baseline()
    root = NS(id=1, query_pointer=lambda: NS(mask=0, root_x=50, root_y=70),
              warp_pointer=lambda *args: pytest.fail("redundant pointer request"))
    d = NS(screen=lambda: NS(root=root), query_keymap=lambda: [0] * 32,
           get_input_focus=lambda: NS(focus=NS(id=11), revert_to=1))
    monkeypatch.setattr(m, "_prop", lambda *args, **kwargs: (0,))
    monkeypatch.setattr(m, "identity", lambda d, wid: b["focus_identity"])
    monkeypatch.setattr(m, "_owned", lambda *args: pytest.fail("redundant focus request"))
    assert not m.restore_focus_pointer(d, b)["errors"]


def test_idle_wm_derives_zero_active_after_exact_original_focus(monkeypatch):
    """Observed Cinnamon behavior: scratch exit focuses the desktop until restored."""
    b, calls = idle_baseline(), []
    active = [10]
    f = NS(focus=NS(id=99), revert_to=2)
    root = NS(id=1, query_pointer=lambda: NS(mask=0, root_x=50, root_y=70),
              warp_pointer=lambda *args: pytest.fail("unnecessary pointer request"))
    d = NS(screen=lambda: NS(root=root), query_keymap=lambda: [0] * 32,
           get_input_focus=lambda: f, sync=lambda: None)
    monkeypatch.setattr(m, "_prop", lambda d, root, name, *args, **kwargs:
                        (0,) if name == "_NET_CURRENT_DESKTOP" else tuple(active))
    monkeypatch.setattr(m, "_send", lambda *args: pytest.fail("do not forge WM properties"))
    monkeypatch.setattr(m, "identity", lambda d, wid: b["focus_identity"])
    monkeypatch.setattr(m, "_owned", lambda d, ident, action: action())

    def set_focus(revert, timestamp):
        calls.append("focus")
        f.focus.id, f.revert_to = b["focus"], revert
        active[0] = 0

    monkeypatch.setattr(m, "_window", lambda d, wid: NS(set_input_focus=set_focus))
    assert not m.restore_focus_pointer(d, b)["errors"]
    assert calls == ["focus"]
