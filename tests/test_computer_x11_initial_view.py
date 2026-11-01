"""Initial X11 frame delivery uses the same invocation-bound image gate."""

from types import SimpleNamespace

import pytest

from src.computer.controller import ComputerController
from src.computer.integration import ComputerIntegration
from src.computer.models import ComputerError, RequestContext
from src.computer.store import ComputerStore
from tests.test_computer_native_vision_r5 import client, serving
from tests.test_computer_x11_recovery_controller import RecoveryBackend


@pytest.mark.parametrize("bad_image", [False, True])
async def test_start_delivers_initial_view_once_not_input_authority(
        tmp_path, monkeypatch, bad_image):
    backend = RecoveryBackend()
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    ctx = RequestContext("owner", "channel", "turn", "host")
    bot = SimpleNamespace(
        config=SimpleNamespace(computer=SimpleNamespace(enabled=True)),
        host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: True),
        tool_executor=SimpleNamespace(check_permission=lambda *_: None),
    )
    integration = ComputerIntegration(bot, controller=controller)
    monkeypatch.setattr(integration, "_context", lambda _: ctx)
    turn = SimpleNamespace(user_id="owner", _computer_serving=serving(client()),
                           message=SimpleNamespace(channel=SimpleNamespace(id="channel")))
    block = SimpleNamespace(id="start", name="computer_session", input={"operation": "start"})
    if bad_image:
        def broken(_):
            raise ValueError("invalid image")
        monkeypatch.setattr(integration, "output_image", broken)
    try:
        with integration.foreground(turn, block):
            result = await integration._tool("computer_session", block.input)
            grant = store.find_session(ctx)
            assert grant.state == "active" and backend.captures == 1
            assert grant.session_id not in controller._delivered_observations
            if bad_image:
                assert result.ok and '"next_action": "observe_fresh"' in result.output
                assert '"state": "active"' in result.output
            else:
                assert "__image_block__" in result
                assert '"state":"active"' in result["__prompt__"]
                await integration.validate_delivery(turn, block, result)
                assert grant.session_id in controller._delivered_observations
                with pytest.raises((ValueError, ComputerError)):
                    await integration.validate_delivery(turn, block, result)
    finally:
        await controller.close()
        store.close()
