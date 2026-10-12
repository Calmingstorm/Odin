"""Request ownership survives reorder, never slot replacement. Synthetic only."""
import asyncio
import json
import time

import pytest

from src.llm import codex_auth as ca
from tests.test_codex_account_mutation_regressions import creds, setup
from tests.test_codex_refresh_chain_reload import SingleUseOAuth
from tests.test_codex_reliability import TEXT_OK_SSE, FakeResp, _client


@pytest.fixture(autouse=True)
def isolated_keys(tmp_path, monkeypatch):
    monkeypatch.setattr("src.llm.account_key.DEFAULT_KEY_PATH", tmp_path / "key.secret")


async def reload_rows(path, pool, rows, sync):
    path.write_text(json.dumps(rows))
    if sync:
        pool.reload()
    else:
        await pool.reload_async()


async def select_path(pool, monkeypatch, mode):
    if mode == "manual":
        await pool.set_active(0)
    elif mode == "fallback":
        # Force both selection iterations to skip locally benched A, then
        # recover it. This reaches the explicit last-chance acquisition path,
        # distinct from the main loop's all-benched upstream attempt.
        pool._accounts[0].mark_rate_limited(3600)
        rotations = 0

        def rotate():
            nonlocal rotations
            rotations += 1
            if rotations == len(pool._accounts):
                pool._accounts[0].clear_rate_limit()

        monkeypatch.setattr(pool, "_rotate", rotate)


@pytest.mark.asyncio
@pytest.mark.parametrize("sync", [False, True])
@pytest.mark.parametrize("mode", ["main", "manual", "fallback"])
async def test_acquire_during_reorder_returns_current_slot_and_pinned_owner(
    tmp_path, monkeypatch, sync, mode,
):
    original = {**creds("A"), "expires_at": int(time.time())}
    path, pool, *_ = setup(tmp_path, [original, creds("B")])
    auth_a, auth_b = pool._accounts
    await select_path(pool, monkeypatch, mode)
    transport = SingleUseOAuth()
    monkeypatch.setattr(ca.aiohttp, "ClientSession", transport.session)
    acquisition = asyncio.create_task(pool.acquire())
    try:
        await asyncio.wait_for(transport.entered.wait(), 5)
        await reload_rows(path, pool, [creds("B"), original], sync)
        assert pool._accounts == [auth_b, auth_a]
    finally:
        transport.release.set()
        token, account_id, index = await asyncio.wait_for(acquisition, 5)

    assert (token, account_id, index) == ("synthetic-successor", "A", 1)
    assert isinstance(index, int)
    assert pool._accounts[index] is auth_a
    assert pool._accounts[index].get_account_id() == account_id
    assert pool._accounts[index]._load()["access_token"] == token
    assert transport.consumed == [original["refresh_token"]]

    # The tuple's owner must also survive a LATER reload while a request waits
    # for its upstream reply. A correct index at acquisition alone is not a pin.
    rows = json.loads(path.read_text())
    await reload_rows(path, pool, rows[::-1], sync)
    assert pool._accounts == [auth_a, auth_b]
    assert await pool.token_for(index) == (token, "A")
    await pool.mark_limited(index)
    assert auth_a.is_rate_limited()
    assert not auth_b.is_rate_limited()
    auth_a.clear_rate_limit()
    assert await pool.mark_auth_failed(index)
    assert auth_a.is_rate_limited()
    assert not auth_b.is_rate_limited()
    auth_a.clear_rate_limit()
    assert await pool.force_refresh(index, token)
    assert transport.consumed == [original["refresh_token"], "synthetic-next"]
    assert await pool.token_for(index) == ("synthetic-successor", "A")
    assert auth_b._load() == creds("B")


@pytest.mark.asyncio
@pytest.mark.parametrize("sync", [False, True])
@pytest.mark.parametrize("mutation", ["remove", "replace", "revision", "remove_readd"])
async def test_request_lease_never_targets_replacement(tmp_path, monkeypatch, sync, mutation):
    original = ca.mark_authorized_account(creds("A"))
    path, pool, *_ = setup(tmp_path, [original, creds("B")])
    token, _, index = await pool.acquire()
    retired = pool._accounts[0]
    if mutation == "remove":
        rows = [creds("B")]
    elif mutation == "replace":
        rows = [creds("C"), creds("B")]
    elif mutation == "revision":
        rows = [ca.mark_authorized_account(creds("A")), creds("B")]
    else:
        await reload_rows(path, pool, [creds("B")], sync)
        rows = [original, creds("B")]
    await reload_rows(path, pool, rows, sync)
    assert all(auth is not retired for auth in pool._accounts)
    before = path.read_text()
    transport = SingleUseOAuth()
    monkeypatch.setattr(ca.aiohttp, "ClientSession", transport.session)
    await pool.mark_limited(index)
    assert not await pool.mark_auth_failed(index)
    assert not await pool.force_refresh(index, token)
    with pytest.raises(RuntimeError, match="out of range"):
        await pool.token_for(index)
    assert transport.consumed == []
    assert all(not auth.is_rate_limited() for auth in pool._accounts)
    assert path.read_text() == before
    # A literal operator slot deliberately selects its CURRENT owner.
    assert await pool.token_for(int(index)) == (rows[0]["access_token"], rows[0]["account_id"])


@pytest.mark.asyncio
@pytest.mark.parametrize("sync", [False, True])
@pytest.mark.parametrize("mode", ["main", "manual", "fallback"])
@pytest.mark.parametrize("mutation", ["remove", "replace", "revision", "remove_readd"])
async def test_acquire_rejects_retired_auth_even_if_token_await_succeeds(
    tmp_path, monkeypatch, sync, mode, mutation,
):
    original = ca.mark_authorized_account(creds("A"))
    path, pool, *_ = setup(tmp_path, [original, creds("B")])
    auth = pool._accounts[0]
    await select_path(pool, monkeypatch, mode)
    entered, release = asyncio.Event(), asyncio.Event()

    async def token_after_reload():
        entered.set()
        await release.wait()
        return original["access_token"]

    # Model a cached token completing after reload, without a publication guard
    # to reject it for us. Post-await membership must reject the retired object.
    monkeypatch.setattr(auth, "get_access_token", token_after_reload)
    acquisition = asyncio.create_task(pool.acquire())
    try:
        await asyncio.wait_for(entered.wait(), 5)
        if mutation in {"remove", "remove_readd"}:
            await reload_rows(path, pool, [creds("B")], sync)
        if mutation == "replace":
            await reload_rows(path, pool, [creds("C"), creds("B")], sync)
        elif mutation == "revision":
            replacement = ca.mark_authorized_account({**creds("A"),
                                                     "access_token": "synthetic-new-A"})
            await reload_rows(path, pool, [replacement, creds("B")], sync)
        elif mutation == "remove_readd":
            await reload_rows(path, pool, [original, creds("B")], sync)
        assert all(current is not auth for current in pool._accounts)
    finally:
        release.set()
        result = await asyncio.wait_for(asyncio.gather(acquisition, return_exceptions=True), 5)
    if isinstance(result[0], Exception):
        # The explicit fallback is a final attempt, not an unbounded restart.
        assert isinstance(result[0], ca.LLMAuthError)
    else:
        token, account_id, index = result[0]
        assert pool._accounts[index] is not auth
        assert pool._accounts[index].get_account_id() == account_id
        assert pool._accounts[index]._load()["access_token"] == token
        assert await pool.token_for(index) == (token, account_id)
    assert all(not current.is_rate_limited() for current in pool._accounts)


@pytest.mark.asyncio
@pytest.mark.parametrize("sync", [False, True])
async def test_refresh_in_progress_rejects_removed_lease(tmp_path, monkeypatch, sync):
    path, pool, *_ = setup(tmp_path, [creds("A"), creds("B")])
    token, _, index = await pool.acquire()
    transport = SingleUseOAuth()
    monkeypatch.setattr(ca.aiohttp, "ClientSession", transport.session)
    refreshing = asyncio.create_task(pool.force_refresh(index, token))
    try:
        await asyncio.wait_for(transport.entered.wait(), 5)
        await reload_rows(path, pool, [creds("B")], sync)
        before = path.read_text()
    finally:
        transport.release.set()
        refreshed = await asyncio.wait_for(refreshing, 5)
    assert not refreshed
    assert path.read_text() == before
    assert await pool.token_for(0) == ("synthetic-B", "B")
    assert not pool._accounts[0].is_rate_limited()


@pytest.mark.asyncio
@pytest.mark.parametrize("sync", [False, True])
@pytest.mark.parametrize("status", [401, 429])
async def test_provider_failure_after_reorder_uses_request_owner(
    tmp_path, monkeypatch, sync, status,
):
    path, pool, *_ = setup(tmp_path, [creds("A"), creds("B")])
    auth_a, auth_b = pool._accounts
    entered, release = asyncio.Event(), asyncio.Event()
    headers = []

    class DelayedReply(FakeResp):
        async def __aenter__(self):
            entered.set()
            await release.wait()
            return self

    class Session:
        calls = 0

        def post(self, *args, **kwargs):
            headers.append(kwargs["headers"])
            self.calls += 1
            if self.calls == 1:
                return DelayedReply(status, body=b"unauthorized" if status == 401 else b"limited")
            return FakeResp(200, sse_lines=TEXT_OK_SSE)

    session = Session()
    client = _client(auth=pool, max_retries=2)

    async def get_session():
        return session

    monkeypatch.setattr(client, "_get_session", get_session)
    transport = SingleUseOAuth()
    transport.release.set()
    monkeypatch.setattr(ca.aiohttp, "ClientSession", transport.session)
    requesting = asyncio.create_task(client._stream_request({"model": "synthetic-model"}))
    try:
        await asyncio.wait_for(entered.wait(), 5)
        await reload_rows(path, pool, [creds("B"), creds("A")], sync)
    finally:
        release.set()
        result = await asyncio.wait_for(requesting, 5)
    assert result == "hello"
    assert headers[0]["ChatGPT-Account-Id"] == "A"
    assert headers[0]["Authorization"] == "Bearer synthetic-A"
    if status == 401:
        assert transport.consumed == [creds("A")["refresh_token"]]
        assert headers[1]["ChatGPT-Account-Id"] == "A"
        assert headers[1]["Authorization"] == "Bearer synthetic-successor"
        assert not auth_a.is_rate_limited()
    else:
        assert transport.consumed == []
        assert headers[1]["ChatGPT-Account-Id"] == "B"
        assert headers[1]["Authorization"] == "Bearer synthetic-B"
        assert auth_a.is_rate_limited()
    assert not auth_b.is_rate_limited()


@pytest.mark.asyncio
@pytest.mark.parametrize("sync", [False, True])
async def test_token_for_rejects_auth_removed_during_await(tmp_path, monkeypatch, sync):
    path, pool, *_ = setup(tmp_path, [creds("A"), creds("B")])
    token, _, index = await pool.acquire()
    entered, release = asyncio.Event(), asyncio.Event()

    async def delayed_token():
        entered.set()
        await release.wait()
        return token

    monkeypatch.setattr(pool._accounts[0], "get_access_token", delayed_token)
    lookup = asyncio.create_task(pool.token_for(index))
    try:
        await asyncio.wait_for(entered.wait(), 5)
        await reload_rows(path, pool, [creds("B")], sync)
    finally:
        release.set()
        result = await asyncio.wait_for(asyncio.gather(lookup, return_exceptions=True), 5)
    assert isinstance(result[0], ca.LLMAuthError)
    assert await pool.token_for(0) == ("synthetic-B", "B")


@pytest.mark.asyncio
async def test_lease_from_other_pool_cannot_target_same_numeric_slot(tmp_path, monkeypatch):
    first = tmp_path / "first"
    second = tmp_path / "second"
    first.mkdir()
    second.mkdir()
    _, pool_a, *_ = setup(first, [creds("A")])
    _, pool_b, *_ = setup(second, [creds("B")])
    token, _, index = await pool_a.acquire()
    transport = SingleUseOAuth()
    monkeypatch.setattr(ca.aiohttp, "ClientSession", transport.session)
    await pool_b.mark_limited(index)
    assert not await pool_b.mark_auth_failed(index)
    assert not await pool_b.force_refresh(index, token)
    with pytest.raises(RuntimeError, match="out of range"):
        await pool_b.token_for(index)
    assert not pool_b._accounts[0].is_rate_limited()
    assert transport.consumed == []
