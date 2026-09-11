"""Fresh-install journey exercised through the production aiohttp composition.

This deliberately uses ``HealthServer.set_bot`` rather than a hand-picked
route table.  The bot is small, but its onboarding coordinator and connection
supervisor are real collaborators; outbound Discord and OAuth transports are
replaced before they can leave loopback.
"""
from __future__ import annotations

import base64
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import yaml
from aiohttp import ClientSession
from aiohttp.client_exceptions import WSServerHandshakeError

from src.config.environment import EnvironmentSource
from src.config.initialization import InitializationStore, InstallationBinding
from src.config.schema import Config, WebConfig, WebhookConfig, set_active_config_path
from src.health.server import HealthServer
from src.web.onboarding import OnboardingCoordinator


class _Supervisor:
    def __init__(self) -> None:
        self.tokens: list[str] = []

    async def attach(self, token: str) -> None:
        self.tokens.append(token)

    async def detach(self) -> None:
        return None

    def status(self):
        return SimpleNamespace(
            state="idle", detail="test supervisor", generation=len(self.tokens)
        )


@pytest.fixture
async def fresh_install(tmp_path: Path):
    config_path = tmp_path / "config.yml"
    config = Config(
        discord={"token": "${DISCORD_TOKEN}"},
        web=WebConfig(enabled=True),
        openai_codex={"credentials_path": str(tmp_path / "codex-credentials.json")},
    )
    config_path.write_text(
        yaml.safe_dump(config.model_dump(mode="json"), sort_keys=False)
    )
    set_active_config_path(config_path)
    (tmp_path / "private").mkdir(mode=0o700)
    store = InitializationStore(
        tmp_path / "private" / "initialization.json",
        InstallationBinding("onboarding-journey", config_path),
    )
    store.provision_fresh()
    supervisor = _Supervisor()
    scheduler = SimpleNamespace(
        connection_status=lambda: {"state": "available", "connected": True},
        list_all=lambda: [],
    )
    bot = SimpleNamespace(
        config=config,
        onboarding=OnboardingCoordinator(
            store, EnvironmentSource(tmp_path / "config.env"), True
        ),
        connection_supervisor=supervisor,
        scheduler=scheduler,
        guilds=[],
        api_token_manager=None,
        audit=SimpleNamespace(
            set_event_callback=lambda _callback: None, log_web_action=AsyncMock()
        ),
        tool_executor=None,
        sessions=SimpleNamespace(items_snapshot=lambda: [], get=lambda _id: None),
        llm_gateway=SimpleNamespace(reload_codex=AsyncMock(), codex_client=None),
    )
    server = HealthServer(
        port=0, web_config=config.web, webhook_config=WebhookConfig(enabled=False)
    )
    server.set_bot(bot)
    await server.start()
    host, port = server._listener_sockets[0].getsockname()[:2]
    try:
        yield SimpleNamespace(
            bot=bot,
            server=server,
            url=f"http://{host}:{port}",
            env=tmp_path / "config.env",
        )
    finally:
        await server.stop()
        set_active_config_path(None)


@pytest.mark.asyncio
async def test_pending_install_is_loopback_ui_only_and_codex_stays_loopback_safe(  # noqa: E501
    fresh_install, monkeypatch
):
    journey = fresh_install
    assert journey.server._effective_bind_host == "127.0.0.1"
    monkeypatch.setattr(
        "src.llm.codex_auth.CodexAuth.request_device_code",
        AsyncMock(return_value={"device_auth_id": "local", "user_code": "SAFE"}),
    )
    monkeypatch.setattr(
        "src.llm.codex_auth.CodexAuth.poll_device_auth",
        AsyncMock(return_value={"access_token": "safe-local", "email": "local@example.test"}),
    )
    async with ClientSession() as client:
        assert (await client.get(journey.url + "/ui/")).status == 200
        assert (await client.get(journey.url + "/api/setup/status")).status == 200
        assert (await client.post(journey.url + "/api/codex/device-code")).status == 200
        assert (await client.post(journey.url + "/api/codex/device-poll", json={
            "device_auth_id": "local", "user_code": "SAFE", "interval": 1,
        })).status == 200
        assert journey.bot.config.openai_codex.credentials_path.endswith("codex-credentials.json")
        assert (await client.get(journey.url + "/api/schedules/status")).status == 403
        with pytest.raises(WSServerHandshakeError) as blocked:
            await client.ws_connect(journey.url.replace("http", "ws", 1) + "/api/ws")
        assert blocked.value.status == 403


@pytest.mark.asyncio
async def test_submission_immediately_requires_web_credential_and_enables_normal_scheduler_routes(  # noqa: E501
    fresh_install
):
    journey = fresh_install
    token = "journey-web-token"
    async with ClientSession() as client:
        response = await client.post(
            journey.url + "/api/setup/complete",
            json={"discord_token": "a.b.c", "web_api_token": token, "timezone": "UTC"},
        )
        assert response.status == 200
        assert (await response.json())["mode"] == "complete"
        assert journey.bot.connection_supervisor.tokens == ["a.b.c"]
        assert "DISCORD_TOKEN=a.b.c" in journey.env.read_text()
        assert (await client.get(journey.url + "/api/schedules/status")).status == 401
        authed = await client.get(
            journey.url + "/api/schedules/status", headers={"Authorization": f"Bearer {token}"}
        )
        assert authed.status == 200
        assert (await authed.json())["state"] == "available"
        with pytest.raises(WSServerHandshakeError) as denied:
            await client.ws_connect(journey.url.replace("http", "ws", 1) + "/api/ws")
        assert denied.value.status == 401
        allowed = await client.ws_connect(
            journey.url.replace("http", "ws", 1) + "/api/ws",
            protocols=[
                "odin.bearer."
                + base64.urlsafe_b64encode(token.encode()).decode().rstrip("=")
            ],
        )
        assert not allowed.closed
        await allowed.close()
        assert (await client.post(
            journey.url + "/api/setup/complete", json={},
            headers={"Authorization": f"Bearer {token}"},
        )).status == 409
        # A newly-created coordinator sees durable completion, not request-local state.
        restarted = OnboardingCoordinator(
            journey.bot.onboarding.initialization_store,
            journey.bot.onboarding.environment_source,
            True,
        )
        assert (await restarted.state()).mode.value == "complete"


@pytest.mark.asyncio
async def test_completed_install_corrects_discord_credential_only_through_dedicated_admin_route(  # noqa: E501
    fresh_install
):
    journey = fresh_install
    web_token = "journey-web-token"
    async with ClientSession() as client:
        assert (await client.post(journey.url + "/api/setup/complete", json={
            "discord_token": "a.b.c", "web_api_token": web_token,
        })).status == 200
        headers = {"Authorization": f"Bearer {web_token}"}
        bad = await client.post(journey.url + "/api/discord/connection", headers=headers, json={
            "operation": "credentials", "token": "not-a-discord-token",
        })
        assert bad.status == 400
        corrected = await client.post(
            journey.url + "/api/discord/connection", headers=headers, json={
            "operation": "credentials", "token": "d.e.f",
            }
        )
        assert corrected.status == 200
        assert journey.bot.connection_supervisor.tokens == ["a.b.c", "d.e.f"]
        assert "DISCORD_TOKEN=d.e.f" in journey.env.read_text()

