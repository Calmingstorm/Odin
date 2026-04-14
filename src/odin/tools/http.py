"""HTTP request tool."""

from __future__ import annotations

from typing import Any

from odin.tools.base import BaseTool
from odin.context import ExecutionContext


class HttpRequestTool(BaseTool):
    """Make an async HTTP request."""

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> Any:
        import aiohttp

        method = params.get("method", "GET").upper()
        url = params["url"]
        headers = params.get("headers", {})
        body = params.get("body")

        async with aiohttp.ClientSession() as session:
            async with session.request(
                method, url, headers=headers, json=body if body else None
            ) as resp:
                try:
                    data = await resp.json()
                except Exception:
                    data = await resp.text()
                return {
                    "status": resp.status,
                    "body": data,
                    "headers": dict(resp.headers),
                }

    @classmethod
    def param_schema(cls) -> dict[str, Any]:
        return {
            "url": {"type": "string", "required": True},
            "method": {"type": "string", "default": "GET"},
            "headers": {"type": "object"},
            "body": {"type": "object"},
        }
