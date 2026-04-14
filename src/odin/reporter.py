"""Reporting utilities for plan execution results."""

from __future__ import annotations

import json
from typing import Any

from src.odin.types import PlanResult, StepStatus


_STATUS_ICONS = {
    StepStatus.SUCCESS: "[OK]",
    StepStatus.FAILED: "[FAIL]",
    StepStatus.TIMED_OUT: "[TIMEOUT]",
    StepStatus.SKIPPED: "[SKIP]",
    StepStatus.PENDING: "[PEND]",
    StepStatus.RUNNING: "[RUN]",
}


class Reporter:
    """Format plan results for consumption."""

    @staticmethod
    def to_dict(result: PlanResult) -> dict[str, Any]:
        steps = {}
        for sid, sr in result.step_results.items():
            steps[sid] = {
                "status": sr.status.value,
                "output": sr.output,
                "error": sr.error,
                "duration": round(sr.duration, 4),
                "attempts": sr.attempts,
            }
        return {
            "plan": result.plan_name,
            "success": result.success,
            "duration": round(result.duration, 4),
            "steps": steps,
        }

    @staticmethod
    def to_json(result: PlanResult) -> str:
        return json.dumps(Reporter.to_dict(result), indent=2, default=str)

    @staticmethod
    def to_summary(result: PlanResult) -> str:
        lines = [
            f"Plan: {result.plan_name}",
            f"Status: {'SUCCESS' if result.success else 'FAILED'}",
            f"Duration: {result.duration:.3f}s",
            "",
        ]
        for sid, sr in result.step_results.items():
            icon = _STATUS_ICONS.get(sr.status, "[?]")
            line = f"  {icon} {sid} ({sr.duration:.3f}s)"
            if sr.error:
                line += f" — {sr.error}"
            lines.append(line)
        return "\n".join(lines)
