"""Real normal-turn lifecycle/dispatch with synthetic OS transports, no desktop IO."""

import json
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from src.computer.policy import DELIVERED_GROUNDING_SECONDS
from src.computer.runtime import hyprland_backend as hb
from src.computer.runtime.hyprland_identity import ExecutableTrust, HyprlandIdentity, ProcessPin
from src.computer.runtime.hyprland_scope import HyprlandOwnerHandle
from src.discord.native_tools.registry import NativeToolDispatcher
from src.discord.tool_loop import ToolLoopRunner
from tests.computer.test_hyprland_backend import Guardian, native, scope
from tests.test_computer_dispatch_r3 import dispatch_state
from tests.test_computer_hyprland_integration_r32 import settings
from tests.test_computer_lifecycle_r5 import owner
from tests.test_computer_native_vision_r5 import client, serving
from tests.test_computer_operator_auth_r5 import bound_operator


def call(name, **values):
    return SimpleNamespace(name=name, id=f"call-{name}-{values.get('action_id', '')}", input=values)


class NativeTransport(Guardian):
    """Synthetic child-process IPC boundary, retaining real backend lifecycle."""

    def __init__(self, binary, uid, on_spawn):
        super().__init__()
        self.on_spawn = on_spawn

    async def start(self, *args):
        self.on_spawn({"pid": 424242, "start_ticks": 777})
        self.owner_identity = {"pid": 424242, "uid": 1000, "start_ticks": 777}


@pytest.fixture
async def normal(tmp_path, monkeypatch):
    transports, recovery = [], []
    identity = HyprlandIdentity(
        ProcessPin(123, 1000, 99, "fixture-boot", 1, 2, 3, 4, 5, "f" * 64),
        ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.54.2", "b" * 40),
    )
    owners = []

    def guardian(*args):
        transport = NativeTransport(*args)
        transports.append(transport)
        return transport

    class ScopeTransport:
        def __init__(self, **kwargs):
            self.identity = None

        async def attest_identity(self, pinned):
            assert pinned == identity
            self.identity = pinned

        async def capture_owner(self, guardian_identity):
            assert self.identity == identity
            assert guardian_identity == transports[-1].owner_identity
            handle = HyprlandOwnerHandle(
                identity, "i1-" + "a" * 32, "b" * 48,
                f"{len(owners) + 1:048x}", guardian_identity["pid"],
                guardian_identity["uid"], str(guardian_identity["start_ticks"]),
                os.getpid(), os.geteuid(), "1",
            )
            owners.append(handle)
            return handle

        async def owner_status(self, handle, *, command_id):
            assert self.identity == identity
            assert handle in owners and command_id
            # This transport has no native ledger evidence after a fault.
            # A cooperative guardian close is not an owner reconciliation ACK.
            return {
                "instance_id": handle.instance_id, "plugin_epoch": handle.plugin_epoch,
                "ledger_id": handle.ledger_id, "owner_matched": True,
                "ledger_empty": False, "release_ack": False, "revoked": False,
                "unknown_release": True, "receiver_release_verified": False,
                "retired": False,
            }

        async def reconcile_owner(self, handle, *, command_id):
            return await self.owner_status(handle, command_id=command_id)

        async def retire_owner(self, handle, *, command_id):
            return await self.owner_status(handle, command_id=command_id)

        async def snapshot(self, metadata):
            return scope()

        async def close(self):
            pass

        async def release_all(self):
            recovery.append("release-all")
            return {"release_ack": True}

    async def capture(**kwargs):
        await kwargs["scope"]()
        kwargs["on_spawn"]({"pid": 424243, "start_ticks": 778})
        return native(shade=len(transports[-1].commands) * 40)

    monkeypatch.setattr(hb, "trusted_binary", lambda _: None)
    monkeypatch.setattr(hb, "pin_connections", AsyncMock(return_value=(
        identity, SimpleNamespace(close=lambda: None))))
    monkeypatch.setattr(hb, "CompositorIncarnation", lambda pid: SimpleNamespace(
        exited=lambda: False, close=lambda: None))
    monkeypatch.setattr(hb, "connect_peer", AsyncMock(
        return_value=SimpleNamespace(close=lambda: None)))
    monkeypatch.setattr(hb, "revalidate", AsyncMock())
    monkeypatch.setattr(hb, "capture_explicit_output", capture)
    monkeypatch.setattr("src.computer.runtime.hyprland_guardian.HyprlandGuardian", guardian)
    monkeypatch.setattr("src.computer.runtime.hyprland_scope.HyprlandScopeProvider", ScopeTransport)
    values = settings().model_dump(exclude={"enabled", "storage_dir"})
    bot, manager = owner(tmp_path, enabled=True, **values)
    await manager.start()
    state = dispatch_state()
    state._computer_serving = serving(client())
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._get_computer = lambda: manager
    runner._tool_executor = bot.tool_executor
    runner._delivery = SimpleNamespace(set_status=AsyncMock())
    runner._audit = SimpleNamespace(log_event=AsyncMock())
    runner._audit_tool_outcome = AsyncMock()
    runner._channel_state = SimpleNamespace(track_action=lambda *_, **__: None)
    runner._native_tools = NativeToolDispatcher(
        owners={"computer": manager}, skill_manager=bot.skill_manager,
        tool_catalog=bot.tool_catalog, prompt_builder=None, channel_state=None)
    try:
        yield SimpleNamespace(bot=bot, manager=manager, service=manager._service,
                              runner=runner, state=state, transports=transports,
                              recovery=recovery)
    finally:
        await manager.close()


async def start(normal):
    result = await normal.runner._run_one_tool(
        normal.state, call("computer_session", operation="start"))
    assert "hyprland_best_effort" in result["content"], result
    controller = normal.service.controller
    session = controller.store.find_session(normal.service._context(normal.state))
    backend = controller._live[session.session_id].backend
    assert type(backend) is hb.HyprlandRuntimeBackend
    assert backend._started and backend.input_supported
    assert backend.runtime_identity_callback is not None
    assert backend.recovery_identity_callback is not None
    assert type(backend._identity) is HyprlandIdentity
    assert type(backend._owner_handle) is HyprlandOwnerHandle
    durable_owner = controller.store.hyprland_owner(session.session_id)
    assert durable_owner["compositor"]["digest"] == backend._identity.digest
    assert durable_owner["owner"]["ledger_id"] == backend._owner_handle.ledger_id
    assert durable_owner["owner"]["guardian_start_ticks"] == "777"
    assert backend._descriptor["launch_pending"] is False
    assert {"pid": 424242, "start_ticks": 777} in backend._descriptor["processes"]
    assert controller.store.runtime_descriptor(session.session_id) == backend._descriptor
    return {"session_id": session.session_id, "generation": session.generation}


def action(normal, grant, action_id="first"):
    controller = normal.service.controller
    sid = grant["session_id"]
    oid = controller._delivered_observations[sid]
    observation = controller._live[sid].observations[oid]
    source = observation.frame_metadata
    return dict(**grant, action_id=action_id, observation_id=oid,
                consent_generation=source.consent_generation,
                source_id=source.source_id, source_revision=source.source_revision,
                operation="click", x=2, y=2, expect={"type": "visual_change"})


async def observe(normal, grant):
    result = await normal.runner._run_one_tool(normal.state, call("computer_observe", **grant))
    assert "Image loaded" in result["content"], result
    assert not normal.state._computer_frame_error
    assert normal.state.pending_image_blocks[-1]["type"] == "image"


async def test_normal_factory_start_observe_act_delivery_and_no_replay(normal):
    grant = await start(normal)
    await observe(normal, grant)
    first = action(normal, grant)
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **first))
    assert "Image loaded" in result["content"], result
    assert len(normal.transports[0].commands) == 1
    assert len(normal.state.pending_image_blocks) == 2
    second = action(normal, grant, "second")
    assert second["observation_id"] != first["observation_id"]
    replay = await normal.runner._run_one_tool(normal.state, call("computer_act", **first))
    assert "Image loaded" not in replay["content"]
    assert len(normal.transports[0].commands) == 1
    assert len(normal.state.pending_image_blocks) == 2
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **second))
    assert "Image loaded" in result["content"], result
    assert len(normal.transports[0].commands) == 2


async def test_synthetic_faulted_ledger_does_not_certify_native_cleanup(normal):
    from src.computer.runtime.hyprland_recovery import ledger_evidence

    grant = await start(normal)
    backend = normal.service.controller._live[grant["session_id"]].backend
    provider, handle = backend._scope_provider, backend._owner_handle
    # Even a successful local close is not native original-owner evidence.
    assert (await backend.pause())["released"] is True
    for method in (provider.reconcile_owner, provider.owner_status, provider.retire_owner):
        row = await method(handle, command_id="faulted-ledger")
        evidence = ledger_evidence(row, handle)
        assert evidence["owner_matched"] is True
        assert evidence["release_ack"] is False
        assert evidence["unknown_release"] is True
        assert evidence["native_owner_retired"] is False
        assert evidence["receiver_release_verified"] is False


async def test_unseen_observation_and_stale_delivered_frame_refused(normal, monkeypatch):
    grant = await start(normal)
    controller = normal.service.controller
    context = normal.service._context(normal.state)
    frame = await controller.observe(context, grant)
    unseen = dict(**grant, action_id="unseen", observation_id=frame["observation_id"],
                  consent_generation=frame["source"]["consent_generation"],
                  source_id=frame["source"]["source_id"],
                  source_revision=frame["source"]["source_revision"],
                  operation="click", x=2, y=2, expect={"type": "visual_change"})
    with pytest.raises(ComputerError, match="observation_not_delivered"):
        await controller.act(context, unseen)
    await observe(normal, grant)
    stale = action(normal, grant)
    obs = controller._live[grant["session_id"]].observations[stale["observation_id"]]
    monkeypatch.setattr(controller, "monotonic",
                        lambda: obs.captured_at + DELIVERED_GROUNDING_SECONDS + 1)
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **stale))
    assert "stale_observation" in result["content"], result
    assert not normal.transports[0].commands


async def test_post_action_frame_not_authority_until_exact_foreground_delivery(normal):
    grant = await start(normal)
    await observe(normal, grant)
    first = action(normal, grant)
    block = call("computer_act", **first)
    controller = normal.service.controller
    context = normal.service._context(normal.state)
    with normal.manager.foreground(normal.state, block):
        image, _ = await normal.runner._native_tools.dispatch(
            block.name, block.input, message=normal.state.message,
            user_id=normal.state.user_id, skill_file_delivery="stage")
        assert image["__computer_action_receipt__"]["execution"]["released"] is True
        frame = image["__computer_frame__"]
        second = dict(first, action_id="second", observation_id=frame["observation_id"],
                      source_id=frame["source_id"], source_revision=frame["source_revision"])
        with pytest.raises(ComputerError, match="observation_not_delivered"):
            await controller.act(context, second)
        assert len(normal.transports[0].commands) == 1
        await normal.manager.validate_delivery(normal.state, block, image)
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **second))
    assert "Image loaded" in result["content"], result
    assert len(normal.transports[0].commands) == 2


async def test_operator_release_all_then_close_and_fresh_consent(normal):
    grant = await start(normal)
    await observe(normal, grant)
    old = action(normal, grant)
    with bound_operator(normal.bot, "alice", "browser"):
        result = await normal.manager.operator_release_owned_input(
            **grant, owner_id="alice", web_session_id="browser")
    assert result["state"] == "paused"
    assert result["owned_input_recovery"]["released"] is True
    assert result["owned_input_recovery"]["receiver_release_verified"] is False
    assert normal.recovery == ["release-all"]
    refused = await normal.runner._run_one_tool(normal.state, call("computer_act", **old))
    assert "Image loaded" not in refused["content"]
    assert not normal.transports[0].commands
    closed = await normal.runner._run_one_tool(normal.state, call(
        "computer_session", operation="close", session_id=grant["session_id"]))
    assert json.loads(closed["content"])["state"] == "closed", closed
    fresh = await start(normal)
    assert fresh["session_id"] != grant["session_id"]
    await observe(normal, fresh)
    result = await normal.runner._run_one_tool(normal.state, call(
        "computer_act", **action(normal, fresh, "renewed")))
    assert "Image loaded" in result["content"], result
    assert len(normal.transports[-1].commands) == 1


@pytest.mark.parametrize("ack", [True, False])
async def test_startup_failure_retains_native_cleanup_and_recovery_route(normal, monkeypatch, ack):
    async def failed_start(transport, *args):
        transport.on_spawn({"pid": 424242, "start_ticks": 777})
        transport.release_ack = ack
        raise ComputerError("synthetic_guardian_start_failure")

    monkeypatch.setattr(NativeTransport, "start", failed_start)
    result = await normal.runner._run_one_tool(
        normal.state, call("computer_session", operation="start"))
    assert "synthetic_guardian_start_failure" in result["content"], result
    controller = normal.service.controller
    grant = controller.store.find_session(normal.service._context(normal.state))
    if ack:
        assert grant.state != "quarantined"
    else:
        assert grant.state == "quarantined"
        with bound_operator(normal.bot, "alice", "browser"):
            recovered = await normal.manager.operator_release_owned_input(
                session_id=grant.session_id, generation=grant.generation,
                owner_id="alice", web_session_id="browser")
        assert normal.recovery == ["release-all"]
        assert recovered["owned_input_recovery"]["released"] is True


@pytest.mark.parametrize("platform,environment,expected", [
    ("x11", "isolated", "LinuxDesktopBackend"),
    ("x11", "existing_session", "X11AttachedBackend"),
    ("wayland", "existing_session", "WaylandRuntimeBackend"),
])
async def test_additive_default_factory_routes_without_desktop_start(
    tmp_path, platform, environment, expected,
):
    bot, manager = owner(tmp_path, enabled=True, platform=platform, environment=environment,
                         wayland_bus_address="unix:path=/run/user/1000/bus", wayland_uid=1000,
                         display=":99", xauthority="/tmp/synthetic-Xauthority",
                         monitor_names=["DP-1"])
    await manager.start()
    try:
        backend = manager._service._backend("xed" if environment == "isolated" else None)
        assert type(backend).__name__ == expected
        assert not isinstance(backend, hb.HyprlandRuntimeBackend)
    finally:
        await manager.close()


@pytest.mark.parametrize("executable,version,name", [
    ("/usr/bin/gnome-shell", "48.0", "gnome-shell"),
    ("/usr/bin/kwin_wayland", "6.3.0", "kwin_wayland"),
])
def test_portal_compositor_identity_routes_retained(executable, version, name):
    from src.computer.runtime.wayland_identity import compositor_adapter

    assert compositor_adapter(executable, version).name == name


@pytest.mark.parametrize("executable", ["/usr/bin/Hyprland", "/usr/bin/sway", "/usr/bin/unknown"])
def test_native_route_does_not_relax_other_portal_refusals(executable):
    from src.computer.runtime.wayland_identity import WaylandIdentityError, compositor_adapter

    with pytest.raises(WaylandIdentityError):
        compositor_adapter(executable, "99.0")


async def test_native_receipt_durably_discloses_best_effort_and_recovery(normal):
    grant = await start(normal)
    await observe(normal, grant)
    first = action(normal, grant)
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **first))
    assert "Image loaded" in result["content"], result
    replay = await normal.runner._run_one_tool(normal.state, call("computer_act", **first))
    receipt = json.loads(replay["content"])
    safety = receipt["input_safety"]
    assert safety["backend"] == "hyprland"
    assert safety["guarantee"] == "best_effort"
    assert safety["release_basis"] == "cooperative_native_ack"
    assert safety["receiver_release_verified"] is False
    assert safety["recovery"] == "operator_release_all_then_close_and_start_new_session"
    assert safety["limitations"]
    assert len(normal.transports[0].commands) == 1


async def test_known_release_but_controller_postcapture_failure_is_not_verified(
    normal, monkeypatch,
):
    grant = await start(normal)
    await observe(normal, grant)
    first = action(normal, grant)
    capture = hb.capture_explicit_output
    after_input = 0

    async def failed_postcapture(**kwargs):
        nonlocal after_input
        if normal.transports[0].commands:
            after_input += 1
            if after_input >= 2:
                raise ComputerError("synthetic_capture_lost_after_release")
        return await capture(**kwargs)

    monkeypatch.setattr(hb, "capture_explicit_output", failed_postcapture)
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **first))
    receipt = json.loads(result["content"])
    assert receipt["execution"]["released"] is True
    assert receipt["status"] == "executed"
    assert receipt["verification"]["status"] == "unavailable"
    replay = await normal.runner._run_one_tool(normal.state, call("computer_act", **first))
    assert json.loads(replay["content"]) == receipt
    assert len(normal.transports[0].commands) == 1
