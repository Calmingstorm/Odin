"""Tests for HttpRequestTool."""

import pytest
from aioresponses import aioresponses

from src.odin.context import ExecutionContext
from src.odin.tools.http import HttpRequestTool


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
