"""Process management tools: run and kill."""

from __future__ import annotations

import asyncio
import os
import signal
from typing import Any

from src.odin.context import ExecutionContext
from src.odin.tools.base import BaseTool


class ProcessRunTool(BaseTool):
    """Start a process, optionally detached.

    Params: command (str), cwd (str, optional), env (dict, optional), detach (bool, default False).
    Returns: {"pid": int, "returncode": int|None, "stdout": str, "stderr": str}
    """

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> dict[str, Any]:
        command: str = params["command"]
        cwd: str | None = params.get("cwd")
        env: dict[str, str] | None = params.get("env")
        detach: bool = params.get("detach", False)

        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
            env=env,
        )

        if detach:
            return {
                "pid": proc.pid,
                "returncode": None,
                "stdout": "",
                "stderr": "",
            }

        stdout_bytes, stderr_bytes = await proc.communicate()
        return {
            "pid": proc.pid,
            "returncode": proc.returncode,
            "stdout": stdout_bytes.decode(errors="replace"),
            "stderr": stderr_bytes.decode(errors="replace"),
        }


class ProcessKillTool(BaseTool):
    """Kill a process by PID.

    Params: pid (int), signal (int, default SIGTERM).
    Returns: {"pid": int, "killed": bool}
    """

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> dict[str, Any]:
        pid: int = params["pid"]
        sig: int = params.get("signal", signal.SIGTERM)

        try:
            os.kill(pid, sig)
            return {"pid": pid, "killed": True}
        except ProcessLookupError:
            return {"pid": pid, "killed": False}
