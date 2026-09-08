"""F1: independently owned cleanup and narrow, durable restoration contracts."""
import asyncio
import fcntl
import os
from unittest.mock import AsyncMock

import pytest

from src.computer.models import RequestContext
from src.computer.runtime.x11_attached import X11AttachedBackend
from src.computer.runtime.x11_session_lifecycle import input_lease
from src.computer.store import ComputerStore


def backend():
    return X11AttachedBackend(enabled=True, display_name=":991", monitor_names=["fixture"])


def restored():
    return {"released": True, "owned_devices": "removed", "physical_slaves_restored": True,
            "no_inflight_input": True, "no_active_grabs": True, "owned_masters_removed": True}


def test_lease_is_separate_description_and_revocation_fences_admission():
    fd = os.memfd_create("f1-test", os.MFD_CLOEXEC)
    os.write(fd, b"1")
    check = os.open(f"/proc/self/fd/{fd}", os.O_RDWR)
    try:
        with input_lease(fd):
            with pytest.raises(BlockingIOError):
                fcntl.flock(check, fcntl.LOCK_EX | fcntl.LOCK_NB)
            os.pwrite(fd, b"0", 0)
            with pytest.raises(RuntimeError, match="revoked"):
                with input_lease(fd):
                    pytest.fail("revoked lease admitted")
        fcntl.flock(check, fcntl.LOCK_EX | fcntl.LOCK_NB)
    finally:
        os.close(check)
        os.close(fd)


@pytest.mark.asyncio
async def test_cancelled_detach_keeps_owner_until_restoration(monkeypatch):
    b = backend()
    b.creates_devices = True
    b._device_state = "session_idle"
    entered, finish = asyncio.Event(), asyncio.Event()
    async def cleanup():
        entered.set()
        await finish.wait()
        b._restoration = restored()
        return True
    monkeypatch.setattr(b, "_cleanup_workers", cleanup)
    waiter = asyncio.create_task(b.detach())
    await entered.wait()
    waiter.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiter
    assert not b._detach_job.done()
    finish.set()
    result = await asyncio.wait_for(b._detach_job, 1)
    assert result["stopped"] and result["owned_devices"] == "removed"


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", list(restored()))
async def test_detach_requires_every_restoration_proof(monkeypatch, missing):
    b = backend()
    b.creates_devices = True
    b._restoration = restored()
    b._restoration.pop(missing)
    b._device_state = "removed"
    monkeypatch.setattr(b, "_cleanup_workers", AsyncMock(return_value=True))
    result = await b.detach()
    assert not result["stopped"] and result["state"] == "quarantined"


def test_store_cannot_persist_clean_attached_retention(tmp_path):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    try:
        ctx = RequestContext("o", "c", "t", "h")
        for environment in ("existing_session", "isolated"):
            grant = store.create_session(ctx, "fixture", platform="x11", environment=environment)
            store.record_cleanup(grant.session_id,
                                 {"owned_devices": "retained_inactive"}, clean=True)
            assert store.cleanup(grant.session_id)["complete"] is (environment == "isolated")
            store.set_state(grant.session_id, "closed")
    finally:
        store.db.close()


def test_lifecycle_retains_owner_after_transient_failure(monkeypatch):
    from types import SimpleNamespace

    from src.computer.runtime import x11_owned_device as devices
    from src.computer.runtime import x11_session_lifecycle as lifecycle
    calls, receipts, clock = [], [], [0]
    def detach():
        calls.append("detach")
        if len(calls) <= 2:
            raise RuntimeError("external grab still active")
        return restored()
    native = SimpleNamespace(identity=lambda: [], owned_release_state=lambda: {},
                             detach_owned=detach, close=lambda: calls.append("close"))
    monkeypatch.setattr(devices, "SessionXTest", lambda *a, **k: native)
    monkeypatch.setattr(lifecycle.select, "select", lambda *a: ([0], [], []))
    monkeypatch.setattr(lifecycle.time, "monotonic", lambda: clock[0])
    def sleep(_seconds):
        clock[0] = 16
    monkeypatch.setattr(lifecycle.time, "sleep", sleep)
    monkeypatch.setattr(lifecycle, "emit", receipts.append)
    fd = os.memfd_create("lifecycle-unit", os.MFD_CLOEXEC)
    os.write(fd, b"0")
    try:
        lifecycle.serve({"session_lease_fd": fd, "display_name": ":991",
                         "session_prefix": "Odin session " + "a" * 32})
        assert calls == ["detach", "detach", "detach", "close"]
        assert receipts[-2]["released"] is False
        assert receipts[-1] == restored()
        assert os.pread(fd, 1, 0) == b"0"
    finally:
        os.close(fd)
