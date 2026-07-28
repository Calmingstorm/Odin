"""Tests for browser automation (src/tools/browser.py).

Covers _validate_url, BrowserManager connection logic and state,
_is_connection_error, and ALLOWED_SCHEMES/DEFAULT_USER_AGENT constants.
Browser tool handler functions are tested via mocked BrowserManager.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.tools.browser import (
    _CONNECTION_ERROR_PATTERNS,
    ALLOWED_SCHEMES,
    DEFAULT_USER_AGENT,
    BrowserManager,
    _validate_url,
)

# ---------------------------------------------------------------------------
# _validate_url
# ---------------------------------------------------------------------------

class TestValidateUrl:
    def test_http_allowed(self):
        _validate_url("http://example.com")

    def test_https_allowed(self):
        _validate_url("https://example.com")

    def test_ftp_rejected(self):
        with pytest.raises(ValueError, match="http://"):
            _validate_url("ftp://example.com")

    def test_file_rejected(self):
        with pytest.raises(ValueError, match="http://"):
            _validate_url("file:///etc/passwd")

    def test_javascript_rejected(self):
        with pytest.raises(ValueError, match="http://"):
            _validate_url("javascript:alert(1)")

    def test_data_rejected(self):
        with pytest.raises(ValueError, match="http://"):
            _validate_url("data:text/html,<h1>test</h1>")

    def test_case_insensitive(self):
        _validate_url("HTTP://example.com")
        _validate_url("HTTPS://example.com")

    def test_empty_string(self):
        with pytest.raises(ValueError):
            _validate_url("")

    def test_no_scheme(self):
        with pytest.raises(ValueError):
            _validate_url("example.com")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_allowed_schemes(self):
        assert "http://" in ALLOWED_SCHEMES
        assert "https://" in ALLOWED_SCHEMES
        assert len(ALLOWED_SCHEMES) == 2

    def test_default_user_agent(self):
        assert "Chrome" in DEFAULT_USER_AGENT
        assert "Mozilla" in DEFAULT_USER_AGENT

    def test_connection_error_patterns(self):
        assert "connection closed" in _CONNECTION_ERROR_PATTERNS
        assert "browser has been closed" in _CONNECTION_ERROR_PATTERNS


# ---------------------------------------------------------------------------
# BrowserManager init
# ---------------------------------------------------------------------------

class TestBrowserManagerInit:
    def test_default_params_native_mode(self):
        mgr = BrowserManager()
        assert mgr._cdp_url == ""
        assert mgr._native is True
        assert mgr._default_timeout_ms == 30000
        assert mgr._viewport == {"width": 1920, "height": 1080}
        assert mgr._browser is None
        assert mgr._playwright is None

    def test_cdp_url_sets_remote_mode(self):
        mgr = BrowserManager(cdp_url="ws://custom:9222")
        assert mgr._native is False
        assert mgr._cdp_url == "ws://custom:9222"

    def test_custom_params(self):
        mgr = BrowserManager(
            cdp_url="ws://custom:9222",
            default_timeout_ms=10000,
            viewport_width=1920,
            viewport_height=1080,
        )
        assert mgr._cdp_url == "ws://custom:9222"
        assert mgr._default_timeout_ms == 10000
        assert mgr._viewport == {"width": 1920, "height": 1080}


# ---------------------------------------------------------------------------
# _is_connection_error
# ---------------------------------------------------------------------------

class TestIsConnectionError:
    def test_connection_closed(self):
        assert BrowserManager._is_connection_error(Exception("Connection closed unexpectedly"))

    def test_target_closed(self):
        assert BrowserManager._is_connection_error(Exception("Target closed"))

    def test_browser_closed(self):
        assert BrowserManager._is_connection_error(Exception("Browser has been closed"))

    def test_websocket_closed(self):
        assert BrowserManager._is_connection_error(Exception("WebSocket is closed"))

    def test_not_connected(self):
        assert BrowserManager._is_connection_error(Exception("Not connected"))

    def test_connection_refused(self):
        assert BrowserManager._is_connection_error(Exception("Connection refused"))

    def test_random_error_not_connection(self):
        assert not BrowserManager._is_connection_error(Exception("division by zero"))

    def test_empty_message(self):
        assert not BrowserManager._is_connection_error(Exception(""))


# ---------------------------------------------------------------------------
# BrowserManager._on_browser_disconnected
# ---------------------------------------------------------------------------

class TestOnBrowserDisconnected:
    def test_clears_browser(self):
        mgr = BrowserManager()
        mgr._browser = MagicMock()
        mgr._on_browser_disconnected()
        assert mgr._browser is None


# ---------------------------------------------------------------------------
# BrowserManager._ensure_connected
# ---------------------------------------------------------------------------

class TestEnsureConnected:
    @pytest.mark.asyncio
    async def test_already_connected(self):
        mgr = BrowserManager()
        mock_browser = MagicMock()
        mock_browser.is_connected.return_value = True
        mgr._browser = mock_browser
        await mgr._ensure_connected()
        # Should not try to reconnect
        assert mgr._browser is mock_browser

    @pytest.mark.asyncio
    async def test_playwright_not_installed_raises(self):
        """When playwright is not installed, _ensure_connected raises RuntimeError."""
        try:
            import playwright  # noqa: F401
            pytest.skip("playwright is installed — cannot test missing-import path")
        except ImportError:
            pass
        mgr = BrowserManager()
        with pytest.raises(RuntimeError, match="playwright is not installed"):
            await mgr._ensure_connected()

    @pytest.mark.asyncio
    async def test_native_launch_failure_raises(self):
        mgr = BrowserManager()
        mock_pw = AsyncMock()
        mock_pw.chromium.launch = AsyncMock(side_effect=Exception("no chromium"))
        mgr._playwright = mock_pw

        import sys
        mock_module = MagicMock()
        mock_module.async_playwright = MagicMock(return_value=mock_pw)

        with patch.dict(sys.modules, {
            "playwright": MagicMock(),
            "playwright.async_api": mock_module,
        }):
            with pytest.raises(RuntimeError, match="Failed to launch Chromium"):
                await mgr._ensure_connected()

    @pytest.mark.asyncio
    async def test_remote_cdp_failure_raises(self):
        mgr = BrowserManager(cdp_url="ws://bad:9222")
        mock_pw = AsyncMock()
        mock_pw.chromium.connect_over_cdp = AsyncMock(side_effect=Exception("refused"))
        mgr._playwright = mock_pw

        import sys
        mock_module = MagicMock()
        mock_module.async_playwright = MagicMock(return_value=mock_pw)

        with patch.dict(sys.modules, {
            "playwright": MagicMock(),
            "playwright.async_api": mock_module,
        }):
            with pytest.raises(RuntimeError, match="Browser service unavailable"):
                await mgr._ensure_connected()


# ---------------------------------------------------------------------------
# BrowserManager.shutdown
# ---------------------------------------------------------------------------

class TestShutdown:
    @pytest.mark.asyncio
    async def test_shutdown_no_browser(self):
        mgr = BrowserManager()
        await mgr.shutdown()
        assert mgr._browser is None
        assert mgr._playwright is None

    @pytest.mark.asyncio
    async def test_shutdown_with_browser(self):
        mgr = BrowserManager()
        mock_browser = AsyncMock()
        mock_pw = AsyncMock()
        mgr._browser = mock_browser
        mgr._playwright = mock_pw
        await mgr.shutdown()
        mock_browser.close.assert_called_once()
        mock_pw.stop.assert_called_once()
        assert mgr._browser is None
        assert mgr._playwright is None

    @pytest.mark.asyncio
    async def test_shutdown_handles_exception(self):
        mgr = BrowserManager()
        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock(side_effect=Exception("already closed"))
        mgr._browser = mock_browser
        mgr._playwright = AsyncMock()
        # Should not raise
        await mgr.shutdown()
        assert mgr._browser is None


# ---------------------------------------------------------------------------
# BrowserManager._force_reconnect
# ---------------------------------------------------------------------------

class TestForceReconnect:
    @pytest.mark.asyncio
    async def test_clears_and_reconnects(self):
        mgr = BrowserManager()
        old_browser = AsyncMock()
        mgr._browser = old_browser

        # Mock _ensure_connected to set a new browser
        new_browser = MagicMock()
        new_browser.is_connected.return_value = True

        async def mock_ensure():
            pass

        with patch.object(mgr, "_ensure_connected", side_effect=mock_ensure):
            await mgr._force_reconnect()
        # Old browser should have been closed
        old_browser.close.assert_called_once()


# ---------------------------------------------------------------------------
# Per-request browser network guard
# ---------------------------------------------------------------------------

class TestBrowserRequestGuard:
    @pytest.mark.asyncio
    async def test_context_is_hardened_before_page_creation(self):
        mgr = BrowserManager()
        browser = MagicMock()
        context = MagicMock()
        context.route = AsyncMock()
        context.route_web_socket = AsyncMock()
        context.new_page = AsyncMock(return_value=MagicMock())
        context.close = AsyncMock()
        browser.new_context = AsyncMock(return_value=context)
        mgr._browser = browser

        await mgr._create_page()

        assert browser.new_context.await_args.kwargs["service_workers"] == "block"
        context.route.assert_awaited_once()
        context.route_web_socket.assert_awaited_once()
        context.new_page.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_http_route_uses_safe_fetch_and_never_direct_continue(self):
        from src.tools.safe_fetch import SafeFetchResponse

        mgr = BrowserManager(allow_private_targets=["http://internal.test/"])
        context = MagicMock()
        context.route = AsyncMock()
        context.route_web_socket = AsyncMock()

        request = MagicMock()
        request.url = "https://example.com/page"
        request.method = "POST"
        request.post_data_buffer = b"payload"
        request.all_headers = AsyncMock(
            return_value={"cookie": "session=x", "content-length": "7", "host": "example.com"}
        )
        route = MagicMock(request=request)
        route.fulfill = AsyncMock()
        route.abort = AsyncMock()
        route.continue_ = AsyncMock()
        response = SafeFetchResponse(
            status=200,
            headers={
                "Content-Type": "text/plain",
                "Content-Encoding": "gzip",
                "Content-Length": "3",
            },
            body=b"ok",
            content_type="text/plain",
            url=request.url,
        )

        with patch("src.tools.safe_fetch.safe_fetch", AsyncMock(return_value=response)) as fetch:
            await mgr._install_request_guard(context)
            handler = context.route.await_args.args[1]
            await handler(route)

        assert fetch.await_args.kwargs["follow_redirects"] is True
        assert fetch.await_args.kwargs["data"] == b"payload"
        assert fetch.await_args.kwargs["headers"] == {"cookie": "session=x"}
        assert fetch.await_args.kwargs["allowed_urls"] == ["http://internal.test/"]
        route.continue_.assert_not_awaited()
        route.abort.assert_not_awaited()
        assert route.fulfill.await_args.kwargs == {
            "status": 200,
            "headers": {"Content-Type": "text/plain"},
            "body": b"ok",
        }

    @pytest.mark.asyncio
    async def test_blocked_subresource_is_aborted_before_chromium_connects(self):
        from src.tools.safe_fetch import BlockedAddressError

        mgr = BrowserManager()
        context = MagicMock()
        context.route = AsyncMock()
        context.route_web_socket = AsyncMock()

        request = MagicMock()
        request.url = "http://127.0.0.1/secret"
        request.method = "GET"
        request.post_data_buffer = None
        request.all_headers = AsyncMock(return_value={})
        route = MagicMock(request=request)
        route.fulfill = AsyncMock()
        route.abort = AsyncMock()
        route.continue_ = AsyncMock()

        with patch(
            "src.tools.safe_fetch.safe_fetch",
            AsyncMock(side_effect=BlockedAddressError("private address")),
        ):
            await mgr._install_request_guard(context)
            handler = context.route.await_args.args[1]
            await handler(route)

        route.abort.assert_awaited_once_with("blockedbyclient")
        route.fulfill.assert_not_awaited()
        route.continue_.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_websockets_are_blocked_without_connecting(self):
        mgr = BrowserManager()
        context = MagicMock()
        context.route = AsyncMock()
        context.route_web_socket = AsyncMock()
        await mgr._install_request_guard(context)
        handler = context.route_web_socket.await_args.args[1]
        websocket = MagicMock(url="ws://127.0.0.1/secret")
        websocket.close = AsyncMock()

        await handler(websocket)

        websocket.close.assert_awaited_once_with(
            code=1008, reason="Browser network policy"
        )

    @pytest.mark.asyncio
    async def test_old_playwright_is_rejected_instead_of_running_unguarded(self):
        mgr = BrowserManager()
        context = MagicMock(spec=["route"])
        context.route = AsyncMock()
        with pytest.raises(RuntimeError, match="WebSocket routing"):
            await mgr._install_request_guard(context)


@pytest.mark.asyncio
async def test_real_browser_blocks_redirects_and_subresources_to_private_loopback():
    """Exercise the original F1 bypass through a real disposable Chromium context."""
    try:
        from aiohttp import web
        from playwright.async_api import async_playwright
    except ImportError:
        pytest.skip("Playwright browser test dependencies are not installed")

    private_hits: list[str] = []

    async def private_handler(request):
        private_hits.append(request.path)
        return web.Response(text="PRIVATE_SENTINEL")

    private_app = web.Application()
    private_app.router.add_get("/{tail:.*}", private_handler)
    private_runner = web.AppRunner(private_app)
    await private_runner.setup()
    private_site = web.TCPSite(private_runner, "127.0.0.1", 0)
    await private_site.start()
    private_port = private_site._server.sockets[0].getsockname()[1]

    async def public_page(_request):
        return web.Response(
            text=(
                "<body>PUBLIC_SENTINEL"
                f'<img src="http://127.0.0.1:{private_port}/image">'
                f'<script>fetch("http://127.0.0.1:{private_port}/fetch")</script>'
                "</body>"
            ),
            content_type="text/html",
        )

    async def public_redirect(_request):
        raise web.HTTPFound(f"http://127.0.0.1:{private_port}/redirect")

    public_app = web.Application()
    public_app.router.add_get("/page", public_page)
    public_app.router.add_get("/redirect", public_redirect)
    public_runner = web.AppRunner(public_app)
    await public_runner.setup()
    public_site = web.TCPSite(public_runner, "127.0.0.1", 0)
    await public_site.start()
    public_port = public_site._server.sockets[0].getsockname()[1]

    manager = BrowserManager(
        allow_private_targets=[f"http://127.0.0.1:{public_port}/"],
    )
    try:
        async with async_playwright() as playwright:
            try:
                manager._playwright = playwright
                manager._browser = await playwright.chromium.launch(
                    headless=True, args=["--no-sandbox"]
                )
            except Exception as exc:
                pytest.skip(f"Chromium is not installed for Playwright: {exc}")

            async with manager.new_page() as page:
                await page.goto(
                    f"http://127.0.0.1:{public_port}/page",
                    wait_until="networkidle",
                )
                assert "PUBLIC_SENTINEL" in await page.inner_text("body")

            async with manager.new_page() as page:
                with pytest.raises(Exception, match="ERR_(FAILED|BLOCKED_BY_CLIENT)"):
                    await page.goto(
                        f"http://127.0.0.1:{public_port}/redirect",
                        wait_until="domcontentloaded",
                    )
    finally:
        await manager.shutdown()
        await public_runner.cleanup()
        await private_runner.cleanup()

    assert private_hits == []
