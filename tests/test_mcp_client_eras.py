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
from src.tools.mcp import protocol as proto
from src.tools.mcp.client import MCPServerConnection, ToolRecord
from src.tools.mcp.errors import MCPConnectError, MCPProtocolError
from src.tools.mcp.transport_http import HttpTransport
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

    async def test_modern_discover_missing_result_type_rejected(self):
        conn = _stdio("modern-missing-discover-result-type")
        with pytest.raises(MCPConnectError, match="server/discover.*resultType"):
            await conn.connect()

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
        conn = _stdio("modern-missing-call-result-type")
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

    async def test_modern_http_unknown_discover_result_type_rejected(self):
        server, url, state = await _http_server("modern")
        conn = MCPServerConnection("m-unknown-result", "http", url=url)
        state["discover_result_type"] = "partial"
        try:
            with pytest.raises(MCPConnectError, match="unknown resultType"):
                await conn.connect()
            assert "initialize" not in state["calls"]
        finally:
            await conn.disconnect()
            await server.close()

    async def test_modern_http_input_required_discover_rejected(self):
        server, url, state = await _http_server("modern")
        conn = MCPServerConnection("m-input-result", "http", url=url)
        state["discover_result_type"] = "input_required"
        try:
            with pytest.raises(MCPConnectError, match="does not support"):
                await conn.connect()
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


class TestHttpSseShapedDirectReplies:
    """The DeepWiki shape: a Streamable HTTP server may answer ANY request-
    POST — probe, initialize, discovery, calls — as an SSE stream instead
    of a JSON body. Live-found 2026-08-28 (mcp.deepwiki.com): the handshake
    sites dropped the streamed reply and died 'initialize failed: no
    response'."""

    async def test_legacy_handshake_over_sse_connects_discovers_calls(self):
        server, url, state = await _http_server("legacy-stateless")
        state["respond_in_sse"] = True
        conn = MCPServerConnection("dw", "http", url=url)
        try:
            await conn.connect()
            assert conn.era == "legacy"
            assert conn.negotiated_version == "2025-06-18"
            assert state["calls"]["server/discover"] == 1
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            outcome = await conn.call_tool(echo, {"text": "hi"})
            assert outcome.ok and "echo: hi" in outcome.text
        finally:
            await conn.disconnect()
            await server.close()

    async def test_modern_probe_result_over_sse_adopts_modern(self):
        server, url, state = await _http_server("modern")
        state["respond_in_sse"] = True
        conn = MCPServerConnection("m-sse-probe", "http", url=url)
        try:
            await conn.connect()
            assert conn.era == "modern"
            assert conn.negotiated_version == "2026-07-28"
            assert "initialize" not in state["calls"]
            discovery = await conn.discover_tools()
            assert any(t.name == "echo" for t in discovery.tools)
        finally:
            await conn.disconnect()
            await server.close()

    async def test_wrong_id_streamed_probe_reply_is_not_accepted(self):
        server, url, state = await _http_server("legacy-stateless")
        state["respond_in_sse"] = True
        state["sse_wrong_id_methods"] = {"server/discover"}
        conn = MCPServerConnection("dw-badprobe", "http", url=url)
        try:
            with pytest.raises(MCPConnectError, match="no usable reply"):
                await conn.connect()
            # A mismatched probe reply is not era evidence — never initialize.
            assert "initialize" not in state["calls"]
        finally:
            await conn.disconnect()
            await server.close()

    async def test_wrong_id_streamed_initialize_reply_fails_honestly(self):
        server, url, state = await _http_server("legacy-stateless")
        state["respond_in_sse"] = True
        state["sse_wrong_id_methods"] = {"initialize"}
        conn = MCPServerConnection("dw-badinit", "http", url=url)
        try:
            with pytest.raises(MCPConnectError, match="initialize failed: no response"):
                await conn.connect()
        finally:
            await conn.disconnect()
            await server.close()

    async def test_duplicate_streamed_responses_are_protocol_failure(self):
        server, url, state = await _http_server("legacy-stateless")
        state["respond_in_sse"] = True
        state["sse_duplicate_methods"] = {"initialize"}
        conn = MCPServerConnection("dw-dupinit", "http", url=url)
        try:
            with pytest.raises(MCPProtocolError, match="duplicate responses"):
                await conn.connect()
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


class TestHttpStrictEraEvidence:
    @pytest.mark.parametrize("mode", ["probe-200-internal", "probe-404-empty"])
    async def test_non_evidence_never_initializes(self, mode):
        server, url, state = await _http_server(mode)
        conn = MCPServerConnection(f"strict-{mode}", "http", url=url)
        try:
            with pytest.raises(MCPConnectError, match="not era evidence"):
                await conn.connect()
            assert "initialize" not in state["calls"]
        finally:
            await conn.disconnect()
            await server.close()

    async def test_http_modern_discover_missing_result_type_rejected(self):
        server, url, state = await _http_server("modern-missing-discover-result-type")
        conn = MCPServerConnection("strict-result-type", "http", url=url)
        try:
            with pytest.raises(MCPConnectError, match="server/discover.*resultType"):
                await conn.connect()
            assert "initialize" not in state["calls"]
        finally:
            await conn.disconnect()
            await server.close()


class TestHttpFailureModes:
    async def test_bare_500_after_call_is_uncertain_never_reissued(self):
        server, url, state = await _http_server("modern-500-call")
        conn = MCPServerConnection("http500", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            outcome = await conn.call_tool(echo, {"text": "accepted"})
            assert outcome.uncertain
            assert state["calls"]["tools/call"] == 1
            assert state["tool_effects"] == 1
        finally:
            await conn.disconnect()
            await server.close()

    async def test_stalled_call_is_uncertain_never_reissued(self):
        server, url, state = await _http_server("modern-stall-call")
        conn = MCPServerConnection("httpstall", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            outcome = await conn.call_tool(echo, {"text": "accepted"}, timeout=0.1)
            assert outcome.uncertain
            assert state["calls"]["tools/call"] == 1
            assert state["tool_effects"] == 1
        finally:
            await conn.disconnect()
            await server.close()

    async def test_http_2025_03_26_receive_side_batch_listing(self):
        server, url, state = await _http_server("legacy-batch")
        conn = MCPServerConnection("httpbatch", "http", url=url)
        try:
            await conn.connect()
            assert conn.negotiated_version == "2025-03-26"
            discovery = await conn.discover_tools()
            assert any(tool.name == "echo" for tool in discovery.tools)
        finally:
            await conn.disconnect()
            await server.close()


class TestSessionRefreshRecovery:
    async def test_discovery_reinitializes_and_retries_once(self):
        server, url, state = await _http_server("legacy-session")
        conn = MCPServerConnection("refresh-session", "http", url=url)
        try:
            await conn.connect()
            state["expire_once"] = True
            before_initialize = state["calls"]["initialize"]
            before_list = state["calls"].get("tools/list", 0)
            discovery = await conn.discover_tools()
            assert any(tool.name == "echo" for tool in discovery.tools)
            assert state["calls"]["initialize"] == before_initialize + 1
            assert state["calls"]["tools/list"] == before_list + 2
            list_sessions = [
                session for method, session in state["session_headers"] if method == "tools/list"
            ]
            assert len(list_sessions) == 2
            assert list_sessions[0] != list_sessions[1]
            assert list_sessions[1] == state["current_session_id"]
            assert conn.connected
        finally:
            await conn.disconnect()
            await server.close()


class TestHttpErrorStatusEraEvidence:
    @pytest.mark.parametrize("code", [-32601, -32022])
    def test_http_5xx_body_never_establishes_era(self, code):
        conn = MCPServerConnection("status-evidence", "http", url="http://example.invalid/mcp")
        outcome = client_mod.PostOutcome(
            client_mod.RESULT_HTTP_ERROR,
            status=500,
            messages=[
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "error": {
                        "code": code,
                        "message": "not evidence",
                        "data": {"supported": ["2026-07-28"]},
                    },
                }
            ],
        )
        with pytest.raises(MCPConnectError, match="not era evidence"):
            conn._classify_http_probe(outcome, outcome.messages[0])  # noqa: SLF001

    async def test_repeated_session_rejection_marks_connection_lost(self):
        server, url, state = await _http_server("legacy-session")
        lost: list[str] = []
        conn = MCPServerConnection(
            "refresh-session-fails", "http", url=url, on_connection_lost=lost.append
        )
        try:
            await conn.connect()
            state["expired"] = True
            with pytest.raises(MCPProtocolError, match="rejected again"):
                await conn.discover_tools()
            assert not conn.connected
            assert lost and "session" in lost[0]
        finally:
            await conn.disconnect()
            await server.close()


class TestCallerCancellationMatrix:
    async def test_stdio_caller_cancel_sends_matching_notification(self):
        conn = _stdio("legacy-cancel")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            sleepy = next(tool for tool in discovery.tools if tool.name == "sleepy")
            probe = next(tool for tool in discovery.tools if tool.name == "cancelled_request_id")
            task = asyncio.create_task(conn.call_tool(sleepy, {"seconds": 5}, timeout=30))
            await asyncio.sleep(0.1)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            for _ in range(20):
                recorded = await conn.call_tool(probe, {})
                if recorded.text != "null":
                    break
                await asyncio.sleep(0.05)
            assert recorded.ok
            assert json.loads(recorded.text) is not None
        finally:
            await conn.disconnect()

    async def test_legacy_http_caller_cancel_sends_matching_notification(self):
        server, url, state = await _http_server("legacy-stall-call")
        conn = MCPServerConnection("legacy-cancel", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            echo = next(tool for tool in discovery.tools if tool.name == "echo")
            task = asyncio.create_task(conn.call_tool(echo, {"text": "side effect"}, timeout=30))
            await asyncio.sleep(0.1)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            for _ in range(20):
                if state["cancelled"]:
                    break
                await asyncio.sleep(0.05)
            assert state["tool_effects"] == 1
            assert len(state["cancelled"]) == 1
            assert state["cancelled"][0]["requestId"] is not None
        finally:
            await conn.disconnect()
            await server.close()

    def test_http_404_plain_method_not_found_is_legacy_evidence(self):
        conn = MCPServerConnection(
            "plain-method-not-found", "http", url="http://example.invalid/mcp"
        )
        outcome = client_mod.PostOutcome(
            client_mod.RESULT_HTTP_ERROR,
            status=404,
            messages=[
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "error": {"code": -32601, "message": "Method not found"},
                }
            ],
        )
        assert conn._classify_http_probe(outcome, outcome.messages[0]) is False  # noqa: SLF001


class TestErrorCorrelationAndPrewrite:
    async def test_wrong_id_modern_error_on_http_400_is_not_modern_evidence(self):
        server, url, _state = await _http_server("probe-400-wrong-id")
        conn = MCPServerConnection("wrong-id-probe", "http", url=url)
        try:
            await conn.connect()
            assert conn.era == proto.ERA_LEGACY
        finally:
            await conn.disconnect()
            await server.close()

    async def test_wrong_id_header_mismatch_is_uncertain_and_never_replayed(self):
        server, url, state = await _http_server("modern")
        conn = MCPServerConnection("wrong-id-call", "http", url=url)
        try:
            await conn.connect()
            tool = next(item for item in (await conn.discover_tools()).tools if item.name == "echo")
            before_list = state["calls"]["tools/list"]
            state["reject_calls"] = 1
            state["reject_wrong_id"] = True
            outcome = await conn.call_tool(tool, {"text": "once"})
            assert outcome.uncertain
            assert state["calls"]["tools/call"] == 1
            assert state["calls"]["tools/list"] == before_list
        finally:
            await conn.disconnect()
            await server.close()

    async def test_http_failure_before_post_is_definite(self):
        conn = MCPServerConnection("prewrite-http", "http", url="http://example.invalid/mcp")
        conn.connected = True
        conn.era = proto.ERA_MODERN
        conn.negotiated_version = proto.MODERN_VERSIONS[0]
        conn._http = HttpTransport("prewrite-http", conn.url)  # noqa: SLF001
        tool = ToolRecord("echo", "", {"type": "object"})
        outcome = await conn.call_tool(tool, {})
        assert outcome.status == "failed"
        assert not outcome.uncertain
        assert "not available" in outcome.text

    async def test_missing_input_schema_is_excluded(self):
        conn = _stdio("missing-schema")
        await conn.connect()
        try:
            discovery = await conn.discover_tools()
            tool = next(item for item in discovery.tools if item.name == "missing_schema")
            assert tool.excluded
            assert "not a JSON Schema object" in tool.exclusion_reason
        finally:
            await conn.disconnect()

    async def test_connection_object_can_reconnect_after_clean_disconnect(self):
        conn = _stdio("legacy")
        await conn.connect()
        await conn.disconnect()
        await conn.connect()
        try:
            assert conn.connected
            assert (await conn.discover_tools()).tools
        finally:
            await conn.disconnect()


class TestAuditIdentifierBounds:
    def test_oversized_original_tool_name_is_rejected(self):
        conn = _stdio("legacy")
        with pytest.raises(MCPProtocolError, match="tool name exceeds 128"):
            conn._validate_tool(  # noqa: SLF001 - authority-level validation pin
                {"name": "t" * 129, "description": "", "inputSchema": {"type": "object"}}
            )


class TestBooleanResponseIds:
    @pytest.mark.parametrize("streamed", [False, True])
    async def test_http_handshake_rejects_boolean_id_alias(self, streamed):
        server, url, state = await _http_server("modern")
        state["respond_in_sse"] = streamed
        state["boolean_id_methods"] = {"server/discover"}
        conn = MCPServerConnection("bool-http", "http", url=url)
        try:
            expected = MCPConnectError if streamed else MCPProtocolError
            with pytest.raises(expected):
                await conn.connect()
            assert conn.era is None
        finally:
            await conn.disconnect()
            await server.close()

    async def test_stdio_handshake_rejects_boolean_id_alias(self, monkeypatch):
        conn = _stdio("modern")
        original = conn._on_stdio_message  # noqa: SLF001

        def inject_bool(msg):
            if msg.get("id") == 1 and "result" in msg:
                msg = dict(msg)
                msg["id"] = True
            original(msg)

        monkeypatch.setattr(conn, "_on_stdio_message", inject_bool)
        with pytest.raises(MCPConnectError):
            await conn.connect()
        assert conn.era is None


class TestBoundedServerRequestReplies:
    async def test_flood_is_bounded_and_disconnect_drains_tasks(self, monkeypatch):
        monkeypatch.setattr(client_mod, "_MAX_SERVER_REPLY_TASKS", 4)
        monkeypatch.setattr(client_mod, "_SERVER_REPLY_DRAIN_TIMEOUT", 0.05)
        conn = _stdio("legacy-pushy-flood")
        entered = asyncio.Event()
        release = asyncio.Event()
        active = 0
        peak = 0

        async def parked_reply(_reply, _channel, **_kwargs):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            entered.set()
            try:
                await release.wait()
            finally:
                active -= 1

        monkeypatch.setattr(conn, "_send_reply", parked_reply)
        await conn.connect()
        try:
            await asyncio.wait_for(entered.wait(), timeout=1)
            for _ in range(100):
                if len(conn._server_reply_tasks) == 4:  # noqa: SLF001
                    break
                await asyncio.sleep(0)
            assert len(conn._server_reply_tasks) <= 4  # noqa: SLF001
            disconnect = asyncio.create_task(conn.disconnect())
            await disconnect
            assert peak <= 4
            assert active == 0
            assert conn._server_reply_tasks == set()  # noqa: SLF001
        finally:
            release.set()
            await conn.disconnect()


class TestStdioProbeCasualtyRespawn:
    """Die-on-unknown-method strict legacy servers (Uncraftbar's field
    report): a clean stdout EOF during the era probe — and ONLY that,
    typed, never text-matched — grants exactly one fresh-process legacy
    attempt. Era is established solely by the fresh initialize."""

    def _count_spawns(self, monkeypatch):
        instances: list = []
        real = client_mod.StdioTransport

        class CountingTransport(real):  # type: ignore[misc, valid-type]
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                instances.append(self)

        monkeypatch.setattr(client_mod, "StdioTransport", CountingTransport)
        return instances

    async def test_strict_legacy_two_spawns_then_full_service(self, monkeypatch):
        spawns = self._count_spawns(monkeypatch)
        conn = _stdio("legacy-die-on-discover")
        await conn.connect()
        try:
            assert len(spawns) == 2
            assert conn.era == "legacy"
            assert conn.negotiated_version == "2025-06-18"
            assert conn.status()["last_error"] == ""
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            outcome = await conn.call_tool(echo, {"text": "respawned"})
            assert outcome.ok and "respawned" in outcome.text
        finally:
            await conn.disconnect()

    async def test_initialized_replacement_that_closes_is_never_published(
        self, monkeypatch, tmp_path,
    ):
        spawns = self._count_spawns(monkeypatch)
        conn = _stdio("legacy-die-after-initialize")
        conn.args.append(str(tmp_path / "spawn-count"))
        with pytest.raises(MCPConnectError) as excinfo:
            await conn.connect()
        message = str(excinfo.value)
        assert len(spawns) == 2
        assert conn.connected is False
        assert "first process exit status 3" in message
        assert "fresh process exit status 8" in message
        assert all(not transport.running for transport in spawns)

    async def test_both_phases_dead_names_both_and_reaps(self, monkeypatch):
        spawns = self._count_spawns(monkeypatch)
        conn = _stdio("legacy-die-always")
        with pytest.raises(MCPConnectError) as excinfo:
            await conn.connect()
        message = str(excinfo.value)
        assert "server/discover ended by unexpected stdio EOF" in message
        assert "fresh legacy initialization failed" in message
        assert "exit status 4" in message
        assert len(spawns) == 2
        # Both children reaped; no transport left owned.
        assert conn._stdio is None  # noqa: SLF001
        for transport in spawns:
            assert not transport.running

    async def test_post_handshake_death_keeps_single_spawn(self, monkeypatch):
        spawns = self._count_spawns(monkeypatch)
        conn = _stdio("dies-mid-call")
        await conn.connect()
        try:
            assert len(spawns) == 1
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            outcome = await conn.call_tool(echo, {"text": "boom"})
            # Existing lost/uncertain semantics — and no compatibility
            # respawn for post-handshake deaths, ever.
            assert not outcome.ok
            assert len(spawns) == 1
        finally:
            await conn.disconnect()

    async def test_compliant_legacy_single_spawn(self, monkeypatch):
        spawns = self._count_spawns(monkeypatch)
        conn = _stdio("legacy")
        await conn.connect()
        try:
            assert len(spawns) == 1
            assert conn.era == "legacy"
        finally:
            await conn.disconnect()

    async def test_non_eof_probe_failure_no_respawn(self, monkeypatch):
        spawns = self._count_spawns(monkeypatch)
        conn = _stdio("oversized-on-discover")
        with pytest.raises(MCPConnectError) as excinfo:
            await conn.connect()
        assert "stdio EOF" not in str(excinfo.value)
        assert len(spawns) == 1

    async def test_protocol_fault_before_eof_forbids_respawn(self, monkeypatch):
        """Malformed output followed by EOF is a protocol-faulted stream,
        never the clean strict-legacy EOF that grants a fresh process."""
        spawns = self._count_spawns(monkeypatch)
        conn = _stdio("legacy-malformed-die-on-discover")
        with pytest.raises(MCPConnectError):
            await conn.connect()
        assert len(spawns) == 1
        assert not spawns[0].closed_by_eof

    async def test_phase_one_reply_tasks_cancelled_before_respawn(self, monkeypatch):
        spawns = self._count_spawns(monkeypatch)
        conn = _stdio("legacy-pushy-die-on-discover")
        started = asyncio.Event()
        cancelled = asyncio.Event()

        async def parked_reply(_reply, _channel, **_kwargs):
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        monkeypatch.setattr(conn, "_send_reply", parked_reply)
        await conn.connect()
        try:
            assert started.is_set()
            assert cancelled.is_set()
            assert conn._server_reply_tasks == set()  # noqa: SLF001
            assert len(spawns) == 2
        finally:
            await conn.disconnect()

    async def test_phase_one_reply_tasks_finish_before_shutdown(self, monkeypatch):
        """Ordering pin: teardown must not await transport shutdown while a
        phase-one reply can still be parked in that transport's send path."""
        conn = _stdio("legacy")

        class ParkedTransport:
            async def send(self, _message):
                await asyncio.Event().wait()

        conn._accept_server_requests = True  # noqa: SLF001
        conn._stdio = ParkedTransport()  # type: ignore[assignment]  # noqa: SLF001
        conn._on_stdio_message(  # noqa: SLF001
            {
                "jsonrpc": "2.0",
                "id": "phase-one-request",
                "method": "sampling/createMessage",
                "params": {},
            }
        )
        await asyncio.sleep(0)

        class DeadTransport:
            returncode = 3

            async def shutdown(self):
                assert conn._server_reply_tasks == set()  # noqa: SLF001

        class FreshTransport:
            async def start(self):
                return None

        monkeypatch.setattr(conn, "_new_stdio_transport", FreshTransport)

        async def fail_initialize():
            raise MCPConnectError("unsupported")

        monkeypatch.setattr(conn, "_initialize_legacy_stdio", fail_initialize)
        with pytest.raises(MCPConnectError):
            await conn._respawn_probe_casualty_for_legacy(  # noqa: SLF001
                DeadTransport()  # type: ignore[arg-type]
            )

    async def test_stdio_server_reply_is_bound_to_originating_transport(self):
        """Even without lifecycle cancellation as a backstop, a delayed
        phase-one reply cannot resolve self._stdio to a replacement."""

        class RecordingTransport:
            def __init__(self):
                self.sent: list[dict] = []

            async def send(self, message):
                self.sent.append(message)

        conn = _stdio("legacy")
        first = RecordingTransport()
        replacement = RecordingTransport()
        conn._accept_server_requests = True  # noqa: SLF001
        conn._stdio = first  # type: ignore[assignment]  # noqa: SLF001
        conn._on_stdio_message(  # noqa: SLF001
            {
                "jsonrpc": "2.0",
                "id": "phase-one-request",
                "method": "sampling/createMessage",
                "params": {},
            }
        )
        # No await occurred after task creation, so this swap precedes the
        # reply coroutine's first instruction deterministically.
        conn._stdio = replacement  # type: ignore[assignment]  # noqa: SLF001
        await conn._drain_server_reply_tasks()  # noqa: SLF001
        assert [msg.get("id") for msg in first.sent] == ["phase-one-request"]
        assert replacement.sent == []

    async def test_delayed_phase_one_exit_status_captured_after_reap(self, monkeypatch):
        spawns = self._count_spawns(monkeypatch)
        conn = _stdio("legacy-delayed-die-discover-bad-version")
        with pytest.raises(MCPConnectError) as excinfo:
            await conn.connect()
        assert "first process exit status 7" in str(excinfo.value)
        assert len(spawns) == 2
        assert all(not transport.running for transport in spawns)

    async def test_exit_status_is_sampled_only_after_shutdown(self, monkeypatch):
        """Deterministic ordering pin: EOF can arrive before wait() publishes
        returncode, so diagnostics must inspect it only after shutdown/reap."""

        class DeadTransport:
            returncode = None

            async def shutdown(self):
                self.returncode = 7

        class FreshTransport:
            async def start(self):
                return None

        conn = _stdio("legacy")
        fresh = FreshTransport()
        monkeypatch.setattr(conn, "_new_stdio_transport", lambda: fresh)

        async def fail_initialize():
            raise MCPConnectError("unsupported")

        monkeypatch.setattr(conn, "_initialize_legacy_stdio", fail_initialize)
        with pytest.raises(MCPConnectError) as excinfo:
            await conn._respawn_probe_casualty_for_legacy(  # noqa: SLF001
                DeadTransport()  # type: ignore[arg-type]
            )
        assert "first process exit status 7" in str(excinfo.value)

    @pytest.mark.parametrize("control", [asyncio.CancelledError, SystemExit, KeyboardInterrupt])
    async def test_respawn_does_not_wrap_process_control_exceptions(self, monkeypatch, control):
        conn = _stdio("legacy-die-on-discover")

        async def stop_control():
            raise control

        monkeypatch.setattr(conn, "_initialize_legacy_stdio", stop_control)
        with pytest.raises(control):
            await conn.connect()
        assert conn._stdio is None  # noqa: SLF001

    async def test_failed_second_phase_reaps_the_living_replacement(self, monkeypatch):
        """Ownership pin: when the fresh process survives its own failed
        initialize (unsupported counteroffer), connect cleanup must reap
        THE REPLACEMENT — reaping only the phase-one corpse leaks a live
        child."""
        spawns = self._count_spawns(monkeypatch)
        conn = _stdio("legacy-die-discover-bad-version")
        with pytest.raises(MCPConnectError):
            await conn.connect()
        assert len(spawns) == 2
        assert conn._stdio is None  # noqa: SLF001
        assert not spawns[1].running, "replacement child must be reaped"
