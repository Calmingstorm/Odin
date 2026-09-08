"""Computer provisioning saves desired state, never implicit desktop authority."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.computer.manager import ComputerLifecycle
from src.config.schema import Config, active_config_path, set_active_config_path
from src.web.api.config_admin import register_discord_config


@pytest.fixture
def provisioning(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    path = tmp_path / "config.yml"
    path.write_text(
        "# unchanged secret placeholder\ndiscord:\n  token: ${BOT_TOKEN}\n"
        "computer:\n  enabled: false\n"
    )
    previous = active_config_path()
    set_active_config_path(path)
    factory = Mock(side_effect=AssertionError("Provisioning must not launch a desktop"))
    bot = SimpleNamespace(
        config=Config(
            discord={"token": "test-secret-never-return"},
            computer={"storage_dir": str(tmp_path / "private"), "display": ":70"},
        ),
        tool_catalog=Mock(),
        api_token_manager=None,
    )
    bot.boot_config_snapshot = bot.config.model_dump()
    manager = ComputerLifecycle(bot, factory=factory)
    bot.computer = manager
    routes = web.RouteTableDef()
    register_discord_config(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    yield bot, manager, factory, path, app
    set_active_config_path(previous)


@pytest.mark.parametrize("value", [None, [], "unsafe", True])
async def test_provisioning_requires_object_without_mutation(provisioning, value):
    bot, manager, factory, path, app = provisioning
    original, settings = path.read_bytes(), bot.config.model_dump()
    async with TestClient(TestServer(app)) as client:
        response = await client.put("/api/config", json={"computer": value})
        assert response.status == 400
        assert await response.json() == {"error": "computer must be a provisioning object"}
    assert path.read_bytes() == original and bot.config.model_dump() == settings
    assert manager._service is None
    factory.assert_not_called()


@pytest.mark.parametrize("enabled", [True, False, None, "false"])
async def test_generic_config_cannot_enable_or_revoke_even_with_other_valid_updates(
    provisioning, enabled
):
    bot, manager, factory, path, app = provisioning
    original, settings = path.read_bytes(), bot.config.model_dump()
    async with TestClient(TestServer(app)) as client:
        response = await client.put(
            "/api/config",
            json={
                "computer": {"enabled": enabled, "display": ":71"},
                "logging": {"level": "DEBUG"},
            },
        )
        assert response.status == 409
        body = await response.json()
        assert body["error"] == "computer.enabled is read-only on this route"
        assert "POST /api/computer/enabled" in body["detail"]
    assert path.read_bytes() == original and bot.config.model_dump() == settings
    assert not manager.enabled and manager._service is None
    factory.assert_not_called()


async def test_deferred_provisioning_persists_but_keeps_startup_snapshot_and_secrets(provisioning):
    bot, manager, factory, path, app = provisioning
    startup = manager.settings.model_dump()
    async with TestClient(TestServer(app)) as client:
        response = await client.put("/api/config", json={"computer": {"display": ":71"}})
        assert response.status == 200
        body = await response.json()
        assert body["computer"]["display"] == ":71"
        assert "test-secret-never-return" not in await response.text()
        assert "test-secret-never-return" not in await (await client.get("/api/config")).text()
        meta_response = await client.get("/api/config/meta")
        assert meta_response.status == 200
        assert "test-secret-never-return" not in await meta_response.text()
        meta = await meta_response.json()
        display = next(field for field in meta["fields"] if field["path"] == "computer.display")
        assert display["desired"] == ":71"
        assert display["effective"] == ":70"
        assert display["pending_restart"] is True
        assert display["apply_state"] == "pending_restart"
    assert bot.config.computer.display == ":71"
    assert manager.settings.model_dump() == startup
    assert manager.snapshot()["restart_required"] == ["display"]
    assert not manager.enabled and manager._service is None
    assert "${BOT_TOKEN}" in path.read_text()
    assert "test-secret-never-return" not in path.read_text()
    factory.assert_not_called()


async def test_configured_auth_denies_anonymous_provisioning_before_validation(provisioning):
    bot, manager, factory, path, app = provisioning
    bot.config.web.api_token = "test-only-auth-value"
    original = path.read_bytes()
    async with TestClient(TestServer(app)) as client:
        response = await client.put("/api/config", json={"computer": {"enabled": True}})
        assert response.status == 403
        assert await response.json() == {"error": "admin access required"}
    assert path.read_bytes() == original
    assert not manager.enabled
    factory.assert_not_called()
