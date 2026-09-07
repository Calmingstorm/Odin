"""Explicit-bus consent and timestamp-verified PipeWire transport.

GI is optional in the service interpreter: an inert system-Python helper owns
an isolated GLib context. Only open() contacts a bus or requests consent. This
module never accepts consent on the user's behalf.
"""
from __future__ import annotations

import array
import asyncio
import concurrent.futures
import copy
import inspect
import json
import math
import os
import pwd
import queue
import socket
import struct
import subprocess
import sys
import threading
import time
import uuid
import zlib
from pathlib import Path

DEST = "org.freedesktop.portal.Desktop"
PATH = "/org/freedesktop/portal/desktop"
RD = "org.freedesktop.portal.RemoteDesktop"
SC = "org.freedesktop.portal.ScreenCast"
REQUEST = "org.freedesktop.portal.Request"
SESSION = "org.freedesktop.portal.Session"
MAX_BYTES = 128 * 1024 * 1024
MAX_PIXELS = 32 * 1024 * 1024


class PortalError(RuntimeError):
    """Consent, identity, freshness, or transport failed closed."""


def _process_identity(pid):
    stat = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
    return {"pid": pid, "start_ticks": int(stat[19])}


def _exact(sock, size):
    result = bytearray()
    while len(result) < size:
        chunk = sock.recv(min(size - len(result), 1024 * 1024))
        if not chunk:
            raise EOFError("portal helper disconnected")
        result.extend(chunk)
    return bytes(result)


def _send(sock, lock, message, image=b"", fd=None, transfer=False):
    encoded = json.dumps(message, allow_nan=False).encode()
    if len(encoded) > 1024 * 1024 or len(image) > MAX_BYTES:
        raise PortalError("portal transport bound exceeded")
    header = struct.pack("!II", len(encoded), len(image))
    ancillary = (
        [] if fd is None else [(socket.SOL_SOCKET, socket.SCM_RIGHTS, array.array("i", [fd]))]
    )
    with lock:
        try:
            sent = sock.sendmsg([header], ancillary)
        finally:
            if transfer and fd is not None:
                # Release helper ownership BEFORE the JSON reply becomes
                # readable. A returned descriptor has no retained helper copy.
                os.close(fd)
        sock.sendall(header[sent:] + encoded)
        if image:
            sock.sendall(image)


def _receive(sock):
    header, anc, flags, _ = sock.recvmsg(8, socket.CMSG_SPACE(4 * 4), socket.MSG_CMSG_CLOEXEC)
    fds = []
    try:
        for level, kind, data in anc:
            if level == socket.SOL_SOCKET and kind == socket.SCM_RIGHTS:
                values = array.array("i")
                values.frombytes(data[:len(data) - len(data) % values.itemsize])
                fds.extend(values)
        if not header:
            raise EOFError("portal helper disconnected")
        if flags & socket.MSG_CTRUNC or len(fds) > 1:
            raise PortalError("invalid portal descriptor message")
        header += _exact(sock, 8 - len(header))
        size, image_size = struct.unpack("!II", header)
        if size > 1024 * 1024 or image_size > MAX_BYTES:
            raise PortalError("portal transport bound exceeded")
        message = json.loads(_exact(sock, size))
        image = _exact(sock, image_size)
        return message, image, fds.pop() if fds else None
    finally:
        for fd in fds:
            os.close(fd)


def _take_fd(fd_list, index):
    """Steal ownership; get() would retain an invisible second socket holder."""
    fds = list(fd_list.steal_fds())
    try:
        if type(index) is not int or not 0 <= index < len(fds):
            raise PortalError("portal returned invalid FD index")
        selected = fds[index]
        os.set_inheritable(selected, False)
        fds[index] = -1
        return selected
    finally:
        for fd in fds:
            if fd >= 0:
                os.close(fd)


def _source_metadata(node, props, session):
    if type(node) is not int or not 0 < node < 2**32:
        raise PortalError("invalid PipeWire node")
    if type(props.get("source_type")) is not int or props["source_type"] != 1:
        raise PortalError("monitor source_type required")
    position, size = props.get("position"), props.get("size")
    for value in (position, size):
        if (not isinstance(value, (list, tuple)) or len(value) != 2
                or any(type(v) is not int for v in value)):
            raise PortalError("trusted portal logical geometry unavailable")
    if any(v <= 0 or v > 8192 for v in size):
        raise PortalError("portal geometry exceeds bound")
    result = {"node_id": node, "session_handle": session, "source_type": 1,
              "position": list(position), "size": list(size)}
    if "mapping_id" in props:
        if not isinstance(props["mapping_id"], str) or not props["mapping_id"]:
            raise PortalError("invalid portal mapping_id")
        result["mapping_id"] = props["mapping_id"]
    return result


def _frame_time(pts_running, base, clock_before, clock_after, requested, now):
    """Map source segment running time through measured clock brackets.

    Brackets are (monotonic_before, GstClock seconds, monotonic_after).
    Raw PTS or receipt time alone never establishes capture freshness.
    """
    values = [pts_running, base, requested, now, *clock_before, *clock_after]
    if any(not math.isfinite(v) for v in values) or pts_running < 0 or base < 0:
        raise PortalError("capture_clock_unverified")
    offsets = []
    for before, clock, after in (clock_before, clock_after):
        if not 0 <= after - before <= .02:
            raise PortalError("capture_clock_unverified")
        offsets.append(((before + after) / 2) - clock)
    if clock_after[1] <= clock_before[1] or abs(offsets[1] - offsets[0]) > .02:
        raise PortalError("capture_clock_unverified")
    captured = base + pts_running + offsets[1]
    uncertainty = max((b[2] - b[0]) / 2 for b in (clock_before, clock_after))
    if captured < requested - .005 or captured > now + uncertainty or now - captured > .5:
        raise PortalError("capture_clock_unverified: stale or future source frame")
    return captured, uncertainty


def _png_rgb(raw, width, height, stride, offset=0):
    if not 0 < width <= 8192 or not 0 < height <= 8192 or width * height > MAX_PIXELS:
        raise PortalError("capture dimensions exceed bound")
    if (stride < width * 3 or offset < 0 or len(raw) > MAX_BYTES
            or offset + (height - 1) * stride + width * 3 > len(raw)):
        raise PortalError("invalid capture buffer layout")
    def chunk(kind, content):
        return (struct.pack("!I", len(content)) + kind + content
                + struct.pack("!I", zlib.crc32(kind + content)))
    encoder = zlib.compressobj(3)
    compressed = bytearray()
    for y in range(height):
        start = offset + y * stride
        compressed.extend(encoder.compress(b"\0" + raw[start:start + width * 3]))
    compressed.extend(encoder.flush())
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack("!IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", bytes(compressed)) + chunk(b"IEND", b""))


class WaylandPortalSession:
    """One-shot session. The EIS FD returned by connect_eis belongs to caller."""

    def __init__(self, bus_address: str, expected_uid: int, runtime_identity_callback=None):
        if (not isinstance(bus_address, str) or not bus_address.startswith("unix:")
                or "\x00" in bus_address):
            raise ValueError("explicit Unix session bus address required")
        if type(expected_uid) is not int or expected_uid < 0:
            raise ValueError("expected_uid must be a nonnegative integer")
        self.bus_address, self.expected_uid = bus_address, expected_uid
        self.runtime_identity_callback = runtime_identity_callback
        self._generation, self._alive, self._closed = 0, False, False
        self._identity, self._process_identity, self._eis_peer = {}, {}, None
        self._pending = {}
        self._lock, self._write_lock = threading.Lock(), threading.Lock()
        self._process, self._sock = None, None
        self._close_task = None
        self._start_lock = asyncio.Lock()

    @property
    def current_generation(self):
        return self._generation

    @property
    def alive(self):
        return self._alive and self._process is not None and self._process.poll() is None

    @property
    def identity(self):
        return copy.deepcopy(self._identity)

    @property
    def process_identity(self):
        return dict(self._process_identity)

    @property
    def eis_peer(self):
        return copy.deepcopy(self._eis_peer)

    async def _start(self):
        async with self._start_lock:
            if self._closed:
                raise PortalError("portal session closed")
            if self._process is not None:
                return
            parent, child = socket.socketpair()
            try:
                account = pwd.getpwuid(self.expected_uid)
                credentials = {}
                if os.geteuid() != self.expected_uid:
                    if os.geteuid() != 0:
                        raise PortalError("cannot assume requested desktop UID")
                    credentials = {
                        "user": self.expected_uid, "group": account.pw_gid, "extra_groups": []
                    }
                self._process = subprocess.Popen(
                    ["/usr/bin/python3", "-I", str(Path(__file__).resolve()),
                     "--helper", str(child.fileno()),
                     self.bus_address, str(self.expected_uid)], pass_fds=(child.fileno(),),
                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    close_fds=True, start_new_session=True,
                    env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "HOME": account.pw_dir,
                         "XDG_RUNTIME_DIR": f"/run/user/{self.expected_uid}"}, **credentials)
                self._sock = parent
                self._process_identity = _process_identity(self._process.pid)
                # Helper remains inert until first RPC, including while awaiting
                # durable recovery-descriptor persistence in the caller.
                if self.runtime_identity_callback is not None:
                    value = self.runtime_identity_callback(dict(self._process_identity))
                    if inspect.isawaitable(value):
                        await value
                threading.Thread(
                    target=self._reader, name="wayland-portal-reader", daemon=True
                ).start()
            except BaseException:
                parent.close()
                if self._process is not None:
                    self._process.kill()
                    self._process.wait(timeout=3)
                self._closed = True
                raise
            finally:
                child.close()

    def _reader(self):
        try:
            while True:
                message, image, fd = _receive(self._sock)
                if message.get("event") == "fence":
                    if fd is not None:
                        os.close(fd)
                    with self._lock:
                        self._alive = False
                        self._generation = max(self._generation, message["generation"])
                    continue
                with self._lock:
                    future = self._pending.pop(message.get("id"), None)
                if future is None or future.cancelled():
                    if fd is not None:
                        os.close(fd)
                    continue
                if "error" in message:
                    if fd is not None:
                        os.close(fd)
                    future.set_exception(PortalError(message["error"]))
                else:
                    result = message["result"]
                    if image:
                        result["image"] = image
                    if fd is not None:
                        result["fd"] = fd
                    future.set_result(result)
        except Exception as exc:
            with self._lock:
                self._alive = False
                self._generation += 1
                pending, self._pending = self._pending, {}
            for future in pending.values():
                if not future.done():
                    future.set_exception(PortalError(f"portal helper unavailable: {exc}"))

    async def _rpc(self, action, timeout=15, **fields):
        await self._start()
        ident = uuid.uuid4().hex
        future = concurrent.futures.Future()
        with self._lock:
            self._pending[ident] = future
        try:
            await asyncio.to_thread(
                _send, self._sock, self._write_lock, {"id": ident, "action": action, **fields}
            )
            return await asyncio.wait_for(asyncio.shield(asyncio.wrap_future(future)), timeout)
        except BaseException:
            try:
                await asyncio.to_thread(
                    _send, self._sock, self._write_lock, {"action": "cancel", "id": ident}
                )
            except Exception:
                pass
            def dispose(done):
                try:
                    result = done.result()
                    if "fd" in result:
                        os.close(result["fd"])
                except Exception:
                    pass
            future.add_done_callback(dispose)
            self._alive = False
            raise

    async def open(self, timeout_seconds=100) -> dict:
        if not math.isfinite(timeout_seconds) or not 0 < timeout_seconds <= 300:
            raise ValueError("portal timeout must be in (0, 300]")
        try:
            result = await self._rpc(
                "open", timeout=timeout_seconds + 8, timeout_seconds=timeout_seconds
            )
            with self._lock:
                if self._generation > result["generation"]:
                    raise PortalError("portal owner lost during open")
                self._identity, self._generation = result["identity"], result["generation"]
                self._alive = True
            return result
        except BaseException:
            cleanup = asyncio.create_task(self.close())
            try:
                await asyncio.shield(cleanup)
            except asyncio.CancelledError:
                await cleanup
            raise

    async def connect_eis(self) -> int:
        if not self.alive:
            raise PortalError("portal session is not alive")
        try:
            result = await self._rpc("connect_eis")
        except BaseException:
            await self.close()
            raise
        self._eis_peer = result["eis_peer"]
        if not self.alive or result["generation"] != self.current_generation:
            os.close(result["fd"])
            raise PortalError("portal owner lost during EIS transfer")
        return result["fd"]

    async def capture(self, node_id) -> dict:
        if type(node_id) is not int or not self.alive:
            raise PortalError("live portal and integer node required")
        try:
            result = await self._rpc("capture", node_id=node_id)
        except BaseException:
            await self.close()
            raise
        if not self.alive or result["generation"] != self.current_generation:
            raise PortalError("portal owner lost during capture")
        return result

    async def close(self) -> dict:
        if self._close_task is None:
            self._close_task = asyncio.create_task(self._close())
        try:
            return await asyncio.shield(self._close_task)
        except asyncio.CancelledError:
            # The caller may cancel; the owned process still must be reaped.
            await self._close_task
            raise

    async def _close(self) -> dict:
        if self._closed:
            return {"closed": True, "generation": self._generation,
                    "process_reaped": self._process is None or self._process.poll() is not None}
        result = {"closed": True}
        try:
            if self._process is not None and self._process.poll() is None:
                result = await self._rpc("close", timeout=7)
        finally:
            self._closed, self._alive = True, False
            self._generation += 1
            if self._sock is not None:
                try:
                    self._sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                self._sock.close()
            if self._process is not None:
                try:
                    self._process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self._process.kill()
                    self._process.wait(timeout=3)
            result["process_reaped"] = self._process is None or self._process.poll() is not None
        return result


class _PortalWorker:
    """GI calls are confined to the helper's private-context main thread."""

    def __init__(self, bus_address, expected_uid, emit, cancel):
        import gi
        gi.require_version("Gio", "2.0")
        from gi.repository import Gio, GLib
        self.Gio, self.GLib = Gio, GLib
        self.context = GLib.MainContext.new()
        self.context.push_thread_default()
        self.expected_uid, self.emit, self.cancel = expected_uid, emit, cancel
        self.generation, self.alive = 1, False
        self.session, self.streams, self.identity = None, {}, {}
        self.subscriptions = []
        self.eis_used = False
        self.bus = Gio.DBusConnection.new_for_address_sync(
            bus_address,
            Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT
            | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
            None, None)
        self.bus.set_exit_on_close(False)
        self.bus.connect("closed", lambda *_: self.fence())
        if self.dbus("GetConnectionUnixUser", self.bus.get_unique_name()) != expected_uid:
            raise PortalError("session bus credential UID mismatch")

    def pump(self):
        while self.context.pending():
            self.context.iteration(False)

    def dbus(self, method, name):
        return self.bus.call_sync(
            "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus",
            method, self.GLib.Variant("(s)", (name,)), None,
            self.Gio.DBusCallFlags.NONE, 3000, None).unpack()[0]

    def owner(self, name):
        unique = self.dbus("GetNameOwner", name)
        pid = self.dbus("GetConnectionUnixProcessID", unique)
        uid = self.dbus("GetConnectionUnixUser", unique)
        if uid != self.expected_uid:
            raise PortalError("portal/compositor UID mismatch")
        return {"owner": unique, **_process_identity(pid), "uid": uid,
                "executable": os.readlink(f"/proc/{pid}/exe")}

    def fence(self):
        self.alive = False
        self.generation += 1
        self.cancel.set()
        try:
            self.emit({"event": "fence", "generation": self.generation})
        except (OSError, EOFError):
            # Controller EOF cannot prevent graceful portal Session.Close.
            pass

    def check(self):
        self.pump()
        if self.cancel.is_set():
            raise PortalError("portal session cancelled or owner lost")

    def call(self, interface, method, args, path=PATH, timeout=3000):
        return self.bus.call_sync(
            self.identity["portal"]["owner"], path, interface, method, args, None,
            self.Gio.DBusCallFlags.NONE, timeout, None)

    def request(self, interface, method, make_args, deadline):
        self.check()
        token = "r8_" + uuid.uuid4().hex
        sender = self.bus.get_unique_name()[1:].replace(".", "_")
        path = f"{PATH}/request/{sender}/{token}"
        response = []
        sub = self.bus.signal_subscribe(
            self.identity["portal"]["owner"], REQUEST, "Response", path, None,
            self.Gio.DBusSignalFlags.NONE,
            lambda _b, _s, _p, _i, _n, params: response.append(params.unpack()))
        complete = False
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise PortalError("portal consent timed out")
            actual = self.call(
                interface, method, make_args(token),
                timeout=max(1, min(3000, int(remaining * 1000)))).unpack()[0]
            if actual != path:
                raise PortalError("unexpected portal request path")
            while not response:
                self.check()
                if time.monotonic() >= deadline:
                    raise PortalError("portal consent timed out; not granted")
                time.sleep(.005)
            self.check()
            code, data = response[0]
            complete = True
            if code != 0:
                raise PortalError(f"{method}: portal consent response {code}")
            return data
        finally:
            if not complete:
                try:
                    self.call(REQUEST, "Close", None, path=path)
                except Exception:
                    pass
            self.bus.signal_unsubscribe(sub)

    def open(self, timeout_seconds):
        if self.session or self.identity:
            raise PortalError("portal session is one-shot")
        variant = self.GLib.Variant
        self.identity = {"portal": self.owner(DEST), "shell": self.owner("org.gnome.Shell")}
        if Path(self.identity["shell"]["executable"]).name != "gnome-shell":
            raise PortalError("compositor is not measured gnome-shell")
        for name, key in ((DEST, "portal"), ("org.gnome.Shell", "shell")):
            expected = self.identity[key]["owner"]
            def changed(_b, _s, _p, _i, _n, params, expected=expected):
                _, old, new = params.unpack()
                if old == expected and new != expected:
                    self.fence()
            self.subscriptions.append(self.bus.signal_subscribe(
                "org.freedesktop.DBus", "org.freedesktop.DBus", "NameOwnerChanged",
                "/org/freedesktop/DBus", name, self.Gio.DBusSignalFlags.NONE, changed))
        if (self.owner(DEST) != self.identity["portal"]
                or self.owner("org.gnome.Shell") != self.identity["shell"]):
            raise PortalError("portal/compositor identity changed")
        deadline = time.monotonic() + timeout_seconds
        data = self.request(RD, "CreateSession", lambda t: variant("(a{sv})", ({
            "handle_token": variant("s", t),
            "session_handle_token": variant("s", "session_" + uuid.uuid4().hex)},)), deadline)
        self.session = data.get("session_handle")
        prefix = f"{PATH}/session/{self.bus.get_unique_name()[1:].replace('.', '_')}/"
        if not isinstance(self.session, str) or not self.session.startswith(prefix):
            raise PortalError("invalid portal session path")
        self.subscriptions.append(self.bus.signal_subscribe(
            self.identity["portal"]["owner"], SESSION, "Closed",
            self.session, None, self.Gio.DBusSignalFlags.NONE, lambda *_: self.fence()))
        self.request(RD, "SelectDevices", lambda t: variant("(oa{sv})", (self.session, {
            "handle_token": variant("s", t), "types": variant("u", 3),
            "persist_mode": variant("u", 0)})), deadline)
        self.request(SC, "SelectSources", lambda t: variant("(oa{sv})", (self.session, {
            "handle_token": variant("s", t), "types": variant("u", 1),
            "multiple": variant("b", True),
            "cursor_mode": variant("u", 2)})), deadline)
        result = self.request(RD, "Start", lambda t: variant(
            "(osa{sv})", (self.session, "", {"handle_token": variant("s", t)})), deadline)
        streams = result.get("streams", [])
        if not streams or len(streams) > 32:
            raise PortalError("no granted streams or excessive stream count")
        for node, props in streams:
            if node in self.streams:
                raise PortalError("duplicate granted stream")
            self.streams[node] = _source_metadata(node, props, self.session)
        devices = result.get("devices", 0)
        if type(devices) is not int or devices & 3 != 3:
            raise PortalError("keyboard and pointer consent required")
        self.check()
        self.alive = True
        return {"streams": streams, "devices": devices, "identity": self.identity,
                "generation": self.generation}

    def descriptor(self, interface, method):
        self.check()
        if not self.alive:
            raise PortalError("portal session is not alive")
        value, fds = self.bus.call_with_unix_fd_list_sync(
            self.identity["portal"]["owner"], PATH, interface, method,
            self.GLib.Variant("(oa{sv})", (self.session, {})), self.GLib.VariantType.new("(h)"),
            self.Gio.DBusCallFlags.NONE, 3000, None, None)
        fd = _take_fd(fds, value.unpack()[0])
        try:
            self.check()
            return fd
        except BaseException:
            os.close(fd)
            raise

    def connect_eis(self):
        if self.eis_used:
            raise PortalError("EIS transfer is one-shot")
        self.eis_used = True
        fd = self.descriptor(RD, "ConnectToEIS")
        sock = socket.socket(fileno=fd)
        try:
            pid, uid, gid = struct.unpack(
                "3i", sock.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            shell = self.owner("org.gnome.Shell")
            if shell != self.identity["shell"] or (pid, uid) != (shell["pid"], self.expected_uid):
                raise PortalError("EIS creator differs from measured compositor")
            return {"eis_peer": {**shell, "gid": gid}, "generation": self.generation}, sock.detach()
        finally:
            sock.close()

    def capture(self, node_id):
        self.check()
        if node_id not in self.streams:
            raise PortalError("node was not granted by authenticated portal Start")
        import gi
        gi.require_version("Gst", "1.0")
        gi.require_version("GstApp", "1.0")
        gi.require_version("GstVideo", "1.0")
        from gi.repository import Gst, GstApp, GstVideo  # noqa: F401
        Gst.init(None)
        fd = self.descriptor(SC, "OpenPipeWireRemote")
        pipeline = None
        try:
            requested = time.monotonic()
            pipeline = Gst.parse_launch(
                f"pipewiresrc name=source fd={fd} path={node_id} "
                "do-timestamp=false ! videoconvert ! "
                "video/x-raw,format=RGB,width=[1,8192],height=[1,8192] ! "
                "appsink name=capture sync=false max-buffers=2 drop=true enable-last-sample=false")
            oversized = threading.Event()
            def source_guard(_pad, probe):
                if probe.type & Gst.PadProbeType.EVENT_DOWNSTREAM:
                    event = probe.get_event()
                    if event.type == Gst.EventType.CAPS:
                        caps = event.parse_caps().get_structure(0)
                        width, height = caps.get_value("width"), caps.get_value("height")
                        if (type(width) is not int or type(height) is not int
                                or not 0 < width <= 8192 or not 0 < height <= 8192
                                or width * height > MAX_PIXELS):
                            oversized.set()
                if probe.type & Gst.PadProbeType.BUFFER:
                    buffer = probe.get_buffer()
                    if buffer is not None and buffer.get_size() > MAX_BYTES:
                        oversized.set()
                return Gst.PadProbeReturn.DROP if oversized.is_set() else Gst.PadProbeReturn.OK
            pipeline.get_by_name("source").get_static_pad("src").add_probe(
                Gst.PadProbeType.EVENT_DOWNSTREAM | Gst.PadProbeType.BUFFER, source_guard)
            if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
                raise PortalError("PipeWire pipeline failed to start")
            sink = pipeline.get_by_name("capture")
            deadline, first, clock_identity = requested + 10, None, None
            last_reason = "no PipeWire frame"
            while time.monotonic() < deadline:
                self.check()
                if oversized.is_set():
                    raise PortalError("capture source exceeds resource bounds")
                if pipeline.get_bus().pop_filtered(Gst.MessageType.ERROR):
                    raise PortalError("PipeWire capture pipeline error")
                clock = pipeline.get_clock()
                if clock is not None:
                    before = time.monotonic()
                    bracket = (before, clock.get_time() / Gst.SECOND, time.monotonic())
                    if first is None:
                        first, clock_identity = bracket, clock
                    elif clock != clock_identity:
                        raise PortalError("capture_clock_unverified: clock replaced")
                sample = sink.emit("try-pull-sample", 100 * Gst.MSECOND)
                if sample is None or first is None:
                    continue
                buf, segment = sample.get_buffer(), sample.get_segment()
                if buf.pts == Gst.CLOCK_TIME_NONE or segment.format != Gst.Format.TIME:
                    last_reason = "capture_clock_unverified: source timestamp absent"
                    continue
                running = segment.to_running_time(Gst.Format.TIME, buf.pts)
                base = pipeline.get_base_time()
                if running == Gst.CLOCK_TIME_NONE or base == Gst.CLOCK_TIME_NONE:
                    last_reason = "capture_clock_unverified: segment/base unavailable"
                    continue
                before = time.monotonic()
                after_bracket = (before, clock.get_time() / Gst.SECOND, time.monotonic())
                try:
                    captured, uncertainty = _frame_time(
                        running / Gst.SECOND, base / Gst.SECOND,
                        first, after_bracket, requested, time.monotonic())
                except PortalError as exc:
                    last_reason = str(exc)
                    continue
                info = GstVideo.VideoInfo.new_from_caps(sample.get_caps())
                width, height = info.width, info.height
                if (not 0 < width <= 8192 or not 0 < height <= 8192
                        or width * height > MAX_PIXELS or buf.get_size() > MAX_BYTES):
                    raise PortalError("capture frame exceeds resource bounds")
                mapped, view = buf.map(Gst.MapFlags.READ)
                if not mapped:
                    raise PortalError("capture buffer cannot be mapped")
                try:
                    image = _png_rgb(view.data, width, height, info.stride[0], info.offset[0])
                finally:
                    buf.unmap(view)
                self.check()
                return {"width": width, "height": height, "captured_at": captured,
                        "clock_verified": True, "clock_uncertainty_seconds": uncertainty,
                        "clock_source": "pipewire_pts_segment_gstclock_monotonic_brackets",
                        "source_metadata": self.streams[node_id],
                        "generation": self.generation}, image
            raise PortalError(last_reason)
        finally:
            if pipeline is not None:
                pipeline.set_state(Gst.State.NULL)
            os.close(fd)

    def close(self):
        errors = []
        self.fence()
        if self.session:
            try:
                self.call(SESSION, "Close", None, path=self.session)
            except Exception as exc:
                errors.append(type(exc).__name__)
            self.session = None
        for sub in self.subscriptions:
            self.bus.signal_unsubscribe(sub)
        self.subscriptions.clear()
        return {"closed": True, "generation": self.generation, "cleanup_errors": errors}


def _helper(fd, address, uid):
    sock = socket.socket(fileno=fd)
    lock = threading.Lock()
    commands = queue.Queue(maxsize=16)
    stopped, cancel = threading.Event(), threading.Event()
    worker = None
    def emit(message, image=b"", fd=None):
        _send(sock, lock, message, image, fd, transfer=fd is not None)
    def receive():
        try:
            while not stopped.is_set():
                message, _, received_fd = _receive(sock)
                if received_fd is not None:
                    os.close(received_fd)
                    raise PortalError("unexpected incoming descriptor")
                if message.get("action") in ("cancel", "close"):
                    cancel.set()
                if message.get("action") != "cancel":
                    commands.put_nowait(message)
        except Exception:
            stopped.set()
            cancel.set()
    threading.Thread(target=receive, daemon=True).start()
    try:
        while not stopped.is_set():
            if worker is not None:
                worker.pump()
                if cancel.is_set() and worker.session is not None:
                    worker.close()
            try:
                command = commands.get(timeout=.01)
            except queue.Empty:
                continue
            action, ident = command.get("action"), command.get("id")
            transferred = None
            try:
                image = b""
                if action == "open":
                    if worker is not None or cancel.is_set():
                        raise PortalError("portal session is one-shot or cancelled")
                    worker = _PortalWorker(address, uid, emit, cancel)
                    result = worker.open(command["timeout_seconds"])
                elif action == "close":
                    result = worker.close() if worker is not None else {"closed": True}
                elif worker is None:
                    raise PortalError("portal not open")
                elif action == "connect_eis":
                    result, transferred = worker.connect_eis()
                elif action == "capture":
                    result, image = worker.capture(command["node_id"])
                else:
                    raise PortalError("unknown portal operation")
                outgoing, transferred = transferred, None
                emit({"id": ident, "result": result}, image, outgoing)
            except Exception as exc:
                if worker is not None and (action == "open" or cancel.is_set()):
                    worker.close()
                emit({"id": ident, "error": f"{type(exc).__name__}: {exc}"})
            finally:
                if transferred is not None:
                    os.close(transferred)
            if action == "close":
                break
    finally:
        stopped.set()
        if worker is not None:
            try:
                worker.close()
                worker.bus.close_sync(None)
            except Exception:
                pass
            worker.context.pop_thread_default()
        sock.close()


if __name__ == "__main__":
    if len(sys.argv) != 5 or sys.argv[1] != "--helper":
        raise SystemExit("private helper invocation only")
    _helper(int(sys.argv[2]), sys.argv[3], int(sys.argv[4]))
