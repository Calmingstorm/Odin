"""Late ACK after clean settlement: an opted-in foreground caller keeps the recorded exit.

Settlement still fails closed in every case: no cleanup proof, ownership retained in
``_active``, termination/shutdown refused and the re-exec veto set. Only the base
``wait()`` decision of a foreground shell changes, and only for the ACK transport
failure of an already consumed clean frame. Commands here are harmless (printf/echo).
"""
import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src import restart
from src.config.schema import ToolHost, ToolsConfig
from src.tools import local_supervisor as s
from src.tools import process_manager as pm
from src.tools import ssh
from src.tools.executor import ToolExecutor


@pytest.fixture
def isolated(monkeypatch):
    monkeypatch.setattr(s, '_active', set())
    monkeypatch.setattr(s, '_pending', set())
    monkeypatch.setattr(s, '_closing_loops', set())
    monkeypatch.setattr(s, '_unverified_startup', False)
    veto = Mock()
    monkeypatch.setattr('src.restart.block_reexec', veto)
    return veto


START = {'event': 'started', 'pid': 42}
SETTLED = {'event': 'settled', 'clean': True}


def exited(code):
    return {'event': 'exit', 'returncode': code}


def shell_with(messages, *, flag, rc=0, write=None, drain=None, stdout=None, wait=None):
    reader = asyncio.StreamReader()
    for message in messages:
        reader.feed_data(json.dumps(message).encode() + b'\n')
    reader.feed_eof()
    writer = SimpleNamespace(close=Mock(), write=write or Mock(), drain=drain or AsyncMock())
    worker = SimpleNamespace(stdin=None, stdout=stdout, stderr=None,
                             wait=wait or AsyncMock(return_value=rc))
    return s.SupervisedShell(worker, reader, writer, allow_foreground_ack_result=flag)


def ack_failure(kind):
    if kind == 'write':
        return {'write': Mock(side_effect=BrokenPipeError())}
    return {'drain': AsyncMock(side_effect=ConnectionResetError('Connection lost'))}


@pytest.mark.parametrize('kind', ['write', 'drain'])
@pytest.mark.parametrize('code', [0, 7, -9])
async def test_eligible_late_ack_returns_recorded_exit_and_keeps_ownership(isolated, kind, code):
    shell = shell_with([START, exited(code), SETTLED], flag=True, **ack_failure(kind))
    await shell._monitor_task
    assert await shell.wait() == code
    assert shell.returncode == code
    assert shell._settled.exception() is not None
    assert shell in s._active
    isolated.assert_called_once_with('local command supervisor ownership lost')
    shell._worker.wait.assert_not_awaited()
    with pytest.raises(s.SupervisorError, match='ownership lost'):
        await shell.terminate_tree(grace=0)
    with pytest.raises(s.SupervisorError):
        await s.shutdown_local_supervisors()


@pytest.mark.parametrize('kind', ['write', 'drain'])
async def test_default_policy_keeps_todays_failure(isolated, kind):
    shell = shell_with([START, exited(7), SETTLED], flag=False, **ack_failure(kind))
    await shell._monitor_task
    with pytest.raises(s.SupervisorError, match='ownership lost'):
        await shell.wait()
    assert shell in s._active
    isolated.assert_called_once_with('local command supervisor ownership lost')


@pytest.mark.parametrize('flag', [False, True])
async def test_early_waiter_is_unchanged(isolated, flag):
    release = asyncio.Event()

    async def drain():
        await release.wait()
        raise ConnectionResetError('Connection lost')

    shell = shell_with([START, exited(7), SETTLED], flag=flag, drain=drain)
    waiter = asyncio.create_task(shell.wait())
    assert await waiter == 7  # returned before the settlement failure was known
    release.set()
    await shell._monitor_task
    assert shell._settled.exception() is not None and shell in s._active


@pytest.mark.parametrize('case', [
    'drain-timeout', 'other-oserror', 'worker-nonzero', 'worker-wait-error',
    'not-clean', 'eof-before-settled', 'settled-before-exit',
])
async def test_other_failures_still_raise_for_foreground_shells(isolated, case):
    messages, kwargs = [START, exited(7), SETTLED], {}
    if case == 'drain-timeout':
        kwargs['drain'] = AsyncMock(side_effect=TimeoutError())
    elif case == 'other-oserror':
        kwargs['write'] = Mock(side_effect=OSError('not an ACK transport loss'))
    elif case == 'worker-nonzero':
        kwargs['rc'] = 1
    elif case == 'worker-wait-error':
        kwargs['wait'] = AsyncMock(side_effect=OSError('wait failed'))
    elif case == 'not-clean':
        messages = [START, exited(7), {'event': 'settled', 'clean': False}]
    elif case == 'eof-before-settled':
        messages = [START, exited(7)]
    else:
        messages = [START, SETTLED]
    shell = shell_with(messages, flag=True, **kwargs)
    await shell._monitor_task
    assert not shell._ack_lost_after_clean
    with pytest.raises(s.SupervisorError, match='ownership lost'):
        await shell.wait()
    assert shell in s._active


async def test_cancelled_ack_is_not_a_foreground_result(isolated):
    entered = asyncio.Event()

    async def drain():
        entered.set()
        await asyncio.Event().wait()

    shell = shell_with([START, exited(7), SETTLED], flag=True, drain=drain)
    await entered.wait()
    shell._monitor_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await shell._monitor_task
    assert not shell._ack_lost_after_clean
    with pytest.raises(s.SupervisorError):
        await shell.wait()


async def test_exit_that_did_not_resolve_normally_is_never_returned(isolated):
    shell = shell_with([], flag=True)
    await shell._monitor_task
    shell._ack_lost_after_clean = True  # even with ACK evidence, no recorded exit means no result
    assert shell._exited.exception() is not None
    with pytest.raises(s.SupervisorError, match='ownership lost'):
        await shell.wait()


async def test_communicate_returns_output_after_eligible_late_ack(isolated):
    stdout = asyncio.StreamReader()
    stdout.feed_data(b'payload')
    stdout.feed_eof()
    shell = shell_with([START, exited(7), SETTLED], flag=True, stdout=stdout,
                       drain=AsyncMock(side_effect=ConnectionResetError('Connection lost')))
    await shell._monitor_task
    assert await shell.communicate() == (b'payload', None)
    assert shell.returncode == 7


async def test_clean_settlement_never_clears_an_existing_veto():
    restart.reset()
    try:
        restart.block_reexec('earlier unrelated veto')
        shell = shell_with([START, exited(0), SETTLED], flag=True)
        await shell._monitor_task
        assert shell._settled.result() is True
        assert restart.reexec_blocked() == 'earlier unrelated veto'
    finally:
        restart.reset()


# --- Real worker: the parent loop is held across the worker's bounded ACK wait. ---

def holding(real, seconds=3.0):
    async def factory(*args, **kwargs):
        shell = await real(*args, **kwargs)
        time.sleep(seconds)  # the command finishes and the worker gives up on the ACK
        await asyncio.wait({shell._monitor_task}, timeout=10)  # failure precedes any waiter
        return shell
    return factory


async def test_real_worker_foreground_result_survives_late_ack(isolated, monkeypatch):
    monkeypatch.setattr(s, 'create_supervised_shell', holding(s.create_supervised_shell))
    code, output = await ssh.run_local_command(
        "sleep 0.3; printf late-ack-check; exit 7", timeout=30)
    assert code == 7 and 'late-ack-check' in str(output)
    (shell,) = s._active
    assert shell._ack_lost_after_clean and shell._settled.exception() is not None
    assert await asyncio.wait_for(shell._worker.wait(), 5) == 0
    isolated.assert_called_with('local command supervisor ownership lost')


async def test_real_worker_streaming_result_survives_late_ack(isolated, monkeypatch):
    monkeypatch.setattr(s, 'create_supervised_shell', holding(s.create_supervised_shell))
    seen = []

    async def collect(text):
        seen.append(text)

    code, output = await ssh.run_local_command(
        "sleep 0.3; printf 'one\\ntwo\\n'; exit 3", timeout=30, on_output=collect)
    assert code == 3 and ''.join(seen) == 'one\ntwo\n'
    assert 'two' in str(output)


async def test_real_worker_default_policy_still_raises(isolated, monkeypatch):
    shell = await holding(s.create_supervised_shell)(
        "sleep 0.3; printf hidden", stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT)
    with pytest.raises(s.SupervisorError, match='ownership lost'):
        await shell.communicate()


def _executor(tmp_path):
    ex = ToolExecutor(ToolsConfig(
        local_working_dir=str(tmp_path / "workspace"),
        audit_log_path=str(tmp_path / "data" / "audit.jsonl"),
        hosts={"testhost": ToolHost(address="127.0.0.1")},
    ))
    ex._protected_roots = lambda: [str(tmp_path / "protected")]
    return ex


@pytest.mark.parametrize('exit_code', [0, 7])
async def test_executor_reports_the_real_result_once(tmp_path, isolated, monkeypatch, exit_code):
    monkeypatch.setattr(s, 'create_supervised_shell', holding(s.create_supervised_shell))
    counter = tmp_path / "counter.txt"
    result = await _executor(tmp_path).execute("run_command", {
        "host": "testhost",
        "command": f"echo once >> {counter}; printf done-marker; exit {exit_code}",
    }, user_id="owner")
    assert counter.read_text() == "once\n"  # the command ran exactly once
    assert result.ok is (exit_code == 0)
    assert not result.uncertain_outcome
    assert "done-marker" in result.output and "ownership lost" not in result.output


async def test_only_the_foreground_wrapper_opts_in(isolated, monkeypatch):
    seen = []
    real = s.create_supervised_shell

    async def spy(*args, **kwargs):
        seen.append(kwargs.get('allow_foreground_ack_result', False))
        return await real(*args, **kwargs)

    monkeypatch.setattr(s, 'create_supervised_shell', spy)
    assert (await ssh.run_local_command("printf a", timeout=10))[0] == 0

    async def collect(_text):
        return None

    assert (await ssh.run_local_command("printf b", timeout=10, on_output=collect))[0] == 0
    assert seen == [True, True]

    managed = []

    async def refuse(*args, **kwargs):
        managed.append(kwargs)
        raise OSError("fixture spawn refused")

    monkeypatch.setattr(s, 'create_supervised_shell', refuse)
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    registry = pm.ProcessRegistry()
    registry._schedule_output_expiry = lambda info: None
    assert "Failed to start" in await registry.start("localhost", "printf managed")
    assert managed and 'allow_foreground_ack_result' not in managed[0]


@pytest.mark.parametrize('flag', [False, True])
async def test_managed_late_watcher_follows_the_shell_policy(tmp_path, isolated, monkeypatch, flag):
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    registry = pm.ProcessRegistry()
    registry._schedule_output_expiry = lambda info: None
    path = tmp_path / "spool.out"
    path.write_bytes(b"")
    info = pm.ProcessInfo(4242, "fixture", "localhost", time.time(), spool=path.open("r+b"),
                          spool_path=path)
    shell = shell_with([START, exited(7), SETTLED], flag=flag,
                       drain=AsyncMock(side_effect=ConnectionResetError('Connection lost')))
    await shell._monitor_task
    info.process = shell
    try:
        await registry._watch_exit(info)
        assert info.status == "unknown"  # cleanup is never proven on this path
        if flag:
            assert info.exit_code == 7 and info.capture_error is None
        else:  # the production managed policy: exactly the baseline late-watcher outcome
            assert info.exit_code is None
            assert info.capture_error == "process exit could not be confirmed"
            assert info.finished_at is not None
    finally:
        info.spool.close()


@pytest.mark.parametrize('order', ['early-watcher', 'late-watcher', 'early-poll', 'late-poll'])
async def test_managed_orderings_are_unchanged_by_the_foreground_rule(
        tmp_path, isolated, monkeypatch, order):
    """Default-off managed shells: every ACK-failure ordering keeps its baseline outcome,
    including the pre-existing no-expiry early-watcher case (out of scope here)."""
    from unittest.mock import patch

    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    reader = asyncio.StreamReader()
    writer = SimpleNamespace(write=Mock(side_effect=BrokenPipeError()), close=Mock(),
                             drain=AsyncMock())
    worker = SimpleNamespace(stdin=None, stdout=None, stderr=None,
                             wait=AsyncMock(return_value=0))
    shell = s.SupervisedShell(worker, reader, writer)  # the registry never opts in
    registry = pm.ProcessRegistry()
    registry._schedule_output_expiry = lambda info: None
    entered = asyncio.Event()
    original_wait = shell.wait

    async def observed_wait():
        entered.set()
        return await original_wait()

    shell.wait = observed_wait
    path = tmp_path / "spool"
    path.write_bytes(b"fixture-output\n")
    spool = path.open("r+b")
    info = pm.ProcessInfo(42, "fixture", "localhost", 1000.0, process=shell, spool=spool,
                          spool_path=path, retained_bytes=15, total_output_bytes=15,
                          output_masked=True)
    registry._processes[42] = info
    registry._retained_generations[info.generation] = info
    try:
        poll = None
        if order == 'early-watcher':
            info._exit_task = asyncio.create_task(registry._watch_exit(info))
            await entered.wait()
        elif order == 'early-poll':
            poll = asyncio.create_task(registry.poll(42, wait_seconds=1))
            await entered.wait()
        for event in (START, exited(7), SETTLED):
            reader.feed_data(json.dumps(event).encode() + b'\n')
        reader.feed_eof()
        await shell._monitor_task
        if order != 'early-watcher':
            info._exit_task = asyncio.create_task(registry._watch_exit(info))
        await info._exit_task
        if poll is not None:
            await poll
        assert info.status == "unknown" and shell in s._active
        if order == 'early-watcher':
            assert info.exit_code == 7 and info.capture_error is None
            assert info.finished_at is None  # pre-existing: no timestamp-based expiry
        else:
            assert info.exit_code is None
            assert info.capture_error == "process exit could not be confirmed"
            assert info.finished_at is not None
        assert "fixture-output" in await registry.poll(42, cursor=f"{info.generation}:0")
        if info.finished_at is not None:
            later = info.finished_at + pm.OUTPUT_RETENTION_SECONDS + 1
            with patch.object(pm, "time", SimpleNamespace(time=lambda: later)):
                assert "retention expired" in await registry.poll(
                    42, cursor=f"{info.generation}:0")
        isolated.assert_called_with('local command supervisor ownership lost')
    finally:
        spool.close()
