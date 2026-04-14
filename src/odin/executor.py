"""Step executor with retry and timeout support."""

from __future__ import annotations

import asyncio
import inspect
import time
from typing import Any

from odin.context import ExecutionContext
from odin.registry import ToolRegistry
from odin.types import StepResult, StepSpec, StepStatus


class StepExecutor:
    def __init__(self, registry: ToolRegistry) -> None:
        self._registry = registry

    def execute_step(self, spec: StepSpec, ctx: ExecutionContext) -> StepResult:
        try:
            tool_cls = self._registry.get(spec.tool)
        except KeyError:
            return StepResult(
                status=StepStatus.FAILED,
                error=f"unknown tool '{spec.tool}'",
            )

        # Resolve params — interpolation errors fail the step, not the plan
        try:
            resolved = ctx.resolve_params(spec.params)
        except KeyError as exc:
            return StepResult(
                status=StepStatus.FAILED,
                error=f"param resolution failed: {exc}",
            )

        tool = tool_cls()
        last_error: str | None = None
        attempts = 0
        max_attempts = 1 + spec.retries
        start = time.monotonic()

        while attempts < max_attempts:
            attempts += 1
            start = time.monotonic()
            try:
                output = self._invoke_tool(tool, resolved, ctx)
                elapsed = time.monotonic() - start
                if elapsed > spec.timeout:
                    return StepResult(
                        status=StepStatus.TIMEOUT,
                        error=f"step exceeded {spec.timeout}s timeout",
                        duration=elapsed,
                        attempts=attempts,
                    )
                return StepResult(
                    status=StepStatus.SUCCESS,
                    output=output,
                    duration=elapsed,
                    attempts=attempts,
                )
            except Exception as exc:
                last_error = str(exc)
                continue

        return StepResult(
            status=StepStatus.FAILED,
            error=last_error,
            duration=time.monotonic() - start,
            attempts=attempts,
        )

    @staticmethod
    def _invoke_tool(tool: Any, params: dict[str, Any], ctx: ExecutionContext) -> Any:
        result = tool.execute(params, ctx)
        if inspect.isawaitable(result):
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return asyncio.run(result)
            raise RuntimeError(
                f"tool execute() returned awaitable inside running event loop: {loop}"
            )
        return result
