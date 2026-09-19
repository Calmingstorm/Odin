"""Config-conditional exposure of the per-spawn agent model/effort catalogue.

Each agent axis (model, reasoning) is independently one of three modes derived
from its config value (``config.schema.agent_axis_mode``):

* ``inherit`` (null) / ``fixed`` (a set value) — the operator has decided; the
  spawner must NOT be offered a per-spawn choice, so the axis's field and its
  capability clause are OMITTED from the spawn_agent schema.
* ``auto`` (the ``AGENT_SETTING_AUTO`` sentinel) — the operator delegated the
  choice, so the axis's field + clause ARE exposed and the spawner selects per
  task.

The two axes are independent (fixed model + auto reasoning exposes only
``reasoning_effort``, and vice-versa). This runs at tool-catalog build time on
DEEP CLONES — the shared static tool definitions and the ``get_tool_definitions``
cache are never mutated in place.
"""

from __future__ import annotations

import copy

from ..config.schema import agent_axis_mode, model_rejects_effort
from ..llm.model_ref import parse_model_ref
from .defs.agents import (
    SPAWN_AGENT_BASE_DESC,
    SPAWN_EFFORT_CLAUSE,
    SPAWN_EFFORT_OPTIONS,
    SPAWN_MODEL_CLAUSE,
    SPAWN_THINKING_CLAUSE,
    spawn_effort_clause,
    spawn_effort_property_desc,
)

_SPAWN_TOOLS = ("spawn_agent",)


def effective_agent_model_choices(config) -> list[str]:
    """Finite model set advertised by, and admitted at, spawn."""
    configured = list(getattr(getattr(config, "agents", None), "auto_model_allowlist", []) or [])
    if configured:
        return configured
    codex = getattr(config, "openai_codex", None)
    choices = [
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "gpt-6-astra",
        "gpt-5.4",
        "gpt-5.4-mini",
    ]
    main = getattr(codex, "model", None)
    if main:
        rendered = parse_model_ref(main, allow_auto=False).render()
        if rendered and rendered not in choices:
            choices.append(rendered)
    return choices


def apply_agent_limits(defs: list[dict], config) -> list[dict]:
    """Render limits from live enforcement config, on clones after axis policy."""
    agents = config.agents
    static = "Max 5/channel; lifetime limit for NEW agents: 14400 seconds."
    live = (
        f"Max {agents.max_concurrent_agents}/channel; lifetime limit for NEW agents: "
        f"{agents.max_lifetime_seconds} seconds."
    )
    out = []
    for tool in defs:
        if tool.get("name") == "spawn_agent":
            tool = copy.deepcopy(tool)
            tool["description"] = tool["description"].replace(static, live)
        out.append(tool)
    return out


def agent_axis_modes(config) -> tuple[str, str]:
    """Return ``(model_mode, effort_mode)`` for the live agent config axes."""
    agents = getattr(config, "agents", None)
    codex = getattr(config, "openai_codex", None)
    # Small callers and old integrations may provide only the legacy Codex
    # section. Keep their read-only policy view valid during the migration.
    model_value = (
        getattr(agents, "model")
        if agents is not None and hasattr(agents, "model")
        else getattr(codex, "agent_model", None)
    )
    return (
        agent_axis_mode(model_value),
        agent_axis_mode(getattr(codex, "agent_reasoning_effort", None)),
    )


def _spawn_properties(tool: dict) -> dict:
    """Return the top-level spawn-agent properties container."""
    return tool["input_schema"]["properties"]


def _spawn_schema_object(tool: dict) -> dict:
    """Return the object schema that owns spawn-agent's ``required`` list."""
    return tool["input_schema"]


# get_tool_definitions() appends an affordances annotation to every description
# ("\n\n[affordances: ...]"); the catalog conditions the ALREADY-annotated defs,
# so the suffix must be carried through when the content is rebuilt.
_AFFORDANCES_MARKER = "\n\n[affordances:"


def _condition_spawn_tool(
    tool: dict,
    *,
    model_auto: bool,
    model_allowlist: list[str] | None = None,
    effort_auto: bool,
    allowed_efforts: list[str] | None = None,
    effort_required: bool = False,
    thinking_auto: bool = False,
    model_guidance: tuple[str, str] | None = None,
) -> None:
    """Mutate a CLONED spawn tool in place: keep each axis's field + clause only
    when that axis is auto. The affordances suffix (added by
    ``get_tool_definitions``) is preserved.

    ``allowed_efforts`` (only meaningful with ``effort_auto``) narrows the
    exposed effort enum + clause to what the CONCRETE agent model can serve —
    None means unfiltered (the static catalogue). An empty list omits the
    field and clause entirely: an empty JSON-Schema enum is unsatisfiable and
    worse than offering nothing. ``effort_required`` marks the field required
    and swaps the clause tail: when the concrete model rejects the INHERITED
    default, omission itself is an unservable spelling and must not remain a
    schema-valid, advertised choice.
    """
    current = tool.get("description", "")
    marker_idx = current.find(_AFFORDANCES_MARKER)
    affordances = current[marker_idx:] if marker_idx != -1 else ""
    base = SPAWN_AGENT_BASE_DESC
    expose_effort = effort_auto and allowed_efforts != []
    desc = base
    props = _spawn_properties(tool)
    if model_auto:
        desc += model_guidance[0] if model_guidance else SPAWN_MODEL_CLAUSE
        props["model"]["enum"] = list(model_allowlist or [])
        if model_guidance:
            props["model"]["description"] = model_guidance[1]
    if expose_effort:
        if allowed_efforts is None and not effort_required:
            desc += SPAWN_EFFORT_CLAUSE
        else:
            desc += spawn_effort_clause(
                SPAWN_EFFORT_OPTIONS if allowed_efforts is None else allowed_efforts,
                required=effort_required,
            )
    if thinking_auto:
        desc += SPAWN_THINKING_CLAUSE
    tool["description"] = desc + affordances
    if not model_auto:
        props.pop("model", None)
    if not expose_effort:
        props.pop("reasoning_effort", None)
    else:
        if allowed_efforts is not None:
            props["reasoning_effort"]["enum"] = list(allowed_efforts)
        if effort_required:
            schema_obj = _spawn_schema_object(tool)
            required = list(schema_obj.get("required", []))
            if "reasoning_effort" not in required:
                required.append("reasoning_effort")
            schema_obj["required"] = required
            # The FIELD-level description must agree with the required list
            # and the tool clause — the model reads all three while choosing.
            props["reasoning_effort"]["description"] = spawn_effort_property_desc(
                tool["name"], required=True
            )
    if not thinking_auto:
        props.pop("thinking_mode", None)


def apply_agent_axis_policy(defs: list[dict], config, *, usage_rollup=None) -> list[dict]:
    """Return ``defs`` with spawn_agent replaced by a clone
    whose per-spawn model/effort fields + clauses are present only for an axis
    in ``auto`` mode. All other tools pass through by reference.

    Both-auto still clones spawn_agent because its model enum is a runtime
    admission contract, not merely documentation."""
    model_mode, effort_mode = agent_axis_modes(config)
    model_auto = model_mode == "auto"
    effort_auto = effort_mode == "auto"
    compat = getattr(config, "openai_compatible", None)
    profiles = getattr(compat, "model_profiles", {}) or {}
    choices = effective_agent_model_choices(config) if model_auto else []
    from .model_hints import render_spawn_model_guidance

    model_guidance = (
        render_spawn_model_guidance(config, choices, usage_rollup) if model_auto else None
    )
    thinking_auto = getattr(getattr(config, "agents", None), "thinking_mode", None) is None and any(
        choice.startswith("compat:")
        and getattr(profiles.get(choice.removeprefix("compat:")), "reasoning_dialect", "none")
        == "thinking"
        for choice in choices
    )
    # Pre-migration narrow callers expose only openai_codex.  Preserve their
    # static definition identity; a real root Config always has agents and
    # therefore receives the finite dynamic enum below.
    if model_auto and effort_auto and getattr(config, "agents", None) is None:
        return defs
    # With the model axis NOT auto, the per-spawn model override is hard-
    # rejected at the spawn boundary, so every spawn runs the ONE concrete
    # model resolved from config (fixed agent_model, else the main model).
    # The exposed effort catalogue must therefore only offer efforts that
    # model can serve — a visible-but-unservable "max" costs the spawner a
    # guaranteed rejection round-trip. Model axis auto keeps the full enum:
    # the spawner picks the model, and the spawn boundary owns the pair.
    # Canonical option order, never a sorted set.
    allowed_efforts: list[str] | None = None
    effort_required = False
    if effort_auto and not model_auto:
        codex = getattr(config, "openai_codex", None)
        agents = getattr(config, "agents", None)
        raw = (
            getattr(agents, "model")
            if agents is not None and hasattr(agents, "model")
            else getattr(codex, "agent_model", None)
        )
        agent_model = (str(raw).strip() or None) if raw else None
        resolved_model = agent_model or getattr(codex, "model", None)
        filtered = [
            effort
            for effort in SPAWN_EFFORT_OPTIONS
            if not model_rejects_effort(resolved_model, effort)
        ]
        if filtered != SPAWN_EFFORT_OPTIONS:
            allowed_efforts = filtered
        # Omission inherits the MAIN effort at spawn time; when the concrete
        # model rejects that inherited default, omission is itself an
        # unservable spelling — the field must be REQUIRED so the schema stops
        # advertising a guaranteed rejection. Runtime semantics unchanged: the
        # spawn boundary still validates whatever arrives.
        effort_required = model_rejects_effort(
            resolved_model, getattr(codex, "reasoning_effort", None)
        )
    out: list[dict] = []
    for tool in defs:
        if tool.get("name") not in _SPAWN_TOOLS:
            out.append(tool)
            continue
        clone = copy.deepcopy(tool)
        _condition_spawn_tool(
            clone,
            model_auto=model_auto,
            model_allowlist=effective_agent_model_choices(config),
            effort_auto=effort_auto,
            allowed_efforts=allowed_efforts,
            effort_required=effort_required,
            thinking_auto=thinking_auto,
            model_guidance=model_guidance,
        )
        out.append(clone)
    return out
