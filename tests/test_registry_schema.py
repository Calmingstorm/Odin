"""Schema consistency tests — generated from the tool registry."""
from __future__ import annotations

import pytest
from src.tools.registry import TOOLS, TOOL_MAP, MUTATING_TOOLS, READ_ONLY_TOOLS


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
        assert len(names) == len(set(names)), f"Duplicate tool names: {[n for n in names if names.count(n) > 1]}"

    def test_mutating_tools_are_registered(self):
        registered = {t["name"] for t in TOOLS}
        for name in MUTATING_TOOLS:
            assert name in registered, f"Mutating tool '{name}' not in registry"

    def test_read_only_tools_are_registered(self):
        registered = {t["name"] for t in TOOLS}
        for name in READ_ONLY_TOOLS:
            assert name in registered, f"Read-only tool '{name}' not in registry"

    def test_mutating_and_readonly_are_disjoint(self):
        overlap = MUTATING_TOOLS & READ_ONLY_TOOLS
        assert not overlap, f"Tools in both sets: {overlap}"

    def test_mutating_and_readonly_cover_all(self):
        registered = {t["name"] for t in TOOLS}
        covered = MUTATING_TOOLS | READ_ONLY_TOOLS
        assert covered == registered, f"Uncovered tools: {registered - covered}"

    def test_executor_handles_shell_tools(self):
        """Shell execution tools must have _handle_ methods in ToolExecutor."""
        from src.tools.executor import ToolExecutor
        exe = ToolExecutor()
        shell_tools = {"run_command", "run_script", "run_command_multi", "read_file", "write_file"}
        for name in shell_tools:
            handler = getattr(exe, f"_handle_{name}", None)
            assert handler is not None, f"Shell tool '{name}' has no _handle_{name} in ToolExecutor"
