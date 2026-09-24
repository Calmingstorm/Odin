"""Background, read-only quota refreshes for idle Codex accounts."""
from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Callable

import aiohttp

from .account_key import opaque_account_key
from .codex_auth import CodexAuthPool
from .openai_codex import CODEX_API_URL, CodexChatClient

_INTERVAL_SECONDS = 15 * 60
_REQUEST_TIMEOUT_SECONDS = 12
_CHECK_BODY = {
    "model": "gpt-6-luna",
    "instructions": "Reply with one word.",
    "input": [{
        "type": "message",
        "role": "user",
        "content": [{"type": "input_text", "text": "quota"}],
    }],
    "store": False,
    "stream": True,
    "reasoning": {"effort": "none"},
}


class CodexQuotaCheckService:
    """Periodically check stale account quota using a pinned minimal request.

    It deliberately does not consume response bodies or use the Codex chat
    retry/failover machinery. The only pool writes are quota headers and the
    per-account display failure state.
    """

    def __init__(self, get_pool: Callable[[], CodexAuthPool | None], *,
                 interval: float = _INTERVAL_SECONDS,
                 timeout: float = _REQUEST_TIMEOUT_SECONDS) -> None:
        self.get_pool = get_pool
        self.interval = interval
        self.timeout = timeout
        self._session: aiohttp.ClientSession | None = None
        self._task: asyncio.Task | None = None
        self._closed = False

    async def start(self) -> None:
        if self._closed:
            return
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="codex-quota-check")

    async def close(self) -> None:
        self._closed = True
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        if self._session is not None and not self._session.closed:
            await self._session.close()

    async def _run(self) -> None:
        while not self._closed:
            try:
                await self.check_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                # A transient check must not kill the application service.
                pass
            try:
                await asyncio.sleep(self.interval)
            except asyncio.CancelledError:
                raise

    async def check_once(self) -> None:
        """Refresh accounts without quota data from the last 15 minutes."""
        pool = self.get_pool()
        if pool is None:
            return
        now = pool.quota._clock()
        for index in range(pool.account_count):
            if self.get_pool() is not pool:
                return
            # Configured slots only. This query is read-only and does not
            # choose, rotate, or activate an account.
            account = pool.describe_accounts()[index]
            if not account.get("configured"):
                continue
            key = account.get("key")
            previous = pool.quota.snapshot_for(key)
            if previous is not None and now - previous.observed_at < self.interval:
                continue
            request_started = False
            try:
                token, account_id = await pool.token_for(index)
                if self.get_pool() is not pool:
                    return
                key = opaque_account_key(account_id)
                if not key:
                    pool.set_quota_check_failure(index, "account identity unavailable")
                    continue
                if self._session is None or self._session.closed:
                    self._session = aiohttp.ClientSession(
                        auto_decompress=False, headers={"Accept-Encoding": "identity"},
                    )
                request_started = True
                async with self._session.post(
                    CODEX_API_URL,
                    headers={**CodexChatClient._auth_headers(token, account_id),
                             "Accept-Encoding": "identity"},
                    json=_CHECK_BODY,
                    timeout=aiohttp.ClientTimeout(total=self.timeout),
                ) as response:
                    if self.get_pool() is not pool:
                        return
                    pool.quota.record_headers(key, response.headers)
                    if 200 <= response.status < 300:
                        pool.set_quota_check_failure(index, None)
                    else:
                        pool.set_quota_check_failure(index, f"HTTP {response.status}")
                    # Do not read the stream. Quota is in the response headers.
            except asyncio.CancelledError:
                raise
            except Exception:
                # Keep this display-safe: exception text can contain upstream
                # content or credential-adjacent details.
                reason = "request failed" if request_started else "credential refresh failed"
                if self.get_pool() is pool:
                    pool.set_quota_check_failure(index, reason)
