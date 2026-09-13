"""Authenticated private Hyprland scope evidence, not client-side input authority."""

from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import math
import os
import re
import time
from dataclasses import asdict, dataclass
from typing import NoReturn

from .hyprland_capture import ExplicitOutput
from .hyprland_errors import (
    HyprlandDiagnosticError,
    HyprlandFailureCause,
    HyprlandFailureStage,
    classified_cause,
)
from .hyprland_identity import (
    HyprlandIdentity,
    _proc_start,
    _unique_object,
    connect_peer,
    revalidate,
)
from .wayland_scope import WaylandScopeFailure, _digest, _process_identity

LEASE_NS = 250_000_000
_OUTPUT = re.compile(r"[A-Za-z0-9_.:-]{1,128}")
_TOKEN = re.compile(r"[0-9a-f]{32,128}")
_INSTANCE_ID = re.compile(r"i1-[0-9a-f]{32}\Z")
_CANDIDATE_ID = re.compile(r"c1-[0-9a-f]{32,128}\Z")
_DIGEST = re.compile(r"[0-9a-f]{64}\Z")
_WINDOW_ID = re.compile(r"w1-[0-9a-f]{48}-[0-9a-f]{48}\Z")


class HyprlandScopeFailure(WaylandScopeFailure):  # noqa: N818
    """Static failure vocabulary only."""

    def __init__(self, reason="hyprland_scope_unavailable", *, stage=None, cause=None):
        self.stage = stage or HyprlandFailureStage.READ
        self.cause = cause or HyprlandFailureCause.UNAVAILABLE
        super().__init__(reason)

    @property
    def diagnostic(self):
        return {"stage": self.stage.value, "cause": self.cause.value}


class HyprlandGeometryUnsettled(HyprlandScopeFailure):  # noqa: N818
    """Authenticated identity evidence, never observation or input authority."""

    def __init__(self, *, application, compositor, output):
        super().__init__("window-geometry-unsettled")
        self.application = dict(application)
        self.compositor = dict(compositor)
        self.output = dict(output)


def _fail(reason="hyprland_scope_unavailable", *, stage=None, cause=None) -> NoReturn:
    raise HyprlandScopeFailure(reason, stage=stage, cause=cause)


def _text(value, *, limit=4096):
    if (
        type(value) is not str
        or len(value) > limit
        or "\x00" in value
        or any(0xD800 <= ord(c) <= 0xDFFF for c in value)
    ):
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
    if (
        row.get("version") != 1
        or type(row.get("version")) is not int
        or row.get("locked") is not False
        or row.get("native_wayland") is not True
        or row.get("safe_focus") is not True
        or type(measured) is not int
        or not started_ns <= measured <= now
        or now - measured >= LEASE_NS
        or now - started_ns >= LEASE_NS
        or type(row.get("token")) is not str
        or not _TOKEN.fullmatch(row["token"])
    ):
        _fail("hyprland_scope_unknown_locked_or_stale")
    output, focus = row.get("output"), row.get("focus")
    if type(output) is not dict or type(focus) is not dict or output.get("name") != name:
        _fail("hyprland_scope_reply_invalid")
    scale = output.get("scale")
    if type(scale) not in {int, float}:
        _fail("hyprland_scope_reply_invalid")
    if not isinstance(scale, (int, float)) or not math.isfinite(scale) or not 0 < scale <= 16:
        _fail("hyprland_scope_reply_invalid")
    explicit = ExplicitOutput(
        name=name,
        width=_integer(output, "pixel_width", 1, 16384),
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
    if (
        min(x, y) < 0
        or x + width > explicit.logical_width
        or y + height > explicit.logical_height
        or type(focus.get("modal")) is not bool
    ):
        _fail("hyprland_focus_outside_source")
    token = _text(focus.get("token"), limit=128)
    if not token or any(ord(c) < 33 or ord(c) > 126 for c in token):
        _fail("hyprland_scope_reply_invalid")
    parents = focus.get("parent_tokens")
    if (
        focus.get("parent_chain_verified") is not True
        or type(parents) is not list
        or len(parents) > 32
        or any(
            type(p) is not str
            or not p
            or len(p) > 128
            or any(ord(c) < 33 or ord(c) > 126 for c in p)
            for p in parents
        )
        or len(set(parents)) != len(parents)
        or token in parents
    ):
        _fail("hyprland_parent_chain_unverified")
    lifetime = HyprlandScopeProvider._window_lifetime(row)
    if lifetime and lifetime["window_id"] != token:
        _fail("hyprland_scope_reply_invalid")
    return {
        **lifetime,
        "output": asdict(explicit),
        "bounds": {"x": x, "y": y, "width": width, "height": height},
        "pid": _integer(focus, "pid", 2, 2**31 - 1),
        "uid": _integer(focus, "uid", 0, 2**32 - 1),
        "parent_tokens": parents,
        "serial": _integer(focus, "serial", 1, 2**63 - 1),
        "focus_token": token,
        "wm_class": _text(focus.get("wm_class")),
        "title": _text(focus.get("title")),
        "modal": focus["modal"],
        "native_scope_token": row["token"],
        "observed_monotonic_ns": measured,
    }


def instance_scope_socket(identity: HyprlandIdentity, runtime_dir: str) -> str:
    """Derive the native endpoint name from the pinned compositor incarnation."""
    if (
        not isinstance(identity, HyprlandIdentity)
        or type(runtime_dir) is not str
        or not runtime_dir.startswith("/")
        or "\x00" in runtime_dir
        or any(part in {"", ".", ".."} for part in runtime_dir.split("/")[1:])
    ):
        _fail("hyprland_explicit_session_required")
    process = identity.process
    # The native companion uses the first 16 SHA-256 bytes, hex encoded.  The
    # endpoint therefore identifies an incarnation without putting its PID or
    # start ticks into the filesystem namespace.
    token = hashlib.sha256(
        b"odin-hyprland-instance-v1\0"
        + process.boot_id.encode("ascii")
        + b"\0"
        + str(process.pid).encode("ascii")
        + b"\0"
        + str(process.start_ticks).encode("ascii")
    ).hexdigest()[:32]
    path = f"{runtime_dir}/odin-hyprland-scope-i1-{token}.sock"
    if len(os.fsencode(path)) > 107:
        _fail("hyprland_explicit_session_required")
    return path


def _instance_status(row, identity: HyprlandIdentity) -> None:
    """Only accept the bounded fields emitted by native status()."""
    process = identity.process
    if (
        type(row) is not dict
        or row.get("ok") is not True
        or row.get("version") != 1
        or row.get("scope_protocol_version") != 1
        or not isinstance(row.get("instance_id"), str)
        or not _INSTANCE_ID.fullmatch(row["instance_id"])
        or row.get("compositor_pid") != process.pid
        or row.get("compositor_uid") != process.uid
        or str(row.get("compositor_start_ticks")) != str(process.start_ticks)
        or row.get("boot_id") != process.boot_id
        or type(row.get("companion_build_id")) is not str
        or not re.fullmatch(r"[0-9a-f]{64}", row["companion_build_id"])
    ):
        _fail("hyprland_scope_instance_status_invalid")


def selection_output(name, geometry):
    """Normalize native selection geometry without bool/int coercion."""
    if type(geometry) is not dict or set(geometry) != {
        "x", "y", "width", "height", "pixel_width", "pixel_height", "scale", "transform"
    }:
        _fail("hyprland_scope_selection_invalid")
    scale = geometry["scale"]
    if type(scale) not in {int, float} or not math.isfinite(scale) or not 0 < scale <= 16:
        _fail("hyprland_scope_selection_invalid")
    return ExplicitOutput(
        name=name,
        width=_integer(geometry, "pixel_width", 1, 16384),
        height=_integer(geometry, "pixel_height", 1, 16384),
        transform=_integer(geometry, "transform", 0, 7),
        logical_x=_integer(geometry, "x", -(2**30), 2**30),
        logical_y=_integer(geometry, "y", -(2**30), 2**30),
        logical_width=_integer(geometry, "width", 1, 16384),
        logical_height=_integer(geometry, "height", 1, 16384),
    )


def selection_application(identity):
    """Native selection and snapshot encode the same process differently."""
    if type(identity) is not dict or set(identity) != {
        "pid", "uid", "start_ticks", "executable", "exe_device", "exe_inode"
    }:
        _fail("hyprland_scope_selection_invalid")
    executable = _text(identity["executable"])
    if not executable.startswith("/"):
        _fail("hyprland_scope_selection_invalid")
    return {
        "pid": _integer(identity, "pid", 2, 2**31 - 1),
        "uid": _integer(identity, "uid", 0, 2**32 - 1),
        "start_ticks": _integer(identity, "start_ticks", 1, 2**63 - 1),
        "exe": executable,
        "exe_identity": [
            _integer(identity, "exe_device", 1, 2**64 - 1),
            _integer(identity, "exe_inode", 1, 2**64 - 1),
        ],
    }


def selection_application_matches(identity, measured):
    expected = selection_application(identity)
    return (
        type(measured) is dict
        and all(type(measured.get(k)) is int for k in ("pid", "uid", "start_ticks"))
        and type(measured.get("exe_identity")) is list
        and all(type(v) is int for v in measured["exe_identity"])
        and expected == {key: measured.get(key) for key in expected}
    )


@dataclass(frozen=True)
class HyprlandOwnerHandle:
    """Private exact native ledger identity. Not a grant or receiver receipt."""

    compositor: HyprlandIdentity
    instance_id: str
    plugin_epoch: str
    ledger_id: str
    guardian_pid: int
    guardian_uid: int
    guardian_start_ticks: str
    recovery_pid: int
    recovery_uid: int
    recovery_start_ticks: str


@dataclass(frozen=True)
class HyprlandSelectionProof:
    """Private immutable handoff, with no sockets, providers or live refs.

    The controller supplies owner/host/turn/TTL/one-use authorization. This
    value supplies exact native evidence, never public tool input or output.
    """

    compositor: HyprlandIdentity
    instance_id: str
    candidate_id: str
    output_id: str
    topology_epoch: int
    topology_digest: str
    output: ExplicitOutput
    scale: float
    pid: int
    uid: int
    start_ticks: int
    executable: str
    exe_device: int
    exe_inode: int
    window_id: str = ""
    plugin_epoch: str = ""

    def candidate(self):
        return {
            **({"window_id": self.window_id, "plugin_epoch": self.plugin_epoch}
               if self.window_id else {}),
            "output_id": self.output_id,
            "output_name": self.output.name,
            "topology_digest": self.topology_digest,
            "output": {
                "x": self.output.logical_x, "y": self.output.logical_y,
                "width": self.output.logical_width, "height": self.output.logical_height,
                "pixel_width": self.output.width, "pixel_height": self.output.height,
                "transform": self.output.transform, "scale": self.scale,
            },
            "identity": {
                "pid": self.pid, "uid": self.uid, "start_ticks": self.start_ticks,
                "executable": self.executable, "exe_device": self.exe_device,
                "exe_inode": self.exe_inode,
            },
        }


class HyprlandScopeProvider:
    """Kernel peer/start checks per request; backend pins executable separately."""

    def __init__(self, *, socket_path, expected_uid, expected_compositor_pid):
        if (
            type(expected_uid) is not int
            or expected_uid < 0
            or type(expected_compositor_pid) is not int
            or expected_compositor_pid <= 1
            or os.geteuid() not in {0, expected_uid}
            or type(socket_path) is not str
            or not socket_path.startswith("/")
            or len(os.fsencode(socket_path)) > 107
            or any(ord(c) < 32 for c in socket_path)
        ):
            _fail("hyprland_explicit_session_required")
        self.socket_path, self.expected_uid = socket_path, expected_uid
        self.expected_compositor_pid = expected_compositor_pid
        self._pinned = None
        self._inventory: dict[str, dict] = {}
        self._inventory_epoch = None
        self._inventory_instance = None
        self._attested_identity: HyprlandIdentity | None = None
        self._attested_instance: str | None = None
        self._attested_plugin: str | None = None
        self._selection_imported = False
        self._lock = asyncio.Lock()
        self._closed = False

    @classmethod
    async def from_identity(
        cls, *, identity: HyprlandIdentity, runtime_dir: str
    ) -> HyprlandScopeProvider:
        """Discover only the exact native instance socket and attest its status."""
        if not isinstance(identity, HyprlandIdentity):
            _fail("hyprland_explicit_session_required")
        deadline = time.monotonic() + 0.5
        await revalidate(identity, deadline)
        provider = cls(
            socket_path=instance_scope_socket(identity, runtime_dir),
            expected_uid=identity.process.uid,
            expected_compositor_pid=identity.process.pid,
        )
        try:
            async with provider._lock:
                row = await provider._request({"op": "status"})
                _instance_status(row, identity)
                await revalidate(identity, deadline)
                provider._attested_identity = copy.deepcopy(identity)
                provider._attested_instance = row["instance_id"]
                provider._attested_plugin = row.get("plugin_epoch")
            return provider
        except BaseException:
            await provider.close()
            raise

    def _identity(self):
        value = {
            "pid": self.expected_compositor_pid,
            "uid": self.expected_uid,
            "start_ticks": _proc_start(self.expected_compositor_pid, self.expected_uid),
        }
        if self._pinned is not None and value != self._pinned:
            _fail("hyprland_provider_owner_changed")
        self._pinned = value
        return dict(value)

    async def identity(self):
        async with self._lock:
            await self._request({"op": "status"})
            return self._identity()

    async def attest_identity(self, identity: HyprlandIdentity):
        """Attest a legacy constructed provider before enabling owner recovery."""
        async with self._lock:
            if (not isinstance(identity, HyprlandIdentity)
                    or identity.process.pid != self.expected_compositor_pid
                    or identity.process.uid != self.expected_uid):
                _fail("hyprland_owner_identity_invalid")
            await revalidate(identity, time.monotonic() + 0.5)
            row = await self._request({"op": "status"})
            _instance_status(row, identity)
            self._attested_identity = copy.deepcopy(identity)
            self._attested_instance = row["instance_id"]
            self._attested_plugin = row.get("plugin_epoch")

    def _owner_context(self):
        if (self._attested_identity is None or self._attested_instance is None
                or type(self._attested_plugin) is not str
                or not re.fullmatch(r"[0-9a-f]{48}", self._attested_plugin)):
            _fail("hyprland_owner_protocol_unavailable")
        return self._attested_identity, self._attested_instance, self._attested_plugin

    @staticmethod
    def _owner_reply(row, handle, *, command_id=None):
        _instance_status(row, handle.compositor)
        expected = {
            key: getattr(handle, key) for key in (
                "instance_id", "plugin_epoch", "ledger_id", "guardian_pid", "guardian_uid",
                "guardian_start_ticks", "recovery_pid", "recovery_uid", "recovery_start_ticks",
            )
        }
        if (type(row.get("owner_protocol_version")) is not int
                or row["owner_protocol_version"] != 1
                or any(type(row.get(key)) is not type(value) or row[key] != value
                       for key, value in expected.items())
                or row.get("owner_matched") is not True
                or any(type(row.get(key)) is not bool for key in (
                    "ledger_empty", "release_ack", "revoked", "retired", "unknown_release",
                    "native_resources_retired", "receiver_release_verified"))
                or row["receiver_release_verified"] is not False
                or (row["release_ack"] and (not row["ledger_empty"] or row["unknown_release"]))
                or (row["retired"] and not row["revoked"])
                or (command_id is not None
                    and (row.get("command_id") != command_id or not row["revoked"]))):
            _fail("hyprland_owner_reply_invalid")
        return {**expected, **{key: row[key] for key in (
            "owner_matched", "ledger_empty", "release_ack", "revoked", "retired",
            "unknown_release", "native_resources_retired", "receiver_release_verified",
        )}, "command_id": command_id}

    async def capture_owner(self, guardian):
        """Register before first arm; cancelled registration may be safely queried
        again for the same live guardian and same authenticated recovery process.
        """
        async with self._lock:
            identity, instance, plugin = self._owner_context()
            if (type(guardian) is not dict or any(type(guardian.get(k)) is not int
                                                for k in ("pid", "uid", "start_ticks"))
                    or guardian["pid"] <= 1 or guardian["uid"] != identity.process.uid
                    or guardian["start_ticks"] <= 0):
                _fail("hyprland_owner_identity_invalid")
            if _proc_start(guardian["pid"], guardian["uid"]) != guardian["start_ticks"]:
                _fail("hyprland_owner_identity_invalid")
            await revalidate(identity, time.monotonic() + 0.5)
            recovery_pid, recovery_uid = os.getpid(), os.geteuid()
            recovery_start = str(_proc_start(recovery_pid, recovery_uid))
            row = await self._request({
                "op": "owner_capture", "instance_id": instance, "plugin_epoch": plugin,
                "guardian_pid": guardian["pid"], "guardian_uid": guardian["uid"],
                "guardian_start_ticks": str(guardian["start_ticks"]),
            })
            ledger = row.get("ledger_id")
            if type(ledger) is not str or not re.fullmatch(r"[0-9a-f]{48}", ledger):
                _fail("hyprland_owner_reply_invalid")
            handle = HyprlandOwnerHandle(
                copy.deepcopy(identity), instance, plugin, ledger, guardian["pid"],
                guardian["uid"], str(guardian["start_ticks"]), recovery_pid,
                recovery_uid, recovery_start,
            )
            self._owner_reply(row, handle)
            if row["revoked"] or row["unknown_release"] or not row["ledger_empty"]:
                _fail("hyprland_owner_capture_late_or_retired")
            await revalidate(identity, time.monotonic() + 0.5)
            return handle

    async def _owner_operation(self, handle, operation, command_id):
        async with self._lock:
            identity, instance, plugin = self._owner_context()
            if (type(handle) is not HyprlandOwnerHandle or handle.compositor != identity
                    or handle.instance_id != instance or handle.plugin_epoch != plugin
                    or type(command_id) is not str
                    or not re.fullmatch(r"[A-Za-z0-9-]{1,128}", command_id)
                    or handle.recovery_pid != os.getpid() or handle.recovery_uid != os.geteuid()
                    or handle.recovery_start_ticks != str(_proc_start(os.getpid(), os.geteuid()))):
                _fail("hyprland_owner_identity_invalid")
            await revalidate(identity, time.monotonic() + 0.5)
            # Cancellation is unknown locally. Native keeps the once-only result;
            # retrying this exact handle cannot re-arm or repeat a release.
            row = await self._request({
                "op": operation, "instance_id": instance, "plugin_epoch": plugin,
                "ledger_id": handle.ledger_id, "command_id": command_id,
            })
            result = self._owner_reply(row, handle, command_id=command_id)
            await revalidate(identity, time.monotonic() + 0.5)
            return result

    async def reconcile_owner(self, handle, *, command_id):
        return await self._owner_operation(handle, "owner_reconcile", command_id)

    async def retire_owner(self, handle, *, command_id):
        return await self._owner_operation(handle, "owner_retire", command_id)

    async def owner_status(self, handle, *, command_id):
        """Query a recorded transaction after lost acknowledgement, no mutation."""
        return await self._owner_operation(handle, "owner_status", command_id)

    async def _request(self, request):
        if self._closed:
            _fail("hyprland_scope_closed")
        connection = None
        try:
            before = self._identity()
            deadline = time.monotonic() + 0.24
            connection = await connect_peer(
                self.socket_path, self.expected_compositor_pid, self.expected_uid, deadline
            )
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
                request.get("op") == "snapshot"
                and row.get("ok") is False
                and row.get("error") == "window-geometry-unsettled"
            ):
                _fail()
            return row
        except HyprlandScopeFailure:
            raise
        except HyprlandDiagnosticError as exc:
            _fail(stage=exc.stage, cause=exc.cause)
        except (OSError, TimeoutError) as exc:
            _fail(stage=HyprlandFailureStage.READ, cause=classified_cause(exc))
        except (RuntimeError, ValueError, UnicodeError, RecursionError, IndexError, StopIteration):
            _fail(stage=HyprlandFailureStage.PARSE, cause=HyprlandFailureCause.INVALID)
        finally:
            if connection is not None:
                connection.close()

    def _unsettled(self, row, name, started):
        """Validate a narrow negative result without manufacturing a scope token."""
        now = time.monotonic_ns()
        measured = row.get("measured_monotonic_ns")
        if (
            row.get("ok") is not False
            or row.get("error") != "window-geometry-unsettled"
            or type(row.get("version")) is not int
            or row["version"] != 1
            or row.get("locked") is not False
            or row.get("native_wayland") is not True
            or "token" in row
            or "safe_focus" in row
            or type(measured) is not int
            or not started <= measured <= now
            or now - measured >= LEASE_NS
            or now - started >= LEASE_NS
        ):
            _fail("hyprland_scope_unknown_locked_or_stale")
        output, focus = row.get("output"), row.get("focus")
        if (
            type(output) is not dict
            or set(output)
            != {
                "name",
                "x",
                "y",
                "width",
                "height",
                "pixel_width",
                "pixel_height",
                "scale",
                "transform",
            }
            or output.get("name") != name
            or type(focus) is not dict
            or set(focus) != {"pid", "uid", "wm_class", "parent_chain_verified"}
            or focus.get("parent_chain_verified") is not True
        ):
            _fail("hyprland_scope_reply_invalid")
        scale = output.get("scale")
        if type(scale) not in {int, float}:
            _fail("hyprland_scope_reply_invalid")
        if not isinstance(scale, (int, float)) or not math.isfinite(scale) or not 0 < scale <= 16:
            _fail("hyprland_scope_reply_invalid")
        explicit = ExplicitOutput(
            name=name,
            width=_integer(output, "pixel_width", 1, 16384),
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
            application=application, compositor=compositor, output=asdict(explicit)
        )

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
            if (getattr(self, "_attested_plugin", None) is not None
                    and first.get("plugin_epoch") != self._attested_plugin):
                _fail("hyprland_scope_plugin_incarnation_changed")
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
            focus_digest = _digest(
                {
                    "application": application,
                    "compositor": compositor,
                    "serial": first["serial"],
                    "token": first["focus_token"],
                    "wm_class": first["wm_class"],
                    "uid": first["uid"],
                    "parents": first["parent_tokens"],
                    "modal": first["modal"],
                }
            )
            return {
                "authenticated": True,
                "native_wayland": True,
                "safe_focus": True,
                "locked": False,
                "output": first["output"],
                "source_digest": source_digest,
                "focus_digest": focus_digest,
                "bounds_digest": _digest(
                    {"source": source_digest, "focus": focus_digest, "bounds": first["bounds"]}
                ),
                "bounds": first["bounds"],
                "application": application,
                "surface_token": first["focus_token"],
                "plugin_epoch": first.get("plugin_epoch"),
                "parent_tokens": first["parent_tokens"],
                "parent_chain_verified": True,
                "wm_class": first["wm_class"],
                "compositor": compositor,
                "modal": first["modal"],
                "modal_kind": "safe_application" if first["modal"] else None,
                "modal_title_digest": (
                    hashlib.sha256(first["title"].encode()).hexdigest() if first["modal"] else None
                ),
                "native_scope_token": first["native_scope_token"],
                "native_scope_serial": first["serial"],
                "observed_monotonic_ns": first["observed_monotonic_ns"],
            }

    async def inventory_targets(self):
        """Read native candidates only. This never captures or creates input."""
        async with self._lock:
            row = await self._request({"op": "inventory_targets"})
            if (
                set(row)
                != {
                    "ok",
                    "version",
                    "instance_id",
                    "topology_epoch",
                    "topology_digest",
                    "candidates",
                }
                or row.get("ok") is not True
                or row.get("version") != 1
                or type(row.get("instance_id")) is not str
                or not _INSTANCE_ID.fullmatch(row["instance_id"])
                or type(row.get("topology_epoch")) is not int
                or row["topology_epoch"] < 1
                or type(row.get("topology_digest")) is not str
                or not _DIGEST.fullmatch(row["topology_digest"])
                or type(row.get("candidates")) is not list
                or len(row["candidates"]) > 128
            ):
                _fail("hyprland_scope_selection_invalid")
            # Native candidate IDs are one-shot authority. Never retain an old
            # cache when a new inventory succeeds.
            if (
                getattr(self, "_attested_instance", None) is not None
                and row["instance_id"] != self._attested_instance
            ):
                _fail("hyprland_scope_selection_invalid")
            candidate_ids, private, public = set(), {}, []
            for item in row["candidates"]:
                if type(item) is not dict or set(item) - {"window_id", "plugin_epoch"} != {
                    "id",
                    "label",
                    "output_id",
                    "output_name",
                    "topology_digest",
                    "output",
                    "identity",
                }:
                    _fail("hyprland_scope_selection_invalid")
                candidate_id, label, output_id, output_name, digest, output, identity = (
                    item.get("id"),
                    item.get("label"),
                    item.get("output_id"),
                    item.get("output_name"),
                    item.get("topology_digest"),
                    item.get("output"),
                    item.get("identity"),
                )
                if (
                    type(candidate_id) is not str
                    or not _CANDIDATE_ID.fullmatch(candidate_id)
                    or type(label) is not str
                    or not label
                    or len(label) > 256
                    or "\x00" in label
                    or type(output_id) is not str
                    or not _OUTPUT.fullmatch(output_id)
                    or type(output_name) is not str
                    or not _OUTPUT.fullmatch(output_name)
                    or type(digest) is not str
                    or not _DIGEST.fullmatch(digest)
                    or type(output) is not dict
                    or set(output)
                    != {
                        "x",
                        "y",
                        "width",
                        "height",
                        "pixel_width",
                        "pixel_height",
                        "scale",
                        "transform",
                    }
                    or type(identity) is not dict
                    or set(identity)
                    != {"pid", "uid", "start_ticks", "executable", "exe_device", "exe_inode"}
                    or type(identity.get("pid")) is not int
                    or identity["pid"] < 2
                    or type(identity.get("uid")) is not int
                    or identity["uid"] != self.expected_uid
                    or type(identity.get("start_ticks")) is not int
                    or identity["start_ticks"] < 1
                    or type(identity.get("executable")) is not str
                    or not identity["executable"]
                    or len(identity["executable"]) > 4096
                    or "\x00" in identity["executable"]
                    or type(identity.get("exe_device")) is not int
                    or identity["exe_device"] < 1
                    or type(identity.get("exe_inode")) is not int
                    or identity["exe_inode"] < 1
                    or candidate_id in candidate_ids
                ):
                    _fail("hyprland_scope_selection_invalid")
                candidate_ids.add(candidate_id)
                selection_output(output_name, output)
                selection_application(identity)
                lifetime = self._window_lifetime(item)
                if (getattr(self, "_attested_plugin", None) is not None
                        and lifetime.get("plugin_epoch") != self._attested_plugin):
                    _fail("hyprland_scope_plugin_incarnation_changed")
                public.append({"id": candidate_id, "label": label, "output_id": output_id})
                private[candidate_id] = {
                    **lifetime,
                    "output_id": output_id,
                    "output_name": output_name,
                    "topology_digest": digest,
                    "output": copy.deepcopy(output),
                    "identity": copy.deepcopy(identity),
                }
            self._inventory = private
            self._inventory_epoch, self._inventory_instance = (
                row["topology_epoch"],
                row["instance_id"],
            )
            return {
                "version": 1,
                "instance_id": row["instance_id"],
                "candidate_epoch": row["topology_epoch"],
                "candidates": public,
            }

    def export_selection_proof(self, candidate_id):
        """Export only evidence from this attested, still-open inventory."""
        candidate = self._inventory.get(candidate_id)
        if (
            self._closed or candidate is None or self._attested_identity is None
            or self._attested_instance != self._inventory_instance
            or type(self._inventory_instance) is not str
            or self._inventory_epoch is None
        ):
            _fail("hyprland_scope_selection_invalid")
        native = candidate["identity"]
        if not selection_application_matches(
            native, _process_identity(native["pid"], native["uid"])
        ):
            _fail("hyprland_scope_selection_invalid")
        return HyprlandSelectionProof(
            compositor=copy.deepcopy(self._attested_identity),
            instance_id=self._inventory_instance,
            candidate_id=candidate_id,
            output_id=candidate["output_id"],
            topology_epoch=self._inventory_epoch,
            topology_digest=candidate["topology_digest"],
            output=selection_output(candidate["output_name"], candidate["output"]),
            scale=float(candidate["output"]["scale"]),
            window_id=candidate.get("window_id", ""),
            plugin_epoch=candidate.get("plugin_epoch", ""),
            **copy.deepcopy(native),
        )

    def import_selection_proof(self, proof):
        """Import the original candidate, never refresh or reselect a substitute."""
        if (
            type(proof) is not HyprlandSelectionProof or self._closed
            or self._selection_imported or self._inventory
            or proof.compositor != self._attested_identity
            or proof.instance_id != self._attested_instance
            or type(proof.candidate_id) is not str
            or not _CANDIDATE_ID.fullmatch(proof.candidate_id)
            or type(proof.output_id) is not str or not _OUTPUT.fullmatch(proof.output_id)
            or type(proof.topology_epoch) is not int or proof.topology_epoch < 1
            or type(proof.topology_digest) is not str
            or not _DIGEST.fullmatch(proof.topology_digest)
            or type(proof.output) is not ExplicitOutput
        ):
            _fail("hyprland_scope_selection_invalid")
        candidate = proof.candidate()
        lifetime = self._window_lifetime(candidate)
        if (getattr(self, "_attested_plugin", None) is not None
                and lifetime.get("plugin_epoch") != self._attested_plugin):
            _fail("hyprland_scope_plugin_incarnation_changed")
        selection_output(candidate["output_name"], candidate["output"])
        application = selection_application(candidate["identity"])
        if (
            application["uid"] != self.expected_uid
            or not selection_application_matches(
                candidate["identity"], _process_identity(application["pid"], application["uid"])
            )
        ):
            _fail("hyprland_scope_selection_invalid")
        self._selection_imported = True
        self._inventory = {proof.candidate_id: candidate}
        self._inventory_epoch = proof.topology_epoch
        self._inventory_instance = proof.instance_id

    async def focus_candidate(self, *, candidate_id, output_id, topology_epoch):
        if (
            type(candidate_id) is not str
            or not _CANDIDATE_ID.fullmatch(candidate_id)
            or type(output_id) is not str
            or not _OUTPUT.fullmatch(output_id)
            or type(topology_epoch) is not int
            or topology_epoch < 1
        ):
            _fail("hyprland_scope_selection_invalid")
        async with self._lock:
            candidate = self._inventory.get(candidate_id)
            if (
                candidate is None
                or self._inventory_epoch != topology_epoch
                or self._inventory_instance is None
                or candidate["output_id"] != output_id
            ):
                _fail("hyprland_scope_selection_invalid")
            requested = candidate["identity"]
            # Ambiguous/cancelled focus is not replayable, even on this provider.
            self._inventory = {}
            row = await self._request(
                {
                    "op": "focus_candidate",
                    "candidate_id": candidate_id,
                    "output_id": output_id,
                    "topology_epoch": topology_epoch,
                    "requested_identity": {
                        "executable": requested["executable"],
                        "start_ticks": requested["start_ticks"],
                    },
                }
            )
            if (
                set(row) - {"window_id", "plugin_epoch"}
                != {
                    "ok",
                    "version",
                    "instance_id",
                    "candidate_id",
                    "output_id",
                    "output_name",
                    "topology_epoch",
                    "topology_digest",
                    "output",
                    "identity",
                }
                or row.get("ok") is not True
                or row.get("version") != 1
                or type(row.get("instance_id")) is not str
                or not _INSTANCE_ID.fullmatch(row["instance_id"])
                or row.get("instance_id") != self._inventory_instance
                or row.get("candidate_id") != candidate_id
                or row.get("output_id") != output_id
                or row.get("topology_epoch") != topology_epoch
                or row.get("output_name") != candidate["output_name"]
                or row.get("topology_digest") != candidate["topology_digest"]
                or row.get("output") != candidate["output"]
            ):
                _fail("hyprland_scope_selection_invalid")
            identity = row.get("identity")
            selection_output(row["output_name"], row["output"])
            selection_application(identity)
            if identity != requested:
                _fail("hyprland_scope_selection_invalid")
            lifetime = self._window_lifetime(row)
            if lifetime != self._window_lifetime(candidate):
                _fail("hyprland_scope_selection_invalid")
            return {
                **lifetime,
                "id": candidate_id,
                "instance_id": row["instance_id"],
                "output_id": output_id,
                "output_name": row["output_name"],
                "topology_epoch": topology_epoch,
                "topology_digest": row["topology_digest"],
                "output": row["output"],
                "identity": identity,
            }

    @staticmethod
    def _window_lifetime(row):
        if "window_id" not in row and "plugin_epoch" not in row:
            return {}  # old companion may select initially, but cannot recover
        window, plugin = row.get("window_id"), row.get("plugin_epoch")
        if (type(window) is not str or not _WINDOW_ID.fullmatch(window)
                or type(plugin) is not str or not re.fullmatch(r"[0-9a-f]{48}", plugin)
                or not window.startswith("w1-" + plugin + "-")):
            _fail("hyprland_scope_selection_invalid")
        return {"window_id": window, "plugin_epoch": plugin}

    async def focus_bound_candidate(self, binding, *, allow_output_handoff=False):
        """Recover exact live toplevel only. Process/title/output is not continuity."""
        if type(binding) is not dict or set(binding) - {"window_id", "plugin_epoch"} != {
            "id",
            "instance_id",
            "output_id",
            "output_name",
            "topology_epoch",
            "topology_digest",
            "output",
            "identity",
        }:
            _fail("hyprland_scope_selection_invalid")
        lifetime = self._window_lifetime(binding)
        if not lifetime:
            _fail("hyprland_scope_window_continuity_unavailable")
        # Native focus consumes its candidate map. Fresh inventory gives us a
        # fresh opaque output ID and requires the exact process/output proof.
        await self.inventory_targets()
        if self._inventory_instance != binding["instance_id"]:
            _fail("hyprland_scope_selection_invalid")
        for candidate_id, candidate in self._inventory.items():
            if (
                self._window_lifetime(candidate) == lifetime
                and (allow_output_handoff or (
                    candidate["output_name"] == binding["output_name"]
                    and candidate["output"] == binding["output"]))
                and candidate["identity"] == binding["identity"]
            ):
                return await self.focus_candidate(
                    candidate_id=candidate_id,
                    output_id=candidate["output_id"],
                    topology_epoch=self._inventory_epoch,
                )
        _fail("hyprland_scope_selection_invalid")

    async def release_all(self):
        """Explicit operator recovery. Plugin acknowledgement is not receiver proof."""
        async with self._lock:
            row = await self._request({"op": "release_all"})
            return {
                "release_submitted": row.get("release_submitted") is True,
                "release_ack": row.get("release_acknowledged") is True,
                "receiver_release_verified": False,
            }

    async def close(self):
        async with self._lock:
            self._closed = True
            self._inventory = {}


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
            measure_process, args.pid, args.uid, trust, time.monotonic() + 3
        )
        provider = HyprlandScopeProvider(
            socket_path=args.socket, expected_uid=args.uid, expected_compositor_pid=args.pid
        )
        try:
            receipt = await provider.release_all()
            after = await asyncio.to_thread(
                measure_process, args.pid, args.uid, trust, time.monotonic() + 3
            )
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
