"""Truthful model/effort display policy for agent operator surfaces.

An agent's model and reasoning effort can come from three different places,
and conflating them produces a confident lie the moment live config moves:

* what actually RAN (response provenance retained on ``AgentInfo``),
* what the spawn explicitly ASKED FOR (per-spawn overrides), and
* what an inheriting agent WOULD use right now (live config).

So every display value carries a ``source`` describing which of those it is
(settled with Odin, 2026-08-02) rather than overloading one word like
"effective":

``last_execution``
    At least one generation completed; these are the values the most recent
    request actually executed on. The only historical truth available.
``spawn_override_pending``
    Nothing has executed yet, but the spawn pinned an explicit override —
    this is the REQUESTED policy, not proof of execution.
``current_inheritance``
    Nothing has executed yet and the agent inherits: the value reflects live
    config AT THIS MOMENT and may change before the first generation. The UI
    qualifies it ("inherit (currently X)").
``unknown``
    Nothing executed and nothing resolvable.

Providers without reasoning-effort semantics report ``"N/A"`` for effort —
never "unknown", which would imply a value we failed to find.
"""
from __future__ import annotations


def _codex_cfg(bot):
    return getattr(getattr(bot, "config", None), "openai_codex", None)


def _active_provider(bot) -> str:
    provider_cfg = getattr(getattr(bot, "config", None), "llm_provider", None)
    return getattr(provider_cfg, "active_provider", "codex") or "codex"


def _live_agent_model(bot) -> str:
    """The model an inheriting agent would use right now (agent_model ?? model;
    "auto" is per-spawn policy and resolves to the main model)."""
    codex = _codex_cfg(bot)
    raw = getattr(codex, "agent_model", None)
    agent_model = (str(raw).strip() or None) if raw else None
    if agent_model == "auto":
        agent_model = None
    return agent_model or (getattr(codex, "model", "") or "")


def _live_agent_effort(bot) -> str:
    codex = _codex_cfg(bot)
    raw = getattr(codex, "agent_reasoning_effort", None)
    effort = (str(raw).strip() or None) if raw else None
    if effort == "auto":
        effort = None
    return effort or (getattr(codex, "reasoning_effort", "") or "")


def agent_display_policy(info, bot) -> dict:
    """Display model/effort for one agent, with the source of each value.

    Returns ``{display_model, display_reasoning_effort, display_source}``.
    Both values always share ONE source: mixing "what ran" with "what config
    says now" in a single row is exactly the confusion this avoids.
    """
    last_model = getattr(info, "last_model", "") or ""
    if last_model:
        effort = getattr(info, "last_reasoning_effort", None)
        return {
            "display_model": last_model,
            # A provider that ignores reasoning effort reports N/A rather
            # than an absence the reader would have to interpret.
            "display_reasoning_effort": effort or "N/A",
            "display_source": "last_execution",
        }

    model_override = getattr(info, "model_override", None)
    effort_override = getattr(info, "reasoning_effort_override", None)
    if model_override or effort_override:
        return {
            "display_model": model_override or _live_agent_model(bot),
            "display_reasoning_effort": effort_override or _live_agent_effort(bot) or "N/A",
            "display_source": "spawn_override_pending",
        }

    # Nothing executed, nothing pinned: report live config, explicitly flagged
    # as inheritance so the UI can qualify it.
    if _active_provider(bot) != "codex":
        # Non-Codex providers pin their own model and ignore effort entirely.
        return {
            "display_model": _live_agent_model(bot),
            "display_reasoning_effort": "N/A",
            "display_source": "current_inheritance" if _live_agent_model(bot) else "unknown",
        }
    model = _live_agent_model(bot)
    effort = _live_agent_effort(bot)
    if not model and not effort:
        return {
            "display_model": "",
            "display_reasoning_effort": "",
            "display_source": "unknown",
        }
    return {
        "display_model": model,
        "display_reasoning_effort": effort or "N/A",
        "display_source": "current_inheritance",
    }
