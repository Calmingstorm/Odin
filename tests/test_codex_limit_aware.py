"""Known Codex quota exhaustion influences automatic selection, not manual activation."""

import asyncio
import json
import time
from unittest.mock import MagicMock

import pytest

from src.llm.codex_auth import CodexAuth, CodexAuthPool
from src.llm.codex_quota import CodexQuotaTracker


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


@pytest.mark.asyncio
async def test_unreadable_account_fails_over_and_records_only_that_failure():
    pool = pool_with_accounts(2)
    pool._accounts[0].get_access_token.side_effect = OSError("credential file unreadable")

    token, account_id, index = await pool.acquire()

    assert (token, account_id, index) == ("token-1", "account-1", 1)
    pool._accounts[0].mark_rate_limited.assert_called_once()
    pool._accounts[1].mark_rate_limited.assert_not_called()


@pytest.mark.asyncio
async def test_cancelled_quota_failover_does_not_bench_next_account():
    pool = pool_with_accounts(2)
    pool._accounts[0].get_access_token.side_effect = OSError("unreadable credentials")
    pool._accounts[1].get_access_token.side_effect = asyncio.CancelledError

    with pytest.raises(asyncio.CancelledError):
        await pool.acquire()

    pool._accounts[0].mark_rate_limited.assert_called_once()
    pool._accounts[1].mark_rate_limited.assert_not_called()


@pytest.mark.asyncio
async def test_manual_account_unreadable_clears_override_and_fails_over():
    pool = pool_with_accounts(2)
    pool._manual_active_index = 0
    pool._accounts[0].get_access_token.side_effect = OSError("credential file unreadable")

    token, account_id, index = await pool.acquire()

    assert (token, account_id, index) == ("token-1", "account-1", 1)
    assert pool._manual_active_index is None
    pool._accounts[0].mark_rate_limited.assert_called_once()


@pytest.mark.asyncio
async def test_all_quota_exhausted_fallback_still_asks_upstream():
    pool = pool_with_accounts(2)
    record(pool, 0)
    record(pool, 1)

    token, account_id, index = await pool.acquire()

    assert (token, account_id, index) == ("token-0", "account-0", 0)
    pool._accounts[1].get_access_token.assert_not_awaited()


@pytest.mark.asyncio
async def test_all_quota_exhausted_upstream_failure_is_reported():
    pool = pool_with_accounts(1)
    record(pool, 0)
    pool._accounts[0].get_access_token.side_effect = OSError("credential file unreadable")

    with pytest.raises(Exception, match="All 1 Codex accounts failed"):
        await pool.acquire()


@pytest.mark.asyncio
async def test_invalid_manual_index_is_discarded_before_normal_selection():
    pool = pool_with_accounts(1)
    pool._manual_active_index = 4

    assert (await pool.acquire())[2] == 0
    assert pool._manual_active_index is None


@pytest.mark.asyncio
async def test_single_account_limit_and_auth_failure_do_not_rotate():
    pool = pool_with_accounts(1)

    await pool.mark_limited(0)
    assert pool._current_index == 0
    assert pool._accounts[0].mark_rate_limited.call_count == 1
    assert await pool.mark_auth_failed(0) is False


def test_limited_accounts_are_not_advertised_as_eligible():
    pool = pool_with_accounts(2)
    record(pool, 0)
    assert pool.eligible_account_ids_snapshot() == frozenset({"account-1"})


@pytest.mark.asyncio
async def test_manual_activation_works_when_quota_exhausted():
    pool = pool_with_accounts(2)
    record(pool, 0)
    record(pool, 1)
    assert (await pool.acquire())[2] in {0, 1}
    await pool.set_active(1)
    assert pool._current_index == 1


@pytest.mark.asyncio
async def test_all_limited_still_sends_via_earliest_reset_account():
    pool = pool_with_accounts(2)
    record(pool, 0, reset=1800)
    record(pool, 1, reset=3600)
    pool._accounts[0].mark_rate_limited(1800)
    pool._accounts[1].mark_rate_limited(3600)

    token, _, index = await pool.acquire()

    assert (token, index) == ("token-0", 0)


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


@pytest.mark.asyncio
async def test_manual_activation_clears_bench_and_sticks_until_429():
    pool = pool_with_accounts(2)
    record(pool, 1)
    pool._accounts[1].mark_rate_limited(600)

    await pool.set_active(1)
    assert (await pool.acquire())[2] == 1
    assert (await pool.acquire())[2] == 1
    await pool.mark_limited(1)
    assert pool._manual_active_index is None


def test_fresh_quota_with_room_clears_old_429_bench():
    pool = pool_with_accounts(1)
    auth = pool._accounts[0]
    auth.mark_rate_limited(600)
    from src.llm.account_key import opaque_account_key

    pool.quota.record_headers(opaque_account_key("account-0"), {
        "x-codex-primary-used-percent": "45",
        "x-codex-primary-reset-after-seconds": "900",
        "x-codex-primary-window-minutes": "300",
    })

    assert pool._quota_reset(0) is None
    assert not auth.is_rate_limited()


@pytest.mark.parametrize("path", ["eligible", "acquire", "rotate"])
@pytest.mark.asyncio
async def test_fresh_room_clears_bench_before_pool_short_circuits(path):
    pool = pool_with_accounts(2)
    auth = pool._accounts[0]
    from src.llm.account_key import opaque_account_key

    benched = True
    auth.is_rate_limited.side_effect = lambda: benched

    def clear_bench():
        nonlocal benched
        benched = False

    auth.clear_rate_limit.side_effect = clear_bench
    auth.mark_rate_limited(7200)
    pool.quota.record_headers(opaque_account_key("account-0"), {
        "x-codex-primary-used-percent": "10",
        "x-codex-primary-reset-after-seconds": "7200",
        "x-codex-primary-window-minutes": "300",
    })

    if path == "eligible":
        assert "account-0" in pool.eligible_account_ids_snapshot()
    elif path == "acquire":
        assert (await pool.acquire())[2] == 0
    else:
        pool._current_index = 1
        pool._rotate()
        assert pool._current_index == 0
    auth.clear_rate_limit.assert_called()
    assert not benched


@pytest.mark.asyncio
async def test_rotation_checks_fresh_quota_before_bench_state():
    pool = pool_with_accounts(2)
    auth = pool._accounts[1]
    from src.llm.account_key import opaque_account_key

    benched = True
    auth.is_rate_limited.side_effect = lambda: benched

    def clear_bench():
        nonlocal benched
        benched = False

    auth.clear_rate_limit.side_effect = clear_bench
    auth.mark_rate_limited(7200)
    pool.quota.record_headers(opaque_account_key("account-1"), {
        "x-codex-primary-used-percent": "10",
        "x-codex-primary-reset-after-seconds": "7200",
        "x-codex-primary-window-minutes": "300",
    })

    pool._rotate()

    assert pool._current_index == 1
    assert not benched


def test_stale_room_snapshot_does_not_clear_a_newer_429_bench():
    pool = pool_with_accounts(1)
    auth = pool._accounts[0]
    from src.llm.account_key import opaque_account_key

    pool.quota.record_headers(opaque_account_key("account-0"), {
        "x-codex-primary-used-percent": "45",
        "x-codex-primary-window-minutes": "300",
        "x-codex-primary-reset-after-seconds": "900",
    })
    snapshot = pool.quota.snapshot_for(opaque_account_key("account-0"))
    auth._rate_limit_marked_at = snapshot.observed_at + 1
    auth.mark_rate_limited(600)
    # mark_rate_limited normally records its own real wall time. Restore the
    # modeled ordering after marking it.
    auth._rate_limit_marked_at = snapshot.observed_at + 1

    assert pool._quota_reset(0) is None
    auth.clear_rate_limit.assert_not_called()


def test_limit_type_only_exhausts_the_matching_window():
    pool = pool_with_accounts(1)
    from src.llm.account_key import opaque_account_key

    pool.quota.record_headers(opaque_account_key("account-0"), {
        "x-codex-rate-limit-reached-type": "primary",
        "x-codex-primary-used-percent": "60",
        "x-codex-primary-window-minutes": "300",
        "x-codex-primary-reset-after-seconds": "900",
        "x-codex-secondary-used-percent": "20",
        "x-codex-secondary-window-minutes": "10080",
        "x-codex-secondary-reset-after-seconds": "3600",
    })
    snapshot = pool.quota.snapshot_for(opaque_account_key("account-0"))
    assert snapshot is not None
    assert pool._quota_reset(0, now=snapshot.observed_at) == snapshot.primary.resets_at


def test_empty_zero_minute_window_never_triggers_failover():
    pool = pool_with_accounts(2)
    from src.llm.account_key import opaque_account_key

    pool.quota.record_headers(opaque_account_key("account-0"), {
        "x-codex-secondary-window-minutes": "0",
        "x-codex-secondary-used-percent": "100",
        "x-codex-secondary-reset-after-seconds": "3600",
        "x-codex-rate-limit-reached-type": "secondary",
    })
    assert pool._quota_reset(0) is None


def test_check_failures_are_keyed_per_account_and_clearable():
    pool = pool_with_accounts(2)
    pool.set_quota_check_failure(0, "HTTP 401")
    assert pool.quota_check_failure(0) == "HTTP 401"
    assert pool.quota_check_failure(1) is None
    pool.set_quota_check_failure(0, None)
    assert pool.quota_check_failure(0) is None


def test_quota_view_discards_removed_account_failures():
    pool = pool_with_accounts(1)
    pool.set_quota_check_failure(0, "HTTP 401")
    pool._quota_check_failures["removed-account-key"] = "timeout"

    pool.quota_view()

    assert pool._quota_check_failures == {
        pool._quota_key(0): "HTTP 401",
    }


def test_quota_failure_helpers_handle_invalid_index_and_lazy_state():
    pool = pool_with_accounts(1)
    del pool._quota_check_failures

    assert pool.quota_check_failure(-1) is None
    assert pool.quota_check_failure(1) is None
    pool.set_quota_check_failure(1, "ignored")
    assert not hasattr(pool, "_quota_check_failures")

    pool.set_quota_check_failure(0, "timeout")
    assert pool._quota_check_failures[pool._quota_key(0)] == "timeout"


def test_quota_key_isolates_unreadable_account_id():
    pool = pool_with_accounts(1)
    pool._accounts[0].get_account_id.side_effect = OSError("credential file unreadable")
    assert pool._quota_key(0) is None
    assert pool.quota_check_failure(0) is None


def test_secondary_limit_type_uses_its_future_reset():
    pool = pool_with_accounts(1)
    from src.llm.account_key import opaque_account_key

    pool.quota.record_headers(opaque_account_key("account-0"), {
        "x-codex-rate-limit-reached-type": "secondary",
        "x-codex-primary-used-percent": "10",
        "x-codex-primary-window-minutes": "300",
        "x-codex-primary-reset-after-seconds": "900",
        "x-codex-secondary-used-percent": "40",
        "x-codex-secondary-window-minutes": "10080",
        "x-codex-secondary-reset-after-seconds": "1800",
    })
    snapshot = pool.quota.snapshot_for(opaque_account_key("account-0"))

    assert snapshot is not None
    assert pool._quota_reset(0, now=snapshot.observed_at) == snapshot.secondary.resets_at


@pytest.mark.asyncio
async def test_cancelled_auth_refresh_finishes_rotation_and_persistence(tmp_path):
    auth = CodexAuth(str(tmp_path / "credentials.json"))
    started = asyncio.Event()
    finish = asyncio.Event()
    async def rotate(_creds):
        started.set()
        await finish.wait()
        auth._save({"access_token": "new", "refresh_token": "rotated"})

    auth._refresh = rotate
    auth._credentials = {"access_token": "old", "refresh_token": "single-use", "expires_at": 0}
    task = asyncio.create_task(auth.get_access_token())
    await started.wait()
    task.cancel()
    await asyncio.sleep(0)
    finish.set()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert json.loads((tmp_path / "credentials.json").read_text()) == {
        "access_token": "new", "refresh_token": "rotated"
    }
