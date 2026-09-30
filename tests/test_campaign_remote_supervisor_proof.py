import asyncio
import base64
import builtins
import io
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.tools import process_manager as pm
from tests.test_process_output_retention import _remote_job


def test_embedded_supervisor_records_only_empty_process_group(monkeypatch):
    files = {}

    class File(io.BytesIO):
        def __init__(self, path, text):
            super().__init__(files.get(path, b""))
            self.path, self.text = path, text

        def write(self, value):
            return super().write(value.encode() if isinstance(value, str) else value)

        def close(self):
            files[self.path] = self.getvalue()
            super().close()

        def read(self, *args):
            value = super().read(*args)
            return value.decode() if self.text else value

    def open_file(path, mode="r", **kwargs):
        if path.startswith("/proc/"):
            raise FileNotFoundError
        return File(path, "b" not in mode)

    monkeypatch.setattr(builtins, "open", open_file)
    monkeypatch.setattr(sys, "argv", [
        "supervisor", "/fixture", "fixture", base64.b64encode(b"fixture").decode(), "1",
    ])
    monkeypatch.setattr(pm.os, "umask", lambda mode: None)
    monkeypatch.setattr(pm.os, "setsid", lambda: None)
    monkeypatch.setattr(pm.os, "open", lambda *args: 9123)
    monkeypatch.setattr(pm.os, "close", lambda fd: None)
    monkeypatch.setattr(pm.os, "getpgid", lambda pid: 101)
    monkeypatch.setattr(pm.os, "getsid", lambda pid: 99)
    monkeypatch.setattr(pm.os, "replace", lambda source, dest: files.update({dest: files[source]}))
    monkeypatch.setattr(pm.os, "killpg", lambda *args: (_ for _ in ()).throw(ProcessLookupError()))
    monkeypatch.setattr(pm.signal, "signal", lambda *args: None)
    monkeypatch.setattr(subprocess, "check_output", lambda *args, **kwargs: b"fixture-start")
    leader = SimpleNamespace(pid=101, returncode=0, poll=lambda: 0, wait=lambda **kwargs: 0)
    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: leader)
    monkeypatch.setattr(threading, "Thread", lambda **kwargs: SimpleNamespace(
        start=lambda: None, join=lambda **kwargs: None,
    ))
    exec(compile(pm._REMOTE_SUPERVISOR, "<supervisor-fixture>", "exec"), {})
    record = json.loads(files["/fixture/exit.json"])
    assert record["group_empty"] is True
    # F5 settles the verified scope, not all descendants. The real escapee
    # test below prevents this scoped empty=True from becoming a lie.
    assert record["empty"] is True
    assert record["containment"] == "process_group_only"
    assert record["exit_code"] == 0


@pytest.mark.skipif(sys.platform != "linux", reason="requires real /proc identity evidence")
@pytest.mark.asyncio
async def test_real_remote_settlement_caveat_matches_live_escaped_descendant(tmp_path, monkeypatch):
    """A real setsid escapee survives settlement, without being claimed contained.

    Disposable producers run with _remote_job's signal/removal guards. The
    escapee exits naturally on its own ACK; only that adopted child is reaped.
    """
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    assert pm.child_subreaper_active(), "fixture must own/reap its orphaned escapee"
    ready_path = tmp_path / "escaped-ready.json"
    ack_path = tmp_path / "escaped-ack"
    child = (
        "import json,os,pathlib,time\n"
        f"ready=pathlib.Path({str(ready_path)!r})\n"
        f"ack=pathlib.Path({str(ack_path)!r})\n"
        "start_id=pathlib.Path('/proc/self/stat').read_text().rsplit(')',1)[1].split()[19]\n"
        "temporary=ready.with_suffix('.tmp')\n"
        "temporary.write_text(json.dumps({'pid':os.getpid(),'start_id':int(start_id)}))\n"
        "temporary.replace(ready)\n"
        "deadline=time.monotonic()+30\n"
        "while not ack.exists() and time.monotonic()<deadline: time.sleep(.02)\n"
        "raise SystemExit(0 if ack.exists() else 19)\n"
    )
    producer = (
        "import pathlib,subprocess,sys,time\n"
        f"ready=pathlib.Path({str(ready_path)!r})\n"
        f"subprocess.Popen([sys.executable,'-c',{child!r}],start_new_session=True,\n"
        " stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)\n"
        "deadline=time.monotonic()+5\n"
        "while not ready.exists():\n"
        " assert time.monotonic()<deadline, 'escapee did not become ready'\n"
        " time.sleep(.02)\n"
        "print('leader-finished',flush=True)\n"
    )
    escaped = None
    try:
        async with _remote_job(tmp_path, producer) as (reg, info, lease, supervisor):
            await asyncio.wait_for(supervisor.wait(), 10)
            identity = json.loads(ready_path.read_text())
            escaped = identity["pid"]

            def assert_escapee_alive():
                assert pm._proc_starttime(escaped) == identity["start_id"]
                assert os.getpgid(escaped) == os.getsid(escaped) == escaped
                assert os.getpgid(escaped) != info.remote_pgid
                state = Path(f"/proc/{escaped}/stat").read_text()
                assert state.rsplit(")", 1)[1].split()[0] != "Z", "escapee is only a zombie"

            # Actual identity/liveness before AND after consuming real evidence:
            # fake PIDs or an empty process search cannot satisfy this test.
            assert_escapee_alive()
            record = json.loads((tmp_path / "exit.json").read_text())
            assert record["exit_code"] == 0
            assert record["empty"] is True and record["group_empty"] is True
            assert record["containment"] == "process_group_only"
            with pytest.raises(ProcessLookupError):
                os.killpg(info.remote_pgid, 0)

            result = await reg.poll(info.pid)
            assert "status=completed exit_code=0" in result
            assert "outcome_unknown=true" not in result
            metadata = json.loads(result.split("\n[output retention] ", 1)[1])
            assert metadata["containment"] == "process_group_only"
            assert metadata["cleanup_caveat"] == "escaped descendants are unverified"
            page = json.loads(await reg.poll(info.pid, cursor=info.generation + ":0"))
            assert page["text"] == "leader-finished\n"
            assert page["containment"] == "process_group_only"
            assert page["cleanup_caveat"] == "escaped descendants are unverified"
            settled = await reg.kill(info.pid)  # Already completed: no signaling.
            assert "already completed" in settled
            assert "containment=process_group_only; escaped descendants are unverified" in settled
            assert info.containment == "process_group_only"
            assert info.session_confirmed_empty and info.remote_lease is None
            assert lease.release_count == 1
            assert_escapee_alive()
    finally:
        ack_path.write_text("exit naturally\n")
        if escaped is None and ready_path.exists():
            escaped = json.loads(ready_path.read_text())["pid"]
        if escaped is not None:
            deadline = time.monotonic() + 5
            while True:
                reaped, status = os.waitpid(escaped, os.WNOHANG)
                if reaped:
                    assert reaped == escaped and os.waitstatus_to_exitcode(status) == 0
                    break
                assert time.monotonic() < deadline, "ACKed escapee did not exit naturally"
                await asyncio.sleep(.02)
