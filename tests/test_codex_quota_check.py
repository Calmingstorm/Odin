from __future__ import annotations

import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from src.discord.llm_gateway import LLMGateway
from src.llm.account_key import opaque_account_key
from src.llm.codex_auth import CodexAuth, CodexAuthPool
from src.llm.codex_quota import CodexQuotaTracker
from src.llm.codex_quota_check import CodexQuotaCheckService
from src.llm.openai_codex import CodexChatClient


class Pool:
    account_count = 3
    generation = 1

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
        self.auto_decompress = False

    def post(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return Response()

    async def close(self):
        self.closed = True


@pytest.mark.asyncio
async def test_disable_enable_check_uses_only_current_serving_pool(tmp_path, monkeypatch):
    """A boot pool may be retired, but must never refresh or rewrite credentials."""
    path = tmp_path / "accounts.json"
    path.write_text(json.dumps([
        {"access_token": f"token-{i}", "refresh_token": f"refresh-{i}",
         "account_id": f"acct-{i}", "expires_at": time.time() + 3600}
        for i in range(2)
    ]))
    original_credentials = path.read_bytes()
    boot_pool = CodexAuthPool(str(path))
    config = SimpleNamespace(openai_codex=SimpleNamespace(
        enabled=False, credentials_path=str(path), model="gpt-6-luna",
        reasoning_effort="none", request_timeout_seconds=60,
        stream_stall_timeout_seconds=30,
        retry=SimpleNamespace(max_retries=1, base_delay=1, max_delay=2),
        connection_pool=SimpleNamespace(max_connections=2, keepalive_timeout=30),
    ))
    gateway = LLMGateway(
        get_config=lambda: config,
        codex_client=CodexChatClient(auth=boot_pool, model="gpt-6-luna"),
        ollama_client=None, kimi_client=None,
        subsystem_guard=None, auxiliary_llm_client=None,
        cost_tracker=None, sessions=MagicMock(), reflector=MagicMock(),
    )
    service = CodexQuotaCheckService(lambda: getattr(gateway.codex_client, "auth", None))
    session = Session()
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda **kwargs: session)
    tokens_used = []

    async def token_once(self):
        tokens_used.append(self._load()["refresh_token"])
        return self._load()["access_token"]

    monkeypatch.setattr(CodexAuth, "get_access_token", token_once)
    await gateway.reload_codex_inner()  # Disable clears the boot generation.
    await service.check_once()
    assert session.calls == [] and tokens_used == []
    config.openai_codex.enabled = True
    await gateway.reload_codex_inner()  # Re-enable constructs a NEW serving pool.
    serving_pool = gateway.codex_client.auth
    assert serving_pool is not boot_pool
    await service.check_once()
    assert [call[1]["headers"]["Authorization"] for call in session.calls] == [
        "Bearer token-0", "Bearer token-1",
    ]
    assert tokens_used == ["refresh-0", "refresh-1"]
    assert path.read_bytes() == original_credentials
    assert boot_pool.quota.snapshot_for(opaque_account_key("acct-0")) is None
    assert serving_pool.quota.snapshot_for(opaque_account_key("acct-0")) is not None
    await gateway.codex_client.close()
    await service.close()


@pytest.mark.asyncio
async def test_hot_reload_mid_refresh_never_records_to_retired_pool(monkeypatch):
    old, new = Pool(), Pool()
    serving = SimpleNamespace(pool=old)
    service = CodexQuotaCheckService(lambda: serving.pool)
    session = Session()
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda **kwargs: session)

    async def rotate_during_token(index):
        serving.pool = new
        return "stale-token", f"acct-{index}"

    old.token_for = rotate_during_token
    await service.check_once()
    assert session.calls == []
    assert old.failures == {} and new.failures == {}
    await service.check_once()
    assert new.tokens == [0, 1, 2]


def test_bot_wiring_check_lookup_tracks_current_gateway_and_live_config(tmp_path, monkeypatch):
    """Pin the actual build_components binding, not merely the check's provider contract."""
    from tests.fakes import make_bot

    monkeypatch.chdir(tmp_path)
    bot = make_bot()
    check = bot.codex_quota_check
    assert check.get_pool() is None
    pool = Pool()
    bot.llm_gateway.codex_client = SimpleNamespace(auth=pool)
    bot.config.openai_codex.enabled = True
    assert check.get_pool() is pool
    bot.config.openai_codex.enabled = False
    assert check.get_pool() is None
    bot.config.openai_codex.enabled = True
    replacement = Pool()
    bot.llm_gateway.codex_client = SimpleNamespace(auth=replacement)
    assert check.get_pool() is replacement


@pytest.mark.asyncio
async def test_checks_each_stale_account_pinned_shape_and_headers_only(monkeypatch):
    pool = Pool()
    service = CodexQuotaCheckService(lambda: pool, interval=900, timeout=3)
    session = Session()
    options = []

    def make_session(**kwargs):
        options.append(kwargs)
        return session

    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", make_session)
    await service.check_once()
    assert pool.tokens == [0, 1, 2]
    assert session.calls[1][1]["headers"] == {
        **CodexChatClient._auth_headers("token-1", "acct-1"),
        "Accept-Encoding": "identity",
    }
    assert set(session.calls[1][1]["headers"]) == {
        "Authorization",
        "Content-Type",
        "ChatGPT-Account-Id",
        "Accept-Encoding",
        "originator",
        "User-Agent",
    }
    assert len(session.calls) == 3
    (url,), kwargs = session.calls[0]
    assert url == "https://chatgpt.com/backend-api/codex/responses"
    assert kwargs["headers"] == {**CodexChatClient._auth_headers("token-0", "acct-0"),
                                  "Accept-Encoding": "identity"}
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
        "reasoning": {"effort": "none"},
    }
    assert kwargs["timeout"].total == 3
    assert options == [{"auto_decompress": False, "headers": {"Accept-Encoding": "identity"}}]
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
        "x-codex-primary-window-minutes": "300",
    })
    pool.accounts[1]["configured"] = False
    service = CodexQuotaCheckService(lambda: pool)
    session = Session()
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda **kwargs: session)
    await service.check_once()
    assert pool.tokens == [2]
    assert len(session.calls) == 1


@pytest.mark.asyncio
async def test_401_and_429_record_failure_without_pool_rotation_or_marking(monkeypatch):
    pool = Pool()
    service = CodexQuotaCheckService(lambda: pool)
    session = Session()
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda **kwargs: session)

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
async def test_a_usage_limit_refusal_with_its_quota_is_not_a_failed_check(monkeypatch):
    pool = Pool()
    pool.failures = {0: "HTTP 429", 1: "HTTP 429", 2: "HTTP 429"}  # earlier checks
    service = CodexQuotaCheckService(lambda: pool)
    session = Session()
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda **kwargs: session)

    class StatusResponse(Response):
        def __init__(self, status, headers):
            self.status = status
            self.headers = headers

    # An account at its weekly limit refuses with 429 and still reports its quota.
    weekly_exhausted = {
        "x-codex-primary-used-percent": "0", "x-codex-primary-window-minutes": "300",
        "x-codex-secondary-used-percent": "100", "x-codex-secondary-window-minutes": "10080",
    }
    named_limit = {"x-codex-rate-limit-reached-type": "primary"}
    not_exhausted = {"x-codex-primary-used-percent": "40", "x-codex-primary-window-minutes": "300"}
    responses = [StatusResponse(429, weekly_exhausted), StatusResponse(429, named_limit),
                 StatusResponse(429, not_exhausted)]
    session.post = lambda *args, **kwargs: responses.pop(0)
    await service.check_once()
    # The limit is the observation; a 429 its quota does not explain stays a failure.
    assert pool.failures == {0: None, 1: None, 2: "HTTP 429"}
    assert pool.quota.snapshot_for(opaque_account_key("acct-0")).secondary.used_percent == 100
    assert pool.limited == [False, False, False]
    assert pool.mutations == []


@pytest.mark.asyncio
async def test_a_429_is_observed_exactly_when_the_account_list_shows_the_limit(monkeypatch):
    pool = Pool()
    pool.failures = {0: "HTTP 429", 1: "HTTP 429", 2: "HTTP 429"}
    service = CodexQuotaCheckService(lambda: pool)
    session = Session()
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda **kwargs: session)

    class StatusResponse(Response):
        def __init__(self, status, headers):
            self.status = status
            self.headers = headers

    primary = {"x-codex-primary-used-percent": "20", "x-codex-primary-window-minutes": "300",
               "x-codex-primary-reset-after-seconds": "600"}
    named_window = {**primary, "x-codex-secondary-used-percent": "40",
                    "x-codex-secondary-window-minutes": "10080",
                    "x-codex-secondary-reset-after-seconds": "86400",
                    "x-codex-rate-limit-reached-type": "secondary"}
    absent_window = {**primary, "x-codex-rate-limit-reached-type": "secondary"}
    responses = [StatusResponse(429, named_window), StatusResponse(429, absent_window),
                 StatusResponse(429, {"x-codex-rate-limit-reached-type": "primary"})]
    session.post = lambda *args, **kwargs: responses.pop(0)
    await service.check_once()
    # Named below 100% and a signal without windows show "Limit reached"; a type
    # naming a window it never reported explains nothing, so the 429 stays.
    assert pool.failures == {0: None, 1: "HTTP 429", 2: None}
    assert pool.mutations == []


class RefreshingPool(Pool):
    def __init__(self, refreshed):
        super().__init__()
        self.refreshed = refreshed
        self.refreshes = []

    async def token_for(self, index):
        self.tokens.append(index)
        return f"token-{index}-r{len(self.refreshes)}", f"acct-{index}"

    async def force_refresh(self, index, stale_token=None):
        self.refreshes.append((index, stale_token))
        return self.refreshed


@pytest.mark.asyncio
@pytest.mark.parametrize(("refreshed", "replies", "expected"), [
    (True, [401, 429], None),  # a stale token: refreshed, then the limit observed
    (True, [401, 200], None),
    (False, [401], "HTTP 401"),  # the refresh failed: the 401 stands
    (True, [401, 401], "HTTP 401"),  # still rejected: one retry only
])
async def test_a_rejected_token_is_refreshed_once_and_checked_again(
    monkeypatch, refreshed, replies, expected,
):
    pool = RefreshingPool(refreshed)
    pool.accounts[1]["configured"] = pool.accounts[2]["configured"] = False
    service = CodexQuotaCheckService(lambda: pool)
    session = Session()
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda **kwargs: session)
    exhausted = {"x-codex-secondary-used-percent": "100",
                 "x-codex-secondary-window-minutes": "10080",
                 "x-codex-secondary-reset-after-seconds": "86400"}

    class StatusResponse(Response):
        def __init__(self, status):
            self.status = status
            self.headers = exhausted if status == 429 else {}

    statuses = list(replies)

    def post(*args, **kwargs):
        session.calls.append((args, kwargs))
        return StatusResponse(statuses.pop(0))

    session.post = post
    await service.check_once()
    assert pool.failures[0] == expected
    assert len(session.calls) == len(replies)
    assert pool.refreshes == [(0, "token-0-r0")]  # the token the server rejected
    if len(replies) == 2:
        assert session.calls[1][1]["headers"]["Authorization"] == "Bearer token-0-r1"
    assert pool.mutations == []  # the check never marks, rotates or activates


@pytest.mark.asyncio
async def test_token_failure_is_captured_and_continues(monkeypatch):
    pool = Pool()
    original = pool.token_for

    async def token_for(index):
        if index == 1:
            raise RuntimeError("sensitive error string")
        return await original(index)

    pool.token_for = token_for
    service = CodexQuotaCheckService(lambda: pool)
    session = Session()
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda **kwargs: session)
    await service.check_once()
    assert pool.failures[1] == "credential refresh failed"
    assert pool.tokens == [0, 2]


@pytest.mark.asyncio
async def test_run_survives_check_failure_and_close_closes_session():
    pool = Pool()
    service = CodexQuotaCheckService(lambda: pool, interval=0)
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
    service = CodexQuotaCheckService(lambda: pool)
    monkeypatch.setattr("src.llm.codex_quota_check.opaque_account_key", lambda _: None)
    await service.check_once()
    assert pool.failures[0] == "account identity unavailable"

    pool = Pool()
    service = CodexQuotaCheckService(lambda: pool)
    monkeypatch.undo()
    session = Session()

    def fail_request(*args, **kwargs):
        raise RuntimeError("sensitive upstream detail")

    session.post = fail_request
    monkeypatch.setattr("src.llm.codex_quota_check.aiohttp.ClientSession", lambda **kwargs: session)
    await service.check_once()
    assert pool.failures == {0: "request failed", 1: "request failed", 2: "request failed"}


@pytest.mark.asyncio
async def test_start_close_are_idempotent_and_stop_task():
    pool = Pool()
    service = CodexQuotaCheckService(lambda: pool, interval=60)
    service.check_once = lambda: asyncio.sleep(0)
    await service.start()
    task = service._task
    await service.start()
    assert service._task is task
    await service.close()
    assert service._task is None
    await service.close()
