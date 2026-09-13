"""Remaining campaign boundary regressions, with isolated state and transports."""
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.initialization import InitializationAlreadyCompleteError
from src.config.schema import Config
from src.discord.client import OdinBot
from src.health.startup import check_discord_token
from src.scheduler.scheduler import (
    ConnectionAvailability,
    ConnectionReason,
    ScheduleConnectionUnavailableError,
)
from src.web.api.config_admin import register_setup_wizard as register_setup
from src.web.api.config_admin import register_status_info
from src.web.api.schedules_api import register_schedules
from src.web.api.security import register_auth
from src.web.onboarding import OnboardingCoordinator


def app_for(registrar, bot):
    routes = web.RouteTableDef()
    registrar(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app


def test_nonstring_resolved_token_is_missing_not_truthy():
    result = check_discord_token(SimpleNamespace(token=object()))
    assert not result.passed
    assert "missing" in result.detail


def test_legacy_env_writer_delegates_without_changing_content(tmp_path, monkeypatch):
    from src.web import api_common
    writer = Mock()
    monkeypatch.setattr(api_common, "write_env_file", writer)
    path = tmp_path / ".env"
    api_common._write_env_file(path, "A=value\n")
    writer.assert_called_once_with(path, "A=value\n")


@pytest.mark.parametrize("count", [0, 3])
async def test_archive_backfill_logs_zero_or_progress_and_backfills_knowledge(count):
    bot = SimpleNamespace(
        _vector_store=SimpleNamespace(backfill=AsyncMock(return_value=count)),
        sessions=SimpleNamespace(persist_dir=Path("isolated")), _embedder=object(),
        _knowledge_store=SimpleNamespace(backfill_fts=Mock(return_value=count)),
        _fts_index=object(),
    )
    await OdinBot._backfill_archives(bot)
    bot._knowledge_store.backfill_fts.assert_called_once_with()


async def test_archive_failure_does_not_escape_ready_background_work():
    bot = SimpleNamespace(
        _vector_store=SimpleNamespace(backfill=AsyncMock(side_effect=RuntimeError())),
        sessions=SimpleNamespace(persist_dir=Path("isolated")), _embedder=object(),
    )
    await OdinBot._backfill_archives(bot)


async def test_schedule_routes_report_disconnected_mutations_as_503():
    error = ScheduleConnectionUnavailableError(
        ConnectionAvailability(False, ConnectionReason.DISCONNECTED, 12)
    )
    scheduler = SimpleNamespace(
        add=AsyncMock(side_effect=error), update=AsyncMock(side_effect=error),
        run_now=AsyncMock(side_effect=error),
    )
    async with TestClient(TestServer(app_for(
        register_schedules, SimpleNamespace(scheduler=scheduler),
    ))) as client:
        responses = [
            await client.post("/api/schedules", json={"description": "test", "channel_id": "42"}),
            await client.put("/api/schedules/one", json={"paused": False}),
            await client.post("/api/schedules/one/run"),
        ]
        for response in responses:
            assert response.status == 503
            body = await response.json()
            assert body["connection"] == {
                "available": False, "reason": "disconnected", "epoch": 12,
            }


def coordinator(mode="pending", **kwargs):
    value = Mock(spec=OnboardingCoordinator)
    value.state = AsyncMock(return_value=SimpleNamespace(
        mode=SimpleNamespace(value=mode), setup_allowed=mode == "pending",
    ))
    value.submit = AsyncMock(**kwargs)
    return value


@pytest.mark.parametrize("onboarding", [None, coordinator("recovery")])
async def test_setup_missing_or_recovery_context_never_writes(onboarding):
    async with TestClient(TestServer(app_for(
        register_setup, SimpleNamespace(onboarding=onboarding),
    ))) as client:
        response = await client.post("/api/setup/complete", json={})
        assert response.status == 503


@pytest.mark.parametrize("payload", [
    {"hosts": {"": {"address": "host"}}}, {"features": []}, {"timezone": ""},
])
async def test_setup_invalid_nested_shapes_never_publish(payload):
    onboarding = coordinator()
    async with TestClient(TestServer(app_for(
        register_setup, SimpleNamespace(onboarding=onboarding),
    ))) as client:
        assert (await client.post("/api/setup/complete", json=payload)).status == 400
    onboarding.submit.assert_not_awaited()


async def test_setup_completion_race_returns_conflict():
    onboarding = coordinator(side_effect=InitializationAlreadyCompleteError("complete"))
    async with TestClient(TestServer(app_for(
        register_setup, SimpleNamespace(onboarding=onboarding),
    ))) as client:
        assert (await client.post("/api/setup/complete", json={})).status == 409


async def test_setup_gateway_failure_is_not_reported_connected():
    onboarding = coordinator(return_value=SimpleNamespace(
        gateway_attached=False, activation_detail="gateway unavailable", persisted=True,
    ))
    async with TestClient(TestServer(app_for(
        register_setup, SimpleNamespace(onboarding=onboarding),
    ))) as client:
        response = await client.post("/api/setup/complete", json={})
        assert response.status == 200
        assert (await response.json())["discord"]["state"] == "failed"


async def test_pending_status_never_exposes_operational_inventory():
    async with TestClient(TestServer(app_for(
        register_status_info, SimpleNamespace(onboarding=coordinator()),
    ))) as client:
        response = await client.get("/api/status")
        assert await response.json() == {"status": "setup_required", "mode": "pending"}


async def test_login_valid_identity_without_session_manager_fails_honestly():
    bot = SimpleNamespace(
        config=Config(discord={"token": ""}, web={"api_token": "test-web-token"}),
        api_token_manager=None,
    )
    async with TestClient(TestServer(app_for(register_auth, bot))) as client:
        response = await client.post("/api/auth/login", json={"token": "test-web-token"})
        assert response.status == 500
        assert (await response.json())["error"] == "no session manager"
