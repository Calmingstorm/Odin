"""Scope-job drain is required before local Hyprland closure is certified."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from src.computer.runtime.hyprland_recovery import (
    HyprlandCrossIncarnationRecovery,
    HyprlandRetirementCapability,
)
from tests.test_hyprland_recovery_backend import runtime as runtime


async def test_cleanup_drains_cooperative_scope_job_before_certifying_closure(runtime):
    backend, provider, guardian = runtime
    entered = asyncio.Event()

    async def cooperative_scope_job():
        entered.set()
        await asyncio.Event().wait()

    job = asyncio.create_task(cooperative_scope_job())
    backend._scope_jobs.add(job)
    job.add_done_callback(backend._scope_jobs.discard)
    await entered.wait()

    assert await backend._cleanup_all() is True
    assert job.cancelled()
    assert not backend._scope_jobs
    assert backend._cleanup_evidence["scope_connection_closed"] is True
    guardian.close.assert_awaited_once()
    provider.close.assert_awaited_once()


async def test_unsettled_scope_job_blocks_closure_and_retirement_until_retry(runtime):
    backend, provider, guardian = runtime
    entered = asyncio.Event()
    settle = asyncio.Event()

    async def cancellation_resistant_scope_job():
        entered.set()
        while not settle.is_set():
            try:
                await settle.wait()
            except asyncio.CancelledError:
                pass

    job = asyncio.create_task(cancellation_resistant_scope_job())
    backend._scope_jobs.add(job)
    job.add_done_callback(backend._scope_jobs.discard)
    await entered.wait()

    assert await backend._cleanup_all() is False
    assert not job.done()
    assert backend._cleanup_evidence["scope_connection_closed"] is False
    assert backend._cleanup_evidence["hyprland_owned_connections_closed"] is False
    guardian.close.assert_awaited_once()
    provider.close.assert_awaited_once()

    # Cross-incarnation retirement must not promote a proof while an original
    # scope RPC remains live, even if the native ledger itself says released.
    witness = SimpleNamespace(prove_resource_absence=AsyncMock(),
                              verify_resource_absence=AsyncMock(), close=Mock())
    backend._resource_witness = witness
    backend._cross_incarnation = HyprlandCrossIncarnationRecovery(
        HyprlandRetirementCapability(runtime_qualified=True))
    backend._incarnation.exited = lambda: True
    result = await backend.recover_native_authority(consent_generation=2, command_id="scope-drain")
    assert result.state == "fresh_target_required"
    assert result.cleanup["local_resources_closed"] is False
    assert result.cleanup["resources_retired"] is False
    assert not result.runtime_qualified
    witness.prove_resource_absence.assert_not_awaited()

    settle.set()
    await job
    assert not backend._scope_jobs
    assert await backend._cleanup_all() is True
    assert backend._cleanup_evidence["scope_connection_closed"] is True
