"""Tests for recovery-before-escalation: transient tool failure auto-healing.

Covers:
- Error classification (classify_error, classify_exception)
- Recovery delays per category
- RecoveryStats tracking
- ToolExecutor integration (retry on transient errors, skip permanent errors)
- Agent per-iteration recovery reset
- REST API endpoints
- Config integration
"""
from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.tools.recovery import (
    RecoveryCategory,
    RecoveryEvent,
    RecoveryStats,
    UNSAFE_TO_RETRY,
    _CATEGORY_DELAYS,
    _ERROR_PREFIXES,
    _RECOVERABLE_PATTERNS,
    classify_error,
    classify_exception,
    get_retry_delay,
)


# ====================================================================
# classify_error — result-string classification
# ====================================================================

class TestClassifyError:
    def test_ssh_connection_refused(self):
        result = "Command failed (exit 255):\nConnection refused"
        assert classify_error(result) == RecoveryCategory.SSH_TRANSIENT

    def test_ssh_connection_reset(self):
        result = "Command failed (exit 255):\nssh: Connection reset by peer"
        assert classify_error(result) == RecoveryCategory.SSH_TRANSIENT

    def test_ssh_connection_timed_out(self):
        result = "Command failed (exit 255):\nConnection timed out"
        assert classify_error(result) == RecoveryCategory.SSH_TRANSIENT

    def test_ssh_no_route(self):
        result = "Command failed (exit 255):\nNo route to host"
        assert classify_error(result) == RecoveryCategory.SSH_TRANSIENT

    def test_ssh_network_unreachable(self):
        result = "Command failed (exit 255):\nNetwork is unreachable"
        assert classify_error(result) == RecoveryCategory.SSH_TRANSIENT

    def test_ssh_exchange_identification(self):
        result = "Error executing run_command: ssh_exchange_identification: read: Connection reset"
        assert classify_error(result) == RecoveryCategory.SSH_TRANSIENT

    def test_kex_exchange(self):
        result = "Error: kex_exchange_identification: Connection closed"
        assert classify_error(result) == RecoveryCategory.SSH_TRANSIENT

    def test_connection_reset_error(self):
        result = "Error executing read_file: ConnectionResetError"
        assert classify_error(result) == RecoveryCategory.CONNECTION_ERROR

    def test_connection_refused_error(self):
        result = "Error executing http_probe: ConnectionRefusedError: target host refused"
        assert classify_error(result) == RecoveryCategory.CONNECTION_ERROR

    def test_broken_pipe(self):
        result = "Error executing run_command: BrokenPipeError"
        assert classify_error(result) == RecoveryCategory.CONNECTION_ERROR

    def test_server_disconnected(self):
        result = "Error: ServerDisconnectedError"
        assert classify_error(result) == RecoveryCategory.CONNECTION_ERROR

    def test_client_connector_error(self):
        result = "Error executing http_probe: ClientConnectorError: connection failed"
        assert classify_error(result) == RecoveryCategory.CONNECTION_ERROR

    def test_client_os_error(self):
        result = "Error: ClientOSError: socket error"
        assert classify_error(result) == RecoveryCategory.CONNECTION_ERROR

    def test_database_locked(self):
        result = "Error executing search_knowledge: database is locked"
        assert classify_error(result) == RecoveryCategory.RESOURCE_BUSY

    def test_resource_temporarily_unavailable(self):
        result = "Error: resource temporarily unavailable"
        assert classify_error(result) == RecoveryCategory.RESOURCE_BUSY

    def test_resource_temporarily_unavailable_capitalized(self):
        result = "Error: Resource temporarily unavailable"
        assert classify_error(result) == RecoveryCategory.RESOURCE_BUSY

    def test_bulkhead_full(self):
        result = "Command failed (exit 1):\nError: SSH bulkhead full — too many concurrent SSH commands"
        assert classify_error(result) == RecoveryCategory.BULKHEAD_FULL

    def test_rate_limit_exceeded(self):
        result = "Error: rate limit exceeded for API"
        assert classify_error(result) == RecoveryCategory.RATE_LIMITED

    def test_rate_limit_error(self):
        result = "Error executing run_command: RateLimitError"
        assert classify_error(result) == RecoveryCategory.RATE_LIMITED

    def test_too_many_requests(self):
        result = "Error: Too Many Requests"
        assert classify_error(result) == RecoveryCategory.RATE_LIMITED

    def test_timeout_skipped(self):
        """Timeout errors are NOT recoverable at the result level (they have _SKIP_RESULT_CATEGORIES)."""
        result = "Error: tool 'run_command' timed out after 300s"
        cat = classify_error(result)
        # timed out is in _SKIP_RESULT_CATEGORIES for classify_error
        assert cat is None or cat == RecoveryCategory.TIMEOUT

    def test_normal_output_not_classified(self):
        result = "OK: all services running"
        assert classify_error(result) is None

    def test_command_output_with_error_text(self):
        """Normal command output that happens to contain error-like text."""
        result = "nginx access log: Connection refused in line 42"
        assert classify_error(result) is None

    def test_permission_denied_classified_for_hint(self):
        """Policy-driven recovery: permission denied is now classified for
        HINT_AND_ESCALATE (not retried, but the LLM gets a useful hint)."""
        from src.tools.recovery import RecoveryCategory, RecoveryStrategy, get_policy
        result = "Error: Permission denied"
        cat = classify_error(result)
        assert cat == RecoveryCategory.PERMISSION_DENIED
        policy = get_policy(cat)
        assert policy.strategy == RecoveryStrategy.HINT_AND_ESCALATE
        assert policy.hint  # non-empty

    def test_file_not_found_classified_for_hint(self):
        from src.tools.recovery import RecoveryCategory, RecoveryStrategy, get_policy
        result = "Error: No such file or directory"
        cat = classify_error(result)
        assert cat == RecoveryCategory.NOT_FOUND
        assert get_policy(cat).strategy == RecoveryStrategy.HINT_AND_ESCALATE

    def test_unknown_tool_not_recoverable(self):
        result = "Unknown tool: fake_tool"
        assert classify_error(result) is None

    def test_none_input(self):
        assert classify_error(None) is None

    def test_integer_input(self):
        assert classify_error(42) is None

    def test_empty_string(self):
        assert classify_error("") is None


# ====================================================================
# classify_exception — exception-string classification
# ====================================================================

class TestClassifyException:
    def test_connection_refused(self):
        assert classify_exception("Connection refused") == RecoveryCategory.SSH_TRANSIENT

    def test_connection_reset_error(self):
        assert classify_exception("ConnectionResetError: peer closed") == RecoveryCategory.CONNECTION_ERROR

    def test_database_locked(self):
        assert classify_exception("database is locked") == RecoveryCategory.RESOURCE_BUSY

    def test_timed_out(self):
        assert classify_exception("Operation timed out") == RecoveryCategory.TIMEOUT

    def test_bulkhead_full(self):
        assert classify_exception("bulkhead full") == RecoveryCategory.BULKHEAD_FULL

    def test_rate_limit(self):
        assert classify_exception("rate limit exceeded") == RecoveryCategory.RATE_LIMITED

    def test_no_prefix_needed(self):
        """classify_exception does NOT require error prefixes."""
        assert classify_exception("Connection refused") == RecoveryCategory.SSH_TRANSIENT

    def test_unrecognized_error(self):
        assert classify_exception("KeyError: 'missing_key'") is None

    def test_none_input(self):
        assert classify_exception(None) is None

    def test_empty_string(self):
        assert classify_exception("") is None


# ====================================================================
# get_retry_delay
# ====================================================================

class TestGetRetryDelay:
    def test_ssh_transient_delay(self):
        assert get_retry_delay(RecoveryCategory.SSH_TRANSIENT) == 2.0

    def test_connection_error_delay(self):
        assert get_retry_delay(RecoveryCategory.CONNECTION_ERROR) == 1.0

    def test_resource_busy_delay(self):
        assert get_retry_delay(RecoveryCategory.RESOURCE_BUSY) == 1.0

    def test_timeout_delay(self):
        assert get_retry_delay(RecoveryCategory.TIMEOUT) == 0.0

    def test_rate_limited_delay(self):
        assert get_retry_delay(RecoveryCategory.RATE_LIMITED) == 2.0

    def test_bulkhead_full_delay(self):
        assert get_retry_delay(RecoveryCategory.BULKHEAD_FULL) == 1.0

    def test_all_categories_have_delays(self):
        for cat in RecoveryCategory:
            assert isinstance(get_retry_delay(cat), float)


# ====================================================================
# RecoveryCategory enum
# ====================================================================

class TestRecoveryCategory:
    def test_all_categories_defined(self):
        expected = {
            "ssh_transient", "connection_error", "resource_busy",
            "timeout", "rate_limited", "bulkhead_full",
            # policy-driven additions
            "auth_failure", "not_found", "disk_full",
            "dependency_missing", "permission_denied",
        }
        assert {c.value for c in RecoveryCategory} == expected

    def test_str_enum(self):
        assert RecoveryCategory.SSH_TRANSIENT == "ssh_transient"
        assert isinstance(RecoveryCategory.SSH_TRANSIENT, str)

    def test_all_categories_have_patterns(self):
        for cat in RecoveryCategory:
            assert cat in _RECOVERABLE_PATTERNS
            assert len(_RECOVERABLE_PATTERNS[cat]) > 0

    def test_all_categories_have_policies(self):
        """Every category must map to an explicit policy (default fallback is NO_ACTION)."""
        from src.tools.recovery import get_policy
        for cat in RecoveryCategory:
            policy = get_policy(cat)
            assert policy is not None


# ====================================================================
# RecoveryStats
# ====================================================================

class TestRecoveryStats:
    def test_initial_state(self):
        stats = RecoveryStats()
        summary = stats.get_summary()
        assert summary["totals"]["attempts"] == 0
        assert summary["totals"]["successes"] == 0
        assert summary["totals"]["failures"] == 0
        assert summary["by_category"] == {}
        assert summary["by_tool"] == {}

    def test_record_attempt(self):
        stats = RecoveryStats()
        stats.record_attempt("run_command", RecoveryCategory.SSH_TRANSIENT, "conn refused")
        summary = stats.get_summary()
        assert summary["totals"]["attempts"] == 1
        assert summary["by_category"]["ssh_transient"]["attempts"] == 1
        assert summary["by_tool"]["run_command"]["attempts"] == 1

    def test_record_success(self):
        stats = RecoveryStats()
        stats.record_attempt("run_command", RecoveryCategory.SSH_TRANSIENT)
        stats.record_success("run_command", RecoveryCategory.SSH_TRANSIENT, "recovered")
        summary = stats.get_summary()
        assert summary["totals"]["successes"] == 1
        assert summary["by_category"]["ssh_transient"]["successes"] == 1
        assert summary["by_tool"]["run_command"]["successes"] == 1

    def test_record_failure(self):
        stats = RecoveryStats()
        stats.record_attempt("read_file", RecoveryCategory.RESOURCE_BUSY)
        stats.record_failure("read_file", RecoveryCategory.RESOURCE_BUSY, "still locked")
        summary = stats.get_summary()
        assert summary["totals"]["failures"] == 1
        assert summary["by_category"]["resource_busy"]["failures"] == 1

    def test_multiple_tools(self):
        stats = RecoveryStats()
        stats.record_attempt("run_command", RecoveryCategory.SSH_TRANSIENT)
        stats.record_success("run_command", RecoveryCategory.SSH_TRANSIENT)
        stats.record_attempt("read_file", RecoveryCategory.RESOURCE_BUSY)
        stats.record_failure("read_file", RecoveryCategory.RESOURCE_BUSY)
        summary = stats.get_summary()
        assert summary["totals"]["attempts"] == 2
        assert summary["totals"]["successes"] == 1
        assert summary["totals"]["failures"] == 1
        assert len(summary["by_tool"]) == 2

    def test_get_recent(self):
        stats = RecoveryStats()
        stats.record_success("t1", RecoveryCategory.SSH_TRANSIENT, "err1")
        stats.record_failure("t2", RecoveryCategory.RESOURCE_BUSY, "err2")
        recent = stats.get_recent(10)
        assert len(recent) == 2
        assert recent[0]["tool"] == "t1"
        assert recent[0]["succeeded"] is True
        assert recent[1]["tool"] == "t2"
        assert recent[1]["succeeded"] is False

    def test_get_recent_limit(self):
        stats = RecoveryStats()
        for i in range(10):
            stats.record_success(f"t{i}", RecoveryCategory.SSH_TRANSIENT)
        recent = stats.get_recent(3)
        assert len(recent) == 3

    def test_recent_max_cap(self):
        stats = RecoveryStats(max_recent=5)
        for i in range(10):
            stats.record_success(f"t{i}", RecoveryCategory.SSH_TRANSIENT)
        assert len(stats._recent) == 5

    def test_reset(self):
        stats = RecoveryStats()
        stats.record_attempt("t1", RecoveryCategory.SSH_TRANSIENT)
        stats.record_success("t1", RecoveryCategory.SSH_TRANSIENT)
        stats.reset()
        summary = stats.get_summary()
        assert summary["totals"]["attempts"] == 0
        assert summary["totals"]["successes"] == 0
        assert len(stats.get_recent()) == 0

    def test_recent_event_has_timestamp(self):
        stats = RecoveryStats()
        before = time.time()
        stats.record_success("t1", RecoveryCategory.SSH_TRANSIENT, "err")
        after = time.time()
        recent = stats.get_recent()
        assert before <= recent[0]["timestamp"] <= after

    def test_summary_categories_sorted(self):
        stats = RecoveryStats()
        stats.record_attempt("t1", RecoveryCategory.BULKHEAD_FULL)
        stats.record_attempt("t2", RecoveryCategory.SSH_TRANSIENT)
        summary = stats.get_summary()
        cats = list(summary["by_category"].keys())
        assert cats == sorted(cats)

    def test_summary_tools_sorted(self):
        stats = RecoveryStats()
        stats.record_attempt("z_tool", RecoveryCategory.SSH_TRANSIENT)
        stats.record_attempt("a_tool", RecoveryCategory.SSH_TRANSIENT)
        summary = stats.get_summary()
        tools = list(summary["by_tool"].keys())
        assert tools == sorted(tools)


# ====================================================================
# RecoveryEvent dataclass
# ====================================================================

class TestRecoveryEvent:
    def test_fields(self):
        e = RecoveryEvent("run_command", "ssh_transient", True, 1234.0, "conn refused")
        assert e.tool_name == "run_command"
        assert e.category == "ssh_transient"
        assert e.succeeded is True
        assert e.timestamp == 1234.0
        assert e.error_snippet == "conn refused"

    def test_default_snippet(self):
        e = RecoveryEvent("t1", "timeout", False, 0.0)
        assert e.error_snippet == ""


# ====================================================================
# Constants coverage
# ====================================================================

class TestConstants:
    def test_error_prefixes_are_strings(self):
        for p in _ERROR_PREFIXES:
            assert isinstance(p, str)

    def test_all_patterns_are_tuples(self):
        for cat, patterns in _RECOVERABLE_PATTERNS.items():
            assert isinstance(patterns, tuple)
            for p in patterns:
                assert isinstance(p, str)


# ====================================================================
# ToolExecutor._check_recoverable
# ====================================================================

class TestCheckRecoverable:
    def setup_method(self):
        from src.tools.executor import ToolExecutor
        self.check = ToolExecutor._check_recoverable

    def test_ssh_connection_refused(self):
        result = "Error executing run_command: Connection refused"
        assert self.check(result) == RecoveryCategory.SSH_TRANSIENT

    def test_bulkhead_full(self):
        result = "Command failed (exit 1):\nError: SSH bulkhead full"
        assert self.check(result) == RecoveryCategory.BULKHEAD_FULL

    def test_database_locked(self):
        result = "Error: database is locked"
        assert self.check(result) == RecoveryCategory.RESOURCE_BUSY

    def test_timeout_skipped(self):
        result = "Error: tool 'run_command' timed out after 300s"
        assert self.check(result) is None

    def test_normal_output(self):
        assert self.check("all good") is None

    def test_permanent_error(self):
        assert self.check("Error: file not found") is None

    def test_none(self):
        assert self.check(None) is None

    def test_connection_error_via_exception_path(self):
        result = "Error executing http_probe: ClientConnectorError"
        assert self.check(result) == RecoveryCategory.CONNECTION_ERROR


# ====================================================================
# ToolExecutor integration — recovery on transient errors
# ====================================================================

class TestExecutorRecovery:
    @pytest.fixture
    def executor(self):
        from src.config.schema import ToolsConfig
        from src.tools.executor import ToolExecutor
        config = ToolsConfig(command_timeout_seconds=5)
        return ToolExecutor(config=config)

    @pytest.mark.asyncio
    async def test_recovery_success_on_transient_error(self, executor):
        """First call fails with transient error, retry succeeds."""
        call_count = 0
        async def _handler(inp):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise ConnectionError("ConnectionResetError: peer closed")
            return "success"

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {})
        assert result == "success"
        assert call_count == 2
        summary = executor.recovery_stats.get_summary()
        assert summary["totals"]["attempts"] == 1
        assert summary["totals"]["successes"] == 1

    @pytest.mark.asyncio
    async def test_recovery_failure_on_persistent_error(self, executor):
        """Both attempts fail with transient error."""
        async def _handler(inp):
            raise ConnectionError("ConnectionResetError: peer closed")

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {})
        assert "ConnectionResetError" in result
        summary = executor.recovery_stats.get_summary()
        assert summary["totals"]["attempts"] == 1
        assert summary["totals"]["failures"] == 1

    @pytest.mark.asyncio
    async def test_no_recovery_on_permanent_error(self, executor):
        """Permanent errors are not retried."""
        call_count = 0
        async def _handler(inp):
            nonlocal call_count
            call_count += 1
            raise ValueError("invalid argument")

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {})
        assert "invalid argument" in result
        assert call_count == 1
        assert executor.recovery_stats.get_summary()["totals"]["attempts"] == 0

    @pytest.mark.asyncio
    async def test_no_recovery_on_timeout(self, executor):
        """Timeouts are excluded from tool-level recovery."""
        call_count = 0
        async def _handler(inp):
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(100)

        executor.config = MagicMock()
        executor.config.get_tool_timeout.return_value = 0.1
        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {})
        assert "timed out" in result
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_recovery_disabled_via_config(self):
        """When recovery.enabled=False, no retry happens."""
        from src.config.schema import RecoveryConfig, ToolsConfig
        from src.tools.executor import ToolExecutor
        config = ToolsConfig(recovery=RecoveryConfig(enabled=False))
        executor = ToolExecutor(config=config)

        call_count = 0
        async def _handler(inp):
            nonlocal call_count
            call_count += 1
            raise ConnectionError("ConnectionResetError")

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {})
        assert "ConnectionResetError" in result
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_recovery_on_result_string_error(self, executor):
        """Handler returns an error string with a transient pattern."""
        call_count = 0
        async def _handler(inp):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return "Command failed (exit 255):\nConnection refused"
            return "OK"

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {})
        assert result == "OK"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_no_recovery_on_success(self, executor):
        """Successful results are not retried."""
        call_count = 0
        async def _handler(inp):
            nonlocal call_count
            call_count += 1
            return "all good"

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {})
        assert result == "all good"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_recovery_with_delay(self, executor):
        """Recovery respects the category-specific delay."""
        call_count = 0
        async def _handler(inp):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return "Error: database is locked"
            return "OK"

        executor._handle_test_tool = _handler
        with patch("src.tools.executor.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            result = await executor.execute("test_tool", {})
        assert result == "OK"
        mock_sleep.assert_awaited_once_with(1.0)

    @pytest.mark.asyncio
    async def test_recovery_snippet_recorded(self, executor):
        """Error snippet is recorded in recovery stats."""
        call_count = 0
        async def _handler(inp):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise ConnectionError("ConnectionRefusedError: target refused")
            return "ok"

        executor._handle_test_tool = _handler
        await executor.execute("test_tool", {})
        recent = executor.recovery_stats.get_recent()
        assert len(recent) == 1
        assert "ConnectionRefusedError" in recent[0]["error_snippet"]

    @pytest.mark.asyncio
    async def test_metrics_counted_for_both_attempts(self, executor):
        """Both the failed and successful attempts update metrics."""
        call_count = 0
        async def _handler(inp):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise ConnectionError("ConnectionResetError")
            return "ok"

        executor._handle_test_tool = _handler
        await executor.execute("test_tool", {})
        metrics = executor.get_metrics()
        assert metrics["test_tool"]["errors"] == 1
        assert metrics["test_tool"]["calls"] == 1

    @pytest.mark.asyncio
    async def test_recovery_on_bulkhead_full_result(self, executor):
        """Bulkhead full error in result string triggers recovery."""
        call_count = 0
        async def _handler(inp):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return "Error: SSH bulkhead full — too many concurrent SSH commands"
            return "success"

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {})
        assert result == "success"
        assert call_count == 2


# ====================================================================
# ToolExecutor — recovery_stats attribute
# ====================================================================

class TestExecutorRecoveryStats:
    def test_has_recovery_stats(self):
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()
        assert hasattr(executor, "recovery_stats")
        assert isinstance(executor.recovery_stats, RecoveryStats)

    def test_recovery_enabled_by_default(self):
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()
        assert executor._recovery_enabled is True


# ====================================================================
# Config integration
# ====================================================================

class TestRecoveryConfig:
    def test_default_enabled(self):
        from src.config.schema import RecoveryConfig
        cfg = RecoveryConfig()
        assert cfg.enabled is True

    def test_disabled(self):
        from src.config.schema import RecoveryConfig
        cfg = RecoveryConfig(enabled=False)
        assert cfg.enabled is False

    def test_tools_config_has_recovery(self):
        from src.config.schema import ToolsConfig
        tc = ToolsConfig()
        assert hasattr(tc, "recovery")
        assert tc.recovery.enabled is True

    def test_tools_config_custom_recovery(self):
        from src.config.schema import RecoveryConfig, ToolsConfig
        tc = ToolsConfig(recovery=RecoveryConfig(enabled=False))
        assert tc.recovery.enabled is False


# ====================================================================
# Agent per-iteration recovery reset
# ====================================================================

class TestAgentPerIterationRecovery:
    @pytest.mark.asyncio
    async def test_recovery_attempts_reset_each_iteration(self):
        """recovery_attempts is reset to 0 at the start of each iteration."""
        from src.agents.manager import AgentInfo, AgentState, _run_agent

        agent = AgentInfo(
            id="test1", label="test", goal="test goal",
            channel_id="ch1", requester_id="u1", requester_name="user",
        )

        iteration_count = 0
        recovery_values = []

        async def mock_iteration_cb(messages, system_prompt, tools):
            nonlocal iteration_count
            iteration_count += 1
            recovery_values.append(agent.recovery_attempts)
            if iteration_count <= 2:
                return {"text": "working", "tool_calls": [{"name": "t1", "input": {}}]}
            return {"text": "done", "tool_calls": []}

        async def mock_tool_cb(name, inp):
            return "ok"

        await _run_agent(
            agent=agent,
            system_prompt="test",
            tools=[],
            iteration_callback=mock_iteration_cb,
            tool_executor_callback=mock_tool_cb,
        )
        assert agent.state == AgentState.COMPLETED
        assert all(v == 0 for v in recovery_values)

    @pytest.mark.asyncio
    async def test_recovery_works_on_second_iteration_after_first_recovery(self):
        """After recovery in iteration 1, iteration 2 can also recover."""
        from src.agents.manager import (
            AgentInfo,
            AgentState,
            MAX_RECOVERY_ATTEMPTS,
            _call_llm_with_recovery,
            _run_agent,
        )

        agent = AgentInfo(
            id="test2", label="test", goal="test goal",
            channel_id="ch1", requester_id="u1", requester_name="user",
        )

        call_count = 0

        async def mock_iteration_cb(messages, system_prompt, tools):
            nonlocal call_count
            call_count += 1
            if call_count in (1, 3):
                raise asyncio.TimeoutError("LLM timeout")
            if call_count in (2, 4):
                return {"text": "working", "tool_calls": [{"name": "t1", "input": {}}]}
            return {"text": "done", "tool_calls": []}

        async def mock_tool_cb(name, inp):
            return "ok"

        await _run_agent(
            agent=agent,
            system_prompt="test",
            tools=[],
            iteration_callback=mock_iteration_cb,
            tool_executor_callback=mock_tool_cb,
        )
        assert agent.state == AgentState.COMPLETED
        assert call_count == 5

    @pytest.mark.asyncio
    async def test_old_behavior_recovery_exhausted_without_reset(self):
        """Verify the reset actually matters by checking iteration-level budget."""
        from src.agents.manager import AgentInfo, AgentState, _run_agent

        agent = AgentInfo(
            id="test3", label="test", goal="test goal",
            channel_id="ch1", requester_id="u1", requester_name="user",
        )

        call_count = 0

        async def mock_iteration_cb(messages, system_prompt, tools):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise asyncio.TimeoutError("timeout")
            if call_count == 2:
                return {"text": "working", "tool_calls": [{"name": "t1", "input": {}}]}
            return {"text": "done", "tool_calls": []}

        async def mock_tool_cb(name, inp):
            return "ok"

        await _run_agent(
            agent=agent,
            system_prompt="test",
            tools=[],
            iteration_callback=mock_iteration_cb,
            tool_executor_callback=mock_tool_cb,
        )
        assert agent.state == AgentState.COMPLETED


# ====================================================================
# REST API endpoints
# ====================================================================

class TestRecoveryAPI:
    @pytest.fixture
    def mock_bot(self):
        bot = MagicMock()
        bot.tool_executor = MagicMock()
        stats = RecoveryStats()
        stats.record_attempt("run_command", RecoveryCategory.SSH_TRANSIENT, "conn err")
        stats.record_success("run_command", RecoveryCategory.SSH_TRANSIENT, "recovered")
        bot.tool_executor.recovery_stats = stats
        bot.audit = MagicMock()
        return bot

    @pytest.mark.asyncio
    async def test_recovery_stats_endpoint(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/recovery/stats")
            assert resp.status == 200
            data = await resp.json()
            assert data["totals"]["attempts"] == 1
            assert data["totals"]["successes"] == 1
            assert "ssh_transient" in data["by_category"]

    @pytest.mark.asyncio
    async def test_recovery_recent_endpoint(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/recovery/recent")
            assert resp.status == 200
            data = await resp.json()
            assert len(data["entries"]) == 1
            assert data["entries"][0]["tool"] == "run_command"

    @pytest.mark.asyncio
    async def test_recovery_recent_limit(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/recovery/recent?limit=1")
            assert resp.status == 200
            data = await resp.json()
            assert len(data["entries"]) <= 1

    @pytest.mark.asyncio
    async def test_recovery_stats_no_executor(self):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        bot = MagicMock(spec=[])
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/recovery/stats")
            assert resp.status == 503

    @pytest.mark.asyncio
    async def test_recovery_recent_no_executor(self):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        bot = MagicMock(spec=[])
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/recovery/recent")
            assert resp.status == 503


# ====================================================================
# Module imports
# ====================================================================

class TestModuleImports:
    def test_recovery_module_imports(self):
        from src.tools.recovery import (
            RecoveryCategory,
            RecoveryEvent,
            RecoveryStats,
            classify_error,
            classify_exception,
            get_retry_delay,
        )
        assert callable(classify_error)
        assert callable(classify_exception)
        assert callable(get_retry_delay)

    def test_executor_has_recovery_stats(self):
        from src.tools.executor import ToolExecutor
        ex = ToolExecutor()
        assert hasattr(ex, "recovery_stats")
        assert hasattr(ex, "_recovery_enabled")

    def test_config_has_recovery(self):
        from src.config.schema import RecoveryConfig
        assert hasattr(RecoveryConfig, "model_fields")


# ====================================================================
# Edge cases
# ====================================================================

class TestEdgeCases:
    def test_classify_error_with_multiple_patterns(self):
        """Error containing patterns from multiple categories returns first match."""
        result = "Error: Connection refused and database is locked"
        cat = classify_error(result)
        assert cat is not None

    def test_recovery_category_is_str(self):
        assert isinstance(RecoveryCategory.SSH_TRANSIENT, str)
        assert RecoveryCategory.SSH_TRANSIENT == "ssh_transient"

    @pytest.mark.asyncio
    async def test_recovery_preserves_rbac_denial(self):
        """RBAC denials are never retried."""
        from src.config.schema import ToolsConfig
        from src.permissions.manager import PermissionManager
        from src.tools.executor import ToolExecutor

        pm = PermissionManager({}, default_tier="guest")
        config = ToolsConfig()
        executor = ToolExecutor(config=config, permission_manager=pm)

        call_count = 0
        async def _handler(inp):
            nonlocal call_count
            call_count += 1
            return "should not reach"

        executor._handle_run_command = _handler
        result = await executor.execute("run_command", {}, user_id="guest_user")
        assert "Permission denied" in result
        assert call_count == 0

    @pytest.mark.asyncio
    async def test_recovery_preserves_unknown_tool(self):
        """Unknown tool errors are never retried."""
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()
        result = await executor.execute("nonexistent_tool", {})
        assert "Unknown tool" in result

    @pytest.mark.asyncio
    async def test_recovery_only_retries_once(self):
        """At most one retry even if error is still recoverable."""
        from src.config.schema import ToolsConfig
        from src.tools.executor import ToolExecutor
        config = ToolsConfig()
        executor = ToolExecutor(config=config)

        call_count = 0
        async def _handler(inp):
            nonlocal call_count
            call_count += 1
            raise ConnectionError("ConnectionResetError")

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {})
        assert call_count == 2
        assert "ConnectionResetError" in result

    @pytest.mark.asyncio
    async def test_concurrent_tool_recovery_independent(self):
        """Two concurrent tool calls with recovery don't interfere."""
        from src.config.schema import ToolsConfig
        from src.tools.executor import ToolExecutor
        config = ToolsConfig()
        executor = ToolExecutor(config=config)

        call_counts = {"tool_a": 0, "tool_b": 0}

        async def _handler_a(inp):
            call_counts["tool_a"] += 1
            if call_counts["tool_a"] == 1:
                raise ConnectionError("ConnectionResetError")
            return "a_ok"

        async def _handler_b(inp):
            call_counts["tool_b"] += 1
            if call_counts["tool_b"] == 1:
                raise ConnectionError("ConnectionRefusedError")
            return "b_ok"

        executor._handle_tool_a = _handler_a
        executor._handle_tool_b = _handler_b

        results = await asyncio.gather(
            executor.execute("tool_a", {}),
            executor.execute("tool_b", {}),
        )
        assert "a_ok" in results
        assert "b_ok" in results
        assert call_counts["tool_a"] == 2
        assert call_counts["tool_b"] == 2

    def test_skip_recovery_contains_timeout(self):
        from src.tools.executor import ToolExecutor
        assert RecoveryCategory.TIMEOUT in ToolExecutor._SKIP_RECOVERY

    @pytest.mark.asyncio
    async def test_recovery_handles_non_string_result(self):
        """If a handler somehow returns a non-string, validation coerces to str."""
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()

        async def _handler(inp):
            return 42

        executor._handle_weird_tool = _handler
        result = await executor.execute("weird_tool", {})
        assert result == "42"


# ====================================================================


class TestUnsafeToRetry:
    """Verify UNSAFE_TO_RETRY set correctly classifies tools."""

    def test_destructive_shell_tools_are_unsafe(self):
        for tool in ("run_command", "run_script", "run_command_multi", "claude_code"):
            assert tool in UNSAFE_TO_RETRY, f"{tool} should be unsafe to retry"

    def test_state_mutation_tools_are_unsafe(self):
        for tool in ("write_file", "git_ops", "memory_manage", "manage_list",
                      "ingest_document", "bulk_ingest_knowledge", "delete_knowledge"):
            assert tool in UNSAFE_TO_RETRY, f"{tool} should be unsafe to retry"

    def test_lifecycle_tools_are_unsafe(self):
        for tool in ("spawn_agent", "kill_agent", "start_loop", "stop_loop",
                      "manage_process", "schedule_task", "delete_schedule",
                      "delegate_task"):
            assert tool in UNSAFE_TO_RETRY, f"{tool} should be unsafe to retry"

    def test_browser_mutation_tools_are_unsafe(self):
        for tool in ("browser_click", "browser_fill", "browser_evaluate"):
            assert tool in UNSAFE_TO_RETRY, f"{tool} should be unsafe to retry"

    def test_infra_tools_are_unsafe(self):
        for tool in ("docker_ops", "terraform_ops", "kubectl", "execute_plan"):
            assert tool in UNSAFE_TO_RETRY, f"{tool} should be unsafe to retry"

    def test_read_only_tools_are_safe_to_retry(self):
        safe_tools = [
            "read_file", "search_knowledge", "search_history",
            "web_search", "fetch_url", "browser_read_page",
            "browser_read_table", "browser_screenshot",
            "analyze_pdf", "analyze_image", "list_schedules",
            "list_tasks", "list_loops", "list_knowledge",
            "list_skills", "parse_time", "list_agents",
            "get_agent_results", "wait_for_agents",
        ]
        for tool in safe_tools:
            assert tool not in UNSAFE_TO_RETRY, f"{tool} should be safe to retry"


# ====================================================================
# Policy-driven recovery (v2)
# ====================================================================

class TestRecoveryPolicies:
    """Each category must map to a RecoveryPolicy that says what to do."""

    def test_transient_categories_retry(self):
        from src.tools.recovery import RecoveryCategory, RecoveryStrategy, get_policy
        for cat in [
            RecoveryCategory.SSH_TRANSIENT,
            RecoveryCategory.CONNECTION_ERROR,
            RecoveryCategory.RESOURCE_BUSY,
            RecoveryCategory.RATE_LIMITED,
            RecoveryCategory.BULKHEAD_FULL,
        ]:
            assert get_policy(cat).strategy == RecoveryStrategy.RETRY_WITH_DELAY

    def test_failure_class_categories_hint(self):
        from src.tools.recovery import RecoveryCategory, RecoveryStrategy, get_policy
        for cat in [
            RecoveryCategory.AUTH_FAILURE,
            RecoveryCategory.NOT_FOUND,
            RecoveryCategory.DISK_FULL,
            RecoveryCategory.DEPENDENCY_MISSING,
            RecoveryCategory.PERMISSION_DENIED,
        ]:
            policy = get_policy(cat)
            assert policy.strategy == RecoveryStrategy.HINT_AND_ESCALATE
            assert policy.hint, f"{cat} must have a hint"

    def test_timeout_no_action(self):
        from src.tools.recovery import RecoveryCategory, RecoveryStrategy, get_policy
        assert get_policy(RecoveryCategory.TIMEOUT).strategy == RecoveryStrategy.NO_ACTION


class TestNewCategoryClassification:
    def test_auth_failure_401(self):
        from src.tools.recovery import classify_error, RecoveryCategory
        assert classify_error("Error: 401 Unauthorized on /api/thing") == RecoveryCategory.AUTH_FAILURE

    def test_auth_failure_ssh_publickey(self):
        from src.tools.recovery import classify_error, RecoveryCategory
        assert classify_error(
            "Command failed (exit 255):\nPermission denied (publickey,password)."
        ) == RecoveryCategory.AUTH_FAILURE

    def test_not_found_404(self):
        from src.tools.recovery import classify_error, RecoveryCategory
        assert classify_error("Error: 404 Not Found") == RecoveryCategory.NOT_FOUND

    def test_not_found_file(self):
        from src.tools.recovery import classify_error, RecoveryCategory
        assert classify_error("Error: No such file or directory: /foo") == RecoveryCategory.NOT_FOUND

    def test_disk_full_enospc(self):
        from src.tools.recovery import classify_error, RecoveryCategory
        assert classify_error("Error: write failed: ENOSPC") == RecoveryCategory.DISK_FULL

    def test_disk_full_no_space(self):
        from src.tools.recovery import classify_error, RecoveryCategory
        assert classify_error(
            "Command failed (exit 1):\nNo space left on device"
        ) == RecoveryCategory.DISK_FULL

    def test_dependency_module_not_found(self):
        from src.tools.recovery import classify_error, RecoveryCategory
        assert classify_error(
            "Command failed (exit 1):\nModuleNotFoundError: No module named 'requests'"
        ) == RecoveryCategory.DEPENDENCY_MISSING

    def test_dependency_command_not_found(self):
        from src.tools.recovery import classify_error, RecoveryCategory
        assert classify_error(
            "Command failed (exit 127):\nbash: kubectl: command not found"
        ) == RecoveryCategory.DEPENDENCY_MISSING

    def test_permission_denied_file(self):
        """Plain 'Permission denied' (no '(publickey' suffix) classifies as PERMISSION_DENIED."""
        from src.tools.recovery import classify_error, RecoveryCategory
        assert classify_error(
            "Error: Permission denied: /etc/shadow"
        ) == RecoveryCategory.PERMISSION_DENIED

    def test_auth_takes_precedence_over_permission(self):
        """SSH pubkey denial should hit AUTH_FAILURE, not PERMISSION_DENIED."""
        from src.tools.recovery import classify_error, RecoveryCategory
        # AUTH_FAILURE patterns are declared before PERMISSION_DENIED so its
        # longer, more specific 'Permission denied (publickey' wins.
        assert classify_error(
            "Command failed (exit 255):\nPermission denied (publickey,password)."
        ) == RecoveryCategory.AUTH_FAILURE

    def test_get_hint_returns_nonempty(self):
        from src.tools.recovery import get_hint, RecoveryCategory
        assert "authentication" in get_hint(RecoveryCategory.AUTH_FAILURE).lower()
        assert "not found" in get_hint(RecoveryCategory.NOT_FOUND).lower()
        assert "disk" in get_hint(RecoveryCategory.DISK_FULL).lower()
        assert "dependency" in get_hint(RecoveryCategory.DEPENDENCY_MISSING).lower()


# ====================================================================
# Executor integration — HINT_AND_ESCALATE strategy
# ====================================================================

class TestExecutorHintAndEscalate:
    @pytest.fixture
    def executor(self):
        from src.config.schema import ToolsConfig
        from src.tools.executor import ToolExecutor
        config = ToolsConfig(command_timeout_seconds=5)
        return ToolExecutor(config=config)

    @pytest.mark.asyncio
    async def test_auth_failure_appends_hint_without_retry(self, executor):
        calls = 0

        async def _handler(inp):
            nonlocal calls
            calls += 1
            return "Error: 401 Unauthorized from API"

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {})
        assert calls == 1, "HINT_AND_ESCALATE must NOT retry"
        assert "401 Unauthorized" in result
        assert "recovery hint" in result.lower()
        assert "authentication" in result.lower()

    @pytest.mark.asyncio
    async def test_not_found_appends_hint(self, executor):
        calls = 0

        async def _handler(inp):
            nonlocal calls
            calls += 1
            return "Error: No such file or directory: /nonesuch"

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {})
        assert calls == 1
        assert "recovery hint" in result.lower()
        assert "not found" in result.lower()

    @pytest.mark.asyncio
    async def test_hint_is_idempotent(self, executor):
        """If hint text is already in the result, don't append a duplicate."""
        from src.tools.recovery import get_hint, RecoveryCategory
        hint = get_hint(RecoveryCategory.NOT_FOUND)
        async def _handler(inp):
            return f"Error: No such file or directory\n\n{hint}"
        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {})
        # The hint should appear exactly once.
        assert result.count(hint) == 1

    @pytest.mark.asyncio
    async def test_disk_full_safe_for_unsafe_tool(self, executor):
        """DISK_FULL on an UNSAFE_TO_RETRY tool should still get the hint (no re-execution)."""
        calls = 0
        async def _handler(inp):
            nonlocal calls
            calls += 1
            return "Command failed (exit 1):\nNo space left on device"
        executor._handle_write_file = _handler  # write_file is in UNSAFE_TO_RETRY
        result = await executor.execute("write_file", {"host": "x", "path": "/y", "content": "z"})
        assert calls == 1
        assert "recovery hint" in result.lower()
        assert "disk" in result.lower() or "cleanup" in result.lower()


# ====================================================================
# decide_recovery_action — single source of truth for dispatch
# ====================================================================

class TestDecideRecoveryAction:
    def test_none_category_is_skip(self):
        from src.tools.recovery import decide_recovery_action
        d = decide_recovery_action(tool_name="run_command", category=None)
        assert d.action == "skip"

    def test_hint_category_returns_hint(self):
        from src.tools.recovery import decide_recovery_action, RecoveryCategory
        d = decide_recovery_action(tool_name="run_command", category=RecoveryCategory.AUTH_FAILURE)
        assert d.action == "hint"
        assert "authentication" in d.hint_text.lower()

    def test_hint_category_safe_for_unsafe_tool(self):
        """HINT_AND_ESCALATE never re-executes, so it's always safe — even for UNSAFE_TO_RETRY tools."""
        from src.tools.recovery import decide_recovery_action, RecoveryCategory
        d = decide_recovery_action(tool_name="write_file", category=RecoveryCategory.DISK_FULL)
        assert d.action == "hint"
        assert d.hint_text

    def test_retry_blocked_for_unsafe_tool(self):
        """RETRY_WITH_DELAY must be downgraded to 'skip' when tool is UNSAFE_TO_RETRY."""
        from src.tools.recovery import decide_recovery_action, RecoveryCategory
        d = decide_recovery_action(tool_name="write_file", category=RecoveryCategory.SSH_TRANSIENT)
        assert d.action == "skip"

    def test_retry_allowed_for_safe_tool(self):
        from src.tools.recovery import decide_recovery_action, RecoveryCategory
        d = decide_recovery_action(tool_name="read_file", category=RecoveryCategory.SSH_TRANSIENT)
        assert d.action == "retry"
        assert d.delay_seconds > 0

    def test_timeout_is_skip(self):
        from src.tools.recovery import decide_recovery_action, RecoveryCategory
        d = decide_recovery_action(tool_name="read_file", category=RecoveryCategory.TIMEOUT)
        assert d.action == "skip"


class TestClassificationPriority:
    def test_auth_wins_over_permission(self):
        """SSH pubkey denial must always classify as AUTH_FAILURE — order stable."""
        from src.tools.recovery import classify_error, RecoveryCategory
        for _ in range(5):
            cat = classify_error(
                "Command failed (exit 255):\nPermission denied (publickey,password)."
            )
            assert cat == RecoveryCategory.AUTH_FAILURE

    def test_not_found_wins_over_dependency_for_file_errors(self):
        """'No such file or directory' must classify as NOT_FOUND, not DEPENDENCY_MISSING."""
        from src.tools.recovery import classify_error, RecoveryCategory
        assert classify_error(
            "Error: No such file or directory: /etc/xyz"
        ) == RecoveryCategory.NOT_FOUND

    def test_transient_wins_over_everything(self):
        """Connection issues classify before AUTH / NOT_FOUND even if patterns overlap."""
        from src.tools.recovery import classify_error, RecoveryCategory
        assert classify_error(
            "Command failed (exit 255):\nConnection refused"
        ) == RecoveryCategory.SSH_TRANSIENT
