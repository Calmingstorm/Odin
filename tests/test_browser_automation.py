"""Tests for browser automation (src/tools/browser.py).

Covers _validate_url, BrowserManager connection logic and state,
_is_connection_error, and ALLOWED_SCHEMES/DEFAULT_USER_AGENT constants.
Browser tool handler functions are tested via mocked BrowserManager.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.tools.browser import (
    ALLOWED_SCHEMES,
    DEFAULT_USER_AGENT,
    BrowserManager,
    _CONNECTION_ERROR_PATTERNS,
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
    def test_default_params(self):
        mgr = BrowserManager()
        assert mgr._cdp_url == "ws://odin-browser:3000?token=odin-internal"
        assert mgr._default_timeout_ms == 30000
        assert mgr._viewport == {"width": 1280, "height": 720}
        assert mgr._browser is None
        assert mgr._playwright is None

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
        mgr = BrowserManager()
        # playwright is genuinely not installed in this test env,
        # so _ensure_connected will hit the ImportError branch
        with pytest.raises(RuntimeError, match="playwright is not installed"):
            await mgr._ensure_connected()

    @pytest.mark.asyncio
    async def test_connection_failure_raises(self):
        mgr = BrowserManager()
        mock_pw = AsyncMock()
        mock_pw.chromium.connect_over_cdp = AsyncMock(side_effect=Exception("refused"))

        # Pre-set _playwright so _ensure_connected skips the import
        mgr._playwright = mock_pw

        # Mock the import so it doesn't fail
        import sys
        mock_module = MagicMock()
        mock_async_playwright = MagicMock(return_value=mock_pw)
        mock_module.async_playwright = mock_async_playwright

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
