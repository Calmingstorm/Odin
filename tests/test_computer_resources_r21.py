"""Resource ownership must survive failed initialization and cancellation."""

import asyncio
import os
import sqlite3
import sys

import pytest

from src.computer.runtime import supervisor
from src.computer.store import ComputerStore
from tests.test_computer_lifecycle_r5 import owner


@pytest.mark.parametrize("failure", ["connect_failure", "invalid_database", "schema_failure"])
def test_store_constructor_failure_releases_owned_resources(tmp_path, monkeypatch, failure):
    database = tmp_path / "state.db"
    evidence = tmp_path / "evidence"
    database.write_bytes(b"not a sqlite database" if failure == "invalid_database" else b"")
    database.chmod(0o600)
    real_open = os.open
    directory_fds = []

    def tracked_open(path, flags, *args, **kwargs):
        fd = real_open(path, flags, *args, **kwargs)
        if path == evidence:
            directory_fds.append(fd)
        return fd

    monkeypatch.setattr(os, "open", tracked_open)
    connections = []
    real_connect = sqlite3.connect

    class BrokenSchema(sqlite3.Connection):
        def executescript(self, script):
            raise sqlite3.OperationalError("schema initialization failed")

    def tracked_connect(*args, **kwargs):
        if failure == "connect_failure":
            raise sqlite3.OperationalError("connection unavailable")
        if failure == "schema_failure":
            kwargs["factory"] = BrokenSchema
        connection = real_connect(*args, **kwargs)
        connections.append(connection)
        return connection

    monkeypatch.setattr(sqlite3, "connect", tracked_connect)
    try:
        with pytest.raises(sqlite3.DatabaseError):
            ComputerStore(database, evidence)
        for fd in directory_fds:
            with pytest.raises(OSError):
                os.fstat(fd)
        assert len(connections) == int(failure != "connect_failure")
        for connection in connections:
            with pytest.raises(sqlite3.ProgrammingError, match="closed"):
                connection.execute("SELECT 1")
    finally:
        for connection in connections:
            connection.close()
        for fd in directory_fds:
            try:
                os.close(fd)
            except OSError:
                pass


@pytest.mark.asyncio
async def test_cancelled_unit_probe_kills_and_reaps_its_child(monkeypatch):
    # A real disposable process, never systemctl or an existing desktop process.
    create_subprocess = asyncio.create_subprocess_exec
    launched = asyncio.Event()
    children = []

    async def disposable_probe(*args, **kwargs):
        child = await create_subprocess(
            sys.executable,
            "-c",
            "import time; time.sleep(60)",
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        children.append(child)
        launched.set()
        return child

    monkeypatch.setattr(supervisor.asyncio, "create_subprocess_exec", disposable_probe)
    task = asyncio.create_task(supervisor.unit_command(supervisor.unit_for("test"), "show"))
    try:
        await asyncio.wait_for(launched.wait(), 5)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert children[0].returncode is not None
        with pytest.raises(ProcessLookupError):
            os.kill(children[0].pid, 0)
    finally:
        for child in children:
            if child.returncode is None:
                child.kill()
            await child.wait()


@pytest.mark.asyncio
@pytest.mark.parametrize("revocation_raises", [False, True])
async def test_authority_cleanup_exception_revokes_controller_not_only_catalog(
    tmp_path, revocation_raises
):
    from src.computer.integration import ComputerIntegration

    _, manager = owner(tmp_path, factory=ComputerIntegration)
    await manager.set_enabled(True)
    service = manager._service
    service._authorize = lambda context: False

    async def failed_finish(st):
        raise OSError("turn cleanup unavailable")

    service.finish_turn = failed_finish
    if revocation_raises:
        original_disable = service.set_enabled

        async def failed_disable(enabled):
            await original_disable(enabled)
            raise OSError("backend cleanup unavailable")

        service.set_enabled = failed_disable
    key = ("owner", "channel", "turn")
    try:
        await asyncio.wait_for(manager._watch_authority(service, object(), key, object()), 2)
        assert not manager.enabled
        assert manager.error == "authority_cleanup_unverified"
        assert manager._service is service
        # Revocation must reach the controller, not just hide tools/catalogue.
        assert service.controller.enabled is False
    finally:
        if revocation_raises:
            service.set_enabled = original_disable
        await manager.close()
