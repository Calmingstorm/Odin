"""MCP (Model Context Protocol) client for invoking external MCP servers.

Supports stdio transport (spawn subprocess) and HTTP+SSE transport.
Discovers tools from connected servers and makes them available as
first-class tools in Odin's tool system.

Tools are namespaced as ``mcp_{server}_{tool}`` to avoid collisions.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from ..odin_log import get_logger

log = get_logger("mcp")

PROTOCOL_VERSION = "2024-11-05"
CLIENT_INFO = {"name": "odin", "version": "1.0.0"}

_INIT_TIMEOUT = 15
_CALL_TIMEOUT = 120
_READ_TIMEOUT = 5


def make_tool_name(server_name: str, tool_name: str) -> str:
    return f"mcp_{server_name}_{tool_name}"


def parse_tool_name(namespaced: str) -> tuple[str, str] | None:
    """Extract (server_name, tool_name) from a namespaced MCP tool name."""
    if not namespaced.startswith("mcp_"):
        return None
    rest = namespaced[4:]
    idx = rest.find("_")
    if idx <= 0:
        return None
    return rest[:idx], rest[idx + 1:]


class MCPError(Exception):
    """Raised when an MCP operation fails."""


class MCPServerConnection:
    """Connection to a single MCP server via stdio or HTTP transport."""

    def __init__(
        self,
        name: str,
        transport: str,
        *,
        command: str = "",
        args: list[str] | None = None,
        url: str = "",
        headers: dict[str, str] | None = None,
        env: dict[str, str] | None = None,
        timeout: int = _CALL_TIMEOUT,
    ) -> None:
        self.name = name
        self.transport = transport
        self.command = command
        self.args = args or []
        self.url = url
        self.headers = headers or {}
        self.env = env or {}
        self.timeout = timeout

        self._process: asyncio.subprocess.Process | None = None
        self._request_id = 0
        self._tools: list[dict] = []
        self._server_info: dict[str, Any] = {}
        self._connected = False
        self._read_lock = asyncio.Lock()
        self._write_lock = asyncio.Lock()
        self._pending: dict[int, asyncio.Future[dict]] = {}
        self._reader_task: asyncio.Task | None = None

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def tools(self) -> list[dict]:
        return list(self._tools)

    @property
    def server_info(self) -> dict[str, Any]:
        return dict(self._server_info)

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    async def connect(self) -> None:
        if self._connected:
            return
        if self.transport == "stdio":
            await self._connect_stdio()
        elif self.transport == "http":
            await self._connect_http()
        else:
            raise MCPError(f"Unsupported transport: {self.transport}")

    async def _connect_stdio(self) -> None:
        if not self.command:
            raise MCPError(f"Server {self.name}: stdio transport requires 'command'")

        import os
        merged_env = {**os.environ, **self.env} if self.env else None

        try:
            self._process = await asyncio.create_subprocess_exec(
                self.command,
                *self.args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=merged_env,
            )
        except FileNotFoundError:
            raise MCPError(f"Server {self.name}: command not found: {self.command}")
        except OSError as e:
            raise MCPError(f"Server {self.name}: failed to start: {e}")

        self._reader_task = asyncio.create_task(self._stdio_reader())
        await self._initialize()
        self._connected = True

    async def _connect_http(self) -> None:
        if not self.url:
            raise MCPError(f"Server {self.name}: http transport requires 'url'")
        await self._initialize_http()
        self._connected = True

    async def _stdio_reader(self) -> None:
        """Background task that reads JSON-RPC messages from stdout."""
        assert self._process and self._process.stdout
        while True:
            try:
                line = await self._process.stdout.readline()
                if not line:
                    break
                line_str = line.decode("utf-8", errors="replace").strip()
                if not line_str:
                    continue
                try:
                    msg = json.loads(line_str)
                except json.JSONDecodeError:
                    log.debug("MCP %s: non-JSON stdout: %s", self.name, line_str[:200])
                    continue

                msg_id = msg.get("id")
                if msg_id is not None and msg_id in self._pending:
                    self._pending[msg_id].set_result(msg)
                # Notifications (no id) are logged but not dispatched
                elif msg_id is None:
                    method = msg.get("method", "")
                    log.debug("MCP %s: notification: %s", self.name, method)
            except asyncio.CancelledError:
                break
            except Exception:
                log.exception("MCP %s: reader error", self.name)
                break

    async def _send_request(self, method: str, params: dict | None = None) -> dict:
        """Send a JSON-RPC request and wait for the response."""
        if self.transport == "stdio":
            return await self._send_stdio_request(method, params)
        elif self.transport == "http":
            return await self._send_http_request(method, params)
        raise MCPError(f"Unsupported transport: {self.transport}")

    async def _send_stdio_request(self, method: str, params: dict | None = None) -> dict:
        if not self._process or not self._process.stdin:
            raise MCPError(f"Server {self.name}: not connected")

        req_id = self._next_id()
        request: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
        }
        if params is not None:
            request["params"] = params

        future: asyncio.Future[dict] = asyncio.get_event_loop().create_future()
        self._pending[req_id] = future

        try:
            line = json.dumps(request) + "\n"
            async with self._write_lock:
                self._process.stdin.write(line.encode("utf-8"))
                await self._process.stdin.drain()

            result = await asyncio.wait_for(future, timeout=self.timeout)
            return result
        except asyncio.TimeoutError:
            raise MCPError(f"Server {self.name}: request '{method}' timed out after {self.timeout}s")
        finally:
            self._pending.pop(req_id, None)

    async def _send_http_request(self, method: str, params: dict | None = None) -> dict:
        """Send a JSON-RPC request over HTTP POST."""
        try:
            import aiohttp
        except ImportError:
            raise MCPError("aiohttp required for HTTP transport")

        req_id = self._next_id()
        request: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
        }
        if params is not None:
            request["params"] = params

        hdrs = {"Content-Type": "application/json", **self.headers}

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.url, json=request, headers=hdrs, timeout=aiohttp.ClientTimeout(total=self.timeout)
                ) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        raise MCPError(
                            f"Server {self.name}: HTTP {resp.status}: {body[:500]}"
                        )
                    return await resp.json()
        except aiohttp.ClientError as e:
            raise MCPError(f"Server {self.name}: HTTP error: {e}")

    def _send_notification(self, method: str, params: dict | None = None) -> None:
        """Send a JSON-RPC notification (no response expected)."""
        if self.transport != "stdio" or not self._process or not self._process.stdin:
            return
        msg: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        line = json.dumps(msg) + "\n"
        self._process.stdin.write(line.encode("utf-8"))

    async def _initialize(self) -> None:
        """Perform the MCP initialize handshake."""
        resp = await asyncio.wait_for(
            self._send_request("initialize", {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": CLIENT_INFO,
            }),
            timeout=_INIT_TIMEOUT,
        )

        if "error" in resp:
            raise MCPError(
                f"Server {self.name}: initialize failed: {resp['error']}"
            )

        result = resp.get("result", {})
        self._server_info = result.get("serverInfo", {})
        self._send_notification("notifications/initialized")
        log.info(
            "MCP %s: initialized (server: %s)",
            self.name,
            self._server_info.get("name", "unknown"),
        )

    async def _initialize_http(self) -> None:
        """HTTP initialize handshake."""
        resp = await self._send_http_request("initialize", {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": CLIENT_INFO,
        })

        if "error" in resp:
            raise MCPError(
                f"Server {self.name}: initialize failed: {resp['error']}"
            )

        result = resp.get("result", {})
        self._server_info = result.get("serverInfo", {})
        log.info(
            "MCP %s: initialized via HTTP (server: %s)",
            self.name,
            self._server_info.get("name", "unknown"),
        )

    async def discover_tools(self) -> list[dict]:
        """Fetch the tool list from the server."""
        if not self._connected:
            raise MCPError(f"Server {self.name}: not connected")

        resp = await self._send_request("tools/list")

        if "error" in resp:
            raise MCPError(
                f"Server {self.name}: tools/list failed: {resp['error']}"
            )

        result = resp.get("result", {})
        raw_tools = result.get("tools", [])
        self._tools = []
        for t in raw_tools:
            name = t.get("name", "")
            if not name:
                continue
            self._tools.append({
                "name": name,
                "description": t.get("description", ""),
                "inputSchema": t.get("inputSchema", {"type": "object", "properties": {}}),
            })

        log.info("MCP %s: discovered %d tools", self.name, len(self._tools))
        return self._tools

    async def call_tool(self, tool_name: str, arguments: dict) -> str:
        """Invoke a tool on the server and return the result as text."""
        if not self._connected:
            raise MCPError(f"Server {self.name}: not connected")

        resp = await self._send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments,
        })

        if "error" in resp:
            err = resp["error"]
            msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
            return f"MCP error: {msg}"

        result = resp.get("result", {})
        is_error = result.get("isError", False)
        content_list = result.get("content", [])

        texts = []
        for item in content_list:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    texts.append(item.get("text", ""))
                elif item.get("type") == "image":
                    texts.append(f"[image: {item.get('mimeType', 'unknown')}]")
                elif item.get("type") == "resource":
                    texts.append(f"[resource: {item.get('uri', 'unknown')}]")
                else:
                    texts.append(str(item))
            elif isinstance(item, str):
                texts.append(item)

        output = "\n".join(texts) if texts else "(no output)"
        if is_error:
            output = f"Tool error: {output}"
        return output

    async def disconnect(self) -> None:
        """Disconnect from the server."""
        self._connected = False
        self._tools = []
        self._pending.clear()

        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
            self._reader_task = None

        if self._process:
            try:
                self._process.stdin.close() if self._process.stdin else None
                self._process.terminate()
                try:
                    await asyncio.wait_for(self._process.wait(), timeout=5)
                except asyncio.TimeoutError:
                    self._process.kill()
            except ProcessLookupError:
                pass
            self._process = None

        log.info("MCP %s: disconnected", self.name)


class MCPManager:
    """Manages multiple MCP server connections and exposes their tools."""

    def __init__(self, tool_timeout: int = _CALL_TIMEOUT) -> None:
        self._servers: dict[str, MCPServerConnection] = {}
        self._tool_index: dict[str, tuple[str, str]] = {}
        self._tool_cache: list[dict] | None = None
        self._tool_timeout = tool_timeout

    @property
    def server_names(self) -> list[str]:
        return list(self._servers.keys())

    def get_server(self, name: str) -> MCPServerConnection | None:
        return self._servers.get(name)

    async def add_server(
        self,
        name: str,
        transport: str,
        *,
        command: str = "",
        args: list[str] | None = None,
        url: str = "",
        headers: dict[str, str] | None = None,
        env: dict[str, str] | None = None,
        timeout: int | None = None,
    ) -> dict:
        """Add and connect an MCP server. Returns server info + discovered tools."""
        if name in self._servers:
            raise MCPError(f"Server '{name}' already registered")

        if not name.isidentifier():
            raise MCPError(
                f"Server name '{name}' must be a valid Python identifier "
                "(letters, digits, underscores, no leading digit)"
            )

        conn = MCPServerConnection(
            name, transport,
            command=command, args=args, url=url,
            headers=headers, env=env,
            timeout=timeout or self._tool_timeout,
        )

        await conn.connect()
        tools = await conn.discover_tools()
        self._servers[name] = conn

        for t in tools:
            namespaced = make_tool_name(name, t["name"])
            self._tool_index[namespaced] = (name, t["name"])

        self._tool_cache = None
        return {
            "server": name,
            "transport": transport,
            "server_info": conn.server_info,
            "tools_discovered": len(tools),
            "tool_names": [make_tool_name(name, t["name"]) for t in tools],
        }

    async def remove_server(self, name: str) -> None:
        """Disconnect and remove an MCP server."""
        conn = self._servers.pop(name, None)
        if conn is None:
            raise MCPError(f"Server '{name}' not found")

        keys_to_remove = [k for k, (s, _) in self._tool_index.items() if s == name]
        for k in keys_to_remove:
            del self._tool_index[k]

        await conn.disconnect()
        self._tool_cache = None

    def has_tool(self, tool_name: str) -> bool:
        return tool_name in self._tool_index

    def get_tool_definitions(self) -> list[dict]:
        """Return tool definitions for all connected servers in Odin's format."""
        if self._tool_cache is not None:
            return self._tool_cache

        defs = []
        for server_name, conn in self._servers.items():
            if not conn.connected:
                continue
            for t in conn.tools:
                namespaced = make_tool_name(server_name, t["name"])
                defs.append({
                    "name": namespaced,
                    "description": f"[MCP:{server_name}] {t.get('description', '')}",
                    "input_schema": t.get("inputSchema", {"type": "object", "properties": {}}),
                })

        self._tool_cache = defs
        return defs

    async def execute(self, tool_name: str, tool_input: dict) -> str:
        """Execute an MCP tool by its namespaced name."""
        mapping = self._tool_index.get(tool_name)
        if mapping is None:
            return f"Unknown MCP tool: {tool_name}"

        server_name, original_name = mapping
        conn = self._servers.get(server_name)
        if conn is None or not conn.connected:
            return f"MCP server '{server_name}' is not connected"

        try:
            return await asyncio.wait_for(
                conn.call_tool(original_name, tool_input),
                timeout=conn.timeout,
            )
        except asyncio.TimeoutError:
            return f"MCP tool '{tool_name}' timed out after {conn.timeout}s"
        except MCPError as e:
            return f"MCP error: {e}"
        except Exception as e:
            log.exception("MCP tool %s failed", tool_name)
            return f"MCP tool error: {e}"

    def get_status(self) -> list[dict]:
        """Return status of all registered servers."""
        result = []
        for name, conn in self._servers.items():
            result.append({
                "name": name,
                "transport": conn.transport,
                "connected": conn.connected,
                "server_info": conn.server_info,
                "tool_count": len(conn.tools),
                "tools": [make_tool_name(name, t["name"]) for t in conn.tools],
            })
        return result

    async def shutdown(self) -> None:
        """Disconnect all servers."""
        for name in list(self._servers):
            try:
                await self.remove_server(name)
            except Exception:
                log.exception("Error disconnecting MCP server %s", name)
