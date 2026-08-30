"""Per-model context-budget resolution (pure functions; campaign phase 1).

The single derivation authority from capability (budget floors and operator
overrides), evidence (observed clamps), and policy (utilization, explicit
character ceiling) down to the character targets compaction consumes:

    base_budget        = override[model] ?? floor[model] ?? 272_000
    effective_budget   = min(base_budget, observed_clamp)      # when present
    working_budget     = min(effective_budget,
                             max(272_000, effective_budget × utilization%))
    compactable_tokens = max(0, working_budget − 42_000)       # total: never negative
    derived_chars      = compactable_tokens × density           # density = chars/token
    primary_chars      = min(derived_chars, explicit ceiling)  # when non-null
    rung_1             = primary_chars × 0.7
    rung_2             = min(rung_1, 400_000)
    ladder             = positive rungs only, deduplicated, non-increasing

All arithmetic is exact integer math (density as ×milli//1000, percentages and
the 0.7 ratio as integer products before floor division) — identical to the
settled floor()-form for non-negative operands, with no float drift. At the
default density (2500 milli) ``× 2500 // 1000`` is bit-identical to the
historical ``× 5 // 2`` for every non-negative operand.

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
- Density is WORKLOAD evidence supplied by the caller (the window observer),
  never read here: this module stays pure and observer-independent, exactly
  like ``observed_clamp``.
- Utilization is QUALITY POLICY; overflow is PHYSICS. ``working_budget`` is
  the policy target that ordinary soft compaction serves. Predictive
  admission decisions and clamp qualification consult ``effective_budget``
  (believed physical capacity) instead — turning a policy preference into a
  hard admission wall would both distort behavior and make an aggressive
  policy setting indistinguishable from a genuine window shrink.
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

#: Default chars-per-token, expressed in MILLICHARS per token so derivations
#: stay exact integer math. 2500 milli = 2.5 chars/token.
#:
#: This was long documented as "deliberately dense so a character measure can
#: never overshoot real tokens". FIELD EVIDENCE DISPROVED THAT (2026-08-30): a
#: measured sol acceptance of 391,046 chars echoed 684,031 server input tokens
#: — about 0.61 chars/token, a 4.1x overshoot in the DANGEROUS direction (the
#: estimate believes far more content fits than actually does). Image blocks
#: are the main driver: they carry real tokens and almost no characters, so a
#: pure character measure cannot see them at all.
#:
#: The constant therefore survives only as the uncalibrated DEFAULT and as the
#: calibration CEILING. Live calibration (window observer) may lower it toward
#: observed density; it may never raise it above this value, so calibration is
#: one-way and can only ever shrink derived targets.
DEFAULT_DENSITY_MILLI = 2500

#: Calibration bounds. The ceiling is the historical constant (one-way safety:
#: calibration never enlarges a budget). The floor sits meaningfully below the
#: lowest density measured in the field (~609 milli) so real dense content is
#: never clipped, while still bounding a pathological usage echo that passed
#: the observation gate. Settled with Odin 2026-08-30: evidence invalidated a
#: 1000 floor (it would conceal the very defect this machinery measures); it
#: does not yet justify allowing calibration down to 250.
MIN_DENSITY_MILLI = 400
MAX_DENSITY_MILLI = DEFAULT_DENSITY_MILLI

#: Per-image token surcharge for request estimation and density attribution.
#: Deliberately conservative rather than pretending the serving path has
#: supplied evidence it has not. It is NEVER inflated to keep calibrated
#: density above the floor — that would hide one unknown inside another.
IMAGE_TOKEN_SURCHARGE = 2_500

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
    base_source: str  # "override" | "floor" | "unknown_default" | "persisted"
    effective_budget: int
    clamp_applied: bool
    working_budget: int
    compactable_tokens: int
    derived_chars: int
    primary_chars: int
    ceiling_applied: bool
    ladder: tuple[int, ...]
    #: Chars-per-token in millichars used for THIS derivation, and where it
    #: came from. Frozen with the rest of the snapshot: a live calibration
    #: move reaches the next generation, never the one in flight.
    density_milli: int = DEFAULT_DENSITY_MILLI
    density_source: str = "default"  # "default" | "calibrated"


@dataclass(frozen=True)
class WorkloadScope:
    """Identity of ONE independent prompt lineage, for density calibration.

    Density is a property of the WORKLOAD, not of the model: characters per
    token describe what a particular job is reading, and publishing one job's
    measurement globally makes every other job compact against a stranger's
    content. That is the same failure shape as a false clamp — a local truth
    published globally — and account keys never bounded it, because the auth
    pool is sticky and clamp lookup takes a minimum across accounts anyway.

    ``surface_kind`` is "chat", "agent" or "loop"; ``workload_id`` is that
    surface's independent-lineage id (the durable turn id, the individual
    agent id, the loop id). Deliberately carries NO account or user identity:
    neither describes payload density.
    """

    surface_kind: str
    workload_id: str

    def is_valid(self) -> bool:
        return bool(
            isinstance(self.surface_kind, str)
            and self.surface_kind.strip()
            and isinstance(self.workload_id, str)
            and self.workload_id.strip()
        )


@dataclass(frozen=True)
class RejectedAttemptFacts:
    """Everything the physical-fit verdict for ONE sent payload rested on.

    Carried as a single frozen unit rather than separate boolean and numeric
    arguments, which could disagree with each other. Captured immediately
    before the provider attempt and paired with the overflow that attempt
    produced — never recomputed afterward from messages rescue has already
    mutated.
    """

    chars: int
    images: int
    density_milli: int
    estimated_tokens: int
    effective_budget: int
    believed_within: bool


def clamp_density_milli(value: object) -> int:
    """Coerce any candidate density into the safe calibration band.

    Total by construction: non-integral, boolean, or absent input yields the
    default. The band is one-way-safe — the ceiling is the historical
    constant, so no calibration can enlarge a derived target.
    """
    if isinstance(value, bool) or not isinstance(value, int):
        return DEFAULT_DENSITY_MILLI
    return max(MIN_DENSITY_MILLI, min(MAX_DENSITY_MILLI, value))


def _estimate_request_tokens_at_density(chars: int, images: int, density_milli: int) -> int:
    """Shared exact estimator after the caller has selected density policy."""
    safe_chars = max(0, chars)
    safe_images = max(0, images)
    char_tokens = -(-safe_chars * 1000 // density_milli)  # ceil(chars * 1000 / density)
    return FIXED_ENVELOPE_RESERVE_TOKENS + char_tokens + safe_images * IMAGE_TOKEN_SURCHARGE


def estimate_request_tokens(
    chars: int,
    images: int = 0,
    *,
    density_milli: int = DEFAULT_DENSITY_MILLI,
) -> int:
    """Estimate input tokens for ADMISSION using the safe density band.

    ``chars`` is the compactable character measure; ``images`` counts
    wire-real image blocks, which carry real tokens and almost no characters
    and so must be charged separately. The fixed envelope is included because
    the comparison this feeds is against the physical window, which the
    envelope also consumes.

    Admission deliberately clamps density to ``[400, 2500]``. A pathological
    usage echo must never feed an absurd predictive target into the rescue
    ladder. For forensic re-checks of a payload that was already sent, use
    ``estimate_request_tokens_forensic`` instead: clipping there can erase the
    very contradiction that must veto a false durable clamp.

    CEIL division on the character term: a one-token excess must never round
    down into "within", because that misclassification is exactly what
    manufactures a false belief and, downstream, a false clamp.
    """
    return _estimate_request_tokens_at_density(
        chars, images, clamp_density_milli(density_milli)
    )


def estimate_request_tokens_forensic(
    chars: int,
    images: int = 0,
    *,
    density_milli: int,
) -> int:
    """Re-estimate an ALREADY-SENT payload at an unbanded raw density.

    This route is intentionally separate from admission. It accepts only a
    positive, non-boolean integer density and preserves it exactly, including
    values below the EMA/admission floor. Callers use it only to ask whether
    fresh server evidence disproves a prior fit belief; it must never size a
    request or a rescue rung.
    """
    if isinstance(density_milli, bool) or not isinstance(density_milli, int):
        raise ValueError("forensic density must be a positive integer")
    if density_milli <= 0:
        raise ValueError("forensic density must be a positive integer")
    return _estimate_request_tokens_at_density(chars, images, density_milli)


def snapshot_for_codex_config(
    model: str | None,
    codex_config: object,
    *,
    max_context_chars: int | None,
    observed_clamp: int | None = None,
    density_milli: int | None = None,
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
    ``density_milli`` is likewise observer-supplied workload evidence; None
    keeps the uncalibrated default.
    """
    return resolve_context_budget(
        model,
        overrides=getattr(codex_config, "context_budget_overrides", None),
        utilization=getattr(codex_config, "context_utilization", 60),
        max_context_chars=max_context_chars,
        observed_clamp=observed_clamp,
        density_milli=density_milli,
    )


def resolve_context_budget(
    model: str | None,
    *,
    overrides: dict[str, int] | None = None,
    utilization: int = 60,
    max_context_chars: int | None = None,
    observed_clamp: int | None = None,
    density_milli: int | None = None,
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
    # Integer form of floor(compactable × density). At the default 2500 this
    # is bit-identical to the historical `* 5 // 2` for every non-negative
    # operand; calibration can only lower it (the band's ceiling IS 2500).
    density_supplied = density_milli is not None
    resolved_density = (
        DEFAULT_DENSITY_MILLI if not density_supplied else clamp_density_milli(density_milli)
    )
    # Provenance follows the ORIGIN, not numeric inequality. A real accepted
    # sample may calibrate exactly to the historical 2500 default; that is
    # still measured evidence and must not be presented as uncalibrated.
    density_source = "calibrated" if density_supplied else "default"
    derived_chars = compactable_tokens * resolved_density // 1000

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
        density_milli=resolved_density,
        density_source=density_source,
    )
