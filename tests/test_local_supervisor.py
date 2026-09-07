import asyncio
import json
import os
import shlex
import signal
import subprocess
import sys
from pathlib import Path

import pytest

from src.tools.local_supervisor import create_supervised_shell, shutdown_local_supervisors
from src.tools.ssh import run_local_command


@pytest.fixture(autouse=True)
async def settle():
    yield
    await shutdown_local_supervisors()


async def test_output_status_and_live_pipes():
    proc = await create_supervised_shell('printf ready; read line; printf "%s" "$line"; exit 29',
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE)
    assert await asyncio.wait_for(proc.stdout.readexactly(5), 3) == b'ready'
    proc.stdin.write(b'reply\n')
    await proc.stdin.drain()
    assert await proc.communicate() == (b'reply', None)
    assert await proc.wait() == 29


async def test_background_does_not_delay_leader_or_eof(tmp_path):
    path = tmp_path / 'pid'
    proc = await create_supervised_shell(
        f'sleep 30 </dev/null >/dev/null 2>&1 & echo $! > {shlex.quote(str(path))}; exit 31',
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    assert await asyncio.wait_for(proc.communicate(), 3) == (b'', b'')
    assert proc.returncode == 31
    child = int(path.read_text())
    assert os.path.exists(f'/proc/{child}')
    assert not proc._settled.done()
    assert await proc.terminate_tree(grace=.01)
    assert not os.path.exists(f'/proc/{child}')


async def test_concurrent_doublefork_and_independent_owners():
    script = ('import os; p=os.fork(); '
              'q=os.fork() if p==0 else 1; os._exit(19 if q==0 else 23)')
    command = f'{shlex.quote(sys.executable)} -c {shlex.quote(script)}'
    held = [subprocess.Popen(['sh', '-c', 'exit 41'], start_new_session=bool(i % 2))
            for i in range(16)]
    raw = os.fork()
    if raw == 0:
        os._exit(43)
    async def ordinary():
        proc = await asyncio.create_subprocess_exec('sh', '-c', 'exit 47')
        assert await proc.wait() == 47
    async def supervised():
        proc = await create_supervised_shell(command, stdout=asyncio.subprocess.PIPE)
        await proc.communicate()
        assert await proc.wait() == 23
        await asyncio.wait_for(asyncio.shield(proc._settled), 5)
        assert not os.path.exists(f'/proc/{proc._worker.pid}')
    try:
        await asyncio.gather(*(supervised() for _ in range(48)),
                             *(ordinary() for _ in range(24)))
        assert [proc.wait() for proc in held] == [41] * 16
        assert os.waitstatus_to_exitcode(os.waitpid(raw, 0)[1]) == 43
    finally:
        for proc in held:
            proc.wait()
        try:
            os.waitpid(raw, 0)
        except ChildProcessError:
            pass


async def test_errors_signals_cwd_env(tmp_path):
    with pytest.raises(FileNotFoundError):
        await create_supervised_shell('true', cwd=str(tmp_path / 'missing'))
    proc = await create_supervised_shell('printf "%s" "$R6"; pwd >&2; kill -TERM $$',
        cwd=str(tmp_path), env={**os.environ, 'R6': 'value'},
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    assert await proc.communicate() == (b'value', str(tmp_path).encode() + b'\n')
    assert await proc.wait() == -signal.SIGTERM
    code, output = await run_local_command('definitely_missing_r6_command')
    assert code == 127 and 'not found' in output


async def test_timeout_cancel_and_birth_cancel(tmp_path):
    path = tmp_path / 'pid'
    cmd = f'sleep 30 & echo $! > {shlex.quote(str(path))}; wait'
    code, output = await run_local_command(cmd, timeout=.2)
    assert code == 1 and 'timed out' in output
    assert not os.path.exists(f'/proc/{int(path.read_text())}')
    task = asyncio.create_task(run_local_command(cmd, timeout=30))
    await asyncio.sleep(.15)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not os.path.exists(f'/proc/{int(path.read_text())}')
    task = asyncio.create_task(create_supervised_shell('sleep 30'))
    await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


async def test_shutdown_closes_pending_launch_and_new_launches():
    from src.tools.local_supervisor import SupervisorError

    task = asyncio.create_task(create_supervised_shell('sleep 30'))
    await asyncio.sleep(0)
    await shutdown_local_supervisors()
    with pytest.raises(asyncio.CancelledError):
        await task
    with pytest.raises(SupervisorError, match='shutting down'):
        await create_supervised_shell('true')


@pytest.mark.parametrize('mode', ['startup', 'loss', 'protocol'])
async def test_failure_isolated_reexec_veto(mode, tmp_path):
    root = Path(__file__).resolve().parents[1]
    report = tmp_path / 'owned.json'
    result = await asyncio.to_thread(subprocess.run, [
        sys.executable, str(root / 'scripts/computer-feasibility/owned-test-supervisor-r6.py'),
        '--deadline', '20', '--grace', '1', '--report', str(report), '--',
        sys.executable, str(root / 'tests/helpers/local_supervisor_failure_r6.py'), mode,
    ], capture_output=True, text=True, timeout=30, start_new_session=True)
    assert result.returncode == 0, (result.stdout, result.stderr)
    assert '"shutdown_refused": true' in result.stdout
    assert '"reexec_veto": true' in result.stdout
    assert json.loads(report.read_text())['cleanup_ok'] is True


async def test_non_ascii_process_comm_is_reaped():
    script = (
        'import ctypes,os,time; '
        'ctypes.CDLL(None).prctl(15,ctypes.c_char_p(bytes([255,254,41,32,120])),0,0,0); '
        'p=os.fork(); time.sleep(.05); os._exit(19 if p==0 else 23)'
    )
    proc = await create_supervised_shell(
        f'{shlex.quote(sys.executable)} -c {shlex.quote(script)}',
        stdout=asyncio.subprocess.PIPE)
    assert await proc.communicate() == (b'', None)
    assert await proc.wait() == 23
    assert await asyncio.wait_for(asyncio.shield(proc._settled), 3)
    assert not os.path.exists(f'/proc/{proc._worker.pid}')
