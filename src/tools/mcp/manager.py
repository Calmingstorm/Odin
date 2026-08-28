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
import copy
import hashlib
import random
import re
import time
from dataclasses import dataclass, field
from typing import Any

from ...llm.secret_scrubber import scrub_output_secrets
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


@dataclass(frozen=True)
class _DesiredStateTransition:
    """Captured identities retired/reconciled after a durable desired commit."""

    retire: tuple[_ServerRuntime, ...]
    reconcile_names: tuple[str, ...]


def validate_server_config(name: str, config: dict[str, Any]) -> None:
    if len(name) > proto.MAX_AUDIT_IDENTIFIER_CHARS:
        raise MCPConfigError(
            f"invalid server name: exceeds {proto.MAX_AUDIT_IDENTIFIER_CHARS} characters"
        )
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
    cwd = config.get("cwd", "")
    if cwd and ("\0" in str(cwd) or not str(cwd).startswith("/")):
        raise MCPConfigError(f"{name}: cwd must be an absolute path without NUL bytes")


def _configured_secret_values(config: dict[str, Any]) -> list[str]:
    values: set[str] = set()
    for config_field in ("headers", "env"):
        mapping = config.get(config_field) or {}
        if isinstance(mapping, dict):
            values.update(str(value) for value in mapping.values() if str(value))
    return sorted(values, key=len, reverse=True)


def _scrub_operator_text(config: dict[str, Any], value: Any, *, limit: int) -> str:
    """Bound and scrub server-authored text before status or logs see it."""
    text = str(value or "")
    for secret in _configured_secret_values(config):
        text = text.replace(secret, "[REDACTED]")
    text = scrub_output_secrets(text)
    text = "".join(
        char for char in text if char in "\n\t" or not (ord(char) < 32 or 127 <= ord(char) <= 159)
    )
    return text[:limit]


def _scrub_operator_value(config: dict[str, Any], value: Any, *, depth: int = 0) -> Any:
    """Recursively scrub the small server identity object exposed in status."""
    if depth >= 8:
        return "[TRUNCATED]"
    if isinstance(value, str):
        return _scrub_operator_text(config, value, limit=1024)
    if isinstance(value, dict):
        return {
            _scrub_operator_text(config, key, limit=128): _scrub_operator_value(
                config, item, depth=depth + 1
            )
            for key, item in list(value.items())[:64]
        }
    if isinstance(value, list):
        return [_scrub_operator_value(config, item, depth=depth + 1) for item in value[:64]]
    return value if isinstance(value, (bool, int, float)) or value is None else ""


class MCPManager:
    """The control plane. Constructed synchronously with zero I/O; transports
    exist only for globally-enabled, per-server-enabled configurations after
    ``start()`` (or a mutation) reconciles them."""

    def __init__(self, *, on_catalog_changed: Any | None = None) -> None:
        self._servers: dict[str, _ServerRuntime] = {}
        self._global_enabled = False
        self._generation = 0
        # _lock guards short, await-free desired/publication mutations. The
        # separate lifecycle lock serializes transitions whose teardown or
        # first-connect work necessarily awaits.
        self._lock = asyncio.Lock()
        self._lifecycle_lock = asyncio.Lock()
        self._on_catalog_changed = on_catalog_changed
        self._published_index: dict[str, tuple[str, ToolRecord]] = {}
        self._started = False
        self._stopping = False
        self._closed = False
        self._shutdown_task: asyncio.Task[None] | None = None

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    def set_on_catalog_changed(self, callback: Any | None) -> None:
        """Late-bind the catalog invalidation hook (the manager is built in
        build_services, the tool catalog in build_components)."""
        self._on_catalog_changed = callback

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
                    "server_info": _scrub_operator_value(
                        runtime.config, conn_status.get("server_info", {})
                    ),
                    "instructions": _scrub_operator_text(
                        runtime.config, conn_status.get("instructions", ""), limit=4096
                    ),
                    "discovered_count": len(runtime.discovered),
                    "published_count": len(runtime.published),
                    "excluded_count": sum(1 for t in runtime.discovered if t.excluded),
                    "published_tools": [
                        _scrub_operator_text(runtime.config, tool, limit=64)
                        for tool in sorted(runtime.published)
                    ],
                    "original_tools": [
                        _scrub_operator_text(
                            runtime.config, tool.name, limit=proto.MAX_AUDIT_IDENTIFIER_CHARS
                        )
                        for tool in runtime.discovered
                    ],
                    "last_error": _scrub_operator_text(
                        runtime.config, runtime.last_error, limit=500
                    ),
                    "blocked_reason": _scrub_operator_text(
                        runtime.config, runtime.blocked_reason, limit=500
                    ),
                    "last_refresh_age_seconds": age,
                    "stderr_tail": _scrub_operator_text(
                        runtime.config, conn_status.get("stderr_tail", ""), limit=4000
                    ),
                    "generation": runtime.generation,
                    # Secret KEY NAMES only — values never leave the manager.
                    "header_keys": sorted((runtime.config.get("headers") or {}).keys()),
                    "env_keys": sorted((runtime.config.get("env") or {}).keys()),
                }
            )
        return {
            "enabled": self._global_enabled,
            "server_count": len(self._servers),
            "enabled_server_count": sum(1 for r in self._servers.values() if r.enabled),
            "connected_count": sum(1 for r in self._servers.values() if r.state == STATE_CONNECTED),
            "published_tool_count": len(self._published_index),
            "servers": servers,
        }

    async def _drain_transition(
        self,
        operation: Any,
        *,
        committed: asyncio.Event,
        name: str,
    ) -> Any:
        """Give cancellation transactional lifecycle semantics.

        A transition cancelled while merely queued behind ``_lifecycle_lock``
        is cancelled and never mutates desired state. Once the inner operation
        marks ``committed`` immediately before its first mutation, cancellation
        cannot abandon retirement/reconciliation halfway through: the task is
        shielded and drained to a coherent state before cancellation is restored
        to the caller.
        """
        task = asyncio.create_task(operation, name=f"mcp-transition-{name}")
        cancelled = False
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                if not task.done() and not committed.is_set():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                    raise
                cancelled = True
                current = asyncio.current_task()
                if current is not None:
                    while current.cancelling():
                        current.uncancel()
                if task.done():
                    break
        result = await task
        if cancelled:
            raise asyncio.CancelledError
        return result

    async def load_desired_state(
        self, *, enabled: bool, servers: dict[str, dict[str, Any]]
    ) -> None:
        committed = asyncio.Event()
        await self._drain_transition(
            self._load_desired_state_inner(enabled=enabled, servers=servers, committed=committed),
            committed=committed,
            name="load-desired-state",
        )

    async def add_server(self, name: str, config: dict[str, Any]) -> dict[str, Any]:
        committed = asyncio.Event()
        return await self._drain_transition(
            self._add_server_inner(name, config, committed=committed),
            committed=committed,
            name=f"add-{name}",
        )

    async def update_server(self, name: str, config: dict[str, Any]) -> dict[str, Any]:
        committed = asyncio.Event()
        return await self._drain_transition(
            self._update_server_inner(name, config, committed=committed),
            committed=committed,
            name=f"update-{name}",
        )

    async def remove_server(self, name: str) -> None:
        committed = asyncio.Event()
        await self._drain_transition(
            self._remove_server_inner(name, committed=committed),
            committed=committed,
            name=f"remove-{name}",
        )

    async def set_global_enabled(self, enabled: bool) -> None:
        committed = asyncio.Event()
        await self._drain_transition(
            self._set_global_enabled_inner(enabled, committed=committed),
            committed=committed,
            name="global-enabled",
        )

    async def start(self, *, wait_for_first_attempt: bool = True) -> None:
        committed = asyncio.Event()
        await self._drain_transition(
            self._start_inner(wait_for_first_attempt=wait_for_first_attempt, committed=committed),
            committed=committed,
            name="start",
        )

    async def reconnect_server(self, name: str) -> dict[str, Any]:
        committed = asyncio.Event()
        return await self._drain_transition(
            self._reconnect_server_inner(name, committed=committed),
            committed=committed,
            name=f"reconnect-{name}",
        )

    def server_tools(self, name: str) -> list[dict[str, Any]]:
        """Discovered tools for one server: original + published names,
        publication/exclusion truth. Raises for unknown servers."""
        runtime = self._servers.get(name)
        if runtime is None:
            raise MCPConfigError(f"server '{name}' not found")
        published_by_record = {id(rec): pub for pub, rec in runtime.published.items()}
        rows: list[dict[str, Any]] = []
        for record in runtime.discovered:
            rows.append(
                {
                    "original_name": _scrub_operator_text(
                        runtime.config, record.name, limit=proto.MAX_AUDIT_IDENTIFIER_CHARS
                    ),
                    "published_name": _scrub_operator_text(
                        runtime.config, published_by_record.get(id(record)), limit=64
                    )
                    if published_by_record.get(id(record))
                    else None,
                    "published": id(record) in published_by_record,
                    "excluded": record.excluded,
                    "exclusion_reason": _scrub_operator_text(
                        runtime.config, record.exclusion_reason, limit=500
                    ),
                    "description": _scrub_operator_text(
                        runtime.config, record.description, limit=proto.MAX_DESCRIPTION_CHARS
                    ),
                }
            )
        return rows

    def desired_servers(self) -> dict[str, dict[str, Any]]:
        """Deep copy of the desired per-server configs (persistence source)."""
        return {name: copy.deepcopy(r.config) for name, r in self._servers.items()}

    # ------------------------------------------------------------------
    # Desired-state mutation (persistence is the caller's concern)
    # ------------------------------------------------------------------

    def stage_desired_state(
        self, *, enabled: bool, servers: dict[str, dict[str, Any]]
    ) -> _DesiredStateTransition:
        """Adopt durable desired state and unpublish superseded tools only.

        This is the post-persist half of the management transaction.  It is
        deliberately free of transport I/O, so callers may invoke it before
        releasing ``config_transaction()``: disk, ``bot.config``, generation,
        and catalog absence then become one observable commit.  Retirement and
        reconnect happen later through :meth:`finish_desired_state`.
        """
        self._ensure_open()
        desired = {name: copy.deepcopy(config) for name, config in servers.items()}
        retire: list[_ServerRuntime] = []
        changed_names: list[str] = []
        # No await and no transport work: this function is one event-loop
        # atomic section.  That is the assembled-request boundary — after the
        # disk writer settles, no other task can assemble a catalog between
        # generation advancement and superseded unpublication.
        previous_enabled = self._global_enabled
        previous = self._servers
        replacements: dict[str, _ServerRuntime] = {}
        catalog_changed = False

        for name, config in desired.items():
            old = previous.get(name)
            if old is not None and old.config == config:
                replacements[name] = old
                continue
            runtime = _ServerRuntime(config=config, generation=self._next_gen())
            try:
                validate_server_config(name, runtime.config)
            except MCPConfigError as exc:
                runtime.state = STATE_ERROR
                runtime.last_error = _scrub_operator_text(runtime.config, exc, limit=500)
                runtime.config_invalid = True
            replacements[name] = runtime
            changed_names.append(name)

        for name, old in previous.items():
            if replacements.get(name) is old:
                continue
            old.generation = self._next_gen()
            catalog_changed = catalog_changed or bool(old.published)
            old.published = {}
            retire.append(old)

        # Global disable fences every reused runtime now.  A supervisor
        # from the prior generation cannot publish after this block.
        if previous_enabled and not enabled:
            retired_ids = {id(runtime) for runtime in retire}
            for name, runtime in replacements.items():
                if id(runtime) in retired_ids:
                    continue
                runtime.generation = self._next_gen()
                catalog_changed = catalog_changed or bool(runtime.published)
                runtime.published = {}
                runtime.state = STATE_DISABLED
                retire.append(runtime)
        elif not previous_enabled and enabled:
            changed_names = list(replacements)

        self._global_enabled = bool(enabled)
        self._servers = replacements
        self._rebuild_published_index_locked()
        if catalog_changed:
            self._notify_catalog_changed()
        # Preserve order while deduplicating identities/names.
        unique_retire = tuple(dict.fromkeys(map(id, retire)))
        retire_by_id = {id(runtime): runtime for runtime in retire}
        captured_retire = tuple(retire_by_id[identity] for identity in unique_retire)
        return _DesiredStateTransition(
            retire=captured_retire,
            reconcile_names=tuple(dict.fromkeys(changed_names)),
        )

    async def finish_desired_state(self, transition: _DesiredStateTransition) -> None:
        """Cancellation-safe retirement/reconcile after a staged commit."""
        committed = asyncio.Event()
        committed.set()  # desired state already committed; finishing is mandatory
        await self._drain_transition(
            self._finish_desired_state_inner(transition),
            committed=committed,
            name="finish-desired-state",
        )

    async def _finish_desired_state_inner(self, transition: _DesiredStateTransition) -> None:
        async with self._lifecycle_lock:
            await asyncio.gather(
                *(self._retire_runtime(runtime) for runtime in transition.retire),
                return_exceptions=True,
            )
            if self._started and self._global_enabled:
                await asyncio.gather(
                    *(
                        self._reconcile_server(name)
                        for name in transition.reconcile_names
                        if name in self._servers
                    ),
                    return_exceptions=True,
                )

    async def _load_desired_state_inner(
        self,
        *,
        enabled: bool,
        servers: dict[str, dict[str, Any]],
        committed: asyncio.Event,
    ) -> None:
        """Adopt the full desired state (boot / config reload).

        Lifecycle transitions are serialized through retirement so a reload
        cannot race a disable/enable and orphan a supervisor. Invalid entries
        remain inspectable in error state rather than disappearing silently.
        """
        async with self._lifecycle_lock:
            self._ensure_open()
            desired_configs = {name: copy.deepcopy(config) for name, config in servers.items()}
            retire: list[_ServerRuntime] = []
            async with self._lock:
                committed.set()
                previous_enabled = self._global_enabled
                previous = self._servers
                replacements: dict[str, _ServerRuntime] = {}
                catalog_changed = False
                for name, config in desired_configs.items():
                    old = previous.get(name)
                    reuse = (
                        old is not None
                        and old.config == config
                        and previous_enabled == bool(enabled)
                    )
                    if reuse:
                        assert old is not None
                        replacements[name] = old
                        continue
                    runtime = _ServerRuntime(config=config, generation=self._next_gen())
                    try:
                        validate_server_config(name, runtime.config)
                    except MCPConfigError as e:
                        runtime.state = STATE_ERROR
                        runtime.last_error = str(e)
                        runtime.config_invalid = True
                    replacements[name] = runtime
                for name, old in previous.items():
                    if replacements.get(name) is old:
                        continue
                    old.generation = self._next_gen()
                    catalog_changed = catalog_changed or bool(old.published)
                    old.published = {}
                    retire.append(old)
                self._global_enabled = bool(enabled)
                self._servers = replacements
                self._rebuild_published_index_locked()
                if catalog_changed:
                    self._notify_catalog_changed()
            await asyncio.gather(
                *(self._retire_runtime(runtime) for runtime in retire),
                return_exceptions=True,
            )
            if self._started and self._global_enabled:
                await asyncio.gather(
                    *(self._reconcile_server(name) for name in list(self._servers)),
                    return_exceptions=True,
                )

    async def _add_server_inner(
        self, name: str, config: dict[str, Any], *, committed: asyncio.Event
    ) -> dict[str, Any]:
        async with self._lifecycle_lock:
            self._ensure_open()
            validate_server_config(name, config)
            async with self._lock:
                committed.set()
                if name in self._servers:
                    raise MCPConfigError(f"server '{name}' already exists")
                runtime = _ServerRuntime(config=copy.deepcopy(config), generation=self._next_gen())
                self._servers[name] = runtime
            await self._reconcile_server(name)
            return self.get_status()

    async def _update_server_inner(
        self, name: str, config: dict[str, Any], *, committed: asyncio.Event
    ) -> dict[str, Any]:
        async with self._lifecycle_lock:
            self._ensure_open()
            validate_server_config(name, config)
            async with self._lock:
                committed.set()
                old = self._servers.get(name)
                if old is None:
                    raise MCPConfigError(f"server '{name}' not found")
                old.generation = self._next_gen()
                self._unpublish_locked(name, old, reason="configuration changed")
                runtime = _ServerRuntime(config=copy.deepcopy(config), generation=self._next_gen())
                self._servers[name] = runtime
            await self._retire_runtime(old)
            await self._reconcile_server(name)
            return self.get_status()

    async def _remove_server_inner(self, name: str, *, committed: asyncio.Event) -> None:
        async with self._lifecycle_lock:
            self._ensure_open()
            async with self._lock:
                committed.set()
                runtime = self._servers.pop(name, None)
                if runtime is None:
                    raise MCPConfigError(f"server '{name}' not found")
                runtime.generation = self._next_gen()
                self._unpublish_locked(name, runtime, reason="removed")
            await self._retire_runtime(runtime)

    async def _set_global_enabled_inner(self, enabled: bool, *, committed: asyncio.Event) -> None:
        """Serialize disable teardown and enable supervision as one transition."""
        async with self._lifecycle_lock:
            self._ensure_open()
            runtimes: list[_ServerRuntime] = []
            async with self._lock:
                committed.set()
                self._global_enabled = bool(enabled)
                if not enabled:
                    runtimes = list(self._servers.values())
                    for sname, runtime in self._servers.items():
                        runtime.generation = self._next_gen()
                        self._unpublish_locked(sname, runtime, reason="MCP globally disabled")
                        runtime.state = STATE_DISABLED
            if not enabled:
                await asyncio.gather(
                    *(self._retire_runtime(runtime) for runtime in runtimes),
                    return_exceptions=True,
                )
            else:
                await self._start_locked(wait_for_first_attempt=True)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def _ensure_open(self) -> None:
        if self._closed:
            raise MCPConfigError("MCP manager has shut down")

    async def _start_inner(
        self,
        *,
        wait_for_first_attempt: bool = True,
        committed: asyncio.Event,
    ) -> None:
        """Start supervisors for all enabled servers.

        Normal control-plane mutations may await each first bounded attempt.
        Boot passes ``wait_for_first_attempt=False`` so gateway setup is never
        held behind network/process probes; those attempts remain owned by the
        supervisors and continue under their ordinary budgets.
        """
        async with self._lifecycle_lock:
            if self._closed:
                return
            committed.set()
            await self._start_locked(wait_for_first_attempt=wait_for_first_attempt)

    async def _start_locked(self, *, wait_for_first_attempt: bool) -> None:
        if self._closed:
            return
        self._started = True
        self._stopping = False
        if not self._global_enabled:
            return
        await asyncio.gather(
            *(
                self._reconcile_server(name, wait_for_first_attempt=wait_for_first_attempt)
                for name in list(self._servers)
            ),
            return_exceptions=True,
        )

    async def shutdown(self) -> None:
        """Terminal, cancellation-safe teardown of every owned runtime.

        Closing is fenced before any await, so stale startup/reload work can
        never publish or create a supervisor afterward. The teardown task is
        shielded and drained even if its caller is cancelled.
        """
        task = self._shutdown_task
        if task is None:
            # This block is await-free and therefore atomic on the event loop.
            # Fence first; a currently-running transition may finish its own
            # await, but every later reconciliation observes _closed.
            self._closed = True
            self._stopping = True
            self._started = False
            task = asyncio.create_task(self._shutdown_serialized(), name="mcp-shutdown")
            self._shutdown_task = task
        cancelled = False
        while not task.done():
            current = asyncio.current_task()
            if current is not None:
                while current.cancelling():
                    current.uncancel()
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                cancelled = True
        await task
        if cancelled:
            raise asyncio.CancelledError

    async def _shutdown_serialized(self) -> None:
        async with self._lifecycle_lock:
            await self._shutdown_inner()

    async def _shutdown_inner(self) -> None:
        async with self._lock:
            runtimes = list(self._servers.values())
            for sname, runtime in self._servers.items():
                runtime.generation = self._next_gen()
                runtime.state = STATE_DISABLED
                self._unpublish_locked(sname, runtime, reason="shutdown")
        await asyncio.gather(
            *(self._retire_runtime(runtime) for runtime in runtimes),
            return_exceptions=True,
        )

    async def _reconnect_server_inner(
        self, name: str, *, committed: asyncio.Event
    ) -> dict[str, Any]:
        """Manual reconnect: teardown + fresh connect now."""
        async with self._lifecycle_lock:
            self._ensure_open()
            async with self._lock:
                committed.set()
                old = self._servers.get(name)
                if old is None:
                    raise MCPConfigError(f"server '{name}' not found")
                old.generation = self._next_gen()
                self._unpublish_locked(name, old, reason="reconnecting")
                runtime = _ServerRuntime(
                    config=copy.deepcopy(old.config), generation=self._next_gen()
                )
                self._servers[name] = runtime
            await self._retire_runtime(old)
            await self._reconcile_server(name)
            return self.get_status()

    async def refresh_server_tools(self, name: str) -> dict[str, Any]:
        """Manual tools refresh, bypassing the poll interval."""
        self._ensure_open()
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

    async def _retire_runtime(self, runtime: _ServerRuntime) -> None:
        """Stop one captured runtime by identity, never by a reused name."""
        await self._stop_supervisor(runtime)
        connection, runtime.connection = runtime.connection, None
        if connection is not None:
            try:
                await connection.disconnect()
            except Exception:
                log.exception("MCP: retired runtime teardown error")

    async def _stop_supervisor(self, runtime: _ServerRuntime) -> None:
        task, runtime.supervisor = runtime.supervisor, None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    async def _reconcile_server(self, name: str, *, wait_for_first_attempt: bool = True) -> None:
        """Ensure the server's runtime matches desired state: spawn (or
        leave running) a supervisor for enabled servers under global enable;
        mark others disabled."""
        runtime = self._servers.get(name)
        if runtime is None or self._closed:
            return
        if not self._global_enabled or not runtime.enabled:
            async with self._lock:
                current = self._servers.get(name)
                if current is runtime:
                    self._unpublish_locked(name, runtime, reason="disabled")
                    runtime.state = STATE_DISABLED
            await self._retire_runtime(runtime)
            return
        if runtime.config_invalid:
            return  # structurally invalid config cannot be supervised
        if runtime.supervisor is None or runtime.supervisor.done():
            first_attempt: asyncio.Future[bool] = asyncio.get_running_loop().create_future()
            runtime.supervisor = asyncio.create_task(
                self._supervise(name, runtime.generation, first_attempt=first_attempt),
                name=f"mcp-supervise-{name}",
            )
            # Mutations may wait out the first bounded attempt for truthful
            # immediate status. Boot deliberately does not: gateway readiness
            # is not collateral for a stalled optional integration.
            if wait_for_first_attempt:
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
            while not self._stopping and not self._closed:
                runtime = self._servers.get(name)
                if runtime is None or runtime.generation != generation or self._closed:
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
                on_tools_list_changed=lambda: self._on_list_changed(name, generation, connection),
                on_connection_lost=lambda reason: self._on_lost(
                    name, generation, connection, reason
                ),
            )
            try:
                await asyncio.wait_for(connection.connect(), timeout=_CONNECT_BUDGET_S)
                discovery = await connection.discover_tools()
            except asyncio.CancelledError:
                await connection.disconnect()
                raise
            except TimeoutError:
                await connection.disconnect()
                return await self._record_connect_failure(name, generation, "connect timed out")
            except MCPError as e:
                await connection.disconnect()
                return await self._record_connect_failure(name, generation, str(e))
            except Exception as e:
                await connection.disconnect()
                log.error("MCP %s: unexpected connect failure (%s)", name, type(e).__name__)
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
            if (
                runtime is None
                or runtime.generation != generation
                or self._closed
                or self._stopping
                or not self._global_enabled
                or not runtime.enabled
            ):
                return False
            clean_reason = _scrub_operator_text(runtime.config, reason, limit=500)
            runtime.state = STATE_ERROR
            runtime.last_error = clean_reason
            runtime.connection = None
            self._rebuild_published_index_locked()
        log.warning("MCP %s: connect failed: %s", name, clean_reason)
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
            if (
                runtime is None
                or runtime.generation != generation
                or self._closed
                or self._stopping
                or not self._global_enabled
                or not runtime.enabled
            ):
                return False  # stale/disabled/closing task: never republish
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
            except asyncio.CancelledError:
                raise
            except Exception as e:
                # A failed listing invalidates the complete snapshot for every
                # ordinary failure shape, including unexpected adapter defects.
                # Detach before teardown so no model request can observe tools
                # from a failed refresh. Cancellation remains control flow.
                if not isinstance(e, (MCPError, TimeoutError)):
                    log.error(
                        "MCP %s: unexpected tools refresh failure (%s)", name, type(e).__name__
                    )
                async with self._lock:
                    runtime = self._servers.get(name)
                    if (
                        runtime is None
                        or runtime.generation != generation
                        or runtime.connection is not connection
                    ):
                        return
                    runtime.state = STATE_STALE
                    runtime.connection = None
                    runtime.last_error = _scrub_operator_text(
                        runtime.config, f"tools refresh failed: {e}", limit=500
                    )
                    self._unpublish_locked(name, runtime, reason="refresh failed")
                try:
                    await connection.disconnect()
                except asyncio.CancelledError:
                    raise
                except Exception:
                    log.exception("MCP %s: failed-refresh teardown error", name)
                finally:
                    # Manual-refresh cancellation may be restored only after
                    # disconnect drains; always wake supervision afterward.
                    runtime.wake.set()
                return
            await self._publish(name, generation, connection, discovery)

    def _on_list_changed(self, name: str, generation: int, connection: MCPServerConnection) -> None:
        runtime = self._servers.get(name)
        if (
            runtime is not None
            and runtime.generation == generation
            and runtime.connection is connection
        ):
            runtime.wake.set()

    def _on_lost(
        self,
        name: str,
        generation: int,
        connection: MCPServerConnection,
        reason: str,
    ) -> None:
        """Fence loss synchronously before returning to the transport callback."""
        runtime = self._servers.get(name)
        if (
            runtime is None
            or runtime.generation != generation
            or runtime.connection is not connection
        ):
            return
        clean_reason = _scrub_operator_text(runtime.config, reason, limit=500)
        runtime.state = STATE_ERROR
        runtime.last_error = clean_reason
        runtime.connection = None
        self._unpublish_locked(name, runtime, reason=f"connection lost: {clean_reason}")
        runtime.wake.set()
        asyncio.get_running_loop().create_task(
            self._disconnect_lost_connection(connection),
            name=f"mcp-retire-lost-{name}",
        )

    @staticmethod
    async def _disconnect_lost_connection(connection: MCPServerConnection) -> None:
        try:
            await connection.disconnect()
        except Exception:
            log.exception("MCP: lost connection teardown failed")

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
