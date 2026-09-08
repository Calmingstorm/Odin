"""Native safety boundaries, no desktop access."""
import json

import pytest

from src.computer.runtime import x11_guardian as g
from src.computer.runtime import x11_owned_device as d
from tests.test_computer_x11_owned_device_r5 import Fake


@pytest.fixture
def native(monkeypatch):
    fake = Fake()
    monkeypatch.setattr(d, "_load_native", lambda: (fake.x, fake.xi, fake.xt))
    monkeypatch.setattr(d, "_endpoint_keymap", lambda *_: "matching-map")
    dev = d.ExistingXTest(":987")
    yield fake, dev
    dev.close()


@pytest.mark.parametrize("reason", ["core_xtest_topology_invalid", "persistent_master_invalid",
                                   "persistent_creation_incomplete", "device_query_failed"])
def test_invalid_retained_devices_never_fallback(monkeypatch, reason):
    def failed(_display):
        raise d.X11DeviceError(reason)
    monkeypatch.setattr(d, "PersistentXTest", failed)
    monkeypatch.setattr(d, "ExistingXTest", lambda _: pytest.fail("unsafe fallback"))
    with pytest.raises(d.X11DeviceError, match=reason):
        d.open_input(":123")


def test_only_proven_empty_failed_creation_allows_fallback(monkeypatch):
    def denied(_display):
        raise d.HierarchyAddUnavailableError("independent_pointer_unavailable")
    monkeypatch.setattr(d, "PersistentXTest", denied)
    monkeypatch.setattr(d, "ExistingXTest", lambda _: "shared")
    assert d.open_input(":123") == "shared"
    with pytest.raises(d.HierarchyAddUnavailableError):
        d.open_input(":123", mode="independent")


def test_identity_wire_normalization_and_exact_mismatch(native):
    _, dev = native
    identity = json.loads(json.dumps(dev.identity()))
    g.assert_admitted_identity(dev, identity)
    identity[0][0] += 1
    with pytest.raises(g.GuardianFailure, match="input_device_identity_changed"):
        g.assert_admitted_identity(dev, identity)


@pytest.mark.parametrize("operation", ["text", "keycode", "keydown"])
def test_slave_master_mismatch_fails_before_any_key(native, monkeypatch, operation):
    fake, dev = native
    monkeypatch.setattr(d, "_endpoint_keymap", lambda _, ident: "master" if ident == 3 else "slave")
    with pytest.raises(d.X11DeviceError, match="injected_keyboard_mapping_mismatch"):
        {"text": lambda: dev.text_keys("a"), "keycode": lambda: dev.keycode("a"),
         "keydown": lambda: dev.key(38, True)}[operation]()
    assert not any(call[0] == "key" for call in fake.calls)


def test_matching_maps_still_support_text(native):
    _, dev = native
    assert dev.text_keys("aA") == [[38], [50, 38]]


@pytest.mark.parametrize("kind", ["key", "button", "move"])
def test_final_dispatch_check_runs_after_native_preparation(native, kind):
    fake, dev = native
    expired = False
    original = dev._assert_identity
    def query():
        nonlocal expired
        original()
        expired = True
    dev._assert_identity = query
    def fence():
        assert expired
        raise g.GuardianFailure("input_lease_expired")
    dev.dispatch_check = fence
    args = (10, 20) if kind == "move" else (38 if kind == "key" else 1, True)
    with pytest.raises(g.GuardianFailure, match="input_lease_expired"):
        getattr(dev, kind)(*args)
    assert not any(call[0] in {"key", "button", "move"} for call in fake.calls)


def test_release_bypasses_dispatch_fence_and_mapping(native, monkeypatch):
    fake, dev = native
    dev.dispatch_check = lambda: pytest.fail("release must remain independent")
    monkeypatch.setattr(d, "_endpoint_keymap", lambda *_: pytest.fail("release cannot require map"))
    dev.release_owned("key", 38)
    assert ("key", 5, 38, 0) in fake.calls
