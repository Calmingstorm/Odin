"""Fake Streamable HTTP MCP servers for tests (aiohttp app factories).

Modes (``make_app(mode)``):
  modern            2026-07-28: validates MCP-Protocol-Version, Mcp-Method,
                    Mcp-Name and Mcp-Param-* header/body congruence
                    (400 + -32020 on mismatch); server/discover; resultType
                    on every result; serves an x-mcp-header annotated tool.
  modern-sse        modern, but request replies arrive as SSE streams with a
                    comment keep-alive and a progress notification first.
  legacy-session    2025-06-18 initialize mints an Mcp-Session-Id; requests
                    without it → 400; after ``state["expired"] = True`` →
                    404; DELETE ends the session; probe gets a bare-400
                    (empty body) so era detection must fall back.
  legacy-stateless  like legacy-session but never mints a session; the
                    probe gets HTTP 200 + JSON-RPC -32601 (the other
                    legacy-detection shape).
  legacy-sse        legacy-stateless whose tools/call replies stream over
                    SSE and include a server-initiated request BEFORE the
                    final response (the client must answer -32601 via POST).
  legacy-batch      2025-03-26 legacy; tools/list arrives as a receive-side batch.
  modern-500-call    tools/call returns a bare HTTP 500 after accepting the POST.
  modern-stall-call  tools/call stalls until the client request budget expires.
  modern-missing-discover-result-type
                    DiscoverResult omits mandatory modern resultType.
  probe-200-internal probe returns HTTP 200 JSON-RPC -32603 (no era evidence).
  probe-404-empty    probe returns an empty HTTP 404 (no era evidence).
  probe-400-wrong-id probe returns HTTP 400 with a wrong-id modern marker.
  auth-401          every request → 401 (era must stay undetermined).

``state`` (returned alongside the app) records per-method call counts —
``state["calls"]["tools/call"]`` pins never-reissued behavior — plus every
reply POSTed by the client for server-initiated requests.

``state["respond_in_sse"] = True`` makes EVERY direct reply — probe,
initialize, discovery, and calls — arrive as an SSE stream (the DeepWiki
shape); ``sse_wrong_id_methods`` / ``sse_duplicate_methods`` corrupt the
streamed reply for the named methods only.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from aiohttp import web

MODERN_VERSION = "2026-07-28"
LEGACY_VERSION = "2025-06-18"


def _tool_defs(*, with_header_param: bool, header_name: str = "Region") -> list[dict]:
    tools = [
        {
            "name": "echo",
            "description": "Echo text back",
            "inputSchema": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
            },
        },
        {
            "name": "fail",
            "description": "Always reports isError",
            "inputSchema": {"type": "object", "properties": {}},
        },
    ]
    if with_header_param:
        tools.append(
            {
                "name": "region_tool",
                "description": "Requires a mirrored Region header",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "region": {"type": "string", "x-mcp-header": header_name},
                        "query": {"type": "string"},
                    },
                },
            }
        )
    return tools


def _result(mode: str, payload: dict) -> dict:
    if mode.startswith("modern"):
        payload = dict(payload)
        payload["resultType"] = "complete"
    return payload


def _rpc_response(msg_id: Any, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _rpc_error(msg_id: Any, code: int, message: str, data: dict | None = None) -> dict:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": msg_id, "error": err}


def _sse_body(messages: list[dict]) -> str:
    parts = [": keep-alive comment\n\n"]
    for msg in messages:
        parts.append(f"data: {json.dumps(msg)}\n\n")
    return "".join(parts)


def make_app(mode: str) -> tuple[web.Application, dict[str, Any]]:
    state: dict[str, Any] = {
        "calls": {},
        "expired": False,
        "session_deleted": False,
        "client_replies": [],
        "pushed": False,
        "expire_once": False,
        "header_name": "Region",
        "discover_result_type": "complete",
        "session_generation": 0,
        "current_session_id": None,
        "session_headers": [],
        "cancelled": [],
        "tool_effects": 0,
        "reject_status": 400,
        "reject_wrong_id": False,
        "delete_mode": "normal",
        # DeepWiki shape: ANY request may be answered in the SSE stream
        # shape (probe, initialize, discovery, calls alike).
        "respond_in_sse": False,
        # Per-method fault knobs for streamed direct replies.
        "sse_wrong_id_methods": set(),
        "sse_duplicate_methods": set(),
    }

    def count(method: str) -> None:
        state["calls"][method] = state["calls"].get(method, 0) + 1

    def _direct(msg: dict, *, method: str = "") -> web.StreamResponse:
        """One direct JSON-RPC reply, honoring ``state["respond_in_sse"]``
        (the DeepWiki shape: any request may be answered as an SSE stream).
        The per-method fault knobs corrupt the streamed reply only."""
        if not state["respond_in_sse"]:
            return web.json_response(msg)
        if method and method in state["sse_wrong_id_methods"]:
            msg = dict(msg)
            msg["id"] = f"wrong-{msg.get('id')}"
        messages = [msg, msg] if method and method in state["sse_duplicate_methods"] else [msg]
        return web.Response(text=_sse_body(messages), content_type="text/event-stream")

    async def endpoint(request: web.Request) -> web.StreamResponse:
        if mode == "auth-401":
            return web.json_response({"error": "unauthorized"}, status=401)
        body = await request.json()
        method = body.get("method")
        msg_id = body.get("id")
        params = body.get("params") or {}

        # Client replies to server-initiated requests arrive as responses.
        if method is None and msg_id is not None:
            state["client_replies"].append(body)
            return web.Response(status=202)

        count(str(method))

        if method == "server/discover" and mode == "probe-200-internal":
            return web.json_response(_rpc_error(msg_id, -32603, "Internal error"))
        if method == "server/discover" and mode == "probe-404-empty":
            return web.Response(status=404)
        if method == "server/discover" and mode == "probe-400-wrong-id":
            return web.json_response(
                _rpc_error(msg_id + 1000, -32022, "Unsupported protocol version"), status=400
            )
        if mode.startswith("modern"):
            return await _modern(request, body, method, msg_id, params)
        return await _legacy(request, body, method, msg_id, params)

    async def _modern(
        request: web.Request, body: dict, method: str, msg_id: Any, params: dict
    ) -> web.StreamResponse:
        if message_is_notification(body):
            if method == "notifications/cancelled":
                state["cancelled"].append(params)
            return web.Response(status=202)
        header_version = request.headers.get("MCP-Protocol-Version")
        meta = params.get("_meta") or {}
        meta_version = meta.get("io.modelcontextprotocol/protocolVersion")
        if header_version != meta_version or not header_version:
            return web.json_response(
                _rpc_error(msg_id, -32020, "Header mismatch: protocol version"),
                status=400,
            )
        if header_version != MODERN_VERSION:
            return web.json_response(
                _rpc_error(
                    msg_id,
                    -32022,
                    "Unsupported protocol version",
                    {"supported": [MODERN_VERSION], "requested": header_version},
                ),
                status=400,
            )
        if request.headers.get("Mcp-Method") != method:
            return web.json_response(
                _rpc_error(msg_id, -32020, "Header mismatch: Mcp-Method"), status=400
            )
        if method == "server/discover":
            result = {
                "supportedVersions": [MODERN_VERSION],
                "capabilities": {"tools": {}},
                "_meta": {
                    "io.modelcontextprotocol/serverInfo": {
                        "name": "fake-modern-http",
                        "version": "1.0",
                    }
                },
            }
            if mode != "modern-missing-discover-result-type":
                result["resultType"] = state["discover_result_type"]
            return _direct(_rpc_response(msg_id, result), method="server/discover")
        if method == "tools/list":
            result = _result(
                mode,
                {
                    "tools": _tool_defs(with_header_param=True, header_name=state["header_name"]),
                    "ttlMs": 90000,
                },
            )
            return _reply(request, msg_id, result)
        if method == "tools/call":
            name = params.get("name", "")
            if mode == "modern-500-call":
                state["tool_effects"] += 1
                return web.Response(status=500)
            if mode == "modern-stall-call":
                state["tool_effects"] += 1
                await asyncio.sleep(60)
                return web.Response(status=500)
            if state.get("reject_calls", 0) > 0:
                state["reject_calls"] -= 1
                return web.json_response(
                    _rpc_error(
                        msg_id + 1000 if state["reject_wrong_id"] else msg_id,
                        -32020,
                        "Header mismatch: transient",
                    ),
                    status=state["reject_status"],
                )
            if request.headers.get("Mcp-Name") != name:
                return web.json_response(
                    _rpc_error(msg_id, -32020, "Header mismatch: Mcp-Name"), status=400
                )
            arguments = params.get("arguments") or {}
            if name == "region_tool":
                region = arguments.get("region")
                header = request.headers.get(f"Mcp-Param-{state['header_name']}")
                if region is not None and header != str(region):
                    return web.json_response(
                        _rpc_error(msg_id, -32020, "Header mismatch: Mcp-Param-Region"),
                        status=400,
                    )
                result = _result(
                    mode,
                    {"content": [{"type": "text", "text": f"region={region}"}]},
                )
                return _reply(request, msg_id, result)
            return _reply(request, msg_id, _run_tool(name, arguments))
        return web.json_response(
            _rpc_error(msg_id, -32601, f"Method not found: {method}"), status=404
        )

    async def _legacy(
        request: web.Request, body: dict, method: str, msg_id: Any, params: dict
    ) -> web.StreamResponse:
        session_mode = mode == "legacy-session"
        if method == "server/discover":
            if mode in {"legacy-stateless", "legacy-sse"}:
                return _direct(
                    _rpc_error(msg_id, -32601, "Method not found"), method="server/discover"
                )
            return web.Response(status=400, text="")  # bare 400, empty body
        if method == "initialize":
            response = _direct(
                _rpc_response(
                    msg_id,
                    {
                        "protocolVersion": (
                            "2025-03-26" if mode == "legacy-batch" else LEGACY_VERSION
                        ),
                        "capabilities": {"tools": {"listChanged": True}},
                        "serverInfo": {"name": f"fake-{mode}", "version": "1.0"},
                    },
                ),
                method="initialize",
            )
            if session_mode:
                state["session_generation"] += 1
                minted = f"fake-session-{state['session_generation']:04d}"
                state["current_session_id"] = minted
                response.headers["Mcp-Session-Id"] = minted
            return response
        if session_mode:
            got = request.headers.get("Mcp-Session-Id")
            state["session_headers"].append((method, got))
            if state["expired"] or state["expire_once"]:
                state["expire_once"] = False
                return web.json_response(_rpc_error(msg_id, -32000, "Session expired"), status=404)
            if got != state["current_session_id"]:
                return web.json_response(_rpc_error(msg_id, -32000, "Missing session"), status=400)
        if message_is_notification(body):
            if method == "notifications/cancelled":
                state["cancelled"].append(params)
            return web.Response(status=202)
        if method == "tools/list":
            result = {"tools": _tool_defs(with_header_param=False)}
            if mode == "legacy-batch":
                return web.json_response(
                    [
                        _rpc_response(msg_id, result),
                        {
                            "jsonrpc": "2.0",
                            "method": "notifications/message",
                            "params": {"level": "info", "data": "batched hello"},
                        },
                    ]
                )
            return _reply(request, msg_id, result)
        if method == "tools/call":
            name = params.get("name", "")
            arguments = params.get("arguments") or {}
            if mode == "legacy-stall-call":
                state["tool_effects"] += 1
                await asyncio.sleep(60)
                return web.Response(status=500)
            if mode == "legacy-sse" and not state["pushed"]:
                state["pushed"] = True
                messages = [
                    {
                        "jsonrpc": "2.0",
                        "id": "srv-http-req-1",
                        "method": "roots/list",
                        "params": {},
                    },
                    _rpc_response(msg_id, _run_tool(name, arguments)),
                ]
                return web.Response(text=_sse_body(messages), content_type="text/event-stream")
            return _reply(request, msg_id, _run_tool(name, arguments))
        return web.json_response(_rpc_error(msg_id, -32601, "Method not found"))

    def _reply(request: web.Request, msg_id: Any, result: dict) -> web.StreamResponse:
        response_msg = _rpc_response(msg_id, result)
        if mode.endswith("-sse") or state["respond_in_sse"]:
            progress = {
                "jsonrpc": "2.0",
                "method": "notifications/progress",
                "params": {"progress": 1},
            }
            return web.Response(
                text=_sse_body([progress, response_msg]),
                content_type="text/event-stream",
            )
        return web.json_response(response_msg)

    def _run_tool(name: str, arguments: dict) -> dict:
        if name == "echo":
            return _result(
                mode,
                {"content": [{"type": "text", "text": f"echo: {arguments.get('text', '')}"}]},
            )
        if name == "fail":
            return _result(
                mode,
                {
                    "content": [{"type": "text", "text": "deliberate failure"}],
                    "isError": True,
                },
            )
        return _result(
            mode,
            {"content": [{"type": "text", "text": f"unknown tool {name}"}], "isError": True},
        )

    async def delete_endpoint(request: web.Request) -> web.Response:
        if request.headers.get("Mcp-Session-Id") == state["current_session_id"]:
            state["session_deleted"] = True
            if state["delete_mode"] == "oversized":
                return web.Response(body=b"x" * (2 * 1024 * 1024 + 1))
            if state["delete_mode"] == "stall":
                await asyncio.sleep(60)
            return web.Response(status=200)
        return web.Response(status=405)

    app = web.Application()
    app.router.add_post("/mcp", endpoint)
    app.router.add_delete("/mcp", delete_endpoint)
    return app, state


def message_is_notification(body: dict) -> bool:
    return "method" in body and ("id" not in body or body.get("id") is None)
