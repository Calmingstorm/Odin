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
    resolve_context_budget,
)
from src.llm.context_compressor import estimate_message_images
from src.llm.window_observer import WindowObserver

ACCT_A = "a" * 32
ACCT_B = "b" * 32
UTILIZATIONS = (40, 60, 100)

# The measured field pair: this acceptance echoed 684,031 server input tokens
# for a 391,046-character payload — about 0.61 chars/token, a 4.1x overshoot
# against the historical 2.5 constant, in the dangerous direction.
FIELD_CHARS = 391_046
FIELD_TOKENS = 684_031
FIELD_DENSITY_MILLI = 609


def _observer(tmp_path) -> WindowObserver:
    return WindowObserver(tmp_path / "context_windows.json")


def _overflow(*, tokens=930_001, key=ACCT_A, model="gpt-5.6-sol", code="context_length_exceeded"):
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
            model="gpt-5.6-sol",
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )
        assert obs.density_for("gpt-5.6-sol") == FIELD_DENSITY_MILLI

    def test_repeated_downward_updates_cross_below_1000_and_converge(self, tmp_path):
        """Odin's load-bearing pin: from a sparse prior, dense evidence must
        cross below 1000 and converge on the measured value."""
        obs = _observer(tmp_path)
        obs.record_density(
            model="gpt-5.6-sol", chars_sent=900_000, images_sent=0, server_input_tokens=350_000
        )
        assert obs.density_for("gpt-5.6-sol") == MAX_DENSITY_MILLI
        seen = []
        for _ in range(14):
            obs.record_density(
                model="gpt-5.6-sol",
                chars_sent=FIELD_CHARS,
                images_sent=0,
                server_input_tokens=FIELD_TOKENS,
            )
            seen.append(obs.density_for("gpt-5.6-sol"))
        assert any(v < 1000 for v in seen)
        assert seen[-1] == FIELD_DENSITY_MILLI
        assert seen == sorted(seen, reverse=True)  # monotonic descent

    def test_downward_reacts_faster_than_upward(self, tmp_path):
        """Asymmetry is the point: dense evidence must bite on the next turn,
        while one sparse turn must not erase the lesson."""
        down = _observer(tmp_path / "d")
        up = _observer(tmp_path / "u")
        for obs in (down, up):
            obs._density_milli["gpt-5.6-sol"] = 1500
        down.record_density(
            model="gpt-5.6-sol",
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )
        up.record_density(
            model="gpt-5.6-sol", chars_sent=900_000, images_sent=0, server_input_tokens=350_000
        )
        assert 1500 - down.density_for("gpt-5.6-sol") > up.density_for("gpt-5.6-sol") - 1500

    def test_calibration_is_per_canonical_model_and_alias_aware(self, tmp_path):
        obs = _observer(tmp_path)
        obs.record_density(
            model="codex-auto-review",
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )
        assert obs.density_for("gpt-5.6-luna") == FIELD_DENSITY_MILLI
        assert obs.density_for("gpt-5.6-sol") is None  # not shared across models

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
        ],
    )
    def test_unusable_samples_record_no_observation(self, tmp_path, kwargs):
        obs = _observer(tmp_path)
        obs.record_density(model="gpt-5.6-sol", **kwargs)
        assert obs.density_for("gpt-5.6-sol") is None

    def test_non_codex_model_names_do_not_calibrate(self, tmp_path):
        obs = _observer(tmp_path)
        obs.record_density(
            model=None, chars_sent=FIELD_CHARS, images_sent=0, server_input_tokens=FIELD_TOKENS
        )
        assert obs.density_snapshot() == {}

    def test_density_never_enters_the_durable_store(self, tmp_path):
        obs = _observer(tmp_path)
        obs.record_density(
            model="gpt-5.6-sol",
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )
        assert "density" not in repr(obs.view())
        # A fresh observer over the same path relearns from scratch.
        assert _observer(tmp_path).density_for("gpt-5.6-sol") is None


class TestClampQualification:
    """The headline defect. A clamp asserts the served window SHRANK; only an
    attempt we believed would fit can support that claim."""

    async def test_density_overshoot_rescues_without_clamping(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=288_499),
            rejected_attempt_believed_within_effective_budget=False,
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
            rejected_attempt_believed_within_effective_budget=True,
        )
        assert obs.active_clamp("gpt-5.6-sol") == 288_499

    async def test_unknown_belief_cannot_clamp(self, tmp_path):
        """Resumed generations report None; unknown must behave like False for
        clamp purposes, never like True."""
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(),
            rejected_attempt_believed_within_effective_budget=None,
        )
        assert obs.active_clamp("gpt-5.6-sol") is None

    async def test_belief_is_required_so_no_adapter_can_silently_clamp(self, tmp_path):
        obs = _observer(tmp_path)
        with pytest.raises(TypeError):
            await obs.record_rescue(overflow=_overflow(), response=_acceptance())

    async def test_disqualified_rescue_does_not_tighten_a_live_clamp(self, tmp_path):
        obs = _observer(tmp_path)
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=500_000),
            rejected_attempt_believed_within_effective_budget=True,
        )
        await obs.record_rescue(
            overflow=_overflow(),
            response=_acceptance(tokens=200_000),
            rejected_attempt_believed_within_effective_budget=False,
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
            rejected_attempt_believed_within_effective_budget=believed_within,
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
        assert obs.density_for("gpt-5.6-sol") is None

    def test_density_snapshot_survives_broken_internal_state(self, tmp_path):
        obs = _observer(tmp_path)
        obs._density_milli = None  # type: ignore[assignment]
        assert obs.density_snapshot() == {}

    def test_record_density_survives_broken_internal_state(self, tmp_path):
        obs = _observer(tmp_path)
        obs._density_milli = None  # type: ignore[assignment]
        # Must not raise: a calibration miss is never worth an exception on a
        # request the server already accepted.
        obs.record_density(
            model="gpt-5.6-sol",
            chars_sent=FIELD_CHARS,
            images_sent=0,
            server_input_tokens=FIELD_TOKENS,
        )

    def test_agent_density_recorder_ignores_non_dict_responses(self, tmp_path):
        from src.discord.native_tools.agents_tasks import _make_density_recorder

        obs = _observer(tmp_path)
        recorder = _make_density_recorder(obs)
        recorder(SimpleNamespace(text="not a dict"), FIELD_CHARS, 0)
        assert obs.density_snapshot() == {}

    def test_agent_density_recorder_swallows_observer_failure(self):
        from src.discord.native_tools.agents_tasks import _make_density_recorder

        class _Broken:
            def record_density(self, **kwargs):
                raise RuntimeError("observer down")

        recorder = _make_density_recorder(_Broken())
        recorder(
            {"model": "gpt-5.6-sol", "server_input_tokens": FIELD_TOKENS}, FIELD_CHARS, 0
        )  # must not raise

    def test_agent_density_recorder_for_absent_observer_is_none(self):
        from src.discord.native_tools.agents_tasks import _make_density_recorder

        assert _make_density_recorder(None) is None

    def test_agent_density_recorder_feeds_the_observer(self, tmp_path):
        from src.discord.native_tools.agents_tasks import _make_density_recorder

        obs = _observer(tmp_path)
        _make_density_recorder(obs)(
            {"model": "gpt-5.6-sol", "server_input_tokens": FIELD_TOKENS}, FIELD_CHARS, 0
        )
        assert obs.density_for("gpt-5.6-sol") == FIELD_DENSITY_MILLI

    def test_chat_surface_density_hook_is_codex_gated_and_total(self, tmp_path):
        from src.discord.tool_loop import ToolLoopRunner

        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        obs = _observer(tmp_path)
        runner._window_observer = obs
        response = SimpleNamespace(provenance_model="gpt-5.6-sol", server_input_tokens=FIELD_TOKENS)
        non_codex = SimpleNamespace(is_codex=False, model="qwen3:14b")
        runner._record_density(response, FIELD_CHARS, 0, non_codex)
        assert obs.density_snapshot() == {}

        codex = SimpleNamespace(is_codex=True, model="gpt-5.6-sol")
        runner._record_density(response, FIELD_CHARS, 0, codex)
        assert obs.density_for("gpt-5.6-sol") == FIELD_DENSITY_MILLI

        class _Broken:
            def record_density(self, **kwargs):
                raise RuntimeError("observer down")

        runner._window_observer = _Broken()
        runner._record_density(response, FIELD_CHARS, 0, codex)  # must not raise

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
        assert obs.density_for("") is None
        assert obs.density_for(None) is None

    def test_non_integer_image_count_records_no_observation(self, tmp_path):
        obs = _observer(tmp_path)
        obs.record_density(
            model="gpt-5.6-sol",
            chars_sent=FIELD_CHARS,
            images_sent=True,  # bool is not a count
            server_input_tokens=FIELD_TOKENS,
        )
        assert obs.density_for("gpt-5.6-sol") is None

    def test_integer_stall_still_converges_by_a_single_step(self, tmp_path):
        """With alpha=1/16 an update within 15 units of the target would floor
        to zero movement; convergence must never deadlock one step short."""
        obs = _observer(tmp_path)
        obs._density_milli["gpt-5.6-sol"] = 2499
        obs.record_density(
            model="gpt-5.6-sol", chars_sent=900_000, images_sent=0, server_input_tokens=350_000
        )
        assert obs.density_for("gpt-5.6-sol") == 2500
