"""Facade-level contracts: no running desktop, user session, or real subprocess."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.integration import ComputerIntegration


def integration(*, enabled=False, host_allowed=True, permission=None):
    controller = SimpleNamespace(session=AsyncMock(return_value={"state": "cancelled"}))
    bot = SimpleNamespace(
        config=SimpleNamespace(computer=SimpleNamespace(enabled=enabled)),
        host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: host_allowed),
        tool_executor=SimpleNamespace(check_permission=lambda *_: permission),
    )
    return ComputerIntegration(bot, controller=controller), controller


async def test_real_facade_stop_remains_authorized_after_disable():
    service, controller = integration()
    result = await service.operator_stop(owner_id="alice", web_session_id="private")
    assert result["state"] == "cancelled"
    context, request = controller.session.call_args.args
    assert request == {"operation": "stop"}
    assert context.owner_id == "alice"
    assert context.channel_id == service.web_binding("private")
    assert context.turn_id == "web-operator"


@pytest.mark.parametrize("kwargs", [
    {"host_allowed": False}, {"permission": "denied"},
])
async def test_disabled_stop_does_not_bypass_current_authority(kwargs):
    service, controller = integration(**kwargs)
    with pytest.raises(PermissionError):
        await service.operator_stop(owner_id="alice", web_session_id="private")
    controller.session.assert_not_called()


@pytest.mark.parametrize("identity", [
    {"owner_id": "", "web_session_id": "private"},
    {"owner_id": "alice", "web_session_id": ""},
])
async def test_disabled_stop_requires_identity(identity):
    service, controller = integration()
    with pytest.raises(PermissionError):
        await service.operator_stop(**identity)
    controller.session.assert_not_called()


async def test_emergency_exception_is_not_capture_or_regular_authority():
    service, controller = integration()
    for method in (service.operator_status, service.operator_observe, service.operator_pause):
        with pytest.raises(PermissionError):
            await method(owner_id="alice", web_session_id="private")
    controller.session.assert_not_called()


async def test_native_disabled_same_name_skill_survives_enable_disable():
    from src.discord.native_tools.registry import NativeToolDispatcher
    from src.tools.output_authorization import request_tool_scope

    desktop = SimpleNamespace(
        enabled=False, grant_allows=lambda *_: False,
        _handle_computer_session=AsyncMock(), _handle_computer_observe=AsyncMock(),
        _handle_computer_act=AsyncMock(),
    )
    dispatcher = NativeToolDispatcher(
        owners={"computer": desktop}, skill_manager=SimpleNamespace(),
        tool_catalog=None, prompt_builder=None, channel_state=None,
    )
    dispatcher.skills = SimpleNamespace(
        handles=lambda name: name == "computer_act",
        dispatch=AsyncMock(return_value=("legacy-skill", None)),
    )
    message = SimpleNamespace(channel=SimpleNamespace(id="clean"))

    async def call():
        return await dispatcher.dispatch("computer_act", {}, message=message,
                                         user_id="alice", skill_file_delivery="stage")

    assert dispatcher.handles("computer_act")
    assert (await call())[0] == "legacy-skill"
    desktop.enabled = True
    assert dispatcher.handles("computer_act")
    assert not (await call())[0].ok  # No authenticated foreground grant.
    desktop.enabled = False
    assert (await call())[0] == "legacy-skill"
    dispatcher.computer_restricted = lambda *_: True
    assert not (await call())[0].ok  # Disable cannot erase persistent restriction.
    dispatcher.computer_restricted = None
    token = request_tool_scope.set(frozenset())
    try:
        assert not (await call())[0].ok  # Empty scope means deny all, not unrestricted.
    finally:
        request_tool_scope.reset(token)
    assert dispatcher.skills.dispatch.await_count == 2
    desktop._handle_computer_act.assert_not_called()


async def test_executor_name_reservation_is_optional_but_scope_is_not():
    from src.config.schema import ToolsConfig
    from src.tools.executor import ToolExecutor
    from src.tools.output_authorization import request_tool_scope

    executor = ToolExecutor(config=ToolsConfig())
    assert (await executor._execute_inner("computer_act", {})).error == "unknown_tool"
    executor.computer_reserved = lambda name: name == "computer_act"
    assert (await executor._execute_inner("computer_act", {})).error == "permission_denied"
    executor.computer_reserved = lambda _: False
    executor.computer_restricted = lambda *_: True
    assert (await executor._execute_inner("computer_act", {})).error == "permission_denied"
    executor.computer_restricted = None
    token = request_tool_scope.set(frozenset())
    try:
        assert (await executor._execute_inner("computer_act", {})).error == "permission_denied"
    finally:
        request_tool_scope.reset(token)
