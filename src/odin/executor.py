"""Step executor — runs a single step with timeout and retry logic."""

from __future__ import annotations

import asyncio
import time
from typing import Any

from src.odin.context import ExecutionContext
from src.odin.registry import ToolRegistry
from src.odin.types import StepResult, StepSpec, StepStatus


class StepExecutor:
    """Executes individual plan steps with retry and timeout support."""

    def __init__(self, registry: ToolRegistry, ctx: ExecutionContext) -> None:
        self._registry = registry
        self._ctx = ctx

    async def execute_step(self, spec: StepSpec) -> StepResult:
        result = StepResult(step_id=spec.id, started_at=time.time())

        try:
            tool_cls = self._registry.get(spec.tool)
            tool = tool_cls()
            params = self._ctx.resolve_params(spec.params)
        except Exception as exc:
            result.status = StepStatus.FAILED
            result.error = f"Step setup failed: {exc}"
            result.attempts = 0
            result.finished_at = time.time()
            return result

        max_attempts = spec.retries + 1

        for attempt in range(1, max_attempts + 1):
            result.attempts = attempt
            try:
                output = await asyncio.wait_for(
                    tool.execute(params, self._ctx),
                    timeout=spec.timeout,
                )
                result.status = StepStatus.SUCCESS
                result.output = output
                result.finished_at = time.time()
                return result
            except asyncio.TimeoutError:
                result.status = StepStatus.TIMED_OUT
                result.error = f"Timed out after {spec.timeout}s"
            except Exception as exc:
                result.status = StepStatus.FAILED
                result.error = str(exc)

        result.finished_at = time.time()
        return result
