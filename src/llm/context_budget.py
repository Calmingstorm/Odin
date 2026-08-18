"""Per-model context-budget resolution (pure functions; campaign phase 1).

The single derivation authority from capability (budget floors and operator
overrides), evidence (observed clamps), and policy (utilization, explicit
character ceiling) down to the character targets compaction consumes:

    base_budget        = override[model] ?? floor[model] ?? 272_000
    effective_budget   = min(base_budget, observed_clamp)      # when present
    working_budget     = min(effective_budget,
                             max(272_000, effective_budget × utilization%))
    compactable_tokens = max(0, working_budget − 42_000)       # total: never negative
    derived_chars      = compactable_tokens × 2.5
    primary_chars      = min(derived_chars, explicit ceiling)  # when non-null
    rung_1             = primary_chars × 0.7
    rung_2             = min(rung_1, 400_000)
    ladder             = positive rungs only, deduplicated, non-increasing

All arithmetic is exact integer math (×2.5 as ×5//2, percentages and the 0.7
ratio as integer products before floor division) — identical to the settled
floor()-form for non-negative operands, with no float drift.

Semantics settled with Odin (plan of record R2, 2026-08-17):

- Budgets are known-safe usable INPUT floors, already below the server's
  output reservation — nothing here subtracts an output reserve.
- The 42K envelope reserve covers the fixed request material that rides
  outside compactable history (system prompt, tool schemas).
- Observed clamps are runtime evidence and deliberately bypass the operator
  override bounds; the resolver is TOTAL under any clamp value — when no
  positive rescue rung exists, recovery must fail honestly rather than
  fabricate a target.
- The 272K legacy floor means utilization never reduces a budget at or below
  272K: small models keep their full derived targets; the policy knob only
  bites above ~453K budgets.
- 400_000 chars is the rescue ceiling for models with a ≥272K usable budget
  (it survives every historically served ≥272K window class); the ``min``
  keeps smaller models and low overrides/clamps on their own smaller rung —
  recovery never enlarges context.
- Resolution is snapshotted per logical generation: the model and its budget
  travel together through retries and rescue rungs; live configuration
  changes reach the NEXT generation only.

Nothing consumes this module at runtime yet — phase 3 wires it into the
agent, chat, and loop surfaces. Until then it is contract plus tests.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..config.schema import (
    CODEX_MODEL_INPUT_BUDGETS,
    CODEX_UNKNOWN_MODEL_INPUT_BUDGET,
    canonical_codex_model,
)

#: Tokens reserved for the fixed request envelope (system prompt, tool
#: schemas, non-history material) — NOT an output reserve; the server already
#: holds its own output reservation outside the usable input budget.
FIXED_ENVELOPE_RESERVE_TOKENS = 42_000

#: Deliberately DENSE chars-per-token so a character measure can never
#: overshoot real tokens on scraped content. Expressed as a ratio of two
#: integers (5/2) so derivations stay exact.
EMERGENCY_CHARS_PER_TOKEN = 2.5

#: Utilization never reduces budgets at or below the pre-campaign uniform
#: window — models of that class keep their full derived working set.
LEGACY_UTILIZATION_FLOOR_TOKENS = 272_000

#: Final-rung ceiling for models with a ≥272K usable budget: ~202K estimated
#: input tokens, which fits every historically served ≥272K window class,
#: including a silent 922K→372K regression.
RESCUE_CEILING_CHARS = 400_000

#: First rescue rung as a fraction of the final primary target (7/10, exact).
RESCUE_RATIO = 0.7

_BASE_SOURCE_OVERRIDE = "override"
_BASE_SOURCE_FLOOR = "floor"
_BASE_SOURCE_UNKNOWN = "unknown_default"


@dataclass(frozen=True)
class ContextBudgetSnapshot:
    """One resolved (model, budget, targets) unit, frozen per logical generation.

    Retries and rescue rungs of the same generation reuse this snapshot;
    a fresh generation resolves a fresh one (that is where live config and
    clamp changes take effect).
    """

    canonical_model: str
    base_budget: int
    base_source: str  # "override" | "floor" | "unknown_default"
    effective_budget: int
    clamp_applied: bool
    working_budget: int
    compactable_tokens: int
    derived_chars: int
    primary_chars: int
    ceiling_applied: bool
    ladder: tuple[int, ...]


def snapshot_for_codex_config(
    model: str | None,
    codex_config: object,
    *,
    max_context_chars: int | None,
    observed_clamp: int | None = None,
) -> ContextBudgetSnapshot:
    """Resolve a snapshot from the live codex config section, getattr-safe.

    ``overrides`` and ``utilization`` are read from ``codex_config`` at CALL
    time — a live save reaches the next logical generation. The explicit
    character ceiling is passed by the CALLER from wherever its truthful
    lifetime lives (the boot-frozen compression object for chat, the
    spawn-frozen value for agents) so the apply-registry classification of
    ``max_context_chars`` stays honest: this helper never re-reads it live.
    ``observed_clamp`` is the window observer's runtime evidence (phase 5) —
    callers with an observer pass ``active_clamp(model)``; None = unclamped.
    """
    return resolve_context_budget(
        model,
        overrides=getattr(codex_config, "context_budget_overrides", None),
        utilization=getattr(codex_config, "context_utilization", 60),
        max_context_chars=max_context_chars,
        observed_clamp=observed_clamp,
    )


def resolve_context_budget(
    model: str | None,
    *,
    overrides: dict[str, int] | None = None,
    utilization: int = 60,
    max_context_chars: int | None = None,
    observed_clamp: int | None = None,
) -> ContextBudgetSnapshot:
    """Resolve the full derivation chain for ``model``. Total by construction.

    ``overrides`` carries canonical keys (the config validator normalizes
    them); the raw ``model`` is canonicalized here so no caller can forget.
    ``observed_clamp`` is exact runtime evidence and may be arbitrarily low —
    the chain absorbs it without ever going negative or fabricating a rung.
    """
    canonical = canonical_codex_model(model)
    overrides = overrides or {}

    if canonical in overrides:
        base_budget, base_source = overrides[canonical], _BASE_SOURCE_OVERRIDE
    elif canonical in CODEX_MODEL_INPUT_BUDGETS:
        base_budget, base_source = CODEX_MODEL_INPUT_BUDGETS[canonical], _BASE_SOURCE_FLOOR
    else:
        base_budget, base_source = CODEX_UNKNOWN_MODEL_INPUT_BUDGET, _BASE_SOURCE_UNKNOWN

    if observed_clamp is not None and observed_clamp < base_budget:
        effective_budget, clamp_applied = observed_clamp, True
    else:
        effective_budget, clamp_applied = base_budget, False

    # Integer form of floor(effective × utilization/100).
    working_budget = min(
        effective_budget,
        max(LEGACY_UTILIZATION_FLOOR_TOKENS, effective_budget * utilization // 100),
    )
    # Totality: an evidence clamp below the envelope reserve must yield an
    # empty compactable allowance, never a negative one.
    compactable_tokens = max(0, working_budget - FIXED_ENVELOPE_RESERVE_TOKENS)
    # Integer form of floor(compactable × 2.5).
    derived_chars = compactable_tokens * 5 // 2

    if max_context_chars is not None and max_context_chars < derived_chars:
        primary_chars, ceiling_applied = max_context_chars, True
    else:
        primary_chars, ceiling_applied = derived_chars, False

    # Integer form of floor(primary × 0.7).
    rung_1 = primary_chars * 7 // 10
    rung_2 = min(rung_1, RESCUE_CEILING_CHARS)
    ladder = tuple(
        rung for i, rung in enumerate((rung_1, rung_2)) if rung > 0 and (i == 0 or rung != rung_1)
    )

    return ContextBudgetSnapshot(
        canonical_model=canonical,
        base_budget=base_budget,
        base_source=base_source,
        effective_budget=effective_budget,
        clamp_applied=clamp_applied,
        working_budget=working_budget,
        compactable_tokens=compactable_tokens,
        derived_chars=derived_chars,
        primary_chars=primary_chars,
        ceiling_applied=ceiling_applied,
        ladder=ladder,
    )
