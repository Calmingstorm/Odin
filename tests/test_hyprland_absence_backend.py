"""Retirement wiring tests; injected witnesses are not native qualification."""

import hashlib
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.runtime.hyprland_recovery import (
    HyprlandCrossIncarnationRecovery,
    HyprlandResourceAbsenceProof,
    HyprlandRetirementCapability,
)
from src.computer.runtime.hyprland_scope import owner_handle_to_record
from src.computer.store import canonical_hash
from tests.test_hyprland_durable_reconnect import durable as durable
from tests.test_hyprland_recovery_backend import runtime as runtime


def proof_for(handle, successor, command="retire"):
    return HyprlandResourceAbsenceProof(
        "hyprland-resource-absence-v1", command,
        canonical_hash(owner_handle_to_record(handle)), handle.compositor.digest,
        successor.digest, "a" * 48, True, True, "b" * 64)


async def test_coordinator_preserves_unknown_and_emits_bounded_evidence(durable):
    handle = durable[1]
    successor = replace(handle.compositor,
                        process=replace(handle.compositor.process, pid=4321))
    proof = proof_for(handle, successor)
    witness = SimpleNamespace(prove_resource_absence=AsyncMock(return_value=proof),
                              verify_resource_absence=AsyncMock(return_value=True))
    coordinator = HyprlandCrossIncarnationRecovery(
        HyprlandRetirementCapability(runtime_qualified=True))
    result = await coordinator.reconcile(
        provider=witness, handle=handle, successor=successor, command_id="retire",
        checkpoint=AsyncMock(), local_closure_confirmed=True)
    assert result.state == "fresh_target_required" and result.binding is None
    assert result.runtime_qualified and not result.receiver_release_verified
    assert result.original_outcome == "outcome_unknown"
    assert result.cleanup["unknown_release"] is True
    assert result.cleanup["released"] is result.cleanup["release_ack"] is False
    assert result.cleanup["resources_retired"] is True
    evidence = result.cleanup["retirement_evidence"]
    assert evidence["inventory_digest"] == "b" * 64
    assert evidence["native_certificate_digest"] == hashlib.sha256(b"a" * 48).hexdigest()
    assert "native_certificate" not in evidence


@pytest.mark.parametrize("closure", [False, None, 1, "true"])
async def test_coordinator_requires_exact_local_closure(durable, closure):
    handle = durable[1]
    witness = SimpleNamespace(prove_resource_absence=AsyncMock(),
                              verify_resource_absence=AsyncMock())
    result = await HyprlandCrossIncarnationRecovery(
        HyprlandRetirementCapability(runtime_qualified=True)).reconcile(
            provider=witness, handle=handle, successor=handle.compositor,
            command_id="retire", checkpoint=AsyncMock(), local_closure_confirmed=closure)
    assert not result.runtime_qualified and not result.cleanup["resources_retired"]
    witness.prove_resource_absence.assert_not_awaited()


@pytest.mark.parametrize("field,value", [
    ("inventory_digest", ""), ("inventory_digest", "g" * 64),
    ("owner_digest", "f" * 64), ("predecessor_digest", "f" * 64),
    ("successor_digest", "f" * 64), ("command_id", "different"),
    ("owned_virtual_devices_absent", 1), ("old_connections_absent", False),
])
async def test_invalid_proof_does_not_reach_verifier(durable, field, value):
    handle = durable[1]
    successor = replace(handle.compositor,
                        process=replace(handle.compositor.process, pid=4321))
    proof = replace(proof_for(handle, successor), **{field: value})
    witness = SimpleNamespace(prove_resource_absence=AsyncMock(return_value=proof),
                              verify_resource_absence=AsyncMock(return_value=True))
    result = await HyprlandCrossIncarnationRecovery(
        HyprlandRetirementCapability(runtime_qualified=True)).reconcile(
            provider=witness, handle=handle, successor=successor, command_id="retire",
            checkpoint=AsyncMock(), local_closure_confirmed=True)
    assert not result.runtime_qualified and "retirement_evidence" not in result.cleanup
    witness.verify_resource_absence.assert_not_awaited()


async def test_backend_uses_retained_witness_not_closed_provider(runtime, durable, monkeypatch):
    backend, provider, guardian = runtime
    handle = durable[1]
    backend._identity, backend._owner_handle = handle.compositor, handle
    backend._incarnation.exited = lambda: True
    successor = replace(handle.compositor,
                        process=replace(handle.compositor.process, pid=4321))
    witness = SimpleNamespace(
        prove_resource_absence=AsyncMock(return_value=proof_for(handle, successor, "txn")),
        verify_resource_absence=AsyncMock(return_value=True), close=Mock())
    backend._resource_witness = witness
    backend._cross_incarnation = HyprlandCrossIncarnationRecovery(
        HyprlandRetirementCapability(runtime_qualified=True))
    provider.reconcile_owner.side_effect = OSError()
    provider.owner_status.side_effect = OSError()
    monkeypatch.setattr(backend, "discover_successor_identity", AsyncMock(return_value=successor))
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.runtime_qualified and result.cleanup["resources_retired"]
    assert result.cleanup["unknown_release"] and not result.cleanup["released"]
    assert result.cleanup["guardian_process_reaped"] and result.cleanup["scope_connection_closed"]
    assert result.binding is None and not backend.input_supported
    witness.verify_resource_absence.assert_awaited_once()
    witness.close.assert_called_once()
    assert backend._resource_witness is None
    guardian.start.assert_not_awaited()
    provider.focus_bound_candidate.assert_not_awaited()


async def test_unknown_terminal_result_disposes_witness_without_retirement(runtime):
    backend, provider, guardian = runtime
    backend._incarnation.exited = lambda: True
    provider.reconcile_owner.side_effect = OSError()
    provider.owner_status.side_effect = OSError()
    guardian.close.return_value = {"process_reaped": False, "release_ack": False}
    witness = SimpleNamespace(prove_resource_absence=AsyncMock(), close=Mock())
    backend._resource_witness = witness
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert not result.runtime_qualified and not result.cleanup["resources_retired"]
    assert result.cleanup["unknown_release"] and not result.cleanup["released"]
    witness.close.assert_called_once()
    witness.prove_resource_absence.assert_not_awaited()
    assert backend._resource_witness is backend._incarnation is None


async def test_capture_failure_prevents_binding(runtime):
    backend, provider, guardian = runtime
    provider.capture_resource_witness = AsyncMock(side_effect=OSError("capture failure"))
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert not result.runtime_qualified and result.state == "operator_release_required"
    guardian.bind_scope.assert_not_awaited()


async def test_successor_discovery_does_not_prepare_plugin_or_adopt_window(runtime, monkeypatch):
    from src.computer.runtime import hyprland_discovery

    backend, provider, guardian = runtime
    backend._discovery_config = replace(backend.config, discovery_mode="auto", compositor_pid=None)
    successor = replace(backend._identity, process=replace(backend._identity.process, pid=9000))
    resolve = AsyncMock(return_value=SimpleNamespace(identity=successor))
    monkeypatch.setattr(hyprland_discovery.HyprlandDiscoveryResolver, "resolve", resolve)
    prepare = AsyncMock()
    monkeypatch.setattr(backend, "_prepare_plugin", prepare)
    original = backend._identity
    assert await backend.discover_successor_identity() == successor
    assert backend._identity is original
    prepare.assert_not_awaited()
    provider.focus_bound_candidate.assert_not_awaited()
    guardian.start.assert_not_awaited()


@pytest.mark.parametrize("same_identity", [True, False])
async def test_successor_discovery_rejects_same_incarnation_or_other_boot(
        runtime, monkeypatch, same_identity):
    from src.computer.runtime import hyprland_discovery

    backend, _, _ = runtime
    backend._discovery_config = replace(backend.config, discovery_mode="auto", compositor_pid=None)
    identity = backend._identity
    successor = identity if same_identity else replace(
        identity, process=replace(identity.process, boot_id="other-boot", pid=9000))
    monkeypatch.setattr(hyprland_discovery.HyprlandDiscoveryResolver, "resolve",
                        AsyncMock(return_value=SimpleNamespace(identity=successor)))
    assert await backend.discover_successor_identity() is None


async def test_verified_build_is_authorized_before_capture_and_bind(runtime):
    backend, provider, guardian = runtime
    calls = []
    backend._containment_build_id = "a" * 64
    backend._containment_plugin_sha256 = "b" * 64
    backend._containment_compositor_sha256 = "c" * 64
    provider.authorize_resource_containment = Mock(
        side_effect=lambda **kwargs: calls.append(("authorize", kwargs)))
    old_capture = provider.capture_owner

    async def capture(guardian_identity):
        calls.append(("owner", guardian_identity))
        return await old_capture(guardian_identity)

    provider.capture_owner = capture
    witness = SimpleNamespace(close=Mock())
    provider.capture_resource_witness = AsyncMock(return_value=witness)
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.state == "ready_for_replan"
    assert calls[0] == ("authorize", {
        "plugin_sha256": "b" * 64,
        "companion_build_id": "a" * 64,
        "compositor_sha256": "c" * 64,
    })
    assert calls[1][0] == "owner"
    provider.capture_resource_witness.assert_awaited_once_with(backend._owner_handle)
    guardian.bind_scope.assert_awaited_once()
    assert backend._resource_witness is witness
    witness.close.assert_not_called()
    await backend._capture_resource_witness(provider)
    assert backend._resource_witness is witness
    witness.close.assert_not_called()
