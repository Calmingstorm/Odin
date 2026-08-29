"""P3 seam pins: outcome mapping, loop + background dispatch, RBAC tier
denial, and MCP argument scrubbing — real manager + real fake server."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from src.discord.mcp_dispatch import (
    MODEL_RESULT_CAP,
    dispatch_mcp_tool,
    is_mcp_tool,
    uncertain_outcome,
)
from src.discord.tool_loop_helpers import _scrub_tool_input_for_storage
from src.tools.mcp.manager import MCPManager
from src.tools.mcp.outcomes import MCPToolOutcome
from src.tools.result_validator import ToolResult

FAKE = str(Path(__file__).parent / "fakes" / "mcp_stdio_server.py")


def _stdio_config(mode: str = "legacy", **extra) -> dict:
    return {
        "transport": "stdio",
        "command": sys.executable,
        "args": [FAKE, mode],
        "timeout_seconds": 30,
        **extra,
    }


async def _connected_manager(mode: str = "legacy") -> MCPManager:
    manager = MCPManager()
    await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config(mode)})
    await manager.start()
    return manager


class TestSeamMapping:
    async def test_ok_outcome_maps_to_ok_toolresult_with_audit_metadata(self):
        manager = await _connected_manager()
        try:
            result = await dispatch_mcp_tool(manager, "mcp_fake_echo", {"text": "hi"})
            assert isinstance(result, ToolResult)
            assert result.ok and "echo: hi" in result.output
            assert result.audit_metadata == {
                "mcp_server": "fake",
                "mcp_tool": "echo",
                "config_generation": result.audit_metadata["config_generation"],
                "negotiated_version": "2025-06-18",
                "outcome": "ok",
            }
            assert result.audit_metadata["config_generation"] > 0
            assert not uncertain_outcome(result)
        finally:
            await manager.shutdown()

    async def test_is_error_maps_to_definite_failure(self):
        manager = await _connected_manager()
        try:
            result = await dispatch_mcp_tool(manager, "mcp_fake_fail", {})
            assert not result.ok
            assert result.error
            assert result.audit_metadata["outcome"] == "failed"
            assert not uncertain_outcome(result)
        finally:
            await manager.shutdown()

    async def test_uncertain_outcome_is_flagged_never_ok(self):
        manager = await _connected_manager("dies-mid-call")
        try:
            result = await dispatch_mcp_tool(manager, "mcp_fake_echo", {"text": "x"})
            assert not result.ok
            assert result.audit_metadata["outcome"] == "uncertain"
            assert uncertain_outcome(result)
            assert "UNKNOWN" in result.output
        finally:
            await manager.shutdown()

    async def test_unpublished_tool_is_definite_failure(self):
        manager = MCPManager()
        result = await dispatch_mcp_tool(manager, "mcp_ghost_tool", {})
        assert not result.ok
        assert "not currently published" in result.output
        assert result.audit_metadata["outcome"] == "failed"

    async def test_model_facing_cap_applies(self):
        manager = await _connected_manager()
        try:
            big = "y" * (MODEL_RESULT_CAP + 500)
            result = await dispatch_mcp_tool(manager, "mcp_fake_echo", {"text": big})
            assert result.truncated
            assert len(result.output) <= MODEL_RESULT_CAP + 64
            assert "truncated" in result.output
        finally:
            await manager.shutdown()

    async def test_audit_identifiers_are_defensively_bounded(self):
        class OversizedManager:
            async def execute(self, tool_name, tool_input):
                return MCPToolOutcome(
                    status="ok",
                    text="done",
                    server="s" * 5000,
                    tool="t" * 5000,
                    generation=1,
                    negotiated_version="2025-06-18",
                )

        result = await dispatch_mcp_tool(OversizedManager(), "mcp_x", {})
        assert len(result.audit_metadata["mcp_server"]) <= 128
        assert len(result.audit_metadata["mcp_tool"]) <= 128
        assert result.audit_metadata["mcp_server"].endswith(
            result.audit_metadata["mcp_server"].split("~")[-1]
        )

    def test_is_mcp_tool_predicate(self):
        manager = MCPManager()
        assert not is_mcp_tool(manager, "mcp_fake_echo")
        assert not is_mcp_tool(None, "mcp_fake_echo")


class TestDispatchPaths:
    async def test_loop_path_returns_seam_toolresult(self):
        # dispatch_loop_tool_inner consumes the same branch predicate; drive
        # the seam exactly as the loop path does (manager-first, executor
        # untouched for published names).
        manager = await _connected_manager()
        try:
            assert manager.has_tool("mcp_fake_echo")
            result = await dispatch_mcp_tool(manager, "mcp_fake_echo", {"text": "loop"})
            assert isinstance(result, ToolResult) and result.ok
        finally:
            await manager.shutdown()

    async def test_background_execute_tool_routes_through_seam(self):
        from src.discord.background_task import _execute_tool

        manager = await _connected_manager()
        try:
            result = await _execute_tool(
                "mcp_fake_echo",
                {"text": "bg"},
                executor=None,  # type: ignore[arg-type]  # never reached for MCP names
                skill_manager=_NoSkills(),  # type: ignore[arg-type]
                knowledge_store=None,
                embedder=None,
                requester="tester",
                mcp_manager=manager,
            )
            assert isinstance(result, ToolResult)
            assert result.ok and "echo: bg" in result.output
        finally:
            await manager.shutdown()


class _NoSkills:
    def has_skill(self, name: str) -> bool:
        return False


class TestRbacTier:
    def test_mcp_names_are_not_user_tier_tools(self):
        # MCP tools are admin-only under the current tier model: the user
        # tier's read-only allowlist must never include dynamic MCP names.
        from src.permissions.manager import USER_TIER_TOOLS

        assert not any(name.startswith("mcp_") for name in USER_TIER_TOOLS)


class TestArgumentScrubbing:
    def test_mcp_arguments_are_deep_scrubbed_for_storage(self):
        token = "ghp_" + "a" * 36  # a classic secret shape
        scrubbed = _scrub_tool_input_for_storage(
            "mcp_srv_tool",
            {"auth": token, "nested": {"key": token, "safe": "hello"}, "list": [token]},
        )
        flattened = str(scrubbed)
        assert token not in flattened
        assert "hello" in flattened

    def test_sensitive_keys_redact_opaque_values_at_any_depth(self):
        scrubbed = _scrub_tool_input_for_storage(
            "mcp_srv_tool",
            {
                "password": "hunter2",
                "nested": {
                    "api_key": "plain-secret",
                    "authorization": "Basic opaque",
                    "safe": "hello",
                },
                "items": [{"credential": {"opaque": "value"}}],
            },
        )
        flattened = str(scrubbed)
        assert "hunter2" not in flattened
        assert "plain-secret" not in flattened
        assert "Basic opaque" not in flattened
        assert "'opaque': 'value'" not in flattened
        assert "hello" in flattened

    def test_non_mcp_tools_keep_existing_behavior(self):
        untouched = {"body": "hello", "x": 1}
        assert _scrub_tool_input_for_storage("run_command", untouched) == untouched


# --- Survivors from the retired tests/test_mcp_client.py (P4):
# background-task MCP integration, modernized to the typed-outcome
# contract in P3. ---


class TestBackgroundTaskMCPIntegration:
    async def test_execute_tool_routes_to_mcp(self):
        from src.discord.background_task import _execute_tool

        mock_executor = MagicMock()
        mock_executor.config = MagicMock()
        mock_executor.config.hosts = {}

        mock_skill_mgr = MagicMock()
        mock_skill_mgr.has_skill = MagicMock(return_value=False)

        # The P3 seam consumes the control plane's typed outcome and returns
        # a structured ToolResult (callers consume .ok).
        from src.tools.mcp.outcomes import MCPToolOutcome

        mock_mcp_mgr = MagicMock()
        mock_mcp_mgr.has_tool = MagicMock(return_value=True)
        mock_mcp_mgr.execute = AsyncMock(
            return_value=MCPToolOutcome(status="ok", text="mcp result", server="srv", tool="greet")
        )

        result = await _execute_tool(
            "mcp_srv_greet",
            {"name": "Odin"},
            mock_executor,
            mock_skill_mgr,
            None,
            None,
            requester="test",
            mcp_manager=mock_mcp_mgr,
        )

        assert str(result) == "mcp result"
        assert result.ok
        mock_mcp_mgr.execute.assert_called_once_with("mcp_srv_greet", {"name": "Odin"})

    async def test_execute_tool_mcp_none_falls_through(self):
        from src.discord.background_task import _execute_tool

        mock_executor = MagicMock()
        mock_executor.config = MagicMock()
        mock_executor.config.hosts = {}
        mock_executor.execute = AsyncMock(return_value="executor result")

        mock_skill_mgr = MagicMock()
        mock_skill_mgr.has_skill = MagicMock(return_value=False)

        result = await _execute_tool(
            "run_command",
            {"command": "echo hi", "host": "local"},
            mock_executor,
            mock_skill_mgr,
            None,
            None,
            requester="test",
            mcp_manager=None,
        )

        assert result == "executor result"

    async def test_execute_tool_skill_takes_priority_over_mcp(self):
        from src.discord.background_task import _execute_tool

        mock_executor = MagicMock()
        mock_executor.config = MagicMock()
        mock_executor.config.hosts = {}

        mock_skill_mgr = MagicMock()
        mock_skill_mgr.has_skill = MagicMock(return_value=True)
        mock_skill_mgr.execute = AsyncMock(return_value="skill result")

        mock_mcp_mgr = MagicMock()
        mock_mcp_mgr.has_tool = MagicMock(return_value=True)
        mock_mcp_mgr.execute = AsyncMock(return_value="mcp result")

        result = await _execute_tool(
            "some_tool",
            {},
            mock_executor,
            mock_skill_mgr,
            None,
            None,
            requester="test",
            mcp_manager=mock_mcp_mgr,
        )

        assert result == "skill result"
        mock_mcp_mgr.execute.assert_not_called()

    async def test_execute_tool_mcp_false_falls_to_executor(self):
        from src.discord.background_task import _execute_tool

        mock_executor = MagicMock()
        mock_executor.config = MagicMock()
        mock_executor.config.hosts = {}
        mock_executor.execute = AsyncMock(return_value="executor result")

        mock_skill_mgr = MagicMock()
        mock_skill_mgr.has_skill = MagicMock(return_value=False)

        mock_mcp_mgr = MagicMock()
        mock_mcp_mgr.has_tool = MagicMock(return_value=False)

        result = await _execute_tool(
            "run_command",
            {"command": "echo hi", "host": "local"},
            mock_executor,
            mock_skill_mgr,
            None,
            None,
            requester="test",
            mcp_manager=mock_mcp_mgr,
        )

        assert result == "executor result"
        mock_mcp_mgr.execute.assert_not_called()
