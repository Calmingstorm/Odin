"""Codex quota capture: strict header parsing, account-keyed tracking, and
request-pinned attribution inside the client."""
from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from src.llm.codex_auth import CodexAuthPool
from src.llm.codex_quota import (
    QUOTA_HEADER_ALLOWLIST,
    CodexQuotaTracker,
    parse_quota_headers,
)
from src.llm.openai_codex import CodexChatClient

NOW = 1_700_000_000.0


def _headers(**overrides):
    base = {
        "x-codex-primary-used-percent": "37.5",
        "x-codex-primary-window-minutes": "300",
        "x-codex-primary-reset-after-seconds": "255",
        "x-codex-secondary-used-percent": "12",
        "x-codex-secondary-window-minutes": "10080",
        "x-codex-secondary-reset-after-seconds": "587055",
        "x-codex-primary-over-secondary-limit-percent": "0",
        "x-codex-active-limit": "premium",
        "x-codex-plan-type": "team",
        "x-codex-credits-balance": "0",
        "x-codex-has-credits": "false",
        "x-codex-credits-unlimited": "false",
        "content-type": "text/event-stream",
        "x-request-id": "opaque-noise",
    }
    base.update(overrides)
    return base


# --------------------------------------------------------------------------
# parser
# --------------------------------------------------------------------------

def test_parse_windows_reset_after_becomes_absolute_deadline():
    snap = parse_quota_headers(_headers(), account_key="k1", observed_at=NOW)
    assert snap is not None
    assert snap.primary.used_percent == 37.5
    assert snap.primary.window_minutes == 300
    assert snap.primary.resets_at == NOW + 255
    assert snap.secondary.used_percent == 12
    assert snap.secondary.window_minutes == 10080
    assert snap.secondary.resets_at == NOW + 587055
    assert snap.over_secondary_percent == 0
    assert snap.active_limit == "premium"
    assert snap.plan_type == "team"
    assert snap.credits_balance == 0
    assert snap.has_credits is False
    assert snap.credits_unlimited is False
    assert snap.limit_reached_type is None
    assert snap.account_key == "k1"
    assert snap.observed_at == NOW


def test_parse_is_case_insensitive_and_accepts_multidict_items():
    upper = {k.upper(): v for k, v in _headers().items()}
    snap = parse_quota_headers(upper, account_key="k", observed_at=NOW)
    assert snap is not None and snap.primary.used_percent == 37.5
    # An items() iterable (aiohttp's CIMultiDictProxy shape) works too.
    snap2 = parse_quota_headers(list(_headers().items()), account_key="k", observed_at=NOW)
    assert snap2 == snap


def test_parse_returns_none_without_any_quota_window():
    assert parse_quota_headers({"content-type": "x"}, account_key="k", observed_at=NOW) is None
    assert parse_quota_headers(
        {"x-codex-plan-type": "team"}, account_key="k", observed_at=NOW
    ) is None


@pytest.mark.parametrize(
    "value", ["nan", "inf", "-1", "abc", "", " ", "1e400", "1" * 40, "100001"]
)
def test_parse_rejects_non_finite_or_out_of_range_percent(value):
    snap = parse_quota_headers(
        _headers(**{"x-codex-primary-used-percent": value}), account_key="k", observed_at=NOW
    )
    # secondary still parses; the malformed primary window is dropped, not zeroed
    assert snap is not None and snap.primary is None and snap.secondary is not None


def test_parse_reset_at_fallback_only_when_reset_after_absent():
    absolute = NOW + 900
    snap = parse_quota_headers(
        _headers(**{
            "x-codex-primary-reset-after-seconds": "",
            "x-codex-primary-reset-at": str(absolute),
        }),
        account_key="k",
        observed_at=NOW,
    )
    assert snap.primary.resets_at == absolute
    # reset-after wins when both are present (it decays correctly)
    snap2 = parse_quota_headers(
        _headers(**{"x-codex-primary-reset-at": str(absolute)}), account_key="k", observed_at=NOW
    )
    assert snap2.primary.resets_at == NOW + 255


def test_parse_bounded_text_and_booleans():
    snap = parse_quota_headers(
        _headers(**{
            "x-codex-active-limit": "x" * 41,
            "x-codex-plan-type": "te\x00am",
            "x-codex-has-credits": "TRUE",
            "x-codex-credits-unlimited": "maybe",
            "x-codex-rate-limit-reached-type": "primary",
            "x-codex-primary-window-minutes": "12.5",
        }),
        account_key="k",
        observed_at=NOW,
    )
    assert snap.active_limit is None
    assert snap.plan_type is None
    assert snap.has_credits is True
    assert snap.credits_unlimited is None
    assert snap.limit_reached_type == "primary"
    assert snap.primary.window_minutes is None


def test_parse_never_retains_unknown_headers():
    snap = parse_quota_headers(_headers(), account_key="k", observed_at=NOW)
    dumped = json.dumps(snap.to_dict())
    assert "opaque-noise" not in dumped and "event-stream" not in dumped
    assert all(name.startswith("x-codex-") for name in QUOTA_HEADER_ALLOWLIST)


# --------------------------------------------------------------------------
# tracker
# --------------------------------------------------------------------------

def test_tracker_records_per_account_and_views_current_first():
    clock = [NOW]
    tracker = CodexQuotaTracker(clock=lambda: clock[0])
    assert tracker.record_headers("a", _headers()) is not None
    clock[0] += 60
    recorded = tracker.record_headers("b", _headers(**{"x-codex-primary-used-percent": "5"}))
    assert recorded is not None
    view = tracker.view(current_key="a")
    assert view.current.account_key == "a"
    assert [snap.account_key for snap in view.others] == ["b"]
    # newest-first among others; current excluded
    clock[0] += 60
    tracker.record_headers("c", _headers())
    assert [s.account_key for s in tracker.view(current_key="a").others] == ["c", "b"]


def test_tracker_view_restricts_to_known_keys_and_forgets_missing():
    tracker = CodexQuotaTracker(clock=lambda: NOW)
    tracker.record_headers("a", _headers())
    tracker.record_headers("gone", _headers())
    view = tracker.view(current_key="a", known_keys=["a"])
    assert view.others == ()
    tracker.forget_missing(["a"])
    assert tracker.snapshot_for("gone") is None
    assert tracker.snapshot_for("a") is not None


def test_tracker_is_total_on_bad_input():
    tracker = CodexQuotaTracker(clock=lambda: NOW)
    assert tracker.record_headers(None, _headers()) is None
    assert tracker.record_headers("", _headers()) is None
    assert tracker.record_headers("a", None) is None
    assert tracker.record_headers("a", object()) is None  # not a mapping
    assert tracker.record_headers("a", {"content-type": "x"}) is None
    assert tracker.view(current_key="a").current is None


def test_tracker_evicts_oldest_beyond_cap():
    clock = [NOW]
    tracker = CodexQuotaTracker(clock=lambda: clock[0])
    for i in range(40):
        clock[0] += 1
        tracker.record_headers(f"k{i}", _headers())
    assert tracker.snapshot_for("k0") is None
    assert tracker.snapshot_for("k39") is not None
    assert len(tracker.view(current_key=None).others) == 32


# --------------------------------------------------------------------------
# pool ownership + display labels
# --------------------------------------------------------------------------

def _jwt(claims: dict) -> str:
    import base64

    def b64(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")

    return f"{b64({'alg': 'none'})}.{b64(claims)}."


def _pool(tmp_path, monkeypatch, labels):
    monkeypatch.setattr(
        "src.llm.account_key.DEFAULT_KEY_PATH", tmp_path / "account_key.secret"
    )
    creds = []
    for index, label in enumerate(labels):
        entry = {
            "access_token": _jwt(
                {"https://api.openai.com/auth": {"chatgpt_account_id": f"acct-{index}"}}
            ),
            "refresh_token": f"r{index}",
            "expires_at": NOW + 10_000,
            "account_id": f"acct-{index}",
            "email": f"secret{index}@example.invalid",
        }
        if label:
            entry["label"] = label
        creds.append(entry)
    path = tmp_path / "codex_auth.json"
    path.write_text(json.dumps(creds))
    return CodexAuthPool(str(path))


def test_pool_owns_tracker_and_labels_never_leak_email(tmp_path, monkeypatch):
    pool = _pool(tmp_path, monkeypatch, ["TOVDC", None])
    assert isinstance(pool.quota, CodexQuotaTracker)
    rows = pool.describe_accounts()
    assert [row["label"] for row in rows] == ["TOVDC", "account 2"]
    assert rows[0]["is_current"] and not rows[1]["is_current"]
    assert all(row["key"] and len(row["key"]) == 32 for row in rows)
    assert "example.invalid" not in json.dumps(rows)
    assert "acct-" not in json.dumps(rows)


def test_pool_quota_view_keys_to_current_and_drops_removed(tmp_path, monkeypatch):
    pool = _pool(tmp_path, monkeypatch, ["TOVDC", "Personal"])
    rows = pool.describe_accounts()
    pool.quota.record_headers(rows[1]["key"], _headers())
    pool.quota.record_headers("stale-key", _headers())
    view = pool.quota_view()
    assert view.current_key == rows[0]["key"]
    assert view.current is None  # current account not yet observed
    assert [s.account_key for s in view.others] == [rows[1]["key"]]
    assert pool.quota.snapshot_for("stale-key") is None


# --------------------------------------------------------------------------
# client capture: pinned account, before status handling, total
# --------------------------------------------------------------------------

class _Recorder:
    def __init__(self):
        self.calls = []

    def record_headers(self, key, headers):
        self.calls.append((key, dict(headers.items()) if headers is not None else None))


def _client_with_recorder(monkeypatch):
    recorder = _Recorder()
    auth = SimpleNamespace(quota=recorder, get_account_id=lambda: "acct-9")
    client = CodexChatClient(auth, "gpt-5.6-sol")  # type: ignore[arg-type]
    monkeypatch.setattr(
        "src.llm.account_key.opaque_account_key", lambda account_id, **_: f"key:{account_id}"
    )
    return client, recorder


def test_record_quota_headers_uses_pinned_account_key(monkeypatch):
    client, recorder = _client_with_recorder(monkeypatch)
    client._record_quota_headers(_headers(), "acct-9")
    assert recorder.calls[0][0] == "key:acct-9"
    assert recorder.calls[0][1]["x-codex-primary-used-percent"] == "37.5"


def test_record_quota_headers_is_total(monkeypatch):
    client, recorder = _client_with_recorder(monkeypatch)
    client._record_quota_headers(None, "acct-9")  # None headers reach the tracker unchanged
    assert recorder.calls[0] == ("key:acct-9", None)

    def boom(*_a, **_k):
        raise RuntimeError("tracker exploded")

    recorder.record_headers = boom
    client._record_quota_headers(_headers(), "acct-9")  # swallowed, never raises

    bare = CodexChatClient(SimpleNamespace(), "m")  # auth without a tracker
    bare._record_quota_headers(_headers(), "acct")  # no-op


@pytest.mark.asyncio
async def test_headers_recorded_before_status_handling_on_429(monkeypatch):
    """A 429 still yields quota for the account that was pinned for the attempt."""
    client, recorder = _client_with_recorder(monkeypatch)
    client.max_retries = 1

    class _Resp:
        status = 429
        headers = _headers(**{"x-codex-rate-limit-reached-type": "primary"})

        class content:  # noqa: N801 - mimics aiohttp's attribute
            @staticmethod
            async def read(*_a, **_k):
                return b'{"error": {"message": "slow down"}}'

            @staticmethod
            def iter_chunked(*_a, **_k):
                async def gen():
                    yield b'{"error": {"message": "slow down"}}'

                return gen()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    class _Session:
        closed = False

        def post(self, *_a, **_k):
            return _Resp()

    async def _get_session():
        return _Session()

    async def _acquire():
        return "tok", "acct-9", 0

    monkeypatch.setattr(client, "_get_session", _get_session)
    monkeypatch.setattr(client, "_acquire_auth", _acquire)

    async def _mark(_idx):
        return None

    monkeypatch.setattr(client, "_mark_limited", _mark)
    monkeypatch.setattr(
        "src.llm.openai_codex._read_error_body_bounded",
        _fake_error_body,
    )
    with pytest.raises(Exception):
        await client._stream_request({"model": "m"})
    assert recorder.calls and recorder.calls[0][0] == "key:acct-9"
    assert recorder.calls[0][1]["x-codex-rate-limit-reached-type"] == "primary"


async def _fake_error_body(_content):
    return b'{"error": {"message": "slow down"}}', False


# --------------------------------------------------------------------------
# guards that the snapshot shape alone cannot witness
# --------------------------------------------------------------------------

def test_header_reduction_keeps_only_allowlisted_names():
    from src.llm.codex_quota import _lower_headers

    reduced = _lower_headers(_headers(**{"X-Codex-Unknown-Thing": "1", "Set-Cookie": "s"}))
    assert set(reduced) <= QUOTA_HEADER_ALLOWLIST
    assert "x-codex-unknown-thing" not in reduced and "set-cookie" not in reduced
    # duplicates keep the first value; bytes values decode; non-text dropped
    reduced = _lower_headers(
        [
            ("x-codex-plan-type", b"team"),
            ("X-CODEX-PLAN-TYPE", "other"),
            ("x-codex-active-limit", None),
        ]
    )
    assert reduced == {"x-codex-plan-type": "team"}


@pytest.mark.asyncio
async def test_tool_stream_parses_cache_attribution_from_usage_details():
    from tests.test_openai_codex_client import _FakeResp, _sse

    completed = {
        "type": "response.completed",
        "response": {
            "output": [{"type": "message", "content": [{"text": "hi"}]}],
            "usage": {
                "input_tokens": 1000,
                "output_tokens": 5,
                "input_tokens_details": {"cached_tokens": 800, "cache_write_tokens": 100},
            },
        },
    }
    client = CodexChatClient(SimpleNamespace(), "m")
    result = await client._read_tool_stream(_FakeResp([_sse(completed)]))
    assert (result.cached_tokens, result.cache_write_tokens) == (800, 100)
    assert result.server_input_tokens == 1000

    # absent / malformed details ⇒ None, never zero
    for details in (None, {}, {"cached_tokens": -1}, {"cached_tokens": True}, "junk"):
        completed["response"]["usage"]["input_tokens_details"] = details
        result = await client._read_tool_stream(_FakeResp([_sse(completed)]))
        assert result.cached_tokens is None and result.cache_write_tokens is None


def test_display_name_falls_back_when_the_record_cannot_be_read(tmp_path, monkeypatch):
    pool = _pool(tmp_path, monkeypatch, ["TOVDC"])
    assert pool.account_display_name(0) == "TOVDC"
    assert pool.account_display_name(7) == "account 8"  # out of range → slot name
    pool._accounts[0]._load = lambda: (_ for _ in ()).throw(OSError("unreadable"))
    assert pool.account_display_name(0) == "account 1"


def test_empty_pool_describes_nothing_and_views_no_current(tmp_path, monkeypatch):
    monkeypatch.setattr("src.llm.account_key.DEFAULT_KEY_PATH", tmp_path / "k.secret")
    pool = CodexAuthPool(str(tmp_path / "missing.json"))
    assert pool.describe_accounts() == []
    view = pool.quota_view()
    assert view.current_key is None and view.current is None and view.others == ()
