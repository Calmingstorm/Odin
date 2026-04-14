"""Tests for the ToolRegistry."""

from __future__ import annotations

import pytest

from src.odin.registry import ToolRegistry
from src.odin.tools.base import BaseTool
from src.odin.context import ExecutionContext


class DummyTool(BaseTool):
    async def execute(self, params, ctx):
        return "dummy"


def test_register_and_get():
    reg = ToolRegistry()
    reg.register("dummy", DummyTool)
    assert reg.get("dummy") is DummyTool


def test_has():
    reg = ToolRegistry()
    reg.register("dummy", DummyTool)
    assert reg.has("dummy")
    assert not reg.has("nope")


def test_get_unknown_raises():
    reg = ToolRegistry()
    with pytest.raises(KeyError, match="Unknown tool"):
        reg.get("nope")


def test_list_tools():
    reg = ToolRegistry()
    reg.register("b", DummyTool)
    reg.register("a", DummyTool)
    assert reg.list_tools() == ["a", "b"]


def test_with_defaults():
    reg = ToolRegistry.with_defaults()
    assert reg.has("shell")
    assert reg.has("read_file")
    assert reg.has("write_file")
    assert reg.has("list_dir")
    assert reg.has("http_request")
