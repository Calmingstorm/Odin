"""Code-owned classification of whether a tool can change external state.

This is deliberately separate from risk classification.  A low-risk or
idempotent tool can still have an externally visible effect, and dynamic or
unknown tools must fail closed as effect-capable.
"""

from __future__ import annotations


class ToolEffectClass:
    EFFECT_FREE_OBSERVATION = "EFFECT_FREE_OBSERVATION"
    EXTERNAL_EFFECT_CAPABLE = "EXTERNAL_EFFECT_CAPABLE"

    ALL = frozenset({EFFECT_FREE_OBSERVATION, EXTERNAL_EFFECT_CAPABLE})


# Inclusion requires auditing the handler's complete behavior, including
# cancellation.  Keep this intentionally small and code-owned.
_EFFECT_FREE_OBSERVATION_TOOLS = frozenset({"wait_for_agents"})


def classify_tool_effect(tool_name: str, tool_input: dict | None = None) -> str:
    """Return the persisted effect class for one effective invocation.

    ``tool_input`` is accepted because future classifiers may need to narrow a
    handler to specific observation-only actions.  Callers cannot provide the
    returned class through tool input.  Every unknown/dynamic tool defaults to
    external-effect-capable.
    """
    del tool_input
    if tool_name in _EFFECT_FREE_OBSERVATION_TOOLS:
        return ToolEffectClass.EFFECT_FREE_OBSERVATION
    return ToolEffectClass.EXTERNAL_EFFECT_CAPABLE


def normalize_effect_class(value: object) -> str:
    """Normalize persisted/untrusted values with an effect-capable fallback."""
    if value == ToolEffectClass.EFFECT_FREE_OBSERVATION:
        return ToolEffectClass.EFFECT_FREE_OBSERVATION
    return ToolEffectClass.EXTERNAL_EFFECT_CAPABLE


def effect_free_observation_tools() -> frozenset[str]:
    """Exact audited names used by the one-time legacy reconciliation."""
    return _EFFECT_FREE_OBSERVATION_TOOLS
