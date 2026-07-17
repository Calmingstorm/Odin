"""Tests for the hardened safe_fetch transport (SSRF / redirect / byte-cap).

A real loopback aiohttp server is started so the resolver, redirect handling,
header stripping, and byte cap are exercised end to end. Blocked redirect
targets (metadata / private / bad-scheme) are validated at the URL layer, so no
connection to those addresses is ever attempted.
"""
from __future__ import annotations

import pytest
from aiohttp import web

from src.tools.safe_fetch import (
    BlockedAddressError,
    ResponseTooLargeError,
    SafeFetchResponse,
    TooManyRedirectsError,
    safe_fetch,
)


@pytest.fixture
async def server():
    """Start a loopback server exposing redirect/echo/size endpoints.

    Yields ``(base_url, state)`` where base_url uses 127.0.0.1 and state
    records what the echo endpoint saw.
    """
    state: dict = {"echo_headers": {}, "chain": 0}

    async def ok(_req):
        return web.Response(text="HELLO-OK")

    async def redir_safe(_req):
        raise web.HTTPFound("/ok")

    async def redir_meta(_req):
        raise web.HTTPFound("http://169.254.169.254/latest/meta-data/")

    async def redir_priv(_req):
        raise web.HTTPFound("http://10.0.0.5/internal")

    async def redir_scheme(_req):
        raise web.HTTPFound("file:///etc/passwd")

    async def big(_req):
        return web.Response(body=b"x" * 5000)

    async def echo(req):
        state["echo_headers"] = dict(req.headers)
        return web.Response(text="ECHO")

    async def loop_redir(_req):
        state["chain"] += 1
        raise web.HTTPFound("/loop")

    async def post_target(req):
        state["method"] = req.method
        body = await req.text()
        state["body"] = body
        return web.Response(text="POSTED")

    async def redir_303(_req):
        raise web.HTTPSeeOther("/post-target")

    async def redir_307(_req):
        raise web.HTTPTemporaryRedirect("/post-target")

    async def redir_cross(req):
        # 127.0.0.1 -> localhost is a cross-origin hop (different hostname).
        raise web.HTTPFound(f"http://localhost:{req.url.port}/echo")

    async def set_cookie_cross(req):
        # Set a cookie, then redirect cross-origin — the cookie must NOT be
        # resent to the new origin (DummyCookieJar isolates it).
        resp = web.HTTPFound(f"http://localhost:{req.url.port}/echo")
        resp.set_cookie("secret", "leaked")
        raise resp

    app = web.Application()
    app.router.add_route("*", "/ok", ok)
    app.router.add_route("*", "/redir-safe", redir_safe)
    app.router.add_route("*", "/redir-meta", redir_meta)
    app.router.add_route("*", "/redir-priv", redir_priv)
    app.router.add_route("*", "/redir-scheme", redir_scheme)
    app.router.add_route("*", "/big", big)
    app.router.add_route("*", "/echo", echo)
    app.router.add_route("*", "/loop", loop_redir)
    app.router.add_route("*", "/post-target", post_target)
    app.router.add_route("*", "/redir-303", redir_303)
    app.router.add_route("*", "/redir-307", redir_307)
    app.router.add_route("*", "/redir-cross", redir_cross)
    app.router.add_route("*", "/set-cookie-cross", set_cookie_cross)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = runner.addresses[0][1]
    base = f"http://127.0.0.1:{port}"
    # Allowlist the loopback host so the resolver permits the connection; the
    # redirect-target tests still reject metadata/private hops unconditionally.
    yield base, port, state
    await runner.cleanup()


async def test_direct_fetch_allowlisted_loopback(server):
    base, _port, _state = server
    resp = await safe_fetch(base + "/ok", allowed_urls=[base])
    assert isinstance(resp, SafeFetchResponse)
    assert resp.status == 200
    assert resp.text() == "HELLO-OK"


async def test_bare_loopback_blocked_without_allowlist(server):
    base, _port, _state = server
    with pytest.raises(BlockedAddressError):
        await safe_fetch(base + "/ok")


async def test_safe_same_host_redirect_followed(server):
    base, _port, _state = server
    resp = await safe_fetch(base + "/redir-safe", allowed_urls=[base])
    assert resp.status == 200
    assert resp.text() == "HELLO-OK"
    assert resp.url.endswith("/ok")


async def test_redirect_to_metadata_blocked(server):
    base, _port, _state = server
    with pytest.raises(BlockedAddressError):
        await safe_fetch(base + "/redir-meta", allowed_urls=[base])


async def test_redirect_to_private_blocked(server):
    base, _port, _state = server
    with pytest.raises(BlockedAddressError):
        await safe_fetch(base + "/redir-priv", allowed_urls=[base])


async def test_redirect_to_bad_scheme_blocked(server):
    base, _port, _state = server
    with pytest.raises(BlockedAddressError):
        await safe_fetch(base + "/redir-scheme", allowed_urls=[base])


async def test_userinfo_url_rejected(server):
    base, port, _state = server
    with pytest.raises(BlockedAddressError):
        await safe_fetch(f"http://user:pass@127.0.0.1:{port}/ok", allowed_urls=[base])


async def test_non_http_scheme_rejected():
    with pytest.raises(BlockedAddressError):
        await safe_fetch("file:///etc/passwd")
    with pytest.raises(BlockedAddressError):
        await safe_fetch("ftp://example.com/x")


async def test_byte_cap_content_length(server):
    base, _port, _state = server
    with pytest.raises(ResponseTooLargeError):
        await safe_fetch(base + "/big", allowed_urls=[base], max_bytes=1000)


async def test_byte_cap_allows_under_limit(server):
    base, _port, _state = server
    resp = await safe_fetch(base + "/big", allowed_urls=[base], max_bytes=10000)
    assert len(resp.body) == 5000


async def test_same_origin_request_carries_auth_header(server):
    base, _port, state = server
    resp = await safe_fetch(
        base + "/echo",
        headers={"Authorization": "Bearer SECRET"},
        allowed_urls=[base],
    )
    assert resp.status == 200
    assert state["echo_headers"].get("Authorization") == "Bearer SECRET"


async def test_credential_headers_stripped_across_origin(server):
    base, port, state = server
    # 127.0.0.1 -> localhost is a cross-origin hop (different hostname); the
    # Authorization header must NOT survive it. Both hosts are allowlisted.
    localhost_base = f"http://localhost:{port}"
    resp = await safe_fetch(
        base + "/redir-cross",
        headers={"Authorization": "Bearer SECRET"},
        allowed_urls=[base, localhost_base],
    )
    assert resp.status == 200
    assert resp.text() == "ECHO"
    assert "Authorization" not in state["echo_headers"]


async def test_set_cookie_not_resent_across_redirect(server):
    base, port, state = server
    localhost_base = f"http://localhost:{port}"
    resp = await safe_fetch(
        base + "/set-cookie-cross", allowed_urls=[base, localhost_base]
    )
    assert resp.status == 200
    assert resp.text() == "ECHO"
    # The cookie set on the first hop must not have been resent to /echo.
    assert "Cookie" not in state["echo_headers"]


async def test_too_many_redirects(server):
    base, _port, _state = server
    with pytest.raises(TooManyRedirectsError):
        await safe_fetch(base + "/loop", allowed_urls=[base], max_redirects=3)


async def test_303_redirect_downgrades_to_get(server):
    base, _port, state = server
    resp = await safe_fetch(
        base + "/redir-303", method="POST", json_body={"a": 1}, allowed_urls=[base]
    )
    assert resp.status == 200
    assert state["method"] == "GET"  # 303 -> GET
    assert state["body"] == ""  # body dropped


async def test_307_redirect_preserves_method_and_body(server):
    base, _port, state = server
    resp = await safe_fetch(
        base + "/redir-307", method="POST", data="payload", allowed_urls=[base]
    )
    assert resp.status == 200
    assert state["method"] == "POST"  # 307 preserves method
    assert state["body"] == "payload"


async def test_no_follow_returns_redirect_response(server):
    base, _port, _state = server
    resp = await safe_fetch(base + "/redir-safe", allowed_urls=[base], follow_redirects=False)
    assert resp.status in (301, 302, 303, 307, 308)


def test_text_decodes_with_charset():
    resp = SafeFetchResponse(
        status=200,
        headers={},
        body="café".encode("latin-1"),
        content_type="text/plain; charset=latin-1",
        url="http://x",
    )
    assert resp.text() == "café"
