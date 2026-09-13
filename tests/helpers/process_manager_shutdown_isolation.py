"""Fresh-process shutdown-barrier probes for process-manager tests."""
from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.tools.process_manager import (
    SHUTDOWN_REAP_TIMEOUT,
    ProcessInfo,
    ProcessRegistry,
    _close_pinned,
    _scan_owned_members,
    set_child_subreaper,
)


async def _assert_session_empty(proc) -> None:
    pinned, complete = _scan_owned_members(proc.pid, leader_pid=proc.pid)
    try:
        assert complete and not pinned
    finally:
        _close_pinned(pinned)


async def wedged() -> None:
    reg = ProcessRegistry()
    proc = await asyncio.create_subprocess_shell(
        "sleep 30", stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT, start_new_session=True,
    )
    gate = asyncio.Event()

    async def blocked():
        await gate.wait()

    info = ProcessInfo(pid=proc.pid, command="sleep 30", host="local",
                       start_time=time.time(), status="completed", exit_code=0,
                       process=proc)
    info._exit_task = asyncio.create_task(blocked())
    reg._processes[proc.pid] = info
    try:
        started = time.monotonic()
        await reg.shutdown()
        assert time.monotonic() - started < SHUTDOWN_REAP_TIMEOUT + 10
        assert info._exit_task.done() and proc.returncode is not None
        await _assert_session_empty(proc)
    finally:
        gate.set()
        if proc.returncode is None:
            proc.kill()
        await proc.wait()


async def resistant() -> None:
    reg = ProcessRegistry()
    resist = True

    async def immortal():
        while True:
            try:
                await asyncio.sleep(3600)
            except asyncio.CancelledError:
                if not resist:
                    raise

    proc = await asyncio.create_subprocess_shell(
        "sleep 30", stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT, start_new_session=True,
    )
    info = ProcessInfo(pid=proc.pid, command="sleep 30", host="local",
                       start_time=time.time(), status="completed", exit_code=0,
                       process=proc)
    task = asyncio.create_task(immortal())
    info._exit_task = task
    reg._processes[proc.pid] = info
    try:
        started = time.monotonic()
        await asyncio.wait_for(reg.shutdown(), timeout=SHUTDOWN_REAP_TIMEOUT + 20)
        assert time.monotonic() - started < SHUTDOWN_REAP_TIMEOUT + 20
        assert proc.returncode is not None
        await _assert_session_empty(proc)
    finally:
        resist = False
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        if proc.returncode is None:
            proc.kill()
        await proc.wait()


def main() -> None:
    assert len(sys.argv) == 2 and sys.argv[1] in {"wedged", "resistant"}
    assert set_child_subreaper(True) is True
    asyncio.run(wedged() if sys.argv[1] == "wedged" else resistant())


if __name__ == "__main__":
    main()
