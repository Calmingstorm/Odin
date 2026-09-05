"""Hermetic edge coverage for host-aware media, skills, and SSH pooling."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.discord.native_tools.media import MediaTools
from src.tools.executor import ToolExecutor
from src.tools.skill_context import SkillContext
from src.tools.ssh_pool import SSHConnectionPool, _socket_path


class _Lease:
    def __init__(self) -> None:
        self.target = SimpleNamespace(
            address="host.invalid",
            ssh_user="root",
            key_path="/no-key",
            known_hosts_path="/no-known-hosts",
            port=22,
            host_key_alias="",
        )
        self.released = False

    async def run(self, operation):
        return await operation()

    def release(self) -> None:
        self.released = True


class _Message:
    def __init__(self) -> None:
        self.author = SimpleNamespace(id=123)
        self.channel = SimpleNamespace(send=AsyncMock())


class TestMediaHostEdges:
    async def test_post_file_reports_remote_binary_read_timeout(self) -> None:
        lease = _Lease()
        executor = MagicMock()
        executor.acquire_host_for_user.return_value = lease
        tools = MediaTools(
            get_config=MagicMock(),
            browser_manager=None,
            tool_executor=executor,
        )

        with patch("src.tools.ssh.read_binary_file", new=AsyncMock(side_effect=TimeoutError)):
            result = await tools._handle_post_file(
                _Message(), {"host": "remote", "path": "/tmp/file"}
            )

        assert result == "File fetch timed out (30s)."
        assert lease.released is True


class TestSkillContextHostEdges:
    async def test_run_on_host_preserves_tool_executor_generation_lease(self) -> None:
        executor = object.__new__(ToolExecutor)
        executor._run_on_host = AsyncMock(return_value=("leased output", 0))
        context = SkillContext(executor, "edge", requester_id="user-1")

        assert await context.run_on_host("permitted", "id") == "leased output"
        executor._run_on_host.assert_awaited_once_with(
            "permitted", "id", use_workspace=True, user_id="user-1"
        )

    async def test_run_on_host_falls_back_to_raw_executor_output(self) -> None:
        executor = SimpleNamespace(_run_on_host=AsyncMock(return_value="raw output"))
        context = SkillContext(executor, "edge")

        assert await context.run_on_host("permitted", "id") == "raw output"
        executor._run_on_host.assert_awaited_once_with("permitted", "id", use_workspace=True)

    def test_remember_preserves_corrupt_memory_store(self, tmp_path) -> None:
        from src.json_store import StoreCorruptError

        context = SkillContext(MagicMock(), "edge", memory_path=str(tmp_path / "memory.json"))
        context._load_memory_for_write = MagicMock(side_effect=StoreCorruptError("bad memory"))
        context._save_memory = MagicMock()

        context.remember("key", "value")

        context._save_memory.assert_not_called()

    def test_get_hosts_uses_requester_access_policy(self) -> None:
        executor = MagicMock()
        executor._host_access = MagicMock()
        executor._host_access.get_allowed_hosts.return_value = ["permitted"]
        context = SkillContext(executor, "edge", requester_id="user-1")

        assert context.get_hosts() == ["permitted"]
        executor._host_access.get_allowed_hosts.assert_called_once_with("user-1")

    def test_get_hosts_uses_active_host_registry(self) -> None:
        from src.config.schema import ToolHost
        from src.tools.hosts import HostRegistry

        executor = MagicMock()
        executor._host_access = None
        executor.host_registry = HostRegistry({"live": ToolHost(address="localhost")})
        context = SkillContext(executor, "edge")

        assert context.get_hosts() == ["live"]

    async def test_schedule_task_propagates_requester_id(self) -> None:
        scheduler = MagicMock()
        scheduler.add = AsyncMock(return_value={"id": "schedule-1"})
        context = SkillContext(MagicMock(), "edge", scheduler=scheduler, requester_id="user-1")

        assert await context.schedule_task("edge", "reminder", "channel") == {"id": "schedule-1"}
        scheduler.add.assert_awaited_once_with("edge", "reminder", "channel", requester_id="user-1")


class TestSSHConnectionPoolHostEdges:
    def test_target_socket_path_is_opaque_and_stable(self, tmp_path) -> None:
        path = _socket_path(str(tmp_path), "operator-controlled", "root", "generation-1")

        assert path.startswith(f"{tmp_path}/host-")
        assert "operator-controlled" not in path

    async def test_registered_direct_master_is_accepted_without_probe(self, tmp_path) -> None:
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        pool._masters["root@host"] = SimpleNamespace(returncode=None)

        assert await pool.ensure_master_registered("host", "root") is True

    def test_active_target_identity_uses_hashed_socket(self, tmp_path) -> None:
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        target_id = "host-generation"
        pool._connections[target_id] = 1.0
        open(pool.get_socket_path("ignored", "root", target_id), "w").close()

        assert pool.get_active_hosts() == [target_id]

    async def test_close_host_cancellation_reaps_probe(self, tmp_path) -> None:
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        socket = pool.get_socket_path("host", "root")
        open(socket, "w").close()
        proc = MagicMock(returncode=None)
        proc.communicate = AsyncMock(side_effect=asyncio.CancelledError)
        proc.wait = AsyncMock(return_value=None)

        with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
            with pytest.raises(asyncio.CancelledError):
                await pool.close_host("host", "root")

        proc.terminate.assert_called_once()

    async def test_close_host_timeout_tolerates_failed_kill_and_wait(self, tmp_path) -> None:
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        socket = pool.get_socket_path("host", "root")
        open(socket, "w").close()
        proc = MagicMock(returncode=None)
        proc.communicate = AsyncMock(return_value=(b"", b""))
        proc.kill.side_effect = OSError("already gone")
        proc.wait = AsyncMock()

        with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
            with patch("asyncio.wait_for", side_effect=[TimeoutError, TimeoutError]):
                assert await pool.close_host("host", "root") is True

        proc.kill.assert_called_once()

    async def test_close_host_reaps_probe_after_generic_error(self, tmp_path) -> None:
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        socket = pool.get_socket_path("host", "root")
        open(socket, "w").close()
        proc = MagicMock(returncode=None)
        proc.communicate = AsyncMock(side_effect=RuntimeError("probe failed"))
        proc.wait = AsyncMock(return_value=None)

        with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
            assert await pool.close_host("host", "root") is True

        proc.terminate.assert_called_once()

    async def test_close_host_reaps_timed_out_explicit_master(self, tmp_path) -> None:
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        master = MagicMock(returncode=None)
        master.wait = AsyncMock()
        pool._masters["root@host"] = master

        with patch("asyncio.wait_for", side_effect=TimeoutError):
            assert await pool.close_host("host", "root") is True

        master.terminate.assert_called_once()

    async def test_close_target_passes_host_generation_identity(self, tmp_path) -> None:
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        pool.close_host = AsyncMock(return_value=True)
        target = SimpleNamespace(address="address", ssh_user="user", runtime_key="generation")

        assert await pool.close_target(target) is True
        pool.close_host.assert_awaited_once_with("address", "user", "generation")

    async def test_close_all_closes_target_identity_keys(self, tmp_path) -> None:
        pool = SSHConnectionPool(socket_dir=str(tmp_path))
        pool._connections["generation"] = 1.0
        pool.close_host = AsyncMock(return_value=True)

        assert await pool.close_all() == 1
        pool.close_host.assert_awaited_once_with("invalid", "invalid", "generation")
