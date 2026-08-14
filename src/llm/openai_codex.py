from __future__ import annotations

import asyncio
import json
import unicodedata

import aiohttp

from ..config.schema import effort_incompatibility_error
from ..odin_log import get_logger
from .backoff import DEFAULT_BASE_DELAY, DEFAULT_MAX_DELAY, DEFAULT_MAX_RETRIES, compute_backoff
from .circuit_breaker import CircuitBreaker
from .codex_auth import CodexAuth, CodexAuthPool
from .cost_tracker import estimate_tokens
from .errors import (
    LLMAuthError,
    LLMCapacityError,
    LLMRateLimitError,
    LLMRequestError,
    LLMTransportError,
)
from .secret_scrubber import scrub_output_secrets
from .types import LLMResponse, ToolCall

log = get_logger("codex")


def _reject_known_bad_pair(model: str | None, effort: str | None) -> None:
    """Request-construction boundary: a KNOWN-incompatible model/effort pair
    fails locally before any HTTP — no retry, no account rotation, and the
    capacity breaker never sees a request that was never sent. Catches the
    drift case no earlier boundary can: an agent holding a fixed model
    override while its non-overridden effort tracks live config (or vice
    versa) can only become invalid at call time."""
    err = effort_incompatibility_error(model, effort)
    if err:
        raise LLMRequestError(err)

CODEX_API_URL = "https://chatgpt.com/backend-api/codex/responses"

# Streaming transport timeouts (config-overridable via the ctor).
# request_timeout is a generous whole-request backstop — high-effort
# reasoning turns legitimately stream past the old 600s total cap, which
# killed healthy generations at exactly 10 minutes and burned a retry
# re-generating them from scratch. stream_stall_timeout instead bounds
# silence between socket reads: a healthy SSE stream delivers events
# continuously, so a long gap means a dead connection that should fail
# fast into the retry engine rather than waiting out the backstop.
DEFAULT_REQUEST_TIMEOUT = 3600
DEFAULT_STREAM_STALL_TIMEOUT = 180
CONNECT_TIMEOUT = 30

# Cap the error-body read: error responses are only ever *described*
# (status, MIME type, byte count, extracted JSON error fields — never raw
# bytes), so a hostile or broken front door cannot trade an error page for
# memory. Large enough that any genuine API error object fits whole.
_ERROR_BODY_READ_CAP = 65536


def _parse_structured_error(error_body: str) -> dict | None:
    """Return the parsed JSON object when the API itself spoke, else None.

    A JSON *object* body is the only shape the backend's error surface
    produces; anything else — an HTML edge page, an empty body, bare
    string/list JSON, truncated junk — is an edge/proxy artifact and gets
    transport treatment. Content-Type is deliberately not consulted:
    proxies mislabel in both directions, so the body bytes are authority
    (2026-08-14 edge incident: HTTP 403 carrying chatgpt.com's HTML error
    page killed a healthy turn as a "request" error).
    """
    text = error_body.strip()
    if not text:
        return None
    try:
        parsed = json.loads(text)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _clean_error_field(value: str, limit: int = 200) -> str:
    """First line of a JSON error field: control chars stripped, secrets
    scrubbed, bounded — and dropped entirely if it smuggles markup, keeping
    the raise-site invariant (no LLMError message ever carries an HTML
    fragment, even inside a structured error's own fields)."""
    stripped = value.strip()
    line = stripped.splitlines()[0].strip() if stripped else ""
    line = "".join(
        ch for ch in line if ch == "\t" or not unicodedata.category(ch).startswith("C")
    )
    low = line.lower()
    if "<html" in low or "<!doctype" in low:
        return ""
    return scrub_output_secrets(line)[:limit]


def _describe_error_body(
    content_type: str | None, raw: bytes, structured: dict | None
) -> str:
    """Bounded, structure-aware descriptor of a non-2xx response body.

    Raise sites embed THIS instead of raw body excerpts (``errors.py``
    contract): non-structured bodies are described by shape only; structured
    bodies contribute their sanitized known fields (``error.message/type/
    code``, top-level ``detail``/``message``).
    """
    if structured is None:
        mime = (content_type or "").split(";")[0].strip().lower() or "unknown"
        return f"non-JSON error body ({mime}, {len(raw)} bytes)"
    fields: list[str] = []
    err = structured.get("error")
    if isinstance(err, dict):
        for key in ("message", "type", "code"):
            val = err.get(key)
            if isinstance(val, str):
                cleaned = _clean_error_field(val)
                if cleaned:
                    fields.append(cleaned)
    for key in ("detail", "message"):
        val = structured.get(key)
        if isinstance(val, str):
            cleaned = _clean_error_field(val)
            if cleaned:
                fields.append(cleaned)
    if not fields:
        return "structured JSON error body"
    return "; ".join(dict.fromkeys(fields))[:400]


# Markers the backend uses for model-tier capacity exhaustion. These arrive
# INSIDE an HTTP 200 as SSE error events, so no status-code branch ever sees
# them; matched against both error.type and error.code. Observed live
# (2026-07-29/30 sol degradation): type=service_unavailable_error with
# code=server_is_overloaded, plus bare server_error.
_CAPACITY_ERROR_MARKERS = frozenset({
    "service_unavailable_error",
    "server_is_overloaded",
    "server_error",
})


class CodexStreamError(RuntimeError):
    """The SSE stream reported a terminal failure event (response.failed / error).

    Carries the structured fields parsed from the event's error object so the
    retry engine can classify capacity failures without substring matching.
    The message keeps the historical ``{event_type}: {json[:500]}`` shape.
    """

    def __init__(
        self,
        message: str,
        *,
        error_type: str | None = None,
        error_code: str | None = None,
        retry_after: float | None = None,
    ) -> None:
        super().__init__(message)
        self.error_type = error_type
        self.error_code = error_code
        self.retry_after = retry_after

    @property
    def is_capacity(self) -> bool:
        return (
            self.error_type in _CAPACITY_ERROR_MARKERS
            or self.error_code in _CAPACITY_ERROR_MARKERS
        )


def _stream_error_from_event(event_type: str, event: dict) -> CodexStreamError:
    """Build a classified CodexStreamError from a terminal SSE event.

    The error object lives at ``event["error"]`` for bare ``error`` events
    and at ``event["response"]["error"]`` for ``response.failed``; tolerate
    both plus absence (classification simply stays empty and the failure is
    treated as transport, today's behavior).
    """
    err = event.get("error")
    if not isinstance(err, dict):
        resp_obj = event.get("response")
        err = resp_obj.get("error") if isinstance(resp_obj, dict) else None
    if not isinstance(err, dict):
        err = {}
    error_type = err.get("type")
    error_code = err.get("code")
    retry_after = err.get("retry_after")
    return CodexStreamError(
        f"{event_type}: {json.dumps(event)[:500]}",
        error_type=error_type if isinstance(error_type, str) else None,
        error_code=error_code if isinstance(error_code, str) else None,
        retry_after=float(retry_after) if isinstance(retry_after, (int, float)) else None,
    )


class CodexChatClient:
    """Chat client using OpenAI Codex backend API (ChatGPT subscription)."""

    def __init__(
        self,
        auth: CodexAuth | CodexAuthPool,
        model: str,
        reasoning_effort: str | None = None,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_base_delay: float = DEFAULT_BASE_DELAY,
        retry_max_delay: float = DEFAULT_MAX_DELAY,
        pool_max_connections: int = 10,
        pool_keepalive_timeout: int = 30,
        request_timeout: int = DEFAULT_REQUEST_TIMEOUT,
        stream_stall_timeout: int = DEFAULT_STREAM_STALL_TIMEOUT,
    ) -> None:
        self.auth = auth
        self.model = model
        # None omits the reasoning field entirely (backend default applies) —
        # the auxiliary client stays None until its model is compatibility-probed.
        self.reasoning_effort = reasoning_effort
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay
        self.retry_max_delay = retry_max_delay
        self.pool_max_connections = pool_max_connections
        self.pool_keepalive_timeout = pool_keepalive_timeout
        self.request_timeout = request_timeout
        self.stream_stall_timeout = stream_stall_timeout
        self.breaker = CircuitBreaker("codex_api")
        self._session: aiohttp.ClientSession | None = None
        self._total_requests: int = 0
        self._total_reused: int = 0
        # Tool conversion cache — avoids re-converting same tools across tool loop iterations
        self._last_tools_list: list[dict] | None = None
        self._last_tools_converted: list[dict] = []
        # Token estimates from last call (for callers that use chat() which returns str)
        self._last_input_tokens: int = 0
        self._last_output_tokens: int = 0

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            connector = aiohttp.TCPConnector(
                limit=self.pool_max_connections,
                limit_per_host=self.pool_max_connections,
                keepalive_timeout=self.pool_keepalive_timeout,
                enable_cleanup_closed=True,
            )
            self._session = aiohttp.ClientSession(
                connector=connector,
                auto_decompress=False,
                headers={"Accept-Encoding": "identity"},
                read_bufsize=2**20,
            )
        return self._session

    @property
    def provider_name(self) -> str:
        return "codex"

    @property
    def model_name(self) -> str:
        return self.model

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    def pool_stats(self) -> dict:
        return self.get_pool_metrics()

    def get_pool_metrics(self) -> dict:
        """Return HTTP connection pool metrics for observability."""
        active = 0
        if self._session and not self._session.closed and self._session.connector:
            try:
                conns = self._session.connector._conns  # type: ignore[union-attr]
                active = sum(len(v) for v in conns.values()) if conns else 0
            except (AttributeError, TypeError):
                pass
        return {
            "http_pool_max_connections": self.pool_max_connections,
            "http_pool_keepalive_timeout": self.pool_keepalive_timeout,
            "http_pool_active_connections": active,
            "http_pool_total_requests": self._total_requests,
        }

    # ------------------------------------------------------------------
    # Auth adapters — self.auth may be a CodexAuthPool (multi-account) or a
    # bare CodexAuth (single). The pool variants pin an account index to the
    # request so failure marking hits the account that actually served it.
    # ------------------------------------------------------------------

    async def _acquire_auth(self) -> tuple[str, str | None, int]:
        """Return (access_token, account_id, account_index) for this request."""
        if isinstance(self.auth, CodexAuthPool):
            return await self.auth.acquire()
        return await self.auth.get_access_token(), self.auth.get_account_id(), 0

    async def _token_for(self, index: int) -> tuple[str, str | None]:
        """Re-fetch the (token, account_id) pair for a pinned account."""
        if isinstance(self.auth, CodexAuthPool):
            return await self.auth.token_for(index)
        return await self.auth.get_access_token(), self.auth.get_account_id()

    async def _mark_limited(self, index: int) -> None:
        if isinstance(self.auth, CodexAuthPool):
            await self.auth.mark_limited(index)
        elif hasattr(self.auth, "mark_rate_limited"):
            self.auth.mark_rate_limited()

    async def _mark_auth_failed(self, index: int) -> bool:
        if isinstance(self.auth, CodexAuthPool):
            return await self.auth.mark_auth_failed(index)
        if hasattr(self.auth, "mark_current_auth_failed"):
            return await self.auth.mark_current_auth_failed()
        return False

    async def _force_refresh(self, index: int, stale_token: str | None) -> bool:
        if isinstance(self.auth, CodexAuthPool):
            return await self.auth.force_refresh(index, stale_token)
        if hasattr(self.auth, "force_refresh"):
            return await self.auth.force_refresh(stale_token)
        return False

    @staticmethod
    def _auth_headers(token: str, account_id: str | None) -> dict:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if account_id:
            headers["ChatGPT-Account-Id"] = account_id
        return headers

    async def chat(
        self, messages: list[dict], system: str,
        max_tokens: int | None = None,
    ) -> str:
        """Send a chat request via the Codex backend API (streaming).

        The optional third argument is accepted for the shared provider
        interface. The Responses request shape is intentionally unchanged.
        """
        _reject_known_bad_pair(self.model, self.reasoning_effort)
        body = {
            "model": self.model,
            "instructions": system,
            "input": self._convert_messages(messages),
            "store": False,
            "stream": True,
        }
        if self.reasoning_effort:
            body["reasoning"] = {"effort": self.reasoning_effort}
        # Note: Codex Responses API does not support max_output_tokens.
        # Callers needing short responses should use prompt instructions instead.

        input_tokens = self._estimate_body_input_tokens(body)
        text = await self._stream_request(body)
        output_tokens = estimate_tokens(text) if text else 0
        self._last_input_tokens = input_tokens
        self._last_output_tokens = output_tokens
        return text

    def _convert_messages(self, messages: list[dict]) -> list[dict]:
        """Convert internal message format to Codex Responses API format."""
        codex_messages = []
        for msg in messages:
            content = msg.get("content", "")
            # Extract text from list-format content blocks (tool_use, tool_result, etc.)
            if isinstance(content, list):
                text_parts = []
                image_parts = []
                for block in content:
                    if isinstance(block, dict):
                        if block.get("type") == "text":
                            text_parts.append(block.get("text", ""))
                        elif block.get("type") == "image":
                            source = block.get("source", {})
                            if isinstance(source, dict) and source.get("type") == "base64":
                                media_type = source.get("media_type", "image/png")
                                data = source.get("data", "")
                                image_parts.append({
                                    "type": "input_image",
                                    "image_url": f"data:{media_type};base64,{data}",
                                })
                        elif block.get("type") == "tool_use":
                            text_parts.append(f"[Used tool: {block.get('name', 'unknown')}]")
                        elif block.get("type") == "tool_result":
                            result_content = block.get("content", "")
                            if isinstance(result_content, str):
                                summary = result_content[:200]
                            elif isinstance(result_content, list):
                                summary = " ".join(
                                    b.get("text", "")[:200]
                                    for b in result_content
                                    if isinstance(b, dict) and b.get("type") == "text"
                                )
                            else:
                                summary = str(result_content)[:200]
                            text_parts.append(f"[Tool result: {summary}]")
                # If we have images, build multimodal content
                if image_parts:
                    msg_content = []
                    if text_parts:
                        msg_content.append({"type": "input_text", "text": " ".join(text_parts)})
                    msg_content.extend(image_parts)
                    if msg_content:
                        codex_messages.append({
                            "type": "message",
                            "role": "user",
                            "content": msg_content,
                        })
                    continue
                content = " ".join(text_parts)
                if not content:
                    continue
            elif not isinstance(content, str):
                continue

            role = msg["role"]
            # Map roles: Responses API supports user, assistant, developer, system
            if role not in ("user", "assistant", "developer", "system"):
                role = "user"

            # User messages use input_text, assistant messages use output_text
            content_type = "output_text" if role == "assistant" else "input_text"

            codex_messages.append({
                "type": "message",
                "role": role,
                "content": [{"type": content_type, "text": content}],
            })
        return codex_messages

    # ------------------------------------------------------------------
    # Tool calling support
    # ------------------------------------------------------------------

    @staticmethod
    def _convert_tools(tools: list[dict]) -> list[dict]:
        """Convert internal tool definitions to OpenAI function format.

        Internal:  {"name": ..., "description": ..., "input_schema": {...}}
        OpenAI:    {"type": "function", "name": ..., "description": ..., "parameters": {...}}
        """
        return [
            {
                "type": "function",
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
            }
            for t in tools
        ]

    def _convert_messages_with_tools(self, messages: list[dict]) -> list[dict]:
        """Convert internal message format to Codex Responses API format with tool support.

        Unlike _convert_messages (which flattens tool blocks to text), this method
        preserves tool call / tool result structure for the Responses API:

        - Assistant text → {"type": "message", "role": "assistant", "content": [output_text]}
        - tool_use block →
          {"type": "function_call", "call_id": ..., "name": ..., "arguments": "..."}
        - tool_result block → {"type": "function_call_output", "call_id": ..., "output": "..."}
        - User text → {"type": "message", "role": "user", "content": [input_text]}
        - Image blocks → {"type": "message", "role": "user", "content": [input_image]}
        """
        codex_input: list[dict] = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if isinstance(content, str):
                if not content:
                    continue
                ct = "output_text" if role == "assistant" else "input_text"
                codex_input.append({
                    "type": "message",
                    "role": (role
                             if role in ("user", "assistant", "developer", "system") else "user"),
                    "content": [{"type": ct, "text": content}],
                })
                continue

            if not isinstance(content, list):
                continue

            # Process list-format content blocks
            text_parts: list[str] = []
            image_parts: list[dict] = []

            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type", "")

                if btype == "text":
                    text_parts.append(block.get("text", ""))

                elif btype == "tool_use":
                    # Flush any accumulated text first
                    if text_parts:
                        codex_input.append({
                            "type": "message",
                            "role": "assistant",
                            "content": [{"type": "output_text", "text": " ".join(text_parts)}],
                        })
                        text_parts = []
                    # Convert to OpenAI function_call item
                    tool_input = block.get("input", {})
                    codex_input.append({
                        "type": "function_call",
                        "call_id": block.get("id", ""),
                        "name": block.get("name", ""),
                        "arguments": (json.dumps(tool_input)
                                      if isinstance(tool_input, dict) else str(tool_input)),
                    })

                elif btype == "tool_result":
                    # Convert to OpenAI function_call_output item
                    result_content = block.get("content", "")
                    if isinstance(result_content, list):
                        output = " ".join(
                            b.get("text", "")
                            for b in result_content
                            if isinstance(b, dict) and b.get("type") == "text"
                        )
                    elif isinstance(result_content, str):
                        output = result_content
                    else:
                        output = str(result_content)
                    codex_input.append({
                        "type": "function_call_output",
                        "call_id": block.get("tool_use_id", ""),
                        "output": output,
                    })

                elif btype == "image":
                    # Convert internal base64 image to OpenAI input_image format
                    source = block.get("source", {})
                    if isinstance(source, dict) and source.get("type") == "base64":
                        media_type = source.get("media_type", "image/png")
                        data = source.get("data", "")
                        image_parts.append({
                            "type": "input_image",
                            "image_url": f"data:{media_type};base64,{data}",
                        })

            # Flush remaining text/image parts
            if text_parts or image_parts:
                msg_content: list[dict] = []
                if text_parts:
                    ct = "output_text" if role == "assistant" else "input_text"
                    msg_content.append({"type": ct, "text": " ".join(text_parts)})
                msg_content.extend(image_parts)
                if msg_content:
                    codex_input.append({
                        "type": "message",
                        "role": (role
                                 if role in ("user", "assistant", "developer", "system")
                                 else "user"),
                        "content": msg_content,
                    })

        return codex_input

    @staticmethod
    def _estimate_body_input_tokens(body: dict) -> int:
        """Estimate input tokens from a Codex API request body."""
        chars = len(body.get("instructions", ""))
        for item in body.get("input", []):
            if isinstance(item, dict):
                for block in item.get("content", []):
                    if isinstance(block, dict):
                        chars += len(block.get("text", ""))
                chars += len(item.get("arguments", ""))
                chars += len(item.get("output", ""))
        return estimate_tokens("x" * chars) if chars else 1

    def _convert_tools_cached(self, tools: list[dict]) -> list[dict]:
        """Convert tools with identity-based caching.

        Within a tool loop, the same tools list object is passed on every
        iteration. This avoids re-converting 70+ tool definitions each time.
        """
        if tools is not self._last_tools_list:
            self._last_tools_converted = self._convert_tools(tools)
            self._last_tools_list = tools
        return self._last_tools_converted

    async def chat_with_tools(
        self,
        messages: list[dict],
        system: str,
        tools: list[dict],
        *,
        reasoning_effort: str | None = None,
        model: str | None = None,
    ) -> LLMResponse:
        """Send a request with tool definitions, return structured LLMResponse.

        Args:
            messages: Conversation history in internal format.
            system: System prompt text.
            tools: Tool definitions in internal format (converted internally).
            reasoning_effort: Per-request override of the configured effort
                (None = use self.reasoning_effort). Resolved into a LOCAL
                value — never assigned onto self, which concurrent chat and
                agent calls would race.
            model: Per-request override of the configured model (None/empty
                = use self.model). Same locality rule as reasoning_effort.

        Returns:
            LLMResponse with text, tool_calls, and stop_reason.
        """
        # Immutable pre-await locals: the body AND the response provenance are
        # built from these, so a live reload during the request cannot make
        # the trajectory stamp diverge from what was actually sent.
        effort = reasoning_effort if reasoning_effort is not None else self.reasoning_effort
        resolved_model = model if model else self.model
        _reject_known_bad_pair(resolved_model, effort)
        body = {
            "model": resolved_model,
            "instructions": system,
            "input": self._convert_messages_with_tools(messages),
            "tools": self._convert_tools_cached(tools),
            "tool_choice": "auto",
            "store": False,
            "stream": True,
        }
        if effort:
            body["reasoning"] = {"effort": effort}

        input_tokens = self._estimate_body_input_tokens(body)
        result = await self._stream_tool_request(body)
        output_chars = len(result.text)
        for tc in result.tool_calls:
            output_chars += len(tc.name) + len(json.dumps(tc.input))
        result.input_tokens = input_tokens
        result.output_tokens = estimate_tokens("x" * output_chars) if output_chars else 0
        result.provenance_provider = "codex"
        result.provenance_model = resolved_model
        result.provenance_reasoning_effort = effort or None
        return result

    async def _stream_tool_request(self, body: dict) -> LLMResponse:
        """Send a streaming request and parse both text and function_call events."""
        return await self._send_with_retries(
            body,
            self._read_tool_stream,
            lambda r: not (r.text or r.tool_calls),
        )

    async def _stream_request(self, body: dict) -> str:
        """Send a streaming request and collect the full response text."""
        return await self._send_with_retries(
            body,
            self._read_stream,
            lambda r: not r,
        )

    async def _send_with_retries(self, body: dict, reader, result_is_empty):
        """Shared retry/rotation/breaker engine for both streaming paths.

        The text and tool paths previously carried duplicated copies of this
        loop, which is how the 429/5xx breaker double-count crept in (the
        status branch recorded a failure, then the terminal path fell through
        to a second record_failure). Invariant here: each failed attempt
        records exactly ONE breaker failure.

        The account serving the request is pinned by index at acquire time so
        429/401 marking penalizes the account that actually failed — under
        concurrent traffic "whatever account is current when I take the lock"
        is frequently a different, healthy one.
        """
        self.breaker.check()
        session = await self._get_session()
        self._total_requests += 1
        last_error = None
        token, account_id, acct_idx = await self._acquire_auth()

        # max_retries counts total attempts here (historical semantics: 3 ⇒
        # three tries); clamp so a configured 0 means "one attempt, no
        # retries" — the sibling providers' meaning — instead of "make no
        # request at all", which would silently suppress every Codex call
        # now that the retry config is actually plumbed.
        for attempt in range(max(1, self.max_retries)):
            try:
                async with session.post(
                    CODEX_API_URL,
                    headers=self._auth_headers(token, account_id),
                    json=body,
                    timeout=aiohttp.ClientTimeout(
                        total=self.request_timeout,
                        sock_connect=CONNECT_TIMEOUT,
                        sock_read=self.stream_stall_timeout,
                    ),
                ) as resp:
                    if resp.status == 200:
                        try:
                            result = await reader(resp)
                        except CodexStreamError as e:
                            if e.is_capacity:
                                # Model-tier capacity exhaustion (e.g.
                                # server_is_overloaded) inside a 200. Every
                                # account shares it, so: no account rotation,
                                # no client-breaker count, no inner retry
                                # burn. Escape immediately — the deadline-
                                # based recovery layer owns the wait and
                                # counts one model-breaker failure per failed
                                # logical generation.
                                raise LLMCapacityError(
                                    "Codex capacity: "
                                    f"{e.error_code or e.error_type or 'unknown'}",
                                    provider="codex",
                                    model=str(body.get("model") or self.model),
                                    retry_after=e.retry_after,
                                ) from e
                            if (
                                e.error_type == "invalid_request_error"
                                or e.error_code == "context_length_exceeded"
                            ):
                                # The request itself is invalid for this model
                                # (context overflow is the dominant case):
                                # deterministic, so retrying the identical
                                # payload burns attempts on a guaranteed
                                # failure. Fast-fail as a REQUEST error — the
                                # agent overflow recovery keys on ``code``.
                                # The client breaker counts infrastructure
                                # health, not payload validity: untouched.
                                raise LLMRequestError(
                                    f"Codex stream failed: {e}",
                                    provider="codex",
                                    model=str(body.get("model") or self.model),
                                    code=e.error_code or e.error_type,
                                ) from e
                            # response.failed / error event: the "200" turned
                            # out to be a failure mid-stream — retryable.
                            self.breaker.record_failure()
                            last_error = str(e)
                            if attempt < self.max_retries - 1:
                                wait = compute_backoff(
                                    attempt,
                                    self.retry_base_delay,
                                    self.retry_max_delay,
                                )
                                log.warning(
                                    "Codex stream failed (attempt %d/%d): %s. Retrying in %.1fs...",
                                    attempt + 1, self.max_retries, last_error, wait,
                                )
                                await asyncio.sleep(wait)
                                continue
                            raise LLMTransportError(
                                f"Codex stream failed: {last_error}",
                                provider="codex",
                                model=str(body.get("model") or self.model),
                            ) from e
                        if not result_is_empty(result):
                            self.breaker.record_success()
                            return result
                        log.warning(
                            "Codex returned 200 with empty response (attempt %d/%d)",
                            attempt + 1, self.max_retries,
                        )
                        if attempt < self.max_retries - 1:
                            wait = compute_backoff(
                                attempt,
                                self.retry_base_delay,
                                self.retry_max_delay,
                            )
                            await asyncio.sleep(wait)
                            continue
                        self.breaker.record_failure()
                        return result

                    raw_error = await resp.content.read(_ERROR_BODY_READ_CAP)
                    error_body = raw_error.decode("utf-8", errors="replace")
                    structured = _parse_structured_error(error_body)
                    descriptor = _describe_error_body(
                        resp.headers.get("Content-Type"), raw_error, structured
                    )

                    if resp.status == 401:
                        body_l = error_body.lower()
                        invalidated = (
                            "token_invalidated" in body_l
                            or "invalidated" in body_l
                            or "sign in again" in body_l
                        )
                        # Likely-stale/revoked bearer (generic 401, first try):
                        # actually exercise the refresh token — merely dropping
                        # the cached token re-serves the same unexpired bearer —
                        # then retry the SAME account once.
                        if attempt == 0 and not invalidated and await self._force_refresh(
                            acct_idx,
                            token,
                        ):
                            log.warning("Codex auth 401, token refreshed, retrying...")
                            token, account_id = await self._token_for(acct_idx)
                            continue
                        # Invalidated, refresh failed, or a 401 that survived
                        # the refresh: this account can't authenticate. Bench
                        # it (long backoff) and move to the next account.
                        rotated = await self._mark_auth_failed(acct_idx)
                        if rotated and attempt < self.max_retries - 1:
                            log.warning("Codex 401: skipped failed account, retrying on next...")
                            token, account_id, acct_idx = await self._acquire_auth()
                            continue
                        self.breaker.record_failure()
                        raise LLMAuthError(
                            f"Codex 401 (auth failed, no healthy account): {descriptor}",
                            provider="codex",
                            model=str(body.get("model") or self.model),
                        )

                    if resp.status == 429:
                        await self._mark_limited(acct_idx)
                        self.breaker.record_failure()
                        last_error = f"HTTP 429: {descriptor}"
                        if attempt < self.max_retries - 1:
                            wait = compute_backoff(
                                attempt,
                                self.retry_base_delay,
                                self.retry_max_delay,
                            )
                            log.warning(
                                "Codex rate limited (attempt %d/%d): %s. "
                                "Rotating + retry in %.1fs...",
                                attempt + 1, self.max_retries, last_error, wait,
                            )
                            await asyncio.sleep(wait)
                            token, account_id, acct_idx = await self._acquire_auth()
                            continue
                        # Internal rotation is exhausted at this point (every
                        # attempt marked its account limited and re-acquired).
                        # Typed so the outer recovery FAST-FAILS instead of
                        # spending its budget cycling limited accounts —
                        # quota semantics stay exactly as before.
                        raise LLMRateLimitError(
                            f"Codex API error (429): {descriptor}",
                            provider="codex",
                            model=str(body.get("model") or self.model),
                        )

                    if resp.status in (500, 502, 503, 504) or structured is None:
                        # Retryable server errors — and, since the 2026-08-14
                        # edge incident, ANY status whose body is not a JSON
                        # object: an HTML/opaque error page means the front
                        # door failed, not that this request is invalid, so
                        # it gets the same transport treatment (backoff +
                        # retry here, deadline recovery above) instead of
                        # killing the turn on one attempt. 401/429 never
                        # reach here — their branches keep dedicated
                        # refresh/rotation and quota semantics.
                        self.breaker.record_failure()
                        last_error = f"HTTP {resp.status}: {descriptor}"
                        if attempt < self.max_retries - 1:
                            wait = compute_backoff(
                                attempt,
                                self.retry_base_delay,
                                self.retry_max_delay,
                            )
                            log.warning(
                                "Codex API error (attempt %d/%d): %s. Retrying in %.1fs...",
                                attempt + 1, self.max_retries, last_error, wait,
                            )
                            await asyncio.sleep(wait)
                            continue
                        raise LLMTransportError(
                            f"Codex API error ({resp.status}): {descriptor}",
                            provider="codex",
                            model=str(body.get("model") or self.model),
                        )

                    # Structured (JSON-object) non-2xx outside the dedicated
                    # branches: the API itself rejected the request (bad
                    # model, malformed input) — deterministic, so retrying
                    # the identical payload burns attempts on a guaranteed
                    # failure. Fast-fail, never retried.
                    self.breaker.record_failure()
                    raise LLMRequestError(
                        f"Codex API error ({resp.status}): {descriptor}",
                        provider="codex",
                        model=str(body.get("model") or self.model),
                    )

            except (TimeoutError, aiohttp.ClientError) as e:
                # asyncio.TimeoutError: the total/sock_read timeouts can fire
                # mid-stream; TimeoutError is not an aiohttp.ClientError and
                # previously escaped both the retry loop and breaker bookkeeping.
                self.breaker.record_failure()
                last_error = str(e) or type(e).__name__
                if attempt < self.max_retries - 1:
                    wait = compute_backoff(attempt, self.retry_base_delay, self.retry_max_delay)
                    log.warning(
                        "Codex connection error (attempt %d/%d): %s. Retrying in %.1fs...",
                        attempt + 1, self.max_retries, last_error, wait,
                    )
                    await asyncio.sleep(wait)
                else:
                    raise LLMTransportError(
                        f"Codex API connection failed: {last_error}",
                        provider="codex",
                        model=str(body.get("model") or self.model),
                    ) from e

        raise RuntimeError(f"Codex API failed after {self.max_retries} retries: {last_error}")

    async def _read_tool_stream(self, resp: aiohttp.ClientResponse) -> LLMResponse:
        """Read SSE stream and extract text content and function calls.

        Handles these SSE event types:
        - response.output_text.delta: incremental text
        - response.output_item.added: new output item (detect function_call type)
        - response.function_call_arguments.delta: streaming JSON arguments
        - response.function_call_arguments.done: complete arguments
        - response.output_item.done: finalize the output item
        - response.completed: final response object (fallback)
        """
        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        incomplete = False

        # Track in-progress function calls by output_index
        pending_calls: dict[int, dict] = {}  # {index: {"call_id": ..., "name": ..., "args": ""}}
        event_types_seen: list[str] = []

        async for raw_line in resp.content:
            line = raw_line.decode("utf-8", errors="replace").strip()

            if not line.startswith("data: "):
                continue

            data_str = line[6:]
            if data_str == "[DONE]":
                break

            try:
                event = json.loads(data_str)
            except json.JSONDecodeError:
                continue

            event_type = event.get("type", "")
            event_types_seen.append(event_type)

            # Incremental text
            if event_type == "response.output_text.delta":
                delta = event.get("delta", "")
                if delta:
                    text_parts.append(delta)

            # Complete text (sometimes sent instead of deltas)
            elif event_type == "response.output_text.done":
                done_text = event.get("text", "")
                if done_text and not text_parts:
                    text_parts.append(done_text)

            # New output item — detect function_call type
            elif event_type == "response.output_item.added":
                item = event.get("item", {})
                if item.get("type") == "function_call":
                    idx = event.get("output_index", 0)
                    pending_calls[idx] = {
                        "call_id": item.get("call_id", ""),
                        "name": item.get("name", ""),
                        "args": "",
                    }

            # Streaming function call arguments
            elif event_type == "response.function_call_arguments.delta":
                idx = event.get("output_index", 0)
                if idx in pending_calls:
                    pending_calls[idx]["args"] += event.get("delta", "")

            # Function call arguments complete
            elif event_type == "response.function_call_arguments.done":
                idx = event.get("output_index", 0)
                if idx in pending_calls:
                    call_info = pending_calls[idx]
                    parse_error = None
                    try:
                        parsed_args = json.loads(call_info["args"]) if call_info["args"] else {}
                    except json.JSONDecodeError:
                        parsed_args = {}
                        parse_error = (f"malformed tool arguments (invalid JSON): "
                                       f"{call_info['args'][:200]}")
                        log.warning(
                            "Failed to parse function call arguments: %s",
                            call_info["args"][:200],
                        )
                    tool_calls.append(ToolCall(
                        id=call_info["call_id"],
                        name=call_info["name"],
                        input=parsed_args,
                        parse_error=parse_error,
                    ))

            # Output item done — finalize any remaining pending call at this index
            elif event_type == "response.output_item.done":
                item = event.get("item", {})
                idx = event.get("output_index", 0)
                if item.get("type") == "function_call" and idx in pending_calls:
                    # If arguments.done wasn't received, try to parse from the done item
                    # Standard pop-with-None-sentinel idiom; guarded by
                    # the truthiness check on the next line.
                    call_info = pending_calls.pop(idx, None)  # type: ignore[arg-type]
                    if call_info and not any(tc.id == call_info["call_id"] for tc in tool_calls):
                        args_str = item.get("arguments", call_info.get("args", ""))
                        parse_error = None
                        try:
                            parsed_args = json.loads(args_str) if args_str else {}
                        except json.JSONDecodeError:
                            parsed_args = {}
                            parse_error = (f"malformed tool arguments (invalid JSON): "
                                           f"{args_str[:200]}")
                        tool_calls.append(ToolCall(
                            id=call_info["call_id"],
                            name=call_info["name"],
                            input=parsed_args,
                            parse_error=parse_error,
                        ))

            # Terminal failure events: the HTTP 200 turned out to be a failed
            # generation — surface it so the retry engine treats it as an
            # error instead of returning partial output as a completed turn.
            elif event_type in ("response.failed", "error"):
                exc = _stream_error_from_event(event_type, event)
                log.warning("Codex stream terminal failure %s", exc)
                raise exc

            # Incomplete (length-capped / filtered): keep the partial output
            # but mark it so callers can tell it isn't a normal completion.
            elif event_type == "response.incomplete":
                incomplete = True
                reason = ((event.get("response") or {}).get("incomplete_details")
                    or {}).get("reason") or "unknown"
                log.warning(
                    "Codex stream incomplete (reason: %s) — returning partial output",
                    reason,
                )

            # Final response object — fallback
            elif event_type == "response.completed":
                response_obj = event.get("response", {})
                output = response_obj.get("output", [])
                for item in output:
                    item_type = item.get("type", "")
                    if item_type == "message" and not text_parts:
                        for block in item.get("content", []):
                            text = block.get("text", "")
                            if text:
                                text_parts.append(text)
                    elif item_type == "function_call":
                        # Fallback: pick up function calls from completed event
                        call_id = item.get("call_id", "")
                        if not any(tc.id == call_id for tc in tool_calls):
                            args_str = item.get("arguments", "")
                            parse_error = None
                            try:
                                parsed_args = json.loads(args_str) if args_str else {}
                            except json.JSONDecodeError:
                                parsed_args = {}
                                parse_error = (f"malformed tool arguments (invalid JSON): "
                                               f"{args_str[:200]}")
                            tool_calls.append(ToolCall(
                                id=call_id,
                                name=item.get("name", ""),
                                input=parsed_args,
                                parse_error=parse_error,
                            ))

        text = "".join(text_parts)
        if not text and not tool_calls:
            log.warning("Codex tool stream empty (events: %s, pending: %s)",
                        event_types_seen, list(pending_calls.keys()))

        if tool_calls:
            stop_reason = "tool_use"
        elif incomplete:
            stop_reason = "incomplete"
        else:
            stop_reason = "end_turn"
        return LLMResponse(text=text, tool_calls=tool_calls, stop_reason=stop_reason)

    async def _read_stream(self, resp: aiohttp.ClientResponse) -> str:
        """Read SSE stream and extract text content."""
        text_parts = []

        async for raw_line in resp.content:
            line = raw_line.decode("utf-8", errors="replace").strip()

            if not line.startswith("data: "):
                continue

            data_str = line[6:]  # strip "data: " prefix
            if data_str == "[DONE]":
                break

            try:
                event = json.loads(data_str)
            except json.JSONDecodeError:
                continue

            # Handle different SSE event types
            event_type = event.get("type", "")

            # response.output_text.delta — incremental text
            if event_type == "response.output_text.delta":
                delta = event.get("delta", "")
                if delta:
                    text_parts.append(delta)

            # response.output_text.done — complete text (sometimes sent instead of deltas)
            elif event_type == "response.output_text.done":
                done_text = event.get("text", "")
                if done_text and not text_parts:
                    text_parts.append(done_text)

            # Terminal failure events — surface to the retry engine instead of
            # returning partial output as a normal completion.
            elif event_type in ("response.failed", "error"):
                exc = _stream_error_from_event(event_type, event)
                log.warning("Codex stream terminal failure %s", exc)
                raise exc

            elif event_type == "response.incomplete":
                reason = ((event.get("response") or {}).get("incomplete_details")
                    or {}).get("reason") or "unknown"
                log.warning(
                    "Codex stream incomplete (reason: %s) — returning partial output",
                    reason,
                )

            # response.completed — final response object
            elif event_type == "response.completed":
                response = event.get("response", {})
                output = response.get("output", [])
                for item in output:
                    if item.get("type") == "message":
                        for block in item.get("content", []):
                            text = block.get("text", "")
                            if text:
                                # Only use completed output if we didn't get deltas
                                if not text_parts:
                                    text_parts.append(text)

        if not text_parts:
            log.warning("Codex stream returned 200 but produced no text content")
            return ""
        return "".join(text_parts)
