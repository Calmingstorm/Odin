from __future__ import annotations

import asyncio

import pytest

from src.llm.account_key import opaque_account_key
from src.llm.codex_quota import CodexQuotaTracker
from src.llm.codex_quota_check import CodexQuotaCheckService
from src.llm.openai_codex import CodexChatClient


class Pool:
    account_count = 3

    def __init__(self):
        self.quota = CodexQuotaTracker(clock=lambda: 1000)
        self.accounts = [
            {"configured": True, "key": opaque_account_key(f"acct-{i}")}
            for i in range(3)
        ]
        self.failures = {}
        self.tokens = []
        self.current_index = 1
        self.limited = [False] * self.account_count
        self.mutations = []

    def describe_accounts(self):
        return self.accounts

    async def token_for(self, index):
        self.tokens.append(index)
        return f"token-{index}", f"acct-{index}"

    def set_quota_check_failure(self, index, reason):
        self.failures[index] = reason

    async def mark_limited(self, index):
        self.mutations.append(("limited", index))
        self.limited[index] = True

    async def mark_auth_failed(self, index):
        self.mutations.append(("auth_failed", index))
        self.limited[index] = True
        return True


class Response:
    status = 200
    headers = {"x-codex-primary-used-percent": "25", "x-codex-primary-window-minutes": "300"}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


class Session:
    closed = False

    def __init__(self):
        self.calls = []

    def post(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return Response()

    async def close(self):
        self.closed = True


@pytest.mark.asyncio
async def test_checks_each_stale_account_pinned_shape_and_headers_only(monkeypatch):
    pool = Pool()
    service = CodexQuotaCheckService(pool, interval=900, timeout=3)
    session = Session()
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda: session)
    await service.check_once()
    assert pool.tokens == [0, 1, 2]
    assert session.calls[1][1]["headers"] == CodexChatClient._auth_headers("token-1", "acct-1")
    assert set(session.calls[1][1]["headers"]) == {
        "Authorization",
        "Content-Type",
        "ChatGPT-Account-Id",
    }
    assert len(session.calls) == 3
    (url,), kwargs = session.calls[0]
    assert url.endswith("/backend-api/codex/responses")
    assert kwargs["headers"] == CodexChatClient._auth_headers("token-0", "acct-0")
    assert kwargs["json"] == {
        "model": "gpt-6-luna",
        "instructions": "Reply with one word.",
        "input": [{
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": "quota"}],
        }],
        "store": False,
        "stream": True,
        "reasoning": {"effort": "low"},
    }
    assert kwargs["timeout"].total == 3
    snap = pool.quota.snapshot_for(opaque_account_key("acct-0"))
    assert snap and snap.primary.used_percent == 25
    assert pool.failures == {0: None, 1: None, 2: None}
    assert pool.current_index == 1
    assert pool.limited == [False, False, False]
    assert pool.mutations == []


@pytest.mark.asyncio
async def test_fresh_accounts_are_skipped_and_unconfigured_slots_ignored(monkeypatch):
    pool = Pool()
    pool.quota.record_headers(opaque_account_key("acct-0"), {
        "x-codex-primary-used-percent": "10",
    })
    pool.accounts[1]["configured"] = False
    service = CodexQuotaCheckService(pool)
    session = Session()
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda: session)
    await service.check_once()
    assert pool.tokens == [2]
    assert len(session.calls) == 1


@pytest.mark.asyncio
async def test_401_and_429_record_failure_without_pool_rotation_or_marking(monkeypatch):
    pool = Pool()
    service = CodexQuotaCheckService(pool)
    session = Session()
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda: session)

    class StatusResponse(Response):
        def __init__(self, status):
            self.status = status
            self.headers = {}

    responses = [StatusResponse(401), StatusResponse(429), StatusResponse(200)]
    session.post = lambda *args, **kwargs: responses.pop(0)
    await service.check_once()
    assert pool.tokens == [0, 1, 2]
    assert pool.failures == {0: "HTTP 401", 1: "HTTP 429", 2: None}
    assert pool.current_index == 1
    assert pool.limited == [False, False, False]
    assert pool.mutations == []
    pool.failures[2] = "HTTP 429"
    pool.quota._clock = lambda: 1901
    session.post = lambda *args, **kwargs: StatusResponse(200)
    await service.check_once()
    assert pool.failures[2] is None


@pytest.mark.asyncio
async def test_token_failure_is_captured_and_continues(monkeypatch):
    pool = Pool()
    original = pool.token_for

    async def token_for(index):
        if index == 1:
            raise RuntimeError("sensitive error string")
        return await original(index)

    pool.token_for = token_for
    service = CodexQuotaCheckService(pool)
    session = Session()
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda: session)
    await service.check_once()
    assert pool.failures[1] == "credential refresh failed"
    assert pool.tokens == [0, 2]


@pytest.mark.asyncio
async def test_run_survives_check_failure_and_close_closes_session():
    pool = Pool()
    service = CodexQuotaCheckService(pool, interval=0)
    attempts = 0

    async def fail_once():
        nonlocal attempts
        attempts += 1
        service._closed = True
        raise RuntimeError("temporary failure")

    service.check_once = fail_once
    await service._run()
    assert attempts == 1

    session = Session()
    service._session = session
    await service.close()
    assert session.closed is True
    await service.start()
    assert service._task is None


@pytest.mark.asyncio
async def test_missing_identity_and_http_exception_are_display_safe(monkeypatch):
    pool = Pool()
    service = CodexQuotaCheckService(pool)
    monkeypatch.setattr("src.llm.codex_quota_check.opaque_account_key", lambda _: None)
    await service.check_once()
    assert pool.failures[0] == "account identity unavailable"

    pool = Pool()
    service = CodexQuotaCheckService(pool)
    monkeypatch.undo()
    session = Session()

    def fail_request(*args, **kwargs):
        raise RuntimeError("sensitive upstream detail")

    session.post = fail_request
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda: session)
    await service.check_once()
    assert pool.failures == {0: "request failed", 1: "request failed", 2: "request failed"}


@pytest.mark.asyncio
async def test_start_close_are_idempotent_and_stop_task():
    pool = Pool()
    service = CodexQuotaCheckService(pool, interval=60)
    service.check_once = lambda: asyncio.sleep(0)
    await service.start()
    task = service._task
    await service.start()
    assert service._task is task
    await service.close()
    assert service._task is None
    await service.close()
