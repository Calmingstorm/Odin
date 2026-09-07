"""Explicit existing XTEST slave access. No creation/deletion, keymap edits or cleanup.

Construct only in a dedicated single-threaded helper with an external deadline:
Xlib can block on a dead server and its error handler is process-global. Queries
are snapshots, not leases; supervisors must classify same-code overlap uncertain.
Topology identity alone cannot detect identical-ID reuse; physical_events() also
consumes hierarchy notifications and permanently invalidates a changed connection.
Native libraries and display access are deferred until construction.
"""
from __future__ import annotations

import ctypes as C  # noqa: N812 - conventional short ctypes ABI declarations
import re
import threading
from contextlib import contextmanager


class X11DeviceError(RuntimeError):
    """Bounded native failure."""


class _Info(C.Structure):
    _fields_ = [("deviceid", C.c_int), ("name", C.c_char_p), ("use", C.c_int),
                ("attachment", C.c_int), ("enabled", C.c_int),
                ("num_classes", C.c_int), ("classes", C.c_void_p)]


class _Device(C.Structure):
    _fields_ = [("device_id", C.c_ulong), ("num_classes", C.c_int), ("classes", C.c_void_p)]


class _State(C.Structure):
    _fields_ = [("device_id", C.c_ulong), ("num_classes", C.c_int), ("data", C.c_void_p)]


class _Bits(C.Structure):
    _fields_ = [("kind", C.c_ubyte), ("length", C.c_ubyte),
                ("count", C.c_short), ("bits", C.c_ubyte * 32)]


class _XkbState(C.Structure):
    _fields_ = [("group", C.c_ubyte), ("locked_group", C.c_ubyte),
                ("base_group", C.c_ushort), ("latched_group", C.c_ushort),
                *[(n, C.c_ubyte) for n in ("mods", "base_mods", "latched_mods",
                  "locked_mods", "compat_state", "grab_mods", "compat_grab_mods",
                  "lookup_mods", "compat_lookup_mods")], ("ptr_buttons", C.c_ushort)]


class _ModifierMap(C.Structure):
    _fields_ = [("max_keypermod", C.c_int), ("modifiermap", C.POINTER(C.c_ubyte))]


class _EventMask(C.Structure):
    _fields_ = [("deviceid", C.c_int), ("mask_len", C.c_int), ("mask", C.POINTER(C.c_ubyte))]


class _Cookie(C.Structure):
    _fields_ = [("type", C.c_int), ("serial", C.c_ulong), ("send_event", C.c_int),
                ("display", C.c_void_p), ("extension", C.c_int), ("evtype", C.c_int),
                ("cookie", C.c_uint), ("data", C.c_void_p)]


class _Event(C.Union):
    _fields_ = [("type", C.c_int), ("cookie", _Cookie), ("pad", C.c_long * 24)]


class _RawPrefix(C.Structure):
    _fields_ = [("type", C.c_int), ("serial", C.c_ulong), ("send_event", C.c_int),
                ("display", C.c_void_p), ("extension", C.c_int), ("evtype", C.c_int),
                ("time", C.c_ulong), ("deviceid", C.c_int), ("sourceid", C.c_int),
                ("detail", C.c_int), ("flags", C.c_int)]


_ERROR_HANDLER = C.CFUNCTYPE(C.c_int, C.c_void_p, C.c_void_p)
_LOCK = threading.RLock()
_NAMES = frozenset(("Return", "Escape", "Tab", "BackSpace", "Delete", "space",
                    "Left", "Right", "Up", "Down", "Home", "End", "Page_Up",
                    "Page_Down", "Control_L", "Shift_L"))


def _load_native():
    try:
        x, xi, xt = (C.CDLL(n) for n in ("libX11.so.6", "libXi.so.6", "libXtst.so.6"))
        p, i, u, ul = C.c_void_p, C.c_int, C.c_uint, C.c_ulong
        ip, dp = C.POINTER(i), C.POINTER(_Device)
        specs = [
            (x, "XOpenDisplay", [C.c_char_p], p), (x, "XCloseDisplay", [p], i),
            (x, "XSync", [p, i], i), (x, "XSetErrorHandler", [p], p),
            (x, "XQueryExtension", [p, C.c_char_p, ip, ip, ip], i),
            (x, "XPending", [p], i), (x, "XNextEvent", [p, C.POINTER(_Event)], i),
            (x, "XGetEventData", [p, C.POINTER(_Cookie)], i),
            (x, "XFreeEventData", [p, C.POINTER(_Cookie)], None),
            (x, "XDefaultRootWindow", [p], ul), (x, "XDefaultScreen", [p], i),
            (x, "XDisplayWidth", [p, i], i), (x, "XDisplayHeight", [p, i], i),
            (x, "XQueryPointer", [p, ul, C.POINTER(ul), C.POINTER(ul),
                                  ip, ip, ip, ip, C.POINTER(u)], i),
            (x, "XStringToKeysym", [C.c_char_p], ul),
            (x, "XKeysymToKeycode", [p, ul], C.c_ubyte),
            (x, "XDisplayKeycodes", [p, ip, ip], i),
            (x, "XGetKeyboardMapping", [p, C.c_ubyte, i, ip], C.POINTER(ul)),
            (x, "XFree", [p], i),
            (x, "XkbGetState", [p, u, C.POINTER(_XkbState)], i),
            (x, "XkbLookupKeySym", [p, C.c_ubyte, u, C.POINTER(u), C.POINTER(ul)], i),
            (x, "XGetModifierMapping", [p], C.POINTER(_ModifierMap)),
            (x, "XFreeModifiermap", [C.POINTER(_ModifierMap)], i),
            (xi, "XIQueryVersion", [p, ip, ip], i),
            (xi, "XISelectEvents", [p, ul, C.POINTER(_EventMask), i], i),
            (xi, "XIQueryDevice", [p, i, ip], C.POINTER(_Info)),
            (xi, "XIFreeDeviceInfo", [C.POINTER(_Info)], None),
            (xi, "XOpenDevice", [p, ul], dp), (xi, "XCloseDevice", [p, dp], i),
            (xi, "XQueryDeviceState", [p, dp], C.POINTER(_State)),
            (xi, "XFreeDeviceState", [C.POINTER(_State)], None),
            (xt, "XTestQueryExtension", [p, ip, ip, ip, ip], i),
            (xt, "XTestFakeDeviceKeyEvent", [p, dp, u, i, ip, i, ul], i),
            (xt, "XTestFakeDeviceButtonEvent", [p, dp, u, i, ip, i, ul], i),
            (xt, "XTestFakeMotionEvent", [p, i, i, i, ul], i),
        ]
        for lib, name, args, result in specs:
            fn = getattr(lib, name)
            fn.argtypes, fn.restype = args, result
        return x, xi, xt
    except (OSError, AttributeError):
        raise X11DeviceError("native_libraries_unavailable") from None


class ExistingXTest:
    def __init__(self, display_name: str):
        if (not isinstance(display_name, str)
                or not re.fullmatch(r":[0-9]{1,5}(?:\.[0-9]{1,2})?", display_name)):
            raise X11DeviceError("explicit_local_display_required")
        self._x, self._xi, self._xt = _load_native()
        self._display = self._x.XOpenDisplay(display_name.encode("ascii"))
        self._devices = {}
        self.physical_seen = False
        self._invalidated = False
        self._mapping_changed = False
        if not self._display:
            raise X11DeviceError("display_unavailable")
        try:
            with self._checked():
                major, minor = C.c_int(2), C.c_int(1)
                if self._xi.XIQueryVersion(self._display, C.byref(major), C.byref(minor)) != 0:
                    raise X11DeviceError("xi2_unavailable")
                if (major.value, minor.value) < (2, 1):
                    raise X11DeviceError("xi21_raw_events_required")
                values = [C.c_int() for _ in range(4)]
                if not self._xt.XTestQueryExtension(self._display, *(C.byref(v) for v in values)):
                    raise X11DeviceError("xtest_unavailable")
                opcode, event, error = C.c_int(), C.c_int(), C.c_int()
                if not self._x.XQueryExtension(self._display, b"XInputExtension",
                                              C.byref(opcode), C.byref(event), C.byref(error)):
                    raise X11DeviceError("xi2_unavailable")
                self._opcode = opcode.value
                # Subscribe BEFORE the initial census. Hierarchy changes poison
                # this connection even if an ID/name is later reused identically.
                raw = (C.c_ubyte * 3)(0, 0xE0, 1)
                hierarchy = (C.c_ubyte * 2)(0, 1 << 3)
                masks = (_EventMask * 2)(_EventMask(1, 3, raw), _EventMask(0, 2, hierarchy))
                root = self._x.XDefaultRootWindow(self._display)
                if self._xi.XISelectEvents(self._display, root, masks, 2) != 0:
                    raise X11DeviceError("physical_event_subscription_failed")
            self._initial = self.identity()
            for row in self._initial:
                if row[1] in ("Virtual core XTEST keyboard", "Virtual core XTEST pointer"):
                    kind = "keys" if row[2] == 4 else "buttons"
                    with self._checked():
                        device = self._xi.XOpenDevice(self._display, row[0])
                        if not device or device.contents.device_id != row[0]:
                            raise X11DeviceError("xtest_open_failed")
                        self._devices[kind] = device
            self._assert_identity()
            self._keymap = self._keymap_snapshot()
        except BaseException:
            self.close()
            raise

    @contextmanager
    def _checked(self):
        if not self._display:
            raise X11DeviceError("display_closed")
        errors: list[bool] = []

        @_ERROR_HANDLER
        def handler(_display, _event):
            if not errors:
                errors.append(True)
            return 0

        with _LOCK:
            old = self._x.XSetErrorHandler(C.cast(handler, C.c_void_p))
            try:
                yield
                self._x.XSync(self._display, 0)
                if errors:
                    raise X11DeviceError("x11_protocol_error")
            finally:
                self._x.XSync(self._display, 0)
                self._x.XSetErrorHandler(old)

    def _topology(self):
        with self._checked():
            count = C.c_int()
            info = self._xi.XIQueryDevice(self._display, 0, C.byref(count))
            if not info:
                raise X11DeviceError("device_query_failed")
            try:
                if not 1 <= count.value <= 1024:
                    raise X11DeviceError("invalid_device_count")
                rows = []
                for n in range(count.value):
                    d = info[n]
                    if not d.name:
                        raise X11DeviceError("device_name_missing")
                    rows.append((d.deviceid, d.name.decode("utf-8", "replace"),
                                 d.use, d.attachment, bool(d.enabled)))
                if len({r[0] for r in rows}) != len(rows):
                    raise X11DeviceError("duplicate_device_id")
                return rows
            finally:
                self._xi.XIFreeDeviceInfo(info)

    def identity(self) -> tuple:
        if self._invalidated:
            raise X11DeviceError("device_topology_changed")
        rows, selected = self._topology(), {}
        for name, use in (("Virtual core pointer", 1), ("Virtual core keyboard", 2),
                          ("Virtual core XTEST pointer", 3), ("Virtual core XTEST keyboard", 4)):
            matches = [r for r in rows if r[1] == name]
            if len(matches) != 1 or matches[0][2] != use or not matches[0][4]:
                raise X11DeviceError("core_xtest_topology_invalid")
            selected[use] = matches[0]
        if (selected[1][3] != selected[2][0] or selected[2][3] != selected[1][0]
                or selected[3][3] != selected[1][0] or selected[4][3] != selected[2][0]):
            raise X11DeviceError("core_xtest_attachment_invalid")
        masters = {selected[1][0], selected[2][0]}
        return tuple(sorted(r for r in rows
                            if r[0] in masters or (r[2] in (3, 4) and r[3] in masters)))

    def _assert_identity(self):
        if self._invalidated or self.identity() != self._initial:
            raise X11DeviceError("device_topology_changed")

    def _keymap_snapshot(self):
        with self._checked():
            low, high, width = C.c_int(), C.c_int(), C.c_int()
            self._x.XDisplayKeycodes(self._display, C.byref(low), C.byref(high))
            count = high.value - low.value + 1
            if not 1 <= count <= 256:
                raise X11DeviceError("keyboard_mapping_unavailable")
            values = self._x.XGetKeyboardMapping(self._display, low.value, count, C.byref(width))
            if not values:
                raise X11DeviceError("keyboard_mapping_unavailable")
            try:
                if not 1 <= width.value <= 64:
                    raise X11DeviceError("keyboard_mapping_unavailable")
                return low.value, high.value, width.value, tuple(values[:count * width.value])
            finally:
                self._x.XFree(values)

    def physical_events(self) -> list[tuple[str, int, bool]]:
        """Drain raw edges including short taps; kind is 'keys' or 'buttons'.

        Ignore only our existing XTEST source IDs, and unrelated master seats.
        physical_seen latches forever. Overflow/cookie loss/hierarchy changes fail
        closed; the supervisor must not interpret these failures as an empty queue.
        """
        self._assert_identity()
        own = {d.contents.device_id for d in self._devices.values()}
        sources = {r[0] for r in self._initial if r[2] in (3, 4) and r[4]}
        result = []
        with self._checked():
            for _ in range(4096):
                if not self._x.XPending(self._display):
                    break
                event = _Event()
                self._x.XNextEvent(self._display, C.byref(event))
                if event.type == 34:
                    # Redundant master adoption of XTEST keymap isn't a change.
                    # An actual map change aborts input but keeps ledger release.
                    if self._keymap_snapshot() != self._keymap:
                        self._mapping_changed = True
                    continue
                cookie = event.cookie
                if event.type != 35 or cookie.extension != self._opcode:
                    continue
                if cookie.evtype == 11:
                    self._invalidated = True
                    raise X11DeviceError("device_topology_changed")
                if cookie.evtype not in (13, 14, 15, 16):
                    continue
                if not self._x.XGetEventData(self._display, C.byref(cookie)):
                    self._invalidated = True
                    raise X11DeviceError("physical_event_data_unavailable")
                try:
                    if not cookie.data:
                        self._invalidated = True
                        raise X11DeviceError("physical_event_data_unavailable")
                    raw = C.cast(cookie.data, C.POINTER(_RawPrefix)).contents
                    if raw.sourceid in own or raw.sourceid not in sources:
                        continue
                    if not 1 <= raw.detail <= 255:
                        self._invalidated = True
                        raise X11DeviceError("physical_event_code_invalid")
                    self.physical_seen = True
                    result.append(("keys" if cookie.evtype in (13, 14) else "buttons",
                                   raw.detail, cookie.evtype in (13, 15)))
                finally:
                    self._x.XFreeEventData(self._display, C.byref(cookie))
            else:
                self._invalidated = True
                raise X11DeviceError("physical_event_queue_overflow")
        self._assert_identity()
        if self._mapping_changed:
            result.append(("mapping", 0, True))
        return result

    def _state(self, device, required):
        with self._checked():
            state = self._xi.XQueryDeviceState(self._display, device)
            if not state:
                raise X11DeviceError("device_state_unavailable")
            try:
                s = state.contents
                if (s.device_id != device.contents.device_id
                        or not 1 <= s.num_classes <= 32 or not s.data):
                    raise X11DeviceError("device_state_invalid")
                result: dict[str, set[int]] = {"keys": set(), "buttons": set()}
                found, address = set(), s.data
                for _ in range(s.num_classes):
                    kind, length = (C.c_ubyte * 2).from_address(address)
                    if length < 2:
                        raise X11DeviceError("device_state_invalid")
                    if kind in (0, 1):
                        if length < C.sizeof(_Bits) or kind in found:
                            raise X11DeviceError("device_state_invalid")
                        found.add(kind)
                        bits = _Bits.from_address(address)
                        if not 0 <= bits.count <= 256:
                            raise X11DeviceError("device_state_invalid")
                        result["keys" if kind == 0 else "buttons"] = {
                            n for n in range(256) if bits.bits[n // 8] & (1 << (n % 8))}
                    address += length
                if (0 if required == "keys" else 1) not in found:
                    raise X11DeviceError("device_state_class_missing")
                return result
            finally:
                self._xi.XFreeDeviceState(state)

    def held(self) -> dict[str, set[int]]:
        self._assert_identity()
        result = {kind: self._state(device, kind)[kind] for kind, device in self._devices.items()}
        self._assert_identity()
        return result

    def owned_release_state(self) -> dict[str, set[int]]:
        """Check original core endpoints even after unrelated hotplug/map loss.

        Never follow replaced/reattached synthetic endpoints. Physical handles
        are never injection targets. Caller must own a potential-down ledger.
        """
        names = {"Virtual core pointer", "Virtual core keyboard",
                 "Virtual core XTEST pointer", "Virtual core XTEST keyboard"}
        expected = tuple(r for r in self._initial if r[1] in names)
        actual = tuple(sorted(r for r in self._topology() if r[1] in names))
        if actual != expected:
            raise X11DeviceError("owned_endpoint_changed")
        return {kind: self._state(device, kind)[kind] for kind, device in self._devices.items()}

    def release_owned(self, kind, code):
        """Only supervisor ledger calls this, with potentially-owned codes."""
        if kind not in {"key", "button"} or type(code) is not int or not 1 <= code <= 255:
            raise X11DeviceError("invalid_owned_release")
        self.owned_release_state()
        field = "keys" if kind == "key" else "buttons"
        fn = (self._xt.XTestFakeDeviceKeyEvent if kind == "key"
              else self._xt.XTestFakeDeviceButtonEvent)
        with self._checked():
            if not fn(self._display, self._devices[field], code, 0, None, 0, 0):
                raise X11DeviceError("owned_release_failed")
        self.owned_release_state()

    def physical_held(self) -> dict[str, set[int]]:
        self._assert_identity()
        result: dict[str, set[int]] = {"keys": set(), "buttons": set()}
        own = {d.contents.device_id for d in self._devices.values()}
        for device_id, _name, use, _attachment, enabled in self._initial:
            if use not in (3, 4) or not enabled or device_id in own:
                continue
            kind, device = ("keys" if use == 4 else "buttons"), None
            try:
                with self._checked():
                    device = self._xi.XOpenDevice(self._display, device_id)
                    if not device or device.contents.device_id != device_id:
                        raise X11DeviceError("physical_device_unavailable")
                state = self._state(device, kind)
                for field in result:
                    result[field].update(state[field])
            finally:
                if device:
                    with self._checked():
                        self._xi.XCloseDevice(self._display, device)
        self._assert_identity()
        return result

    def _event(self, kind, code, down):
        if (type(code) is not int or not (8 if kind == "keys" else 1) <= code <= 255
                or type(down) is not bool):
            raise X11DeviceError("invalid_input_code")
        self._assert_identity()
        fn = (self._xt.XTestFakeDeviceKeyEvent if kind == "keys"
              else self._xt.XTestFakeDeviceButtonEvent)
        with self._checked():
            if not fn(self._display, self._devices[kind], code, int(down), None, 0, 0):
                raise X11DeviceError("xtest_input_failed")
        self._assert_identity()

    def key(self, code: int, down: bool):
        self._event("keys", code, down)

    def button(self, code: int, down: bool):
        self._event("buttons", code, down)

    def move(self, x: int, y: int):
        self._assert_identity()
        with self._checked():
            screen = self._x.XDefaultScreen(self._display)
            width = self._x.XDisplayWidth(self._display, screen)
            height = self._x.XDisplayHeight(self._display, screen)
            if type(x) is not int or type(y) is not int or not (0 <= x < width and 0 <= y < height):
                raise X11DeviceError("pointer_out_of_bounds")
            if not self._xt.XTestFakeMotionEvent(self._display, screen, x, y, 0):
                raise X11DeviceError("xtest_motion_failed")
        self._assert_identity()

    def pointer(self) -> tuple[int, int]:
        with self._checked():
            root, child = C.c_ulong(), C.c_ulong()
            rx, ry, wx, wy, mask = C.c_int(), C.c_int(), C.c_int(), C.c_int(), C.c_uint()
            if not self._x.XQueryPointer(self._display, self._x.XDefaultRootWindow(self._display),
                                        C.byref(root), C.byref(child), C.byref(rx), C.byref(ry),
                                        C.byref(wx), C.byref(wy), C.byref(mask)):
                raise X11DeviceError("pointer_unavailable")
            return rx.value, ry.value

    def keycode(self, name: str) -> int:
        if not isinstance(name, str) or (name not in _NAMES
                                        and not (len(name) == 1 and name.isascii()
                                                 and name.isalnum())):
            raise X11DeviceError("unsupported_key_name")
        with self._checked():
            symbol = self._x.XStringToKeysym(name.encode("ascii"))
            code = self._x.XKeysymToKeycode(self._display, symbol) if symbol else 0
            if not 8 <= code <= 255:
                raise X11DeviceError("key_not_in_layout")
            return code

    def text_keys(self, text: str) -> list[list[int]]:
        """Press-order chords; release each in reverse. Active XKB group/locks.

        Fail closed on active/latched modifiers or non-ASCII; no keymap changes.
        Dispatch must recheck layout/state because the returned list is no lease.
        """
        if (not isinstance(text, str) or len(text) > 4096
                or any(not 32 <= ord(c) <= 126 for c in text)):
            raise X11DeviceError("printable_ascii_required")
        with self._checked():
            state = _XkbState()
            if self._x.XkbGetState(self._display, 0x100, C.byref(state)) != 0:
                raise X11DeviceError("keyboard_state_unavailable")
            if (state.base_mods or state.latched_mods or state.latched_group
                    or state.group > 3 or state.locked_mods & ~18):
                raise X11DeviceError("keyboard_modifiers_busy")
            shift = self.keycode("Shift_L")
            mapping = self._x.XGetModifierMapping(self._display)
            if not mapping:
                raise X11DeviceError("modifier_map_unavailable")
            try:
                m = mapping.contents
                if (not 1 <= m.max_keypermod <= 256 or not m.modifiermap
                        or shift not in m.modifiermap[:m.max_keypermod]):
                    raise X11DeviceError("shift_mapping_unavailable")
                all_modifiers = list(m.modifiermap[:8 * m.max_keypermod])
                if shift in all_modifiers[m.max_keypermod:]:
                    raise X11DeviceError("shift_mapping_ambiguous")
                modifier_codes = set(all_modifiers)
            finally:
                self._x.XFreeModifiermap(mapping)
            low, high = C.c_int(), C.c_int()
            self._x.XDisplayKeycodes(self._display, C.byref(low), C.byref(high))
            if not 8 <= low.value <= high.value <= 255:
                raise X11DeviceError("keycode_range_invalid")
            chords: dict[str, list[int]] = {}
            for shifted in (False, True):
                mask = (state.group << 13) | state.locked_mods | int(shifted)
                for code in range(low.value, high.value + 1):
                    if code in modifier_codes:
                        continue
                    consumed, symbol = C.c_uint(), C.c_ulong()
                    if self._x.XkbLookupKeySym(self._display, code, mask,
                                               C.byref(consumed), C.byref(symbol)):
                        if 32 <= symbol.value <= 126:
                            chord = [shift, code] if shifted else [code]
                            chords.setdefault(chr(symbol.value), chord)
            if any(c not in chords for c in text):
                raise X11DeviceError("text_not_in_active_layout")
            return [list(chords[c]) for c in text]

    def sync(self):
        with self._checked():
            pass

    def close(self):
        """Close handles only, never release input or delete devices."""
        if not self._display:
            return
        try:
            with self._checked():
                for device in self._devices.values():
                    self._xi.XCloseDevice(self._display, device)
                self._devices.clear()
        finally:
            self._x.XCloseDisplay(self._display)
            self._display = None
