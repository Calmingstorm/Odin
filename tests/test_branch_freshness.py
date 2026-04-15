"""Tests for branch freshness checker — stale branch detection on test failure.

Covers:
- Test command detection (is_test_command)
- Test failure detection (is_test_failure)
- Branch status checking (check_branch_freshness)
- Staleness warning formatting (format_staleness_warning)
- FreshnessStats tracking
- ToolExecutor integration (annotation on test failures)
- Config integration
- REST API endpoints
"""
from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.tools.branch_freshness import (
    FRESHNESS_CHECK_TIMEOUT,
    MAX_RECENT_CHECKS,
    BranchStatus,
    FreshnessEvent,
    FreshnessStats,
    _TEST_COMMAND_PATTERNS,
    _TEST_FAILURE_PATTERNS,
    check_branch_freshness,
    format_staleness_warning,
    is_test_command,
    is_test_failure,
)


# ====================================================================
# is_test_command — test command detection
# ====================================================================

class TestIsTestCommand:
    def test_pytest(self):
        assert is_test_command("pytest tests/ -q") is True

    def test_pytest_verbose(self):
        assert is_test_command("pytest -v tests/test_foo.py") is True

    def test_python_m_pytest(self):
        assert is_test_command("python3 -m pytest tests/ -q") is True

    def test_python_m_pytest_no_3(self):
        assert is_test_command("python -m pytest tests/") is True

    def test_npm_test(self):
        assert is_test_command("npm test") is True

    def test_yarn_test(self):
        assert is_test_command("yarn test --coverage") is True

    def test_pnpm_test(self):
        assert is_test_command("pnpm test") is True

    def test_go_test(self):
        assert is_test_command("go test ./...") is True

    def test_cargo_test(self):
        assert is_test_command("cargo test") is True

    def test_make_test(self):
        assert is_test_command("make test") is True

    def test_gradle_test(self):
        assert is_test_command("gradle test") is True

    def test_mvn_test(self):
        assert is_test_command("mvn test") is True

    def test_mvn_verify(self):
        assert is_test_command("mvn verify") is True

    def test_rspec(self):
        assert is_test_command("rspec spec/") is True

    def test_jest(self):
        assert is_test_command("jest --runInBand") is True

    def test_mocha(self):
        assert is_test_command("mocha test/") is True

    def test_vitest(self):
        assert is_test_command("vitest run") is True

    def test_phpunit(self):
        assert is_test_command("phpunit tests/") is True

    def test_dotnet_test(self):
        assert is_test_command("dotnet test") is True

    def test_unittest(self):
        assert is_test_command("python -m unittest discover") is True

    def test_nosetest(self):
        assert is_test_command("nosetest tests/") is True

    def test_negative_ls(self):
        assert is_test_command("ls -la") is False

    def test_negative_git(self):
        assert is_test_command("git status") is False

    def test_negative_empty(self):
        assert is_test_command("") is False

    def test_negative_grep(self):
        assert is_test_command("grep -r 'test' .") is False

    def test_negative_echo(self):
        assert is_test_command("echo 'running test'") is False

    def test_pytest_in_pipeline(self):
        assert is_test_command("cd /app && pytest tests/ -q 2>&1 | tail -5") is True

    def test_all_patterns_are_compiled(self):
        import re
        for pat in _TEST_COMMAND_PATTERNS:
            assert isinstance(pat, re.Pattern)


# ====================================================================
# is_test_failure — test failure detection
# ====================================================================

class TestIsTestFailure:
    def test_pytest_failure(self):
        result = "Command failed (exit 1):\n3 failed, 10 passed"
        assert is_test_failure(result) is True

    def test_pytest_failures(self):
        result = "Command failed (exit 1):\n=== FAILURES ==="
        assert is_test_failure(result) is True

    def test_failed_keyword(self):
        result = "Command failed (exit 1):\nFAILED tests/test_foo.py::test_bar"
        assert is_test_failure(result) is True

    def test_script_failed_tests(self):
        result = "Script failed (exit 1):\n2 failed, 5 passed"
        assert is_test_failure(result) is True

    def test_assertion_error(self):
        result = "Command failed (exit 1):\nAssertionError: expected 1 got 2"
        assert is_test_failure(result) is True

    def test_assertion_failed(self):
        result = "Command failed (exit 1):\nAssertionFailed: x != y"
        assert is_test_failure(result) is True

    def test_test_failed_message(self):
        result = "Command failed (exit 1):\nTest failed: test_integration"
        assert is_test_failure(result) is True

    def test_go_fail(self):
        result = "Command failed (exit 1):\nFAIL github.com/foo/bar"
        assert is_test_failure(result) is True

    def test_with_exit_code_param(self):
        result = "3 failed, 10 passed"
        assert is_test_failure(result, exit_code=1) is True

    def test_success_no_failure(self):
        result = "10 passed in 2.5s"
        assert is_test_failure(result) is False

    def test_success_with_exit_code_zero(self):
        result = "10 passed in 2.5s"
        assert is_test_failure(result, exit_code=0) is False

    def test_empty_string(self):
        assert is_test_failure("") is False

    def test_normal_command_failure(self):
        result = "Command failed (exit 1):\nNo such file or directory"
        assert is_test_failure(result) is False

    def test_all_failure_patterns_compiled(self):
        import re
        for pat in _TEST_FAILURE_PATTERNS:
            assert isinstance(pat, re.Pattern)


# ====================================================================
# BranchStatus dataclass
# ====================================================================

class TestBranchStatus:
    def test_fields(self):
        status = BranchStatus(
            is_stale=True,
            commits_behind=5,
            local_branch="main",
            remote_ref="origin/main",
        )
        assert status.is_stale is True
        assert status.commits_behind == 5
        assert status.local_branch == "main"
        assert status.remote_ref == "origin/main"
        assert status.fetch_failed is False
        assert status.error is None

    def test_with_error(self):
        status = BranchStatus(
            is_stale=False,
            commits_behind=0,
            local_branch="unknown",
            remote_ref="unknown",
            error="not a git repo",
        )
        assert status.error == "not a git repo"

    def test_fetch_failed(self):
        status = BranchStatus(
            is_stale=True,
            commits_behind=3,
            local_branch="dev",
            remote_ref="origin/dev",
            fetch_failed=True,
        )
        assert status.fetch_failed is True


# ====================================================================
# check_branch_freshness — async git status check
# ====================================================================

class TestCheckBranchFreshness:
    @pytest.mark.asyncio
    async def test_fresh_branch(self):
        exec_fn = AsyncMock(side_effect=[
            (0, "master\n"),    # rev-parse
            (0, ""),            # fetch
            (0, "0\n"),         # rev-list
        ])
        status = await check_branch_freshness(exec_fn, "127.0.0.1", "root")
        assert status.is_stale is False
        assert status.commits_behind == 0
        assert status.local_branch == "master"
        assert status.remote_ref == "origin/master"

    @pytest.mark.asyncio
    async def test_stale_branch(self):
        exec_fn = AsyncMock(side_effect=[
            (0, "main\n"),      # rev-parse
            (0, ""),            # fetch
            (0, "7\n"),         # rev-list
        ])
        status = await check_branch_freshness(exec_fn, "10.0.0.1", "deploy")
        assert status.is_stale is True
        assert status.commits_behind == 7
        assert status.local_branch == "main"
        assert status.remote_ref == "origin/main"

    @pytest.mark.asyncio
    async def test_not_a_git_repo(self):
        exec_fn = AsyncMock(side_effect=[
            (128, "fatal: not a git repository\n"),
        ])
        status = await check_branch_freshness(exec_fn, "127.0.0.1", "root")
        assert status.is_stale is False
        assert status.error == "not a git repo"

    @pytest.mark.asyncio
    async def test_detached_head(self):
        exec_fn = AsyncMock(side_effect=[
            (0, "HEAD\n"),
        ])
        status = await check_branch_freshness(exec_fn, "127.0.0.1", "root")
        assert status.is_stale is False
        assert status.error == "detached HEAD"

    @pytest.mark.asyncio
    async def test_fetch_failure_still_checks(self):
        exec_fn = AsyncMock(side_effect=[
            (0, "master\n"),   # rev-parse
            (1, "error\n"),    # fetch fails
            (0, "3\n"),        # rev-list still works (cached remote refs)
        ])
        status = await check_branch_freshness(exec_fn, "127.0.0.1", "root")
        assert status.is_stale is True
        assert status.commits_behind == 3
        assert status.fetch_failed is True

    @pytest.mark.asyncio
    async def test_fetch_exception_still_checks(self):
        exec_fn = AsyncMock(side_effect=[
            (0, "master\n"),
            Exception("network error"),
            (0, "2\n"),
        ])
        status = await check_branch_freshness(exec_fn, "127.0.0.1", "root")
        assert status.is_stale is True
        assert status.commits_behind == 2
        assert status.fetch_failed is True

    @pytest.mark.asyncio
    async def test_rev_list_failure(self):
        exec_fn = AsyncMock(side_effect=[
            (0, "master\n"),
            (0, ""),
            Exception("subprocess error"),
        ])
        status = await check_branch_freshness(exec_fn, "127.0.0.1", "root")
        assert status.is_stale is False
        assert status.error == "rev-list failed"

    @pytest.mark.asyncio
    async def test_rev_list_bad_output(self):
        exec_fn = AsyncMock(side_effect=[
            (0, "master\n"),
            (0, ""),
            (0, "not-a-number\n"),
        ])
        status = await check_branch_freshness(exec_fn, "127.0.0.1", "root")
        assert status.is_stale is False
        assert status.commits_behind == 0

    @pytest.mark.asyncio
    async def test_exec_fn_raises_on_rev_parse(self):
        exec_fn = AsyncMock(side_effect=Exception("crash"))
        status = await check_branch_freshness(exec_fn, "127.0.0.1", "root")
        assert status.is_stale is False
        assert status.error == "exec_fn raised"

    @pytest.mark.asyncio
    async def test_empty_branch_name(self):
        exec_fn = AsyncMock(side_effect=[
            (0, "\n"),
        ])
        status = await check_branch_freshness(exec_fn, "127.0.0.1", "root")
        assert status.error == "detached HEAD"


# ====================================================================
# format_staleness_warning
# ====================================================================

class TestFormatStalenessWarning:
    def test_stale_branch(self):
        status = BranchStatus(
            is_stale=True, commits_behind=5,
            local_branch="master", remote_ref="origin/master",
        )
        warning = format_staleness_warning(status)
        assert "[STALE BRANCH]" in warning
        assert "5 commit(s) behind" in warning
        assert "origin/master" in warning
        assert "pull before investigating" in warning

    def test_fresh_branch(self):
        status = BranchStatus(
            is_stale=False, commits_behind=0,
            local_branch="master", remote_ref="origin/master",
        )
        assert format_staleness_warning(status) == ""

    def test_single_commit(self):
        status = BranchStatus(
            is_stale=True, commits_behind=1,
            local_branch="dev", remote_ref="origin/dev",
        )
        warning = format_staleness_warning(status)
        assert "1 commit(s) behind" in warning
        assert "dev" in warning


# ====================================================================
# FreshnessEvent dataclass
# ====================================================================

class TestFreshnessEvent:
    def test_fields(self):
        event = FreshnessEvent(
            tool_name="run_command",
            command="pytest tests/",
            is_stale=True,
            commits_behind=3,
            branch="master",
        )
        assert event.tool_name == "run_command"
        assert event.command == "pytest tests/"
        assert event.is_stale is True
        assert event.commits_behind == 3
        assert event.branch == "master"
        assert isinstance(event.timestamp, float)

    def test_default_timestamp(self):
        before = time.time()
        event = FreshnessEvent(
            tool_name="run_command", command="pytest",
            is_stale=False, commits_behind=0, branch="main",
        )
        after = time.time()
        assert before <= event.timestamp <= after


# ====================================================================
# FreshnessStats — tracking
# ====================================================================

class TestFreshnessStats:
    def test_initial_state(self):
        stats = FreshnessStats()
        summary = stats.get_summary()
        assert summary["total_checks"] == 0
        assert summary["stale_found"] == 0
        assert summary["fetch_failures"] == 0

    def test_record_fresh(self):
        stats = FreshnessStats()
        event = FreshnessEvent(
            tool_name="run_command", command="pytest",
            is_stale=False, commits_behind=0, branch="main",
        )
        stats.record(event)
        summary = stats.get_summary()
        assert summary["total_checks"] == 1
        assert summary["stale_found"] == 0

    def test_record_stale(self):
        stats = FreshnessStats()
        event = FreshnessEvent(
            tool_name="run_command", command="pytest tests/",
            is_stale=True, commits_behind=5, branch="master",
        )
        stats.record(event)
        summary = stats.get_summary()
        assert summary["total_checks"] == 1
        assert summary["stale_found"] == 1

    def test_record_fetch_failure(self):
        stats = FreshnessStats()
        stats.record_fetch_failure()
        assert stats.get_summary()["fetch_failures"] == 1

    def test_get_recent_empty(self):
        stats = FreshnessStats()
        assert stats.get_recent() == []

    def test_get_recent_returns_dicts(self):
        stats = FreshnessStats()
        event = FreshnessEvent(
            tool_name="run_command", command="pytest tests/ -q",
            is_stale=True, commits_behind=2, branch="dev",
        )
        stats.record(event)
        recent = stats.get_recent()
        assert len(recent) == 1
        entry = recent[0]
        assert entry["tool_name"] == "run_command"
        assert entry["is_stale"] is True
        assert entry["commits_behind"] == 2
        assert entry["branch"] == "dev"
        assert "timestamp" in entry

    def test_get_recent_limit(self):
        stats = FreshnessStats()
        for i in range(10):
            stats.record(FreshnessEvent(
                tool_name="run_command", command=f"pytest {i}",
                is_stale=False, commits_behind=0, branch="main",
            ))
        recent = stats.get_recent(limit=3)
        assert len(recent) == 3

    def test_max_recent_cap(self):
        stats = FreshnessStats(max_recent=5)
        for i in range(10):
            stats.record(FreshnessEvent(
                tool_name="run_command", command=f"pytest {i}",
                is_stale=False, commits_behind=0, branch="main",
            ))
        assert len(stats._recent) == 5

    def test_reset(self):
        stats = FreshnessStats()
        stats.record(FreshnessEvent(
            tool_name="run_command", command="pytest",
            is_stale=True, commits_behind=1, branch="main",
        ))
        stats.record_fetch_failure()
        stats.reset()
        summary = stats.get_summary()
        assert summary["total_checks"] == 0
        assert summary["stale_found"] == 0
        assert summary["fetch_failures"] == 0
        assert stats.get_recent() == []

    def test_command_truncated_in_recent(self):
        stats = FreshnessStats()
        long_cmd = "pytest " + "a" * 200
        stats.record(FreshnessEvent(
            tool_name="run_command", command=long_cmd,
            is_stale=False, commits_behind=0, branch="main",
        ))
        recent = stats.get_recent()
        assert len(recent[0]["command"]) <= 120

    def test_multiple_records(self):
        stats = FreshnessStats()
        stats.record(FreshnessEvent(
            tool_name="run_command", command="pytest",
            is_stale=True, commits_behind=3, branch="main",
        ))
        stats.record(FreshnessEvent(
            tool_name="run_script", command="pytest",
            is_stale=False, commits_behind=0, branch="dev",
        ))
        summary = stats.get_summary()
        assert summary["total_checks"] == 2
        assert summary["stale_found"] == 1


# ====================================================================
# Constants
# ====================================================================

class TestConstants:
    def test_freshness_check_timeout(self):
        assert FRESHNESS_CHECK_TIMEOUT == 15

    def test_max_recent_checks(self):
        assert MAX_RECENT_CHECKS == 50

    def test_test_command_patterns_not_empty(self):
        assert len(_TEST_COMMAND_PATTERNS) > 0

    def test_test_failure_patterns_not_empty(self):
        assert len(_TEST_FAILURE_PATTERNS) > 0


# ====================================================================
# ToolExecutor integration — freshness annotation
# ====================================================================

class TestExecutorFreshnessIntegration:
    @pytest.fixture
    def executor(self):
        from src.config.schema import ToolsConfig
        from src.tools.executor import ToolExecutor
        config = ToolsConfig(command_timeout_seconds=5)
        return ToolExecutor(config=config)

    @pytest.mark.asyncio
    async def test_annotates_stale_branch_on_test_failure(self, executor):
        """Test failure on stale branch gets a staleness warning appended."""
        async def mock_run_on_host(alias, command):
            return "Command failed (exit 1):\n3 failed, 10 passed"

        async def mock_exec_command(address, command, ssh_user, timeout=None):
            if "rev-parse" in command:
                return (0, "master\n")
            if "fetch" in command:
                return (0, "")
            if "rev-list" in command:
                return (0, "5\n")
            return (0, "")

        executor._run_on_host = mock_run_on_host
        executor._exec_command = mock_exec_command
        executor._resolve_host = lambda alias: ("127.0.0.1", "root", "linux")

        result = await executor._handle_run_command({"host": "local", "command": "pytest tests/ -q"})
        assert "[STALE BRANCH]" in result
        assert "5 commit(s) behind" in result
        assert executor.freshness_stats.get_summary()["total_checks"] == 1
        assert executor.freshness_stats.get_summary()["stale_found"] == 1

    @pytest.mark.asyncio
    async def test_no_annotation_on_fresh_branch(self, executor):
        """Test failure on fresh branch gets no warning."""
        async def mock_run_on_host(alias, command):
            return "Command failed (exit 1):\n3 failed, 10 passed"

        async def mock_exec_command(address, command, ssh_user, timeout=None):
            if "rev-parse" in command:
                return (0, "master\n")
            if "fetch" in command:
                return (0, "")
            if "rev-list" in command:
                return (0, "0\n")
            return (0, "")

        executor._run_on_host = mock_run_on_host
        executor._exec_command = mock_exec_command
        executor._resolve_host = lambda alias: ("127.0.0.1", "root", "linux")

        result = await executor._handle_run_command({"host": "local", "command": "pytest tests/"})
        assert "[STALE BRANCH]" not in result
        assert executor.freshness_stats.get_summary()["total_checks"] == 1
        assert executor.freshness_stats.get_summary()["stale_found"] == 0

    @pytest.mark.asyncio
    async def test_no_annotation_on_non_test_command(self, executor):
        """Non-test commands don't trigger freshness check."""
        async def mock_run_on_host(alias, command):
            return "Command failed (exit 1):\nNo such file or directory"

        executor._run_on_host = mock_run_on_host

        result = await executor._handle_run_command({"host": "local", "command": "ls /nonexistent"})
        assert "[STALE BRANCH]" not in result
        assert executor.freshness_stats.get_summary()["total_checks"] == 0

    @pytest.mark.asyncio
    async def test_no_annotation_on_test_success(self, executor):
        """Successful test commands don't trigger freshness check."""
        async def mock_run_on_host(alias, command):
            return "100 passed in 5.0s"

        executor._run_on_host = mock_run_on_host

        result = await executor._handle_run_command({"host": "local", "command": "pytest tests/"})
        assert "[STALE BRANCH]" not in result
        assert executor.freshness_stats.get_summary()["total_checks"] == 0

    @pytest.mark.asyncio
    async def test_disabled_via_config(self, executor):
        """Freshness check disabled via config doesn't run."""
        executor._branch_freshness_enabled = False

        async def mock_run_on_host(alias, command):
            return "Command failed (exit 1):\n3 failed, 10 passed"

        executor._run_on_host = mock_run_on_host

        result = await executor._handle_run_command({"host": "local", "command": "pytest tests/"})
        assert "[STALE BRANCH]" not in result
        assert executor.freshness_stats.get_summary()["total_checks"] == 0

    @pytest.mark.asyncio
    async def test_freshness_check_exception_is_safe(self, executor):
        """If freshness check crashes, the original result is returned."""
        async def mock_run_on_host(alias, command):
            return "Command failed (exit 1):\n3 failed, 10 passed"

        executor._run_on_host = mock_run_on_host
        executor._resolve_host = lambda alias: None  # will cause early return

        result = await executor._handle_run_command({"host": "local", "command": "pytest tests/"})
        assert "3 failed" in result
        assert "[STALE BRANCH]" not in result

    @pytest.mark.asyncio
    async def test_fetch_failure_tracked(self, executor):
        """Fetch failures are counted in stats."""
        async def mock_run_on_host(alias, command):
            return "Command failed (exit 1):\n3 failed"

        async def mock_exec_command(address, command, ssh_user, timeout=None):
            if "rev-parse" in command:
                return (0, "master\n")
            if "fetch" in command:
                return (1, "error: network")
            if "rev-list" in command:
                return (0, "0\n")
            return (0, "")

        executor._run_on_host = mock_run_on_host
        executor._exec_command = mock_exec_command
        executor._resolve_host = lambda alias: ("127.0.0.1", "root", "linux")

        await executor._handle_run_command({"host": "local", "command": "pytest tests/"})
        assert executor.freshness_stats.get_summary()["fetch_failures"] == 1


class TestExecutorRunScriptFreshness:
    @pytest.fixture
    def executor(self):
        from src.config.schema import ToolsConfig
        from src.tools.executor import ToolExecutor
        config = ToolsConfig(command_timeout_seconds=5)
        return ToolExecutor(config=config)

    @pytest.mark.asyncio
    async def test_script_with_test_annotated(self, executor):
        """run_script with test commands gets freshness annotation."""
        async def mock_exec_command(address, command, ssh_user, timeout=None):
            if "rev-parse" in command:
                return (0, "master\n")
            if "fetch" in command:
                return (0, "")
            if "rev-list" in command:
                return (0, "3\n")
            # The actual script execution
            return (1, "2 failed, 5 passed")

        executor._exec_command = mock_exec_command
        executor._resolve_host = lambda alias: ("127.0.0.1", "root", "linux")

        result = await executor._handle_run_script({
            "host": "local",
            "script": "#!/bin/bash\npytest tests/ -q",
            "interpreter": "bash",
        })
        assert "Script failed" in result
        assert "[STALE BRANCH]" in result
        assert "3 commit(s) behind" in result

    @pytest.mark.asyncio
    async def test_script_non_test_not_annotated(self, executor):
        """run_script without test commands doesn't get freshness annotation."""
        async def mock_exec_command(address, command, ssh_user, timeout=None):
            return (1, "file not found")

        executor._exec_command = mock_exec_command
        executor._resolve_host = lambda alias: ("127.0.0.1", "root", "linux")

        result = await executor._handle_run_script({
            "host": "local",
            "script": "#!/bin/bash\nls /nonexistent",
            "interpreter": "bash",
        })
        assert "Script failed" in result
        assert "[STALE BRANCH]" not in result


# ====================================================================
# Executor attributes
# ====================================================================

class TestExecutorAttributes:
    def test_has_freshness_stats(self):
        from src.config.schema import ToolsConfig
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor(config=ToolsConfig())
        assert hasattr(executor, "freshness_stats")
        assert isinstance(executor.freshness_stats, FreshnessStats)

    def test_freshness_enabled_by_default(self):
        from src.config.schema import ToolsConfig
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor(config=ToolsConfig())
        assert executor._branch_freshness_enabled is True

    def test_freshness_disabled_via_config(self):
        from src.config.schema import BranchFreshnessConfig, ToolsConfig
        config = ToolsConfig(branch_freshness=BranchFreshnessConfig(enabled=False))
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor(config=config)
        assert executor._branch_freshness_enabled is False


# ====================================================================
# Config
# ====================================================================

class TestConfig:
    def test_default_enabled(self):
        from src.config.schema import BranchFreshnessConfig
        cfg = BranchFreshnessConfig()
        assert cfg.enabled is True

    def test_disabled(self):
        from src.config.schema import BranchFreshnessConfig
        cfg = BranchFreshnessConfig(enabled=False)
        assert cfg.enabled is False

    def test_tools_config_has_branch_freshness(self):
        from src.config.schema import ToolsConfig
        cfg = ToolsConfig()
        assert hasattr(cfg, "branch_freshness")
        assert cfg.branch_freshness.enabled is True

    def test_tools_config_custom_freshness(self):
        from src.config.schema import BranchFreshnessConfig, ToolsConfig
        cfg = ToolsConfig(branch_freshness=BranchFreshnessConfig(enabled=False))
        assert cfg.branch_freshness.enabled is False


# ====================================================================
# REST API endpoints
# ====================================================================

class TestFreshnessAPI:
    @pytest.fixture
    def mock_bot(self):
        bot = MagicMock()
        from src.tools.executor import ToolExecutor
        from src.config.schema import ToolsConfig
        executor = ToolExecutor(config=ToolsConfig())
        bot.tool_executor = executor
        return bot

    @pytest.fixture
    def mock_bot_no_executor(self):
        bot = MagicMock()
        bot.tool_executor = None
        del bot.tool_executor
        return bot

    @pytest.mark.asyncio
    async def test_stats_endpoint(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import AioHTTPTestCase, TestServer, TestClient
        from src.web.api import create_api_routes
        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/freshness/stats")
            assert resp.status == 200
            data = await resp.json()
            assert "total_checks" in data
            assert data["total_checks"] == 0

    @pytest.mark.asyncio
    async def test_recent_endpoint(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestServer, TestClient
        from src.web.api import create_api_routes
        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/freshness/recent")
            assert resp.status == 200
            data = await resp.json()
            assert "entries" in data
            assert data["entries"] == []

    @pytest.mark.asyncio
    async def test_recent_with_limit(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestServer, TestClient
        from src.web.api import create_api_routes
        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/freshness/recent?limit=5")
            assert resp.status == 200

    @pytest.mark.asyncio
    async def test_stats_no_executor(self, mock_bot_no_executor):
        from aiohttp import web
        from aiohttp.test_utils import TestServer, TestClient
        from src.web.api import create_api_routes
        app = web.Application()
        routes = create_api_routes(mock_bot_no_executor)
        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/freshness/stats")
            assert resp.status == 503

    @pytest.mark.asyncio
    async def test_recent_no_executor(self, mock_bot_no_executor):
        from aiohttp import web
        from aiohttp.test_utils import TestServer, TestClient
        from src.web.api import create_api_routes
        app = web.Application()
        routes = create_api_routes(mock_bot_no_executor)
        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/freshness/recent")
            assert resp.status == 503


# ====================================================================
# Module imports
# ====================================================================

class TestModuleImports:
    def test_branch_freshness_module(self):
        from src.tools import branch_freshness
        assert hasattr(branch_freshness, "is_test_command")
        assert hasattr(branch_freshness, "is_test_failure")
        assert hasattr(branch_freshness, "check_branch_freshness")
        assert hasattr(branch_freshness, "format_staleness_warning")
        assert hasattr(branch_freshness, "BranchStatus")
        assert hasattr(branch_freshness, "FreshnessEvent")
        assert hasattr(branch_freshness, "FreshnessStats")

    def test_executor_imports(self):
        from src.tools.executor import ToolExecutor
        assert hasattr(ToolExecutor, "_annotate_with_freshness")

    def test_config_import(self):
        from src.config.schema import BranchFreshnessConfig
        assert BranchFreshnessConfig is not None


# ====================================================================
# Edge cases
# ====================================================================

class TestEdgeCases:
    def test_test_command_embedded_in_longer_string(self):
        assert is_test_command("cd /app && python3 -m pytest tests/ -q 2>&1") is True

    def test_test_command_case_sensitive(self):
        assert is_test_command("PYTEST tests/") is False

    def test_test_failure_only_checks_prefixed_results(self):
        result = "All good, 10 passed"
        assert is_test_failure(result) is False

    def test_staleness_warning_newline_prefix(self):
        status = BranchStatus(
            is_stale=True, commits_behind=1,
            local_branch="master", remote_ref="origin/master",
        )
        warning = format_staleness_warning(status)
        assert warning.startswith("\n")

    @pytest.mark.asyncio
    async def test_freshness_check_with_branch_name_spaces(self):
        exec_fn = AsyncMock(side_effect=[
            (0, "  master  \n"),
            (0, ""),
            (0, "2\n"),
        ])
        status = await check_branch_freshness(exec_fn, "127.0.0.1", "root")
        assert status.local_branch == "master"
        assert status.is_stale is True

    def test_is_test_failure_with_exit_code_zero_and_failure_text(self):
        result = "3 failed, 10 passed"
        assert is_test_failure(result, exit_code=0) is False

    @pytest.mark.asyncio
    async def test_freshness_check_empty_rev_list_output(self):
        exec_fn = AsyncMock(side_effect=[
            (0, "master\n"),
            (0, ""),
            (0, "\n"),
        ])
        status = await check_branch_freshness(exec_fn, "127.0.0.1", "root")
        assert status.is_stale is False
        assert status.commits_behind == 0

    def test_multiple_test_patterns_in_command(self):
        assert is_test_command("pytest && jest") is True

    def test_freshness_stats_get_recent_default_limit(self):
        stats = FreshnessStats()
        for i in range(15):
            stats.record(FreshnessEvent(
                tool_name="run_command", command=f"pytest {i}",
                is_stale=False, commits_behind=0, branch="main",
            ))
        recent = stats.get_recent()
        assert len(recent) == 10  # default limit

    @pytest.mark.asyncio
    async def test_annotate_returns_original_on_resolve_failure(self):
        from src.config.schema import ToolsConfig
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor(config=ToolsConfig())
        result = await executor._annotate_with_freshness(
            "Command failed (exit 1):\n3 failed",
            "nonexistent_host",
            "run_command",
            "pytest tests/",
        )
        assert result == "Command failed (exit 1):\n3 failed"

    @pytest.mark.asyncio
    async def test_annotate_returns_original_on_check_exception(self):
        from src.config.schema import ToolsConfig
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor(config=ToolsConfig())

        async def mock_exec(address, command, ssh_user, timeout=None):
            raise RuntimeError("crash")

        executor._exec_command = mock_exec
        executor._resolve_host = lambda alias: ("127.0.0.1", "root", "linux")
        result = await executor._annotate_with_freshness(
            "Command failed (exit 1):\n3 failed",
            "local",
            "run_command",
            "pytest tests/",
        )
        assert result == "Command failed (exit 1):\n3 failed"


# ====================================================================
# Existing fixture compatibility
# ====================================================================

class TestFixtureCompatibility:
    def test_new_fixture_pattern(self):
        """Verify the __new__() fixture pattern works with freshness attributes."""
        from src.tools.executor import ToolExecutor
        from src.tools.risk_classifier import RiskStats
        from src.tools.recovery import RecoveryStats
        from src.config.schema import ToolsConfig

        exec_inst = ToolExecutor.__new__(ToolExecutor)
        exec_inst.config = ToolsConfig()
        exec_inst._metrics = {}
        exec_inst._permission_manager = None
        exec_inst._recovery_enabled = False
        exec_inst.risk_stats = RiskStats()
        exec_inst.recovery_stats = RecoveryStats()
        exec_inst.freshness_stats = FreshnessStats()
        exec_inst._branch_freshness_enabled = False
        assert exec_inst.freshness_stats is not None
        assert exec_inst._branch_freshness_enabled is False
