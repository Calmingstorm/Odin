# ruff: noqa: E501
"""End-to-end first-install parity through the composed production application.

The gateway socket is deliberately replaced with a cooperative in-process
transport.  Configuration, initialization durability, aiohttp middleware and
route registration remain the production implementations.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest
import yaml
from aiohttp import ClientSession

from src.config.environment import EnvironmentSource
from src.config.initialization import InitializationStore, InstallationBinding
from src.config.schema import Config, active_config_path, set_active_config_path
from src.discord.client import OdinBot
from src.discord.connection_supervisor import ConnectionSupervisor
from src.discord.discordpy_adapter import DiscordPyReattachmentAdapter
from src.health.server import HealthServer
from src.web.onboarding import OnboardingCoordinator

_VALID_TOKEN = "YWJj.ZGVm.Z2hp"
_NEXT_TOKEN = "amts.bW5v.cHFy"


class _LoopbackGateway:
    """Gateway boundary with no Discord network or library login calls."""

    def __init__(self) -> None:
        self.tokens: list[str] = []
        self.stops: list[asyncio.Event] = []

    def require_supported(self) -> None:
        return None

    async def start(self, token: str) -> None:
        self.tokens.append(token)
        stop = asyncio.Event()
        self.stops.append(stop)
        await stop.wait()

    async def retire_gateway(self, task: asyncio.Task[object]) -> None:
        self.stops[-1].set()
        await task


@pytest.fixture
async def composed_install(tmp_path: Path, monkeypatch):
    """Build the same bot/services/routes startup composes, on loopback only."""
    previous_config_path = active_config_path()
    previous_token = os.environ.pop("DISCORD_TOKEN", None)
    monkeypatch.chdir(tmp_path)
    config_path = tmp_path / "config.yml"
    env_path = tmp_path / "config.env"
    config = Config(
        discord={"token": "[REDACTED]"},
        web={"enabled": True, "host": "0.0.0.0", "port": 38127},
        openai_codex={"credentials_path": str(tmp_path / "private" / "codex.json")},
    )
    config_path.write_text(yaml.safe_dump(config.model_dump(mode="json"), sort_keys=False))
    private = tmp_path / "private"
    private.mkdir(mode=0o700)
    store = InitializationStore(
        private / "initialization.json", InstallationBinding("full-parity", config_path)
    )
    store.provision_fresh()
    set_active_config_path(config_path)

    bot = OdinBot(config)
    bot.onboarding = OnboardingCoordinator(store, EnvironmentSource(env_path), True)
    gateway = _LoopbackGateway()
    # This proves the installed discord.py adapter accepts the real client
    # layout, while the test transport keeps all gateway IO in-process.
    assert DiscordPyReattachmentAdapter(bot).attachment_available
    bot.start = gateway.start  # type: ignore[assignment]
    bot.bind_connection_supervisor(ConnectionSupervisor(bot, adapter=gateway))
    bot.scheduler.set_connection_state_provider(
        bot.connection_supervisor.connection_availability
    )

    server = HealthServer(port=0, web_config=config.web)
    server.attach_onboarding(bot.onboarding)
    server.set_bot(bot)
    await server.start()
    host, port = server._listener_sockets[0].getsockname()[:2]
    try:
        yield bot, gateway, server, f"http://{host}:{port}", env_path
    finally:
        await bot.connection_supervisor.close()
        await server.stop()
        set_active_config_path(previous_config_path)
        if previous_token is not None:
            os.environ["DISCORD_TOKEN"] = previous_token


@pytest.mark.asyncio
async def test_fresh_bootstrap_becomes_ordinary_composed_api_without_widening(composed_install):
    bot, gateway, server, url, env_path = composed_install
    assert server._effective_bind_host == "127.0.0.1"
    assert bot.tool_catalog.merged_definitions(), "real tool catalog was not composed"
    assert bot.scheduler.connection_status()["available"] is False

    async with ClientSession() as client:
        # Before setup, no arbitrary token, including the Discord gateway
        # token, may manufacture an administrator UI session.
        provisional = await client.post(url + "/api/auth/login", json={"token": _VALID_TOKEN})
        assert provisional.status == 409
        assert (await provisional.json())["error"] == "setup_required"
        assert (await client.get(url + "/api/schedules/status")).status == 403
        assert (await client.get(url + "/api/tools")).status == 403
        invalid = await client.post(url + "/api/setup/complete", json={"discord_token": "not-a-token"})
        assert invalid.status == 400
        assert bot.connection_supervisor.status().generation == 0

        # A credential actually configured while setup is pending remains
        # usable. Auth is not a proxy for Discord-token acceptance.
        bot.config.web.api_token = "preconfigured-web-token"
        configured = await client.post(
            url + "/api/auth/login", json={"token": "preconfigured-web-token"}
        )
        assert configured.status == 200
        bot.config.web.api_token = ""

        completed = await client.post(url + "/api/setup/complete", json={
            "discord_token": _VALID_TOKEN, "web_api_token": "local-parity-secret", "timezone": "UTC",
        })
        assert completed.status == 200
        assert (await completed.json())["discord"]["state"] == "connecting"
        initial_generation = bot.connection_supervisor.status().generation
        assert gateway.tokens == [_VALID_TOKEN]
        assert "DISCORD_TOKEN=" + _VALID_TOKEN in env_path.read_text()
        assert server._effective_bind_host == "127.0.0.1", "completion must not widen a listener"

        # Valid web auth is required after completion. Ordinary composed API,
        # scheduler, and tool inventory are now reachable, not a setup-only app.
        assert (await client.post(url + "/api/auth/login", json={"token": _VALID_TOKEN})).status == 401
        login = await client.post(url + "/api/auth/login", json={"token": "local-parity-secret"})
        assert login.status == 200
        assert (await client.get(url + "/api/schedules/status")).status == 401
        headers = {"Authorization": "Bearer local-parity-secret"}
        assert (await client.get(url + "/api/schedules/status", headers=headers)).status == 200
        tools = await client.get(url + "/api/tools", headers=headers)
        assert tools.status == 200 and (await tools.json())
        status = await client.get(url + "/api/status", headers=headers)
        assert status.status == 200 and (await status.json())["status"] == "starting"

        # An invalid replacement remains rejected and cannot attach/revive a
        # credential generation. A valid correction creates a new generation.
        rejected = await client.post(url + "/api/discord/connection", headers=headers, json={
            "operation": "credentials", "token": "invalid",
        })
        assert rejected.status == 400
        assert bot.connection_supervisor.status().generation == initial_generation
        corrected = await client.post(url + "/api/discord/connection", headers=headers, json={
            "operation": "credentials", "token": _NEXT_TOKEN,
        })
        assert corrected.status == 200
        replacement_generation = bot.connection_supervisor.status().generation
        assert replacement_generation > initial_generation and gateway.tokens[-1] == _NEXT_TOKEN

        # A transport outage changes availability but does not take HTTP down.
        bot.connection_supervisor.transport_disconnected(replacement_generation)
        assert bot.scheduler.connection_status()["available"] is False
        assert (await client.get(url + "/health/live")).status == 200
        assert (await client.get(url + "/api/schedules/status", headers=headers)).status == 200
        # A stale ready callback cannot rearm the new attachment. The current
        # reconnect readiness callback can.
        bot.connection_supervisor.transport_ready(initial_generation)
        assert bot.connection_supervisor.status().state == "disconnected"
        bot.connection_supervisor.transport_ready(replacement_generation)
        assert bot.scheduler.connection_status()["available"] is True

    await bot.connection_supervisor.detach()
    assert bot.connection_supervisor.status().state == "detached"
    assert bot.scheduler.connection_status()["available"] is False
