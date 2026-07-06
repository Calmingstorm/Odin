"""Tests for HttpRequestTool."""

import aiohttp
import pytest

_aiohttp_major_minor = tuple(int(x) for x in aiohttp.__version__.split(".")[:2])

pytestmark = pytest.mark.skipif(
    _aiohttp_major_minor >= (3, 11),
    reason="aioresponses 0.7.x incompatible with aiohttp >= 3.11 (stream_writer kwarg)",
)

from aioresponses import (  # noqa: E402 — deliberate mid-file import (see block comment)
    aioresponses,
)

from src.odin.context import (  # noqa: E402 — deliberate mid-file import (see block comment)
    ExecutionContext,
)
from src.odin.tools.http import (  # noqa: E402 — deliberate mid-file import (see block comment)
    HttpRequestTool,
)


@pytest.mark.asyncio
async def test_get_json():
    with aioresponses() as m:
        m.get("http://example.com/api", payload={"ok": True})
        tool = HttpRequestTool()
        result = await tool.execute(
            {"url": "http://example.com/api"}, ExecutionContext()
        )
        assert result["status"] == 200
        assert result["body"] == {"ok": True}


@pytest.mark.asyncio
async def test_post_with_body():
    with aioresponses() as m:
        m.post("http://example.com/api", payload={"created": True})
        tool = HttpRequestTool()
        result = await tool.execute(
            {
                "url": "http://example.com/api",
                "method": "POST",
                "body": {"name": "odin"},
            },
            ExecutionContext(),
        )
        assert result["status"] == 200
        assert result["body"]["created"] is True


@pytest.mark.asyncio
async def test_text_response():
    with aioresponses() as m:
        m.get("http://example.com/page", body="hello")
        tool = HttpRequestTool()
        result = await tool.execute(
            {"url": "http://example.com/page", "json_response": False},
            ExecutionContext(),
        )
        assert result["body"] == "hello"


@pytest.mark.asyncio
async def test_non_200_status():
    with aioresponses() as m:
        m.get("http://example.com/err", status=404, payload={"error": "not found"})
        tool = HttpRequestTool()
        result = await tool.execute(
            {"url": "http://example.com/err"}, ExecutionContext()
        )
        assert result["status"] == 404
