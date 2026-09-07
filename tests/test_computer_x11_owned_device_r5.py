"""No display connections: native pointers backed exclusively by Python fixtures."""

import ctypes as C  # noqa: N812
from types import SimpleNamespace

import pytest

from src.computer.runtime import x11_owned_device as m

TOPOLOGY = [
    (2, "Virtual core pointer", 1, 3, True),
    (3, "Virtual core keyboard", 2, 2, True),
    (4, "Virtual core XTEST pointer", 3, 2, True),
    (5, "Virtual core XTEST keyboard", 4, 3, True),
    (6, "Human keyboard", 4, 3, True),
    (7, "Human pointer", 3, 2, True),
    (8, "Other seat keyboard", 4, 99, True),
]


def put(pointer, value):
    pointer._obj.value = value


@pytest.fixture(autouse=True)
def fake_endpoint_keymaps(monkeypatch):
    # Fake display pointer 123 must never reach the native xkbcommon/XCB helper.
    # Mismatch and query-failure behavior have dedicated R11 native tests.
    monkeypatch.setattr(m, "_endpoint_keymap", lambda *_: "same_map")


class Fake:
    def __init__(self):
        self.calls, self.events, self.references = [], [], []
        self.states = {4: {"buttons": {1}}, 5: {"keys": {38, 50, 200}},
                       6: {"keys": {38, 65}}, 7: {"buttons": {3}}}
        self.rows = list(TOPOLOGY)
        self.map_values = [0] * 248
        self.x = SimpleNamespace(
            XOpenDisplay=self.open, XCloseDisplay=lambda d: self.calls.append(("close",)),
            XSync=lambda *a: 0, XSetErrorHandler=lambda *a: None,
            XDefaultRootWindow=lambda d: 1, XDefaultScreen=lambda d: 0,
            XDisplayWidth=lambda *a: 800, XDisplayHeight=lambda *a: 600,
            XQueryExtension=self.extension, XPending=lambda d: len(self.events),
            XNextEvent=self.next_event, XGetEventData=lambda *a: 1,
            XFreeEventData=lambda *a: self.calls.append(("free_cookie",)),
            XStringToKeysym=lambda n: 0xFFE1 if n == b"Shift_L" else 0xFF0D,
            XKeysymToKeycode=lambda d, s: 50 if s == 0xFFE1 else 36,
            XkbGetState=self.kb_state, XGetModifierMapping=self.modifiers,
            XFreeModifiermap=lambda *a: None, XDisplayKeycodes=self.range,
            XkbLookupKeySym=self.lookup, XQueryPointer=self.pointer,
            XGetKeyboardMapping=self.keymap, XFree=lambda *a: 0,
        )
        self.xi = SimpleNamespace(
            XIQueryVersion=lambda *a: 0, XIQueryDevice=self.query,
            XIFreeDeviceInfo=lambda *a: None, XOpenDevice=self.open_device,
            XCloseDevice=lambda d, p: self.calls.append(("close_device", p.contents.device_id)),
            XQueryDeviceState=self.state, XFreeDeviceState=lambda *a: None,
            XISelectEvents=lambda *a: 0,
        )
        self.xt = SimpleNamespace(
            XTestQueryExtension=lambda *a: 1,
            XTestFakeDeviceKeyEvent=lambda d, p, code, down, *a: self.inject("key", p, code, down),
            XTestFakeDeviceButtonEvent=lambda d, p, code, down, *a:
                self.inject("button", p, code, down),
            XTestFakeMotionEvent=lambda d, s, x, y, delay: self.calls.append(("move", x, y)) or 1,
        )
        self.mods = 0

    def keymap(self, display, low, count, width):
        put(width, 1)
        return (C.c_ulong * count)(*self.map_values)

    def open(self, name):
        assert name == b":987"
        return 123

    def extension(self, d, name, opcode, event, error):
        put(opcode, 131)
        return 1

    def query(self, d, selector, count):
        assert selector == 0
        put(count, len(self.rows))
        info = (m._Info * len(self.rows))(*[
            m._Info(r[0], r[1].encode(), r[2], r[3], r[4], 0, None) for r in self.rows])
        self.references.append(info)
        return info

    def open_device(self, d, ident):
        self.calls.append(("open_device", ident))
        return C.pointer(m._Device(ident, 0, None))

    def state(self, d, device):
        ident = device.contents.device_id
        states = self.states[ident]
        storage = (m._Bits * len(states))()
        for b, (kind, values) in zip(storage, states.items()):
            b.kind, b.length, b.count = (0 if kind == "keys" else 1), C.sizeof(m._Bits), 256
            for n in values:
                b.bits[n // 8] |= 1 << (n % 8)
        self.references.append(storage)
        return C.pointer(m._State(ident, len(states), C.addressof(storage)))

    def inject(self, kind, p, code, down):
        self.calls.append((kind, p.contents.device_id, code, down))
        return 1

    def add_event(self, source, kind, code=38):
        raw = m._RawPrefix(35, 0, 0, 123, 131, kind, 0, 3, source, code, 0)
        self.references.append(raw)
        event = m._Event()
        event.cookie = m._Cookie(35, 0, 0, 123, 131, kind, 1, C.addressof(raw))
        self.events.append(event)

    def next_event(self, d, p):
        event = self.events.pop(0)
        C.memmove(p, C.byref(event), C.sizeof(event))
        return 0

    def kb_state(self, d, spec, p):
        p._obj.base_mods = self.mods
        return 0

    def modifiers(self, d):
        array = (C.c_ubyte * 8)(50, 66, 37, 64, 77, 0, 0, 0)
        self.references.append(array)
        return C.pointer(m._ModifierMap(1, array))

    def range(self, d, low, high):
        put(low, 8)
        put(high, 255)
        return 1

    def lookup(self, d, code, mask, consumed, symbol):
        values = {38: (ord("a"), ord("A")), 10: (ord("1"), ord("!")), 65: (32, 32)}
        put(symbol, values.get(code, (0, 0))[bool(mask & 1)])
        return bool(symbol._obj.value)

    def pointer(self, d, root, r, child, rx, ry, wx, wy, mask):
        put(rx, 70)
        put(ry, 80)
        return 1


@pytest.fixture
def native(monkeypatch):
    fake = Fake()
    monkeypatch.setattr(m, "_load_native", lambda: (fake.x, fake.xi, fake.xt))
    dev = m.ExistingXTest(":987")
    yield fake, dev
    dev.close()


def test_constructor_never_creates_device_and_closes_without_release(native):
    fake, dev = native
    assert fake.calls == [("open_device", 4), ("open_device", 5)]
    dev.close()
    dev.close()
    assert fake.calls[-3:] == [("close_device", 4), ("close_device", 5), ("close",)]
    with pytest.raises(m.X11DeviceError, match="closed"):
        dev.sync()


def test_identity_covers_other_attached_slaves_and_detects_replacement(native):
    fake, dev = native
    assert dev.identity() == tuple(TOPOLOGY[:6])
    fake.rows[4] = (9, "Human keyboard", 4, 3, True)
    with pytest.raises(m.X11DeviceError, match="topology_changed"):
        dev.key(38, True)
    assert not any(c[0] == "key" for c in fake.calls)


@pytest.mark.parametrize("index,row", [
    (3, (5, "Virtual core XTEST keyboard", 4, 2, True)),
    (3, (5, "Virtual core XTEST keyboard", 2, 3, True)),
    (3, (5, "Virtual core XTEST keyboard", 4, 3, False)),
    (3, (5, "Wrong keyboard", 4, 3, True)),
])
def test_reject_wrong_topology_before_open(monkeypatch, index, row):
    fake = Fake()
    fake.rows[index] = row
    monkeypatch.setattr(m, "_load_native", lambda: (fake.x, fake.xi, fake.xt))
    with pytest.raises(m.X11DeviceError):
        m.ExistingXTest(":987")
    assert not any(c[0] == "open_device" for c in fake.calls)


def test_ordinary_keys_and_physical_overlap_are_not_modifiers_only(native):
    fake, dev = native
    assert dev.held() == {"keys": {38, 50, 200}, "buttons": {1}}
    assert dev.physical_held() == {"keys": {38, 65}, "buttons": {3}}
    assert ("open_device", 8) not in fake.calls
    assert ("open_device", 6) in fake.calls
    assert ("close_device", 6) in fake.calls


def test_explicit_xtest_device_handles_only(native):
    fake, dev = native
    dev.key(38, True)
    dev.key(38, False)
    dev.button(1, True)
    dev.button(1, False)
    assert fake.calls[-4:] == [("key", 5, 38, 1), ("key", 5, 38, 0),
                                ("button", 4, 1, 1), ("button", 4, 1, 0)]


@pytest.mark.parametrize("code,down", [(0, True), (256, True), (True, True), (38, 1)])
def test_input_bounds(native, code, down):
    with pytest.raises(m.X11DeviceError, match="invalid_input_code"):
        native[1].key(code, down)


def test_native_failure_does_not_fallback_to_core_injection(native):
    fake, dev = native
    fake.xt.XTestFakeDeviceKeyEvent = lambda *a: 0
    with pytest.raises(m.X11DeviceError, match="xtest_input_failed"):
        dev.key(38, True)


def test_pointer_read_and_bounded_motion(native):
    fake, dev = native
    assert dev.pointer() == (70, 80)
    dev.move(799, 599)
    assert fake.calls[-1] == ("move", 799, 599)
    with pytest.raises(m.X11DeviceError, match="out_of_bounds"):
        dev.move(800, 0)


def test_ascii_layout_and_named_keys(native):
    fake, dev = native
    assert dev.keycode("Return") == 36
    assert dev.text_keys("aA1! ") == [[38], [50, 38], [10], [50, 10], [65]]
    assert dev.text_keys("") == []
    with pytest.raises(m.X11DeviceError, match="unsupported_character"):
        dev.text_keys("z")
    fake.mods = 4
    with pytest.raises(m.X11DeviceError, match="modifiers_busy"):
        dev.text_keys("a")


@pytest.mark.parametrize("text", ["é", "\n", "\t", "\x00", "a" * 4097])
def test_text_rejected_without_native_call(native, text):
    before = list(native[0].calls)
    with pytest.raises(m.X11DeviceError, match="invalid_text|unsupported_character"):
        native[1].text_keys(text)
    assert native[0].calls == before


def test_raw_physical_short_tap_preserved_and_own_source_ignored(native):
    fake, dev = native
    fake.add_event(5, 13)
    fake.add_event(6, 13)
    fake.add_event(6, 14)
    fake.add_event(7, 15, 3)
    fake.add_event(7, 16, 3)
    fake.add_event(8, 13)
    assert dev.physical_events() == [("keys", 38, True), ("keys", 38, False),
                                      ("buttons", 3, True), ("buttons", 3, False)]
    assert dev.physical_seen
    assert dev.physical_events() == []
    assert dev.physical_seen
    assert fake.calls.count(("free_cookie",)) == 6


def test_hierarchy_event_poison_even_identical_census(native):
    fake, dev = native
    fake.add_event(6, 11)
    with pytest.raises(m.X11DeviceError, match="topology_changed"):
        dev.physical_events()
    with pytest.raises(m.X11DeviceError, match="topology_changed"):
        dev.key(38, False)


def test_missing_cookie_fails_closed(native):
    fake, dev = native
    fake.add_event(6, 13)
    fake.x.XGetEventData = lambda *a: 0
    with pytest.raises(m.X11DeviceError, match="data_unavailable"):
        dev.physical_events()


def test_invalid_display_rejected_before_native(monkeypatch):
    monkeypatch.setattr(m, "_load_native", lambda: pytest.fail("native touched"))
    for display in ("", None, "example:0", ":123\n"):
        with pytest.raises(m.X11DeviceError, match="explicit_local"):
            m.ExistingXTest(display)


def test_state_missing_or_bad_class_fails_closed(native):
    fake, dev = native
    fake.states[5] = {"buttons": set()}
    with pytest.raises(m.X11DeviceError, match="class_missing"):
        dev.held()


def test_protocol_error_is_bounded_and_restores_handler(native):
    fake, dev = native
    saved = []

    def set_handler(callback):
        saved.append(callback)
        return None

    fake.x.XSetErrorHandler = set_handler

    def sync(*args):
        if saved[-1]:
            C.cast(saved[-1], m._ERROR_HANDLER)(123, None)
        return 0

    fake.x.XSync = sync
    with pytest.raises(m.X11DeviceError, match="x11_protocol_error"):
        dev.sync()
    assert saved[-1] is None
    fake.x.XSync = lambda *a: 0


def test_invalid_native_class_length_rejected(native):
    fake, dev = native
    bits = m._Bits(0, 2, 256)
    fake.xi.XQueryDeviceState = lambda d, p: C.pointer(
        m._State(p.contents.device_id, 1, C.addressof(bits)))
    with pytest.raises(m.X11DeviceError, match="state_invalid"):
        dev.held()


def test_raw_queue_flood_poison_connection(native):
    fake, dev = native
    for _ in range(4096):
        fake.add_event(5, 13)
    with pytest.raises(m.X11DeviceError, match="queue_overflow"):
        dev.physical_events()
    with pytest.raises(m.X11DeviceError, match="topology_changed"):
        dev.identity()


def test_redundant_mapping_notify_does_not_poison_release(native):
    fake, dev = native
    event = m._Event()
    event.type = 34
    fake.events.append(event)
    assert dev.physical_events() == []
    fake.map_values[0] = 99
    fake.events.append(event)
    assert dev.physical_events() == [("mapping", 0, True)]
    dev.key(38, False)
    assert fake.calls[-1] == ("key", 5, 38, 0)


def test_bad_shift_map_fails_closed(native):
    fake, dev = native
    array = (C.c_ubyte * 8)(37, 0, 50, 0, 0, 0, 0, 0)
    fake.x.XGetModifierMapping = lambda d: C.pointer(m._ModifierMap(1, array))
    with pytest.raises(m.X11DeviceError, match="shift_mapping_unavailable"):
        dev.text_keys("A")


def test_owned_release_survives_unrelated_physical_hotplug(native):
    fake, dev = native
    fake.rows[4] = (9, "Replacement human keyboard", 4, 3, True)
    dev._invalidated = True
    dev.release_owned("key", 38)
    assert fake.calls[-1] == ("key", 5, 38, 0)
    assert dev.owned_release_state()["keys"] == {38, 50, 200}


def test_owned_release_never_follows_replaced_synthetic_endpoint(native):
    fake, dev = native
    fake.rows[3] = (9, "Virtual core XTEST keyboard", 4, 3, True)
    with pytest.raises(m.X11DeviceError, match="owned_endpoint_changed"):
        dev.release_owned("key", 38)
    assert not any(c[0] == "key" for c in fake.calls)


def test_native_import_is_deferred(monkeypatch):
    import importlib.util

    monkeypatch.setattr(C, "CDLL", lambda *a: pytest.fail("library loaded at import"))
    spec = importlib.util.spec_from_file_location("isolated_x11_test_module", m.__file__)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.ExistingXTest
