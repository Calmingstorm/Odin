"""Core DAG planner — validates and executes plans with parallel step scheduling."""

from __future__ import annotations

import asyncio
import time
from graphlib import TopologicalSorter

from src.odin.context import ExecutionContext
from src.odin.executor import StepExecutor
from src.odin.registry import ToolRegistry
from src.odin.types import PlanResult, PlanSpec, StepResult, StepStatus


class PlanValidationError(Exception):
    """Raised when a plan fails validation."""

    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__(f"Plan validation failed: {'; '.join(errors)}")


class Planner:
    """Dependency-aware parallel plan executor."""

    def __init__(self, registry: ToolRegistry) -> None:
        self._registry = registry

    def validate(self, plan: PlanSpec) -> list[str]:
        """Return a list of validation errors (empty means valid)."""
        errors: list[str] = []
        step_ids = {s.id for s in plan.steps}

        # Duplicate IDs
        seen: set[str] = set()
        for s in plan.steps:
            if s.id in seen:
                errors.append(f"Duplicate step id: {s.id}")
            seen.add(s.id)

        # Dangling deps
        for s in plan.steps:
            for dep in s.depends_on:
                if dep not in step_ids:
                    errors.append(f"Step '{s.id}' depends on unknown step '{dep}'")

        # Unknown tools
        for s in plan.steps:
            if not self._registry.has(s.tool):
                errors.append(f"Step '{s.id}' uses unknown tool '{s.tool}'")

        # Cycle detection
        if not errors:
            graph = {s.id: set(s.depends_on) for s in plan.steps}
            try:
                ts = TopologicalSorter(graph)
                ts.prepare()
            except Exception as exc:
                errors.append(f"Cycle detected: {exc}")

        return errors

    async def execute(self, plan: PlanSpec) -> PlanResult:
        """Execute a plan with dependency-aware parallelism."""
        errors = self.validate(plan)
        if errors:
            raise PlanValidationError(errors)

        ctx = ExecutionContext()
        step_exec = StepExecutor(self._registry, ctx)
        step_map = {s.id: s for s in plan.steps}

        # Build dependency graph and reverse map
        graph = {s.id: set(s.depends_on) for s in plan.steps}
        dependents: dict[str, set[str]] = {s.id: set() for s in plan.steps}
        for s in plan.steps:
            for dep in s.depends_on:
                dependents[dep].add(s.id)

        result = PlanResult(plan_name=plan.name, started_at=time.time())
        skipped: set[str] = set()

        sorter = TopologicalSorter(graph)
        sorter.prepare()

        pending_tasks: dict[asyncio.Task, str] = {}

        while sorter.is_active():
            # Launch all ready steps
            for step_id in sorter.get_ready():
                if step_id in skipped:
                    sorter.done(step_id)
                    continue
                spec = step_map[step_id]
                task = asyncio.create_task(
                    step_exec.execute_step(spec), name=step_id
                )
                pending_tasks[task] = step_id

            if not pending_tasks:
                break

            # Wait for at least one to complete
            done, _ = await asyncio.wait(
                pending_tasks.keys(), return_when=asyncio.FIRST_COMPLETED
            )

            for task in done:
                step_id = pending_tasks.pop(task)
                step_result: StepResult = task.result()
                ctx.record(step_result)
                result.step_results[step_id] = step_result

                if step_result.status != StepStatus.SUCCESS:
                    spec = step_map[step_id]
                    if not spec.continue_on_failure:
                        self._cascade_skip(
                            step_id, dependents, skipped, result
                        )

                sorter.done(step_id)

        result.finished_at = time.time()
        return result

    @staticmethod
    def _cascade_skip(
        failed_id: str,
        dependents: dict[str, set[str]],
        skipped: set[str],
        result: PlanResult,
    ) -> None:
        """Mark all transitive dependents of a failed step as SKIPPED."""
        queue = list(dependents.get(failed_id, set()))
        while queue:
            sid = queue.pop()
            if sid in skipped:
                continue
            skipped.add(sid)
            result.step_results[sid] = StepResult(
                step_id=sid,
                status=StepStatus.SKIPPED,
                error=f"Skipped because '{failed_id}' failed",
            )
            queue.extend(dependents.get(sid, set()))
