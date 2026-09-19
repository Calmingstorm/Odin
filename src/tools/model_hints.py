"""Honest, operator-controlled selection guidance for spawned-agent models."""
from __future__ import annotations

from ..config.schema import CODEX_MODEL_INPUT_BUDGETS

# Advisory defaults, deliberately small and dated.  These are editable seeds, not
# capability telemetry or a ranking.  Unknown models receive facts only.
CURATED_SEED_AS_OF = "2026-09-19"
CURATED_SELECTION_SEEDS = {
    "gpt-6-astra": "hardest multi-step work; newest and strongest reasoning tier (rejects effort 'none')",
    "gpt-5.6-sol": "hard or ambiguous work; deepest 5.6 reasoning tier",
    "gpt-5.6-terra": "balanced default for most tasks",
    "gpt-5.6-luna": "simple or mechanical work; fastest tier",
    "compat:deepseek-v4-flash": "verified in Odin for bulk and mechanical work",
    "compat:deepseek-v4-pro": "verified in Odin for more demanding reasoning work",
}


def _provider_model(model_ref: str) -> tuple[str, str]:
    if model_ref.startswith("compat:"):
        return "compatible", model_ref.removeprefix("compat:")
    if model_ref.startswith("ollama:"):
        return "ollama", model_ref.removeprefix("ollama:")
    return "codex", model_ref


def _profile(config, model_ref: str):
    if not model_ref.startswith("compat:"):
        return None
    compat = getattr(config, "openai_compatible", None)
    return (getattr(compat, "model_profiles", {}) or {}).get(model_ref.removeprefix("compat:"))


def _fact_text(config, model_ref: str, latency_ms: int | None) -> str:
    facts: list[str] = []
    profile = _profile(config, model_ref)
    if profile is not None:
        facts.append(f"context {profile.total_window_tokens:,}; max output {profile.max_output_tokens:,}")
        compat = getattr(config, "openai_compatible", None)
        dialect = getattr(compat, "reasoning_dialect", None)
        if dialect and dialect != "none":
            current = getattr(getattr(config, "agents", None), "thinking_mode", None)
            facts.append(f"reasoning control {dialect} ({current or 'configured default'})")
    elif model_ref.startswith("codex:"):
        pass
    elif not (":" in model_ref):
        budget = CODEX_MODEL_INPUT_BUDGETS.get(model_ref)
        if budget:
            facts.append(f"configured input context {budget:,}")
    if latency_ms is not None:
        facts.append(f"measured p50 {latency_ms:,} ms")
    return "; ".join(facts)


def render_spawn_model_guidance(config, choices: list[str], usage_rollup=None) -> tuple[str, str]:
    """Return clause and field description. ``choices`` order is sacred policy."""
    authored = getattr(getattr(config, "agents", None), "model_selection_hints", {}) or {}
    latency = usage_rollup.model_latency_p50(choices) if usage_rollup is not None else {}
    lines = []
    for model in choices:
        profile = _profile(config, model)
        hint = authored.get(model)
        authority = "operator hint"
        if not hint and profile is not None:
            hint = getattr(profile, "selection_hint", None)
            authority = "profile operator hint"
        if not hint:
            hint = CURATED_SELECTION_SEEDS.get(model)
            authority = f"curated seed as of {CURATED_SEED_AS_OF}"
        parts = []
        if hint:
            parts.append(f"{authority}: {hint}")
        facts = _fact_text(config, model, latency.get(model))
        if facts:
            parts.append(f"facts: {facts}")
        lines.append(f"{model}: " + ("; ".join(parts) if parts else "facts unavailable"))
    listing = " | ".join(lines)
    clause = (" Set 'model' to select a permitted model. Models are listed in the operator's "
              "preferred order; that order is the ranking. " + listing + ". Omit to use the configured agent model.")
    prop = "Optional permitted model. Operator preference order is meaningful. " + listing + ". Omit to inherit the configured agent model."
    return clause, prop
