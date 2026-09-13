"""Fault-injected backend recovery, no compositor or receiver qualification."""

import asyncio
import copy
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from src.computer.runtime.hyprland_identity import HyprlandIdentity, ProcessPin
from src.computer.runtime.hyprland_recovery import ledger_evidence
from src.computer.runtime.hyprland_scope import HyprlandOwnerHandle
from tests.computer.test_hyprland_backend import config, output, scope


def identity():
    return HyprlandIdentity(
        ProcessPin(4242, 1000, 42, "b" * 36, 1, 2, 3, 4, 5, "a" * 64),
        config().compositor_trust,
    )


def owner():
    return HyprlandOwnerHandle(identity(), "i" * 48, "e" * 48, "l" * 48,
                               123, 1000, "44", 321, 1000, "45")


def evidence(**changes):
    return dict(owner_matched=True, instance_id="i" * 48, plugin_epoch="e" * 48,
                ledger_id="l" * 48, ledger_empty=True, release_ack=True, revoked=True,
                unknown_release=False, retired=True, receiver_release_verified=False,
                native_resources_retired=True, retirement_evidence_version=1,
                retirement_evidence_kind="exact-client-resources-destroyed") | changes


@pytest.fixture
def runtime(monkeypatch):
    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    backend.startup_descriptor("a" * 32)
    backend._started = True
    backend._identity = identity()
    backend._owner_handle = owner()
    backend._output = backend._output_pin = output()
    backend._application_pin = scope()["application"]
    selected = dict(instance_id="i" * 48, plugin_epoch="e" * 48, window_id="window-1",
                    output_name="DP-1", output_id="out-1", output={
                        "x": -800, "y": 20, "width": 80, "height": 60,
                        "pixel_width": 8, "pixel_height": 6, "scale": 0.1, "transform": 0},
                    identity={"pid": 1234, "uid": 1000, "start_ticks": 100,
                              "executable": "/usr/bin/test", "exe_device": 1, "exe_inode": 2})
    backend._selected_binding = selected
    provider = SimpleNamespace(
        socket_path="/run/user/1000/test.sock", attest_identity=AsyncMock(),
        reconcile_owner=AsyncMock(return_value=evidence()),
        retire_owner=AsyncMock(return_value=evidence()),
        owner_status=AsyncMock(return_value=evidence()), close=AsyncMock(),
        focus_bound_candidate=AsyncMock(return_value=copy.deepcopy(selected)),
        capture_owner=AsyncMock(return_value=replace(owner(), ledger_id="n" * 48)),
    )
    guardian = SimpleNamespace(
        alive=True, owner_identity={"pid": 123, "uid": 1000, "start_ticks": 44},
        start=AsyncMock(), bind_scope=AsyncMock(),
        close=AsyncMock(return_value={"release_ack": True, "process_reaped": True}),
    )
    backend._guardian = guardian
    backend._scope_provider = provider
    backend._incarnation = SimpleNamespace(exited=lambda: False, close=lambda: None)
    backend.recovery_identity_callback = lambda _: None
    monkeypatch.setattr(backend, "_new_provider", lambda: provider)
    monkeypatch.setattr(hb, "HyprlandGuardian", lambda *args: guardian)
    monkeypatch.setattr(hb, "revalidate", AsyncMock())
    monkeypatch.setattr(backend, "_action_scope", AsyncMock(
        side_effect=lambda _: (scope(backend._output, surface_token="window-1",
                                    plugin_epoch="e" * 48), 1)))
    return backend, provider, guardian


@pytest.mark.parametrize("changes", [
    {"owner_matched": False}, {"ledger_empty": False}, {"release_ack": False},
    {"revoked": False}, {"unknown_release": True}, {"instance_id": "wrong"},
    {"plugin_epoch": "wrong"}, {"ledger_id": "wrong"}, {"release_ack": 1},
    {"receiver_release_verified": True},
])
def test_bad_ledger_never_releases(changes):
    assert not ledger_evidence(evidence(**changes), owner())["release_ack"]


def test_untyped_owner_cannot_manufacture_evidence():
    assert not ledger_evidence(evidence(), SimpleNamespace(**owner().__dict__))["release_ack"]


async def test_prepare_is_suspended_commit_requires_fresh_observation(runtime):
    backend, provider, guardian = runtime
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.state == "ready_for_replan", result
    assert not backend.input_supported and backend._paused
    assert result.cleanup["released"] and not result.receiver_release_verified
    assert not result.runtime_qualified
    provider.focus_bound_candidate.assert_awaited_once_with(
        backend._selected_binding, allow_output_handoff=True)
    assert guardian.start.await_count == 1
    backend.commit_native_recovery(consent_generation=2)
    assert backend.input_readiness == "observation_required"
    with pytest.raises(ComputerError):
        backend.commit_native_recovery(consent_generation=2)


async def test_output_move_preserves_exact_window(runtime):
    backend, provider, _ = runtime
    moved = copy.deepcopy(backend._selected_binding)
    moved.update(output_name="DP-2", output_id="out-2")
    provider.focus_bound_candidate.return_value = moved
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.state == "ready_for_replan"
    assert result.binding["output_name"] == "DP-2"
    assert result.binding["window_id"] == "window-1"


@pytest.mark.parametrize("key", ["window_id", "plugin_epoch", "instance_id", "identity"])
async def test_replacement_identity_never_approximated(runtime, key):
    backend, provider, guardian = runtime
    provider.focus_bound_candidate.return_value[key] = "wrong"
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.state != "ready_for_replan"
    guardian.start.assert_not_awaited()
    assert backend._paused and not backend.input_supported


async def test_dead_incarnation_is_neither_native_retirement_nor_release(runtime):
    backend, provider, guardian = runtime
    backend._incarnation.exited = lambda: True
    provider.reconcile_owner.side_effect = OSError()
    provider.owner_status.side_effect = OSError()
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.state == "fresh_target_required"
    assert not result.cleanup["resources_retired"]
    assert result.cleanup["original_compositor_exited"]
    assert result.cleanup["local_resources_closed"]
    assert result.cleanup["retirement_basis"] == "unproven"
    assert result.cleanup["unknown_release"] and not result.cleanup["released"]
    guardian.start.assert_not_awaited()


@pytest.mark.parametrize("changes", [
    {"native_resources_retired": False}, {"native_resources_retired": 1},
    {"retirement_evidence_version": None}, {"retirement_evidence_version": True},
    {"retirement_evidence_version": 2}, {"retirement_evidence_kind": "unavailable"},
])
async def test_retired_boolean_without_native_resource_proof_stays_unproven(runtime, changes):
    backend, provider, guardian = runtime
    row = evidence(release_ack=False, ledger_empty=False, unknown_release=True, **changes)
    provider.reconcile_owner.return_value = provider.retire_owner.return_value = row
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.state == "operator_release_required"
    assert not result.cleanup["resources_retired"]
    assert result.cleanup["unknown_release"] and not result.cleanup["released"]
    guardian.start.assert_not_awaited()


async def test_unknown_native_retirement_does_not_clear_fence(runtime):
    backend, provider, guardian = runtime
    row = evidence(release_ack=False, ledger_empty=False, unknown_release=True)
    provider.reconcile_owner.return_value = provider.retire_owner.return_value = row
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.state == "operator_release_required"
    assert result.cleanup["resources_retired"] and not result.cleanup["released"]
    guardian.start.assert_not_awaited()


async def test_lost_ack_queries_without_replaying_mutation(runtime):
    backend, provider, _ = runtime
    provider.reconcile_owner.side_effect = OSError()
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.state == "ready_for_replan"
    provider.reconcile_owner.assert_awaited_once()
    provider.owner_status.assert_awaited_once()
    again = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert again == result
    provider.reconcile_owner.assert_awaited_once()


@pytest.mark.parametrize("phase", ["focus", "spawn", "owner", "bind", "persist"])
async def test_cancel_every_preparation_boundary_stays_revoked(runtime, phase):
    backend, provider, guardian = runtime
    endpoint = {"focus": provider.focus_bound_candidate, "spawn": guardian.start,
                "owner": provider.capture_owner, "bind": guardian.bind_scope}.get(phase)
    if endpoint is not None:
        endpoint.side_effect = asyncio.CancelledError()
    else:
        def cancel(_):
            raise asyncio.CancelledError()
        backend.recovery_identity_callback = cancel
    with pytest.raises(asyncio.CancelledError):
        await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert backend._paused and not backend.input_supported
    with pytest.raises(ComputerError):
        backend.commit_native_recovery(consent_generation=2)


async def test_persistence_failure_never_binds_new_owner(runtime):
    backend, _, guardian = runtime
    def fail(_):
        raise OSError("disk full")
    backend.recovery_identity_callback = fail
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.state != "ready_for_replan"
    assert not result.cleanup["resources_retired"]
    guardian.bind_scope.assert_not_awaited()


async def test_abort_prevents_prepared_activation(runtime):
    backend, _, _ = runtime
    await backend.recover_native_authority(consent_generation=2, command_id="txn")
    backend.abort_native_recovery()
    with pytest.raises(ComputerError):
        backend.commit_native_recovery(consent_generation=2)


async def test_no_window_token_requires_fresh_target(runtime):
    backend, _, guardian = runtime
    backend._selected_binding.pop("window_id")
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.state == "fresh_target_required"
    guardian.start.assert_not_awaited()


@pytest.mark.parametrize("field", ["surface_token", "plugin_epoch"])
async def test_focus_race_after_new_owner_never_binds(runtime, field):
    backend, _, guardian = runtime
    changed = scope(surface_token="window-1", plugin_epoch="e" * 48)
    changed[field] = "wrong"
    backend._action_scope.side_effect = None
    backend._action_scope.return_value = changed, 1
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.state != "ready_for_replan"
    guardian.bind_scope.assert_not_awaited()
    assert not result.cleanup["resources_retired"]


async def test_cancelled_result_retry_never_mutates(runtime):
    backend, provider, _ = runtime
    provider.reconcile_owner.side_effect = asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError):
        await backend.recover_native_authority(consent_generation=2, command_id="txn")
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert result.reason == "hyprland_recovery_cancelled"
    provider.reconcile_owner.assert_awaited_once()


async def test_parallel_recovery_refused_before_second_native_call(runtime):
    backend, provider, _ = runtime
    entered, release = asyncio.Event(), asyncio.Event()
    async def blocked(*args, **kwargs):
        entered.set()
        await release.wait()
        return evidence()
    provider.reconcile_owner.side_effect = blocked
    task = asyncio.create_task(backend.recover_native_authority(
        consent_generation=2, command_id="txn"))
    await entered.wait()
    with pytest.raises(ComputerError, match="revoked"):
        await backend.recover_native_authority(consent_generation=2, command_id="other")
    release.set()
    await task
    provider.reconcile_owner.assert_awaited_once()


@pytest.mark.parametrize("generation,command", [(1, "txn"), (True, "txn"), (2, ""),
                                                (2, "bad command"), (2, "x" * 97)])
async def test_invalid_authority_never_reconciles(runtime, generation, command):
    backend, provider, _ = runtime
    with pytest.raises(ComputerError):
        await backend.recover_native_authority(consent_generation=generation, command_id=command)
    provider.reconcile_owner.assert_not_awaited()


def test_owner_publication_requires_durable_callback(runtime):
    backend, _, _ = runtime
    backend.recovery_identity_callback = None
    with pytest.raises(ComputerError, match="durable_owner"):
        backend._persist_owner()


def test_owner_publication_exact_private_descriptor(runtime):
    backend, _, _ = runtime
    rows = []
    backend.recovery_identity_callback = rows.append
    backend._persist_owner()
    assert rows[0]["owner"]["ledger_id"] == owner().ledger_id
    assert rows[0]["compositor"]["digest"] == identity().digest
    assert "compositor" not in rows[0]["owner"]


async def test_legacy_resume_refuses_captured_native_owner(runtime):
    backend, _, _ = runtime
    with pytest.raises(ComputerError, match="native_recovery_required"):
        await backend.resume(consent_generation=2)
    assert backend._paused and not backend.input_supported


def test_guardian_retains_original_identity_not_current_pid():
    from src.computer.runtime.hyprland_guardian import HyprlandGuardian
    guardian = HyprlandGuardian("/not/executed", 1000)
    assert guardian.owner_identity is None
    guardian._owner_identity = {"pid": 123, "uid": 1000, "start_ticks": 42}
    old = guardian.owner_identity
    old["pid"] = 456
    assert guardian.owner_identity["pid"] == 123


def test_pidfd_retirement_reference_closes_once(monkeypatch):
    from src.computer.runtime import hyprland_recovery as recovery
    opened, closed = [], []
    monkeypatch.setattr(recovery.os, "pidfd_open", lambda pid, flags: opened.append(pid) or 42)
    monkeypatch.setattr(recovery.os, "close", closed.append)
    monkeypatch.setattr(recovery.select, "poll", lambda: SimpleNamespace(
        register=lambda *args: None, poll=lambda timeout: [(42, recovery.select.POLLIN)]))
    incarnation = recovery.CompositorIncarnation(123)
    assert incarnation.exited()
    incarnation.close()
    incarnation.close()
    assert not incarnation.exited()
    assert opened == [123] and closed == [42]


async def test_reaped_false_never_retires_even_dead_compositor(runtime):
    backend, provider, guardian = runtime
    guardian.close.return_value = {"release_ack": True, "process_reaped": False}
    backend._incarnation.exited = lambda: True
    provider.reconcile_owner.side_effect = OSError()
    provider.owner_status.side_effect = OSError()
    result = await backend.recover_native_authority(consent_generation=2, command_id="txn")
    assert not result.cleanup["resources_retired"]
    assert not result.cleanup["released"]


@pytest.mark.parametrize("persist", [True, False])
async def test_actual_open_publishes_owner_before_scope_binding(runtime, monkeypatch, persist):
    backend, provider, guardian = runtime
    from src.computer.runtime import hyprland_guardian

    ordering = []
    backend._guardian = None
    backend._owner_handle = None
    backend._selected_binding = None
    guardian.select = AsyncMock(return_value={"width": 80, "height": 60})
    async def bind(_):
        ordering.append("bind")
    guardian.bind_scope.side_effect = bind
    def publish(_):
        ordering.append("persist")
        if not persist:
            raise OSError("disk full")
    backend.recovery_identity_callback = publish
    monkeypatch.setattr(hb, "trusted_binary", lambda _: None)
    monkeypatch.setattr(hb, "CompositorIncarnation", lambda pid: SimpleNamespace(
        close=lambda: None, exited=lambda: False))
    monkeypatch.setattr(hyprland_guardian, "HyprlandGuardian", lambda *args: guardian)
    monkeypatch.setattr(hb, "pin_connections", AsyncMock(return_value=(
        identity(), SimpleNamespace(close=lambda: None))))
    if persist:
        await backend._open()
        assert ordering == ["persist", "bind"]
    else:
        with pytest.raises(OSError):
            await backend._open()
        assert ordering == ["persist"]
    provider.attest_identity.assert_awaited_once_with(identity())
    provider.capture_owner.assert_awaited_once_with(guardian.owner_identity)
