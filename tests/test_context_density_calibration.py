"""Density calibration, predictive pre-send descent, and clamp qualification.

The defect these pin: a fixed 2.5 chars/token estimate is blind to dense
content and completely blind to image blocks (real tokens, almost no
characters). Dense turns therefore overflowed while believed to be inside
budget, and the rescue's compressed acceptance was then recorded as a window
CLAMP — which is how terra ended up clamped at 288,499 against its 917,506
floor while the served window had not moved at all.

Every derivation/belief case runs at utilization {40, 60, 100}: utilization is
quality POLICY and must never be privileged or depended upon by this
machinery (Aaron, 2026-08-30 — he runs 40, the default is 60).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from src.llm.context_budget import (
    DEFAULT_DENSITY_MILLI,
    MAX_DENSITY_MILLI,
    MIN_DENSITY_MILLI,
    clamp_density_milli,
    estimate_request_tokens,
    estimate_request_tokens_forensic,
    resolve_context_budget,
)
from src.llm.context_compressor import estimate_message_images
from src.llm.window_observer import WindowObserver

ACCT_A = "a" * 32
ACCT_B = "b" * 32
UTILIZATIONS = (40, 60, 100)


def _chat_st_stub(req_id="t1"):
    """Minimal turn state carrying only what workload scoping reads."""
    return SimpleNamespace(_req_id=req_id, _loop_id=None)


def _scope(kind="agent", wid="w1"):
    """A workload identity for calibration tests."""
    from src.llm.context_budget import WorkloadScope

    return WorkloadScope(kind, wid)


def _rejected_facts(*, chars=100_000, images=0, density=2500, budget=921_601, believed=True):
    """Frozen facts for a rejected attempt, defaulting to the QUALIFYING shape.

    Defaults describe a payload believed to fit whose post-hoc re-check still
    says it should have fit — i.e. genuine shrink evidence.
    """
    from src.llm.context_budget import RejectedAttemptFacts, estimate_request_tokens

    return RejectedAttemptFacts(
        chars=chars,
        images=images,
        density_milli=density,
        estimated_tokens=estimate_request_tokens(chars, images, density_milli=density),
        effective_budget=budget,
        believed_within=believed,
    )


#: Accepted-retry measurements that yield a usable raw sample density.
ACCEPTED_SAMPLE = {"accepted_chars": 100_000, "accepted_images": 0}


# The measured field pair: this acceptance echoed 684,031 server input tokens
# for a 391,046-character payload — about 0.61 chars/token, a 4.1x overshoot
# against the historical 2.5 constant, in the dangerous direction.
FIELD_CHARS = 391_046
FIELD_TOKENS = 684_031
FIELD_DENSITY_MILLI = 609


def _observer(tmp_path) -> WindowObserver:
    return WindowObserver(tmp_path / "context_windows.json")


def _overflow(*, tokens=None, key=ACCT_A, model="gpt-5.6-sol", code="context_length_exceeded"):
    return SimpleNamespace(code=code, server_input_tokens=tokens, account_key=key, model=model)


def _acceptance(*, tokens=408_004, key=ACCT_A, model="gpt-5.6-sol"):
    return SimpleNamespace(server_input_tokens=tokens, account_key=key, provenance_model=model)


class TestDerivationCompatibility:
    @pytest.mark.parametrize("utilization", UTILIZATIONS)
    @pytest.mark.parametrize(
        "model", ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.5", "gpt-5.4-mini", "unknown-model"]
    )
    def test_default_density_is_bit_exact_with_the_historical_constant(self, model, utilization):
        """The default must reproduce the pre-calibration derivation EXACTLY.

        If this drifts, every existing budget silently changes size on upgrade.
        """
        snap = resolve_context_budget(model, utilization=utilization)
        expected = snap.compactable_tokens * 5 // 2  # historical `× 2.5` form
        assert snap.derived_chars == expected
        assert snap.density_milli == DEFAULT_DENSITY_MILLI
        assert snap.density_source == "default"

    @pytest.mark.parametrize("utilization", UTILIZATIONS)
    def test_calibration_only_ever_shrinks_targets(self, utilization):
        """One-way safety: the band's ceiling IS the historical constant, so no
        calibration can enlarge a derived target."""
        base = resolve_context_budget("gpt-5.6-sol", utilization=utilization)
        for density in (MIN_DENSITY_MILLI, FIELD_DENSITY_MILLI, 1500, MAX_DENSITY_MILLI):
            snap = resolve_context_budget(
                "gpt-5.6-sol", utilization=utilization, density_milli=density
            )
            assert snap.derived_chars <= base.derived_chars
            assert snap.ladder == tuple(r for r in snap.ladder if r > 0)
            # Ladder stays non-increasing regardless of calibration.
            assert list(snap.ladder) == sorted(snap.ladder, reverse=True)

    def test_field_density_survives_the_floor_unclipped(self):
        """The measured 609 must NOT be clipped.

        A floor at 1000 (the original proposal) would conceal the exact defect
        this machinery exists to measure and preserve the underestimation.
        """
        assert MIN_DENSITY_MILLI < FIELD_DENSITY_MILLI
        assert clamp_density_milli(FIELD_DENSITY_MILLI) == FIELD_DENSITY_MILLI

    def test_band_edges_and_junk_are_total(self):
        assert clamp_density_milli(1) == MIN_DENSITY_MILLI
        assert clamp_density_milli(10**9) == MAX_DENSITY_MILLI
        assert clamp_density_milli(True) == DEFAULT_DENSITY_MILLI  # bool is not an int here
        assert clamp_density_milli(None) == DEFAULT_DENSITY_MILLI
        assert clamp_density_milli("609") == DEFAULT_DENSITY_MILLI


class TestRequestEstimation:
    def test_ceil_division_never_rounds_an_excess_into_within(self):
        """A one-token excess rounding down is exactly what manufactures a
        false belief and, downstream, a false clamp."""
        envelope = estimate_request_tokens(0, 0)
        # 2500 chars is exactly 1000 tokens at 2.5 chars/token; ONE more
        # character must cost a whole token rather than rounding away.
        assert estimate_request_tokens(2500, 0, density_milli=2500) == envelope + 1000
        assert estimate_request_tokens(2501, 0, density_milli=2500) == envelope + 1001
        assert estimate_request_tokens(1, 0, density_milli=2500) == envelope + 1

    @pytest.mark.parametrize("bad_density", (True, 0, -1, 1.5, "100"))
    def test_forensic_estimator_rejects_nonpositive_or_nonintegral_density(self, bad_density):
        with pytest.raises(ValueError, match="positive integer"):
            estimate_request_tokens_forensic(100_000, 0, density_milli=bad_density)

    def test_images_are_charged_because_characters_cannot_see_them(self):
        envelope = estimate_request_tokens(0, 0)
        assert estimate_request_tokens(0, 4) == envelope + 4 * 2_500

    def test_image_only_payload_is_invisible_to_characters(self):
        """The core blindness: 30 screenshots measure ~0 chars but cost real
        tokens, so a character-only estimate believes an empty payload."""
        images = [
            {
                "role": "user",
                "content": [{"type": "image", "source": {"type": "base64", "data": "x" * 50}}],
            }
            for _ in range(30)
        ]
        from src.llm.context_compressor import estimate_message_chars

        assert estimate_message_chars(images) < 200  # essentially invisible
        assert estimate_message_images(images) == 30
        assert (
            estimate_request_tokens(estimate_message_chars(images), estimate_message_images(images))
            >= 30 * 2_500
        )


class TestImageCountingParity:
    """Semantic parity with the Codex converter — deliberately NOT raw
    block-count identity."""

    def test_valid_base64_with_data_is_counted(self):
        msgs = [
            {
                "role": "user",
                "content": [{"type": "image", "source": {"type": "base64", "data": "abc"}}],
            }
        ]
        assert estimate_message_images(msgs) == 1

    def test_empty_data_is_serialized_but_deliberately_not_charged(self):
        """The converter DOES emit an input_image for empty data, so this is a
        documented carve-out, not a parity bug: an empty image carries no
        payload worth a full surcharge."""
        msgs = [
            {
                "role": "user",
                "content": [{"type": "image", "source": {"type": "base64", "data": ""}}],
            }
        ]
        assert estimate_message_images(msgs) == 0

    def test_non_base64_source_is_not_counted(self):
        msgs = [
            {
                "role": "user",
                "content": [{"type": "image", "source": {"type": "url", "data": "http://x"}}],
            }
        ]
        assert estimate_message_images(msgs) == 0

    def test_image_nested_in_tool_result_is_not_counted(self):
        """Conversion flattens tool_result content to TEXT only, so a nested
        image never reaches the wire; charging it would fabricate cost."""
        msgs = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": "t1",
                        "content": [{"type": "image", "source": {"type": "base64", "data": "zz"}}],
                    }
                ],
            }
        ]
        assert estimate_message_images(msgs) == 0

    def test_converter_parity_on_the_same_payload(self):
        """Drive the REAL converter: every block it emits as an input_image
        with non-empty data must be exactly what the counter charges."""
        from src.llm.openai_codex import CodexChatClient

        msgs = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "data": "aaa"}},
                    {"type": "image", "source": {"type": "base64", "data": ""}},
                    {"type": "image", "source": {"type": "url", "data": "u"}},
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": "t",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "data": "nested"}},
                        ],
                    },
                ],
            },
        ]
        # The converter is an instance method but touches no instance state;
        # the __new__ seam avoids constructing a real authenticated client.
        client = CodexChatClient.__new__(CodexChatClient)
        converted = client._convert_messages_with_tools(msgs)
        emitted = [
            b
            for item in converted
            if isinstance(item, dict)
            for b in (item.get("content") or [])
            if isinstance(b, dict) and b.get("type") == "input_image"
        ]
        charged = [b for b in emitted if not b.get("image_url", "").endswith("base64,")]
        assert len(charged) == estimate_message_images(msgs) == 1
        # The empty-data block IS emitted — the carve-out is deliberate.
        assert len(emitted) == 2


class TestDensityCalibration:
    def test_first_observation_seeds_from_measurement(self, tmp_path):
        obs = _observer(tmp_path)
        obs.record_density(
            scope=_scope(),
            model="gpt-5.6-sol",
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )
        assert obs.density_for(_scope(), "gpt-5.6-sol") == FIELD_DENSITY_MILLI

    def test_repeated_downward_updates_cross_below_1000_and_converge(self, tmp_path):
        """Odin's load-bearing pin: from a sparse prior, dense evidence must
        cross below 1000 and converge on the measured value."""
        obs = _observer(tmp_path)
        obs.record_density(
            scope=_scope(),
            model="gpt-5.6-sol",
            chars_sent=900_000,
            images_sent=0,
            server_input_tokens=350_000,
        )
        assert obs.density_for(_scope(), "gpt-5.6-sol") == MAX_DENSITY_MILLI
        seen = []
        for _ in range(14):
            obs.record_density(
                scope=_scope(),
                model="gpt-5.6-sol",
                chars_sent=FIELD_CHARS,
                images_sent=0,
                server_input_tokens=FIELD_TOKENS,
            )
            seen.append(obs.density_for(_scope(), "gpt-5.6-sol"))
        assert any(v < 1000 for v in seen)
        assert seen[-1] == FIELD_DENSITY_MILLI
        assert seen == sorted(seen, reverse=True)  # monotonic descent

    def test_downward_reacts_faster_than_upward(self, tmp_path):
        """Asymmetry is the point: dense evidence must bite on the next turn,
        while one sparse turn must not erase the lesson."""
        down = _observer(tmp_path / "d")
        up = _observer(tmp_path / "u")
        for obs in (down, up):
            obs._density_milli[("agent", "w1", "gpt-5.6-sol")] = 1500
        down.record_density(
            scope=_scope(),
            model="gpt-5.6-sol",
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )
        up.record_density(
            scope=_scope(),
            model="gpt-5.6-sol",
            chars_sent=900_000,
            images_sent=0,
            server_input_tokens=350_000,
        )
        assert (
            1500 - down.density_for(_scope(), "gpt-5.6-sol")
            > up.density_for(_scope(), "gpt-5.6-sol") - 1500
        )

    def test_calibration_is_per_canonical_model_and_alias_aware(self, tmp_path):
        obs = _observer(tmp_path)
        obs.record_density(
            scope=_scope(),
            model="codex-auto-review",
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )
        assert obs.density_for(_scope(), "gpt-5.6-luna") == FIELD_DENSITY_MILLI
        assert obs.density_for(_scope(), "gpt-5.6-sol") is None  # not shared across models

    @pytest.mark.parametrize(
        "kwargs",
        [
            {
                "chars_sent": 100,
                "images_sent": 0,
                "server_input_tokens": 684_031,
            },  # below char floor
            {"chars_sent": 100_000, "images_sent": 0, "server_input_tokens": None},  # no usage echo
            {"chars_sent": 100_000, "images_sent": 0, "server_input_tokens": 0},  # non-positive
            {
                "chars_sent": 100_000,
                "images_sent": 300,
                "server_input_tokens": 100_000,
            },  # image-dominated
            {
                "chars_sent": 100_000,
                "images_sent": 0,
                "server_input_tokens": 50_000,
            },  # residual too small
            {
                "chars_sent": True,
                "images_sent": 0,
                "server_input_tokens": 684_031,
            },  # bool is not a count
            {
                "chars_sent": 100_000,
                "images_sent": -1,
                "server_input_tokens": 684_031,
            },  # negative image count is not a payload shape
        ],
    )
    def test_unusable_samples_record_no_observation(self, tmp_path, kwargs):
        obs = _observer(tmp_path)
        obs.record_density(scope=_scope(), model="gpt-5.6-sol", **kwargs)
        assert obs.density_for(_scope(), "gpt-5.6-sol") is None

    def test_subfloor_sample_seeds_at_floor_and_ema_uses_banded_value(self, tmp_path):
        obs = _observer(tmp_path)
        obs.record_density(
            scope=_scope(),
            model="gpt-5.6-sol",
            chars_sent=100_000,
            images_sent=0,
            server_input_tokens=1_042_000,  # raw density 100
        )
        assert obs.density_for(_scope(), "gpt-5.6-sol") == MIN_DENSITY_MILLI

        # A corrupt prior below the storage band cannot drag a subsequent EMA
        # below the floor; storage applies the band after every update too.
        obs._density_milli[("agent", "w1", "gpt-5.6-sol")] = 100
        obs.record_density(
            scope=_scope(),
            model="gpt-5.6-sol",
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )
        assert obs.density_for(_scope(), "gpt-5.6-sol") == MIN_DENSITY_MILLI

    def test_non_codex_model_names_do_not_calibrate(self, tmp_path):
        obs = _observer(tmp_path)
        obs.record_density(
            scope=_scope(),
            model=None,
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )
        assert obs.workload_calibration_summary() == {}

    def test_density_never_enters_the_durable_store(self, tmp_path):
        obs = _observer(tmp_path)
        obs.record_density(
            scope=_scope(),
            model="gpt-5.6-sol",
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )
        assert "density" not in repr(obs.view())
        # A fresh observer over the same path relearns from scratch.
        assert _observer(tmp_path).density_for(_scope(), "gpt-5.6-sol") is None


class TestClampQualification:
    """The headline defect. A clamp asserts the served window SHRANK; only an
    attempt we believed would fit can support that claim."""

    async def test_density_overshoot_rescues_without_clamping(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=288_499),
            rejected_attempt=_rejected_facts(believed=False),
            **ACCEPTED_SAMPLE,
        )
        assert obs.active_clamp("gpt-5.6-sol") is None
        # History still records — the observation is not discarded, only
        # disqualified from asserting a window change.
        record = obs.view()["accounts"][ACCT_A]["models"]["gpt-5.6-sol"]
        assert record["overflow_occurrences"] == 1
        assert record["highest_accepted_input"] == 288_499

    async def test_genuine_shrink_still_clamps(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=288_499),
            rejected_attempt=_rejected_facts(),
            **ACCEPTED_SAMPLE,
        )
        assert obs.active_clamp("gpt-5.6-sol") == 288_499

    async def test_unknown_belief_cannot_clamp(self, tmp_path):
        """Resumed generations report None; unknown must behave like False for
        clamp purposes, never like True."""
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(),
            rejected_attempt=None,
            **ACCEPTED_SAMPLE,
        )
        assert obs.active_clamp("gpt-5.6-sol") is None

    async def test_absent_facts_cannot_clamp(self, tmp_path):
        """A caller that supplies no evidence gets NO clamp rather than an
        unconditional one: clamp evidence must be affirmative, and the absence
        of contradiction is not proof that the window shrank."""
        obs = _observer(tmp_path)
        await obs.record_rescue(overflow=_overflow(), response=_acceptance())
        assert obs.active_clamp("gpt-5.6-sol") is None
        # History still records — the observation is disqualified, not discarded.
        assert obs.view()["accounts"][ACCT_A]["models"]["gpt-5.6-sol"]["overflow_occurrences"] == 1

    async def test_disqualified_rescue_does_not_tighten_a_live_clamp(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=500_000),
            rejected_attempt=_rejected_facts(),
            **ACCEPTED_SAMPLE,
        )
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=200_000),
            rejected_attempt=_rejected_facts(believed=False),
            **ACCEPTED_SAMPLE,
        )
        assert obs.active_clamp("gpt-5.6-sol") == 500_000

    async def test_the_terra_night_scenario_forms_no_clamp(self, tmp_path):
        """Replay of the real incident shape: a payload far over the window at
        true density overflows, rescue succeeds — and the window is untouched.

        Before this change the acceptance became a 24h clamp 3.4x below the
        model's real floor, dragging every later turn down with it.
        """
        obs = _observer(tmp_path)
        snapshot = resolve_context_budget("gpt-5.6-terra", utilization=40)
        estimated = estimate_request_tokens(2_420_000, 0, density_milli=snapshot.density_milli)
        believed_within = estimated <= snapshot.effective_budget
        assert believed_within is False  # we EXPECTED this rejection
        await obs.record_rescue(
            overflow=_overflow(model="gpt-5.6-terra"),
            response=_acceptance(tokens=288_499, model="gpt-5.6-terra"),
            rejected_attempt=_rejected_facts(
                chars=2_420_000,
                density=snapshot.density_milli,
                budget=snapshot.effective_budget,
                believed=believed_within,
            ),
            **ACCEPTED_SAMPLE,
        )
        assert obs.active_clamp("gpt-5.6-terra") is None


class TestUtilizationIsPolicyNotPhysics:
    """Utilization is a QUALITY knob. Admission and clamp qualification must
    consult the physical window, so neither 40 nor 60 is ever privileged."""

    @pytest.mark.parametrize("utilization", UTILIZATIONS)
    def test_effective_budget_is_independent_of_utilization(self, utilization):
        snap = resolve_context_budget("gpt-5.6-sol", utilization=utilization)
        assert snap.effective_budget == 921_601  # the window does not move

    @pytest.mark.parametrize("utilization", (40, 60))
    def test_same_payload_gets_the_same_verdict_at_either_setting(self, utilization):
        """A 700K-char payload sits UNDER the policy target at both settings
        yet is over the physical window at measured density — so the belief,
        which drives admission, must not depend on the knob."""
        snap = resolve_context_budget("gpt-5.6-sol", utilization=utilization)
        assert 700_000 < snap.primary_chars  # under policy at both settings
        estimated = estimate_request_tokens(700_000, 0, density_milli=FIELD_DENSITY_MILLI)
        assert estimated > snap.effective_budget  # over physics at both


class TestTotality:
    """Calibration is best-effort telemetry: it must never fail a request that
    already succeeded, and a broken observer must never break a surface."""

    def test_density_for_survives_broken_internal_state(self, tmp_path):
        obs = _observer(tmp_path)
        obs._density_milli = None  # type: ignore[assignment]
        assert obs.density_for(_scope(), "gpt-5.6-sol") is None

    def test_density_snapshot_survives_broken_internal_state(self, tmp_path):
        obs = _observer(tmp_path)
        obs._density_milli = None  # type: ignore[assignment]
        assert obs.workload_calibration_summary() == {}

    def test_record_density_survives_broken_internal_state(self, tmp_path):
        obs = _observer(tmp_path)
        obs._density_milli = None  # type: ignore[assignment]
        # Must not raise: a calibration miss is never worth an exception on a
        # request the server already accepted.
        obs.record_density(
            scope=_scope(),
            model="gpt-5.6-sol",
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )

    def test_agent_density_recorder_ignores_non_dict_responses(self, tmp_path):
        from src.discord.native_tools.agents_tasks import _make_density_recorder

        obs = _observer(tmp_path)
        recorder = _make_density_recorder(obs, {"id": "w1"})
        recorder(SimpleNamespace(text="not a dict"), FIELD_CHARS, 0)
        assert obs.workload_calibration_summary() == {}

    def test_agent_density_recorder_swallows_observer_failure(self):
        from src.discord.native_tools.agents_tasks import _make_density_recorder

        class _Broken:
            def record_density(self, **kwargs):
                raise RuntimeError("observer down")

        recorder = _make_density_recorder(_Broken(), {"id": "w1"})
        recorder(
            {
                "provider": "codex",
                "model": "gpt-5.6-sol",
                "server_input_tokens": FIELD_TOKENS,
            },
            FIELD_CHARS,
            0,
        )  # must not raise

    def test_agent_density_recorder_for_absent_observer_is_none(self):
        from src.discord.native_tools.agents_tasks import _make_density_recorder

        assert _make_density_recorder(None) is None

    def test_agent_density_recorder_feeds_the_observer(self, tmp_path):
        from src.discord.native_tools.agents_tasks import _make_density_recorder

        obs = _observer(tmp_path)
        _make_density_recorder(obs, {"id": "w1"})(
            {
                "provider": "codex",
                "model": "gpt-5.6-sol",
                "server_input_tokens": FIELD_TOKENS,
            },
            FIELD_CHARS,
            0,
        )
        assert obs.density_for(_scope(), "gpt-5.6-sol") == FIELD_DENSITY_MILLI

    def test_agent_density_recorder_rejects_non_codex_response_provenance(self, tmp_path):
        """Response provenance, not a Codex-looking model slug or client
        shape, gates shared calibration."""
        from src.discord.native_tools.agents_tasks import _make_density_recorder

        obs = _observer(tmp_path)
        _make_density_recorder(obs, {"id": "w1"})(
            {
                "provider": "ollama",
                "model": "gpt-5.6-sol",
                "server_input_tokens": FIELD_TOKENS,
            },
            FIELD_CHARS,
            0,
        )
        assert obs.density_for(_scope(), "gpt-5.6-sol") is None

    def test_agent_plan_uses_authoritative_provider_for_density_and_prediction(self):
        """A non-Codex serving identity may wrap a Codex-shaped client; its
        model and usage still cannot enter Codex calibration or prediction."""
        from src.discord.native_tools.agents_tasks import _capture_agent_generation_plan

        class Observer:
            def active_clamp(self, _model):
                return None

            def density_for(self, _scope, _model):
                return FIELD_DENSITY_MILLI

        client = SimpleNamespace(model="gpt-5.6-sol", reasoning_effort="xhigh")
        serving = SimpleNamespace(provider="ollama", client=client)
        cfg = SimpleNamespace(openai_codex=SimpleNamespace())
        plan = _capture_agent_generation_plan(
            lambda: cfg,
            lambda _cfg: serving,
            lambda: None,
            model_override=None,
            effort_override=None,
            observer=Observer(),
        )
        assert plan["provider"] == "ollama"
        assert plan["is_codex"] is False
        assert plan["snapshot"].canonical_model == ""
        assert plan["snapshot"].density_milli == 2500
        assert plan["snapshot"].density_source == "default"

    def test_production_snapshot_paths_consume_observer_density(self):
        """All production snapshot constructors must consume the same live
        calibration they expose through the API."""
        from src.config.schema import OpenAICodexConfig
        from src.discord.llm_gateway import LLMServingIdentity
        from src.discord.native_tools.agents_tasks import (
            _generation_budget_snapshot,
            _make_budget_snapshot_provider,
        )
        from src.discord.tool_loop import ToolLoopRunner

        class Observer:
            def active_clamp(self, _model):
                return None

            def density_for(self, _scope, model):
                return FIELD_DENSITY_MILLI if model == "gpt-5.6-sol" else None

        observer = Observer()
        cfg = SimpleNamespace(openai_codex=OpenAICodexConfig())
        client = SimpleNamespace(model="gpt-5.6-sol", reasoning_effort="xhigh")

        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        runner._window_observer = observer
        runner._get_context_compressor = lambda: None
        serving = LLMServingIdentity("codex", client, client.model, client.reasoning_effort)
        # Every production constructor must be given a workload identity;
        # without one it must fall back to the prior rather than borrow.
        chat_and_loop = runner._capture_budget_snapshot(serving, cfg, _chat_st_stub())
        assert runner._capture_budget_snapshot(serving, cfg).density_milli == 2500

        direct_agent = _generation_budget_snapshot(
            cfg,
            client,
            client.model,
            None,
            observer=observer,
            is_codex=True,
            scope=_scope(),
        )
        compatibility_provider = _make_budget_snapshot_provider(
            lambda: cfg,
            lambda: client,
            lambda: None,
            None,
            observer=observer,
            agent_id_cell={"id": "w1"},
        )()

        for snapshot in (chat_and_loop, direct_agent, compatibility_provider):
            assert snapshot.density_milli == FIELD_DENSITY_MILLI
            assert snapshot.density_source == "calibrated"
            assert snapshot.primary_chars < resolve_context_budget("gpt-5.6-sol").primary_chars

    def test_production_snapshot_density_lookup_is_total(self):
        from src.config.schema import OpenAICodexConfig
        from src.discord.llm_gateway import LLMServingIdentity
        from src.discord.native_tools.agents_tasks import _generation_budget_snapshot
        from src.discord.tool_loop import ToolLoopRunner

        class Broken:
            def active_clamp(self, _model):
                return None

            def density_for(self, _scope, _model):
                raise RuntimeError("density down")

        cfg = SimpleNamespace(openai_codex=OpenAICodexConfig())
        client = SimpleNamespace(model="gpt-5.6-sol", reasoning_effort="xhigh")
        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        runner._window_observer = Broken()
        runner._get_context_compressor = lambda: None
        serving = LLMServingIdentity("codex", client, client.model, client.reasoning_effort)

        chat = runner._capture_budget_snapshot(serving, cfg)
        agent = _generation_budget_snapshot(
            cfg, client, client.model, None, observer=Broken(), is_codex=True
        )
        assert chat.density_source == "default"
        assert agent.density_source == "default"

    def test_chat_surface_density_hook_is_codex_gated_and_total(self, tmp_path):
        from src.discord.tool_loop import ToolLoopRunner

        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        obs = _observer(tmp_path)
        runner._window_observer = obs
        response = SimpleNamespace(provenance_model="gpt-5.6-sol", server_input_tokens=FIELD_TOKENS)
        non_codex = SimpleNamespace(is_codex=False, model="qwen3:14b")
        runner._record_density(None, response, FIELD_CHARS, 0, non_codex)
        assert obs.workload_calibration_summary() == {}

        codex = SimpleNamespace(is_codex=True, model="gpt-5.6-sol")
        runner._record_density(_chat_st_stub(), response, FIELD_CHARS, 0, codex)
        # Recorded under the CHAT workload that sent it — an agent scope with
        # the same id must NOT see it.
        assert obs.density_for(_scope("chat", "t1"), "gpt-5.6-sol") == FIELD_DENSITY_MILLI
        assert obs.density_for(_scope("agent", "t1"), "gpt-5.6-sol") is None

        class _Broken:
            def record_density(self, **kwargs):
                raise RuntimeError("observer down")

        runner._window_observer = _Broken()
        runner._record_density(_chat_st_stub(), response, FIELD_CHARS, 0, codex)  # must not raise

    def test_chat_measure_payload_survives_junk(self):
        from src.discord.tool_loop import ToolLoopRunner

        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        assert runner._measure_payload(None) == (0, 0)

    def test_chat_belief_survives_junk_messages(self):
        from src.discord.tool_loop import ToolLoopRunner

        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        snapshot = resolve_context_budget("gpt-5.6-sol")
        serving = SimpleNamespace(is_codex=True, model="gpt-5.6-sol")
        assert runner._believed_within_effective_budget(None, snapshot, serving) is None

    def test_agent_belief_survives_junk_messages(self):
        from src.agents.manager import _believed_within_effective_budget

        assert (
            _believed_within_effective_budget(None, resolve_context_budget("gpt-5.6-sol")) is None
        )

    def test_chat_descent_is_fail_open_when_the_compactor_raises(self, monkeypatch):
        """The whole point of fail-open: a compactor failure must leave the
        payload untouched and let the provider be the authority."""
        import src.llm.context_compressor as cc
        from src.discord.tool_loop import ToolLoopRunner

        def _boom(*a, **k):
            raise RuntimeError("compactor down")

        monkeypatch.setattr(cc, "emergency_compress_for_window", _boom)
        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        runner._window_observer = None
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        messages = [{"role": "user", "content": "y" * 20_000} for _ in range(60)]
        st = SimpleNamespace(
            messages=messages,
            _trajectory=SimpleNamespace(context_recoveries=[]),
            _boundary_request_start=58,
            _boundary_elided_replay=0,
            _boundary_envelope_len=2,
            _char_latch=None,
        )
        serving = SimpleNamespace(is_codex=True, model="gpt-5.6-sol")
        assert runner._predictive_presend_descent(st, snapshot, serving) == 0
        assert st.messages is messages  # untouched

    def test_agent_descent_is_fail_open_when_the_compactor_raises(self, monkeypatch):
        import src.llm.context_compressor as cc
        from src.agents.manager import AgentInfo, _predictive_presend_descent

        def _boom(*a, **k):
            raise RuntimeError("compactor down")

        monkeypatch.setattr(cc, "emergency_compress_for_window", _boom)
        agent = AgentInfo(
            id="a1", label="t", goal="g", channel_id="c1", requester_id="u1", requester_name="u"
        )
        agent.messages = [{"role": "user", "content": "y" * 20_000} for _ in range(60)]
        original = agent.messages
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        assert _predictive_presend_descent(agent, snapshot, snapshot.ladder) == 0
        assert agent.messages is original

    def test_density_for_an_unnameable_model_is_uncalibrated(self, tmp_path):
        obs = _observer(tmp_path)
        assert obs.density_for(_scope(), "") is None
        assert obs.density_for(_scope(), None) is None

    def test_non_integer_image_count_records_no_observation(self, tmp_path):
        obs = _observer(tmp_path)
        obs.record_density(
            scope=_scope(),
            model="gpt-5.6-sol",
            chars_sent=FIELD_CHARS,
            images_sent=True,  # bool is not a count
            server_input_tokens=FIELD_TOKENS,
        )
        assert obs.density_for(_scope(), "gpt-5.6-sol") is None

    def test_integer_stall_still_converges_by_a_single_step(self, tmp_path):
        """With alpha=1/16 an update within 15 units of the target would floor
        to zero movement; convergence must never deadlock one step short."""
        obs = _observer(tmp_path)
        obs._density_milli[("agent", "w1", "gpt-5.6-sol")] = 2499
        obs.record_density(
            scope=_scope(),
            model="gpt-5.6-sol",
            chars_sent=900_000,
            images_sent=0,
            server_input_tokens=350_000,
        )
        assert obs.density_for(_scope(), "gpt-5.6-sol") == 2500


class TestPostHocQualification:
    """Prior belief alone cannot qualify a clamp.

    Belief rests on a density estimate, and a COLD or stale estimate calls a
    dense payload "within" — then reads its inevitable rejection as capability
    evidence. A cold observer is the normal state after every restart, so this
    band is routine, not exotic. The rescue's own acceptance carries
    authoritative token evidence for this exact workload; re-running the fit
    verdict against it vetoes the false positive.
    """

    async def test_cold_default_density_no_longer_manufactures_a_clamp(self, tmp_path):
        """The real 2026-08-30 sol agent: 1,541,654 chars, believed within at
        the cold 2500 default, rejected anyway. Before post-hoc qualification
        this produced a 24h clamp; the acceptance's own density vetoes it."""
        obs = _observer(tmp_path)
        snapshot = resolve_context_budget("gpt-5.6-sol", utilization=40)
        estimated = estimate_request_tokens(1_541_654, 0, density_milli=2500)
        assert estimated <= snapshot.effective_budget  # believed WITHIN at cold default
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=FIELD_TOKENS),
            rejected_attempt=_rejected_facts(
                chars=1_541_654,
                density=2500,
                budget=snapshot.effective_budget,
                believed=True,
            ),
            accepted_chars=FIELD_CHARS,
            accepted_images=0,
        )
        assert obs.active_clamp("gpt-5.6-sol") is None

    async def test_subfloor_raw_density_vetoes_without_weakening_admission(self, tmp_path):
        """Forensics preserves a true 100-milli sample while admission stays
        banded at 400. Both halves are load-bearing: clipping either the
        sample or the forensic estimator recreates the false clamp."""
        obs = _observer(tmp_path)
        facts = _rejected_facts(chars=100_000, density=2500, believed=True)
        # 100K accepted chars over one million attributed text tokens => 100.
        accepted_tokens = 1_042_000
        assert estimate_request_tokens(100_000, 0, density_milli=100) == 292_000
        assert estimate_request_tokens_forensic(100_000, 0, density_milli=100) == 1_042_000
        await obs.record_rescue(
            overflow=_overflow(tokens=None),
            response=_acceptance(tokens=accepted_tokens),
            rejected_attempt=facts,
            accepted_chars=100_000,
            accepted_images=0,
        )
        assert obs.active_clamp("gpt-5.6-sol") is None
        # EMA/admission stores only the bounded value despite raw forensics.
        obs.record_density(
            scope=_scope(),
            model="gpt-5.6-sol",
            chars_sent=100_000,
            images_sent=0,
            server_input_tokens=accepted_tokens,
        )
        assert obs.density_for(_scope(), "gpt-5.6-sol") == MIN_DENSITY_MILLI

    async def test_rejection_usage_echo_is_authoritative(self, tmp_path):
        """The rejected request's own server usage dominates retry estimates."""
        # A sparse retry would otherwise agree and clamp. Direct rejection
        # usage over the frozen budget vetoes it.
        veto = _observer(tmp_path / "veto")
        await veto.record_rescue(
            overflow=_overflow(tokens=1_042_000),
            response=_acceptance(tokens=100_000),
            rejected_attempt=_rejected_facts(chars=100_000, believed=True),
            accepted_chars=900_000,
            accepted_images=0,
        )
        assert veto.active_clamp("gpt-5.6-sol") is None

        # Direct proof that the rejected request fit still permits a genuine
        # shrink clamp; the accepted retry may have an unusable sample.
        fit = _observer(tmp_path / "fit")
        await fit.record_rescue(
            overflow=_overflow(tokens=200_000),
            response=_acceptance(tokens=250_000),
            rejected_attempt=_rejected_facts(chars=100_000, believed=True),
            accepted_chars=None,
            accepted_images=None,
        )
        assert fit.active_clamp("gpt-5.6-sol") == 250_000

    async def test_stale_calibration_is_also_vetoed(self, tmp_path):
        """Same payload at the stale 2289 calibration — still believed within,
        still vetoed by the acceptance evidence."""
        obs = _observer(tmp_path)
        snapshot = resolve_context_budget("gpt-5.6-sol", utilization=40)
        assert (
            estimate_request_tokens(1_541_654, 0, density_milli=2289) <= snapshot.effective_budget
        )
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=FIELD_TOKENS),
            rejected_attempt=_rejected_facts(
                chars=1_541_654,
                density=2289,
                budget=snapshot.effective_budget,
                believed=True,
            ),
            accepted_chars=FIELD_CHARS,
            accepted_images=0,
        )
        assert obs.active_clamp("gpt-5.6-sol") is None

    async def test_genuine_shrink_still_clamps(self, tmp_path):
        """A modest payload whose post-hoc re-check STILL says it should have
        fit is real capability evidence and must clamp."""
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=300_000),
            rejected_attempt=_rejected_facts(chars=100_000, density=2500, believed=True),
            accepted_chars=100_000,
            accepted_images=0,
        )
        assert obs.active_clamp("gpt-5.6-sol") == 300_000

    async def test_unusable_acceptance_sample_withholds_the_clamp(self, tmp_path):
        """Consistency unknown is not consistency proven."""
        obs = _observer(tmp_path)
        for accepted in (
            {"accepted_chars": 100, "accepted_images": 0},  # below the text gate
            {"accepted_chars": None, "accepted_images": None},  # not measured
            {"accepted_chars": 100_000, "accepted_images": 400},
        ):  # image-dominated
            await obs.record_rescue(
                overflow=_overflow(),
                response=_acceptance(tokens=300_000),
                rejected_attempt=_rejected_facts(believed=True),
                **accepted,
            )
            assert obs.active_clamp("gpt-5.6-sol") is None

    async def test_sparse_acceptance_never_rehabilitates_a_doomed_payload(self, tmp_path):
        """``min()`` is load-bearing: post-hoc evidence is a VETO, never
        permission to make the rejected payload look safer than when sent."""
        obs = _observer(tmp_path)
        snapshot = resolve_context_budget("gpt-5.6-sol", utilization=40)
        # A sparse retry implies a HIGH density (2500, clamped at the ceiling).
        # It must not lift the assumed 609 used for the rejected attempt.
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=100_000),
            rejected_attempt=_rejected_facts(
                chars=1_000_000,
                density=FIELD_DENSITY_MILLI,
                budget=snapshot.effective_budget,
                believed=True,
            ),
            accepted_chars=900_000,
            accepted_images=0,
        )
        assert obs.active_clamp("gpt-5.6-sol") is None

    async def test_ambiguous_shrink_plus_new_density_withholds_then_clamps_later(self, tmp_path):
        """When a real shrink coincides with newly discovered density the first
        rescue is ambiguous and withholds. Calibration protects the next
        request, and a later rejection still believed within under the
        CORRECTED density is unambiguous and clamps."""
        obs = _observer(tmp_path)
        snapshot = resolve_context_budget("gpt-5.6-sol", utilization=40)
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=FIELD_TOKENS),
            rejected_attempt=_rejected_facts(
                chars=1_541_654, density=2500, budget=snapshot.effective_budget, believed=True
            ),
            accepted_chars=FIELD_CHARS,
            accepted_images=0,
        )
        assert obs.active_clamp("gpt-5.6-sol") is None
        # Later: a small payload, believed within under corrected density, and
        # its acceptance agrees it should have fit.
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=250_000),
            rejected_attempt=_rejected_facts(
                chars=100_000,
                density=FIELD_DENSITY_MILLI,
                budget=snapshot.effective_budget,
                believed=True,
            ),
            accepted_chars=100_000,
            accepted_images=0,
        )
        assert obs.active_clamp("gpt-5.6-sol") == 250_000

    async def test_prior_disbelief_still_short_circuits(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=300_000),
            rejected_attempt=_rejected_facts(believed=False),
            accepted_chars=100_000,
            accepted_images=0,
        )
        assert obs.active_clamp("gpt-5.6-sol") is None

    def test_attribution_helper_is_shared_by_calibration_and_qualification(self):
        """One attribution authority: the same helper the EMA consumes is the
        one forensic qualification consults."""
        from src.llm.window_observer import derive_sample_density

        assert (
            derive_sample_density(
                chars_sent=FIELD_CHARS, images_sent=0, server_input_tokens=FIELD_TOKENS
            )
            == FIELD_DENSITY_MILLI
        )
        assert (
            derive_sample_density(chars_sent=100, images_sent=0, server_input_tokens=FIELD_TOKENS)
            is None
        )
        # Hostile-but-integral echoes that floor to zero are unusable, not a
        # density value that can raise inside forensic qualification.
        assert (
            derive_sample_density(
                chars_sent=32_000,
                images_sent=0,
                server_input_tokens=100_000_000,
            )
            is None
        )
        assert (
            derive_sample_density(
                chars_sent=32_000,
                images_sent=-1,
                server_input_tokens=100_000,
            )
            is None
        )

    async def test_authoritative_rejection_cannot_bypass_contradictory_belief(self, tmp_path):
        """Direct server usage is authoritative only after the frozen prior
        verdict proves internally consistent."""
        from src.llm.context_budget import RejectedAttemptFacts

        obs = _observer(tmp_path)
        facts = RejectedAttemptFacts(
            chars=1_000_000,
            images=0,
            density_milli=2500,
            estimated_tokens=442_000,
            effective_budget=300_000,
            believed_within=True,  # impossible: 442K > 300K
        )
        await obs.record_rescue(
            overflow=_overflow(tokens=200_000),
            response=_acceptance(tokens=250_000),
            rejected_attempt=facts,
            accepted_chars=100_000,
            accepted_images=0,
        )
        assert obs.active_clamp("gpt-5.6-sol") is None

    @pytest.mark.parametrize(
        "bad",
        (
            SimpleNamespace(
                believed_within=True,
                density_milli=2500,
                chars=100_000,
                images=0,
                estimated_tokens=82_000,
                effective_budget=921_601,
            ),
            __import__(
                "src.llm.context_budget", fromlist=["RejectedAttemptFacts"]
            ).RejectedAttemptFacts(
                chars=100_000,
                images=0,
                density_milli=100,  # impossible production/admission density
                estimated_tokens=292_000,
                effective_budget=921_601,
                believed_within=True,
            ),
            __import__(
                "src.llm.context_budget", fromlist=["RejectedAttemptFacts"]
            ).RejectedAttemptFacts(
                chars=-1,
                images=0,
                density_milli=2500,
                estimated_tokens=42_000,
                effective_budget=921_601,
                believed_within=True,
            ),
            __import__(
                "src.llm.context_budget", fromlist=["RejectedAttemptFacts"]
            ).RejectedAttemptFacts(
                chars=100_000,
                images=-1,
                density_milli=2500,
                estimated_tokens=82_000,
                effective_budget=921_601,
                believed_within=True,
            ),
            __import__(
                "src.llm.context_budget", fromlist=["RejectedAttemptFacts"]
            ).RejectedAttemptFacts(
                chars=100_000,
                images=0,
                density_milli=2500,
                estimated_tokens=82_001,  # contradicts recomputation
                effective_budget=921_601,
                believed_within=True,
            ),
            __import__(
                "src.llm.context_budget", fromlist=["RejectedAttemptFacts"]
            ).RejectedAttemptFacts(
                chars=100_000,
                images=0,
                density_milli=2500,
                estimated_tokens=82_000,
                effective_budget=50_000,
                believed_within=True,  # contradicts estimate > budget
            ),
        ),
    )
    async def test_malformed_or_contradictory_facts_cannot_clamp(self, tmp_path, bad):
        """Only exact, internally consistent frozen facts can assert capacity."""
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(tokens=None),
            response=_acceptance(tokens=300_000),
            rejected_attempt=bad,
            accepted_chars=100_000,
            accepted_images=0,
        )
        assert obs.active_clamp("gpt-5.6-sol") is None

    def test_chat_attempt_facts_are_total_and_gated(self):
        """Fact capture mirrors the belief helper's guards: non-Codex serving,
        a persisted reconstruction, a non-positive window, and junk messages
        all yield no facts rather than a confident wrong verdict."""
        from src.discord.tool_loop import ToolLoopRunner

        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        snapshot = resolve_context_budget("gpt-5.6-sol")
        codex = SimpleNamespace(is_codex=True, model="gpt-5.6-sol")
        assert runner._attempt_facts([], snapshot, SimpleNamespace(is_codex=False)) is None
        assert (
            runner._attempt_facts(
                [], SimpleNamespace(base_source="persisted", effective_budget=9), codex
            )
            is None
        )
        assert (
            runner._attempt_facts(
                [], SimpleNamespace(base_source="floor", effective_budget=0), codex
            )
            is None
        )
        assert runner._attempt_facts(None, snapshot, codex) is None
        facts = runner._attempt_facts([{"role": "user", "content": "x" * 100}], snapshot, codex)
        assert facts is not None and facts.believed_within is True

    def test_agent_attempt_facts_are_total_and_gated(self):
        from src.agents.manager import _attempt_facts

        snapshot = resolve_context_budget("gpt-5.6-sol")
        assert _attempt_facts([], snapshot, is_codex=False) is None
        assert _attempt_facts([], SimpleNamespace(base_source="persisted"), is_codex=True) is None
        assert (
            _attempt_facts(
                [], SimpleNamespace(base_source="floor", effective_budget=0), is_codex=True
            )
            is None
        )
        assert _attempt_facts(None, snapshot, is_codex=True) is None
        facts = _attempt_facts([{"role": "user", "content": "x" * 100}], snapshot, is_codex=True)
        assert facts is not None and facts.believed_within is True


class TestWorkloadIsolation:
    """The defect Aaron named: one job's dense content must not change how
    every other job compacts. Account keys never bounded that — the auth pool
    is sticky and clamp lookup takes a minimum across accounts — so isolation
    has to come from the workload identity itself.
    """

    def _dense(self, obs, scope):
        obs.record_density(
            scope=scope,
            model="gpt-5.6-sol",
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )

    def test_a_dense_agent_does_not_move_anyone_else(self, tmp_path):
        obs = _observer(tmp_path)
        dense_agent = _scope("agent", "A")
        self._dense(obs, dense_agent)
        assert obs.density_for(dense_agent, "gpt-5.6-sol") == FIELD_DENSITY_MILLI
        # Every other workload still resolves to the fixed prior.
        for other in (_scope("chat", "B"), _scope("agent", "C"), _scope("loop", "L")):
            assert obs.density_for(other, "gpt-5.6-sol") is None

    def test_parent_and_child_agents_do_not_share_density(self, tmp_path):
        obs = _observer(tmp_path)
        self._dense(obs, _scope("agent", "child"))
        assert obs.density_for(_scope("agent", "parent"), "gpt-5.6-sol") is None

    def test_a_new_chat_turn_does_not_inherit_the_previous_one(self, tmp_path):
        obs = _observer(tmp_path)
        self._dense(obs, _scope("chat", "turn-1"))
        assert obs.density_for(_scope("chat", "turn-2"), "gpt-5.6-sol") is None

    def test_one_loop_retains_calibration_across_its_iterations(self, tmp_path):
        obs = _observer(tmp_path)
        loop = _scope("loop", "L1")
        self._dense(obs, loop)
        assert obs.density_for(loop, "gpt-5.6-sol") == FIELD_DENSITY_MILLI
        # A loop-spawned agent is its own workload and inherits nothing.
        assert obs.density_for(_scope("agent", "L1"), "gpt-5.6-sol") is None

    def test_model_switch_stays_isolated_within_one_workload(self, tmp_path):
        obs = _observer(tmp_path)
        w = _scope("agent", "A")
        self._dense(obs, w)
        assert obs.density_for(w, "gpt-5.6-terra") is None
        # Returning to the first model recovers that workload/model entry.
        assert obs.density_for(w, "gpt-5.6-sol") == FIELD_DENSITY_MILLI

    def test_surface_kind_separates_identical_ids(self, tmp_path):
        obs = _observer(tmp_path)
        self._dense(obs, _scope("chat", "X"))
        assert obs.density_for(_scope("agent", "X"), "gpt-5.6-sol") is None

    def test_terminal_cleanup_returns_only_that_workload_to_prior(self, tmp_path):
        obs = _observer(tmp_path)
        a, b = _scope("agent", "A"), _scope("agent", "B")
        self._dense(obs, a)
        self._dense(obs, b)
        assert obs.release_workload(a) == 1
        assert obs.density_for(a, "gpt-5.6-sol") is None
        assert obs.density_for(b, "gpt-5.6-sol") == FIELD_DENSITY_MILLI

    def test_eviction_is_bounded_and_only_returns_workloads_to_prior(self, tmp_path):
        from src.llm.window_observer import _MAX_WORKLOAD_SCOPES

        obs = _observer(tmp_path)
        for i in range(_MAX_WORKLOAD_SCOPES + 25):
            self._dense(obs, _scope("agent", f"w{i}"))
        assert len(obs._density_milli) <= _MAX_WORKLOAD_SCOPES
        # The newest workload survives; eviction only costs the oldest their
        # calibration, which simply returns them to the fixed prior.
        newest = _scope("agent", f"w{_MAX_WORKLOAD_SCOPES + 24}")
        assert obs.density_for(newest, "gpt-5.6-sol") == FIELD_DENSITY_MILLI

    def test_a_malformed_scope_never_creates_a_shared_entry(self, tmp_path):
        obs = _observer(tmp_path)
        for bad in (None, SimpleNamespace(), _scope("", "w"), _scope("agent", "   ")):
            obs.record_density(
                scope=bad,
                model="gpt-5.6-sol",
                chars_sent=FIELD_CHARS,
                images_sent=0,
                server_input_tokens=FIELD_TOKENS,
            )
        assert obs.workload_calibration_summary() == {}

    def test_agent_manager_releases_calibration_on_cleanup(self, tmp_path):
        from src.agents.manager import AgentManager

        obs = _observer(tmp_path)
        self._dense(obs, _scope("agent", "gone"))
        mgr = AgentManager()
        mgr.set_calibration_observer(obs)
        mgr._release_calibration("gone")
        assert obs.density_for(_scope("agent", "gone"), "gpt-5.6-sol") is None

    def test_release_is_total_when_the_observer_is_broken(self, tmp_path):
        from src.agents.manager import AgentManager

        class _Broken:
            def release_workload(self, _scope):
                raise RuntimeError("observer down")

        mgr = AgentManager()
        mgr.set_calibration_observer(_Broken())
        mgr._release_calibration("x")  # must not raise on a finished agent

    def test_scope_key_is_total_on_hostile_scopes(self, tmp_path):
        """A scope-shaped object that raises must not escape into a request."""
        obs = _observer(tmp_path)

        class _Hostile:
            surface_kind = "agent"

            @property
            def workload_id(self):
                raise RuntimeError("boom")

            def is_valid(self):
                return True

        assert obs.density_for(_Hostile(), "gpt-5.6-sol") is None
        assert obs.release_workload(_Hostile()) == 0

    def test_release_of_an_unknown_workload_is_a_no_op(self, tmp_path):
        obs = _observer(tmp_path)
        assert obs.release_workload(_scope("agent", "never-seen")) == 0

    def test_eviction_survives_broken_bookkeeping(self, tmp_path):
        from src.llm.window_observer import _MAX_WORKLOAD_SCOPES

        obs = _observer(tmp_path)
        # Force the eviction path to actually run, then break its bookkeeping.
        obs._density_milli = {("agent", f"w{i}", "m"): 900 for i in range(_MAX_WORKLOAD_SCOPES + 5)}
        obs._scope_touched = None  # type: ignore[assignment]
        obs._evict_if_needed()  # must not raise

    def test_scope_key_survives_a_hostile_model(self, tmp_path):
        """Canonicalisation runs on caller-supplied input; a model object that
        explodes must yield the prior, not an exception into the request."""
        obs = _observer(tmp_path)

        class _Hostile:
            def __str__(self):
                raise RuntimeError("boom")

        assert obs.density_for(_scope(), _Hostile()) is None

    def test_release_survives_a_broken_store(self, tmp_path):
        obs = _observer(tmp_path)
        obs._density_milli = None  # type: ignore[assignment]
        assert obs.release_workload(_scope()) == 0

    def test_chat_density_lookup_survives_a_broken_observer(self):
        """Calibration lookup is never worth failing a turn over."""
        from src.discord.tool_loop import ToolLoopRunner

        class _Broken:
            def density_for(self, _scope, _model):
                raise RuntimeError("observer down")

        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        runner._window_observer = _Broken()
        assert runner._observed_density(_scope("chat", "t1"), "gpt-5.6-sol") is None

    def test_agent_density_lookup_survives_a_broken_observer(self):
        from src.discord.native_tools.agents_tasks import _agent_scope, _observer_density

        class _Broken:
            def density_for(self, _scope, _model):
                raise RuntimeError("observer down")

        assert _observer_density(_Broken(), _agent_scope("a1"), "gpt-5.6-sol") is None
        # No scope, no observer, no model: each independently yields the prior.
        assert _observer_density(_Broken(), None, "gpt-5.6-sol") is None
        assert _observer_density(None, _agent_scope("a1"), "gpt-5.6-sol") is None
        assert _observer_density(_Broken(), _agent_scope("a1"), None) is None

    def test_agent_scope_requires_an_id(self):
        from src.discord.native_tools.agents_tasks import _agent_scope

        assert _agent_scope(None) is None
        assert _agent_scope("") is None
        assert _agent_scope("a1").workload_id == "a1"
