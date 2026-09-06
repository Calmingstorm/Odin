"""PR343 B2/R2 regressions using real pipes and the remote controller protocol."""

from __future__ import annotations

import asyncio
import json
import shlex
import sys
import time
from contextlib import asynccontextmanager

import pytest

from src.tools import process_manager as pm
from tests.test_remote_process_streaming import _Lease, _remote_job


@pytest.fixture(autouse=True)
def no_background(monkeypatch):
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())


@asynccontextmanager
async def real_job(tmp_path, producer, remote):
    if remote:
        async with _remote_job(tmp_path, producer) as (reg, info, _lease, supervisor):
            yield reg, info, supervisor
    else:
        reg = pm.ProcessRegistry(workspace=str(tmp_path), retention_dir=tmp_path / "evidence")
        await reg.start("localhost", shlex.join([sys.executable, "-u", "-c", producer]))
        info = next(iter(reg._processes.values()))
        try:
            yield reg, info, None
        finally:
            if info.status == "running":
                await reg.kill(info.pid)
            for task in (info._reader_task, info._exit_task):
                if task is not None:
                    await asyncio.wait_for(asyncio.shield(task), 15)
            reg._expire_output(info)


def split_preview(raw):
    assert len(raw) <= 12000
    display, metadata = raw.split("\n[output retention] ")
    return display.split("\n", 1)[1], json.loads(metadata)


@pytest.mark.parametrize("remote", [False, True])
@pytest.mark.parametrize("quota", [False, True])
async def test_overflow_newest_lines_survive_running_ack_and_exit(
    tmp_path, monkeypatch, remote, quota,
):
    if quota:
        monkeypatch.setattr(pm, "OUTPUT_GLOBAL_QUOTA", 1024)
    # The 12k rolling window begins INSIDE this long line. Its unkeyed
    # continuation must be discarded, not presented as safe complete output.
    suffix = '\n{"password":"tail-fixture-sensitive"}\nNEWEST-LINE-SENTINEL\n'
    producer = (
        "import sys\n"
        "sys.stdout.write('PARTIAL-LINE-' * 400000)\n"
        f"sys.stdout.write({suffix!r});sys.stdout.flush()\n"
        "assert sys.stdin.readline() == 'ack\\n'\n"
        "print('ACK-TERMINAL-SENTINEL', flush=True)\n"
    )
    emitted = len("PARTIAL-LINE-") * 400000 + len(suffix.encode())
    async with real_job(tmp_path, producer, remote) as (reg, info, supervisor):
        if remote and quota:
            # Remote quota reserves the entire capture before dispatch: it
            # rejects NEW jobs rather than interrupting an admitted producer.
            # Exhaustion must not prevent that producer's newest output reads.
            blocked_lease = _Lease()
            rejected = await reg.start_remote(blocked_lease, "must-not-launch")
            assert rejected == "Cannot start: process retention quota exhausted."
            assert blocked_lease.release_count == 1
        deadline = time.monotonic() + 15
        while True:
            raw = await reg.poll(info.pid, wait_seconds=0.05)
            display, meta = split_preview(raw)
            assert "status=running" in raw
            if meta["emitted_bytes"] == emitted:
                break
            assert time.monotonic() < deadline, "running producer output did not drain"
            await asyncio.sleep(0.02)
        assert info.status == "running"
        if remote:
            assert supervisor.returncode is None and not (tmp_path / "exit.json").exists()
        assert "NEWEST-LINE-SENTINEL" in display
        assert "tail-fixture-sensitive" not in raw
        assert "PARTIAL-LINE" not in display
        assert "tail_status" not in meta
        assert meta["capture_limit_loss_bytes"] == emitted - pm.OUTPUT_CAPTURE_BYTES
        assert meta["not_retained_bytes"] == emitted - meta["retained_bytes"]
        assert meta["retained_bytes"] == (
            1024 if quota and not remote else pm.OUTPUT_CAPTURE_BYTES
        )
        if quota and not remote:
            assert meta["capture_error"] == "process retention quota exhausted"
        assert meta["shown_intervals"][-1][1] == emitted
        assert "Wrote 4 bytes" in await reg.write(info.pid, "ack\n")
        terminal = await reg.poll(info.pid, wait_seconds=10)
        display, meta = split_preview(terminal)
        assert "status=completed exit_code=0" in terminal
        assert "NEWEST-LINE-SENTINEL" in display and "ACK-TERMINAL-SENTINEL" in display
        assert "tail-fixture-sensitive" not in terminal and "PARTIAL-LINE" not in display
        assert meta["not_retained_bytes"] > 0 and meta["capture_limit_loss_bytes"] > 0
        def reject_rescrub(_data):
            raise AssertionError("finished overflow tail must not be scrubbed again")

        monkeypatch.setattr(pm, "_scrub_process_bytes", reject_rescrub)
        if remote:
            controller = pm._REMOTE_CONTROLLER.replace(
                "root,token,op,payload,wait_s=sys.argv[1:]",
                "def scrub(_data): raise AssertionError('finished overflow tail rescrubbed')\n"
                "root,token,op,payload,wait_s=sys.argv[1:]",
            )
            assert controller != pm._REMOTE_CONTROLLER
            monkeypatch.setattr(pm, "_REMOTE_CONTROLLER", controller)
        repeated = await reg.poll(info.pid)
        repeated_tail, repeated_meta = split_preview(repeated)
        assert repeated_tail == display and repeated_meta == meta
        if not remote:
            restored = pm.ProcessRegistry(retention_dir=tmp_path / "evidence")
            retained = restored.output_info(info.pid)
            try:
                restored_raw = await restored.poll(info.pid)
                restored_tail, restored_meta = split_preview(restored_raw)
                assert "NEWEST-LINE-SENTINEL" in restored_tail
                assert "ACK-TERMINAL-SENTINEL" in restored_tail
                assert "PARTIAL-LINE" not in restored_tail
                assert "tail-fixture-sensitive" not in restored_raw
                assert restored_meta["not_retained_bytes"] == meta["not_retained_bytes"]
                assert restored_meta["shown_intervals"] == meta["shown_intervals"]
            finally:
                retained.spool.close()


@pytest.mark.parametrize("remote", [False, True])
async def test_finalized_spool_pages_and_previews_never_rescrub(tmp_path, monkeypatch, remote):
    text = ''.join(f'{{"password":"private-{i:05d}","line":{i}}}\n' for i in range(1000))
    async with real_job(tmp_path, f"print({text!r}, end='')", remote) as (reg, info, supervisor):
        if remote:
            await asyncio.wait_for(supervisor.wait(), 15)
            assert json.loads((tmp_path / "exit.json").read_text())["output_masked"] is True
        await reg.poll(info.pid, wait_seconds=10)
        assert info.status == "completed"
        if not remote:
            assert info.output_masked is True

        def reject_rescrub(_data):
            raise AssertionError("finished spool must be read directly, never rescrubbed")

        monkeypatch.setattr(pm, "_scrub_process_bytes", reject_rescrub)
        if remote:
            # Controller is a separate Python interpreter; poison its scrub
            # function after definition but before dispatch to catch rescrubs.
            controller = pm._REMOTE_CONTROLLER.replace(
                "root,token,op,payload,wait_s=sys.argv[1:]",
                "def scrub(_data): raise AssertionError('finished spool rescrubbed')\n"
                "root,token,op,payload,wait_s=sys.argv[1:]",
            )
            assert controller != pm._REMOTE_CONTROLLER
            monkeypatch.setattr(pm, "_REMOTE_CONTROLLER", controller)
        for _ in range(3):
            raw = await reg.poll(info.pid)
            assert "status=completed" in raw and "private-" not in raw
        for offset in (0, 8000, 16000):
            raw = await reg.poll(info.pid, cursor=info.generation + f":{offset}",
                                 offset=offset, limit=8000)
            page = json.loads(raw)
            assert page["shown_intervals"][0][0] == offset
            assert page["shown_bytes"] > 0 and "private-" not in page["text"]
        if not remote:
            # The mask-completion bit must survive the manifest round trip,
            # otherwise every page after a restart becomes a full-spool scan.
            restored = pm.ProcessRegistry(retention_dir=tmp_path / "evidence")
            retained = restored.output_info(info.pid)
            try:
                assert retained.restored and retained.output_masked
                for offset in (0, 8000, 16000):
                    raw = await restored.poll(info.pid, cursor=info.generation + f":{offset}",
                                              offset=offset, limit=8000)
                    page = json.loads(raw)
                    assert page["shown_bytes"] > 0 and "private-" not in page["text"]
                assert "status=completed" in await restored.poll(info.pid)
            finally:
                retained.spool.close()


@pytest.mark.parametrize("value", ['42', 'false', 'null', '{"label":"ordinary"}', '[1,2,3]'])
def test_process_credential_nonstring_values_preserve_format_and_bytes(value):
    data = ('{\n  "token": ' + value + ',\n  "public": "café"\n}\n').encode()
    assert pm._scrub_process_bytes(data) == data
