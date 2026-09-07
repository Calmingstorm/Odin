"""Private, read-only X11 application scope. No connection creation or input.

Snapshots are native-private evidence, never API/public diagnostics. Queries are
bounded revalidation, NOT an atomic focus/input security boundary. X11 clients
in one server remain mutually untrusted; this does not isolate hostile peers.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from pathlib import Path
from typing import Any

MAX_DEPTH = 32
MAX_PROPERTY = 4096
# Only these pixel-free reasons may leave the private scope adapter.
SCOPE_REASONS = frozenset({
    "application_identity_unavailable", "application_identity_changed",
    "application_scope_unavailable", "application_scope_changed",
    "source_scope_unavailable", "application_uid_mismatch",
    "application_process_unreadable",
    "no_focused_application", "focused_application_outside_source",
})


class ScopeFailure(RuntimeError):  # noqa: N818 - Scope adapter failure API.
    """Static failure: no titles, native IDs, process arguments or paths."""


def _xid(window):
    return int(getattr(window, "id", window))


def _field(value, name):
    return value[name] if isinstance(value, dict) else getattr(value, name)


def _trusted_file(path):
    """Record root-owned, non-writable ancestry as evidence, never admission."""
    try:
        resolved = path.resolve(strict=True)
        for item in (path, *path.parents, resolved, *resolved.parents):
            info = item.stat()
            if info.st_uid != 0 or info.st_mode & 0o022:
                return False
        return stat.S_ISREG(resolved.stat().st_mode)
    except OSError:
        return False


def _process_identity(pid):
    """Authoritative XRes PID, then stable local /proc identity, not WM_PID."""
    if type(pid) is not int or pid <= 1:
        raise ScopeFailure("application_identity_unavailable")
    proc = Path("/proc") / str(pid)

    def read_identity():
        data = (proc / "stat").read_text()
        fields = data[data.rfind(")") + 2:].split()
        if len(fields) < 20 or fields[0] in {"Z", "X", "x"}:
            raise ScopeFailure("application_identity_unavailable")
        start = int(fields[19])  # field 22; comm can contain spaces and ')'.
        status = (proc / "status").read_text()
        uid_line = next(line for line in status.splitlines() if line.startswith("Uid:"))
        uids = tuple(map(int, uid_line.split()[1:]))
        if len(uids) != 4 or len(set(uids)) != 1 or proc.stat().st_uid != uids[0]:
            raise ScopeFailure("application_identity_unavailable")
        if os.geteuid() not in {0, uids[0]}:
            raise ScopeFailure("application_uid_mismatch")
        executable = (proc / "exe").resolve(strict=True)
        info = (proc / "exe").stat()
        with (proc / "cmdline").open("rb") as stream:
            cmdline = stream.read(16385)
        if not cmdline or len(cmdline) > 16384 or not cmdline.endswith(b"\0"):
            raise ScopeFailure("application_identity_unavailable")
        return (start, uids, executable, (info.st_dev, info.st_ino), cmdline,
                _trusted_file(executable))

    first = read_identity()
    start, uids, executable, inode, cmdline, trusted = first
    script_identity = None
    if re.match(r"^(?:python|pypy|ruby|perl|node|bash|dash|sh)[0-9.]*$", executable.name):
        # Process-reported argv is evidence, not proof of the script executed.
        script_identity = {"interpreter": str(executable),
                           "argv_digest": hashlib.sha256(cmdline).hexdigest(),
                           "verified": False}
    if first != read_identity():
        raise ScopeFailure("application_identity_changed")
    return {"pid": pid, "uid": uids[0], "start_ticks": start,
            "exe": str(executable), "exe_identity": list(inode),
            "script_identity": script_identity,
            "trusted_executable": trusted,
            "cmdline_digest": hashlib.sha256(cmdline).hexdigest()}


class AppScope:
    """Use an owner-provided python-xlib Display; never closes it.

    The worker must run with the application's UID or explicitly provisioned root
    inspection privileges. No privilege escalation is attempted here. Unavailable
    snapshot returns None. assert_snapshot returns fresh evidence or raises a
    static ScopeFailure. rect is root-absolute and clipped to the source monitor.
    """

    def __init__(self, connection):
        # Operator-configured explicit display only. Tests must never access :0.
        name = connection.get_display_name()
        if not isinstance(name, str) or not re.fullmatch(r":[0-9]{1,5}(?:\.[0-9]+)?", name):
            raise ScopeFailure("explicit_local_display_required")
        self.connection = connection
        self._atoms = {}

    def _atom(self, name):
        if name not in self._atoms:
            atom = self.connection.intern_atom(name, only_if_exists=True)
            # A dialog can create an atom after our first read. Never cache None.
            if atom:
                self._atoms[name] = atom
            return atom
        return self._atoms[name]

    def _property(self, window, name):
        atom = self._atom(name)
        if not atom:
            return None
        # GetProperty's length is four-byte units. Never unbounded full_property.
        prop = window.get_property(atom, 0, 0, MAX_PROPERTY // 4)
        if prop is not None and prop.bytes_after:
            raise ScopeFailure("application_scope_unavailable")
        return prop

    def _values(self, window, name):
        prop = self._property(window, name)
        if prop is None:
            return []
        if prop.format != 32:
            raise ScopeFailure("application_scope_unavailable")
        return [int(value) for value in prop.value]

    def _text(self, window, name):
        prop = self._property(window, name)
        if prop is None:
            return ""
        if prop.format != 8:
            raise ScopeFailure("application_scope_unavailable")
        return bytes(prop.value).decode("utf-8", errors="strict").replace("\x00", " ").strip()

    def _metadata(self, window):
        modern_title = self._text(window, "_NET_WM_NAME")
        legacy_title = self._text(window, "WM_NAME")
        title = modern_title or legacy_title
        wm_class = self._text(window, "WM_CLASS")
        # Titles/classes are provenance, never an application permission list.
        # Task authorization is not inferred from a name or this native binding.
        # Harmless document title changes (dirty asterisk) are not source changes.
        # Modal titles are bound separately.
        digest = hashlib.sha256(wm_class.encode()).hexdigest()
        return title, wm_class, digest

    def _window(self, value):
        return self.connection.create_resource_object("window", _xid(value))

    def _ancestors(self, window, root):
        result: list[Any] = []
        seen: set[int] = set()
        for _ in range(MAX_DEPTH):
            identity = _xid(window)
            if identity == _xid(root):
                return result
            if identity <= 1 or identity in seen:
                break
            seen.add(identity)
            result.append(window)
            window = window.query_tree().parent
        raise ScopeFailure("application_scope_unavailable")

    def _target(self, focused, root):
        ancestors = self._ancestors(focused, root)
        # Hints locate client top-level beneath possible WM reparenting frames.
        candidates = [w for w in ancestors if self._values(w, "WM_STATE")
                      or self._values(w, "_NET_WM_PID")]
        if not candidates:
            raise ScopeFailure("application_scope_unavailable")
        return candidates[-1], ancestors

    def _pid(self, window):
        # Imports are lazy: importing this module needs no X11 dependency.
        from Xlib.ext import res  # type: ignore[import-untyped]

        reply = self.connection.res_query_client_ids([
            {"client": _xid(window), "mask": res.LocalClientPIDMask}])
        ids = reply.ids
        if len(ids) != 1:
            raise ScopeFailure("application_identity_unavailable")
        value = ids[0]
        if (_field(_field(value, "spec"), "mask") != res.LocalClientPIDMask
                or len(_field(value, "value")) != 1):
            raise ScopeFailure("application_identity_unavailable")
        pid = int(_field(value, "value")[0])
        if pid <= 1:
            raise ScopeFailure("application_identity_unavailable")
        return pid

    def _topology(self, root, monitor):
        values = [int(_field(monitor, k)) for k in ("x", "y", "width", "height")]
        if values[2] <= 0 or values[3] <= 0:
            raise ScopeFailure("source_scope_unavailable")
        reply = root.xrandr_get_monitors(True)
        monitors = []
        if not 1 <= len(reply.monitors) <= 32:
            raise ScopeFailure("source_scope_unavailable")
        for entry in reply.monitors:
            monitors.append([int(_field(entry, k)) for k in (
                "name", "x", "y", "width_in_pixels", "height_in_pixels")]
                + [list(map(int, _field(entry, "crtcs")))])
        if not any(m[1:5] == values for m in monitors):
            raise ScopeFailure("source_scope_unavailable")
        geometry = root.get_geometry()
        return values, {"root": _xid(root), "size": [geometry.width, geometry.height],
                        "monitors": sorted(monitors)}

    def _snapshot(self, monitor, *, candidate=None):
        from Xlib import X  # type: ignore[import-untyped]

        version = self.connection.res_query_version(1, 2)
        if (version.server_major, version.server_minor) < (1, 2):
            raise ScopeFailure("application_identity_unavailable")
        root = self.connection.screen().root
        source, topology = self._topology(root, monitor)
        focused = self.connection.get_input_focus().focus
        if _xid(focused) <= 1 or _xid(focused) == _xid(root):
            raise ScopeFailure("no_focused_application")
        actual_focus = _xid(focused)
        # Private pointer-hit evidence only, never public window authority.
        if candidate is not None:
            focused = candidate
        focused = self._window(focused)
        target, ancestors = self._target(focused, root)
        pid = self._pid(target)
        process = _process_identity(pid)
        path, focus_metadata = [], []
        for window in ancestors:
            path.append(_xid(window))
            focus_metadata.append(self._metadata(window)[2])
            if self._pid(window) != pid:
                raise ScopeFailure("application_scope_unavailable")
            if _xid(window) == _xid(target):
                break
        title, wm_class, metadata_digest = self._metadata(target)
        attrs = target.get_attributes()
        if attrs.map_state != X.IsViewable:
            raise ScopeFailure("application_scope_unavailable")
        geo = target.get_geometry()
        origin = root.translate_coords(target, 0, 0)
        if not origin.same_screen:
            raise ScopeFailure("source_scope_unavailable")
        rect = [int(origin.x), int(origin.y), int(geo.width), int(geo.height)]
        left, top = max(rect[0], source[0]), max(rect[1], source[1])
        right = min(rect[0] + rect[2], source[0] + source[2])
        bottom = min(rect[1] + rect[3], source[1] + source[3])
        if right <= left or bottom <= top:
            raise ScopeFailure("focused_application_outside_source")
        states = self._values(target, "_NET_WM_STATE")
        types = self._values(target, "_NET_WM_WINDOW_TYPE")
        allowed_types = {self._atom("_NET_WM_WINDOW_TYPE_" + kind) for kind in
                         ("NORMAL", "DIALOG", "MENU", "DROPDOWN_MENU", "POPUP_MENU", "UTILITY")}
        if any(value not in allowed_types for value in types):
            raise ScopeFailure("application_scope_unavailable")
        transient = self._values(target, "WM_TRANSIENT_FOR")
        modal = bool(transient or self._atom("_NET_WM_STATE_MODAL") in states
                     or self._atom("_NET_WM_WINDOW_TYPE_DIALOG") in types)
        chain, chain_metadata, seen = [], [], {_xid(target)}
        chain_processes = []
        cursor = target
        for _ in range(MAX_DEPTH):
            parent_ids = self._values(cursor, "WM_TRANSIENT_FOR")
            if not parent_ids:
                break
            if len(parent_ids) != 1 or parent_ids[0] in seen or parent_ids[0] == _xid(root):
                raise ScopeFailure("application_scope_unavailable")
            seen.add(parent_ids[0])
            cursor = self._window(parent_ids[0])
            actual, _ = self._target(cursor, root)
            if _xid(actual) != _xid(cursor):
                raise ScopeFailure("application_scope_unavailable")
            chain_processes.append(_process_identity(self._pid(cursor)))
            parent_title, parent_class, parent_digest = self._metadata(cursor)
            parent_types = self._values(cursor, "_NET_WM_WINDOW_TYPE")
            parent_states = self._values(cursor, "_NET_WM_STATE")
            if (cursor.get_attributes().map_state != X.IsViewable
                    or any(value not in allowed_types for value in parent_types)):
                raise ScopeFailure("application_scope_unavailable")
            parent_digest = hashlib.sha256(json.dumps(
                [parent_digest, parent_title, parent_types, parent_states],
                separators=(",", ":")).encode()).hexdigest()
            chain_metadata.append(parent_digest)
            chain.append(_xid(cursor))
        else:
            raise ScopeFailure("application_scope_unavailable")
        evidence = {"topology": topology, "source_rect": source,
                    "source_origin": source[:2],
                    "window": _xid(target), "focus_window": _xid(focused),
                    "focus_path": path, "ancestor_path": [_xid(w) for w in ancestors],
                    "focus_metadata": focus_metadata, "transient_metadata": chain_metadata,
                    "window_rect": rect, "rect": [left, top, right-left, bottom-top],
                    "focused": True, "modal": modal,
                    "modal_kind": (None if not modal else
                                   "safe_application"),
                    "modal_title_digest": (hashlib.sha256(title.encode()).hexdigest()
                                           if modal else None),
                    "transient_chain": chain, "process": process,
                    "transient_processes": chain_processes, "wm_class": wm_class,
                    "metadata_digest": metadata_digest, "states": states, "types": types}
        # Bound TOCTOU detection; there is no claim of an atomic X11 transaction.
        if (_xid(self.connection.get_input_focus().focus) != actual_focus
                or self._pid(target) != pid or _process_identity(pid) != process
                or any(_process_identity(self._pid(self._window(wid))) != identity
                       for wid, identity in zip(chain, chain_processes, strict=True))
                or self._topology(root, monitor)[1] != topology):
            raise ScopeFailure("application_scope_changed")
        evidence["fingerprint"] = hashlib.sha256(
            json.dumps(evidence, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        return evidence

    def snapshot(self, monitor):
        return self.inspect(monitor)[0]

    def target_state(self, expected, monitor):
        """Measure the prior native target, not absence from the CURRENT focus.

        Only a real BadWindow proves destruction. Scope/PID/topology errors are
        unavailable, never evidence of a successful close. Unmapped is reported
        as disappearance, not a claim that the process exited or a file saved.
        """
        from Xlib import X, error  # type: ignore[import-untyped]

        root = self.connection.screen().root
        source, topology = self._topology(root, monitor)
        if source != expected["source_rect"] or topology != expected["topology"]:
            raise ScopeFailure("source_scope_unavailable")
        target = self._window(expected["window"])
        try:
            attributes = target.get_attributes()
            process = _process_identity(self._pid(target))
        except error.BadWindow:
            return "destroyed"
        if process != expected["process"]:
            return "replaced"
        return "present" if attributes.map_state == X.IsViewable else "unmapped"

    def inspect(self, monitor):
        """Return private binding and a public-safe, explicit refusal reason."""
        try:
            return self._snapshot(monitor), None
        except ScopeFailure as exc:
            reason = str(exc)
            return None, reason if reason in SCOPE_REASONS else "application_scope_unavailable"
        except PermissionError:
            return None, "application_process_unreadable"
        except Exception:
            return None, "application_scope_unavailable"

    def assert_snapshot(self, expected, monitor, point=None, *, pointer_query=None):
        current = self.snapshot(monitor)
        if (current is None or current != expected or not current["focused"]
                or current["modal_kind"] == "unrecognized"):
            raise ScopeFailure("application_scope_changed")
        if point is not None:
            try:
                x, y = point
                if type(x) is not int or type(y) is not int:
                    raise ValueError
                left, top, width, height = current["source_rect"]
                if not (left <= x < left + width and top <= y < top + height):
                    raise ValueError
                window = self.connection.screen().root
                seen = set()
                for _ in range(MAX_DEPTH):
                    identity = _xid(window)
                    if identity in seen:
                        raise ValueError
                    seen.add(identity)
                    # Native injection's client is bound to the owned master.
                    query = (window.query_pointer() if pointer_query is None
                             else pointer_query(identity))
                    if not query.same_screen or (query.root_x, query.root_y) != (x, y):
                        raise ValueError
                    if not _xid(query.child):
                        break
                    window = self._window(query.child)
                else:
                    raise ValueError
                target = self._snapshot(monitor, candidate=window)
                family = {current["window"], *current["transient_chain"]}
                related = (target["window"] in family
                           or bool(family.intersection(target["transient_chain"]))
                           or target["process"] == current["process"])
                if not related:
                    raise ValueError
                # Bounds and provenance checks apply to the actual hit,
                # including every descendant and its transient family, not just
                # the focused top-level. Popup extent may exceed that top-level.
                left, top, width, height = target["rect"]
                if not (left <= x < left + width and top <= y < top + height):
                    raise ValueError
                if self._snapshot(monitor, candidate=window) != target:
                    raise ValueError
                if self.snapshot(monitor) != current:
                    raise ValueError
            except Exception:
                raise ScopeFailure("pointer_scope_changed") from None
        return current
