"""Edge pins: result rendering, manager mutation flows, lost connections,
HTTP definite rejections, HeaderMismatch retry-once recovery."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest
from aiohttp.test_utils import TestServer

from src.tools.mcp.client import MCPServerConnection, _render_tool_result
from src.tools.mcp.errors import MCPConnectError
from src.tools.mcp.manager import (
    STATE_CONNECTED,
    STATE_DISABLED,
    STATE_ERROR,
    MCPManager,
)
from src.tools.mcp.transport_stdio import StdioTransport
from tests.fakes.mcp_http import make_app

FAKE = str(Path(__file__).parent / "fakes" / "mcp_stdio_server.py")


def _stdio_config(mode: str = "legacy", **extra) -> dict:
    return {
        "transport": "stdio",
        "command": sys.executable,
        "args": [FAKE, mode],
        "timeout_seconds": 30,
        **extra,
    }


async def _http_server(mode: str):
    app, state = make_app(mode)
    server = TestServer(app)
    await server.start_server()
    return server, str(server.make_url("/mcp")), state


class TestResultRendering:
    def test_text_content_joined(self):
        text, is_error = _render_tool_result(
            {
                "content": [
                    {"type": "text", "text": "a"},
                    {"type": "text", "text": "b"},
                ]
            }
        )
        assert text == "a\nb" and not is_error

    def test_binary_content_described_not_embedded(self):
        text, _ = _render_tool_result(
            {
                "content": [
                    {"type": "image", "mimeType": "image/png"},
                    {"type": "audio", "mimeType": "audio/wav"},
                    {"type": "resource", "resource": {"uri": "file:///x"}},
                    {"type": "mystery"},
                    "bare string",
                ]
            }
        )
        assert "[image: image/png]" in text
        assert "[audio: audio/wav]" in text
        assert "[resource: file:///x]" in text
        assert "[mystery content]" in text
        assert "bare string" in text

    def test_structured_content_fallback_when_no_text(self):
        text, _ = _render_tool_result({"content": [], "structuredContent": {"answer": 42}})
        assert '"answer": 42' in text

    def test_unrenderable_structured_content(self):
        text, _ = _render_tool_result({"content": [], "structuredContent": {"bad": object()}})
        assert "unrenderable" in text

    def test_empty_result_says_no_output(self):
        text, is_error = _render_tool_result({})
        assert text == "(no output)" and not is_error

    def test_is_error_flag_carried(self):
        _, is_error = _render_tool_result(
            {"content": [{"type": "text", "text": "boom"}], "isError": True}
        )
        assert is_error


class TestManagerMutationFlows:
    async def test_update_server_republishes_under_new_generation(self):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        try:
            assert manager.has_tool("mcp_fake_echo")
            old_gen = manager.get_status()["servers"][0]["generation"]
            await manager.update_server("fake", _stdio_config(tool_allowlist=["fail"]))
            server = manager.get_status()["servers"][0]
            assert server["state"] == STATE_CONNECTED
            assert server["generation"] > old_gen
            assert not manager.has_tool("mcp_fake_echo")
            assert manager.has_tool("mcp_fake_fail")
        finally:
            await manager.shutdown()

    async def test_per_server_disable_via_update_unpublishes(self):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        try:
            assert manager.has_tool("mcp_fake_echo")
            await manager.update_server("fake", _stdio_config(enabled=False))
            server = manager.get_status()["servers"][0]
            assert server["state"] == STATE_DISABLED
            assert manager.get_tool_definitions() == []
        finally:
            await manager.shutdown()

    async def test_global_enable_after_disable_reconnects(self):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        try:
            await manager.set_global_enabled(False)
            assert manager.get_tool_definitions() == []
            await manager.set_global_enabled(True)
            assert manager.get_status()["servers"][0]["state"] == STATE_CONNECTED
            assert manager.has_tool("mcp_fake_echo")
        finally:
            await manager.shutdown()

    async def test_connect_failure_lands_in_error_state(self):
        manager = MCPManager()
        await manager.load_desired_state(
            enabled=True,
            servers={
                "dead": {
                    "transport": "stdio",
                    "command": "/nonexistent/mcp-binary",
                    "timeout_seconds": 10,
                }
            },
        )
        await manager.start()
        try:
            server = manager.get_status()["servers"][0]
            assert server["state"] == STATE_ERROR
            assert "not found" in server["last_error"]
            assert manager.get_tool_definitions() == []
        finally:
            await manager.shutdown()

    async def test_connection_loss_unpublishes_then_supervisor_recovers(self):
        # Observe through the SYNCHRONOUS catalog-changed hook: at each
        # invalidation, record whether the tool is published. The recovery
        # can outrun any polling loop; the hook cannot be missed.
        snapshots: list[bool] = []
        manager = MCPManager()
        manager._on_catalog_changed = lambda: snapshots.append(  # noqa: SLF001
            manager.has_tool("mcp_fake_echo")
        )
        await manager.load_desired_state(
            enabled=True, servers={"fake": _stdio_config("dies-mid-call")}
        )
        await manager.start()
        try:
            assert manager.has_tool("mcp_fake_echo")
            outcome = await manager.execute("mcp_fake_echo", {"text": "boom"})
            assert outcome.uncertain
            for _ in range(200):
                if (
                    False in snapshots
                    and manager.has_tool("mcp_fake_echo")
                    and manager.get_status()["servers"][0]["state"] == STATE_CONNECTED
                ):
                    break
                await asyncio.sleep(0.05)
            assert False in snapshots, "loss never unpublished the tools"
            assert manager.has_tool("mcp_fake_echo"), "supervisor never recovered"
        finally:
            await manager.shutdown()

    async def test_execute_on_disabled_global_is_typed_failure(self):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        try:
            await manager.set_global_enabled(False)
            outcome = await manager.execute("mcp_fake_echo", {"text": "x"})
            assert outcome.status == "failed"
            assert "not currently published" in outcome.text
        finally:
            await manager.shutdown()


class TestHttpCallRejections:
    async def test_header_mismatch_retries_exactly_once_then_succeeds(self):
        server, url, state = await _http_server("modern")
        conn = MCPServerConnection("retry", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            state["reject_calls"] = 1
            before = state["calls"].get("tools/call", 0)
            outcome = await conn.call_tool(echo, {"text": "recovered"})
            assert outcome.ok and "recovered" in outcome.text
            # Validation rejection (-32020) means NOT executed: exactly one
            # spec-sanctioned retry, so two wire attempts total.
            assert state["calls"].get("tools/call", 0) == before + 2
        finally:
            await conn.disconnect()
            await server.close()

    async def test_persistent_header_mismatch_is_definite_failure(self):
        server, url, state = await _http_server("modern")
        conn = MCPServerConnection("retry2", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            echo = next(t for t in discovery.tools if t.name == "echo")
            state["reject_calls"] = 99  # every attempt rejected
            outcome = await conn.call_tool(echo, {"text": "never"})
            assert outcome.status == "failed"
            # One initial attempt + exactly one retry — never more.
            assert 99 - state["reject_calls"] == 2
        finally:
            await conn.disconnect()
            await server.close()


class TestTransportMisuse:
    async def test_double_start_rejected(self):
        transport = StdioTransport(
            "t",
            sys.executable,
            [FAKE, "legacy"],
            on_message=lambda m: None,
            on_closed=lambda r: None,
            negotiated_version=lambda: None,
        )
        await transport.start()
        try:
            with pytest.raises(MCPConnectError, match="already started"):
                await transport.start()
        finally:
            await transport.shutdown()

    async def test_send_after_death_raises_connect_error(self):
        transport = StdioTransport(
            "t",
            sys.executable,
            [FAKE, "legacy"],
            on_message=lambda m: None,
            on_closed=lambda r: None,
            negotiated_version=lambda: None,
        )
        await transport.start()
        await transport.shutdown()
        with pytest.raises(MCPConnectError, match="not running"):
            await transport.send({"jsonrpc": "2.0", "method": "x"})

    async def test_unsupported_transport_kind_rejected(self):
        conn = MCPServerConnection("weird", "carrier-pigeon")
        with pytest.raises(MCPConnectError, match="unsupported transport"):
            await conn.connect()


class TestCallPreconditions:
    async def test_call_on_disconnected_connection_is_typed_failure(self):
        conn = MCPServerConnection("never", "stdio", command=sys.executable)
        from src.tools.mcp.client import ToolRecord

        record = ToolRecord(name="t", description="", input_schema={})
        outcome = await conn.call_tool(record, {})
        assert outcome.status == "failed"
        assert "not connected" in outcome.text

    async def test_call_on_excluded_tool_is_typed_failure(self):
        conn = _live_legacy_connection = MCPServerConnection(
            "fake_legacy",
            "stdio",
            command=sys.executable,
            args=[FAKE, "legacy"],
        )
        await conn.connect()
        try:
            from src.tools.mcp.client import ToolRecord

            excluded = ToolRecord(
                name="bad",
                description="",
                input_schema={},
                excluded=True,
                exclusion_reason="schema too deep",
            )
            outcome = await conn.call_tool(excluded, {})
            assert outcome.status == "failed"
            assert "excluded" in outcome.text
            assert "schema too deep" in outcome.text
        finally:
            await conn.disconnect()


class TestSpawnEdgeCases:
    async def test_non_executable_command_is_connect_error(self):
        transport = StdioTransport(
            "t",
            "/dev/null",  # exists, is not executable → OSError branch
            [],
            on_message=lambda m: None,
            on_closed=lambda r: None,
            negotiated_version=lambda: None,
        )
        with pytest.raises(MCPConnectError, match="failed to start"):
            await transport.start()

    def test_pid_none_before_start(self):
        transport = StdioTransport(
            "t",
            sys.executable,
            [],
            on_message=lambda m: None,
            on_closed=lambda r: None,
            negotiated_version=lambda: None,
        )
        assert transport.pid is None
        assert transport.stderr_tail() == ""

    async def test_empty_command_rejected_by_transport(self):
        transport = StdioTransport(
            "t",
            "",
            [],
            on_message=lambda m: None,
            on_closed=lambda r: None,
            negotiated_version=lambda: None,
        )
        with pytest.raises(MCPConnectError, match="requires 'command'"):
            await transport.start()

    async def test_header_mismatch_relists_and_uses_changed_annotation(self):
        server, url, state = await _http_server("modern")
        conn = MCPServerConnection("metadata-refresh", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            region_tool = next(t for t in discovery.tools if t.name == "region_tool")
            state["header_name"] = "Geo"
            state["reject_calls"] = 1
            before_list = state["calls"].get("tools/list", 0)
            outcome = await conn.call_tool(region_tool, {"region": "eu-north1"})
            assert outcome.ok
            assert state["calls"]["tools/list"] == before_list + 1
            assert state["calls"]["tools/call"] == 2
        finally:
            await conn.disconnect()
            await server.close()

    async def test_header_mismatch_http_200_also_relists_and_retries(self):
        server, url, state = await _http_server("modern")
        conn = MCPServerConnection("metadata-refresh-200", "http", url=url)
        try:
            await conn.connect()
            discovery = await conn.discover_tools()
            region_tool = next(t for t in discovery.tools if t.name == "region_tool")
            state["header_name"] = "Geo"
            state["reject_calls"] = 1
            state["reject_status"] = 200
            before_list = state["calls"].get("tools/list", 0)
            outcome = await conn.call_tool(region_tool, {"region": "eu-north1"})
            assert outcome.ok
            assert state["calls"]["tools/list"] == before_list + 1
            assert state["calls"]["tools/call"] == 2
        finally:
            await conn.disconnect()
            await server.close()
