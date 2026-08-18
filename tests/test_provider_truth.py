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

    def test_publication_failure_cleans_temp_and_degrades(self, tmp_path, caplog, monkeypatch):
        """A failure after the temp file exists must not leave debris or a key."""

        def failing_link(src, dst):
            raise OSError("simulated link failure")

        monkeypatch.setattr("src.llm.account_key.os.link", failing_link)
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
        key_path.chmod(0o600)
        with caplog.at_level(logging.WARNING, logger="odin.llm"):
            key = opaque_account_key("acct-a", key_path=key_path)
        assert key is None
        # Replacing weak material would decorrelate all prior evidence.
        assert key_path.read_bytes() == b"short"


class TestPersistedKeyContract:
    """Round-1 blocker #3: only the exact generated shape is trusted."""

    def _valid_key(self, tmp_path):
        key_path = tmp_path / "k.secret"
        first = opaque_account_key("acct-a", key_path=key_path)
        assert first is not None
        _key_cache.clear()
        return key_path, first

    def test_exact_32_bytes_accepted_but_not_33(self, tmp_path):
        key_path, first = self._valid_key(tmp_path)
        assert opaque_account_key("acct-a", key_path=key_path) == first
        _key_cache.clear()
        key_path.write_bytes(key_path.read_bytes() + b"x")
        key_path.chmod(0o600)
        assert opaque_account_key("acct-a", key_path=key_path) is None
        assert len(key_path.read_bytes()) == 33  # refused, never repaired

    def test_group_readable_material_fails_closed_and_stays(self, tmp_path, caplog):
        key_path, _ = self._valid_key(tmp_path)
        key_path.chmod(0o644)
        with caplog.at_level(logging.WARNING, logger="odin.llm"):
            assert opaque_account_key("acct-a", key_path=key_path) is None
        assert stat.S_IMODE(key_path.stat().st_mode) == 0o644  # untouched
        assert any("not 0600" in r.getMessage() for r in caplog.records)

    def test_symlink_final_component_refused(self, tmp_path):
        real = tmp_path / "real.key"
        opaque_account_key("acct-a", key_path=real)
        _key_cache.clear()
        link = tmp_path / "k.secret"
        link.symlink_to(real)
        assert opaque_account_key("acct-a", key_path=link) is None
        assert link.is_symlink()  # never replaced or followed

    def test_foreign_owner_refused(self, tmp_path, monkeypatch, caplog):
        import os as _os

        key_path, _ = self._valid_key(tmp_path)
        real_uid = _os.getuid()
        monkeypatch.setattr("src.llm.account_key.os.getuid", lambda: real_uid + 1)
        with caplog.at_level(logging.WARNING, logger="odin.llm"):
            assert opaque_account_key("acct-a", key_path=key_path) is None
        assert any("not owned" in r.getMessage() for r in caplog.records)

    def test_parent_directory_fsynced_on_establish(self, tmp_path, monkeypatch):
        synced: list = []
        monkeypatch.setattr(
            "src.llm.account_key._fsync_parent", lambda p: synced.append(p)
        )
        key_path = tmp_path / "k.secret"
        assert opaque_account_key("acct-a", key_path=key_path) is not None
        assert synced == [key_path]

    def test_fsync_parent_syncs_a_directory_fd(self, tmp_path, monkeypatch):
        import os as _os

        from src.llm.account_key import _fsync_parent

        seen: list[int] = []
        real_fsync = _os.fsync

        def recording_fsync(fd):
            seen.append(fd)
            return real_fsync(fd)

        monkeypatch.setattr("src.llm.account_key.os.fsync", recording_fsync)
        (tmp_path / "k.secret").write_bytes(b"x")
        _fsync_parent(tmp_path / "k.secret")
        assert len(seen) == 1


class TestKeyEdgeBranches:
    def test_directory_at_key_path_refused(self, tmp_path, caplog):
        key_path = tmp_path / "k.secret"
        key_path.mkdir()
        with caplog.at_level(logging.WARNING, logger="odin.llm"):
            assert opaque_account_key("acct-a", key_path=key_path) is None
        assert any("not a regular file" in r.getMessage() for r in caplog.records)

    def test_read_oserror_degrades(self, tmp_path, monkeypatch, caplog):
        key_path = tmp_path / "k.secret"
        opaque_account_key("acct-a", key_path=key_path)
        _key_cache.clear()

        def failing_read(fd, n):
            raise OSError("simulated read failure")

        monkeypatch.setattr("src.llm.account_key.os.read", failing_read)
        with caplog.at_level(logging.WARNING, logger="odin.llm"):
            assert opaque_account_key("acct-a", key_path=key_path) is None
        assert any("Could not read account key" in r.getMessage() for r in caplog.records)

    def test_link_race_loser_converges_deterministically(self, tmp_path, monkeypatch):
        """Single-process pin of the loser branch: publication finds a winner
        already in place and adopts the winner's material."""
        key_path = tmp_path / "k.secret"
        winner = opaque_account_key("acct-a", key_path=key_path)
        winner_material = key_path.read_bytes()
        key_path.unlink()
        _key_cache.clear()

        def racing_link(src, dst):
            # The "other process" wins between our temp write and publication.
            key_path.write_bytes(winner_material)
            key_path.chmod(0o600)
            raise FileExistsError("winner already published")

        monkeypatch.setattr("src.llm.account_key.os.link", racing_link)
        assert opaque_account_key("acct-a", key_path=key_path) == winner
        assert key_path.read_bytes() == winner_material  # winner untouched

    def test_totality_net_catches_derivation_failure(self, tmp_path, monkeypatch, caplog):
        def exploding_hmac(*args, **kwargs):
            raise RuntimeError("simulated derivation failure")

        monkeypatch.setattr("src.llm.account_key.hmac.new", exploding_hmac)
        with caplog.at_level(logging.ERROR, logger="odin.llm"):
            assert opaque_account_key("acct-a", key_path=tmp_path / "k.secret") is None
        assert any("evidence forfeited" in r.getMessage() for r in caplog.records)


class TestIdentityNormalization:
    """Round-1 blocker #2: identities that cannot be UTF-8 encoded disqualify."""

    def test_unpaired_surrogate_returns_none_without_raising(self, tmp_path, caplog):
        with caplog.at_level(logging.WARNING, logger="odin.llm"):
            key = opaque_account_key(
                "acct-\ud800", key_path=tmp_path / "k.secret"
            )
        assert key is None
        assert not (tmp_path / "k.secret").exists()  # no material minted
        assert any("not UTF-8" in r.getMessage() for r in caplog.records)


def _concurrent_worker(path_str, barrier, queue):
    from src.llm.account_key import opaque_account_key as derive

    barrier.wait()
    queue.put(derive("acct-a", key_path=path_str))


class TestConcurrentFirstUse:
    """Round-1 blocker #1: the exclusive-winner protocol converges."""

    def test_eight_processes_one_key(self, tmp_path):
        import multiprocessing as mp

        ctx = mp.get_context("fork")
        barrier = ctx.Barrier(8)
        queue = ctx.Queue()
        key_path = tmp_path / "k.secret"
        workers = [
            ctx.Process(
                target=_concurrent_worker, args=(str(key_path), barrier, queue)
            )
            for _ in range(8)
        ]
        for worker in workers:
            worker.start()
        keys = [queue.get(timeout=30) for _ in range(8)]
        for worker in workers:
            worker.join(timeout=30)
            assert worker.exitcode == 0
        assert None not in keys
        assert len(set(keys)) == 1
        # A fresh process (simulated: cold cache) reads the same winner.
        _key_cache.clear()
        assert opaque_account_key("acct-a", key_path=key_path) == keys[0]
        assert len(key_path.read_bytes()) == 32
        assert stat.S_IMODE(key_path.stat().st_mode) == 0o600
        # No stray temp files survive the race.
        assert list(tmp_path.glob(".k.secret.*")) == []


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


class _SurrogateAuth(FakeSingleAuth):
    def get_account_id(self):
        return "acct-\ud800"  # unpaired surrogate: json.loads accepts these


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

    async def test_surrogate_identity_none_on_success_path(self, tmp_path, monkeypatch):
        """Blocker #2 end-to-end: a healthy response is never replaced by
        UnicodeEncodeError — the stamp degrades to None."""
        monkeypatch.setattr(
            "src.llm.account_key.DEFAULT_KEY_PATH", tmp_path / "k.secret"
        )
        client = _client(auth=_SurrogateAuth())
        session = FakeSession([
            FakeResp(200, sse_lines=_sse([
                {"type": "response.output_text.delta", "delta": "ok"},
                {"type": "response.completed",
                 "response": {"output": [], "usage": {"input_tokens": 10}}},
            ])),
        ])
        monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))
        result = await client._stream_tool_request({"model": "m"})
        assert result.text == "ok"
        assert result.account_key is None

    async def test_surrogate_identity_none_on_overflow_path(self, tmp_path, monkeypatch):
        """Blocker #2 end-to-end: the intended structural overflow is raised,
        not a UnicodeEncodeError from evidence stamping."""
        monkeypatch.setattr(
            "src.llm.account_key.DEFAULT_KEY_PATH", tmp_path / "k.secret"
        )
        client = _client(auth=_SurrogateAuth(), max_retries=1)
        session = FakeSession([
            FakeResp(200, sse_lines=_sse([
                {"type": "response.failed",
                 "response": {"error": {"type": "invalid_request_error",
                                        "code": "context_length_exceeded"}}},
            ], done=False)),
        ])
        monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))
        with pytest.raises(LLMRequestError) as excinfo:
            await client._stream_tool_request({"model": "m"})
        assert excinfo.value.code == "context_length_exceeded"
        assert excinfo.value.account_key is None

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
