"""Authenticated private Hyprland scope evidence, not client-side input authority."""
from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
import re
import time
from dataclasses import asdict

from .hyprland_capture import ExplicitOutput
from .hyprland_identity import _proc_start, _unique_object, connect_peer
from .wayland_scope import WaylandScopeFailure, _digest, _process_identity

LEASE_NS = 250_000_000
_OUTPUT = re.compile(r"[A-Za-z0-9_.:-]{1,128}")
_TOKEN = re.compile(r"[0-9a-f]{32,128}")


class HyprlandScopeFailure(WaylandScopeFailure):  # noqa: N818
    """Static failure vocabulary only."""


class HyprlandGeometryUnsettled(HyprlandScopeFailure):  # noqa: N818
    """Authenticated identity evidence, never observation or input authority."""

    def __init__(self, *, application, compositor, output):
        super().__init__("window-geometry-unsettled")
        self.application = dict(application)
        self.compositor = dict(compositor)
        self.output = dict(output)


def _fail(reason="hyprland_scope_unavailable"):
    raise HyprlandScopeFailure(reason)


def _text(value, *, limit=4096):
    if (type(value) is not str or len(value) > limit or "\x00" in value
            or any(0xD800 <= ord(c) <= 0xDFFF for c in value)):
        _fail("hyprland_scope_reply_invalid")
    return value


def _integer(row, key, lower, upper):
    value = row.get(key)
    if type(value) is not int or not lower <= value <= upper:
        _fail("hyprland_scope_reply_invalid")
    return value


def _observation(row, name, started_ns):
    now = time.monotonic_ns()
    measured = row.get("measured_monotonic_ns")
    if (row.get("version") != 1 or type(row.get("version")) is not int
            or row.get("locked") is not False
            or row.get("native_wayland") is not True or row.get("safe_focus") is not True
            or type(measured) is not int or not started_ns <= measured <= now
            or now - measured >= LEASE_NS or now - started_ns >= LEASE_NS
            or type(row.get("token")) is not str or not _TOKEN.fullmatch(row["token"])):
        _fail("hyprland_scope_unknown_locked_or_stale")
    output, focus = row.get("output"), row.get("focus")
    if type(output) is not dict or type(focus) is not dict or output.get("name") != name:
        _fail("hyprland_scope_reply_invalid")
    scale = output.get("scale")
    if type(scale) not in {int, float} or not math.isfinite(scale) or not 0 < scale <= 16:
        _fail("hyprland_scope_reply_invalid")
    explicit = ExplicitOutput(
        name=name, width=_integer(output, "pixel_width", 1, 16384),
        height=_integer(output, "pixel_height", 1, 16384),
        transform=_integer(output, "transform", 0, 7),
        logical_x=_integer(output, "x", -(2**30), 2**30),
        logical_y=_integer(output, "y", -(2**30), 2**30),
        logical_width=_integer(output, "width", 1, 16384),
        logical_height=_integer(output, "height", 1, 16384),
    )
    x = _integer(focus, "x", -(2**30), 2**30) - explicit.logical_x
    y = _integer(focus, "y", -(2**30), 2**30) - explicit.logical_y
    width = _integer(focus, "width", 1, 16384)
    height = _integer(focus, "height", 1, 16384)
    if (min(x, y) < 0 or x + width > explicit.logical_width
            or y + height > explicit.logical_height or type(focus.get("modal")) is not bool):
        _fail("hyprland_focus_outside_source")
    token = _text(focus.get("token"), limit=128)
    if not token or any(ord(c) < 33 or ord(c) > 126 for c in token):
        _fail("hyprland_scope_reply_invalid")
    parents = focus.get("parent_tokens")
    if (focus.get("parent_chain_verified") is not True or type(parents) is not list
            or len(parents) > 32
            or any(type(p) is not str or not p or len(p) > 128
                   or any(ord(c) < 33 or ord(c) > 126 for c in p) for p in parents)
            or len(set(parents)) != len(parents) or token in parents):
        _fail("hyprland_parent_chain_unverified")
    return {
        "output": asdict(explicit), "bounds": {"x": x, "y": y, "width": width, "height": height},
        "pid": _integer(focus, "pid", 2, 2**31 - 1),
        "uid": _integer(focus, "uid", 0, 2**32 - 1),
        "parent_tokens": parents,
        "serial": _integer(focus, "serial", 1, 2**63 - 1),
        "focus_token": token, "wm_class": _text(focus.get("wm_class")),
        "title": _text(focus.get("title")), "modal": focus["modal"],
        "native_scope_token": row["token"], "observed_monotonic_ns": measured,
    }


class HyprlandScopeProvider:
    """Kernel peer/start checks per request; backend pins executable separately."""

    def __init__(self, *, socket_path, expected_uid, expected_compositor_pid):
        if (type(expected_uid) is not int or expected_uid < 0
                or type(expected_compositor_pid) is not int or expected_compositor_pid <= 1
                or os.geteuid() not in {0, expected_uid}
                or type(socket_path) is not str or not socket_path.startswith("/")
                or len(os.fsencode(socket_path)) > 107
                or any(ord(c) < 32 for c in socket_path)):
            _fail("hyprland_explicit_session_required")
        self.socket_path, self.expected_uid = socket_path, expected_uid
        self.expected_compositor_pid = expected_compositor_pid
        self._pinned = None
        self._lock = asyncio.Lock()
        self._closed = False

    def _identity(self):
        value = {"pid": self.expected_compositor_pid, "uid": self.expected_uid,
                 "start_ticks": _proc_start(self.expected_compositor_pid, self.expected_uid)}
        if self._pinned is not None and value != self._pinned:
            _fail("hyprland_provider_owner_changed")
        self._pinned = value
        return dict(value)

    async def identity(self):
        async with self._lock:
            await self._request({"op": "status"})
            return self._identity()

    async def _request(self, request):
        if self._closed:
            _fail("hyprland_scope_closed")
        connection = None
        try:
            before = self._identity()
            deadline = time.monotonic() + 0.24
            connection = await connect_peer(
                self.socket_path, self.expected_compositor_pid, self.expected_uid, deadline)
            loop = asyncio.get_running_loop()
            async with asyncio.timeout_at(deadline):
                await loop.sock_sendall(connection, json.dumps(request).encode("ascii") + b"\n")
                data = bytearray()
                while b"\n" not in data:
                    chunk = await loop.sock_recv(connection, 4096)
                    if not chunk or len(data) + len(chunk) > 16384:
                        _fail("hyprland_scope_reply_invalid")
                    data.extend(chunk)
                if data.count(b"\n") != 1 or not data.endswith(b"\n"):
                    _fail("hyprland_scope_reply_invalid")
                row = json.loads(data, object_pairs_hook=_unique_object)
                if type(row) is not dict:
                    _fail()
            if self._identity() != before:
                _fail("hyprland_provider_owner_changed")
            if row.get("ok") is not True and not (
                    request.get("op") == "snapshot" and row.get("ok") is False
                    and row.get("error") == "window-geometry-unsettled"):
                _fail()
            return row
        except HyprlandScopeFailure:
            raise
        except (OSError, RuntimeError, ValueError, TimeoutError, UnicodeError, RecursionError,
                IndexError, StopIteration):
            _fail()
        finally:
            if connection is not None:
                connection.close()

    def _unsettled(self, row, name, started):
        """Validate a narrow negative result without manufacturing a scope token."""
        now = time.monotonic_ns()
        measured = row.get("measured_monotonic_ns")
        if (row.get("ok") is not False or row.get("error") != "window-geometry-unsettled"
                or type(row.get("version")) is not int or row["version"] != 1
                or row.get("locked") is not False or row.get("native_wayland") is not True
                or "token" in row or "safe_focus" in row
                or type(measured) is not int or not started <= measured <= now
                or now - measured >= LEASE_NS or now - started >= LEASE_NS):
            _fail("hyprland_scope_unknown_locked_or_stale")
        output, focus = row.get("output"), row.get("focus")
        if (type(output) is not dict or set(output) != {
                "name", "x", "y", "width", "height", "pixel_width", "pixel_height",
                "scale", "transform"} or output.get("name") != name
                or type(focus) is not dict or set(focus) != {
                    "pid", "uid", "wm_class", "parent_chain_verified"}
                or focus.get("parent_chain_verified") is not True):
            _fail("hyprland_scope_reply_invalid")
        scale = output.get("scale")
        if type(scale) not in {int, float} or not math.isfinite(scale) or not 0 < scale <= 16:
            _fail("hyprland_scope_reply_invalid")
        explicit = ExplicitOutput(
            name=name, width=_integer(output, "pixel_width", 1, 16384),
            height=_integer(output, "pixel_height", 1, 16384),
            transform=_integer(output, "transform", 0, 7),
            logical_x=_integer(output, "x", -(2**30), 2**30),
            logical_y=_integer(output, "y", -(2**30), 2**30),
            logical_width=_integer(output, "width", 1, 16384),
            logical_height=_integer(output, "height", 1, 16384),
        )
        pid = _integer(focus, "pid", 2, 2**31 - 1)
        uid = _integer(focus, "uid", 0, 2**32 - 1)
        if uid != self.expected_uid or not _text(focus.get("wm_class")):
            _fail("hyprland_application_identity_unavailable")
        try:
            application = _process_identity(pid, uid)
        except (OSError, RuntimeError, ValueError, IndexError, StopIteration):
            _fail("hyprland_application_identity_unavailable")
        compositor = self._identity()
        if time.monotonic_ns() - started >= LEASE_NS:
            _fail("hyprland_scope_unknown_locked_or_stale")
        raise HyprlandGeometryUnsettled(
            application=application, compositor=compositor, output=asdict(explicit))

    async def snapshot(self, source_metadata):
        if type(source_metadata) is not dict:
            _fail("hyprland_explicit_output_required")
        name = source_metadata.get("mapping_id")
        if type(name) is not str or not _OUTPUT.fullmatch(name):
            _fail("hyprland_explicit_output_required")
        async with self._lock:
            started = time.monotonic_ns()
            row = await self._request({"op": "snapshot", "output_name": name})
            if row.get("ok") is False:
                self._unsettled(row, name, started)
            first = _observation(row, name, started)
            if first["uid"] != self.expected_uid:
                _fail("hyprland_application_identity_unavailable")
            try:
                application = _process_identity(first["pid"], self.expected_uid)
            except (OSError, RuntimeError, ValueError, IndexError, StopIteration):
                _fail("hyprland_application_identity_unavailable")
            compositor = self._identity()
            if time.monotonic_ns() - started >= LEASE_NS:
                _fail("hyprland_scope_unknown_locked_or_stale")
            source_digest = _digest(first["output"])
            focus_digest = _digest({
                "application": application, "compositor": compositor, "serial": first["serial"],
                "token": first["focus_token"], "wm_class": first["wm_class"],
                "uid": first["uid"], "parents": first["parent_tokens"], "modal": first["modal"]})
            return {
                "authenticated": True, "native_wayland": True, "safe_focus": True,
                "locked": False, "output": first["output"],
                "source_digest": source_digest, "focus_digest": focus_digest,
                "bounds_digest": _digest({
                    "source": source_digest, "focus": focus_digest, "bounds": first["bounds"]}),
                "bounds": first["bounds"], "application": application,
                "surface_token": first["focus_token"],
                "parent_tokens": first["parent_tokens"], "parent_chain_verified": True,
                "wm_class": first["wm_class"], "compositor": compositor,
                "modal": first["modal"],
                "modal_kind": "safe_application" if first["modal"] else None,
                "modal_title_digest": (
                    hashlib.sha256(first["title"].encode()).hexdigest()
                    if first["modal"] else None),
                "native_scope_token": first["native_scope_token"],
                "native_scope_serial": first["serial"],
                "observed_monotonic_ns": first["observed_monotonic_ns"],
            }

    async def release_all(self):
        """Explicit operator recovery. Plugin acknowledgement is not receiver proof."""
        async with self._lock:
            row = await self._request({"op": "release_all"})
            return {"release_submitted": row.get("release_submitted") is True,
                    "release_ack": row.get("release_acknowledged") is True,
                    "receiver_release_verified": False}

    async def close(self):
        async with self._lock:
            self._closed = True


HyprlandScopeClient = HyprlandScopeProvider


def main():
    """Explicit operator recovery, including after the runtime lost its guardian.

    Invoke as ``python -m src.computer.runtime.hyprland_scope --release-all ...``.
    No loaded-plugin inference, activation, config write or automatic retry.
    """
    import argparse

    from .hyprland_identity import ExecutableTrust, measure_process

    parser = argparse.ArgumentParser(description="Recover tracked Odin Hyprland input")
    parser.add_argument("--release-all", action="store_true", required=True)
    parser.add_argument("--socket", required=True)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--uid", type=int, required=True)
    parser.add_argument("--executable", required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--commit", required=True)
    args = parser.parse_args()

    async def recover():
        trust = ExecutableTrust(args.executable, args.sha256, args.version, args.commit)
        before = await asyncio.to_thread(
            measure_process, args.pid, args.uid, trust, time.monotonic() + 3)
        provider = HyprlandScopeProvider(
            socket_path=args.socket, expected_uid=args.uid, expected_compositor_pid=args.pid)
        try:
            receipt = await provider.release_all()
            after = await asyncio.to_thread(
                measure_process, args.pid, args.uid, trust, time.monotonic() + 3)
            if after != before:
                _fail("hyprland_provider_owner_changed")
            print(json.dumps(receipt, sort_keys=True))
            return 0 if receipt["release_ack"] else 2
        finally:
            await provider.close()

    try:
        return asyncio.run(recover())
    except (OSError, RuntimeError, ValueError):
        # Never print arbitrary native reply text, scope tokens, paths or titles.
        print('{"error":"hyprland_recovery_unconfirmed","receiver_release_verified":false}')
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
