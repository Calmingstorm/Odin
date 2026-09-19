"""Contract battery for the per-model context-budget kernel (campaign phase 1).

Covers the pure resolver (src/llm/context_budget.py), the schema-owned
registry/canonicalizer, and the new configuration fields. The settled
numbers here are the plan-of-record examples — a formula change that moves
any of them is a design change, not a refactor.
"""

from __future__ import annotations

import dataclasses

import pytest

from src.config.schema import (
    CODEX_MODEL_INPUT_BUDGETS,
    CODEX_UNKNOWN_MODEL_INPUT_BUDGET,
    CONTEXT_BUDGET_OVERRIDE_MAX,
    CONTEXT_BUDGET_OVERRIDE_MIN,
    LEGACY_MAX_CONTEXT_CHARS,
    ContextCompressionConfig,
    OpenAICodexConfig,
    canonical_codex_model,
    input_budget_floor_for_model,
)
from src.llm.context_budget import (
    FIXED_ENVELOPE_RESERVE_TOKENS,
    LEGACY_UTILIZATION_FLOOR_TOKENS,
    RESCUE_CEILING_CHARS,
    resolve_context_budget,
)


# ---------------------------------------------------------------------------
# Canonicalizer + registry
# ---------------------------------------------------------------------------
class TestCanonicalizer:
    def test_trims_and_preserves_unknown_spelling(self):
        assert canonical_codex_model("  gpt-5.6-sol ") == "gpt-5.6-sol"
        # Unknown models pass through spelling-preserved — no case folding.
        assert canonical_codex_model(" Some-Future-Model ") == "Some-Future-Model"

    def test_alias_maps_before_lookup(self):
        assert canonical_codex_model("codex-auto-review") == "gpt-5.6-luna"
        assert (
            input_budget_floor_for_model("codex-auto-review")
            == CODEX_MODEL_INPUT_BUDGETS["gpt-5.6-luna"]
        )

    def test_none_and_empty(self):
        assert canonical_codex_model(None) == ""
        assert canonical_codex_model("   ") == ""
        assert input_budget_floor_for_model(None) == CODEX_UNKNOWN_MODEL_INPUT_BUDGET

    def test_alias_is_not_a_registry_row(self):
        assert "codex-auto-review" not in CODEX_MODEL_INPUT_BUDGETS


class TestRegistryFloors:
    def test_floors_match_probe_evidence(self):
        # A floor never exceeds its own accepted observation: only sol got
        # the fine-refinement acceptances (921,601); its window-mates proved
        # 917,506 (plan of record R2).
        assert CODEX_MODEL_INPUT_BUDGETS == {
            # astra: probed 2026-09-04 (accepted 917,534 / rejected at 922,000)
            "gpt-6-astra": 917_534,
            "gpt-5.6-sol": 921_601,
            "gpt-5.6-terra": 917_506,
            "gpt-5.6-luna": 917_506,
            "gpt-5.4": 917_506,
            "gpt-5.4-mini": 262_146,
        }
        assert CODEX_UNKNOWN_MODEL_INPUT_BUDGET == 272_000

    def test_astra_resolves_to_its_probed_floor_not_the_unknown_default(self):
        from src.config.schema import input_budget_floor_for_model

        assert input_budget_floor_for_model("gpt-6-astra") == 917_534
        assert input_budget_floor_for_model(" gpt-6-astra ") == 917_534


# ---------------------------------------------------------------------------
# Resolver characterization — the settled plan-of-record numbers
# ---------------------------------------------------------------------------
class TestResolverDefaults:
    def test_sol_at_defaults(self):
        snap = resolve_context_budget("gpt-5.6-sol")
        assert snap.base_budget == 921_601
        assert snap.base_source == "floor"
        assert snap.working_budget == 552_960
        assert snap.compactable_tokens == 510_960
        assert snap.primary_chars == 1_277_400
        assert snap.ladder == (894_180, 400_000)

    def test_terra_luna_54_at_defaults(self):
        for model in ("gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.4"):
            snap = resolve_context_budget(model)
            assert snap.base_budget == 917_506
            assert snap.working_budget == 550_503
            assert snap.primary_chars == 1_271_257
            assert snap.ladder == (889_879, 400_000)

    def test_historical_small_window_math_can_be_pinned_by_unknown_override(self):
        snap = resolve_context_budget("historical-small", overrides={"historical-small": 270_001})
        # 60% of 270,001 is 162,000 — the 272K legacy floor wins, so the
        # working budget stays the full budget and the derived target matches
        # the pre-campaign per-model result exactly.
        assert snap.working_budget == 270_001
        assert snap.primary_chars == 570_002
        assert snap.ladder == (399_001,)

    def test_54_mini_at_defaults(self):
        snap = resolve_context_budget("gpt-5.4-mini")
        assert snap.working_budget == 262_146
        assert snap.primary_chars == 550_365
        assert snap.ladder == (385_255,)

    def test_small_override_not_lifted_by_legacy_floor(self):
        snap = resolve_context_budget("future-small", overrides={"future-small": 124_001})
        # min(budget, max(272K, …)) can never RAISE a small budget.
        assert snap.working_budget == 124_001
        assert snap.primary_chars == 205_002
        assert snap.ladder == (143_501,)

    def test_unknown_model_reproduces_precampaign_constants(self):
        snap = resolve_context_budget("some-new-model")
        assert snap.base_source == "unknown_default"
        assert snap.working_budget == 272_000
        # Today's shipped emergency targets were 575,000 / 400,000: the
        # unknown-model primary is exactly the old first target and the
        # rescue ceiling is exactly the old aggressive target.
        assert snap.primary_chars == 575_000
        assert snap.ladder == (402_500, 400_000)

    def test_alias_resolves_identically_to_luna(self):
        assert resolve_context_budget("codex-auto-review") == resolve_context_budget(
            "gpt-5.6-luna"
        )

    def test_snapshot_is_frozen(self):
        snap = resolve_context_budget("gpt-5.6-sol")
        with pytest.raises(dataclasses.FrozenInstanceError):
            snap.primary_chars = 1  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Overrides, clamps, utilization, ceiling
# ---------------------------------------------------------------------------
class TestResolverInputs:
    def test_override_beats_floor(self):
        snap = resolve_context_budget(
            "gpt-5.4-mini", overrides={"gpt-5.4-mini": 400_000}
        )
        assert snap.base_budget == 400_000
        assert snap.base_source == "override"
        # 60% of 400,000 = 240,000 < 272,000 legacy floor → floor wins,
        # capped by the budget itself.
        assert snap.working_budget == 272_000

    def test_override_for_unknown_model(self):
        snap = resolve_context_budget("future-x", overrides={"future-x": 600_000})
        assert snap.base_source == "override"
        assert snap.working_budget == 360_000

    def test_clamp_below_base_applies(self):
        snap = resolve_context_budget("gpt-5.6-sol", observed_clamp=372_000)
        assert snap.clamp_applied is True
        assert snap.effective_budget == 372_000
        # 60% of 372,000 = 223,200 → legacy floor 272,000 wins.
        assert snap.working_budget == 272_000
        assert snap.primary_chars == 575_000

    def test_clamp_at_or_above_base_ignored(self):
        for clamp in (921_601, 1_000_000):
            snap = resolve_context_budget("gpt-5.6-sol", observed_clamp=clamp)
            assert snap.clamp_applied is False
            assert snap.effective_budget == 921_601

    def test_utilization_100_uses_full_budget(self):
        snap = resolve_context_budget("gpt-5.6-sol", utilization=100)
        assert snap.working_budget == 921_601
        assert snap.primary_chars == 2_199_002

    def test_utilization_30_bites_only_large_budgets(self):
        sol = resolve_context_budget("gpt-5.6-sol", utilization=30)
        assert sol.working_budget == 276_480
        historical = resolve_context_budget(
            "historical-small", overrides={"historical-small": 270_001}, utilization=30
        )
        assert historical.working_budget == 270_001  # legacy floor: unchanged

    def test_explicit_ceiling_only_lowers(self):
        lowered = resolve_context_budget("gpt-5.6-sol", max_context_chars=800_000)
        assert lowered.ceiling_applied is True
        assert lowered.primary_chars == 800_000
        raised = resolve_context_budget("gpt-5.6-sol", max_context_chars=9_999_999)
        assert raised.ceiling_applied is False
        assert raised.primary_chars == 1_277_400

    def test_ladder_derives_from_final_primary_after_ceiling(self):
        # The R5-settled ordering rule: a low explicit ceiling must pull the
        # rescue rungs down with it — never an emergency target above primary.
        snap = resolve_context_budget("gpt-5.6-sol", max_context_chars=300_000)
        assert snap.primary_chars == 300_000
        assert snap.ladder == (210_000,)
        assert all(rung <= snap.primary_chars for rung in snap.ladder)


# ---------------------------------------------------------------------------
# Totality — evidence clamps bypass override bounds by design
# ---------------------------------------------------------------------------
class TestResolverTotality:
    @pytest.mark.parametrize("clamp", [0, 41_999, FIXED_ENVELOPE_RESERVE_TOKENS])
    def test_clamp_at_or_below_envelope_yields_empty_ladder(self, clamp):
        snap = resolve_context_budget("gpt-5.6-sol", observed_clamp=clamp)
        assert snap.compactable_tokens == 0
        assert snap.derived_chars == 0
        assert snap.primary_chars == 0
        assert snap.ladder == ()

    def test_negative_clamp_never_goes_negative(self):
        snap = resolve_context_budget("gpt-5.6-sol", observed_clamp=-5)
        assert snap.compactable_tokens == 0
        assert snap.derived_chars == 0
        assert snap.ladder == ()

    def test_clamp_at_override_minimum_boundary(self):
        snap = resolve_context_budget(
            "gpt-5.6-sol", observed_clamp=CONTEXT_BUDGET_OVERRIDE_MIN
        )
        # 50,192 − 42,000 = 8,192 tokens → 20,480 chars → single 14,336 rung.
        assert snap.compactable_tokens == 8_192
        assert snap.derived_chars == 20_480
        assert snap.ladder == (14_336,)

    def test_ladder_always_positive_monotonic_deduped(self):
        for clamp in (None, 43_000, 50_192, 100_000, 372_000, 921_601):
            for util in (30, 60, 100):
                for ceiling in (None, 1, 100_000, 500_000, 5_000_000):
                    snap = resolve_context_budget(
                        "gpt-5.6-sol",
                        observed_clamp=clamp,
                        utilization=util,
                        max_context_chars=ceiling,
                    )
                    assert all(rung > 0 for rung in snap.ladder)
                    assert list(snap.ladder) == sorted(snap.ladder, reverse=True)
                    assert len(set(snap.ladder)) == len(snap.ladder)
                    if snap.ladder:
                        # The dedupe guarantees this: a lone surviving rung is
                        # one that already sat at or below the rescue ceiling.
                        assert snap.ladder[-1] <= RESCUE_CEILING_CHARS
                    assert all(r <= snap.primary_chars for r in snap.ladder)

    def test_rescue_ceiling_never_enlarges(self):
        # Models whose own rung is below 400K keep it (min semantics).
        snap = resolve_context_budget("future-small", overrides={"future-small": 124_001})
        assert snap.ladder == (143_501,)
        assert LEGACY_UTILIZATION_FLOOR_TOKENS == 272_000


class TestCompatibleProfiles:
    def test_total_window_minus_output_and_alias_are_derived(self):
        from types import SimpleNamespace
        from src.llm.context_budget import snapshot_for_compatible_profile

        cfg = SimpleNamespace(model_profiles={"deepseek-v4-flash": SimpleNamespace(
            total_window_tokens=100_000, max_output_tokens=20_000
        )}, context_utilization=50)
        snap = snapshot_for_compatible_profile("deepseek-chat", cfg, max_context_chars=None)
        assert snap.canonical_model == "deepseek-v4-flash"
        assert snap.base_budget == 80_000
        assert snap.working_budget == 40_000
        assert snap.compactable_tokens == 0

    def test_unknown_or_sub_threshold_compatible_has_no_rescue_ladder(self):
        from types import SimpleNamespace
        from src.llm.context_budget import snapshot_for_compatible_profile

        cfg = SimpleNamespace(model_profiles={"small": SimpleNamespace(
            total_window_tokens=70_000, max_output_tokens=10_000
        )})
        assert snapshot_for_compatible_profile("small", cfg, max_context_chars=None).ladder == ()
        assert snapshot_for_compatible_profile("unknown", cfg, max_context_chars=None).ladder == ()

    def test_eligible_compatible_rescue_ladder_is_exact_and_descending(self):
        from types import SimpleNamespace
        from src.llm.context_budget import snapshot_for_compatible_profile

        cfg = SimpleNamespace(model_profiles={"large": SimpleNamespace(
            total_window_tokens=200_000, max_output_tokens=100_000
        )}, context_utilization=100)
        snap = snapshot_for_compatible_profile("large", cfg, max_context_chars=None)
        # (100,000 - 42,000) * 2.5 = 145,000 primary; rescue begins at 70%.
        assert (snap.primary_chars, snap.ladder) == (145_000, (101_500,))


# ---------------------------------------------------------------------------
# Configuration surface
# ---------------------------------------------------------------------------
class TestBudgetConfig:
    def test_override_keys_canonicalized_and_deduped(self):
        cfg = OpenAICodexConfig(
            context_budget_overrides={" codex-auto-review ": 900_000}
        )
        assert cfg.context_budget_overrides == {"gpt-5.6-luna": 900_000}
        with pytest.raises(ValueError, match="duplicates"):
            OpenAICodexConfig(
                context_budget_overrides={
                    "codex-auto-review": 900_000,
                    "gpt-5.6-luna": 800_000,
                }
            )

    @pytest.mark.parametrize(
        "value", [0, CONTEXT_BUDGET_OVERRIDE_MIN - 1, CONTEXT_BUDGET_OVERRIDE_MAX + 1]
    )
    def test_override_bounds_enforced(self, value):
        with pytest.raises(ValueError):
            OpenAICodexConfig(context_budget_overrides={"historical-small": value})

    def test_override_bound_edges_accepted(self):
        cfg = OpenAICodexConfig(
            context_budget_overrides={
                "historical-small": CONTEXT_BUDGET_OVERRIDE_MIN,
                "gpt-5.6-sol": CONTEXT_BUDGET_OVERRIDE_MAX,
            }
        )
        assert cfg.context_budget_overrides["historical-small"] == CONTEXT_BUDGET_OVERRIDE_MIN

    def test_empty_override_key_rejected(self):
        with pytest.raises(ValueError, match="non-empty"):
            OpenAICodexConfig(context_budget_overrides={"   ": 900_000})

    @pytest.mark.parametrize("value", [29, 101, True])
    def test_utilization_bounds(self, value):
        with pytest.raises(ValueError):
            OpenAICodexConfig(context_utilization=value)

    def test_utilization_default_and_edges(self):
        assert OpenAICodexConfig().context_utilization == 60
        assert OpenAICodexConfig(context_utilization=30).context_utilization == 30
        assert OpenAICodexConfig(context_utilization=100).context_utilization == 100

    def test_ceiling_null_is_auto_and_positive_required(self):
        assert ContextCompressionConfig().max_context_chars is None
        assert (
            ContextCompressionConfig().resolved_max_context_chars
            == LEGACY_MAX_CONTEXT_CHARS
        )
        explicit = ContextCompressionConfig(max_context_chars=500_000)
        assert explicit.resolved_max_context_chars == 500_000
        with pytest.raises(ValueError):
            ContextCompressionConfig(max_context_chars=0)
