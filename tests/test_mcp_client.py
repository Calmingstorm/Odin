"""Tests for MCP (Model Context Protocol) client (Round 16).

Tests the MCP client module: tool name generation/parsing, MCPServerConnection
protocol handling, MCPManager orchestration, background task integration,
and REST API endpoints.
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.tools.mcp_client import (
    MCPError,
    MCPManager,
    MCPServerConnection,
    make_tool_name,
    parse_tool_name,
    PROTOCOL_VERSION,
    CLIENT_INFO,
)
from src.config.schema import MCPConfig, MCPServerConfig, Config


# ---------------------------------------------------------------------------
# Tool name helpers
# ---------------------------------------------------------------------------


class TestMakeToolName:
    def test_basic(self):
        assert make_tool_name("myserver", "read_file") == "mcp_myserver_read_file"

    def test_single_char_names(self):
        assert make_tool_name("s", "t") == "mcp_s_t"

    def test_underscores_in_tool(self):
        assert make_tool_name("srv", "a_b_c") == "mcp_srv_a_b_c"

    def test_numeric_server(self):
        assert make_tool_name("srv1", "tool") == "mcp_srv1_tool"


class TestParseToolName:
    def test_basic(self):
        result = parse_tool_name("mcp_myserver_read_file")
        assert result == ("myserver", "read_file")

    def test_tool_with_underscores(self):
        result = parse_tool_name("mcp_srv_a_b_c")
        assert result == ("srv", "a_b_c")

    def test_not_mcp_prefix(self):
        assert parse_tool_name("run_command") is None

    def test_no_server_separator(self):
        assert parse_tool_name("mcp_") is None

    def test_empty_string(self):
        assert parse_tool_name("") is None

    def test_just_prefix(self):
        assert parse_tool_name("mcp_x") is None

    def test_roundtrip(self):
        name = make_tool_name("myserver", "read_file")
        result = parse_tool_name(name)
        assert result == ("myserver", "read_file")

    def test_single_char_parts(self):
        result = parse_tool_name("mcp_s_t")
        assert result == ("s", "t")


# ---------------------------------------------------------------------------
# MCPConfig schema
# ---------------------------------------------------------------------------


class TestMCPConfig:
    def test_defaults(self):
        cfg = MCPConfig()
        assert cfg.enabled is False
        assert cfg.servers == {}

    def test_with_servers(self):
        cfg = MCPConfig(
            enabled=True,
            servers={
                "test": MCPServerConfig(
                    transport="stdio",
                    command="/usr/bin/mcp-server",
                    args=["--verbose"],
                )
            },
        )
        assert cfg.enabled is True
        assert "test" in cfg.servers
        assert cfg.servers["test"].command == "/usr/bin/mcp-server"
        assert cfg.servers["test"].args == ["--verbose"]

    def test_http_transport(self):
        cfg = MCPServerConfig(
            transport="http",
            url="http://localhost:8080/mcp",
            headers={"Authorization": "Bearer tok"},
        )
        assert cfg.transport == "http"
        assert cfg.url == "http://localhost:8080/mcp"
        assert cfg.headers["Authorization"] == "Bearer tok"

    def test_invalid_transport(self):
        with pytest.raises(ValueError, match="Invalid transport"):
            MCPServerConfig(transport="grpc")

    def test_default_timeout(self):
        cfg = MCPServerConfig()
        assert cfg.timeout_seconds == 120

    def test_env_dict(self):
        cfg = MCPServerConfig(env={"FOO": "bar"})
        assert cfg.env["FOO"] == "bar"

    def test_config_includes_mcp(self):
        cfg = Config(discord={"token": "test"})
        assert hasattr(cfg, "mcp")
        assert isinstance(cfg.mcp, MCPConfig)
        assert cfg.mcp.enabled is False

    def test_stdio_defaults(self):
        cfg = MCPServerConfig(transport="stdio")
        assert cfg.command == ""
        assert cfg.args == []
        assert cfg.env == {}

    def test_http_defaults(self):
        cfg = MCPServerConfig(transport="http")
        assert cfg.url == ""
        assert cfg.headers == {}


# ---------------------------------------------------------------------------
# MCPServerConnection — construction
# ---------------------------------------------------------------------------


class TestMCPServerConnectionInit:
    def test_stdio_defaults(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        assert conn.name == "test"
        assert conn.transport == "stdio"
        assert conn.command == "/bin/echo"
        assert conn.args == []
        assert conn.connected is False
        assert conn.tools == []

    def test_http_defaults(self):
        conn = MCPServerConnection("test", "http", url="http://localhost:8080")
        assert conn.url == "http://localhost:8080"
        assert conn.headers == {}

    def test_custom_timeout(self):
        conn = MCPServerConnection("test", "stdio", timeout=30)
        assert conn.timeout == 30

    def test_env_passed(self):
        conn = MCPServerConnection("test", "stdio", env={"KEY": "val"})
        assert conn.env == {"KEY": "val"}

    def test_headers_passed(self):
        conn = MCPServerConnection("test", "http", headers={"X-Key": "val"})
        assert conn.headers == {"X-Key": "val"}

    def test_args_passed(self):
        conn = MCPServerConnection("test", "stdio", args=["--flag"])
        assert conn.args == ["--flag"]


# ---------------------------------------------------------------------------
# MCPServerConnection — connect errors
# ---------------------------------------------------------------------------


class TestMCPServerConnectionConnectErrors:
    async def test_stdio_no_command(self):
        conn = MCPServerConnection("test", "stdio", command="")
        with pytest.raises(MCPError, match="requires 'command'"):
            await conn.connect()

    async def test_http_no_url(self):
        conn = MCPServerConnection("test", "http", url="")
        with pytest.raises(MCPError, match="requires 'url'"):
            await conn.connect()

    async def test_unsupported_transport(self):
        conn = MCPServerConnection("test", "grpc")
        with pytest.raises(MCPError, match="Unsupported transport"):
            await conn.connect()

    async def test_stdio_command_not_found(self):
        conn = MCPServerConnection("test", "stdio", command="/nonexistent/binary_xyz_404")
        with pytest.raises(MCPError, match="command not found"):
            await conn.connect()


# ---------------------------------------------------------------------------
# MCPServerConnection — protocol at _send_request level
# ---------------------------------------------------------------------------


class TestMCPServerConnectionProtocol:
    async def test_initialize_success(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = False
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "test-server", "version": "1.0.0"},
            },
        }
        conn._send_request = AsyncMock(return_value=resp)
        conn._send_notification = MagicMock()

        await conn._initialize()
        assert conn.server_info["name"] == "test-server"
        conn._send_request.assert_called_once()
        call_args = conn._send_request.call_args
        assert call_args[0][0] == "initialize"
        assert call_args[0][1]["protocolVersion"] == PROTOCOL_VERSION
        conn._send_notification.assert_called_once_with("notifications/initialized")

    async def test_initialize_error(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "error": {"code": -32600, "message": "bad request"},
        }
        conn._send_request = AsyncMock(return_value=resp)

        with pytest.raises(MCPError, match="initialize failed"):
            await conn._initialize()

    async def test_discover_tools_success(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True

        tools_resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {"tools": [
                {"name": "greet", "description": "Say hello",
                 "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}}},
                {"name": "calc", "description": "Calculate",
                 "inputSchema": {"type": "object", "properties": {"expr": {"type": "string"}}}},
            ]},
        }
        conn._send_request = AsyncMock(return_value=tools_resp)

        tools = await conn.discover_tools()
        assert len(tools) == 2
        assert tools[0]["name"] == "greet"
        assert tools[1]["name"] == "calc"
        conn._send_request.assert_called_once_with("tools/list")

    async def test_discover_tools_error(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True

        resp = {"jsonrpc": "2.0", "id": 1, "error": {"code": -1, "message": "not supported"}}
        conn._send_request = AsyncMock(return_value=resp)

        with pytest.raises(MCPError, match="tools/list failed"):
            await conn.discover_tools()

    async def test_discover_tools_not_connected(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        with pytest.raises(MCPError, match="not connected"):
            await conn.discover_tools()

    async def test_discover_tools_skips_unnamed(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {"tools": [
                {"name": "good", "description": "Good tool"},
                {"name": "", "description": "Empty name"},
                {"description": "No name field at all"},
            ]},
        }
        conn._send_request = AsyncMock(return_value=resp)

        tools = await conn.discover_tools()
        assert len(tools) == 1
        assert tools[0]["name"] == "good"

    async def test_discover_tools_empty_list(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {"jsonrpc": "2.0", "id": 1, "result": {"tools": []}}
        conn._send_request = AsyncMock(return_value=resp)

        tools = await conn.discover_tools()
        assert tools == []

    async def test_call_tool_success(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {
                "content": [{"type": "text", "text": "Hello, Odin!"}],
                "isError": False,
            },
        }
        conn._send_request = AsyncMock(return_value=resp)

        result = await conn.call_tool("greet", {"name": "Odin"})
        assert result == "Hello, Odin!"
        conn._send_request.assert_called_once_with("tools/call", {
            "name": "greet",
            "arguments": {"name": "Odin"},
        })

    async def test_call_tool_error_flag(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {
                "content": [{"type": "text", "text": "something broke"}],
                "isError": True,
            },
        }
        conn._send_request = AsyncMock(return_value=resp)

        result = await conn.call_tool("greet", {})
        assert "Tool error:" in result
        assert "something broke" in result

    async def test_call_tool_rpc_error(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "error": {"code": -32601, "message": "method not found"},
        }
        conn._send_request = AsyncMock(return_value=resp)

        result = await conn.call_tool("greet", {})
        assert "MCP error:" in result
        assert "method not found" in result

    async def test_call_tool_not_connected(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        with pytest.raises(MCPError, match="not connected"):
            await conn.call_tool("tool", {})

    async def test_call_tool_empty_content(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {"content": [], "isError": False},
        }
        conn._send_request = AsyncMock(return_value=resp)

        result = await conn.call_tool("tool", {})
        assert result == "(no output)"

    async def test_call_tool_image_content(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {
                "content": [{"type": "image", "mimeType": "image/png", "data": "..."}],
                "isError": False,
            },
        }
        conn._send_request = AsyncMock(return_value=resp)

        result = await conn.call_tool("tool", {})
        assert "[image: image/png]" in result

    async def test_call_tool_resource_content(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {
                "content": [{"type": "resource", "uri": "file:///tmp/x"}],
                "isError": False,
            },
        }
        conn._send_request = AsyncMock(return_value=resp)

        result = await conn.call_tool("tool", {})
        assert "[resource: file:///tmp/x]" in result

    async def test_call_tool_multiple_text(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {
                "content": [
                    {"type": "text", "text": "line1"},
                    {"type": "text", "text": "line2"},
                ],
                "isError": False,
            },
        }
        conn._send_request = AsyncMock(return_value=resp)

        result = await conn.call_tool("tool", {})
        assert result == "line1\nline2"

    async def test_call_tool_string_content(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {"content": ["plain string"], "isError": False},
        }
        conn._send_request = AsyncMock(return_value=resp)

        result = await conn.call_tool("tool", {})
        assert result == "plain string"

    async def test_call_tool_unknown_content_type(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {
                "content": [{"type": "custom", "data": "xyz"}],
                "isError": False,
            },
        }
        conn._send_request = AsyncMock(return_value=resp)

        result = await conn.call_tool("tool", {})
        assert "custom" in result

    async def test_call_tool_mixed_content(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {
                "content": [
                    {"type": "text", "text": "result:"},
                    {"type": "image", "mimeType": "image/jpeg"},
                ],
                "isError": False,
            },
        }
        conn._send_request = AsyncMock(return_value=resp)

        result = await conn.call_tool("tool", {})
        assert "result:" in result
        assert "[image: image/jpeg]" in result

    async def test_call_tool_rpc_error_string(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        resp = {"jsonrpc": "2.0", "id": 1, "error": "simple error string"}
        conn._send_request = AsyncMock(return_value=resp)

        result = await conn.call_tool("tool", {})
        assert "MCP error:" in result


# ---------------------------------------------------------------------------
# MCPServerConnection — HTTP transport
# ---------------------------------------------------------------------------


class TestMCPServerConnectionHTTP:
    async def test_connect_http_success(self):
        init_response = {
            "jsonrpc": "2.0", "id": 1,
            "result": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "serverInfo": {"name": "http-server", "version": "2.0"},
            },
        }

        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=init_response)

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_session_ctx)

        mock_session_mgr = MagicMock()
        mock_session_mgr.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_mgr.__aexit__ = AsyncMock(return_value=False)

        with patch("aiohttp.ClientSession", return_value=mock_session_mgr):
            conn = MCPServerConnection("test", "http", url="http://localhost:8080")
            await conn.connect()
            assert conn.connected is True
            assert conn.server_info["name"] == "http-server"

    async def test_connect_http_error_status(self):
        mock_resp = AsyncMock()
        mock_resp.status = 500
        mock_resp.text = AsyncMock(return_value="Internal error")

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_session_ctx)

        mock_session_mgr = MagicMock()
        mock_session_mgr.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_mgr.__aexit__ = AsyncMock(return_value=False)

        with patch("aiohttp.ClientSession", return_value=mock_session_mgr):
            conn = MCPServerConnection("test", "http", url="http://localhost:8080")
            with pytest.raises(MCPError, match="HTTP 500"):
                await conn.connect()

    async def test_connect_http_init_error(self):
        error_response = {
            "jsonrpc": "2.0", "id": 1,
            "error": {"code": -1, "message": "rejected"},
        }

        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=error_response)

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_session_ctx)

        mock_session_mgr = MagicMock()
        mock_session_mgr.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_mgr.__aexit__ = AsyncMock(return_value=False)

        with patch("aiohttp.ClientSession", return_value=mock_session_mgr):
            conn = MCPServerConnection("test", "http", url="http://localhost:8080")
            with pytest.raises(MCPError, match="initialize failed"):
                await conn.connect()

    async def test_http_discover_tools(self):
        conn = MCPServerConnection("test", "http", url="http://localhost:8080")
        conn._connected = True

        init_resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {"tools": [
                {"name": "query", "description": "Run query", "inputSchema": {"type": "object"}},
            ]},
        }

        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=init_resp)

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_session_ctx)

        mock_session_mgr = MagicMock()
        mock_session_mgr.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_mgr.__aexit__ = AsyncMock(return_value=False)

        with patch("aiohttp.ClientSession", return_value=mock_session_mgr):
            tools = await conn.discover_tools()
            assert len(tools) == 1
            assert tools[0]["name"] == "query"

    async def test_http_call_tool(self):
        conn = MCPServerConnection("test", "http", url="http://localhost:8080")
        conn._connected = True

        call_resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {
                "content": [{"type": "text", "text": "42"}],
                "isError": False,
            },
        }

        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=call_resp)

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_session_ctx)

        mock_session_mgr = MagicMock()
        mock_session_mgr.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_mgr.__aexit__ = AsyncMock(return_value=False)

        with patch("aiohttp.ClientSession", return_value=mock_session_mgr):
            result = await conn.call_tool("calc", {"expr": "6*7"})
            assert result == "42"

    async def test_http_headers_passed(self):
        conn = MCPServerConnection(
            "test", "http",
            url="http://localhost:8080",
            headers={"Authorization": "Bearer tok123"},
        )
        conn._connected = True

        resp = {"jsonrpc": "2.0", "id": 1, "result": {"tools": []}}

        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp)

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_session_ctx)

        mock_session_mgr = MagicMock()
        mock_session_mgr.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_mgr.__aexit__ = AsyncMock(return_value=False)

        with patch("aiohttp.ClientSession", return_value=mock_session_mgr):
            await conn.discover_tools()
            call_kwargs = mock_session.post.call_args
            headers = call_kwargs.kwargs.get("headers", {})
            assert headers.get("Authorization") == "Bearer tok123"


# ---------------------------------------------------------------------------
# MCPServerConnection — disconnect
# ---------------------------------------------------------------------------


class TestMCPServerConnectionDisconnect:
    async def test_disconnect_when_not_connected(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        await conn.disconnect()
        assert conn.connected is False

    async def test_disconnect_clears_tools(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._tools = [{"name": "tool1"}]
        conn._connected = True
        await conn.disconnect()
        assert conn.tools == []
        assert conn.connected is False

    async def test_disconnect_terminates_process(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        mock_proc = MagicMock()
        mock_proc.stdin = MagicMock()
        mock_proc.stdin.close = MagicMock()
        mock_proc.terminate = MagicMock()
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock()
        conn._process = mock_proc
        conn._connected = True

        await conn.disconnect()
        mock_proc.terminate.assert_called_once()

    async def test_disconnect_kills_on_timeout(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        mock_proc = MagicMock()
        mock_proc.stdin = MagicMock()
        mock_proc.stdin.close = MagicMock()
        mock_proc.terminate = MagicMock()
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock(side_effect=asyncio.TimeoutError)
        conn._process = mock_proc
        conn._connected = True

        await conn.disconnect()
        mock_proc.kill.assert_called_once()

    async def test_disconnect_cancels_reader_task(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True

        cancelled = False

        async def fake_reader():
            nonlocal cancelled
            try:
                await asyncio.sleep(3600)
            except asyncio.CancelledError:
                cancelled = True
                raise

        conn._reader_task = asyncio.create_task(fake_reader())
        await asyncio.sleep(0)  # let task start
        await conn.disconnect()
        assert cancelled is True

    async def test_disconnect_clears_pending(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        conn._pending = {1: asyncio.get_event_loop().create_future()}
        await conn.disconnect()
        assert conn._pending == {}


# ---------------------------------------------------------------------------
# MCPServerConnection — next_id
# ---------------------------------------------------------------------------


class TestMCPServerConnectionNextId:
    def test_increments(self):
        conn = MCPServerConnection("test", "stdio")
        assert conn._next_id() == 1
        assert conn._next_id() == 2
        assert conn._next_id() == 3


# ---------------------------------------------------------------------------
# MCPServerConnection — properties
# ---------------------------------------------------------------------------


class TestMCPServerConnectionProperties:
    def test_server_info_returns_copy(self):
        conn = MCPServerConnection("test", "stdio")
        conn._server_info = {"name": "x"}
        info = conn.server_info
        info["name"] = "y"
        assert conn._server_info["name"] == "x"

    def test_tools_returns_copy(self):
        conn = MCPServerConnection("test", "stdio")
        conn._tools = [{"name": "t"}]
        tools = conn.tools
        tools.append({"name": "new"})
        assert len(conn._tools) == 1


# ---------------------------------------------------------------------------
# MCPServerConnection — send_request dispatch
# ---------------------------------------------------------------------------


class TestMCPServerConnectionSendRequest:
    async def test_send_request_unsupported_transport(self):
        conn = MCPServerConnection("test", "grpc")
        conn._connected = True
        with pytest.raises(MCPError, match="Unsupported transport"):
            await conn._send_request("test")

    async def test_send_stdio_request_not_connected(self):
        conn = MCPServerConnection("test", "stdio")
        with pytest.raises(MCPError, match="not connected"):
            await conn._send_stdio_request("tools/list")

    def test_send_notification_not_connected(self):
        conn = MCPServerConnection("test", "http", url="http://x")
        conn._send_notification("notifications/initialized")

    def test_send_notification_no_process(self):
        conn = MCPServerConnection("test", "stdio")
        conn._send_notification("notifications/initialized")


# ---------------------------------------------------------------------------
# MCPManager — helper
# ---------------------------------------------------------------------------


def _make_mock_connection(name, tools=None, connected=True, server_info=None):
    conn = MagicMock(spec=MCPServerConnection)
    conn.name = name
    conn.transport = "stdio"
    conn.connected = connected
    conn.timeout = 120
    conn.server_info = server_info or {"name": f"{name}-server"}
    conn._tools = tools or []
    conn.tools = list(conn._tools)
    conn.connect = AsyncMock()
    conn.discover_tools = AsyncMock(return_value=list(conn._tools))
    conn.call_tool = AsyncMock(return_value="result")
    conn.disconnect = AsyncMock()
    return conn


# ---------------------------------------------------------------------------
# MCPManager — core operations
# ---------------------------------------------------------------------------


class TestMCPManager:
    def test_init(self):
        mgr = MCPManager()
        assert mgr.server_names == []
        assert mgr.has_tool("anything") is False
        assert mgr.get_tool_definitions() == []

    async def test_add_server_success(self):
        tools = [
            {"name": "read", "description": "Read a file", "inputSchema": {"type": "object"}},
        ]
        mock_conn = _make_mock_connection("fs", tools=tools)

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            info = await mgr.add_server("fs", "stdio", command="/bin/mcp-fs")

            assert info["server"] == "fs"
            assert info["tools_discovered"] == 1
            assert "mcp_fs_read" in info["tool_names"]
            assert mgr.has_tool("mcp_fs_read") is True
            assert "fs" in mgr.server_names

    async def test_add_server_duplicate_name(self):
        mock_conn = _make_mock_connection("fs")
        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/x")
            with pytest.raises(MCPError, match="already registered"):
                await mgr.add_server("fs", "stdio", command="/bin/y")

    async def test_add_server_invalid_name(self):
        mgr = MCPManager()
        with pytest.raises(MCPError, match="must be a valid"):
            await mgr.add_server("bad-name", "stdio", command="/bin/x")

    async def test_add_server_invalid_name_leading_digit(self):
        mgr = MCPManager()
        with pytest.raises(MCPError, match="must be a valid"):
            await mgr.add_server("1srv", "stdio", command="/bin/x")

    async def test_add_server_valid_names(self):
        for name in ["srv", "my_server", "s1", "_private"]:
            mock_conn = _make_mock_connection(name)
            with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
                mgr = MCPManager()
                info = await mgr.add_server(name, "stdio", command="/bin/x")
                assert info["server"] == name

    async def test_remove_server(self):
        mock_conn = _make_mock_connection("fs", tools=[
            {"name": "read", "description": "Read", "inputSchema": {"type": "object"}},
        ])
        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/x")
            assert mgr.has_tool("mcp_fs_read") is True

            await mgr.remove_server("fs")
            assert "fs" not in mgr.server_names
            assert mgr.has_tool("mcp_fs_read") is False
            mock_conn.disconnect.assert_called_once()

    async def test_remove_server_not_found(self):
        mgr = MCPManager()
        with pytest.raises(MCPError, match="not found"):
            await mgr.remove_server("nonexistent")

    def test_get_server(self):
        mgr = MCPManager()
        assert mgr.get_server("x") is None

    async def test_get_server_after_add(self):
        mock_conn = _make_mock_connection("fs")
        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/x")
            assert mgr.get_server("fs") is mock_conn

    async def test_add_server_multiple_tools(self):
        tools = [
            {"name": "read", "description": "R", "inputSchema": {}},
            {"name": "write", "description": "W", "inputSchema": {}},
            {"name": "delete", "description": "D", "inputSchema": {}},
        ]
        mock_conn = _make_mock_connection("fs", tools=tools)
        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            info = await mgr.add_server("fs", "stdio", command="/bin/x")
            assert info["tools_discovered"] == 3
            assert mgr.has_tool("mcp_fs_read")
            assert mgr.has_tool("mcp_fs_write")
            assert mgr.has_tool("mcp_fs_delete")

    async def test_add_server_connection_params_passed(self):
        mock_conn = _make_mock_connection("srv")
        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn) as mock_cls:
            mgr = MCPManager(tool_timeout=60)
            await mgr.add_server(
                "srv", "http",
                url="http://localhost:8080",
                headers={"X-Key": "val"},
                env={"FOO": "bar"},
                timeout=30,
            )
            mock_cls.assert_called_once_with(
                "srv", "http",
                command="",
                args=None,
                url="http://localhost:8080",
                headers={"X-Key": "val"},
                env={"FOO": "bar"},
                timeout=30,
            )

    async def test_add_server_default_timeout_from_manager(self):
        mock_conn = _make_mock_connection("srv")
        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn) as mock_cls:
            mgr = MCPManager(tool_timeout=60)
            await mgr.add_server("srv", "stdio", command="/bin/x")
            _, kwargs = mock_cls.call_args
            assert kwargs["timeout"] == 60


# ---------------------------------------------------------------------------
# MCPManager — tool definitions
# ---------------------------------------------------------------------------


class TestMCPManagerToolDefinitions:
    async def test_get_tool_definitions(self):
        tools = [
            {"name": "read", "description": "Read a file",
             "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}}}},
            {"name": "write", "description": "Write a file",
             "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}}}},
        ]
        mock_conn = _make_mock_connection("fs", tools=tools)

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/x")

            defs = mgr.get_tool_definitions()
            assert len(defs) == 2

            names = {d["name"] for d in defs}
            assert names == {"mcp_fs_read", "mcp_fs_write"}

            for d in defs:
                assert d["description"].startswith("[MCP:fs]")
                assert "input_schema" in d

    async def test_tool_definitions_cached(self):
        mock_conn = _make_mock_connection("fs", tools=[
            {"name": "read", "description": "Read", "inputSchema": {}},
        ])

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/x")

            defs1 = mgr.get_tool_definitions()
            defs2 = mgr.get_tool_definitions()
            assert defs1 is defs2

    async def test_cache_invalidated_on_add(self):
        conn1 = _make_mock_connection("fs", tools=[
            {"name": "read", "description": "Read", "inputSchema": {}},
        ])
        conn2 = _make_mock_connection("db", tools=[
            {"name": "query", "description": "Query", "inputSchema": {}},
        ])

        with patch("src.tools.mcp_client.MCPServerConnection", side_effect=[conn1, conn2]):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/x")
            defs1 = mgr.get_tool_definitions()
            assert len(defs1) == 1

            await mgr.add_server("db", "stdio", command="/bin/y")
            defs2 = mgr.get_tool_definitions()
            assert len(defs2) == 2
            assert defs1 is not defs2

    async def test_cache_invalidated_on_remove(self):
        mock_conn = _make_mock_connection("fs", tools=[
            {"name": "read", "description": "Read", "inputSchema": {}},
        ])

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/x")
            defs1 = mgr.get_tool_definitions()
            assert len(defs1) == 1

            await mgr.remove_server("fs")
            defs2 = mgr.get_tool_definitions()
            assert len(defs2) == 0

    async def test_disconnected_server_excluded(self):
        mock_conn = _make_mock_connection("fs", tools=[
            {"name": "read", "description": "Read", "inputSchema": {}},
        ], connected=False)

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/x")

            mgr._tool_cache = None
            defs = mgr.get_tool_definitions()
            assert len(defs) == 0

    async def test_empty_tool_definitions(self):
        mock_conn = _make_mock_connection("fs", tools=[])
        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/x")
            defs = mgr.get_tool_definitions()
            assert defs == []

    async def test_multiple_servers(self):
        conn1 = _make_mock_connection("fs", tools=[
            {"name": "read", "description": "Read file", "inputSchema": {}},
        ])
        conn2 = _make_mock_connection("db", tools=[
            {"name": "query", "description": "Run query", "inputSchema": {}},
        ])

        with patch("src.tools.mcp_client.MCPServerConnection", side_effect=[conn1, conn2]):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/fs")
            await mgr.add_server("db", "stdio", command="/bin/db")

            defs = mgr.get_tool_definitions()
            names = {d["name"] for d in defs}
            assert names == {"mcp_fs_read", "mcp_db_query"}

    async def test_input_schema_key_mapping(self):
        tools = [
            {"name": "t", "description": "d",
             "inputSchema": {"type": "object", "properties": {"x": {"type": "string"}}}},
        ]
        mock_conn = _make_mock_connection("s", tools=tools)

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("s", "stdio", command="/bin/x")
            defs = mgr.get_tool_definitions()
            assert "input_schema" in defs[0]
            assert defs[0]["input_schema"]["properties"]["x"]["type"] == "string"

    async def test_description_prefix(self):
        tools = [{"name": "t", "description": "Does things", "inputSchema": {}}]
        mock_conn = _make_mock_connection("mysvr", tools=tools)

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("mysvr", "stdio", command="/bin/x")
            defs = mgr.get_tool_definitions()
            assert defs[0]["description"] == "[MCP:mysvr] Does things"

    async def test_missing_input_schema_defaults(self):
        tools = [{"name": "t", "description": "d"}]
        mock_conn = _make_mock_connection("s", tools=tools)

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("s", "stdio", command="/bin/x")
            defs = mgr.get_tool_definitions()
            assert defs[0]["input_schema"] == {"type": "object", "properties": {}}


# ---------------------------------------------------------------------------
# MCPManager — execution
# ---------------------------------------------------------------------------


class TestMCPManagerExecute:
    async def test_execute_success(self):
        tools = [{"name": "greet", "description": "Say hi", "inputSchema": {}}]
        mock_conn = _make_mock_connection("srv", tools=tools)
        mock_conn.call_tool = AsyncMock(return_value="Hello!")

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("srv", "stdio", command="/bin/x")

            result = await mgr.execute("mcp_srv_greet", {"name": "Odin"})
            assert result == "Hello!"
            mock_conn.call_tool.assert_called_once_with("greet", {"name": "Odin"})

    async def test_execute_unknown_tool(self):
        mgr = MCPManager()
        result = await mgr.execute("mcp_srv_nope", {})
        assert "Unknown MCP tool" in result

    async def test_execute_server_disconnected(self):
        tools = [{"name": "greet", "description": "Hi", "inputSchema": {}}]
        mock_conn = _make_mock_connection("srv", tools=tools, connected=False)

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("srv", "stdio", command="/bin/x")

            result = await mgr.execute("mcp_srv_greet", {})
            assert "not connected" in result

    async def test_execute_timeout(self):
        tools = [{"name": "slow", "description": "Slow", "inputSchema": {}}]
        mock_conn = _make_mock_connection("srv", tools=tools)
        mock_conn.timeout = 0.01

        async def slow_call(name, args):
            await asyncio.sleep(10)
            return "done"

        mock_conn.call_tool = slow_call

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("srv", "stdio", command="/bin/x")

            result = await mgr.execute("mcp_srv_slow", {})
            assert "timed out" in result

    async def test_execute_mcp_error(self):
        tools = [{"name": "fail", "description": "Fail", "inputSchema": {}}]
        mock_conn = _make_mock_connection("srv", tools=tools)
        mock_conn.call_tool = AsyncMock(side_effect=MCPError("server crashed"))

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("srv", "stdio", command="/bin/x")

            result = await mgr.execute("mcp_srv_fail", {})
            assert "MCP error" in result
            assert "server crashed" in result

    async def test_execute_generic_exception(self):
        tools = [{"name": "fail", "description": "Fail", "inputSchema": {}}]
        mock_conn = _make_mock_connection("srv", tools=tools)
        mock_conn.call_tool = AsyncMock(side_effect=RuntimeError("boom"))

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("srv", "stdio", command="/bin/x")

            result = await mgr.execute("mcp_srv_fail", {})
            assert "MCP tool error" in result
            assert "boom" in result

    async def test_execute_empty_input(self):
        tools = [{"name": "status", "description": "Status", "inputSchema": {}}]
        mock_conn = _make_mock_connection("srv", tools=tools)
        mock_conn.call_tool = AsyncMock(return_value="ok")

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("srv", "stdio", command="/bin/x")

            result = await mgr.execute("mcp_srv_status", {})
            assert result == "ok"
            mock_conn.call_tool.assert_called_once_with("status", {})


# ---------------------------------------------------------------------------
# MCPManager — status
# ---------------------------------------------------------------------------


class TestMCPManagerStatus:
    def test_get_status_empty(self):
        mgr = MCPManager()
        assert mgr.get_status() == []

    async def test_get_status_with_servers(self):
        tools = [
            {"name": "read", "description": "Read", "inputSchema": {}},
            {"name": "write", "description": "Write", "inputSchema": {}},
        ]
        mock_conn = _make_mock_connection("fs", tools=tools)

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/x")

            status = mgr.get_status()
            assert len(status) == 1
            s = status[0]
            assert s["name"] == "fs"
            assert s["connected"] is True
            assert s["tool_count"] == 2
            assert len(s["tools"]) == 2

    async def test_get_status_multiple_servers(self):
        conn1 = _make_mock_connection("fs", tools=[
            {"name": "read", "description": "", "inputSchema": {}},
        ])
        conn2 = _make_mock_connection("db", tools=[
            {"name": "query", "description": "", "inputSchema": {}},
            {"name": "insert", "description": "", "inputSchema": {}},
        ])

        with patch("src.tools.mcp_client.MCPServerConnection", side_effect=[conn1, conn2]):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/fs")
            await mgr.add_server("db", "stdio", command="/bin/db")

            status = mgr.get_status()
            assert len(status) == 2
            names = {s["name"] for s in status}
            assert names == {"fs", "db"}


# ---------------------------------------------------------------------------
# MCPManager — shutdown
# ---------------------------------------------------------------------------


class TestMCPManagerShutdown:
    async def test_shutdown_disconnects_all(self):
        conn1 = _make_mock_connection("a")
        conn2 = _make_mock_connection("b")

        with patch("src.tools.mcp_client.MCPServerConnection", side_effect=[conn1, conn2]):
            mgr = MCPManager()
            await mgr.add_server("a", "stdio", command="/bin/x")
            await mgr.add_server("b", "stdio", command="/bin/y")

            await mgr.shutdown()
            assert mgr.server_names == []
            conn1.disconnect.assert_called_once()
            conn2.disconnect.assert_called_once()

    async def test_shutdown_empty(self):
        mgr = MCPManager()
        await mgr.shutdown()

    async def test_shutdown_tolerates_errors(self):
        mock_conn = _make_mock_connection("err")
        mock_conn.disconnect = AsyncMock(side_effect=RuntimeError("disconnect failed"))

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("err", "stdio", command="/bin/x")
            await mgr.shutdown()


# ---------------------------------------------------------------------------
# MCPManager — has_tool
# ---------------------------------------------------------------------------


class TestMCPManagerHasTool:
    async def test_has_tool_true(self):
        tools = [{"name": "read", "description": "", "inputSchema": {}}]
        mock_conn = _make_mock_connection("fs", tools=tools)

        with patch("src.tools.mcp_client.MCPServerConnection", return_value=mock_conn):
            mgr = MCPManager()
            await mgr.add_server("fs", "stdio", command="/bin/x")
            assert mgr.has_tool("mcp_fs_read") is True

    def test_has_tool_false(self):
        mgr = MCPManager()
        assert mgr.has_tool("mcp_fs_read") is False

    def test_has_tool_non_mcp(self):
        mgr = MCPManager()
        assert mgr.has_tool("run_command") is False


# ---------------------------------------------------------------------------
# Multiple servers — tool isolation
# ---------------------------------------------------------------------------


class TestMCPManagerToolIsolation:
    async def test_same_tool_name_different_servers(self):
        conn1 = _make_mock_connection("a", tools=[
            {"name": "t1", "description": "", "inputSchema": {}},
        ])
        conn2 = _make_mock_connection("b", tools=[
            {"name": "t1", "description": "", "inputSchema": {}},
        ])

        with patch("src.tools.mcp_client.MCPServerConnection", side_effect=[conn1, conn2]):
            mgr = MCPManager()
            await mgr.add_server("a", "stdio", command="/bin/x")
            await mgr.add_server("b", "stdio", command="/bin/y")

            assert mgr.has_tool("mcp_a_t1") is True
            assert mgr.has_tool("mcp_b_t1") is True

            conn1.call_tool = AsyncMock(return_value="from_a")
            conn2.call_tool = AsyncMock(return_value="from_b")

            result_a = await mgr.execute("mcp_a_t1", {})
            assert result_a == "from_a"
            conn1.call_tool.assert_called_once_with("t1", {})

            result_b = await mgr.execute("mcp_b_t1", {})
            assert result_b == "from_b"
            conn2.call_tool.assert_called_once_with("t1", {})

    async def test_remove_one_server_keeps_other(self):
        conn1 = _make_mock_connection("a", tools=[
            {"name": "t1", "description": "", "inputSchema": {}},
        ])
        conn2 = _make_mock_connection("b", tools=[
            {"name": "t2", "description": "", "inputSchema": {}},
        ])

        with patch("src.tools.mcp_client.MCPServerConnection", side_effect=[conn1, conn2]):
            mgr = MCPManager()
            await mgr.add_server("a", "stdio", command="/bin/x")
            await mgr.add_server("b", "stdio", command="/bin/y")

            await mgr.remove_server("a")
            assert mgr.has_tool("mcp_a_t1") is False
            assert mgr.has_tool("mcp_b_t2") is True


# ---------------------------------------------------------------------------
# Background task integration
# ---------------------------------------------------------------------------


class TestBackgroundTaskMCPIntegration:
    async def test_execute_tool_routes_to_mcp(self):
        from src.discord.background_task import _execute_tool

        mock_executor = MagicMock()
        mock_executor.config = MagicMock()
        mock_executor.config.hosts = {}

        mock_skill_mgr = MagicMock()
        mock_skill_mgr.has_skill = MagicMock(return_value=False)

        mock_mcp_mgr = MagicMock()
        mock_mcp_mgr.has_tool = MagicMock(return_value=True)
        mock_mcp_mgr.execute = AsyncMock(return_value="mcp result")

        result = await _execute_tool(
            "mcp_srv_greet",
            {"name": "Odin"},
            mock_executor,
            mock_skill_mgr,
            None, None,
            requester="test",
            mcp_manager=mock_mcp_mgr,
        )

        assert result == "mcp result"
        mock_mcp_mgr.execute.assert_called_once_with("mcp_srv_greet", {"name": "Odin"})

    async def test_execute_tool_mcp_none_falls_through(self):
        from src.discord.background_task import _execute_tool

        mock_executor = MagicMock()
        mock_executor.config = MagicMock()
        mock_executor.config.hosts = {}
        mock_executor.execute = AsyncMock(return_value="executor result")

        mock_skill_mgr = MagicMock()
        mock_skill_mgr.has_skill = MagicMock(return_value=False)

        result = await _execute_tool(
            "run_command",
            {"command": "echo hi", "host": "local"},
            mock_executor,
            mock_skill_mgr,
            None, None,
            requester="test",
            mcp_manager=None,
        )

        assert result == "executor result"

    async def test_execute_tool_skill_takes_priority_over_mcp(self):
        from src.discord.background_task import _execute_tool

        mock_executor = MagicMock()
        mock_executor.config = MagicMock()
        mock_executor.config.hosts = {}

        mock_skill_mgr = MagicMock()
        mock_skill_mgr.has_skill = MagicMock(return_value=True)
        mock_skill_mgr.execute = AsyncMock(return_value="skill result")

        mock_mcp_mgr = MagicMock()
        mock_mcp_mgr.has_tool = MagicMock(return_value=True)
        mock_mcp_mgr.execute = AsyncMock(return_value="mcp result")

        result = await _execute_tool(
            "some_tool",
            {},
            mock_executor,
            mock_skill_mgr,
            None, None,
            requester="test",
            mcp_manager=mock_mcp_mgr,
        )

        assert result == "skill result"
        mock_mcp_mgr.execute.assert_not_called()

    async def test_execute_tool_mcp_false_falls_to_executor(self):
        from src.discord.background_task import _execute_tool

        mock_executor = MagicMock()
        mock_executor.config = MagicMock()
        mock_executor.config.hosts = {}
        mock_executor.execute = AsyncMock(return_value="executor result")

        mock_skill_mgr = MagicMock()
        mock_skill_mgr.has_skill = MagicMock(return_value=False)

        mock_mcp_mgr = MagicMock()
        mock_mcp_mgr.has_tool = MagicMock(return_value=False)

        result = await _execute_tool(
            "run_command",
            {"command": "echo hi", "host": "local"},
            mock_executor,
            mock_skill_mgr,
            None, None,
            requester="test",
            mcp_manager=mock_mcp_mgr,
        )

        assert result == "executor result"
        mock_mcp_mgr.execute.assert_not_called()


# ---------------------------------------------------------------------------
# JSON-RPC message format
# ---------------------------------------------------------------------------


class TestJSONRPCFormat:
    def test_request_format(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        req_id = conn._next_id()
        request = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "tools/list",
        }
        assert request["jsonrpc"] == "2.0"
        assert request["id"] == 1
        assert request["method"] == "tools/list"

    def test_request_with_params(self):
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": "greet", "arguments": {"x": 1}},
        }
        serialized = json.dumps(request)
        parsed = json.loads(serialized)
        assert parsed["params"]["arguments"]["x"] == 1

    def test_notification_format(self):
        msg = {"jsonrpc": "2.0", "method": "notifications/initialized"}
        assert "id" not in msg

    def test_protocol_version(self):
        assert PROTOCOL_VERSION == "2024-11-05"

    def test_client_info(self):
        assert CLIENT_INFO["name"] == "odin"
        assert "version" in CLIENT_INFO


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    def test_parse_tool_name_no_underscore_after_server(self):
        assert parse_tool_name("mcp_server") is None

    def test_make_tool_name_empty_server(self):
        result = make_tool_name("", "tool")
        assert result == "mcp__tool"

    def test_make_tool_name_empty_tool(self):
        result = make_tool_name("srv", "")
        assert result == "mcp_srv_"

    def test_mcp_error_str(self):
        err = MCPError("test error")
        assert str(err) == "test error"

    def test_mcp_error_inherits_exception(self):
        assert issubclass(MCPError, Exception)

    async def test_connection_server_info_empty_result(self):
        conn = MCPServerConnection("test", "http", url="http://localhost:8080")
        resp = {"jsonrpc": "2.0", "id": 1, "result": {}}
        conn._send_request = AsyncMock(return_value=resp)
        conn._send_notification = MagicMock()

        # HTTP init path
        mock_resp_obj = AsyncMock()
        mock_resp_obj.status = 200
        mock_resp_obj.json = AsyncMock(return_value=resp)

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_resp_obj)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_session_ctx)

        mock_session_mgr = MagicMock()
        mock_session_mgr.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_mgr.__aexit__ = AsyncMock(return_value=False)

        with patch("aiohttp.ClientSession", return_value=mock_session_mgr):
            conn2 = MCPServerConnection("test", "http", url="http://localhost:8080")
            await conn2.connect()
            assert conn2.server_info == {}

    async def test_initialize_empty_server_info(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {"protocolVersion": PROTOCOL_VERSION},
        }
        conn._send_request = AsyncMock(return_value=resp)
        conn._send_notification = MagicMock()

        await conn._initialize()
        assert conn.server_info == {}

    async def test_discover_preserves_input_schema(self):
        conn = MCPServerConnection("test", "stdio", command="/bin/echo")
        conn._connected = True
        schema = {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path"},
                "encoding": {"type": "string", "enum": ["utf-8", "ascii"]},
            },
            "required": ["path"],
        }
        resp = {
            "jsonrpc": "2.0", "id": 1,
            "result": {"tools": [
                {"name": "read", "description": "Read file", "inputSchema": schema},
            ]},
        }
        conn._send_request = AsyncMock(return_value=resp)

        tools = await conn.discover_tools()
        assert tools[0]["inputSchema"] == schema

    async def test_manager_execute_routes_to_correct_server(self):
        conn1 = _make_mock_connection("a", tools=[
            {"name": "do_thing", "description": "", "inputSchema": {}},
        ])
        conn2 = _make_mock_connection("b", tools=[
            {"name": "do_thing", "description": "", "inputSchema": {}},
        ])
        conn1.call_tool = AsyncMock(return_value="from a")
        conn2.call_tool = AsyncMock(return_value="from b")

        with patch("src.tools.mcp_client.MCPServerConnection", side_effect=[conn1, conn2]):
            mgr = MCPManager()
            await mgr.add_server("a", "stdio", command="/bin/a")
            await mgr.add_server("b", "stdio", command="/bin/b")

            r1 = await mgr.execute("mcp_a_do_thing", {"x": 1})
            r2 = await mgr.execute("mcp_b_do_thing", {"y": 2})

            assert r1 == "from a"
            assert r2 == "from b"
            conn1.call_tool.assert_called_once_with("do_thing", {"x": 1})
            conn2.call_tool.assert_called_once_with("do_thing", {"y": 2})


# ---------------------------------------------------------------------------
# REST API endpoints (lightweight inline tests)
# ---------------------------------------------------------------------------


class TestMCPRESTAPI:
    async def test_list_servers_no_manager(self):
        from aiohttp.test_utils import TestClient, TestServer
        from aiohttp import web

        bot = MagicMock(spec=[])

        routes = web.RouteTableDef()

        @routes.get("/api/mcp/servers")
        async def list_mcp_servers(_request):
            mgr = getattr(bot, "mcp_manager", None)
            if mgr is None:
                return web.json_response({"error": "MCP not enabled"}, status=503)
            return web.json_response({"servers": mgr.get_status()})

        app = web.Application()
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/mcp/servers")
            assert resp.status == 503
            data = await resp.json()
            assert "not enabled" in data["error"]

    async def test_list_servers_with_manager(self):
        from aiohttp.test_utils import TestClient, TestServer
        from aiohttp import web

        mock_mgr = MagicMock()
        mock_mgr.get_status = MagicMock(return_value=[
            {"name": "fs", "connected": True, "tool_count": 2,
             "tools": ["mcp_fs_read", "mcp_fs_write"]},
        ])

        bot = MagicMock()
        bot.mcp_manager = mock_mgr

        routes = web.RouteTableDef()

        @routes.get("/api/mcp/servers")
        async def list_mcp_servers(_request):
            mgr = getattr(bot, "mcp_manager", None)
            if mgr is None:
                return web.json_response({"error": "MCP not enabled"}, status=503)
            return web.json_response({"servers": mgr.get_status()})

        app = web.Application()
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/mcp/servers")
            assert resp.status == 200
            data = await resp.json()
            assert len(data["servers"]) == 1
            assert data["servers"][0]["name"] == "fs"

    async def test_server_tools_endpoint(self):
        from aiohttp.test_utils import TestClient, TestServer
        from aiohttp import web

        mock_conn = MagicMock()
        mock_conn.tools = [
            {"name": "read", "description": "Read file"},
            {"name": "write", "description": "Write file"},
        ]

        mock_mgr = MagicMock()
        mock_mgr.get_server = MagicMock(return_value=mock_conn)

        bot = MagicMock()
        bot.mcp_manager = mock_mgr

        routes = web.RouteTableDef()

        @routes.get("/api/mcp/servers/{name}/tools")
        async def list_mcp_server_tools(request):
            mgr = getattr(bot, "mcp_manager", None)
            if mgr is None:
                return web.json_response({"error": "MCP not enabled"}, status=503)
            name = request.match_info["name"]
            conn = mgr.get_server(name)
            if conn is None:
                return web.json_response({"error": "server not found"}, status=404)
            tools = [
                {
                    "name": make_tool_name(name, t["name"]),
                    "original_name": t["name"],
                    "description": t.get("description", ""),
                }
                for t in conn.tools
            ]
            return web.json_response({"server": name, "tools": tools})

        app = web.Application()
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/mcp/servers/fs/tools")
            assert resp.status == 200
            data = await resp.json()
            assert len(data["tools"]) == 2
            assert data["tools"][0]["name"] == "mcp_fs_read"
            assert data["tools"][0]["original_name"] == "read"

    async def test_server_tools_not_found(self):
        from aiohttp.test_utils import TestClient, TestServer
        from aiohttp import web

        mock_mgr = MagicMock()
        mock_mgr.get_server = MagicMock(return_value=None)

        bot = MagicMock()
        bot.mcp_manager = mock_mgr

        routes = web.RouteTableDef()

        @routes.get("/api/mcp/servers/{name}/tools")
        async def list_mcp_server_tools(request):
            mgr = getattr(bot, "mcp_manager", None)
            if mgr is None:
                return web.json_response({"error": "MCP not enabled"}, status=503)
            name = request.match_info["name"]
            conn = mgr.get_server(name)
            if conn is None:
                return web.json_response({"error": "server not found"}, status=404)
            return web.json_response({"tools": []})

        app = web.Application()
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/mcp/servers/nonexistent/tools")
            assert resp.status == 404
