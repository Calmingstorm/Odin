"""Tests for ShellTool."""

import pytest

from src.odin.context import ExecutionContext
from src.odin.tools.shell import ShellTool


@pytest.mark.asyncio
async def test_echo():
    tool = ShellTool()
    result = await tool.execute({"command": "echo hello"}, ExecutionContext())
    assert result["returncode"] == 0
    assert result["stdout"].strip() == "hello"


@pytest.mark.asyncio
async def test_failing_command_raises():
    tool = ShellTool()
    with pytest.raises(RuntimeError, match="failed"):
        await tool.execute({"command": "false", "check": True}, ExecutionContext())


@pytest.mark.asyncio
async def test_failing_command_no_check():
    tool = ShellTool()
    result = await tool.execute(
        {"command": "false", "check": False}, ExecutionContext()
    )
    assert result["returncode"] != 0


@pytest.mark.asyncio
async def test_cwd(tmp_path):
    tool = ShellTool()
    result = await tool.execute(
        {"command": "pwd", "cwd": str(tmp_path)}, ExecutionContext()
    )
    assert tmp_path.name in result["stdout"]


@pytest.mark.asyncio
async def test_env():
    tool = ShellTool()
    result = await tool.execute(
        {"command": "echo $MY_VAR", "env": {"MY_VAR": "odin"}},
        ExecutionContext(),
    )
    # env replaces the full env, so this might not work on all systems.
    # Instead, test with printenv which is more reliable:
    result = await tool.execute(
        {"command": "printenv MY_VAR || echo ''", "env": {"MY_VAR": "odin", "PATH": "/usr/bin:/bin"}, "check": False},
        ExecutionContext(),
    )
    assert "odin" in result["stdout"]
