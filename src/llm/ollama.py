"""Ollama LLM client — local/remote Ollama instances.

Implements the LLMProvider interface for Ollama's native /api/chat endpoint.
Uses native format (not /v1 compat) for reliable tool calling.
Supports tool calling for models that advertise it (Qwen, Llama 3.1+, etc.).
"""
from __future__ import annotations

import asyncio
import json
import uuid

import aiohttp

from ..odin_log import get_logger
from .backoff import compute_backoff, DEFAULT_MAX_RETRIES, DEFAULT_BASE_DELAY, DEFAULT_MAX_DELAY
from .circuit_breaker import CircuitBreaker
from .cost_tracker import estimate_tokens
from .provider import LLMProvider
from .types import LLMResponse, ToolCall

log = get_logger("ollama")


class OllamaClient(LLMProvider):
    """Chat client for Ollama instances (local or remote)."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:11434",
        model: str = "llama3.1:8b",
        max_tokens: int = 4096,
        timeout: int = 300,
        api_key: str = "",
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_base_delay: float = DEFAULT_BASE_DELAY,
        retry_max_delay: float = DEFAULT_MAX_DELAY,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.api_key = api_key
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay
        self.retry_max_delay = retry_max_delay
        self.breaker = CircuitBreaker("ollama_api")
        self._session: aiohttp.ClientSession | None = None
        self._total_requests: int = 0

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

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
            "provider": "ollama",
            "base_url": self.base_url,
            "model": self.model,
            "total_requests": self._total_requests,
        }

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        return self.model

    def _convert_messages(self, messages: list[dict], system: str) -> list[dict]:
        """Convert internal (Anthropic-style block) messages to Ollama /api/chat format.

        Assistant ``tool_use`` blocks become native Ollama ``tool_calls`` and
        ``tool_result`` blocks become ``role:"tool"`` messages, so multi-turn tool
        loops preserve the assistant's prior tool calls and their results across
        iterations. (Previously tool_use blocks were dropped and tool results were
        flattened to plain user text, so the second tool iteration lost all history.)
        """
        ollama_messages: list[dict] = []
        if system:
            ollama_messages.append({"role": "system", "content": system})

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            # Plain (non-block) content.
            if not isinstance(content, list):
                if role in ("tool", "tool_result"):
                    ollama_messages.append({
                        "role": "tool",
                        "content": content if isinstance(content, str) else json.dumps(content),
                    })
                else:
                    ollama_messages.append({
                        "role": "assistant" if role == "assistant" else "user",
                        "content": content,
                    })
                continue

            # Anthropic-style block content.
            text_parts: list[str] = []
            images: list[str] = []
            tool_calls: list[dict] = []
            tool_result_msgs: list[dict] = []
            for block in content:
                if isinstance(block, str):
                    text_parts.append(block)
                    continue
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "text":
                    text_parts.append(block.get("text", ""))
                elif btype == "image":
                    source = block.get("source", {})
                    if source.get("type") == "base64":
                        images.append(source.get("data", ""))
                elif btype == "tool_use":
                    args = block.get("input", {})
                    tool_calls.append({
                        "function": {
                            "name": block.get("name", ""),
                            "arguments": args if isinstance(args, dict) else {"raw": args},
                        }
                    })
                elif btype == "tool_result":
                    rc = block.get("content", "")
                    tool_result_msgs.append({
                        "role": "tool",
                        "content": rc if isinstance(rc, str) else json.dumps(rc),
                    })

            if role == "assistant":
                entry: dict = {"role": "assistant", "content": "\n".join(text_parts)}
                if tool_calls:
                    entry["tool_calls"] = tool_calls
                if images:
                    entry["images"] = images
                ollama_messages.append(entry)
            else:
                # User turn: tool results first (as role:"tool" messages), then text.
                ollama_messages.extend(tool_result_msgs)
                if text_parts or images:
                    entry = {"role": "user", "content": "\n".join(text_parts)}
                    if images:
                        entry["images"] = images
                    ollama_messages.append(entry)

        return ollama_messages

    def _convert_tools(self, tools: list[dict]) -> list[dict]:
        """Convert internal tool format to Ollama tool format."""
        ollama_tools = []
        for tool in tools:
            ollama_tools.append({
                "type": "function",
                "function": {
                    "name": tool.get("name", ""),
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema", tool.get("parameters", {})),
                },
            })
        return ollama_tools

    async def _request_with_retry(self, body: dict) -> dict:
        """Send a request to Ollama with retry logic."""
        self.breaker.check()
        session = await self._get_session()
        self._total_requests += 1
        url = f"{self.base_url}/api/chat"
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                async with session.post(url, json=body, headers=self._headers()) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        self.breaker.record_success()
                        return data
                    text = await resp.text()
                    if resp.status in (500, 502, 503, 504) and attempt < self.max_retries:
                        last_error = RuntimeError(f"Ollama {resp.status}: {text[:300]}")
                        delay = compute_backoff(attempt, self.retry_base_delay, self.retry_max_delay)
                        log.warning("Ollama %d (attempt %d/%d), retrying in %.1fs",
                                    resp.status, attempt + 1, self.max_retries + 1, delay)
                        await asyncio.sleep(delay)
                        continue
                    self.breaker.record_failure()
                    raise RuntimeError(f"Ollama {resp.status}: {text[:500]}")
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                last_error = e
                self.breaker.record_failure()
                if attempt < self.max_retries:
                    delay = compute_backoff(attempt, self.retry_base_delay, self.retry_max_delay)
                    log.warning("Ollama connection error (attempt %d/%d): %s, retrying in %.1fs",
                                attempt + 1, self.max_retries + 1, e, delay)
                    await asyncio.sleep(delay)
                    continue
                raise RuntimeError(f"Ollama connection error after {self.max_retries + 1} attempts: {e}") from e

        raise RuntimeError(f"Ollama request failed after {self.max_retries + 1} attempts: {last_error}")

    async def chat(
        self, messages: list[dict], system: str,
        max_tokens: int | None = None,
    ) -> str:
        body = {
            "model": self.model,
            "messages": self._convert_messages(messages, system),
            "stream": False,
            "options": {
                "num_predict": max_tokens or self.max_tokens,
            },
        }
        data = await self._request_with_retry(body)
        return data.get("message", {}).get("content", "")

    async def chat_with_tools(
        self, messages: list[dict], system: str,
        tools: list[dict],
    ) -> LLMResponse:
        body = {
            "model": self.model,
            "messages": self._convert_messages(messages, system),
            "tools": self._convert_tools(tools),
            "stream": False,
            "options": {
                "num_predict": self.max_tokens,
            },
        }
        data = await self._request_with_retry(body)
        return self._parse_response(data)

    def _parse_response(self, data: dict) -> LLMResponse:
        """Parse Ollama response into LLMResponse."""
        message = data.get("message", {})
        text = message.get("content", "")
        tool_calls_raw = message.get("tool_calls", [])

        tool_calls = []
        for tc in tool_calls_raw:
            fn = tc.get("function", {})
            args = fn.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except (json.JSONDecodeError, TypeError):
                    args = {"raw": args}
            tool_calls.append(ToolCall(
                id=f"ollama_{uuid.uuid4().hex[:12]}",
                name=fn.get("name", ""),
                input=args,
            ))

        stop_reason = "tool_use" if tool_calls else "end_turn"

        input_tokens = data.get("prompt_eval_count", 0) or 0
        output_tokens = data.get("eval_count", 0) or 0
        if not input_tokens:
            input_tokens = estimate_tokens(text) * 3
        if not output_tokens:
            output_tokens = estimate_tokens(text)

        return LLMResponse(
            text=text,
            tool_calls=tool_calls,
            stop_reason=stop_reason,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

    async def health_check(self) -> dict:
        """Check if the Ollama instance is reachable and list available models."""
        try:
            session = await self._get_session()
            async with session.get(
                f"{self.base_url}/api/tags",
                headers=self._headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    return {"healthy": False, "error": f"HTTP {resp.status}"}
                data = await resp.json()
                models = [m.get("name", "") for m in data.get("models", [])]
                model_available = self.model in models
                if not model_available:
                    base_name = self.model.split(":")[0]
                    model_available = any(m.startswith(base_name + ":") for m in models)
                return {
                    "healthy": True,
                    "base_url": self.base_url,
                    "models": models,
                    "model_available": model_available,
                    "active_model": self.model,
                }
        except Exception as e:
            return {"healthy": False, "error": str(e)}
