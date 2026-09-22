"""Configurable OpenAI-compatible chat-completions client."""

from __future__ import annotations

import asyncio
import json
import math
import re
import uuid

import aiohttp

from ..odin_log import get_logger
from .backoff import DEFAULT_BASE_DELAY, DEFAULT_MAX_DELAY, DEFAULT_MAX_RETRIES, compute_backoff
from .circuit_breaker import CircuitBreaker
from .client_lifecycle import leased_call
from .context_budget import COMPATIBLE_REQUEST_OUTPUT_CEILING
from .errors import LLMContextLengthError, LLMRateLimitError, LLMRequestError, LLMTransportError
from .progress import GenerationProgress, GenerationProgressObserver, emit_progress
from .provider import LLMProvider
from .tool_history import parse_tool_arguments
from .types import LLMResponse, ToolCall

log = get_logger("openai_compatible")

_DEEPSEEK_CONTEXT_LIMIT_RE = re.compile(
    r"^This model's maximum context length is (?P<limit>[1-9][0-9]*) tokens\."
)

DEFAULT_COMPATIBLE_API_URL = "https://api.deepseek.com/v1"
KIMI_API_URL = "https://api.moonshot.ai/v1"
DEEPSEEK_API_URL = "https://api.deepseek.com/v1"
DEEPSEEK_REASONING_OUTPUT_FLOOR = 1024
CONNECT_TIMEOUT_SECONDS = 30


class CompatibleStreamError(Exception):
    """A 200 response whose SSE stream did not settle successfully."""

    def __init__(self, message: str, *, discarded_text_chars: int = 0,
                 discarded_tool_argument_chars: int = 0) -> None:
        super().__init__(message)
        self.discarded_text_chars = discarded_text_chars
        self.discarded_tool_argument_chars = discarded_tool_argument_chars

KIMI_TOOL_ENFORCEMENT = (
    "\n\nIMPORTANT: When a user request requires action, you MUST use the "
    "provided tools to fulfill it. Do not describe what you would do — "
    "call the appropriate tool directly."
)


class OpenAICompatibleClient(LLMProvider):
    """Reusable OpenAI-compatible client with explicit endpoint quirks."""

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = DEFAULT_COMPATIBLE_API_URL,
        provider_name: str = "openai_compatible",
        max_tokens: int = 4096,
        tool_quirks: dict | None = None,
        timeout: int | None = None,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_base_delay: float = DEFAULT_BASE_DELAY,
        retry_max_delay: float = DEFAULT_MAX_DELAY,
        context_overflow_pattern: str | None = None,
        reasoning_dialect: str = "none",
        glm_clear_thinking: bool | None = None,
        reasoning_content_feedback_policy: str = "do_not_echo",
        openrouter_routing: object | None = None,
        model_profiles: dict[str, object] | None = None,
        request_timeout_seconds: int = 3600,
        stream_stall_timeout_seconds: int | None = None,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._provider_name = provider_name
        self.model = model
        self.max_tokens = max_tokens
        self.request_timeout = request_timeout_seconds
        self.stream_stall_timeout = (
            stream_stall_timeout_seconds if stream_stall_timeout_seconds is not None
            else timeout if timeout is not None else 180
        )
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay
        self.retry_max_delay = retry_max_delay
        self._context_overflow_re = (
            re.compile(context_overflow_pattern) if context_overflow_pattern else None
        )
        self.tool_quirks = dict(tool_quirks or {})
        self.reasoning_dialect = reasoning_dialect
        self.glm_clear_thinking = glm_clear_thinking
        self.reasoning_content_feedback_policy = reasoning_content_feedback_policy
        self.openrouter_routing = openrouter_routing
        self.model_profiles = dict(model_profiles or {})
        self.breaker = CircuitBreaker(f"{provider_name}_api")
        self._session: aiohttp.ClientSession | None = None
        self._total_requests: int = 0
        self._last_input_tokens: int = 0
        self._last_output_tokens: int = 0
        self._last_cached_tokens: int | None = None
        self._last_actual_cost_usd: float | None = None
        self._last_upstream_provider: str | None = None
        self._last_stream_usage_received: bool = False

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(
                    total=self.request_timeout,
                    connect=CONNECT_TIMEOUT_SECONDS,
                    sock_connect=CONNECT_TIMEOUT_SECONDS,
                    sock_read=self.stream_stall_timeout,
                ),
            )
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    def pool_stats(self) -> dict:
        return {
            "provider": self.provider_name,
            "base_url": self.base_url,
            "model": self.model,
            "total_requests": self._total_requests,
        }

    @property
    def provider_name(self) -> str:
        return self._provider_name

    @property
    def model_name(self) -> str:
        return self.model

    def _convert_messages(self, messages: list[dict], system: str) -> list[dict]:
        """Convert internal message format to OpenAI chat completions format."""
        oai_messages = []
        if system:
            oai_messages.append({"role": "system", "content": system})

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "tool_result":
                oai_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": msg.get("tool_use_id", ""),
                        "content": json.dumps(content) if not isinstance(content, str) else content,
                    }
                )
                continue

            if isinstance(content, list):
                text_parts = []
                image_parts = []
                tool_calls = []
                tool_results = []
                preserved_reasoning: str | None = None
                for block in content:
                    if isinstance(block, dict):
                        if block.get("type") == "text":
                            text_parts.append(block["text"])
                        elif block.get("type") == "image":
                            source = block.get("source", {})
                            if source.get("type") == "base64" and source.get("data"):
                                mime = source.get("media_type", "image/png")
                                image_parts.append(
                                    {
                                        "type": "image_url",
                                        "image_url": {
                                            "url": f"data:{mime};base64,{source['data']}",
                                        },
                                    }
                                )
                        elif block.get("type") == "tool_use":
                            tool_calls.append(
                                {
                                    "id": block.get("id", ""),
                                    "type": "function",
                                    "function": {
                                        "name": block.get("name", ""),
                                        "arguments": json.dumps(block.get("input", {})),
                                    },
                                }
                            )
                        elif block.get("type") == "tool_result":
                            tr_content = block.get("content", "")
                            tool_results.append(
                                {
                                    "role": "tool",
                                    "tool_call_id": block.get("tool_use_id", ""),
                                    "content": (
                                        json.dumps(tr_content)
                                        if not isinstance(tr_content, str)
                                        else tr_content
                                    ),
                                }
                            )
                        elif (
                            block.get("type") == "reasoning_content"
                            and self._preserves_reasoning_content()
                            and role == "assistant"
                            and isinstance(block.get("reasoning_content"), str)
                        ):
                            preserved_reasoning = block["reasoning_content"]
                    elif isinstance(block, str):
                        text_parts.append(block)

                if text_parts or image_parts or tool_calls:
                    entry: dict = {
                        "role": role,
                        "content": "\n".join(text_parts) if text_parts else "",
                    }
                    if image_parts:
                        entry["content"] = [
                            *({"type": "text", "text": text} for text in text_parts),
                            *image_parts,
                        ]
                    if tool_calls and role == "assistant":
                        entry["tool_calls"] = tool_calls
                        if not entry["content"]:
                            entry["content"] = ""
                        if self is not None and self.tool_quirks.get(
                            "reasoning_content_placeholder"
                        ):
                            entry["reasoning_content"] = ""
                    if role == "assistant" and preserved_reasoning is not None:
                        entry["reasoning_content"] = preserved_reasoning
                    oai_messages.append(entry)
                for tr in tool_results:
                    oai_messages.append(tr)
                continue

            if role == "developer":
                role = "system"
            entry = {"role": role, "content": str(content) if content else ""}
            if role == "assistant" and msg.get("tool_calls"):
                if self is not None and self.tool_quirks.get("reasoning_content_placeholder"):
                    entry["reasoning_content"] = ""
            oai_messages.append(entry)

        return oai_messages

    _MFJS_STRIP_KEYS = frozenset(
        {
            "title",
            "$comment",
            "format",
            "prefixItems",
            "$defs",
            "$ref",
            "exclusiveMinimum",
            "exclusiveMaximum",
        }
    )

    def _sanitize_schema(self, schema: dict) -> dict:
        """Sanitize a JSON Schema for endpoints with MFJS restrictions."""
        clean: dict = {}
        for k, v in schema.items():
            if k in self._MFJS_STRIP_KEYS:
                continue
            if isinstance(v, dict):
                clean[k] = self._sanitize_schema(v)
            elif isinstance(v, list):
                clean[k] = [
                    self._sanitize_schema(item) if isinstance(item, dict) else item for item in v
                ]
            else:
                clean[k] = v
        if clean.get("type") == "object":
            clean.setdefault("properties", {})
            clean.setdefault("required", [])
        return clean

    def _convert_tools(self, tools: list[dict]) -> list[dict]:
        """Convert internal tool format to Chat Completions tool format."""
        oai_tools = []
        for tool in tools:
            params = tool.get("input_schema", tool.get("parameters", {}))
            if not params or not isinstance(params, dict):
                params = {"type": "object", "properties": {}, "required": []}
            if self.tool_quirks.get("sanitize_schema"):
                params = self._sanitize_schema(params)
            if "type" not in params:
                params["type"] = "object"
                params.setdefault("properties", {})
                params.setdefault("required", [])
            fn: dict = {
                "name": tool.get("name", "unknown"),
                "description": tool.get("description", "") or tool.get("name", ""),
                "parameters": params,
            }
            oai_tools.append({"type": "function", "function": fn})
        return oai_tools

    def _resolve_temperature(self, temperature: float | None) -> float | None:
        """Apply only explicitly configured temperature endpoint quirks."""
        force_for = self.tool_quirks.get("force_temperature_model_substring")
        if force_for and force_for in self.model:
            return 1.0
        if temperature is None:
            return None
        bounds = self.tool_quirks.get("temperature_range")
        return max(bounds[0], min(bounds[1], temperature)) if bounds else temperature

    def _request_max_tokens(
        self,
        requested: int | None = None,
        *,
        model: str | None = None,
    ) -> int:
        """Resolve the per-request output cap without treating zero as unset."""
        if type(requested) is int and requested > 0:
            return requested
        from .context_budget import canonical_compatible_model

        canonical = canonical_compatible_model(model or self.model)
        profile = self.model_profiles.get(canonical)
        if profile is None and self.openrouter_routing is not None:
            derived = getattr(self.openrouter_routing, "catalogue_profiles", {}) or {}
            profile = derived.get(canonical)
        profile_cap = getattr(profile, "max_output_tokens", None)
        if type(profile_cap) is int and profile_cap > 0:
            return min(profile_cap, COMPATIBLE_REQUEST_OUTPUT_CEILING)
        return self.max_tokens

    def _preserves_reasoning_content(self) -> bool:
        """Whether this endpoint explicitly requires preserved-thinking replay."""
        return (
            self.reasoning_content_feedback_policy == "preserve"
            and self.reasoning_dialect == "glm_thinking"
            and self.glm_clear_thinking is False
        )

    def _safe_tool_call_id(self, value: object) -> str:
        """Keep usable provider IDs; create neutral IDs for absent or unsafe ones."""
        if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_.:-]{1,256}", value):
            return value
        return f"call_{uuid.uuid4().hex[:12]}"

    def _apply_reasoning(
        self,
        body: dict,
        effort: str | None,
        *,
        thinking_mode: str | None = None,
        apply_reasoning: bool = True,
    ) -> None:
        """Adapt one neutral effort request to the configured endpoint dialect."""
        if not apply_reasoning:
            return
        dialect = self.reasoning_dialect
        normalized = (thinking_mode or effort or "auto").lower()
        disabled = normalized in {"none", "off", "disabled", "minimal"}
        if dialect in {"thinking_type", "glm_thinking"}:
            thinking_type = (
                "disabled"
                if disabled
                else "adaptive"
                if normalized in {"auto", "adaptive"}
                else "enabled"
            )
            thinking: dict[str, object] = {"type": thinking_type}
            if dialect == "glm_thinking" and self.glm_clear_thinking is not None:
                thinking["clear_thinking"] = self.glm_clear_thinking
            body["thinking"] = thinking
        elif dialect == "openai_reasoning_effort" and effort is not None:
            body["reasoning_effort"] = effort
        elif dialect == "qwen_legacy":
            body["enable_thinking"] = not disabled
            body["thinking_mode"] = (
                "fast" if disabled else "auto" if normalized in {"auto", "adaptive"} else "thinking"
            )
        elif dialect == "qwen_reasoning_effort" and effort is not None:
            body["reasoning_effort"] = effort
        elif dialect == "openrouter_reasoning":
            reasoning: dict[str, object] = {"enabled": not disabled}
            if effort is not None and not disabled:
                reasoning["effort"] = effort
            body["reasoning"] = reasoning

    def _apply_openrouter_routing(self, body: dict, *, has_tools: bool) -> None:
        """Attach OpenRouter routing only on its deliberately recognized path."""
        if self.openrouter_routing is None:
            return
        from .openrouter import is_openrouter_base_url, request_provider_policy

        if not is_openrouter_base_url(self.base_url):
            return

        body["provider"] = request_provider_policy(
            self.openrouter_routing,
            model=str(body.get("model") or self.model),
            has_tools=has_tools,
            has_reasoning="reasoning" in body,
        )

    async def _request_with_retry(
        self,
        body: dict,
        *,
        progress_observer: GenerationProgressObserver | None = None,
    ) -> dict:
        """Send a streaming request to the configured endpoint with retries."""
        from ..observability.diagnostics import safe_error

        self.breaker.check()
        session = await self._get_session()
        self._total_requests += 1
        self._last_stream_usage_received = False
        body = {**body, "stream": True, "stream_options": {"include_usage": True}}
        url = f"{self.base_url}/chat/completions"
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            emit_progress(
                progress_observer,
                GenerationProgress("retry", self.provider_name, attempt=attempt + 1),
            )
            try:
                async with session.post(
                    url,
                    json=body,
                    headers=self._headers(),
                    timeout=aiohttp.ClientTimeout(
                        total=self.request_timeout,
                        connect=CONNECT_TIMEOUT_SECONDS,
                        sock_connect=CONNECT_TIMEOUT_SECONDS,
                        sock_read=self.stream_stall_timeout,
                    ),
                ) as resp:
                    if resp.status == 200:
                        content_type = str(resp.headers.get("Content-Type", "")).lower()
                        if content_type.split(";", 1)[0].strip() != "text/event-stream":
                            raise LLMRequestError(
                                f"{self.provider_name} endpoint does not support "
                                "required SSE streaming",
                                provider=self.provider_name,
                                model=str(body.get("model") or self.model),
                                code="streaming_not_supported",
                            )
                        try:
                            data = await self._read_sse_response(resp, progress_observer)
                        except CompatibleStreamError as exc:
                            self.breaker.record_failure()
                            last_error = exc
                            log.warning(
                                "%s stream failed (attempt %d/%d; discarded_text_chars=%d; "
                                "discarded_tool_argument_chars=%d)",
                                self.provider_name,
                                attempt + 1,
                                self.max_retries + 1,
                                exc.discarded_text_chars,
                                exc.discarded_tool_argument_chars,
                            )
                            emit_progress(progress_observer, GenerationProgress(
                                "discarded", self.provider_name, attempt=attempt + 1,
                                discarded_text_chars=exc.discarded_text_chars,
                                discarded_tool_argument_chars=exc.discarded_tool_argument_chars,
                            ))
                            if attempt < self.max_retries:
                                await asyncio.sleep(compute_backoff(
                                    attempt, self.retry_base_delay, self.retry_max_delay
                                ))
                                continue
                            raise LLMTransportError(
                                f"{self.provider_name} stream failed after "
                                f"{self.max_retries + 1} attempts: {exc} "
                                f"(discarded_text_chars={exc.discarded_text_chars}; "
                                f"discarded_tool_argument_chars={exc.discarded_tool_argument_chars})",
                                provider=self.provider_name,
                                model=str(body.get("model") or self.model),
                            ) from exc
                        self.breaker.record_success()
                        self._last_stream_usage_received = isinstance(data.get("usage"), dict)
                        return data

                    raw_text = await resp.text()
                    try:
                        error_body = json.loads(raw_text)
                    except (TypeError, ValueError):
                        error_body = None
                    raw_error = error_body.get("error") if isinstance(error_body, dict) else None
                    error: dict = raw_error if isinstance(raw_error, dict) else {}
                    raw_code = error.get("code")
                    error_code = raw_code if isinstance(raw_code, str) else None
                    raw_message = error.get("message")
                    error_message = raw_message if isinstance(raw_message, str) else ""
                    raw_metadata = error.get("metadata")
                    metadata: dict = raw_metadata if isinstance(raw_metadata, dict) else {}
                    raw_funnel = metadata.get("routing_funnel")
                    routing_funnel = (
                        [item for item in raw_funnel if isinstance(item, dict)][:20]
                        if isinstance(raw_funnel, list)
                        else []
                    )
                    text = safe_error(raw_text)

                    if resp.status in {400, 422} and any(
                        marker in error_message.lower()
                        for marker in ("stream", "include_usage")
                    ):
                        raise LLMRequestError(
                            f"{self.provider_name} endpoint rejected required SSE streaming "
                            "or stream_options.include_usage; no non-streaming fallback",
                            provider=self.provider_name,
                            model=str(body.get("model") or self.model),
                            code="streaming_not_supported",
                        )

                    if resp.status == 429:
                        if attempt >= self.max_retries:
                            self.breaker.record_failure()
                            hdr = resp.headers.get("Retry-After")
                            try:
                                hdr_delay = float(hdr) if hdr else None
                            except (ValueError, TypeError):
                                hdr_delay = None
                            raise LLMRateLimitError(
                                f"{self.provider_name} rate limited after "
                                f"{self.max_retries + 1} attempts: {text}",
                                provider=self.provider_name,
                                model=self.model,
                                retry_after=hdr_delay,
                            )
                        retry_after = resp.headers.get("Retry-After")
                        try:
                            delay = (
                                min(float(retry_after), self.retry_max_delay)
                                if retry_after
                                else compute_backoff(
                                    attempt,
                                    self.retry_base_delay,
                                    self.retry_max_delay,
                                )
                            )
                        except (ValueError, TypeError):
                            delay = compute_backoff(
                                attempt,
                                self.retry_base_delay,
                                self.retry_max_delay,
                            )
                        log.warning(
                            "%s rate limited (attempt %d/%d), retrying in %.1fs",
                            self.provider_name,
                            attempt + 1,
                            self.max_retries + 1,
                            delay,
                        )
                        await asyncio.sleep(delay)
                        continue

                    if resp.status in (500, 502, 503, 504) and attempt < self.max_retries:
                        last_error = RuntimeError(f"{self.provider_name} {resp.status}: {text}")
                        delay = compute_backoff(
                            attempt,
                            self.retry_base_delay,
                            self.retry_max_delay,
                        )
                        log.warning(
                            "%s %d (attempt %d/%d), retrying in %.1fs",
                            self.provider_name,
                            resp.status,
                            attempt + 1,
                            self.max_retries + 1,
                            delay,
                        )
                        await asyncio.sleep(delay)
                        continue

                    # Only explicit provider codes are context overflows.
                    # Do not classify a random 400 mentioning "token" as one.
                    if error_code in {"context_length_exceeded", "max_context_length_exceeded"}:
                        raise LLMContextLengthError(
                            f"{self.provider_name} context length exceeded",
                            provider=self.provider_name,
                            model=body.get("model", self.model),
                            code="context_length_exceeded",
                        )
                    if self._context_overflow_re is not None:
                        match = self._context_overflow_re.match(error_message)
                        if match is not None:
                            try:
                                context_window = int(match.group("limit"))
                            except (IndexError, TypeError, ValueError):
                                context_window = 0
                            if context_window > 0:
                                raise LLMContextLengthError(
                                    f"{self.provider_name} context length exceeded",
                                    provider=self.provider_name,
                                    model=body.get("model", self.model),
                                    code="context_length_exceeded",
                                    context_window_tokens=context_window,
                                )
                    exc_cls = (
                        LLMTransportError
                        if resp.status in (500, 502, 503, 504)
                        else LLMRequestError
                    )
                    if exc_cls is LLMTransportError:
                        self.breaker.record_failure()
                    raise exc_cls(
                        f"{self.provider_name} {resp.status}: {text}",
                        provider=self.provider_name,
                        model=self.model,
                        routing_funnel=routing_funnel,
                    )
            except (TimeoutError, aiohttp.ClientError) as e:
                last_error = e
                self.breaker.record_failure()
                if attempt < self.max_retries:
                    delay = compute_backoff(attempt, self.retry_base_delay, self.retry_max_delay)
                    log.warning(
                        "%s connection error (attempt %d/%d): %s, retrying in %.1fs",
                        self.provider_name,
                        attempt + 1,
                        self.max_retries + 1,
                        safe_error(e),
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                raise LLMTransportError(
                    f"{self.provider_name} connection error after "
                    f"{self.max_retries + 1} attempts: {safe_error(e)}",
                    provider=self.provider_name,
                    model=self.model,
                ) from None

        raise RuntimeError(
            f"{self.provider_name} request failed after "
            f"{self.max_retries + 1} attempts: {safe_error(last_error)}"
        )

    async def _read_sse_response(
        self,
        resp,
        observer: GenerationProgressObserver | None,
    ) -> dict:
        """Accumulate complete SSE frames into the canonical response dict."""
        text_parts: list[str] = []
        reasoning_parts: list[str] = []
        calls: dict[int, dict] = {}
        finish_reason: str | None = None
        usage: dict | None = None
        served_model: str | None = None
        upstream_provider: str | None = None
        done = False
        buffer = b""

        def counts() -> tuple[int, int]:
            return (
                sum(map(len, text_parts)),
                sum(len(call["function"]["arguments"]) for call in calls.values()),
            )

        async def chunks():
            content = resp.content
            iterator = content.iter_any() if hasattr(content, "iter_any") else content
            try:
                async for chunk in iterator:
                    yield chunk
            except (TimeoutError, aiohttp.ClientError) as exc:
                chars, args = counts()
                raise CompatibleStreamError(
                    "stream stalled or connection lost",
                    discarded_text_chars=chars,
                    discarded_tool_argument_chars=args,
                ) from exc

        async for raw_chunk in chunks():
            if not raw_chunk:
                continue
            emit_progress(observer, GenerationProgress("wire", self.provider_name))
            buffer += bytes(raw_chunk)
            if len(buffer) > 4 * 1024 * 1024:
                chars, args = counts()
                raise CompatibleStreamError(
                    "SSE frame exceeds bounded parser limit",
                    discarded_text_chars=chars, discarded_tool_argument_chars=args,
                )
            while True:
                boundary = re.search(rb"\r?\n\r?\n", buffer)
                if boundary is None:
                    break
                frame = buffer[: boundary.start()]
                buffer = buffer[boundary.end() :]
                data_lines: list[str] = []
                event_name = ""
                for raw_line in frame.splitlines():
                    line = raw_line.decode("utf-8", errors="replace")
                    if line.startswith(":"):
                        continue
                    if line.startswith("event:"):
                        event_name = line[6:].strip()
                    if line == "data":
                        data_lines.append("")
                    elif line.startswith("data:"):
                        data_value = line[5:]
                        data_lines.append(
                            data_value[1:] if data_value.startswith(" ") else data_value
                        )
                if event_name in {"error", "response.failed"}:
                    chars, args = counts()
                    raise CompatibleStreamError(
                        "terminal provider error event in SSE stream",
                        discarded_text_chars=chars, discarded_tool_argument_chars=args,
                    )
                if not data_lines:
                    continue
                payload = "\n".join(data_lines)
                if payload == "[DONE]":
                    done = True
                    break
                try:
                    event = json.loads(payload)
                except json.JSONDecodeError as exc:
                    chars, args = counts()
                    raise CompatibleStreamError(
                        "malformed SSE data event",
                        discarded_text_chars=chars,
                        discarded_tool_argument_chars=args,
                    ) from exc
                if not isinstance(event, dict) or "error" in event:
                    chars, args = counts()
                    error = event.get("error") if isinstance(event, dict) else None
                    raw_code = error.get("code") if isinstance(error, dict) else None
                    code = raw_code if isinstance(raw_code, str) else None
                    if code in {"context_length_exceeded", "max_context_length_exceeded"}:
                        raise LLMContextLengthError(
                            f"{self.provider_name} context length exceeded in SSE stream",
                            provider=self.provider_name, model=self.model,
                            code="context_length_exceeded",
                        )
                    if code in {"invalid_request_error", "invalid_api_key", "insufficient_quota"}:
                        raise LLMRequestError(
                            f"{self.provider_name} SSE request rejected ({code})",
                            provider=self.provider_name, model=self.model, code=code,
                        )
                    raise CompatibleStreamError(
                        "terminal provider error in SSE stream",
                        discarded_text_chars=chars,
                        discarded_tool_argument_chars=args,
                    )
                if isinstance(event.get("usage"), dict):
                    usage = event["usage"]
                if isinstance(event.get("model"), str) and event["model"]:
                    served_model = event["model"]
                if isinstance(event.get("provider"), str) and event["provider"]:
                    upstream_provider = event["provider"]
                choices = event.get("choices")
                if not isinstance(choices, list):
                    continue
                for choice in choices:
                    if not isinstance(choice, dict):
                        continue
                    if choice.get("index", 0) != 0:
                        continue
                    delta = choice.get("delta")
                    substantive = False
                    delta_text_chars = delta_argument_chars = 0
                    if isinstance(delta, dict):
                        value = delta.get("content")
                        if isinstance(value, str) and value:
                            text_parts.append(value)
                            delta_text_chars += len(value)
                            substantive = True
                        value = delta.get("reasoning_content") or delta.get("reasoning")
                        if isinstance(value, str) and value:
                            reasoning_parts.append(value)
                            substantive = True
                        tool_deltas = delta.get("tool_calls", []) or []
                        if not isinstance(tool_deltas, list):
                            raise CompatibleStreamError("malformed tool-call delta list")
                        for tc in tool_deltas:
                            if not isinstance(tc, dict) or type(tc.get("index")) is not int:
                                raise CompatibleStreamError("malformed tool-call delta index")
                            pending = calls.setdefault(tc["index"], {
                                "id": "", "type": "function",
                                "function": {"name": "", "arguments": ""},
                            })
                            if isinstance(tc.get("id"), str):
                                pending["id"] += tc["id"]
                                substantive |= bool(tc["id"])
                            fn = tc.get("function")
                            if isinstance(fn, dict):
                                for key in ("name", "arguments"):
                                    fragment = fn.get(key)
                                    if isinstance(fragment, str):
                                        pending["function"][key] += fragment
                                        substantive |= bool(fragment)
                                        if key == "arguments":
                                            delta_argument_chars += len(fragment)
                    if substantive:
                        emit_progress(
                            observer, GenerationProgress(
                                "substantive", self.provider_name, text_chars=delta_text_chars,
                                tool_argument_chars=delta_argument_chars,
                            )
                        )
                    reason = choice.get("finish_reason")
                    if isinstance(reason, str) and reason:
                        if reason == "error":
                            chars, args = counts()
                            raise CompatibleStreamError(
                                "terminal provider error in SSE stream",
                                discarded_text_chars=chars, discarded_tool_argument_chars=args,
                            )
                        finish_reason = reason
            if done:
                break

        if not done and buffer.strip():
            chars, args = counts()
            raise CompatibleStreamError(
                "premature EOF in partial SSE frame",
                discarded_text_chars=chars,
                discarded_tool_argument_chars=args,
            )
        if not done or finish_reason is None:
            chars, args = counts()
            raise CompatibleStreamError(
                "premature EOF before terminal stream completion",
                discarded_text_chars=chars,
                discarded_tool_argument_chars=args,
            )
        result: dict = {
            "choices": [{
                "message": {
                    "content": "".join(text_parts),
                    "reasoning_content": "".join(reasoning_parts),
                    "tool_calls": [calls[index] for index in sorted(calls)],
                },
                "finish_reason": finish_reason,
            }],
        }
        if usage is not None:
            result["usage"] = usage
        if served_model is not None:
            result["model"] = served_model
        if upstream_provider is not None:
            result["provider"] = upstream_provider
        return result

    @leased_call
    async def chat(
        self,
        messages: list[dict],
        system: str,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        body = {
            "model": self.model
            if self.tool_quirks.get("ignore_request_model")
            else (model or self.model),
            "messages": self._convert_messages(messages, system),
            "max_tokens": self._request_max_tokens(max_tokens, model=model or self.model),
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        temperature = self._resolve_temperature(None)
        if temperature is not None:
            body["temperature"] = temperature
        self._apply_reasoning(body, None)
        self._apply_openrouter_routing(body, has_tools=False)
        data = await self._request_with_retry(body)
        parsed = self._parse_response(data)
        self._last_input_tokens = parsed.input_tokens
        self._last_output_tokens = parsed.output_tokens
        self._last_cached_tokens = parsed.cached_tokens
        self._last_actual_cost_usd = parsed.actual_cost_usd
        upstream = data.get("provider")
        self._last_upstream_provider = (
            upstream if isinstance(upstream, str) and upstream else None
        )
        choices = data.get("choices", [])
        if not choices:
            return ""
        return choices[0].get("message", {}).get("content", "") or ""

    @leased_call
    async def chat_with_tools(
        self,
        messages: list[dict],
        system: str,
        tools: list[dict],
        *,
        reasoning_effort: str | None = None,
        model: str | None = None,  # signature parity; Codex-scoped override, ignored
        progress_observer: GenerationProgressObserver | None = None,
        **kwargs,
    ) -> LLMResponse:
        adapted_system = system + self.tool_quirks.get("tool_enforcement", "")
        converted_messages = self._convert_messages(messages, adapted_system)
        converted_tools = self._convert_tools(tools)
        # Pre-await local: body and response provenance share one snapshot
        # (self.model is live-reloadable; never re-read it after network I/O).
        resolved_model = (
            self.model if self.tool_quirks.get("ignore_request_model") else (model or self.model)
        )
        body = {
            "model": resolved_model,
            "messages": converted_messages,
            "tools": converted_tools,
            "tool_choice": "auto",
            "max_tokens": self._request_max_tokens(model=resolved_model),
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        temperature = self._resolve_temperature(None)
        if temperature is not None:
            body["temperature"] = temperature
        self._apply_reasoning(
            body,
            reasoning_effort,
            thinking_mode=kwargs.get("thinking_mode"),
            apply_reasoning=kwargs.get("apply_reasoning", True),
        )
        self._apply_openrouter_routing(body, has_tools=bool(converted_tools))
        log.debug(
            "%s request: %d messages, %d tools, model=%s",
            self.provider_name,
            len(converted_messages),
            len(converted_tools),
            resolved_model,
        )
        try:
            if progress_observer is None:
                data = await self._request_with_retry(body)
            else:
                data = await self._request_with_retry(body, progress_observer=progress_observer)
        except RuntimeError as e:
            if "tokenization" in str(e).lower():
                log.error(
                    "%s tokenization failed: %d messages, %d tools, model=%s",
                    self.provider_name,
                    len(converted_messages),
                    len(converted_tools),
                    resolved_model,
                )
            raise
        resp = self._parse_response(data)
        resp.provenance_provider = self.provider_name
        served_model = data.get("model")
        resp.provenance_model = (
            served_model if isinstance(served_model, str) and served_model else resolved_model
        )
        resp.provenance_reasoning_effort = reasoning_effort
        upstream = data.get("provider")
        resp.provenance_upstream_provider = (
            upstream if isinstance(upstream, str) and upstream else None
        )
        # _parse_response strictly distinguishes absent/malformed usage from
        # provider truth; zero remains a valid reported value.
        return resp

    def _parse_response(self, data: dict) -> LLMResponse:
        """Parse OpenAI-format response into LLMResponse."""
        # Older integrations called this as
        # ``OpenAICompatibleClient._parse_response(None, payload)`` while it
        # was a static parsing seam.  Retain that narrow compatibility path,
        # but do not turn normal client parsing into a best-effort operation:
        # an actual instance still uses its configured reasoning policy and
        # provider-specific safe tool-call IDs below.
        legacy_seam = self is None
        choices = data.get("choices", [])
        if not choices:
            raise LLMRequestError(
                "openai-compatible returned no choices",
                provider="openai_compatible" if legacy_seam else self.provider_name,
                model=None if legacy_seam else self.model,
                code="empty_response",
            )

        message = choices[0].get("message", {})
        text = message.get("content", "") or ""
        # Reasoning is excluded by default. Preserved-thinking profiles opt in.
        if not isinstance(text, str):
            text = ""
        finish_reason = choices[0].get("finish_reason", "stop")
        if finish_reason == "length":
            raise LLMRequestError(
                "openai-compatible output truncated (finish_reason=length)",
                provider="openai_compatible" if legacy_seam else self.provider_name,
                model=None if legacy_seam else self.model,
                code="output_truncated",
            )

        tool_calls = []
        for tc in message.get("tool_calls", []) or []:
            fn = tc.get("function", {})
            args_raw = fn.get("arguments", "{}")
            args, parse_error = parse_tool_arguments(args_raw)
            tool_calls.append(
                ToolCall(
                    id=(
                        tc.get("id")
                        if legacy_seam and isinstance(tc.get("id"), str)
                        else f"call_{uuid.uuid4().hex[:12]}"
                        if legacy_seam
                        else self._safe_tool_call_id(tc.get("id"))
                    ),
                    name=fn.get("name", ""),
                    input=args,
                    parse_error=parse_error,
                )
            )

        stop_reason = "tool_use" if finish_reason == "tool_calls" or tool_calls else "end_turn"

        usage = data.get("usage", {})
        raw_input = usage.get("prompt_tokens") if isinstance(usage, dict) else None
        raw_output = usage.get("completion_tokens") if isinstance(usage, dict) else None
        server_input = raw_input if type(raw_input) is int and raw_input >= 0 else None
        server_output = raw_output if type(raw_output) is int and raw_output >= 0 else None

        details = (
            usage.get("prompt_tokens_details", usage.get("input_tokens_details", {}))
            if isinstance(usage, dict)
            else {}
        )
        raw_cached = details.get("cached_tokens") if isinstance(details, dict) else None
        if raw_cached is None and isinstance(usage, dict):
            raw_cached = usage.get("prompt_cache_hit_tokens")
        cached = raw_cached if type(raw_cached) is int and raw_cached >= 0 else None
        raw_written = details.get("cache_write_tokens") if isinstance(details, dict) else None
        written = raw_written if type(raw_written) is int and raw_written >= 0 else None
        raw_cost = usage.get("cost") if isinstance(usage, dict) else None
        output_details = usage.get("completion_tokens_details") if isinstance(usage, dict) else None
        raw_reasoning = (
            output_details.get("reasoning_tokens") if isinstance(output_details, dict) else None
        )
        try:
            actual_cost = (
                None
                if raw_cost is None or isinstance(raw_cost, bool)
                else float(raw_cost)
            )
        except (TypeError, ValueError):
            actual_cost = None
        if actual_cost is not None and (actual_cost < 0 or not math.isfinite(actual_cost)):
            actual_cost = None
        if not text.strip() and not tool_calls:
            raise LLMRequestError(
                f"openai-compatible returned no text or tool calls (finish_reason={finish_reason})",
                provider="openai_compatible" if legacy_seam else self.provider_name,
                model=None if legacy_seam else self.model,
                code="empty_response",
            )

        reasoning_content = message.get("reasoning_content")
        if (
            legacy_seam
            or not self._preserves_reasoning_content()
            or not isinstance(reasoning_content, str)
        ):
            reasoning_content = None
        return LLMResponse(
            text=text,
            reasoning_content=reasoning_content,
            tool_calls=tool_calls,
            stop_reason=stop_reason,
            input_tokens=server_input or 0,
            output_tokens=server_output or 0,
            server_input_tokens=server_input,
            server_output_tokens=server_output,
            input_token_provenance=("provider_reported" if server_input is not None else "unknown"),
            output_token_provenance=(
                "provider_reported" if server_output is not None else "unknown"
            ),
            cached_tokens=cached,
            cache_write_tokens=written,
            actual_cost_usd=actual_cost,
            reasoning_tokens=(
                raw_reasoning if type(raw_reasoning) is int and raw_reasoning >= 0 else None
            ),
        )

    @leased_call
    async def health_check(self) -> dict:
        """Check whether the configured API is reachable by listing models."""
        try:
            session = await self._get_session()
            async with session.get(
                f"{self.base_url}/models",
                headers=self._headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 401:
                    return {"healthy": False, "error": "Invalid API key"}
                if resp.status != 200:
                    return {"healthy": False, "error": f"HTTP {resp.status}"}
                data = await resp.json()
                records = data.get("data", []) if isinstance(data, dict) else []
                models = [
                    m.get("id", "")
                    for m in records
                    if isinstance(m, dict) and isinstance(m.get("id"), str)
                ]
                return {
                    "healthy": True,
                    "base_url": self.base_url,
                    "models": models,
                    "model_available": self.model in models,
                    "active_model": self.model,
                }
        except Exception as e:
            return {"healthy": False, "error": str(e)}


class DeepSeekClient(OpenAICompatibleClient):
    """DeepSeek preset without duplicating the compatible transport."""

    def __init__(self, api_key: str, model: str = "deepseek-chat", **kwargs) -> None:
        super().__init__(
            api_key,
            model=model,
            base_url=DEEPSEEK_API_URL,
            provider_name="deepseek",
            context_overflow_pattern=_DEEPSEEK_CONTEXT_LIMIT_RE.pattern,
            reasoning_dialect="thinking_type",
            **kwargs,
        )

    def _request_max_tokens(
        self, requested: int | None = None, *, model: str | None = None
    ) -> int:
        configured = super()._request_max_tokens(requested, model=model)
        if configured < DEEPSEEK_REASONING_OUTPUT_FLOOR:
            log.warning(
                "DeepSeek max_tokens=%d is below the reasoning-output floor of %d; "
                "raising it to avoid an empty final response after reasoning",
                configured,
                DEEPSEEK_REASONING_OUTPUT_FLOOR,
            )
            return DEEPSEEK_REASONING_OUTPUT_FLOOR
        return configured
