"""Existing-file regression tests for computer admission and read-only config."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from pydantic import ValidationError

from src.config.schema import ComputerUseConfig
from src.discord.tool_loop import ToolLoopRunner
from src.web.api.config_admin import register_discord_config
from tests.test_web_api_config_admin import _app


@pytest.mark.parametrize(
    "field,value",
    [
        ("display", "localhost:0"),
        ("xauthority", "relative"),
        ("xauthority", "/tmp/bad\x00"),
        ("monitor_names", ["DP-1", "DP-1"]),
        ("monitor_names", "DP-1"),
        ("storage_dir", "relative"),
    ],
)
def test_invalid_desktop_bindings_are_rejected(field, value):
    with pytest.raises(ValidationError):
        ComputerUseConfig(**{field: value})


def test_explicit_local_desktop_bindings_roundtrip():
    config = ComputerUseConfig(
        display=":20",
        xauthority="/tmp/isolated-auth",
        monitor_names=["DP-1"],
        storage_dir=" /tmp/private ",
    )
    assert config.display == ":20" and config.xauthority == "/tmp/isolated-auth"
    assert config.monitor_names == ["DP-1"] and config.storage_dir == "/tmp/private"


@pytest.mark.parametrize("computer", [{}, {"enabled": True}, None])
async def test_generic_config_requires_admin_before_computer_validation(computer):
    app, bot = _app(register_discord_config)
    before = bot.config.model_dump()
    bot.computer_set_enabled = AsyncMock()
    async with TestClient(TestServer(app)) as client:
        response = await client.put("/api/config", json={"computer": computer})
        body = await response.json()
    assert response.status == 403
    assert body == {"error": "admin access required"}
    assert bot.config.model_dump() == before
    bot.computer_set_enabled.assert_not_called()


@pytest.mark.parametrize(
    "computer,status,error",
    [
        ({"enabled": True}, 409, "computer.enabled is read-only on this route"),
        (None, 400, "computer must be a provisioning object"),
    ],
)
async def test_admin_cannot_bypass_enable_transaction(computer, status, error):
    app, bot = _app(register_discord_config)
    before = bot.config.model_dump()
    bot.computer_set_enabled = AsyncMock()

    @web.middleware
    async def admin_identity(request, handler):
        request._api_identity = SimpleNamespace(tier="admin")
        return await handler(request)

    app.middlewares.append(admin_identity)
    async with TestClient(TestServer(app)) as client:
        response = await client.put("/api/config", json={"computer": computer})
        body = await response.json()
    assert response.status == status
    assert body["error"] == error
    if status == 409:
        assert "POST /api/computer/enabled" in body["detail"]
    assert bot.config.model_dump() == before
    bot.computer_set_enabled.assert_not_called()


async def test_unconfirmed_turn_cleanup_is_logged_without_masking_turn(monkeypatch):
    runner = object.__new__(ToolLoopRunner)
    service = SimpleNamespace(finish_turn=AsyncMock(side_effect=RuntimeError("cleanup")))
    runner._get_computer = lambda: service
    log = Mock()
    monkeypatch.setattr("src.discord.tool_loop.log", log)
    state = object()
    assert await runner._stop_computer_turn(state) is None
    service.finish_turn.assert_awaited_once_with(state)
    log.exception.assert_called_once_with("Computer stop could not be confirmed")


def test_missing_previously_required_frame_retires_all_computer_evidence(monkeypatch):
    runner = object.__new__(ToolLoopRunner)
    runner._get_computer = lambda: object()
    frame = {"type": "image", "__computer_frame__": {"observation_id": "new", "sha256": "digest"}}
    messages = [{"role": "tool", "content": [frame, {"type": "text", "text": "ordinary"}]}]
    state = SimpleNamespace(
        messages=messages,
        _computer_required_frames=frozenset({("old", "old")}),
        _computer_frame_error=False,
    )
    monkeypatch.setattr(
        "src.computer.vision.plan_model_frames", lambda value: SimpleNamespace(messages=value)
    )
    assert runner._computer_frames(state) == frozenset()
    assert state._computer_required_frames == frozenset() and state._computer_frame_error
    assert state.messages[0]["content"] == [
        {"type": "text", "text": "[Computer frame unavailable; obtain fresh observation.]"},
        {"type": "text", "text": "ordinary"},
    ]
