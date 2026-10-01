"""Kernel descriptor counts for real finished jobs and restored retained evidence."""

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.tools import process_manager as pm


@pytest.fixture(autouse=True)
def no_detached_timers(monkeypatch):
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())


def descriptor_snapshot():
    result = {}
    for fd in Path("/proc/self/fd").iterdir():
        try:
            result[fd.name] = os.readlink(fd)
        except FileNotFoundError:
            pass
    return result


async def capture_child(reg, text):
    """Real producer and capture path, independent of supervisor tree timing.

    No descendants are created. Wait for the exact child and reader before
    persisting its terminal record, then exercise public polls/restoration.
    """
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-c", f"print({text!r}, end='')",
        stdout=asyncio.subprocess.PIPE,
    )
    info = pm.ProcessInfo(proc.pid, "Python output producer", "localhost", time.time(),
                          process=proc)
    reg._processes[info.pid] = info
    reg._retained_generations[info.generation] = info
    info._reader_task = asyncio.create_task(reg._read_output(info))
    await asyncio.wait_for(proc.wait(), timeout=10)
    await asyncio.wait_for(info._reader_task, timeout=10)
    assert proc.returncode == 0
    info.status, info.exit_code, info.finished_at = "completed", 0, time.time()
    reg._persist_output(info)
    return info


@pytest.mark.parametrize("persist", [False, True])
async def test_many_finished_and_restored_jobs_hold_no_spool_fds(tmp_path, persist):
    directory = tmp_path / "evidence" if persist else None
    reg = pm.ProcessRegistry(workspace=str(tmp_path), retention_dir=directory)
    baseline = len(descriptor_snapshot())
    records = []
    text = "".join(f"line-{i:04d} café 世界\n" for i in range(600))
    try:
        for _ in range(32):
            info = await capture_child(reg, text)
            assert info._reader_task.done()
            assert info.spool is None and info.spool_path.is_file()
            first = json.loads(await reg.poll(info.pid, cursor=info.generation + ":0", limit=8000))
            assert first["truncated"] and first["cursor"] is not None
            second = await reg.poll(info.pid, cursor=first["cursor"], limit=8000)
            records.append((info, first["cursor"], second))
        fds = descriptor_snapshot()
        assert not any("odin-process-" in path or str(directory) + "/" in path
                       for path in fds.values())
        assert len(fds) <= baseline + 2
        if persist:
            original_open = Path.open

            def no_spool_open(path, *args, **kwargs):
                assert path.suffix != ".out", "restore opened a retained spool"
                return original_open(path, *args, **kwargs)

            with pytest.MonkeyPatch.context() as patch:
                patch.setattr(Path, "open", no_spool_open)
                restored = pm.ProcessRegistry(retention_dir=directory)
            assert len(restored._retained_generations) == 32
            assert len(descriptor_snapshot()) <= baseline + 2
            for info, cursor, second in records:
                retained = restored.output_info(info.pid, cursor)
                assert retained.restored and retained.spool is None
                assert await restored.poll(info.pid, cursor=cursor, limit=8000) == second
                assert await restored.poll(info.pid) == await reg.poll(info.pid)
                assert len(descriptor_snapshot()) <= baseline + 2
    finally:
        for info in reg._retained_generations.values():
            reg._expire_output(info)


async def test_restore_reads_close_and_expire_at_original_deadline(tmp_path, monkeypatch):
    reg = pm.ProcessRegistry(workspace=str(tmp_path), retention_dir=tmp_path / "evidence")
    info = await capture_child(reg, "retained evidence\n")
    cursor = info.generation + ":0"
    expected = await reg.poll(info.pid, cursor=cursor)
    restored = pm.ProcessRegistry(retention_dir=tmp_path / "evidence")
    retained = restored.output_info(info.pid, cursor)
    baseline = descriptor_snapshot()
    assert await restored.poll(info.pid, cursor=cursor) == expected
    assert descriptor_snapshot() == baseline
    assert "exceeds retained" in await restored.poll(info.pid, offset=retained.retained_bytes + 1)
    assert "access denied" in await restored.poll(
        info.pid, cursor=cursor, authorized=lambda _: False,
    )
    assert descriptor_snapshot() == baseline
    now = retained.finished_at + pm.OUTPUT_RETENTION_SECONDS
    monkeypatch.setattr(pm, "time", SimpleNamespace(time=lambda: now - 1))
    assert await restored.poll(info.pid, cursor=cursor) == expected
    monkeypatch.setattr(pm, "time", SimpleNamespace(time=lambda: now))
    assert "expired" in await restored.poll(info.pid, cursor=cursor)
    assert not list((tmp_path / "evidence").iterdir())
    assert retained.spool is None and retained.spool_path is None
    assert descriptor_snapshot() == baseline
    assert not pm.ProcessRegistry(retention_dir=tmp_path / "evidence")._processes


async def test_missing_spool_read_fails_honestly_without_holding_fd(tmp_path):
    reg = pm.ProcessRegistry(retention_dir=tmp_path)
    info = pm.ProcessInfo(91, "fixture", "localhost", time.time(), status="completed",
                          finished_at=time.time(), spool_path=tmp_path / "missing.out",
                          retained_bytes=10, total_output_bytes=10, output_masked=True)
    reg._processes[info.pid] = info
    baseline = descriptor_snapshot()
    assert "output is unavailable" in await reg.poll(info.pid, cursor=info.generation + ":0")
    assert "output is unavailable" in await reg.poll(info.pid)
    assert info.capture_error == "retained process output is unavailable"
    assert descriptor_snapshot() == baseline


async def test_cancelled_capture_closes_writer(tmp_path):
    reg = pm.ProcessRegistry(retention_dir=tmp_path)
    written = asyncio.Event()
    persist = reg._persist_output

    def notify_write(info):
        persist(info)
        written.set()

    reg._persist_output = notify_write
    stream = asyncio.StreamReader()
    info = pm.ProcessInfo(92, "fixture", "localhost", time.time(),
                          process=SimpleNamespace(stdout=stream))
    reader = asyncio.create_task(reg._read_output(info))
    stream.feed_data(b"partial output\n")
    await asyncio.wait_for(written.wait(), timeout=5)
    assert info.spool is not None and not info.spool.closed
    reader.cancel()
    with pytest.raises(asyncio.CancelledError):
        await reader
    assert info.spool is None
    assert not any(str(tmp_path) + "/" in path for path in descriptor_snapshot().values())
    reg._expire_output(info)


async def test_failed_read_closes_transient_descriptor(tmp_path, monkeypatch):
    path = tmp_path / "evidence.out"
    path.write_bytes(b"output\n")
    reg = pm.ProcessRegistry()
    info = pm.ProcessInfo(93, "fixture", "localhost", time.time(), status="completed",
                          spool_path=path, retained_bytes=7, total_output_bytes=7,
                          output_masked=True)
    reg._processes[info.pid] = info
    opened = []
    original_open = Path.open

    class FailingRead:
        def __enter__(self):
            self.handle = original_open(path, "rb")
            opened.append(self.handle)
            return self

        def seek(self, offset):
            self.handle.seek(offset)

        def read(self, size):
            raise OSError("read failed")

        def __exit__(self, *args):
            self.handle.close()

    monkeypatch.setattr(Path, "open", lambda *args, **kwargs: FailingRead())
    baseline = descriptor_snapshot()
    assert "output is unavailable" in await reg.poll(info.pid, cursor=info.generation + ":0")
    assert len(opened) == 1 and opened[0].closed
    assert descriptor_snapshot() == baseline
