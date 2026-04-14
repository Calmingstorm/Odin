"""Integration bridge: runs an Odin DAG plan from within the tool executor.

This module is the glue between the Discord/web agent tool system
(``src.tools.executor.ToolExecutor``) and the standalone DAG planner
(``src.odin``).  It accepts a plan specification (JSON string or dict),
validates it, executes it through the planner, and returns a formatted
report suitable for consumption by the LLM agent or end user.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from odin.plan_loader import load_plan
from odin.planner import Planner, PlanValidationError
from odin.registry import ToolRegistry
from odin.reporter import Reporter
from odin.types import PlanResult

log = logging.getLogger(__name__)


class PlanRunner:
    """Execute a declarative DAG plan and return formatted results.

    Designed to be called from ``ToolExecutor._execute_plan`` but also
    usable standalone for programmatic plan execution.
    """

    def __init__(self, registry: ToolRegistry | None = None) -> None:
        self._registry = registry or ToolRegistry.with_defaults()
        self._planner = Planner(self._registry)

    @property
    def registry(self) -> ToolRegistry:
        return self._registry

    async def run(self, args: dict[str, Any]) -> str:
        """Parse, validate, execute, and format a plan.

        Parameters
        ----------
        args : dict
            Must contain ``plan`` (JSON string or dict).
            Optional ``format`` key: ``"summary"`` (default), ``"json"``, or ``"dict"``.

        Returns
        -------
        str
            Formatted result suitable for display to a user or LLM.
        """
        plan_source = args.get("plan")
        if plan_source is None:
            return "Error: 'plan' argument is required"

        fmt = args.get("format", "summary")

        # Parse plan
        try:
            if isinstance(plan_source, str):
                plan = load_plan(plan_source)
            elif isinstance(plan_source, dict):
                plan = load_plan(plan_source)
            else:
                return f"Error: 'plan' must be a JSON string or dict, got {type(plan_source).__name__}"
        except (ValueError, Exception) as exc:
            return f"Error parsing plan: {exc}"

        # Validate
        errors = self._planner.validate(plan)
        if errors:
            return "Plan validation failed:\n" + "\n".join(f"  - {e}" for e in errors)

        # Execute
        log.info("Executing plan '%s' (%d steps)", plan.name, len(plan.steps))
        start = time.time()
        try:
            result = await self._planner.execute(plan)
        except PlanValidationError as exc:
            return f"Plan validation error: {exc}"
        except Exception as exc:
            log.exception("Plan execution failed")
            return f"Plan execution error: {exc}"

        elapsed = time.time() - start
        log.info(
            "Plan '%s' finished in %.3fs — %s",
            plan.name,
            elapsed,
            "SUCCESS" if result.success else "FAILED",
        )

        return self._format(result, fmt)

    @staticmethod
    def _format(result: PlanResult, fmt: str) -> str:
        if fmt == "json":
            return Reporter.to_json(result)
        if fmt == "dict":
            return str(Reporter.to_dict(result))
        return Reporter.to_summary(result)
