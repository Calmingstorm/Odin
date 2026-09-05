"""Run the real remote supervisor/controller locally, with no SSH or live state."""

from __future__ import annotations

import asyncio
import base64
import json
import os
import shlex
import signal
import sys
import time
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from src.tools.process_manager import _REMOTE_SUPERVISOR, ProcessInfo, ProcessRegistry


class _Lease:
    target = SimpleNamespace(alias="hermetic-remote")

    def __init__(self):
        self.release_count = 0

    async def run(self, factory):
        return await factory()

    def release(self):
        self.release_count += 1


@asynccontextmanager
async def _remote_job(root, producer):
    """Only transport is substituted; use the actual supervisor and poll protocol."""
    os.mkfifo(root / "in", 0o600)
    command = shlex.join(["exec", sys.executable, "-u", "-c", producer])
    supervisor = await asyncio.create_subprocess_exec(
        sys.executable, "-c", _REMOTE_SUPERVISOR, str(root), "hermetic-job",
        base64.b64encode(command.encode()).decode(), "30",
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    info = None

    async def remote_exec(_target, command, timeout):
        argv = shlex.split(command)
        assert argv[:2] == ["python3", "-c"]
        controller = await asyncio.create_subprocess_exec(
            sys.executable, *argv[1:],
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        try:
            output, _ = await asyncio.wait_for(controller.communicate(), timeout)
        finally:
            if controller.returncode is None:
                controller.kill()
                await controller.wait()
        return controller.returncode, output.decode()

    try:
        deadline = time.monotonic() + 5
        while not (root / "ready.json").exists():
            assert supervisor.returncode is None, "supervisor exited before readiness"
            assert time.monotonic() < deadline, "supervisor did not become ready"
            await asyncio.sleep(0.05)
        ready = json.loads((root / "ready.json").read_text())
        lease = _Lease()
        info = ProcessInfo(
            pid=-1, command=command, host=lease.target.alias, start_time=time.time(),
            remote=True, remote_dir=str(root), remote_token=ready["token"],
            remote_pid=ready["pid"], remote_pgid=ready["pgid"], remote_sid=ready["sid"],
            remote_start_id=ready["start_id"], remote_lease=lease,
        )
        registry = ProcessRegistry(remote_exec=remote_exec)
        registry._processes[-1] = info
        yield registry, info, lease, supervisor
    finally:
        if supervisor.returncode is None:
            supervisor.terminate()
            try:
                await asyncio.wait_for(supervisor.wait(), 15)
            except TimeoutError:
                if info is not None:
                    try:
                        os.killpg(info.remote_pgid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                supervisor.kill()
                await supervisor.wait()
        if info is not None:
            with pytest.raises(ProcessLookupError):
                os.killpg(info.remote_pgid, 0)


@pytest.mark.asyncio
async def test_remote_slow_producer_streams_before_exit_and_advances_cursor(tmp_path):
    # Acknowledge each line over the real FIFO before the next delayed write.
    # This keeps the producer alive until AFTER each poll assertion, regardless
    # of CI scheduling, rather than letting EOF make a buffered read look green.
    producer = (
        "import sys,time\n"
        "for line in ('alpha', 'beta', 'gamma'):\n"
        " print(line, flush=True)\n"
        " sys.stdin.readline()\n"
        " time.sleep(1)\n"
        "print('done', flush=True)\n"
    )
    async with _remote_job(tmp_path, producer) as (registry, info, lease, supervisor):
        expected = b""
        for line in (b"alpha\n", b"beta\n", b"gamma\n"):
            deadline = time.monotonic() + 5
            while True:
                result = await registry.poll(-1, wait_seconds=0.2)
                assert "status=running" in result
                assert supervisor.returncode is None
                assert not (tmp_path / "exit.json").exists()
                os.kill(info.remote_pid, 0)
                if info.remote_cursor > len(expected):
                    break
                assert time.monotonic() < deadline, "no output delivered before exit"
            expected += line
            display = result.split("\n[output retention] ")[0].split("\n", 1)[1]
            assert display == expected.decode()
            assert f"output_bytes={len(expected)}\n" in result
            assert info.remote_cursor == info.total_output_bytes == len(expected)
            assert (tmp_path / "out").read_bytes() == expected
            assert lease.release_count == 0

            # Readers do not consume evidence: the same tail is replayable.
            repeated = await registry.poll(-1)
            display = repeated.split("\n[output retention] ")[0].split("\n", 1)[1]
            assert display == expected.decode()
            assert info.remote_cursor == len(expected)
            assert await registry.write(-1, "next\n") == "Wrote 5 bytes to PID -1."

        terminal = await registry.poll(-1, wait_seconds=5)
        assert "status=completed exit_code=0" in terminal
        display = terminal.split("\n[output retention] ")[0].split("\n", 1)[1]
        assert display == (expected + b"done\n").decode()
        assert info.remote_cursor == info.total_output_bytes == len(expected + b"done\n")
        assert lease.release_count == 0
        assert info.remote_lease is None and info.output_lease is lease
        await asyncio.wait_for(supervisor.wait(), 5)


@pytest.mark.asyncio
async def test_remote_streaming_preserves_disk_cap_and_bounded_cursor_reads(tmp_path):
    cap = 4 * 1024 * 1024
    producer = (
        "import sys\n"
        f"sys.stdout.buffer.write(b'x' * {cap + 65536})\n"
        "sys.stdout.buffer.flush()\n"
        "sys.stdin.readline()\n"
    )
    async with _remote_job(tmp_path, producer) as (registry, info, lease, supervisor):
        deadline = time.monotonic() + 5
        out = tmp_path / "out"
        while not out.exists() or out.stat().st_size < cap:
            assert time.monotonic() < deadline, "supervisor did not drain to the disk cap"
            await asyncio.sleep(0.05)
        result = await registry.poll(-1)
        assert "status=running" in result
        assert len(result) <= 12000
        assert lease.release_count == 0
        await registry.write(-1, "done\n")
        await asyncio.wait_for(supervisor.wait(), 5)
        record = json.loads((tmp_path / "exit.json").read_text())
        assert record["exit_code"] == 0 and record["empty"]
        assert not record["timed_out"] and record["output_truncated"]
        assert record["emitted"] == cap + 65536
        assert out.stat().st_size == cap
        assert out.read_bytes() == b"x" * cap
        await registry.poll(-1)
        assert lease.release_count == 0
        for offset in (0, 8000):
            page = json.loads(await registry.poll(-1, offset=offset, limit=8000))
            assert page["text"] == "x" * 8000
            assert page["shown_intervals"] == [[offset, offset + 8000]]
            assert page["capture_limit_loss_bytes"] == 65536
