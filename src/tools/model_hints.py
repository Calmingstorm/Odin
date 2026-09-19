"""Operator-controlled, evidence-labelled model selection guidance."""

from __future__ import annotations

import json
from pathlib import Path

from ..config.schema import CODEX_MODEL_INPUT_BUDGETS

_SEED = json.loads(Path(__file__).with_name("model_hints_seed.json").read_text())
CATALOGUE_AS_OF = str(_SEED["as_of"])
MODEL_HINT_CATALOGUE: dict[str, dict] = dict(_SEED["models"])

# A compatible model name is provider-relative.  ``compat:glm-5.3`` means
# Z.ai only when the configured endpoint is Z.ai; treating every compatible
# name as DeepSeek made the catalogue quietly lie for every other preset.
_COMPAT_PRESET_NAMESPACES = {
    "deepseek": "deepseek",
    "zai": "zai",
    "moonshot": "moonshot",
    "kimi": "moonshot",  # Legacy Moonshot preset name.
    "dashscope": "qwen",
    "qwen": "qwen",
    "mistral": "mistral",
    "xai": "xai",
}


def _catalogue_key(model_ref: str, config=None) -> str:
    if model_ref.startswith("compat:"):
        model = model_ref.removeprefix("compat:")
        compat = getattr(config, "openai_compatible", None)
        namespace = _COMPAT_PRESET_NAMESPACES.get(getattr(compat, "preset", None))
        if namespace is None:
            return ""
        aliases = {
            "deepseek-v4-flash": "deepseek-flash",
            "deepseek-flash": "deepseek-flash",
        }
        return f"{namespace}/{aliases.get(model, model) if namespace == 'deepseek' else model}"
    if model_ref.startswith("ollama:"):
        return f"ollama/{model_ref.removeprefix('ollama:')}"
    return f"codex/{model_ref}"


def seed_entry(model_ref: str, config=None) -> dict:
    return MODEL_HINT_CATALOGUE.get(_catalogue_key(model_ref, config), {})


def catalogue_hint_metadata(model_ref: str, config=None) -> dict:
    """Return the small, auditable catalogue slice safe for the WebUI."""
    entry = seed_entry(model_ref, config)
    if not entry:
        return {}
    return {
        key: entry[key]
        for key in (
            "hint", "hint_derived", "as_of", "evidence", "structural_source",
            "context_tokens", "max_output_tokens", "tools", "parallel_tool_calls",
            "reasoning",
        )
        if key in entry
    }


def _profile(config, model_ref: str):
    if not model_ref.startswith("compat:"):
        return None
    compat = getattr(config, "openai_compatible", None)
    return (getattr(compat, "model_profiles", {}) or {}).get(
        model_ref.removeprefix("compat:")
    )


def _fact_text(config, model_ref: str, latency_ms: int | None) -> str:
    facts: list[str] = []
    profile = _profile(config, model_ref)
    entry = seed_entry(model_ref, config)
    if profile is not None:
        facts.append(
            f"context {profile.total_window_tokens:,}; max output "
            f"{profile.max_output_tokens:,}"
        )
        compat = getattr(config, "openai_compatible", None)
        dialect = getattr(compat, "reasoning_dialect", None)
        if dialect and dialect != "none":
            current = getattr(getattr(config, "agents", None), "thinking_mode", None)
            facts.append(f"reasoning control {dialect} ({current or 'configured default'})")
    elif ":" not in model_ref:
        budget = CODEX_MODEL_INPUT_BUDGETS.get(model_ref)
        if budget:
            facts.append(f"configured input context {budget:,}")
    reasoning = entry.get("reasoning") or {}
    if reasoning.get("dialect") and reasoning.get("direct_api_verified") is False:
        facts.append(
            f"unconfirmed endpoint capability (catalogue-declared): {reasoning['dialect']}"
        )
    if latency_ms is not None:
        facts.append(f"measured p50 {latency_ms:,} ms")
    return "; ".join(facts)


def render_spawn_model_guidance(
    config, choices: list[str], usage_rollup=None
) -> tuple[str, str]:
    """Render both surfaces; choice order is the operator's ranking."""
    authored = getattr(getattr(config, "agents", None), "model_selection_hints", {}) or {}
    latency = usage_rollup.model_latency_p50(choices) if usage_rollup is not None else {}
    clause_lines: list[str] = []
    property_lines: list[str] = []
    for model in choices:
        profile = _profile(config, model)
        entry = seed_entry(model, config)
        hint = authored.get(model)
        operator_authored = bool(hint)
        authority = "operator hint"
        if not hint and profile is not None:
            hint = getattr(profile, "selection_hint", None)
            authority = "profile operator hint"
        if not hint:
            hint = entry.get("hint") or entry.get("hint_derived")
            authority = f"catalogue seed as of {entry.get('as_of', CATALOGUE_AS_OF)}"
        parts: list[str] = []
        if hint:
            parts.append(f"{authority}: {hint}")
        facts = _fact_text(config, model, latency.get(model))
        if facts:
            parts.append(f"facts: {facts}")
        # A model without a matching catalogue record may still have useful
        # configured profile facts.  Facts are not a selection recommendation,
        # so make the missing operator guidance explicit rather than silently
        # presenting those facts as one.
        if (
            not entry
            and parts
            and not operator_authored
            and not getattr(profile, "selection_hint", None)
        ):
            parts.append("add an operator hint")
        fallback = "; ".join(parts) if parts else "facts only; add an operator hint"
        clause_lines.append(
            f"{model}: "
            f"{fallback if operator_authored else entry.get('clause_hint') or fallback}"
        )
        property_lines.append(
            f"{model}: "
            f"{fallback if operator_authored else entry.get('property_hint') or fallback}"
        )
    clause_listing = " | ".join(clause_lines)
    property_listing = " | ".join(property_lines)
    clause = (
        " Set 'model' to select a permitted model. Models are listed in the operator's "
        "preferred order; that order is the ranking. "
        + clause_listing
        + ". Omit to use the configured agent model."
    )
    prop = (
        "Optional permitted model. Operator preference order is meaningful. "
        + property_listing
        + ". Omit to inherit the configured agent model."
    )
    return clause, prop
