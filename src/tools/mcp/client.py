"""Per-server MCP connection: era detection, negotiation, discovery, calls.

Era detection (plan §2, spec-sanctioned):

- stdio: probe ``server/discover`` with our preferred modern version.
  ``DiscoverResult`` ⇒ modern-era evidence, then deterministic version
  selection. A recognized modern error ⇒ modern (select from its advertised
  list). ANY other error or a bounded timeout ⇒ legacy ``initialize``
  fallback. The fallback is never keyed to one error code.
- HTTP: the same probe as a POST; classification inspects both HTTP status
  and JSON-RPC body. Only a 400 with an empty/unrecognized body (or a plain
  method-not-found for the probe) falls back to legacy; 401/403/429/5xx and
  network failures establish NO era — the connect fails retryable.

Version rules: exact allowlists only, never an unknown counteroffer. A
modern-era server advertising no mutually supported modern revision is
modern-incompatible (honest connect error) — never grounds for sending
modern metadata under a legacy version, never grounds for ``initialize``.

Outcome rules: a ``tools/call`` ends ok / failed / uncertain
(:mod:`.outcomes`); an uncertain call is NEVER automatically replayed.
"""

from __future__ import annotations

import asyncio
import itertools
import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from ...odin_log import get_logger
from . import protocol as proto
from .errors import MCPConnectError, MCPError, MCPPreWriteError, MCPProtocolError, MCPTimeoutError
from .outcomes import (
    OUTCOME_FAILED,
    OUTCOME_OK,
    OUTCOME_UNCERTAIN,
    MCPToolOutcome,
)
from .transport_http import (
    RESULT_HTTP_ERROR,
    RESULT_JSON,
    RESULT_STREAM_ENDED,
    HttpTransport,
    PostOutcome,
)
from .transport_stdio import StdioTransport

log = get_logger("mcp.client")

_PROBE_TIMEOUT = 15.0
_INIT_TIMEOUT = 15.0
_LIST_TIMEOUT = 30.0
_DEFAULT_CALL_TIMEOUT = 120.0

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")


def _clean_text(text: str, cap: int) -> str:
    return _CONTROL_CHARS_RE.sub("", str(text))[:cap]


async def _finish_cancellation(send: Callable[[], Any]) -> None:
    """Complete a bounded cancellation signal despite repeated cancellation."""
    task = asyncio.create_task(send())
    while not task.done():
        current = asyncio.current_task()
        if current is not None:
            while current.cancelling():
                current.uncancel()
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            pass
    await task


@dataclass(frozen=True)
class ToolRecord:
    """One discovered tool, validated. Excluded tools stay visible to
    status/UI with their reason but are never published."""

    name: str
    description: str
    input_schema: dict
    output_schema: dict | None = None
    header_params: tuple[proto.HeaderParam, ...] = ()
    excluded: bool = False
    exclusion_reason: str = ""


@dataclass
class DiscoveryResult:
    tools: list[ToolRecord] = field(default_factory=list)
    ttl_ms: int | None = None


class MCPServerConnection:
    """One configured MCP server: transport + era + negotiated state."""

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
        cwd: str = "",
        timeout: float = _DEFAULT_CALL_TIMEOUT,
        on_tools_list_changed: Callable[[], None] | None = None,
        on_connection_lost: Callable[[str], None] | None = None,
    ) -> None:
        self.name = name
        self.transport_kind = transport
        self.command = command
        self.args = list(args or [])
        self.url = url
        self.headers = dict(headers or {})
        self.env = dict(env or {})
        self.cwd = cwd
        self.timeout = timeout
        self._on_tools_list_changed = on_tools_list_changed
        self._on_connection_lost = on_connection_lost

        self.era: str | None = None
        self.negotiated_version: str | None = None
        self.server_info: dict[str, Any] = {}
        self.instructions: str = ""  # UI-only; never prompt-injected
        self.connected = False

        self._stdio: StdioTransport | None = None
        self._http: HttpTransport | None = None
        self._ids = itertools.count(1)
        self._pending: dict[Any, asyncio.Future[dict]] = {}
        self._lost_reason: str | None = None
        self._disconnect_task: asyncio.Task[None] | None = None

    # ------------------------------------------------------------------
    # Connect
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        if self.connected:
            return
        if self._disconnect_task is not None:
            if not self._disconnect_task.done():
                raise MCPConnectError(f"{self.name}: disconnect is still in progress")
            self._disconnect_task = None
        self.era = None
        self.negotiated_version = None
        self._lost_reason = None
        if self.transport_kind == "stdio":
            await self._connect_stdio()
        elif self.transport_kind == "http":
            await self._connect_http()
        else:
            raise MCPConnectError(f"{self.name}: unsupported transport {self.transport_kind!r}")
        self.connected = True

    async def disconnect(self) -> None:
        """Teardown to completion even when the caller is cancelled."""
        task = self._disconnect_task
        if task is None:
            task = asyncio.create_task(self._disconnect_inner(), name=f"mcp-disconnect-{self.name}")
            self._disconnect_task = task
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

    async def _disconnect_inner(self) -> None:
        self.connected = False
        self._fail_pending(MCPConnectError(f"{self.name}: disconnected"))
        stdio, self._stdio = self._stdio, None
        http, self._http = self._http, None
        try:
            if stdio is not None:
                await stdio.shutdown()
            if http is not None and self.era == proto.ERA_LEGACY and http.session_id:
                await http.delete_session(protocol_version=self.negotiated_version)
        finally:
            if http is not None:
                await http.close()
            self.era = None
            self.negotiated_version = None

    # -------------------------- stdio ---------------------------------

    async def _connect_stdio(self) -> None:
        transport = StdioTransport(
            self.name,
            self.command,
            self.args,
            env=self.env,
            cwd=self.cwd or None,
            on_message=self._on_stdio_message,
            on_closed=self._on_transport_closed,
            negotiated_version=lambda: self.negotiated_version,
        )
        self._stdio = transport
        try:
            await transport.start()
            probe_id = next(self._ids)
            probe = proto.build_request(
                probe_id,
                "server/discover",
                {},
                era=proto.ERA_MODERN,
                version=proto.MODERN_VERSIONS[0],
            )
            try:
                reply = await self._stdio_roundtrip(probe_id, probe, _PROBE_TIMEOUT)
            except MCPTimeoutError:
                reply = None  # silence ⇒ legacy probe outcome
            if reply is not None and "result" in reply:
                self._adopt_modern(reply["result"])
                return
            err = proto.rpc_error(reply) if reply is not None else None
            if proto.is_recognized_modern_error(err):
                assert err is not None
                selection = proto.select_modern_version(proto.supported_versions_from_error(err))
                if selection.version is None:
                    raise MCPConnectError(f"{self.name}: {selection.reason}")
                self.era = proto.ERA_MODERN
                self.negotiated_version = selection.version
                return
            # Any other error or timeout: legacy fallback.
            await self._initialize_legacy_stdio()
        except BaseException:
            self._stdio = None
            await transport.shutdown()
            raise

    async def _initialize_legacy_stdio(self) -> None:
        req_id = next(self._ids)
        request = proto.build_request(
            req_id,
            "initialize",
            {
                "protocolVersion": proto.LEGACY_VERSIONS_STDIO[0],
                "capabilities": {},
                "clientInfo": dict(proto.CLIENT_INFO),
            },
            era=proto.ERA_LEGACY,
            version=proto.LEGACY_VERSIONS_STDIO[0],
        )
        reply = await self._stdio_roundtrip(req_id, request, _INIT_TIMEOUT)
        err = proto.rpc_error(reply)
        if err is not None:
            raise MCPConnectError(
                f"{self.name}: initialize failed: {_clean_text(str(err.get('message', err)), 200)}"
            )
        result = reply.get("result")
        if not isinstance(result, dict):
            raise MCPConnectError(f"{self.name}: initialize returned no result")
        counteroffer = result.get("protocolVersion")
        version = proto.select_legacy_version(str(counteroffer), transport="stdio")
        if version is None:
            raise MCPConnectError(
                f"{self.name}: server negotiated unsupported protocol version {counteroffer!r}"
            )
        self.era = proto.ERA_LEGACY
        self.negotiated_version = version
        self._adopt_server_identity(result)
        assert self._stdio is not None
        await self._stdio.send(proto.build_notification("notifications/initialized"))

    async def _stdio_roundtrip(self, req_id: Any, request: dict, timeout: float) -> dict:
        assert self._stdio is not None
        future: asyncio.Future[dict] = asyncio.get_running_loop().create_future()
        self._pending[req_id] = future

        async def exchange() -> dict:
            assert self._stdio is not None
            await self._stdio.send(request)
            return await future

        try:
            try:
                return await asyncio.wait_for(exchange(), timeout=timeout)
            except TimeoutError:
                raise MCPTimeoutError(
                    f"{self.name}: no reply to {request.get('method')} within {timeout}s"
                ) from None
        finally:
            self._pending.pop(req_id, None)

    def _on_stdio_message(self, msg: dict) -> None:
        kind = proto.message_kind(msg)
        if kind == proto.KIND_RESPONSE:
            future = self._pending.get(msg.get("id"))
            if future is not None and not future.done():
                future.set_result(msg)
            else:
                # Late response after timeout/cancellation: ignored by rule.
                log.debug("MCP %s: dropping late/unknown response id=%r", self.name, msg.get("id"))
        elif kind == proto.KIND_NOTIFICATION:
            self._handle_notification(msg)
        elif kind == proto.KIND_REQUEST:
            self._handle_server_request(msg, channel="stdio")

    # --------------------------- HTTP ----------------------------------

    async def _connect_http(self) -> None:
        transport = HttpTransport(
            self.name,
            self.url,
            headers=self.headers,
            stall_timeout=max(self.timeout, 30.0),
        )
        self._http = transport
        try:
            await transport.start()
            probe_id = next(self._ids)
            probe = proto.build_request(
                probe_id,
                "server/discover",
                {},
                era=proto.ERA_MODERN,
                version=proto.MODERN_VERSIONS[0],
            )
            outcome, response = await self._post_handshake(
                probe,
                probe_id,
                protocol_version=proto.MODERN_VERSIONS[0],
                mcp_method="server/discover",
                include_session=False,
                timeout=_PROBE_TIMEOUT,
            )
            if self._classify_http_probe(outcome, response):
                return  # modern adopted
            await self._initialize_legacy_http()
        except TimeoutError:
            self._http = None
            await transport.close()
            raise MCPConnectError(f"{self.name}: probe timed out") from None
        except BaseException:
            self._http = None
            await transport.close()
            raise

    async def _post_handshake(
        self,
        request: dict,
        req_id: Any,
        *,
        protocol_version: str | None,
        mcp_method: str | None = None,
        include_session: bool = True,
        capture_session: bool = False,
        timeout: float,
    ) -> tuple[PostOutcome, dict | None]:
        """POST a handshake-era request (era probe / legacy initialize) and
        return the outcome plus its direct response, collected from EITHER
        reply shape — a JSON body or an SSE stream (a Streamable HTTP server
        may answer any request in the stream shape; DeepWiki does). Only the
        exact-id response counts, error responses included; other stream
        messages are debug-logged — no notification/server-request handlers
        run before the handshake settles. Duplicate matching responses are a
        protocol failure, never last-one-wins.
        """
        assert self._http is not None
        streamed: list[dict] = []

        def on_message(msg: dict) -> None:
            if proto.message_kind(msg) == proto.KIND_RESPONSE and msg.get("id") == req_id:
                streamed.append(msg)
            else:
                log.debug("MCP %s: ignoring pre-handshake stream message", self.name)

        outcome = await asyncio.wait_for(
            self._http.post(
                request,
                protocol_version=protocol_version,
                mcp_method=mcp_method,
                include_session=include_session,
                capture_session=capture_session,
                on_message=on_message,
            ),
            timeout=timeout,
        )
        matches = [
            msg
            for msg in outcome.messages
            if proto.message_kind(msg) == proto.KIND_RESPONSE and msg.get("id") == req_id
        ]
        matches.extend(streamed)
        if len(matches) > 1:
            raise MCPProtocolError(f"{self.name}: duplicate responses for handshake request")
        return outcome, (matches[0] if matches else None)

    def _classify_http_probe(self, outcome: PostOutcome, response: dict | None) -> bool:
        """True ⇒ modern era adopted. False ⇒ legacy fallback. Raises for
        non-era-evidence failures (auth/capacity/transport). ``response`` is
        the probe's direct response, collected from either reply shape —
        SSE framing itself is never era evidence, only the response is."""
        if outcome.kind in (RESULT_JSON, RESULT_STREAM_ENDED) and response is not None:
            if "result" in response:
                self._adopt_modern(response["result"])
                return True
            err = proto.rpc_error(response)
            if proto.is_recognized_modern_error(err):
                assert err is not None
                selection = proto.select_modern_version(proto.supported_versions_from_error(err))
                if selection.version is None:
                    raise MCPConnectError(f"{self.name}: {selection.reason}")
                self.era = proto.ERA_MODERN
                self.negotiated_version = selection.version
                return True
            if err is not None and err.get("code") == proto.ERROR_METHOD_NOT_FOUND:
                return False
            raise MCPConnectError(f"{self.name}: probe returned an error that is not era evidence")
        if outcome.kind == RESULT_HTTP_ERROR:
            err = proto.rpc_error(response) if response is not None else None
            if (
                outcome.status in (404, 405)
                and err is not None
                and err.get("code") == proto.ERROR_METHOD_NOT_FOUND
            ):
                return False
            if outcome.status != 400:
                raise MCPConnectError(
                    f"{self.name}: probe failed with HTTP {outcome.status} — "
                    "not era evidence (check authentication/endpoint)"
                )
            if proto.is_recognized_modern_error(err):
                assert err is not None
                selection = proto.select_modern_version(proto.supported_versions_from_error(err))
                if selection.version is None:
                    raise MCPConnectError(f"{self.name}: {selection.reason}")
                self.era = proto.ERA_MODERN
                self.negotiated_version = selection.version
                return True
            return False  # 400 with empty/unrecognized body is legacy evidence
        # A 202, or a reply (JSON body or stream) carrying no matching
        # response, is out-of-contract for a request-probe.
        raise MCPConnectError(f"{self.name}: probe produced no usable reply")

    async def _initialize_legacy_http(self) -> None:
        assert self._http is not None
        best = proto.LEGACY_VERSIONS_HTTP[0]
        req_id = next(self._ids)
        request = proto.build_request(
            req_id,
            "initialize",
            {
                "protocolVersion": best,
                "capabilities": {},
                "clientInfo": dict(proto.CLIENT_INFO),
            },
            era=proto.ERA_LEGACY,
            version=best,
        )
        _outcome, response = await self._post_handshake(
            request,
            req_id,
            protocol_version=None,  # header only AFTER negotiation
            include_session=False,
            capture_session=True,
            timeout=_INIT_TIMEOUT,
        )
        err = proto.rpc_error(response) if response else None
        if response is None or err is not None:
            detail = _clean_text(str((err or {}).get("message", "no response")), 200)
            raise MCPConnectError(f"{self.name}: initialize failed: {detail}")
        result = response.get("result")
        if not isinstance(result, dict):
            raise MCPConnectError(f"{self.name}: initialize returned no result")
        counteroffer = result.get("protocolVersion")
        version = proto.select_legacy_version(str(counteroffer), transport="http")
        if version is None:
            raise MCPConnectError(
                f"{self.name}: server negotiated unsupported protocol version {counteroffer!r}"
            )
        self.era = proto.ERA_LEGACY
        self.negotiated_version = version
        self._adopt_server_identity(result)
        note = proto.build_notification("notifications/initialized")
        await self._http.post(
            note,
            protocol_version=version,
            negotiated_version=version,
        )

    @staticmethod
    def _match_response(messages: list[dict], req_id: Any) -> dict | None:
        for msg in messages:
            if proto.message_kind(msg) == proto.KIND_RESPONSE and msg.get("id") == req_id:
                return msg
        return None

    # ------------------------------------------------------------------
    # Shared identity adoption
    # ------------------------------------------------------------------

    def _adopt_modern(self, discover_result: Any) -> None:
        if not isinstance(discover_result, dict):
            raise MCPConnectError(f"{self.name}: malformed DiscoverResult")
        result_type = proto.check_result_type(discover_result, era=proto.ERA_MODERN)
        if not result_type.ok:
            raise MCPConnectError(f"{self.name}: server/discover: {result_type.reason}")
        selection = proto.select_modern_version(discover_result.get("supportedVersions"))
        if selection.version is None:
            raise MCPConnectError(f"{self.name}: {selection.reason}")
        self.era = proto.ERA_MODERN
        self.negotiated_version = selection.version
        meta = discover_result.get("_meta")
        if isinstance(meta, dict):
            info = meta.get(proto.META_SERVER_INFO)
            if isinstance(info, dict):
                self.server_info = info
        instructions = discover_result.get("instructions")
        if isinstance(instructions, str):
            self.instructions = _clean_text(instructions, proto.MAX_INSTRUCTIONS_CHARS)

    def _adopt_server_identity(self, init_result: dict) -> None:
        info = init_result.get("serverInfo")
        if isinstance(info, dict):
            self.server_info = info
        instructions = init_result.get("instructions")
        if isinstance(instructions, str):
            self.instructions = _clean_text(instructions, proto.MAX_INSTRUCTIONS_CHARS)

    # ------------------------------------------------------------------
    # Notifications / server-initiated requests
    # ------------------------------------------------------------------

    def _handle_notification(self, msg: dict) -> None:
        method = msg.get("method", "")
        if method == "notifications/tools/list_changed":
            if self._on_tools_list_changed is not None:
                try:
                    self._on_tools_list_changed()
                except Exception:
                    log.exception("MCP %s: list_changed handler failed", self.name)
        else:
            log.debug("MCP %s: notification %s", self.name, method)

    def _handle_server_request(self, msg: dict, *, channel: str) -> None:
        """Legacy servers may initiate requests (sampling/roots/elicitation).
        We support none of those capabilities: answer -32601 on the correct
        channel instead of silently dropping (a dropped request hangs the
        server). Modern servers cannot initiate requests — log and ignore."""
        if self.era == proto.ERA_MODERN:
            log.warning(
                "MCP %s: modern server sent a request (%s) — ignored",
                self.name,
                msg.get("method"),
            )
            return
        reply = proto.build_error_response(
            msg.get("id"),
            proto.ERROR_METHOD_NOT_FOUND,
            f"client does not support {msg.get('method', 'this method')}",
        )
        asyncio.get_running_loop().create_task(self._send_reply(reply, channel))

    async def _send_reply(self, reply: dict, channel: str) -> None:
        try:
            if channel == "stdio" and self._stdio is not None:
                await self._stdio.send(reply)
            elif self._http is not None:
                await self._http.post(
                    reply,
                    protocol_version=self.negotiated_version,
                    negotiated_version=self.negotiated_version,
                )
        except Exception:
            log.debug("MCP %s: failed to deliver -32601 reply", self.name, exc_info=True)

    def _on_transport_closed(self, reason: str) -> None:
        was_connected = self.connected
        self.connected = False
        self._lost_reason = reason
        self._fail_pending(MCPConnectError(f"{self.name}: {reason}"))
        if was_connected and self._on_connection_lost is not None:
            try:
                self._on_connection_lost(reason)
            except Exception:
                log.exception("MCP %s: connection-lost handler failed", self.name)

    def _fail_pending(self, exc: Exception) -> None:
        for future in list(self._pending.values()):
            if not future.done():
                future.set_exception(exc)
        self._pending.clear()

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------

    async def discover_tools(self) -> DiscoveryResult:
        """Discover atomically, recovering a rejected legacy HTTP session once.

        Discovery is retry-safe; tool calls are deliberately not. A session
        rejection restarts the full paginated listing after a lifecycle-only
        re-initialization, so no partial snapshot can escape.
        """
        try:
            return await self._discover_tools_once()
        except _SessionLostError:
            if self.transport_kind != "http" or self.era != proto.ERA_LEGACY:
                raise
            await self._recover_legacy_http_session()
            try:
                return await self._discover_tools_once()
            except _SessionLostError as exc:
                self._on_transport_closed("server session repeatedly rejected during discovery")
                raise MCPProtocolError(
                    f"{self.name}: legacy HTTP session was rejected again during discovery"
                ) from exc

    async def _recover_legacy_http_session(self) -> None:
        assert self._http is not None
        self._http.session_id = None
        await self._initialize_legacy_http()

    async def _discover_tools_once(self) -> DiscoveryResult:
        """One complete paginated listing; partial listings never return."""
        if not self.connected or self.era is None or self.negotiated_version is None:
            raise MCPConnectError(f"{self.name}: not connected")
        records: list[ToolRecord] = []
        seen_names: set[str] = set()
        seen_cursors: set[str] = set()
        schema_bytes_total = 0
        ttl_ms: int | None = None
        cursor: str | None = None
        for page in range(proto.MAX_LIST_PAGES + 1):
            if page == proto.MAX_LIST_PAGES:
                raise MCPProtocolError(
                    f"{self.name}: tools/list exceeded {proto.MAX_LIST_PAGES} pages"
                )
            params: dict[str, Any] = {}
            if cursor is not None:
                params["cursor"] = cursor
            result = await self._request("tools/list", params, timeout=_LIST_TIMEOUT, mcp_name=None)
            raw_tools = result.get("tools")
            if not isinstance(raw_tools, list):
                raise MCPProtocolError(f"{self.name}: tools/list returned no tool array")
            if ttl_ms is None and isinstance(result.get("ttlMs"), int):
                ttl_ms = result["ttlMs"]
            for raw in raw_tools:
                record = self._validate_tool(raw)
                if record.name in seen_names:
                    raise MCPProtocolError(
                        f"{self.name}: duplicate tool name {record.name!r} in listing"
                    )
                seen_names.add(record.name)
                if not record.excluded:
                    schema_bytes_total += len(json.dumps(record.input_schema).encode("utf-8"))
                    if schema_bytes_total > proto.MAX_SCHEMA_BYTES_PER_SERVER:
                        raise MCPProtocolError(
                            f"{self.name}: combined tool schemas exceed "
                            f"{proto.MAX_SCHEMA_BYTES_PER_SERVER} bytes"
                        )
                records.append(record)
                if len(records) > proto.MAX_DISCOVERED_TOOLS:
                    raise MCPProtocolError(
                        f"{self.name}: more than {proto.MAX_DISCOVERED_TOOLS} tools discovered"
                    )
            next_cursor = result.get("nextCursor")
            if next_cursor is None or next_cursor == "":
                break
            if not isinstance(next_cursor, str):
                raise MCPProtocolError(f"{self.name}: malformed nextCursor")
            if next_cursor in seen_cursors:
                raise MCPProtocolError(f"{self.name}: duplicate pagination cursor")
            seen_cursors.add(next_cursor)
            cursor = next_cursor
        return DiscoveryResult(tools=records, ttl_ms=ttl_ms)

    def _validate_tool(self, raw: Any) -> ToolRecord:
        if not isinstance(raw, dict) or not isinstance(raw.get("name"), str) or not raw["name"]:
            raise MCPProtocolError(f"{self.name}: tool entry without a name")
        name = raw["name"]
        if len(name) > proto.MAX_AUDIT_IDENTIFIER_CHARS:
            raise MCPProtocolError(
                f"{self.name}: tool name exceeds {proto.MAX_AUDIT_IDENTIFIER_CHARS} characters"
            )
        description = _clean_text(str(raw.get("description", "")), proto.MAX_DESCRIPTION_CHARS)
        schema = raw.get("inputSchema")
        check = proto.validate_tool_schema(schema)
        if not check.ok or not isinstance(schema, dict):
            return ToolRecord(
                name=name,
                description=description,
                input_schema={},
                excluded=True,
                exclusion_reason=check.reason,
            )
        output_schema = raw.get("outputSchema")
        if not isinstance(output_schema, dict):
            output_schema = None
        header_params: tuple[proto.HeaderParam, ...] = ()
        if self.transport_kind == "http" and self.era == proto.ERA_MODERN:
            hp = proto.extract_header_params(schema)
            if not hp.ok:
                # Spec: an invalid x-mcp-header annotation invalidates the
                # tool — exclude it, keep the rest of the listing usable.
                return ToolRecord(
                    name=name,
                    description=description,
                    input_schema=schema,
                    output_schema=output_schema,
                    excluded=True,
                    exclusion_reason=hp.reason,
                )
            header_params = hp.params
        return ToolRecord(
            name=name,
            description=description,
            input_schema=schema,
            output_schema=output_schema,
            header_params=header_params,
        )

    # ------------------------------------------------------------------
    # Requests (era-shaped) and tool calls
    # ------------------------------------------------------------------

    async def _request(
        self,
        method: str,
        params: dict,
        *,
        timeout: float,
        mcp_name: str | None,
        param_headers: dict[str, str] | None = None,
    ) -> dict:
        """One request/response on the negotiated era. Returns the RESULT
        object; raises typed errors otherwise. Retry-safe callers only
        (discovery/listing) — tools/call goes through :meth:`call_tool`."""
        assert self.era is not None and self.negotiated_version is not None
        req_id = next(self._ids)
        request = proto.build_request(
            req_id, method, params, era=self.era, version=self.negotiated_version
        )
        if self.transport_kind == "stdio":
            reply = await self._stdio_roundtrip(req_id, request, timeout)
        else:
            reply = await self._http_roundtrip(
                req_id,
                request,
                timeout,
                mcp_method=method,
                mcp_name=mcp_name,
                param_headers=param_headers,
            )
        err = proto.rpc_error(reply)
        if err is not None:
            raise MCPProtocolError(
                f"{self.name}: {method} failed: {_clean_text(str(err.get('message', err)), 200)}",
                rpc_code=err.get("code"),
            )
        result = reply.get("result")
        if not isinstance(result, dict):
            raise MCPProtocolError(f"{self.name}: {method} returned no result object")
        rt = proto.check_result_type(result, era=self.era)
        if not rt.ok:
            raise MCPProtocolError(f"{self.name}: {method}: {rt.reason}")
        return result

    async def _http_roundtrip(
        self,
        req_id: Any,
        request: dict,
        timeout: float,
        *,
        mcp_method: str,
        mcp_name: str | None,
        param_headers: dict[str, str] | None = None,
    ) -> dict:
        if self._http is None or not self._http.started:
            raise MCPPreWriteError(f"{self.name}: HTTP transport is not available")
        assert self.negotiated_version is not None
        collected: dict[str, dict | None] = {"response": None}

        def on_message(msg: dict) -> None:
            kind = proto.message_kind(msg)
            if kind == proto.KIND_RESPONSE and msg.get("id") == req_id:
                collected["response"] = msg
            elif kind == proto.KIND_NOTIFICATION:
                self._handle_notification(msg)
            elif kind == proto.KIND_REQUEST:
                self._handle_server_request(msg, channel="http")

        modern = self.era == proto.ERA_MODERN
        outcome = await asyncio.wait_for(
            self._http.post(
                request,
                protocol_version=self.negotiated_version,
                mcp_method=mcp_method if modern else None,
                mcp_name=mcp_name if modern else None,
                param_headers=param_headers if modern else None,
                negotiated_version=self.negotiated_version,
                on_message=on_message,
            ),
            timeout=timeout,
        )
        if outcome.kind == RESULT_JSON:
            response = self._match_response(outcome.messages, req_id)
            for msg in outcome.messages:
                if msg is not response:
                    on_message(msg)
            if response is not None:
                return response
        if collected["response"] is not None:
            return collected["response"]
        if outcome.kind == RESULT_HTTP_ERROR:
            matched = self._match_response(outcome.messages, req_id)
            err = proto.rpc_error(matched) if matched is not None else None
            if outcome.status == 404 and self._http.session_id:
                raise _SessionLostError(self.name)
            detail = (
                _clean_text(str(err.get("message", "")), 200) if err else f"HTTP {outcome.status}"
            )
            raise MCPProtocolError(
                f"{self.name}: {mcp_method} rejected: {detail}",
                rpc_code=err.get("code") if err else None,
            )
        raise MCPProtocolError(f"{self.name}: no response for {mcp_method}")

    async def call_tool(
        self,
        tool: ToolRecord,
        arguments: dict,
        *,
        timeout: float | None = None,
        generation: int = 0,
    ) -> MCPToolOutcome:
        """Invoke one tool. Returns a typed outcome; never raises for
        call-path failures. NEVER automatically replays: after the request
        has been written, any ambiguity is ``uncertain``; an explicit
        session rejection is a definite failure — and still not reissued."""
        budget = timeout if timeout is not None else self.timeout
        version = self.negotiated_version or ""

        def outcome(status: str, text: str, detail: str = "") -> MCPToolOutcome:
            return MCPToolOutcome(
                status=status,
                text=text,
                server=self.name,
                tool=tool.name,
                negotiated_version=version,
                generation=generation,
                detail=detail,
            )

        if not self.connected or self.era is None:
            return outcome(OUTCOME_FAILED, f"MCP server '{self.name}' is not connected")
        if tool.excluded:
            return outcome(
                OUTCOME_FAILED,
                f"MCP tool '{tool.name}' is excluded: {tool.exclusion_reason}",
            )
        param_headers: dict[str, str] = {}
        for hp in tool.header_params:
            value = proto.header_param_value(arguments, hp)
            if value is not None:
                param_headers[hp.name] = value
        params = {"name": tool.name, "arguments": arguments}
        try:
            if self.transport_kind == "stdio":
                result = await self._call_stdio(params, budget)
            else:
                result = await self._call_http(
                    params, budget, tool_name=tool.name, param_headers=param_headers
                )
        except _SessionLostError:
            # Explicit session rejection: the server refused the request at
            # session validation — definite failure, never silently
            # reissued. Reconnect (a lifecycle operation) is the
            # supervisor's job, triggered via the lost-connection path.
            self._on_transport_closed("server session expired")
            return outcome(
                OUTCOME_FAILED,
                f"MCP server '{self.name}' rejected the session; the call was "
                "not executed. The server is reconnecting — retry explicitly "
                "if still needed.",
            )
        except (_DefiniteCallError, MCPPreWriteError) as e:
            return outcome(OUTCOME_FAILED, str(e))
        except TimeoutError:
            await self._cancel_in_flight()
            return outcome(
                OUTCOME_UNCERTAIN,
                f"MCP tool '{tool.name}' on '{self.name}' timed out after "
                f"{budget:.0f}s; whether it executed is UNKNOWN. It was not "
                "retried automatically.",
                detail="timeout",
            )
        except MCPTimeoutError:
            return outcome(
                OUTCOME_UNCERTAIN,
                f"MCP tool '{tool.name}' on '{self.name}' timed out after "
                f"{budget:.0f}s; whether it executed is UNKNOWN. It was not "
                "retried automatically.",
                detail="timeout",
            )
        except (MCPConnectError, MCPProtocolError) as e:
            return outcome(
                OUTCOME_UNCERTAIN,
                f"MCP tool '{tool.name}' on '{self.name}' failed after the "
                f"request may have been sent ({_clean_text(str(e), 200)}); whether it "
                "executed is UNKNOWN. It was not retried automatically.",
                detail="transport-loss",
            )
        rt = proto.check_result_type(result, era=self.era)
        if rt.input_required:
            return outcome(
                OUTCOME_FAILED,
                f"MCP tool '{tool.name}' requested additional input (MRTR), "
                "which this client does not support.",
            )
        if not rt.ok:
            return outcome(OUTCOME_FAILED, f"protocol violation: {rt.reason}")
        text, is_error = _render_tool_result(result)
        if is_error:
            return outcome(OUTCOME_FAILED, text or "tool reported an error")
        return outcome(OUTCOME_OK, text)

    async def _call_stdio(self, params: dict, budget: float) -> dict:
        assert self.era is not None and self.negotiated_version is not None
        req_id = next(self._ids)
        request = proto.build_request(
            req_id, "tools/call", params, era=self.era, version=self.negotiated_version
        )
        loop = asyncio.get_running_loop()
        deadline = loop.time() + budget
        future: asyncio.Future[dict] = loop.create_future()
        self._pending[req_id] = future
        written = False
        try:
            if self._stdio is None:
                raise MCPPreWriteError(f"{self.name}: stdio transport is not available")
            await self._stdio.send(request, timeout=budget)
            written = True
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise MCPTimeoutError(
                    f"{self.name}: tools/call exhausted its {budget}s request budget"
                )
            try:
                reply = await asyncio.wait_for(future, timeout=remaining)
            except TimeoutError:
                raise MCPTimeoutError(
                    f"{self.name}: no reply to tools/call within {budget}s"
                ) from None
        except MCPTimeoutError:
            if written:
                await self._send_cancelled(req_id)
            raise
        except asyncio.CancelledError:
            if written:
                await _finish_cancellation(lambda: self._send_cancelled(req_id))
            raise
        except MCPProtocolError as exc:
            raise _DefiniteCallError(_clean_text(str(exc), 300)) from exc
        finally:
            self._pending.pop(req_id, None)
        err = proto.rpc_error(reply)
        if err is not None:
            raise _DefiniteCallError(f"MCP error: {_clean_text(str(err.get('message', err)), 300)}")
        result = reply.get("result")
        if not isinstance(result, dict):
            raise _DefiniteCallError(f"{self.name}: tools/call returned no result")
        return result

    async def _call_http(
        self,
        params: dict,
        budget: float,
        *,
        tool_name: str,
        param_headers: dict[str, str],
    ) -> dict:
        assert self.era is not None and self.negotiated_version is not None
        modern = self.era == proto.ERA_MODERN
        current_headers = dict(param_headers)
        for attempt in range(2):
            req_id = next(self._ids)
            request = proto.build_request(
                req_id, "tools/call", params, era=self.era, version=self.negotiated_version
            )
            try:
                reply = await self._http_roundtrip(
                    req_id,
                    request,
                    budget,
                    mcp_method="tools/call",
                    mcp_name=proto.encode_header_value(tool_name) if modern else None,
                    param_headers=current_headers,
                )
            except TimeoutError:
                if not modern:
                    await self._send_cancelled(req_id)
                raise MCPTimeoutError(
                    f"MCP tool '{tool_name}' on '{self.name}' timed out after "
                    f"{budget:.0f}s; whether it executed is UNKNOWN. It was "
                    "not retried automatically."
                ) from None
            except asyncio.CancelledError:
                if not modern:
                    await _finish_cancellation(lambda: self._send_cancelled(req_id))
                raise
            except MCPProtocolError as exc:
                header_mismatch = exc.rpc_code == proto.ERROR_HEADER_MISMATCH
                if modern and header_mismatch and attempt == 0:
                    try:
                        current_headers = await self._refresh_call_headers(
                            tool_name, params.get("arguments") or {}
                        )
                    except (MCPError, TimeoutError) as refresh_error:
                        raise _DefiniteCallError(
                            f"{self.name}: header metadata refresh failed: "
                            f"{_clean_text(str(refresh_error), 240)}"
                        ) from refresh_error
                    continue
                if exc.rpc_code is not None:
                    raise _DefiniteCallError(_clean_text(str(exc), 300)) from exc
                raise
            err = proto.rpc_error(reply)
            if err is not None:
                if modern and err.get("code") == proto.ERROR_HEADER_MISMATCH and attempt == 0:
                    try:
                        current_headers = await self._refresh_call_headers(
                            tool_name, params.get("arguments") or {}
                        )
                    except (MCPError, TimeoutError) as refresh_error:
                        raise _DefiniteCallError(
                            f"{self.name}: header metadata refresh failed: "
                            f"{_clean_text(str(refresh_error), 240)}"
                        ) from refresh_error
                    continue
                raise _DefiniteCallError(
                    f"MCP error: {_clean_text(str(err.get('message', err)), 300)}"
                )
            result = reply.get("result")
            if not isinstance(result, dict):
                raise _DefiniteCallError(f"{self.name}: tools/call returned no result")
            return result
        raise _DefiniteCallError(f"{self.name}: header mismatch recovery exhausted")

    async def _refresh_call_headers(self, tool_name: str, arguments: dict) -> dict[str, str]:
        """Re-list and derive mirrored headers from the current annotation set."""
        discovery = await self.discover_tools()
        refreshed = next((tool for tool in discovery.tools if tool.name == tool_name), None)
        if refreshed is None:
            raise _DefiniteCallError(
                f"MCP tool '{tool_name}' disappeared while refreshing header metadata"
            )
        if refreshed.excluded:
            raise _DefiniteCallError(
                f"MCP tool '{tool_name}' became invalid: {refreshed.exclusion_reason}"
            )
        headers: dict[str, str] = {}
        for param in refreshed.header_params:
            value = proto.header_param_value(arguments, param)
            if value is not None:
                headers[param.name] = value
        return headers

    async def _send_cancelled(self, req_id: Any) -> None:
        """notifications/cancelled — required for stdio (both eras) and for
        LEGACY Streamable HTTP; never sent for initialize."""
        note = proto.build_notification(
            "notifications/cancelled", {"requestId": req_id, "reason": "timeout"}
        )
        try:
            if self.transport_kind == "stdio" and self._stdio is not None:
                await self._stdio.send(note, timeout=1.0)
            elif self._http is not None and self.era == proto.ERA_LEGACY:
                await asyncio.wait_for(
                    self._http.post(
                        note,
                        protocol_version=self.negotiated_version,
                        negotiated_version=self.negotiated_version,
                    ),
                    timeout=1.0,
                )
        except Exception:
            log.debug("MCP %s: failed to send cancellation", self.name, exc_info=True)

    async def _cancel_in_flight(self) -> None:
        # stdio path sends notifications/cancelled at the call site (it
        # knows the request id); nothing further to do here.
        return

    # ------------------------------------------------------------------

    def status(self) -> dict[str, Any]:
        stderr_tail = self._stdio.stderr_tail() if self._stdio is not None else ""
        return {
            "name": self.name,
            "transport": self.transport_kind,
            "connected": self.connected,
            "era": self.era,
            "negotiated_version": self.negotiated_version,
            "server_info": dict(self.server_info),
            "instructions": self.instructions,
            "last_error": self._lost_reason or "",
            "stderr_tail": stderr_tail,
        }


class _DefiniteCallError(Exception):
    """Internal: a tools/call failure that is definitely NOT executed-and-
    lost (JSON-RPC error, validation rejection, isError result)."""


class _SessionLostError(MCPProtocolError):
    """Internal: HTTP 404 on a session-bearing request — the server
    rejected the session; the request was not executed."""


def _render_tool_result(result: dict) -> tuple[str, bool]:
    """Model-facing rendering of a tools/call result: text content joined;
    structured content JSON-dumped when no text exists; binary content
    described, never embedded."""
    is_error = bool(result.get("isError", False))
    texts: list[str] = []
    content = result.get("content")
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict):
                kind = item.get("type")
                if kind == "text":
                    texts.append(str(item.get("text", "")))
                elif kind == "image":
                    texts.append(f"[image: {item.get('mimeType', 'unknown')}]")
                elif kind == "audio":
                    texts.append(f"[audio: {item.get('mimeType', 'unknown')}]")
                elif kind == "resource":
                    resource = item.get("resource")
                    uri = (
                        resource.get("uri")
                        if isinstance(resource, dict)
                        else item.get("uri", "unknown")
                    )
                    texts.append(f"[resource: {uri}]")
                else:
                    texts.append(f"[{kind or 'unknown'} content]")
            elif isinstance(item, str):
                texts.append(item)
    if not texts:
        structured = result.get("structuredContent")
        if structured is not None:
            try:
                texts.append(json.dumps(structured, indent=2)[: proto.WIRE_RESULT_CEILING])
            except (TypeError, ValueError):
                texts.append("[unrenderable structured content]")
    text = "\n".join(t for t in texts if t) or "(no output)"
    return text, is_error
