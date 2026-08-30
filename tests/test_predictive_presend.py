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

    def test_image_overage_continues_past_a_character_noop_rung(self):
        """Images can keep a request over the token window while its character
        count is already below rung one. That rung is consumed but must not
        terminate descent before a lower rung can shrink replay."""
        from src.llm.context_compressor import estimate_message_chars

        runner = _runner()
        snapshot = resolve_context_budget("gpt-5.6-sol", utilization=60)
        history = _dense_history(50, 10_000)
        protected_images = [
            {
                "type": "image",
                "source": {"type": "base64", "media_type": "image/png", "data": "a"},
            }
            for _ in range(300)
        ]
        st = _state(
            history
            + [
                {"role": "developer", "content": "preamble"},
                {"role": "user", "content": protected_images},
            ]
        )
        before = estimate_message_chars(st.messages)
        assert before < snapshot.ladder[0]
        assert runner._believed_within_effective_budget(st.messages, snapshot, _serving()) is False

        consumed = runner._predictive_presend_descent(st, snapshot, _serving())

        assert consumed == 2
        reports = st._trajectory.context_recoveries
        assert reports[0]["compressed_chars"] == reports[0]["original_chars"]
        assert reports[1]["compressed_chars"] < reports[1]["original_chars"]
        assert estimate_message_chars(st.messages) < before

    def test_enlarging_compactor_result_is_never_adopted(self, monkeypatch):
        """Continuing past equality must not weaken the separate monotonic
        adoption guard for an actually enlarging result."""
        import src.llm.context_compressor as cc

        runner = _runner()
        snapshot = SimpleNamespace(
            ladder=(100, 50),
            base_source="floor",
            effective_budget=1,
            density_milli=2500,
        )
        original = _dense_history(4, 100)
        st = _state(original)
        runner._believed_within_effective_budget = lambda *_a, **_k: False

        def enlarge(messages, *, target_chars, boundary=None):
            return messages + [{"role": "user", "content": "larger"}], {
                "original_chars": 100,
                "compressed_chars": 101,
                "target_chars": target_chars,
            }

        monkeypatch.setattr(cc, "emergency_compress_for_window", enlarge)
        consumed = runner._predictive_presend_descent(st, snapshot, _serving())
        assert consumed == 1
        assert st.messages is original

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


class TestPhysicalSharedLadder:
    async def test_chat_only_rung_spent_predictively_is_not_rearmed_on_rejection(self):
        """Drive the physical chat attempt loop. Prediction has already spent
        its only rung, so a provider rejection must fail after exactly one
        wire attempt rather than reusing that rung post-rejection."""
        from tests.test_chat_loop_recovery import (
            _ENVELOPE,
            _chat_state,
            _Gateway,
            _history,
            _overflow,
            _runner,
        )

        async def always_overflow(_n, _messages):
            raise _overflow()

        gateway = _Gateway(always_overflow)
        runner = _runner(gateway)
        runner._predictive_presend_descent = lambda *_a, **_k: 1
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        assert len(snapshot.ladder) == 1
        state = _chat_state(_history(60, 20_000) + _ENVELOPE)

        kind, _ = await runner._call_llm(state, budget_snapshot=snapshot)

        assert kind == "done"
        assert len(gateway.calls) == 1
        assert not any(
            row.get("trigger") == "overflow" for row in state._trajectory.context_recoveries
        )

    async def test_loop_only_rung_spent_predictively_is_not_rearmed_on_rejection(self):
        """The autonomous loop's physical attempt loop obeys the same single
        total ladder contract as chat."""
        from src.llm.context_compressor import SurfaceBoundary
        from tests.test_chat_loop_recovery import _Gateway, _overflow, _runner

        calls = {"count": 0}

        class Client(SimpleNamespace):
            async def chat_with_tools(self, **_kwargs):
                calls["count"] += 1
                raise _overflow()

        client = Client(model="gpt-5.6-sol", reasoning_effort="xhigh")
        gateway = _Gateway(None)
        gateway.client = client
        gateway.codex_client = client
        runner = _runner(gateway)
        runner._predictive_presend_descent = lambda *_a, **_k: 1

        async def finish(*_args, **_kwargs):
            return "failed"

        runner._finish_loop = finish
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        assert len(snapshot.ladder) == 1
        state = SimpleNamespace(
            messages=_dense_history(60, 20_000) + [{"role": "user", "content": "GOAL: finish"}],
            system_prompt="sys",
            tools=[],
            _boundary=SurfaceBoundary(request_start=60, envelope_len=1),
            _char_latch=None,
            context_recoveries=[],
            _iteration_index=0,
            _trajectory=None,
            _loop_details=[],
            _trace=None,
            _loop_id="L",
            channel_id_str="c",
            prompt="finish",
            user_id="u",
        )

        kind, _ = await runner._call_loop_llm(state, budget_snapshot=snapshot)

        assert kind == "done"
        assert calls["count"] == 1
        assert not any(row.get("trigger") == "overflow" for row in state.context_recoveries)


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

    def test_agent_continues_past_a_noop_rung_and_adopts_the_next_shrink(self, monkeypatch):
        """The agent copy of predictive descent must not stop merely because
        one rung is above the current character count."""
        import src.llm.context_compressor as cc
        from src.agents.manager import AgentInfo, _predictive_presend_descent

        agent = AgentInfo(
            id="a1", label="t", goal="g", channel_id="c1", requester_id="u1", requester_name="u"
        )
        original = [{"role": "user", "content": "payload"}]
        smaller = [{"role": "user", "content": "p"}]
        agent.messages = original
        calls = {"count": 0}

        def scripted(messages, *, target_chars):
            calls["count"] += 1
            if calls["count"] == 1:
                return messages, {
                    "original_chars": 7,
                    "compressed_chars": 7,
                    "target_chars": target_chars,
                }
            return smaller, {
                "original_chars": 7,
                "compressed_chars": 1,
                "target_chars": target_chars,
            }

        monkeypatch.setattr(cc, "emergency_compress_for_window", scripted)
        import src.agents.manager as manager

        monkeypatch.setattr(manager, "_believed_within_effective_budget", lambda *_a: False)
        consumed = _predictive_presend_descent(
            agent,
            SimpleNamespace(base_source="floor", effective_budget=1, density_milli=2500),
            (10, 1),
        )
        assert consumed == 2
        assert calls["count"] == 2
        assert agent.messages is smaller

    def test_agent_persisted_snapshot_yields_unknown_belief(self):
        from src.agents.manager import _believed_within_effective_budget

        persisted = SimpleNamespace(base_source="persisted", effective_budget=900_000)
        assert _believed_within_effective_budget([], persisted) is None


class TestLoopSurfaceParity:
    def test_loop_state_descends_through_the_shared_helper(self, monkeypatch):
        """The production loop dataclass carries only ``_boundary``; predictive
        compaction must consume that exact surface declaration rather than a
        chat-shaped getattr fallback that silently protects the wrong region."""
        import src.llm.context_compressor as cc
        from src.llm.context_compressor import SurfaceBoundary

        seen_boundaries = []
        real_compress = cc.emergency_compress_for_window

        def capture_boundary(*args, **kwargs):
            seen_boundaries.append(kwargs.get("boundary"))
            return real_compress(*args, **kwargs)

        monkeypatch.setattr(cc, "emergency_compress_for_window", capture_boundary)
        runner = _runner()
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        from src.discord.tool_loop import _LoopTurn

        st = _LoopTurn(
            prompt="goal",
            channel=object(),
            user_id="u",
            policy=SimpleNamespace(),
            msg_proxy=SimpleNamespace(),
            requester_name="u",
            _loop_id="L",
            _trace=None,
            _trajectory=None,
            _result_store_cap=10,
            messages=_dense_history(60, 20_000),
            system_prompt="sys",
            tools=[],
            tool_timeout=1,
            channel_id_str="c",
            loop_cap=1,
            _boundary=SurfaceBoundary(request_start=58, elided_replay=0, envelope_len=1),
        )
        # Production _LoopTurn intentionally has only _boundary, not chat's
        # _boundary_request_start/_boundary_elided_replay compatibility shape.
        assert not hasattr(st, "_boundary_request_start")
        declared_boundary = st._boundary
        consumed = runner._predictive_presend_descent(st, snapshot, _serving())
        assert consumed >= 1
        assert seen_boundaries and seen_boundaries[0] is declared_boundary
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

    def test_supplied_default_value_still_reports_calibrated_origin(self):
        snap = resolve_context_budget("gpt-5.6-sol", density_milli=2500)
        assert snap.density_milli == 2500
        assert snap.density_source == "calibrated"

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
            return {"text": "done", "tool_calls": [], "provider": "codex"}

        async def recorder(
            err, response, facts=None, acc_chars=None, acc_images=None, workload_scope=None
        ):
            recorded.append((err, facts))

        # Uncalibrated snapshot: ~600K chars estimates well under sol's window,
        # so prediction does NOT fire and the full ladder remains for rescue.
        snapshot = resolve_context_budget("gpt-5.6-sol", utilization=60)
        from src.llm.context_budget import WorkloadScope

        state = {
            "plan": {
                "snapshot": snapshot,
                "is_codex": True,
                "workload_scope": WorkloadScope("agent", "a1"),
            }
        }
        out = await _call_llm_with_recovery(
            agent, cb, "sys", [], generation_state=state, evidence_recorder=recorder
        )
        assert out == {"text": "done", "tool_calls": [], "provider": "codex"}
        assert len(recorded) == 1
        err, facts = recorded[0]
        assert err is overflow
        assert facts is not None and facts.believed_within is True

    async def test_non_codex_plan_never_publishes_attempt_evidence(self):
        """Frozen provider provenance, not a Codex-looking model or overflow,
        decides whether agent rescue evidence may reach the observer."""
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
            return {"text": "done", "tool_calls": [], "provider": "codex"}

        async def recorder(err, response, facts=None, acc_chars=None, acc_images=None):
            recorded.append((err, facts))

        # The frozen plan is non-Codex even though the model slug, rejection,
        # and accepted response all look Codex-shaped. No facts or recorder
        # call may be published from this generation.
        snapshot = resolve_context_budget(
            "gpt-5.6-sol", utilization=60, density_milli=FIELD_DENSITY_MILLI
        )
        state = {"plan": {"snapshot": snapshot, "is_codex": False}}
        out = await _call_llm_with_recovery(
            agent, cb, "sys", [], generation_state=state, evidence_recorder=recorder
        )
        assert out == {"text": "done", "tool_calls": [], "provider": "codex"}
        assert recorded == []

    async def test_codex_plan_rejects_non_codex_accepted_response_evidence(self):
        """Both frozen plan and accepted response provenance must be Codex."""
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
            account_key="a" * 32,
        )
        calls = {"n": 0}
        recorded = []

        async def cb(messages, system_prompt, tools, generation_state=None):
            calls["n"] += 1
            if calls["n"] == 1:
                raise overflow
            return {
                "text": "done",
                "tool_calls": [],
                "provider": "ollama",
                "model": "gpt-5.6-sol",
            }

        async def recorder(*args):
            recorded.append(args)

        snapshot = resolve_context_budget("gpt-5.6-sol", utilization=60)
        out = await _call_llm_with_recovery(
            agent,
            cb,
            "sys",
            [],
            generation_state={"plan": {"snapshot": snapshot, "is_codex": True}},
            evidence_recorder=recorder,
        )
        assert out["provider"] == "ollama"
        assert recorded == []

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
