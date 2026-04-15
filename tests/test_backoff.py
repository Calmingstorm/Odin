"""Tests for exponential backoff with jitter (Round 6).

Tests the backoff module, Codex retry config integration, and SSH retry logic.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.config.schema import OpenAICodexConfig, RetryConfig, ToolsConfig
from src.llm.backoff import (
    DEFAULT_BASE_DELAY,
    DEFAULT_MAX_DELAY,
    DEFAULT_MAX_RETRIES,
    compute_backoff,
    compute_backoff_no_jitter,
)
from src.tools.ssh import (
    _SSH_TRANSIENT_EXIT_CODES,
    _SSH_TRANSIENT_PATTERNS,
    _is_ssh_transient_failure,
    run_ssh_command,
)


# ---------------------------------------------------------------------------
# compute_backoff
# ---------------------------------------------------------------------------

class TestComputeBackoff:
    def test_attempt_zero_bounded(self):
        for _ in range(50):
            val = compute_backoff(0)
            assert 0 <= val <= DEFAULT_BASE_DELAY

    def test_attempt_one_bounded(self):
        for _ in range(50):
            val = compute_backoff(1)
            assert 0 <= val <= DEFAULT_BASE_DELAY * 2

    def test_attempt_five_bounded(self):
        for _ in range(50):
            val = compute_backoff(5)
            assert 0 <= val <= DEFAULT_MAX_DELAY

    def test_max_delay_cap(self):
        for _ in range(50):
            val = compute_backoff(100, max_delay=5.0)
            assert 0 <= val <= 5.0

    def test_custom_base_delay(self):
        for _ in range(50):
            val = compute_backoff(0, base_delay=10.0)
            assert 0 <= val <= 10.0

    def test_returns_float(self):
        assert isinstance(compute_backoff(0), float)

    def test_jitter_produces_variation(self):
        values = {compute_backoff(2) for _ in range(20)}
        assert len(values) > 1

    def test_large_attempt_capped(self):
        val = compute_backoff(20, base_delay=1.0, max_delay=30.0)
        assert 0 <= val <= 30.0


class TestComputeBackoffNoJitter:
    def test_attempt_zero(self):
        assert compute_backoff_no_jitter(0) == DEFAULT_BASE_DELAY

    def test_attempt_one(self):
        assert compute_backoff_no_jitter(1) == DEFAULT_BASE_DELAY * 2

    def test_attempt_two(self):
        assert compute_backoff_no_jitter(2) == DEFAULT_BASE_DELAY * 4

    def test_max_delay_cap(self):
        assert compute_backoff_no_jitter(100, max_delay=5.0) == 5.0

    def test_custom_base(self):
        assert compute_backoff_no_jitter(0, base_delay=3.0) == 3.0

    def test_deterministic(self):
        a = compute_backoff_no_jitter(3, base_delay=2.0, max_delay=50.0)
        b = compute_backoff_no_jitter(3, base_delay=2.0, max_delay=50.0)
        assert a == b == 16.0


class TestBackoffDefaults:
    def test_default_base_delay(self):
        assert DEFAULT_BASE_DELAY == 1.0

    def test_default_max_delay(self):
        assert DEFAULT_MAX_DELAY == 30.0

    def test_default_max_retries(self):
        assert DEFAULT_MAX_RETRIES == 3


# ---------------------------------------------------------------------------
# RetryConfig
# ---------------------------------------------------------------------------

class TestRetryConfig:
    def test_defaults(self):
        cfg = RetryConfig()
        assert cfg.max_retries == 3
        assert cfg.base_delay == 1.0
        assert cfg.max_delay == 30.0

    def test_custom_values(self):
        cfg = RetryConfig(max_retries=5, base_delay=2.0, max_delay=60.0)
        assert cfg.max_retries == 5
        assert cfg.base_delay == 2.0
        assert cfg.max_delay == 60.0

    def test_on_openai_codex_config(self):
        cfg = OpenAICodexConfig()
        assert cfg.retry.max_retries == 3
        assert cfg.retry.base_delay == 1.0

    def test_on_openai_codex_config_custom(self):
        cfg = OpenAICodexConfig(retry=RetryConfig(max_retries=5))
        assert cfg.retry.max_retries == 5

    def test_on_tools_config(self):
        cfg = ToolsConfig()
        assert cfg.ssh_retry.max_retries == 2
        assert cfg.ssh_retry.base_delay == 0.5
        assert cfg.ssh_retry.max_delay == 10.0

    def test_on_tools_config_custom(self):
        cfg = ToolsConfig(ssh_retry=RetryConfig(max_retries=4, base_delay=1.0, max_delay=20.0))
        assert cfg.ssh_retry.max_retries == 4


# ---------------------------------------------------------------------------
# CodexChatClient retry config
# ---------------------------------------------------------------------------

class TestCodexClientRetryConfig:
    def test_default_retry_params(self):
        from src.llm.openai_codex import CodexChatClient

        auth = MagicMock()
        client = CodexChatClient(auth=auth, model="gpt-4o", max_tokens=4096)
        assert client.max_retries == DEFAULT_MAX_RETRIES
        assert client.retry_base_delay == DEFAULT_BASE_DELAY
        assert client.retry_max_delay == DEFAULT_MAX_DELAY

    def test_custom_retry_params(self):
        from src.llm.openai_codex import CodexChatClient

        auth = MagicMock()
        client = CodexChatClient(
            auth=auth, model="gpt-4o", max_tokens=4096,
            max_retries=5, retry_base_delay=2.0, retry_max_delay=60.0,
        )
        assert client.max_retries == 5
        assert client.retry_base_delay == 2.0
        assert client.retry_max_delay == 60.0


# ---------------------------------------------------------------------------
# SSH transient failure detection
# ---------------------------------------------------------------------------

class TestIsSSHTransientFailure:
    def test_connection_refused_255(self):
        assert _is_ssh_transient_failure(255, "ssh: connect to host 10.0.0.1 port 22: Connection refused")

    def test_connection_reset_255(self):
        assert _is_ssh_transient_failure(255, "Connection reset by peer")

    def test_connection_timed_out_255(self):
        assert _is_ssh_transient_failure(255, "Connection timed out")

    def test_no_route_to_host_255(self):
        assert _is_ssh_transient_failure(255, "No route to host")

    def test_network_unreachable_255(self):
        assert _is_ssh_transient_failure(255, "Network is unreachable")

    def test_kex_exchange_255(self):
        assert _is_ssh_transient_failure(255, "kex_exchange_identification: Connection closed")

    def test_ssh_exchange_255(self):
        assert _is_ssh_transient_failure(255, "ssh_exchange_identification: Connection closed")

    def test_exit_255_unknown_error_not_transient(self):
        assert not _is_ssh_transient_failure(255, "Permission denied (publickey)")

    def test_exit_1_not_transient(self):
        assert not _is_ssh_transient_failure(1, "command not found")

    def test_exit_0_not_transient(self):
        assert not _is_ssh_transient_failure(0, "Connection refused")

    def test_exit_code_set(self):
        assert 255 in _SSH_TRANSIENT_EXIT_CODES

    def test_patterns_nonempty(self):
        assert len(_SSH_TRANSIENT_PATTERNS) >= 5


# ---------------------------------------------------------------------------
# SSH retry integration
# ---------------------------------------------------------------------------

class TestSSHRetry:
    @pytest.fixture
    def ssh_kwargs(self):
        return dict(
            host="10.0.0.1",
            command="uptime",
            ssh_key_path="/tmp/key",
            known_hosts_path="/tmp/known",
            timeout=10,
        )

    async def test_no_retry_on_success(self, ssh_kwargs):
        with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec:
            proc = AsyncMock()
            proc.communicate.return_value = (b"up 5 days", b"")
            proc.returncode = 0
            mock_exec.return_value = proc

            code, out = await run_ssh_command(**ssh_kwargs, max_retries=3)
            assert code == 0
            assert "up 5 days" in out
            assert mock_exec.call_count == 1

    async def test_no_retry_on_command_failure(self, ssh_kwargs):
        with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec:
            proc = AsyncMock()
            proc.communicate.return_value = (b"command not found", b"")
            proc.returncode = 127
            mock_exec.return_value = proc

            code, out = await run_ssh_command(**ssh_kwargs, max_retries=3)
            assert code == 127
            assert mock_exec.call_count == 1

    async def test_retry_on_connection_refused(self, ssh_kwargs):
        with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec, \
             patch("src.tools.ssh.compute_backoff", return_value=0.0):
            fail_proc = AsyncMock()
            fail_proc.communicate.return_value = (b"ssh: connect to host 10.0.0.1 port 22: Connection refused", b"")
            fail_proc.returncode = 255

            ok_proc = AsyncMock()
            ok_proc.communicate.return_value = (b"up 5 days", b"")
            ok_proc.returncode = 0

            mock_exec.side_effect = [fail_proc, ok_proc]

            code, out = await run_ssh_command(**ssh_kwargs, max_retries=3)
            assert code == 0
            assert "up 5 days" in out
            assert mock_exec.call_count == 2

    async def test_exhausted_retries(self, ssh_kwargs):
        with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec, \
             patch("src.tools.ssh.compute_backoff", return_value=0.0):
            fail_proc = AsyncMock()
            fail_proc.communicate.return_value = (b"Connection refused", b"")
            fail_proc.returncode = 255
            mock_exec.return_value = fail_proc

            code, out = await run_ssh_command(**ssh_kwargs, max_retries=2)
            assert code == 255
            assert "Connection refused" in out
            assert mock_exec.call_count == 2

    async def test_retry_on_timeout(self, ssh_kwargs):
        call_count = 0

        async def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                proc = AsyncMock()
                proc.communicate.side_effect = asyncio.TimeoutError()
                proc.kill = MagicMock()
                return proc
            proc = AsyncMock()
            proc.communicate.return_value = (b"ok", b"")
            proc.returncode = 0
            return proc

        with patch("src.tools.ssh.asyncio.create_subprocess_exec", side_effect=side_effect), \
             patch("src.tools.ssh.compute_backoff", return_value=0.0):
            code, out = await run_ssh_command(**ssh_kwargs, max_retries=3)
            assert code == 0
            assert "ok" in out

    async def test_no_retry_on_exception(self, ssh_kwargs):
        with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec:
            mock_exec.side_effect = OSError("no such file")

            code, out = await run_ssh_command(**ssh_kwargs, max_retries=3)
            assert code == 1
            assert "SSH error" in out
            assert mock_exec.call_count == 1

    async def test_default_retry_params(self, ssh_kwargs):
        with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec:
            proc = AsyncMock()
            proc.communicate.return_value = (b"ok", b"")
            proc.returncode = 0
            mock_exec.return_value = proc

            code, out = await run_ssh_command(**ssh_kwargs)
            assert code == 0
            assert mock_exec.call_count == 1

    async def test_backoff_called_with_correct_params(self, ssh_kwargs):
        with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec, \
             patch("src.tools.ssh.compute_backoff", return_value=0.0) as mock_backoff:
            fail_proc = AsyncMock()
            fail_proc.communicate.return_value = (b"Connection refused", b"")
            fail_proc.returncode = 255

            ok_proc = AsyncMock()
            ok_proc.communicate.return_value = (b"ok", b"")
            ok_proc.returncode = 0

            mock_exec.side_effect = [fail_proc, ok_proc]

            await run_ssh_command(
                **ssh_kwargs,
                max_retries=3,
                retry_base_delay=2.0,
                retry_max_delay=15.0,
            )

            mock_backoff.assert_called_once_with(0, 2.0, 15.0)


# ---------------------------------------------------------------------------
# Executor passes SSH retry config
# ---------------------------------------------------------------------------

class TestExecutorSSHRetryConfig:
    async def test_exec_command_passes_retry_config(self):
        from src.tools.executor import ToolExecutor

        cfg = ToolsConfig(
            ssh_key_path="/tmp/k",
            ssh_known_hosts_path="/tmp/kh",
            hosts={"myhost": {"address": "10.0.0.5"}},
            ssh_retry=RetryConfig(max_retries=4, base_delay=2.0, max_delay=20.0),
        )
        executor = ToolExecutor(config=cfg)

        with patch("src.tools.executor.run_ssh_command", new_callable=AsyncMock) as mock_ssh:
            mock_ssh.return_value = (0, "ok")
            await executor._exec_command("10.0.0.5", "uptime")

            mock_ssh.assert_called_once()
            _, kwargs = mock_ssh.call_args
            assert kwargs["max_retries"] == 4
            assert kwargs["retry_base_delay"] == 2.0
            assert kwargs["retry_max_delay"] == 20.0

    async def test_exec_command_default_retry_config(self):
        from src.tools.executor import ToolExecutor

        executor = ToolExecutor()

        with patch("src.tools.executor.run_ssh_command", new_callable=AsyncMock) as mock_ssh:
            mock_ssh.return_value = (0, "ok")
            await executor._exec_command("10.0.0.5", "uptime")

            _, kwargs = mock_ssh.call_args
            assert kwargs["max_retries"] == 2
            assert kwargs["retry_base_delay"] == 0.5
            assert kwargs["retry_max_delay"] == 10.0

    async def test_local_command_not_affected(self):
        from src.tools.executor import ToolExecutor

        executor = ToolExecutor()

        with patch("src.tools.executor.run_local_command", new_callable=AsyncMock) as mock_local:
            mock_local.return_value = (0, "ok")
            await executor._exec_command("localhost", "uptime")
            mock_local.assert_called_once()


# ---------------------------------------------------------------------------
# Codex retry uses compute_backoff (integration-level)
# ---------------------------------------------------------------------------

class TestCodexRetriesUseBackoff:
    def test_no_retry_backoff_constant(self):
        """Verify the old fixed RETRY_BACKOFF list is gone."""
        import src.llm.openai_codex as mod
        assert not hasattr(mod, "RETRY_BACKOFF")

    def test_no_max_retries_constant(self):
        """Verify the old MAX_RETRIES module constant is gone."""
        import src.llm.openai_codex as mod
        assert not hasattr(mod, "MAX_RETRIES")

    def test_compute_backoff_imported(self):
        import src.llm.openai_codex as mod
        assert hasattr(mod, "compute_backoff")


# ---------------------------------------------------------------------------
# Schema serialization round-trip
# ---------------------------------------------------------------------------

class TestRetryConfigYAML:
    def test_tools_config_with_retry_from_dict(self):
        cfg = ToolsConfig(**{
            "ssh_retry": {"max_retries": 5, "base_delay": 1.5, "max_delay": 20.0},
        })
        assert cfg.ssh_retry.max_retries == 5
        assert cfg.ssh_retry.base_delay == 1.5

    def test_openai_codex_config_with_retry_from_dict(self):
        cfg = OpenAICodexConfig(**{
            "retry": {"max_retries": 7, "base_delay": 0.5},
        })
        assert cfg.retry.max_retries == 7
        assert cfg.retry.base_delay == 0.5
        assert cfg.retry.max_delay == 30.0  # default preserved

    def test_tools_config_without_retry_key(self):
        cfg = ToolsConfig()
        assert cfg.ssh_retry is not None
        assert cfg.ssh_retry.max_retries == 2
