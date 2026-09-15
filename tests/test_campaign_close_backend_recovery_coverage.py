"""Recovery fencing with fake native peers only; no desktop or release-all input."""

import asyncio
import copy
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, call

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from src.computer.runtime.hyprland_identity import HyprlandIdentity, ProcessPin
from src.computer.runtime.hyprland_scope import HyprlandOwnerHandle, owner_handle_to_record
from tests.computer.test_hyprland_backend import config


@pytest.fixture
def recovery(monkeypatch):
    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    identity = HyprlandIdentity(
        ProcessPin(4242, 1000, 42, "12345678-1234-1234-1234-123456789abc",
                   1, 2, 3, 4, 5, "a" * 64), config().compositor_trust,
    )
    owner = HyprlandOwnerHandle(identity, "i1-" + "1" * 32, "2" * 48, "3" * 48,
                                123, 1000, "44", 321, 1000, "45", "4" * 48)
    adopted = replace(owner, recovery_pid=322, recovery_start_ticks="46")
    row = dict(owner_matched=True, instance_id=owner.instance_id,
               plugin_epoch=owner.plugin_epoch, ledger_id=owner.ledger_id,
               ledger_empty=True, release_ack=True, revoked=True,
               unknown_release=False, retired=True, receiver_release_verified=False,
               native_resources_retired=True, retirement_evidence_version=1,
               retirement_evidence_kind="exact-client-resources-destroyed")
    row.update({key: getattr(adopted, key) for key in (
        "guardian_pid", "guardian_uid", "guardian_start_ticks",
        "recovery_pid", "recovery_uid", "recovery_start_ticks")})
    provider = SimpleNamespace(
        reconnect_owner=AsyncMock(return_value=adopted),
        reconcile_owner=AsyncMock(return_value=copy.deepcopy(row)),
        retire_owner=AsyncMock(return_value=copy.deepcopy(row)),
        owner_status=AsyncMock(return_value=copy.deepcopy(row)),
        attest_identity=AsyncMock(), close=AsyncMock(),
        focus_bound_candidate=AsyncMock(), capture_owner=AsyncMock(),
    )
    factory = AsyncMock(return_value=provider)
    monkeypatch.setattr(hb.HyprlandScopeProvider, "from_identity", factory)
    monkeypatch.setattr(hb, "revalidate", AsyncMock())
    monkeypatch.setattr(backend, "_new_provider", lambda: provider)
    # Any accidental guardian creation is an error, not a real process launch.
    monkeypatch.setattr(hb, "HyprlandGuardian", Mock(side_effect=AssertionError("no input owner")))
    return SimpleNamespace(backend=backend, owner=owner, adopted=adopted,
                           provider=provider, factory=factory, row=row)


async def reconcile(fixture, *, query_only=False, phases=None, persist=None, checkpoint=None):
    return await fixture.backend.reconcile_durable_owner(
        owner_handle_to_record(fixture.owner), command_id="recover-1", query_only=query_only,
        persist=persist or Mock(), checkpoint=checkpoint or AsyncMock(),
        prepare_phase=phases or Mock(return_value=False),
    )


@pytest.mark.parametrize("query_only", [False, True])
async def test_durable_reconcile_persists_before_release_without_rearming(recovery, query_only):
    backend, provider = recovery.backend, recovery.provider
    events = []

    def persist(record):
        assert record == owner_handle_to_record(recovery.adopted)
        events.append("persist")

    def phase(name):
        events.append(name)
        return query_only

    result = await reconcile(recovery, query_only=query_only, persist=persist, phases=phase)
    assert events == ["persist", "reconcile", "retire"]
    provider.reconnect_owner.assert_awaited_once_with(
        recovery.owner, command_id="recover-1", query_only=query_only)
    if query_only:
        provider.reconcile_owner.assert_not_awaited()
        provider.retire_owner.assert_not_awaited()
        assert provider.owner_status.await_args_list == [
            call(recovery.adopted, command_id="recover-1-release"),
            call(recovery.adopted, command_id="recover-1-retire"),
        ]
    else:
        provider.reconcile_owner.assert_awaited_once_with(
            recovery.adopted, command_id="recover-1-release")
        provider.retire_owner.assert_awaited_once_with(
            recovery.adopted, command_id="recover-1-retire")
        provider.owner_status.assert_not_awaited()
    assert result.state == "fresh_target_required"
    assert result.binding is None and result.cleanup["released"]
    assert result.cleanup["resources_retired"]
    assert result.cleanup["receiver_release_verified"] is False
    assert result.runtime_qualified is False
    assert backend._closed and backend._paused and not backend.input_supported
    assert backend._scope_provider is None and backend._prepared_recovery is None
    provider.close.assert_awaited_once()
    provider.focus_bound_candidate.assert_not_awaited()
    provider.capture_owner.assert_not_awaited()


async def test_durable_lost_acks_only_query_each_original_command(recovery):
    provider = recovery.provider
    provider.reconnect_owner.side_effect = [ConnectionResetError(), recovery.adopted]
    provider.reconcile_owner.side_effect = TimeoutError()
    provider.retire_owner.side_effect = TimeoutError()
    result = await reconcile(recovery)
    assert result.state == "fresh_target_required"
    assert provider.reconnect_owner.await_args_list == [
        call(recovery.owner, command_id="recover-1", query_only=False),
        call(recovery.owner, command_id="recover-1", query_only=True),
    ]
    provider.reconcile_owner.assert_awaited_once()
    provider.retire_owner.assert_awaited_once()
    assert provider.owner_status.await_args_list == [
        call(recovery.adopted, command_id="recover-1-release"),
        call(recovery.adopted, command_id="recover-1-retire"),
    ]


async def test_durable_query_failure_does_not_retry_or_mutate(recovery):
    recovery.provider.reconnect_owner.side_effect = ConnectionResetError()
    with pytest.raises(ConnectionResetError):
        await reconcile(recovery, query_only=True)
    recovery.provider.reconnect_owner.assert_awaited_once()
    recovery.provider.reconcile_owner.assert_not_awaited()
    recovery.provider.retire_owner.assert_not_awaited()
    recovery.provider.close.assert_awaited_once()
    assert recovery.backend._closed and not recovery.backend.input_supported


@pytest.mark.parametrize("failure", [OSError, asyncio.CancelledError])
async def test_durable_persistence_failure_closes_peer_without_release_mutation(recovery, failure):
    with pytest.raises(failure):
        await reconcile(recovery, persist=Mock(side_effect=failure()))
    recovery.provider.reconcile_owner.assert_not_awaited()
    recovery.provider.retire_owner.assert_not_awaited()
    recovery.provider.close.assert_awaited_once()
    assert recovery.backend._closed and recovery.backend._scope_provider is None


@pytest.mark.parametrize("field,value", [
    ("release_ack", False), ("native_resources_retired", False),
])
async def test_durable_incomplete_evidence_demands_operator(recovery, field, value):
    recovery.provider.reconcile_owner.return_value[field] = value
    recovery.provider.retire_owner.return_value[field] = value
    result = await reconcile(recovery)
    assert result.state == "operator_release_required"
    assert result.binding is None
    assert not (result.cleanup["released"] and result.cleanup["resources_retired"])
    assert not recovery.backend.input_supported


@pytest.mark.parametrize("mismatch", ["uid", "trust", "started", "closed"])
async def test_durable_rejects_changed_authority_before_connect(recovery, mismatch):
    backend = recovery.backend
    if mismatch == "uid":
        backend.config = replace(backend.config, expected_uid=1001)
    elif mismatch == "trust":
        backend.config = replace(backend.config, compositor_trust=replace(
            backend.config.compositor_trust, sha256="f" * 64))
    else:
        setattr(backend, "_" + mismatch, True)
    reason = ("hyprland_recovery_trust_changed" if mismatch in {"uid", "trust"}
              else "hyprland_recovery_revoked")
    with pytest.raises(ComputerError, match=reason):
        await reconcile(recovery)
    recovery.factory.assert_not_awaited()
    assert backend._paused and not backend.input_supported


async def test_durable_checkpoint_revocation_cannot_publish_late_adoption(recovery):
    async def adopt(*args, **kwargs):
        recovery.backend.abort_native_recovery()
        return recovery.adopted

    recovery.provider.reconnect_owner.side_effect = adopt
    persist = Mock()
    with pytest.raises(ComputerError, match="hyprland_recovery_revoked"):
        await reconcile(recovery, persist=persist)
    persist.assert_not_called()
    recovery.provider.reconcile_owner.assert_not_awaited()
    recovery.provider.close.assert_awaited_once()
    assert recovery.backend._closed


@pytest.mark.parametrize("durable", [False, True])
def test_owner_publication_uses_only_complete_expected_descriptor(recovery, durable):
    backend = recovery.backend
    backend._identity = recovery.owner.compositor
    backend._owner_handle = (recovery.owner if durable else
                             replace(recovery.owner, recovery_capability=""))
    backend.recovery_identity_callback = Mock()
    backend._persist_owner()
    record = backend.recovery_identity_callback.call_args.args[0]
    if durable:
        assert record == owner_handle_to_record(recovery.owner)
    else:
        assert record["version"] == 1
        assert "compositor" not in record["owner"]
        assert "recovery_capability" not in record["owner"]
        assert record["compositor"]["digest"] == recovery.owner.compositor.digest


@pytest.mark.parametrize("missing", ["owner", "identity", "callback"])
def test_owner_publication_refuses_incomplete_runtime(recovery, missing):
    backend = recovery.backend
    backend._identity = recovery.owner.compositor
    backend._owner_handle = recovery.owner
    callback = Mock()
    backend.recovery_identity_callback = callback
    setattr(backend, {"owner": "_owner_handle", "identity": "_identity",
                      "callback": "recovery_identity_callback"}[missing], None)
    with pytest.raises(ComputerError, match="hyprland_durable_owner_required"):
        backend._persist_owner()
    callback.assert_not_called()


@pytest.mark.parametrize("dead", [False, True])
async def test_prepare_without_window_proof_never_starts_guardian(recovery, monkeypatch, dead):
    backend, provider = recovery.backend, recovery.provider
    backend._identity, backend._owner_handle = recovery.owner.compositor, recovery.owner
    provider.reconcile_owner.return_value.update(
        recovery_pid=recovery.owner.recovery_pid,
        recovery_start_ticks=recovery.owner.recovery_start_ticks)
    backend._incarnation = SimpleNamespace(exited=lambda: dead, close=Mock())
    incarnation = backend._incarnation
    backend._selected_binding = None
    backend._cross_incarnation = SimpleNamespace(reconcile=AsyncMock(
        return_value=SimpleNamespace(reason="cross_compositor_retirement_unavailable")))
    inventory = AsyncMock(return_value={"targets": []})
    monkeypatch.setattr(backend, "discover_replacement_targets", inventory)
    result = await backend.recover_native_authority(consent_generation=2, command_id="prepare")
    assert result.state == "fresh_target_required"
    assert result.cleanup["released"] and result.cleanup["resources_retired"]
    assert result.cleanup["original_compositor_exited"] is dead
    assert backend._paused and not backend.input_supported
    assert backend._incarnation is None
    incarnation.close.assert_called_once()
    provider.close.assert_awaited_once()
    provider.focus_bound_candidate.assert_not_awaited()
    if dead:
        inventory.assert_awaited_once()
        assert (result.cleanup["cross_incarnation_reason"]
                == "cross_compositor_retirement_unavailable")
    else:
        inventory.assert_not_awaited()
    again = await backend.recover_native_authority(consent_generation=2, command_id="prepare")
    assert again == result and again is not result
    again.cleanup["released"] = False
    assert backend._recovery_result.cleanup["released"] is True
    provider.reconcile_owner.assert_awaited_once()


@pytest.mark.parametrize("outcome", ["ok", "failure"])
async def test_replacement_inventory_drops_selection_authority(recovery, monkeypatch, outcome):
    backend = recovery.backend
    backend._discovery_config = replace(backend.config, discovery_mode="auto", compositor_pid=None)
    candidate = SimpleNamespace(
        inventory_targets=AsyncMock(return_value={"targets": []}),
        _selection_proofs={"private": object()}, _closed=False,
    )
    if outcome == "failure":
        candidate.inventory_targets.side_effect = TimeoutError()
    factory = Mock(return_value=candidate)
    monkeypatch.setattr(hb, "HyprlandRuntimeBackend", factory)
    result = await backend.discover_replacement_targets()
    assert result == ({"targets": []} if outcome == "ok" else None)
    assert candidate._closed and candidate._selection_proofs == {}
    assert not backend._closed
    factory.assert_called_once_with(config=backend._discovery_config, enabled=True)


async def test_pinned_recovery_does_not_discover_another_target(recovery):
    assert await recovery.backend.discover_replacement_targets() is None
    recovery.factory.assert_not_awaited()


async def test_cleanup_cancels_owned_jobs_and_does_not_equate_reaping_with_release(recovery):
    backend = recovery.backend
    entered = [asyncio.Event() for _ in range(3)]
    cancelled = []

    async def pending(index):
        entered[index].set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.append(index)

    jobs = [asyncio.create_task(pending(index)) for index in range(3)]
    await asyncio.gather(*(event.wait() for event in entered))
    backend._capture_jobs.add(jobs[0])
    backend._scope_jobs.add(jobs[1])
    backend._jobs.add(jobs[2])
    backend._guardian = SimpleNamespace(close=AsyncMock(return_value={
        "release_ack": False, "unknown_release": True, "process_reaped": True}))
    backend._scope_provider = recovery.provider
    try:
        assert await backend._cleanup() is False
        await asyncio.gather(*jobs, return_exceptions=True)
        assert sorted(cancelled) == [0, 1, 2]
        assert all(job.cancelled() for job in jobs)
        assert backend._cleanup_evidence["guardian_process_reaped"] is True
        assert backend._cleanup_evidence["release_confirmed"] is False
        assert backend._cleanup_evidence["hyprland_owned_connections_closed"] is False
        assert backend._release_failed
        recovery.provider.close.assert_awaited_once()
    finally:
        for job in jobs:
            job.cancel()
        await asyncio.gather(*jobs, return_exceptions=True)
