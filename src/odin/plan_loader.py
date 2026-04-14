"""Load plans from YAML, JSON strings, or Python dicts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from src.odin.types import PlanSpec, StepSpec


def load_plan(source: str | Path | dict[str, Any]) -> PlanSpec:
    """Load a plan from a file path, JSON string, or dict.

    Raises ``ValueError`` on invalid input.
    """
    if isinstance(source, dict):
        return _dict_to_plan(source)

    if isinstance(source, Path) or (
        isinstance(source, str) and not source.lstrip().startswith("{")
    ):
        path = Path(source)
        if path.exists():
            import yaml  # optional dep

            data = yaml.safe_load(path.read_text())
            return _dict_to_plan(data)

    # Try JSON string
    if isinstance(source, str):
        try:
            data = json.loads(source)
            return _dict_to_plan(data)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Cannot parse plan: {exc}") from exc

    raise ValueError(f"Unsupported plan source type: {type(source)}")


def _dict_to_plan(data: dict[str, Any]) -> PlanSpec:
    if "name" not in data:
        raise ValueError("Plan must have a 'name' field")
    if "steps" not in data or not data["steps"]:
        raise ValueError("Plan must have a non-empty 'steps' field")

    steps: list[StepSpec] = []
    for raw in data["steps"]:
        if "id" not in raw or "tool" not in raw:
            raise ValueError(f"Step must have 'id' and 'tool': {raw}")
        deps = raw.get("depends_on", ())
        if isinstance(deps, str):
            deps = (deps,)
        else:
            deps = tuple(deps)
        steps.append(
            StepSpec(
                id=raw["id"],
                tool=raw["tool"],
                params=raw.get("params", {}),
                depends_on=deps,
                timeout=float(raw.get("timeout", 30)),
                retries=int(raw.get("retries", 0)),
                continue_on_failure=bool(raw.get("continue_on_failure", False)),
            )
        )

    return PlanSpec(
        name=data["name"],
        steps=tuple(steps),
        description=data.get("description", ""),
    )
