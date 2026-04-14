"""Core data types for the Odin DAG planner."""

from __future__ import annotations

import enum
import time
from dataclasses import dataclass, field
from typing import Any


class StepStatus(enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
    SKIPPED = "skipped"


@dataclass(frozen=True)
class StepSpec:
    """Declarative definition of one step in a plan."""

    id: str
    tool: str
    params: dict[str, Any] = field(default_factory=dict)
    depends_on: tuple[str, ...] = ()
    timeout: float = 30.0
    retries: int = 0
    continue_on_failure: bool = False


@dataclass(frozen=True)
class PlanSpec:
    """A complete execution plan — an immutable DAG of steps."""

    name: str
    steps: tuple[StepSpec, ...]
    description: str = ""


@dataclass
class StepResult:
    """Result of executing a single step."""

    step_id: str
    status: StepStatus = StepStatus.PENDING
    output: Any = None
    error: str | None = None
    started_at: float = 0.0
    finished_at: float = 0.0
    attempts: int = 0

    @property
    def duration(self) -> float:
        if self.started_at and self.finished_at:
            return self.finished_at - self.started_at
        return 0.0


@dataclass
class PlanResult:
    """Mutable accumulator of step results for a plan execution."""

    plan_name: str
    step_results: dict[str, StepResult] = field(default_factory=dict)
    started_at: float = field(default_factory=time.time)
    finished_at: float = 0.0

    @property
    def success(self) -> bool:
        return bool(self.step_results) and all(
            r.status == StepStatus.SUCCESS for r in self.step_results.values()
        )

    @property
    def duration(self) -> float:
        if self.started_at and self.finished_at:
            return self.finished_at - self.started_at
        return 0.0
