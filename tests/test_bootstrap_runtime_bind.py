"""D3 listener and setup-gate behavior exercised through aiohttp."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from aiohttp.test_utils import TestClient, TestServer

from src.config.environment import EnvironmentSource
from src.config.initialization import InitializationStore, InstallationBinding
from src.config.schema import WebConfig
from src.health.server import HealthServer
from src.permissions.token_manager import ApiTokenManager
from src.web.onboarding import OnboardingCoordinator


def _context(
    tmp_path: Path, *, complete: bool = False, loopback_restricted: bool = True
) -> OnboardingCoordinator:
    config_path = tmp_path / "config.yml"
    config_path.write_text("web: {}\n")
    store = InitializationStore(
        tmp_path / "initialization.json", InstallationBinding("test-install", config_path)
    )
    store.provision_fresh()
    if complete:
        store.complete(lambda: None)
    store.set_bind_decision(
        loopback_restricted=loopback_restricted,
        explicit_widening=False,
    )
    return OnboardingCoordinator(store, EnvironmentSource(tmp_path / "environment"), True)


@pytest.mark.asyncio
async def test_real_listener_binds_numeric_loopback_when_unauthenticated(tmp_path: Path) -> None:
    server = HealthServer(port=0, web_config=WebConfig(host="0.0.0.0"))
    server.attach_onboarding(_context(tmp_path))
    await server.start()
    try:
        assert server._listener_sockets[0].getsockname()[0] == "127.0.0.1"
    finally:
        await server.stop()


@pytest.mark.asyncio
async def test_detailed_health_reports_configured_and_effective_listener(tmp_path: Path) -> None:
    server = HealthServer(port=0, web_config=WebConfig(host="0.0.0.0"))
    server.attach_onboarding(_context(tmp_path, complete=True))
    server.set_ready()
    await server.start()
    try:
        async with TestClient(TestServer(server._app)) as client:
            response = await client.get("/health?detail=1")
            payload = await response.json()
        listener = payload["listener"]
        assert listener["configured_host"] == "0.0.0.0"
        assert listener["effective_host"] == "127.0.0.1"
        assert listener["listening_hosts"] == ["127.0.0.1"]
        assert listener["listening_ports"] == [server._listener_sockets[0].getsockname()[1]]
        assert "token" not in repr(payload).lower()
    finally:
        await server.stop()


def test_set_bot_preserves_attached_onboarding_until_real_coordinator_exists(
    tmp_path: Path,
) -> None:
    server = HealthServer(port=0, web_config=WebConfig(enabled=False))
    attached = _context(tmp_path)
    server.attach_onboarding(attached)
    bot = MagicMock()
    bot.onboarding = MagicMock()

    server.set_bot(bot)

    assert server._initialization_store is attached.initialization_store
    assert server._app["onboarding"] is attached


def test_set_bot_attaches_real_onboarding_coordinator(tmp_path: Path) -> None:
    server = HealthServer(port=0, web_config=WebConfig(enabled=False))
    onboarding = _context(tmp_path)
    bot = SimpleNamespace(onboarding=onboarding)

    server.set_bot(bot)

    assert server._initialization_store is onboarding.initialization_store
    assert server._app["onboarding"] is onboarding


@pytest.mark.asyncio
async def test_real_listener_preserves_wildcard_with_static_auth(tmp_path: Path) -> None:
    server = HealthServer(port=0, web_config=WebConfig(host="0.0.0.0", api_token="token"))
    server.attach_onboarding(_context(tmp_path, complete=True, loopback_restricted=False))
    await server.start()
    try:
        assert server._listener_sockets[0].getsockname()[0] == "0.0.0.0"
    finally:
        await server.stop()


@pytest.mark.asyncio
async def test_persisted_restriction_survives_auth_added_on_restart(tmp_path: Path) -> None:
    context = _context(tmp_path, complete=True)
    first = HealthServer(port=0, web_config=WebConfig(host="0.0.0.0"))
    first.attach_onboarding(context)
    await first.start()
    await first.stop()
    second = HealthServer(port=0, web_config=WebConfig(host="0.0.0.0", api_token="token"))
    second.attach_onboarding(context)
    await second.start()
    try:
        assert second._listener_sockets[0].getsockname()[0] == "127.0.0.1"
    finally:
        await second.stop()


@pytest.mark.asyncio
async def test_pending_setup_gate_has_head_health_and_rejects_traversal(tmp_path: Path) -> None:
    server = HealthServer(web_config=WebConfig())
    server.attach_onboarding(_context(tmp_path))
    async with TestClient(TestServer(server._app)) as client:
        assert (await client.head("/health/live")).status == 200
        assert (await client.get("/metrics")).status == 403
        assert (await client.post("/api/auth/login", json={})).status != 403
        assert (await client.post("/api/codex/device-code")).status != 403
        assert (await client.get("/ui/../../config.yml")).status == 403


@pytest.mark.asyncio
async def test_malformed_store_is_not_usable_and_last_delete_is_guarded(
    tmp_path: Path,
) -> None:
    path = tmp_path / "tokens.json"
    path.write_text("{ malformed")
    malformed = ApiTokenManager(str(path))
    assert malformed.credential_store_status == "malformed"
    assert malformed.credential_inventory.dynamic_usable == 0

    manager = ApiTokenManager(str(tmp_path / "valid.json"))
    await manager.create_token("only")
    manager.set_last_credential_guard(lambda _candidate: False)
    with pytest.raises(PermissionError, match="last usable credential"):
        await manager.delete_token("only")


@pytest.mark.asyncio
async def test_dynamic_last_credential_delete_refused_on_live_broad_listener(
    tmp_path: Path,
) -> None:
    context = _context(tmp_path, complete=True, loopback_restricted=False)
    manager = ApiTokenManager(str(tmp_path / "dynamic.json"))
    await manager.create_token("only")
    server = HealthServer(port=0, web_config=WebConfig(host="0.0.0.0"))
    server.attach_onboarding(context)
    server._app["token_manager"] = manager
    manager.set_last_credential_guard(server.may_remove_dynamic_credential)
    await server.start()
    try:
        assert server._listener_sockets[0].getsockname()[0] == "0.0.0.0"
        with pytest.raises(PermissionError, match="last usable credential"):
            await manager.delete_token("only")
    finally:
        await server.stop()
