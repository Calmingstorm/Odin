"""Production facade contracts with no desktop or optional dependency needed."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.integration import ComputerIntegration
from tests.test_computer_dispatch_r3 import dispatch_state, facade
from tests.test_computer_review_r3 import call


def test_facade_uses_actual_converter_not_stale_model_allowlist():
    from src.computer.integration import require_vision
    from tests.test_computer_native_vision_r5 import client, serving

    current = serving(client("gpt-6-astra"))
    require_vision(current)
    current.client._convert_messages_with_tools = lambda _: []
    with pytest.raises(PermissionError, match="vision transport"):
        require_vision(current)


@pytest.mark.parametrize("status", ["unavailable", "not_satisfied", "rejected", "failed"])
async def test_known_failure_is_not_reported_as_success_or_uncertain(status, monkeypatch):
    service, state = facade(), dispatch_state()
    monkeypatch.setattr("src.computer.integration.require_vision", lambda _: None)
    service.controller.act.return_value = {"status": status, "reason": "fixture_refusal"}
    block = call("computer_act")
    with service.foreground(state, block):
        result = await service._tool(block.name, block.input)
    assert result.ok is False
    assert result.error == "computer_not_satisfied"
    assert not result.uncertain_outcome


async def test_pause_remains_available_without_native_vision():
    service, state = facade(), dispatch_state()
    state._computer_serving = None
    block = call("computer_session", operation="pause")
    with service.foreground(state, block):
        result = await service._tool(block.name, block.input)
    assert result.ok
    assert service.controller.session.call_args.args[1] == {"operation": "pause"}


def fixture(controller):
    settings = SimpleNamespace(enabled=True, runtime_sudo=False, storage_dir="/unused")
    bot = SimpleNamespace(config=SimpleNamespace(computer=settings))
    return ComputerIntegration(bot, controller=controller), settings


def test_generation_pins_backend_settings_not_enable_switch():
    service, settings = fixture(SimpleNamespace())
    settings.runtime_sudo = True
    settings.storage_dir = "/different"
    assert service.settings.runtime_sudo is False
    assert service.settings.storage_dir == "/unused"
    assert service.enabled
    settings.enabled = False
    assert not service.enabled


async def test_close_idempotent_never_closes_an_injected_store():
    store = SimpleNamespace(close=Mock())
    controller = SimpleNamespace(close=AsyncMock(), store=store, _live={})
    service, _ = fixture(controller)
    await service.close()
    await service.close()
    controller.close.assert_awaited_once()
    store.close.assert_not_called()
    assert not service.enabled


async def test_close_owned_store_once_after_successful_cleanup():
    controller = SimpleNamespace(close=AsyncMock(), store=SimpleNamespace(close=Mock()), _live={})
    service, _ = fixture(controller)
    service._owns_store = True
    await service.close()
    await service.close()
    controller.store.close.assert_called_once()


async def test_failed_cleanup_keeps_owned_store_and_allows_retry():
    controller = SimpleNamespace(close=AsyncMock(), store=SimpleNamespace(close=Mock()),
                                 _live={"fixture": object()})
    service, _ = fixture(controller)
    service._owns_store = True
    with pytest.raises(RuntimeError, match="cleanup incomplete"):
        await service.close()
    controller.store.close.assert_not_called()
    assert not service._closed
    controller._live.clear()
    await service.close()
    assert service._closed
    controller.store.close.assert_called_once()


def test_context_revocation_hook_rechecked_with_host_and_tool_authority():
    service = facade()
    context = service._context(dispatch_state())
    assert service._authorize(context)
    service.bot.computer_authorize_context = lambda _: False
    assert not service._authorize(context)
    service.bot.computer_authorize_context = lambda _: True
    assert service._authorize(context)
    service.bot.host_access_manager.is_host_allowed = lambda *_: False
    assert not service._authorize(context)


def test_attached_factory_is_generic_with_pinned_operator_settings():
    service, _ = fixture(SimpleNamespace())
    service.settings.environment = "existing_session"
    service.settings.platform = "x11"
    service.settings.display = ":187"
    service.settings.xauthority = ""
    service.settings.monitor_names = ["fixture"]
    service.settings.runtime_sudo = True
    xed = service._backend()
    assert xed._input_enabled and xed._runtime_sudo
    assert "app_profile" not in xed._config
    assert not xed._children


@pytest.mark.parametrize("platform", ["x11", "wayland"])
@pytest.mark.parametrize("app", ["xed", "drawing"])
def test_explicit_isolated_app_never_constructs_attached_backend(platform, app):
    from src.computer.models import ComputerError

    service, _ = fixture(SimpleNamespace())
    service.settings.environment = "existing_session"
    service.settings.platform = platform
    # No display/bus configuration exists: rejection must precede backend setup.
    with pytest.raises(ComputerError, match="isolated_request_conflicts.*omit app"):
        service._backend(app)
