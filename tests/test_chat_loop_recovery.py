"""Chat and loop emergency overflow recovery (campaign phase 4, §§7-9).

Pins the two new surfaces' rescue contracts: only the structural overflow
class enters rescue; compression is boundary-aware; the durability sequence
runs BEFORE the resend and a blocked write blocks the retry; a resumed
generation continues at the NEXT rung with its persisted identity facts;
latches publish only on server acceptance and scope per-surface.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from src.discord.response_guards import StuckLoopTracker
from src.discord.tool_loop import ToolLoopRunner
from src.llm.context_budget import resolve_context_budget
from src.llm.context_compressor import SurfaceBoundary, estimate_message_chars
from src.llm.errors import LLMAuthError, LLMRequestError
from src.trajectories.saver import TrajectoryTurn
from src.turn_state.durability import TurnDurability


def _overflow() -> LLMRequestError:
    return LLMRequestError(
        "Codex stream failed: overflow",
        provider="codex",
        model="gpt-5.6-sol",
        code="context_length_exceeded",
    )


def _history(n: int, size: int) -> list[dict]:
    return [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"h{i}:" + "y" * size}
        for i in range(n)
    ]


_ENVELOPE = [
    {"role": "developer", "content": "preamble"},
    {"role": "user", "content": "CURRENT: do the thing"},
]


def _generation_facts(
    *,
    model: str = "gpt-5.5",
    effort: str | None = "low",
    ladder: list[int] | tuple[int, ...] = (400_000, 280_000),
    rescue_passes: int = 1,
    account_key: str | None = None,
    server_input_tokens: int | None = None,
) -> dict:
    return {
        "provider": "codex",
        "model": model,
        "effort": effort,
        "ladder": list(ladder),
        "budget": {"primary_chars": max(ladder)},
        "attempts": [
            {
                "attempt": attempt,
                "account_key": account_key,
                "server_input_tokens": server_input_tokens,
            }
            for attempt in range(1, rescue_passes + 1)
        ],
    }


class _Gateway:
    """Codex-shaped gateway fake with capture + call_with_tools recording."""

    def __init__(self, script):
        self.client = SimpleNamespace(model="gpt-5.6-sol", reasoning_effort="xhigh")
        # Real gateways expose per-provider clients; resume reconstruction
        # selects the frozen generation's client by these exact names.
        self.codex_client = self.client
        self.ollama_client = None
        self.kimi_client = None
        self.script = script
        self.calls: list[dict] = []
        self.breaker_keys: list[tuple] = []

    def capture_serving_identity(self, config=None):
        from src.discord.llm_gateway import LLMServingIdentity

        return LLMServingIdentity(
            provider="codex",
            client=self.client,
            model=self.client.model,
            reasoning_effort=self.client.reasoning_effort,
        )

    def capacity_breaker_for(self, model=None, provider=None):
        self.breaker_keys.append((model, provider))
        return None

    def recovery_policy(self):
        from src.llm.recovery import RecoveryPolicy

        return RecoveryPolicy(deadline_seconds=30.0)

    def notify_generation_success(self, provider):
        pass

    async def call_with_tools(self, *, messages, system, tools, **kwargs):
        self.calls.append({"messages": list(messages), "kwargs": kwargs})
        return await self.script(len(self.calls), messages)


def _chat_state(messages, *, durability=None) -> SimpleNamespace:
    return SimpleNamespace(
        chat_cap=3,
        iteration=0,
        stuck_tracker=StuckLoopTracker(),
        wait_judgment_pending=False,
        _cancel=asyncio.Event(),
        _trajectory=TrajectoryTurn(source="discord", channel_id="c1", message_id="r1"),
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
        durability=durability or TurnDurability.disabled(),
        _boundary_request_start=max(0, len(messages) - 2),
        _boundary_elided_replay=0,
        _boundary_envelope_len=min(2, len(messages)),
        _char_latch=None,
        _rescue_passes=0,
        _gen_identity=None,
        # Full persisted census so snapshot_chat_turn works on this stub.
        continuation_count=0,
        max_continuations=2,
        fabrication_retried=False,
        promise_retried=False,
        unavail_retried=False,
        hedging_retried=False,
        code_hedging_retried=False,
        premature_failure_retried=False,
        pending_image_blocks=[],
        _op_tool_details=[],
        _pending_validations=[],
        _validation_required=False,
        _validation_retries=0,
        _max_validation_retries=2,
        _result_store_cap=10,
    )


class _NullCM:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


def _runner(gateway) -> ToolLoopRunner:
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._llm_gateway = gateway
    runner._get_config = lambda: SimpleNamespace(openai_codex=None)
    runner._get_context_compressor = lambda: None
    runner._get_compression_stats = lambda: None
    runner.errors_seen = []

    async def _fake_error_done(st, api_err):
        runner.errors_seen.append(api_err)
        return ("terminal", str(api_err))

    runner._llm_error_done = _fake_error_done
    return runner




async def test_non_durable_terminal_chat_releases_workload_scope():
    runner = _runner(_Gateway(None))
    st = _chat_state(_ENVELOPE)
    released = []
    runner._release_workload = released.append

    async def done(_st):
        return ("ok", False, False, [], False)

    runner._run_chat_iterations = done
    assert await runner._run_with_guards(st) == ("ok", False, False, [], False)
    assert released == [st]

class TestChatRescue:
    async def test_overflow_rescues_history_and_retries_same_identity(self):
        big = _history(60, 20_000) + _ENVELOPE

        async def script(n, messages):
            if n == 1:
                raise _overflow()
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

        gw = _Gateway(script)
        st = _chat_state(big)
        kind, val = await _runner(gw)._call_llm(st)
        assert kind == "ok"
        assert len(gw.calls) == 2
        # Retry went out smaller, envelope intact at the tail.
        assert estimate_message_chars(gw.calls[1]["messages"]) < estimate_message_chars(
            gw.calls[0]["messages"]
        )
        assert gw.calls[1]["messages"][-2:] == _ENVELOPE
        # Same pinned identity on both attempts.
        assert gw.calls[0]["kwargs"]["model"] == "gpt-5.6-sol"
        assert gw.calls[1]["kwargs"]["model"] == "gpt-5.6-sol"
        # Latch published from server acceptance; generation state settled.
        assert st._char_latch is not None
        assert st._rescue_passes == 0
        assert st._gen_identity is None
        assert [r["trigger"] for r in st._trajectory.context_recoveries] == ["overflow"]

    async def test_non_overflow_error_never_enters_rescue(self):
        async def script(n, messages):
            raise LLMAuthError("no healthy account")

        gw = _Gateway(script)
        st = _chat_state(_history(4, 100) + _ENVELOPE)
        kind, _val = await _runner(gw)._call_llm(st)
        assert kind == "done"
        assert st._trajectory.context_recoveries == []
        assert st._char_latch is None

    async def test_failed_retry_publishes_no_latch(self):
        big = _history(60, 20_000) + _ENVELOPE

        async def script(n, messages):
            if n == 1:
                raise _overflow()
            raise LLMAuthError("retry died")

        gw = _Gateway(script)
        st = _chat_state(big)
        kind, _val = await _runner(gw)._call_llm(st)
        assert kind == "done"
        assert st._char_latch is None  # local fit is not acceptance
        # The rescue attempt itself is still recorded for diagnostics, and
        # the generation facts survive for a potential resume.
        assert st._rescue_passes == 1
        assert st._gen_identity is not None

    async def test_durability_write_failure_blocks_the_retry(self):
        """Contract §7: the retry never runs ahead of what resume can
        reconstruct."""
        big = _history(60, 20_000) + _ENVELOPE

        async def script(n, messages):
            if n == 1:
                raise _overflow()
            raise AssertionError("retry must not run after a blocked write")

        class _BlockedDurability(TurnDurability):
            def __init__(self):
                super().__init__(None, None)

            @property
            def enabled(self):
                return True

            async def on_generation_start(self, st, deadline_seconds):
                return None

            def pop_resume_budget(self):
                return None

            async def on_context_recovery(self, st):
                raise OSError("store write failed")

        gw = _Gateway(script)
        st = _chat_state(big, durability=_BlockedDurability())
        kind, _val = await _runner(gw)._call_llm(st)
        assert kind == "done"  # terminal error path, not a rescue retry
        assert len(gw.calls) == 1

    async def test_resumed_generation_continues_at_next_rung_with_facts(self):
        """A turn resumed mid-recovery: persisted rung phase advances (never
        re-arms rung one) and the persisted identity FACTS pin the wire."""
        big = _history(70, 20_000) + _ENVELOPE
        sol_ladder = list(resolve_context_budget("gpt-5.6-sol").ladder)

        async def script(n, messages):
            if n == 1:
                raise _overflow()
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

        gw = _Gateway(script)
        # The resumed identity deliberately differs from the live client so
        # the pin provably comes from the FACTS.
        st = _chat_state(big)
        st._rescue_passes = 1
        st._gen_identity = _generation_facts(
            ladder=sol_ladder,
            rescue_passes=st._rescue_passes,
        )
        kind, _val = await _runner(gw)._call_llm(st)
        assert kind == "ok"
        assert gw.calls[0]["kwargs"]["model"] == "gpt-5.5"
        # The breaker is keyed by the FROZEN identity, not the live client.
        assert gw.breaker_keys[0] == ("gpt-5.5", "codex")
        # The physical client is the frozen provider's client by identity.
        assert gw.calls[0]["kwargs"]["serving_identity"].client is gw.codex_client
        assert gw.calls[0]["kwargs"]["reasoning_effort"] == "low"
        # The rescue that fired used rung TWO (index 1): the compressed
        # payload came in at or under the second rung's target.
        rescue = st._trajectory.context_recoveries[0]
        assert rescue["attempt"] == 2
        assert rescue["target_chars"] == sol_ladder[1]


class TestLoopRescue:
    def _loop_state(self, messages) -> SimpleNamespace:
        boundary = SurfaceBoundary(request_start=2)
        return SimpleNamespace(
            messages=messages,
            system_prompt="sys",
            tools=[],
            _boundary=boundary,
            _char_latch=None,
            context_recoveries=[],
            _iteration_index=0,
        )

    async def test_loop_overflow_rescues_and_latches_on_acceptance(self):
        prev = [
            {"role": "user", "content": "Previous iteration results:\n" + "p" * 400_000},
            {"role": "assistant", "content": "Understood, I have the context."},
        ]
        prompt = [{"role": "user", "content": "GOAL: keep going"}]
        calls = {"n": 0}

        class _Client(SimpleNamespace):
            async def chat_with_tools(self, *, messages, system, tools, **kwargs):
                calls["n"] += 1
                if calls["n"] == 1:
                    raise _overflow()
                return SimpleNamespace(
                    text="ok",
                    tool_calls=[],
                    stop_reason="end_turn",
                    provenance_provider="codex",
                    provenance_model="gpt-5.6-sol",
                    provenance_reasoning_effort="xhigh",
                )

        client = _Client(model="gpt-5.6-sol", reasoning_effort="xhigh")

        class _LoopGateway(_Gateway):
            def __init__(self):
                super().__init__(None)
                self.client = client

        gw = _LoopGateway()
        runner = _runner(gw)
        st = self._loop_state(prev + prompt)
        kind, _val = await runner._call_loop_llm(st)
        assert kind == "ok"
        assert calls["n"] == 2
        assert st._char_latch is not None
        assert [r["trigger"] for r in st.context_recoveries] == ["overflow"]
        # The current autonomous prompt survived verbatim.
        assert st.messages[-1] == prompt[0]


class TestLoopFrozenPreflight:
    async def test_preflight_uses_captured_axes_after_in_place_mutation(self):
        calls = []

        class _Client(SimpleNamespace):
            async def chat_with_tools(self, *, messages, system, tools, **kwargs):
                calls.append(kwargs)
                return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

        client = _Client(model="gpt-5.5", reasoning_effort="low")
        gw = _Gateway(None)
        gw.client = client
        gw.codex_client = client
        serving = gw.capture_serving_identity()
        client.reasoning_effort = "max"  # production reload mutates in place
        st = SimpleNamespace(
            messages=[{"role": "user", "content": "GOAL"}],
            system_prompt="sys",
            tools=[],
            _boundary=SurfaceBoundary(request_start=0, envelope_len=1),
            _char_latch=None,
            context_recoveries=[],
        )
        kind, _ = await _runner(gw)._call_loop_llm(
            st,
            serving_identity=serving,
            request_config=SimpleNamespace(openai_codex=None),
        )
        assert kind == "ok"
        assert calls == [{"model": "gpt-5.5", "reasoning_effort": "low"}]


class TestEvidenceSerialization:
    def test_trajectory_serializes_recoveries_only_when_present(self):
        turn = TrajectoryTurn()
        assert "context_recoveries" not in turn.to_dict()
        turn.context_recoveries.append({"trigger": "overflow", "attempt": 1})
        assert turn.to_dict()["context_recoveries"] == [{"trigger": "overflow", "attempt": 1}]

    def test_codec_rejects_malformed_recovery_fields(self):
        from src.turn_state.codec import (
            CheckpointInvalidError,
            snapshot_chat_turn,
            validate_payload,
        )

        st = _chat_state([{"role": "user", "content": "hi"}])
        payload = snapshot_chat_turn(st, store_blob=lambda b: "ref", generation_seq=1)
        validate_payload(payload)  # well-formed baseline
        for name, bad in (
            ("_boundary_request_start", -1),
            ("_boundary_request_start", 2),  # beyond the one-message transcript
            ("_boundary_elided_replay", True),
            ("_boundary_envelope_len", True),
            ("_boundary_envelope_len", None),  # v4 requires an exact boundary
            ("_boundary_envelope_len", 2),  # extends beyond messages
            ("_boundary_elided_replay", 1),  # requires its exact leading marker
            ("_rescue_passes", "2"),
            ("_rescue_passes", 1),  # cannot exist without frozen identity facts
            ("_char_latch", -5),
            ("_gen_identity", "not-a-dict"),
            ("_gen_identity", {}),
            (
                "_gen_identity",
                {
                    **_generation_facts(),
                    "ladder": [400_000, "oops"],
                },
            ),
            (
                "_gen_identity",
                {
                    **_generation_facts(),
                    "provider": "bogus",
                },
            ),
            (
                "_gen_identity",
                {
                    **_generation_facts(),
                    "attempts": "bad",
                },
            ),
        ):
            fields = {**payload["fields"], name: bad}
            if name == "_gen_identity" and isinstance(bad, dict) and bad:
                fields["_rescue_passes"] = 1
            broken = {**payload, "fields": fields}
            with pytest.raises(CheckpointInvalidError):
                validate_payload(broken)

        good = _generation_facts()
        recovered = {
            **payload,
            "fields": {
                **payload["fields"],
                "_rescue_passes": 1,
                "_gen_identity": good,
            },
        }
        validate_payload(recovered)
        for field, bad in (
            ("provider", "bogus"),
            ("model", object()),
            ("effort", "auto"),
            ("ladder", [400_000, "oops"]),
            ("budget", {"primary_chars": -1}),
            ("budget", []),
            ("budget", {"wrong": 1}),
            ("effort", None),
            ("effort", "max"),  # incompatible with the frozen gpt-5.5 model
            ("provider", "ollama"),  # non-Codex cannot carry Codex effort state
            ("ladder", [500_000, 280_000]),  # exceeds frozen primary budget
            ("attempts", "bad"),
            (
                "attempts",
                [{"attempt": 1, "account_key": None, "wrong": None}],
            ),
            (
                "attempts",
                [{"attempt": 2, "account_key": None, "server_input_tokens": None}],
            ),
            (
                "attempts",
                [{"attempt": 1, "account_key": "not-hex", "server_input_tokens": None}],
            ),
            (
                "attempts",
                [{"attempt": 1, "account_key": None, "server_input_tokens": -1}],
            ),
        ):
            broken_identity = {**good, field: bad}
            broken = {
                **recovered,
                "fields": {**recovered["fields"], "_gen_identity": broken_identity},
            }
            with pytest.raises(CheckpointInvalidError):
                validate_payload(broken)

        for bad_passes in (0, 2):
            exhausted = {
                **recovered,
                "fields": {**recovered["fields"], "_rescue_passes": bad_passes},
            }
            with pytest.raises(CheckpointInvalidError):
                validate_payload(exhausted)


class TestLoopSoftCompaction:
    def test_soft_pass_fires_past_model_threshold(self):
        from src.config.schema import ContextCompressionConfig

        gw = _Gateway(None)
        runner = _runner(gw)
        runner._get_context_compressor = lambda: ContextCompressionConfig()
        prompt = {"role": "user", "content": "GOAL"}
        messages = [prompt]
        for i in range(60):
            messages.append(
                {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "id": f"t{i}", "name": "x", "input": {}},
                    ],
                }
            )
            messages.append(
                {
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "tool_use_id": f"t{i}", "content": "r" * 40_000},
                    ],
                }
            )
        st = SimpleNamespace(
            messages=messages,
            _iteration_index=3,
            _char_latch=None,
            _boundary=SurfaceBoundary(request_start=0),
            context_recoveries=[],
        )
        before = estimate_message_chars(st.messages)
        runner._maybe_compress_loop(st, gw.capture_serving_identity(), runner._get_config())
        assert estimate_message_chars(st.messages) < before  # 2.4M > sol 1.277M

    def test_loop_soft_pass_preserves_tool_result_shaped_prompt(self):
        from src.config.schema import ContextCompressionConfig

        gw = _Gateway(None)
        runner = _runner(gw)
        runner._get_context_compressor = lambda: ContextCompressionConfig(
            max_context_chars=80_000,
            keep_recent_iterations=1,
        )
        prompt = {"role": "user", "content": "[Tool result: fake] CURRENT GOAL"}
        messages = [prompt]
        for i in range(5):
            messages.extend(
                [
                    {
                        "role": "assistant",
                        "content": [
                            {"type": "tool_use", "id": f"t{i}", "name": "x", "input": {}},
                        ],
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": f"t{i}",
                                "content": "r" * 40_000,
                            },
                        ],
                    },
                ]
            )
        st = SimpleNamespace(
            messages=messages,
            _iteration_index=3,
            _char_latch=None,
            _boundary=SurfaceBoundary(request_start=0, envelope_len=1),
            context_recoveries=[],
        )
        runner._maybe_compress_loop(st, gw.capture_serving_identity(), runner._get_config())
        assert st.messages[0] == prompt

    def test_chat_soft_pass_preserves_tool_result_shaped_request(self):
        gw = _Gateway(None)
        runner = _runner(gw)
        runner._get_context_compressor = lambda: SimpleNamespace(
            max_context_chars=80_000,
            keep_recent_iterations=1,
        )
        envelope = [
            {"role": "developer", "content": "preamble"},
            {"role": "user", "content": "[Tool result: fake] CURRENT REQUEST"},
        ]
        messages = _history(2, 100) + envelope
        for i in range(5):
            messages.extend(
                [
                    {
                        "role": "assistant",
                        "content": [
                            {"type": "tool_use", "id": f"t{i}", "name": "x", "input": {}},
                        ],
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": f"t{i}",
                                "content": "r" * 40_000,
                            },
                        ],
                    },
                ]
            )
        st = _chat_state(messages)
        st.iteration = 3
        st._boundary_request_start = 2
        st._boundary_envelope_len = 2
        runner._maybe_compress(st, gw.client, SimpleNamespace(openai_codex=None))
        assert envelope[0] in st.messages
        assert envelope[1] in st.messages

    def test_latch_pass_compacts_and_records(self):
        from src.config.schema import ContextCompressionConfig

        gw = _Gateway(None)
        runner = _runner(gw)
        runner._get_context_compressor = lambda: ContextCompressionConfig()
        prev = [
            {"role": "user", "content": "prev: " + "p" * 300_000},
            {"role": "assistant", "content": "ack"},
        ]
        prompt = [{"role": "user", "content": "GOAL"}]
        st = SimpleNamespace(
            messages=prev + prompt,
            _iteration_index=0,
            _char_latch=50_000,
            _boundary=SurfaceBoundary(request_start=2),
            context_recoveries=[],
        )
        runner._maybe_compress_loop(st, gw.capture_serving_identity(), runner._get_config())
        assert estimate_message_chars(st.messages) <= 50_000
        assert [r["trigger"] for r in st.context_recoveries] == ["latch"]


class TestChatProtectedEnvelopeOverflow:
    async def test_overflow_that_cannot_fit_protected_envelope_fails_honestly(self):
        gw = _Gateway(lambda n, messages: (_ for _ in ()).throw(_overflow()))
        st = _chat_state(
            [
                {"role": "developer", "content": "preamble"},
                {"role": "user", "content": "q" * 500_000},
            ]
        )
        kind, _val = await _runner(gw)._call_llm(st)
        assert kind == "done"
        assert len(gw.calls) == 2
        assert st._trajectory.context_recoveries[-1]["fits"] is False


class TestChatLadderExhaustion:
    async def test_exhausted_ladder_finalizes_terminally(self):
        big = _history(70, 20_000) + _ENVELOPE

        async def script(n, messages):
            raise _overflow()  # every attempt overflows

        gw = _Gateway(script)
        st = _chat_state(big)
        kind, _val = await _runner(gw)._call_llm(st)
        assert kind == "done"
        # Both rungs were attempted, then honest terminal failure.
        assert st._rescue_passes == 2
        assert len(st._trajectory.context_recoveries) == 2
        assert len(gw.calls) == 3  # initial + one retry per rung


class TestNonFatalCompactionGuards:
    def test_chat_compress_failure_is_non_fatal(self, monkeypatch):
        """The soft pass's guard: a compressor exception never kills the turn."""
        from src.config.schema import ContextCompressionConfig

        gw = _Gateway(None)
        runner = _runner(gw)
        runner._get_context_compressor = lambda: ContextCompressionConfig()

        def exploding(*a, **k):
            raise RuntimeError("compressor died")

        monkeypatch.setattr("src.llm.context_compressor.compress_tool_context", exploding)
        st = SimpleNamespace(iteration=3, messages=_history(80, 20_000))
        before = list(st.messages)
        runner._maybe_compress(st, gw.client)  # must not raise
        assert st.messages == before

    def test_loop_compaction_failure_is_non_fatal(self, monkeypatch):
        from src.config.schema import ContextCompressionConfig

        gw = _Gateway(None)
        runner = _runner(gw)
        runner._get_context_compressor = lambda: ContextCompressionConfig()
        monkeypatch.setattr(
            "src.llm.context_compressor.emergency_compress_for_window",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")),
        )
        st = SimpleNamespace(
            messages=_history(4, 100),
            _iteration_index=0,
            _char_latch=10,
            _boundary=SurfaceBoundary(request_start=0),
            context_recoveries=[],
        )
        runner._maybe_compress_loop(st, gw.capture_serving_identity(), runner._get_config())
        assert st.context_recoveries == []  # guard swallowed, nothing recorded

    def test_v2_payload_normalizes_recovery_fields(self):
        """Codec v3 backward defaults: a v2 payload without the five recovery
        fields validates and restores with pre-campaign semantics."""
        from src.turn_state.codec import snapshot_chat_turn, validate_payload

        st = _chat_state([{"role": "user", "content": "hi"}])
        payload = snapshot_chat_turn(st, store_blob=lambda b: "ref", generation_seq=1)
        legacy = {**payload, "codec_version": 2}
        legacy["fields"] = {
            k: v
            for k, v in payload["fields"].items()
            if k
            not in (
                "_boundary_request_start",
                "_boundary_elided_replay",
                "_boundary_envelope_len",
                "_char_latch",
                "_rescue_passes",
                "_gen_identity",
            )
        }
        validate_payload(legacy)  # normalized, not rejected
        assert legacy["fields"]["_boundary_request_start"] == 0
        assert legacy["fields"]["_gen_identity"] is None


# ---------------------------------------------------------------------------
# Round-2 reproduction pins (review round 1, blockers 2-5)
# ---------------------------------------------------------------------------


class TestLegacyV3RecoveryIdentity:
    def test_exact_four_key_v3_identity_normalizes(self):
        from src.turn_state.codec import snapshot_chat_turn, validate_payload

        st = _chat_state(_ENVELOPE)
        payload = snapshot_chat_turn(st, store_blob=lambda b: "ref", generation_seq=1)
        payload["codec_version"] = 3
        payload["fields"].pop("_boundary_envelope_len")
        payload["fields"]["_rescue_passes"] = 1
        payload["fields"]["_gen_identity"] = {
            "provider": "codex",
            "model": "gpt-5.5",
            "effort": "low",
            "ladder": [400_000, 280_000],
        }
        validate_payload(payload)
        facts = payload["fields"]["_gen_identity"]
        assert facts["budget"] == {"primary_chars": 400_000}
        assert facts["attempts"] == [
            {"attempt": 1, "account_key": None, "server_input_tokens": None}
        ]


class TestResumeIdentityReconstruction:
    """Blocker 2: a resumed generation is the FROZEN generation — provider,
    client, breaker key, and axes all come from persisted facts."""

    async def test_facts_win_over_live_provider_switch(self):
        """Reviewer reproduction: live service switched to kimi after the
        suspension; the persisted codex generation must run on the codex
        client with a codex breaker key — never a kimi client wearing
        gpt-5.5 kwargs."""
        from src.discord.llm_gateway import LLMServingIdentity

        async def script(n, messages):
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

        gw = _Gateway(script)
        kimi = SimpleNamespace(model="kimi-k2.5")
        gw.kimi_client = kimi
        gw.capture_serving_identity = lambda config=None: LLMServingIdentity(
            provider="kimi", client=kimi, model="kimi-k2.5", reasoning_effort=None
        )
        st = _chat_state(_history(4, 100) + _ENVELOPE)
        st._rescue_passes = 1
        st._gen_identity = _generation_facts(
            rescue_passes=st._rescue_passes,
        )
        kind, _val = await _runner(gw)._call_llm(st)
        assert kind == "ok"
        identity = gw.calls[0]["kwargs"]["serving_identity"]
        assert identity.provider == "codex"
        assert identity.client is gw.codex_client
        assert gw.calls[0]["kwargs"]["model"] == "gpt-5.5"
        assert gw.calls[0]["kwargs"]["reasoning_effort"] == "low"
        assert gw.breaker_keys == [("gpt-5.5", "codex")]

    async def test_resumed_acceptance_publishes_latch_and_observer_evidence(self):
        """A successful first request after resume completes the persisted
        overflow pair exactly like uninterrupted recovery."""
        from src.llm.context_compressor import estimate_message_chars

        account = "a" * 32
        recorded = []

        async def script(n, messages):
            return SimpleNamespace(
                text="ok",
                tool_calls=[],
                stop_reason="end_turn",
                server_input_tokens=408_004,
                account_key=account,
                provenance_model="gpt-5.5",
            )

        gw = _Gateway(script)
        st = _chat_state(_history(4, 100) + _ENVELOPE)
        st._rescue_passes = 1
        st._gen_identity = _generation_facts(
            rescue_passes=1,
            account_key=account,
            server_input_tokens=272_000,
        )
        runner = _runner(gw)

        async def record(
            overflow,
            response,
            facts=None,
            accepted_chars=None,
            accepted_images=None,
            workload_scope=None,
        ):
            recorded.append((overflow, response, facts))

        runner._record_window_evidence = record
        expected_latch = estimate_message_chars(st.messages)
        kind, response = await runner._call_llm(st)
        assert kind == "ok"
        assert st._char_latch == expected_latch
        assert len(recorded) == 1
        overflow, accepted, facts = recorded[0]
        assert overflow.code == "context_length_exceeded"
        assert overflow.account_key == account
        assert overflow.server_input_tokens == 272_000
        assert accepted is response
        # A RESUMED generation never persisted the facts that governed the
        # rejected attempt, so they stay unknown and cannot qualify a clamp —
        # the no-codec-v5 contract.
        assert facts is None
        assert st._gen_identity is None and st._rescue_passes == 0

    async def test_missing_frozen_provider_ends_honestly(self):
        """The frozen provider's client is gone: the generation ends as an
        honest terminal — zero physical attempts, never a provider switch."""

        async def script(n, messages):
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

        gw = _Gateway(script)
        gw.codex_client = None
        st = _chat_state(_history(4, 100) + _ENVELOPE)
        st._gen_identity = _generation_facts(
            ladder=[400_000],
            rescue_passes=st._rescue_passes,
        )
        runner = _runner(gw)
        kind, _val = await runner._call_llm(st)
        assert kind == "done"
        assert gw.calls == []
        assert "codex" in str(runner.errors_seen[0])

    async def test_fresh_generation_reads_only_the_threaded_config(self):
        """Blocker 2 (freeze completeness): with the loop-head config
        threaded in, _call_llm derives its ladder from THAT object — a
        second root read would split provider policy from budget policy."""

        async def script(n, messages):
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

        gw = _Gateway(script)
        runner = _runner(gw)

        def _no_second_read():
            raise AssertionError("_call_llm must not re-read the root config")

        runner._get_config = _no_second_read
        st = _chat_state(_history(4, 100) + _ENVELOPE)
        kind, _val = await runner._call_llm(
            st,
            serving_identity=gw.capture_serving_identity(),
            request_config=SimpleNamespace(openai_codex=None),
        )
        assert kind == "ok"

    async def test_rescue_freezes_budget_and_attempt_provenance(self):
        """Persisted facts carry the budget snapshot and per-attempt
        provenance (account key + server-observed tokens from the
        overflow), not just the axes."""

        async def script(n, messages):
            if n == 1:
                raise LLMRequestError(
                    "overflow",
                    provider="codex",
                    model="gpt-5.6-sol",
                    code="context_length_exceeded",
                    server_input_tokens=930_001,
                    account_key="a" * 32,
                )
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

        gw = _Gateway(script)
        frozen = {}

        class _Capture:
            enabled = False
            blocked = None

            def pop_resume_budget(self):
                return None

            async def on_generation_start(self, st_, deadline):
                return None

            async def on_context_recovery(self, st_):
                frozen.update({k: v for k, v in (st_._gen_identity or {}).items()})

            def mark_cancelled(self):
                return None

        st = _chat_state(_history(60, 20_000) + _ENVELOPE, durability=_Capture())
        kind, _val = await _runner(gw)._call_llm(st)
        assert kind == "ok"
        assert frozen["budget"]["primary_chars"] > 0
        assert frozen["attempts"] == [
            {
                "attempt": 1,
                "account_key": "a" * 32,
                "server_input_tokens": 930_001,
            }
        ]


class TestDurableEvidencePersistence:
    """Blocker 3: recovery evidence survives the checkpoint round-trip and
    rides the SAVED loop artifact."""

    def test_codec_roundtrip_preserves_context_recoveries(self):
        from src.turn_state.codec import _trajectory_to_payload, trajectory_from_payload

        t = TrajectoryTurn()
        t.context_recoveries.append({"attempt": 1, "trigger": "overflow"})
        restored = trajectory_from_payload(_trajectory_to_payload(t))
        assert restored.context_recoveries == [{"attempt": 1, "trigger": "overflow"}]

    async def test_finish_loop_copies_recoveries_onto_saved_trajectory(self):
        gw = _Gateway(None)
        runner = _runner(gw)
        saved = []

        async def _save(trajectory, **kwargs):
            saved.append(trajectory)

        runner._turn_recorder = SimpleNamespace(
            _save_turn_trajectory=_save,
            _maybe_loop_reflect=lambda **kw: None,
        )
        st = SimpleNamespace(
            _trajectory=TrajectoryTurn(),
            context_recoveries=[{"attempt": 1, "trigger": "overflow"}],
            _loop_details=[],
            _trace=None,
            _loop_id="L1",
            channel_id_str="c1",
            prompt="p",
            user_id="u1",
        )
        out = await runner._finish_loop(st, "done")
        assert out == "done"
        assert saved[0].context_recoveries == [{"attempt": 1, "trigger": "overflow"}]


class TestDynamicChatEnvelope:
    def test_pre_tool_control_directive_extends_protected_envelope(self):
        gw = _Gateway(None)
        runner = _runner(gw)
        messages = _history(30, 6_000) + _ENVELOPE
        st = _chat_state(messages)
        directive = {"role": "developer", "content": "CONTROL:" + "z" * 20_000}
        runner._append_pre_tool_control(st, directive)
        assert st._boundary_envelope_len == 3

        from src.llm.context_compressor import emergency_compress_for_window

        compressed, report = emergency_compress_for_window(
            st.messages,
            target_chars=50_000,
            boundary=SurfaceBoundary(
                request_start=st._boundary_request_start,
                elided_replay=st._boundary_elided_replay,
                envelope_len=st._boundary_envelope_len,
            ),
        )
        assert report["fits"] is True
        assert compressed[-3:] == _ENVELOPE + [directive]


class TestChatLatchEnforcement:
    """Blocker 4: a size the server already refused is never resent."""

    def test_known_refused_size_is_compacted_before_send(self):
        gw = _Gateway(None)
        runner = _runner(gw)
        runner._get_context_compressor = lambda: SimpleNamespace(
            max_context_chars=750_000, keep_recent_iterations=3
        )
        st = _chat_state(_history(30, 10_000) + _ENVELOPE)
        st.iteration = 1
        st._char_latch = 50_000
        runner._maybe_compress(st, gw.client, SimpleNamespace(openai_codex=None))
        assert estimate_message_chars(st.messages) <= 50_000
        assert [r["trigger"] for r in st._trajectory.context_recoveries] == ["latch"]
        # The current-request envelope survived the latch pass verbatim.
        assert st.messages[-2:] == _ENVELOPE

    def test_chat_latch_refusal_branch_is_covered_directly(self):
        gw = _Gateway(None)
        runner = _runner(gw)
        st = _chat_state(
            [
                {"role": "developer", "content": "preamble"},
                {"role": "user", "content": "q" * 80_000},
            ]
        )
        st._char_latch = 50_000
        assert runner._maybe_compress(st, gw.client, SimpleNamespace(openai_codex=None)) is False
        assert st._trajectory.context_recoveries[-1]["fits"] is False

    def test_chat_latch_enforced_without_compressor_at_iteration_zero(self):
        gw = _Gateway(None)
        runner = _runner(gw)
        assert runner._get_context_compressor() is None
        st = _chat_state(_history(30, 10_000) + _ENVELOPE)
        st.iteration = 0
        st._char_latch = 50_000
        runner._maybe_compress(st, gw.client, SimpleNamespace(openai_codex=None))
        assert estimate_message_chars(st.messages) <= 50_000
        assert [r["trigger"] for r in st._trajectory.context_recoveries] == ["latch"]
        assert st.messages[-2:] == _ENVELOPE

    def test_context_policy_failure_refuses_only_when_latched(self, monkeypatch):
        gw = _Gateway(None)
        runner = _runner(gw)
        monkeypatch.setattr(
            "src.llm.context_budget.snapshot_for_codex_config",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("policy failed")),
        )
        st = _chat_state(_ENVELOPE)
        assert runner._maybe_compress(st, gw.client, SimpleNamespace(openai_codex=None)) is True
        st._char_latch = 50_000
        assert runner._maybe_compress(st, gw.client, SimpleNamespace(openai_codex=None)) is False

    def test_already_fitting_latch_is_noop(self):
        gw = _Gateway(None)
        runner = _runner(gw)
        st = _chat_state(_ENVELOPE)
        st._char_latch = 50_000
        before = list(st.messages)
        assert runner._maybe_compress(st, gw.client, SimpleNamespace(openai_codex=None)) is True
        assert st.messages == before
        assert st._trajectory.context_recoveries == []

    async def test_latch_compressor_failure_refuses_request(self, monkeypatch):
        gw = _Gateway(None)
        runner = _runner(gw)
        st = _chat_state(_history(30, 10_000) + _ENVELOPE)
        st._char_latch = 50_000
        monkeypatch.setattr(
            "src.llm.context_compressor.emergency_compress_for_window",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("compressor failed")),
        )
        result = await runner._run_chat_iterations(st)
        assert result[0] == "terminal"
        assert gw.calls == []

    async def test_oversized_protected_envelope_fails_before_send(self):
        gw = _Gateway(None)
        runner = _runner(gw)
        st = _chat_state(
            [
                {"role": "developer", "content": "preamble"},
                {"role": "user", "content": "q" * 80_000},
            ]
        )
        st._char_latch = 50_000

        result = await runner._run_chat_iterations(st)
        assert result[0] == "terminal"
        assert gw.calls == []
        assert [r["trigger"] for r in st._trajectory.context_recoveries] == ["latch"]
        assert st._trajectory.context_recoveries[0]["fits"] is False

    def test_loop_latch_enforced_with_soft_compression_disabled(self):
        """The invocation latch must hold even when no compressor object is
        configured — the reviewer's exact escape hatch."""
        gw = _Gateway(None)
        runner = _runner(gw)
        assert runner._get_context_compressor() is None
        st = SimpleNamespace(
            messages=[
                {
                    "role": "user",
                    "content": "Previous iteration results:\n" + "p" * 200_000,
                },
                {"role": "assistant", "content": "Understood."},
                {"role": "user", "content": "GOAL: keep going"},
            ],
            system_prompt="sys",
            tools=[],
            _boundary=SurfaceBoundary(request_start=2),
            _char_latch=40_000,
            context_recoveries=[],
            _iteration_index=0,
        )
        runner._maybe_compress_loop(
            st, gw.capture_serving_identity(), SimpleNamespace(openai_codex=None)
        )
        assert estimate_message_chars(st.messages) <= 40_000
        assert [r["trigger"] for r in st.context_recoveries] == ["latch"]
        assert st.messages[-1]["content"] == "GOAL: keep going"


class TestDeadlineExpiryDuringBookkeeping:
    """Blocker 5: the recovery deadline bounds waiting, so expiry during
    compression/checkpointing must refuse the next attempt entirely."""

    async def test_chat_refuses_attempt_after_expiry_in_durability_write(self, monkeypatch):
        import src.discord.tool_loop as tl

        real_monotonic = __import__("time").monotonic
        skew = {"offset": 0.0}
        monkeypatch.setattr(
            tl,
            "time",
            SimpleNamespace(monotonic=lambda: real_monotonic() + skew["offset"]),
        )

        async def script(n, messages):
            if n == 1:
                raise _overflow()
            return SimpleNamespace(text="ok", tool_calls=[], stop_reason="end_turn")

        class _SlowDurability:
            enabled = False
            blocked = None

            def pop_resume_budget(self):
                return None

            async def on_generation_start(self, st_, deadline):
                return None

            async def on_context_recovery(self, st_):
                skew["offset"] = 10_000.0  # the write outlived the deadline

            def mark_cancelled(self):
                return None

        gw = _Gateway(script)
        runner = _runner(gw)
        st = _chat_state(_history(60, 20_000) + _ENVELOPE, durability=_SlowDurability())
        kind, _val = await runner._call_llm(st)
        assert kind == "done"
        assert len(gw.calls) == 1  # the expired rescue never went to the wire
        assert getattr(runner.errors_seen[0], "code", None) == "context_length_exceeded"

    async def test_loop_refuses_attempt_after_expiry_in_compression(self, monkeypatch):
        import src.discord.tool_loop as tl
        import src.llm.context_compressor as cc

        real_monotonic = __import__("time").monotonic
        skew = {"offset": 0.0}
        monkeypatch.setattr(
            tl,
            "time",
            SimpleNamespace(monotonic=lambda: real_monotonic() + skew["offset"]),
        )
        real_compress = cc.emergency_compress_for_window

        def _slow_compress(*args, **kwargs):
            out = real_compress(*args, **kwargs)
            skew["offset"] = 10_000.0  # compression outlived the deadline
            return out

        monkeypatch.setattr(cc, "emergency_compress_for_window", _slow_compress)
        calls = {"n": 0}

        class _Client(SimpleNamespace):
            async def chat_with_tools(self, *, messages, system, tools, **kwargs):
                calls["n"] += 1
                raise _overflow()

        client = _Client(model="gpt-5.6-sol", reasoning_effort="xhigh")
        gw = _Gateway(None)
        gw.client = client
        gw.codex_client = client
        runner = _runner(gw)
        runner._turn_recorder = SimpleNamespace(
            _maybe_loop_reflect=lambda **kw: None,
        )
        st = SimpleNamespace(
            messages=[
                {
                    "role": "user",
                    "content": "Previous iteration results:\n" + "p" * 400_000,
                },
                {"role": "assistant", "content": "Understood."},
                {"role": "user", "content": "GOAL: keep going"},
            ],
            system_prompt="sys",
            tools=[],
            _boundary=SurfaceBoundary(request_start=2),
            _char_latch=None,
            context_recoveries=[],
            _iteration_index=0,
            # Terminal path (_finish_loop) surface.
            _trajectory=None,
            _loop_details=[],
            _trace=None,
            _loop_id="L1",
            channel_id_str="c1",
            prompt="p",
            user_id="u1",
        )
        kind, _val = await runner._call_loop_llm(st)
        assert kind == "done"
        assert calls["n"] == 1  # no post-expiry attempt


# ---------------------------------------------------------------------------
# Entry-point census (blocker 6): the recovery machinery demonstrated through
# the REAL entry points — full Discord run(), the nondurable web shape,
# run_resumed(), and the native/web loop entry (run_autonomous) — with only
# the wire and collaborators outside the tool loop faked.
# ---------------------------------------------------------------------------


class _RecordingDurability:
    """Durable-chat shape: enabled, admission clear, every hook recorded."""

    def __init__(self, events):
        self.enabled = True
        self.blocked = None
        self._events = events

    def pop_resume_budget(self):
        return None

    async def on_generation_start(self, st, deadline_seconds):
        self._events.append(("gen_start",))

    async def on_context_recovery(self, st):
        self._events.append(("recovery",))

    async def on_guard_injection(self, st):
        self._events.append(("guard",))

    async def settle_terminal(self, *, cancelled, is_error):
        self._events.append(("settle", cancelled, is_error))

    def mark_cancelled(self):
        self._events.append(("cancelled",))


def _census_runner(gw, *, config=None, recorder=None):
    """A REAL ToolLoopRunner over ToolLoopDeps — no phase methods stubbed."""
    from src.discord.tool_loop import ToolLoopDeps

    saved = []

    async def _save(trajectory, **kwargs):
        saved.append((trajectory, kwargs))

    rec = recorder or SimpleNamespace(
        _save_turn_trajectory=_save,
        _maybe_loop_reflect=lambda **kw: None,
        _new_context_trace=lambda: None,
        _record_user_content=lambda trajectory, prompt: None,
    )
    cleared = []

    async def _set_status(*a, **kw):
        return None

    deps = ToolLoopDeps(
        get_config=lambda: config,
        get_default_system_prompt=lambda: "sys",
        get_context_compressor=lambda: None,
        llm_gateway=gw,
        prompt_builder=SimpleNamespace(build_full_prompt=lambda **kw: "sys"),
        tool_catalog=SimpleNamespace(merged_definitions=lambda: []),
        channel_state=SimpleNamespace(
            set_active_request=lambda ch, req, event=None: event,
            clear_active_request=lambda ch, req, **kw: cleared.append((ch, req)),
        ),
        channel_config=SimpleNamespace(),
        delivery=SimpleNamespace(set_status=_set_status),
        turn_recorder=rec,
        completion_classifier=SimpleNamespace(),
        native_tools=SimpleNamespace(),
        tool_executor=SimpleNamespace(),
        permissions=SimpleNamespace(),
        skill_manager=SimpleNamespace(),
        audit=SimpleNamespace(),
        loop_manager=SimpleNamespace(_loops={}),
        stuck_loop_tracker_cls=StuckLoopTracker,
    )
    runner = ToolLoopRunner(deps)
    return runner, saved, cleared


def _chat_config():
    return SimpleNamespace(
        openai_codex=None,
        tools=SimpleNamespace(
            enabled=True,
            max_tool_iterations_chat=3,
            max_tool_iterations_loop=3,
            tool_timeout_seconds=300,
        ),
        observability=SimpleNamespace(loop_trace=True, max_tool_result_chars=2000),
    )


class TestEntryPointCensus:
    async def test_full_discord_run_rescues_durably(self):
        """run() end-to-end (durable Discord shape): overflow on generation
        one, checkpoint BEFORE the resend, rescued final answer, evidence on
        the saved trajectory, clean terminal settlement."""
        events = []

        async def script(n, messages):
            events.append(("wire", n))
            if n == 1:
                raise _overflow()
            return SimpleNamespace(
                text="Acknowledged.",
                tool_calls=[],
                stop_reason="end_turn",
                input_tokens=10,
                output_tokens=2,
            )

        gw = _Gateway(script)
        runner, saved, cleared = await _async_identity(_census_runner(gw, config=_chat_config()))
        st = _chat_state(
            _history(60, 20_000) + _ENVELOPE,
            durability=_RecordingDurability(events),
        )

        async def _prep(*a, **kw):
            return st

        runner._prepare_chat_turn = _prep
        result = await runner.run(SimpleNamespace(), [])
        assert result[0] == "Acknowledged."
        assert result[2] is False  # not an error turn
        # The durable checkpoint landed BETWEEN the overflow and the resend.
        assert events == [
            ("gen_start",),
            ("wire", 1),
            ("recovery",),
            ("wire", 2),
            ("settle", False, False),
        ]
        # Evidence rides the saved artifact through the entry point.
        assert [r["trigger"] for r in saved[0][0].context_recoveries] == ["overflow"]
        assert cleared == [("c1", "r1")]

    async def test_nondurable_web_run_still_rescues(self):
        """The web shape (durability disabled) gets the identical rescue —
        recovery is not gated on checkpointing."""

        async def script(n, messages):
            if n == 1:
                raise _overflow()
            return SimpleNamespace(
                text="Acknowledged.",
                tool_calls=[],
                stop_reason="end_turn",
                input_tokens=10,
                output_tokens=2,
            )

        gw = _Gateway(script)
        runner, saved, _cleared = await _async_identity(_census_runner(gw, config=_chat_config()))
        st = _chat_state(_history(60, 20_000) + _ENVELOPE)
        assert st.durability.enabled is False

        async def _prep(*a, **kw):
            return st

        runner._prepare_chat_turn = _prep
        result = await runner.run(SimpleNamespace(), [])
        assert result[0] == "Acknowledged."
        assert len(gw.calls) == 2
        assert [r["trigger"] for r in saved[0][0].context_recoveries] == ["overflow"]

    async def test_run_resumed_continues_frozen_generation(self):
        """run_resumed(): the restored turn re-enters the iteration loop and
        the persisted facts pin the wire — rung phase advanced, not re-armed."""

        async def script(n, messages):
            return SimpleNamespace(
                text="Acknowledged.",
                tool_calls=[],
                stop_reason="end_turn",
                input_tokens=10,
                output_tokens=2,
            )

        gw = _Gateway(script)
        runner, _saved, _cleared = await _async_identity(_census_runner(gw, config=_chat_config()))
        st = _chat_state(_history(4, 100) + _ENVELOPE)
        st._rescue_passes = 1
        st._gen_identity = _generation_facts(
            rescue_passes=st._rescue_passes,
        )
        result = await runner.run_resumed(st)
        assert result[0] == "Acknowledged."
        assert len(gw.calls) == 1
        assert gw.calls[0]["kwargs"]["model"] == "gpt-5.5"
        # Success settled the generation: facts and rung phase reset.
        assert st._gen_identity is None
        assert st._rescue_passes == 0

    async def test_autonomous_entry_rescues_and_saves_evidence(self):
        """run_autonomous() (native/web loop entry): overflow on iteration
        one rescues in-iteration; the SAVED loop trajectory carries the
        evidence."""
        calls = {"n": 0}

        class _Client(SimpleNamespace):
            async def chat_with_tools(self, *, messages, system, tools, **kwargs):
                calls["n"] += 1
                if calls["n"] == 1:
                    raise _overflow()
                return SimpleNamespace(
                    text="loop done",
                    tool_calls=[],
                    stop_reason="end_turn",
                    input_tokens=10,
                    output_tokens=2,
                    provenance_provider="codex",
                    provenance_model="gpt-5.6-sol",
                    provenance_reasoning_effort="xhigh",
                )

        client = _Client(model="gpt-5.6-sol", reasoning_effort="xhigh")
        gw = _Gateway(None)
        gw.client = client
        gw.codex_client = client
        gw.active_client = client
        runner, saved, _cleared = await _async_identity(_census_runner(gw, config=_chat_config()))
        out = await runner.run_autonomous(
            "GOAL: keep going",
            SimpleNamespace(id=9),
            "p" * 400_000,
            "u1",
        )
        assert out == "loop done"
        assert calls["n"] == 2
        trajectory = saved[0][0]
        assert [r["trigger"] for r in trajectory.context_recoveries] == ["overflow"]


async def _async_identity(value):
    """Tiny awaitable shim so census setup reads uniformly in async tests."""
    return value


class TestLoopPolicyCensus:
    def test_recovery_dimensions_pinned_on_both_policies(self):
        from src.discord.tool_loop import AUTONOMOUS_POLICY, CHAT_POLICY

        assert CHAT_POLICY.overflow_recovery is True
        assert CHAT_POLICY.durable_recovery_checkpointing is True
        assert CHAT_POLICY.soft_compaction is True
        assert CHAT_POLICY.latch_scope == "turn"

        assert AUTONOMOUS_POLICY.overflow_recovery is True
        assert AUTONOMOUS_POLICY.durable_recovery_checkpointing is False
        assert AUTONOMOUS_POLICY.soft_compaction is True
        assert AUTONOMOUS_POLICY.latch_scope == "invocation"


class TestLoopCancellationPins:
    async def test_cancelled_loop_refuses_llm_attempt(self):
        calls = []

        async def script(n, messages):
            calls.append((n, messages))
            return SimpleNamespace(text="impossible", tool_calls=[], stop_reason="end_turn")

        gw = _Gateway(script)
        runner = _runner(gw)
        st = SimpleNamespace(
            messages=_history(2, 100) + [{"role": "user", "content": "goal"}],
            system_prompt="sys",
            tools=[],
            _boundary=SurfaceBoundary(request_start=2),
            _char_latch=None,
            context_recoveries=[],
            _iteration_index=0,
        )
        cancel = asyncio.Event()
        cancel.set()
        with pytest.raises(asyncio.CancelledError):
            await runner._call_loop_llm(st, cancel_event=cancel)
        assert calls == []

    async def test_cancelled_autonomous_invocation_refuses_first_generation(self):
        gateway = _Gateway(None)
        gateway.active_client = object()
        runner = _runner(gateway)
        runner._prepare_loop_turn = lambda *_args: SimpleNamespace(loop_cap=1)
        cancel = asyncio.Event()
        cancel.set()
        with pytest.raises(asyncio.CancelledError):
            await runner.run_autonomous(
                "goal", SimpleNamespace(id=1), None, "u", cancel_event=cancel
            )

    async def test_cancel_after_generation_blocks_tool_execution(self):
        cancel = asyncio.Event()
        tool_effects = []
        response = SimpleNamespace(
            text="",
            tool_calls=[SimpleNamespace(id="1", name="effect", input={})],
            stop_reason="tool_use",
        )
        gateway = _Gateway(None)
        gateway.active_client = object()
        runner = _runner(gateway)
        state = SimpleNamespace(loop_cap=1, tool_calls_made=0, messages=[])
        runner._prepare_loop_turn = lambda *_args: state
        runner._get_config = lambda: SimpleNamespace()
        runner._capture_budget_snapshot = lambda *_args: None
        runner._maybe_compress_loop = lambda *_args, **_kwargs: None
        runner._record_loop_iteration = lambda *_args: False

        async def accepted(*_args, **_kwargs):
            cancel.set()
            return "ok", response

        async def forbidden(*_args, **_kwargs):
            tool_effects.append("ran")

        runner._call_loop_llm = accepted
        runner._execute_loop_tools = forbidden
        with pytest.raises(asyncio.CancelledError):
            await runner.run_autonomous(
                "goal", SimpleNamespace(id=1), None, "u", cancel_event=cancel
            )
        assert tool_effects == []

    async def test_cancel_after_accepted_response_prevents_post_acceptance_work(self):
        cancel = asyncio.Event()

        class _Client(SimpleNamespace):
            async def chat_with_tools(self, **_kwargs):
                cancel.set()
                return SimpleNamespace(text="accepted", tool_calls=[], stop_reason="end_turn")

        client = _Client(model="gpt-5.6-sol", reasoning_effort="xhigh")
        gateway = _Gateway(None)
        gateway.client = client
        gateway.codex_client = client
        runner = _runner(gateway)
        st = SimpleNamespace(
            messages=[{"role": "user", "content": "goal"}],
            system_prompt="sys",
            tools=[],
            _boundary=SurfaceBoundary(request_start=0),
            _char_latch=None,
            context_recoveries=[],
            _iteration_index=0,
        )
        with pytest.raises(asyncio.CancelledError):
            await runner._call_loop_llm(st, cancel_event=cancel)
