"""Fake-only terminal shared-XTEST reconciliation. Never open a display."""
import copy
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import x11_attached_worker as worker
from src.computer.runtime import x11_owned_device as devices
from src.computer.runtime.x11_attached import X11AttachedBackend


IDENTITY = [[2, "Virtual core pointer", 1, 3, True],
            [4, "Virtual core XTEST pointer", 3, 2, True]]


def backend():
    b = X11AttachedBackend(enabled=True, display_name=":987", monitor_names=["fake"],
                           input_enabled=True)
    b._closed = b._paused = b._release_failed = True
    b._device_identity = copy.deepcopy(IDENTITY)
    b._runtime_descriptor = {"launch_pending": False}
    b._reconciliation_census = AsyncMock(return_value=True)
    b._query_shared_all_up = AsyncMock(return_value={
        "ok": True, "all_up": True, "device_identity": copy.deepcopy(IDENTITY),
        "proof_scope": "recorded_synthetic_devices_only", "physical_release_proven": False})
    return b


@pytest.mark.asyncio
async def test_exact_proof_allows_terminal_close_without_clearing_history():
    b = backend()
    assert (await b.detach())["released"] is False
    proof = await b.reconcile_owned_cleanup()
    assert proof["reconciled"] is True
    assert proof["physical_release_proven"] is False
    closed = await b.detach()
    assert closed["released"] is True and closed["state"] == "closed"
    assert closed["release_proof_scope"] == "recorded_synthetic_devices_only"
    assert b._release_failed and b._closed and b._paused and not b.input_supported
    with pytest.raises(Exception, match="capture_not_paused|session_devices|owned_release"):
        await b.resume(consent_generation=2)


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["held", "identity", "unknown", "physical"])
async def test_bad_endpoint_evidence_never_clears_failure(mutation):
    b = backend()
    proof = b._query_shared_all_up.return_value
    if mutation == "held":
        proof["all_up"] = False
    elif mutation == "identity":
        proof["device_identity"] = [[999]]
    elif mutation == "unknown":
        proof.pop("ok")
    else:
        proof["physical_release_proven"] = True
    assert not (await b.reconcile_owned_cleanup())["reconciled"]
    assert not (await b.detach())["released"]
    assert b._release_failed


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["guardian", "unknown_child", "input", "pending"])
async def test_active_or_unknown_worker_never_touches_pipes(kind):
    b = backend()
    child = object()  # No stdin or signal methods: any touching is a test failure.
    if kind == "guardian":
        b._guardians.add(child)
    elif kind == "unknown_child":
        b._children.add(child)
    elif kind == "input":
        b._jobs[object()] = ("input", object())
    else:
        b._runtime_descriptor["launch_pending"] = True
    b._cleanup_workers = AsyncMock(side_effect=AssertionError("must not release"))
    assert not (await b.reconcile_owned_cleanup())["reconciled"]
    b._cleanup_workers.assert_not_awaited()
    b._query_shared_all_up.assert_not_awaited()
    assert b._release_failed


@pytest.mark.asyncio
async def test_unknown_process_census_never_queries_native():
    b = backend()
    b._reconciliation_census.return_value = False
    assert not (await b.reconcile_owned_cleanup())["reconciled"]
    b._query_shared_all_up.assert_not_awaited()


@pytest.mark.asyncio
async def test_unverified_shared_device_state_requires_new_proof():
    b = backend()
    b._device_state = "persistent_release_unverified"
    assert (await b.reconcile_owned_cleanup())["reconciled"]
    assert b._release_failed and (await b.detach())["released"]


@pytest.mark.asyncio
async def test_query_worker_exit_requires_second_process_census():
    b = backend()
    b._reconciliation_census.side_effect = [True, False]
    assert not (await b.reconcile_owned_cleanup())["reconciled"]
    assert b._release_failed and not (await b.detach())["released"]


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["descriptor", "identity"])
async def test_certificate_exactly_pins_runtime_and_endpoints(change):
    b = backend()
    assert (await b.reconcile_owned_cleanup())["reconciled"]
    if change == "descriptor":
        b._runtime_descriptor["launch_pending"] = True
    else:
        b._device_identity = [[111]]
    assert not (await b.detach())["released"]
    assert b._release_failed


@pytest.mark.parametrize("held", [False, True])
def test_worker_only_query_methods_are_available(monkeypatch, held):
    calls = []

    class QueryOnly:
        def __init__(self, display):
            assert display == ":987"
            calls.append("open")

        def identity(self):
            calls.append("identity")
            return copy.deepcopy(IDENTITY)

        def shared_release_all_up(self):
            calls.append("query")
            return not held

        def close(self):
            calls.append("close")

        def __getattr__(self, name):
            raise AssertionError("forbidden native operation " + name)

    monkeypatch.setattr(devices, "ExistingXTest", QueryOnly)
    proof = worker.run({"display_name": ":987", "xauthority": "", "monitor_names": ["fake"],
                        "operation": "reconcile_shared_all_up",
                        "expected_device_identity": IDENTITY})
    assert proof["all_up"] is (not held)
    assert calls == ["open", "identity", "query", "identity", "close"]


def test_worker_identity_mismatch_never_queries_state(monkeypatch):
    class Changed:
        def __init__(self, display):
            pass

        def identity(self):
            return [[999]]

        def shared_release_all_up(self):
            pytest.fail("mismatch must not query")

        def close(self):
            pass

    monkeypatch.setattr(devices, "ExistingXTest", Changed)
    with pytest.raises(ValueError, match="identity_changed"):
        worker.run({"display_name": ":987", "xauthority": "", "monitor_names": ["fake"],
                    "operation": "reconcile_shared_all_up", "expected_device_identity": IDENTITY})
