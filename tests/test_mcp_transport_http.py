"""HTTP transport unit pins: managed-header protection, redirect rejection,
bounded bodies, SSE parsing edges — the pieces the era suite exercises only
indirectly."""

from __future__ import annotations

import json

import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer

from src.tools.mcp.errors import MCPConnectError, MCPProtocolError
from src.tools.mcp.transport_http import (
    RESULT_HTTP_ERROR,
    RESULT_JSON,
    HttpTransport,
    _filter_configured_headers,
)


class TestManagedHeaders:
    def test_configured_headers_cannot_override_managed(self):
        filtered = _filter_configured_headers(
            {
                "Authorization": "Bearer keepme",
                "X-Custom": "ok",
                "Host": "evil.example",
                "MCP-Protocol-Version": "1999-01-01",
                "mcp-session-id": "forged",
                "Mcp-Method": "forged",
                "Mcp-Name": "forged",
                "Mcp-Param-Region": "forged",
                "Content-Length": "0",
                "Accept": "text/html",
            }
        )
        assert filtered == {"Authorization": "Bearer keepme", "X-Custom": "ok"}

    def test_rejects_non_http_url(self):
        with pytest.raises(MCPConnectError):
            HttpTransport("s", "ftp://example.com/mcp")
        with pytest.raises(MCPConnectError):
            HttpTransport("s", "")


async def _serve(handler) -> tuple[TestServer, str]:
    app = web.Application()
    app.router.add_post("/mcp", handler)
    server = TestServer(app)
    await server.start_server()
    return server, str(server.make_url("/mcp"))


class TestPostMechanics:
    async def test_redirects_are_refused(self):
        async def handler(request):
            raise web.HTTPFound(location="https://elsewhere.example/mcp")

        server, url = await _serve(handler)
        transport = HttpTransport("s", url)
        await transport.start()
        try:
            with pytest.raises(MCPConnectError, match="redirect"):
                await transport.post(
                    {"jsonrpc": "2.0", "id": 1, "method": "x"},
                    protocol_version=None,
                )
        finally:
            await transport.close()
            await server.close()

    async def test_oversized_json_body_rejected(self, monkeypatch):
        import src.tools.mcp.transport_http as http_mod

        monkeypatch.setattr(http_mod, "WIRE_RESULT_CEILING", 1024)

        async def handler(request):
            return web.json_response({"jsonrpc": "2.0", "id": 1, "result": {"pad": "x" * 4096}})

        server, url = await _serve(handler)
        transport = HttpTransport("s", url)
        await transport.start()
        try:
            with pytest.raises(MCPProtocolError, match="exceeds"):
                await transport.post(
                    {"jsonrpc": "2.0", "id": 1, "method": "x"},
                    protocol_version=None,
                )
        finally:
            await transport.close()
            await server.close()

    async def test_error_body_kept_only_as_bounded_snippet(self):
        async def handler(request):
            return web.Response(status=500, text="<html>" + "upstream garbage " * 500 + "</html>")

        server, url = await _serve(handler)
        transport = HttpTransport("s", url)
        await transport.start()
        try:
            outcome = await transport.post(
                {"jsonrpc": "2.0", "id": 1, "method": "x"},
                protocol_version=None,
            )
            assert outcome.kind == RESULT_HTTP_ERROR
            assert outcome.status == 500
            assert len(outcome.body_snippet) <= 200
        finally:
            await transport.close()
            await server.close()

    async def test_sse_comments_and_split_frames_parse(self):
        response_msg = {"jsonrpc": "2.0", "id": 1, "result": {"ok": True}}
        note = {"jsonrpc": "2.0", "method": "notifications/progress", "params": {}}

        async def handler(request):
            resp = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
            await resp.prepare(request)
            await resp.write(b": keep-alive\n\n")
            payload = f"data: {json.dumps(note)}\n\n".encode()
            await resp.write(payload[:10])  # deliberately split mid-frame
            await resp.write(payload[10:])
            await resp.write(f"data: {json.dumps(response_msg)}\n\n".encode())
            await resp.write_eof()
            return resp

        server, url = await _serve(handler)
        transport = HttpTransport("s", url)
        await transport.start()
        seen: list[dict] = []
        try:
            outcome = await transport.post(
                {"jsonrpc": "2.0", "id": 1, "method": "x"},
                protocol_version=None,
                on_message=seen.append,
            )
            assert outcome.kind == "stream_ended"
            methods = [m.get("method") for m in seen]
            assert "notifications/progress" in methods
            assert any(m.get("id") == 1 for m in seen)
        finally:
            await transport.close()
            await server.close()

    async def test_plain_json_response(self):
        async def handler(request):
            return web.json_response({"jsonrpc": "2.0", "id": 7, "result": {}})

        server, url = await _serve(handler)
        transport = HttpTransport("s", url)
        await transport.start()
        try:
            outcome = await transport.post(
                {"jsonrpc": "2.0", "id": 7, "method": "x"},
                protocol_version=None,
            )
            assert outcome.kind == RESULT_JSON
            assert outcome.messages[0]["id"] == 7
        finally:
            await transport.close()
            await server.close()

    async def test_configured_auth_header_reaches_the_wire(self):
        seen: dict = {}

        async def handler(request):
            seen.update(request.headers)
            return web.json_response({"jsonrpc": "2.0", "id": 1, "result": {}})

        server, url = await _serve(handler)
        transport = HttpTransport("s", url, headers={"Authorization": "Bearer tok"})
        await transport.start()
        try:
            await transport.post(
                {"jsonrpc": "2.0", "id": 1, "method": "x"},
                protocol_version="2025-06-18",
            )
            assert seen.get("Authorization") == "Bearer tok"
            assert seen.get("MCP-Protocol-Version") == "2025-06-18"
            assert "application/json" in seen.get("Accept", "")
            assert "text/event-stream" in seen.get("Accept", "")
        finally:
            await transport.close()
            await server.close()
