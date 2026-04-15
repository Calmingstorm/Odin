"""Tests for SSH connection pooling and aiohttp keepalive pool (Round 9).

Tests the SSHConnectionPool (ControlMaster multiplexing), config models,
executor integration, CodexChatClient pool config, Prometheus metrics,
and REST API endpoints.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.config.schema import (
    Config,
    ConnectionPoolConfig,
    OpenAICodexConfig,
    SSHPoolConfig,
    ToolsConfig,
)
from src.tools.ssh_pool import (
    DEFAULT_CONTROL_PERSIST,
    DEFAULT_SOCKET_DIR,
    SSHConnectionPool,
    _socket_path,
)
from src.tools.ssh import run_ssh_command
from src.tools.executor import ToolExecutor


# ---------------------------------------------------------------------------
# SSHPoolConfig
# ---------------------------------------------------------------------------

class TestSSHPoolConfig:
    def test_defaults(self):
        cfg = SSHPoolConfig()
        assert cfg.enabled is True
        assert cfg.control_persist == 60
        assert cfg.socket_dir == "/tmp/odin_ssh_sockets"

    def test_custom_values(self):
        cfg = SSHPoolConfig(enabled=False, control_persist=120, socket_dir="/tmp/custom")
        assert cfg.enabled is False
        assert cfg.control_persist == 120
        assert cfg.socket_dir == "/tmp/custom"

    def test_on_tools_config_default(self):
        cfg = ToolsConfig()
        assert cfg.ssh_pool.enabled is True
        assert cfg.ssh_pool.control_persist == 60

    def test_on_tools_config_custom(self):
        cfg = ToolsConfig(ssh_pool=SSHPoolConfig(control_persist=300))
        assert cfg.ssh_pool.control_persist == 300

    def test_from_dict(self):
        cfg = ToolsConfig(**{"ssh_pool": {"enabled": False, "control_persist": 90}})
        assert cfg.ssh_pool.enabled is False
        assert cfg.ssh_pool.control_persist == 90

    def test_without_ssh_pool_key(self):
        cfg = ToolsConfig(**{})
        assert cfg.ssh_pool.enabled is True


# ---------------------------------------------------------------------------
# ConnectionPoolConfig
# ---------------------------------------------------------------------------

class TestConnectionPoolConfig:
    def test_defaults(self):
        cfg = ConnectionPoolConfig()
        assert cfg.max_connections == 10
        assert cfg.keepalive_timeout == 30

    def test_custom(self):
        cfg = ConnectionPoolConfig(max_connections=20, keepalive_timeout=60)
        assert cfg.max_connections == 20
        assert cfg.keepalive_timeout == 60

    def test_on_codex_config_default(self):
        cfg = OpenAICodexConfig()
        assert cfg.connection_pool.max_connections == 10
        assert cfg.connection_pool.keepalive_timeout == 30

    def test_on_codex_config_custom(self):
        cfg = OpenAICodexConfig(connection_pool=ConnectionPoolConfig(max_connections=5))
        assert cfg.connection_pool.max_connections == 5

    def test_from_dict(self):
        cfg = OpenAICodexConfig(**{"connection_pool": {"max_connections": 15, "keepalive_timeout": 45}})
        assert cfg.connection_pool.max_connections == 15
        assert cfg.connection_pool.keepalive_timeout == 45


# ---------------------------------------------------------------------------
# _socket_path
# ---------------------------------------------------------------------------

class TestSocketPath:
    def test_format(self):
        result = _socket_path("/tmp/sockets", "host1", "root")
        assert result == "/tmp/sockets/root@host1"

    def test_different_users(self):
        r1 = _socket_path("/tmp/s", "host", "root")
        r2 = _socket_path("/tmp/s", "host", "deploy")
        assert r1 != r2


# ---------------------------------------------------------------------------
# SSHConnectionPool
# ---------------------------------------------------------------------------

class TestSSHConnectionPool:
    def test_creates_socket_dir(self):
        with tempfile.TemporaryDirectory() as td:
            socket_dir = os.path.join(td, "ssh_sockets")
            pool = SSHConnectionPool(socket_dir=socket_dir)
            assert os.path.isdir(socket_dir)

    def test_default_values(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            assert pool.control_persist == DEFAULT_CONTROL_PERSIST
            assert pool._total_opened == 0
            assert pool._total_reused == 0

    def test_custom_control_persist(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(control_persist=120, socket_dir=td)
            assert pool.control_persist == 120

    def test_get_socket_path(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            path = pool.get_socket_path("myhost", "root")
            assert path == os.path.join(td, "root@myhost")

    def test_is_connected_false_when_no_socket(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            assert pool.is_connected("nonexistent", "root") is False

    def test_is_connected_true_when_socket_exists(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            socket = pool.get_socket_path("host1", "root")
            open(socket, "w").close()
            assert pool.is_connected("host1", "root") is True

    def test_get_active_hosts_empty(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            assert pool.get_active_hosts() == []

    def test_get_active_hosts_with_sockets(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            pool._connections["root@host1"] = 1.0
            pool._connections["root@host2"] = 2.0
            open(os.path.join(td, "root@host1"), "w").close()
            active = pool.get_active_hosts()
            assert "root@host1" in active
            assert "root@host2" not in active


# ---------------------------------------------------------------------------
# SSHConnectionPool.get_ssh_args
# ---------------------------------------------------------------------------

class TestSSHPoolGetArgs:
    def test_includes_control_master(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(control_persist=90, socket_dir=td)
            args = pool.get_ssh_args("host1", "ls", "/key", "/known", "root")
            assert "-o" in args
            assert "ControlMaster=auto" in args
            assert f"ControlPersist=90" in args
            assert f"ControlPath={td}/root@host1" in args

    def test_includes_standard_ssh_options(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            args = pool.get_ssh_args("host1", "ls", "/key", "/known", "root")
            assert args[0] == "ssh"
            assert "-i" in args
            assert "/key" in args
            assert "StrictHostKeyChecking=yes" in args
            assert "BatchMode=yes" in args
            assert "root@host1" in args
            assert args[-1] == "ls"

    def test_tracks_opened_count(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            pool.get_ssh_args("host1", "ls", "/k", "/kh", "root")
            assert pool._total_opened == 1
            assert pool._total_reused == 0

    def test_tracks_reused_count(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            # First call opens
            pool.get_ssh_args("host1", "ls", "/k", "/kh", "root")
            # Create socket to simulate active connection
            open(pool.get_socket_path("host1", "root"), "w").close()
            # Second call reuses
            pool.get_ssh_args("host1", "uptime", "/k", "/kh", "root")
            assert pool._total_opened == 1
            assert pool._total_reused == 1

    def test_different_hosts_separate_count(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            pool.get_ssh_args("host1", "ls", "/k", "/kh", "root")
            pool.get_ssh_args("host2", "ls", "/k", "/kh", "root")
            assert pool._total_opened == 2


# ---------------------------------------------------------------------------
# SSHConnectionPool.close_host / close_all
# ---------------------------------------------------------------------------

class TestSSHPoolClose:
    async def test_close_host_no_socket(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            result = await pool.close_host("nonexistent", "root")
            assert result is False

    async def test_close_host_with_socket(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            socket = pool.get_socket_path("host1", "root")
            open(socket, "w").close()
            pool._connections["root@host1"] = 1.0
            # The SSH -O exit command will fail since there's no real master,
            # but the fallback unlink should remove the socket
            result = await pool.close_host("host1", "root")
            assert "root@host1" not in pool._connections

    async def test_close_all_empty(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            count = await pool.close_all()
            assert count == 0

    async def test_close_all_clears_connections(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            pool._connections["root@host1"] = 1.0
            pool._connections["root@host2"] = 2.0
            await pool.close_all()
            assert len(pool._connections) == 0

    async def test_close_host_timeout_kills_process(self):
        """When ssh -O exit hangs, the process must be killed (not leaked)."""
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            socket_file = pool.get_socket_path("host1", "root")
            open(socket_file, "w").close()
            pool._connections["root@host1"] = 1.0

            mock_proc = AsyncMock()
            mock_proc.communicate = AsyncMock(
                side_effect=asyncio.TimeoutError,
            )
            mock_proc.kill = MagicMock()
            mock_proc.wait = AsyncMock()

            with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
                result = await pool.close_host("host1", "root")
            assert result is False
            mock_proc.kill.assert_called_once()
            assert "root@host1" not in pool._connections

    async def test_close_host_success_removes_connection(self):
        """Successful close via ssh -O exit removes the connection tracking."""
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            socket_file = pool.get_socket_path("host1", "root")
            open(socket_file, "w").close()
            pool._connections["root@host1"] = 1.0

            mock_proc = AsyncMock()
            mock_proc.communicate = AsyncMock(return_value=(b"", b""))

            with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
                with patch("asyncio.wait_for", return_value=None):
                    result = await pool.close_host("host1", "root")
            assert result is True
            assert "root@host1" not in pool._connections


# ---------------------------------------------------------------------------
# SSHConnectionPool.get_metrics / get_prometheus_metrics
# ---------------------------------------------------------------------------

class TestSSHPoolMetrics:
    def test_get_metrics_structure(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(control_persist=45, socket_dir=td)
            m = pool.get_metrics()
            assert m["active_connections"] == 0
            assert m["active_hosts"] == []
            assert m["total_opened"] == 0
            assert m["total_reused"] == 0
            assert m["control_persist"] == 45
            assert m["socket_dir"] == td

    def test_get_metrics_after_activity(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            pool.get_ssh_args("host1", "ls", "/k", "/kh", "root")
            open(pool.get_socket_path("host1", "root"), "w").close()
            m = pool.get_metrics()
            assert m["active_connections"] == 1
            assert m["total_opened"] == 1

    def test_get_prometheus_metrics_structure(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            m = pool.get_prometheus_metrics()
            assert "ssh_pool_active_connections" in m
            assert "ssh_pool_total_opened" in m
            assert "ssh_pool_total_reused" in m

    def test_get_prometheus_metrics_values(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            pool._total_opened = 5
            pool._total_reused = 3
            m = pool.get_prometheus_metrics()
            assert m["ssh_pool_total_opened"] == 5
            assert m["ssh_pool_total_reused"] == 3


# ---------------------------------------------------------------------------
# run_ssh_command with pool
# ---------------------------------------------------------------------------

class TestSSHCommandWithPool:
    async def test_pool_args_used(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(control_persist=120, socket_dir=td)
            with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec:
                mock_proc = AsyncMock()
                mock_proc.communicate.return_value = (b"output", None)
                mock_proc.returncode = 0
                mock_exec.return_value = mock_proc

                await run_ssh_command(
                    "host1", "ls", "/key", "/known",
                    timeout=10, ssh_user="root", pool=pool,
                )
                call_args = mock_exec.call_args[0]
                # Should include ControlMaster options
                assert "ControlMaster=auto" in call_args
                assert f"ControlPersist=120" in call_args

    async def test_no_pool_no_control_master(self):
        with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec:
            mock_proc = AsyncMock()
            mock_proc.communicate.return_value = (b"output", None)
            mock_proc.returncode = 0
            mock_exec.return_value = mock_proc

            await run_ssh_command(
                "host1", "ls", "/key", "/known",
                timeout=10, ssh_user="root", pool=None,
            )
            call_args = mock_exec.call_args[0]
            assert "ControlMaster=auto" not in call_args

    async def test_pool_tracks_reuse(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec:
                mock_proc = AsyncMock()
                mock_proc.communicate.return_value = (b"ok", None)
                mock_proc.returncode = 0
                mock_exec.return_value = mock_proc

                await run_ssh_command("h1", "ls", "/k", "/kh", pool=pool)
                assert pool._total_opened == 1

                # Simulate socket creation (ControlMaster established)
                open(pool.get_socket_path("h1", "root"), "w").close()
                await run_ssh_command("h1", "uptime", "/k", "/kh", pool=pool)
                assert pool._total_reused == 1


# ---------------------------------------------------------------------------
# ToolExecutor SSH pool integration
# ---------------------------------------------------------------------------

class TestExecutorSSHPool:
    def test_executor_creates_pool_when_enabled(self):
        cfg = ToolsConfig(ssh_pool=SSHPoolConfig(enabled=True, control_persist=45))
        executor = ToolExecutor(config=cfg)
        assert executor.ssh_pool is not None
        assert executor.ssh_pool.control_persist == 45

    def test_executor_no_pool_when_disabled(self):
        cfg = ToolsConfig(ssh_pool=SSHPoolConfig(enabled=False))
        executor = ToolExecutor(config=cfg)
        assert executor.ssh_pool is None

    def test_executor_default_pool_enabled(self):
        cfg = ToolsConfig()
        executor = ToolExecutor(config=cfg)
        assert executor.ssh_pool is not None

    async def test_executor_passes_pool_to_ssh(self):
        cfg = ToolsConfig(
            hosts={"myhost": {"address": "10.0.0.1", "ssh_user": "root"}},
            ssh_pool=SSHPoolConfig(enabled=True),
        )
        executor = ToolExecutor(config=cfg)
        with patch("src.tools.executor.run_ssh_command", new_callable=AsyncMock) as mock_ssh:
            mock_ssh.return_value = (0, "ok")
            await executor._exec_command("10.0.0.1", "ls", "root")
            _, kwargs = mock_ssh.call_args
            assert kwargs.get("pool") is executor.ssh_pool

    async def test_executor_no_pool_when_disabled_passes_none(self):
        cfg = ToolsConfig(
            hosts={"myhost": {"address": "10.0.0.1", "ssh_user": "root"}},
            ssh_pool=SSHPoolConfig(enabled=False),
        )
        executor = ToolExecutor(config=cfg)
        with patch("src.tools.executor.run_ssh_command", new_callable=AsyncMock) as mock_ssh:
            mock_ssh.return_value = (0, "ok")
            await executor._exec_command("10.0.0.1", "ls", "root")
            _, kwargs = mock_ssh.call_args
            assert kwargs.get("pool") is None

    async def test_local_command_unaffected_by_pool(self):
        cfg = ToolsConfig(ssh_pool=SSHPoolConfig(enabled=True))
        executor = ToolExecutor(config=cfg)
        with patch("src.tools.executor.run_local_command", new_callable=AsyncMock) as mock_local:
            mock_local.return_value = (0, "ok")
            await executor._exec_command("127.0.0.1", "ls")
            mock_local.assert_called_once()


# ---------------------------------------------------------------------------
# CodexChatClient pool config
# ---------------------------------------------------------------------------

class TestCodexPoolConfig:
    def test_default_pool_params(self):
        from src.llm.openai_codex import CodexChatClient
        auth = MagicMock()
        client = CodexChatClient(auth=auth, model="test", max_tokens=100)
        assert client.pool_max_connections == 10
        assert client.pool_keepalive_timeout == 30

    def test_custom_pool_params(self):
        from src.llm.openai_codex import CodexChatClient
        auth = MagicMock()
        client = CodexChatClient(
            auth=auth, model="test", max_tokens=100,
            pool_max_connections=20, pool_keepalive_timeout=60,
        )
        assert client.pool_max_connections == 20
        assert client.pool_keepalive_timeout == 60

    def test_total_requests_starts_zero(self):
        from src.llm.openai_codex import CodexChatClient
        auth = MagicMock()
        client = CodexChatClient(auth=auth, model="test", max_tokens=100)
        assert client._total_requests == 0


# ---------------------------------------------------------------------------
# CodexChatClient.get_pool_metrics
# ---------------------------------------------------------------------------

class TestCodexPoolMetrics:
    def test_metrics_no_session(self):
        from src.llm.openai_codex import CodexChatClient
        auth = MagicMock()
        client = CodexChatClient(auth=auth, model="test", max_tokens=100)
        m = client.get_pool_metrics()
        assert m["http_pool_max_connections"] == 10
        assert m["http_pool_keepalive_timeout"] == 30
        assert m["http_pool_active_connections"] == 0
        assert m["http_pool_total_requests"] == 0

    def test_metrics_with_custom_config(self):
        from src.llm.openai_codex import CodexChatClient
        auth = MagicMock()
        client = CodexChatClient(
            auth=auth, model="test", max_tokens=100,
            pool_max_connections=20, pool_keepalive_timeout=60,
        )
        m = client.get_pool_metrics()
        assert m["http_pool_max_connections"] == 20
        assert m["http_pool_keepalive_timeout"] == 60

    def test_metrics_tracks_requests(self):
        from src.llm.openai_codex import CodexChatClient
        auth = MagicMock()
        client = CodexChatClient(auth=auth, model="test", max_tokens=100)
        client._total_requests = 42
        m = client.get_pool_metrics()
        assert m["http_pool_total_requests"] == 42


# ---------------------------------------------------------------------------
# Prometheus metrics rendering
# ---------------------------------------------------------------------------

class TestSSHPoolPrometheusMetrics:
    def test_rendered(self):
        from src.health.metrics import MetricsCollector
        mc = MetricsCollector()

        def source():
            return {
                "ssh_pool_active_connections": 3,
                "ssh_pool_total_opened": 10,
                "ssh_pool_total_reused": 7,
            }

        mc.register_source("ssh_pool", source)
        output = mc.render()
        assert "odin_ssh_pool_active_connections" in output
        assert "odin_ssh_pool_total_opened" in output
        assert "odin_ssh_pool_total_reused" in output

    def test_absent(self):
        from src.health.metrics import MetricsCollector
        mc = MetricsCollector()
        output = mc.render()
        assert "odin_ssh_pool" not in output

    def test_empty_values(self):
        from src.health.metrics import MetricsCollector
        mc = MetricsCollector()
        mc.register_source("ssh_pool", lambda: {
            "ssh_pool_active_connections": 0,
            "ssh_pool_total_opened": 0,
            "ssh_pool_total_reused": 0,
        })
        output = mc.render()
        assert "odin_ssh_pool_active_connections 0" in output


class TestHTTPPoolPrometheusMetrics:
    def test_rendered(self):
        from src.health.metrics import MetricsCollector
        mc = MetricsCollector()
        mc.register_source("http_pool", lambda: {
            "http_pool_active_connections": 2,
            "http_pool_max_connections": 10,
            "http_pool_total_requests": 50,
        })
        output = mc.render()
        assert "odin_http_pool_active_connections" in output
        assert "odin_http_pool_max_connections" in output
        assert "odin_http_pool_total_requests" in output

    def test_absent(self):
        from src.health.metrics import MetricsCollector
        mc = MetricsCollector()
        output = mc.render()
        assert "odin_http_pool" not in output

    def test_counter_type(self):
        from src.health.metrics import MetricsCollector
        mc = MetricsCollector()
        mc.register_source("http_pool", lambda: {
            "http_pool_active_connections": 0,
            "http_pool_max_connections": 10,
            "http_pool_total_requests": 100,
        })
        output = mc.render()
        assert "# TYPE odin_http_pool_total_requests counter" in output


# ---------------------------------------------------------------------------
# REST API endpoints
# ---------------------------------------------------------------------------

def _make_bot(**overrides):
    bot = MagicMock()
    bot.config = MagicMock()
    bot.config.web = MagicMock()
    bot.config.web.api_token = ""
    for k, v in overrides.items():
        setattr(bot, k, v)
    return bot


def _make_app(bot):
    from aiohttp import web
    from src.web.api import setup_api
    app = web.Application()
    setup_api(app, bot)
    return app


class TestPoolAPI:
    async def test_ssh_pool_endpoint(self):
        from aiohttp.test_utils import TestClient, TestServer
        executor = MagicMock()
        pool = MagicMock()
        pool.get_metrics.return_value = {
            "active_connections": 2, "total_opened": 5, "total_reused": 3,
        }
        executor.ssh_pool = pool
        bot = _make_bot(executor=executor)
        async with TestClient(TestServer(_make_app(bot))) as client:
            resp = await client.get("/api/pools/ssh")
            assert resp.status == 200
            data = await resp.json()
            assert data["active_connections"] == 2

    async def test_ssh_pool_unavailable(self):
        from aiohttp.test_utils import TestClient, TestServer
        executor = MagicMock()
        executor.ssh_pool = None
        bot = _make_bot(executor=executor)
        async with TestClient(TestServer(_make_app(bot))) as client:
            resp = await client.get("/api/pools/ssh")
            assert resp.status == 503

    async def test_http_pool_endpoint(self):
        from aiohttp.test_utils import TestClient, TestServer
        codex = MagicMock()
        codex.get_pool_metrics.return_value = {
            "http_pool_max_connections": 10,
            "http_pool_active_connections": 1,
            "http_pool_total_requests": 42,
        }
        bot = _make_bot(codex=codex)
        async with TestClient(TestServer(_make_app(bot))) as client:
            resp = await client.get("/api/pools/http")
            assert resp.status == 200
            data = await resp.json()
            assert data["http_pool_total_requests"] == 42

    async def test_http_pool_unavailable(self):
        from aiohttp.test_utils import TestClient, TestServer
        bot = MagicMock(spec=[])
        bot.config = MagicMock()
        bot.config.web = MagicMock()
        bot.config.web.api_token = ""
        async with TestClient(TestServer(_make_app(bot))) as client:
            resp = await client.get("/api/pools/http")
            assert resp.status == 503

    async def test_close_ssh_pool_all(self):
        from aiohttp.test_utils import TestClient, TestServer
        executor = MagicMock()
        pool = AsyncMock()
        pool.close_all.return_value = 3
        executor.ssh_pool = pool
        bot = _make_bot(executor=executor)
        async with TestClient(TestServer(_make_app(bot))) as client:
            resp = await client.post("/api/pools/ssh/close", json={})
            assert resp.status == 200
            data = await resp.json()
            assert data["closed_count"] == 3

    async def test_close_ssh_pool_host(self):
        from aiohttp.test_utils import TestClient, TestServer
        executor = MagicMock()
        pool = AsyncMock()
        pool.close_host.return_value = True
        executor.ssh_pool = pool
        bot = _make_bot(executor=executor)
        async with TestClient(TestServer(_make_app(bot))) as client:
            resp = await client.post(
                "/api/pools/ssh/close",
                json={"host": "myhost", "ssh_user": "deploy"},
            )
            assert resp.status == 200
            data = await resp.json()
            assert data["closed"] is True
            assert data["host"] == "myhost"


# ---------------------------------------------------------------------------
# Config round-trip
# ---------------------------------------------------------------------------

class TestConfigRoundTrip:
    def test_full_config_with_pools(self):
        cfg = Config(
            discord={"token": "test"},
            tools={"ssh_pool": {"enabled": True, "control_persist": 90}},
            openai_codex={"connection_pool": {"max_connections": 20}},
        )
        assert cfg.tools.ssh_pool.control_persist == 90
        assert cfg.openai_codex.connection_pool.max_connections == 20

    def test_full_config_without_pools(self):
        cfg = Config(discord={"token": "test"})
        assert cfg.tools.ssh_pool.enabled is True
        assert cfg.openai_codex.connection_pool.max_connections == 10

    def test_model_dump_includes_pools(self):
        cfg = ToolsConfig()
        d = cfg.model_dump()
        assert "ssh_pool" in d
        assert d["ssh_pool"]["enabled"] is True
        assert d["ssh_pool"]["control_persist"] == 60

    def test_codex_model_dump_includes_pool(self):
        cfg = OpenAICodexConfig()
        d = cfg.model_dump()
        assert "connection_pool" in d
        assert d["connection_pool"]["max_connections"] == 10


# ---------------------------------------------------------------------------
# Integration: pool + bulkhead coexistence
# ---------------------------------------------------------------------------

class TestPoolBulkheadCoexistence:
    def test_executor_has_both(self):
        cfg = ToolsConfig(ssh_pool=SSHPoolConfig(enabled=True))
        executor = ToolExecutor(config=cfg)
        assert executor.ssh_pool is not None
        assert executor.bulkheads is not None
        assert executor.bulkheads.get("ssh") is not None

    async def test_pool_works_within_bulkhead(self):
        cfg = ToolsConfig(
            hosts={"h": {"address": "10.0.0.1"}},
            ssh_pool=SSHPoolConfig(enabled=True),
        )
        executor = ToolExecutor(config=cfg)
        with patch("src.tools.executor.run_ssh_command", new_callable=AsyncMock) as mock_ssh:
            mock_ssh.return_value = (0, "ok")
            code, out = await executor._exec_command("10.0.0.1", "ls", "root")
            assert code == 0
            _, kwargs = mock_ssh.call_args
            assert kwargs["pool"] is executor.ssh_pool
