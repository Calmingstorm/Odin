"""Tests for process management tools."""


import pytest

from src.odin.context import ExecutionContext
from src.odin.tools.process import ProcessKillTool, ProcessRunTool


@pytest.mark.asyncio
async def test_run_short_process():
    tool = ProcessRunTool()
    result = await tool.execute({"command": "echo odin"}, ExecutionContext())
    assert result["returncode"] == 0
    assert "odin" in result["stdout"]
    assert result["pid"] > 0


@pytest.mark.asyncio
async def test_run_detached():
    tool = ProcessRunTool()
    result = await tool.execute(
        {"command": "sleep 60", "detach": True}, ExecutionContext()
    )
    assert result["returncode"] is None
    assert result["pid"] > 0

    # Clean up the detached process.
    kill = ProcessKillTool()
    kill_result = await kill.execute({"pid": result["pid"]}, ExecutionContext())
    assert kill_result["killed"] is True


@pytest.mark.asyncio
async def test_kill_nonexistent():
    tool = ProcessKillTool()
    result = await tool.execute({"pid": 999999999}, ExecutionContext())
    assert result["killed"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("pid", [0, -1, -1000])
async def test_kill_rejects_broadcast_pids(pid):
    # os.kill(0, sig) hits the caller's whole process group; os.kill(-1, sig)
    # every process the user owns. This tool kills ONE process — a pid <= 0 is
    # never a single target and must be refused, not signalled.
    tool = ProcessKillTool()
    result = await tool.execute({"pid": pid}, ExecutionContext())
    assert result["killed"] is False
