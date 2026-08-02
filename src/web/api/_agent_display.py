"""Truthful model/effort display policy for agent operator surfaces.

An agent's model and reasoning effort can come from three different places,
and conflating them produces a confident lie the moment live config moves:

* what actually RAN (response provenance retained on ``AgentInfo``),
* what the spawn explicitly ASKED FOR (per-spawn overrides), and
* what an inheriting agent WOULD use right now (live config).

So every value carries a ``source`` describing which of those it is (settled
with Odin, 2026-08-02) rather than overloading one word like "effective".
The two axes are resolved INDEPENDENTLY — a spawn that pinned only the model
leaves effort inheriting live config, and saying otherwise would be the same
class of lie this module exists to prevent — and the pair reports the
strongest source backing either value.

``last_execution``
    The agent has executed at least once; values come from response
    provenance. A field the provider did not report stays ``unknown`` — the
    absence is not evidence about configuration.
``spawn_override_pending``
    Nothing has executed yet and the spawn pinned this axis: the REQUESTED
    policy, not proof of execution.
``current_inheritance``
    Nothing has executed yet and this axis inherits, so the value reflects
    live config AT THIS MOMENT and may still change. The UI qualifies it
    ("inherit (currently X)").
``unknown``
    Nothing executed and nothing resolvable.

Effort semantics are PROVIDER-scoped: only the Codex path sends reasoning
effort, so Ollama/Kimi report ``"N/A"`` (inapplicable). A Codex execution
that simply did not report an effort is ``"unknown"`` — never ``N/A``, which
would claim the concept does not apply when in fact we just don't know.
"""
from __future__ import annotations

# Providers whose request path carries no reasoning-effort concept at all.
_EFFORTLESS_PROVIDERS = frozenset({"ollama", "kimi"})

UNKNOWN = ""
NOT_APPLICABLE = "N/A"


def _cfg(bot, section: str):
    return getattr(getattr(bot, "config", None), section, None)


def _active_provider(bot) -> str:
    provider_cfg = _cfg(bot, "llm_provider")
    return getattr(provider_cfg, "active_provider", "codex") or "codex"


def _provider_has_effort(provider: str) -> bool:
    return bool(provider) and provider not in _EFFORTLESS_PROVIDERS


def _live_model(bot, provider: str) -> str:
    """The model an inheriting agent would use right now, for the ACTIVE
    provider. Only Codex has an agent-scoped model axis; the others pin one
    model per provider and ignore agent overrides entirely."""
    if provider == "ollama":
        return getattr(_cfg(bot, "ollama"), "model", "") or ""
    if provider == "kimi":
        return getattr(_cfg(bot, "kimi"), "model", "") or ""
    codex = _cfg(bot, "openai_codex")
    raw = getattr(codex, "agent_model", None)
    agent_model = (str(raw).strip() or None) if raw else None
    if agent_model == "auto":  # per-spawn policy, never a displayable value
        agent_model = None
    return agent_model or (getattr(codex, "model", "") or "")


def _live_effort(bot, provider: str) -> str:
    if not _provider_has_effort(provider):
        return NOT_APPLICABLE
    codex = _cfg(bot, "openai_codex")
    raw = getattr(codex, "agent_reasoning_effort", None)
    effort = (str(raw).strip() or None) if raw else None
    if effort == "auto":
        effort = None
    return effort or (getattr(codex, "reasoning_effort", "") or UNKNOWN)


def _executed(info) -> bool:
    """Whether a generation has actually completed for this agent.

    An explicit marker, because provenance fields can legitimately be empty
    on a response — treating a missing model as "never executed" would fall
    back to live config and present it as history.
    """
    return bool(getattr(info, "has_executed", False))


def agent_display_policy(info, bot) -> dict:
    """Display model/effort for one agent, with the source of each value.

    Returns ``{display_model, display_reasoning_effort, display_source,
    display_model_source, display_reasoning_effort_source}``. The per-axis
    sources are authoritative; ``display_source`` summarises the pair for
    compact surfaces (strongest backing either axis).
    """
    provider = _active_provider(bot)

    if _executed(info):
        # Execution happened: report it, including what the provider did not
        # tell us. Never substitute configuration for missing provenance.
        exec_provider = getattr(info, "last_provider", "") or ""
        model = getattr(info, "last_model", "") or UNKNOWN
        effort = getattr(info, "last_reasoning_effort", None)
        if effort:
            effort_display = effort
        elif exec_provider and not _provider_has_effort(exec_provider):
            # The provider that actually ran has no effort concept.
            effort_display = NOT_APPLICABLE
        else:
            effort_display = UNKNOWN
        return {
            "display_model": model,
            "display_reasoning_effort": effort_display,
            "display_source": "last_execution",
            "display_model_source": "last_execution",
            "display_reasoning_effort_source": "last_execution",
        }

    # Nothing has executed. Resolve each axis on its own merits.
    model_override = getattr(info, "model_override", None)
    effort_override = getattr(info, "reasoning_effort_override", None)
    # Per-spawn overrides are a Codex-path concept; under another provider
    # they are inert, so displaying them would advertise a policy execution
    # will ignore.
    overrides_apply = provider not in _EFFORTLESS_PROVIDERS

    if overrides_apply and model_override:
        model, model_source = model_override, "spawn_override_pending"
    else:
        model = _live_model(bot, provider)
        model_source = "current_inheritance" if model else "unknown"

    if not _provider_has_effort(provider):
        effort, effort_source = NOT_APPLICABLE, "current_inheritance"
    elif overrides_apply and effort_override:
        effort, effort_source = effort_override, "spawn_override_pending"
    else:
        effort = _live_effort(bot, provider)
        effort_source = "current_inheritance" if effort else "unknown"

    if model_source == "unknown" and effort_source == "unknown":
        summary = "unknown"
    elif "spawn_override_pending" in (model_source, effort_source):
        summary = "spawn_override_pending"
    else:
        summary = "current_inheritance"
    return {
        "display_model": model,
        "display_reasoning_effort": effort,
        "display_source": summary,
        "display_model_source": model_source,
        "display_reasoning_effort_source": effort_source,
    }
