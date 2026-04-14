"""Tool registry for the DAG planner."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.odin.tools.base import BaseTool


class ToolRegistry:
    """Register and look up tool classes by name."""

    def __init__(self) -> None:
        self._tools: dict[str, type[BaseTool]] = {}

    def register(self, name: str, tool_cls: type["BaseTool"]) -> None:
        self._tools[name] = tool_cls

    def get(self, name: str) -> type["BaseTool"]:
        if name not in self._tools:
            raise KeyError(f"Unknown tool: {name}")
        return self._tools[name]

    def has(self, name: str) -> bool:
        return name in self._tools

    def list_tools(self) -> list[str]:
        return sorted(self._tools)

    @classmethod
    def with_defaults(cls) -> "ToolRegistry":
        """Return a registry pre-loaded with built-in tools."""
        from src.odin.tools.shell import ShellTool
        from src.odin.tools.file_ops import ReadFileTool, WriteFileTool, ListDirTool
        from src.odin.tools.http import HttpRequestTool

        reg = cls()
        reg.register("shell", ShellTool)
        reg.register("read_file", ReadFileTool)
        reg.register("write_file", WriteFileTool)
        reg.register("list_dir", ListDirTool)
        reg.register("http_request", HttpRequestTool)
        return reg
