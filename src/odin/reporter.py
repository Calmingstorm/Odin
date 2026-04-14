"""Reporting utilities for plan execution results."""

from __future__ import annotations

import json
from typing import Any

from odin.types import PlanResult, StepStatus


_STATUS_ICONS = {
    StepStatus.SUCCESS: "[OK]",
    StepStatus.FAILED: "[FAIL]",
    StepStatus.TIMEOUT: "[TIMEOUT]",
    StepStatus.SKIPPED: "[SKIP]",
}


class Reporter:
    """Format plan results for consumption."""

    @staticmethod
    def to_dict(result: PlanResult) -> dict[str, Any]:
        steps = {}
        for sid, sr in result.steps.items():
            steps[sid] = {
                "status": sr.status.value,
                "output": sr.output,
                "error": sr.error,
                "duration": round(sr.duration, 4),
                "attempts": sr.attempts,
            }
        return {
            "name": result.name,
            "success": result.success,
            "steps": steps,
        }

    @staticmethod
    def to_json(result: PlanResult) -> str:
        return json.dumps(Reporter.to_dict(result), indent=2, default=str)

    @staticmethod
    def to_summary(result: PlanResult) -> str:
        lines = [
            f"Plan: {result.name}",
            f"Status: {'SUCCESS' if result.success else 'FAILED'}",
            "",
        ]
        for sid, sr in result.steps.items():
            icon = _STATUS_ICONS.get(sr.status, "[?]")
            line = f"  {icon} {sid} ({sr.duration:.3f}s)"
            if sr.error:
                line += f" — {sr.error}"
            lines.append(line)
        return "\n".join(lines)
