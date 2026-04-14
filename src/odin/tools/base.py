"""Abstract base class for all DAG planner tools."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from odin.context import ExecutionContext


class BaseTool(ABC):
    """Base class that all planner tools must implement."""

    @abstractmethod
    async def execute(self, params: dict[str, Any], ctx: "ExecutionContext") -> Any:
        """Execute the tool with given parameters and return output."""

    @classmethod
    def param_schema(cls) -> dict[str, Any]:
        """Optional JSON-Schema-like description of accepted params."""
        return {}
