import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.tools.ssh_pool import SSHConnectionPool


async def test_cancelled_close_retains_live_master_ownership(tmp_path, monkeypatch):
    pool = SSHConnectionPool(socket_dir=str(tmp_path))
    host = "example.invalid"
    socket = pool.get_socket_path(host, "root")
    key = pool._key(host, "root")
    master = SimpleNamespace(returncode=None, wait=AsyncMock())
    pool._masters[key] = master
    started = asyncio.Event()

    async def communicate():
        started.set()
        await asyncio.Event().wait()

    probe = SimpleNamespace(communicate=communicate)
    monkeypatch.setattr("src.tools.ssh_pool.os.path.exists", lambda path: path == socket)
    monkeypatch.setattr("src.tools.ssh_pool.asyncio.create_subprocess_exec", AsyncMock(return_value=probe))
    stopped = AsyncMock()
    monkeypatch.setattr(pool, "_stop_process", stopped)
    task = asyncio.create_task(pool.close_host(host, "root"))
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert pool._masters[key] is master
    assert master.returncode is None
    stopped.assert_awaited_once_with(probe)
