"""Restricted, exact RandR topology snapshots for the opt-in scratch harness.

All APIs take an already authorized Xlib Display. No connection, probing, wake,
saved configuration, shell, or desktop policy is implicit. Caller MUST impose a
wall-clock deadline and persist the JSON-compatible capture before any effects.
This is topology restoration, not gamma/output-property/DPMS restoration.
"""

from Xlib import X


class UnsupportedTopology(ValueError):  # noqa: N818 - preserve helper exception API
    """The topology cannot be restored by this deliberately restricted helper."""


IDENTITY = [65536, 0, 0, 0, 65536, 0, 0, 0, 65536]
MODE_FIELDS = (
    "id width height dot_clock h_sync_start h_sync_end h_total h_skew "
    "v_sync_start v_sync_end v_total name_length flags"
).split()
PAN_FIELDS = (
    "left top width height track_left track_top track_width track_height "
    "border_left border_top border_right border_bottom"
).split()


def _fields(obj, names):
    return {name: int(getattr(obj, name)) for name in names}


def _ok(reply):
    if int(reply.status) != 0:
        raise UnsupportedTopology(f"RandR request failed with status {reply.status}")
    return reply


def _text(value):
    return value.decode("latin1") if isinstance(value, bytes) else value


def _once(d):
    if d.screen_count() != 1:
        raise UnsupportedTopology("Only a single X screen is supported")
    version = d.xrandr_query_version()
    if (version.major_version, version.minor_version) < (1, 5):
        raise UnsupportedTopology("RandR 1.5 is required")
    root = d.screen().root
    # Current is intentional: GetScreenResources may probe/wake outputs.
    resources = root.xrandr_get_screen_resources_current()
    stamp = resources.config_timestamp
    info = root.xrandr_get_screen_info()
    geo = root.get_geometry()
    size = info.sizes[info.size_id]
    screen = _fields(size, ["width_in_pixels", "height_in_pixels",
                            "width_in_millimeters", "height_in_millimeters"])
    if info.rotation in (2, 8):
        for unit in ("pixels", "millimeters"):
            a, b = f"width_in_{unit}", f"height_in_{unit}"
            screen[a], screen[b] = screen[b], screen[a]
    if (screen["width_in_pixels"], screen["height_in_pixels"]) != (geo.width, geo.height):
        raise UnsupportedTopology("Screen size query is inconsistent with root geometry")
    modes, offset = [], 0
    names = _text(resources.names)
    for mode in resources.modes:
        item = _fields(mode, MODE_FIELDS)
        item["name"] = names[offset:offset + item["name_length"]]
        offset += item["name_length"]
        modes.append(item)
    if offset != len(names):
        raise UnsupportedTopology("Malformed mode name table")
    crtcs = []
    for cid in resources.crtcs:
        c = _ok(d.xrandr_get_crtc_info(cid, stamp))
        t = d.xrandr_get_crtc_transform(cid)
        p = _ok(d.xrandr_get_panning(cid))
        item = {"id": int(cid), **_fields(c, ["x", "y", "width", "height", "mode",
                                            "rotation", "possible_rotations"]),
                "outputs": sorted(map(int, c.outputs)),
                "possible_outputs": sorted(map(int, c.possible_outputs)),
                "panning": _fields(p, PAN_FIELDS),
                "has_transforms": bool(t.has_transforms)}
        for kind in ("current", "pending"):
            matrix = getattr(t, kind + "_transform")
            item[kind + "_transform"] = [int(getattr(matrix, f"matrix{i}{j}"))
                                          for i in range(1, 4) for j in range(1, 4)]
            item[kind + "_filter_name"] = _text(getattr(t, kind + "_filter_name"))
            item[kind + "_filter_params"] = list(getattr(t, kind + "_filter_params"))
        crtcs.append(item)
    outputs = []
    for oid in resources.outputs:
        o = _ok(d.xrandr_get_output_info(oid, stamp))
        outputs.append({"id": int(oid), "name": _text(o.name),
                        **_fields(o, ["crtc", "mm_width", "mm_height", "connection",
                                     "subpixel_order", "num_preferred"]),
                        **{key: sorted(map(int, getattr(o, key)))
                           for key in ("crtcs", "modes", "clones")}})
    monitors = []
    for m in root.xrandr_get_monitors(False).monitors:
        monitors.append({"name": d.get_atom_name(m.name), "atom": int(m.name),
                         "primary": bool(m.primary), "automatic": bool(m.automatic),
                         **_fields(m, ["x", "y", "width_in_pixels", "height_in_pixels",
                                       "width_in_millimeters", "height_in_millimeters"]),
                         # python-xlib calls the protocol's OUTPUT list 'crtcs'.
                         "outputs": sorted(map(int, m.crtcs))})
    end = root.xrandr_get_screen_resources_current()
    if (resources.timestamp, stamp) != (end.timestamp, end.config_timestamp):
        raise UnsupportedTopology("RandR changed during capture")
    return {"schema": 1, "root": int(root.id), "screen": screen,
            "range": _fields(root.xrandr_get_screen_size_range(),
                              ["min_width", "min_height", "max_width", "max_height"]),
            "primary": int(root.xrandr_get_output_primary().output),
            "modes": sorted(modes, key=lambda v: v["id"]),
            "outputs": sorted(outputs, key=lambda v: v["id"]),
            "crtcs": sorted(crtcs, key=lambda v: v["id"]),
            "monitors": sorted(monitors, key=lambda v: v["atom"])}


def capture(d):
    """Read a stable, JSON-compatible topology; performs no mutation or probing.

    Capture includes unsupported states so callers may report the exact refusal.
    Call validate before *any* scratch effects. Two equal reads are required.
    """
    first, second = _once(d), _once(d)
    if first != second:
        raise UnsupportedTopology("RandR changed during capture")
    return first


def validate(snapshot):
    """Raise UnsupportedTopology unless this snapshot is exactly representable."""
    try:
        _validate(snapshot)
    except (KeyError, TypeError, IndexError, AttributeError) as exc:
        raise UnsupportedTopology("Malformed RandR snapshot") from exc


def _validate(s):
    if s["schema"] != 1:
        raise UnsupportedTopology("Unknown snapshot schema")
    screen, bounds = s["screen"], s["range"]
    for axis in ("width", "height"):
        if not bounds[f"min_{axis}"] <= screen[f"{axis}_in_pixels"] <= bounds[f"max_{axis}"]:
            raise UnsupportedTopology("Framebuffer outside supported range")
        if screen[f"{axis}_in_millimeters"] <= 0:
            raise UnsupportedTopology("Invalid framebuffer physical dimensions")
    modes = {m["id"]: m for m in s["modes"]}
    outputs = {o["id"]: o for o in s["outputs"]}
    crtcs = {c["id"]: c for c in s["crtcs"]}
    if any(len(rows) != len(ids) for rows, ids in ((s["modes"], modes),
           (s["outputs"], outputs), (s["crtcs"], crtcs))):
        raise UnsupportedTopology("Duplicate resource identities")
    if s["primary"] and s["primary"] not in outputs:
        raise UnsupportedTopology("Unknown primary output")
    if any(not m["automatic"] for m in s["monitors"]):
        raise UnsupportedTopology("User-defined monitor objects are unsupported")
    assigned = set()
    for c in s["crtcs"]:
        for kind in ("current", "pending"):
            if (c[kind + "_transform"] != IDENTITY
                    or c[kind + "_filter_params"]
                    or c[kind + "_filter_name"] not in ("", "nearest", "bilinear")):
                raise UnsupportedTopology(
                    "Only identity transforms without filter parameters are supported")
        if (c["current_filter_name"] != c["pending_filter_name"]
                and {c["current_filter_name"], c["pending_filter_name"]} != {"", "nearest"}):
            raise UnsupportedTopology("Pending filter change is unsupported")
        if any(c["panning"].values()):
            raise UnsupportedTopology("Panning is unsupported")
        if not c["mode"]:
            if (c["outputs"] or any(c[k] for k in ("x", "y", "width", "height"))
                    or c["rotation"] != 1):
                raise UnsupportedTopology("Noncanonical disabled CRTC")
            continue
        if c["mode"] not in modes or not c["outputs"]:
            raise UnsupportedTopology("Missing active mode/output")
        rotation = c["rotation"]
        if ((rotation & 15) not in (1, 2, 4, 8) or rotation & ~63
                or rotation & ~c["possible_rotations"]):
            raise UnsupportedTopology("Invalid CRTC rotation")
        mode = modes[c["mode"]]
        w, h = mode["width"], mode["height"]
        if rotation & (2 | 8):
            w, h = h, w
        if (w, h) != (c["width"], c["height"]) or min(c["x"], c["y"]) < 0:
            raise UnsupportedTopology("Inconsistent CRTC dimensions")
        if c["x"] + w > screen["width_in_pixels"] or c["y"] + h > screen["height_in_pixels"]:
            raise UnsupportedTopology("CRTC outside framebuffer")
        for oid in c["outputs"]:
            o = outputs[oid]
            if (oid in assigned or o["crtc"] != c["id"] or o["connection"] != 0
                    or c["id"] not in o["crtcs"] or oid not in c["possible_outputs"]
                    or c["mode"] not in o["modes"]):
                raise UnsupportedTopology("Inconsistent output assignment")
            assigned.add(oid)
    if any(o["crtc"] and o["id"] not in assigned for o in s["outputs"]):
        raise UnsupportedTopology("Orphaned output assignment")


def _inventory(s):
    return {"root": s["root"], "range": s["range"], "modes": s["modes"],
            "outputs": [{k: v for k, v in o.items() if k != "crtc"} for o in s["outputs"]],
            "crtcs": [{k: v for k, v in c.items()
                       if k not in ("x", "y", "width", "height", "mode", "rotation", "outputs")}
                      for c in s["crtcs"]]}


def restore(d, snapshot):
    """Fence other X clients across stable inventory validation and all writes.

    A server grab is NOT a physical hotplug/input lease. X request failures still
    fail closed, and exclusive scratch authorization plus a deadline is required.
    No WM acknowledgement is awaited while grabbed, only server RandR replies.
    """
    validate(snapshot)
    d.grab_server()
    try:
        return _restore_locked(d, snapshot)
    finally:
        d.ungrab_server()
        d.sync()


def _restore_locked(d, snapshot):
    """Restore only changed topology, using exact mode XIDs, never mode names.

    Return False for an exact no-op, True for verified restoration. Refuse hotplug,
    mode replacement, transform/filter/panning changes before writes. X errors or
    failed verification raise; partial restoration is possible on server failure.
    This cannot distinguish a concurrent user's changes from scratch changes.
    """
    validate(snapshot)
    current = capture(d)
    validate(current)
    if current == snapshot:
        return False
    if _inventory(current) != _inventory(snapshot):
        raise UnsupportedTopology("Resource/transform inventory changed; refusing topology writes")
    root = d.screen().root
    keys = d.query_keymap()
    if len(keys) != 32 or any(keys) or root.query_pointer().mask & 0x1F00:
        raise UnsupportedTopology("Input currently held; refusing topology writes")
    changed = [(a, b) for a, b in zip(current["crtcs"], snapshot["crtcs"], strict=True) if a != b]
    errors = []
    # Xlib's public setter returns None, not the previous handler.
    old_handler = d.display.error_handler
    d.set_error_handler(lambda error, request: errors.append(error))

    def sync():
        d.sync()
        if errors:
            raise RuntimeError(f"RandR X error: {type(errors[0]).__name__}")

    def set_crtc(c, disabled=False):
        stamp = root.xrandr_get_screen_resources_current().config_timestamp
        _ok(d.xrandr_set_crtc_config(c["id"], stamp,
                                    0 if disabled else c["x"], 0 if disabled else c["y"],
                                    0 if disabled else c["mode"], 1 if disabled else c["rotation"],
                                    [] if disabled else c["outputs"], timestamp=X.CurrentTime))

    def set_screen(screen):
        root.xrandr_set_screen_size(screen["width_in_pixels"], screen["height_in_pixels"],
                                    screen["width_in_millimeters"], screen["height_in_millimeters"])
        sync()

    try:
        for before, _ in changed:
            if before["mode"]:
                set_crtc(before, disabled=True)
        interim = dict(current["screen"])
        for axis in ("width", "height"):
            key = f"{axis}_in_pixels"
            interim[key] = max(interim[key], snapshot["screen"][key])
        if interim != current["screen"]:
            set_screen(interim)
        for _, target in changed:
            if target["mode"]:
                set_crtc(target)
        if interim != snapshot["screen"]:
            set_screen(snapshot["screen"])
        if current["primary"] != snapshot["primary"]:
            root.xrandr_set_output_primary(snapshot["primary"])
        sync()
    finally:
        d.set_error_handler(old_handler)
    if capture(d) != snapshot:
        raise RuntimeError("RandR restoration did not reproduce the captured baseline")
    return True


def monitor_geometry(d, name):
    """Return an unambiguous active output's root-relative geometry (not a wake)."""
    s = capture(d)
    validate(s)
    matches = [o for o in s["outputs"] if o["name"] == name and o["crtc"]]
    if len(matches) != 1:
        raise UnsupportedTopology("Requested output is absent, disabled, or ambiguous")
    c = next(c for c in s["crtcs"] if c["id"] == matches[0]["crtc"])
    return {key: c[key] for key in ("x", "y", "width", "height")}
