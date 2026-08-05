"""Tests for web-security / SSRF reliability fixes (PR5).

Covers:
- admin-only prefix enforcement (centralized control-plane gate)
- _is_admin_only_path matching
- _client_ip honors X-Forwarded-For only from trusted proxies
- config redaction is substring-aware (hmac_key, webhook urls, *_secret)
- SSRF: http_probe blocks cloud-metadata but allows internal probes;
  is_metadata_url vs is_url_blocked scoping
- context loader tolerates bad encoding and caps size
"""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest
from aiohttp import web

from src.context.loader import MAX_CONTEXT_FILE_BYTES, ContextLoader
from src.health.server import _client_ip, _is_admin_only_path
from src.tools.http_probe_ops import build_http_probe_command, validate_url
from src.tools.url_safety import is_metadata_url, is_url_blocked
from src.web.api import _is_sensitive_key, _redact_config

# ---------------------------------------------------------------------------
# Admin-only path matching
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("path", [
    "/api/permissions/user/42",
    "/api/host-access/default-policy",
    "/api/config",
    "/api/update/apply",
    "/api/llm/switch",
    "/api/codex/account/0/activate",
    "/api/skills",
    "/api/tokens",
    "/api/mcp/servers",
])
def test_admin_only_paths_matched(path):
    assert _is_admin_only_path(path) is True


@pytest.mark.parametrize("path", [
    "/api/chat",
    "/api/execute",
    "/api/sessions/123",
    "/api/loops",
    "/api/schedules",
    "/api/status",
    "/api/configuration-notes",  # must NOT match /api/config by accident
])
def test_non_admin_paths_not_matched(path):
    assert _is_admin_only_path(path) is False


def test_admin_prefix_exact_and_subpath():
    # exact prefix and subpaths both match; a longer unrelated name does not
    assert _is_admin_only_path("/api/llm")
    assert _is_admin_only_path("/api/llm/status")
    assert not _is_admin_only_path("/api/llmfoo")


# ---------------------------------------------------------------------------
# Client IP resolution (X-Forwarded-For only from trusted proxies)
# ---------------------------------------------------------------------------

def _req(remote, xff=None):
    headers = {}
    if xff is not None:
        headers["X-Forwarded-For"] = xff
    return SimpleNamespace(remote=remote, headers=headers)


def test_client_ip_ignores_xff_from_untrusted_peer():
    req = _req("203.0.113.9", xff="10.0.0.1")
    assert _client_ip(req, trusted_proxies=()) == "203.0.113.9"
    assert _client_ip(req, trusted_proxies=("192.168.1.1",)) == "203.0.113.9"


def test_client_ip_uses_xff_from_trusted_proxy():
    req = _req("192.168.1.1", xff="198.51.100.7, 192.168.1.1")
    assert _client_ip(req, trusted_proxies=("192.168.1.1",)) == "198.51.100.7"


def test_client_ip_falls_back_when_no_xff():
    req = _req("192.168.1.1")
    assert _client_ip(req, trusted_proxies=("192.168.1.1",)) == "192.168.1.1"


# ---------------------------------------------------------------------------
# Config redaction
# ---------------------------------------------------------------------------

def test_redaction_covers_hmac_and_webhook_and_secret():
    cfg = {
        "audit": {"hmac_key": "supersecretkey"},
        "slack": {"webhook_url": "https://hooks.slack.com/T/abc"},
        "some_secret": "s3cr3t",
        "app_password": "pw",
        "nested": {"api_token": "tok"},
        "plain": "visible",
    }
    red = _redact_config(cfg)
    assert red["audit"]["hmac_key"] == "••••••••"
    assert red["slack"]["webhook_url"] == "••••••••"
    assert red["some_secret"] == "••••••••"
    assert red["app_password"] == "••••••••"
    assert red["nested"]["api_token"] == "••••••••"
    assert red["plain"] == "visible"  # non-sensitive untouched


def test_is_sensitive_key_substring():
    assert _is_sensitive_key("hmac_key")
    assert _is_sensitive_key("gitea_webhook_url")
    assert _is_sensitive_key("db_password")
    assert not _is_sensitive_key("hostname")
    assert not _is_sensitive_key("max_tokens")
    assert not _is_sensitive_key("scrub_secrets")


def test_redaction_leaves_empty_values():
    # Empty sensitive values aren't masked (nothing to hide, keeps UI honest).
    red = _redact_config({"api_token": ""})
    assert red["api_token"] == ""


# ---------------------------------------------------------------------------
# Credential CONTAINERS — child keys are named by the operator
# ---------------------------------------------------------------------------

def test_operator_named_container_children_are_masked():
    """An HTTP header is called "Authorization" and a webhook map is keyed by
    nickname. Neither name looks like a credential, so per-key matching served
    both values verbatim from GET /api/config."""
    red = _redact_config({
        "mcp": {"servers": {"ops": {
            "transport": "stdio",
            "headers": {"Authorization": "Bearer REAL"},
            "env": {"MY_PASSPHRASE": "REAL-ENV"},
        }}},
        "slack": {"webhook_urls": {"ops": "https://hooks.slack.com/REAL"}},
    })
    servers = red["mcp"]["servers"]["ops"]
    assert servers["headers"]["Authorization"] == "••••••••"
    assert servers["env"]["MY_PASSPHRASE"] == "••••••••"
    assert red["slack"]["webhook_urls"]["ops"] == "••••••••"


def test_container_masking_keeps_shape():
    """Masking the whole subtree would hide which servers and headers exist,
    which the page needs in order to manage them."""
    red = _redact_config({
        "mcp": {"servers": {"ops": {
            "transport": "stdio", "headers": {"Authorization": "x"},
        }}},
    })
    assert red["mcp"]["servers"]["ops"]["transport"] == "stdio"
    assert list(red["mcp"]["servers"]["ops"]["headers"]) == ["Authorization"]


def test_empty_container_values_are_left_alone():
    red = _redact_config({"mcp": {"servers": {"a": {"headers": {"X": ""}}}}})
    assert red["mcp"]["servers"]["a"]["headers"]["X"] == ""


# ---------------------------------------------------------------------------
# Write fence
# ---------------------------------------------------------------------------

def test_blocked_fields_are_found_inside_lists():
    """Descending only into dicts left every credential in a list unfenced,
    even though both key names were on the blocked list."""
    from src.web.api_common import _SENSITIVE_FIELDS, _contains_blocked_fields

    assert _contains_blocked_fields(
        {"web": {"api_tokens": [{"token": "x"}]}}, _SENSITIVE_FIELDS
    )
    assert _contains_blocked_fields(
        {"outbound_webhooks": {"targets": [{"secret": "x"}]}}, _SENSITIVE_FIELDS
    )
    assert not _contains_blocked_fields(
        {"discord": {"channels": [1, 2, 3]}}, _SENSITIVE_FIELDS
    )


def test_container_masking_handles_lists_and_runaway_nesting():
    """A container can hold a list of records, and a hostile body can nest
    deeper than the walk should follow."""
    from src.web.api_common import _mask_subtree

    assert _mask_subtree({"a": [{"b": "x"}, "y"]}) == {"a": [{"b": "••••••••"}, "••••••••"]}
    deep: dict = {}
    node = deep
    for _ in range(15):
        node["n"] = {}
        node = node["n"]
    assert "..." in repr(_mask_subtree(deep))


def test_blocked_field_scan_stops_at_a_depth_limit():
    from src.web.api_common import _SENSITIVE_FIELDS, _contains_blocked_fields

    deep: dict = {}
    node = deep
    for _ in range(15):
        node["n"] = {}
        node = node["n"]
    node["token"] = "x"
    assert _contains_blocked_fields(deep, _SENSITIVE_FIELDS) is False


def test_mask_scan_stops_at_a_depth_limit():
    from src.web.api_common import contains_redaction_mask

    deep: dict = {}
    node = deep
    for _ in range(15):
        node["n"] = {}
        node = node["n"]
    node["x"] = "••••••••"
    assert contains_redaction_mask(deep) is False


class TestRedactionMaskMiddleware:
    """The mask is refused for EVERY route, not the ones someone remembered.

    Guarding handlers one at a time failed twice: the generic config save was
    fenced while the dedicated provider routes still installed the sentinel as
    the live API key, and fencing those still left MCP headers and
    outbound-webhook secrets. Nine route modules accept secret-bearing bodies.
    Enumerating them is how the hole reopens, so the fence lives in middleware.
    """

    MASK = "•" * 8

    @staticmethod
    async def _client(handler_spy):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer

        from src.health.server import _make_redaction_mask_middleware

        async def handler(request):
            handler_spy.append(request.path)
            return web.json_response({"ok": True})

        app = web.Application(middlewares=[_make_redaction_mask_middleware()])
        for route in (
            "/api/mcp/servers", "/api/outbound-webhooks",
            "/api/llm/kimi/config", "/api/config", "/api/skills",
        ):
            app.router.add_post(route, handler)
        app.router.add_get("/api/config", handler)
        return TestClient(TestServer(app))

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("route", "body"),
        [
            ("/api/mcp/servers", {"headers": {"Authorization": "MASK"}}),
            ("/api/outbound-webhooks", {"secret": "MASK"}),
            ("/api/llm/kimi/config", {"api_key": "MASK"}),
            ("/api/config", {"slack": {"default_webhook_url": "MASK"}}),
            ("/api/skills", {"nested": [{"deep": {"token": "MASK"}}]}),
        ],
    )
    async def test_a_masked_body_never_reaches_the_handler(self, route, body):
        import json as _json

        reached: list[str] = []
        filled = _json.loads(_json.dumps(body).replace("MASK", self.MASK))
        async with await self._client(reached) as c:
            resp = await c.post(route, json=filled)
        assert resp.status == 400
        assert reached == [], f"{route} ran its handler on a masked body"

    @pytest.mark.asyncio
    async def test_real_values_are_untouched(self):
        reached: list[str] = []
        async with await self._client(reached) as c:
            assert (await c.post(
                "/api/llm/kimi/config", json={"api_key": "REAL"}
            )).status == 200
            assert (await c.post(
                "/api/config", json={"discord": {"require_mention": True}}
            )).status == 200
        assert len(reached) == 2

    @pytest.mark.asyncio
    async def test_reads_and_malformed_bodies_are_not_inspected(self):
        """A GET carries no body, and malformed input is the handler's to
        report — the fence must reject only a parsed JSON mask."""
        reached: list[str] = []
        async with await self._client(reached) as c:
            assert (await c.get("/api/config")).status == 200
            resp = await c.post("/api/config", data=self.MASK)
        assert resp.status == 200
        assert len(reached) == 2

    @pytest.mark.asyncio
    @pytest.mark.parametrize("content_type", ["text/plain", "application/octet-stream"])
    async def test_valid_json_cannot_bypass_with_a_false_content_type(self, content_type):
        """aiohttp request.json() ignores Content-Type, so the middleware must
        parse on the same terms as the handler or the literal mask reaches it."""
        reached: list[str] = []
        async with await self._client(reached) as c:
            resp = await c.post(
                "/api/llm/kimi/config",
                data=json.dumps({"api_key": self.MASK}),
                headers={"Content-Type": content_type},
            )
        assert resp.status == 400
        assert reached == []

    @pytest.mark.asyncio
    async def test_real_server_chain_fences_valid_json_with_false_content_type(self):
        """The installed middleware, not just a test-built copy, must block the
        Content-Type bypass before an actual API handler can consume it."""
        from unittest.mock import AsyncMock, MagicMock

        from aiohttp.test_utils import TestClient, TestServer

        from src.config.schema import Config, WebConfig
        from src.health.server import HealthServer
        from src.web.api.llm_admin import register_provider_config

        server = HealthServer(
            port=0, web_config=WebConfig(enabled=False, api_token="")
        )
        bot = SimpleNamespace()

        bot.config = Config(discord={"token": "fake"})
        bot.config.kimi.api_key = "ORIGINAL"
        bot.llm_gateway = MagicMock()
        bot.llm_gateway.provider_lock = asyncio.Lock()
        bot.llm_gateway.reload_kimi_inner = AsyncMock(
            return_value={"configured": True}
        )
        bot.llm_gateway.run_persist_settled = AsyncMock(return_value=(None, False))
        routes = web.RouteTableDef()
        register_provider_config(routes, bot)
        server._app.router.add_routes(routes)
        async with TestClient(TestServer(server._app)) as client:
            response = await client.put(
                "/api/llm/kimi/config",
                data=json.dumps({"api_key": self.MASK}),
                headers={"Content-Type": "text/plain"},
            )
        assert response.status == 400
        assert bot.config.kimi.api_key == "ORIGINAL"
        bot.llm_gateway.reload_kimi_inner.assert_not_awaited()

    @pytest.mark.parametrize("with_auth", [True, False])
    def test_the_fence_is_actually_installed_on_the_real_server(self, with_auth):
        """Building the middleware proves it works; this proves it RUNS.

        Without this, deleting the append() line leaves every test above green
        while the fence protects nothing — the failure mode is silence.
        It sits outside the auth block on purpose: the mask is never valid
        input, tokens configured or not.
        """
        from src.config.schema import WebConfig
        from src.health.server import HealthServer

        server = HealthServer(
            port=0,
            web_config=WebConfig(
                enabled=True, api_token="tok" if with_auth else ""
            ),
        )
        names = [getattr(m, "__name__", "") for m in server._app.middlewares]
        assert "redaction_mask_middleware" in names, names

    @pytest.mark.asyncio
    async def test_malformed_json_is_left_to_the_handler(self):
        reached: list[str] = []
        async with await self._client(reached) as c:
            resp = await c.post(
                "/api/config", data="{not json",
                headers={"Content-Type": "application/json"},
            )
        assert resp.status == 200
        assert reached == ["/api/config"]


def test_the_redaction_mask_is_refused_as_input():
    """A page that renders a masked secret as an editable control sends the
    mask back on save. Accepting it writes eight bullets over the credential."""
    from src.web.api_common import contains_redaction_mask

    assert contains_redaction_mask({"slack": {"default_webhook_url": "••••••••"}})
    assert contains_redaction_mask({"web": {"api_tokens": [{"token": "••••••••"}]}})
    assert contains_redaction_mask({"mcp": {"servers": {"a": {"headers": {"A": "••••••••"}}}}})
    assert not contains_redaction_mask({"discord": {"require_mention": True}})
    assert not contains_redaction_mask({"slack": {"default_webhook_url": "https://real"}})


# ---------------------------------------------------------------------------
# SSRF scoping
# ---------------------------------------------------------------------------

def test_metadata_url_blocks_metadata_ip():
    assert is_metadata_url("http://169.254.169.254/latest/meta-data/") is True
    assert is_metadata_url("http://metadata.google.internal/") is True


def test_metadata_url_allows_internal_and_public():
    # metadata scoping does NOT block general private/loopback
    assert is_metadata_url("http://127.0.0.1:11434/api") is False
    assert is_metadata_url("http://192.168.1.13:8080/health") is False
    assert is_metadata_url("https://example.com/") is False


def test_is_url_blocked_still_blocks_private():
    # The stricter guard (used by analyze_image/fetch_url) blocks private too.
    assert is_url_blocked("http://169.254.169.254/") is True
    assert is_url_blocked("http://127.0.0.1/") is True
    assert is_url_blocked("http://192.168.1.13/") is True


def test_http_probe_blocks_metadata():
    with pytest.raises(ValueError, match="cloud-metadata"):
        validate_url("http://169.254.169.254/latest/meta-data/")


def test_http_probe_allows_internal_target():
    # Internal infra probing remains supported.
    url = validate_url("http://192.168.1.13:9090/-/healthy")
    assert url == "http://192.168.1.13:9090/-/healthy"
    cmd = build_http_probe_command({"url": url})
    assert "curl" in cmd and "192.168.1.13" in cmd


def test_http_probe_sinkholes_metadata_on_redirect():
    # Following redirects sinkholes metadata endpoints so a public URL that
    # 302s into 169.254.169.254 can't reach the metadata service.
    cmd = build_http_probe_command({
        "url": "https://example.com/", "follow_redirects": True,
    })
    assert "-L" in cmd
    assert "--connect-to" in cmd
    assert "169.254.169.254:80:127.0.0.1:9" in cmd
    assert "169.254.169.254:443:127.0.0.1:9" in cmd
    assert "metadata.google.internal:80:127.0.0.1:9" in cmd


def test_http_probe_no_sinkhole_when_not_following():
    cmd = build_http_probe_command({
        "url": "https://example.com/", "follow_redirects": False,
    })
    assert "-L" not in cmd
    assert "--connect-to" not in cmd


# ---------------------------------------------------------------------------
# Context loader robustness
# ---------------------------------------------------------------------------

def test_context_loader_tolerates_bad_encoding(tmp_path):
    (tmp_path / "good.md").write_text("clean content")
    # An undecodable byte must not crash the load.
    (tmp_path / "bad.md").write_bytes(b"\xff\xfe bad bytes here")
    loader = ContextLoader(str(tmp_path))
    ctx = loader.load()  # must not raise
    assert "clean content" in ctx


def test_context_loader_skips_oversized_file(tmp_path):
    (tmp_path / "small.md").write_text("keep me")
    big = "x" * (MAX_CONTEXT_FILE_BYTES + 10)
    (tmp_path / "huge.md").write_text(big)
    loader = ContextLoader(str(tmp_path))
    ctx = loader.load()
    assert "keep me" in ctx
    assert big not in ctx  # oversized file excluded
