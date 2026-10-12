"""A real local HTTP server exercises the bounded plain-agent fallback."""

from functools import partial
from unittest.mock import AsyncMock

import aiohttp
import pytest
from aiohttp import web as http_web

from src.tools import safe_fetch as transport
from src.tools import web


@pytest.mark.parametrize("status", [403, 406, 200, 401, 404, 429, 500])
async def test_local_server_plain_agent_retry(status, monkeypatch):
    agents = []

    async def handler(request):
        agent = request.headers.get("User-Agent")
        agents.append(agent)
        if agent == "Mozilla/5.0":
            return http_web.Response(text="plain agent accepted")
        return http_web.Response(status=status, text="first agent response")

    app = http_web.Application()
    app.router.add_get("/", handler)
    runner = http_web.AppRunner(app)
    await runner.setup()
    site = http_web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    url = f"http://127.0.0.1:{runner.addresses[0][1]}/"
    # Only this disposable test server is permitted. Real validation, redirect
    # checks, response caps, and transport remain in use on both requests.
    monkeypatch.setattr(transport, "safe_fetch", partial(transport.safe_fetch, allowed_urls=[url]))
    try:
        result = await web.fetch_url(url)
    finally:
        await runner.cleanup()

    if status in (403, 406):
        assert result == "plain agent accepted"
        assert agents == [web.USER_AGENT, "Mozilla/5.0"]
    else:
        assert agents == [web.USER_AGENT]
        assert result == ("first agent response" if status == 200 else
                          f"Error: HTTP {status}: {http_web.Response(status=status).reason}")


@pytest.mark.parametrize("retry_status", [403, 406, 404, 500])
async def test_retry_is_exactly_once_even_when_plain_agent_fails(retry_status, monkeypatch):
    responses = [
        transport.SafeFetchResponse(
            403, {}, b"", "text/plain", "https://example.test", "Forbidden"
        ),
        transport.SafeFetchResponse(
            retry_status, {}, b"", "text/plain", "https://example.test", "Retry rejected"
        ),
    ]
    fetch = AsyncMock(side_effect=responses)
    monkeypatch.setattr(transport, "safe_fetch", fetch)
    result = await web.fetch_url("https://example.test")
    assert result == f"Error: HTTP {retry_status}: Retry rejected"
    assert fetch.await_count == 2
    assert [c.kwargs["headers"] for c in fetch.await_args_list] == [
        {"User-Agent": web.USER_AGENT}, {"User-Agent": "Mozilla/5.0"}
    ]
    assert all(c.args == ("https://example.test",) for c in fetch.await_args_list)
    assert all(c.kwargs["timeout"] == 15.0 for c in fetch.await_args_list)


@pytest.mark.parametrize("error, expected", [
    (transport.BlockedAddressError("blocked"), "blocked address"),
    (transport.ResponseTooLargeError("large"), "response too large"),
    (aiohttp.ClientConnectionError("lost"), "network failure"),
])
async def test_retry_preserves_transport_failures(error, expected, monkeypatch):
    first = transport.SafeFetchResponse(406, {}, b"", "text/plain", "https://example.test")
    fetch = AsyncMock(side_effect=[first, error])
    monkeypatch.setattr(transport, "safe_fetch", fetch)
    assert expected in await web.fetch_url("https://example.test")
    assert fetch.await_count == 2


async def test_network_failure_does_not_retry(monkeypatch):
    fetch = AsyncMock(side_effect=aiohttp.ClientConnectionError("lost"))
    monkeypatch.setattr(transport, "safe_fetch", fetch)
    assert "network failure" in await web.fetch_url("https://example.test")
    assert fetch.await_count == 1
