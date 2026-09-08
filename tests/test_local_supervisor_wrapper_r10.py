"""Protocol failure tests with no subprocesses and an isolated restart veto."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.tools import local_supervisor as s


@pytest.fixture
def isolated(monkeypatch):
    monkeypatch.setattr(s, '_active', set())
    monkeypatch.setattr(s, '_pending', set())
    monkeypatch.setattr(s, '_closing_loops', set())
    monkeypatch.setattr(s, '_unverified_startup', False)
    veto = Mock()
    monkeypatch.setattr('src.restart.block_reexec', veto)
    return veto


def shell_with(messages, rc=0, stdin=None):
    reader = asyncio.StreamReader()
    for message in messages:
        reader.feed_data(json.dumps(message).encode() + b'\n')
    reader.feed_eof()
    writer = SimpleNamespace(close=Mock(), write=Mock(), drain=AsyncMock())
    worker = SimpleNamespace(stdin=stdin, stdout=None, stderr=None, wait=AsyncMock(return_value=rc))
    return s.SupervisedShell(worker, reader, writer)


START = {'event': 'started', 'pid': 42}
EXIT = {'event': 'exit', 'returncode': 7}
SETTLED = {'event': 'settled', 'clean': True}


@pytest.mark.parametrize('messages,rc', [
    ([[]], 0), ([{'event': 'started', 'pid': True}], 0),
    ([{'event': 'started', 'pid': 1}], 0), ([START, START], 0),
    ([START, {'event': 'exit', 'returncode': False}], 0),
    ([EXIT], 0), ([START, EXIT, EXIT], 0), ([START, SETTLED], 0),
    ([{'event': 'error', 'message': 'hidden'}], 0), ([], 0),
    ([START, EXIT, {'event': 'settled', 'clean': False}], 0),
    ([START, EXIT, SETTLED], 1),
])
async def test_monitor_rejects_protocol_and_keeps_ownership(isolated, messages, rc):
    shell = shell_with(messages, rc)
    await shell._monitor_task
    isolated.assert_called_once_with('local command supervisor ownership lost')
    shell._writer.close.assert_called_once()
    assert shell in s._active
    with pytest.raises(s.SupervisorError, match='ownership lost'):
        await shell.wait()
    with pytest.raises(s.SupervisorError):
        await s.shutdown_local_supervisors()


async def test_monitor_cancellation_veto(isolated):
    reader = asyncio.StreamReader()
    writer = SimpleNamespace(close=Mock())
    worker = SimpleNamespace(stdin=None, stdout=None, stderr=None)
    shell = s.SupervisedShell(worker, reader, writer)
    await asyncio.sleep(0)
    shell._monitor_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await shell._monitor_task
    assert shell._settled.exception() is not None
    isolated.assert_called_once()


@pytest.mark.parametrize('broken', [False, True])
async def test_communicate_feeds_and_closes(isolated, broken):
    stdin = SimpleNamespace(write=Mock(), close=Mock(),
                            drain=AsyncMock(side_effect=BrokenPipeError() if broken else None))
    shell = shell_with([START, EXIT, SETTLED], stdin=stdin)
    assert await shell.communicate(b'input') == (None, None)
    await shell._monitor_task
    stdin.write.assert_called_once_with(b'input')
    stdin.close.assert_called_once()
    assert shell not in s._active
    isolated.assert_not_called()


async def test_terminate_broken_pipe_still_waits_for_settlement(isolated):
    reader = asyncio.StreamReader()
    writer = SimpleNamespace(
        close=Mock(), write=Mock(side_effect=BrokenPipeError()), drain=AsyncMock())
    worker = SimpleNamespace(stdin=None, stdout=None, stderr=None, wait=AsyncMock(return_value=0))
    shell = s.SupervisedShell(worker, reader, writer)
    task = asyncio.create_task(shell.terminate_tree(.01))
    await asyncio.sleep(0)
    for message in [START, EXIT, SETTLED]:
        reader.feed_data(json.dumps(message).encode() + b'\n')
    assert await task is True
    await shell._monitor_task
    writer.write.assert_called_once()


async def test_private_session_required(isolated):
    with pytest.raises(ValueError, match='private session'):
        await s.create_supervised_shell('unused', start_new_session=False)


async def test_shutdown_pending_timeout(isolated, monkeypatch):
    task = asyncio.create_task(asyncio.sleep(30))
    s._pending.add(task)
    monkeypatch.setattr(s.asyncio, 'wait', AsyncMock(return_value=(set(), {task})))
    with pytest.raises(s.SupervisorError, match='did not settle'):
        await s.shutdown_local_supervisors()
    with pytest.raises(asyncio.CancelledError):
        await task


async def test_startup_protocol_failure_veto(isolated, monkeypatch):
    worker = SimpleNamespace(wait=AsyncMock(return_value=0))
    monkeypatch.setattr(s.asyncio, 'create_subprocess_exec', AsyncMock(return_value=worker))
    monkeypatch.setattr(s.asyncio, 'open_connection', AsyncMock(side_effect=OSError('synthetic')))
    with pytest.raises(OSError, match='synthetic'):
        await s.create_supervised_shell('unused')
    assert s._unverified_startup and not s._pending
    assert isolated.call_count == 2
    worker.wait.assert_awaited_once()


async def test_startup_protocol_and_worker_wait_failure(isolated, monkeypatch):
    worker = SimpleNamespace(wait=AsyncMock(side_effect=OSError('wait')))
    monkeypatch.setattr(s.asyncio, 'create_subprocess_exec', AsyncMock(return_value=worker))
    monkeypatch.setattr(s.asyncio, 'open_connection', AsyncMock(side_effect=OSError('protocol')))
    with pytest.raises(OSError, match='protocol'):
        await s.create_supervised_shell('unused')
    assert s._unverified_startup and isolated.call_count == 3


async def test_started_shell_cleanup_failure_preserves_launch_error(isolated, monkeypatch):
    started = asyncio.get_running_loop().create_future()
    started.set_exception(ValueError('startup'))
    fake = SimpleNamespace(
        _started=started, terminate_tree=AsyncMock(side_effect=RuntimeError('cleanup')))
    monkeypatch.setattr(s.asyncio, 'create_subprocess_exec', AsyncMock(return_value=object()))
    # The actual socketpair is owned by this test; close the parent as the fake
    # protocol adapter would, rather than leaking it on the success branch.
    async def connection(*, sock, **kwargs):
        sock.close()
        return object(), object()
    monkeypatch.setattr(s.asyncio, 'open_connection', connection)
    monkeypatch.setattr(s, 'SupervisedShell', lambda *args: fake)
    with pytest.raises(ValueError, match='startup'):
        await s.create_supervised_shell('unused')
    fake.terminate_tree.assert_awaited_once_with(grace=.1)
