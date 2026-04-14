"""File operation tools."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from src.odin.tools.base import BaseTool
from src.odin.context import ExecutionContext


class ReadFileTool(BaseTool):
    """Read a file and return its contents."""

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> Any:
        path = Path(params["path"])
        encoding = params.get("encoding", "utf-8")
        return path.read_text(encoding=encoding)


class WriteFileTool(BaseTool):
    """Write content to a file."""

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> Any:
        path = Path(params["path"])
        content = params["content"]
        mkdir = params.get("mkdir", False)
        if mkdir:
            path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return {"written": str(path), "bytes": len(content)}


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
