"""Load PlanSpec from dict, JSON string, or YAML file."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from src.odin.planner import PlanValidationError
from src.odin.types import PlanSpec, StepSpec


def load_plan(source: str | dict[str, Any]) -> PlanSpec:
    if isinstance(source, dict):
        return _from_dict(source)

    if not isinstance(source, str):
        raise PlanValidationError([f"expected dict or str, got {type(source).__name__}"])
    source = source.strip()
    try:
        if source.startswith(("{", "[")):
            data = json.loads(source)
        else:
            path = Path(source)
            if path.suffix in (".yml", ".yaml"):
                try:
                    import yaml
                except ImportError as exc:
                    raise PlanValidationError(["PyYAML required for YAML plans"]) from exc
                try:
                    data = yaml.safe_load(path.read_text())
                except yaml.YAMLError as exc:
                    raise PlanValidationError([f"could not parse YAML plan: {exc}"]) from exc
            elif path.suffix == ".json":
                data = json.loads(path.read_text())
            else:
                raise PlanValidationError([f"unsupported plan file format: {path.suffix}"])
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise PlanValidationError([f"could not load plan: {exc}"]) from exc
    return _from_dict(data)


def _from_dict(data: Any) -> PlanSpec:
    if not isinstance(data, dict):
        raise PlanValidationError(["plan must be an object"])
    errors: list[str] = []
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        errors.append("plan must have a nonempty 'name'")
    raw_steps = data.get("steps")
    if not isinstance(raw_steps, list) or not raw_steps:
        errors.append("plan must have at least one step (a nonempty list)")
        raw_steps = []
    description = data.get("description", "")
    if not isinstance(description, str):
        errors.append("description must be a string")
    inputs = data.get("inputs", {})
    if not isinstance(inputs, dict):
        errors.append("inputs must be an object")

    steps = []
    for index, s in enumerate(raw_steps):
        prefix = f"step {index + 1}"
        if not isinstance(s, dict):
            errors.append(f"{prefix} must be an object")
            continue
        step_errors: list[str] = []
        step_id = s.get("id")
        tool = s.get("tool")
        if not isinstance(step_id, str) or not step_id.strip():
            step_errors.append(f"{prefix}: id must be a nonempty string")
        if not isinstance(tool, str) or not tool.strip():
            step_errors.append(f"{prefix}: tool must be a nonempty string")
        params = s.get("params", {})
        if not isinstance(params, dict):
            step_errors.append(f"{prefix}: params must be an object")
        deps = s.get("depends_on", [])
        if isinstance(deps, str):
            deps = [deps]
        if not isinstance(deps, list) or any(not isinstance(d, str) or not d for d in deps):
            step_errors.append(f"{prefix}: depends_on must be a string or list of strings")
        timeout = s.get("timeout", 30)
        if (isinstance(timeout, bool) or not isinstance(timeout, (int, float))
                or not math.isfinite(timeout) or timeout <= 0):
            step_errors.append(f"{prefix}: timeout must be a positive finite number")
        retries = s.get("retries", 0)
        if isinstance(retries, bool) or not isinstance(retries, int) or retries < 0:
            step_errors.append(f"{prefix}: retries must be a nonnegative integer")
        continue_on_failure = s.get("continue_on_failure", False)
        if not isinstance(continue_on_failure, bool):
            step_errors.append(f"{prefix}: continue_on_failure must be a boolean")
        when = s.get("when")
        if when is not None and not isinstance(when, str):
            step_errors.append(f"{prefix}: when must be a string")
        errors.extend(step_errors)
        if step_errors:
            continue
        assert isinstance(step_id, str) and isinstance(tool, str)
        steps.append(
            StepSpec(
                id=step_id,
                tool=tool,
                params=params,
                depends_on=tuple(deps),
                timeout=float(timeout),
                retries=retries,
                continue_on_failure=continue_on_failure,
                when=when,
            )
        )

    if errors:
        raise PlanValidationError(errors)
    assert isinstance(name, str)
    return PlanSpec(
        name=name,
        steps=tuple(steps),
        description=description,
        inputs=inputs,
    )
