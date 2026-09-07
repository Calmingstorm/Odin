"""Native input in the worker's private desktop, never the operator's session.

No native dependency is imported and no command is run until a method is called.
Receipts confirm injection only: the worker owns deadlines and postconditions.
"""

import ctypes
import hashlib
import os
import secrets
import struct
import subprocess
import threading
import time
import zlib

from .accessibility import Accessibility, PrimitiveError, bounded_text, finite

XDOTOOL = "/usr/bin/xdotool"
PROFILES = {"drawing": ("/usr/bin/drawing", "--new-window"),
            "xed": ("/usr/bin/xed", "--standalone", "--new-window")}
KEYS = frozenset({"Return", "Escape", "Tab", "BackSpace", "Delete", "space", "Left",
                  "Right", "Up", "Down", "Home", "End", "Page_Up", "Page_Down",
                  "ctrl+a", "ctrl+c", "ctrl+v", "ctrl+x", "ctrl+z", "ctrl+y", "ctrl+s",
                  "ctrl+o", "ctrl+n", "ctrl+f", "ctrl+Home", "ctrl+End", "shift+Tab",
                  "shift+Left", "shift+Right", "shift+Up", "shift+Down"})
PHYSICAL = frozenset({"move", "click", "double_click", "scroll", "key", "type", "polyline"})
SEMANTIC = frozenset({"invoke", "focus", "set_text", "select", "value"})


def sanitize_png(data):
    """Validate native RGB(A) PNG and retain only IHDR/IDAT/IEND chunks."""
    if not isinstance(data, bytes) or len(data) > 64 * 1024 * 1024:
        raise PrimitiveError("failed", "Native capture has invalid byte size")
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise PrimitiveError("failed", "Native capture is not PNG")
    offset, kept, compressed, header, ended = 8, [data[:8]], [], None, False
    idat_ended = False
    while offset < len(data):
        if offset + 12 > len(data):
            raise PrimitiveError("failed", "Truncated PNG chunk")
        length, kind = struct.unpack_from(">I4s", data, offset)
        end = offset + length + 12
        if end > len(data):
            raise PrimitiveError("failed", "Truncated PNG payload")
        payload = data[offset + 8:end - 4]
        crc = struct.unpack_from(">I", data, end - 4)[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != crc:
            raise PrimitiveError("failed", "PNG checksum mismatch")
        if header is None:
            if kind != b"IHDR" or length != 13:
                raise PrimitiveError("failed", "Missing PNG header")
            header = struct.unpack(">IIBBBBB", payload)
            w, h, depth, color, compression, filtering, interlace = header
            if (not 0 < w <= 4096 or not 0 < h <= 4096 or depth != 8
                    or color not in (2, 6) or (compression, filtering, interlace) != (0, 0, 0)):
                raise PrimitiveError("failed", "Unsupported native PNG format")
        elif kind == b"IHDR" or (kind[0] & 32 == 0 and kind not in (b"IDAT", b"IEND")):
            raise PrimitiveError("failed", "Unsupported critical PNG chunk")
        if kind == b"IDAT":
            if idat_ended:
                raise PrimitiveError("failed", "Non-contiguous PNG image chunks")
            compressed.append(payload)
        elif compressed:
            idat_ended = True
        if kind in (b"IHDR", b"IDAT", b"IEND"):
            kept.append(data[offset:end])
        offset = end
        if kind == b"IEND":
            ended = length == 0 and offset == len(data)
            break
    if not ended or not compressed or header is None:
        raise PrimitiveError("failed", "Incomplete PNG image")
    stride = 1 + header[0] * (3 if header[3] == 2 else 4)
    expected = stride * header[1]
    try:
        decoder = zlib.decompressobj()
        raw = decoder.decompress(b"".join(compressed), expected + 1)
        if (len(raw) != expected or not decoder.eof or decoder.unused_data
                or decoder.unconsumed_tail or any(raw[i] > 4 for i in range(0, len(raw), stride))):
            raise ValueError
    except (ValueError, zlib.error) as exc:
        raise PrimitiveError("failed", "Invalid PNG scanlines") from exc
    return b"".join(kept), header[0], header[1]


class NativeDesktop:
    def __init__(self, *, display=":77", workspace="/workspace", clock=time.monotonic,
                 command_runner=None, capture_backend=None, accessibility_backend=None):
        if display != ":77" or workspace != "/workspace":
            raise ValueError("NativeDesktop only operates the isolated :77 /workspace desktop")
        self._clock, self._runner, self._capture_backend = clock, command_runner, capture_backend
        self._a11y = accessibility_backend or Accessibility()
        self._env = {"DISPLAY": display, "HOME": workspace, "PATH": "/usr/bin:/bin",
                     "LANG": "C.UTF-8", "NO_AT_BRIDGE": "0"}
        for name in ("DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "XDG_DATA_DIRS"):
            if name in os.environ:
                self._env[name] = os.environ[name]
        self._apps, self._processes = {}, set()
        self._buttons, self._keys = set(), set()
        self._lock = threading.RLock()
        self._deadline, self._cancelled = 0, None
        self._observation, self._window_at_observation = None, None
        self._expected, self._attempted, self._injected = None, False, False
        self._type_dirty, self._observed_identity = False, None
        self._source_revision = 0
        self._source_fingerprint = None
        self._root_extent = None
        self._captured_at = 0.0
        self._modal_id = None
        self._input_quarantined = False
        self._raster_digest = None

    def _guard(self):
        if self._cancelled is not None and self._cancelled.is_set():
            raise PrimitiveError("cancelled", "Native action cancelled")
        if self._clock() >= self._deadline:
            raise PrimitiveError("timeout", "Native action deadline reached")

    def _run(self, *arguments):
        self._guard()
        argv = [XDOTOOL, *map(str, arguments)]
        remaining = min(2.0, self._deadline - self._clock())
        if self._runner is not None:
            return self._runner(argv, timeout=remaining, env=dict(self._env), cwd="/workspace")
        process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   stdin=subprocess.DEVNULL, env=self._env, cwd="/workspace",
                                   start_new_session=True)
        self._processes.add(process)
        try:
            while True:
                self._guard()
                try:
                    stdout, _ = process.communicate(timeout=min(
                        0.05, max(0.0, self._deadline - self._clock())))
                    break
                except subprocess.TimeoutExpired:
                    continue
            if process.returncode:
                raise PrimitiveError("failed", "Native input utility failed")
            if len(stdout) > 65536:
                raise PrimitiveError("failed", "Native utility output exceeded bounds")
            return stdout.decode("utf-8", errors="strict").strip()
        finally:
            if process.poll() is None:
                process.kill()  # Only this owned, fixed-command child; never a session-wide kill.
                try:
                    process.wait(timeout=max(0.0, min(0.05, self._deadline - self._clock())))
                except subprocess.TimeoutExpired:
                    pass
            if process.poll() is not None:
                self._processes.discard(process)

    @staticmethod
    def _identity(pid):
        try:
            with open(f"/proc/{int(pid)}/stat", encoding="utf-8") as file:
                fields = file.read(8192).rsplit(")", 1)[1].split()
            return int(fields[1]), int(fields[19])  # PPID, starttime; comm may contain ')'.
        except (OSError, ValueError, IndexError):
            return None

    def _owned(self, pid):
        visited = set()
        for _ in range(64):
            if pid <= 1 or pid in visited:
                return False
            visited.add(pid)
            identity = self._identity(pid)
            if identity is None:
                return False
            if pid in self._apps:
                child, start = self._apps[pid]
                return identity[1] == start and child.poll() is None
            pid = identity[0]
        return False

    def _modal(self, window_id):
        lib = ctypes.CDLL("libX11.so.6")
        lib.XOpenDisplay.argtypes, lib.XOpenDisplay.restype = [ctypes.c_char_p], ctypes.c_void_p
        lib.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
        lib.XInternAtom.restype = ctypes.c_ulong
        lib.XGetWindowProperty.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong,
                                          ctypes.c_long, ctypes.c_long, ctypes.c_int,
                                          ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong),
                                          ctypes.POINTER(ctypes.c_int),
                                          ctypes.POINTER(ctypes.c_ulong),
                                          ctypes.POINTER(ctypes.c_ulong),
                                          ctypes.POINTER(ctypes.POINTER(ctypes.c_ubyte))]
        lib.XGetWindowProperty.restype = ctypes.c_int
        lib.XFree.argtypes, lib.XCloseDisplay.argtypes = [ctypes.c_void_p], [ctypes.c_void_p]
        display = lib.XOpenDisplay(b":77")
        if not display:
            raise PrimitiveError("failed", "Private X display is unavailable")
        data = ctypes.POINTER(ctypes.c_ubyte)()
        try:
            atom = lib.XInternAtom(display, b"_NET_WM_STATE", 0)
            modal = lib.XInternAtom(display, b"_NET_WM_STATE_MODAL", 0)
            actual, count, after = ctypes.c_ulong(), ctypes.c_ulong(), ctypes.c_ulong()
            bits = ctypes.c_int()
            result = lib.XGetWindowProperty(display, window_id, atom, 0, 128, 0, 4,
                                           ctypes.byref(actual), ctypes.byref(bits),
                                           ctypes.byref(count), ctypes.byref(after),
                                           ctypes.byref(data))
            if result or after.value or (actual.value and (actual.value != 4 or bits.value != 32)):
                raise PrimitiveError("failed", "Cannot establish native window modal state")
            values = ctypes.cast(data, ctypes.POINTER(ctypes.c_ulong))
            return any(values[i] == modal for i in range(count.value))
        finally:
            if data:
                lib.XFree(data)
            lib.XCloseDisplay(display)

    def _window(self):
        window_id = int(self._run("getactivewindow"))
        if window_id <= 0 or int(self._run("getwindowfocus")) != window_id:
            raise PrimitiveError("rejected", "No established active focused window")
        pid = int(self._run("getwindowpid", window_id))
        if not self._owned(pid):
            raise PrimitiveError("rejected", "Focused window is not owned by an approved app")
        title = bounded_text(self._run("getwindowname", window_id))
        geometry = dict(line.split("=", 1) for line in self._run(
            "getwindowgeometry", "--shell", window_id).splitlines() if "=" in line)
        window = {"id": window_id, "pid": pid, "title": title,
                  **{key: int(geometry[key.upper()]) for key in ("x", "y", "width", "height")},
                  "modal": self._modal(window_id)}
        if (not 0 < window["width"] <= 4096 or not 0 < window["height"] <= 4096
                or int(geometry["WINDOW"]) != window_id
                or int(self._run("getactivewindow")) != window_id):
            raise PrimitiveError("rejected", "Active window changed or has invalid geometry")
        return window

    def _assert_window(self):
        self._guard()
        if self._root_extent is not None:
            extent = tuple(int(v) for v in self._run("getdisplaygeometry").split())
            if extent != self._root_extent:
                raise PrimitiveError("rejected", "Private source geometry changed")
        window = self._window()
        if (window != self._expected
                or self._identity(window["pid"]) != self._observed_identity):
            raise PrimitiveError("rejected", "Window changed since observation")
        return window

    def _capture(self):
        if self._capture_backend:
            return self._capture_backend()
        # Pure protocol client per capture avoids GI display objects crossing
        # startup/operation threads and native teardown crashes in this sandbox.
        from Xlib import X  # type: ignore[import-untyped]
        from Xlib import display as xdisplay  # type: ignore[import-untyped]

        display = xdisplay.Display(":77")
        try:
            screen = display.screen()
            root = screen.root
            geometry = root.get_geometry()
            width, height = geometry.width, geometry.height
            finite(width, 1, 4096)
            finite(height, 1, 4096)
            # Fixed private Xvfb profile: reject other native layouts, never guess.
            fmt = next(f for f in display.display.info.pixmap_formats
                       if f.depth == screen.root_depth)
            visual = next(v for d in screen.allowed_depths for v in d.visuals
                          if v.visual_id == screen.root_visual)
            if (screen.root_depth != 24 or fmt.bits_per_pixel != 32 or fmt.scanline_pad != 32
                    or display.display.info.image_byte_order != 0
                    or visual.visual_class != X.TrueColor
                    or (visual.red_mask, visual.green_mask, visual.blue_mask)
                    != (0xFF0000, 0xFF00, 0xFF)):
                raise PrimitiveError("unsupported", "Unsupported private Xvfb pixel layout")
            if width * height * 4 > 16 * 1024 * 1024:
                raise PrimitiveError("unsupported", "Private capture allocation limit")
            reply = root.get_image(0, 0, width, height, X.ZPixmap, 0xFFFFFFFF)
            if reply is None or reply.depth != 24 or len(reply.data) != width * height * 4:
                raise PrimitiveError("failed", "Native capture returned no pixels")
            packed = bytearray(width * height * 3)
            packed[0::3], packed[1::3], packed[2::3] = (
                reply.data[2::4], reply.data[1::4], reply.data[0::4])
            self._root_extent = (width, height)
            return bytes(packed), width, height, "RGB"
        finally:
            display.close()

    def snapshot(self, *, packed=False):
        with self._lock:
            self._deadline, self._cancelled = self._clock() + 2.0, None
            self._observation, self._window_at_observation = None, None
            window = self._window()
            identity = self._identity(window["pid"])
            if identity is None:
                raise PrimitiveError("rejected", "Observed app process disappeared")
            captured_at = self._clock()
            capture = self._capture()
            if packed:
                if not isinstance(capture, tuple) or len(capture) != 4:
                    raise PrimitiveError("unsupported", "Packed native capture required")
                image, width, height, mode = capture
            else:
                image, width, height = sanitize_png(capture)
                mode = "PNG"
            observation = secrets.token_urlsafe(18)
            nodes, status = self._a11y.snapshot(window, observation, self._guard)
            if self._root_extent is not None:
                extent = tuple(int(v) for v in self._run("getdisplaygeometry").split())
                if extent != (width, height):
                    raise PrimitiveError("rejected", "Private source changed during capture")
            if self._window() != window or self._identity(window["pid"]) != identity:
                raise PrimitiveError("rejected", "Window changed during observation")
            self._guard()
            self._observation, self._window_at_observation = observation, dict(window)
            self._observed_identity = identity
            fingerprint = (width, height, tuple(sorted(window.items())), identity)
            if fingerprint != self._source_fingerprint:
                self._source_revision += 1
                self._source_fingerprint = fingerprint
                self._modal_id = secrets.token_urlsafe(18) if window["modal"] else None
            self._captured_at = captured_at
            self._raster_digest = hashlib.sha256(image).digest() if packed else None
            return {"image_bytes": image, "width": width, "height": height, "window": window,
                    "accessibility": nodes, "accessibility_status": status,
                    "observation_id": observation, "modal": window["modal"],
                    "source_revision": self._source_revision, "raster_mode": mode,
                    "modal_id": self._modal_id, "focused": True}

    def grounded_execute(self, action, cancelled):
        """Worker entry point. Pointer proof does not establish widget activation."""
        with self._lock:
            required = {"type", "x", "y", "source_revision", "expected_window",
                        "observation_id", "expected"}
            if (type(action) is not dict or set(action) != required
                    or self._input_quarantined
                    or action["type"] != "click"
                    or self._observation is None
                    or action["observation_id"] != self._observation
                    or type(action["source_revision"]) is not int
                    or action["source_revision"] != self._source_revision
                    or not 0 <= self._clock() - self._captured_at <= 5
                    or self._window_at_observation is None
                    or self._window_at_observation["modal"]):
                raise PrimitiveError("rejected", "Stale or unsupported grounded action")
            expected = action["expected"]
            if (type(expected) is not dict or set(expected) != {"type", "x", "y"}
                    or expected["type"] != "pointer_at"
                    or any(type(action[k]) is not int or type(expected[k]) is not int
                           or action[k] != expected[k] for k in ("x", "y"))):
                raise PrimitiveError("rejected", "Unsupported pointer postcondition")
            # Recheck pixels after controller authorization awaits, before input.
            self._deadline, self._cancelled = self._clock() + 1.75, cancelled
            observed_extent = self._root_extent
            current = self._capture()
            if (self._raster_digest is None or not isinstance(current, tuple)
                    or current[1:3] != observed_extent
                    or hashlib.sha256(current[0]).digest() != self._raster_digest):
                self._observation = None
                raise PrimitiveError("rejected", "Private pixels changed before input")
            self._guard()
            receipt = self.execute(action, cancelled)
            self._observation = None
            receipt["postcondition"] = {"type": "pointer_at", "status": "unavailable"}
            if not receipt["ok"] or not receipt["released"]:
                receipt["status"] = "unknown" if receipt["effect_uncertain"] else "unavailable"
                return receipt
            # Independent read AFTER release, still within execute's two-second budget.
            self._cancelled = cancelled
            self._expected = dict(self._window_at_observation)
            try:
                self._assert_window()
                values = dict(line.split("=", 1) for line in self._run(
                    "getmouselocation", "--shell").splitlines() if "=" in line)
                actual = {"x": int(values["X"]), "y": int(values["Y"])}
                self._assert_window()
                satisfied = (actual == {"x": action["x"], "y": action["y"]}
                             and int(values["WINDOW"]) == self._expected["id"])
                receipt["postcondition"] = {
                    "type": "pointer_at", "status": "satisfied" if satisfied else "not_satisfied",
                    "target_window_matches": int(values["WINDOW"]) == self._expected["id"],
                    "method": "pointer_query_after_release", "actual": actual}
                receipt["status"] = "verified" if satisfied else "not_satisfied"
            except Exception:
                receipt["status"] = "executed"
            finally:
                self._expected = None
                self._cancelled = None
            return receipt

    def _input(self, *arguments):
        self._assert_window()
        self._attempted = True
        self._run(*arguments)
        self._injected = True

    def _point(self, x, y):
        window = self._expected
        assert window is not None  # execute establishes the observed target.
        for value, origin, span in ((x, window["x"], window["width"]),
                                    (y, window["y"], window["height"])):
            finite(value, max(0, origin), min(4095, origin + span - 1))
            if type(value) is not int:
                raise PrimitiveError("rejected", "Pixel coordinates must be integers")
        return x, y

    def _pointer(self, x, y):
        self._assert_window()
        assert self._expected is not None  # execute establishes the observed target.
        values = dict(line.split("=", 1) for line in self._run(
            "getmouselocation", "--shell").splitlines() if "=" in line)
        if (int(values.get("X", -1)), int(values.get("Y", -1))) != (x, y):
            raise PrimitiveError("rejected", "Pointer did not reach the observed target")
        if int(values.get("WINDOW", 0)) != self._expected["id"]:
            raise PrimitiveError("unsupported", "Pointer window is not the exact observed target")

    def _physical(self, action):
        kind = action["type"]
        if kind == "key":
            chord = action.get("chord")
            if chord not in KEYS:
                raise PrimitiveError("rejected", "Key chord is not in the allowlist")
            keys = chord.split("+")
            for key in keys:
                self._keys.add(key)
                self._input("keydown", key)
        elif kind == "type":
            text = bounded_text(action.get("text"))
            self._type_dirty = True
            self._input("type", "--delay", "0", "--", text)
        elif kind == "polyline":
            assert self._cancelled is not None  # execute supplies the cancellation event.
            points = action.get("points")
            if not isinstance(points, list) or not 2 <= len(points) <= 256:
                raise PrimitiveError("rejected", "Polyline requires 2..256 points")
            if any(not isinstance(p, (list, tuple)) or len(p) != 2 for p in points):
                raise PrimitiveError("rejected", "Polyline points must be coordinate pairs")
            points = [self._point(*point) for point in points]
            duration = finite(action.get("duration", 0), 0, 2.0)
            self._input("mousemove", *points[0])
            self._pointer(*points[0])
            self._buttons.add(1)
            self._input("mousedown", 1)
            started = self._clock()
            for index, point in enumerate(points[1:], 1):
                target = started + duration * index / (len(points) - 1)
                while self._clock() < target:
                    self._guard()
                    self._cancelled.wait(min(0.01, target - self._clock()))
                self._input("mousemove", *point)
                self._pointer(*point)
        else:
            point = self._point(action.get("x"), action.get("y"))
            button = {"left": 1, "middle": 2, "right": 3}.get(action.get("button", "left"))
            if button is None:
                raise PrimitiveError("rejected", "Unsupported mouse button")
            delta = action.get("delta", 0)
            if kind == "scroll" and (type(delta) is not int or not 1 <= abs(delta) <= 20):
                raise PrimitiveError("rejected", "Scroll delta must be a nonzero integer <=20")
            self._input("mousemove", *point)
            self._pointer(*point)
            if kind == "move":
                return
            count = 2 if kind == "double_click" else abs(delta) if kind == "scroll" else 1
            if kind == "scroll":
                button = 4 if delta > 0 else 5
            for _ in range(count):
                self._pointer(*point)
                self._buttons.add(button)
                self._input("mousedown", button)
                self._run("mouseup", button)
                self._buttons.discard(button)

    def execute(self, action, cancelled):
        with self._lock:
            started = self._clock()
            self._deadline, self._cancelled = started + 1.75, cancelled
            self._attempted, self._injected = False, False
            receipt = {"ok": False, "status": "rejected", "injected": False}
            try:
                self._guard()
                if not isinstance(action, dict) or action.get("type") not in PHYSICAL | SEMANTIC:
                    raise PrimitiveError("unsupported", "Unsupported native action")
                kind = action["type"]
                if (self._window_at_observation is None
                        or action.get("expected_window") != self._window_at_observation):
                    raise PrimitiveError("rejected", "Exact observed window target is required")
                self._expected = dict(self._window_at_observation)
                self._assert_window()
                if kind in PHYSICAL:
                    self._physical(action)
                else:
                    self._attempted = True
                    self._a11y.execute(action, self._expected, self._assert_window)
                    self._injected = True
                self._guard()
                receipt.update(ok=True, status="injected", action=kind)
            except PrimitiveError as exc:
                receipt.update(status=exc.status, error=str(exc))
            except Exception:
                receipt.update(status="failed", error="Native primitive failed")
            finally:
                self._deadline, self._cancelled = started + 2.0, None
                cleanup = self._release()
                self._expected = None
                receipt.update(injected=self._injected,
                               effect_uncertain=self._attempted and (
                                   not receipt["ok"] or not cleanup),
                               released=cleanup)
                if not cleanup:
                    self._input_quarantined = True
                    receipt.update(ok=False, status="failed", error="Input release not confirmed")
            return receipt

    def _release_typed_keys(self):
        """xdotool type may die mid-key; inspect/release keycodes only on private :77."""
        self._guard()
        lib = ctypes.CDLL("libX11.so.6")
        xtest = ctypes.CDLL("libXtst.so.6")
        lib.XOpenDisplay.argtypes, lib.XOpenDisplay.restype = [ctypes.c_char_p], ctypes.c_void_p
        lib.XQueryKeymap.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        lib.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
        lib.XCloseDisplay.argtypes = [ctypes.c_void_p]
        xtest.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint,
                                          ctypes.c_int, ctypes.c_ulong]
        display = lib.XOpenDisplay(b":77")
        if not display:
            raise PrimitiveError("failed", "Cannot release private-display typed keys")
        try:
            state = (ctypes.c_ubyte * 32)()
            if not lib.XQueryKeymap(display, state):
                raise PrimitiveError("failed", "Cannot inspect typed key state")
            for key in range(8, 256):
                self._guard()
                if state[key // 8] & (1 << (key % 8)):
                    if not xtest.XTestFakeKeyEvent(display, key, 0, 0):
                        raise PrimitiveError("failed", "Native typed-key release failed")
            lib.XSync(display, 0)
            if not lib.XQueryKeymap(display, state) or any(state):
                raise PrimitiveError("failed", "Typed keys remain held")
        finally:
            lib.XCloseDisplay(display)

    def _release(self):
        clean = True
        for command, held in (("mouseup", self._buttons), ("keyup", self._keys)):
            for item in sorted(held, key=lambda item: item in ("ctrl", "shift")):
                try:
                    self._run(command, item)
                    held.discard(item)
                except Exception:
                    clean = False
        if self._type_dirty:
            try:
                self._release_typed_keys()
                self._type_dirty = False
            except Exception:
                clean = False
        return clean

    def release_all(self):
        with self._lock:
            self._deadline, self._cancelled = self._clock() + 2.0, None
            return {"ok": self._release()}

    def launch(self, profile):
        with self._lock:
            if not isinstance(profile, str) or profile not in PROFILES:
                return {"ok": False, "status": "unsupported", "error": "Unknown app profile"}
            try:
                child = subprocess.Popen(PROFILES[profile], env=self._env, cwd="/workspace",
                                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                         stderr=subprocess.DEVNULL, start_new_session=True)
                identity = self._identity(child.pid)
                if identity is None or child.poll() is not None:
                    if child.poll() is None:
                        child.kill()
                    child.wait(timeout=0.1)
                    return {"ok": False, "status": "failed", "error": "App launch not established"}
                self._apps[child.pid] = (child, identity[1])
                return {"ok": True, "status": "launched", "profile": profile, "pid": child.pid}
            except (OSError, ValueError, subprocess.TimeoutExpired):
                return {"ok": False, "status": "unsupported", "error": "Approved app unavailable"}
