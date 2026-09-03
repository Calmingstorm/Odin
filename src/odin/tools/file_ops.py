"""File operation tools."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from src.odin.context import ExecutionContext
from src.odin.tools.base import BaseTool


class ReadFileTool(BaseTool):
    """Read a file and return its contents."""

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> Any:
        path = Path(params["path"])
        encoding = params.get("encoding", "utf-8")
        return path.read_text(encoding=encoding)


class ListDirTool(BaseTool):
    """List directory contents."""

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> Any:
        path = Path(params.get("path", "."))
        pattern = params.get("pattern", "*")
        recursive = params.get("recursive", False)
        if recursive:
            entries = [str(p) for p in path.rglob(pattern)]
        else:
            entries = [str(p) for p in path.glob(pattern)]
        return entries
