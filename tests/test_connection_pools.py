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
from src.tools.executor import ToolExecutor
from src.tools.ssh import run_ssh_command
from src.tools.ssh_pool import (
    DEFAULT_CONTROL_PERSIST,
    SSHConnectionPool,
    _socket_path,
)

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
        cfg = OpenAICodexConfig(**{"connection_pool": {
            "max_connections": 15,
            "keepalive_timeout": 45,
        }})
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
            SSHConnectionPool(socket_dir=socket_dir)
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
            # Idle persistence is owned by the pool; command-side OpenSSH
            # must never daemonize a master under subreaper containment.
            assert "ControlPersist=no" in args
            assert "ControlPersist=90" not in args
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
    async def test_close_all_reaps_foreground_master_without_socket(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            master = AsyncMock(returncode=None)
            master.wait.side_effect = lambda: setattr(master, "returncode", 0) or 0
            pool._masters["root@host1"] = master
            pool._connections["root@host1"] = 1.0
            assert await pool.close_all() == 1
            master.wait.assert_awaited()
            assert pool._masters == {}

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
            await pool.close_host("host1", "root")
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
            assert result is True
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
                assert "ControlPersist=no" in call_args
                assert "ControlPersist=120" not in call_args

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
        client = CodexChatClient(auth=auth, model="test")
        assert client.pool_max_connections == 10
        assert client.pool_keepalive_timeout == 30

    def test_custom_pool_params(self):
        from src.llm.openai_codex import CodexChatClient
        auth = MagicMock()
        client = CodexChatClient(
            auth=auth, model="test",
            pool_max_connections=20, pool_keepalive_timeout=60,
        )
        assert client.pool_max_connections == 20
        assert client.pool_keepalive_timeout == 60

    def test_total_requests_starts_zero(self):
        from src.llm.openai_codex import CodexChatClient
        auth = MagicMock()
        client = CodexChatClient(auth=auth, model="test")
        assert client._total_requests == 0


# ---------------------------------------------------------------------------
# CodexChatClient.get_pool_metrics
# ---------------------------------------------------------------------------

class TestCodexPoolMetrics:
    def test_metrics_no_session(self):
        from src.llm.openai_codex import CodexChatClient
        auth = MagicMock()
        client = CodexChatClient(auth=auth, model="test")
        m = client.get_pool_metrics()
        assert m["http_pool_max_connections"] == 10
        assert m["http_pool_keepalive_timeout"] == 30
        assert m["http_pool_active_connections"] == 0
        assert m["http_pool_total_requests"] == 0

    def test_metrics_with_custom_config(self):
        from src.llm.openai_codex import CodexChatClient
        auth = MagicMock()
        client = CodexChatClient(
            auth=auth, model="test",
            pool_max_connections=20, pool_keepalive_timeout=60,
        )
        m = client.get_pool_metrics()
        assert m["http_pool_max_connections"] == 20
        assert m["http_pool_keepalive_timeout"] == 60

    def test_metrics_tracks_requests(self):
        from src.llm.openai_codex import CodexChatClient
        auth = MagicMock()
        client = CodexChatClient(auth=auth, model="test")
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
        bot = _make_bot(tool_executor=executor)
        async with TestClient(TestServer(_make_app(bot))) as client:
            resp = await client.get("/api/pools/ssh")
            assert resp.status == 200
            data = await resp.json()
            assert data["active_connections"] == 2

    async def test_ssh_pool_unavailable(self):
        from aiohttp.test_utils import TestClient, TestServer
        executor = MagicMock()
        executor.ssh_pool = None
        bot = _make_bot(tool_executor=executor)
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
        bot = _make_bot()
        bot.llm_gateway.codex_client = codex
        bot.llm_gateway.ollama_client = None
        bot.llm_gateway.kimi_client = None
        async with TestClient(TestServer(_make_app(bot))) as client:
            resp = await client.get("/api/pools/http")
            assert resp.status == 200
            data = await resp.json()
            assert data["codex"]["http_pool_total_requests"] == 42

    async def test_http_pool_unavailable(self):
        from aiohttp.test_utils import TestClient, TestServer
        bot = _make_bot()
        bot.llm_gateway.codex_client = None
        bot.llm_gateway.ollama_client = None
        bot.llm_gateway.kimi_client = None
        async with TestClient(TestServer(_make_app(bot))) as client:
            resp = await client.get("/api/pools/http")
            assert resp.status == 503

    async def test_close_ssh_pool_all(self):
        from aiohttp.test_utils import TestClient, TestServer
        executor = MagicMock()
        pool = AsyncMock()
        pool.close_all.return_value = 3
        executor.ssh_pool = pool
        bot = _make_bot(tool_executor=executor)
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
        bot = _make_bot(tool_executor=executor)
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


# ---------------------------------------------------------------------------
# ensure_master_registered (PR #244): ControlPersist master identity capture
# ---------------------------------------------------------------------------

class TestEnsureMasterRegistered:
    """A daemonized ControlPersist master is adopted by containment, so its
    exit status lands on Odin — the pool captures the master's identity
    while it is ALIVE so the zombie reaper may later consume it. The full
    lifecycle pin (register → die → pidfd reap) lives in
    test_process_manager.py; these cover the pool-side contract."""

    async def test_no_socket_registers_nothing_and_spawns_nothing(self):
        import src.tools.process_manager as pm

        pm._reset_reap_registry()
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            with patch(
                "src.tools.ssh_pool.asyncio.create_subprocess_exec"
            ) as mock_exec:
                assert await pool.ensure_master_registered("h1", "root") is False
                mock_exec.assert_not_called()
        assert pm.registered_reap_identities() == frozenset()

    async def test_check_failure_never_raises_and_never_registers(self):
        import src.tools.process_manager as pm

        pm._reset_reap_registry()
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            open(pool.get_socket_path("h1", "root"), "w").close()
            with patch(
                "src.tools.ssh_pool.asyncio.create_subprocess_exec",
                side_effect=OSError("no ssh binary"),
            ):
                assert await pool.ensure_master_registered("h1", "root") is False
        assert pm.registered_reap_identities() == frozenset()

    async def test_unparseable_check_output_is_false(self):
        import src.tools.process_manager as pm

        pm._reset_reap_registry()
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            open(pool.get_socket_path("h1", "root"), "w").close()
            proc = AsyncMock()
            proc.communicate.return_value = (b"Master running (pid=unknown)\n", b"")
            with patch(
                "src.tools.ssh_pool.asyncio.create_subprocess_exec",
                return_value=proc,
            ):
                assert await pool.ensure_master_registered("h1", "root") is False
        assert pm.registered_reap_identities() == frozenset()

    async def test_comm_mismatch_is_never_registered(self):
        """The -O check answer is corroborated against /proc: a pid that
        does not name an ssh process (recycled, or a lying master) must
        never enter the registry — evidence is read, not guessed."""
        import subprocess

        import src.tools.process_manager as pm

        pm._reset_reap_registry()
        bystander = subprocess.Popen(["sleep", "30"])
        try:
            with tempfile.TemporaryDirectory() as td:
                pool = SSHConnectionPool(socket_dir=td)
                open(pool.get_socket_path("h1", "root"), "w").close()
                proc = AsyncMock()
                proc.communicate.return_value = (
                    b"Master running (pid=%d)\n" % bystander.pid,
                    b"",
                )
                with patch(
                    "src.tools.ssh_pool.asyncio.create_subprocess_exec",
                    return_value=proc,
                ):
                    assert (
                        await pool.ensure_master_registered("h1", "root") is False
                    )
            assert pm.registered_reap_identities() == frozenset()
        finally:
            bystander.terminate()
            bystander.wait()

    async def test_check_exception_after_spawn_kills_the_probe(self):
        """communicate() failing after a successful spawn must kill the
        probe process and report False — never raise, never leak. A
        probe that is already gone when killed is equally fine."""
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            open(pool.get_socket_path("h1", "root"), "w").close()
            proc = AsyncMock()
            proc.communicate.side_effect = RuntimeError("probe died")
            proc.kill = MagicMock()
            with patch(
                "src.tools.ssh_pool.asyncio.create_subprocess_exec",
                return_value=proc,
            ):
                assert await pool.ensure_master_registered("h1", "root") is False
            proc.kill.assert_called_once()
            # Round 2: the reap itself fails (probe already gone).
            gone = AsyncMock()
            gone.communicate.side_effect = RuntimeError("probe died")
            gone.wait.side_effect = ProcessLookupError()
            with patch(
                "src.tools.ssh_pool.asyncio.create_subprocess_exec",
                return_value=gone,
            ):
                assert await pool.ensure_master_registered("h1", "root") is False

    async def test_cancellation_kills_the_probe_and_propagates(self):
        """Shutdown-time cancellation must not swallow — and must not
        leak the probe subprocess either, even when the reap fails."""
        import pytest

        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            open(pool.get_socket_path("h1", "root"), "w").close()
            proc = AsyncMock()
            proc.communicate.side_effect = asyncio.CancelledError()
            proc.kill = MagicMock()
            with patch(
                "src.tools.ssh_pool.asyncio.create_subprocess_exec",
                return_value=proc,
            ):
                with pytest.raises(asyncio.CancelledError):
                    await pool.ensure_master_registered("h1", "root")
            proc.kill.assert_called_once()
            # Round 2: the reap itself fails — cancellation still wins.
            gone = AsyncMock()
            gone.communicate.side_effect = asyncio.CancelledError()
            gone.wait.side_effect = OSError("gone")
            with patch(
                "src.tools.ssh_pool.asyncio.create_subprocess_exec",
                return_value=gone,
            ):
                with pytest.raises(asyncio.CancelledError):
                    await pool.ensure_master_registered("h1", "root")

    async def test_gone_pid_from_check_is_not_registered(self):
        """-O check names a pid that no longer exists: comm is unreadable,
        registration refused."""
        import src.tools.process_manager as pm

        pm._reset_reap_registry()
        free_pid = next(
            p
            for p in range(4194000, 4194304)
            if not os.path.exists(f"/proc/{p}")
        )
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            open(pool.get_socket_path("h1", "root"), "w").close()
            proc = AsyncMock()
            proc.communicate.return_value = (
                b"Master running (pid=%d)\n" % free_pid,
                b"",
            )
            with patch(
                "src.tools.ssh_pool.asyncio.create_subprocess_exec",
                return_value=proc,
            ):
                assert await pool.ensure_master_registered("h1", "root") is False
        assert pm.registered_reap_identities() == frozenset()

    async def test_master_dying_before_identity_read_is_not_registered(
        self, monkeypatch, tmp_path
    ):
        """comm said ssh, then the process died before the starttime
        read: no identity, no registration — never a guess."""
        import shutil
        import subprocess

        import src.tools.process_manager as pm

        pm._reset_reap_registry()
        sleep_bin = shutil.which("sleep")
        assert sleep_bin is not None
        fake_ssh = tmp_path / "ssh"
        shutil.copy(sleep_bin, fake_ssh)
        fake_ssh.chmod(0o755)
        master = subprocess.Popen([str(fake_ssh), "30"])
        try:
            with tempfile.TemporaryDirectory() as td:
                pool = SSHConnectionPool(socket_dir=td)
                open(pool.get_socket_path("h1", "root"), "w").close()
                proc = AsyncMock()
                proc.communicate.return_value = (
                    b"Master running (pid=%d)\n" % master.pid,
                    b"",
                )
                monkeypatch.setattr(pm, "_proc_starttime", lambda _p: None)
                with patch(
                    "src.tools.ssh_pool.asyncio.create_subprocess_exec",
                    return_value=proc,
                ):
                    assert (
                        await pool.ensure_master_registered("h1", "root") is False
                    )
            assert pm.registered_reap_identities() == frozenset()
        finally:
            master.terminate()
            master.wait()

    async def test_stale_recorded_identity_reprobes(self):
        """A recorded master that died (or whose pid was recycled) is
        discarded and the socket re-probed, never trusted."""
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            open(pool.get_socket_path("h1", "root"), "w").close()
            # pid 2 (kthreadd) exists but can never match this starttime.
            pool._registered_masters["root@h1"] = (2, 12345)
            probes: list = []

            async def fake_exec(*argv, **_kw):
                probes.append(argv)
                proc = AsyncMock()
                proc.communicate.return_value = (b"no master\n", b"")
                return proc

            with patch(
                "src.tools.ssh_pool.asyncio.create_subprocess_exec",
                side_effect=fake_exec,
            ):
                assert await pool.ensure_master_registered("h1", "root") is False
            assert probes  # the stale record did not satisfy the fast path
            assert "root@h1" not in pool._registered_masters


class TestForegroundMasterLifecycle:
    """The fast-double-fork leak is prevented by construction.

    A pooled master remains an asyncio-owned foreground child. Command-side
    OpenSSH has ControlPersist disabled, so neither process can daemonize and
    produce the already-adopted intermediate that runtime evidence cannot
    identify safely.
    """

    async def test_acquire_starts_direct_master_and_idle_expiry_reaps_it(
        self, tmp_path, monkeypatch
    ):
        pool = SSHConnectionPool(control_persist=0, socket_dir=str(tmp_path))
        socket = pool.get_socket_path("h1", "root")
        spawned: list[tuple[tuple, AsyncMock]] = []

        async def fake_exec(*argv, **_kwargs):
            proc = AsyncMock()
            proc.returncode = None
            proc.wait.side_effect = lambda: setattr(proc, "returncode", 0) or 0
            spawned.append((argv, proc))
            open(socket, "w").close()
            return proc

        monkeypatch.setattr(
            "src.tools.ssh_pool.asyncio.create_subprocess_exec", fake_exec
        )
        assert await pool.acquire("h1", "/key", "/known", "root") is True
        argv, master = spawned[0]
        assert "ControlMaster=yes" in argv
        assert "ControlPersist=no" in argv
        assert "-N" in argv
        assert pool._masters["root@h1"] is master

        pool.release("h1", "root")
        await asyncio.wait_for(pool._expiry_tasks["root@h1"], timeout=1)
        assert "root@h1" not in pool._masters
        master.wait.assert_awaited()

    async def test_acquire_reuses_live_direct_master(self, tmp_path):
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        socket = pool.get_socket_path("h1", "root")
        open(socket, "w").close()
        master = AsyncMock(returncode=None)
        master.wait.side_effect = lambda: setattr(master, "returncode", 0) or 0
        pool._masters["root@h1"] = master
        assert await pool.acquire("h1", "/k", "/kh") is True
        assert pool._active_leases["root@h1"] == 1
        pool.release("h1")
        await pool.close_all()

    async def test_failed_master_exits_without_lease(self, tmp_path, monkeypatch):
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        proc = AsyncMock(returncode=255)
        proc.wait.return_value = 255
        monkeypatch.setattr(
            "src.tools.ssh_pool.asyncio.create_subprocess_exec",
            AsyncMock(return_value=proc),
        )
        assert await pool.acquire("h1", "/k", "/kh") is False
        assert pool._active_leases == {}
        proc.wait.assert_awaited()

    async def test_master_start_cancellation_reaps_child(
        self, tmp_path, monkeypatch
    ):
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        proc = AsyncMock(returncode=None)
        proc.wait.return_value = 0
        proc.terminate = MagicMock()
        proc.kill = MagicMock()
        monkeypatch.setattr(
            "src.tools.ssh_pool.asyncio.create_subprocess_exec",
            AsyncMock(return_value=proc),
        )
        monkeypatch.setattr(
            "src.tools.ssh_pool.asyncio.sleep",
            AsyncMock(side_effect=asyncio.CancelledError),
        )
        with pytest.raises(asyncio.CancelledError):
            await pool.acquire("h1", "/k", "/kh")
        proc.terminate.assert_called_once()
        proc.wait.assert_awaited()

    async def test_stop_process_tolerates_signal_and_final_wait_failures(self):
        pool = SSHConnectionPool()
        proc = MagicMock(returncode=None)
        proc.terminate.side_effect = ProcessLookupError()
        proc.kill.side_effect = OSError("gone")
        proc.wait = AsyncMock(side_effect=[TimeoutError(), OSError("gone")])
        await pool._stop_process(proc)
        proc.terminate.assert_called_once()
        proc.kill.assert_called_once()

    async def test_stale_direct_master_is_reaped_before_replacement(
        self, tmp_path, monkeypatch
    ):
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        stale = AsyncMock(returncode=0)
        pool._masters["root@h1"] = stale
        fresh = AsyncMock(returncode=None)
        fresh.wait.return_value = 0
        fresh.terminate = MagicMock()
        monkeypatch.setattr(
            "src.tools.ssh_pool.asyncio.create_subprocess_exec",
            AsyncMock(return_value=fresh),
        )
        socket = pool.get_socket_path("h1", "root")

        async def create_socket(_delay):
            open(socket, "w").close()

        monkeypatch.setattr("src.tools.ssh_pool.asyncio.sleep", create_socket)
        assert await pool.acquire("h1", "/k", "/kh") is True
        stale.wait.assert_awaited()
        assert pool._masters["root@h1"] is fresh
        pool.release("h1")
        await pool.close_all()

    async def test_master_socket_deadline_returns_false(self, tmp_path, monkeypatch):
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        proc = AsyncMock(returncode=None)
        proc.wait.return_value = 0
        proc.terminate = MagicMock()
        proc.kill = MagicMock()
        monkeypatch.setattr(
            "src.tools.ssh_pool.asyncio.create_subprocess_exec",
            AsyncMock(return_value=proc),
        )
        clock = iter((0.0, 13.0))
        loop = MagicMock()
        loop.time.side_effect = lambda: next(clock)
        monkeypatch.setattr(
            "src.tools.ssh_pool.asyncio.get_running_loop", lambda: loop
        )
        assert await pool.acquire("h1", "/k", "/kh") is False
        proc.terminate.assert_called_once()
        proc.wait.assert_awaited()

    async def test_stop_process_escalates_after_wait_timeout(self):
        pool = SSHConnectionPool()
        proc = MagicMock(returncode=None)
        proc.wait = AsyncMock(side_effect=[TimeoutError(), 0])
        await pool._stop_process(proc)
        proc.terminate.assert_called_once()
        proc.kill.assert_called_once()
        assert proc.wait.await_count == 2

    async def test_two_leases_expire_only_after_last_release(
        self, tmp_path, monkeypatch
    ):
        pool = SSHConnectionPool(control_persist=0, socket_dir=str(tmp_path))
        socket = pool.get_socket_path("h1", "root")
        open(socket, "w").close()
        master = AsyncMock(returncode=None)
        master.wait.side_effect = lambda: setattr(master, "returncode", 0) or 0
        pool._masters["root@h1"] = master
        assert await pool.acquire("h1", "/k", "/kh") is True
        assert await pool.acquire("h1", "/k", "/kh") is True
        pool.release("h1")
        assert pool._active_leases["root@h1"] == 1
        assert pool._expiry_tasks == {}
        pool.release("h1")
        await asyncio.wait_for(pool._expiry_tasks["root@h1"], timeout=1)
        assert "root@h1" not in pool._masters

    async def test_expiry_cancellation_propagates_and_clears_record(
        self, tmp_path
    ):
        pool = SSHConnectionPool(control_persist=60, socket_dir=str(tmp_path))
        task = asyncio.create_task(pool._expire_after_idle("h1", "root"))
        pool._expiry_tasks["root@h1"] = task
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert "root@h1" not in pool._expiry_tasks

    async def test_expiry_failure_is_contained_and_task_record_cleared(
        self, tmp_path, monkeypatch
    ):
        pool = SSHConnectionPool(control_persist=0, socket_dir=str(tmp_path))
        pool._active_leases["root@h1"] = 1
        pool.release("h1")
        monkeypatch.setattr(
            pool, "close_host", AsyncMock(side_effect=RuntimeError("boom"))
        )
        await asyncio.wait_for(pool._expiry_tasks["root@h1"], timeout=1)
        assert "root@h1" not in pool._expiry_tasks

    async def test_command_never_enables_openssh_daemonization(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(control_persist=60, socket_dir=td)
            args = pool.get_ssh_args("h1", "true", "/k", "/kh")
            assert "ControlMaster=auto" in args
            assert "ControlPersist=no" in args
            assert not any(
                str(arg).startswith("ControlPersist=")
                and arg != "ControlPersist=no"
                for arg in args
            )

    def test_pre_acquire_state_preserves_opened_metric(self, tmp_path):
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        open(pool.get_socket_path("h1", "root"), "w").close()
        pool.get_ssh_args(
            "h1", "true", "/k", "/kh", was_connected=False
        )
        assert pool._total_opened == 1
        assert pool._total_reused == 0

    async def test_process_level_master_stays_direct_and_is_reaped(
        self, tmp_path, monkeypatch
    ):
        """Process-level pin for the soak's fast-double-fork class.

        The fake ssh deliberately models the relevant OpenSSH boundary: a
        master with ``ControlPersist=no`` remains the direct process and can
        be signalled through ``-O exit``; any other value exits before making
        a usable socket. Thus changing either master or command argv back to
        daemonizing persistence fails this pin instead of blessing the leak.
        """
        fake_ssh = tmp_path / "ssh"
        fake_ssh.write_text(
            "#!/usr/bin/env python3\n"
            "import os, signal, sys, time\n"
            "args = sys.argv[1:]\n"
            "path = next(a.split('=', 1)[1] for a in args "
            "if a.startswith('ControlPath='))\n"
            "if '-O' in args:\n"
            "    try:\n"
            "        pid = int(open(path + '.pid').read())\n"
            "        os.kill(pid, signal.SIGTERM)\n"
            "    except (OSError, ValueError):\n"
            "        pass\n"
            "    raise SystemExit(0)\n"
            "persist = next(a.split('=', 1)[1] for a in args "
            "if a.startswith('ControlPersist='))\n"
            "if persist != 'no':\n"
            "    raise SystemExit(42)\n"
            "open(path, 'w').close()\n"
            "with open(path + '.pid', 'w') as fh:\n"
            "    fh.write(str(os.getpid()))\n"
            "signal.signal(signal.SIGTERM, lambda *_: raise_exit())\n"
            "def never_called():\n"
            "    return None\n"
            "time.sleep(300)\n"
        )
        # Replace the forward-referenced signal handler with a definition
        # before installation while keeping the generated script readable.
        text = fake_ssh.read_text().replace(
            "signal.signal(signal.SIGTERM, lambda *_: raise_exit())\n"
            "def never_called():\n"
            "    return None\n",
            "def raise_exit():\n"
            "    raise SystemExit(0)\n"
            "signal.signal(signal.SIGTERM, lambda *_: raise_exit())\n",
        )
        fake_ssh.write_text(text)
        fake_ssh.chmod(0o755)
        monkeypatch.setenv("PATH", f"{tmp_path}:{os.environ['PATH']}")

        pool = SSHConnectionPool(control_persist=0, socket_dir=str(tmp_path / "s"))
        assert await pool.acquire("h1", "/k", "/kh") is True
        master = pool._masters["root@h1"]
        assert master.returncode is None
        raw = open(f"/proc/{master.pid}/stat", "rb").read()
        rest = raw.rsplit(b")", 1)[1].split()
        assert int(rest[1]) == os.getpid()

        pool.release("h1")
        await asyncio.wait_for(pool._expiry_tasks["root@h1"], timeout=2)
        assert master.returncode == 0
        assert not os.path.exists(f"/proc/{master.pid}")


class TestRunSSHCommandMasterRegistration:
    """run_ssh_command must attempt master registration after every pooled
    attempt — success, failure, or timeout — because the FIRST pooled
    command is what forks the master (PR #244)."""

    async def test_pooled_command_attempts_registration(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            seen: list = []

            async def record(host, ssh_user="root"):
                seen.append((host, ssh_user))
                return False

            pool.ensure_master_registered = record  # type: ignore[method-assign]
            with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec:
                proc = AsyncMock()
                proc.communicate.return_value = (b"ok", None)
                proc.returncode = 0
                mock_exec.return_value = proc
                await run_ssh_command("h1", "ls", "/k", "/kh", pool=pool)
            assert seen == [("h1", "root")]

    async def test_acquire_exception_becomes_bounded_ssh_error(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            pool.acquire = AsyncMock(side_effect=OSError("cannot spawn"))  # type: ignore[method-assign]
            code, out = await run_ssh_command(
                "h1", "ls", "/k", "/kh", pool=pool
            )
            assert code == 1
            assert out == "SSH error: cannot spawn"

    async def test_unpooled_command_has_no_pool_to_register(self):
        with patch("src.tools.ssh.asyncio.create_subprocess_exec") as mock_exec:
            proc = AsyncMock()
            proc.communicate.return_value = (b"ok", None)
            proc.returncode = 0
            mock_exec.return_value = proc
            code, _ = await run_ssh_command("h1", "ls", "/k", "/kh", pool=None)
            assert code == 0

    async def test_timeout_arm_still_attempts_registration(self):
        with tempfile.TemporaryDirectory() as td:
            pool = SSHConnectionPool(socket_dir=td)
            seen: list = []

            async def record(host, ssh_user="root"):
                seen.append((host, ssh_user))
                return False

            pool.ensure_master_registered = record  # type: ignore[method-assign]
            with patch(
                "src.tools.ssh.asyncio.create_subprocess_exec"
            ) as mock_exec, patch(
                "src.tools.ssh.terminate_process_tree", new_callable=AsyncMock
            ):
                proc = AsyncMock()
                proc.communicate.side_effect = TimeoutError()
                mock_exec.return_value = proc
                code, out = await run_ssh_command(
                    "h1", "ls", "/k", "/kh", timeout=1, pool=pool, max_retries=1
                )
            assert code == 1 and "timed out" in out
            assert seen == [("h1", "root")]
