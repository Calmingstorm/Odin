"""Tests for process management tools."""

import asyncio

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
