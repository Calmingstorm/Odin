"""Schema consistency tests — generated from the tool registry."""
from __future__ import annotations

from src.tools.registry import TOOL_MAP, TOOLS


class TestRegistryConsistency:
    def test_every_tool_has_name(self):
        for t in TOOLS:
            assert "name" in t, f"Tool missing name: {t}"
            assert isinstance(t["name"], str)
            assert len(t["name"]) > 0

    def test_every_tool_has_input_schema(self):
        for t in TOOLS:
            assert "input_schema" in t, f"Tool {t['name']} missing input_schema"
            assert t["input_schema"]["type"] == "object"

    def test_every_tool_has_description(self):
        for t in TOOLS:
            assert "description" in t, f"Tool {t['name']} missing description"
            assert len(t["description"]) > 10

    def test_tool_map_matches_tools(self):
        assert len(TOOL_MAP) == len(TOOLS)
        for t in TOOLS:
            assert t["name"] in TOOL_MAP

    def test_no_duplicate_names(self):
        names = [t["name"] for t in TOOLS]
        assert len(names) == len(set(names)), (
            f"Duplicate tool names: {[n for n in names if names.count(n) > 1]}")

    def test_executor_handles_shell_tools(self):
        """Shell execution tools must resolve to a handler through the
        executor's dispatch table (owner-aware since RFC-004 P4 — the
        bodies live on domain owners, resolved at call time)."""
        from src.tools.executor import ToolExecutor
        exe = ToolExecutor()
        shell_tools = {"run_command", "run_script", "run_command_multi", "read_file", "write_file"}
        for name in shell_tools:
            handler = exe._resolve_handler(name)
            assert handler is not None, f"Shell tool '{name}' does not resolve to a handler"
