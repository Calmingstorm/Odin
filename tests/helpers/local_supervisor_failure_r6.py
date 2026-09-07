"""Failure injection in a disposable interpreter, never the pytest/live owner."""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.restart import reexec_blocked  # noqa: E402
from src.tools import local_supervisor as ls  # noqa: E402


async def main(mode):
    if mode == 'startup':
        real_spawn = asyncio.create_subprocess_exec
        worker = None

        async def spawn(*args, **kwargs):
            nonlocal worker
            worker = await real_spawn(*args, **kwargs)
            return worker

        async def fail_connection(*args, **kwargs):
            assert worker is not None
            if worker.returncode is None:
                await asyncio.wait_for(worker.stdout.readexactly(5), 3)
                worker.kill()
            raise OSError('injected control setup failure')

        asyncio.create_subprocess_exec = spawn
        asyncio.open_connection = fail_connection
        try:
            await ls.create_supervised_shell('printf ready; sleep .2',
                                             stdout=asyncio.subprocess.PIPE)
        except OSError:
            pass
        else:
            raise AssertionError('startup failure was swallowed')
    else:
        proc = await ls.create_supervised_shell('printf ready; sleep .2',
                                                stdout=asyncio.subprocess.PIPE)
        assert await asyncio.wait_for(proc.stdout.readexactly(5), 3) == b'ready'
        if mode == 'loss':
            proc._worker.kill()
        elif mode == 'protocol':
            proc._writer.write(b'{"op":"not-a-real-operation"}\n')
            await proc._writer.drain()
        else:
            raise AssertionError(mode)
        try:
            await asyncio.wait_for(proc.communicate(), 5)
        except ls.SupervisorError:
            pass
        else:
            raise AssertionError('ownership loss returned success')
    try:
        await ls.shutdown_local_supervisors()
    except ls.SupervisorError:
        pass
    else:
        raise AssertionError('unverified shutdown accepted')
    assert reexec_blocked()
    print(json.dumps({'mode': mode, 'shutdown_refused': True, 'reexec_veto': True}))


if __name__ == '__main__':
    asyncio.run(main(sys.argv[1]))
