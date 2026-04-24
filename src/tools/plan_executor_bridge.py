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


class ExecutorShellTool(BaseTool):
    """Shell tool that routes through ToolExecutor.execute('run_command')."""

    def __init__(self, executor: ToolExecutor, default_host: str = "localhost") -> None:
        self._executor = executor
        self._default_host = default_host

    async def execute(self, params: dict[str, Any], ctx: "ExecutionContext") -> Any:
        host = params.get("host", self._default_host)
        command = params["command"]
        result = await self._executor.execute("run_command", {
            "host": host,
            "command": command,
        })
        return {
            "returncode": result.exit_code or (0 if result.ok else 1),
            "stdout": result.output,
            "stderr": result.error or "",
        }

    @classmethod
    def param_schema(cls) -> dict[str, Any]:
        return {
            "command": {"type": "string", "required": True},
            "host": {"type": "string"},
        }


class ExecutorReadFileTool(BaseTool):
    """Read file tool routed through ToolExecutor."""

    def __init__(self, executor: ToolExecutor, default_host: str = "localhost") -> None:
        self._executor = executor
        self._default_host = default_host

    async def execute(self, params: dict[str, Any], ctx: "ExecutionContext") -> Any:
        host = params.get("host", self._default_host)
        result = await self._executor.execute("read_file", {
            "host": host,
            "path": params["path"],
            "lines": params.get("lines", 200),
        })
        return str(result)

    @classmethod
    def param_schema(cls) -> dict[str, Any]:
        return {"path": {"type": "string", "required": True}}


class ExecutorWriteFileTool(BaseTool):
    """Write file tool routed through ToolExecutor."""

    def __init__(self, executor: ToolExecutor, default_host: str = "localhost") -> None:
        self._executor = executor
        self._default_host = default_host

    async def execute(self, params: dict[str, Any], ctx: "ExecutionContext") -> Any:
        host = params.get("host", self._default_host)
        result = await self._executor.execute("write_file", {
            "host": host,
            "path": params["path"],
            "content": params["content"],
        })
        return str(result)

    @classmethod
    def param_schema(cls) -> dict[str, Any]:
        return {
            "path": {"type": "string", "required": True},
            "content": {"type": "string", "required": True},
        }


def create_executor_backed_registry(
    executor: ToolExecutor,
    default_host: str = "localhost",
) -> ToolRegistry:
    """Create a tool registry where shell/file tools route through ToolExecutor."""
    from src.odin.tools.file_ops import ListDirTool
    from src.odin.tools.http import HttpRequestTool

    reg = ToolRegistry()
    reg.register("shell", type(
        "BoundShellTool", (ExecutorShellTool,),
        {"__init__": lambda self, *a, **kw: ExecutorShellTool.__init__(self, executor, default_host)},
    ))
    reg.register("read_file", type(
        "BoundReadFileTool", (ExecutorReadFileTool,),
        {"__init__": lambda self, *a, **kw: ExecutorReadFileTool.__init__(self, executor, default_host)},
    ))
    reg.register("write_file", type(
        "BoundWriteFileTool", (ExecutorWriteFileTool,),
        {"__init__": lambda self, *a, **kw: ExecutorWriteFileTool.__init__(self, executor, default_host)},
    ))
    reg.register("list_dir", ListDirTool)
    reg.register("http_request", HttpRequestTool)
    return reg
