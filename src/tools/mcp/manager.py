"""MCP control plane: desired state, supervision, publication.

Always constructed (plan §4) — a globally disabled or empty installation
still has a manager, so status/CRUD surfaces never 503 and the first server
can always be added. Disabled means zero processes, zero HTTP sessions,
zero published tools — not "the control plane vanished".

Four states drive publication: Configured → Enabled → Connected → Published.
A tool is published iff global enabled AND server enabled AND the CURRENT
config generation connected AND a complete validated listing succeeded AND
the tool passed validation/limits. Every transition invalidates the catalog
synchronously via ``on_catalog_changed`` — no model request assembled after
a transition may contain a removed tool.

Concurrency: one reconciliation lock guards desired/published state; each
server has a single-flight connect/refresh guard; every mutation advances a
monotonic config generation, and a stale task (an old connect/refresh still
running after an edit/disable/remove) can never republish — it re-checks
its generation under the lock before touching published state.
"""

from __future__ import annotations

import asyncio
import hashlib
import random
import re
import time
from dataclasses import dataclass, field
from typing import Any

from ...odin_log import get_logger
from . import protocol as proto
from .client import DiscoveryResult, MCPServerConnection, ToolRecord
from .errors import MCPConfigError, MCPError
from .outcomes import OUTCOME_FAILED, MCPToolOutcome

log = get_logger("mcp.manager")

STATE_DISABLED = "disabled"
STATE_CONNECTING = "connecting"
STATE_CONNECTED = "connected"
STATE_STALE = "stale"
STATE_ERROR = "error"
STATE_BLOCKED = "blocked"

_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_SAFE_TOOL_CHARS = re.compile(r"[^A-Za-z0-9_-]")
_PUBLISHED_NAME_MAX = 64

_REFRESH_MIN_S = 60.0
_REFRESH_MAX_S = 600.0
_REFRESH_DEFAULT_S = 600.0
_BACKOFF_BASE_S = 5.0
_BACKOFF_MAX_S = 1800.0
_CONNECT_BUDGET_S = 20.0


def make_published_name(server: str, tool: str) -> str:
    """Deterministic provider-safe published name. MCP permits names model
    providers reject; sanitize to ``[A-Za-z0-9_-]`` and bound to 64 chars.
    When sanitization loses information or the name overflows, append an
    8-hex digest of the ORIGINAL pair so distinct tools can never merge."""
    safe_tool = _SAFE_TOOL_CHARS.sub("_", tool)
    base = f"mcp_{server}_{safe_tool}"
    if safe_tool == tool and len(base) <= _PUBLISHED_NAME_MAX:
        return base
    digest = hashlib.sha1(f"{server}/{tool}".encode()).hexdigest()[:8]
    keep = _PUBLISHED_NAME_MAX - 9  # "_" + digest
    return f"{base[:keep]}_{digest}"


@dataclass
class _ServerRuntime:
    """Runtime companion of one configured server."""

    config: dict[str, Any]
    generation: int
    state: str = STATE_DISABLED
    connection: MCPServerConnection | None = None
    discovered: list[ToolRecord] = field(default_factory=list)
    published: dict[str, ToolRecord] = field(default_factory=dict)  # published name → record
    ttl_ms: int | None = None
    last_error: str = ""
    blocked_reason: str = ""
    config_invalid: bool = False
    last_refresh_monotonic: float | None = None
    supervisor: asyncio.Task | None = None
    wake: asyncio.Event = field(default_factory=asyncio.Event)
    flight: asyncio.Lock = field(default_factory=asyncio.Lock)
    backoff_idx: int = 0

    @property
    def enabled(self) -> bool:
        return bool(self.config.get("enabled", True))


def _validate_server_config(name: str, config: dict[str, Any]) -> None:
    if not _NAME_RE.match(name or ""):
        raise MCPConfigError(
            f"invalid server name {name!r}: letters, digits, underscores, no leading digit"
        )
    transport = config.get("transport", "stdio")
    if transport not in ("stdio", "http"):
        raise MCPConfigError(f"{name}: transport must be 'stdio' or 'http'")
    if transport == "stdio" and not config.get("command"):
        raise MCPConfigError(f"{name}: stdio transport requires 'command'")
    if transport == "http":
        url = config.get("url", "")
        if not str(url).lower().startswith(("http://", "https://")):
            raise MCPConfigError(f"{name}: http transport requires an http(s) 'url'")
    for key in ("headers", "env"):
        mapping = config.get(key) or {}
        if not isinstance(mapping, dict):
            raise MCPConfigError(f"{name}: {key} must be a mapping")
        for k in mapping:
            if not str(k).strip() or any(c in str(k) for c in "\r\n\0"):
                raise MCPConfigError(f"{name}: illegal {key} key {k!r}")
    allowlist = config.get("tool_allowlist") or []
    if not isinstance(allowlist, list) or any(not isinstance(t, str) for t in allowlist):
        raise MCPConfigError(f"{name}: tool_allowlist must be a list of tool names")
    timeout = config.get("timeout_seconds", 120)
    if not isinstance(timeout, (int, float)) or not (1 <= float(timeout) <= 3600):
        raise MCPConfigError(f"{name}: timeout_seconds must be within 1–3600")


class MCPManager:
    """The control plane. Constructed synchronously with zero I/O; transports
    exist only for globally-enabled, per-server-enabled configurations after
    ``start()`` (or a mutation) reconciles them."""

    def __init__(self, *, on_catalog_changed: Any | None = None) -> None:
        self._servers: dict[str, _ServerRuntime] = {}
        self._global_enabled = False
        self._generation = 0
        self._lock = asyncio.Lock()
        self._on_catalog_changed = on_catalog_changed
        self._published_index: dict[str, tuple[str, ToolRecord]] = {}
        self._started = False
        self._stopping = False

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    @property
    def global_enabled(self) -> bool:
        return self._global_enabled

    @property
    def server_names(self) -> list[str]:
        return list(self._servers)

    def has_tool(self, published_name: str) -> bool:
        return published_name in self._published_index

    def get_tool_definitions(self) -> list[dict]:
        """Published tool definitions, catalog-shaped. Only CONNECTED
        current-generation servers contribute; everything else is zero."""
        defs: list[dict] = []
        for name, runtime in self._servers.items():
            if runtime.state != STATE_CONNECTED:
                continue
            for published_name, record in runtime.published.items():
                defs.append(
                    {
                        "name": published_name,
                        "description": f"[MCP:{name}] {record.description}"[
                            : proto.MAX_DESCRIPTION_CHARS + 16
                        ],
                        "input_schema": record.input_schema,
                    }
                )
        return defs

    def get_status(self) -> dict[str, Any]:
        servers = []
        for name, runtime in self._servers.items():
            conn_status = runtime.connection.status() if runtime.connection else {}
            age = (
                round(time.monotonic() - runtime.last_refresh_monotonic)
                if runtime.last_refresh_monotonic is not None
                else None
            )
            servers.append(
                {
                    "name": name,
                    "transport": runtime.config.get("transport", "stdio"),
                    "enabled": runtime.enabled,
                    "state": runtime.state,
                    "era": conn_status.get("era"),
                    "negotiated_version": conn_status.get("negotiated_version"),
                    "server_info": conn_status.get("server_info", {}),
                    "instructions": conn_status.get("instructions", ""),
                    "discovered_count": len(runtime.discovered),
                    "published_count": len(runtime.published),
                    "excluded_count": sum(1 for t in runtime.discovered if t.excluded),
                    "published_tools": sorted(runtime.published),
                    "original_tools": [t.name for t in runtime.discovered],
                    "last_error": runtime.last_error,
                    "blocked_reason": runtime.blocked_reason,
                    "last_refresh_age_seconds": age,
                    "stderr_tail": conn_status.get("stderr_tail", ""),
                    "generation": runtime.generation,
                }
            )
        return {
            "enabled": self._global_enabled,
            "server_count": len(self._servers),
            "connected_count": sum(1 for r in self._servers.values() if r.state == STATE_CONNECTED),
            "published_tool_count": len(self._published_index),
            "servers": servers,
        }

    # ------------------------------------------------------------------
    # Desired-state mutation (persistence is the caller's concern)
    # ------------------------------------------------------------------

    async def load_desired_state(
        self, *, enabled: bool, servers: dict[str, dict[str, Any]]
    ) -> None:
        """Adopt the full desired state (boot / config reload). Validates
        every server; invalid entries are recorded in error state rather
        than discarded silently."""
        async with self._lock:
            self._global_enabled = bool(enabled)
            for name, config in servers.items():
                runtime = _ServerRuntime(config=dict(config), generation=self._next_gen())
                try:
                    _validate_server_config(name, runtime.config)
                except MCPConfigError as e:
                    runtime.state = STATE_ERROR
                    runtime.last_error = str(e)
                    runtime.config_invalid = True
                self._servers[name] = runtime
            self._rebuild_published_index_locked()

    async def add_server(self, name: str, config: dict[str, Any]) -> dict[str, Any]:
        _validate_server_config(name, config)
        async with self._lock:
            if name in self._servers:
                raise MCPConfigError(f"server '{name}' already exists")
            runtime = _ServerRuntime(config=dict(config), generation=self._next_gen())
            self._servers[name] = runtime
        await self._reconcile_server(name)
        return self.get_status()

    async def update_server(self, name: str, config: dict[str, Any]) -> dict[str, Any]:
        _validate_server_config(name, config)
        async with self._lock:
            runtime = self._servers.get(name)
            if runtime is None:
                raise MCPConfigError(f"server '{name}' not found")
            runtime.config = dict(config)
            runtime.generation = self._next_gen()
            self._unpublish_locked(name, runtime, reason="configuration changed")
        await self._teardown_connection(name)
        await self._reconcile_server(name)
        return self.get_status()

    async def remove_server(self, name: str) -> None:
        async with self._lock:
            runtime = self._servers.pop(name, None)
            if runtime is None:
                raise MCPConfigError(f"server '{name}' not found")
            runtime.generation = self._next_gen()  # fences in-flight tasks
            self._unpublish_locked(name, runtime, reason="removed")
        await self._stop_supervisor(runtime)
        if runtime.connection is not None:
            await runtime.connection.disconnect()

    async def set_global_enabled(self, enabled: bool) -> None:
        """Off: synchronous unpublish, then teardown. On: async reconcile."""
        async with self._lock:
            self._global_enabled = bool(enabled)
            if not enabled:
                for sname, runtime in self._servers.items():
                    runtime.generation = self._next_gen()
                    self._unpublish_locked(sname, runtime, reason="MCP globally disabled")
                    runtime.state = STATE_DISABLED
        if not enabled:
            await asyncio.gather(
                *(self._teardown_connection(name) for name in list(self._servers)),
                return_exceptions=True,
            )
        else:
            await self.start()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Reconcile every enabled server (async supervisors; bounded
        connects). Safe to call repeatedly."""
        self._started = True
        self._stopping = False
        if not self._global_enabled:
            return
        await asyncio.gather(
            *(self._reconcile_server(name) for name in list(self._servers)),
            return_exceptions=True,
        )

    async def shutdown(self) -> None:
        """Concurrent, bounded teardown of everything."""
        self._stopping = True
        runtimes = list(self._servers.values())
        for runtime in runtimes:
            runtime.generation = self._next_gen()
        await asyncio.gather(*(self._stop_supervisor(r) for r in runtimes), return_exceptions=True)
        await asyncio.gather(
            *(r.connection.disconnect() for r in runtimes if r.connection is not None),
            return_exceptions=True,
        )
        async with self._lock:
            for sname, runtime in self._servers.items():
                self._unpublish_locked(sname, runtime, reason="shutdown")

    async def reconnect_server(self, name: str) -> dict[str, Any]:
        """Manual reconnect: teardown + fresh connect now."""
        async with self._lock:
            runtime = self._servers.get(name)
            if runtime is None:
                raise MCPConfigError(f"server '{name}' not found")
            runtime.generation = self._next_gen()
            runtime.backoff_idx = 0
            self._unpublish_locked(name, runtime, reason="reconnecting")
        await self._teardown_connection(name)
        await self._reconcile_server(name)
        return self.get_status()

    async def refresh_server_tools(self, name: str) -> dict[str, Any]:
        """Manual tools refresh, bypassing the poll interval."""
        runtime = self._servers.get(name)
        if runtime is None:
            raise MCPConfigError(f"server '{name}' not found")
        await self._refresh_tools(name)
        return self.get_status()

    # ------------------------------------------------------------------
    # Reconciliation internals
    # ------------------------------------------------------------------

    def _next_gen(self) -> int:
        self._generation += 1
        return self._generation

    def _notify_catalog_changed(self) -> None:
        if self._on_catalog_changed is not None:
            try:
                self._on_catalog_changed()
            except Exception:
                log.exception("MCP: catalog-changed callback failed")

    def _unpublish_locked(self, name: str, runtime: _ServerRuntime, *, reason: str) -> None:
        """Remove a server's tools from publication. Caller holds the lock.
        Synchronous — by the time any mutation returns, the catalog is
        already invalidated."""
        had_tools = bool(runtime.published)
        runtime.published = {}
        self._rebuild_published_index_locked()
        if had_tools:
            log.info("MCP %s: unpublished (%s)", name, reason)
            self._notify_catalog_changed()

    def _rebuild_published_index_locked(self) -> None:
        index: dict[str, tuple[str, ToolRecord]] = {}
        for name, runtime in self._servers.items():
            if runtime.state != STATE_CONNECTED:
                continue
            for published_name, record in runtime.published.items():
                index[published_name] = (name, record)
        self._published_index = index

    async def _teardown_connection(self, name: str) -> None:
        runtime = self._servers.get(name)
        if runtime is None:
            return
        await self._stop_supervisor(runtime)
        connection, runtime.connection = runtime.connection, None
        if connection is not None:
            try:
                await connection.disconnect()
            except Exception:
                log.exception("MCP %s: teardown error", name)

    async def _stop_supervisor(self, runtime: _ServerRuntime) -> None:
        task, runtime.supervisor = runtime.supervisor, None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    async def _reconcile_server(self, name: str) -> None:
        """Ensure the server's runtime matches desired state: spawn (or
        leave running) a supervisor for enabled servers under global enable;
        mark others disabled."""
        runtime = self._servers.get(name)
        if runtime is None:
            return
        if not self._global_enabled or not runtime.enabled:
            async with self._lock:
                current = self._servers.get(name)
                if current is runtime:
                    self._unpublish_locked(name, runtime, reason="disabled")
                    runtime.state = STATE_DISABLED
            await self._teardown_connection(name)
            return
        if runtime.config_invalid:
            return  # structurally invalid config cannot be supervised
        if runtime.supervisor is None or runtime.supervisor.done():
            first_attempt: asyncio.Future[bool] = asyncio.get_running_loop().create_future()
            runtime.supervisor = asyncio.create_task(
                self._supervise(name, runtime.generation, first_attempt=first_attempt),
                name=f"mcp-supervise-{name}",
            )
            # Boot/mutation contract: wait out the FIRST bounded connect
            # attempt (so callers can report connected: true|false), never
            # the retries — the supervisor keeps working in the background.
            try:
                await asyncio.wait_for(
                    asyncio.shield(first_attempt), timeout=_CONNECT_BUDGET_S + 15
                )
            except TimeoutError:
                pass
        else:
            runtime.wake.set()

    async def _supervise(
        self,
        name: str,
        generation: int,
        *,
        first_attempt: asyncio.Future[bool] | None = None,
    ) -> None:
        """Per-server supervisor: connect (with jittered exponential backoff
        on failure), then hold a refresh loop. Fenced by generation — the
        moment desired state moves on, this task abandons without touching
        published state. ``first_attempt`` resolves once the initial connect
        attempt settles (either way)."""

        def settle_first(value: bool) -> None:
            if first_attempt is not None and not first_attempt.done():
                first_attempt.set_result(value)

        try:
            while not self._stopping:
                runtime = self._servers.get(name)
                if runtime is None or runtime.generation != generation:
                    return
                if not self._global_enabled or not runtime.enabled:
                    return
                if (
                    runtime.state not in (STATE_CONNECTED, STATE_BLOCKED)
                    or runtime.connection is None
                ):
                    connected = await self._connect_once(name, generation)
                    settle_first(connected)
                    runtime = self._servers.get(name)
                    if runtime is None or runtime.generation != generation:
                        return
                    if not connected:
                        delay = self._backoff_delay(runtime)
                        try:
                            await asyncio.wait_for(runtime.wake.wait(), timeout=delay)
                        except TimeoutError:
                            pass
                        runtime.wake.clear()
                        continue
                settle_first(True)
                # Connected: wait out the refresh interval (or a wake), refresh.
                delay = self._refresh_delay(runtime)
                try:
                    await asyncio.wait_for(runtime.wake.wait(), timeout=delay)
                except TimeoutError:
                    pass
                runtime.wake.clear()
                runtime = self._servers.get(name)
                if runtime is None or runtime.generation != generation or self._stopping:
                    return
                if runtime.state in (STATE_CONNECTED, STATE_BLOCKED):
                    # Blocked servers refresh too: a server-side listing change
                    # (or an allowlist edit, which arrives as a new generation)
                    # can resolve the block without a reconnect.
                    await self._refresh_tools(name)
        finally:
            settle_first(False)

    def _backoff_delay(self, runtime: _ServerRuntime) -> float:
        delay = min(_BACKOFF_BASE_S * (2**runtime.backoff_idx), _BACKOFF_MAX_S)
        runtime.backoff_idx = min(runtime.backoff_idx + 1, 12)
        return delay * random.uniform(0.9, 1.1)

    def _refresh_delay(self, runtime: _ServerRuntime) -> float:
        if runtime.ttl_ms is not None and runtime.ttl_ms > 0:
            base = min(max(runtime.ttl_ms / 1000.0, _REFRESH_MIN_S), _REFRESH_MAX_S)
        else:
            base = _REFRESH_DEFAULT_S
        return base * random.uniform(0.9, 1.1)

    async def _connect_once(self, name: str, generation: int) -> bool:
        runtime = self._servers.get(name)
        if runtime is None or runtime.generation != generation:
            return False
        async with runtime.flight:
            runtime = self._servers.get(name)
            if runtime is None or runtime.generation != generation:
                return False
            runtime.state = STATE_CONNECTING
            config = runtime.config
            connection = MCPServerConnection(
                name,
                config.get("transport", "stdio"),
                command=config.get("command", ""),
                args=list(config.get("args", []) or []),
                url=config.get("url", ""),
                headers=dict(config.get("headers", {}) or {}),
                env=dict(config.get("env", {}) or {}),
                cwd=config.get("cwd", ""),
                timeout=float(config.get("timeout_seconds", 120)),
                on_tools_list_changed=lambda: self._on_list_changed(name, generation),
                on_connection_lost=lambda reason: self._on_lost(name, generation, reason),
            )
            try:
                await asyncio.wait_for(connection.connect(), timeout=_CONNECT_BUDGET_S)
                discovery = await connection.discover_tools()
            except TimeoutError:
                await connection.disconnect()
                return await self._record_connect_failure(name, generation, "connect timed out")
            except MCPError as e:
                await connection.disconnect()
                return await self._record_connect_failure(name, generation, str(e))
            except Exception as e:
                await connection.disconnect()
                log.exception("MCP %s: unexpected connect failure", name)
                return await self._record_connect_failure(
                    name, generation, f"unexpected: {e.__class__.__name__}"
                )
            published = await self._publish(name, generation, connection, discovery)
            if not published:
                await connection.disconnect()
            return published

    async def _record_connect_failure(self, name: str, generation: int, reason: str) -> bool:
        async with self._lock:
            runtime = self._servers.get(name)
            if runtime is None or runtime.generation != generation:
                return False
            runtime.state = STATE_ERROR
            runtime.last_error = reason[:500]
            runtime.connection = None
            self._rebuild_published_index_locked()
        log.warning("MCP %s: connect failed: %s", name, reason)
        return False

    async def _publish(
        self,
        name: str,
        generation: int,
        connection: MCPServerConnection,
        discovery: DiscoveryResult,
    ) -> bool:
        """Validate limits and publish under the lock, fenced by generation.
        Over-limit servers are BLOCKED — they publish nothing until the
        admin narrows the allowlist; the first N are never silently chosen."""
        async with self._lock:
            runtime = self._servers.get(name)
            if runtime is None or runtime.generation != generation:
                return False  # stale task: never republish
            allowlist = set(runtime.config.get("tool_allowlist") or [])
            candidates = [
                t
                for t in discovery.tools
                if not t.excluded and (not allowlist or t.name in allowlist)
            ]
            runtime.discovered = discovery.tools
            runtime.ttl_ms = discovery.ttl_ms
            runtime.last_refresh_monotonic = time.monotonic()
            runtime.connection = connection
            runtime.backoff_idx = 0
            if len(candidates) > proto.MAX_PUBLISHED_TOOLS_PER_SERVER:
                runtime.state = STATE_BLOCKED
                runtime.published = {}
                runtime.blocked_reason = (
                    f"{len(candidates)} publishable tools exceed the per-server "
                    f"limit of {proto.MAX_PUBLISHED_TOOLS_PER_SERVER}; narrow "
                    "tool_allowlist to select the tools to publish"
                )
                runtime.last_error = runtime.blocked_reason
                self._rebuild_published_index_locked()
                self._notify_catalog_changed()
                return True  # connection stays for status/UI; publishes zero
            global_published = sum(
                len(r.published)
                for n, r in self._servers.items()
                if n != name and r.state == STATE_CONNECTED
            )
            if global_published + len(candidates) > proto.MAX_PUBLISHED_TOOLS_GLOBAL:
                runtime.state = STATE_BLOCKED
                runtime.published = {}
                runtime.blocked_reason = (
                    f"publishing {len(candidates)} tools would exceed the "
                    f"global MCP limit of {proto.MAX_PUBLISHED_TOOLS_GLOBAL} "
                    f"({global_published} already published); narrow "
                    "tool_allowlist"
                )
                runtime.last_error = runtime.blocked_reason
                self._rebuild_published_index_locked()
                self._notify_catalog_changed()
                return True
            published: dict[str, ToolRecord] = {}
            collision = False
            for record in candidates:
                published_name = make_published_name(name, record.name)
                if published_name in published or any(
                    published_name in r.published for n, r in self._servers.items() if n != name
                ):
                    collision = True
                    break
                published[published_name] = record
            if collision:
                runtime.state = STATE_BLOCKED
                runtime.published = {}
                runtime.blocked_reason = (
                    "published-name collision after provider-safe normalization"
                )
                runtime.last_error = runtime.blocked_reason
                self._rebuild_published_index_locked()
                self._notify_catalog_changed()
                return True
            runtime.state = STATE_CONNECTED
            runtime.published = published
            runtime.last_error = ""
            runtime.blocked_reason = ""
            self._rebuild_published_index_locked()
        log.info(
            "MCP %s: connected (%s tools published, %s discovered)",
            name,
            len(published),
            len(discovery.tools),
        )
        self._notify_catalog_changed()
        return True

    async def _refresh_tools(self, name: str) -> None:
        """Re-discover; a FAILED refresh unpublishes the active snapshot
        until a successful refresh/reconnect. The stale list stays visible
        as diagnostic data only."""
        runtime = self._servers.get(name)
        if runtime is None or runtime.connection is None:
            return
        generation = runtime.generation
        async with runtime.flight:
            runtime = self._servers.get(name)
            if runtime is None or runtime.generation != generation:
                return
            connection = runtime.connection
            if connection is None or not connection.connected:
                return
            try:
                discovery = await connection.discover_tools()
            except MCPError as e:
                async with self._lock:
                    runtime = self._servers.get(name)
                    if runtime is None or runtime.generation != generation:
                        return
                    runtime.state = STATE_STALE
                    runtime.last_error = f"tools refresh failed: {e}"[:500]
                    self._unpublish_locked(name, runtime, reason="refresh failed")
                runtime.wake.set()
                return
            await self._publish(name, generation, connection, discovery)

    def _on_list_changed(self, name: str, generation: int) -> None:
        runtime = self._servers.get(name)
        if runtime is not None and runtime.generation == generation:
            runtime.wake.set()

    def _on_lost(self, name: str, generation: int, reason: str) -> None:
        runtime = self._servers.get(name)
        if runtime is None or runtime.generation != generation:
            return
        asyncio.get_running_loop().create_task(self._handle_lost(name, generation, reason))

    async def _handle_lost(self, name: str, generation: int, reason: str) -> None:
        async with self._lock:
            runtime = self._servers.get(name)
            if runtime is None or runtime.generation != generation:
                return
            runtime.state = STATE_ERROR
            runtime.last_error = reason[:500]
            self._unpublish_locked(name, runtime, reason=f"connection lost: {reason}")
        runtime.wake.set()

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    async def execute(self, published_name: str, tool_input: dict) -> MCPToolOutcome:
        """Dispatch one published tool. A stale call against a tool that is
        no longer published fails here — typed, never a silent pass."""
        entry = self._published_index.get(published_name)
        if entry is None:
            return MCPToolOutcome(
                status=OUTCOME_FAILED,
                text=(
                    f"MCP tool '{published_name}' is not currently published "
                    "(server disabled, disconnected, or tool removed)"
                ),
                server="",
                tool=published_name,
            )
        server_name, record = entry
        runtime = self._servers.get(server_name)
        if runtime is None or runtime.state != STATE_CONNECTED or runtime.connection is None:
            return MCPToolOutcome(
                status=OUTCOME_FAILED,
                text=f"MCP server '{server_name}' is not connected",
                server=server_name,
                tool=record.name,
            )
        return await runtime.connection.call_tool(
            record,
            dict(tool_input or {}),
            timeout=float(runtime.config.get("timeout_seconds", 120)),
            generation=runtime.generation,
        )
