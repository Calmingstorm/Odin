"""X1 inventory capability discovery uses fake backends, never a desktop."""

import asyncio
import json
from types import SimpleNamespace

import pytest

from src.computer.controller import ComputerController
from src.computer.integration import ComputerIntegration, ForegroundGrant, _grant
from src.computer.models import BackendCapabilities, RequestContext
from src.computer.store import ComputerStore
from src.tools.output_authorization import request_tool_scope


class InventoryUnavailableBackend:
    """A disposable backend stand-in with no inventory operation."""

    def __init__(self, capabilities):
        self.capabilities = capabilities
        self.closed = False

    async def close(self):
        self.closed = True


def context():
    return RequestContext("owner", "channel", "turn", "localhost")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("capabilities", "backend_name"),
    [
        (BackendCapabilities("x11", "existing_session"), "x11"),
        (BackendCapabilities("wayland", "existing_session"), "wayland"),
        (
            BackendCapabilities("wayland", "existing_session", backend="hyprland"),
            "hyprland",
        ),
    ],
)
async def test_inventory_unsupported_is_structured_non_dispatch_result(
    tmp_path, capabilities, backend_name
):
    backend = InventoryUnavailableBackend(capabilities)
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    try:
        result = await controller.session(context(), {"operation": "inventory_targets"})
        assert result == {
            "status": "unsupported_operation",
            "backend": backend_name,
            "operation": "inventory_targets",
            "dispatch": "none",
            "supported_next_step": "start",
        }
        assert backend.closed
        assert not controller._live
    finally:
        await controller.close()
        store.close()


@pytest.mark.asyncio
async def test_x11_inventory_mismatch_is_not_a_safety_incident(tmp_path):
    backend = InventoryUnavailableBackend(BackendCapabilities("x11", "existing_session"))
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    bot = SimpleNamespace(
        config=SimpleNamespace(computer=SimpleNamespace(enabled=True)),
        host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: True),
        tool_executor=SimpleNamespace(check_permission=lambda *_: None),
    )
    integration = ComputerIntegration(bot, controller=controller)
    request = context()
    grant = ForegroundGrant(
        request, request.channel_id, "call", "computer_session", asyncio.current_task()
    )
    token = _grant.set(grant)
    scope_token = request_tool_scope.set({"computer_session"})
    try:
        response = await integration._handle_computer_session(
            {"operation": "inventory_targets"}
        )
        assert response.ok is True
        assert response.error is None
        assert response.uncertain_outcome is False
        assert response.audit_metadata["computer_input_outcome"] == "not_dispatched"
        assert response.audit_metadata["computer_reason_code"] == "unsupported_operation"
        assert json.loads(response.output) == {
            "status": "unsupported_operation",
            "backend": "x11",
            "operation": "inventory_targets",
            "dispatch": "none",
            "supported_next_step": "start",
        }
        assert backend.closed
    finally:
        request_tool_scope.reset(scope_token)
        _grant.reset(token)
        await controller.close()
        store.close()
