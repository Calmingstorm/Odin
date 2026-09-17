"""Live Discord credential correction is deliberately separate from setup."""

from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.environment import EnvironmentSource
from src.config.schema import Config, set_active_config_path
from src.web.api import discord_connection as connection_api
from src.web.api.discord_connection import register_discord_connection

TOKEN_A = "alpha.token.value"
TOKEN_B = "bravo.token.value"


class Supervisor:
    def __init__(self, *, attach_error: Exception | None = None, gate=None):
        self.attach_error, self.gate = attach_error, gate
        self.attached: list[str] = []
        self.detached = 0
        self._state = "detached"

    def status(self):
        detail = "ready" if self._state == "connected" else "no Discord token attached"
        return SimpleNamespace(
            state=self._state, detail=detail, generation=len(self.attached) + self.detached
        )

    async def attach(self, token):
        self.attached.append(token)
        if self.gate is not None and len(self.attached) == 1:
            await self.gate.wait()
        if self.attach_error:
            raise self.attach_error
        self._state = "connecting"

    async def detach(self):
        self.detached += 1
        self._state = "detached"


def _bot(tmp_path: Path, *, supervisor=None, token="[REDACTED]"):
    config_path = tmp_path / "config.yml"
    config_path.write_text("discord:\n  token: ${DISCORD_TOKEN}\n", encoding="utf-8")
    set_active_config_path(config_path)
    if token != "[REDACTED]":
        (tmp_path / ".env").write_text(f"DISCORD_TOKEN={token}\n", encoding="utf-8")
    return SimpleNamespace(
        config=Config(discord={"token": token}),
        onboarding=SimpleNamespace(
            environment_source=EnvironmentSource(tmp_path / ".env"),
            initialization_store=SimpleNamespace(binding=SimpleNamespace(config_path=config_path)),
        ),
        connection_supervisor=supervisor,
        api_token_manager=None,
    )


def _app(bot, *, identity=None):
    routes = web.RouteTableDef()
    register_discord_connection(routes, bot)

    @web.middleware
    async def inject(request, handler):
        if identity is not None:
            request._api_identity = identity
        return await handler(request)

    app = web.Application(middlewares=[inject])
    app.router.add_routes(routes)
    return app


async def test_connection_context_unavailable_is_503(tmp_path):
    bot = _bot(tmp_path)
    bot.onboarding = None
    async with TestClient(TestServer(_app(bot))) as client:
        response = await client.post(
            "/api/discord/connection", json={"operation": "credentials", "token": TOKEN_A}
        )
        assert response.status == 503


async def test_connection_route_has_local_admin_guard(tmp_path):
    bot = _bot(tmp_path)
    async with TestClient(TestServer(_app(bot, identity=SimpleNamespace(tier="user")))) as client:
        assert (await client.get("/api/discord/connection")).status == 403
        assert (
            await client.post("/api/discord/connection", json={"operation": "detach"})
        ).status == 403


async def test_invalid_credential_is_not_persisted(tmp_path):
    bot = _bot(tmp_path, supervisor=Supervisor())
    async with TestClient(TestServer(_app(bot))) as client:
        response = await client.post(
            "/api/discord/connection", json={"operation": "credentials", "token": "invalid"}
        )
        assert response.status == 400
    assert not (tmp_path / ".env").exists()


async def test_credential_is_saved_before_activation_failure_and_never_returned(tmp_path):
    bot = _bot(tmp_path, supervisor=Supervisor(attach_error=RuntimeError(TOKEN_A)))
    async with TestClient(TestServer(_app(bot))) as client:
        response = await client.post(
            "/api/discord/connection", json={"operation": "credentials", "token": TOKEN_A}
        )
        assert response.status == 502
        payload = await response.json()
        assert payload["persisted"] is True
        assert TOKEN_A not in str(payload)
        assert TOKEN_A not in await (await client.get("/api/discord/connection")).text()
    assert f"DISCORD_TOKEN={TOKEN_A}" in (tmp_path / ".env").read_text(encoding="utf-8")
    assert "${DISCORD_TOKEN}" in (tmp_path / "config.yml").read_text(encoding="utf-8")


async def test_status_reports_durable_sources_not_runtime_config(tmp_path):
    bot = _bot(tmp_path, token=TOKEN_A)
    (tmp_path / ".env").unlink()
    async with TestClient(TestServer(_app(bot))) as client:
        assert (await (await client.get("/api/discord/connection")).json())["persisted"] is False


async def test_cancelled_request_does_not_autoattach(tmp_path, monkeypatch):
    supervisor, bot = Supervisor(), _bot(tmp_path, supervisor=Supervisor())
    bot.connection_supervisor = supervisor
    original = connection_api._run_settled

    async def settled_then_cancelled(write):
        outcome, _cancelled = await original(write)
        return outcome, True

    monkeypatch.setattr(connection_api, "_run_settled", settled_then_cancelled)
    async with TestClient(TestServer(_app(bot))) as client:
        with pytest.raises((asyncio.CancelledError, __import__("aiohttp").ClientConnectionError)):
            await asyncio.create_task(
                client.post(
                    "/api/discord/connection", json={"operation": "credentials", "token": TOKEN_A}
                )
            )
    assert bot.config.discord.token == TOKEN_A
    assert supervisor.attached == []


async def test_concurrent_credential_updates_leave_newest_attached(tmp_path):
    gate = asyncio.Event()
    supervisor, bot = Supervisor(gate=gate), _bot(tmp_path, supervisor=None)
    bot.connection_supervisor = supervisor
    async with TestClient(TestServer(_app(bot))) as client:
        first = asyncio.create_task(
            client.post(
                "/api/discord/connection", json={"operation": "credentials", "token": TOKEN_A}
            )
        )
        while not supervisor.attached:
            await asyncio.sleep(0)
        second = asyncio.create_task(
            client.post(
                "/api/discord/connection", json={"operation": "credentials", "token": TOKEN_B}
            )
        )
        gate.set()
        assert (await first).status == 200
        assert (await second).status == 200
    assert supervisor.attached == [TOKEN_A, TOKEN_B]
    assert bot.config.discord.token == TOKEN_B
    assert f"DISCORD_TOKEN={TOKEN_B}" in (tmp_path / ".env").read_text(encoding="utf-8")
