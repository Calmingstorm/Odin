"""Core data types for the Odin planner."""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any


class StepStatus(enum.Enum):
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    TIMEOUT = "timeout"


@dataclass(frozen=True)
class StepSpec:
    id: str
    tool: str
    params: dict[str, Any] = field(default_factory=dict)
    depends_on: tuple[str, ...] = ()
    timeout: float = 30.0
    retries: int = 0
    continue_on_failure: bool = False
    when: str | None = None


@dataclass
class StepResult:
    status: StepStatus
    output: Any = None
    error: str | None = None
    duration: float = 0.0
    attempts: int = 1


@dataclass(frozen=True)
class PlanSpec:
    name: str
    steps: tuple[StepSpec, ...]
    description: str = ""
    inputs: dict[str, Any] = field(default_factory=dict)


@dataclass
class PlanResult:
    name: str
    success: bool
    steps: dict[str, StepResult] = field(default_factory=dict)
