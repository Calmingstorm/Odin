"""Kimi (Moonshot AI) LLM client — OpenAI-compatible API.

Implements the LLMProvider interface for Kimi's chat completions endpoint.
Handles Kimi-specific quirks: temperature clamping [0,1], no tool_choice="required",
and prompt-level tool enforcement.
"""
from __future__ import annotations

import asyncio
import json
import uuid

import aiohttp

from ..odin_log import get_logger
from .backoff import compute_backoff, DEFAULT_MAX_RETRIES, DEFAULT_BASE_DELAY, DEFAULT_MAX_DELAY
from .circuit_breaker import CircuitBreaker
from .provider import LLMProvider
from .types import LLMResponse, ToolCall

log = get_logger("kimi")

KIMI_API_URL = "https://api.moonshot.ai/v1"

KIMI_TOOL_ENFORCEMENT = (
    "\n\nIMPORTANT: When a user request requires action, you MUST use the "
    "provided tools to fulfill it. Do not describe what you would do — "
    "call the appropriate tool directly."
)


class KimiClient(LLMProvider):
    """Chat client for Kimi (Moonshot AI) via OpenAI-compatible API."""

    def __init__(
        self,
        api_key: str,
        base_url: str = KIMI_API_URL,
        model: str = "kimi-k2.6",
        max_tokens: int = 4096,
        timeout: int = 300,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_base_delay: float = DEFAULT_BASE_DELAY,
        retry_max_delay: float = DEFAULT_MAX_DELAY,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay
        self.retry_max_delay = retry_max_delay
        self.breaker = CircuitBreaker("kimi_api")
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
            "provider": "kimi",
            "base_url": self.base_url,
            "model": self.model,
            "total_requests": self._total_requests,
        }

    @property
    def provider_name(self) -> str:
        return "kimi"

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
                oai_messages.append({
                    "role": "tool",
                    "tool_call_id": msg.get("tool_use_id", ""),
                    "content": json.dumps(content) if not isinstance(content, str) else content,
                })
                continue

            if isinstance(content, list):
                text_parts = []
                tool_calls = []
                tool_results = []
                for block in content:
                    if isinstance(block, dict):
                        if block.get("type") == "text":
                            text_parts.append(block["text"])
                        elif block.get("type") == "tool_use":
                            tool_calls.append({
                                "id": block.get("id", ""),
                                "type": "function",
                                "function": {
                                    "name": block.get("name", ""),
                                    "arguments": json.dumps(block.get("input", {})),
                                },
                            })
                        elif block.get("type") == "tool_result":
                            tr_content = block.get("content", "")
                            tool_results.append({
                                "role": "tool",
                                "tool_call_id": block.get("tool_use_id", ""),
                                "content": json.dumps(tr_content) if not isinstance(tr_content, str) else tr_content,
                            })
                    elif isinstance(block, str):
                        text_parts.append(block)

                if text_parts or tool_calls:
                    entry: dict = {"role": role, "content": "\n".join(text_parts) if text_parts else ""}
                    if tool_calls and role == "assistant":
                        entry["tool_calls"] = tool_calls
                        if not entry["content"]:
                            entry["content"] = ""
                    oai_messages.append(entry)
                for tr in tool_results:
                    oai_messages.append(tr)
                continue

            oai_messages.append({"role": role, "content": str(content) if content else ""})

        return oai_messages

    _MFJS_STRIP_KEYS = frozenset({
        "title", "$comment", "format", "prefixItems", "$defs",
        "$ref", "exclusiveMinimum", "exclusiveMaximum",
    })

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
                    self._sanitize_schema(item) if isinstance(item, dict) else item
                    for item in v
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
        if "k2.6" in self.model:
            return 1.0
        if temperature is None:
            return 0.6
        return max(0.0, min(1.0, temperature))

    async def _request_with_retry(self, body: dict) -> dict:
        """Send a request to Kimi with retry logic."""
        self.breaker.check()
        session = await self._get_session()
        self._total_requests += 1
        url = f"{self.base_url}/chat/completions"
        last_error = None

        for attempt in range(self.max_retries + 1):
            try:
                async with session.post(url, json=body, headers=self._headers()) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        self.breaker.record_success()
                        return data

                    text = await resp.text()

                    if resp.status == 429:
                        if attempt >= self.max_retries:
                            self.breaker.record_failure()
                            raise RuntimeError(f"Kimi rate limited after {self.max_retries + 1} attempts: {text[:300]}")
                        retry_after = resp.headers.get("Retry-After")
                        try:
                            delay = min(float(retry_after), self.retry_max_delay) if retry_after else compute_backoff(
                                attempt, self.retry_base_delay, self.retry_max_delay,
                            )
                        except (ValueError, TypeError):
                            delay = compute_backoff(attempt, self.retry_base_delay, self.retry_max_delay)
                        log.warning("Kimi rate limited (attempt %d/%d), retrying in %.1fs",
                                    attempt + 1, self.max_retries + 1, delay)
                        await asyncio.sleep(delay)
                        continue

                    if resp.status in (500, 502, 503, 504) and attempt < self.max_retries:
                        last_error = RuntimeError(f"Kimi {resp.status}: {text[:300]}")
                        delay = compute_backoff(attempt, self.retry_base_delay, self.retry_max_delay)
                        log.warning("Kimi %d (attempt %d/%d), retrying in %.1fs",
                                    resp.status, attempt + 1, self.max_retries + 1, delay)
                        await asyncio.sleep(delay)
                        continue

                    self.breaker.record_failure()
                    raise RuntimeError(f"Kimi {resp.status}: {text[:500]}")
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                last_error = e
                self.breaker.record_failure()
                if attempt < self.max_retries:
                    delay = compute_backoff(attempt, self.retry_base_delay, self.retry_max_delay)
                    log.warning("Kimi connection error (attempt %d/%d): %s, retrying in %.1fs",
                                attempt + 1, self.max_retries + 1, e, delay)
                    await asyncio.sleep(delay)
                    continue
                raise RuntimeError(f"Kimi connection error after {self.max_retries + 1} attempts: {e}") from e

        raise RuntimeError(f"Kimi request failed after {self.max_retries + 1} attempts: {last_error}")

    async def chat(
        self, messages: list[dict], system: str,
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

    async def chat_with_tools(
        self, messages: list[dict], system: str,
        tools: list[dict],
        **kwargs,
    ) -> LLMResponse:
        adapted_system = system + KIMI_TOOL_ENFORCEMENT
        converted_messages = self._convert_messages(messages, adapted_system)
        converted_tools = self._convert_tools(tools)
        body = {
            "model": self.model,
            "messages": converted_messages,
            "tools": converted_tools,
            "tool_choice": "auto",
            "max_tokens": self.max_tokens,
            "temperature": self._resolve_temperature(None),
        }
        log.debug("Kimi request: %d messages, %d tools, model=%s",
                  len(converted_messages), len(converted_tools), self.model)
        try:
            data = await self._request_with_retry(body)
        except RuntimeError as e:
            if "tokenization" in str(e).lower():
                import json as _j
                log.error("Kimi tokenization failed. Messages: %s",
                          _j.dumps([{k: (v[:200] if isinstance(v, str) else v) for k, v in m.items()} for m in converted_messages], indent=2, default=str))
            raise
        return self._parse_response(data)

    def _parse_response(self, data: dict) -> LLMResponse:
        """Parse OpenAI-format response into LLMResponse."""
        choices = data.get("choices", [])
        if not choices:
            return LLMResponse()

        message = choices[0].get("message", {})
        text = message.get("content", "") or ""
        finish_reason = choices[0].get("finish_reason", "stop")

        tool_calls = []
        for tc in message.get("tool_calls", []) or []:
            fn = tc.get("function", {})
            args_raw = fn.get("arguments", "{}")
            if isinstance(args_raw, str):
                try:
                    args = json.loads(args_raw)
                except (json.JSONDecodeError, TypeError):
                    args = {"raw": args_raw}
            else:
                args = args_raw
            tool_calls.append(ToolCall(
                id=tc.get("id", f"kimi_{uuid.uuid4().hex[:12]}"),
                name=fn.get("name", ""),
                input=args,
            ))

        stop_reason = "tool_use" if finish_reason == "tool_calls" or tool_calls else "end_turn"

        usage = data.get("usage", {})
        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)

        return LLMResponse(
            text=text,
            tool_calls=tool_calls,
            stop_reason=stop_reason,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

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
                models = [m.get("id", "") for m in data.get("data", [])]
                return {
                    "healthy": True,
                    "base_url": self.base_url,
                    "models": models,
                    "model_available": self.model in models,
                    "active_model": self.model,
                }
        except Exception as e:
            return {"healthy": False, "error": str(e)}
