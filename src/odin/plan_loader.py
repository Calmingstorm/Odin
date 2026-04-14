"""Load PlanSpec from dict, JSON string, or YAML file."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from odin.types import PlanSpec, StepSpec


def load_plan(source: str | dict[str, Any]) -> PlanSpec:
    if isinstance(source, dict):
        return _from_dict(source)

    # Try JSON string
    if isinstance(source, str):
        source = source.strip()
        if source.startswith("{"):
            return _from_dict(json.loads(source))

        # File path
        path = Path(source)
        if path.suffix in (".yml", ".yaml"):
            try:
                import yaml
            except ImportError as exc:
                raise ImportError("PyYAML required for YAML plans") from exc
            data = yaml.safe_load(path.read_text())
            return _from_dict(data)
        elif path.suffix == ".json":
            data = json.loads(path.read_text())
            return _from_dict(data)
        else:
            raise ValueError(f"unsupported plan file format: {path.suffix}")

    raise TypeError(f"expected dict or str, got {type(source).__name__}")


def _from_dict(data: dict[str, Any]) -> PlanSpec:
    if "name" not in data:
        raise ValueError("plan must have a 'name'")
    if "steps" not in data or not data["steps"]:
        raise ValueError("plan must have at least one step")

    steps = []
    for s in data["steps"]:
        deps = s.get("depends_on", [])
        if isinstance(deps, str):
            deps = [deps]
        steps.append(
            StepSpec(
                id=s["id"],
                tool=s["tool"],
                params=s.get("params", {}),
                depends_on=tuple(deps),
                timeout=float(s.get("timeout", 30)),
                retries=int(s.get("retries", 0)),
                continue_on_failure=bool(s.get("continue_on_failure", False)),
            )
        )

    return PlanSpec(
        name=data["name"],
        steps=tuple(steps),
        description=data.get("description", ""),
        inputs=data.get("inputs", {}),
    )
