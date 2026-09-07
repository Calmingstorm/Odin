"""Private authenticated GNOME Shell focus evidence for one portal stream.

The operator installs/enables the companion extension explicitly. No ambient
bus/display discovery, Shell Eval, Introspect bypass, or portal identity spoofing.
The caller supplies metadata only from its authenticated portal Start response.
These are fresh observations, not an atomic focus/input or hostile-peer boundary.
Native IDs/process evidence stay private; bounds are source-local logical units.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import secrets
import stat
import time
from pathlib import Path

BUS_NAME = "org.gnome.Shell.Extensions.OdinScope"
OBJECT_PATH = "/org/gnome/Shell/Extensions/OdinScope"
INTERFACE = BUS_NAME
_EXECUTABLES = {
    "gnome-shell": ("/usr/bin/gnome-shell",),
    "xed": ("/usr/bin/xed", "/usr/libexec/xed"),
    "inkscape": ("/usr/bin/inkscape",),
    "writer": ("/usr/lib/libreoffice/program/soffice.bin",),
}
_UNIQUE = re.compile(r"^:[0-9]+\.[0-9]+$")
_OBJECT = re.compile(r"^/(?:[A-Za-z0-9_]+/)*[A-Za-z0-9_]+$")


class WaylandScopeFailure(RuntimeError):  # noqa: N818 - shared scope failure naming
    """Only static reason codes; never disclose native/private evidence."""


def _fail(reason="wayland_scope_unavailable"):
    raise WaylandScopeFailure(reason)


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     allow_nan=False).encode()).hexdigest()


def _trusted_executable(path):
    path = Path(path)
    resolved = path.resolve(strict=True)
    for item in (path, *path.parents, resolved, *resolved.parents):
        info = item.stat()
        if info.st_uid != 0 or info.st_mode & 0o022:
            _fail("wayland_process_identity_untrusted")
    info = resolved.stat()
    if not stat.S_ISREG(info.st_mode):
        _fail("wayland_process_identity_untrusted")
    return str(resolved), (info.st_dev, info.st_ino)


def _process_identity(pid, uid, profile):
    if type(pid) is not int or pid <= 1 or profile not in _EXECUTABLES:
        _fail("wayland_process_identity_unavailable")
    proc = Path("/proc") / str(pid)

    def read():
        fields = (proc / "stat").read_text().rsplit(")", 1)[1].split()
        if len(fields) < 20 or fields[0] in {"Z", "X", "x"}:
            _fail("wayland_process_identity_unavailable")
        start = int(fields[19])
        status = (proc / "status").read_text()
        uids = next(line.split()[1:] for line in status.splitlines()
                    if line.startswith("Uid:"))
        if len(uids) != 4 or any(int(value) != uid for value in uids):
            _fail("wayland_process_identity_untrusted")
        if proc.stat().st_uid != uid:
            _fail("wayland_process_identity_untrusted")
        executable = (proc / "exe").resolve(strict=True)
        info = (proc / "exe").stat()
        return start, str(executable), (info.st_dev, info.st_ino)

    try:
        first = read()
        approved = [_trusted_executable(path) for path in _EXECUTABLES[profile]
                    if Path(path).exists()]
        if (first[1], first[2]) not in approved or first != read():
            _fail("wayland_process_identity_untrusted")
        return {"pid": pid, "uid": uid, "start_ticks": first[0],
                "exe": first[1], "exe_identity": list(first[2])}
    except (OSError, ValueError, IndexError, StopIteration):
        _fail("wayland_process_identity_unavailable")


def _source(source):
    """Validate, copy and bind one authenticated portal monitor stream."""
    if not isinstance(source, dict):
        _fail("wayland_source_unavailable")
    node = source.get("node_id")
    handle = source.get("session_handle")
    if (type(node) is not int or not 0 < node < 2**32
            or type(source.get("source_type")) is not int or source["source_type"] != 1
            or not isinstance(handle, str) or len(handle) > 512
            or not _OBJECT.fullmatch(handle)):
        _fail("wayland_source_unavailable")
    position, size = source.get("position"), source.get("size")
    if (not isinstance(position, (list, tuple)) or len(position) != 2
            or not isinstance(size, (list, tuple)) or len(size) != 2
            or any(type(v) is not int for v in (*position, *size))
            or any(abs(v) > 131072 for v in position)
            or any(not 0 < v <= 32768 for v in size)):
        _fail("wayland_source_geometry_unavailable")
    mapping = source.get("mapping_id", "")
    if not isinstance(mapping, str) or len(mapping) > 512 or "\x00" in mapping:
        _fail("wayland_source_unavailable")
    return {"node_id": node, "session_handle": handle, "source_type": 1,
            "position": list(position), "size": list(size), "mapping_id": mapping}


def _validate_observation(result, challenge, source, source_digest, profile):
    if (not isinstance(result, dict) or result.get("protocol") != 1
            or result.get("challenge") != challenge
            or result.get("source_digest") != source_digest
            or result.get("profile") != profile
            or result.get("native_wayland") is not True
            or result.get("safe_focus") is not True):
        _fail("wayland_focus_unavailable")
    if (type(result.get("pid")) is not int or result["pid"] <= 1
            or type(result.get("focus_serial")) is not int or result["focus_serial"] < 1
            or not isinstance(result.get("focus_token"), str)
            or not re.fullmatch(r"[0-9]+", result["focus_token"])):
        _fail("wayland_focus_unavailable")
    bounds = result.get("bounds")
    if (not isinstance(bounds, dict) or set(bounds) != {"x", "y", "width", "height"}
            or any(type(v) is not int for v in bounds.values())):
        _fail("wayland_bounds_unavailable")
    x, y, width, height = (bounds[k] for k in ("x", "y", "width", "height"))
    if (min(x, y) < 0 or min(width, height) <= 0
            or x + width > source["size"][0] or y + height > source["size"][1]):
        _fail("wayland_bounds_unavailable")
    # Discard all extra reply fields so titles/native geometry cannot propagate.
    return {key: result[key] for key in
            ("pid", "focus_serial", "focus_token", "bounds")}


class GNOMEWaylandScopeProvider:
    """Explicit same-session provider, pinned to an operator-selected Shell PID.

    snapshot metadata MUST originate from the backend's authenticated portal
    session, never from public API arguments. Bounds use portal logical size;
    capture/input adapters must validate their own pixel-to-logical transform.
    Missing extension, owner changes, focus races or unknown geometry fail closed.
    """

    def __init__(self, *, bus_address, expected_uid, expected_compositor_pid=None):
        if (not isinstance(bus_address, str)
                or not re.fullmatch(r"unix:path=/[^,;\s\x00]+", bus_address)
                or type(expected_uid) is not int or expected_uid < 0
                or os.geteuid() not in {0, expected_uid}
                or (expected_compositor_pid is not None and
                    (type(expected_compositor_pid) is not int or expected_compositor_pid <= 1))):
            _fail("wayland_explicit_session_required")
        self.bus_address = bus_address
        self.expected_uid = expected_uid
        self.expected_compositor_pid = expected_compositor_pid
        self._bus = None
        self._pinned = None
        self._lock = asyncio.Lock()

    async def _call(self, destination, path, interface, member, signature="", body=None):
        try:
            from dbus_next import Message, MessageType
            from dbus_next.aio import MessageBus

            if self._bus is None:
                self._bus = await asyncio.wait_for(
                    MessageBus(bus_address=self.bus_address).connect(), 2)
            reply = await asyncio.wait_for(self._bus.call(Message(
                destination=destination, path=path, interface=interface, member=member,
                signature=signature, body=body or [])), 2)
            if reply.message_type != MessageType.METHOD_RETURN:
                _fail()
            if destination.startswith(":") and reply.sender != destination:
                _fail("wayland_provider_owner_changed")
            return reply.body
        except WaylandScopeFailure:
            raise
        except (ImportError, OSError, TimeoutError, ValueError):
            _fail()

    async def _daemon(self, member, name):
        body = await self._call("org.freedesktop.DBus", "/org/freedesktop/DBus",
                                "org.freedesktop.DBus", member, "s", [name])
        if len(body) != 1:
            _fail("wayland_provider_untrusted")
        return body[0]

    async def _authenticate(self):
        owner = await self._daemon("GetNameOwner", BUS_NAME)
        if not isinstance(owner, str) or not _UNIQUE.fullmatch(owner):
            _fail("wayland_provider_untrusted")
        # A lookalike service cannot satisfy both owner equality and native inode.
        if await self._daemon("GetNameOwner", "org.gnome.Shell") != owner:
            _fail("wayland_provider_untrusted")
        pid = await self._daemon("GetConnectionUnixProcessID", owner)
        uid = await self._daemon("GetConnectionUnixUser", owner)
        if (type(pid) is not int or type(uid) is not int
                or (self.expected_compositor_pid is not None and
                    pid != self.expected_compositor_pid) or uid != self.expected_uid):
            _fail("wayland_provider_untrusted")
        identity = _process_identity(pid, uid, "gnome-shell") | {"owner": owner}
        if await self._daemon("GetNameOwner", BUS_NAME) != owner:
            _fail("wayland_provider_owner_changed")
        if self._pinned is not None and identity != self._pinned:
            _fail("wayland_provider_owner_changed")
        self._pinned = identity
        return identity

    async def identity(self):
        async with self._lock:
            try:
                return await asyncio.wait_for(self._identity(), 5)
            except TimeoutError:
                _fail()

    async def _identity(self):
        compositor = await self._authenticate()
        challenge = secrets.token_hex(24)
        body = await self._call(compositor["owner"], OBJECT_PATH, INTERFACE,
                                "Identity", "s", [challenge])
        if len(body) != 1 or not isinstance(body[0], str) or len(body[0]) > 4096:
            _fail("wayland_compositor_identity_unavailable")
        try:
            result = json.loads(body[0])
        except (ValueError, TypeError):
            _fail("wayland_compositor_identity_unavailable")
        if (not isinstance(result, dict) or result.get("challenge") != challenge
                or result.get("native_wayland") is not True
                or result.get("compositor_name") != "gnome-shell"
                or not isinstance(result.get("compositor_version"), str)
                or not re.fullmatch(r"[0-9]+(?:\.[0-9]+)*(?:\.[A-Za-z0-9]+)?",
                                    result["compositor_version"])):
            _fail("wayland_compositor_identity_unavailable")
        backend_class = result.get("backend_class")
        backends = {"MetaBackendNative": "native", "MetaBackendX11": "x11-nested",
                    "MetaBackendX11Nested": "x11-nested"}
        if not isinstance(backend_class, str) or backend_class not in backends:
            _fail("wayland_compositor_backend_unavailable")
        if compositor != await self._authenticate():
            _fail("wayland_provider_owner_changed")
        return compositor | {"compositor_name": "gnome-shell",
                             "compositor_version": result["compositor_version"],
                             "backend_class": backend_class, "backend": backends[backend_class]}

    async def snapshot(self, source_metadata, app_profile):
        if not isinstance(app_profile, str) or app_profile not in {"xed", "inkscape", "writer"}:
            _fail("wayland_application_profile_unavailable")
        source = _source(source_metadata)
        async with self._lock:
            try:
                return await asyncio.wait_for(self._snapshot(source, app_profile), 5)
            except TimeoutError:
                _fail()

    async def _snapshot(self, source, profile):
        started = time.monotonic_ns()
        compositor = await self._identity()
        source_digest = _digest(source)

        async def observe():
            challenge = secrets.token_hex(24)
            request = {"protocol": 1, "challenge": challenge,
                       "source_digest": source_digest, "source": source, "profile": profile}
            body = await self._call(compositor["owner"], OBJECT_PATH, INTERFACE,
                                    "Snapshot", "s", [json.dumps(request)])
            if len(body) != 1 or not isinstance(body[0], str) or len(body[0]) > 8192:
                _fail()
            try:
                observation = json.loads(body[0])
            except (ValueError, TypeError):
                _fail()
            return _validate_observation(observation, challenge, source, source_digest, profile)

        first = await observe()
        application = _process_identity(first["pid"], self.expected_uid, profile)
        second = await observe()
        if first != second:
            _fail("wayland_focus_changed")
        if application != _process_identity(first["pid"], self.expected_uid, profile):
            _fail("wayland_application_changed")
        if compositor != await self._identity():
            _fail("wayland_provider_owner_changed")
        if time.monotonic_ns() - started > 500_000_000:
            _fail("wayland_focus_stale")
        focus_digest = _digest({"application": application, "compositor": compositor,
                                "serial": first["focus_serial"], "token": first["focus_token"]})
        return {"authenticated": True, "native_wayland": True, "safe_focus": True,
                "source_digest": source_digest, "focus_digest": focus_digest,
                "bounds_digest": _digest({"source": source_digest, "focus": focus_digest,
                                          "bounds": first["bounds"]}),
                "bounds": first["bounds"], "application": application,
                "compositor": compositor, "observed_monotonic_ns": time.monotonic_ns()}

    async def close(self):
        async with self._lock:
            if self._bus is not None:
                self._bus.disconnect()
                self._bus = None
            # Do not clear identity pin: a restarted provider needs a new session.
