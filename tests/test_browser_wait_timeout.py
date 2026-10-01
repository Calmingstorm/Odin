"""C3: real browser handlers, config policy and canonical per-call wait schemas."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from src.config.apply_registry import build_field_record
from src.config.schema import BrowserConfig
from src.llm.strict_tool_adapter import compile_catalog
from src.tools.browser import (
    BrowserManager,
    handle_browser_click,
    handle_browser_fill,
    handle_browser_read_page,
)
from src.tools.defs.browser_web import TOOLS_SECTION
from tests.test_browser_automation import _skip_or_fail_browser_test


@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, 10000), (0, 10000), ("", 10000), (" \t", 10000),
     (2, 2000), (2.5, 2500), (60, 60000), (120, 60000), (0.00001, 1)],
)
def test_wait_resolution_defaults_and_hard_ceiling(value, expected):
    assert BrowserManager().wait_timeout_ms(value) == expected


@pytest.mark.parametrize("value", [None, 0, "", 15, 60, 120])
def test_operator_ceiling_also_caps_default(value):
    manager = BrowserManager(max_wait_timeout_seconds=4)
    assert manager.wait_timeout_ms(value) == 4000


def test_direct_manager_cannot_raise_hard_ceiling_or_disable_timeout():
    assert BrowserManager(max_wait_timeout_seconds=600).wait_timeout_ms(500) == 60000
    assert BrowserManager(max_wait_timeout_seconds=0).wait_timeout_ms(0) == 1000


@pytest.mark.parametrize("value", [-1, float("nan"), float("inf"), "junk", True, {}])
def test_invalid_wait_is_rejected(value):
    with pytest.raises(ValueError, match="wait_timeout_seconds"):
        BrowserManager().wait_timeout_ms(value)


def test_existing_config_defaults_and_new_leaf_classification():
    config = BrowserConfig.model_validate({"default_timeout_ms": 30000})
    assert config.max_wait_timeout_seconds == 60
    record = build_field_record(
        "browser.max_wait_timeout_seconds", 12, boot_value=60, has_boot=True
    )
    assert record["apply_mode"] == "restart"
    assert record["unit"] == "s"
    assert record["default"] == 60
    assert record["constraints"] == {"minimum": 1, "maximum": 60}
    assert record["pending_restart"] is True
    assert record["effective"] == 60


@pytest.mark.parametrize("value", [0, -1, 61])
def test_invalid_config_ceiling_fails_closed(value):
    with pytest.raises(ValidationError):
        BrowserConfig(max_wait_timeout_seconds=value)


def test_browser_manager_wiring_captures_config_ceiling(tmp_path, monkeypatch):
    from tests.fakes import make_bot

    monkeypatch.chdir(tmp_path)
    bot = make_bot(config_overrides={"browser": {
        "enabled": True, "max_wait_timeout_seconds": 7,
    }})
    assert isinstance(bot.browser_manager, BrowserManager)
    assert bot.browser_manager.wait_timeout_ms(45) == 7000
    updated = bot.config.model_copy(deep=True)
    updated.browser.max_wait_timeout_seconds = 20
    bot.config = updated
    assert bot.browser_manager.wait_timeout_ms(45) == 7000  # truthful restart classification


@pytest.mark.parametrize("name", ["browser_read_page", "browser_click", "browser_fill"])
def test_per_call_schema_accepts_blank_zero_and_above_ceiling(name):
    tool = next(tool for tool in TOOLS_SECTION if tool["name"] == name)
    schema = tool["input_schema"]
    assert "wait_timeout_seconds" not in schema["required"]
    validator = Draft202012Validator(schema)
    baseline = {"url": "https://example.com", "selector": "#field", "value": "hello"}
    for value in (0, "", " \t", 2.5, 120):
        validator.validate({**baseline, "wait_timeout_seconds": value})
    for value in (-1, "long", False):
        assert not validator.is_valid({**baseline, "wait_timeout_seconds": value})
    # Exercise the actual strict wire compiler, not just the canonical schema.
    adapter = compile_catalog([tool])
    wire_input = {key: baseline.get(key) for key in schema["properties"]}
    for value in (0, "", " \t", 2.5, 120):
        accepted = adapter.accept(name, {**wire_input, "wait_timeout_seconds": value})
        assert accepted["wait_timeout_seconds"] == value
    assert "wait_timeout_seconds" not in adapter.accept(name, wire_input)


@pytest.mark.parametrize("handler", [handle_browser_read_page, handle_browser_click,
                                    handle_browser_fill])
@pytest.mark.parametrize(
    ("inp_wait", "ceiling", "expected"),
    [({}, 60, 10000), ({"wait_timeout_seconds": 0}, 60, 10000),
     ({"wait_timeout_seconds": ""}, 60, 10000),
     ({"wait_timeout_seconds": 2.5}, 60, 2500),
     ({"wait_timeout_seconds": 120}, 60, 60000),
     ({"wait_timeout_seconds": 120}, 7, 7000)],
)
async def test_handlers_pass_resolved_wait_to_playwright(handler, inp_wait, ceiling, expected):
    manager = BrowserManager(max_wait_timeout_seconds=ceiling)
    page = MagicMock()
    page.url = "https://example.com"
    page.goto = AsyncMock()
    page.title = AsyncMock(return_value="Wait test")
    page.wait_for_timeout = AsyncMock()
    page.click = AsyncMock()
    page.fill = AsyncMock()
    page.press = AsyncMock()
    element = MagicMock()
    element.inner_text = AsyncMock(return_value="READY")
    page.wait_for_selector = AsyncMock(return_value=element)

    @asynccontextmanager
    async def new_page():
        yield page

    manager.new_page = new_page
    result = await handler(manager, {
        "url": "https://example.com", "selector": "#field", "value": "hello",
        "submit": True, "wait_seconds": 2, **inp_wait,
    })
    assert "Wait test" in result
    if handler is handle_browser_read_page:
        page.wait_for_selector.assert_awaited_once_with("#field", timeout=expected)
        page.wait_for_timeout.assert_awaited_once_with(2000)
    elif handler is handle_browser_click:
        page.click.assert_awaited_once_with("#field", timeout=expected)
        assert page.wait_for_timeout.await_args_list[0].args == (2000,)
    else:
        page.fill.assert_awaited_once_with("#field", "hello", timeout=expected)
        page.press.assert_awaited_once_with("#field", "Enter", timeout=expected)


@pytest.mark.parametrize("handler", [handle_browser_read_page, handle_browser_click,
                                    handle_browser_fill])
async def test_invalid_wait_fails_before_navigation(handler):
    manager = BrowserManager()
    manager.new_page = MagicMock()
    with pytest.raises(ValueError, match="wait_timeout_seconds"):
        await handler(manager, {
            "url": "https://example.com", "selector": "#field", "value": "x",
            "wait_timeout_seconds": -1,
        })
    manager.new_page.assert_not_called()


async def test_real_chromium_waits_for_delayed_selectors_and_reports_timeouts():
    """Private disposable headless Chromium; no active desktop or external site."""
    try:
        from aiohttp import web
        from playwright.async_api import TimeoutError as PlaywrightTimeoutError
    except ImportError as exc:
        _skip_or_fail_browser_test(f"Playwright browser dependencies missing: {exc}")

    async def document(_request):
        return web.Response(text="""<!doctype html><title>Delayed selectors</title>
            <body><script>setTimeout(() => {
                document.body.insertAdjacentHTML('beforeend',
                    '<section id="ready">READY</section><button id="click">click</button>' +
                    '<input id="field" onkeydown="document.title=this.value">');
                document.querySelector('#click').onclick = () => document.title = 'CLICKED';
            }, 50);</script></body>""", content_type="text/html")

    app = web.Application()
    app.router.add_get("/", document)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    url = f"http://127.0.0.1:{port}/"
    manager = BrowserManager(max_wait_timeout_seconds=3, allow_private_targets=[url])
    try:
        try:
            await manager._ensure_connected()
        except RuntimeError as exc:
            _skip_or_fail_browser_test(f"Chromium launch failed: {exc}")
        async with asyncio.timeout(25):
            result = await handle_browser_read_page(manager, {
                "url": url, "selector": "#ready", "wait_timeout_seconds": 120,
            })
            assert "READY" in result
            result = await handle_browser_click(manager, {
                "url": url, "selector": "#click", "wait_timeout_seconds": 0,
            })
            assert "CLICKED" in result
            result = await handle_browser_fill(manager, {
                "url": url, "selector": "#field", "value": "FILLED", "submit": True,
                "wait_timeout_seconds": "",
            })
            assert "FILLED" in result and "(submitted)" in result
            missing = {"url": url, "selector": "#absent", "wait_timeout_seconds": 0.05}
            with pytest.raises(PlaywrightTimeoutError, match="50ms"):
                await handle_browser_read_page(manager, missing)
            assert "Failed to click" in await handle_browser_click(manager, missing)
            assert "Failed to fill" in await handle_browser_fill(manager, {**missing, "value": "x"})
    finally:
        await manager.shutdown()
        await runner.cleanup()
