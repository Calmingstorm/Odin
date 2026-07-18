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

from ..config.schema import agent_axis_mode
from .defs.agents import (
    SPAWN_AGENT_BASE_DESC,
    SPAWN_EFFORT_CLAUSE,
    SPAWN_LOOP_BASE_DESC,
    SPAWN_MODEL_CLAUSE,
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


def _condition_spawn_tool(tool: dict, *, model_auto: bool, effort_auto: bool) -> None:
    """Mutate a CLONED spawn tool in place: keep each axis's field + clause only
    when that axis is auto. The affordances suffix (added by
    ``get_tool_definitions``) is preserved."""
    current = tool.get("description", "")
    marker_idx = current.find(_AFFORDANCES_MARKER)
    affordances = current[marker_idx:] if marker_idx != -1 else ""
    base = SPAWN_AGENT_BASE_DESC if tool["name"] == "spawn_agent" else SPAWN_LOOP_BASE_DESC
    desc = base
    if model_auto:
        desc += SPAWN_MODEL_CLAUSE
    if effort_auto:
        desc += SPAWN_EFFORT_CLAUSE
    tool["description"] = desc + affordances
    props = _spawn_properties(tool)
    if not model_auto:
        props.pop("model", None)
    if not effort_auto:
        props.pop("reasoning_effort", None)


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
    out: list[dict] = []
    for tool in defs:
        if tool.get("name") not in _SPAWN_TOOLS:
            out.append(tool)
            continue
        clone = copy.deepcopy(tool)
        _condition_spawn_tool(clone, model_auto=model_auto, effort_auto=effort_auto)
        out.append(clone)
    return out
