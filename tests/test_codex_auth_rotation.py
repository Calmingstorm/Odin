"""Tests for 401/invalidated-token account rotation in CodexAuthPool.

The pool rotates on rate-limits (429) via mark_current_limited. These tests
cover the new event-driven rotation on auth failure (401/invalidated token):
skip the failed account to the next healthy one, set the bad account aside with
a longer backoff (so it isn't thrashed), and surface the error only when there
is no other account.
"""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

from src.llm.codex_auth import AUTH_FAILED_BACKOFF_SECONDS, CodexAuth, CodexAuthPool


def _pool(n: int) -> CodexAuthPool:
    pool = CodexAuthPool.__new__(CodexAuthPool)
    pool._accounts = []
    for i in range(n):
        acct = MagicMock(spec=CodexAuth)
        acct._load.return_value = {"email": f"acct{i}@example.com"}
        pool._accounts.append(acct)
    pool._current_index = 0
    pool._pool_lock = asyncio.Lock()
    return pool


async def test_auth_failed_rotates_to_next_account():
    pool = _pool(3)
    rotated = await pool.mark_current_auth_failed()
    assert rotated is True
    assert pool._current_index == 1  # skipped to the next account
    # The failed account was set aside with the long auth-failed backoff
    # (NOT the 60s rate-limit window) so it isn't retried constantly.
    pool._accounts[0].mark_rate_limited.assert_called_once_with(AUTH_FAILED_BACKOFF_SECONDS)
    # Healthy accounts are untouched.
    pool._accounts[1].mark_rate_limited.assert_not_called()


async def test_auth_failed_single_account_surfaces_error():
    pool = _pool(1)
    rotated = await pool.mark_current_auth_failed()
    assert rotated is False  # nothing to rotate to -> caller raises
    assert pool._current_index == 0
    pool._accounts[0].mark_rate_limited.assert_called_once_with(AUTH_FAILED_BACKOFF_SECONDS)


async def test_auth_failed_empty_pool_is_safe():
    pool = _pool(0)
    assert await pool.mark_current_auth_failed() is False


async def test_single_codexauth_cannot_rotate():
    auth = CodexAuth.__new__(CodexAuth)
    assert await auth.mark_current_auth_failed() is False


def test_mark_rate_limited_accepts_custom_window():
    auth = CodexAuth.__new__(CodexAuth)
    auth.mark_rate_limited(AUTH_FAILED_BACKOFF_SECONDS)
    assert auth.is_rate_limited() is True
    # Default still works (backward compatible).
    auth2 = CodexAuth.__new__(CodexAuth)
    auth2.mark_rate_limited()
    assert auth2.is_rate_limited() is True


async def test_pool_exhaustion_is_typed_rate_limit():
    """Review blocker #7 (PR #242): all-accounts-rate-limited must raise
    LLMRateLimitError (fast-fail at the recovery layer, never an
    unclassified defect), with the historical message preserved."""
    import pytest

    from src.llm.errors import LLMRateLimitError

    pool = _pool(2)
    for acct in pool._accounts:
        acct.is_rate_limited.return_value = True
    with pytest.raises(LLMRateLimitError) as exc_info:
        await pool.acquire()
    assert "rate-limited or backing off" in str(exc_info.value)
    assert exc_info.value.provider == "codex"


async def test_pool_exhaustion_all_failed_is_typed_auth():
    import pytest

    from src.llm.errors import LLMAuthError

    async def boom():
        raise RuntimeError("refresh dead")

    pool = _pool(2)
    for acct in pool._accounts:
        acct.is_rate_limited.return_value = False
        acct.get_access_token.side_effect = boom
    with pytest.raises(LLMAuthError) as exc_info:
        await pool.acquire()
    assert "accounts failed" in str(exc_info.value)


async def test_empty_pool_is_typed_auth():
    import pytest

    from src.llm.errors import LLMAuthError

    pool = _pool(0)
    with pytest.raises(LLMAuthError):
        await pool.acquire()
