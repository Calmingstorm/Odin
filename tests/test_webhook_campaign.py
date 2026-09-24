"""Outbound webhook durability and delivery-origin security regressions."""

import ipaddress
import socket
from types import SimpleNamespace
from urllib.parse import urlparse

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


@pytest.fixture
def loopback_connections_only(monkeypatch):
    """A webhook regression must never open a socket to an external address."""
    connect = socket.socket.connect

    def guarded_connect(sock, address):
        if sock.family in (socket.AF_INET, socket.AF_INET6):
            assert ipaddress.ip_address(address[0]).is_loopback, address[0]
        return connect(sock, address)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)


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


async def test_cross_origin_redirect_strips_basic_authorization(
    no_retry, loopback_connections_only
):
    seen = []
    async def landing(request):
        seen.append(request.headers.get("Authorization"))
        return web.Response(text="ok")

    target_app = web.Application()
    target_app.router.add_post("/landing", landing)
    async with TestClient(TestServer(target_app)) as target:
        async def start(request):
            seen.append(request.headers.get("Authorization"))
            return web.Response(status=307, headers={"Location": str(target.make_url("/landing"))})

        origin_app = web.Application()
        origin_app.router.add_post("/start", start)
        async with TestClient(TestServer(origin_app)) as origin:
            parsed = urlparse(str(origin.make_url("/start")))
            basic_url = parsed._replace(netloc="user:pass@" + parsed.netloc).geturl()
            dispatcher = hooks.OutboundWebhookDispatcher(rate_limit_seconds=0)
            row = dispatcher.register(name="basic", url=basic_url)
            try:
                assert (await dispatcher.send_test_event(row.id)).success
                assert seen == ["Basic dXNlcjpwYXNz", None]
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


async def test_redirect_to_metadata_never_sent(no_retry, loopback_connections_only):
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


async def test_dns_rebind_is_checked_by_the_connecting_resolver(
    monkeypatch,
    no_retry,
    loopback_connections_only,
):
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

    monkeypatch.setattr(hooks, "is_metadata_url", lambda url, **kwargs: False)
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


async def test_crud_keeps_unregistered_configured_target(tmp_path):
    path = tmp_path / "config.yml"
    path.write_text(
        "outbound_webhooks:\n  enabled: true\n  targets:\n"
        "    - id: bad\n      name: typo\n      url: https://example.test/hook\n"
        "      events: [all]\n"
        "    - id: good\n      name: valid\n      url: https://good.example.test/hook\n"
    )
    from src.config.schema import OutboundWebhookTarget

    config = SimpleNamespace(
        outbound_webhooks=OutboundWebhooksConfig(
            enabled=True,
            targets=[
                OutboundWebhookTarget(id="bad", name="bad", url="http://169.254.169.254/"),
                OutboundWebhookTarget(
                    id="good", name="valid", url="https://good.example.test/hook"
                ),
            ],
        )
    )
    dispatcher = hooks.OutboundWebhookDispatcher()
    dispatcher.register(name="valid", url="https://good.example.test/hook", webhook_id="good")
    bot = SimpleNamespace(outbound_webhook_dispatcher=dispatcher, config=config)
    set_active_config_path(path)
    routes = web.RouteTableDef()
    register_outbound_webhooks(routes, bot)
    app = web.Application()
    app.add_routes(routes)
    try:
        async with TestClient(TestServer(app)) as client:
            response = await client.put("/api/outbound-webhooks/good", json={"name": "renamed"})
            assert response.status == 200
        saved = __import__("yaml").safe_load(path.read_text())
        assert saved["outbound_webhooks"]["targets"][0]["id"] == "bad"
        # The file is desired state, including edits made since startup.
        assert saved["outbound_webhooks"]["targets"][0]["url"] == "https://example.test/hook"
    finally:
        set_active_config_path(None)


async def test_webhook_persistence_preserves_yaml_comments_and_env_leaves(tmp_path, monkeypatch):
    monkeypatch.setenv("CAMPAIGN_WEBHOOK_SECRET", "resolved-value")
    path = tmp_path / "config.yml"
    path.write_text(
        "# outside targets stays\noutbound_webhooks:\n  targets:\n"
        "    - id: keep # entry comment\n      name: before\n"
        "      url: https://example.test/hook\n"
        "      secret: ${CAMPAIGN_WEBHOOK_SECRET} # don't expose\n"
        "      events: [all] # flow style\n# next section note\nnext: true\n"
    )
    from src.config.persistence import patch_config_paths

    patch_config_paths(
        [
            (
                ("outbound_webhooks", "targets"),
                [
                    {
                        "id": "keep",
                        "name": "after",
                        "url": "https://example.test/hook",
                        "secret": "resolved-value",
                        "events": ["all"],
                        "enabled": True,
                        "scrub_secrets": True,
                        "verify_ssl": True,
                        "created_at": "now",
                    }
                ],
            )
        ],
        path=path,
    )
    text = path.read_text()
    assert "# outside targets stays" in text and "# next section note" in text
    assert "# entry comment" in text and "# don't expose" in text and "# flow style" in text
    assert "${CAMPAIGN_WEBHOOK_SECRET}" in text and "resolved-value" not in text


def test_metadata_literals_and_private_targets():
    dispatcher = hooks.OutboundWebhookDispatcher()
    for url in ("http://127.0.0.1/", "http://192.168.1.13/", "http://100.64.1.2/"):
        dispatcher.register(name="internal", url=url)
    for url in (
        "http://169.254.169.254/",
        "http://169.254.169.254./",
        "http://[fe80::a9fe:a9fe%25eth0]/",
        "http://[fd20:ce::254%25eth0]/",
        "http://169.254.169.254%25eth0/",
        "http://[::ffff:169.254.169.254]/",
        "http://169.254.170.2/",
        "http://100.100.100.200/",
        "http://[fd20:ce::254]/",
        "http://169.254.10.20/",
        "http://[fe80::a9fe:a9fe]/",
        "http://[::ffff:100.100.100.200]/",
        "http://[::ffff:6464:64c8]/",
        "http://[fd20:00ce:0000:0000:0000:0000:0000:0254]/",
        "http://2852039166/",
        "http://169.16689662/",
        "http://metadata.google.internal/",
    ):
        with pytest.raises(ValueError, match="metadata"):
            dispatcher.register(name="blocked", url=url)


def test_basic_auth_is_allowed_for_configured_target_and_redirect_auth_is_rejected():
    target = hooks.OutboundWebhookDispatcher().register(
        name="basic", url="https://user:pass@example.test/hook"
    )
    assert target.url == "https://user:pass@example.test/hook"
    with pytest.raises(ValueError):
        hooks._validate_webhook_url("https://user:pass@example.test/hook", redirect=True)


@pytest.mark.parametrize(
    "address",
    ["::ffff:100.100.100.200", "::ffff:6464:64c8", "fd20:00ce:0:0:0:0:0:0254"],
)
async def test_webhook_resolver_rejects_metadata_ipv6_spellings(address):
    class Inner:
        async def resolve(self, host, port, family):
            return [{"host": address}]

    resolver = hooks._WebhookResolver()
    resolver._inner = Inner()
    with pytest.raises(hooks.BlockedAddressError):
        await resolver.resolve("attacker.test")


@pytest.mark.parametrize("location", ["/next", "http://user:pass@127.0.0.1/next"])
async def test_basic_auth_same_origin_redirect_preserves_auth_and_rejects_header_userinfo(
    location, no_retry, loopback_connections_only
):
    seen = []

    async def start(request):
        seen.append(request.headers.get("Authorization"))
        return web.Response(status=307, headers={"Location": location})

    async def next_page(request):
        seen.append(request.headers.get("Authorization"))
        return web.Response(text="ok")

    app = web.Application()
    app.router.add_post("/start", start)
    app.router.add_post("/next", next_page)
    async with TestClient(TestServer(app)) as server:
        base = str(server.make_url("/start"))
        parsed = hooks.urlparse(base)
        target_url = parsed._replace(netloc="user:pass@" + parsed.netloc).geturl()
        dispatcher = hooks.OutboundWebhookDispatcher()
        target = dispatcher.register(name="basic", url=target_url)
        try:
            result = await dispatcher.send_test_event(target.id)
            if location.startswith("http://user"):
                assert not result.success
                assert seen[0] is not None and len(seen) == 1
            else:
                assert result.success
                assert seen == ["Basic dXNlcjpwYXNz", "Basic dXNlcjpwYXNz"]
        finally:
            await dispatcher.close()


def test_webhook_send_policy_skips_synchronous_dns(monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError("send-time validation must not resolve DNS synchronously")

    monkeypatch.setattr(hooks.socket, "getaddrinfo", fail)
    target = hooks.OutboundWebhookDispatcher().register(
        name="dns-free", url="https://example.test/hook"
    )
    assert target.url


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
