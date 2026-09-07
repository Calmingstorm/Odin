"""Conservative, title-free X11 scratch-test state guard.

No display is opened by this module. Callers supply an already authorized Display.
Snapshot/validate are read-only. Hidden/sticky windows are immutable by default.
Only the exclusive scratch harness may opt into same-identity hidden position
repair; never activate, unhide, resize or change their state. Other unknown
states fail preflight rather than promising an unimplementable restoration.
EWMH is asynchronous: restoration is bounded and reports verification failures.
The identity tuple cannot detect XID reuse by the *same* still-running process;
X11 exposes no per-resource creation generation. Concurrent human/window changes
therefore still require the caller's exclusive, explicitly authorized test scope.
"""
from __future__ import annotations

import os
import time
from contextlib import contextmanager

from Xlib import X, Xatom
from Xlib.ext import res
from Xlib.protocol import event

LIMIT = 4096
MUTABLE = frozenset({"_NET_WM_STATE_MAXIMIZED_VERT", "_NET_WM_STATE_MAXIMIZED_HORZ",
                     "_NET_WM_STATE_FULLSCREEN", "_NET_WM_STATE_ABOVE",
                     "_NET_WM_STATE_BELOW", "_NET_WM_STATE_SKIP_TASKBAR",
                     "_NET_WM_STATE_SKIP_PAGER"})
COMPUTED = frozenset({"_NET_WM_STATE_FOCUSED"})
IMMUTABLE = frozenset({"_NET_WM_STATE_HIDDEN", "_NET_WM_STATE_STICKY"})
SURFACE_TYPES = frozenset({"_NET_WM_WINDOW_TYPE_DESKTOP", "_NET_WM_WINDOW_TYPE_DOCK"})
CONSTRAINED = frozenset({"_NET_WM_STATE_MAXIMIZED_VERT", "_NET_WM_STATE_MAXIMIZED_HORZ",
                         "_NET_WM_STATE_FULLSCREEN"})
REQUIRED = ("_NET_MOVERESIZE_WINDOW", "_NET_WM_STATE", "_NET_WM_DESKTOP",
            "_NET_CURRENT_DESKTOP", "_NET_ACTIVE_WINDOW")


class PreflightError(RuntimeError):
    pass


def process_identity(pid):
    """Read bounded kernel process metadata, never application content."""
    pid = int(pid)
    if pid <= 0:
        raise PreflightError("invalid local PID")
    fd = os.open(f"/proc/{pid}", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        uid = os.fstat(fd).st_uid
        stat_fd = os.open("stat", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
        try:
            raw = os.read(stat_fd, 8193)
        finally:
            os.close(stat_fd)
        if len(raw) > 8192 or b") " not in raw:
            raise PreflightError("invalid process stat")
        # comm may itself contain spaces and parentheses. Never retain it.
        fields = raw.rsplit(b") ", 1)[1].split()
        start = int(fields[19])
        if start <= 0:
            raise PreflightError("invalid process start ticks")
        return {"pid": pid, "uid": uid, "start_ticks": start}
    finally:
        os.close(fd)


def identity(d, wid):
    """Use XRes 1.2 local PID, never the spoofable _NET_WM_PID property."""
    ids = d.res_query_client_ids([{"client": int(wid), "mask": res.LocalClientPIDMask}]).ids
    if len(ids) != 1 or not int(ids[0].spec.mask) & res.LocalClientPIDMask:
        raise PreflightError("XRes local PID unavailable")
    values = ids[0].value
    if len(values) != 1:
        raise PreflightError("ambiguous XRes identity")
    return {"xid": int(wid), **process_identity(int(values[0]))}


def _window(d, wid):
    return d.create_resource_object("window", int(wid))


def _prop(d, w, name, kind=Xatom.CARDINAL, limit=LIMIT):
    p = w.get_property(d.intern_atom(name), kind, 0, limit)
    if p is None:
        return ()
    if p.bytes_after or p.format != 32 or p.property_type != kind or len(p.value) > limit:
        raise PreflightError(f"oversized or invalid property {name}")
    return tuple(int(v) for v in p.value)


def _atoms(d):
    return {name: d.intern_atom(name)
            for name in sorted(MUTABLE | COMPUTED | IMMUTABLE | SURFACE_TYPES)}


def _record(d, wid, atoms):
    w, root = _window(d, wid), d.screen().root
    ident = identity(d, wid)
    g = w.get_geometry()
    translated = root.translate_coords(w, 0, 0)
    states = _prop(d, w, "_NET_WM_STATE", Xatom.ATOM, 64)
    value = {"identity": ident,
             "geometry": (int(translated.x), int(translated.y), int(g.width), int(g.height)),
             "border": int(g.border_width),
             "extents": _prop(d, w, "_NET_FRAME_EXTENTS", limit=4),
             "states": states,
             "window_types": _prop(d, w, "_NET_WM_WINDOW_TYPE", Xatom.ATOM, 16),
             "state_names": tuple(name for name, atom in atoms.items() if atom in states),
             "workspace": _prop(d, w, "_NET_WM_DESKTOP", limit=1),
             "map_state": int(w.get_attributes().map_state)}
    if identity(d, wid) != ident:
        raise PreflightError("window identity changed during snapshot")
    return value


@contextmanager
def _grab(d):
    """Keep identity-check and request atomic against other X clients."""
    d.grab_server()
    try:
        yield
    finally:
        d.ungrab_server()
        d.sync()


def snapshot(d):
    """Bounded metadata only; no titles, text, pixels or window-tree walk."""
    with _grab(d):
        root, atoms = d.screen().root, _atoms(d)
        clients = _prop(d, root, "_NET_CLIENT_LIST", Xatom.WINDOW)
        pointer = root.query_pointer()
        focus = d.get_input_focus()
        fid = int(getattr(focus.focus, "id", focus.focus))
        active = _prop(d, root, "_NET_ACTIVE_WINDOW", Xatom.WINDOW, 1)
        return {"clients": clients,
                "stacking": _prop(d, root, "_NET_CLIENT_LIST_STACKING", Xatom.WINDOW),
                "windows": {wid: _record(d, wid, atoms) for wid in clients},
                "atoms": atoms,
                "supported": _prop(d, root, "_NET_SUPPORTED", Xatom.ATOM),
                "required": {name: d.intern_atom(name) for name in REQUIRED},
                "workspace": _prop(d, root, "_NET_CURRENT_DESKTOP", limit=1),
                "pointer": [int(pointer.root_x), int(pointer.root_y), int(pointer.mask)],
                "keymap": list(d.query_keymap()), "focus": fid,
                "focus_revert": int(focus.revert_to),
                "focus_identity": identity(d, fid) if fid > 1 else None,
                "active": active}


def validate(before):
    """Fail before effects. Modifier locks are not depressed input."""
    if before["pointer"][2] & 0x1F00 or any(before["keymap"]):
        raise PreflightError("held input; scratch test refused")
    if len(before["keymap"]) != 32:
        raise PreflightError("invalid keymap")
    clients = before["clients"]
    if (len(set(clients)) != len(clients) or set(clients) != set(before["stacking"])
            or len(before["stacking"]) != len(clients)
            or set(before["windows"]) != set(clients)):
        raise PreflightError("incomplete client/stacking baseline")
    for wid in clients:
        _validate_identity(before["windows"][wid]["identity"], wid)
    if before["focus"] > 1:
        _validate_identity(before["focus_identity"], before["focus"])
    if len(before["workspace"]) != 1 or len(before["active"]) != 1:
        raise PreflightError("workspace/active baseline unavailable")
    if not before["active"][0]:
        # A known idle baseline is admissible, not a promise that every WM can
        # restore it. Cleanup must observe the real WM-owned active property.
        ident = before["focus_identity"]
        if (not clients or not all(_idle_window(before["windows"][w], before) for w in clients)
                or before["focus"] <= 1 or before["focus"] in clients
                or not ident or ident.get("xid") != before["focus"]
                or ident.get("pid", 0) <= 0 or ident.get("start_ticks", 0) <= 0):
            raise PreflightError(
                "absent active requires hidden clients/typed idle surfaces and nonclient focus")
    if before["active"][0] and before["active"][0] not in clients:
        raise PreflightError("active window is not a baseline client")
    if before["active"][0] and before["atoms"]["_NET_WM_STATE_HIDDEN"] in before[
            "windows"][before["active"][0]]["states"]:
        raise PreflightError("hidden active baseline is not restorable")
    if not set(before["required"].values()) <= set(before["supported"]):
        raise PreflightError("required EWMH restoration unsupported")
    known = {before["atoms"][n] for n in MUTABLE | COMPUTED | IMMUTABLE}
    for wid in clients:
        w = before["windows"][wid]
        if not set(w["states"]) <= known:
            raise PreflightError(
                f"unsupported state on window {wid}; unknown/shaded are not restorable")
        hidden = before["atoms"]["_NET_WM_STATE_HIDDEN"] in w["states"]
        if (w["map_state"] not in (X.IsUnmapped, X.IsUnviewable, X.IsViewable)
                or (not hidden and w["map_state"] != X.IsViewable)):
            raise PreflightError(f"non-viewable window {wid}; hidden restore unsupported")
        immutable = bool(set(w["states"]) & {before["atoms"][name] for name in IMMUTABLE})
        if (not immutable and
                (w["border"] or len(w["extents"]) != 4 or len(w["workspace"]) != 1)):
            raise PreflightError(f"unsupported geometry/workspace metadata on {wid}")
        if not set(w["states"]) <= set(before["supported"]):
            raise PreflightError(f"unsupported WM state capability on {wid}")
        if any(n < 0 or n > 65535 for n in w["extents"]):
            raise PreflightError("invalid frame extents")


def _validate_identity(ident, wid):
    if (not isinstance(ident, dict) or set(ident) != {"xid", "pid", "uid", "start_ticks"}
            or any(type(v) is not int for v in ident.values())
            or ident["xid"] != wid or wid <= 1 or ident["pid"] <= 0
            or ident["uid"] < 0 or ident["start_ticks"] <= 0):
        raise PreflightError("invalid baseline window/focus identity")


def assert_input_idle(d):
    """Read-only effect-boundary guard. Never release another source's input.

    This is not an exclusive-input lease: a physical event may arrive immediately
    afterwards. Exclusive operator authorization is still a caller precondition.
    """
    keys = d.query_keymap()
    if len(keys) != 32 or any(keys) or d.screen().root.query_pointer().mask & 0x1F00:
        raise RuntimeError("input currently held; scratch restoration refused")


def _send(d, wid, name, values):
    errors = []
    message = event.ClientMessage(window=wid, client_type=d.intern_atom(name),
                                  data=(32, [int(v) & 0xFFFFFFFF for v in values]))
    d.screen().root.send_event(
        message, event_mask=X.SubstructureRedirectMask | X.SubstructureNotifyMask,
                               onerror=lambda error, request: errors.append(type(error).__name__))
    d.sync()
    if errors:
        raise RuntimeError("X request failed: " + ",".join(errors))


def _owned(d, ident, action):
    with _grab(d):
        if identity(d, ident["xid"]) != ident:
            raise RuntimeError("identity changed; untouched")
        assert_input_idle(d)
        action()


def _wait(check):
    for _ in range(20):
        if check():
            return
        time.sleep(.025)
    raise RuntimeError("restoration not acknowledged within 500ms")


def _states(w, before):
    return set(w["states"]) - {before["atoms"][n] for n in COMPUTED}


def _same(a, b, before):
    if _immutable(a, before) or _immutable(b, before):
        return a == b
    return (a["identity"] == b["identity"] and a.get("window_types") == b.get("window_types")
            and a["geometry"] == b["geometry"] and a["workspace"] == b["workspace"]
            and a["border"] == b["border"] and a["extents"] == b["extents"]
            and a["map_state"] == b["map_state"]
            and _states(a, before) == _states(b, before))


def _immutable(w, before):
    return bool(set(w["states"]) & {before["atoms"][n] for n in IMMUTABLE})


def _idle_window(w, before):
    atoms = before["atoms"]
    if atoms["_NET_WM_STATE_HIDDEN"] in w["states"]:
        return True
    # Panels/desktops are visible but immutable idle surfaces, not applications.
    # Require both skip flags, STICKY, and an exact single typed surface.
    flags = {atoms[n] for n in ("_NET_WM_STATE_STICKY", "_NET_WM_STATE_SKIP_TASKBAR",
                               "_NET_WM_STATE_SKIP_PAGER")}
    types = w.get("window_types", ())
    return (flags <= set(w["states"]) and len(types) == 1
            and types[0] in {atoms[n] for n in SURFACE_TYPES})


def restore_windows(d, before, *, restore_hidden_position=False):
    """Restore changed baseline windows independently; never act on new clients.

    StaticGravity (10) positions the client origin in root coordinates, not the
    decoration's outer edge. Thus translated client coordinates are sent without
    subtracting frame extents. Nonzero client borders are refused in preflight.
    Stacking is retained as evidence, not rewritten across unrelated new windows.
    restore_hidden_position is reserved for an exclusive, baseline-directed scratch
    cleanup AFTER topology is restored. It permits only an exact same-window,
    same-state, same-size position repair. It never maps or activates the window.
    """
    validate(before)
    result = {"restored": [], "unchanged": [], "skipped": [], "errors": []}
    for wid in before["clients"]:
        old = before["windows"][wid]
        try:
            if identity(d, wid) != old["identity"]:
                result["skipped"].append(wid)
                raise RuntimeError("baseline identity changed; untouched")
            current = _record(d, wid, before["atoms"])
            if current["identity"] != old["identity"]:
                result["skipped"].append(wid)
                raise RuntimeError("baseline identity changed during capture; untouched")
            if _same(current, old, before):
                result["unchanged"].append(wid)
                continue
            if _immutable(old, before) or _immutable(current, before):
                if not restore_hidden_position:
                    raise RuntimeError("hidden/sticky baseline changed; immutable window untouched")
                hidden = before["atoms"]["_NET_WM_STATE_HIDDEN"]
                old_meta = {k: v for k, v in old.items() if k != "geometry"}
                new_meta = {k: v for k, v in current.items() if k != "geometry"}
                if (hidden not in old["states"] or hidden not in current["states"]
                        or old_meta != new_meta or current["geometry"][2:] != old["geometry"][2:]
                        or old["border"] or len(old["extents"]) != 4):
                    raise RuntimeError("hidden baseline changed beyond position; untouched")
                def position_only():
                    if _record(d, wid, before["atoms"]) != current:
                        raise RuntimeError("hidden client changed during recovery; untouched")
                    _send(d, wid, "_NET_MOVERESIZE_WINDOW",
                          [10 | (0x3 << 8) | (2 << 12), *old["geometry"][:2], 0, 0])
                _owned(d, old["identity"], position_only)
                _wait(lambda: identity(d, wid) == old["identity"]
                      and _record(d, wid, before["atoms"]) == old)
                result["restored"].append(wid)
                continue
            def mutable_now():
                now = _record(d, wid, before["atoms"])
                known = {before["atoms"][n] for n in MUTABLE | COMPUTED}
                if (now["identity"] != old["identity"] or not set(now["states"]) <= known
                        or now["map_state"] != X.IsViewable
                        or now.get("window_types") != old.get("window_types")):
                    raise RuntimeError("current state unsupported; window untouched")

            mutable_now()
            def send(name, values):
                def guarded():
                    mutable_now()
                    _send(d, wid, name, values)
                _owned(d, old["identity"], guarded)
            # Change only flags which differ. In particular do not unmaximize an
            # unchanged maximized window and overwrite its WM-private normal size.
            wanted, present = _states(old, before), _states(current, before)
            for state in sorted(present - wanted):
                send("_NET_WM_STATE", [0, state, 0, 2, 0])
            for state in sorted(wanted - present):
                send("_NET_WM_STATE", [1, state, 0, 2, 0])
            _wait(lambda: _states(_record(d, wid, before["atoms"]), before) == wanted)
            if current["workspace"] != old["workspace"]:
                send("_NET_WM_DESKTOP", [old["workspace"][0], 2, 0, 0, 0])
            current = _record(d, wid, before["atoms"])
            if current["geometry"] != old["geometry"]:
                constrained = {before["atoms"][n] for n in CONSTRAINED}
                if wanted & constrained:
                    # Let the WM settle geometry from its state transition. There
                    # is no portable access to private pre-maximize bounds.
                    _wait(lambda: _record(d, wid, before["atoms"])["geometry"] == old["geometry"])
                else:
                    x, y, width, height = old["geometry"]
                    send("_NET_MOVERESIZE_WINDOW",
                         [10 | (0xF << 8) | (2 << 12), x, y, width, height])
            _wait(lambda: identity(d, wid) == old["identity"]
                  and _same(_record(d, wid, before["atoms"]), old, before))
            result["restored"].append(wid)
        except Exception as exc:
            result["errors"].append(
                {"xid": wid, "error": type(exc).__name__, "detail": str(exc)[:180]})
    return result


def restore_focus_pointer(d, before):
    """Best-effort independent focus/workspace and pointer restoration. No key up."""
    validate(before)
    result = {"restored": [], "errors": []}
    root = d.screen().root
    try:
        assert_input_idle(d)
    except Exception as exc:
        result["errors"].append({"stage": "input", "detail": str(exc)[:180]})
        return result
    for stage in ("workspace", "active", "focus", "pointer"):
        try:
            assert_input_idle(d)
            if stage == "workspace":
                if _prop(d, root, "_NET_CURRENT_DESKTOP", limit=1) != before["workspace"]:
                    with _grab(d):
                        assert_input_idle(d)
                        _send(d, root.id, "_NET_CURRENT_DESKTOP",
                              [before["workspace"][0], X.CurrentTime, 0, 0, 0])
                    _wait(lambda: _prop(d, root, "_NET_CURRENT_DESKTOP", limit=1)
                          == before["workspace"])
            elif stage == "active":
                active = before["active"][0]
                if not active:
                    ident = before["focus_identity"]
                    # The WM derives active-client state from input focus. On an
                    # idle baseline restore the exact pre-existing WM focus first,
                    # never forge its _NET_ACTIVE_WINDOW property.
                    actual_focus = d.get_input_focus()
                    focus_id = int(getattr(actual_focus.focus, "id", actual_focus.focus))
                    if ident and identity(d, before["focus"]) != ident:
                        raise RuntimeError("idle focus identity changed; untouched")
                    if ident and (focus_id != before["focus"]
                                  or actual_focus.revert_to != before["focus_revert"]):
                        def idle_focus():
                            _window(d, before["focus"]).set_input_focus(
                                before["focus_revert"], X.CurrentTime)
                            d.sync()
                        _owned(d, ident, idle_focus)
                if (not active and _prop(d, root, "_NET_ACTIVE_WINDOW", Xatom.WINDOW, 1)
                        != before["active"]):
                    # Only wait for the WM after scratch termination. Never
                    # forge _NET_ACTIVE_WINDOW or activate a hidden old client.
                    _wait(lambda: _prop(d, root, "_NET_ACTIVE_WINDOW", Xatom.WINDOW, 1)
                          == before["active"])
                if (active and _prop(d, root, "_NET_ACTIVE_WINDOW", Xatom.WINDOW, 1)
                        != before["active"]):
                    if (_immutable(before["windows"][active], before)
                            or _immutable(_record(d, active, before["atoms"]), before)):
                        raise RuntimeError("immutable active baseline changed; window untouched")
                    ident = before["windows"][active]["identity"]
                    def activate():
                        _focus_client_safe(d, before)
                        _send(d, active, "_NET_ACTIVE_WINDOW", [2, X.CurrentTime, 0, 0, 0])
                    _owned(d, ident, activate)
                    _wait(lambda: _prop(d, root, "_NET_ACTIVE_WINDOW", Xatom.WINDOW, 1)
                          == before["active"])
            elif stage == "focus":
                if any(e["stage"] in {"workspace", "active"} for e in result["errors"]):
                    raise RuntimeError("workspace/active restoration failed; focus untouched")
                if not before["active"][0] and _prop(
                        d, root, "_NET_ACTIVE_WINDOW", Xatom.WINDOW, 1) != before["active"]:
                    raise RuntimeError("WM has not restored idle active state; focus untouched")
                ident = before["focus_identity"]
                def focus():
                    _focus_client_safe(d, before)
                    _window(d, before["focus"]).set_input_focus(
                        before["focus_revert"], X.CurrentTime)
                    d.sync()
                def focused():
                    f = d.get_input_focus()
                    return (int(getattr(f.focus, "id", f.focus)) == before["focus"]
                            and int(f.revert_to) == before["focus_revert"])
                if ident and identity(d, ident["xid"]) != ident:
                    raise RuntimeError("focus identity changed; untouched")
                if not focused():
                    if ident:
                        _owned(d, ident, focus)
                    else:
                        with _grab(d):
                            assert_input_idle(d)
                            focus()
                _wait(focused)
            else:
                p = root.query_pointer()
                if [p.root_x, p.root_y] != before["pointer"][:2]:
                    with _grab(d):
                        assert_input_idle(d)
                        root.warp_pointer(*before["pointer"][:2])
                        d.sync()
                    p = root.query_pointer()
                if [p.root_x, p.root_y] != before["pointer"][:2]:
                    raise RuntimeError("pointer restoration not acknowledged")
            result["restored"].append(stage)
        except Exception as exc:
            result["errors"].append({"stage": stage, "detail": str(exc)[:180]})
    return result


def _focus_client_safe(d, before):
    """Recheck active ancestor under the same grab as activation/child focus."""
    active = before["active"][0]
    if active:
        old = before["windows"][active]
        now = _record(d, active, before["atoms"])
        if (now["identity"] != old["identity"] or _immutable(now, before)
                or now["map_state"] != X.IsViewable):
            raise RuntimeError("active baseline identity/state changed; focus untouched")
