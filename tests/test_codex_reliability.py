"""Tests for Codex auth/provider reliability fixes.

Covers:
- Rotated refresh-token persistence: shadow files are no longer clobbered by
  the canonical file on init/reload, and refreshes write back to canonical
  (the "all 3 accounts die at once" outage).
- Request-pinned account marking: 429/401 penalize the account that served
  the failing request, not whatever account is current at lock time.
- Pool lock is not held across token refresh.
- Circuit breaker records exactly one failure per failed attempt (no
  double-count on terminal 429/5xx).
- Mid-stream timeouts get breaker bookkeeping + retry parity.
- Stream terminal events (response.failed / error) surface as retryable
  errors; response.incomplete is marked on the response.
- Malformed tool-call arguments produce parse_error instead of silently
  dispatching with empty input.
- Reactive 401 handling actually refreshes the token.
"""
from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

import pytest

from src.llm.codex_auth import CodexAuth, CodexAuthPool
from src.llm.openai_codex import CodexChatClient
from src.llm.types import ToolCall

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _creds(account_id: str, *, expires_at: int, refresh_token: str = "rt",
           access_token: str = "at", email: str | None = None) -> dict:
    data = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
        "account_id": account_id,
    }
    if email:
        data["email"] = email
    return data


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2))


class FakeContent:
    """Stands in for aiohttp's StreamReader: async-iterable for the SSE
    path AND ``.read(n)``-capable for the bounded error-body read.

    Models the REAL stream contract: ``read(n)`` returns at most *n*
    bytes from the current position (one queued chunk at a time when the
    body is chunked), advances, and returns ``b""`` at EOF — a
    position-less fake here previously validated a truncation bug.
    """

    def __init__(self, lines: list[str], body: bytes, chunks: list[bytes] | None = None):
        self._lines = list(lines)
        self._chunks = list(chunks) if chunks is not None else ([body] if body else [])

    def __aiter__(self):
        return self._iter()

    async def _iter(self):
        for line in self._lines:
            yield line.encode()

    async def read(self, n: int = -1) -> bytes:
        if not self._chunks:
            return b""
        if n < 0:
            data, self._chunks = b"".join(self._chunks), []
            return data
        chunk = self._chunks[0]
        data, rest = chunk[:n], chunk[n:]
        if rest:
            self._chunks[0] = rest
        else:
            self._chunks.pop(0)
        return data


class FakeResp:
    """Minimal aiohttp response stand-in for the streaming paths."""

    def __init__(
        self,
        status: int,
        body: bytes = b"",
        sse_lines: list[str] | None = None,
        headers: dict | None = None,
        chunks: list[bytes] | None = None,
    ):
        self.status = status
        self._body = body if chunks is None else b"".join(chunks)
        self.headers = headers or {}
        self.content = FakeContent(sse_lines or [], body, chunks=chunks)

    async def read(self) -> bytes:
        return self._body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class FakeSession:
    """Yields scripted responses (or raises scripted exceptions) per post()."""

    def __init__(self, script: list):
        self._script = list(script)
        self.closed = False
        self.calls = 0

    def post(self, *args, **kwargs):
        self.calls += 1
        item = self._script.pop(0) if self._script else self._script_exhausted()
        if isinstance(item, Exception):
            return _RaisingCM(item)
        return item

    @staticmethod
    def _script_exhausted():
        raise AssertionError("FakeSession script exhausted — unexpected extra request")


class _RaisingCM:
    def __init__(self, exc: Exception):
        self._exc = exc

    async def __aenter__(self):
        raise self._exc

    async def __aexit__(self, *exc):
        return False


class FakeSingleAuth:
    """Bare single-account auth (the non-pool code path)."""

    def __init__(self):
        self.limited = False

    async def get_access_token(self) -> str:
        return "tok"

    def get_account_id(self):
        return None

    def mark_rate_limited(self, seconds: float = 60):
        self.limited = True


def _client(auth=None, max_retries: int = 1) -> CodexChatClient:
    return CodexChatClient(
        auth=auth or FakeSingleAuth(),
        model="gpt-test",
        max_retries=max_retries,
        retry_base_delay=0.001,
        retry_max_delay=0.002,
    )


def _sse(events: list[dict], done: bool = True) -> list[str]:
    lines = [f"data: {json.dumps(e)}\n" for e in events]
    if done:
        lines.append("data: [DONE]\n")
    return lines


TEXT_OK_SSE = _sse([
    {"type": "response.output_text.delta", "delta": "hello"},
    {"type": "response.completed", "response": {}},
])


# ---------------------------------------------------------------------------
# Token persistence (Tier 0.2)
# ---------------------------------------------------------------------------

def test_newer_shadow_survives_init_and_syncs_canonical(tmp_path):
    canonical = tmp_path / "codex_auth.json"
    _write_json(canonical, [
        _creds("acct-A", expires_at=100, refresh_token="stale-A"),
        _creds("acct-B", expires_at=100, refresh_token="stale-B"),
    ])
    # Account 0's shadow holds rotated (newer) tokens from a running session.
    rotated = _creds("acct-A", expires_at=200, refresh_token="rotated-A")
    _write_json(tmp_path / "codex_auth_0.json", rotated)

    pool = CodexAuthPool(str(canonical))

    assert pool.account_count == 2
    # Shadow was NOT clobbered with the stale canonical creds.
    shadow = json.loads((tmp_path / "codex_auth_0.json").read_text())
    assert shadow["refresh_token"] == "rotated-A"
    # Canonical was pulled up to date from the shadow.
    canon = json.loads(canonical.read_text())
    assert canon[0]["refresh_token"] == "rotated-A"
    # The untouched account still synced canonical -> shadow as before.
    shadow1 = json.loads((tmp_path / "codex_auth_1.json").read_text())
    assert shadow1["refresh_token"] == "stale-B"


def test_newer_canonical_overwrites_shadow(tmp_path):
    """Re-auth via WebUI rewrites canonical — that must win over an old shadow."""
    canonical = tmp_path / "codex_auth.json"
    _write_json(canonical, [_creds("acct-A", expires_at=500, refresh_token="fresh-login")])
    _write_json(tmp_path / "codex_auth_0.json",
                _creds("acct-A", expires_at=100, refresh_token="old-rotation"))

    CodexAuthPool(str(canonical))

    shadow = json.loads((tmp_path / "codex_auth_0.json").read_text())
    assert shadow["refresh_token"] == "fresh-login"


def test_different_account_at_slot_canonical_wins(tmp_path):
    """After an account deletion the slot holds a different account — the old
    shadow must not resurrect the deleted account, however new its tokens."""
    canonical = tmp_path / "codex_auth.json"
    _write_json(canonical, [_creds("acct-B", expires_at=100, refresh_token="B-token")])
    _write_json(tmp_path / "codex_auth_0.json",
                _creds("acct-DELETED", expires_at=99999, refresh_token="zombie"))

    CodexAuthPool(str(canonical))

    shadow = json.loads((tmp_path / "codex_auth_0.json").read_text())
    assert shadow["account_id"] == "acct-B"
    assert shadow["refresh_token"] == "B-token"


def test_account_save_writes_back_to_canonical(tmp_path):
    canonical = tmp_path / "codex_auth.json"
    _write_json(canonical, [
        _creds("acct-A", expires_at=100),
        _creds("acct-B", expires_at=100),
    ])
    pool = CodexAuthPool(str(canonical))

    # Simulate what _refresh() does after rotating tokens.
    new_creds = _creds("acct-B", expires_at=999, refresh_token="rotated-B")
    pool._accounts[1]._save(new_creds)

    canon = json.loads(canonical.read_text())
    assert canon[1]["refresh_token"] == "rotated-B"
    assert canon[1]["expires_at"] == 999
    assert canon[0]["refresh_token"] == "rt"  # sibling untouched


def test_reload_preserves_rotated_tokens(tmp_path):
    """The original bug: reload/restart clobbered every shadow with stale
    canonical creds, burning the single-use refresh tokens."""
    canonical = tmp_path / "codex_auth.json"
    _write_json(canonical, [_creds("acct-A", expires_at=100, refresh_token="login-day")])
    pool = CodexAuthPool(str(canonical))

    rotated = _creds("acct-A", expires_at=5000, refresh_token="rotated")
    pool._accounts[0]._save(rotated)

    pool.reload()

    shadow = json.loads((tmp_path / "codex_auth_0.json").read_text())
    assert shadow["refresh_token"] == "rotated"
    canon = json.loads(canonical.read_text())
    assert canon[0]["refresh_token"] == "rotated"


# ---------------------------------------------------------------------------
# Request-pinned account marking (2.1)
# ---------------------------------------------------------------------------

def _mem_pool(n: int) -> CodexAuthPool:
    pool = CodexAuthPool.__new__(CodexAuthPool)
    pool._path = Path("/nonexistent/codex_auth.json")
    pool._accounts = []
    pool._current_index = 0
    pool._pool_lock = asyncio.Lock()
    for i in range(n):
        auth = CodexAuth.__new__(CodexAuth)
        auth._path = Path(f"/nonexistent/codex_auth_{i}.json")
        auth._credentials = _creds(f"acct-{i}", expires_at=int(time.time()) + 9999,
                                   access_token=f"tok-{i}", email=f"a{i}@x.com")
        auth._refresh_lock = asyncio.Lock()
        auth.on_save = None
        pool._accounts.append(auth)
    return pool


async def test_acquire_returns_pinned_pair_and_index():
    pool = _mem_pool(3)
    token, account_id, idx = await pool.acquire()
    assert (token, account_id, idx) == ("tok-0", "acct-0", 0)


async def test_mark_limited_penalizes_pinned_account_not_current():
    pool = _mem_pool(3)
    _, _, idx = await pool.acquire()  # request pinned to account 0

    # Concurrent traffic rotated the pool to account 1 in the meantime.
    pool._current_index = 1

    await pool.mark_limited(idx)

    assert pool._accounts[0].is_rate_limited() is True      # the real offender
    assert pool._accounts[1].is_rate_limited() is False     # healthy, untouched
    assert pool._current_index == 1  # no spurious extra rotation


async def test_mark_limited_rotates_when_pinned_is_current():
    pool = _mem_pool(3)
    await pool.mark_limited(0)
    assert pool._accounts[0].is_rate_limited() is True
    assert pool._current_index == 1


async def test_mark_auth_failed_pinned_not_current_keeps_position():
    pool = _mem_pool(3)
    pool._current_index = 2
    rotated = await pool.mark_auth_failed(0)
    assert rotated is True
    assert pool._accounts[0].is_rate_limited() is True
    assert pool._current_index == 2


async def test_acquire_skips_rate_limited_accounts():
    pool = _mem_pool(3)
    pool._accounts[0].mark_rate_limited()
    token, account_id, idx = await pool.acquire()
    assert idx == 1
    assert token == "tok-1"


async def test_all_rate_limited_raises_distinct_error():
    pool = _mem_pool(2)
    for acct in pool._accounts:
        acct.mark_rate_limited()
    with pytest.raises(RuntimeError, match="rate-limited or backing off"):
        await pool.acquire()


async def test_acquire_does_not_hold_pool_lock_during_refresh():
    """A slow token refresh on one account must not block the pool."""
    pool = _mem_pool(2)
    gate = asyncio.Event()

    async def slow_token():
        await gate.wait()
        return "slow-tok"

    pool._accounts[0].get_access_token = slow_token  # type: ignore[method-assign]

    task = asyncio.create_task(pool.acquire())
    await asyncio.sleep(0.01)
    assert not task.done()

    # The pool lock must be free while account 0 refreshes.
    assert pool._pool_lock.locked() is False
    async with pool._pool_lock:
        pass

    gate.set()
    token, _, idx = await task
    assert (token, idx) == ("slow-tok", 0)


# ---------------------------------------------------------------------------
# Reactive 401 refresh (CodexAuth.force_refresh)
# ---------------------------------------------------------------------------

async def test_force_refresh_skips_when_token_already_rotated():
    auth = CodexAuth.__new__(CodexAuth)
    auth._path = Path("/nonexistent")
    auth._credentials = {"access_token": "new", "refresh_token": "r"}
    auth._refresh_lock = asyncio.Lock()
    auth.on_save = None

    async def boom(creds):
        raise AssertionError("_refresh must not be called when token already rotated")

    auth._refresh = boom  # type: ignore[method-assign]
    assert await auth.force_refresh(stale_token="old") is True


async def test_force_refresh_refreshes_and_reports_failure():
    auth = CodexAuth.__new__(CodexAuth)
    auth._path = Path("/nonexistent")
    auth._credentials = {"access_token": "stale", "refresh_token": "r"}
    auth._refresh_lock = asyncio.Lock()
    auth.on_save = None

    calls = []

    async def fake_refresh(creds):
        calls.append(creds["access_token"])

    auth._refresh = fake_refresh  # type: ignore[method-assign]
    assert await auth.force_refresh(stale_token="stale") is True
    assert calls == ["stale"]

    async def failing_refresh(creds):
        raise RuntimeError("invalid_grant")

    auth._refresh = failing_refresh  # type: ignore[method-assign]
    assert await auth.force_refresh(stale_token="stale") is False


# ---------------------------------------------------------------------------
# Circuit breaker single-count (2.2) + timeout parity
# ---------------------------------------------------------------------------

async def test_terminal_429_records_single_breaker_failure(monkeypatch):
    client = _client(max_retries=1)
    session = FakeSession([FakeResp(429, body=b"limited")])
    monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))

    with pytest.raises(RuntimeError, match="429"):
        await client._stream_request({"model": "m"})

    assert client.breaker._failure_count == 1  # was 2 before the fix


async def test_terminal_500_records_single_breaker_failure(monkeypatch):
    client = _client(max_retries=1)
    session = FakeSession([FakeResp(500, body=b"boom")])
    monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))

    with pytest.raises(RuntimeError, match="500"):
        await client._stream_request({"model": "m"})

    assert client.breaker._failure_count == 1


async def test_retried_429_then_success_counts_once_and_resets(monkeypatch):
    client = _client(max_retries=2)
    session = FakeSession([
        FakeResp(429, body=b"limited"),
        FakeResp(200, sse_lines=TEXT_OK_SSE),
    ])
    monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))

    text = await client._stream_request({"model": "m"})
    assert text == "hello"
    assert client.breaker._failure_count == 0  # success reset
    assert client.auth.limited is True  # 429 marked the account


async def test_mid_stream_timeout_hits_breaker_and_retries(monkeypatch):
    client = _client(max_retries=2)
    session = FakeSession([
        TimeoutError(),
        FakeResp(200, sse_lines=TEXT_OK_SSE),
    ])
    monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))

    text = await client._stream_request({"model": "m"})
    assert text == "hello"
    assert session.calls == 2


async def test_terminal_timeout_raises_wrapped_error(monkeypatch):
    client = _client(max_retries=1)
    session = FakeSession([TimeoutError()])
    monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))

    with pytest.raises(RuntimeError, match="connection failed"):
        await client._stream_request({"model": "m"})
    assert client.breaker._failure_count == 1


def _async_return(value):
    async def _coro():
        return value
    return _coro()


# ---------------------------------------------------------------------------
# Stream terminal events + malformed args
# ---------------------------------------------------------------------------

async def test_response_failed_event_is_retryable_error(monkeypatch):
    client = _client(max_retries=2)
    session = FakeSession([
        FakeResp(
            200,
            sse_lines=_sse([{"type": "response.failed", "response": {"error": "x"}}], done=False),
        ),
        FakeResp(200, sse_lines=TEXT_OK_SSE),
    ])
    monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))

    text = await client._stream_request({"model": "m"})
    assert text == "hello"
    assert session.calls == 2


async def test_response_failed_terminal_raises(monkeypatch):
    client = _client(max_retries=1)
    session = FakeSession([
        FakeResp(200, sse_lines=_sse([{"type": "response.failed", "response": {}}], done=False)),
    ])
    monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))

    with pytest.raises(RuntimeError, match="stream failed"):
        await client._stream_request({"model": "m"})


async def test_incomplete_marks_stop_reason_keeps_partial_text():
    client = _client()
    resp = FakeResp(200, sse_lines=_sse([
        {"type": "response.output_text.delta", "delta": "partial"},
        {"type": "response.incomplete",
         "response": {"incomplete_details": {"reason": "max_output_tokens"}}},
    ]))
    result = await client._read_tool_stream(resp)
    assert result.text == "partial"
    assert result.stop_reason == "incomplete"
    assert result.is_tool_use is False


async def test_malformed_tool_args_set_parse_error():
    client = _client()
    resp = FakeResp(200, sse_lines=_sse([
        {"type": "response.output_item.added", "output_index": 0,
         "item": {"type": "function_call", "call_id": "c1", "name": "run_command"}},
        {"type": "response.function_call_arguments.delta", "output_index": 0,
         "delta": '{"command": "ls'},
        {"type": "response.function_call_arguments.done", "output_index": 0},
        {"type": "response.completed", "response": {}},
    ]))
    result = await client._read_tool_stream(resp)
    assert len(result.tool_calls) == 1
    tc = result.tool_calls[0]
    assert tc.input == {}
    assert tc.parse_error is not None
    assert "malformed tool arguments" in tc.parse_error


async def test_malformed_tool_args_in_completed_fallback_set_parse_error():
    """The response.completed fallback path (used when arguments.done/output_item.done
    never arrived) must also flag malformed JSON instead of coercing to {}."""
    client = _client()
    resp = FakeResp(200, sse_lines=_sse([
        {"type": "response.completed", "response": {"output": [
            {"type": "function_call", "call_id": "c9", "name": "run_command",
             "arguments": '{"command": "ls'},  # truncated / invalid JSON
        ]}},
    ]))
    result = await client._read_tool_stream(resp)
    assert len(result.tool_calls) == 1
    tc = result.tool_calls[0]
    assert tc.input == {}
    assert tc.parse_error is not None
    assert "malformed tool arguments" in tc.parse_error


async def test_valid_tool_args_in_completed_fallback_have_no_parse_error():
    client = _client()
    resp = FakeResp(200, sse_lines=_sse([
        {"type": "response.completed", "response": {"output": [
            {"type": "function_call", "call_id": "c9", "name": "run_command",
             "arguments": '{"command": "ls"}'},
        ]}},
    ]))
    result = await client._read_tool_stream(resp)
    tc = result.tool_calls[0]
    assert tc.input == {"command": "ls"}
    assert tc.parse_error is None


async def test_valid_tool_args_have_no_parse_error():
    client = _client()
    resp = FakeResp(200, sse_lines=_sse([
        {"type": "response.output_item.added", "output_index": 0,
         "item": {"type": "function_call", "call_id": "c1", "name": "run_command"}},
        {"type": "response.function_call_arguments.delta", "output_index": 0,
         "delta": '{"command": "ls"}'},
        {"type": "response.function_call_arguments.done", "output_index": 0},
        {"type": "response.completed", "response": {}},
    ]))
    result = await client._read_tool_stream(resp)
    tc = result.tool_calls[0]
    assert tc.input == {"command": "ls"}
    assert tc.parse_error is None
    assert result.stop_reason == "tool_use"


def test_toolcall_parse_error_defaults_none():
    tc = ToolCall(id="1", name="t", input={})
    assert tc.parse_error is None


# ---------------------------------------------------------------------------
# Reactive 401 end-to-end through the provider
# ---------------------------------------------------------------------------

async def test_generic_401_forces_refresh_and_retries_same_account(tmp_path, monkeypatch):
    canonical = tmp_path / "codex_auth.json"
    _write_json(canonical, [_creds("acct-A", expires_at=int(time.time()) + 9999,
                                   access_token="stale-tok")])
    pool = CodexAuthPool(str(canonical))
    refreshed = []

    async def fake_force_refresh(stale_token=None):
        refreshed.append(stale_token)
        return True

    pool._accounts[0].force_refresh = fake_force_refresh  # type: ignore[method-assign]

    client = _client(auth=pool, max_retries=2)
    session = FakeSession([
        FakeResp(401, body=b"unauthorized"),
        FakeResp(200, sse_lines=TEXT_OK_SSE),
    ])
    monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))

    text = await client._stream_request({"model": "m"})
    assert text == "hello"
    assert refreshed == ["stale-tok"]
    # Same account retried — no rotation, no rate-limit marking.
    assert pool._accounts[0].is_rate_limited() is False


# ---------------------------------------------------------------------------
# max_retries=0 semantics (PR #225 activation regression)
# ---------------------------------------------------------------------------

async def test_zero_max_retries_still_makes_one_attempt(monkeypatch):
    """max_retries=0 must mean "one attempt, no retries" — never "make no
    request at all". RetryConfig accepts 0 and was inert before it was
    plumbed from config; an unclamped range(0) would silently suppress
    every Codex call and fail with "after 0 retries: None"."""
    client = _client(max_retries=0)
    session = FakeSession([FakeResp(200, sse_lines=TEXT_OK_SSE)])
    monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))

    text = await client._stream_request({"model": "m"})
    assert text == "hello"
    assert session.calls == 1


async def test_zero_max_retries_failure_raises_without_retry(monkeypatch):
    client = _client(max_retries=0)
    session = FakeSession([TimeoutError()])
    monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))

    with pytest.raises(RuntimeError, match="connection failed"):
        await client._stream_request({"model": "m"})
    assert session.calls == 1
