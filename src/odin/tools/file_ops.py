"""File operation tools."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from odin.tools.base import BaseTool
from odin.context import ExecutionContext


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
        mode = params.get("mode", "w")
        if mkdir:
            path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, mode) as f:
            f.write(content)
        return {"written": str(path), "bytes_written": len(content)}


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
