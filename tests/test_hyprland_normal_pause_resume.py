"""Ordinary continuity is local rearming, not recovery; fault-injected only."""
# ruff: noqa: F811
import asyncio
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from tests.computer.test_hyprland_backend import scope
from tests.test_hyprland_recovery_backend import runtime  # noqa: F401


async def test_repeated_clean_pause_resume_never_reconciles_or_replays(runtime):
    backend, provider, guardian = runtime
    for generation in (2, 3, 4):
        assert (await backend.pause())["released"]
        closes = guardian.close.await_count
        assert (await backend.pause())["released"]
        assert guardian.close.await_count == closes
        assert (await backend.resume(consent_generation=generation))["resumed"]
        assert guardian.close.await_count == closes
        assert backend._generation == generation
        assert not backend.normal_resume_retryable
        assert backend.input_readiness == "observation_required"
        assert backend._frame is None and backend._fingerprint is None
    assert guardian.start.await_count == 3
    assert provider.capture_owner.await_count == 3
    provider.reconcile_owner.assert_not_awaited()
    provider.retire_owner.assert_not_awaited()
    provider.owner_status.assert_not_awaited()


@pytest.mark.parametrize("change", ["window_id", "plugin_epoch", "instance_id", "identity"])
async def test_exact_target_changes_fence_before_guardian_start(runtime, change):
    backend, provider, guardian = runtime
    await backend.pause()
    provider.focus_bound_candidate.return_value[change] = "replacement"
    with pytest.raises(ComputerError, match="hyprland_original_target_changed"):
        await backend.resume(consent_generation=2)
    guardian.start.assert_not_awaited()
    assert backend._paused and not backend.input_supported


@pytest.mark.parametrize("receipt", [
    {"release_ack": False, "process_reaped": True},
    {"release_ack": True, "unknown_release": True, "process_reaped": True},
    {"release_ack": True, "process_reaped": False},
])
async def test_uncertain_or_unreaped_pause_never_rearms(runtime, receipt):
    backend, provider, guardian = runtime
    guardian.close.return_value = receipt
    assert not (await backend.pause())["released"]
    with pytest.raises(ComputerError):
        await backend.resume(consent_generation=2)
    guardian.start.assert_not_awaited()
    provider.focus_bound_candidate.assert_not_awaited()


async def test_actual_compositor_death_never_rearms(runtime):
    backend, provider, guardian = runtime
    await backend.pause()
    backend._incarnation.exited = lambda: True
    with pytest.raises(ComputerError, match="hyprland_compositor_exited"):
        await backend.resume(consent_generation=2)
    guardian.start.assert_not_awaited()
    provider.focus_bound_candidate.assert_not_awaited()


async def test_resume_requires_real_pause_and_new_consent(runtime):
    backend, _, guardian = runtime
    backend._invalidate()
    with pytest.raises(ComputerError, match="hyprland_owned_cleanup_unverified"):
        await backend.resume(consent_generation=2)
    await backend.pause()
    with pytest.raises(ComputerError, match="hyprland_renewed_session_consent_required"):
        await backend.resume(consent_generation=1)
    guardian.start.assert_not_awaited()


@pytest.mark.parametrize("phase", ["attest", "focus", "start", "owner", "bind"])
async def test_cancel_rearm_boundary_revokes_and_cleans_new_resources(runtime, phase):
    backend, provider, guardian = runtime
    await backend.pause()
    endpoint = {"attest": provider.attest_identity, "focus": provider.focus_bound_candidate,
                "start": guardian.start, "owner": provider.capture_owner,
                "bind": guardian.bind_scope}[phase]
    endpoint.side_effect = asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError):
        await backend.resume(consent_generation=2)
    assert backend._paused and not backend.input_supported
    assert backend._generation == 1
    assert backend._frame is None


async def test_missing_scope_evidence_is_not_replaced_by_old_pause_receipt(runtime):
    backend, _, guardian = runtime
    await backend.pause()
    backend._action_scope = AsyncMock(side_effect=ComputerError("wayland_scope_evidence_expired"))
    guardian.close.return_value = {"release_ack": False, "process_reaped": True}
    with pytest.raises(ComputerError, match="wayland_scope_evidence_expired"):
        await backend.resume(consent_generation=2)
    assert backend._release_failed
    assert not backend.normal_resume_retryable
    assert backend._clean_pause_epoch is None
    with pytest.raises(ComputerError):
        await backend.resume(consent_generation=3)


@pytest.mark.parametrize("child", [True, False])
async def test_same_process_surface_requires_exact_root_or_verified_modal_parent(runtime, child):
    backend, _, guardian = runtime
    await backend.pause()
    backend._action_scope = AsyncMock(side_effect=lambda _: (scope(
        backend._output, surface_token="other-window", plugin_epoch="e" * 48,
        modal=True, parent_chain_verified=True,
        parent_tokens=["window-1"] if child else []), 1))
    if child:
        assert (await backend.resume(consent_generation=2))["resumed"]
        assert backend.input_readiness == "observation_required"
    else:
        with pytest.raises(ComputerError, match="input_focus_unavailable"):
            await backend.resume(consent_generation=2)
        guardian.bind_scope.assert_not_awaited()


async def test_transient_rearm_failure_can_retry_without_losing_target(runtime):
    backend, provider, guardian = runtime
    await backend.pause()
    provider.attest_identity.side_effect = TimeoutError()
    with pytest.raises(TimeoutError):
        await backend.resume(consent_generation=2)
    assert backend.normal_resume_retryable
    provider.attest_identity.side_effect = None
    assert (await backend.resume(consent_generation=3))["resumed"]
    assert not backend.normal_resume_retryable
    guardian.start.assert_awaited_once()
