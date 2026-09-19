"""Configurable OpenAI-compatible chat-completions client."""

from __future__ import annotations

import asyncio
import json
import re
import uuid

import aiohttp

from ..odin_log import get_logger
from .backoff import DEFAULT_BASE_DELAY, DEFAULT_MAX_DELAY, DEFAULT_MAX_RETRIES, compute_backoff
from .circuit_breaker import CircuitBreaker
from .client_lifecycle import leased_call
from .errors import LLMContextLengthError, LLMRateLimitError, LLMRequestError, LLMTransportError
from .provider import LLMProvider
from .tool_history import parse_tool_arguments
from .types import LLMResponse, ToolCall

log = get_logger("kimi")

_DEEPSEEK_CONTEXT_LIMIT_RE = re.compile(
    r"^This model's maximum context length is (?P<limit>[1-9][0-9]*) tokens\."
)

KIMI_API_URL = "https://api.moonshot.ai/v1"
DEEPSEEK_API_URL = "https://api.deepseek.com/v1"

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
        base_url: str = KIMI_API_URL,
        provider_name: str = "openai_compatible",
        max_tokens: int = 4096,
        tool_quirks: dict | None = None,
        timeout: int = 300,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_base_delay: float = DEFAULT_BASE_DELAY,
        retry_max_delay: float = DEFAULT_MAX_DELAY,
        context_overflow_pattern: str | None = None,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._provider_name = provider_name
        self.model = model
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay
        self.retry_max_delay = retry_max_delay
        self._context_overflow_re = (
            re.compile(context_overflow_pattern) if context_overflow_pattern else None
        )
        self.tool_quirks = dict(tool_quirks or {})
        self.breaker = CircuitBreaker(f"{provider_name}_api")
        self._session: aiohttp.ClientSession | None = None
        self._total_requests: int = 0

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=self.timeout),
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
                        if self.tool_quirks.get("reasoning_content_placeholder"):
                            entry["reasoning_content"] = ""
                    oai_messages.append(entry)
                for tr in tool_results:
                    oai_messages.append(tr)
                continue

            if role == "developer":
                role = "system"
            entry = {"role": role, "content": str(content) if content else ""}
            if role == "assistant" and msg.get("tool_calls"):
                if self.tool_quirks.get("reasoning_content_placeholder"):
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
        """Sanitize a JSON Schema for Kimi's MFJS compliance."""
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
        """Convert internal tool format to Kimi MFJS-compliant format."""
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

    def _resolve_temperature(self, temperature: float | None) -> float:
        """Kimi temperature: K2.6 requires 1.0, others accept [0, 1]."""
        force_for = self.tool_quirks.get("force_temperature_model_substring")
        if force_for and force_for in self.model:
            return 1.0
        if temperature is None:
            return 0.6
        bounds = self.tool_quirks.get("temperature_range")
        return max(bounds[0], min(bounds[1], temperature)) if bounds else temperature

    async def _request_with_retry(self, body: dict) -> dict:
        """Send a request to Kimi with retry logic."""
        from ..observability.diagnostics import safe_error

        self.breaker.check()
        session = await self._get_session()
        self._total_requests += 1
        url = f"{self.base_url}/chat/completions"
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                async with session.post(url, json=body, headers=self._headers()) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        self.breaker.record_success()
                        return data

                    raw_text = await resp.text()
                    try:
                        error_body = json.loads(raw_text)
                    except (TypeError, ValueError):
                        error_body = None
                    error = (
                        error_body.get("error")
                        if isinstance(error_body, dict)
                        and isinstance(error_body.get("error"), dict)
                        else {}
                    )
                    error_code = error.get("code") if isinstance(error.get("code"), str) else None
                    error_message = (
                        error.get("message") if isinstance(error.get("message"), str) else ""
                    )
                    text = safe_error(raw_text)

                    if resp.status == 429:
                        if attempt >= self.max_retries:
                            self.breaker.record_failure()
                            hdr = resp.headers.get("Retry-After")
                            try:
                                hdr_delay = float(hdr) if hdr else None
                            except (ValueError, TypeError):
                                hdr_delay = None
                            raise LLMRateLimitError(
                                f"Kimi rate limited after {self.max_retries + 1} attempts: {text}",
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
                            "Kimi rate limited (attempt %d/%d), retrying in %.1fs",
                            attempt + 1,
                            self.max_retries + 1,
                            delay,
                        )
                        await asyncio.sleep(delay)
                        continue

                    if resp.status in (500, 502, 503, 504) and attempt < self.max_retries:
                        last_error = RuntimeError(f"Kimi {resp.status}: {text}")
                        delay = compute_backoff(
                            attempt,
                            self.retry_base_delay,
                            self.retry_max_delay,
                        )
                        log.warning(
                            "Kimi %d (attempt %d/%d), retrying in %.1fs",
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
                        f"Kimi {resp.status}: {text}",
                        provider=self.provider_name,
                        model=self.model,
                    )
            except (TimeoutError, aiohttp.ClientError) as e:
                last_error = e
                self.breaker.record_failure()
                if attempt < self.max_retries:
                    delay = compute_backoff(attempt, self.retry_base_delay, self.retry_max_delay)
                    log.warning(
                        "Kimi connection error (attempt %d/%d): %s, retrying in %.1fs",
                        attempt + 1,
                        self.max_retries + 1,
                        safe_error(e),
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                raise LLMTransportError(
                    f"Kimi connection error after {self.max_retries + 1} attempts: {safe_error(e)}",
                    provider=self.provider_name,
                    model=self.model,
                ) from None

        raise RuntimeError(
            f"Kimi request failed after {self.max_retries + 1} attempts: {safe_error(last_error)}"
        )

    @leased_call
    async def chat(
        self,
        messages: list[dict],
        system: str,
        max_tokens: int | None = None,
    ) -> str:
        body = {
            "model": self.model,
            "messages": self._convert_messages(messages, system),
            "max_tokens": max_tokens or self.max_tokens,
            "temperature": self._resolve_temperature(None),
        }
        data = await self._request_with_retry(body)
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
        reasoning_effort: str | None = None,  # signature parity; no effort concept
        model: str | None = None,  # signature parity; Codex-scoped override, ignored
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
            "max_tokens": self.max_tokens,
            "temperature": self._resolve_temperature(None),
        }
        log.debug(
            "Kimi request: %d messages, %d tools, model=%s",
            len(converted_messages),
            len(converted_tools),
            resolved_model,
        )
        try:
            data = await self._request_with_retry(body)
        except RuntimeError as e:
            if "tokenization" in str(e).lower():
                log.error(
                    "Kimi tokenization failed: %d messages, %d tools, model=%s",
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
        resp.provenance_reasoning_effort = None  # no effort concept
        # _parse_response strictly distinguishes absent/malformed usage from
        # provider truth; zero remains a valid reported value.
        return resp

    def _parse_response(self, data: dict) -> LLMResponse:
        """Parse OpenAI-format response into LLMResponse."""
        choices = data.get("choices", [])
        if not choices:
            return LLMResponse()

        message = choices[0].get("message", {})
        text = message.get("content", "") or ""
        # reasoning_content is deliberately excluded from answers and history.
        if not isinstance(text, str):
            text = ""
        finish_reason = choices[0].get("finish_reason", "stop")

        tool_calls = []
        for tc in message.get("tool_calls", []) or []:
            fn = tc.get("function", {})
            args_raw = fn.get("arguments", "{}")
            args, parse_error = parse_tool_arguments(args_raw)
            tool_calls.append(
                ToolCall(
                    id=tc.get("id", f"kimi_{uuid.uuid4().hex[:12]}"),
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
        if not text and not tool_calls:
            log.warning(
                "%s returned no text or tool calls (finish_reason=%s)",
                self.provider_name,
                finish_reason,
            )

        return LLMResponse(
            text=text,
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
        )

    @leased_call
    async def health_check(self) -> dict:
        """Check if the Kimi API is reachable by listing models."""
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
            **kwargs,
        )
