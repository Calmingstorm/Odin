"""Native R11 contracts in-process, using Python-owned ctypes storage only."""
import ctypes as C  # noqa: N812 - conventional ctypes ABI alias
import hashlib
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime import x11_owned_device as m
from tests.test_computer_x11_owned_device_r5 import Fake, put


@pytest.fixture
def abi(monkeypatch):
    fake = Fake()
    monkeypatch.setattr(m, "_load_native", lambda: (fake.x, fake.xi, fake.xt))
    monkeypatch.setattr(m, "_endpoint_keymap", lambda *_: "map-v1")
    monkeypatch.setattr(m.C, "CDLL", Mock(side_effect=AssertionError("real ABI forbidden")))
    return fake


@pytest.fixture
def device(abi):
    native = m.ExistingXTest(":987")
    yield abi, native
    native.close()


class Function:
    """Callable accepting ctypes declarations without crossing a native ABI."""
    def __init__(self, result=0):
        self.result, self.calls = result, []

    def __call__(self, *args):
        self.calls.append(args)
        return self.result(*args) if callable(self.result) else self.result


@pytest.mark.parametrize("failure", [None, "context", "connection", "keymap", "text", "library"])
def test_endpoint_full_map_digest_and_cleanup(monkeypatch, failure):
    text = C.create_string_buffer(b"xkb_keymap { types; actions; symbols; };")
    bridge = SimpleNamespace(XGetXCBConnection=Function(0 if failure == "connection" else 22))
    common = SimpleNamespace(
        xkb_context_new=Function(0 if failure == "context" else 11),
        xkb_context_unref=Function(), xkb_keymap_unref=Function(),
        xkb_keymap_get_as_string=Function(0 if failure == "text" else C.addressof(text)))
    x11 = SimpleNamespace(xkb_x11_keymap_new_from_device=Function(0 if failure == "keymap" else 33))
    libc = SimpleNamespace(free=Function())
    libraries = iter([bridge, common, x11, libc])
    monkeypatch.setattr(m.C, "CDLL", Mock(side_effect=OSError() if failure == "library"
                                        else lambda *_: next(libraries)))
    if failure:
        with pytest.raises(m.X11DeviceError, match="injected_keyboard_mapping_unavailable"):
            m._endpoint_keymap(123, 55)
    else:
        assert m._endpoint_keymap(123, 55) == hashlib.sha256(text.value).hexdigest()
        assert x11.xkb_x11_keymap_new_from_device.calls == [(11, 22, 55, 0)]
    assert len(common.xkb_context_unref.calls) == int(failure not in {"context", "library"})
    assert len(common.xkb_keymap_unref.calls) == int(failure in {None, "text"})
    assert libc.free.calls == ([(C.addressof(text),)] if failure is None else [])


def test_native_loader_declares_abi_without_loading_x(monkeypatch):
    class Library:
        def __getattr__(self, name):
            fn = Function()
            setattr(self, name, fn)
            return fn
    libraries = [Library(), Library(), Library()]
    monkeypatch.setattr(m.C, "CDLL", Mock(side_effect=libraries))
    assert m._load_native() == tuple(libraries)
    assert libraries[1].XIQueryDevice.restype == C.POINTER(m._Info)
    assert libraries[2].XTestFakeDeviceKeyEvent.argtypes[1] == C.POINTER(m._Device)
    monkeypatch.setattr(m.C, "CDLL", Mock(side_effect=OSError()))
    with pytest.raises(m.X11DeviceError, match="native_libraries_unavailable"):
        m._load_native()


@pytest.mark.parametrize("fault,reason", [
    ("display", "display_unavailable"), ("xi", "xi2_unavailable"),
    ("version", "xi21_raw_events_required"), ("xtest", "xtest_unavailable"),
    ("extension", "xi2_unavailable"), ("subscription", "physical_event_subscription_failed"),
    ("open", "xtest_open_failed"),
])
def test_constructor_admission_fails_closed_and_closes(abi, fault, reason):
    if fault == "display":
        abi.x.XOpenDisplay = lambda *_: None
    elif fault == "xi":
        abi.xi.XIQueryVersion = lambda *_: 1
    elif fault == "version":
        abi.xi.XIQueryVersion = lambda d, major, minor: put(minor, 0) or 0
    elif fault == "xtest":
        abi.xt.XTestQueryExtension = lambda *_: 0
    elif fault == "extension":
        abi.x.XQueryExtension = lambda *_: 0
    elif fault == "subscription":
        abi.xi.XISelectEvents = lambda *_: 1
    else:
        abi.xi.XOpenDevice = lambda *_: None
    with pytest.raises(m.X11DeviceError, match=reason):
        m.ExistingXTest(":987")
    assert (("close",) in abi.calls) == (fault != "display")
    assert not any(c[0] in {"key", "button", "move"} for c in abi.calls)


def test_protocol_error_handler_is_restored(device):
    fake, native = device
    handler = [None]
    def install(value):
        old, handler[0] = handler[0], value
        return old
    fake.x.XSetErrorHandler = install
    with pytest.raises(m.X11DeviceError, match="x11_protocol_error"):
        with native._checked():
            C.cast(handler[0], m._ERROR_HANDLER)(None, None)
    assert handler[0] is None


@pytest.mark.parametrize("fault,reason", [
    ("null", "device_query_failed"), ("count", "invalid_device_count"),
    ("name", "device_name_missing"), ("duplicate", "duplicate_device_id"),
])
def test_topology_census_bounds_and_frees(device, fault, reason):
    fake, native = device
    free = fake.xi.XIFreeDeviceInfo = Mock()
    if fault == "null":
        fake.xi.XIQueryDevice = lambda *_: None
    elif fault == "count":
        fake.xi.XIQueryDevice = lambda d, s, p: put(p, 1025) or (m._Info * 1)()
    elif fault == "name":
        fake.rows[0] = (2, "", 1, 3, True)
    else:
        fake.rows.append(fake.rows[0])
    with pytest.raises(m.X11DeviceError, match=reason):
        native._topology()
    assert free.call_count == int(fault != "null")


@pytest.mark.parametrize("fault", ["count", "null", "width"])
def test_snapshot_rejects_invalid_keymap_and_frees(device, fault):
    fake, native = device
    fake.x.XFree = Mock()
    if fault == "count":
        fake.x.XDisplayKeycodes = lambda d, low, high: put(high, 300)
    elif fault == "null":
        fake.x.XGetKeyboardMapping = lambda *_: None
    else:
        fake.x.XGetKeyboardMapping = lambda d, low, count, w: put(w, 65) or (C.c_ulong * 1)()
    with pytest.raises(m.X11DeviceError, match="keyboard_mapping_unavailable"):
        native._keymap_snapshot()
    assert fake.x.XFree.call_count == int(fault == "width")


@pytest.mark.parametrize("fault,reason", [
    ("map", "injected_keyboard_mapping_mismatch"),
    ("state", "injected_keyboard_state_mismatch"),
    ("state_query", "injected_keyboard_state_unavailable"),
    ("baseline", "injected_keyboard_mapping_changed"),
])
def test_endpoint_mapping_and_state_must_match_before_dispatch(device, monkeypatch, fault, reason):
    fake, native = device
    if fault == "map":
        monkeypatch.setattr(m, "_endpoint_keymap", lambda d, ident: str(ident))
    elif fault == "state":
        fake.x.XkbGetState = lambda d, ident, state: setattr(state._obj, "group", ident == 5) or 0
    elif fault == "state_query":
        fake.x.XkbGetState = lambda *_: 1
    else:
        native.keyboard_mapping_identity = "old"
    with pytest.raises(m.X11DeviceError, match=reason):
        native.key(38, True)
    assert not any(c[0] == "key" for c in fake.calls)
    native.release_owned("key", 38)
    assert fake.calls[-1] == ("key", 5, 38, 0)


def test_dispatch_lease_recheck_fences_motion_and_key_after_preparation(device):
    fake, native = device
    native.dispatch_check = Mock(side_effect=m.X11DeviceError("lease_expired"))
    for call in (lambda: native.key(38, True), lambda: native.move(5, 5)):
        with pytest.raises(m.X11DeviceError, match="lease_expired"):
            call()
    assert native.dispatch_check.call_count == 2
    assert not any(c[0] in {"key", "move"} for c in fake.calls)


@pytest.mark.parametrize("fault,reason", [
    ("cookie", "physical_event_data_unavailable"), ("null", "physical_event_data_unavailable"),
    ("code", "physical_event_code_invalid"), ("hierarchy", "device_topology_changed"),
    ("overflow", "physical_event_queue_overflow"),
])
def test_raw_event_loss_permanently_invalidates_endpoint(device, fault, reason):
    fake, native = device
    fake.add_event(6, 11 if fault == "hierarchy" else 13, 0 if fault == "code" else 38)
    if fault == "cookie":
        fake.x.XGetEventData = lambda *_: 0
    elif fault == "null":
        fake.events[0].cookie.data = None
    elif fault == "overflow":
        fake.events = [m._Event() for _ in range(4096)]
    with pytest.raises(m.X11DeviceError, match=reason):
        native.physical_events()
    assert native._invalidated
    with pytest.raises(m.X11DeviceError, match="device_topology_changed"):
        native.identity()


def test_raw_event_filter_mapping_and_text_state(device):
    fake, native = device
    for source, kind in [(5, 13), (8, 13), (6, 13), (6, 14), (7, 15), (7, 16), (6, 99)]:
        fake.add_event(source, kind)
    assert native.physical_events() == [("keys", 38, True), ("keys", 38, False),
                                         ("buttons", 38, True), ("buttons", 38, False)]
    assert native.physical_seen
    event = m._Event()
    event.type = 34
    fake.events.append(event)
    assert native.physical_events() == []
    fake.map_values[0] = 99
    fake.events.append(event)
    assert native.physical_events() == [("mapping", 0, True)]
    native._text_state = (0, 0, 0)
    assert native.physical_events() == [("mapping", 0, True)]
    fake.x.XkbGetState = lambda *_: 1
    with pytest.raises(m.X11DeviceError, match="keyboard_state_unavailable"):
        native.physical_events()
    fake.x.XkbGetState = lambda d, ident, p: setattr(p._obj, "group", 1) or 0
    with pytest.raises(m.X11DeviceError, match="keyboard_state_changed"):
        native.physical_events()


@pytest.mark.parametrize("fault,reason", [
    ("null", "device_state_unavailable"), ("id", "device_state_invalid"),
    ("length", "device_state_invalid"), ("short", "device_state_invalid"),
    ("count", "device_state_invalid"), ("class", "device_state_class_missing"),
])
def test_device_state_storage_is_validated_and_freed(device, fault, reason):
    fake, native = device
    bits = m._Bits(0, C.sizeof(m._Bits), 256)
    state = m._State(5, 1, C.addressof(bits))
    if fault == "id":
        state.device_id = 999
    elif fault == "length":
        bits.length = 1
    elif fault == "short":
        bits.length = 2
    elif fault == "count":
        bits.count = 257
    elif fault == "class":
        bits.kind = 2
    fake.xi.XQueryDeviceState = lambda *_: None if fault == "null" else C.pointer(state)
    fake.xi.XFreeDeviceState = Mock()
    with pytest.raises(m.X11DeviceError, match=reason):
        native._state(native._devices["keys"], "keys")
    assert fake.xi.XFreeDeviceState.call_count == int(fault != "null")


def persistent_fixture(fake):
    prefix = m.PersistentXTest.prefix
    rows = [(12, prefix + " pointer", 1, 13, True),
            (13, prefix + " keyboard", 2, 12, True),
            (14, prefix + " XTEST pointer", 3, 12, True),
            (15, prefix + " XTEST keyboard", 4, 13, True)]
    fake.states.update({14: {"buttons": set()}, 15: {"keys": set()}})
    fake.x.XGrabServer = lambda *_: fake.calls.append(("grab",))
    fake.x.XUngrabServer = lambda *_: fake.calls.append(("ungrab",))
    fake.xi.XISetClientPointer = (
        lambda d, w, ident: fake.calls.append(("client_pointer", ident)) or 0)
    fake.xi.XISetFocus = (
        lambda d, ident, window, t: fake.calls.append(("focus", ident, window)) or 0)
    def add(d, pointer, count):
        spec = pointer._obj
        assert (spec.type, spec.name, spec.send_core, spec.enable, count) == (
            1, prefix.encode(), 1, 1, 1)
        fake.calls.append(("add",))
        fake.rows.extend(rows)
        return 0
    fake.xi.XIChangeHierarchy = add
    return rows


def test_persistent_master_created_once_reused_and_never_removed(abi):
    persistent_fixture(abi)
    for _ in range(2):
        native = m.open_input(":987", mode="independent")
        assert native._keyboard_id() == 13 and native.independent_pointer
        native.focus(77)
        assert native.owned_release_state() == {"buttons": set(), "keys": set()}
        native.close()
    assert abi.calls.count(("add",)) == 1
    assert abi.calls.count(("grab",)) == abi.calls.count(("ungrab",)) == 2
    assert abi.calls.count(("client_pointer", 12)) == 2
    assert abi.calls.count(("focus", 13, 77)) == 2
    assert len(abi.rows) == 11


@pytest.mark.parametrize("fault,reason", [
    ("rejected", "independent_pointer_unavailable"),
    ("partial", "persistent_creation_incomplete"), ("master", "persistent_master_invalid"),
    ("client_pointer", "independent_pointer_unavailable"),
])
def test_failed_master_creation_never_hides_partial_resources(abi, fault, reason):
    rows = persistent_fixture(abi)
    if fault in {"rejected", "partial"}:
        def reject(*_):
            if fault == "partial":
                abi.rows.append(rows[0])
            return 1
        abi.xi.XIChangeHierarchy = reject
    elif fault == "master":
        abi.rows.append(rows[1])
    else:
        abi.xi.XISetClientPointer = lambda *_: 1
    with pytest.raises(m.X11DeviceError, match=reason) as exc:
        m.open_input(":987", mode="independent")
    assert isinstance(exc.value, m.HierarchyAddUnavailableError) == (fault == "rejected")
    assert ("ungrab",) in abi.calls and abi.calls[-1] == ("close",)


def test_auto_fallback_only_after_proving_no_retained_endpoints(abi):
    persistent_fixture(abi)
    abi.xi.XIChangeHierarchy = lambda *_: 1
    native = m.open_input(":987")
    assert type(native) is m.ExistingXTest
    native.close()
    with pytest.raises(m.X11DeviceError, match="invalid_input_mode"):
        m.open_input(":987", mode="unsafe")
    native = m.open_input(":987", mode="shared")
    native.close()


@pytest.mark.parametrize("busy", [False, True])
def test_capabilities_report_persistent_state_without_injection(abi, busy):
    persistent_fixture(abi)
    if busy:
        abi.states[15]["keys"].add(38)
    result = m.input_capabilities(":987")
    assert result["pointer"] == "independent" and result["released"] is not busy
    assert result["owned_devices"] == (
        "persistent_release_unverified" if busy else "persistent_idle")
    assert result["clipboard_fallback"] is False
    assert abi.calls[-1] == ("close",)


def test_keysym_decoding_and_missing_optional_library(monkeypatch):
    assert m._keysym_character(65) == "A"
    assert m._keysym_character(0x010020AC) == "€"
    lib = SimpleNamespace(xkb_keysym_to_utf32=Function(0x3BB))
    monkeypatch.setattr(m.C, "CDLL", lambda *_: lib)
    assert m._keysym_character(0x7EB) == "λ"
    lib.xkb_keysym_to_utf32.result = 0
    assert m._keysym_character(0) is None
    monkeypatch.setattr(m.C, "CDLL", Mock(side_effect=OSError()))
    assert m._keysym_character(0) is None
