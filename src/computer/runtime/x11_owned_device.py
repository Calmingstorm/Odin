"""Explicit XTEST access, with optional server-lifetime independent master reuse.

Construct only in a dedicated single-threaded helper with an external deadline:
Xlib can block on a dead server and its error handler is process-global. Queries
are snapshots, not leases; supervisors must classify same-code overlap uncertain.
Topology identity alone cannot detect identical-ID reuse; physical_events() also
consumes hierarchy notifications and permanently invalidates a changed connection.
Native libraries and display access are deferred until construction.
"""

from __future__ import annotations

import ctypes as C  # noqa: N812 - conventional short ctypes ABI declarations
import hashlib
import os
import re
import threading
import time
from collections.abc import Callable
from contextlib import contextmanager

EndpointRow = tuple[int, str, int, int, bool]
EndpointIdentity = tuple[EndpointRow, ...]
CoreSlaveIdentity = tuple[tuple[int, str, int, bool], ...]


class X11DeviceError(RuntimeError):
    """Bounded native failure."""


class HierarchyAddUnavailableError(X11DeviceError):
    """Add rejected and a post-error census proved no retained endpoints."""


def _endpoint_keymap(display, device_id):
    """Read the complete XKB map, including types/actions, for an exact endpoint.

    Xlib's core lookup follows the client master, not the injected XTEST slave.
    Comparing complete serialized maps avoids accepting different key types,
    modifiers or actions with identical base symbols. No map is changed.
    Missing introspection fences keys, not independent pointer support.
    """
    try:
        bridge = C.CDLL("libX11-xcb.so.1")
        common = C.CDLL("libxkbcommon.so.0")
        x11 = C.CDLL("libxkbcommon-x11.so.0")
        libc = C.CDLL(None)
        specs = [
            (bridge, "XGetXCBConnection", [C.c_void_p], C.c_void_p),
            (common, "xkb_context_new", [C.c_int], C.c_void_p),
            (common, "xkb_context_unref", [C.c_void_p], None),
            (common, "xkb_keymap_unref", [C.c_void_p], None),
            (common, "xkb_keymap_get_as_string", [C.c_void_p, C.c_int], C.c_void_p),
            (
                x11,
                "xkb_x11_keymap_new_from_device",
                [C.c_void_p, C.c_void_p, C.c_int32, C.c_int],
                C.c_void_p,
            ),
            (libc, "free", [C.c_void_p], None),
        ]
        for lib, name, args, result in specs:
            fn = getattr(lib, name)
            fn.argtypes, fn.restype = args, result
        context = common.xkb_context_new(0)
        if not context:
            raise X11DeviceError("injected_keyboard_mapping_unavailable")
        keymap = text = None
        try:
            connection = bridge.XGetXCBConnection(display)
            if not connection:
                raise X11DeviceError("injected_keyboard_mapping_unavailable")
            keymap = x11.xkb_x11_keymap_new_from_device(context, connection, device_id, 0)
            if not keymap:
                raise X11DeviceError("injected_keyboard_mapping_unavailable")
            text = common.xkb_keymap_get_as_string(keymap, 1)
            if not text:
                raise X11DeviceError("injected_keyboard_mapping_unavailable")
            return hashlib.sha256(C.string_at(text)).hexdigest()
        finally:
            if text:
                libc.free(text)
            if keymap:
                common.xkb_keymap_unref(keymap)
            common.xkb_context_unref(context)
    except (OSError, AttributeError):
        raise X11DeviceError("injected_keyboard_mapping_unavailable") from None


class UnsupportedCharacters(X11DeviceError):  # noqa: N818 - structured native result
    def __init__(self, characters):
        super().__init__("unsupported_character")
        self.characters = characters


class _AddMaster(C.Structure):
    _fields_ = [
        ("type", C.c_int),
        ("name", C.c_char_p),
        ("send_core", C.c_int),
        ("enable", C.c_int),
    ]


class _RemoveMaster(C.Structure):
    _fields_ = [
        ("type", C.c_int),
        ("deviceid", C.c_int),
        ("return_mode", C.c_int),
        ("return_pointer", C.c_int),
        ("return_keyboard", C.c_int),
    ]


class _AttachSlave(C.Structure):
    _fields_ = [("type", C.c_int), ("deviceid", C.c_int), ("new_master", C.c_int)]


class _Info(C.Structure):
    _fields_ = [
        ("deviceid", C.c_int),
        ("name", C.c_char_p),
        ("use", C.c_int),
        ("attachment", C.c_int),
        ("enabled", C.c_int),
        ("num_classes", C.c_int),
        ("classes", C.c_void_p),
    ]


class _Device(C.Structure):
    _fields_ = [("device_id", C.c_ulong), ("num_classes", C.c_int), ("classes", C.c_void_p)]


class _State(C.Structure):
    _fields_ = [("device_id", C.c_ulong), ("num_classes", C.c_int), ("data", C.c_void_p)]


class _Bits(C.Structure):
    _fields_ = [
        ("kind", C.c_ubyte),
        ("length", C.c_ubyte),
        ("count", C.c_short),
        ("bits", C.c_ubyte * 32),
    ]


class _XkbState(C.Structure):
    _fields_ = [
        ("group", C.c_ubyte),
        ("locked_group", C.c_ubyte),
        ("base_group", C.c_ushort),
        ("latched_group", C.c_ushort),
        *[
            (n, C.c_ubyte)
            for n in (
                "mods",
                "base_mods",
                "latched_mods",
                "locked_mods",
                "compat_state",
                "grab_mods",
                "compat_grab_mods",
                "lookup_mods",
                "compat_lookup_mods",
            )
        ],
        ("ptr_buttons", C.c_ushort),
    ]


class _ModifierMap(C.Structure):
    _fields_ = [("max_keypermod", C.c_int), ("modifiermap", C.POINTER(C.c_ubyte))]


class _EventMask(C.Structure):
    _fields_ = [("deviceid", C.c_int), ("mask_len", C.c_int), ("mask", C.POINTER(C.c_ubyte))]


class _Cookie(C.Structure):
    _fields_ = [
        ("type", C.c_int),
        ("serial", C.c_ulong),
        ("send_event", C.c_int),
        ("display", C.c_void_p),
        ("extension", C.c_int),
        ("evtype", C.c_int),
        ("cookie", C.c_uint),
        ("data", C.c_void_p),
    ]


class _Event(C.Union):
    _fields_ = [("type", C.c_int), ("cookie", _Cookie), ("pad", C.c_long * 24)]


class _RawPrefix(C.Structure):
    _fields_ = [
        ("type", C.c_int),
        ("serial", C.c_ulong),
        ("send_event", C.c_int),
        ("display", C.c_void_p),
        ("extension", C.c_int),
        ("evtype", C.c_int),
        ("time", C.c_ulong),
        ("deviceid", C.c_int),
        ("sourceid", C.c_int),
        ("detail", C.c_int),
        ("flags", C.c_int),
    ]


_ERROR_HANDLER = C.CFUNCTYPE(C.c_int, C.c_void_p, C.c_void_p)
_LOCK = threading.RLock()


def _load_native():
    try:
        x, xi, xt = (C.CDLL(n) for n in ("libX11.so.6", "libXi.so.6", "libXtst.so.6"))
        p, i, u, ul = C.c_void_p, C.c_int, C.c_uint, C.c_ulong
        ip, dp = C.POINTER(i), C.POINTER(_Device)
        specs = [
            (x, "XOpenDisplay", [C.c_char_p], p),
            (x, "XCloseDisplay", [p], i),
            (x, "XGrabServer", [p], i),
            (x, "XUngrabServer", [p], i),
            (x, "XSync", [p, i], i),
            (x, "XSetErrorHandler", [p], p),
            (x, "XQueryExtension", [p, C.c_char_p, ip, ip, ip], i),
            (x, "XPending", [p], i),
            (x, "XNextEvent", [p, C.POINTER(_Event)], i),
            (x, "XGetEventData", [p, C.POINTER(_Cookie)], i),
            (x, "XFreeEventData", [p, C.POINTER(_Cookie)], None),
            (x, "XDefaultRootWindow", [p], ul),
            (x, "XDefaultScreen", [p], i),
            (x, "XDisplayWidth", [p, i], i),
            (x, "XDisplayHeight", [p, i], i),
            (
                x,
                "XQueryPointer",
                [p, ul, C.POINTER(ul), C.POINTER(ul), ip, ip, ip, ip, C.POINTER(u)],
                i,
            ),
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
            (xi, "XIChangeHierarchy", [p, p, i], i),
            (xi, "XISetClientPointer", [p, ul, i], i),
            (xi, "XIGetClientPointer", [p, ul, ip], i),
            (xi, "XISetFocus", [p, i, ul, ul], i),
            (xi, "XIGrabDevice", [p, i, ul, ul, ul, i, i, i, C.POINTER(_EventMask)], i),
            (xi, "XIUngrabDevice", [p, i, ul], i),
            (xi, "XISelectEvents", [p, ul, C.POINTER(_EventMask), i], i),
            (xi, "XIQueryDevice", [p, i, ip], C.POINTER(_Info)),
            (xi, "XIFreeDeviceInfo", [C.POINTER(_Info)], None),
            (xi, "XOpenDevice", [p, ul], dp),
            (xi, "XCloseDevice", [p, dp], i),
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


def _prove_modifier_effects(display, keyboard_id, group, codes, slots, locked_mods=0):
    """Simulate each modifier in the actual XKB map, not keysym naming alone."""
    context = keymap = state = None
    try:
        bridge = C.CDLL("libX11-xcb.so.1")
        common = C.CDLL("libxkbcommon.so.0")
        x11 = C.CDLL("libxkbcommon-x11.so.0")
        p, u = C.c_void_p, C.c_uint32
        specs = [
            (bridge, "XGetXCBConnection", [p], p),
            (common, "xkb_context_new", [C.c_int], p),
            (common, "xkb_context_unref", [p], None),
            (common, "xkb_keymap_unref", [p], None),
            (common, "xkb_state_new", [p], p),
            (common, "xkb_state_unref", [p], None),
            (common, "xkb_state_update_mask", [p, u, u, u, u, u, u], C.c_int),
            (common, "xkb_state_update_key", [p, u, C.c_int], C.c_int),
            (common, "xkb_state_serialize_mods", [p, C.c_int], u),
            (common, "xkb_state_serialize_layout", [p, C.c_int], u),
            (x11, "xkb_x11_get_core_keyboard_device_id", [p], C.c_int32),
            (x11, "xkb_x11_keymap_new_from_device", [p, p, C.c_int32, C.c_int], p),
        ]
        for lib, name, args, result in specs:
            fn = getattr(lib, name)
            fn.argtypes, fn.restype = args, result
        context = common.xkb_context_new(0)
        connection = bridge.XGetXCBConnection(display)
        if not context or not connection:
            raise X11DeviceError("unsupported_key")
        if keyboard_id == 0x100:
            keyboard_id = x11.xkb_x11_get_core_keyboard_device_id(connection)
        keymap = x11.xkb_x11_keymap_new_from_device(context, connection, keyboard_id, 0)
        if not keymap:
            raise X11DeviceError("unsupported_key")
        for code, slot in zip(codes, slots, strict=True):
            state = common.xkb_state_new(keymap)
            if not state:
                raise X11DeviceError("unsupported_key")
            common.xkb_state_update_mask(state, 0, 0, locked_mods, 0, 0, group)
            common.xkb_state_update_key(state, code, 1)
            # Effective layout plus depressed/latched/locked real modifiers.
            if (
                common.xkb_state_serialize_mods(state, 1) != 1 << slot
                or common.xkb_state_serialize_mods(state, 2 | 4) != locked_mods
                or common.xkb_state_serialize_layout(state, 128) != group
            ):
                raise X11DeviceError("unsupported_key")
            common.xkb_state_unref(state)
            state = None
    except (OSError, AttributeError):
        raise X11DeviceError("unsupported_key") from None
    finally:
        if state:
            common.xkb_state_unref(state)
        if keymap:
            common.xkb_keymap_unref(keymap)
        if context:
            common.xkb_context_unref(context)


def resolve_key_plan(x, display, keyboard_id, modifiers, symbol_name=None):
    """Read-only XKB admission; no shifted-level or modifier-slot guessing.

    Explicit modifiers apply to a proven base key (ctrl+shift+s). A/exclam
    requiring implicit levels are rejected rather than silently sent as a/1.
    """
    names = {
        "ctrl": ("Control_L", 2),
        "shift": ("Shift_L", 0),
        "alt": ("Alt_L", 3),
        "super": ("Super_L", 6),
    }
    if (
        type(modifiers) not in (list, tuple)
        or len(modifiers) > 4
        or any(type(m) is not str or m not in names for m in modifiers)
        or len(set(modifiers)) != len(modifiers)
    ):
        raise X11DeviceError("unsupported_key")
    state = _XkbState()
    if (
        x.XkbGetState(display, keyboard_id, C.byref(state)) != 0
        or state.base_mods
        or state.latched_mods
        or state.locked_mods & ~18
        or state.latched_group
        or state.group > 3
    ):
        raise X11DeviceError("unsupported_key")

    def base_code(name):
        if type(name) is not str or re.fullmatch(r"[A-Za-z0-9_]{1,128}", name) is None:
            raise X11DeviceError("unsupported_key")
        symbol = x.XStringToKeysym(name.encode("ascii"))
        code = x.XKeysymToKeycode(display, symbol) if symbol else 0
        consumed, actual = C.c_uint(), C.c_ulong()
        if (
            not 8 <= code <= 255
            or not x.XkbLookupKeySym(
                display,
                code,
                (state.group << 13) | state.locked_mods,
                C.byref(consumed),
                C.byref(actual),
            )
            or actual.value != symbol
        ):
            raise X11DeviceError("unsupported_key")
        return code

    codes = [base_code(names[m][0]) for m in modifiers]
    mapping = x.XGetModifierMapping(display)
    if not mapping:
        raise X11DeviceError("unsupported_key")
    try:
        m = mapping.contents
        if not 1 <= m.max_keypermod <= 256 or not m.modifiermap:
            raise X11DeviceError("unsupported_key")
        slots = list(m.modifiermap[: 8 * m.max_keypermod])
        for name, code in zip(modifiers, codes, strict=True):
            if {i // m.max_keypermod for i, value in enumerate(slots) if value == code} != {
                names[name][1]
            }:
                raise X11DeviceError("unsupported_key")
        if codes:
            _prove_modifier_effects(
                display,
                keyboard_id,
                state.group,
                codes,
                [names[name][1] for name in modifiers],
                state.locked_mods,
            )
        if symbol_name is not None:
            code = base_code(symbol_name)
            if code in slots:
                raise X11DeviceError("unsupported_key")
            codes.append(code)
    finally:
        x.XFreeModifiermap(mapping)
    if len(set(codes)) != len(codes):
        raise X11DeviceError("unsupported_key")
    return codes


class ExistingXTest:
    prefix = "Virtual core"
    independent_pointer = False

    def _keyboard_id(self):
        return 0x100

    def _prepare_master(self):
        pass

    def __init__(self, display_name: str):
        if not isinstance(display_name, str) or not re.fullmatch(
            r":[0-9]{1,5}(?:\.[0-9]{1,2})?", display_name
        ):
            raise X11DeviceError("explicit_local_display_required")
        self._x, self._xi, self._xt = _load_native()
        self._display = self._x.XOpenDisplay(display_name.encode("ascii"))
        self._devices = {}
        self.physical_seen = False
        self._invalidated = False
        self._mapping_changed = False
        self._text_state = None
        self.keyboard_mapping_identity = None
        self.dispatch_check: Callable[[], None] | None = None
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
                if not self._x.XQueryExtension(
                    self._display,
                    b"XInputExtension",
                    C.byref(opcode),
                    C.byref(event),
                    C.byref(error),
                ):
                    raise X11DeviceError("xi2_unavailable")
                self._opcode = opcode.value
                self._prepare_master()
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
                if row[1] in (self.prefix + " XTEST keyboard", self.prefix + " XTEST pointer"):
                    kind = "keys" if row[2] == 4 else "buttons"
                    with self._checked():
                        device = self._xi.XOpenDevice(self._display, row[0])
                        if not device or device.contents.device_id != row[0]:
                            raise X11DeviceError("xtest_open_failed")
                        self._devices[kind] = device
            self._assert_identity()
            self._keymap = self._keymap_snapshot()
        except BaseException:
            try:
                self._startup_failure_cleanup()
            finally:
                self.close()
            raise

    def _startup_failure_cleanup(self):
        """Subclass hook. Base/shared endpoints must never be altered here."""
        pass

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
                    rows.append(
                        (
                            d.deviceid,
                            d.name.decode("utf-8", "replace"),
                            d.use,
                            d.attachment,
                            bool(d.enabled),
                        )
                    )
                if len({r[0] for r in rows}) != len(rows):
                    raise X11DeviceError("duplicate_device_id")
                return rows
            finally:
                self._xi.XIFreeDeviceInfo(info)

    def identity(self) -> tuple:
        if self._invalidated:
            raise X11DeviceError("device_topology_changed")
        rows, selected = self._topology(), {}
        for name, use in (
            (self.prefix + " pointer", 1),
            (self.prefix + " keyboard", 2),
            (self.prefix + " XTEST pointer", 3),
            (self.prefix + " XTEST keyboard", 4),
        ):
            matches = [r for r in rows if r[1] == name]
            if len(matches) != 1 or matches[0][2] != use or not matches[0][4]:
                raise X11DeviceError("core_xtest_topology_invalid")
            selected[use] = matches[0]
        if (
            selected[1][3] != selected[2][0]
            or selected[2][3] != selected[1][0]
            or selected[3][3] != selected[1][0]
            or selected[4][3] != selected[2][0]
        ):
            raise X11DeviceError("core_xtest_attachment_invalid")
        masters = {selected[1][0], selected[2][0]}
        return tuple(
            sorted(r for r in rows if r[0] in masters or (r[2] in (3, 4) and r[3] in masters))
        )

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
                return low.value, high.value, width.value, tuple(values[: count * width.value])
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
                    result.append(
                        (
                            "keys" if cookie.evtype in (13, 14) else "buttons",
                            raw.detail,
                            cookie.evtype in (13, 15),
                        )
                    )
                finally:
                    self._x.XFreeEventData(self._display, C.byref(cookie))
            else:
                self._invalidated = True
                raise X11DeviceError("physical_event_queue_overflow")
        self._assert_identity()
        if self._mapping_changed:
            result.append(("mapping", 0, True))
        if self._text_state is not None:
            with self._checked():
                state = _XkbState()
                if self._x.XkbGetState(self._display, self._keyboard_id(), C.byref(state)) != 0:
                    raise X11DeviceError("keyboard_state_unavailable")
                if (state.group, state.locked_mods, state.latched_group) != self._text_state:
                    raise X11DeviceError("keyboard_state_changed")
        return result

    def _state(self, device, required):
        with self._checked():
            state = self._xi.XQueryDeviceState(self._display, device)
            if not state:
                raise X11DeviceError("device_state_unavailable")
            try:
                s = state.contents
                if (
                    s.device_id != device.contents.device_id
                    or not 1 <= s.num_classes <= 32
                    or not s.data
                ):
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
                            n for n in range(256) if bits.bits[n // 8] & (1 << (n % 8))
                        }
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
        names = {
            self.prefix + suffix
            for suffix in (" pointer", " keyboard", " XTEST pointer", " XTEST keyboard")
        }
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
        fn = (
            self._xt.XTestFakeDeviceKeyEvent
            if kind == "key"
            else self._xt.XTestFakeDeviceButtonEvent
        )
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
        if (
            type(code) is not int
            or not (8 if kind == "keys" else 1) <= code <= 255
            or type(down) is not bool
        ):
            raise X11DeviceError("invalid_input_code")
        self._assert_identity()
        if kind == "keys" and down:
            self._assert_keyboard_mapping()
        fn = (
            self._xt.XTestFakeDeviceKeyEvent
            if kind == "keys"
            else self._xt.XTestFakeDeviceButtonEvent
        )
        with self._checked():
            # Preparation can block. Recheck at the final non-native boundary.
            if self.dispatch_check is not None:
                self.dispatch_check()
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
            if self.dispatch_check is not None:
                self.dispatch_check()
            if not self._xt.XTestFakeMotionEvent(self._display, screen, x, y, 0):
                raise X11DeviceError("xtest_motion_failed")
        self._assert_identity()

    def pointer(self) -> tuple[int, int]:
        query = self.query_pointer(self._x.XDefaultRootWindow(self._display))
        return query.root_x, query.root_y

    def query_pointer(self, window):
        """Hit-test on this client's selected, identity-pinned master."""
        from types import SimpleNamespace

        if type(window) is not int or not 0 < window <= 0xFFFFFFFF:
            raise X11DeviceError("invalid_pointer_window")
        self._assert_identity()
        with self._checked():
            root, child = C.c_ulong(), C.c_ulong()
            rx, ry, wx, wy, mask = C.c_int(), C.c_int(), C.c_int(), C.c_int(), C.c_uint()
            if not self._x.XQueryPointer(
                self._display,
                window,
                C.byref(root),
                C.byref(child),
                C.byref(rx),
                C.byref(ry),
                C.byref(wx),
                C.byref(wy),
                C.byref(mask),
            ):
                raise X11DeviceError("pointer_unavailable")
            result = SimpleNamespace(
                same_screen=True, root_x=rx.value, root_y=ry.value, child=child.value
            )
        self._assert_identity()
        return result

    def _assert_keyboard_mapping(self, expected=None):
        self._assert_identity()
        master = next(r[0] for r in self._initial if r[2] == 2)
        slave = self._devices["keys"].contents.device_id
        with self._checked():
            mapping = _endpoint_keymap(self._display, master)
            if mapping != _endpoint_keymap(self._display, slave):
                raise X11DeviceError("injected_keyboard_mapping_mismatch")
            states = []
            for ident in (master, slave):
                state = _XkbState()
                if self._x.XkbGetState(self._display, ident, C.byref(state)) != 0:
                    raise X11DeviceError("injected_keyboard_state_unavailable")
                states.append((state.group, state.locked_mods, state.latched_group))
            if states[0] != states[1]:
                raise X11DeviceError("injected_keyboard_state_mismatch")
        baseline = expected if expected is not None else self.keyboard_mapping_identity
        if baseline is not None and mapping != baseline:
            raise X11DeviceError("injected_keyboard_mapping_changed")
        self.keyboard_mapping_identity = mapping

    def key_plan(self, modifiers, symbol_name=None):
        self._assert_keyboard_mapping()
        with self._checked():
            state = _XkbState()
            if self._x.XkbGetState(self._display, self._keyboard_id(), C.byref(state)) != 0:
                raise X11DeviceError("keyboard_state_unavailable")
            codes = resolve_key_plan(
                self._x, self._display, self._keyboard_id(), modifiers, symbol_name
            )
            # Keep lock/group admission pinned through guardian dispatch, just
            # like Unicode text. A lock toggle is not permission to remap keys.
            self._text_state = (state.group, state.locked_mods, state.latched_group)
        self._assert_keyboard_mapping()
        return codes

    def keycode(self, name: str) -> int:
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_]{1,128}", name):
            raise X11DeviceError("unsupported_key_name")
        self._assert_keyboard_mapping()
        with self._checked():
            symbol = self._x.XStringToKeysym(name.encode("ascii"))
            code = self._x.XKeysymToKeycode(self._display, symbol) if symbol else 0
            if not 8 <= code <= 255:
                raise X11DeviceError("key_not_in_layout")
            return code

    def text_keys(self, text: str) -> list[list[int]]:
        """Press-order chords; release each in reverse. Active XKB group/locks.

        Fail closed on active/latched modifiers; never change the global keymap.
        Dispatch must recheck layout/state because the returned list is no lease.
        """
        if not isinstance(text, str) or len(text) > 4096:
            raise X11DeviceError("invalid_text")
        self._assert_keyboard_mapping()
        with self._checked():
            state = _XkbState()
            if self._x.XkbGetState(self._display, self._keyboard_id(), C.byref(state)) != 0:
                raise X11DeviceError("keyboard_state_unavailable")
            if (
                state.base_mods
                or state.latched_mods
                or state.latched_group
                or state.group > 3
                or state.locked_mods & ~18
            ):
                raise X11DeviceError("keyboard_modifiers_busy")
            self._text_state = (state.group, state.locked_mods, state.latched_group)
            shift = self.keycode("Shift_L")
            mapping = self._x.XGetModifierMapping(self._display)
            if not mapping:
                raise X11DeviceError("modifier_map_unavailable")
            try:
                m = mapping.contents
                if (
                    not 1 <= m.max_keypermod <= 256
                    or not m.modifiermap
                    or shift not in m.modifiermap[: m.max_keypermod]
                ):
                    raise X11DeviceError("shift_mapping_unavailable")
                all_modifiers = list(m.modifiermap[: 8 * m.max_keypermod])
                if shift in all_modifiers[m.max_keypermod :]:
                    raise X11DeviceError("shift_mapping_ambiguous")
                modifier_codes = set(all_modifiers)
                level3 = []
                for name in ("ISO_Level3_Shift", "Mode_switch"):
                    symbol = self._x.XStringToKeysym(name.encode("ascii"))
                    code = self._x.XKeysymToKeycode(self._display, symbol)
                    slots = [
                        i // m.max_keypermod
                        for i, c in enumerate(all_modifiers)
                        if code and c == code
                    ]
                    if len(set(slots)) == 1 and slots[0] in (3, 5, 6, 7):
                        level3.append((code, 1 << slots[0]))
            finally:
                self._x.XFreeModifiermap(mapping)
            low, high = C.c_int(), C.c_int()
            self._x.XDisplayKeycodes(self._display, C.byref(low), C.byref(high))
            if not 8 <= low.value <= high.value <= 255:
                raise X11DeviceError("keycode_range_invalid")
            chords: dict[str, list[int]] = {}
            variants = [(0, []), (1, [shift])]
            for code, mask in level3:
                variants.extend([(mask, [code]), (mask | 1, [code, shift])])
            for modifiers, prefix in variants:
                mask = (state.group << 13) | state.locked_mods | modifiers
                for code in range(low.value, high.value + 1):
                    if code in modifier_codes:
                        continue
                    consumed, symbol = C.c_uint(), C.c_ulong()
                    if self._x.XkbLookupKeySym(
                        self._display, code, mask, C.byref(consumed), C.byref(symbol)
                    ):
                        char = _keysym_character(symbol.value)
                        if char is not None:
                            chord = prefix + [code]
                            chords.setdefault(char, chord)
            for char, symbol in (("\n", "Return"), ("\t", "Tab")):
                if char in text:
                    chords[char] = [self.keycode(symbol)]
            if any(c not in chords for c in text):
                raise UnsupportedCharacters(
                    [
                        {
                            "index": i,
                            "codepoint": f"U+{ord(c):04X}",
                            "reason": "unsupported_character",
                        }
                        for i, c in enumerate(text)
                        if c not in chords
                    ]
                )
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


def _keysym_character(symbol):
    if 32 <= symbol <= 126 or 160 <= symbol <= 255:
        return chr(symbol)
    if 0x01000100 <= symbol <= 0x0110FFFF:
        return chr(symbol - 0x01000000)
    try:
        lib = C.CDLL("libxkbcommon.so.0")
        lib.xkb_keysym_to_utf32.argtypes = [C.c_uint32]
        lib.xkb_keysym_to_utf32.restype = C.c_uint32
        value = lib.xkb_keysym_to_utf32(symbol)
        return chr(value) if 32 <= value <= 0x10FFFF else None
    except OSError:
        return None


class PersistentXTest(ExistingXTest):
    """Server-lifetime master pair. Never remove, disable or reattach devices.

    Closing connections leaves masters and applications intact. The guardian
    must fence injection and release its ledger. Widget focus remains shared.
    """

    prefix = f"Odin persistent {os.getuid()}"
    independent_pointer = True

    def _keyboard_id(self):
        return next(r[0] for r in self._initial if r[2] == 2)

    def focus(self, window):
        """Change only this master keyboard's top-level focus."""
        self._assert_identity()
        keyboard = next(r[0] for r in self._initial if r[2] == 2)
        with self._checked():
            if self._xi.XISetFocus(self._display, keyboard, window, 0):
                raise X11DeviceError("owned_focus_failed")

    def _prepare_master(self):
        # Serialize query+create across helpers; the server automatically drops
        # this very short grab if the connection dies. No resource is removed.
        self._x.XGrabServer(self._display)
        try:
            rows = self._topology()
            if not any(r[1].startswith(self.prefix + " ") for r in rows):
                add = _AddMaster(1, self.prefix.encode("ascii"), 1, 1)
                try:
                    with self._checked():
                        if self._xi.XIChangeHierarchy(self._display, C.byref(add), 1):
                            raise X11DeviceError("independent_pointer_unavailable")
                except X11DeviceError:
                    # A failed add may leave partial endpoints. Never hide them.
                    if any(r[1].startswith(self.prefix + " ") for r in self._topology()):
                        raise X11DeviceError("persistent_creation_incomplete") from None
                    raise HierarchyAddUnavailableError("independent_pointer_unavailable") from None
            masters = [r for r in self._topology() if r[1] == self.prefix + " pointer"]
            if len(masters) != 1 or masters[0][2] != 1 or not masters[0][4]:
                raise X11DeviceError("persistent_master_invalid")
            if self._xi.XISetClientPointer(self._display, 0, masters[0][0]):
                raise X11DeviceError("independent_pointer_unavailable")
        finally:
            self._x.XUngrabServer(self._display)


class SessionXTest(PersistentXTest):
    """A unique, disposable independent XInput pair."""

    independent_pointer = True
    _PREFIX_RE = re.compile(r"Odin session [0-9a-f]{32}")
    _XI_ADD_MASTER, _XI_REMOVE_MASTER, _XI_ATTACH_SLAVE = 1, 2, 3
    _XI_ATTACH_TO_MASTER, _GRAB_MODE_ASYNC = 1, 1

    def __init__(self, display_name: str, prefix: str, *, create=False):
        if not isinstance(prefix, str) or not self._PREFIX_RE.fullmatch(prefix):
            raise X11DeviceError("invalid_session_prefix")
        if type(create) is not bool:
            raise X11DeviceError("invalid_session_create")
        self.prefix, self._create_session = prefix, create
        self._created_pair = self._detached = False
        self._remove_attempted = False
        self._owned_identity: EndpointIdentity = ()
        self._core_slave_baseline: CoreSlaveIdentity = ()
        self._nonowned_baseline: EndpointIdentity = ()
        self._session_physical_slaves: CoreSlaveIdentity = ()
        self.session_lease_fd: int | None = None
        super().__init__(display_name)
        # Kept for compatibility, but now means the full pre-create core-slave
        # identity, including disabled endpoints.
        self._session_physical_slaves = self._core_slave_baseline
        self._owned_pair(self._topology())

    def _prepare_master(self):
        self._x.XGrabServer(self._display)
        try:
            rows = self._topology()
            found = [r for r in rows if r[1].startswith(self.prefix + " ")]
            if self._create_session:
                if found:
                    raise X11DeviceError("session_prefix_exists")
                if any(
                    r[2] in (1, 2) and r[1].startswith(("Odin session ", "Odin persistent "))
                    for r in rows
                ):
                    raise X11DeviceError("other_odin_masters_present")
                core_pointer, core_keyboard = self._core_pair(rows)
                self._nonowned_baseline = self._ordered(rows)
                self._core_slave_baseline = self._capture_core_slaves(
                    rows, core_pointer, core_keyboard
                )
                add = _AddMaster(self._XI_ADD_MASTER, self.prefix.encode("ascii"), 1, 1)
                try:
                    with self._checked():
                        if self._xi.XIChangeHierarchy(self._display, C.byref(add), 1):
                            raise X11DeviceError("session_creation_failed")
                    self._created_pair = True
                except X11DeviceError:
                    current = self._topology()
                    prefixed = self._prefixed(current)
                    if not prefixed and self._ordered(current) == self._nonowned_baseline:
                        raise HierarchyAddUnavailableError(
                            "independent_pointer_unavailable"
                        ) from None
                    if prefixed:
                        self._created_pair = True
                        try:
                            self._pin_owned_pair(current)
                        except X11DeviceError:
                            raise X11DeviceError("session_creation_incomplete") from None
                    raise X11DeviceError("session_creation_census_changed") from None
            elif not found:
                raise X11DeviceError("session_not_found")
            elif len(found) != 4:
                raise X11DeviceError("session_topology_invalid")
            current = self._topology()
            pointer, _keyboard, _xt_pointer, _xt_keyboard = self._pin_owned_pair(current)
            if self._create_session and self._nonowned(current) != self._nonowned_baseline:
                raise X11DeviceError("session_creation_census_changed")
            if self._xi.XISetClientPointer(self._display, 0, pointer[0]):
                raise X11DeviceError("independent_pointer_unavailable")
        finally:
            self._x.XUngrabServer(self._display)

    def _startup_failure_cleanup(self):
        """Remove only a complete pair pinned against the exact safe baseline."""
        if not self._created_pair:
            return
        self._x.XGrabServer(self._display)
        try:
            rows = self._topology()
            if not self._owned_identity:
                raise X11DeviceError("session_creation_incomplete")
            self._owned_pair(rows)
            if self._nonowned(rows) != self._nonowned_baseline:
                raise X11DeviceError("session_startup_cleanup_unsafe")
            self._close_owned_devices()
            try:
                self._remove_pair_if_exact(rows)
                self.sync()
            except X11DeviceError:
                if self._ordered(self._topology()) != self._nonowned_baseline:
                    raise X11DeviceError("session_startup_cleanup_failed") from None
            if self._ordered(self._topology()) != self._nonowned_baseline:
                raise X11DeviceError("session_startup_cleanup_failed")
            self._created_pair = False
        finally:
            self._x.XUngrabServer(self._display)

    @staticmethod
    def _core_pair(rows):
        pointer = [r for r in rows if r[1] == "Virtual core pointer" and r[2] == 1 and r[4]]
        keyboard = [r for r in rows if r[1] == "Virtual core keyboard" and r[2] == 2 and r[4]]
        if (
            len(pointer) != 1
            or len(keyboard) != 1
            or pointer[0][3] != keyboard[0][0]
            or keyboard[0][3] != pointer[0][0]
        ):
            raise X11DeviceError("core_pair_unavailable")
        return pointer[0][0], keyboard[0][0]

    @staticmethod
    def _capture_core_slaves(rows, core_pointer, core_keyboard):
        """Pin every pre-create nonowned core slave, disabled ones included."""
        return tuple(
            sorted(
                (ident, name, use, enabled)
                for ident, name, use, attachment, enabled in rows
                if use in (3, 4) and attachment in {core_pointer, core_keyboard}
            )
        )

    @staticmethod
    def _ordered(rows) -> EndpointIdentity:
        return tuple(sorted(rows))

    def _prefixed(self, rows) -> EndpointIdentity:
        return tuple(r for r in rows if r[1].startswith(self.prefix + " "))

    def _nonowned(self, rows) -> EndpointIdentity:
        return self._ordered(r for r in rows if not r[1].startswith(self.prefix + " "))

    def _pin_owned_pair(self, rows):
        pair = self._owned_pair(rows)
        identity = self._ordered(self._prefixed(rows))
        if self._owned_identity and identity != self._owned_identity:
            raise X11DeviceError("owned_endpoint_changed")
        self._owned_identity = identity
        return pair

    def _owned_pair(self, rows):
        expected = (
            (self.prefix + " pointer", 1),
            (self.prefix + " keyboard", 2),
            (self.prefix + " XTEST pointer", 3),
            (self.prefix + " XTEST keyboard", 4),
        )
        prefixed = [r for r in rows if r[1].startswith(self.prefix + " ")]
        if len(prefixed) != 4 or {r[1] for r in prefixed} != {name for name, _ in expected}:
            raise X11DeviceError("session_topology_invalid")
        selected = {}
        for name, use in expected:
            matches = [r for r in rows if r[1] == name]
            if len(matches) != 1 or matches[0][2] != use or not matches[0][4]:
                raise X11DeviceError("session_topology_invalid")
            selected[use] = matches[0]
        pointer, keyboard = selected[1], selected[2]
        if (
            pointer[3] != keyboard[0]
            or keyboard[3] != pointer[0]
            or selected[3][3] != pointer[0]
            or selected[4][3] != keyboard[0]
        ):
            raise X11DeviceError("session_topology_invalid")
        if self._owned_identity and self._ordered(prefixed) != self._owned_identity:
            raise X11DeviceError("owned_endpoint_changed")
        return pointer, keyboard, selected[3], selected[4]

    def _open_owned_devices_exact(self, rows):
        """Reopen only retained XTEST endpoint IDs after a failed remove."""
        _pointer, _keyboard, xt_pointer, xt_keyboard = self._owned_pair(rows)
        expected = {"buttons": xt_pointer[0], "keys": xt_keyboard[0]}
        if self._devices:
            actual = {kind: device.contents.device_id for kind, device in self._devices.items()}
            if actual != expected:
                raise X11DeviceError("owned_endpoint_changed")
            return
        opened = {}
        try:
            for kind in ("buttons", "keys"):
                ident = expected[kind]
                with self._checked():
                    device = self._xi.XOpenDevice(self._display, ident)
                    if not device or device.contents.device_id != ident:
                        raise X11DeviceError("xtest_open_failed")
                opened[kind] = device
        except BaseException:
            for device in opened.values():
                with self._checked():
                    self._xi.XCloseDevice(self._display, device)
            raise
        self._devices = opened

    def _release_xtest_held(self):
        held = self.owned_release_state()
        for kind, codes in held.items():
            fn = (
                self._xt.XTestFakeDeviceKeyEvent
                if kind == "keys"
                else self._xt.XTestFakeDeviceButtonEvent
            )
            with self._checked():
                for code in sorted(codes):
                    if not fn(self._display, self._devices[kind], code, 0, None, 0, 0):
                        raise X11DeviceError("owned_release_failed")
        self.sync()
        if any(self.owned_release_state().values()):
            raise X11DeviceError("owned_input_still_held")

    def _restore_physical_slaves(self, rows, core_pointer, core_keyboard):
        pointer, keyboard, xt_pointer, xt_keyboard = self._owned_pair(rows)
        own = {xt_pointer[0], xt_keyboard[0]}
        baseline = self._core_slave_baseline
        if not baseline:
            raise X11DeviceError("session_physical_baseline_unavailable")
        by_id = {row[0]: row for row in rows}
        baseline_ids = {ident for ident, _name, _use, _enabled in baseline}
        # A newly floating endpoint cannot safely be attributed to this seat.
        # Fail closed on hotplug/replacement or unrelated-seat reconfiguration;
        # never broadly attach or release human devices to satisfy a receipt.
        initial_other = {r[0]: r for r in self._nonowned_baseline}
        current_other = {r[0]: r for r in rows if not r[1].startswith(self.prefix + " ")}
        if set(initial_other) != set(current_other):
            raise X11DeviceError("session_physical_topology_changed")
        for ident, before in initial_other.items():
            after = current_other[ident]
            if ident not in baseline_ids and after != before:
                raise X11DeviceError("session_physical_topology_changed")
        for ident, _name, use, attachment, _enabled in rows:
            if (
                use in (3, 4)
                and attachment in {pointer[0], keyboard[0]}
                and ident not in own
                and ident not in baseline_ids
            ):
                raise X11DeviceError("session_physical_topology_changed")
        current_rows: list[tuple[int, int]] = []
        for ident, name, use, enabled in baseline:
            row = by_id.get(ident)
            if row is None or (row[1], row[2], row[4]) != (name, use, enabled):
                raise X11DeviceError("session_physical_topology_changed")
            core = core_pointer if use == 3 else core_keyboard
            master = pointer[0] if use == 3 else keyboard[0]
            if row[3] not in {core, master}:
                raise X11DeviceError("session_physical_topology_changed")
            if row[3] == master:
                current_rows.append((ident, use))
        current = tuple(sorted(current_rows))
        if self._session_physical_slaves != baseline:
            raise X11DeviceError("session_physical_topology_changed")
        # XIChangeHierarchy takes an array of the *union*, not packed concrete
        # XIAttachSlaveInfo structs. One request per endpoint avoids a bad stride
        # and leaves a partially restored hierarchy retryable on protocol error.
        for ident, use in current:
            change = _AttachSlave(
                self._XI_ATTACH_SLAVE, ident, core_pointer if use == 3 else core_keyboard
            )
            with self._checked():
                if self._xi.XIChangeHierarchy(self._display, C.byref(change), 1):
                    raise X11DeviceError("physical_slave_restore_failed")
        return current

    def _probe_no_active_grabs(self, pointer, keyboard):
        # Caller holds the server grab THROUGH removal. This is only an active
        # grab conflict probe on our two masters, not a global passive-grab proof.
        for ident in (pointer, keyboard):
            mask = _EventMask(ident, 0, None)
            with self._checked():
                root = self._x.XDefaultRootWindow(self._display)
                if self._xi.XIGrabDevice(
                    self._display,
                    ident,
                    root,
                    0,
                    0,
                    self._GRAB_MODE_ASYNC,
                    self._GRAB_MODE_ASYNC,
                    0,
                    C.byref(mask),
                ):
                    raise X11DeviceError("owned_master_grabbed")
            with self._checked():
                self._xi.XIUngrabDevice(self._display, ident, 0)

    def _close_owned_devices(self):
        with self._checked():
            for device in self._devices.values():
                self._xi.XCloseDevice(self._display, device)
            self._devices.clear()

    def _removed_receipt(self, rows):
        if not self._remove_attempted:
            raise X11DeviceError("owned_endpoint_changed")
        if self._ordered(rows) != self._nonowned_baseline:
            raise X11DeviceError("owned_master_remove_unverified")
        self._detached = True
        self._created_pair = False
        return {
            "released": True,
            "owned_devices": "removed",
            "physical_slaves_restored": True,
            "no_inflight_input": True,
            "no_active_grabs": True,
            "owned_masters_removed": True,
        }

    def _remove_pair_if_exact(self, rows):
        pointer, _keyboard, _xt_pointer, _xt_keyboard = self._owned_pair(rows)
        core_pointer, core_keyboard = self._core_pair(rows)
        remove = _RemoveMaster(
            self._XI_REMOVE_MASTER,
            pointer[0],
            self._XI_ATTACH_TO_MASTER,
            core_pointer,
            core_keyboard,
        )
        with self._checked():
            if self._xi.XISetClientPointer(self._display, 0, core_pointer):
                raise X11DeviceError("client_pointer_restore_failed")
            if self._xi.XIChangeHierarchy(self._display, C.byref(remove), 1):
                raise X11DeviceError("owned_master_remove_failed")

    def detach_owned(self):
        """Remove after the caller fenced all Odin clients using the lease.

        no_inflight_input means Odin clients only; no_active_grabs is the narrow
        conflict probe of the two owned masters, never a global X11 guarantee.
        """
        self._x.XGrabServer(self._display)
        try:
            rows = self._topology()
            if self._detached:
                return self._removed_receipt(rows)
            if not self._prefixed(rows):
                return self._removed_receipt(rows)
            self._open_owned_devices_exact(rows)
        finally:
            self._x.XUngrabServer(self._display)
        # Let applications receive release events before the short hierarchy
        # critical section. This is bounded settling, NOT proof that arbitrary
        # GTK/WM clients drained all device-related requests.
        self._release_xtest_held()
        time.sleep(0.05)
        self._x.XGrabServer(self._display)
        try:
            return self._detach_fenced()
        finally:
            self._x.XUngrabServer(self._display)
            self.sync()

    def _detach_fenced(self):
        rows = self._topology()
        if not self._prefixed(rows):
            return self._removed_receipt(rows)
        pointer, keyboard, _xt_pointer, _xt_keyboard = self._owned_pair(rows)
        core_pointer, core_keyboard = self._core_pair(rows)
        if any(self.owned_release_state().values()):
            raise X11DeviceError("owned_input_still_held")
        self._restore_physical_slaves(self._topology(), core_pointer, core_keyboard)
        self.sync()
        rows = self._topology()
        for ident, _name, use, _enabled in self._core_slave_baseline:
            expected = core_pointer if use == 3 else core_keyboard
            match = [r for r in rows if r[0] == ident]
            if len(match) != 1 or match[0][3] != expected:
                raise X11DeviceError("physical_slave_restore_failed")
        self._probe_no_active_grabs(pointer[0], keyboard[0])
        self._close_owned_devices()
        self._remove_attempted = True
        self._remove_pair_if_exact(rows)
        self.sync()
        remaining = self._topology()
        return self._removed_receipt(remaining)


def open_input(display_name, *, mode="auto"):
    if mode not in {"auto", "shared", "independent"}:
        raise X11DeviceError("invalid_input_mode")
    if mode == "shared":
        return ExistingXTest(display_name)
    try:
        return PersistentXTest(display_name)
    except HierarchyAddUnavailableError:
        if mode != "auto":
            raise
        return ExistingXTest(display_name)


def input_capabilities(display_name):
    """Probe actual endpoints, creating at most one persistent pair; no input."""
    native = open_input(display_name)
    try:
        independent = native.independent_pointer
        idle = not any(native.owned_release_state().values())
        return {
            "pointer": "independent" if independent else "shared",
            "keyboard_focus": "independent_per_window" if independent else "shared",
            "widget_focus": "shared_within_window",
            "shared_pointer": not independent,
            "shared_keyboard": not independent,
            "persistent_input_devices": independent,
            "device_identity": native.identity(),
            "owned_devices": ("persistent_idle" if idle else "persistent_release_unverified")
            if independent
            else "not_created",
            "released": idle,
            "clipboard_fallback": False,
        }
    finally:
        native.close()
