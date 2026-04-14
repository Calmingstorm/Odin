"""Execution context for cross-step variable resolution."""

from __future__ import annotations

import copy
import re
from typing import Any

from src.odin.types import StepResult

# ${step_id.output} or ${step_id.output.key}
_DOLLAR_REF = re.compile(r"\$\{([^}]+)\}")
# {steps.step_id.output} or {steps.step_id.output.key}
_STEPS_REF = re.compile(r"(?<!\$)\{steps\.([^}]+)\}")
# Combined: matches either syntax
_ANY_REF = re.compile(r"\$\{([^}]+)\}|(?<!\$)\{steps\.([^}]+)\}")

# Fields on StepResult that can be accessed via the second path segment.
_RESULT_FIELDS = frozenset({"output", "status", "error", "duration", "attempts"})


class ExecutionContext:
    """Shared state across all steps in a plan execution.

    Stores step results and resolves placeholder references inside
    parameter dicts before each step runs.

    Supported syntaxes (equivalent)::

        ${step_id.output}            — original short form
        ${step_id.output.key}        — nested key access
        {steps.step_id.output}       — explicit ``steps.`` prefix form
        {steps.step_id.output.key}   — nested key with prefix form

    Accessible fields: ``output``, ``status``, ``error``, ``duration``,
    ``attempts``.  When the field segment is omitted the default is
    ``output`` for backwards compatibility.
    """

    def __init__(self) -> None:
        self._results: dict[str, StepResult] = {}

    def record(self, result: StepResult) -> None:
        self._results[result.step_id] = result

    def get(self, step_id: str) -> StepResult | None:
        return self._results.get(step_id)

    def resolve_params(self, params: dict[str, Any]) -> dict[str, Any]:
        """Deep-copy *params* and substitute placeholder references."""
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
        # Full-value reference (either syntax) → return raw object
        m_dollar = _DOLLAR_REF.fullmatch(value)
        if m_dollar:
            return self._lookup(m_dollar.group(1))
        m_steps = _STEPS_REF.fullmatch(value)
        if m_steps:
            return self._lookup(m_steps.group(1))

        # Embedded references: "prefix_${step.output}_suffix"
        def _replace(m: re.Match) -> str:
            path = m.group(1) or m.group(2)
            return str(self._lookup(path))

        result = _ANY_REF.sub(_replace, value)
        return result

    def _lookup(self, path: str) -> Any:
        parts = path.split(".")
        if len(parts) < 2:
            raise KeyError(f"Invalid reference '${{{path}}}': need at least step_id.field")

        step_id = parts[0]
        result = self._results.get(step_id)
        if result is None:
            raise KeyError(f"Reference error: step '{step_id}' not found in context")

        # Determine which field to access on StepResult
        field = parts[1]
        if field in _RESULT_FIELDS:
            obj: Any = getattr(result, field)
            rest = parts[2:]
        else:
            # Backwards compat: treat as implicit "output" and start
            # drilling from parts[1] into the output object.
            obj = result.output
            rest = parts[1:]

        for i, part in enumerate(rest):
            traversed = ".".join(parts[: 2 + i])
            try:
                if isinstance(obj, dict):
                    obj = obj[part]
                elif isinstance(obj, list):
                    obj = obj[int(part)]
                else:
                    obj = getattr(obj, part)
            except (KeyError, IndexError, TypeError, ValueError, AttributeError) as exc:
                raise KeyError(
                    f"Reference error: cannot resolve '{part}' "
                    f"in '${{{path}}}' (after '{traversed}'): {exc}"
                ) from exc
        return obj
