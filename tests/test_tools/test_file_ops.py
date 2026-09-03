"""Tests for file operation tools."""

import pytest

from src.odin.context import ExecutionContext
from src.odin.tools.file_ops import ListDirTool, ReadFileTool


@pytest.mark.asyncio
async def test_read_file(tmp_path):
    f = tmp_path / "test.txt"
    f.write_text("hello odin")
    tool = ReadFileTool()
    content = await tool.execute({"path": str(f)}, ExecutionContext())
    assert content == "hello odin"


@pytest.mark.asyncio
async def test_read_nonexistent_raises(tmp_path):
    tool = ReadFileTool()
    with pytest.raises(FileNotFoundError):
        await tool.execute({"path": str(tmp_path / "nope.txt")}, ExecutionContext())


@pytest.mark.asyncio
async def test_list_dir(tmp_path):
    (tmp_path / "a.txt").write_text("a")
    (tmp_path / "b.py").write_text("b")
    tool = ListDirTool()
    result = await tool.execute({"path": str(tmp_path)}, ExecutionContext())
    assert len(result) == 2


@pytest.mark.asyncio
async def test_list_dir_glob(tmp_path):
    (tmp_path / "a.txt").write_text("a")
    (tmp_path / "b.py").write_text("b")
    tool = ListDirTool()
    result = await tool.execute(
        {"path": str(tmp_path), "pattern": "*.py"}, ExecutionContext()
    )
    assert len(result) == 1
    assert "b.py" in result[0]


@pytest.mark.asyncio
async def test_list_dir_recursive(tmp_path):
    sub = tmp_path / "sub"
    sub.mkdir()
    (tmp_path / "top.txt").write_text("t")
    (sub / "deep.txt").write_text("d")
    tool = ListDirTool()
    result = await tool.execute(
        {"path": str(tmp_path), "pattern": "*.txt", "recursive": True},
        ExecutionContext(),
    )
    assert len(result) == 2
