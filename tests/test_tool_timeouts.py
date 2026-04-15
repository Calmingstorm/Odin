"""Tests for per-tool timeouts (Round 7).

Tests the ToolsConfig.tool_timeouts field, get_tool_timeout() method,
ToolExecutor per-tool timeout enforcement, agent manager per-tool timeout
propagation, skill manager per-tool timeout support, and REST API endpoints.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.config.schema import ToolsConfig, Config


# ---------------------------------------------------------------------------
# ToolsConfig.tool_timeouts
# ---------------------------------------------------------------------------

class TestToolsConfigToolTimeouts:
    def test_default_empty(self):
        config = ToolsConfig()
        assert config.tool_timeouts == {}

    def test_custom_values(self):
        config = ToolsConfig(tool_timeouts={"claude_code": 600, "read_file": 30})
        assert config.tool_timeouts == {"claude_code": 600, "read_file": 30}

    def test_old_tool_timeout_seconds_removed(self):
        config = ToolsConfig()
        assert not hasattr(config, "tool_timeout_seconds")

    def test_from_dict(self):
        data = {"tool_timeouts": {"run_command": 120}}
        config = ToolsConfig(**data)
        assert config.tool_timeouts == {"run_command": 120}

    def test_empty_dict_explicit(self):
        config = ToolsConfig(tool_timeouts={})
        assert config.tool_timeouts == {}


class TestGetToolTimeout:
    def test_no_overrides_returns_default(self):
        config = ToolsConfig(command_timeout_seconds=300)
        assert config.get_tool_timeout("run_command") == 300

    def test_override_returns_custom(self):
        config = ToolsConfig(
            command_timeout_seconds=300,
            tool_timeouts={"claude_code": 600},
        )
        assert config.get_tool_timeout("claude_code") == 600

    def test_non_overridden_returns_default(self):
        config = ToolsConfig(
            command_timeout_seconds=300,
            tool_timeouts={"claude_code": 600},
        )
        assert config.get_tool_timeout("read_file") == 300

    def test_multiple_overrides(self):
        config = ToolsConfig(
            command_timeout_seconds=300,
            tool_timeouts={"claude_code": 600, "read_file": 30, "run_script": 120},
        )
        assert config.get_tool_timeout("claude_code") == 600
        assert config.get_tool_timeout("read_file") == 30
        assert config.get_tool_timeout("run_script") == 120
        assert config.get_tool_timeout("write_file") == 300

    def test_custom_default(self):
        config = ToolsConfig(command_timeout_seconds=60)
        assert config.get_tool_timeout("anything") == 60


# ---------------------------------------------------------------------------
# ToolExecutor uses per-tool timeout
# ---------------------------------------------------------------------------

class TestExecutorPerToolTimeout:
    @pytest.fixture
    def executor(self):
        from src.tools.executor import ToolExecutor
        config = ToolsConfig(
            command_timeout_seconds=300,
            tool_timeouts={"run_command": 60},
        )
        return ToolExecutor(config=config)

    async def test_uses_per_tool_timeout(self, executor):
        """Tool with a custom timeout uses that timeout, not the global default."""
        async def slow_handler(tool_input):
            return "ok"

        executor._handle_run_command = slow_handler
        timeouts_used = []
        original_wait = asyncio.wait_for

        async def tracking_wait(coro, *, timeout=None):
            timeouts_used.append(timeout)
            return await original_wait(coro, timeout=timeout)

        with patch("asyncio.wait_for", side_effect=tracking_wait):
            await executor.execute("run_command", {"command": "echo hi"})
        assert 60 in timeouts_used

    async def test_uses_global_default_for_unconfigured_tool(self, executor):
        """Tool without a custom timeout uses the global default."""
        async def handler(tool_input):
            return "ok"

        executor._handle_read_file = handler
        timeouts_used = []
        original_wait = asyncio.wait_for

        async def tracking_wait(coro, *, timeout=None):
            timeouts_used.append(timeout)
            return await original_wait(coro, timeout=timeout)

        with patch("asyncio.wait_for", side_effect=tracking_wait):
            await executor.execute("read_file", {})
        assert 300 in timeouts_used

    async def test_timeout_fires_with_per_tool_value(self, executor):
        """When a tool times out, the error message uses the per-tool timeout value."""
        async def slow_handler(tool_input):
            await asyncio.sleep(100)
            return "ok"

        executor._handle_run_command = slow_handler

        def close_and_raise(coro, *, timeout=None):
            coro.close()
            raise asyncio.TimeoutError

        with patch("asyncio.wait_for", side_effect=close_and_raise):
            result = await executor.execute("run_command", {"command": "sleep 100"})
            assert "timed out after 60s" in result

    async def test_timeout_message_uses_global_when_no_override(self, executor):
        """When a non-overridden tool times out, the error uses the global default."""
        async def slow_handler(tool_input):
            await asyncio.sleep(100)
            return "ok"

        executor._handle_write_file = slow_handler

        def close_and_raise(coro, *, timeout=None):
            coro.close()
            raise asyncio.TimeoutError

        with patch("asyncio.wait_for", side_effect=close_and_raise):
            result = await executor.execute("write_file", {})
            assert "timed out after 300s" in result

    async def test_metrics_recorded_on_timeout(self, executor):
        """Timeout metrics are recorded when a per-tool timeout fires."""
        async def slow_handler(tool_input):
            await asyncio.sleep(100)

        executor._handle_run_command = slow_handler

        def close_and_raise(coro, *, timeout=None):
            coro.close()
            raise asyncio.TimeoutError

        with patch("asyncio.wait_for", side_effect=close_and_raise):
            await executor.execute("run_command", {"command": "slow"})
            metrics = executor.get_metrics()
            assert metrics["run_command"]["timeouts"] == 1


# ---------------------------------------------------------------------------
# Agent manager per-tool timeouts
# ---------------------------------------------------------------------------

class TestAgentPerToolTimeout:
    async def test_spawn_accepts_tool_timeouts(self):
        from src.agents.manager import AgentManager
        mgr = AgentManager()
        iter_cb = AsyncMock(return_value={
            "text": "done", "tool_calls": [], "stop_reason": "end_turn",
        })
        tool_cb = AsyncMock(return_value="ok")
        agent_id = mgr.spawn(
            label="test",
            goal="do something",
            channel_id="ch1",
            requester_id="u1",
            requester_name="user",
            iteration_callback=iter_cb,
            tool_executor_callback=tool_cb,
            tool_timeouts={"run_command": 60},
        )
        assert not agent_id.startswith("Error")
        mgr.kill(agent_id)

    async def test_agent_uses_per_tool_timeout(self):
        from src.agents.manager import _run_agent, AgentInfo, TOOL_EXEC_TIMEOUT
        import time

        agent = AgentInfo(
            id="test1", label="test", goal="test", channel_id="ch1",
            requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]

        call_count = 0
        tool_timeouts_used = []

        async def iter_cb(msgs, sys, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {
                    "text": "",
                    "tool_calls": [{"name": "run_command", "input": {"command": "echo hi"}}],
                    "stop_reason": "tool_use",
                }
            return {"text": "done", "tool_calls": [], "stop_reason": "end_turn"}

        original_wait_for = asyncio.wait_for

        async def tracking_wait_for(coro, *, timeout=None):
            tool_timeouts_used.append(timeout)
            return await original_wait_for(coro, timeout=timeout)

        tool_cb = AsyncMock(return_value="output")

        with patch("src.agents.manager.asyncio.wait_for", side_effect=tracking_wait_for):
            await _run_agent(
                agent=agent,
                system_prompt="test",
                tools=[],
                iteration_callback=iter_cb,
                tool_executor_callback=tool_cb,
                tool_timeouts={"run_command": 45},
            )
        # The tool timeout for run_command should be 45, not TOOL_EXEC_TIMEOUT
        assert 45 in tool_timeouts_used

    async def test_agent_default_timeout_without_override(self):
        from src.agents.manager import _run_agent, AgentInfo, TOOL_EXEC_TIMEOUT

        agent = AgentInfo(
            id="test2", label="test", goal="test", channel_id="ch1",
            requester_id="u1", requester_name="user",
        )
        agent.messages = [{"role": "user", "content": "test"}]

        call_count = 0
        tool_timeouts_used = []

        async def iter_cb(msgs, sys, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {
                    "text": "",
                    "tool_calls": [{"name": "read_file", "input": {}}],
                    "stop_reason": "tool_use",
                }
            return {"text": "done", "tool_calls": [], "stop_reason": "end_turn"}

        original_wait_for = asyncio.wait_for

        async def tracking_wait_for(coro, *, timeout=None):
            tool_timeouts_used.append(timeout)
            return await original_wait_for(coro, timeout=timeout)

        tool_cb = AsyncMock(return_value="content")

        with patch("src.agents.manager.asyncio.wait_for", side_effect=tracking_wait_for):
            await _run_agent(
                agent=agent,
                system_prompt="test",
                tools=[],
                iteration_callback=iter_cb,
                tool_executor_callback=tool_cb,
                tool_timeouts={},
            )
        # Should use TOOL_EXEC_TIMEOUT for non-overridden tool
        assert TOOL_EXEC_TIMEOUT in tool_timeouts_used


# ---------------------------------------------------------------------------
# Skill manager per-tool timeout
# ---------------------------------------------------------------------------

class TestSkillManagerPerToolTimeout:
    def test_accepts_tool_timeouts(self, tmp_path):
        from src.tools.skill_manager import SkillManager
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()
        mgr = SkillManager(
            str(tmp_path), executor, tool_timeouts={"my_skill": 30},
        )
        assert mgr._tool_timeouts == {"my_skill": 30}

    def test_default_empty_timeouts(self, tmp_path):
        from src.tools.skill_manager import SkillManager
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()
        mgr = SkillManager(str(tmp_path), executor)
        assert mgr._tool_timeouts == {}


# ---------------------------------------------------------------------------
# Config YAML compatibility
# ---------------------------------------------------------------------------

class TestConfigYAMLCompat:
    def test_tools_config_without_tool_timeouts(self):
        config = ToolsConfig()
        assert config.tool_timeouts == {}
        assert config.get_tool_timeout("any") == 300

    def test_tools_config_with_tool_timeouts(self):
        config = ToolsConfig(tool_timeouts={"claude_code": 600, "run_script": 120})
        assert config.get_tool_timeout("claude_code") == 600
        assert config.get_tool_timeout("run_script") == 120
        assert config.get_tool_timeout("run_command") == 300

    def test_full_config_with_tool_timeouts(self):
        config = Config(
            discord={"token": "test"},
            tools={"tool_timeouts": {"claude_code": 600}},
        )
        assert config.tools.get_tool_timeout("claude_code") == 600
        assert config.tools.get_tool_timeout("run_command") == 300

    def test_full_config_without_tool_timeouts(self):
        config = Config(discord={"token": "test"})
        assert config.tools.tool_timeouts == {}

    def test_model_dump_includes_tool_timeouts(self):
        config = ToolsConfig(tool_timeouts={"claude_code": 600})
        dumped = config.model_dump()
        assert dumped["tool_timeouts"] == {"claude_code": 600}


# ---------------------------------------------------------------------------
# REST API endpoints
# ---------------------------------------------------------------------------

class TestToolTimeoutsAPI:
    def _make_app(self, bot):
        from aiohttp import web
        from src.tools.registry import get_tool_definitions

        app = web.Application()
        routes = web.RouteTableDef()

        @routes.get("/api/tools/timeouts")
        async def get_tool_timeouts(_request):
            tools_config = bot.config.tools
            return web.json_response({
                "default_timeout": tools_config.command_timeout_seconds,
                "overrides": tools_config.tool_timeouts,
            })

        @routes.put("/api/tools/timeouts")
        async def set_tool_timeouts(request):
            try:
                body = await request.json()
            except Exception:
                return web.json_response({"error": "invalid JSON"}, status=400)
            if not isinstance(body, dict):
                return web.json_response({"error": "expected JSON object"}, status=400)
            overrides = body.get("overrides")
            if overrides is not None:
                if not isinstance(overrides, dict):
                    return web.json_response({"error": "overrides must be a dict"}, status=400)
                for k, v in overrides.items():
                    if not isinstance(k, str) or not isinstance(v, (int, float)) or v <= 0:
                        return web.json_response(
                            {"error": f"invalid timeout for '{k}': must be a positive number"}, status=400,
                        )
                bot.config.tools.tool_timeouts = {k: int(v) for k, v in overrides.items()}
            default = body.get("default_timeout")
            if default is not None:
                if not isinstance(default, (int, float)) or default <= 0:
                    return web.json_response({"error": "default_timeout must be a positive number"}, status=400)
                bot.config.tools.command_timeout_seconds = int(default)
            return web.json_response({
                "default_timeout": bot.config.tools.command_timeout_seconds,
                "overrides": bot.config.tools.tool_timeouts,
            })

        @routes.get("/api/tools")
        async def list_tools(_request):
            tools_config = bot.config.tools
            all_tools = get_tool_definitions()
            result = [
                {
                    "name": t["name"],
                    "description": t["description"],
                    "timeout": tools_config.get_tool_timeout(t["name"]),
                }
                for t in all_tools
            ]
            return web.json_response(result)

        app.router.add_routes(routes)
        return app

    def _make_bot(self):
        bot = MagicMock()
        bot.config = Config(
            discord={"token": "test"},
            tools={"tool_timeouts": {"claude_code": 600}, "command_timeout_seconds": 300},
        )
        return bot

    async def test_get_timeouts(self):
        from aiohttp.test_utils import TestClient, TestServer
        bot = self._make_bot()
        async with TestClient(TestServer(self._make_app(bot))) as client:
            resp = await client.get("/api/tools/timeouts")
            assert resp.status == 200
            data = await resp.json()
            assert data["default_timeout"] == 300
            assert data["overrides"] == {"claude_code": 600}

    async def test_set_overrides(self):
        from aiohttp.test_utils import TestClient, TestServer
        bot = self._make_bot()
        async with TestClient(TestServer(self._make_app(bot))) as client:
            resp = await client.put(
                "/api/tools/timeouts",
                json={"overrides": {"run_command": 120, "read_file": 30}},
            )
            assert resp.status == 200
            data = await resp.json()
            assert data["overrides"] == {"run_command": 120, "read_file": 30}
            assert bot.config.tools.tool_timeouts == {"run_command": 120, "read_file": 30}

    async def test_set_default_timeout(self):
        from aiohttp.test_utils import TestClient, TestServer
        bot = self._make_bot()
        async with TestClient(TestServer(self._make_app(bot))) as client:
            resp = await client.put(
                "/api/tools/timeouts",
                json={"default_timeout": 60},
            )
            assert resp.status == 200
            data = await resp.json()
            assert data["default_timeout"] == 60
            assert bot.config.tools.command_timeout_seconds == 60

    async def test_set_invalid_override_rejected(self):
        from aiohttp.test_utils import TestClient, TestServer
        bot = self._make_bot()
        async with TestClient(TestServer(self._make_app(bot))) as client:
            resp = await client.put(
                "/api/tools/timeouts",
                json={"overrides": {"bad_tool": -5}},
            )
            assert resp.status == 400

    async def test_set_invalid_default_rejected(self):
        from aiohttp.test_utils import TestClient, TestServer
        bot = self._make_bot()
        async with TestClient(TestServer(self._make_app(bot))) as client:
            resp = await client.put(
                "/api/tools/timeouts",
                json={"default_timeout": 0},
            )
            assert resp.status == 400

    async def test_set_non_dict_overrides_rejected(self):
        from aiohttp.test_utils import TestClient, TestServer
        bot = self._make_bot()
        async with TestClient(TestServer(self._make_app(bot))) as client:
            resp = await client.put(
                "/api/tools/timeouts",
                json={"overrides": "not a dict"},
            )
            assert resp.status == 400

    async def test_list_tools_includes_timeout(self):
        from aiohttp.test_utils import TestClient, TestServer
        bot = self._make_bot()
        async with TestClient(TestServer(self._make_app(bot))) as client:
            resp = await client.get("/api/tools")
            assert resp.status == 200
            data = await resp.json()
            tool_map = {t["name"]: t for t in data}
            assert tool_map["claude_code"]["timeout"] == 600
            assert tool_map["run_command"]["timeout"] == 300


# ---------------------------------------------------------------------------
# Integration: executor + config round-trip
# ---------------------------------------------------------------------------

class TestExecutorConfigIntegration:
    async def test_executor_reads_config_tool_timeouts(self):
        from src.tools.executor import ToolExecutor
        config = ToolsConfig(
            command_timeout_seconds=300,
            tool_timeouts={"run_command": 60, "claude_code": 600},
        )
        executor = ToolExecutor(config=config)

        async def echo_handler(tool_input):
            return f"ok: {tool_input}"

        executor._handle_run_command = echo_handler
        result = await executor.execute("run_command", {"command": "echo test"})
        assert result == "ok: {'command': 'echo test'}"

    async def test_executor_config_change_reflected_immediately(self):
        from src.tools.executor import ToolExecutor
        config = ToolsConfig(command_timeout_seconds=300)
        executor = ToolExecutor(config=config)

        # No custom timeout initially
        assert config.get_tool_timeout("run_command") == 300

        # Add a custom timeout
        config.tool_timeouts["run_command"] = 60
        assert config.get_tool_timeout("run_command") == 60

        # Executor reads from config live
        timeout_used = []

        async def handler(tool_input):
            return "ok"

        executor._handle_run_command = handler

        original_wait = asyncio.wait_for
        async def tracking_wait(coro, *, timeout=None):
            timeout_used.append(timeout)
            return await original_wait(coro, timeout=timeout)

        with patch("asyncio.wait_for", side_effect=tracking_wait):
            await executor.execute("run_command", {})
        assert 60 in timeout_used


# ---------------------------------------------------------------------------
# Backward compatibility: old tool_timeout_seconds field gone
# ---------------------------------------------------------------------------

class TestBackwardCompat:
    def test_tool_timeout_seconds_not_present(self):
        config = ToolsConfig()
        dumped = config.model_dump()
        assert "tool_timeout_seconds" not in dumped

    def test_command_timeout_seconds_still_works(self):
        config = ToolsConfig(command_timeout_seconds=120)
        assert config.command_timeout_seconds == 120
        assert config.get_tool_timeout("anything") == 120
