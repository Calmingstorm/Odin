"""Execution context for cross-step variable resolution."""

from __future__ import annotations

import copy
import re
from typing import Any

from src.odin.types import StepResult

# Pattern matching ${step_id.output} or ${step_id.output.key}
_REF_PATTERN = re.compile(r"\$\{([^}]+)\}")


class ExecutionContext:
    """Shared state across all steps in a plan execution.

    Stores step results and resolves ``${step_id.output}`` references
    inside parameter dicts before each step runs.
    """

    def __init__(self) -> None:
        self._results: dict[str, StepResult] = {}

    def record(self, result: StepResult) -> None:
        self._results[result.step_id] = result

    def get(self, step_id: str) -> StepResult | None:
        return self._results.get(step_id)

    def resolve_params(self, params: dict[str, Any]) -> dict[str, Any]:
        """Deep-copy *params* and substitute ``${ref}`` references."""
        return self._resolve(copy.deepcopy(params))

    # ------------------------------------------------------------------

    def _resolve(self, obj: Any) -> Any:
        if isinstance(obj, str):
            return self._resolve_string(obj)
        if isinstance(obj, dict):
            return {k: self._resolve(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self._resolve(v) for v in obj]
        return obj

    def _resolve_string(self, value: str) -> Any:
        # Full-value reference: "${step.output}" → return raw object
        m = _REF_PATTERN.fullmatch(value)
        if m:
            return self._lookup(m.group(1))

        # Embedded references: "prefix_${step.output}_suffix"
        def _replace(m: re.Match) -> str:
            return str(self._lookup(m.group(1)))

        return _REF_PATTERN.sub(_replace, value)

    def _lookup(self, path: str) -> Any:
        parts = path.split(".")
        if len(parts) < 2:
            raise KeyError(f"Invalid reference: ${{{path}}}")
        step_id = parts[0]
        result = self._results.get(step_id)
        if result is None:
            raise KeyError(f"Step '{step_id}' not found in context")
        # parts[1] should be "output"
        obj: Any = result.output
        for part in parts[2:]:
            if isinstance(obj, dict):
                obj = obj[part]
            elif isinstance(obj, list):
                obj = obj[int(part)]
            else:
                obj = getattr(obj, part)
        return obj
