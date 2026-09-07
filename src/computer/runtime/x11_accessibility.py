"""Optional attached AT-SPI with native identities across one-shot workers.

No session-bus activation, desktop settings, privilege changes or name-based
retargeting. The existing X server's accessibility-bus property must exist.
X11 and AT-SPI are cooperative protocols, not hostile-peer isolation.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets

from .accessibility import Accessibility, PrimitiveError


def seal(value):
    return hashlib.sha256(repr(value).encode("utf-8")).hexdigest()


class AttachedAccessibility(Accessibility):
    def __init__(self, connection, scope):
        super().__init__()
        self.connection = connection
        self.scope = scope
        self.display = connection.get_display_name()
        self.bus = self.gio = self.glib = None
        self.bus_id = None
        self.owners = {}

    def _load(self):
        if self.api is not None:
            return self.api
        atom = self.connection.intern_atom("AT_SPI_BUS", only_if_exists=True)
        prop = (self.connection.screen().root.get_property(atom, 0, 0, 1024)
                if atom else None)
        if prop is None or prop.format != 8 or prop.bytes_after:
            raise PrimitiveError("unsupported", "Existing accessibility bus unavailable")
        address = bytes(prop.value).rstrip(b"\0").decode("ascii")
        if not re.fullmatch(r"unix:(?:path|abstract)=[/A-Za-z0-9_.-]{1,256}"
                            r"(?:,guid=[0-9a-f]{32})?", address):
            raise PrimitiveError("unsupported", "Accessibility bus transport unavailable")
        from .gi_support import load_gi
        gi = load_gi()
        gi.require_version("Gio", "2.0")
        from gi.repository import Gio, GLib  # type: ignore[import-not-found]
        self.gio, self.glib = Gio, GLib
        self.bus = Gio.DBusConnection.new_for_address_sync(
            address, Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT
            | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, None, None)
        self.bus_id = self.bus.get_guid()
        if not self.bus_id:
            raise PrimitiveError("unsupported", "Accessibility bus identity unavailable")
        registered = self.bus.call_sync(
            "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus",
            "NameHasOwner", GLib.Variant("(s)", ("org.a11y.atspi.Registry",)),
            GLib.VariantType.new("(b)"), Gio.DBusCallFlags.NO_AUTO_START, 100, None)
        if registered.unpack() != (True,):
            raise PrimitiveError("unsupported", "Existing accessibility registry unavailable")
        # Worker-local only; never enable accessibility or start a session bus.
        os.environ["AT_SPI_BUS_ADDRESS"] = address
        os.environ["AT_SPI_DISPLAY"] = self.display
        return super()._load()

    def native_identity(self, node):
        sender, path = node.app.bus_name, node.path
        if (not isinstance(sender, str) or not re.fullmatch(r":[0-9]+\.[0-9]+", sender)
                or not isinstance(path, str) or len(path) > 512
                or not re.fullmatch(r"/[A-Za-z0-9_/]+", path)):
            raise PrimitiveError("unsupported", "Native accessibility identity unavailable")
        if sender not in self.owners:
            assert self.bus is not None and self.gio is not None and self.glib is not None
            owner = []
            for method in ("GetConnectionUnixProcessID", "GetConnectionUnixUser"):
                result = self.bus.call_sync(
                    "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus",
                    method, self.glib.Variant("(s)", (sender,)),
                    self.glib.VariantType.new("(u)"), self.gio.DBusCallFlags.NO_AUTO_START,
                    100, None)
                owner.append(result.unpack()[0])
            self.owners[sender] = owner
        process = self.scope["process"]
        if self.owners[sender] != [process["pid"], process["uid"]]:
            raise PrimitiveError("unsupported", "Accessibility process does not match XRes")
        return [self.bus_id, sender, path, process["pid"], process["uid"],
                process["start_ticks"]]

    def _data(self, node):
        fingerprint, public = super()._data(node)
        public["node_identity"] = seal(self.native_identity(node))
        assert self.api is not None
        public["focused"] = node.get_state_set().contains(self.api.StateType.FOCUSED)
        public["capabilities"] = (["replace_field"]
                                  if "replace_field" in public["capabilities"] else [])
        return fingerprint, public

    def node_identity(self, node):
        return seal(self.native_identity(node))

    def window(self):
        from .x11_app_scope import AppScope
        window = self.scope["window"]
        title = AppScope(self.connection)._metadata(
            self.connection.create_resource_object("window", window))[0]
        return {"id": window, "pid": self.scope["process"]["pid"], "title": title,
                "modal": bool(self.scope["modal"]),
                **dict(zip(("x", "y", "width", "height"),
                           self.scope["window_rect"], strict=True))}

    def capture(self, guard):
        observation_id = secrets.token_urlsafe(18)
        window = self.window()
        nodes, status = self.snapshot(window, observation_id, guard)
        private = {}
        if status == "available":
            for handle, ref in self.references.items():
                private[handle] = {
                    "observation_id": observation_id, "handle": handle,
                    "identity": self.native_identity(ref.node),
                    "root_identity": self.native_identity(ref.root),
                    "fingerprint": seal(ref.fingerprint),
                    "root_fingerprint": seal(ref.root_fingerprint),
                    "lineage": seal(ref.lineage),
                    "metadata": ref.metadata, "window": window,
                    "scope_fingerprint": self.scope["fingerprint"]}
        return nodes, status, private

    def stable(self, guard):
        for ref in self.references.values():
            guard()
            fingerprint, public = self._data(ref.node)
            if (fingerprint != ref.fingerprint or public != ref.metadata
                    or self.lineage(ref.node, ref.root, guard) != ref.lineage):
                raise PrimitiveError("rejected", "Accessibility changed during capture")
        guard()

    def restore(self, saved, guard):
        """Find the same bus object, never substitute an equal-looking field."""
        if (type(saved) is not dict or saved.get("scope_fingerprint")
                != self.scope["fingerprint"] or saved.get("window") != self.window()):
            raise PrimitiveError("rejected", "Stale native accessibility scope")
        _, status, private = self.capture(guard)
        matches = [row for row in private.values() if row["identity"] == saved.get("identity")]
        if status != "available" or len(matches) != 1:
            raise PrimitiveError("unsupported", "Original accessible node unavailable")
        current = matches[0]
        for key in ("root_identity", "fingerprint", "root_fingerprint", "lineage",
                    "metadata", "window"):
            if current[key] != saved.get(key):
                raise PrimitiveError("rejected", "Original accessible node changed")
        ref = self.references[current["handle"]]
        bx, by, bw, bh = (ref.metadata["bounds"][key]
                          for key in ("x", "y", "width", "height"))
        x, y, width, height = self.scope["source_rect"]
        if not (bw > 0 and bh > 0 and x <= bx and y <= by
                and bx + bw <= x + width and by + bh <= y + height):
            raise PrimitiveError("rejected", "Accessible target outside granted source")
        self.references = {saved["handle"]: ref}
        self.observation_id = saved["observation_id"]
        return ref

    def close(self):
        if self.bus is not None:
            self.bus.close_sync(None)


def public_nodes(nodes, origin, rect):
    """Source-local metadata; nodes outside the delivered crop are omitted."""
    result = []
    x, y, width, height = rect
    for node in nodes:
        bounds = node["bounds"]
        bx, by, bw, bh = (bounds[k] for k in ("x", "y", "width", "height"))
        if bw <= 0 or bh <= 0 or not (x <= bx and y <= by and bx + bw <= x + width
                                    and by + bh <= y + height):
            continue
        row = dict(node)
        row["bounds_space"] = "source"
        row["bounds"] = {"x": bx - origin[0], "y": by - origin[1],
                         "width": bw, "height": bh}
        result.append(row)
    return json.loads(json.dumps(result))
