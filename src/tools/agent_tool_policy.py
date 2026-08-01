"""Config-conditional exposure of the per-spawn agent model/effort catalogue.

Each agent axis (model, reasoning) is independently one of three modes derived
from its config value (``config.schema.agent_axis_mode``):

* ``inherit`` (null) / ``fixed`` (a set value) — the operator has decided; the
  spawner must NOT be offered a per-spawn choice, so the axis's field and its
  capability clause are OMITTED from the spawn_agent / spawn_loop_agents schema.
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
from .defs.agents import (
    SPAWN_AGENT_BASE_DESC,
    SPAWN_EFFORT_CLAUSE,
    SPAWN_EFFORT_OPTIONS,
    SPAWN_LOOP_BASE_DESC,
    SPAWN_MODEL_CLAUSE,
    spawn_effort_clause,
)

_SPAWN_TOOLS = ("spawn_agent", "spawn_loop_agents")


def agent_axis_modes(config) -> tuple[str, str]:
    """Return ``(model_mode, effort_mode)`` for the live agent config axes."""
    codex = getattr(config, "openai_codex", None)
    return (
        agent_axis_mode(getattr(codex, "agent_model", None)),
        agent_axis_mode(getattr(codex, "agent_reasoning_effort", None)),
    )


def _spawn_properties(tool: dict) -> dict:
    """The properties container the per-spawn fields live in: top-level for
    spawn_agent, ``tasks.items.properties`` for spawn_loop_agents."""
    schema = tool["input_schema"]
    if tool["name"] == "spawn_loop_agents":
        return schema["properties"]["tasks"]["items"]["properties"]
    return schema["properties"]


# get_tool_definitions() appends an affordances annotation to every description
# ("\n\n[affordances: ...]"); the catalog conditions the ALREADY-annotated defs,
# so the suffix must be carried through when the content is rebuilt.
_AFFORDANCES_MARKER = "\n\n[affordances:"


def _condition_spawn_tool(
    tool: dict,
    *,
    model_auto: bool,
    effort_auto: bool,
    allowed_efforts: list[str] | None = None,
) -> None:
    """Mutate a CLONED spawn tool in place: keep each axis's field + clause only
    when that axis is auto. The affordances suffix (added by
    ``get_tool_definitions``) is preserved.

    ``allowed_efforts`` (only meaningful with ``effort_auto``) narrows the
    exposed effort enum + clause to what the CONCRETE agent model can serve —
    None means unfiltered (the static catalogue). An empty list omits the
    field and clause entirely: an empty JSON-Schema enum is unsatisfiable and
    worse than offering nothing.
    """
    current = tool.get("description", "")
    marker_idx = current.find(_AFFORDANCES_MARKER)
    affordances = current[marker_idx:] if marker_idx != -1 else ""
    base = SPAWN_AGENT_BASE_DESC if tool["name"] == "spawn_agent" else SPAWN_LOOP_BASE_DESC
    expose_effort = effort_auto and allowed_efforts != []
    desc = base
    if model_auto:
        desc += SPAWN_MODEL_CLAUSE
    if expose_effort:
        desc += (
            SPAWN_EFFORT_CLAUSE
            if allowed_efforts is None
            else spawn_effort_clause(allowed_efforts)
        )
    tool["description"] = desc + affordances
    props = _spawn_properties(tool)
    if not model_auto:
        props.pop("model", None)
    if not expose_effort:
        props.pop("reasoning_effort", None)
    elif allowed_efforts is not None:
        props["reasoning_effort"]["enum"] = list(allowed_efforts)


def apply_agent_axis_policy(defs: list[dict], config) -> list[dict]:
    """Return ``defs`` with spawn_agent / spawn_loop_agents replaced by clones
    whose per-spawn model/effort fields + clauses are present only for an axis
    in ``auto`` mode. All other tools pass through by reference.

    When BOTH axes are auto the input list is returned unchanged (the static
    definitions already carry both fields — the canonical exposed form)."""
    model_mode, effort_mode = agent_axis_modes(config)
    model_auto = model_mode == "auto"
    effort_auto = effort_mode == "auto"
    if model_auto and effort_auto:
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
    if effort_auto and not model_auto:
        codex = getattr(config, "openai_codex", None)
        raw = getattr(codex, "agent_model", None)
        agent_model = (str(raw).strip() or None) if raw else None
        resolved_model = agent_model or getattr(codex, "model", None)
        filtered = [
            effort
            for effort in SPAWN_EFFORT_OPTIONS
            if not model_rejects_effort(resolved_model, effort)
        ]
        if filtered != SPAWN_EFFORT_OPTIONS:
            allowed_efforts = filtered
    out: list[dict] = []
    for tool in defs:
        if tool.get("name") not in _SPAWN_TOOLS:
            out.append(tool)
            continue
        clone = copy.deepcopy(tool)
        _condition_spawn_tool(
            clone,
            model_auto=model_auto,
            effort_auto=effort_auto,
            allowed_efforts=allowed_efforts,
        )
        out.append(clone)
    return out
