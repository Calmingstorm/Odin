"""Fault-injected controller and real SQLite recovery integration."""
import asyncio
from types import SimpleNamespace

import pytest

from src.computer.controller import ComputerController
from src.computer.models import BackendCapabilities, ComputerError, LiveSession, RequestContext
from src.computer.runtime.hyprland_recovery import HyprlandRecoveryResult
from src.computer.store import ComputerStore
from src.computer.task_context import TaskContext
from tests.test_hyprland_store_campaign import identity


def binding():
    return {"output_name": "DP-1", "source_id": "source-old",
            "application_identity": identity(), "window_id": "window-1",
            "plugin_epoch": "plugin-1", "compositor_digest": "compositor-1"}


def owner_descriptor():
    return {"version": 1, "owner": {
        "instance_id": "instance", "plugin_epoch": "plugin", "ledger_id": "ledger",
        "guardian_pid": 42, "guardian_uid": 1000, "guardian_start_ticks": "1",
        "recovery_pid": 43, "recovery_uid": 1000, "recovery_start_ticks": "2"},
        "compositor": {"digest": "digest", "pid": 40, "uid": 1000,
                       "start_ticks": 1, "boot_id": "boot"}}


def evidence(*, released=True, retired=True):
    return {"released": released, "release_ack": released, "unknown_release": not released,
            "resources_retired": retired, "guardian_process_reaped": retired,
            "scope_connection_closed": retired, "retirement_basis": "native_owner_retired"}


@pytest.fixture
def rig(tmp_path):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    context = RequestContext("owner", "channel", "turn", "host")
    controller = ComputerController(store, None, lambda _: True, enabled=True)
    grant = store.create_session(context, platform="wayland", environment="existing_session",
                                 backend="hyprland")
    capabilities = BackendCapabilities(platform="wayland", environment="existing_session",
                                       backend="hyprland")
    backend = SimpleNamespace(capabilities=capabilities, hyprland_handoff_binding=binding())
    live = LiveSession(backend, controller.monotonic() + 100,
                       capabilities=capabilities, task_context=TaskContext(hints={"goal": "draw"}))
    controller._live[grant.session_id] = live
    controller._hyprland_contexts[grant.session_id] = context
    controller._record_hyprland_start_grant(grant, live)
    grant = store.set_state(grant.session_id, "active")
    store.record_hyprland_owner(grant, owner_descriptor())
    committed, aborted = [], []
    backend.commit_native_recovery = lambda **kwargs: committed.append(kwargs)
    backend.abort_native_recovery = lambda: aborted.append(True)
    yield controller, store, context, grant, live, committed, aborted
    store.close()


def install(rig, *, state="ready_for_replan", cleanup=None, changed=None):
    _, store, _, grant, live, _, _ = rig
    fresh = {**binding(), "source_id": "source-new", **(changed or {})}

    async def recover(*, consent_generation, command_id):
        pending = store.get_recovery_pending(grant.session_id)
        assert pending.old_grant["recovery_command_id"] == command_id
        assert live.revoked and not live.observations
        assert consent_generation > grant.consent_generation
        return HyprlandRecoveryResult(state, fresh, cleanup or evidence(), "test")

    live.backend.recover_native_authority = recover


@pytest.mark.asyncio
async def test_automatic_handoff_persists_command_and_successor_without_replay(rig):
    controller, store, _, grant, live, committed, aborted = rig
    install(rig)
    await controller._quarantine_hyprland(grant, live, phase="native_continuity_lost")
    current = store.get_session(grant.session_id)
    assert current.state == "active" and current.generation == 2
    assert committed == [{"consent_generation": 2}]
    assert aborted and not live.revoked
    outputs = store.hyprland_output_grants(grant.session_id)
    assert outputs[0].parent_grant_id == outputs[1].grant_id
    assert store.get_recovery_pending(grant.session_id) is None


def test_owner_descriptor_rejects_unknown_schema_and_hides_private_values(rig):
    controller, store, _, grant, live, _, _ = rig
    controller._prepare_runtime(grant, live.backend)
    live.backend.recovery_identity_callback(owner_descriptor())
    assert store.hyprland_owner(grant.session_id) == owner_descriptor()
    assert "native_owner" not in (store.recovery_status(grant.session_id) or {})
    with pytest.raises(ComputerError, match="invalid_runtime_identity"):
        store.record_hyprland_owner(grant, {"version": 1})
    controller._fence(grant.session_id)
    with pytest.raises(ComputerError, match="grant_revoked"):
        live.backend.recovery_identity_callback(owner_descriptor())


def test_owner_publication_failure_blocks_backend_callback(rig, monkeypatch):
    controller, store, _, grant, live, _, _ = rig
    controller._prepare_runtime(grant, live.backend)

    def fail(*args):
        raise OSError("disk full")

    monkeypatch.setattr(store, "record_hyprland_owner", fail)
    with pytest.raises(OSError, match="disk full"):
        live.backend.recovery_identity_callback(owner_descriptor())


@pytest.mark.asyncio
async def test_late_success_after_cancellation_suppression_is_fenced(rig):
    controller, store, _, grant, live, committed, _ = rig
    started = asyncio.Event()

    async def recover(**kwargs):
        started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            return HyprlandRecoveryResult("ready_for_replan", binding(), evidence(), "late")

    live.backend.recover_native_authority = recover
    work = asyncio.create_task(controller._quarantine_hyprland(
        grant, live, phase="native_continuity_lost"))
    await started.wait()
    controller._fence(grant.session_id)
    with pytest.raises((ComputerError, asyncio.CancelledError)):
        await work
    assert not committed and live.revoked
    assert store.get_session(grant.session_id).state == "quarantined"


@pytest.mark.asyncio
async def test_prepare_persistence_failure_never_calls_native_recovery(rig, monkeypatch):
    controller, store, _, grant, live, committed, aborted = rig
    native = []

    async def recover(**kwargs):
        native.append(True)

    async def detach():
        return {"stopped": False}

    def fail(*args, **kwargs):
        raise OSError("disk full")

    live.backend.recover_native_authority = recover
    live.backend.detach = detach
    monkeypatch.setattr(store, "begin_hyprland_handoff", fail)
    with pytest.raises(OSError, match="disk full"):
        await controller._quarantine_hyprland(grant, live, phase="native_continuity_lost")
    assert not native and not committed and aborted and live.revoked


def test_boot_sweep_preserves_task_and_invalidates_handoff(rig):
    _, store, _, grant, _, _, _ = rig
    old = store.hyprland_output_grants(grant.session_id)[0]
    store.begin_hyprland_handoff(
        grant, old_grant_id=old.grant_id, recovery_generation=2, stop_epoch=1,
        recovery_command_id="a" * 32, task_hints={"goal": "draw"})
    store.recover()
    assert store.get_session(grant.session_id).state == "quarantined"
    assert store.get_recovery_pending(grant.session_id).old_grant["task_hints"] == {"goal": "draw"}
    store._validate_current_schema()


@pytest.mark.asyncio
async def test_authorization_revocation_during_recovery_prevents_commit(rig):
    controller, store, _, grant, live, committed, _ = rig
    install(rig)
    controller.authorize = lambda _: False
    with pytest.raises(ComputerError, match="not_found"):
        await controller._quarantine_hyprland(grant, live, phase="native_continuity_lost")
    assert not committed and live.revoked
    assert store.get_session(grant.session_id).state == "quarantined"


def test_corrupted_durable_owner_is_rejected_on_schema_validation(rig):
    from src.computer.store import ComputerProvisioningError

    _, store, _, grant, _, _, _ = rig
    store.db.execute("UPDATE session_recovery SET result=? WHERE session_id=?",
                     ('{"native_owner":{"version":1}}', grant.session_id))
    with pytest.raises(ComputerProvisioningError, match="unsupported schema"):
        store._validate_current_schema()


@pytest.mark.asyncio
async def test_paused_resume_uses_durable_recovery_not_legacy_reopen(rig):
    controller, store, context, grant, live, committed, _ = rig
    install(rig)
    paused = store.set_state(grant.session_id, "paused", revoke=True)
    result = await controller.session(context, {"operation": "resume",
        "session_id": grant.session_id, "generation": paused.generation})
    assert result["state"] == "active"
    assert committed == [{"consent_generation": 3}]
    assert not live.revoked


@pytest.mark.asyncio
@pytest.mark.parametrize("changed", [{"window_id": "replacement"}, {"plugin_epoch": "new"},
                                   {"compositor_digest": "new"}, {"window_id": None}])
async def test_replacement_same_process_never_inherits_authority(rig, changed):
    controller, store, _, grant, live, committed, _ = rig
    install(rig, changed=changed)
    await controller._quarantine_hyprland(grant, live, phase="native_continuity_lost")
    assert store.get_session(grant.session_id).state == "quarantined"
    assert not committed and live.revoked
    assert len(store.hyprland_output_grants(grant.session_id)) == 1
    assert store.recovery_status(grant.session_id)["status"] == "operator_release_required"


@pytest.mark.asyncio
@pytest.mark.parametrize("released,retired", [(False, True), (False, False), (True, False)])
async def test_retirement_never_upgrades_unknown_release(rig, released, retired):
    controller, store, context, grant, live, committed, _ = rig
    install(rig, state="operator_release_required",
            cleanup=evidence(released=released, retired=retired))
    await controller._quarantine_hyprland(grant, live, phase="unknown_release")
    current = store.get_session(grant.session_id)
    assert current.state == "quarantined" and not committed
    assert store.recovery_status(grant.session_id)["status"] == "operator_release_required"
    assert (grant.session_id not in controller._live) is retired
    with pytest.raises(ComputerError, match="hyprland_reconciliation_required"):
        store.create_session(context, platform="wayland", environment="existing_session",
                             backend="hyprland", recovery_session_id=grant.session_id,
                             recovery_generation=current.generation)


@pytest.mark.asyncio
async def test_explicit_fresh_target_preserves_task_not_native_authority(rig):
    controller, store, context, grant, live, _, _ = rig
    install(rig, state="fresh_target_required")
    await controller._quarantine_hyprland(grant, live, phase="native_continuity_lost")
    current = store.get_session(grant.session_id)
    new = store.create_session(context, platform="wayland", environment="existing_session",
                               backend="hyprland", recovery_session_id=grant.session_id,
                               recovery_generation=current.generation)
    assert new.session_id != grant.session_id and new.generation == 1
    assert store.get_session(grant.session_id).state == "closed"
    assert store.hyprland_task_lineage(new.session_id)["task_hints"] == {"goal": "draw"}
    store._validate_current_schema()


@pytest.mark.asyncio
async def test_public_start_fresh_target_restores_only_descriptive_task(rig, monkeypatch):
    controller, store, context, grant, live, _, _ = rig
    install(rig, state="fresh_target_required")
    await controller._quarantine_hyprland(grant, live, phase="native_continuity_lost")
    current = store.get_session(grant.session_id)
    backend = SimpleNamespace(capabilities=live.capabilities, input_supported=False,
                              hyprland_handoff_binding=binding())

    async def start(sid, **kwargs):
        assert kwargs["selection"] == {"target_id": "native-fresh", "output_id": "output",
                                       "candidate_epoch": 2}
        backend.recovery_identity_callback(owner_descriptor())

    async def capture(*args, **kwargs):
        return None

    backend.start = start
    controller.backend_factory = lambda _: backend
    monkeypatch.setattr(controller, "_capture", capture)
    controller._selection_bindings["fresh"] = {
        "owner_id": context.owner_id, "host_id": context.host_id, "turn_id": context.turn_id,
        "channel_id": context.channel_id, "surface": context.surface,
        "expires_at": controller.monotonic() + 30, "native_epoch": 2,
        "targets": {"selected": {"native_target_id": "native-fresh", "output_id": "output"}}}
    result = await controller.session(context, {
        "operation": "start", "target_id": "selected", "candidate_epoch": "fresh",
        "recovery_session_id": grant.session_id, "recovery_generation": current.generation})
    assert result["state"] == "active" and result["session_id"] != grant.session_id
    new_live = controller._live[result["session_id"]]
    assert new_live.task_context.hints == {"goal": "draw"}
    assert new_live.task_context.target == {} and new_live.task_context.application == {}
    timer = controller._watchdogs.pop(result["session_id"])
    timer.cancel()
    with pytest.raises(asyncio.CancelledError):
        await timer
    store._validate_current_schema()


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["prepare", "record_cleanup", "advance", "commit"])
async def test_failures_do_not_grant_input(rig, monkeypatch, failure):
    controller, store, _, grant, live, committed, aborted = rig
    install(rig)

    def fail(*args, **kwargs):
        raise RuntimeError("injected")

    if failure == "prepare":
        async def bad(**kwargs):
            fail()
        live.backend.recover_native_authority = bad
    elif failure == "commit":
        live.backend.commit_native_recovery = fail
    else:
        monkeypatch.setattr(store, "record_cleanup" if failure == "record_cleanup"
                            else "advance_hyprland_output_grant", fail)
    with pytest.raises(RuntimeError, match="injected"):
        await controller._quarantine_hyprland(grant, live, phase="native_continuity_lost")
    assert live.revoked and aborted and not committed
    assert store.get_session(grant.session_id).state == "quarantined"
    assert len(store.hyprland_output_grants(grant.session_id)) == 1
    store._validate_current_schema()


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel", [False, True])
async def test_durable_pause_or_cancel_wins_late_recovery(rig, cancel):
    controller, store, _, grant, live, committed, _ = rig
    gate, started = asyncio.Event(), asyncio.Event()

    async def recover(**kwargs):
        started.set()
        await gate.wait()
        return HyprlandRecoveryResult("ready_for_replan", binding(), evidence(), "test")

    live.backend.recover_native_authority = recover
    work = asyncio.create_task(controller._quarantine_hyprland(
        grant, live, phase="native_continuity_lost"))
    await started.wait()
    if cancel:
        work.cancel()
    else:
        store.set_state(grant.session_id, "paused", revoke=True)
        gate.set()
    with pytest.raises((ComputerError, asyncio.CancelledError)):
        await work
    assert live.revoked and not committed
    assert store.get_session(grant.session_id).state == "quarantined"
    store._validate_current_schema()
