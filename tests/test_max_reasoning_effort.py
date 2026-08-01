"""The "max" reasoning effort and its per-model compatibility boundaries.

"max" is served only by the gpt-5.6 family; gpt-5.5 (and the retired 5.4s)
accept it in the API's generic parameter enum but reject it per-model at
request time — the 'minimal' incident class, where a persisted value turns
into a deterministic per-request 400. One shared validator
(``model_rejects_effort`` / ``effort_incompatibility_error``) backs FOUR
enforcement boundaries: config load (pinned here), the admin PUT
(test_web_api_llm_admin), the spawn boundary (test_native_agents_tasks /
test_spawn_loop_agents_config), and final request construction
(test_openai_codex_client). No boundary clamps; every rejection names the
pair and the efforts the model does accept.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.config.schema import (
    CODEX_MODEL_UNSUPPORTED_EFFORTS,
    CODEX_REASONING_EFFORTS,
    Config,
    OpenAICodexConfig,
    allowed_efforts_for_model,
    effort_incompatibility_error,
    model_rejects_effort,
)
from src.tools.defs.agents import SPAWN_EFFORT_OPTIONS


class TestSharedValidator:
    def test_known_exclusions(self):
        assert model_rejects_effort("gpt-5.5", "max")
        assert model_rejects_effort("gpt-5.4", "max")
        assert model_rejects_effort("gpt-5.4-mini", "max")

    def test_capable_models_pass(self):
        for m in ("gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"):
            assert not model_rejects_effort(m, "max")

    def test_unknown_model_passes(self):
        # Free-string models stay allowed — the server is the authority.
        assert not model_rejects_effort("gpt-7-future", "max")

    def test_absent_values_pass(self):
        assert not model_rejects_effort(None, "max")
        assert not model_rejects_effort("gpt-5.5", None)

    def test_non_max_efforts_unaffected(self):
        for e in ("none", "low", "medium", "high", "xhigh"):
            assert not model_rejects_effort("gpt-5.5", e)

    def test_whitespace_model_normalized(self):
        assert model_rejects_effort("  gpt-5.5  ", "max")

    def test_allowed_efforts_for_model(self):
        assert allowed_efforts_for_model("gpt-5.5") == CODEX_REASONING_EFFORTS - {"max"}
        assert allowed_efforts_for_model("gpt-5.6-sol") == CODEX_REASONING_EFFORTS
        assert allowed_efforts_for_model(None) == CODEX_REASONING_EFFORTS

    def test_error_names_pair_and_allowed(self):
        msg = effort_incompatibility_error("gpt-5.5", "max")
        assert msg is not None
        assert "gpt-5.5" in msg and "'max'" in msg
        assert "allowed for this model" in msg
        assert "xhigh" in msg  # the allowed list is enumerated
        assert effort_incompatibility_error("gpt-5.6-sol", "max") is None

    def test_exception_map_is_exact_known_names(self):
        # Prefix/substring matching would wrongly catch e.g. "gpt-5.5-custom".
        assert not model_rejects_effort("gpt-5.5-custom", "max")
        assert set(CODEX_MODEL_UNSUPPORTED_EFFORTS) == {"gpt-5.5", "gpt-5.4", "gpt-5.4-mini"}


class TestLoadBoundary:
    """Config load fails loudly on a persisted incompatible pair — exactly
    like any other invalid config value; never boot into per-request 400s."""

    def test_max_valid_on_capable_model(self):
        cfg = OpenAICodexConfig(model="gpt-5.6-sol", reasoning_effort="max")
        assert cfg.reasoning_effort == "max"

    def test_max_valid_on_unknown_model(self):
        assert OpenAICodexConfig(model="brand-new", reasoning_effort="max")

    def test_main_pair_rejected(self):
        with pytest.raises(ValidationError, match="gpt-5.5"):
            OpenAICodexConfig(model="gpt-5.5", reasoning_effort="max")

    def test_fixed_agent_pair_rejected(self):
        with pytest.raises(ValidationError, match="agent settings"):
            OpenAICodexConfig(
                model="gpt-5.6-sol",
                reasoning_effort="medium",
                agent_model="gpt-5.5",
                agent_reasoning_effort="max",
            )

    def test_agent_effort_inheriting_bad_main_model_rejected(self):
        # agent_model None inherits the main gpt-5.5 → (gpt-5.5, max)
        with pytest.raises(ValidationError, match="agent settings"):
            OpenAICodexConfig(
                model="gpt-5.5",
                reasoning_effort="xhigh",
                agent_reasoning_effort="max",
            )

    def test_agent_model_inheriting_max_effort_rejected(self):
        # agent effort None inherits the main "max" onto a fixed gpt-5.5
        with pytest.raises(ValidationError, match="agent settings"):
            OpenAICodexConfig(
                model="gpt-5.6-sol",
                reasoning_effort="max",
                agent_model="gpt-5.5",
            )

    def test_auto_model_axis_exempt(self):
        # Per-spawn selection: the spawn/request boundaries own the pair.
        cfg = OpenAICodexConfig(
            model="gpt-5.5",
            reasoning_effort="xhigh",
            agent_model="auto",
            agent_reasoning_effort="max",
        )
        assert cfg.agent_reasoning_effort == "max"

    def test_auto_effort_axis_exempt(self):
        cfg = OpenAICodexConfig(
            model="gpt-5.6-sol",
            reasoning_effort="max",
            agent_model="gpt-5.5",
            agent_reasoning_effort="auto",
        )
        assert cfg.agent_model == "gpt-5.5"

    def test_full_config_load_path_rejects(self):
        # Through the real Config root, the way load_config constructs it.
        with pytest.raises(ValidationError, match="gpt-5.5"):
            Config(
                discord={"token": "fake"},
                openai_codex={"model": "gpt-5.5", "reasoning_effort": "max"},
            )

    def test_minimal_coercion_still_green(self):
        # The legacy migration shim is untouched by the pair validator.
        assert OpenAICodexConfig(reasoning_effort="minimal").reasoning_effort == "low"

    def test_good_agent_combos_still_load(self):
        cfg = OpenAICodexConfig(
            model="gpt-5.6-sol",
            reasoning_effort="max",
            agent_model="gpt-5.6-luna",
            agent_reasoning_effort="max",
        )
        assert cfg.agent_model == "gpt-5.6-luna"
        # gpt-5.5 agents stay fine below max
        assert OpenAICodexConfig(
            model="gpt-5.6-sol",
            reasoning_effort="max",
            agent_model="gpt-5.5",
            agent_reasoning_effort="xhigh",
        )


class TestSpawnSchemaSync:
    def test_spawn_options_match_schema_set(self):
        # defs/ stays import-free; this pin keeps the two layers in lockstep.
        assert set(SPAWN_EFFORT_OPTIONS) == CODEX_REASONING_EFFORTS

    def test_spawn_options_order(self):
        # Order is prompt/UI behavior: escalating depth, max last.
        assert SPAWN_EFFORT_OPTIONS == ["none", "low", "medium", "high", "xhigh", "max"]


class TestPreflightBeforeAdmission:
    """Review round 1 (High): the pair must be validated BEFORE model-breaker
    admission on every generation path. With that breaker OPEN, a doomed pair
    used to deadline-wait through recovery and count a capacity failure for a
    request that could never legally be sent; it must instead return the
    local LLMRequestError immediately, leaving the breaker untouched."""

    @staticmethod
    def _codex_client(model="gpt-5.6-sol", effort="medium"):
        from types import SimpleNamespace
        return SimpleNamespace(model=model, reasoning_effort=effort)

    # --- the shared preflight itself ---
    def test_bad_pair_raises_with_canonical_text(self):
        from src.llm.errors import LLMRequestError
        from src.llm.recovery import preflight_incompatible_effort
        with pytest.raises(LLMRequestError) as ei:
            preflight_incompatible_effort(self._codex_client("gpt-5.5", "max"))
        assert "gpt-5.5" in str(ei.value) and "'max'" in str(ei.value)
        assert "allowed for this model" in str(ei.value)

    def test_overrides_beat_client_values(self):
        from src.llm.errors import LLMRequestError
        from src.llm.recovery import preflight_incompatible_effort
        healthy = self._codex_client()  # sol@medium
        with pytest.raises(LLMRequestError):
            preflight_incompatible_effort(healthy, model="gpt-5.5", effort="max")
        # override to a GOOD pair over a client whose own pair is irrelevant
        preflight_incompatible_effort(
            self._codex_client("gpt-5.5", "xhigh"), model="gpt-5.6-luna", effort="max")

    def test_effort_none_inherits_client_effort(self):
        from src.llm.errors import LLMRequestError
        from src.llm.recovery import preflight_incompatible_effort
        with pytest.raises(LLMRequestError):
            preflight_incompatible_effort(
                self._codex_client(effort="max"), model="gpt-5.5", effort=None)

    def test_non_codex_and_absent_clients_no_op(self):
        from types import SimpleNamespace

        from src.llm.recovery import preflight_incompatible_effort
        preflight_incompatible_effort(None)
        # a non-Codex provider whose model NAME collides with the exception
        # map (review round 1, Medium) ignores Codex effort semantics
        preflight_incompatible_effort(SimpleNamespace(model="gpt-5.5"), effort="max")

    def test_good_and_unknown_pairs_pass(self):
        from src.llm.recovery import preflight_incompatible_effort
        preflight_incompatible_effort(self._codex_client("gpt-5.6-sol", "max"))
        preflight_incompatible_effort(self._codex_client("gpt-7-future", "max"))

    # --- production entry: the chat pipeline's _call_llm ---
    async def test_call_llm_fails_fast_with_open_breaker(self):
        """Odin's exact-head repro inverted: breaker OPEN + invalid live pair
        must raise LLMRequestError immediately — never LLMCapacityError from
        an exhausted recovery deadline — and must not move the breaker's
        failure count. (A regression here fails as LLMCapacityError via the
        short deadline below, not as a hang.)"""
        from types import SimpleNamespace

        from src.llm.errors import LLMRequestError
        from src.llm.model_breaker import ModelBreakerRegistry
        from src.llm.recovery import RecoveryPolicy

        # reuse the established real-_call_llm harness
        from tests.test_typing_resilience import FakeChannel, _make_runner, _stub_state

        runner, _saved, _cleared = _make_runner()
        st = _stub_state(channel=FakeChannel())
        registry = ModelBreakerRegistry(generation_threshold=1)
        breaker = registry.for_model("codex", "gpt-5.5")
        breaker.record_generation_failure()  # threshold 1 → OPEN
        assert breaker.snapshot()["state"] == "open"
        failures_before = breaker.snapshot()["failed_generations"]

        async def _cwt(**kwargs):  # must never run
            raise AssertionError("transport reached despite doomed pair")

        runner._llm_gateway = SimpleNamespace(
            call_with_tools=_cwt,
            capacity_breaker_for=lambda model=None: breaker,
            recovery_policy=lambda: RecoveryPolicy(
                deadline_seconds=0.3, backoff_base=0.01,
                backoff_cap=0.02, retry_after_cap=0.05),
            active_client=self._codex_client("gpt-5.5", "max"),
        )
        with pytest.raises(LLMRequestError):
            await runner._call_llm(st)
        assert breaker.snapshot()["failed_generations"] == failures_before
        assert breaker.snapshot()["state"] == "open"  # untouched, not probed


class TestAutonomousPreflightCompletion:
    """Review round 2 (Medium): the autonomous-loop preflight lives INSIDE
    _call_loop_llm's try — LLMRequestError must complete the loop through
    _finish_loop (trajectory + reflection finalization) like any other
    failed generation, never escape run_autonomous()."""

    async def test_bad_pair_finishes_loop_instead_of_raising(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        from src.llm.model_breaker import ModelBreakerRegistry
        from src.llm.recovery import RecoveryPolicy
        from tests.test_typing_resilience import _make_runner

        runner, _saved, _cleared = _make_runner()
        registry = ModelBreakerRegistry()
        runner._llm_gateway = SimpleNamespace(
            capacity_breaker_for=lambda model=None: registry.for_model("codex", "m"),
            recovery_policy=lambda: RecoveryPolicy(
                deadline_seconds=0.3, backoff_base=0.01,
                backoff_cap=0.02, retry_after_cap=0.05),
            active_client=SimpleNamespace(model="gpt-5.5", reasoning_effort="max"),
        )
        runner._finish_loop = AsyncMock(return_value="FINISHED")
        st = SimpleNamespace(messages=[], system_prompt="s", tools=[])
        kind, val = await runner._call_loop_llm(st)
        assert (kind, val) == ("done", "FINISHED")
        call = runner._finish_loop.await_args
        assert call.kwargs.get("is_error") is True
        # the finalized loop error carries the canonical pair text
        joined = " ".join(str(a) for a in call.args) + str(call.kwargs)
        assert "gpt-5.5" in joined and "'max'" in joined
