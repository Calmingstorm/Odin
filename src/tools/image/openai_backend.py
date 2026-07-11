"""Native OpenAI image generation over the Codex ChatGPT OAuth backend.

Rides the SAME CodexAuthPool / current account Odin uses for chat (no separate
auth, subscription-quota-backed — the endpoint is private and quota-bearing,
NOT the public Images API). Isolated wire implementation with its own HTTP
transport, SSE parser, and circuit breaker so image failures never poison chat.

Hard rules enforced here:
- Once a request receives 2xx (an accepted response), the account is PINNED —
  no rotation, no retry, no ComfyUI fallback. Failover happens only on
  pre-generation failures (usage-limit / auth / pre-response transport).
- partial_image frames are discarded; exactly one terminal full image is
  required. Base64 length, decoded byte size, and PNG validity are all bounded.
- No token, account id, SSE body, base64 fragment, or raw payload is ever put
  in a log, exception message, or the returned result.
"""

from __future__ import annotations

import base64
import json
from collections.abc import Callable

import aiohttp

from ...llm.circuit_breaker import CircuitBreaker, CircuitOpenError
from ...odin_log import get_logger
from .base import (
    ImageBackend,
    ImageBackendUnavailableError,
    ImageQuotaError,
    ImageRequestError,
    ImageResult,
    ImageTransportError,
    png_dimensions,
)

log = get_logger("image.openai")

CODEX_IMAGE_URL = "https://chatgpt.com/backend-api/codex/responses"
_INSTRUCTIONS = "You are an image generation assistant. Produce exactly the requested image."


class OpenAIImageBackend(ImageBackend):
    name = "openai"

    def __init__(self, *, get_auth: Callable, get_config: Callable) -> None:
        # get_auth resolves the LIVE shared CodexAuthPool at CALL time (may
        # return None). A live Codex login/reload REPLACES the pool, so we must
        # never snapshot it here or the backend runs on stale/absent credentials.
        self._get_auth = get_auth
        self.get_config = get_config
        self.breaker = CircuitBreaker("codex_image")
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    @staticmethod
    def _headers(token: str, account_id: str | None) -> dict:
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        if account_id:
            headers["ChatGPT-Account-Id"] = account_id
        return headers

    @staticmethod
    def _body(icfg, prompt: str, size: str) -> dict:
        return {
            "model": icfg.openai.outer_model,
            "instructions": _INSTRUCTIONS,
            "input": [{"role": "user", "content": [{"type": "input_text", "text": prompt}]}],
            "tools": [
                {"type": "image_generation", "model": icfg.openai.image_model, "size": size}
            ],
            "tool_choice": {"type": "image_generation"},
            "stream": True,
            "store": False,
        }

    def is_configured(self) -> bool:
        pool = self._get_auth()
        return pool is not None and pool.is_configured()

    async def generate(
        self, *, prompt: str, size: str | None = None, **_ignored
    ) -> ImageResult:
        cfg = self.get_config()
        icfg = cfg.image
        if not icfg.openai.enabled:
            raise ImageBackendUnavailableError("Native OpenAI image backend is disabled")
        pool = self._get_auth()
        if pool is None or not pool.is_configured():
            raise ImageBackendUnavailableError("No Codex credentials for native image generation")

        size = size or icfg.openai.default_size
        if size not in icfg.openai.allowed_sizes:
            raise ImageRequestError(
                f"Unsupported size {size!r}. Allowed: {', '.join(icfg.openai.allowed_sizes)}"
            )

        # An open image breaker is pre-generation — let auto fall back to ComfyUI.
        try:
            self.breaker.check()
        except CircuitOpenError as e:
            raise ImageTransportError("image endpoint breaker open", pre_generation=True) from e

        body = self._body(icfg, prompt, size)
        session = await self._get_session()
        timeout = aiohttp.ClientTimeout(
            total=icfg.openai.request_timeout_seconds,
            sock_connect=icfg.openai.connect_timeout_seconds,
            sock_read=icfg.openai.stream_stall_timeout_seconds,
        )

        # Failover across accounts ONLY on pre-generation failures. The loop is
        # bounded by the account count; once a POST returns 200 we commit.
        attempts = max(1, pool.account_count)
        last_err: ImageQuotaError | ImageTransportError | None = None
        for _attempt in range(attempts):
            try:
                token, account_id, idx = await pool.acquire()
            except RuntimeError:
                # Pool exhausted / no healthy account — pre-generation, so auto
                # can fall back to ComfyUI. Never surface the raw pool error.
                last_err = ImageQuotaError("no healthy Codex account for image generation")
                break
            committed = False
            try:
                async with session.post(
                    CODEX_IMAGE_URL,
                    headers=self._headers(token, account_id),
                    json=body,
                    timeout=timeout,
                ) as resp:
                    if resp.status == 200:
                        # Accepted — PINNED. Everything from here (stream AND the
                        # response context manager's own cleanup) is
                        # post-generation: no failover, no fallback.
                        committed = True
                        result = await self._read_stream(resp, icfg)
                        self.breaker.record_success()
                        return result

                    if resp.status == 429:
                        await pool.mark_limited(idx)
                        last_err = ImageQuotaError("usage limit reached (HTTP 429)")
                        continue
                    if resp.status == 401:
                        await pool.mark_auth_failed(idx)
                        last_err = ImageQuotaError("account authentication failed (HTTP 401)")
                        continue
                    if resp.status in (500, 502, 503, 504):
                        # Endpoint health — this one counts against the breaker.
                        self.breaker.record_failure()
                        last_err = ImageTransportError(f"image endpoint HTTP {resp.status}")
                        continue
                    # Other 4xx: request-level (bad params / content policy). Do
                    # NOT fail over, fall back, OR poison the shared breaker — a
                    # bad prompt must not disable image generation for everyone.
                    raise ImageRequestError(f"image request rejected (HTTP {resp.status})")
            except (TimeoutError, aiohttp.ClientError) as e:
                if committed:
                    # A 200 was accepted; this is the response context manager's
                    # own cleanup failing AFTER the image was produced. Pinned —
                    # never fail over (that would generate twice). The endpoint
                    # was healthy, so don't count it against the breaker either.
                    raise ImageTransportError(
                        f"image response cleanup error: {type(e).__name__}",
                        pre_generation=False,
                    ) from e
                # Pre-response transport failure (connection/handshake) — a
                # mid-stream break after 200 is caught inside _read_stream and
                # re-raised as a non-failover ImageTransportError instead.
                self.breaker.record_failure()
                last_err = ImageTransportError(f"image request transport error: {type(e).__name__}")
                continue

        if last_err is not None:
            raise last_err
        raise ImageQuotaError("no healthy Codex account for image generation")

    async def _read_stream(self, resp: aiohttp.ClientResponse, icfg) -> ImageResult:
        """Parse the SSE stream and return the single terminal image.

        Reads raw chunks and splits lines manually — aiohttp's default readline
        caps a line at ~512KB and the base64 image lines exceed that.
        """
        max_bytes = icfg.openai.max_image_bytes
        max_b64 = max_bytes * 4 // 3 + 8
        # A single legitimate line is one base64 image plus a little JSON/SSE
        # framing; anything past that with no newline is an unterminated frame
        # and must be rejected BEFORE it is fully buffered into memory.
        max_line = max_b64 + 65536
        final_b64: str | None = None
        buf = b""
        try:
            async for chunk in resp.content.iter_chunked(65536):
                buf += chunk
                while b"\n" in buf:
                    raw, buf = buf.split(b"\n", 1)
                    line = raw.strip()
                    if not line.startswith(b"data:"):
                        continue
                    data = line[5:].strip()
                    if data == b"[DONE]":
                        buf = b""
                        break
                    try:
                        ev = json.loads(data)
                    except (ValueError, TypeError):
                        continue
                    t = ev.get("type", "")
                    if t == "response.image_generation_call.partial_image":
                        continue  # discard partial previews in v1
                    if t in (
                        "response.image_generation_call.completed",
                        "response.image_generation_call.done",
                    ):
                        for key in ("b64_json", "result", "image_b64"):
                            v = ev.get(key)
                            if isinstance(v, str) and len(v) > 100:
                                final_b64 = v
                    if t in ("response.output_item.done", "response.completed"):
                        item = ev.get("item") or {}
                        if item.get("type") == "image_generation_call" and isinstance(
                            item.get("result"), str
                        ):
                            final_b64 = item["result"]
                        for out in (ev.get("response") or {}).get("output", []) or []:
                            if out.get("type") == "image_generation_call" and isinstance(
                                out.get("result"), str
                            ):
                                final_b64 = out["result"]
                    if t in ("response.failed", "error", "response.error"):
                        raise ImageRequestError("image generation failed upstream")
                    if final_b64 is not None and len(final_b64) > max_b64:
                        raise ImageRequestError("generated image exceeds the configured size cap")
                # Complete lines are drained above; a leftover past one max line
                # is an unterminated frame — reject before buffering more.
                if len(buf) > max_line:
                    raise ImageRequestError("unterminated oversized SSE frame")
        except (TimeoutError, aiohttp.ClientError) as e:
            # Mid-stream break AFTER a 200 — post-generation, no failover.
            self.breaker.record_failure()
            raise ImageTransportError(
                f"image stream error: {type(e).__name__}", pre_generation=False
            ) from e

        if not final_b64:
            raise ImageRequestError("no image returned in the response")
        try:
            data = base64.b64decode(final_b64, validate=True)
        except (ValueError, TypeError) as e:
            raise ImageRequestError("malformed image data") from e
        if len(data) > max_bytes:
            raise ImageRequestError("generated image exceeds the configured size cap")
        dims = png_dimensions(data)
        if not dims:
            raise ImageRequestError("image output is not a valid PNG")
        return ImageResult(
            data=data,
            mime="image/png",
            width=dims[0],
            height=dims[1],
            backend="openai",
            image_model=icfg.openai.image_model,
        )
