"""Browser automation via native Playwright (no external Browserless sidecar).

Launches a local headless Chromium on first use and reuses it across calls.
All operations use isolated browser contexts (incognito) that are cleaned up
after each call. Falls back to a remote CDP URL if configured.
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import AsyncIterator, Awaitable
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, TypeVar

from ..odin_log import get_logger

if TYPE_CHECKING:
    from playwright.async_api import Browser, Playwright

log = get_logger("browser")

_T = TypeVar("_T")

ALLOWED_SCHEMES = ("http://", "https://")  # re-exported for tests
_CONNECTION_ERROR_PATTERNS = (
    "connection closed",
    "target closed",
    "browser has been closed",
    "browser closed",
    "websocket is closed",
    "not connected",
    "connection refused",
    "target page, context or browser has been closed",
)
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
_HTTP_URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)
_WEBSOCKET_URL_PATTERN = re.compile(r"^wss?://", re.IGNORECASE)
_REQUEST_HEADERS_TO_DROP = frozenset(
    {"connection", "content-length", "host", "proxy-connection", "transfer-encoding", "upgrade"}
)
_RESPONSE_HEADERS_TO_DROP = frozenset(
    {
        "connection",
        "content-encoding",
        "content-length",
        "proxy-connection",
        "transfer-encoding",
        "upgrade",
    }
)
_ROUTE_ACTION_TIMEOUT_SECONDS = 2.0
_CONTEXT_CLOSE_TIMEOUT_SECONDS = 5.0
_BROWSER_CLOSE_TIMEOUT_SECONDS = 5.0
_PLAYWRIGHT_STOP_TIMEOUT_SECONDS = 5.0


def _consume_future_exception(future: asyncio.Future) -> None:
    """Retrieve a detached future's exception without delaying its caller."""
    if future.cancelled():
        return
    try:
        future.exception()
    except (Exception, asyncio.CancelledError):
        pass


async def _await_bounded(awaitable: Awaitable[_T], timeout: float, operation: str) -> _T:
    """Wait for a Playwright operation without trusting cancellation to settle.

    ``asyncio.wait_for`` waits for a cancelled child to finish cancelling.  A
    wedged Playwright route/context can therefore turn a nominal timeout into an
    unbounded wait.  Observe the task for a fixed interval instead; on expiry,
    request cancellation and detach it with exception retrieval.
    """
    future = asyncio.ensure_future(awaitable)
    try:
        done, _pending = await asyncio.wait({future}, timeout=timeout)
    except BaseException:
        future.cancel()
        future.add_done_callback(_consume_future_exception)
        raise
    if future not in done:
        future.cancel()
        future.add_done_callback(_consume_future_exception)
        raise TimeoutError(f"{operation} did not finish within {timeout:g}s")
    return future.result()


def _validate_url(url: str, allowed_urls: list[str] | None = None) -> None:
    """Reject dangerous URL schemes and SSRF targets."""
    from .url_safety import validate_url_safe

    validate_url_safe(url, allowed_urls=allowed_urls)


class BrowserManager:
    """Manages a Playwright Chromium browser — native launch or remote CDP."""

    def __init__(
        self,
        cdp_url: str = "",
        default_timeout_ms: int = 30000,
        viewport_width: int = 1920,
        viewport_height: int = 1080,
        allow_private_targets: list[str] | None = None,
    ) -> None:
        self._cdp_url = cdp_url
        self._default_timeout_ms = default_timeout_ms
        self._viewport = {"width": viewport_width, "height": viewport_height}
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._lock = asyncio.Lock()
        self._native = not bool(cdp_url)
        self.allowed_urls = allow_private_targets or []

    @staticmethod
    def _is_connection_error(exc: Exception) -> bool:
        """Check if an exception indicates a dead browser connection."""
        msg = str(exc).lower()
        return any(p in msg for p in _CONNECTION_ERROR_PATTERNS)

    def _on_browser_disconnected(self) -> None:
        """Callback when the browser fires a 'disconnected' event."""
        log.warning("Browser disconnected")
        self._browser = None

    async def _force_reconnect(self) -> None:
        """Force-drop the current connection and reconnect."""
        async with self._lock:
            browser = self._browser
            self._browser = None
            if browser:
                try:
                    await _await_bounded(
                        browser.close(),
                        _BROWSER_CLOSE_TIMEOUT_SECONDS,
                        "closing browser before reconnect",
                    )
                except Exception as exc:
                    log.warning("Browser close before reconnect did not complete: %s", exc)
        await self._ensure_connected()

    async def _ensure_connected(self) -> None:
        """Lazy-launch or lazy-connect the browser."""
        async with self._lock:
            if self._browser and self._browser.is_connected():
                return
            try:
                from playwright.async_api import async_playwright
            except ImportError:
                raise RuntimeError(
                    "playwright is not installed. "
                    "Run: pip install playwright && playwright install chromium"
                )
            if not self._playwright:
                self._playwright = await async_playwright().start()
            try:
                if self._native:
                    self._browser = await self._playwright.chromium.launch(
                        headless=True,
                        args=[
                            "--no-sandbox",
                            "--disable-setuid-sandbox",
                            "--disable-dev-shm-usage",
                            "--disable-gpu",
                        ],
                    )
                    log.info("Launched native headless Chromium")
                else:
                    self._browser = await self._playwright.chromium.connect_over_cdp(self._cdp_url)
                    log.info("Connected to remote browser at %s", self._cdp_url.split("?")[0])
                self._browser.on("disconnected", self._on_browser_disconnected)
            except Exception as e:
                if self._native:
                    raise RuntimeError(
                        f"Failed to launch Chromium. Run 'playwright install chromium' "
                        f"to install browser binaries. ({e})"
                    )
                raise RuntimeError(
                    f"Browser service unavailable at {self._cdp_url.split('?')[0]}. ({e})"
                )

    async def _create_page(self, timeout_ms: int | None = None):
        """Create a new browser context and page. Returns (context, page)."""
        # _ensure_connected() (every caller) sets _browser before this.
        context = await self._browser.new_context(  # type: ignore[union-attr]
            viewport=self._viewport,
            user_agent=DEFAULT_USER_AGENT,
            # Service workers can issue requests outside normal page routing.
            # Browser tools use disposable contexts, so blocking them costs no
            # persistent functionality and closes that enforcement bypass.
            service_workers="block",
        )
        context.set_default_timeout(timeout_ms or self._default_timeout_ms)
        try:
            await self._install_request_guard(context)
            page = await context.new_page()
            if not self._native:
                try:
                    cdp = await page.context.new_cdp_session(page)
                    await cdp.send(
                        "Emulation.setDeviceMetricsOverride",
                        {
                            "width": self._viewport["width"],
                            "height": self._viewport["height"],
                            "deviceScaleFactor": 1,
                            "mobile": False,
                        },
                    )
                except asyncio.CancelledError:
                    raise
                except Exception:
                    # Device-metric emulation is best-effort for CDP mode.
                    pass
            return context, page
        except BaseException:
            try:
                await _await_bounded(
                    context.close(),
                    _CONTEXT_CLOSE_TIMEOUT_SECONDS,
                    "closing browser context after page setup failure",
                )
            except BaseException as cleanup_exc:
                log.warning(
                    "Browser context cleanup after page setup failure did not complete: %s",
                    cleanup_exc,
                )
            raise

    async def _install_request_guard(self, context) -> None:
        """Route every browser network request through the SSRF-safe transport.

        Validating only ``page.goto()`` is insufficient: Chromium follows
        redirects and loads scripts, images, frames, fetches, and form targets
        on its own.  The safe transport validates each request URL and uses a
        connect-time validating resolver, so DNS resolution is bound to the
        socket rather than checked in a separate, raceable lookup.

        Every callback must also settle its intercepted route.  An exception
        escaping before ``fulfill``/``abort`` leaves Chromium waiting outside
        Playwright's page timeout; context cleanup can then wait on that route
        forever.  This boundary catches all ordinary callback failures, aborts
        fail-closed, and gives both transport and Playwright actions hard
        deadlines shorter than the page timeout.
        """
        from .safe_fetch import safe_fetch

        page_timeout = max(1.0, self._default_timeout_ms / 1000)
        route_timeout = max(0.5, page_timeout * 0.9)
        fetch_timeout = max(0.25, page_timeout * 0.8)

        async def _abort_route(route, url: str) -> None:
            try:
                await _await_bounded(
                    route.abort("blockedbyclient"),
                    min(_ROUTE_ACTION_TIMEOUT_SECONDS, route_timeout),
                    f"aborting browser request {url}",
                )
            except Exception as abort_exc:
                # The callback still returns.  In particular, do not let a
                # failed/late abort recreate the original unbounded route task.
                log.warning("Failed to abort browser request %s: %s", url, abort_exc)

        async def _route_http(route) -> None:
            url = "<unknown>"
            try:
                async with asyncio.timeout(route_timeout):
                    request = route.request
                    url = str(request.url)
                    request_headers = {
                        key: value
                        for key, value in (await request.all_headers()).items()
                        if key.lower() not in _REQUEST_HEADERS_TO_DROP
                    }
                    # Chromium normally follows redirects inside one routed
                    # request and does not expose the redirect target as another
                    # context.route callback. Follow the chain here instead: the
                    # safe transport validates every hop and pins DNS at connect
                    # time before we fulfill Chromium with only the final response.
                    response = await _await_bounded(
                        safe_fetch(
                            request.url,
                            method=request.method,
                            headers=request_headers,
                            data=request.post_data_buffer,
                            follow_redirects=True,
                            allowed_urls=self.allowed_urls,
                            timeout=fetch_timeout,
                            user_agent=None,
                        ),
                        fetch_timeout,
                        f"fetching browser request {url}",
                    )
                    # aiohttp decodes compressed bodies. Let Playwright calculate
                    # framing for the fulfilled bytes instead of forwarding stale
                    # transport/content-encoding headers from the origin.
                    response_headers = {
                        key: value
                        for key, value in response.headers.items()
                        if key.lower() not in _RESPONSE_HEADERS_TO_DROP
                    }
                    await _await_bounded(
                        route.fulfill(
                            status=response.status,
                            headers=response_headers,
                            body=response.body,
                        ),
                        min(_ROUTE_ACTION_TIMEOUT_SECONDS, route_timeout),
                        f"fulfilling browser request {url}",
                    )
            except asyncio.CancelledError:
                await _abort_route(route, url)
                raise
            except Exception as exc:
                # SafeFetchError/aiohttp failures are expected here, but this
                # deliberately catches Playwright errors, malformed request
                # metadata and future transport failures too.  No ordinary
                # exception may escape while leaving an intercepted route open.
                log.warning("Blocked or failed browser request %s: %s", url, exc)
                await _abort_route(route, url)

        await context.route(_HTTP_URL_PATTERN, _route_http)

        # WebSocket routing was added after Playwright's original browser
        # support. Refuse to create an unguarded context on an older runtime;
        # silently falling back would leave a direct network path around the
        # HTTP request guard.
        route_web_socket = getattr(context, "route_web_socket", None)
        if route_web_socket is None:
            raise RuntimeError(
                "Browser security requires Playwright with WebSocket routing support; "
                "upgrade the browser extra"
            )

        async def _block_websocket(websocket) -> None:
            log.warning("Blocked browser WebSocket request: %s", websocket.url)
            try:
                await _await_bounded(
                    websocket.close(code=1008, reason="Browser network policy"),
                    min(_ROUTE_ACTION_TIMEOUT_SECONDS, route_timeout),
                    f"closing browser WebSocket {websocket.url}",
                )
            except Exception as exc:
                log.warning("Failed to close browser WebSocket %s: %s", websocket.url, exc)

        await route_web_socket(_WEBSOCKET_URL_PATTERN, _block_websocket)

    @asynccontextmanager
    async def new_page(self, timeout_ms: int | None = None) -> AsyncIterator:
        """Yield a fresh page in an isolated context. Auto-cleans up.

        Self-heals crashed browsers: if the browser process died, the first
        page creation attempt will fail. We catch the error, relaunch, and
        retry once.
        """
        await self._ensure_connected()
        try:
            context, page = await self._create_page(timeout_ms)
        except Exception as e:
            if self._is_connection_error(e):
                log.warning("Browser connection lost, relaunching: %s", e)
                await self._force_reconnect()
                context, page = await self._create_page(timeout_ms)
            else:
                raise
        try:
            yield page
        finally:
            try:
                await _await_bounded(
                    context.close(),
                    _CONTEXT_CLOSE_TIMEOUT_SECONDS,
                    "closing browser context",
                )
            except Exception as exc:
                # Cleanup must not turn a page timeout or cancelled tool into an
                # immortal call.  The disposable context may leak until browser
                # shutdown, but the caller regains control and the fault is visible.
                log.warning("Browser context cleanup did not complete: %s", exc)

    async def shutdown(self) -> None:
        """Clean shutdown without trusting or abandoning driver teardown."""
        browser = self._browser
        playwright = self._playwright
        cancellation: asyncio.CancelledError | None = None
        try:
            if browser:
                try:
                    await _await_bounded(
                        browser.close(),
                        _BROWSER_CLOSE_TIMEOUT_SECONDS,
                        "closing browser during shutdown",
                    )
                except asyncio.CancelledError as exc:
                    # Remember cancellation, but still give the Playwright
                    # driver its bounded stop attempt before propagating it.
                    cancellation = exc
                except Exception as exc:
                    log.warning("Browser shutdown did not complete: %s", exc)
            if playwright:
                try:
                    await _await_bounded(
                        playwright.stop(),
                        _PLAYWRIGHT_STOP_TIMEOUT_SECONDS,
                        "stopping Playwright",
                    )
                except asyncio.CancelledError as exc:
                    cancellation = cancellation or exc
                except Exception as exc:
                    log.warning("Playwright shutdown did not complete: %s", exc)
        finally:
            # Clear only the generation this shutdown owned. A concurrent
            # reconnect must not have its fresh pointers erased by old cleanup.
            if self._browser is browser:
                self._browser = None
            if self._playwright is playwright:
                self._playwright = None
        if cancellation is not None:
            raise cancellation
        log.info("Browser manager shut down")


# --- Tool handler functions ---
# Each returns a string (tool result) or a tuple of (string, bytes) for screenshot.


async def handle_browser_screenshot(
    manager: BrowserManager,
    inp: dict,
) -> tuple[str, bytes | None]:
    """Navigate to a URL, take a screenshot, return (description, png_bytes)."""
    url = inp["url"]
    full_page = inp.get("full_page", False)
    wait_seconds = min(inp.get("wait_seconds", 0), 10)

    _validate_url(url, allowed_urls=manager.allowed_urls)

    async with manager.new_page() as page:
        response = await page.goto(url, wait_until="domcontentloaded")
        if wait_seconds:
            await page.wait_for_timeout(wait_seconds * 1000)
        screenshot_bytes = await page.screenshot(full_page=full_page, type="png")
        title = await page.title()
        final_url = page.url
        status = response.status if response else "unknown"

    size_kb = len(screenshot_bytes) // 1024
    text = f"Screenshot of **{title}** ({final_url}) — HTTP {status}, {size_kb} KB"
    return text, screenshot_bytes


async def handle_browser_read_page(
    manager: BrowserManager,
    inp: dict,
) -> str:
    """Navigate to a URL, extract visible text content."""
    url = inp["url"]
    selector = inp.get("selector")
    max_chars = min(inp.get("max_chars", 16000), 32000)
    wait_seconds = min(inp.get("wait_seconds", 0), 10)

    _validate_url(url, allowed_urls=manager.allowed_urls)

    async with manager.new_page() as page:
        await page.goto(url, wait_until="domcontentloaded")
        if wait_seconds:
            await page.wait_for_timeout(wait_seconds * 1000)

        if selector:
            element = await page.wait_for_selector(selector, timeout=10000)
            if not element:
                return f"Selector `{selector}` not found on page."
            text = await element.inner_text()
        else:
            text = await page.inner_text("body")
        title = await page.title()
        final_url = page.url

    text = text.strip()
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n... (content truncated)"

    return f"**{title}** ({final_url})\n\n{text}"


async def handle_browser_read_table(
    manager: BrowserManager,
    inp: dict,
) -> str:
    """Navigate to a URL, extract a table as markdown."""
    url = inp["url"]
    table_index = inp.get("table_index", 0)
    wait_seconds = min(inp.get("wait_seconds", 0), 10)

    _validate_url(url, allowed_urls=manager.allowed_urls)

    async with manager.new_page() as page:
        await page.goto(url, wait_until="domcontentloaded")
        if wait_seconds:
            await page.wait_for_timeout(wait_seconds * 1000)

        table_data = await page.evaluate(
            """(index) => {
            const tables = document.querySelectorAll('table');
            if (index >= tables.length) return null;
            const table = tables[index];
            const rows = [];
            for (const tr of table.querySelectorAll('tr')) {
                const cells = [];
                for (const td of tr.querySelectorAll('th, td')) {
                    cells.push(td.innerText.trim());
                }
                if (cells.length > 0) rows.push(cells);
            }
            return rows;
        }""",
            table_index,
        )

        title = await page.title()
        table_count = await page.evaluate("document.querySelectorAll('table').length")

    if table_data is None:
        return f"No table found at index {table_index}. Page has {table_count} table(s)."

    if not table_data:
        return "Table is empty."

    # Format as markdown table
    lines = []
    for i, row in enumerate(table_data):
        line = "| " + " | ".join(str(cell) for cell in row) + " |"
        lines.append(line)
        if i == 0:
            # Add header separator
            lines.append("| " + " | ".join("---" for _ in row) + " |")

    md = "\n".join(lines)
    if len(md) > 4000:
        md = md[:16000] + "\n... (table truncated)"

    return f"**{title}** — Table {table_index + 1} of {table_count}\n\n{md}"


async def handle_browser_click(
    manager: BrowserManager,
    inp: dict,
) -> str:
    """Click an element on a page by CSS selector."""
    url = inp["url"]
    selector = inp["selector"]
    wait_seconds = min(inp.get("wait_seconds", 0), 10)

    _validate_url(url, allowed_urls=manager.allowed_urls)

    async with manager.new_page() as page:
        await page.goto(url, wait_until="domcontentloaded")
        if wait_seconds:
            await page.wait_for_timeout(wait_seconds * 1000)

        try:
            await page.click(selector, timeout=10000)
        except Exception as e:
            return f"Failed to click `{selector}`: {e}"

        # Wait for any navigation or rendering after click
        await page.wait_for_timeout(1000)
        new_url = page.url
        title = await page.title()

    return f"Clicked `{selector}`. Page is now: **{title}** ({new_url})"


async def handle_browser_fill(
    manager: BrowserManager,
    inp: dict,
) -> str:
    """Fill a form field on a page by CSS selector."""
    url = inp["url"]
    selector = inp["selector"]
    value = inp["value"]
    submit = inp.get("submit", False)

    _validate_url(url, allowed_urls=manager.allowed_urls)

    async with manager.new_page() as page:
        await page.goto(url, wait_until="domcontentloaded")

        try:
            await page.fill(selector, value, timeout=10000)
        except Exception as e:
            return f"Failed to fill `{selector}`: {e}"

        if submit:
            try:
                await page.press(selector, "Enter")
                await page.wait_for_timeout(2000)
            except Exception as e:
                return f"Filled `{selector}` but submit failed: {e}"

        title = await page.title()
        new_url = page.url

    result = f"Filled `{selector}` with value. Page: **{title}** ({new_url})"
    if submit:
        result += " (submitted)"
    return result


async def handle_browser_evaluate(
    manager: BrowserManager,
    inp: dict,
) -> str:
    """Run JavaScript on a page and return the result."""
    url = inp["url"]
    expression = inp["expression"]
    wait_seconds = min(inp.get("wait_seconds", 0), 10)

    _validate_url(url, allowed_urls=manager.allowed_urls)

    async with manager.new_page() as page:
        await page.goto(url, wait_until="domcontentloaded")
        if wait_seconds:
            await page.wait_for_timeout(wait_seconds * 1000)

        try:
            result = await page.evaluate(expression)
        except Exception as e:
            return f"JavaScript evaluation failed: {e}"

    # Convert result to string
    if isinstance(result, (dict, list)):
        import json

        text = json.dumps(result, indent=2, default=str)
    else:
        text = str(result)

    if len(text) > 4000:
        text = text[:16000] + "\n... (result truncated)"

    return text
