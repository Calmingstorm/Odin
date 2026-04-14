"""DAG planner with dependency-aware execution."""

from __future__ import annotations

from graphlib import TopologicalSorter
from typing import Any

from src.odin.context import ExecutionContext
from src.odin.executor import StepExecutor
from src.odin.registry import ToolRegistry
from src.odin.types import PlanResult, PlanSpec, StepStatus


class PlanValidationError(Exception):
    pass


class Planner:
    def __init__(self, registry: ToolRegistry) -> None:
        self._registry = registry
        self._executor = StepExecutor(registry)

    def validate(self, plan: PlanSpec) -> list[str]:
        errors: list[str] = []
        ids = {s.id for s in plan.steps}

        # duplicate ids
        seen: set[str] = set()
        for s in plan.steps:
            if s.id in seen:
                errors.append(f"duplicate step id '{s.id}'")
            seen.add(s.id)

        # unknown tools
        for s in plan.steps:
            if not self._registry.has(s.tool):
                errors.append(f"step '{s.id}': unknown tool '{s.tool}'")

        # dangling deps
        for s in plan.steps:
            for dep in s.depends_on:
                if dep not in ids:
                    errors.append(f"step '{s.id}': depends on unknown step '{dep}'")

        # cycle detection via TopologicalSorter
        graph: dict[str, set[str]] = {s.id: set(s.depends_on) for s in plan.steps}
        try:
            ts = TopologicalSorter(graph)
            ts.prepare()
        except Exception:
            errors.append("dependency cycle detected")

        return errors

    def execute(
        self, plan: PlanSpec, inputs: dict[str, Any] | None = None
    ) -> PlanResult:
        errors = self.validate(plan)
        if errors:
            raise PlanValidationError("; ".join(errors))

        # Merge runtime inputs over spec-level defaults
        merged_inputs = dict(plan.inputs)
        if inputs:
            merged_inputs.update(inputs)

        ctx = ExecutionContext(inputs=merged_inputs)
        step_map = {s.id: s for s in plan.steps}

        graph: dict[str, set[str]] = {s.id: set(s.depends_on) for s in plan.steps}
        sorter = TopologicalSorter(graph)
        sorter.prepare()

        result = PlanResult(name=plan.name, success=True)
        skipped: set[str] = set()

        while sorter.is_active():
            ready = sorter.get_ready()
            for step_id in ready:
                spec = step_map[step_id]

                # Skip if any dependency failed (unless continue_on_failure)
                if step_id in skipped:
                    sr = _make_skip(spec)
                    ctx.record(step_id, sr)
                    result.steps[step_id] = sr
                    sorter.done(step_id)
                    continue

                sr = self._executor.execute_step(spec, ctx)
                ctx.record(step_id, sr)
                result.steps[step_id] = sr

                if sr.status not in (StepStatus.SUCCESS,) and not spec.continue_on_failure:
                    result.success = False
                    # cascade-skip dependents
                    for s in plan.steps:
                        if step_id in s.depends_on:
                            skipped.add(s.id)

                sorter.done(step_id)

        return result


def _make_skip(spec: StepSpec) -> "StepResult":
    from src.odin.types import StepResult
    return StepResult(
        status=StepStatus.SKIPPED,
        error=f"skipped due to upstream failure",
    )
