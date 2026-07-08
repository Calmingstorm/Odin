"""Coverage for src/tools/web.py fetch/search/parse (RFC-006 P17, safe).

Pure HTML→text conversion and DuckDuckGo result parsing, plus fetch_url and
web_search with aiohttp.ClientSession FAKED (a queue-backed fake session/response)
and the SSRF is_url_blocked guard patched. SAFE: no real HTTP request, no network;
only in-memory HTML strings and faked transport. Covers the blocked-URL, non-200,
network-error, and content-type branches.
"""
from __future__ import annotations

from unittest.mock import patch

import aiohttp

from src.tools import web


class _Resp:
    """Fake aiohttp response context manager."""

    def __init__(self, status=200, reason="OK", headers=None, body=""):
        self.status = status
        self.reason = reason
        self.headers = headers or {}
        self._body = body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def text(self, errors="strict"):
        return self._body


class _Session:
    """Fake aiohttp.ClientSession context manager; .get() returns a queued _Resp."""

    def __init__(self, resp=None, raise_on_get=None):
        self._resp = resp
        self._raise = raise_on_get

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def get(self, url, **kw):
        if self._raise is not None:
            raise self._raise
        return self._resp


def _session_patch(session):
    return patch("aiohttp.ClientSession", return_value=session)


class TestHtmlToText:
    def test_skips_script_keeps_block_text(self):
        out = web._html_to_text(
            "<script>var x=1;</script><style>.a{}</style><p>Hello</p><div>World</div>")
        assert "Hello" in out and "World" in out
        assert "var x" not in out and ".a{}" not in out  # script/style skipped


class TestParseDdgResults:
    def test_parses_links_snippets_and_uddg(self):
        html = (
            '<a class="result__a" href="https://example.com/page">Example <b>Title</b></a>'
            '<td class="result__snippet">A useful snippet.</td>'
            '<a class="result__a" '
            'href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Freal.com%2Fx&rut=z">Second</a>'
            '<td class="result__snippet">Second snippet.</td>'
        )
        out = web._parse_ddg_results(html, max_results=5)
        assert "1. Example Title" in out and "https://example.com/page" in out
        assert "A useful snippet." in out
        assert "https://real.com/x" in out  # uddg redirect unwrapped

    def test_no_results(self):
        assert web._parse_ddg_results("<html>nothing here</html>", 5) == "No results found."


class TestFetchUrl:
    async def test_blocked_url(self):
        with patch("src.tools.url_safety.is_url_blocked", return_value=True):
            out = await web.fetch_url("http://169.254.169.254/latest/meta-data")
        assert "blocked address" in out

    async def test_html_success_and_json_and_text(self):
        with patch("src.tools.url_safety.is_url_blocked", return_value=False):
            with _session_patch(_Session(_Resp(
                    headers={"Content-Type": "text/html"}, body="<p>hi there</p>"))):
                assert "hi there" in await web.fetch_url("http://x")
            with _session_patch(_Session(_Resp(
                    headers={"Content-Type": "application/json"}, body='{"a":1}'))):
                assert await web.fetch_url("http://x") == '{"a":1}'
            with _session_patch(_Session(_Resp(
                    headers={"Content-Type": "text/plain"}, body="plain text"))):
                assert await web.fetch_url("http://x") == "plain text"

    async def test_non_200_and_truncation(self):
        with patch("src.tools.url_safety.is_url_blocked", return_value=False):
            with _session_patch(_Session(_Resp(status=404, reason="Not Found"))):
                assert "Error: HTTP 404: Not Found" in await web.fetch_url("http://x")
            with _session_patch(_Session(_Resp(
                    headers={"Content-Type": "text/plain"}, body="z" * 100))):
                out = await web.fetch_url("http://x", max_chars=10)
                assert out.startswith("z" * 10) and "truncated" in out

    async def test_network_and_generic_errors(self):
        with patch("src.tools.url_safety.is_url_blocked", return_value=False):
            with _session_patch(_Session(raise_on_get=aiohttp.ClientError("neterr"))):
                assert "network failure" in await web.fetch_url("http://x")
            with _session_patch(_Session(raise_on_get=RuntimeError("boom"))):
                assert "Error: boom" in await web.fetch_url("http://x")


class TestWebSearch:
    async def test_success_parses_results(self):
        html = ('<a class="result__a" href="https://r.com">Res</a>'
                '<td class="result__snippet">snip</td>')
        with _session_patch(_Session(_Resp(body=html))):
            out = await web.web_search("query")
        assert "Res" in out and "https://r.com" in out

    async def test_non_200(self):
        with _session_patch(_Session(_Resp(status=503))):
            assert "Search failed: HTTP 503" in await web.web_search("q")

    async def test_network_and_generic_errors(self):
        with _session_patch(_Session(raise_on_get=aiohttp.ClientError("neterr"))):
            assert "Search error" in await web.web_search("q")
        with _session_patch(_Session(raise_on_get=RuntimeError("boom"))):
            assert "Error: boom" in await web.web_search("q")
