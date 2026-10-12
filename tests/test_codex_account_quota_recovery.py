"""Account lifecycle and reply recovery, using disposable credentials only."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp.test_utils import TestClient, TestServer

from src.llm import codex_auth as ca
from src.llm.account_key import opaque_account_key
from src.llm.errors import LLMRateLimitError
from src.llm.openai_codex import CodexChatClient, CodexStreamError
from tests.test_codex_account_mutation_regressions import creds, setup

OLD_HEADERS = {
    "x-codex-primary-used-percent": "25",
    "x-codex-primary-window-minutes": "10080",
    "x-codex-plan-type": "pro",
}
PLUS_HEADERS = {
    "x-codex-primary-used-percent": "20",
    "x-codex-primary-window-minutes": "300",
    "x-codex-secondary-used-percent": "10",
    "x-codex-secondary-window-minutes": "10080",
    "x-codex-plan-type": "plus",
}


@pytest.fixture(autouse=True)
def isolated_keys(tmp_path, monkeypatch):
    monkeypatch.setattr("src.llm.account_key.DEFAULT_KEY_PATH", tmp_path / "key.secret")


def mark(pool, index):
    pool.set_quota_check_failure(index, "HTTP 401")
    pool.quota.record_headers(pool._quota_key(index), OLD_HEADERS)


@pytest.mark.asyncio
@pytest.mark.parametrize("single", [False, True])
@pytest.mark.parametrize("sync", [False, True])
@pytest.mark.parametrize("revision", [False, True])
async def test_same_account_in_place_replacement_immediately_recovers(
    tmp_path, single, sync, revision,
):
    path, pool, *_ = setup(tmp_path, creds("A") if single else [creds("A"), creds("B")])
    old_auth = pool.current
    assert await pool.token_for(0) == ("synthetic-A", "A")  # prime the cache
    mark(pool, 0)
    if not single:
        mark(pool, 1)
    replacement = {
        **creds("A"), "access_token": "synthetic-new-A",
        "refresh_token": "synthetic-new-refresh-A", "expires_at": 8888888888,
    }
    if revision:
        replacement = ca.mark_authorized_account(replacement)
    path.write_text(json.dumps(replacement if single else [replacement, creds("B")]))
    if sync:
        pool.reload()
    else:
        await pool.reload_async()
    assert pool.current is not old_auth
    assert await pool.token_for(0) == ("synthetic-new-A", "A")
    assert pool.quota_check_failure(0) is None  # no quota_view or process restart
    assert pool.quota.snapshot_for(opaque_account_key("A")) is None
    if not single:
        assert pool.quota_check_failure(1) == "HTTP 401"
        assert pool.quota.snapshot_for(opaque_account_key("B")) is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("revision", [False, True])
async def test_shadow_replacement_with_older_expiry_becomes_authoritative(tmp_path, revision):
    path, pool, *_ = setup(tmp_path, [creds("A"), creds("B")])
    assert await pool.token_for(0) == ("synthetic-A", "A")
    mark(pool, 0)
    mark(pool, 1)
    replacement = {**creds("A"), "access_token": "synthetic-shadow-replacement",
                   "refresh_token": "synthetic-shadow-refresh", "expires_at": 8888888888}
    if revision:
        replacement = ca.mark_authorized_account(replacement)
    (tmp_path / "codex_auth_0.json").write_text(json.dumps(replacement))
    await pool.reload_async()
    assert await pool.token_for(0) == ("synthetic-shadow-replacement", "A")
    assert json.loads(path.read_text())[0] == replacement
    assert pool.quota_check_failure(0) is None
    assert pool.quota.snapshot_for(opaque_account_key("A")) is None
    assert pool.quota_check_failure(1) == "HTTP 401"


@pytest.mark.asyncio
async def test_delete_readd_clears_state_without_intermediate_status_view(tmp_path, monkeypatch):
    path, pool, bot, app, _ = setup(tmp_path, [creds("A"), creds("B")])
    assert await pool.token_for(0) == ("synthetic-A", "A")
    mark(pool, 0)
    mark(pool, 1)
    bot.llm_gateway.reload_codex.side_effect = pool.reload_async
    monkeypatch.setattr(ca.CodexAuth, "poll_device_auth", AsyncMock(return_value={
        **creds("A"), "access_token": "synthetic-readded-A", "expires_at": 8888888888,
    }))
    async with TestClient(TestServer(app)) as client:
        assert (await client.delete("/api/codex/account/0")).status == 200
        assert opaque_account_key("A") not in pool._quota_check_failures
        assert pool.quota.snapshot_for(opaque_account_key("A")) is None
        response = await client.post("/api/codex/device-poll", json={
            "device_auth_id": "synthetic", "user_code": "synthetic",
        })
        assert response.status == 200
    assert await pool.token_for(1) == ("synthetic-readded-A", "A")
    assert pool.quota_check_failure(1) is None
    assert pool.quota.snapshot_for(opaque_account_key("A")) is None
    assert pool.quota_check_failure(0) == "HTTP 401"  # B moved slots
    assert pool.quota.snapshot_for(opaque_account_key("B")) is not None
    assert len(json.loads(path.read_text())) == 2


@pytest.mark.asyncio
async def test_unchanged_label_and_reorder_reload_preserve_account_state(tmp_path):
    path, pool, *_ = setup(tmp_path, [creds("A"), creds("B")])
    mark(pool, 0)
    mark(pool, 1)
    original = pool.current
    path.write_text(json.dumps([{**creds("A"), "label": "renamed"}, creds("B")]))
    await pool.reload_async()
    assert pool.current is original  # keep the single-use refresh lock
    path.write_text(json.dumps([creds("B"), creds("A")]))
    await pool.reload_async()
    assert [pool.quota_check_failure(i) for i in range(2)] == ["HTTP 401", "HTTP 401"]
    assert all(pool.quota.snapshot_for(opaque_account_key(a)) for a in ("A", "B"))


@pytest.mark.asyncio
@pytest.mark.parametrize("reply", ["text", "tools", "429", "stream_failure", "empty"])
@pytest.mark.parametrize("reorder", [False, True])
async def test_reply_recovers_only_the_serving_account(tmp_path, monkeypatch, reply, reorder):
    path, pool, *_ = setup(tmp_path, [creds("A"), creds("B")])
    mark(pool, 0)
    mark(pool, 1)
    client = CodexChatClient(pool, "synthetic-model", max_retries=1)
    entered, release = asyncio.Event(), asyncio.Event()

    class Response:
        status = 429 if reply == "429" else 200
        headers = PLUS_HEADERS
        content = None

        async def __aenter__(self):
            entered.set()
            await release.wait()
            return self

        async def __aexit__(self, *args):
            pass

    session = SimpleNamespace(post=lambda *args, **kwargs: Response())
    monkeypatch.setattr(client, "_get_session", AsyncMock(return_value=session))
    monkeypatch.setattr("src.llm.openai_codex._read_error_body_bounded",
                        AsyncMock(return_value=(b'{"error":{"message":"slow down"}}', False)))

    async def reader(response):
        if reply == "stream_failure":
            raise CodexStreamError("synthetic failure")
        if reply == "tools":
            from src.llm.types import LLMResponse

            return LLMResponse(text="", tool_calls=[SimpleNamespace(name="test")])
        return "" if reply == "empty" else "healthy reply"

    task = asyncio.create_task(client._send_with_retries(
        {"model": "synthetic-model"}, reader,
        lambda result: not (result.text or result.tool_calls) if reply == "tools" else not result,
    ))
    await entered.wait()
    if reorder:
        path.write_text(json.dumps([creds("B"), creds("A")]))
        await pool.reload_async()
    release.set()
    if reply in {"429", "stream_failure"}:
        with pytest.raises(LLMRateLimitError if reply == "429" else Exception):
            await task
    else:
        await task
    a_index, b_index = (1, 0) if reorder else (0, 1)
    assert pool.quota_check_failure(b_index) == "HTTP 401"
    assert pool.quota_check_failure(a_index) == (
        None if reply in {"text", "tools"} else "HTTP 401"
    )
    snapshot = pool.quota.snapshot_for(opaque_account_key("A"))
    assert snapshot.plan_type == "plus"
    assert snapshot.primary.window_minutes == 300
    assert snapshot.secondary.window_minutes == 10080


@pytest.mark.asyncio
async def test_429_then_other_account_success_only_clears_successful_account(tmp_path, monkeypatch):
    _, pool, *_ = setup(tmp_path, [creds("A"), creds("B")])
    mark(pool, 0)
    mark(pool, 1)
    client = CodexChatClient(pool, "synthetic-model", max_retries=2)
    calls = []

    class Response:
        headers = {}
        content = None

        def __init__(self, status):
            self.status = status

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    def post(*args, **kwargs):
        calls.append(kwargs["headers"]["ChatGPT-Account-Id"])
        return Response(429 if len(calls) == 1 else 200)

    monkeypatch.setattr(client, "_get_session", AsyncMock(return_value=SimpleNamespace(post=post)))
    monkeypatch.setattr("src.llm.openai_codex._read_error_body_bounded",
                        AsyncMock(return_value=(b'{"error":{"message":"slow down"}}', False)))
    monkeypatch.setattr("src.llm.openai_codex.asyncio.sleep", AsyncMock())
    result = await client._send_with_retries(
        {"model": "synthetic-model"}, AsyncMock(return_value="healthy B reply"), lambda r: not r,
    )
    assert result == "healthy B reply"
    assert calls == ["A", "B"]
    assert pool.quota_check_failure(0) == "HTTP 401"
    assert pool.quota_check_failure(1) is None
