"""Provider truth plumbing (context-budget campaign phase 2).

Pins the evidence contract: ``server_input_tokens`` parsed STRICTLY from
the server's own usage echoes (success and failure events; never the client
estimate), and an opaque installation-local account key stamped on both the
successful response and the structural overflow exception — per attempt,
never a raw identifier. Key trouble degrades evidence, never requests.
"""

from __future__ import annotations

import json
import logging
import stat

import pytest

from src.llm.account_key import _key_cache, opaque_account_key
from src.llm.errors import LLMRequestError
from src.llm.openai_codex import (
    _server_input_tokens_from_usage,
    _stream_error_from_event,
)
from src.llm.types import LLMResponse
from tests.test_codex_reliability import (
    FakeResp,
    FakeSession,
    FakeSingleAuth,
    _async_return,
    _client,
    _sse,
)


@pytest.fixture(autouse=True)
def _fresh_key_cache():
    _key_cache.clear()
    yield
    _key_cache.clear()


# ---------------------------------------------------------------------------
# Strict usage parsing
# ---------------------------------------------------------------------------
class TestStrictUsageParse:
    @pytest.mark.parametrize(
        "usage",
        [
            None,
            "not a dict",
            {},
            {"input_tokens": None},
            {"input_tokens": "12345"},
            {"input_tokens": 12.5},
            {"input_tokens": -1},
            {"input_tokens": True},  # bool is not evidence
            {"output_tokens": 5},
        ],
    )
    def test_rejects_everything_not_a_nonnegative_int(self, usage):
        assert _server_input_tokens_from_usage(usage) is None

    def test_accepts_exact_ints(self):
        assert _server_input_tokens_from_usage({"input_tokens": 0}) == 0
        assert _server_input_tokens_from_usage({"input_tokens": 921_601}) == 921_601


# ---------------------------------------------------------------------------
# Opaque account key
# ---------------------------------------------------------------------------
class TestOpaqueAccountKey:
    def test_deterministic_and_stable_across_cache_reset(self, tmp_path):
        key_path = tmp_path / "k.secret"
        first = opaque_account_key("acct-a", key_path=key_path)
        _key_cache.clear()  # simulate a process restart: re-read from disk
        second = opaque_account_key("acct-a", key_path=key_path)
        assert first is not None and first == second

    def test_distinct_accounts_distinct_keys(self, tmp_path):
        key_path = tmp_path / "k.secret"
        a = opaque_account_key("acct-a", key_path=key_path)
        b = opaque_account_key("acct-b", key_path=key_path)
        assert a != b

    def test_never_reversible_or_raw(self, tmp_path):
        key_path = tmp_path / "k.secret"
        account = "user-account-uuid-1234"
        key = opaque_account_key(account, key_path=key_path)
        assert key is not None
        assert account not in key
        assert key != account

    def test_installations_never_correlate(self, tmp_path):
        a = opaque_account_key("acct-a", key_path=tmp_path / "one.secret")
        b = opaque_account_key("acct-a", key_path=tmp_path / "two.secret")
        assert a != b

    def test_missing_identity_disqualifies(self, tmp_path):
        key_path = tmp_path / "k.secret"
        assert opaque_account_key(None, key_path=key_path) is None
        assert opaque_account_key("", key_path=key_path) is None
        assert opaque_account_key("   ", key_path=key_path) is None
        assert not key_path.exists()  # no identity ⇒ no key material created

    def test_key_file_created_0600(self, tmp_path):
        key_path = tmp_path / "k.secret"
        opaque_account_key("acct-a", key_path=key_path)
        assert stat.S_IMODE(key_path.stat().st_mode) == 0o600

    def test_unwritable_directory_degrades_to_none(self, tmp_path, caplog):
        blocked = tmp_path / "data"
        blocked.write_text("not a directory")
        with caplog.at_level(logging.WARNING, logger="odin.llm"):
            key = opaque_account_key("acct-a", key_path=blocked / "k.secret")
        assert key is None
        assert any("account key" in r.getMessage().lower() for r in caplog.records)

    def test_replace_failure_cleans_temp_and_degrades(self, tmp_path, caplog, monkeypatch):
        """A failure after the temp file exists must not leave debris or a key."""
        import os as _os

        real_replace = _os.replace

        def failing_replace(src, dst):
            if str(dst).endswith("k.secret"):
                raise OSError("simulated replace failure")
            return real_replace(src, dst)

        monkeypatch.setattr("src.llm.account_key.os.replace", failing_replace)
        key_path = tmp_path / "k.secret"
        with caplog.at_level(logging.WARNING, logger="odin.llm"):
            key = opaque_account_key("acct-a", key_path=key_path)
        assert key is None
        assert not key_path.exists()
        assert list(tmp_path.glob(".k.secret.*")) == []  # temp cleaned up
        assert any("Could not create account key" in r.getMessage() for r in caplog.records)

    def test_weak_material_refused_never_overwritten(self, tmp_path, caplog):
        key_path = tmp_path / "k.secret"
        key_path.write_bytes(b"short")
        with caplog.at_level(logging.WARNING, logger="odin.llm"):
            key = opaque_account_key("acct-a", key_path=key_path)
        assert key is None
        # Replacing weak material would decorrelate all prior evidence.
        assert key_path.read_bytes() == b"short"


# ---------------------------------------------------------------------------
# Stream-event evidence
# ---------------------------------------------------------------------------
class TestFailureEventUsage:
    def test_failure_event_usage_parsed_when_present(self):
        exc = _stream_error_from_event(
            "response.failed",
            {
                "response": {
                    "error": {"type": "invalid_request_error", "code": "context_length_exceeded"},
                    "usage": {"input_tokens": 372_101},
                }
            },
        )
        assert exc.server_input_tokens == 372_101

    def test_failure_event_without_usage_is_none(self):
        exc = _stream_error_from_event(
            "error",
            {"error": {"type": "invalid_request_error", "code": "context_length_exceeded"}},
        )
        assert exc.server_input_tokens is None

    def test_malformed_failure_usage_is_none(self):
        exc = _stream_error_from_event(
            "response.failed",
            {
                "response": {
                    "error": {"code": "context_length_exceeded"},
                    "usage": {"input_tokens": "372101"},
                }
            },
        )
        assert exc.server_input_tokens is None


class TestCompletedEventUsage:
    async def test_completed_usage_stamped_on_response(self):
        client = _client()
        resp = FakeResp(200, sse_lines=_sse([
            {"type": "response.output_text.delta", "delta": "hello"},
            {"type": "response.completed",
             "response": {"output": [], "usage": {"input_tokens": 917_506}}},
        ]))
        result = await client._read_tool_stream(resp)
        assert result.server_input_tokens == 917_506

    async def test_absent_usage_stays_none_and_estimate_untouched(self):
        client = _client()
        resp = FakeResp(200, sse_lines=_sse([
            {"type": "response.output_text.delta", "delta": "hello"},
            {"type": "response.completed", "response": {"output": []}},
        ]))
        result = await client._read_tool_stream(resp)
        assert result.server_input_tokens is None
        # The estimate field is a separate concern with unchanged semantics.
        assert result.input_tokens == 0


# ---------------------------------------------------------------------------
# End-to-end stamping through the retry engine
# ---------------------------------------------------------------------------
class _AccountAuth(FakeSingleAuth):
    def get_account_id(self):
        return "acct-uuid-1"


class TestSendWithRetriesStamping:
    async def test_success_carries_account_key_and_server_usage(
        self, tmp_path, monkeypatch
    ):
        monkeypatch.setattr(
            "src.llm.account_key.DEFAULT_KEY_PATH", tmp_path / "k.secret"
        )
        client = _client(auth=_AccountAuth())
        session = FakeSession([
            FakeResp(200, sse_lines=_sse([
                {"type": "response.output_text.delta", "delta": "ok"},
                {"type": "response.completed",
                 "response": {"output": [], "usage": {"input_tokens": 1234}}},
            ])),
        ])
        monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))
        result = await client._stream_tool_request({"model": "m"})
        assert isinstance(result, LLMResponse)
        assert result.server_input_tokens == 1234
        expected = opaque_account_key("acct-uuid-1", key_path=tmp_path / "k.secret")
        assert result.account_key == expected
        assert "acct-uuid-1" not in json.dumps(result.account_key)

    async def test_overflow_exception_carries_evidence(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            "src.llm.account_key.DEFAULT_KEY_PATH", tmp_path / "k.secret"
        )
        client = _client(auth=_AccountAuth(), max_retries=1)
        session = FakeSession([
            FakeResp(200, sse_lines=_sse([
                {"type": "response.failed",
                 "response": {
                     "error": {"type": "invalid_request_error",
                               "code": "context_length_exceeded"},
                     "usage": {"input_tokens": 922_000},
                 }},
            ], done=False)),
        ])
        monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))
        with pytest.raises(LLMRequestError) as excinfo:
            await client._stream_tool_request({"model": "m"})
        exc = excinfo.value
        assert exc.code == "context_length_exceeded"
        assert exc.server_input_tokens == 922_000
        assert exc.account_key == opaque_account_key(
            "acct-uuid-1", key_path=tmp_path / "k.secret"
        )
        assert exc.model == "m"
        assert "acct-uuid-1" not in str(exc)

    async def test_missing_account_identity_stamps_none(self, monkeypatch):
        client = _client()  # FakeSingleAuth: account id None
        session = FakeSession([
            FakeResp(200, sse_lines=_sse([
                {"type": "response.output_text.delta", "delta": "ok"},
                {"type": "response.completed", "response": {"output": []}},
            ])),
        ])
        monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))
        result = await client._stream_tool_request({"model": "m"})
        assert result.account_key is None
