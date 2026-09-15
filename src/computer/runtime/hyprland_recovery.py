"""Hyprland recovery evidence, never input or receiver-delivery authority."""

from __future__ import annotations

import hashlib
import os
import re
import select
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class HyprlandRecoveryResult:
    state: str
    binding: dict[str, Any] | None
    cleanup: dict[str, Any]
    reason: str
    inventory: dict[str, Any] | None = None
    original_outcome: str = "outcome_unknown"
    receiver_release_verified: bool = False
    runtime_qualified: bool = False


def ledger_evidence(row: Any, handle: Any) -> dict[str, bool]:
    """Validate original ledger facts; retirement cannot supply release proof."""
    from .hyprland_scope import HyprlandOwnerHandle

    matched = (
        type(handle) is HyprlandOwnerHandle
        and type(row) is dict
        and row.get("owner_matched") is True
        and all(
            type(row.get(key)) is str
            and bool(row[key])
            and row[key] == getattr(handle, key, None)
            for key in ("instance_id", "plugin_epoch", "ledger_id")
        )
    )
    if matched and handle.recovery_capability:
        matched = all(type(row.get(key)) is type(getattr(handle, key))
                      and row[key] == getattr(handle, key) for key in (
                          "guardian_pid", "guardian_uid", "guardian_start_ticks",
                          "recovery_pid", "recovery_uid", "recovery_start_ticks"))
    confirmed = bool(
        matched
        and row.get("ledger_empty") is True
        and row.get("release_ack") is True
        and row.get("revoked") is True
        and row.get("unknown_release") is False
        and row.get("receiver_release_verified") is False
    )
    return {
        "owner_matched": bool(matched),
        "release_ack": confirmed,
        "unknown_release": not confirmed,
        "native_owner_retired": bool(
            matched and row.get("retired") is True and row.get("revoked") is True
            and row.get("native_resources_retired") is True
            and type(row.get("retirement_evidence_version")) is int
            and row["retirement_evidence_version"] == 1
            and row.get("retirement_evidence_kind") == "exact-client-resources-destroyed"
        ),
        "receiver_release_verified": False,
    }


@dataclass(frozen=True)
class HyprlandRetirementCapability:
    """Native qualification contract, not a user-configurable cleanup override."""

    protocol: str = "hyprland-resource-absence-v1"
    runtime_qualified: bool = False


@dataclass(frozen=True)
class HyprlandResourceAbsenceProof:
    """A native producer's exact old-resource absence certificate, never release."""

    protocol: str
    command_id: str
    owner_digest: str
    predecessor_digest: str
    successor_digest: str
    native_certificate: str
    owned_virtual_devices_absent: bool
    old_connections_absent: bool
    inventory_digest: str = ""


class HyprlandCrossIncarnationRecovery:
    """Preserve intent while retiring authority; never match titles or replay input.

    The production provider seam is explicit. Until native retirement has been
    qualified, no pidfd, administrator boolean or replacement compositor can
    promote this coordinator's result into automatic input authority.
    """

    def __init__(self, capability=None):
        if capability is None:
            from .hyprland_absence import RUNTIME_QUALIFIED

            capability = HyprlandRetirementCapability(runtime_qualified=RUNTIME_QUALIFIED)
        self.capability = capability

    async def reconcile(self, *, provider, handle, successor, command_id, checkpoint,
                        local_closure_confirmed=False):
        from ..store import canonical_hash
        from .hyprland_scope import owner_handle_to_record

        await checkpoint()
        if (type(self.capability) is not HyprlandRetirementCapability
                or self.capability.runtime_qualified is not True
                or self.capability.protocol != "hyprland-resource-absence-v1"):
            return HyprlandRecoveryResult(
                "operator_release_required", None,
                {"released": False, "release_ack": False, "unknown_release": True,
                 "resources_retired": False, "receiver_release_verified": False},
                "hyprland_cross_incarnation_unqualified")
        # The retained original witness, not a replacement plugin, owns the proof.
        verifier = getattr(provider, "verify_resource_absence", None)
        if (successor is None or not callable(verifier)
                or local_closure_confirmed is not True):
            return HyprlandRecoveryResult(
                "operator_release_required", None,
                {"released": False, "release_ack": False, "unknown_release": True,
                 "resources_retired": False, "receiver_release_verified": False},
                "hyprland_native_resource_witness_unavailable")
        # Query the qualified producer, never infer absence from compositor exit.
        proof = await provider.prove_resource_absence(
            handle, command_id=command_id, successor=successor,
            local_closure_confirmed=local_closure_confirmed)
        await checkpoint()
        valid = (
            type(proof) is HyprlandResourceAbsenceProof
            and proof.protocol == self.capability.protocol
            and proof.command_id == command_id
            and proof.owner_digest == canonical_hash(owner_handle_to_record(handle))
            and proof.predecessor_digest == handle.compositor.digest
            and proof.successor_digest == successor.digest
            and successor.digest != handle.compositor.digest
            and type(proof.native_certificate) is str
            and 32 <= len(proof.native_certificate) <= 4096
            and proof.owned_virtual_devices_absent is True
            and proof.old_connections_absent is True
            and type(proof.inventory_digest) is str
            and re.fullmatch(r"[0-9a-f]{64}", proof.inventory_digest) is not None
        )
        if valid:
            valid = await verifier(proof, handle=handle, successor=successor) is True
            await checkpoint()
        evidence = {}
        if valid:
            evidence["retirement_evidence"] = {
                "protocol": proof.protocol,
                "resource_model": "wayland-process-local-v1",
                "owner_digest": proof.owner_digest,
                "predecessor_digest": proof.predecessor_digest,
                "successor_digest": proof.successor_digest,
                "command_id": proof.command_id,
                "inventory_digest": proof.inventory_digest,
                "native_certificate_digest": hashlib.sha256(
                    proof.native_certificate.encode("utf-8")).hexdigest(),
                "original_compositor_exited": True,
                "original_guardian_exited": True,
                "local_resources_closed": True,
                "receiver_release_verified": False,
            }
        return HyprlandRecoveryResult(
            "fresh_target_required" if valid else "operator_release_required", None,
            {"released": False, "release_ack": False, "unknown_release": True,
             "resources_retired": valid, "receiver_release_verified": False,
             "retirement_basis": "native_resource_absence" if valid else "unproven",
             **evidence},
            "hyprland_fresh_target_required" if valid else "hyprland_retirement_unproven",
            runtime_qualified=valid)


class CompositorIncarnation:
    """Retained pidfd used ONLY for retirement, never receiver release proof."""

    def __init__(self, pid: int):
        self._fd: int | None = os.pidfd_open(pid, 0)

    def exited(self) -> bool:
        if self._fd is None:
            return False
        poll = select.poll()
        poll.register(self._fd, select.POLLIN)
        return any(events & select.POLLIN for _, events in poll.poll(0))

    def close(self) -> None:
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None
