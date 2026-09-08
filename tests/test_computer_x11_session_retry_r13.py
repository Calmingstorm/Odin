"""SessionXTest retry/census safety with fake native pointers, never live X."""
import ctypes as C  # noqa: N812

import pytest

from src.computer.runtime import x11_owned_device as m
from tests.test_computer_detach_native_r13 import PREFIX, SessionFake


def create(monkeypatch, fake):
    monkeypatch.setattr(m, "_load_native", lambda: (fake.x, fake.xi, fake.xt))
    return m.SessionXTest(":987", PREFIX, create=True)


def change_type(spec):
    return C.cast(spec, C.POINTER(m._AddMaster)).contents.type


@pytest.mark.parametrize("remove_effect", [False, True])
def test_remove_failure_retries_with_exact_identity_or_idempotent_census(
        monkeypatch, remove_effect):
    fake, original, failed = SessionFake(), None, False
    original = fake.change
    def change(display, spec, count):
        nonlocal failed
        if change_type(spec) == 2 and not failed:
            failed = True
            if remove_effect:
                original(display, spec, count)
            return 1
        return original(display, spec, count)
    fake.xi.XIChangeHierarchy = change
    native = create(monkeypatch, fake)
    try:
        with pytest.raises(m.X11DeviceError, match="owned_master_remove_failed"):
            native.detach_owned()
        opened = len([c for c in fake.calls if c[0] == "open_device"])
        assert native.detach_owned()["owned_devices"] == "removed"
        new_open = [c for c in fake.calls if c[0] == "open_device"][opened:]
        assert new_open == ([] if remove_effect else
                            [("open_device", 22), ("open_device", 23)])
        # SessionFake records only hierarchy removes that it actually applies.
        assert sum(c[0] == "remove" for c in fake.calls) == 1
    finally:
        native.close()


def test_retry_rejects_valid_looking_replacement_ids_before_reopen(monkeypatch):
    fake, original = SessionFake(), None
    original = fake.change
    fake.xi.XIChangeHierarchy = lambda d, s, n: (
        1 if change_type(s) == 2 else original(d, s, n))
    native = create(monkeypatch, fake)
    try:
        with pytest.raises(m.X11DeviceError):
            native.detach_owned()
        replacement = {20: (30, PREFIX + " pointer", 1, 31, True),
                       21: (31, PREFIX + " keyboard", 2, 30, True),
                       22: (32, PREFIX + " XTEST pointer", 3, 30, True),
                       23: (33, PREFIX + " XTEST keyboard", 4, 31, True)}
        fake.rows = [replacement.get(r[0], r) for r in fake.rows]
        with pytest.raises(m.X11DeviceError, match="owned_endpoint_changed"):
            native.detach_owned()
    finally:
        native.close()


def test_post_remove_query_failure_retries_without_second_remove(monkeypatch):
    fake = SessionFake()
    original_change, original_query = fake.change, fake.query
    fail_query = False
    def change(display, spec, count):
        nonlocal fail_query
        result = original_change(display, spec, count)
        if change_type(spec) == 2:
            fail_query = True
        return result
    def query(*args):
        nonlocal fail_query
        if fail_query:
            fail_query = False
            return None
        return original_query(*args)
    fake.xi.XIChangeHierarchy, fake.xi.XIQueryDevice = change, query
    native = create(monkeypatch, fake)
    try:
        with pytest.raises(m.X11DeviceError, match="device_query_failed"):
            native.detach_owned()
        assert native.detach_owned()["owned_masters_removed"] is True
        assert sum(c[0] == "remove" for c in fake.calls) == 1
    finally:
        native.close()


def test_final_sync_failure_retries_with_fresh_exact_removed_census(monkeypatch):
    fake = SessionFake()
    native = create(monkeypatch, fake)
    original_sync, calls = native.sync, 0
    def sync():
        nonlocal calls
        calls += 1
        if calls == 4:
            raise m.X11DeviceError("final_sync_failed")
        original_sync()
    native.sync = sync
    try:
        with pytest.raises(m.X11DeviceError, match="final_sync_failed"):
            native.detach_owned()
        assert native.detach_owned()["owned_masters_removed"] is True
        assert sum(c[0] == "remove" for c in fake.calls) == 1
    finally:
        native.close()


def test_add_unavailable_requires_zero_endpoints_and_unchanged_census(monkeypatch):
    fake = SessionFake()
    fake.xi.XIChangeHierarchy = lambda *_: 1
    monkeypatch.setattr(m, "_load_native", lambda: (fake.x, fake.xi, fake.xt))
    with pytest.raises(m.HierarchyAddUnavailableError):
        m.SessionXTest(":987", PREFIX, create=True)


def test_changed_census_or_partial_add_is_explicit_quarantine(monkeypatch):
    for partial in (False, True):
        fake = SessionFake()
        def reject(_display, spec, _count, *, partial=partial):
            if partial:
                fake.rows.append((20, PREFIX + " pointer", 1, 21, True))
            else:
                fake.rows[4] = (6, "changed human keyboard", 4, 3, True)
            return 1
        fake.xi.XIChangeHierarchy = reject
        monkeypatch.setattr(m, "_load_native", lambda: (fake.x, fake.xi, fake.xt))
        with pytest.raises(m.X11DeviceError) as exc:
            m.SessionXTest(":987", PREFIX, create=True)
        assert not isinstance(exc.value, m.HierarchyAddUnavailableError)
        assert not any(c[0] == "remove" for c in fake.calls)


def test_complete_pair_cleanup_after_later_startup_failure(monkeypatch):
    fake, original = SessionFake(), None
    original = fake.open_device
    fake.xi.XOpenDevice = lambda display, ident: None if ident == 23 else original(display, ident)
    monkeypatch.setattr(m, "_load_native", lambda: (fake.x, fake.xi, fake.xt))
    with pytest.raises(m.X11DeviceError, match="xtest_open_failed"):
        m.SessionXTest(":987", PREFIX, create=True)
    assert not any(r[1].startswith(PREFIX + " ") for r in fake.rows)
    assert sum(c[0] == "remove" for c in fake.calls) == 1
