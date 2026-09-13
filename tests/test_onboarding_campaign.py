"""D1 setup API uses explicit installation context and truthful publication."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.environment import EnvironmentSource
from src.config.initialization import InitializationStore, InstallationBinding
from src.config.schema import Config, active_config_path, set_active_config_path
from src.web.api.config_admin import register_setup_wizard
from src.web.onboarding import OnboardingCoordinator


def _app(bot):
    routes = web.RouteTableDef()
    register_setup_wizard(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app


@pytest.mark.asyncio
async def test_setup_context_absent_denies_safely():
    bot = SimpleNamespace(onboarding=None)
    async with TestClient(TestServer(_app(bot))) as client:
        response = await client.get("/api/setup/status")
        assert response.status == 503
        assert (await response.json())["needed"] is False


@pytest.mark.asyncio
async def test_complete_is_context_bound_and_second_call_conflicts(tmp_path, monkeypatch):
    config_path = tmp_path / "live.yml"
    config_path.write_text("discord:\n  token: ${DISCORD_TOKEN}\nlogging:\n  level: DEBUG\n")
    env_path = tmp_path / "environment"
    env_path.write_text("DISCORD_TOKEN=old\n")
    store = InitializationStore(
        tmp_path / "initialization.json", InstallationBinding("test", config_path)
    )
    store.provision_fresh()
    previous = active_config_path()
    set_active_config_path(config_path)
    try:
        bot = SimpleNamespace(
            config=Config(discord={"token": "old"}, logging={"level": "DEBUG"}),
            onboarding=OnboardingCoordinator(store, EnvironmentSource(env_path), True),
            connection_supervisor=None,
        )
        monkeypatch.setattr("src.web.api.config_admin.validate_token_format", lambda _: True)
        async with TestClient(TestServer(_app(bot))) as client:
            response = await client.post(
                "/api/setup/complete", json={"discord_token": "a.b.c", "timezone": "UTC"}
            )
            assert response.status == 200
            body = await response.json()
            assert body["mode"] == "complete"
            assert body["discord"]["state"] == "failed"
            assert "DISCORD_TOKEN=a.b.c" in env_path.read_text()
            # Existing config detail survives the setup leaf edit.
            assert bot.config.logging.level == "DEBUG"
            assert (await client.post("/api/setup/complete", json={})).status == 409
    finally:
        set_active_config_path(previous)


@pytest.mark.asyncio
@pytest.mark.parametrize("payload, expected", [
    ({"hosts": []}, "hosts must be an object"),
    ({"hosts": {"forge": {"address": "", "ssh_user": "odin"}}}, "host entries require"),
    ({"features": {"browser": "yes"}}, "features.browser must be boolean"),
    ({"timezone": "Mars/Olympus"}, "timezone must be an IANA timezone"),
])
async def test_setup_rejects_invalid_optional_configuration_before_publication(
    tmp_path, monkeypatch, payload, expected
):
    config_path = tmp_path / "config.yml"
    config_path.write_text("discord:\n  token: '[REDACTED]'\n")
    environment = tmp_path / "environment"
    environment.write_text("DISCORD_TOKEN=old-value\n")
    store = InitializationStore(tmp_path / "state.json", InstallationBinding("test", config_path))
    store.provision_fresh()
    bot = SimpleNamespace(
        config=Config(discord={"token": "[REDACTED]"}),
        onboarding=OnboardingCoordinator(store, EnvironmentSource(environment), True),
        connection_supervisor=None,
    )
    async with TestClient(TestServer(_app(bot))) as client:
        response = await client.post("/api/setup/complete", json=payload)
        body = await response.json()
    assert response.status == 400 and expected in body["error"]
    assert environment.read_text() == "DISCORD_TOKEN=old-value\n"
    assert store.state().setup_allowed
