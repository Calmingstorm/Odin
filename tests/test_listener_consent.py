"""Listener widening requires explicit, authenticated consent and durable auth."""

from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.environment import EnvironmentSource
from src.config.initialization import InitializationStore, InstallationBinding
from src.config.persistence import config_transaction
from src.config.schema import Config
from src.health.server import (
    SessionManager,
    _make_admin_middleware,
    _make_auth_middleware,
    _make_bootstrap_gate_middleware,
)
from src.permissions.token_manager import ApiTokenManager
from src.web.api.config_admin import register_setup_wizard
from src.web.bootstrap_policy import CredentialInventory, decide_bind
from src.web.onboarding import OnboardingCoordinator, OnboardingError


@pytest.fixture
def installation(tmp_path):
    config = Config(discord={"token": ""},
                    web={"host": "0.0.0.0", "api_token": "admin-test-secret"})
    path = tmp_path / "config.yml"
    store = InitializationStore(tmp_path / "state.json", InstallationBinding("consent", path))
    store.provision_fresh()
    coordinator = OnboardingCoordinator(store, EnvironmentSource(tmp_path / "env"), True)
    manager = ApiTokenManager(str(tmp_path / "tokens.json"))
    bot = SimpleNamespace(config=config, onboarding=coordinator, api_token_manager=manager)
    return bot, store


def app_for(bot):
    routes = web.RouteTableDef()
    register_setup_wizard(routes, bot)
    sessions = SessionManager(timeout_minutes=5)
    app = web.Application(middlewares=[
        _make_bootstrap_gate_middleware(),
        _make_auth_middleware(lambda: bot.config.web, sessions),
        _make_admin_middleware(lambda: bot.config.web),
    ])
    app["onboarding"] = bot.onboarding
    app["token_manager"] = bot.api_token_manager
    app["session_manager"] = sessions
    app.router.add_routes(routes)
    return app


ADMIN = {"Authorization": "Bearer admin-test-secret"}
CONSENT = {"expose_beyond_loopback": True}


@pytest.mark.asyncio
async def test_pending_and_recovery_do_not_allow_listener_or_operational_status(installation):
    bot, store = installation
    async with TestClient(TestServer(app_for(bot))) as client:
        for state in ("pending", "recovery"):
            if state == "recovery":
                store.path.write_text("invalid")
            response = await client.post("/api/setup/listener", headers=ADMIN, json=CONSENT)
            assert response.status == 403
            assert (await client.get("/api/status", headers=ADMIN)).status == 403
            response = await client.get("/api/setup/status", headers=ADMIN)
            assert response.status == 200
            assert (await response.json())["mode"] == state


@pytest.mark.asyncio
async def test_authenticated_admin_consent_persists_and_startup_can_honor_it(installation):
    bot, store = installation
    store.complete(lambda: None)
    async with TestClient(TestServer(app_for(bot))) as client:
        assert (await client.post("/api/setup/listener", json=CONSENT)).status == 401
        response = await client.post("/api/setup/listener", headers=ADMIN, json=CONSENT)
        assert response.status == 200
        body = await response.json()
        assert body["persisted"] and body["explicit_widening"]
        assert body["restart_required"] == ["web.listener"]
        assert "running listener is unchanged" in body["message"]
        assert body["configured_host"] == "0.0.0.0"
        assert (await client.post("/api/setup/listener", headers=ADMIN, json=CONSENT)).status == 200
    reopened = InitializationStore(store.path, store.binding).state()
    assert not reopened.loopback_restricted and reopened.explicit_widening
    for credentials, expected in [(CredentialInventory(static_usable=1), "0.0.0.0"),
                                  (CredentialInventory(), "127.0.0.1")]:
        assert decide_bind(
            configured_host=bot.config.web.host, credentials=credentials,
            persisted_restriction=reopened.loopback_restricted,
            explicit_widening=reopened.explicit_widening,
        ).effective_host == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [{}, {"expose_beyond_loopback": False},
                                    {"expose_beyond_loopback": 1},
                                    {"expose_beyond_loopback": "true"}, [], None,
                                    {"expose_beyond_loopback": True, "host": "0.0.0.0"}])
async def test_exact_explicit_consent_required(installation, payload):
    bot, store = installation
    store.complete(lambda: None)
    async with TestClient(TestServer(app_for(bot))) as client:
        response = await client.post("/api/setup/listener", headers=ADMIN, json=payload)
        assert response.status == 400
    assert store.state().loopback_restricted


@pytest.mark.asyncio
async def test_tokenless_and_nonadmin_cannot_consent(installation):
    bot, store = installation
    store.complete(lambda: None)
    bot.config.web.api_token = ""
    async with TestClient(TestServer(app_for(bot))) as client:
        assert (await client.post("/api/setup/listener", json=CONSENT)).status == 403
    config_data = bot.config.model_dump()
    config_data["web"]["api_tokens"] = [
        {"token": "user-secret", "user_id": "u", "tier": "user"},
    ]
    bot.config = Config(**config_data)
    async with TestClient(TestServer(app_for(bot))) as client:
        response = await client.post("/api/setup/listener", json=CONSENT,
                                     headers={"Authorization": "Bearer user-secret"})
        assert response.status == 403
    assert store.state().loopback_restricted


@pytest.mark.asyncio
async def test_unusable_or_malformed_credentials_refused_under_transaction(installation):
    bot, store = installation
    store.complete(lambda: None)
    bot.config.web.api_token = "${MISSING_SECRET}"
    with pytest.raises(OnboardingError, match="usable Web authentication"):
        await bot.onboarding.consent_listener_widening(bot)
    bot.config.web.api_token = "admin-test-secret"
    bot.api_token_manager._path.write_text("[invalid")
    bot.api_token_manager = ApiTokenManager(str(bot.api_token_manager._path))
    with pytest.raises(OnboardingError, match="repair the Web credential store"):
        await bot.onboarding.consent_listener_widening(bot)
    assert store.state().loopback_restricted


@pytest.mark.asyncio
async def test_consent_serializes_with_credential_removal(installation):
    import asyncio

    bot, store = installation
    store.complete(lambda: None)
    async with config_transaction():
        task = asyncio.create_task(bot.onboarding.consent_listener_widening(bot))
        await asyncio.sleep(0)
        assert not task.done()
        bot.config.web.api_token = ""
    with pytest.raises(OnboardingError, match="usable Web authentication"):
        await task
    assert store.state().loopback_restricted


@pytest.mark.asyncio
async def test_authority_rechecked_after_waiting_for_config_transaction(installation, monkeypatch):
    import asyncio

    bot, store = installation
    store.complete(lambda: None)
    entered = asyncio.Event()
    original = OnboardingCoordinator.consent_listener_widening

    async def observe_entry(self, *args, **kwargs):
        entered.set()
        return await original(self, *args, **kwargs)

    monkeypatch.setattr(OnboardingCoordinator, "consent_listener_widening", observe_entry)
    async with TestClient(TestServer(app_for(bot))) as client:
        async with config_transaction():
            task = asyncio.create_task(client.post(
                "/api/setup/listener", json=CONSENT, headers=ADMIN,
            ))
            await asyncio.wait_for(entered.wait(), 2)
            # Still has usable auth, but this request's credential was revoked.
            bot.config.web.api_token = "replacement-admin-secret"
        response = await task
        assert response.status == 409
        assert "no longer valid" in (await response.json())["error"]
    assert store.state().loopback_restricted


@pytest.mark.asyncio
async def test_failed_persistence_does_not_claim_success(installation, monkeypatch):
    bot, store = installation
    store.complete(lambda: None)

    def fail(**_kwargs):
        raise OSError("synthetic fsync failure")

    monkeypatch.setattr(store, "set_bind_decision", fail)
    async with TestClient(TestServer(app_for(bot))) as client:
        response = await client.post("/api/setup/listener", json=CONSENT, headers=ADMIN)
        assert response.status == 409
        assert "durability could not be confirmed" in (await response.json())["error"]
    assert store.state().loopback_restricted


@pytest.mark.asyncio
async def test_legacy_restricted_install_accepts_dynamic_admin_consent(installation, tmp_path):
    bot, previous = installation
    store = InitializationStore(tmp_path / "legacy.json", previous.binding)
    bot.onboarding = OnboardingCoordinator(store, EnvironmentSource(tmp_path / "env"), True)
    bot.config.web.api_token = ""
    identity = await bot.api_token_manager.create_token(user_id="admin", tier="admin")
    assert (await bot.onboarding.state()).loopback_restricted
    async with TestClient(TestServer(app_for(bot))) as client:
        response = await client.post("/api/setup/listener", json=CONSENT,
                                     headers={"Authorization": f"Bearer {identity.token}"})
        assert response.status == 200
    assert store.state().explicit_widening
