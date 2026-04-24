"""Bridge between DAG planner tools and ToolExecutor security pipeline.

Replaces the raw ShellTool/WriteFileTool/ReadFileTool in the plan
registry with adapter tools that route through ToolExecutor.execute(),
inheriting governor checks, RBAC, audit logging, and mutation detection.
"""
from __future__ import annotations

from typing import Any, TYPE_CHECKING

from src.odin.tools.base import BaseTool
from src.odin.registry import ToolRegistry

if TYPE_CHECKING:
    from src.odin.context import ExecutionContext
    from src.tools.executor import ToolExecutor


class MutationTracker:
    """Accumulates mutation metadata from nested tool calls."""
    __slots__ = ("detected", "reasons")

    def __init__(self):
        self.detected = False
        self.reasons: list[str] = []

    def track(self, result) -> None:
        if result.requires_validation:
            self.detected = True
            if result.validation_reason:
                self.reasons.append(result.validation_reason)


def _result_to_dict(result) -> dict:
    """Convert ToolResult to a structured dict for the planner."""
    return {
        "ok": result.ok,
        "output": result.output,
        "error": result.error,
        "exit_code": result.exit_code,
        "requires_validation": result.requires_validation,
        "validation_reason": result.validation_reason,
    }


class ExecutorShellTool(BaseTool):
    """Shell tool that routes through ToolExecutor.execute('run_command')."""

    def __init__(self, executor: ToolExecutor, default_host: str = "localhost",
                 mutation_tracker: MutationTracker | None = None) -> None:
        self._executor = executor
        self._default_host = default_host
        self._tracker = mutation_tracker

    async def execute(self, params: dict[str, Any], ctx: "ExecutionContext") -> Any:
        host = params.get("host", self._default_host)
        command = params["command"]
        result = await self._executor.execute("run_command", {
            "host": host,
            "command": command,
        })
        if self._tracker:
            self._tracker.track(result)
        if not result.ok:
            raise RuntimeError(f"Command failed (exit {result.exit_code}): {result.output[:500]}")
        d = _result_to_dict(result)
        d["returncode"] = result.exit_code or 0
        d["stdout"] = result.output
        d["stderr"] = result.error or ""
        return d

    @classmethod
    def param_schema(cls) -> dict[str, Any]:
        return {
            "command": {"type": "string", "required": True},
            "host": {"type": "string"},
        }


class ExecutorReadFileTool(BaseTool):
    """Read file tool routed through ToolExecutor."""

    def __init__(self, executor: ToolExecutor, default_host: str = "localhost",
                 mutation_tracker: MutationTracker | None = None) -> None:
        self._executor = executor
        self._default_host = default_host
        self._tracker = mutation_tracker

    async def execute(self, params: dict[str, Any], ctx: "ExecutionContext") -> Any:
        host = params.get("host", self._default_host)
        result = await self._executor.execute("read_file", {
            "host": host,
            "path": params["path"],
            "lines": params.get("lines", 200),
        })
        if self._tracker:
            self._tracker.track(result)
        if not result.ok:
            raise RuntimeError(f"read_file failed: {result.error or result.output[:200]}")
        return _result_to_dict(result)

    @classmethod
    def param_schema(cls) -> dict[str, Any]:
        return {"path": {"type": "string", "required": True}}


class ExecutorWriteFileTool(BaseTool):
    """Write file tool routed through ToolExecutor."""

    def __init__(self, executor: ToolExecutor, default_host: str = "localhost",
                 mutation_tracker: MutationTracker | None = None) -> None:
        self._executor = executor
        self._default_host = default_host
        self._tracker = mutation_tracker

    async def execute(self, params: dict[str, Any], ctx: "ExecutionContext") -> Any:
        host = params.get("host", self._default_host)
        result = await self._executor.execute("write_file", {
            "host": host,
            "path": params["path"],
            "content": params["content"],
        })
        if self._tracker:
            self._tracker.track(result)
        if not result.ok:
            raise RuntimeError(f"write_file failed: {result.error or result.output[:200]}")
        return _result_to_dict(result)

    @classmethod
    def param_schema(cls) -> dict[str, Any]:
        return {
            "path": {"type": "string", "required": True},
            "content": {"type": "string", "required": True},
        }


def create_executor_backed_registry(
    executor: ToolExecutor,
    default_host: str = "localhost",
) -> tuple[ToolRegistry, MutationTracker]:
    """Create a tool registry where shell/file tools route through ToolExecutor.

    Returns (registry, mutation_tracker) — caller can inspect tracker
    after plan execution to propagate validation requirements.
    """
    from src.odin.tools.file_ops import ListDirTool
    from src.odin.tools.http import HttpRequestTool

    tracker = MutationTracker()
    reg = ToolRegistry()
    reg.register("shell", type(
        "BoundShellTool", (ExecutorShellTool,),
        {"__init__": lambda self, *a, **kw: ExecutorShellTool.__init__(self, executor, default_host, tracker)},
    ))
    reg.register("read_file", type(
        "BoundReadFileTool", (ExecutorReadFileTool,),
        {"__init__": lambda self, *a, **kw: ExecutorReadFileTool.__init__(self, executor, default_host, tracker)},
    ))
    reg.register("write_file", type(
        "BoundWriteFileTool", (ExecutorWriteFileTool,),
        {"__init__": lambda self, *a, **kw: ExecutorWriteFileTool.__init__(self, executor, default_host, tracker)},
    ))
    reg.register("list_dir", ListDirTool)
    reg.register("http_request", HttpRequestTool)
    return reg, tracker
