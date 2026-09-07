"""Integration boundaries for terminal pause and narrow shared fallback."""
import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.runtime.x11_attached import AttachedFailure, X11AttachedBackend


def backend():
    return X11AttachedBackend(enabled=True, display_name=":991", monitor_names=["fixture"])


def restored():
    return {"released": True, "owned_devices": "removed", "physical_slaves_restored": True,
            "no_inflight_input": True, "no_active_grabs": True, "owned_masters_removed": True}


@pytest.mark.asyncio
async def test_pause_revokes_and_waits_restoration_then_refuses_resume(monkeypatch):
    b = backend()
    b.creates_devices = True
    b._device_state = "session_release_unverified"
    b._session_lease_fd = os.memfd_create("pause-test", os.MFD_CLOEXEC)
    os.write(b._session_lease_fd, b"1")
    close = Mock()
    b._lifecycle = SimpleNamespace(stdin=SimpleNamespace(close=close))
    async def restore():
        await asyncio.sleep(0)
        b._restoration = restored()
    b._lifecycle_job = asyncio.create_task(restore())
    monkeypatch.setattr(b, "_cleanup_workers", AsyncMock(return_value=True))
    try:
        result = await b.pause()
        assert result["released"] and result["owned_devices"] == "removed"
        assert result["resume_requires_new_session"]
        assert os.pread(b._session_lease_fd, 1, 0) == b"0"
        assert close.called
        with pytest.raises(AttachedFailure, match="new_session_required"):
            await b.resume(consent_generation=b._generation + 1)
    finally:
        os.close(b._session_lease_fd)


@pytest.mark.asyncio
async def test_pause_unverified_session_never_claims_release(monkeypatch):
    b = backend()
    b._device_state = "session_release_unverified"
    monkeypatch.setattr(b, "_cleanup_workers", AsyncMock(return_value=True))
    assert (await b.pause())["released"] is False
    with pytest.raises(AttachedFailure):
        await b.resume(consent_generation=b._generation + 1)


@pytest.mark.asyncio
async def test_detach_native_proofs_do_not_claim_application_preservation(monkeypatch):
    b = backend()
    b.creates_devices = True
    b._restoration = restored()
    monkeypatch.setattr(b, "_cleanup_workers", AsyncMock(return_value=True))
    result = await b.detach()
    assert result["owned_masters_removed"] is True
    assert result["applications_preserved"] is False
    assert result["state"] == "quarantined"
    assert result["recovery"] == "application_preservation_unverified"


@pytest.mark.parametrize("error_type", ["unavailable", "malformed"])
def test_lifecycle_shared_fallback_only_for_proven_no_creation(monkeypatch, error_type):
    from src.computer.runtime import x11_owned_device as devices
    from src.computer.runtime import x11_session_lifecycle as lifecycle
    receipts, calls = [], []
    error = (devices.HierarchyAddUnavailableError if error_type == "unavailable"
             else devices.X11DeviceError)
    def fail(*args, **kwargs):
        raise error("creation_rejected")
    def shared(*args):
        calls.append("shared")
        return SimpleNamespace(identity=lambda: [[2, "Virtual core pointer", 1, 3, True]],
                               owned_release_state=lambda: {},
                               close=lambda: calls.append("close"))
    monkeypatch.setattr(devices, "SessionXTest", fail)
    monkeypatch.setattr(devices, "ExistingXTest", shared)
    monkeypatch.setattr(lifecycle, "emit", receipts.append)
    fd = os.memfd_create("fallback-test", os.MFD_CLOEXEC)
    os.write(fd, b"0")
    try:
        request = {"session_lease_fd": fd, "display_name": ":991",
                   "session_prefix": "Odin session " + "b" * 32}
        if error_type == "malformed":
            with pytest.raises(devices.X11DeviceError):
                lifecycle.serve(request)
            assert calls == [] and receipts[-1]["released"] is False
        else:
            lifecycle.serve(request)
            assert calls == ["shared", "close"]
            assert receipts[0]["pointer"] == "shared"
            assert receipts[0]["session_input_devices"] is False
            assert receipts[-1] == {"released": True, "owned_devices": "not_created"}
        assert os.pread(fd, 1, 0) == b"0"
    finally:
        os.close(fd)
