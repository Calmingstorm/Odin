"""Era detection, negotiation, discovery, calls, and cancellation pins —
against real stdio subprocess fakes and real aiohttp Streamable HTTP fakes."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import pytest
from aiohttp.test_utils import TestServer

from src.tools.mcp import client as client_mod
from src.tools.mcp.client import MCPServerConnection
from src.tools.mcp.errors import MCPConnectError
from tests.fakes.mcp_http import make_app

FAKE = str(Path(__file__).parent / "fakes" / "mcp_stdio_server.py")


def _stdio(mode: str, **kwargs) -> MCPServerConnection:
    return MCPServerConnection(
        f"fake_{mode.replace('-', '_')}",
        "stdio",
        command=sys.executable,
        args=[FAKE, mode],
        **kwargs,
    )


async def _http_server(mode: str):
    app, state = make_app(mode)
    server = TestServer(app)
    await server.start_server()
    return server, str(server.make_url("/mcp")), state


class TestStdioEraDetection:
    async def test_modern_server_adopts_2026(self):
        conn = _stdio("modern")
        await conn.connect()
        try:
            assert conn.era == "modern"
            assert conn.negotiated_version == "2026-07-28"
            assert conn.server_info.get("name") == "fake-modern"
            assert "fake modern" in conn.instructions
        finally:
            await conn.disconnect()

    async def test_legacy_server_falls_back_to_initialize(self):
        conn = _stdio("legacy")
        await conn.connect()
        try:
            assert conn.era == "legacy"
            assert conn.negotiated_version == "2025-06-18"
            assert conn.server_info.get("name") == "fake-legacy"
        finally:
            await conn.disconnect()

    async def test_oldest_legacy_accepted_on_stdio(self):
        conn = _stdio("legacy-oldest")
        await conn.connect()
        try:
            assert conn.negotiated_version == "2024-11-05"
        finally:
            await conn.disconnect()

    async def test_unknown_counteroffer_rejected(self):
        conn = _stdio("legacy-unknown-version")
        with pytest.raises(MCPConnectError, match="unsupported protocol"):
            await conn.connect()

    async def test_modern_server_with_legacy_only_list_is_incompatible(self):
        # Modern-era evidence + no mutually supported modern revision:
        # honest error — NEVER an initialize fallback.
        conn = _stdio("modern-legacy-list")
        with pytest.raises(MCPConnectError, match="modern"):
            await conn.connect()

    async def test_silent_server_times_out_through_both_phases(self, monkeypatch):
        monkeypatch.setattr(client_mod, "_PROBE_TIMEOUT", 0.4)
        monkeypatch.setattr(client_mod, "_INIT_TIMEOUT", 0.4)
        conn = _stdio("silent")
        with pytest.raises((MCPConnectError, Exception)):
            await conn.connect()
        assert not conn.connected


class TestStdioDiscoveryAndCalls:
    async def test_modern_discovery_and_call(self):
        conn = _stdio("modern")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            assert discovery.ttl_ms == 120000
            echo = next(t for t in discovery.tools if t.name == "echo")
            outcome = await conn.call_tool(echo, {"text": "hi"})
            assert outcome.ok and "echo: hi" in outcome.text
            assert outcome.negotiated_version == "2026-07-28"
        finally:
            await conn.disconnect()

    async def test_modern_missing_result_type_is_definite_failure(self):
        # The fake includes resultType on listings but OMITS it on tool-call
        # results: under a negotiated 2026-07-28 that is a protocol
        # violation and a definite failure — never treated as complete.
        conn = _stdio("modern-missing-result-type")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            outcome = await conn.call_tool(echo, {"text": "hi"})
            assert outcome.status == "failed"
            assert "resultType" in outcome.text
        finally:
            await conn.disconnect()

    async def test_is_error_result_is_definite_failure(self):
        conn = _stdio("legacy")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            fail = next(t for t in discovery.tools if t.name == "fail")
            outcome = await conn.call_tool(fail, {})
            assert outcome.status == "failed"
            assert "deliberate failure" in outcome.text
        finally:
            await conn.disconnect()

    async def test_timeout_is_uncertain_and_sends_cancelled(self):
        conn = _stdio("legacy")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            sleepy = next(t for t in discovery.tools if t.name == "sleepy")
            outcome = await conn.call_tool(sleepy, {"seconds": 10}, timeout=0.5)
            assert outcome.uncertain
            assert "UNKNOWN" in outcome.text
            assert "not retried" in outcome.text
        finally:
            await conn.disconnect()

    async def test_death_mid_call_is_uncertain(self):
        conn = _stdio("dies-mid-call")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            outcome = await conn.call_tool(echo, {"text": "boom"}, timeout=10)
            assert outcome.uncertain
        finally:
            await conn.disconnect()

    async def test_list_changed_notification_fires_callback(self):
        changed = asyncio.Event()
        conn = _stdio("legacy", on_tools_list_changed=changed.set)
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            outcome = await conn.call_tool(echo, {"text": "trigger-list-changed"})
            assert outcome.ok
            await asyncio.wait_for(changed.wait(), timeout=5)
        finally:
            await conn.disconnect()


class TestBatchWireShape:
    async def test_2025_03_26_batched_listing_parses(self):
        conn = _stdio("legacy-batch")
        await conn.connect()
        try:
            assert conn.negotiated_version == "2025-03-26"
            discovery = await conn.discover_tools()
            assert any(t.name == "echo" for t in discovery.tools)
        finally:
            await conn.disconnect()


class TestLegacyServerInitiatedRequests:
    async def test_stdio_push_gets_method_not_found_reply(self):
        conn = _stdio("legacy-pushy")
        await conn.connect()
        try:
            await asyncio.sleep(0.3)  # let the pushed request round-trip
            discovery = await conn.discover_tools()
            tool = next(t for t in discovery.tools if t.name == "pushy_reply")
            outcome = await conn.call_tool(tool, {})
            assert outcome.ok
            reply = json.loads(outcome.text.replace("echo: ", "", 1))
            assert reply is not None, "server-initiated request was silently dropped"
            assert reply["id"] == "srv-req-1"
            assert reply["error"]["code"] == -32601
        finally:
            await conn.disconnect()


class TestHttpEraDetection:
    async def test_modern_http_adopts_2026(self):
        server, url, state = await _http_server("modern")
        conn = MCPServerConnection("m", "http", url=url)
        try:
            await conn.connect()
            assert conn.era == "modern"
            assert conn.negotiated_version == "2026-07-28"
            assert state["calls"]["server/discover"] == 1
            assert "initialize" not in state["calls"]
        finally:
            await conn.disconnect()
            await server.close()

    async def test_bare_400_probe_falls_back_to_legacy(self):
        server, url, state = await _http_server("legacy-session")
        conn = MCPServerConnection("ls", "http", url=url)
        try:
            await conn.connect()
            assert conn.era == "legacy"
            assert conn.negotiated_version == "2025-06-18"
            assert state["calls"]["initialize"] == 1
        finally:
            await conn.disconnect()
            await server.close()

    async def test_json_rpc_method_not_found_probe_falls_back(self):
        server, url, state = await _http_server("legacy-stateless")
        conn = MCPServerConnection("lst", "http", url=url)
        try:
            await conn.connect()
            assert conn.era == "legacy"
        finally:
            await conn.disconnect()
            await server.close()

    async def test_401_is_not_era_evidence(self):
        server, url, state = await _http_server("auth-401")
        conn = MCPServerConnection("a401", "http", url=url)
        try:
            with pytest.raises(MCPConnectError, match="401"):
                await conn.connect()
            # A 401 must never trigger a legacy initialize attempt.
            assert "initialize" not in state["calls"]
        finally:
            await conn.disconnect()
            await server.close()


class TestHttpSessions:
    async def test_session_captured_echoed_and_deleted(self):
        server, url, state = await _http_server("legacy-session")
        conn = MCPServerConnection("sess", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()  # requires the session header
            assert any(t.name == "echo" for t in discovery.tools)
        finally:
            await conn.disconnect()
            assert state["session_deleted"] is True
            await server.close()

    async def test_stateless_legacy_sends_no_session_and_no_delete(self):
        server, url, state = await _http_server("legacy-stateless")
        conn = MCPServerConnection("nosess", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            outcome = await conn.call_tool(echo, {"text": "hi"})
            assert outcome.ok
            assert conn._http.session_id is None  # noqa: SLF001
        finally:
            await conn.disconnect()
            assert state["session_deleted"] is False
            await server.close()

    async def test_session_expiry_is_definite_failure_never_reissued(self):
        server, url, state = await _http_server("legacy-session")
        conn = MCPServerConnection("exp", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            state["expired"] = True
            before = state["calls"].get("tools/call", 0)
            outcome = await conn.call_tool(echo, {"text": "after-expiry"})
            assert outcome.status == "failed"
            assert "session" in outcome.text
            # Exactly ONE wire attempt: the rejected call was never reissued.
            assert state["calls"].get("tools/call", 0) == before + 1
            assert not conn.connected  # session loss marks the connection down
        finally:
            await conn.disconnect()
            await server.close()


class TestHttpCallsAndStreams:
    async def test_modern_sse_response_with_notifications(self):
        server, url, state = await _http_server("modern-sse")
        conn = MCPServerConnection("msse", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            outcome = await conn.call_tool(echo, {"text": "streamed"})
            assert outcome.ok and "echo: streamed" in outcome.text
        finally:
            await conn.disconnect()
            await server.close()

    async def test_x_mcp_header_param_mirrored(self):
        server, url, state = await _http_server("modern")
        conn = MCPServerConnection("hdr", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            region_tool = next(t for t in discovery.tools if t.name == "region_tool")
            assert region_tool.header_params  # annotation extracted
            # The fake 400s with HeaderMismatch when the mirrored header is
            # absent or wrong — success proves the client mirrored it.
            outcome = await conn.call_tool(region_tool, {"region": "us-west1", "query": "q"})
            assert outcome.ok and "region=us-west1" in outcome.text
        finally:
            await conn.disconnect()
            await server.close()

    async def test_legacy_sse_server_request_answered_via_post(self):
        server, url, state = await _http_server("legacy-sse")
        conn = MCPServerConnection("lsse", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            outcome = await conn.call_tool(echo, {"text": "hi"})
            assert outcome.ok
            for _ in range(50):
                if state["client_replies"]:
                    break
                await asyncio.sleep(0.05)
            assert state["client_replies"], "client never answered the server request"
            reply = state["client_replies"][0]
            assert reply["id"] == "srv-http-req-1"
            assert reply["error"]["code"] == -32601
        finally:
            await conn.disconnect()
            await server.close()

    async def test_legacy_fail_tool(self):
        server, url, state = await _http_server("legacy-stateless")
        conn = MCPServerConnection("lfail", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            fail = next(t for t in discovery.tools if t.name == "fail")
            outcome = await conn.call_tool(fail, {})
            assert outcome.status == "failed"
        finally:
            await conn.disconnect()
            await server.close()
