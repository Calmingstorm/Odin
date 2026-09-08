"""Standalone R6 baseline repro. Launch with start_new_session=True."""
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.tools import process_manager as pm  # noqa: E402


async def main():
    assert os.getsid(0) == os.getpid()
    assert pm.set_child_subreaper(True)
    held = []
    try:
        for session in (False, True):
            held.append(subprocess.Popen(['sh', '-c', 'exit 29'], start_new_session=session))
        async def job():
            proc = await asyncio.create_subprocess_exec(
                sys.executable, '-c',
                'import os; p=os.fork(); os._exit(19 if p == 0 else 23)',
                start_new_session=True)
            assert await proc.wait() == 23
        await asyncio.gather(*(job() for _ in range(32)))
        await asyncio.sleep(.1)
        reaper = pm.AdoptedZombieReaper(grace=0)
        passes = [reaper.sweep_once() for _ in range(3)]
        assert passes == [0, 0, 0]
        assert [proc.wait() for proc in held] == [29, 29]
        table, complete = pm._scan_process_table()
        assert complete
        zombies = {pid: row for pid, row in table.items()
                   if row[0] == os.getpid() and row[2] == b'Z'}
        assert len(zombies) == 32, zombies
        return {'passes': passes, 'zombies_before_cleanup': len(zombies),
                'popen_statuses': [29, 29], 'async_statuses': [23] * 32}
    finally:
        for proc in held:
            proc.wait()


if __name__ == '__main__':
    try:
        result = asyncio.run(main())
    finally:
        # Fixture command bodies only fork once then immediately exit.
        # asyncio.run has drained its owners. Exact child waits, never -1.
        table, complete = pm._scan_process_table()
        assert complete
        for pid, row in table.items():
            if row[0] == os.getpid():
                os.waitpid(pid, 0)
        table, complete = pm._scan_process_table()
        assert complete and not pm._descendants_of(table, os.getpid())
    result['descendants_after_cleanup'] = 0
    print(json.dumps(result))
