"""Shell command execution tool."""

from __future__ import annotations

import asyncio
import os
import signal
from typing import Any

from src.odin.context import ExecutionContext
from src.odin.tools.base import BaseTool


async def _terminate_group(proc: Any) -> None:
    """Terminate every child in the command's session, then reap the leader.

    A shell may exit while its children still hold stdout open, so killing only
    the shell or waiting only for its PID is insufficient.
    """
    if os.name != "posix":
        proc.kill()
        await proc.wait()
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    # Give cooperative children a short opportunity to exit before escalating.
    await asyncio.sleep(0.2)
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    await proc.wait()


async def _communicate_or_cleanup(proc: Any) -> tuple[bytes, bytes]:
    try:
        return await proc.communicate()
    except asyncio.CancelledError:
        # Do not resume the executor until process-group termination and
        # reaping have completed, even under repeated caller cancellation.
        cleanup = asyncio.create_task(_terminate_group(proc))
        while not cleanup.done():
            try:
                await asyncio.shield(cleanup)
            except asyncio.CancelledError:
                continue
        cleanup.result()
        raise


class ShellTool(BaseTool):
    """Execute a shell command and return stdout/stderr/returncode."""

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> Any:
        command = params["command"]
        cwd = params.get("cwd")
        check = params.get("check", False)
        env = params.get("env")

        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
            env=env,
            start_new_session=True,
        )
        stdout, stderr = await _communicate_or_cleanup(proc)
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
