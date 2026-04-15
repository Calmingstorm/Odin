"""Execution context for variable resolution in plan steps.

Supports two namespaces for interpolation:
  - Step results:  ${step_id.field.path}  or  {steps.step_id.field.path}
  - Plan inputs:   ${inputs.key.path}     or  {inputs.key.path}

Full-value references (the entire param value is a single placeholder) return
the raw object.  Embedded references (placeholder inside a larger string) are
stringified before substitution.
"""

from __future__ import annotations

import copy
import enum
import re
from typing import Any

from src.odin.types import StepResult


def _numeric_compare(left: str, right: str, fn) -> bool:
    """Try to compare *left* and *right* as numbers using *fn*.

    Returns ``False`` if either side cannot be parsed as a number.
    Supports ints and floats.
    """
    try:
        lv = int(left) if left.lstrip("-").isdigit() else float(left)
        rv = int(right) if right.lstrip("-").isdigit() else float(right)
    except (ValueError, ArithmeticError):
        return False
    return fn(lv, rv)


def _interpolation_str(value: Any) -> str:
    """Stringify a value for embedding in an interpolated string.

    Python's default ``str()`` produces representations that don't match what
    users naturally write in conditions/params (e.g. ``str(True)`` → ``"True"``
    instead of ``"true"``, ``str(SomeEnum.X)`` → ``"SomeEnum.X"`` instead of
    the enum *value*).  This helper normalises the common cases.
    """
    # bool must be checked before int (bool is a subclass of int)
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "none"
    if isinstance(value, enum.Enum):
        return str(value.value)
    return str(value)

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------
# ${...} — dollar-brace syntax
_DOLLAR_REF = re.compile(r"\$\{([^}]+)\}")
# {steps.…} but NOT ${steps.…}  — bare-brace step syntax
_STEPS_REF = re.compile(r"(?<!\$)\{steps\.([^}]+)\}")
# {inputs.…} but NOT ${inputs.…} — bare-brace input syntax
_INPUTS_REF = re.compile(r"(?<!\$)\{inputs\.([^}]+)\}")
# Combined: any reference
_ANY_REF = re.compile(
    r"\$\{([^}]+)\}"
    r"|(?<!\$)\{steps\.([^}]+)\}"
    r"|(?<!\$)\{inputs\.([^}]+)\}"
)

_STEP_RESULT_FIELDS = frozenset({"output", "status", "error", "duration", "attempts"})


class ExecutionContext:
    """Stores step results and plan inputs; resolves interpolation placeholders."""

    def __init__(self, inputs: dict[str, Any] | None = None) -> None:
        self._results: dict[str, StepResult] = {}
        self._inputs: dict[str, Any] = dict(inputs) if inputs else {}

    # -- result bookkeeping --------------------------------------------------

    def record(self, step_id: str, result: StepResult) -> None:
        self._results[step_id] = result

    def get(self, step_id: str) -> StepResult | None:
        return self._results.get(step_id)

    @property
    def results(self) -> dict[str, StepResult]:
        return dict(self._results)

    @property
    def inputs(self) -> dict[str, Any]:
        return dict(self._inputs)

    # -- condition evaluation ------------------------------------------------

    def evaluate_condition(self, expr: str) -> bool:
        """Resolve interpolation in *expr* and evaluate as a condition.

        After interpolation the result is checked for truthiness:
        - Non-string objects use Python truthiness directly.
        - Strings support ``==`` / ``!=`` comparison operators (whitespace-trimmed).
        - Strings support ``>``, ``>=``, ``<``, ``<=`` numeric comparison operators.
          Both sides must be parseable as numbers; otherwise the condition is ``False``.
        - Plain strings are truthy unless empty or one of the canonical false
          literals: ``"false"``, ``"0"``, ``"no"``, ``"null"``, ``"none"`` (case-insensitive).
        """
        resolved = self._resolve_value(expr)

        # Full-value ref returned a non-string object → Python truthiness
        if not isinstance(resolved, str):
            return bool(resolved)

        # Check for comparison operators in the *resolved* string.
        # Order matters: multi-char operators (!=, >=, <=) must be tried
        # before their single-char prefixes (>, <) to avoid partial matches;
        # == before = is already ensured.  != / == use string comparison;
        # >= / <= / > / < use numeric comparison.
        for op, fn in (("!=", lambda a, b: a != b), ("==", lambda a, b: a == b)):
            if op in resolved:
                left, _, right = resolved.partition(op)
                return fn(left.strip(), right.strip())

        for op, fn in (
            (">=", lambda a, b: a >= b),
            ("<=", lambda a, b: a <= b),
            (">", lambda a, b: a > b),
            ("<", lambda a, b: a < b),
        ):
            if op in resolved:
                left, _, right = resolved.partition(op)
                return _numeric_compare(left.strip(), right.strip(), fn)

        # Plain string truthiness
        return resolved.strip().lower() not in ("", "false", "0", "no", "null", "none")

    # -- param resolution ----------------------------------------------------

    def resolve_params(self, params: dict[str, Any]) -> dict[str, Any]:
        """Deep-copy *params* and resolve all placeholder references."""
        resolved = copy.deepcopy(params)
        return self._resolve_value(resolved)

    # -- internals -----------------------------------------------------------

    def _resolve_value(self, value: Any) -> Any:
        if isinstance(value, str):
            return self._resolve_string(value)
        if isinstance(value, dict):
            return {k: self._resolve_value(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self._resolve_value(v) for v in value]
        return value

    def _resolve_string(self, value: str) -> Any:
        # Full-value reference — return raw object
        m = _DOLLAR_REF.fullmatch(value)
        if m:
            return self._lookup(m.group(1))

        m = _STEPS_REF.fullmatch(value)
        if m:
            return self._lookup_step(m.group(1))

        m = _INPUTS_REF.fullmatch(value)
        if m:
            return self._lookup_input(m.group(1))

        # Embedded references — substitute as strings
        if _ANY_REF.search(value):
            def _replacer(match: re.Match) -> str:
                dollar, steps, inputs = match.group(1), match.group(2), match.group(3)
                if dollar is not None:
                    return _interpolation_str(self._lookup(dollar))
                if steps is not None:
                    return _interpolation_str(self._lookup_step(steps))
                return _interpolation_str(self._lookup_input(inputs))
            return _ANY_REF.sub(_replacer, value)

        return value

    def _lookup(self, path_str: str) -> Any:
        """Route a ${...} reference to step-result or input lookup."""
        parts = path_str.split(".")
        if parts[0] == "inputs":
            return self._lookup_input(".".join(parts[1:]))
        if parts[0] == "steps":
            return self._lookup_step(".".join(parts[1:]))
        return self._lookup_step(path_str)

    def _lookup_step(self, path_str: str) -> Any:
        """Resolve a step-result reference like  step_id.output.key  ."""
        parts = path_str.split(".")
        step_id = parts[0]
        result = self._results.get(step_id)
        if result is None:
            raise KeyError(f"step '{step_id}' not found in context")

        if len(parts) > 1 and parts[1] in _STEP_RESULT_FIELDS:
            obj = getattr(result, parts[1])
            remaining = parts[2:]
        else:
            obj = result.output
            remaining = parts[1:]

        return self._drill(obj, remaining, path_str)

    def _lookup_input(self, path_str: str) -> Any:
        """Resolve a plan-input reference like  key.nested  ."""
        if not path_str:
            raise KeyError("empty input reference")
        parts = path_str.split(".")
        key = parts[0]
        if key not in self._inputs:
            raise KeyError(
                f"input '{key}' not found in plan inputs "
                f"(available: {', '.join(sorted(self._inputs)) or 'none'})"
            )
        obj = self._inputs[key]
        return self._drill(obj, parts[1:], f"inputs.{path_str}")

    @staticmethod
    def _drill(obj: Any, parts: list[str], full_path: str) -> Any:
        """Traverse *obj* by the remaining *parts* (dict keys / list indices)."""
        for i, part in enumerate(parts):
            traversed = ".".join(parts[: i + 1])
            if isinstance(obj, dict):
                if part not in obj:
                    raise KeyError(
                        f"key '{part}' not found at '{traversed}' in ref '${{{full_path}}}'"
                    )
                obj = obj[part]
            elif isinstance(obj, (list, tuple)):
                try:
                    obj = obj[int(part)]
                except (ValueError, IndexError) as exc:
                    raise KeyError(
                        f"invalid index '{part}' at '{traversed}' in ref '${{{full_path}}}'"
                    ) from exc
            elif hasattr(obj, part):
                obj = getattr(obj, part)
            else:
                raise KeyError(
                    f"cannot traverse '{part}' at '{traversed}' in ref '${{{full_path}}}'"
                )
        return obj
