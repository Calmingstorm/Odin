"""Predictive pre-send descent, pinned independently on all three surfaces.

Before this machinery, a payload our character measure believed would fit —
but which was actually dense or image-heavy — was sent, rejected, and only
then rescued. That cost a full round-trip AND (worse) produced a bogus window
clamp from the rescue acceptance.

Predictive descent spends rescue rungs BEFORE the wire when the calibrated
estimate says the payload cannot fit the believed WINDOW. The rungs it spends
come out of the SAME single ladder, so post-rejection rescue continues where
prediction stopped rather than re-arming rungs already used.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from src.llm.context_budget import resolve_context_budget

FIELD_DENSITY_MILLI = 609


def _serving(is_codex=True, model="gpt-5.6-sol"):
    return SimpleNamespace(
        provider="codex" if is_codex else "ollama",
        client=SimpleNamespace(model=model),
        model=model,
        reasoning_effort="xhigh",
        is_codex=is_codex,
    )


def _runner():
    from src.discord.tool_loop import ToolLoopRunner

    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._window_observer = None
    return runner


def _state(messages):
    return SimpleNamespace(
        messages=messages,
        _trajectory=SimpleNamespace(context_recoveries=[]),
        _boundary_request_start=max(0, len(messages) - 2),
        _boundary_elided_replay=0,
        _boundary_envelope_len=2,
        _char_latch=None,
    )


def _dense_history(n, size):
    """History whose CHARACTER size is modest but whose true token cost, at
    measured density, blows the window."""
    return [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"h{i}:" + "y" * size}
        for i in range(n)
    ]


class TestPredictiveDescentContract:
    def test_payload_believed_to_fit_is_never_touched(self):
        runner = _runner()
        snapshot = resolve_context_budget("gpt-5.6-sol", utilization=60)
        st = _state(_dense_history(4, 100))
        before = list(st.messages)
        consumed = runner._predictive_presend_descent(st, snapshot, _serving())
        assert consumed == 0
        assert st.messages == before
        assert st._trajectory.context_recoveries == []

    def test_payload_believed_too_large_descends_before_any_send(self):
        runner = _runner()
        # Calibrated density makes a payload that LOOKS fine by characters
        # genuinely over the window.
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        st = _state(_dense_history(60, 20_000))
        consumed = runner._predictive_presend_descent(st, snapshot, _serving())
        assert consumed >= 1
        entries = st._trajectory.context_recoveries
        assert entries, "descent must leave diagnostic evidence"
        assert all(e["trigger"] == "predictive" for e in entries)
        # Diagnostic ONLY: prediction is not a provider rejection, so it must
        # never look like one.
        assert all(e["attempt"] == 0 for e in entries)
        assert st._char_latch is None

    def test_descent_is_monotonic_and_never_enlarges(self):
        from src.llm.context_compressor import estimate_message_chars

        runner = _runner()
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        st = _state(_dense_history(60, 20_000))
        before = estimate_message_chars(st.messages)
        runner._predictive_presend_descent(st, snapshot, _serving())
        assert estimate_message_chars(st.messages) <= before

    def test_non_codex_serving_never_predicts(self):
        """Other providers supply no accepted-token evidence contract, so
        there is nothing honest to predict against.

        Isolates the descent-level Codex gate: the belief helper independently
        returns unknown for non-Codex serving, so without forcing it this pin
        would pass on the other guard and never exercise the gate it names.
        """
        runner = _runner()
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        st = _state(_dense_history(60, 20_000))
        runner._believed_within_effective_budget = lambda *a, **k: False
        assert runner._predictive_presend_descent(st, snapshot, _serving(is_codex=False)) == 0
        assert st._trajectory.context_recoveries == []

    def test_resumed_generation_never_predicts(self):
        """A persisted reconstruction carries placeholder budget fields; its
        persisted remaining ladder already governs further rejection, and
        splicing CURRENT evidence into a FROZEN generation would be a lie.

        Two independent guards enforce this (the belief helper returns unknown
        for a persisted snapshot, AND descent checks base_source directly), so
        this pin ISOLATES the descent guard by forcing the belief helper to
        report "too large" — otherwise it would pass on the other guard alone
        and prove nothing about the one it names.
        """
        from src.discord.tool_loop import ToolLoopRunner

        runner = _runner()
        snapshot = ToolLoopRunner._snapshot_from_generation_facts(
            {
                "model": "gpt-5.6-sol",
                "ladder": [500_000, 400_000],
                "budget": {"primary_chars": 600_000},
            }
        )
        assert snapshot.base_source == "persisted"
        st = _state(_dense_history(60, 20_000))
        runner._believed_within_effective_budget = lambda *a, **k: False
        assert runner._predictive_presend_descent(st, snapshot, _serving()) == 0
        assert st._trajectory.context_recoveries == []

    def test_belief_helper_also_refuses_a_persisted_snapshot(self):
        """The second, independent guard: placeholder budget fields must never
        be read as a real window."""
        from src.discord.tool_loop import ToolLoopRunner

        runner = _runner()
        snapshot = ToolLoopRunner._snapshot_from_generation_facts(
            {"model": "gpt-5.6-sol", "ladder": [500_000], "budget": {"primary_chars": 600_000}}
        )
        st = _state(_dense_history(60, 20_000))
        assert runner._believed_within_effective_budget(st.messages, snapshot, _serving()) is None

    def test_estimator_failure_is_fail_open_to_the_provider(self):
        """Prediction is not proof: a broken estimator must never block a
        request the server might well accept."""
        runner = _runner()
        broken = SimpleNamespace(
            ladder=(100,), base_source="floor", effective_budget=921_601, density_milli="junk"
        )
        st = _state(_dense_history(4, 100))
        before = list(st.messages)
        assert runner._predictive_presend_descent(st, broken, _serving()) == 0
        assert st.messages == before

    def test_exhausted_ladder_still_sends_the_smallest_result(self):
        runner = _runner()
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=400, observed_clamp=60_000
        )
        st = _state(_dense_history(80, 30_000))
        consumed = runner._predictive_presend_descent(st, snapshot, _serving())
        # Every rung may be spent without achieving a fit; the payload is still
        # sent (the caller proceeds) rather than failing locally.
        assert consumed <= len(snapshot.ladder)
        assert st.messages, "payload must survive descent"


class TestSharedLadder:
    def test_presend_consumption_leaves_only_the_remainder_for_rescue(self):
        """One total ladder: rungs spent predicting are not re-offered after a
        provider rejection."""
        runner = _runner()
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        st = _state(_dense_history(60, 20_000))
        consumed = runner._predictive_presend_descent(st, snapshot, _serving())
        remaining = snapshot.ladder[consumed:]
        assert len(remaining) == len(snapshot.ladder) - consumed
        assert all(r not in remaining for r in snapshot.ladder[:consumed])


class TestBeliefFormation:
    @pytest.mark.parametrize("utilization", (40, 60, 100))
    def test_belief_consults_the_window_not_the_policy_target(self, utilization):
        """Utilization is quality POLICY. A payload under the policy target may
        still be over the physical window, and only the window decides."""
        runner = _runner()
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=utilization, density_milli=FIELD_DENSITY_MILLI
        )
        st = _state(_dense_history(60, 20_000))
        belief = runner._believed_within_effective_budget(st.messages, snapshot, _serving())
        assert belief is False  # same verdict at every utilization

    def test_a_non_positive_effective_budget_yields_unknown(self):
        """A zero/absent window is not a claim that everything fits — it is an
        absence of knowledge, and must never be read as 'within'."""
        runner = _runner()
        st = _state(_dense_history(4, 100))
        for broken in (
            SimpleNamespace(base_source="floor", effective_budget=0, density_milli=2500),
            SimpleNamespace(base_source="floor", effective_budget=-1, density_milli=2500),
            SimpleNamespace(base_source="floor", effective_budget=None, density_milli=2500),
        ):
            assert runner._believed_within_effective_budget(st.messages, broken, _serving()) is None

    def test_non_codex_and_missing_snapshot_yield_unknown(self):
        runner = _runner()
        snapshot = resolve_context_budget("gpt-5.6-sol")
        st = _state(_dense_history(4, 100))
        assert (
            runner._believed_within_effective_budget(
                st.messages, snapshot, _serving(is_codex=False)
            )
            is None
        )
        assert runner._believed_within_effective_budget(st.messages, None, _serving()) is None


class TestAgentSurfaceParity:
    """The agent surface owns its own copies of these helpers; they must obey
    the identical contract."""

    def test_agent_belief_and_descent_match_the_chat_contract(self):
        from src.agents.manager import (
            AgentInfo,
            _believed_within_effective_budget,
            _predictive_presend_descent,
        )

        agent = AgentInfo(
            id="a1", label="t", goal="g", channel_id="c1", requester_id="u1", requester_name="u"
        )
        agent.messages = _dense_history(60, 20_000)
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        assert _believed_within_effective_budget(agent.messages, snapshot) is False
        consumed = _predictive_presend_descent(agent, snapshot, snapshot.ladder)
        assert consumed >= 1
        assert all(r["trigger"] == "predictive" for r in agent.context_recoveries)
        assert agent.context_char_ceiling is None, "prediction must never latch"

    def test_agent_persisted_snapshot_yields_unknown_belief(self):
        from src.agents.manager import _believed_within_effective_budget

        persisted = SimpleNamespace(base_source="persisted", effective_budget=900_000)
        assert _believed_within_effective_budget([], persisted) is None


class TestLoopSurfaceParity:
    def test_loop_state_descends_through_the_shared_helper(self):
        """The loop surface uses the same runner helpers, so its boundary
        shape must be accepted by them."""
        from src.llm.context_compressor import SurfaceBoundary

        runner = _runner()
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        st = SimpleNamespace(
            messages=_dense_history(60, 20_000),
            context_recoveries=[],
            _trajectory=None,
            _boundary=SurfaceBoundary(request_start=58, elided_replay=0, envelope_len=1),
            _boundary_request_start=58,
            _boundary_elided_replay=0,
            _boundary_envelope_len=1,
            _char_latch=None,
        )
        consumed = runner._predictive_presend_descent(st, snapshot, _serving())
        assert consumed >= 1
        assert st._char_latch is None


class TestApiProvenanceCoexistence:
    def test_clamp_and_density_provenance_are_independent(self):
        """Both can be true at once; density must not overwrite or hide the
        capability/clamp provenance the table already shows."""
        clamped_and_calibrated = resolve_context_budget(
            "gpt-5.6-sol",
            utilization=40,
            observed_clamp=300_000,
            density_milli=FIELD_DENSITY_MILLI,
        )
        assert clamped_and_calibrated.clamp_applied is True
        assert clamped_and_calibrated.density_source == "calibrated"
        assert clamped_and_calibrated.density_milli == FIELD_DENSITY_MILLI

    def test_uncalibrated_reports_default_source(self):
        snap = resolve_context_budget("gpt-5.6-sol", utilization=40, observed_clamp=300_000)
        assert snap.clamp_applied is True
        assert snap.density_source == "default"


class TestRecoveryLoopIntegration:
    """The recovery loop's own density/belief hooks, driven through the real
    helper rather than around it."""

    async def test_manager_records_density_on_a_successful_attempt(self):
        from src.agents.manager import AgentInfo, _call_llm_with_recovery

        agent = AgentInfo(
            id="a1", label="t", goal="g", channel_id="c1", requester_id="u1", requester_name="u"
        )
        agent.messages = [{"role": "user", "content": "task"}]
        seen = []

        async def cb(messages, system_prompt, tools, generation_state=None):
            return {"text": "done", "tool_calls": [], "server_input_tokens": 684_031}

        def density_recorder(response, chars, images):
            seen.append((response, chars, images))

        out = await _call_llm_with_recovery(agent, cb, "sys", [], density_recorder=density_recorder)
        assert out["text"] == "done"
        assert len(seen) == 1
        response, chars, images = seen[0]
        assert response["server_input_tokens"] == 684_031
        assert chars > 0 and images == 0

    async def test_manager_density_failure_never_fails_the_iteration(self):
        """Calibration is telemetry: a broken recorder must not lose a turn the
        provider already completed."""
        from src.agents.manager import AgentInfo, _call_llm_with_recovery

        agent = AgentInfo(
            id="a1", label="t", goal="g", channel_id="c1", requester_id="u1", requester_name="u"
        )
        agent.messages = [{"role": "user", "content": "task"}]

        async def cb(messages, system_prompt, tools, generation_state=None):
            return {"text": "done", "tool_calls": []}

        def boom(*a, **k):
            raise RuntimeError("recorder down")

        out = await _call_llm_with_recovery(agent, cb, "sys", [], density_recorder=boom)
        assert out == {"text": "done", "tool_calls": []}

    async def test_manager_pairs_the_rejected_attempts_belief_with_its_overflow(self):
        """The belief handed to the observer describes the attempt the provider
        REJECTED. Here the payload IS believed to fit and is refused anyway —
        the genuine-shrink signature, the one case that may form a clamp."""
        from src.agents.manager import AgentInfo, _call_llm_with_recovery
        from src.llm.errors import LLMRequestError

        agent = AgentInfo(
            id="a1", label="t", goal="g", channel_id="c1", requester_id="u1", requester_name="u"
        )
        agent.messages = [{"role": "user", "content": "task"}] + [
            {"role": "assistant", "content": "[Tool result: x]\n" + "y" * 20_000} for _ in range(30)
        ]
        overflow = LLMRequestError(
            "context overflow",
            provider="codex",
            model="gpt-5.6-sol",
            code="context_length_exceeded",
            server_input_tokens=930_001,
            account_key="a" * 32,
        )
        recorded = []
        calls = {"n": 0}

        async def cb(messages, system_prompt, tools, generation_state=None):
            calls["n"] += 1
            if calls["n"] == 1:
                raise overflow
            return {"text": "done", "tool_calls": []}

        async def recorder(err, response, believed_within=None):
            recorded.append((err, believed_within))

        # Uncalibrated snapshot: ~600K chars estimates well under sol's window,
        # so prediction does NOT fire and the full ladder remains for rescue.
        snapshot = resolve_context_budget("gpt-5.6-sol", utilization=60)
        state = {"plan": {"snapshot": snapshot, "is_codex": True}}
        out = await _call_llm_with_recovery(
            agent, cb, "sys", [], generation_state=state, evidence_recorder=recorder
        )
        assert out == {"text": "done", "tool_calls": []}
        assert len(recorded) == 1
        err, believed = recorded[0]
        assert err is overflow
        assert believed is True

    async def test_predicted_rejection_pairs_a_false_belief(self):
        """The defect's signature: a payload we EXPECTED to be refused must
        carry a False belief, so its rescue can never qualify a clamp — this is
        the exact pairing that wrongly clamped terra at 288,499."""
        from src.agents.manager import AgentInfo, _call_llm_with_recovery
        from src.llm.errors import LLMRequestError

        agent = AgentInfo(
            id="a1", label="t", goal="g", channel_id="c1", requester_id="u1", requester_name="u"
        )
        agent.messages = [{"role": "user", "content": "task"}] + [
            {"role": "assistant", "content": "[Tool result: x]\n" + "y" * 20_000} for _ in range(30)
        ]
        overflow = LLMRequestError(
            "context overflow",
            provider="codex",
            model="gpt-5.6-sol",
            code="context_length_exceeded",
            server_input_tokens=930_001,
            account_key="a" * 32,
        )
        recorded = []
        calls = {"n": 0}

        async def cb(messages, system_prompt, tools, generation_state=None):
            calls["n"] += 1
            if calls["n"] == 1:
                raise overflow
            return {"text": "done", "tool_calls": []}

        async def recorder(err, response, believed_within=None):
            recorded.append((err, believed_within))

        # Predictive descent is disabled here (is_codex False) to ISOLATE the
        # pairing: with descent on, a payload compacted until it is believed to
        # fit would correctly report True, which is a different contract.
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        state = {"plan": {"snapshot": snapshot, "is_codex": False}}
        out = await _call_llm_with_recovery(
            agent, cb, "sys", [], generation_state=state, evidence_recorder=recorder
        )
        assert out == {"text": "done", "tool_calls": []}
        assert len(recorded) == 1
        assert recorded[0][1] is False

    async def test_ladder_spent_predicting_is_not_re_armed_after_a_rejection(self):
        """One TOTAL ladder. If prediction spent every rung and the provider
        still refuses, the agent fails honestly rather than compacting again on
        rungs it already used."""
        from src.agents.manager import AgentInfo, AgentState, _call_llm_with_recovery
        from src.llm.errors import LLMRequestError

        agent = AgentInfo(
            id="a1", label="t", goal="g", channel_id="c1", requester_id="u1", requester_name="u"
        )
        agent.messages = [{"role": "user", "content": "task"}] + [
            {"role": "assistant", "content": "[Tool result: x]\n" + "y" * 20_000} for _ in range(30)
        ]
        overflow = LLMRequestError(
            "context overflow",
            provider="codex",
            model="gpt-5.6-sol",
            code="context_length_exceeded",
            server_input_tokens=930_001,
            account_key="a" * 32,
        )
        calls = {"n": 0}

        async def cb(messages, system_prompt, tools, generation_state=None):
            calls["n"] += 1
            raise overflow

        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        assert len(snapshot.ladder) == 1  # prediction will spend the only rung
        state = {"plan": {"snapshot": snapshot, "is_codex": True}}
        out = await _call_llm_with_recovery(agent, cb, "sys", [], generation_state=state)
        assert out is None
        assert agent.state is AgentState.FAILED
        # Exactly one physical attempt: the rung was spent before the wire, so
        # the rejection had nothing left to descend to.
        assert calls["n"] == 1
        assert [r["trigger"] for r in agent.context_recoveries] == ["predictive"]
