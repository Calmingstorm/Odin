"""Known Codex quota exhaustion influences automatic selection, not manual activation."""

import asyncio
import time
from unittest.mock import MagicMock

import pytest

from src.llm.codex_auth import CodexAuth, CodexAuthPool
from src.llm.codex_quota import CodexQuotaTracker
from src.llm.errors import LLMRateLimitError


def pool_with_accounts(count=3):
    pool = CodexAuthPool.__new__(CodexAuthPool)
    pool._accounts = []
    pool._current_index = 0
    pool._pool_lock = asyncio.Lock()
    pool.quota = CodexQuotaTracker()
    pool._quota_check_failures = {}
    for index in range(count):
        auth = MagicMock(spec=CodexAuth)
        auth.get_account_id.return_value = f"account-{index}"
        auth.get_access_token.return_value = f"token-{index}"
        auth.is_rate_limited.return_value = False
        auth._load.return_value = {"email": f"account-{index}@example.invalid"}
        pool._accounts.append(auth)
    return pool


def record(pool, index, used=100, reset=3600):
    from src.llm.account_key import opaque_account_key

    headers = {"x-codex-primary-used-percent": str(used),
               "x-codex-primary-reset-after-seconds": str(reset),
               "x-codex-primary-window-minutes": "300"}
    pool.quota.record_headers(opaque_account_key(f"account-{index}"), headers)


@pytest.mark.asyncio
async def test_skips_known_limited_when_acquiring_and_rotating():
    pool = pool_with_accounts()
    record(pool, 0)
    record(pool, 1)
    token, _, index = await pool.acquire()
    assert (token, index) == ("token-2", 2)
    assert pool._current_index == 2
    pool._current_index = 0
    await pool.mark_limited(0)
    assert pool._current_index == 2
    assert 3500 < pool._accounts[0].mark_rate_limited.call_args.args[0] <= 3600


@pytest.mark.asyncio
async def test_rotation_after_token_failure_skips_known_limited_account():
    pool = pool_with_accounts()
    record(pool, 1)
    pool._accounts[0].get_access_token.side_effect = RuntimeError("refresh failed")

    token, _, index = await pool.acquire()

    assert (token, index) == ("token-2", 2)
    assert pool._accounts[1].get_access_token.await_count == 0


def test_limited_accounts_are_not_advertised_as_eligible():
    pool = pool_with_accounts(2)
    record(pool, 0)
    assert pool.eligible_account_ids_snapshot() == frozenset({"account-1"})


@pytest.mark.asyncio
async def test_all_limited_is_the_same_typed_exhaustion_and_manual_activation_works():
    pool = pool_with_accounts(2)
    record(pool, 0)
    record(pool, 1)
    with pytest.raises(LLMRateLimitError, match="rate-limited or backing off"):
        await pool.acquire()
    await pool.set_active(1)
    assert pool._current_index == 1


@pytest.mark.asyncio
async def test_missing_or_expired_quota_remains_eligible():
    pool = pool_with_accounts(2)
    record(pool, 0, used=100, reset=0)
    assert (await pool.acquire())[2] == 0
    record(pool, 0, used=99, reset=3600)
    assert (await pool.acquire())[2] == 0
    record(pool, 0, used=100, reset=3600)
    assert pool._quota_reset(0, now=time.time() + 3601) is None
    pool._current_index = 1
    await pool.mark_limited(1)
    pool._accounts[1].mark_rate_limited.assert_called_once_with(60.0)


def test_limit_type_only_exhausts_the_matching_window():
    pool = pool_with_accounts(1)
    from src.llm.account_key import opaque_account_key

    pool.quota.record_headers(opaque_account_key("account-0"), {
        "x-codex-rate-limit-reached-type": "primary",
        "x-codex-primary-used-percent": "60",
        "x-codex-primary-reset-after-seconds": "900",
        "x-codex-secondary-used-percent": "20",
        "x-codex-secondary-reset-after-seconds": "3600",
    })
    snapshot = pool.quota.snapshot_for(opaque_account_key("account-0"))
    assert snapshot is not None
    assert pool._quota_reset(0, now=snapshot.observed_at) == snapshot.primary.resets_at


def test_check_failures_are_keyed_per_account_and_clearable():
    pool = pool_with_accounts(2)
    pool.set_quota_check_failure(0, "HTTP 401")
    assert pool.quota_check_failure(0) == "HTTP 401"
    assert pool.quota_check_failure(1) is None
    pool.set_quota_check_failure(0, None)
    assert pool.quota_check_failure(0) is None
