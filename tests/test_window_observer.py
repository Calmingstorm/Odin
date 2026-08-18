"""Passive window observer + downward clamps (campaign phase 5, plan §11).

Pins the evidence store's hostile-input safety and atomicity, the clamp
qualification matrix (same-account, same-request, server-authoritative
acceptance), downward-only merges under the 24h TTL, the forfeit-never-fail
invariant, resolver integration, all three surface hooks (chat, loop,
agent), and the management API.
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
from datetime import timedelta
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.llm import window_observer as wo
from src.llm.errors import LLMRequestError
from src.llm.window_observer import WindowObserver, WindowObserverMutationError

ACCT_A = "a" * 32
ACCT_B = "b" * 32


def _observer(tmp_path) -> WindowObserver:
    return WindowObserver(tmp_path / "context_windows.json")


def _overflow(
    *, tokens=930_001, key=ACCT_A, model="gpt-5.6-sol", code="context_length_exceeded"
) -> LLMRequestError:
    return LLMRequestError(
        "overflow",
        provider="codex",
        model=model,
        code=code,
        server_input_tokens=tokens,
        account_key=key,
    )


def _acceptance(*, tokens=408_004, key=ACCT_A, model="gpt-5.6-sol") -> SimpleNamespace:
    return SimpleNamespace(server_input_tokens=tokens, account_key=key, provenance_model=model)


class TestStoreLifecycle:
    async def test_fresh_store_round_trips_atomically(self, tmp_path):
        obs = _observer(tmp_path)
        assert obs.active_clamp("gpt-5.6-sol") is None
        await obs.record_rescue(overflow=_overflow(), response=_acceptance())
        assert obs.active_clamp("gpt-5.6-sol") == 408_004
        # Reload from disk: the persisted store carries the same evidence.
        again = _observer(tmp_path)
        assert again.active_clamp("gpt-5.6-sol") == 408_004
        record = again.view()["accounts"][ACCT_A]["models"]["gpt-5.6-sol"]
        assert record["lowest_rejection_bound"] == 930_001
        assert record["highest_accepted_input"] == 408_004
        assert record["overflow_occurrences"] == 1
        # No stray temp files behind the atomic replacement.
        names = {p.name for p in tmp_path.iterdir()}
        assert names == {"context_windows.json"}

    async def test_alias_models_share_one_canonical_record(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(model="codex-auto-review"),
            response=_acceptance(model="codex-auto-review"),
        )
        assert obs.active_clamp("gpt-5.6-luna") == 408_004
        assert obs.active_clamp("codex-auto-review") == 408_004
        assert "gpt-5.6-luna" in obs.view()["accounts"][ACCT_A]["models"]


class TestHostileStoreInputs:
    """The filesystem-contract sweep: every hostile shape at the store path
    loads empty (quarantined), never blocks, never crashes construction."""

    def test_fifo_at_store_path_never_blocks(self, tmp_path):
        path = tmp_path / "context_windows.json"
        os.mkfifo(path)
        obs = WindowObserver(path)
        assert obs.active_clamp("gpt-5.6-sol") is None
        # The FIFO was quarantined out of the store's way.
        assert not path.exists() or not path.is_fifo()
        assert any(p.name.startswith("context_windows.json.corrupt-") for p in tmp_path.iterdir())

    def test_symlink_at_store_path_is_refused(self, tmp_path):
        victim = tmp_path / "victim.json"
        victim.write_text(json.dumps({"version": 1, "accounts": {}}))
        path = tmp_path / "context_windows.json"
        path.symlink_to(victim)
        obs = WindowObserver(path)
        assert obs.active_clamp("gpt-5.6-sol") is None
        # The victim itself was never consumed as the store.
        assert victim.read_text()

    def test_directory_at_store_path_is_survived(self, tmp_path):
        path = tmp_path / "context_windows.json"
        path.mkdir()
        obs = WindowObserver(path)
        assert obs.active_clamp("gpt-5.6-sol") is None

    def test_oversized_file_is_quarantined(self, tmp_path):
        path = tmp_path / "context_windows.json"
        path.write_bytes(b"x" * (wo._MAX_STORE_BYTES + 1))
        WindowObserver(path)
        assert any(p.name.startswith("context_windows.json.corrupt-") for p in tmp_path.iterdir())

    def test_corrupt_json_is_quarantined_not_repaired(self, tmp_path):
        path = tmp_path / "context_windows.json"
        path.write_text("{not json")
        WindowObserver(path)
        quarantined = [
            p for p in tmp_path.iterdir() if p.name.startswith("context_windows.json.corrupt-")
        ]
        assert len(quarantined) == 1
        assert quarantined[0].read_text() == "{not json"  # preserved verbatim

    def test_off_schema_store_is_quarantined(self, tmp_path):
        path = tmp_path / "context_windows.json"
        path.write_text(json.dumps({"version": 99, "accounts": {}}))
        obs = WindowObserver(path)
        assert obs.view()["accounts"] == {}


class TestClampQualification:
    async def test_cross_account_retry_records_both_but_derives_no_clamp(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(key=ACCT_A), response=_acceptance(key=ACCT_B))
        assert obs.active_clamp("gpt-5.6-sol") is None
        view = obs.view()["accounts"]
        assert view[ACCT_A]["models"]["gpt-5.6-sol"]["lowest_rejection_bound"] == 930_001
        assert view[ACCT_B]["models"]["gpt-5.6-sol"]["highest_accepted_input"] == 408_004

    async def test_missing_acceptance_usage_records_occurrence_only(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(tokens=None), response=_acceptance(tokens=None))
        assert obs.active_clamp("gpt-5.6-sol") is None
        record = obs.view()["accounts"][ACCT_A]["models"]["gpt-5.6-sol"]
        assert record["overflow_occurrences"] == 1
        assert record["lowest_rejection_bound"] is None
        assert record["highest_accepted_input"] is None

    async def test_model_mismatch_derives_no_clamp(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(model="gpt-5.6-sol"),
            response=_acceptance(model="gpt-5.5"),
        )
        assert obs.active_clamp("gpt-5.6-sol") is None
        assert obs.active_clamp("gpt-5.5") is None

    async def test_non_overflow_error_is_ignored(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(code="other"), response=_acceptance())
        assert obs.view()["accounts"] == {}

    async def test_missing_account_keys_disqualify_scoped_evidence(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(key=None), response=_acceptance(key=None))
        assert obs.view()["accounts"] == {}

    async def test_estimate_shaped_junk_never_qualifies(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(tokens=930_001),
            response=SimpleNamespace(
                server_input_tokens="408004",  # strings are not evidence
                account_key=ACCT_A,
                provenance_model="gpt-5.6-sol",
            ),
        )
        assert obs.active_clamp("gpt-5.6-sol") is None


class TestDownwardOnlyMergeAndTTL:
    async def test_lower_evidence_replaces_with_fresh_ttl(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance(tokens=500_000))
        await obs.record_rescue(overflow=_overflow(), response=_acceptance(tokens=400_000))
        assert obs.active_clamp("gpt-5.6-sol") == 400_000

    async def test_higher_evidence_never_raises_a_live_clamp(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance(tokens=400_000))
        await obs.record_rescue(overflow=_overflow(), response=_acceptance(tokens=500_000))
        assert obs.active_clamp("gpt-5.6-sol") == 400_000

    async def test_expired_clamp_is_not_served_and_is_replaceable(self, tmp_path, monkeypatch):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance(tokens=400_000))
        real_now = wo._utc_now
        monkeypatch.setattr(wo, "_utc_now", lambda: real_now() + timedelta(hours=25))
        assert obs.active_clamp("gpt-5.6-sol") is None
        await obs.record_rescue(overflow=_overflow(), response=_acceptance(tokens=500_000))
        assert obs.active_clamp("gpt-5.6-sol") == 500_000

    async def test_active_clamp_is_minimum_across_accounts(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(key=ACCT_A), response=_acceptance(key=ACCT_A, tokens=500_000)
        )
        await obs.record_rescue(
            overflow=_overflow(key=ACCT_B), response=_acceptance(key=ACCT_B, tokens=420_000)
        )
        assert obs.active_clamp("gpt-5.6-sol") == 420_000

    async def test_active_clamp_ignores_ineligible_accounts(self, tmp_path):
        eligible = {ACCT_A}
        obs = WindowObserver(
            tmp_path / "context_windows.json",
            eligible_account_keys=lambda: frozenset(eligible),
        )
        await obs.record_rescue(
            overflow=_overflow(key=ACCT_A), response=_acceptance(key=ACCT_A, tokens=500_000)
        )
        await obs.record_rescue(
            overflow=_overflow(key=ACCT_B), response=_acceptance(key=ACCT_B, tokens=420_000)
        )
        assert obs.active_clamp("gpt-5.6-sol") == 500_000
        eligible.clear()
        assert obs.active_clamp("gpt-5.6-sol") is None

    async def test_eligible_provider_none_or_failure_fails_open_not_stale(self, tmp_path):
        obs = WindowObserver(
            tmp_path / "context_windows.json",
            eligible_account_keys=lambda: None,
        )
        await obs.record_rescue(overflow=_overflow(), response=_acceptance())
        assert obs.active_clamp("gpt-5.6-sol") is None

        obs.set_eligible_account_keys_provider(
            lambda: (_ for _ in ()).throw(RuntimeError("pool unavailable"))
        )
        assert obs.active_clamp("gpt-5.6-sol") is None


class TestForfeitInvariant:
    async def test_write_failure_forfeits_durability_never_the_request(self, tmp_path, monkeypatch):
        obs = _observer(tmp_path)

        def _boom():
            raise OSError("disk full")

        monkeypatch.setattr(obs, "_persist_locked", _boom)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance())
        # In-memory evidence still protects this process...
        assert obs.active_clamp("gpt-5.6-sol") == 408_004
        # ...but nothing was persisted.
        assert not (tmp_path / "context_windows.json").exists()

    async def test_every_entry_point_is_total_on_junk(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=object(), response=object())
        await obs.record_rescue(overflow=None, response=None)
        assert obs.active_clamp(object()) is None
        assert await obs.clear_account("not-a-key") == 0
        assert obs.view()["accounts"] == {}


class TestPersistFdDiscipline:
    async def test_fdopen_failure_leaks_no_fd_and_no_temp_file(self, tmp_path, monkeypatch):
        obs = _observer(tmp_path)
        real_fdopen = os.fdopen

        def _boom(fd, *a, **kw):
            raise OSError("fdopen refused")

        monkeypatch.setattr(os, "fdopen", _boom)
        fd_dir = "/proc/self/fd"
        before = len(os.listdir(fd_dir))
        await obs.record_rescue(overflow=_overflow(), response=_acceptance())
        monkeypatch.setattr(os, "fdopen", real_fdopen)
        assert len(os.listdir(fd_dir)) == before  # the raw fd was closed
        assert not any(p.name.startswith(".context_windows") for p in tmp_path.iterdir())
        # The observation still serves this process from memory.
        assert obs.active_clamp("gpt-5.6-sol") == 408_004

    async def test_crashed_write_never_corrupts_the_published_store(self, tmp_path, monkeypatch):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance(tokens=500_000))
        published = (tmp_path / "context_windows.json").read_bytes()

        def _boom(fd):
            raise OSError("device error")

        monkeypatch.setattr(os, "fsync", _boom)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance(tokens=400_000))
        # The atomic-replacement contract: the prior published bytes survive
        # a crashed write untouched, and no temp debris remains.
        assert (tmp_path / "context_windows.json").read_bytes() == published
        assert not any(p.name.startswith(".context_windows") for p in tmp_path.iterdir())

    async def test_cancelled_writer_drains_before_second_transaction(self, tmp_path, monkeypatch):
        obs = _observer(tmp_path)
        real_persist = obs._persist_locked
        first_entered = threading.Event()
        release_first = threading.Event()
        calls = 0

        def controlled_persist(state):
            nonlocal calls
            calls += 1
            if calls == 1:
                first_entered.set()
                assert release_first.wait(5)
            real_persist(state)

        monkeypatch.setattr(obs, "_persist_locked", controlled_persist)
        writer_a = asyncio.create_task(
            obs.record_rescue(
                overflow=_overflow(key=ACCT_A),
                response=_acceptance(key=ACCT_A, tokens=500_000),
            )
        )
        assert await asyncio.to_thread(first_entered.wait, 5)
        writer_a.cancel()
        writer_b = asyncio.create_task(
            obs.record_rescue(
                overflow=_overflow(key=ACCT_B),
                response=_acceptance(key=ACCT_B, tokens=420_000),
            )
        )
        await asyncio.sleep(0.05)
        assert calls == 1  # B cannot enter while A's worker still owns the transaction.
        release_first.set()
        with pytest.raises(asyncio.CancelledError):
            await writer_a
        await writer_b
        on_disk = WindowObserver(tmp_path / "context_windows.json").view()
        assert set(on_disk["accounts"]) == {ACCT_A, ACCT_B}
        assert not any(p.name.startswith(".context_windows") for p in tmp_path.iterdir())


class TestManualClear:
    async def test_clear_is_account_scoped_and_preserves_bounds(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(key=ACCT_A), response=_acceptance(key=ACCT_A))
        await obs.record_rescue(
            overflow=_overflow(key=ACCT_B), response=_acceptance(key=ACCT_B, tokens=420_000)
        )
        assert await obs.clear_account(ACCT_A) == 1
        # B's clamp survives; A's bounds history survives its clamp.
        assert obs.active_clamp("gpt-5.6-sol") == 420_000
        record = obs.view()["accounts"][ACCT_A]["models"]["gpt-5.6-sol"]
        assert record["clamp"] is None
        assert record["lowest_rejection_bound"] == 930_001

    async def test_failed_clear_is_truthful_and_retains_state(self, tmp_path, monkeypatch):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance())
        published = (tmp_path / "context_windows.json").read_bytes()

        def fail(_state=None):
            raise OSError("disk full")

        monkeypatch.setattr(obs, "_persist_locked", fail)
        with pytest.raises(WindowObserverMutationError):
            await obs.clear_account(ACCT_A)
        assert obs.active_clamp("gpt-5.6-sol") == 408_004
        assert (tmp_path / "context_windows.json").read_bytes() == published

    async def test_model_scoped_clear(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance())
        await obs.record_rescue(
            overflow=_overflow(model="gpt-5.5", tokens=272_000),
            response=_acceptance(model="gpt-5.5", tokens=250_000),
        )
        assert await obs.clear_account(ACCT_A, model="gpt-5.5") == 1
        assert obs.active_clamp("gpt-5.5") is None
        assert obs.active_clamp("gpt-5.6-sol") == 408_004

    async def test_view_is_a_defensive_copy_with_expiry_flags(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance())
        view = obs.view()
        assert view["accounts"][ACCT_A]["models"]["gpt-5.6-sol"]["clamp"]["expired"] is False
        view["accounts"].clear()
        assert obs.view()["accounts"]  # internal state untouched


class TestSurfaceGuardArms:
    """The non-fatal guard arms are load-bearing: a broken observer must
    never break compaction, rescue, or a spawn."""

    class _BrokenObserver:
        def active_clamp(self, model):
            raise RuntimeError("observer wedged")

        async def record_rescue(self, *, overflow, response):
            raise RuntimeError("observer wedged")

    def test_chat_clamp_lookup_survives_a_broken_observer(self):
        runner = _chat_runner(_ChatGateway(None), self._BrokenObserver())
        assert runner._observed_clamp("gpt-5.6-sol") is None

    async def test_chat_evidence_recording_survives_a_broken_observer(self):
        runner = _chat_runner(_ChatGateway(None), self._BrokenObserver())
        await runner._record_window_evidence(_overflow(), SimpleNamespace())

    def test_agent_clamp_lookup_survives_a_broken_observer(self):
        from src.discord.native_tools.agents_tasks import _observer_clamp

        assert _observer_clamp(self._BrokenObserver(), "gpt-5.6-sol") is None

    async def test_agent_recorder_survives_a_broken_observer(self):
        from src.discord.native_tools.agents_tasks import _make_evidence_recorder

        recorder = _make_evidence_recorder(self._BrokenObserver())
        await recorder(_overflow(), {"text": "ok"})


class TestResolverIntegration:
    def test_snapshot_for_codex_config_threads_the_clamp(self):
        from src.llm.context_budget import snapshot_for_codex_config

        cfg = SimpleNamespace(context_budget_overrides=None, context_utilization=60)
        unclamped = snapshot_for_codex_config("gpt-5.6-sol", cfg, max_context_chars=None)
        clamped = snapshot_for_codex_config(
            "gpt-5.6-sol", cfg, max_context_chars=None, observed_clamp=300_000
        )
        assert unclamped.clamp_applied is False
        assert clamped.clamp_applied is True
        assert clamped.effective_budget == 300_000
        assert clamped.primary_chars < unclamped.primary_chars


# ---------------------------------------------------------------------------
# Surface hooks: chat, loop, agent
# ---------------------------------------------------------------------------


class _CaptureObserver:
    def __init__(self, clamp=None):
        self._clamp = clamp
        self.recorded: list[tuple] = []

    def active_clamp(self, model):
        return self._clamp

    async def record_rescue(self, *, overflow, response):
        self.recorded.append((overflow, response))


def _chat_runner(gateway, observer):
    from src.discord.tool_loop import ToolLoopRunner

    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._llm_gateway = gateway
    runner._get_config = lambda: SimpleNamespace(openai_codex=None)
    runner._get_context_compressor = lambda: None
    runner._get_compression_stats = lambda: None
    runner._window_observer = observer

    async def _fake_error_done(st, api_err):
        return ("terminal", str(api_err))

    runner._llm_error_done = _fake_error_done
    return runner


class _ChatGateway:
    def __init__(self, script):
        self.client = SimpleNamespace(model="gpt-5.6-sol", reasoning_effort="xhigh")
        self.codex_client = self.client
        self.ollama_client = None
        self.kimi_client = None
        self.script = script
        self.calls = 0

    def capture_serving_identity(self, config=None):
        from src.discord.llm_gateway import LLMServingIdentity

        return LLMServingIdentity(
            provider="codex",
            client=self.client,
            model=self.client.model,
            reasoning_effort=self.client.reasoning_effort,
        )

    def capacity_breaker_for(self, model=None, provider=None):
        return None

    def recovery_policy(self):
        from src.llm.recovery import RecoveryPolicy

        return RecoveryPolicy(deadline_seconds=30.0)

    def notify_generation_success(self, provider):
        pass

    async def call_with_tools(self, *, messages, system, tools, **kwargs):
        self.calls += 1
        return await self.script(self.calls)


def _chat_st(messages):
    from src.discord.response_guards import StuckLoopTracker
    from src.trajectories.saver import TrajectoryTurn
    from src.turn_state.durability import TurnDurability

    class _NullCM:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

    return SimpleNamespace(
        chat_cap=3,
        iteration=0,
        stuck_tracker=StuckLoopTracker(),
        wait_judgment_pending=False,
        _cancel=asyncio.Event(),
        _trajectory=TrajectoryTurn(),
        trace=None,
        _ch_id="c1",
        _req_id="r1",
        message=SimpleNamespace(
            channel=SimpleNamespace(id=1, typing=lambda: _NullCM()), content="hi"
        ),
        messages=messages,
        tools_used_in_loop=[],
        tools=[],
        system_prompt="sys",
        user_id="u1",
        durability=TurnDurability.disabled(),
        _boundary_request_start=max(0, len(messages) - 2),
        _boundary_elided_replay=0,
        _boundary_envelope_len=2,
        _char_latch=None,
        _rescue_passes=0,
        _gen_identity=None,
    )


def _big_history(n, size):
    return [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"h{i}:" + "y" * size}
        for i in range(n)
    ]


_ENVELOPE = [
    {"role": "developer", "content": "preamble"},
    {"role": "user", "content": "CURRENT: do the thing"},
]


class TestChatSurfaceHooks:
    async def test_rescued_chat_success_records_the_evidence_pair(self):
        observer = _CaptureObserver()
        overflow = _overflow()

        async def script(n):
            if n == 1:
                raise overflow
            return SimpleNamespace(
                text="ok",
                tool_calls=[],
                stop_reason="end_turn",
                server_input_tokens=408_004,
                account_key=ACCT_A,
                provenance_model="gpt-5.6-sol",
            )

        gw = _ChatGateway(script)
        runner = _chat_runner(gw, observer)
        st = _chat_st(_big_history(60, 20_000) + list(_ENVELOPE))
        kind, val = await runner._call_llm(st)
        assert kind == "ok"
        assert len(observer.recorded) == 1
        got_overflow, got_response = observer.recorded[0]
        assert got_overflow is overflow  # the exact overflow error object
        assert got_response is val

    async def test_unrescued_chat_success_records_nothing(self):
        observer = _CaptureObserver()

        async def script(n):
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

        runner = _chat_runner(_ChatGateway(script), observer)
        st = _chat_st(_big_history(4, 100) + list(_ENVELOPE))
        kind, _val = await runner._call_llm(st)
        assert kind == "ok"
        assert observer.recorded == []

    def test_chat_soft_pass_consumes_the_active_clamp(self):
        """Same payload, only the clamp differs: 800K chars sits under sol's
        unclamped 1.277M-char target (no compression) but far over the
        clamped 575K target (compression fires)."""
        from src.llm.context_compressor import estimate_message_chars

        payload = (
            _big_history(6, 1_000)
            + list(_ENVELOPE)
            + [
                m
                for i in range(50)
                for m in (
                    {
                        "role": "assistant",
                        "content": [
                            {"type": "tool_use", "id": f"t{i}", "name": "read_file", "input": {}},
                        ],
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": f"t{i}",
                                "content": "r" * 16_000,
                            },
                        ],
                    },
                )
            ]
        )
        compressor_cfg = SimpleNamespace(max_context_chars=None, keep_recent_iterations=3)

        def run(observer):
            gw = _ChatGateway(None)
            runner = _chat_runner(gw, observer)
            runner._get_context_compressor = lambda: compressor_cfg
            st = _chat_st([dict(m) for m in payload])
            # The payload already carries iterations: the request envelope
            # sits after the 6 history messages, not at the list tail.
            st._boundary_request_start = 6
            st.iteration = 1
            assert runner._maybe_compress(st, gw.client, SimpleNamespace(openai_codex=None))
            return estimate_message_chars(st.messages)

        before = estimate_message_chars(payload)
        unclamped = run(None)
        clamped = run(_CaptureObserver(clamp=300_000))
        assert before > 575_000  # the payload genuinely exceeds the clamped target
        assert unclamped == before  # untouched without a clamp
        assert clamped <= 575_000  # compressed to the clamped target


class TestLoopSurfaceHooks:
    async def test_rescued_loop_success_records_the_evidence_pair(self):
        from src.llm.context_compressor import SurfaceBoundary

        observer = _CaptureObserver()
        overflow = _overflow()
        calls = {"n": 0}

        class _Client(SimpleNamespace):
            async def chat_with_tools(self, *, messages, system, tools, **kwargs):
                calls["n"] += 1
                if calls["n"] == 1:
                    raise overflow
                return SimpleNamespace(
                    text="ok",
                    tool_calls=[],
                    stop_reason="end_turn",
                    provenance_provider="codex",
                    provenance_model="gpt-5.6-sol",
                    provenance_reasoning_effort="xhigh",
                    server_input_tokens=408_004,
                    account_key=ACCT_A,
                )

        client = _Client(model="gpt-5.6-sol", reasoning_effort="xhigh")
        gw = _ChatGateway(None)
        gw.client = client
        gw.codex_client = client
        runner = _chat_runner(gw, observer)
        st = SimpleNamespace(
            messages=[
                {"role": "user", "content": "Previous iteration results:\n" + "p" * 400_000},
                {"role": "assistant", "content": "Understood."},
                {"role": "user", "content": "GOAL: keep going"},
            ],
            system_prompt="sys",
            tools=[],
            _boundary=SurfaceBoundary(request_start=2, envelope_len=1),
            _char_latch=None,
            context_recoveries=[],
            _iteration_index=0,
        )
        kind, val = await runner._call_loop_llm(st)
        assert kind == "ok"
        assert len(observer.recorded) == 1
        assert observer.recorded[0][0] is overflow
        assert observer.recorded[0][1] is val


class TestAgentSurfaceHooks:
    def test_generation_budget_snapshot_consumes_the_clamp(self):
        from src.discord.native_tools.agents_tasks import _generation_budget_snapshot

        client = SimpleNamespace(model="gpt-5.6-sol", reasoning_effort="xhigh")
        cfg = SimpleNamespace(openai_codex=None)
        unclamped = _generation_budget_snapshot(cfg, client, "gpt-5.6-sol", None)
        clamped = _generation_budget_snapshot(
            cfg, client, "gpt-5.6-sol", None, observer=_CaptureObserver(clamp=300_000)
        )
        assert unclamped.clamp_applied is False
        assert clamped.clamp_applied is True
        assert clamped.primary_chars < unclamped.primary_chars

    async def test_evidence_recorder_adapts_the_callback_dict(self, tmp_path):
        from src.discord.native_tools.agents_tasks import _make_evidence_recorder

        obs = _observer(tmp_path)
        recorder = _make_evidence_recorder(obs)
        await recorder(
            _overflow(),
            {
                "text": "ok",
                "tool_calls": [],
                "server_input_tokens": 408_004,
                "account_key": ACCT_A,
                "model": "gpt-5.6-sol",
            },
        )
        assert obs.active_clamp("gpt-5.6-sol") == 408_004

    def test_recorder_for_absent_observer_is_none(self):
        from src.discord.native_tools.agents_tasks import _make_evidence_recorder

        assert _make_evidence_recorder(None) is None

    async def test_manager_rescue_success_invokes_the_recorder(self):
        from src.agents.manager import AgentInfo, _call_llm_with_recovery

        agent = AgentInfo(
            id="a1",
            label="t",
            goal="g",
            channel_id="c1",
            requester_id="u1",
            requester_name="u",
        )
        agent.messages = [{"role": "user", "content": "task"}] + [
            {"role": "assistant", "content": f"[Tool result: step{i}]\n" + "x" * 20_000}
            for i in range(30)
        ]
        overflow = _overflow()
        recorded = []

        async def recorder(err, response):
            recorded.append((err, response))

        calls = {"n": 0}

        async def cb(messages, system_prompt, tools, generation_state=None):
            calls["n"] += 1
            if calls["n"] == 1:
                raise overflow
            return {"text": "done", "tool_calls": []}

        response = await _call_llm_with_recovery(
            agent,
            cb,
            "sys",
            [],
            rescue_ladder=(120_000,),
            evidence_recorder=recorder,
        )
        assert response == {"text": "done", "tool_calls": []}
        assert len(recorded) == 1
        assert recorded[0][0] is overflow
        assert recorded[0][1] is response


# ---------------------------------------------------------------------------
# Management API
# ---------------------------------------------------------------------------


def _api_app(observer):
    from src.web.api.llm_admin import register_context_windows

    bot = SimpleNamespace(
        config=SimpleNamespace(
            openai_codex=SimpleNamespace(
                context_budget_overrides={"gpt-5.5": 250_000},
                context_utilization=60,
                context_compression=SimpleNamespace(max_context_chars=None),
            )
        ),
        context_compressor=SimpleNamespace(resolved_max_context_chars=750_000),
        services=SimpleNamespace(window_observer=observer),
    )
    routes = web.RouteTableDef()
    register_context_windows(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app


class TestContextWindowsApi:
    async def test_get_serves_floors_overrides_clamps_and_both_resolutions(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance(tokens=300_000))
        app = _api_app(obs)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/context/windows")).json()
        sol = body["models"]["gpt-5.6-sol"]
        assert sol["floor"] == 921_601
        assert sol["active_clamp"] == 300_000
        assert sol["configured"]["clamp_applied"] is False
        assert sol["effective"]["clamp_applied"] is True
        assert sol["effective"]["effective_budget"] == 300_000
        assert sol["effective"]["primary_chars"] < sol["configured"]["primary_chars"]
        five = body["models"]["gpt-5.5"]
        assert five["override"] == 250_000
        assert five["configured"]["base_source"] == "override"
        # Raw evidence rides along, opaque keys only.
        assert ACCT_A in body["evidence"]["accounts"]

    async def test_get_preserves_raw_auto_ceiling(self, tmp_path):
        obs = _observer(tmp_path)
        app = _api_app(obs)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/context/windows")).json()
        assert body["max_context_chars"] is None
        assert body["models"]["gpt-5.6-sol"]["configured"]["primary_chars"] == 1_277_400

    async def test_failed_clear_returns_503_and_truthful_state(self, tmp_path, monkeypatch):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance())
        monkeypatch.setattr(
            obs,
            "_persist_locked",
            lambda _state=None: (_ for _ in ()).throw(OSError("disk full")),
        )
        app = _api_app(obs)
        async with TestClient(TestServer(app)) as c:
            resp = await c.post("/api/context/windows/clear", json={"account_key": ACCT_A})
            assert resp.status == 503
        assert obs.active_clamp("gpt-5.6-sol") == 408_004

    async def test_clear_endpoint_is_account_scoped(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance())
        app = _api_app(obs)
        async with TestClient(TestServer(app)) as c:
            resp = await c.post("/api/context/windows/clear", json={"account_key": ACCT_A})
            assert (await resp.json())["cleared"] == 1
            resp = await c.post("/api/context/windows/clear", json={})
            assert resp.status == 400
            resp = await c.post(
                "/api/context/windows/clear",
                data=b"not json",
                headers={"Content-Type": "application/json"},
            )
            assert resp.status == 400  # malformed body degrades to empty
        assert obs.active_clamp("gpt-5.6-sol") is None

    async def test_clear_without_observer_is_503(self):
        app = _api_app(None)
        async with TestClient(TestServer(app)) as c:
            resp = await c.post("/api/context/windows/clear", json={"account_key": ACCT_A})
            assert resp.status == 503
