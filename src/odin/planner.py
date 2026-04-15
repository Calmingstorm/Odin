"""DAG planner with dependency-aware parallel execution."""

from __future__ import annotations

import asyncio
from graphlib import TopologicalSorter
from typing import Any

from src.odin.context import ExecutionContext
from src.odin.executor import StepExecutor
from src.odin.registry import ToolRegistry
from src.odin.types import PlanResult, PlanSpec, StepResult, StepStatus


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

    async def execute(
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

            # Separate steps into those we can dispatch vs. those we skip
            to_run: list[str] = []
            for step_id in ready:
                spec = step_map[step_id]

                # Skip if any dependency failed (unless continue_on_failure)
                if step_id in skipped:
                    sr = _make_skip(spec)
                    ctx.record(step_id, sr)
                    result.steps[step_id] = sr
                    sorter.done(step_id)
                    continue

                # Evaluate conditional — skip if `when` resolves to false
                if spec.when is not None:
                    try:
                        condition_met = ctx.evaluate_condition(spec.when)
                    except KeyError:
                        condition_met = False
                    if not condition_met:
                        sr = StepResult(
                            status=StepStatus.SKIPPED,
                            error="condition not met",
                        )
                        ctx.record(step_id, sr)
                        result.steps[step_id] = sr
                        sorter.done(step_id)
                        continue

                to_run.append(step_id)

            if not to_run:
                continue

            # Execute all ready steps concurrently with isolation —
            # one step's exception must not cancel sibling steps.
            async def _run_step(sid: str) -> tuple[str, StepResult]:
                return sid, await self._executor.execute_step(step_map[sid], ctx)

            raw_results = await asyncio.gather(
                *(_run_step(sid) for sid in to_run),
                return_exceptions=True,
            )

            # Unpack results, converting unhandled exceptions to FAILED steps
            step_results: list[tuple[str, StepResult]] = []
            for sid, raw in zip(to_run, raw_results):
                if isinstance(raw, BaseException):
                    step_results.append((sid, StepResult(
                        status=StepStatus.FAILED,
                        error=f"unhandled exception: {raw}",
                    )))
                else:
                    step_results.append(raw)

            # Record results and handle failures
            for step_id, sr in step_results:
                ctx.record(step_id, sr)
                result.steps[step_id] = sr

                if sr.status not in (StepStatus.SUCCESS,) and not step_map[step_id].continue_on_failure:
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
