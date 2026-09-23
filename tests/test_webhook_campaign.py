"""Outbound webhook durability and delivery-origin security regressions."""

import socket
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.persistence import patch_config_paths
from src.config.schema import OutboundWebhooksConfig, set_active_config_path
from src.notifications import outbound_webhooks as hooks
from src.web.api.integrations import register_outbound_webhooks


@pytest.fixture
def no_retry(monkeypatch):
    monkeypatch.setattr(hooks, "_MAX_RETRIES", 0)


async def test_private_redirect_same_origin_signed_then_other_origin_unsigned(no_retry):
    seen = []

    async def landing(request):
        seen.append(
            (request.path, request.headers.get("X-Webhook-Signature"), await request.read())
        )
        return web.Response(text="ok")

    target_app = web.Application()
    target_app.router.add_post("/landing", landing)
    async with TestClient(TestServer(target_app)) as target:

        async def start(request):
            seen.append(
                (request.path, request.headers.get("X-Webhook-Signature"), await request.read())
            )
            return web.Response(status=307, headers={"Location": f"{target.make_url('/landing')}"})

        origin_app = web.Application()
        origin_app.router.add_post("/start", start)
        async with TestClient(TestServer(origin_app)) as origin:
            dispatcher = hooks.OutboundWebhookDispatcher(rate_limit_seconds=0)
            target_row = dispatcher.register(
                name="private", url=str(origin.make_url("/start")), secret="signing-secret"
            )
            try:
                result = await dispatcher.send_test_event(target_row.id)
                assert result.success
                assert seen[0][1].startswith("sha256=")
                assert seen[1][1] is None
                assert seen[0][2] == seen[1][2]
            finally:
                await dispatcher.close()


async def test_same_origin_307_keeps_signature_and_302_drops_post_body(no_retry):
    seen = []

    async def start(request):
        return web.Response(status=307, headers={"Location": "/same"})

    async def same(request):
        seen.append(("same", request.headers.get("X-Webhook-Signature"), await request.read()))
        return web.Response(status=302, headers={"Location": "/finish"})

    async def finish(request):
        seen.append(
            (request.method, request.headers.get("X-Webhook-Signature"), await request.read())
        )
        return web.Response(text="ok")

    app = web.Application()
    app.router.add_post("/start", start)
    app.router.add_post("/same", same)
    app.router.add_get("/finish", finish)
    async with TestClient(TestServer(app)) as server:
        dispatcher = hooks.OutboundWebhookDispatcher()
        target = dispatcher.register(
            name="signed", url=str(server.make_url("/start")), secret="secret"
        )
        try:
            result = await dispatcher.send_test_event(target.id)
            assert result.success
            assert seen[0][1].startswith("sha256=") and seen[0][2]
            assert seen[1] == ("GET", None, b"")
        finally:
            await dispatcher.close()


async def test_redirect_to_metadata_never_sent(no_retry):
    async def redirect(_request):
        return web.Response(
            status=307, headers={"Location": "http://169.254.169.254/latest/meta-data/"}
        )

    app = web.Application()
    app.router.add_post("/start", redirect)
    async with TestClient(TestServer(app)) as server:
        dispatcher = hooks.OutboundWebhookDispatcher()
        target = dispatcher.register(name="origin", url=str(server.make_url("/start")))
        try:
            result = await dispatcher.send_test_event(target.id)
            assert not result.success
            assert "metadata" in result.error.lower()
        finally:
            await dispatcher.close()


async def test_dns_rebind_is_checked_by_the_connecting_resolver(monkeypatch, no_retry):
    """The address validated is the resolver's socket destination, not prior DNS."""

    async def malicious(_self, host, port, family):
        return [
            {
                "hostname": host,
                "host": "169.254.169.254",
                "port": port,
                "family": socket.AF_INET,
                "proto": 0,
                "flags": socket.AI_NUMERICHOST,
            }
        ]

    monkeypatch.setattr(hooks, "is_metadata_url", lambda url: False)
    monkeypatch.setattr(hooks._WebhookResolver, "_inner", None, raising=False)
    from aiohttp.resolver import DefaultResolver

    monkeypatch.setattr(DefaultResolver, "resolve", malicious)
    dispatcher = hooks.OutboundWebhookDispatcher()
    target = dispatcher.register(name="dns", url="http://rebind.example.test/hook")
    try:
        result = await dispatcher.send_test_event(target.id)
        assert not result.success
        assert "metadata" in result.error.lower()
    finally:
        await dispatcher.close()


async def test_persistence_failure_leaves_runtime_unchanged(tmp_path):
    path = tmp_path / "missing.yml"
    set_active_config_path(path)
    dispatcher = hooks.OutboundWebhookDispatcher()
    bot = SimpleNamespace(
        outbound_webhook_dispatcher=dispatcher,
        config=SimpleNamespace(outbound_webhooks=OutboundWebhooksConfig(enabled=True)),
    )
    routes = web.RouteTableDef()
    register_outbound_webhooks(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    try:
        async with TestClient(TestServer(app)) as client:
            response = await client.post(
                "/api/outbound-webhooks",
                json={
                    "name": "not saved",
                    "url": "https://example.test/hook",
                    "secret": "private-secret",
                },
            )
            assert response.status == 503
            assert "private-secret" not in await response.text()
            assert dispatcher.list_webhooks() == []
            assert bot.config.outbound_webhooks.targets == []
    finally:
        set_active_config_path(None)


def test_metadata_literals_and_private_targets():
    dispatcher = hooks.OutboundWebhookDispatcher()
    for url in ("http://127.0.0.1/", "http://192.168.1.13/", "http://100.64.1.2/"):
        dispatcher.register(name="internal", url=url)
    for url in (
        "http://169.254.169.254/",
        "http://[::ffff:169.254.169.254]/",
        "http://metadata.google.internal/",
    ):
        with pytest.raises(ValueError, match="metadata"):
            dispatcher.register(name="blocked", url=url)


def test_whole_list_persistence_keeps_existing_env_signing_key(tmp_path, monkeypatch):
    monkeypatch.setenv("WEBHOOK_CAMPAIGN_SECRET", "resolved-secret")
    path = tmp_path / "config.yml"
    path.write_text(
        "outbound_webhooks:\n  targets:\n    - id: a\n"
        "      name: existing\n      url: https://example.test/hook\n"
        "      secret: ${WEBHOOK_CAMPAIGN_SECRET}\n"
    )
    patch_config_paths(
        [
            (
                ("outbound_webhooks", "targets"),
                [
                    {
                        "id": "a",
                        "name": "renamed",
                        "url": "https://example.test/hook",
                        "secret": "resolved-secret",
                        "events": [],
                        "enabled": True,
                    }
                ],
            )
        ],
        path=path,
    )
    assert "${WEBHOOK_CAMPAIGN_SECRET}" in path.read_text()
    assert "resolved-secret" not in path.read_text()


def test_legacy_target_id_preserves_placeholder_during_url_edit(tmp_path, monkeypatch):
    from uuid import NAMESPACE_URL, uuid5

    monkeypatch.setenv("WEBHOOK_CAMPAIGN_SECRET", "resolved-secret")
    path = tmp_path / "config.yml"
    path.write_text(
        "outbound_webhooks:\n  targets:\n    - name: existing\n"
        "      url: https://example.test/hook\n"
        "      secret: ${WEBHOOK_CAMPAIGN_SECRET}\n"
    )
    ident = uuid5(NAMESPACE_URL, "outbound-webhook:0:https://example.test/hook").hex[:12]
    patch_config_paths(
        [
            (
                ("outbound_webhooks", "targets"),
                [
                    {
                        "id": ident,
                        "url": "https://new.example.test/hook",
                        "secret": "resolved-secret",
                    }
                ],
            )
        ],
        path=path,
    )
    assert "${WEBHOOK_CAMPAIGN_SECRET}" in path.read_text()
    assert "resolved-secret" not in path.read_text()
