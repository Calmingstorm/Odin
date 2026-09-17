"""Listener consent must bind to a freshly supplied, current admin bearer."""

import asyncio
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.persistence import config_transaction
from src.config.schema import ApiTokenIdentity, Config
from src.health.server import (
    SessionManager,
    _make_admin_middleware,
    _make_auth_middleware,
    _make_bootstrap_gate_middleware,
)
from src.web.api.config_admin import _listener_admin_current, register_setup_wizard
from src.web.api.security import register_auth
from tests import test_listener_consent

installation = test_listener_consent.installation
CONSENT = {"expose_beyond_loopback": True}


def set_credentials(bot, *, default="", static=()):
    """Replace live static credentials without retaining stale model objects."""
    data = bot.config.model_dump()
    data["web"]["api_token"] = default
    data["web"]["api_tokens"] = [identity.model_dump() for identity in static]
    bot.config = Config(**data)


def listener_app(bot):
    routes = web.RouteTableDef()
    register_auth(routes, bot)
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


async def login(client, token):
    response = await client.post("/api/auth/login", json={"token": token})
    assert response.status == 200, await response.text()
    return (await response.json())["session_id"]


@pytest.mark.parametrize("candidate_request", [
    SimpleNamespace(_session_managed=True),
    SimpleNamespace(headers={"Authorization": "Bearer "}),
    SimpleNamespace(headers={"Authorization": "Basic placeholder"}),
])
def test_publication_recheck_refuses_noncredential_requests(candidate_request):
    assert _listener_admin_current(candidate_request, object()) is False


@pytest.mark.parametrize("tier, expected", [(None, 403), ("user", 403), ("admin", 503)])
async def test_listener_handler_fails_closed_without_identity_or_coordinator(tier, expected):
    @web.middleware
    async def identity_fixture(request, handler):
        if tier is not None:
            request._api_identity = SimpleNamespace(tier=tier)
        return await handler(request)

    routes = web.RouteTableDef()
    register_setup_wizard(routes, SimpleNamespace(onboarding=None))
    app = web.Application(middlewares=[identity_fixture])
    app.router.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.post(
            "/api/setup/listener", headers={"Authorization": "Bearer fixture-token"},
            json=CONSENT,
        )
        assert response.status == expected


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "source",
    [
        "static_collision",
        "static_api_admin_default",
        "dynamic_api_admin_default",
        "rotated_legacy_default",
        "static_admin",
        "dynamic_admin",
    ],
)
async def test_listener_consent_rejects_every_session_even_admin_or_default_spoof(
    installation, source,
):
    """The real middleware may authorize a session, but consent never may."""
    bot, store = installation
    store.complete(lambda: None)

    if source == "static_collision":
        static = ApiTokenIdentity(token="static-user", user_id="same-user", tier="user")
        set_credentials(bot, default="legacy-current", static=[static])
        dynamic = await bot.api_token_manager.create_token("same-user", tier="admin")
        token = static.token
        assert dynamic.tier == "admin"
    elif source == "static_api_admin_default":
        static = ApiTokenIdentity(
            token="static-api-admin", user_id="api-admin", tier="admin", label="default",
        )
        set_credentials(bot, default="legacy-current", static=[static])
        token = static.token
    elif source == "dynamic_api_admin_default":
        set_credentials(bot, default="legacy-current")
        dynamic = await bot.api_token_manager.create_token(
            "api-admin", tier="admin", label="default",
        )
        token = dynamic.token
    elif source == "rotated_legacy_default":
        set_credentials(bot, default="legacy-before")
        token = "legacy-before"
    elif source == "static_admin":
        static = ApiTokenIdentity(token="static-admin", user_id="static", tier="admin")
        set_credentials(bot, static=[static])
        token = static.token
    else:
        set_credentials(bot)
        token = (await bot.api_token_manager.create_token("dynamic", tier="admin")).token

    async with TestClient(TestServer(listener_app(bot))) as client:
        sid = await login(client, token)
        if source == "rotated_legacy_default":
            # A real old default session must not inherit a newer default merely
            # from public user_id/label values.
            set_credentials(bot, default="legacy-after")
        response = await client.post(
            "/api/setup/listener", headers={"Authorization": f"Bearer {sid}"}, json=CONSENT,
        )
        assert response.status == 403, await response.text()
    assert store.state().loopback_restricted


@pytest.mark.asyncio
async def test_listener_consent_does_not_promote_raw_static_user_on_dynamic_id_collision(
    installation,
):
    bot, store = installation
    store.complete(lambda: None)
    static = ApiTokenIdentity(token="static-user", user_id="shared", tier="user")
    set_credentials(bot, static=[static])
    await bot.api_token_manager.create_token("shared", tier="admin")

    async with TestClient(TestServer(listener_app(bot))) as client:
        response = await client.post(
            "/api/setup/listener", headers={"Authorization": "Bearer static-user"}, json=CONSENT,
        )
        assert response.status == 403, await response.text()
    assert store.state().loopback_restricted


@pytest.mark.asyncio
async def test_listener_consent_rejects_query_only_admin_credential(installation):
    bot, store = installation
    store.complete(lambda: None)
    set_credentials(bot, default="query-admin")

    async with TestClient(TestServer(listener_app(bot))) as client:
        response = await client.post("/api/setup/listener?token=query-admin", json=CONSENT)
        assert response.status == 403, await response.text()
    assert store.state().loopback_restricted


@pytest.mark.asyncio
@pytest.mark.parametrize("source", ["default", "static", "dynamic"])
async def test_listener_consent_accepts_fresh_raw_current_admin_bearer(installation, source):
    bot, store = installation
    store.complete(lambda: None)
    if source == "default":
        set_credentials(bot, default="fresh-default")
        token = "fresh-default"
    elif source == "static":
        static = ApiTokenIdentity(token="fresh-static", user_id="static", tier="admin")
        set_credentials(bot, static=[static])
        token = static.token
    else:
        set_credentials(bot)
        token = (await bot.api_token_manager.create_token("dynamic", tier="admin")).token

    async with TestClient(TestServer(listener_app(bot))) as client:
        response = await client.post(
            "/api/setup/listener", headers={"Authorization": f"Bearer {token}"}, json=CONSENT,
        )
        assert response.status == 200, await response.text()
    assert store.state().explicit_widening


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change", ["default_rotation", "static_rotation", "static_revocation", "dynamic_downgrade"],
)
async def test_listener_consent_reresolves_raw_bearer_after_post_middleware_change(
    installation, monkeypatch, change,
):
    """A request authenticated before publication cannot consent after revocation."""
    bot, store = installation
    store.complete(lambda: None)
    if change == "default_rotation":
        set_credentials(bot, default="default-before")
        token = "default-before"
    elif change.startswith("static"):
        static = ApiTokenIdentity(token="static-before", user_id="static", tier="admin")
        set_credentials(bot, static=[static])
        token = static.token
    else:
        set_credentials(bot)
        token = (await bot.api_token_manager.create_token("dynamic", tier="admin")).token

    entered = asyncio.Event()
    release = asyncio.Event()
    original = type(bot.onboarding).consent_listener_widening

    async def pause_before_transaction(self, *args, **kwargs):
        entered.set()
        await release.wait()
        return await original(self, *args, **kwargs)

    monkeypatch.setattr(type(bot.onboarding), "consent_listener_widening", pause_before_transaction)
    async with TestClient(TestServer(listener_app(bot))) as client:
        task = asyncio.create_task(client.post(
            "/api/setup/listener", headers={"Authorization": f"Bearer {token}"}, json=CONSENT,
        ))
        await asyncio.wait_for(entered.wait(), 2)
        if change == "dynamic_downgrade":
            await bot.api_token_manager.update_token("dynamic", tier="user")
        else:
            async with config_transaction():
                if change == "default_rotation":
                    set_credentials(bot, default="default-after")
                elif change == "static_rotation":
                    set_credentials(bot, static=[ApiTokenIdentity(
                        token="static-after", user_id="static", tier="admin",
                    )])
                else:
                    set_credentials(bot)
        release.set()
        response = await task
        assert response.status == 409, await response.text()
        error = (await response.json())["error"]
        if change == "static_revocation":
            assert "usable Web authentication" in error
        else:
            assert "no longer valid" in error
    assert store.state().loopback_restricted
