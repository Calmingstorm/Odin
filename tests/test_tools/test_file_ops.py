"""Tests for file operation tools."""

import pytest

from src.odin.context import ExecutionContext
from src.odin.tools.file_ops import ListDirTool, ReadFileTool, WriteFileTool


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
async def test_write_file(tmp_path):
    tool = WriteFileTool()
    path = str(tmp_path / "out.txt")
    result = await tool.execute(
        {"path": path, "content": "written"}, ExecutionContext()
    )
    assert result["bytes_written"] == 7
    assert (tmp_path / "out.txt").read_text() == "written"


@pytest.mark.asyncio
async def test_write_file_mkdir(tmp_path):
    tool = WriteFileTool()
    path = str(tmp_path / "sub" / "dir" / "out.txt")
    result = await tool.execute(
        {"path": path, "content": "deep", "mkdir": True}, ExecutionContext()
    )
    assert result["bytes_written"] == 4


@pytest.mark.asyncio
async def test_write_file_append(tmp_path):
    f = tmp_path / "append.txt"
    f.write_text("first")
    tool = WriteFileTool()
    await tool.execute(
        {"path": str(f), "content": "+second", "mode": "a"}, ExecutionContext()
    )
    assert f.read_text() == "first+second"


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
