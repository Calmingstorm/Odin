"""Observe/session refusals before any input carry not_dispatched evidence.

Everything runs through ComputerIntegration._tool with the real controller and
store. The X11 adapter is the real X11AttachedBackend with fake worker I/O
(subprocess spawning is forbidden by the fixture); the Hyprland inventory uses
the real HyprlandRuntimeBackend with its discovery/transport phases mocked.
No display, input device or compositor is touched.
"""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.controller import ComputerController
from src.computer.integration import ComputerIntegration
from src.computer.models import ComputerError, RequestContext
from src.computer.runtime import hyprland_discovery as hd
from src.computer.store import ComputerStore
from tests.test_computer_attached_controller_r5 import Attached
from tests.test_computer_keyboard_grounding_r6 import fixture
from tests.test_computer_native_vision_r5 import client, serving
from tests.test_hyprland_inventory_diagnostics import rig  # noqa: F401 - fixture


def facade(controller, context, monkeypatch):
    bot = SimpleNamespace(
        config=SimpleNamespace(computer=SimpleNamespace(enabled=True)),
        host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: True),
        tool_executor=SimpleNamespace(check_permission=lambda *_: None),
    )
    service = ComputerIntegration(bot, controller=controller)
    monkeypatch.setattr(service, "_context", lambda _: context)
    turn = SimpleNamespace(
        user_id=context.owner_id,
        message=SimpleNamespace(channel=SimpleNamespace(id=context.channel_id)),
        _computer_serving=serving(client()),
    )
    return service, turn


async def call(service, turn, name, values):
    block = SimpleNamespace(id=f"{name}-call", name=name, input=values)
    with service.foreground(turn, block):
        return await service._tool(name, values)


def not_dispatched(delivered, reason):
    payload = json.loads(delivered.output)
    assert delivered.ok is False
    assert delivered.error == "computer_rejected"
    assert delivered.uncertain_outcome is False
    assert payload["reason"] == reason
    assert payload["input_outcome"] == "not_dispatched"
    assert payload["terminal"] is False and payload["recoverable"] is True
    assert payload["replay_permitted"] is False
    assert "RELEASE-ALL" not in payload["instruction"]
    assert delivered.audit_metadata["computer_reason_code"] == reason
    assert delivered.audit_metadata["computer_input_outcome"] == "not_dispatched"
    return payload


async def test_x11_ungranted_source_is_typed_refusal_and_session_survives(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, _, calls):
        service, turn = facade(controller, context, monkeypatch)
        sid = action["session_id"]
        # The monitor label, not the opaque source_id from start/observe.
        delivered = await call(
            service,
            turn,
            "computer_observe",
            {"session_id": sid, "generation": 1, "source_id": "fixture"},
        )
        not_dispatched(delivered, "capture_source_not_granted")
        assert controller.store.get_session(sid).state == "active"
        assert sid in controller._live
        image = await call(service, turn, "computer_observe", {"session_id": sid, "generation": 1})
        assert isinstance(image, dict) and "__image_block__" in image
        assert calls == []


async def test_x11_export_refusal_is_typed_refusal_and_session_survives(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, _, calls):
        service, turn = facade(controller, context, monkeypatch)
        sid = action["session_id"]
        delivered = await call(
            service,
            turn,
            "computer_session",
            {
                "operation": "export",
                "session_id": sid,
                "generation": 1,
                "name": "drawing.png",
            },
        )
        not_dispatched(delivered, "existing_session_export_not_granted")
        assert controller.store.get_session(sid).state == "active"
        assert sid in controller._live
        assert calls == []


@pytest.mark.parametrize(
    "reason",
    [
        "hyprland_discovery_deadline",
        "hyprland_discovery_runtime_untrusted",
        "hyprland_discovery_policy_invalid",
        "hyprland_discovery_runtime_unavailable",
        "hyprland_discovery_candidate_limit",
        "hyprland_discovery_hint_invalid",
        "hyprland_discovery_not_found",
        "hyprland_discovery_ambiguous",
        "hyprland_discovery_unavailable",
    ],
)
async def test_hyprland_discovery_refusal_is_typed_and_spares_the_live_session(
    tmp_path,
    monkeypatch,
    rig,  # noqa: F811 - pytest fixture
    reason,
):
    rig.phases["resolve"].side_effect = hd.HyprlandDiscoveryError(reason)
    backends = iter([Attached(), rig.backend])
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(
        store, lambda _app: next(backends), lambda _: True, enabled=True
    )
    context = RequestContext("owner", "channel", "turn", "localhost")
    try:
        # An unrelated session of the same owner/channel is already running.
        live = await controller.session(context, {"operation": "start"})
        service, turn = facade(controller, context, monkeypatch)
        delivered = await call(
            service, turn, "computer_session", {"operation": "inventory_targets"}
        )
        payload = not_dispatched(delivered, reason)
        assert payload["next_action"] == "retry_with_supported_operation"
        assert store.get_session(live["session_id"]).state == "active"
        assert live["session_id"] in controller._live
        rig.phases["pin_connections"].assert_not_awaited()
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize(
    "name,values,reason",
    [
        ("computer_observe", {"session_id": "missing", "generation": 1}, "not_found"),
        ("computer_observe", {"generation": 99}, "stale_generation"),
        ("computer_observe", {"generation": 1, "source_id": 7}, "invalid_source_selection"),
        ("computer_session", {"operation": "status", "session_id": "missing"}, "not_found"),
    ],
)
async def test_observe_and_session_preflight_refusals_are_not_terminal(
    tmp_path, monkeypatch, name, values, reason
):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, _, calls):
        service, turn = facade(controller, context, monkeypatch)
        sid = action["session_id"]
        values = {"session_id": sid, **values}
        delivered = await call(service, turn, name, values)
        not_dispatched(delivered, reason)
        assert controller.store.get_session(sid).state == "active"
        assert calls == []


async def test_act_refusal_before_grant_is_not_terminal(tmp_path, monkeypatch):
    # v4.6.0 already attaches evidence here; its "unstarted" state was terminal.
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, _, calls):
        service, turn = facade(controller, context, monkeypatch)
        request = {**action, "operation": "click", "x": 2, "y": 2, "unexpected": 1}
        delivered = await call(service, turn, "computer_act", request)
        payload = not_dispatched(delivered, "invalid_arguments")
        assert payload["state"] == "unstarted"
        assert controller.store.get_session(action["session_id"]).state == "active"
        assert calls == []


@pytest.mark.parametrize("recovery", [False, True])
async def test_observe_refusal_after_focus_recovery_keeps_terminal_guidance(
    tmp_path, monkeypatch, recovery
):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, _, calls):
        sid = action["session_id"]
        backend = controller._live[sid].backend

        async def unfocused(**_):
            raise ComputerError("input_focus_unavailable")

        monkeypatch.setattr(backend, "observe", unfocused)
        recover = AsyncMock(return_value=True)
        if recovery:
            # Stand-in for the Hyprland-only native focus recovery seam.
            monkeypatch.setattr(controller, "_recovery_enabled", lambda _live: True)
            monkeypatch.setattr(controller, "_recover_focus", recover)
        service, turn = facade(controller, context, monkeypatch)
        delivered = await call(
            service, turn, "computer_observe", {"session_id": sid, "generation": 1}
        )
        payload = json.loads(delivered.output)
        assert payload["reason"] == "input_focus_unavailable"
        if recovery:
            # A recovery attempt may have dispatched focus input: no claim.
            recover.assert_awaited_once()
            assert payload["input_outcome"] == "release_unknown"
            assert payload["terminal"] is True
        else:
            not_dispatched(delivered, "input_focus_unavailable")


@pytest.mark.parametrize("operation", ["stop", "pause"])
async def test_lifecycle_failure_keeps_unknown_release_guidance(tmp_path, monkeypatch, operation):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, _, calls):
        seam = "_stop" if operation == "stop" else "_pause"
        attempted = AsyncMock(side_effect=ComputerError("cleanup_unavailable"))
        service, turn = facade(controller, context, monkeypatch)
        with monkeypatch.context() as patch:
            patch.setattr(controller, seam, attempted)
            delivered = await call(
                service,
                turn,
                "computer_session",
                {"operation": operation, "session_id": action["session_id"]},
            )
        attempted.assert_awaited_once()
        payload = json.loads(delivered.output)
        assert payload["reason"] == "cleanup_unavailable"
        assert payload["input_outcome"] == "release_unknown"
        assert payload["terminal"] is True
        assert delivered.ok is False


async def test_observe_quarantine_failure_never_claims_not_dispatched(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, _, calls):
        sid = action["session_id"]

        async def lost_continuity(**_):
            raise ComputerError("stale_source_binding")

        quarantine = AsyncMock(side_effect=ComputerError("hyprland_quarantine_unavailable"))
        service, turn = facade(controller, context, monkeypatch)
        with monkeypatch.context() as patch:
            patch.setattr(controller._live[sid].backend, "observe", lost_continuity)
            patch.setattr(controller, "_hyprland_continuity_failure", lambda *_: True)
            patch.setattr(controller, "_quarantine_hyprland", quarantine)
            delivered = await call(
                service, turn, "computer_observe", {"session_id": sid, "generation": 1}
            )
        quarantine.assert_awaited_once()
        payload = json.loads(delivered.output)
        assert payload["reason"] == "hyprland_quarantine_unavailable"
        assert payload["input_outcome"] == "release_unknown"
        assert payload["terminal"] is True


async def test_successful_calls_are_not_audited_as_rejections(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, _, calls):
        service, turn = facade(controller, context, monkeypatch)
        sid = action["session_id"]
        status = await call(
            service,
            turn,
            "computer_session",
            {"operation": "status", "session_id": sid, "generation": 1},
        )
        assert status.ok is True
        assert status.audit_metadata["computer_reason_code"] == "computer_succeeded"
        action.update(operation="key", key="Right")
        image = await call(service, turn, "computer_act", action)
        receipt = image["__computer_action_receipt__"]
        assert receipt["status"] == "verified" and "reason" not in receipt
        metadata = image["__computer_audit_metadata__"]
        assert metadata["computer_reason_code"] == "verified"
        assert metadata["computer_input_outcome"] == "released_verified"
        assert len(calls) == 1


def test_failure_audit_codes_are_unchanged():
    from src.computer.error_guidance import audit_outcome_code

    assert audit_outcome_code({"status": "not_satisfied"}, succeeded=False) == "computer_rejected"
    assert audit_outcome_code({"status": "unknown"}, succeeded=False) == "computer_rejected"
    assert (
        audit_outcome_code(
            {"status": "not_satisfied", "verification": {"reason": "target_changed_observe_again"}},
            succeeded=False,
        )
        == "target_changed_observe_again"
    )
    assert audit_outcome_code({"status": "unsupported_operation"}, succeeded=True) == (
        "unsupported_operation"
    )
    assert audit_outcome_code({"reason": "desktop text"}, succeeded=True) == "computer_succeeded"
