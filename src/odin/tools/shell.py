"""Shell command execution tool."""

from __future__ import annotations

import asyncio
from typing import Any

from src.odin.tools.base import BaseTool
from src.odin.context import ExecutionContext


class ShellTool(BaseTool):
    """Execute a shell command and return stdout/stderr/returncode."""

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> Any:
        command = params["command"]
        cwd = params.get("cwd")
        check = params.get("check", False)

        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )
        stdout, stderr = await proc.communicate()
        result = {
            "returncode": proc.returncode,
            "stdout": stdout.decode(errors="replace"),
            "stderr": stderr.decode(errors="replace"),
        }
        if check and proc.returncode != 0:
            raise RuntimeError(
                f"Command failed (rc={proc.returncode}): {stderr.decode(errors='replace')}"
            )
        return result

    @classmethod
    def param_schema(cls) -> dict[str, Any]:
        return {
            "command": {"type": "string", "required": True},
            "cwd": {"type": "string"},
            "check": {"type": "boolean", "default": False},
        }
