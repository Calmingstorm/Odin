"""Proof authority with real pidfds, no native-display claims."""
import copy
import os
import subprocess
from dataclasses import replace
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import hyprland_absence as absence
from src.computer.runtime import hyprland_scope as scope
from src.computer.runtime.hyprland_identity import (
    ExecutableTrust,
    HyprlandIdentity,
    ProcessPin,
    _proc_start,
)
from src.computer.runtime.hyprland_scope import HyprlandOwnerHandle, HyprlandScopeFailure


@pytest.fixture
def originals(monkeypatch):
    children = [subprocess.Popen(["/usr/bin/sleep", "30"]) for _ in range(2)]
    uid = os.geteuid()
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    old = HyprlandIdentity(
        ProcessPin(children[0].pid, uid, _proc_start(children[0].pid, uid), boot,
                   1, 2, 3, 4, 5, "a" * 64),
        ExecutableTrust("/test/Hyprland", "a" * 64, "0.55.2", "b" * 40))
    handle = HyprlandOwnerHandle(old, "i1-" + "1" * 32, "2" * 48, "3" * 48,
                                children[1].pid, uid, str(_proc_start(children[1].pid, uid)),
                                os.getpid(), uid, str(_proc_start(os.getpid(), uid)), "4" * 48)
    successor = replace(old, process=replace(old.process, pid=old.process.pid + 10000))
    row = {"companion_build_id": "b" * 64, "resource_containment": {
        "version": 1, "resource_model": "wayland-process-local-v1",
        "inventory_id": "c" * 48, "keyboard_count": 1, "pointer_count": 1,
        "persistent_devices": False, "kernel_devices": False,
        "endpoint_semantics": "original-process-protocol-dispatch"}}
    monkeypatch.setattr(absence, "revalidate", AsyncMock())
    yield handle, successor, row, children
    for child in children:
        if child.poll() is None:
            child.kill()
        child.wait()


def stop(children):
    for child in children:
        child.kill()
        child.wait()


@pytest.mark.asyncio
async def test_stale_wrong_or_missing_witness_refused(originals):
    handle, successor, row, children = originals
    witness = await absence.ResourceContainmentWitness.capture(handle, row)
    try:
        stop(children)
        for target in (handle.compositor,
                       replace(successor, process=replace(successor.process, boot_id="other")),
                       replace(successor, process=replace(successor.process, uid=9999)),
                       replace(successor, trust=replace(successor.trust, sha256="f" * 64))):
            with pytest.raises(HyprlandScopeFailure):
                await witness.prove_resource_absence(
                    handle, command_id="refused", successor=target, local_closure_confirmed=True)
        original = witness._inventory["inventory_id"]
        witness._inventory["inventory_id"] = "f" * 48
        with pytest.raises(HyprlandScopeFailure):
            await witness.prove_resource_absence(
                handle, command_id="refused", successor=successor, local_closure_confirmed=True)
        witness._inventory["inventory_id"] = original
        witness.close()
        with pytest.raises(HyprlandScopeFailure):
            await witness.prove_resource_absence(
                handle, command_id="refused", successor=successor, local_closure_confirmed=True)
    finally:
        witness.close()


@pytest.mark.asyncio
async def test_successor_revalidated_at_verification(originals):
    handle, successor, row, children = originals
    witness = await absence.ResourceContainmentWitness.capture(handle, row)
    try:
        stop(children)
        proof = await witness.prove_resource_absence(
            handle, command_id="retire", successor=successor, local_closure_confirmed=True)
        absence.revalidate.side_effect = OSError("successor-exited")
        assert not await witness.verify_resource_absence(proof, handle=handle, successor=successor)
        absence.revalidate.side_effect = None
        assert not await witness.verify_resource_absence(proof, handle=handle, successor=successor)
    finally:
        witness.close()


@pytest.mark.asyncio
async def test_capture_requires_alive_processes_and_inventory(originals):
    handle, _, row, children = originals
    with pytest.raises(HyprlandScopeFailure):
        await absence.ResourceContainmentWitness.capture(handle, {})
    stop(children)
    with pytest.raises((OSError, HyprlandScopeFailure)):
        await absence.ResourceContainmentWitness.capture(handle, row)


@pytest.mark.asyncio
async def test_provider_build_authorization_export_and_close(originals, monkeypatch):
    handle, successor, inventory, children = originals
    provider = scope.HyprlandScopeProvider(
        socket_path="/tmp/unconnected-scope.sock", expected_uid=os.geteuid(),
        expected_compositor_pid=handle.compositor.process.pid)
    provider._attested_identity = handle.compositor
    provider._attested_instance = handle.instance_id
    provider._attested_plugin = handle.plugin_epoch
    row = {
        **inventory, "ok": True, "version": 1, "scope_protocol_version": 1,
        "compositor_pid": handle.compositor.process.pid,
        "compositor_uid": handle.compositor.process.uid,
        "compositor_start_ticks": handle.compositor.process.start_ticks,
        "boot_id": handle.compositor.process.boot_id,
        **{key: getattr(handle, key) for key in (
            "instance_id", "plugin_epoch", "ledger_id", "guardian_pid", "guardian_uid",
            "guardian_start_ticks", "recovery_pid", "recovery_uid", "recovery_start_ticks")},
        "owner_protocol_version": 1, "owner_reconnect_version": 1,
        "retirement_evidence_version": 1, "retirement_evidence_kind": "unavailable",
        "resource_containment_version": 1, "resource_model": absence.RESOURCE_MODEL,
        "cross_compositor_retirement_supported": True, "owner_matched": True,
        "ledger_empty": True, "release_ack": True, "revoked": False, "retired": False,
        "unknown_release": False, "native_resources_retired": False,
        "receiver_release_verified": False,
    }
    provider._request = AsyncMock(side_effect=lambda request: copy.deepcopy(row))
    monkeypatch.setattr(scope, "revalidate", AsyncMock())
    assert await provider.capture_resource_witness(handle) is None
    with pytest.raises(HyprlandScopeFailure):
        provider.authorize_resource_containment(companion_build_id="malformed")
    provider.authorize_resource_containment(companion_build_id=row["companion_build_id"])
    with pytest.raises(HyprlandScopeFailure):
        provider.authorize_resource_containment(companion_build_id="f" * 64)
    for field, value in (("companion_build_id", "f" * 64), ("resource_model", "not-contained"),
                         ("resource_containment_version", True), ("plugin_epoch", "f" * 48)):
        before = row[field]
        row[field] = value
        with pytest.raises(HyprlandScopeFailure):
            await provider.capture_resource_witness(handle)
        row[field] = before
    row["cross_compositor_retirement_supported"] = False
    assert await provider.capture_resource_witness(handle) is None
    assert (await provider.recovery_capabilities())["runtime_qualified"] is False
    with pytest.raises(HyprlandScopeFailure):
        await provider.prove_resource_absence(handle, command_id="missing", successor=successor)
    assert not await provider.verify_resource_absence(None, handle=handle, successor=successor)
    row["cross_compositor_retirement_supported"] = True
    assert (await provider.recovery_capabilities())["cross_compositor_retirement_supported"] is True
    witness = await provider.capture_resource_witness(handle)
    try:
        assert await provider.capture_resource_witness(handle) is witness
        assert provider.export_resource_witness(handle) is witness
        await provider.close()
        stop(children)
        proof = await provider.prove_resource_absence(
            handle, command_id="closed", successor=successor, local_closure_confirmed=True)
        assert await provider.verify_resource_absence(proof, handle=handle, successor=successor)
    finally:
        witness.close()


@pytest.mark.asyncio
async def test_real_pidfds_proof_identity_and_replay(originals):
    handle, successor, row, children = originals
    witness = await absence.ResourceContainmentWitness.capture(handle, row)
    try:
        stop(children)
        proof = await witness.prove_resource_absence(
            handle, command_id="retire-1", successor=successor, local_closure_confirmed=True)
        assert proof.owned_virtual_devices_absent and proof.old_connections_absent
        assert len(proof.inventory_digest) == 64
        assert not await witness.verify_resource_absence(
            copy.copy(proof), handle=handle, successor=successor)
        assert await witness.verify_resource_absence(proof, handle=handle, successor=successor)
        assert not await witness.verify_resource_absence(proof, handle=handle, successor=successor)
        with pytest.raises(HyprlandScopeFailure):
            await witness.prove_resource_absence(
                handle, command_id="retire-1", successor=successor, local_closure_confirmed=True)
    finally:
        witness.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("survivor", [0, 1, None])
async def test_both_originals_exited_and_local_closure_required(originals, survivor):
    handle, successor, row, children = originals
    witness = await absence.ResourceContainmentWitness.capture(handle, row)
    try:
        for i, child in enumerate(children):
            if i != survivor:
                child.kill()
                child.wait()
        with pytest.raises(HyprlandScopeFailure):
            await witness.prove_resource_absence(
                handle, command_id="not-yet", successor=successor,
                local_closure_confirmed=survivor is not None)
    finally:
        witness.close()
