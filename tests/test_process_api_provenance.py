"""Recorded process facts through the API, poll and real retention manifests."""
from __future__ import annotations

import asyncio
import base64
import json
import os
import shlex
import sys
import time
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.tools.process_manager import ProcessInfo, ProcessRegistry
from src.web.api.agents_loops import register_processes
from tests.test_command_shell_matrix import observed_output, registry, settled
from tests.test_remote_processes import _Lease


async def entries(reg):
    routes = web.RouteTableDef()
    register_processes(routes, SimpleNamespace(tool_executor=SimpleNamespace(
        _process_registry=reg,
    )))
    app = web.Application()
    app.router.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.get("/api/processes")
        assert response.status == 200
        return await response.json()


def assert_facts(entry, shell, reason):
    # Indexing intentionally rejects omitted keys, including unknown facts.
    assert entry["effective_shell"] == shell
    assert entry["termination_reason"] == reason


@pytest.mark.parametrize("shell", ["bash", "sh"])
@pytest.mark.parametrize("outcome", ["active", "successful", "failed", "timed-out", "cancelled"])
async def test_real_local_lifecycle_and_restored_facts(tmp_path, shell, outcome):
    async with registry(tmp_path, shell) as reg:
        assert "Process started" in await reg.start(
            "localhost", "printf 'ready\\n'; read release; exit \"$release\"",
        )
        info = next(iter(reg._processes.values()))
        await observed_output(info, "ready")
        if outcome in {"successful", "failed"}:
            await reg.write(info.pid, "0\n" if outcome == "successful" else "7\n")
            await settled(info)
        elif outcome == "timed-out":
            await reg._enforce_lifetime(info, 0)
            await settled(info)
        elif outcome == "cancelled":
            assert "killed" in await reg.kill(info.pid)
            await settled(info)

        reason = {"timed-out": "timeout", "cancelled": "cancellation"}.get(outcome)
        status = {"active": "running", "successful": "completed", "failed": "failed",
                  "timed-out": "killed", "cancelled": "killed"}[outcome]
        entry, = await entries(reg)
        assert entry["status"] == status
        assert_facts(entry, shell, reason)
        preview = await reg.poll(info.pid)
        assert f"effective_shell={shell}" in preview.splitlines()[0]
        meta = json.loads(preview.partition("[output retention] ")[2])
        assert meta["effective_shell"] == shell
        page = json.loads(await reg.poll(info.pid, cursor=f"{info.generation}:0"))
        assert page["effective_shell"] == shell
        assert meta.get("termination_reason") == reason

        # The production writer/reader, not a fabricated persistence DTO. Even
        # a running record must retain its shell when restored read-only.
        persisted = json.loads((tmp_path / "retained" / f"{info.generation}.json").read_text())
        assert persisted["effective_shell"] == shell
        assert persisted["termination_reason"] == reason
        restored = ProcessRegistry(retention_dir=tmp_path / "retained",
                                   command_shell="invalid-current-config")
        try:
            restored_entry, = await entries(restored)
            assert_facts(restored_entry, shell, reason)
            assert restored_entry["status"] == ("unknown" if outcome == "active" else status)
            assert f"effective_shell={shell}" in await restored.poll(info.pid)
        finally:
            assert await restored.shutdown() == 0


@pytest.mark.parametrize("remote", [False, True])
@pytest.mark.parametrize("shell_fields", [{}, {"effective_shell": None, "shell_executable": None}])
async def test_legacy_manifest_never_guesses_shell(tmp_path, remote, shell_fields):
    generation = "a" * 32
    record = {
        "pid": -1 if remote else 123, "generation": generation,
        "host": "remote-fixture" if remote else "localhost", "remote": remote,
        "start_time": time.time(), "finished_at": time.time(),
        "status": "completed", "exit_code": 0, **shell_fields,
    }
    (tmp_path / f"{generation}.json").write_text(json.dumps(record))
    reg = ProcessRegistry(retention_dir=tmp_path, command_shell="bash")
    try:
        entry, = await entries(reg)
        assert_facts(entry, None, None)
        info = reg._processes[record["pid"]]
        assert info.restored and info.effective_shell is None
        # The same renderer is used after a remote controller snapshot; this
        # test makes no transport connection to read a legacy record.
        for preview in (False, True):
            text = reg._output_page(info, b"", 0, 4000, 8000, preview=preview)
            assert "effective_shell" not in text
        reg._persist_output(info)
        assert json.loads((tmp_path / f"{generation}.json").read_text())["effective_shell"] is None
    finally:
        assert await reg.shutdown() == 0


async def test_unknown_in_memory_record_has_no_shell_default():
    info = ProcessInfo(1, "fixture", "localhost", time.time())
    assert info.effective_shell is None and info.shell_executable is None
    reg = ProcessRegistry(command_shell="bash")
    reg._processes[info.pid] = info
    entry, = await entries(reg)
    assert_facts(entry, None, None)
    assert "effective_shell" not in await reg.poll(info.pid)


async def test_remote_launcher_records_its_explicit_shell_and_restores(tmp_path, monkeypatch):
    # Exercise the production launcher and its real transport payload. The
    # boundary only returns the supervisor's settlement; no SSH is dispatched.
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    dispatched = []

    async def remote_exec(target, script, timeout):
        args = shlex.split(script.split("nohup python3 ", 1)[1].split(" </dev/null", 1)[0])
        dispatched.append(base64.b64decode(args[3]).decode())
        return 0, json.dumps({"token": args[2], "pid": 101, "pgid": 101,
                              "sid": 99, "start_id": "77"})

    reg = ProcessRegistry(remote_exec=remote_exec, retention_dir=tmp_path,
                          command_shell="invalid-local-config")
    assert "Process started" in await reg.start_remote(_Lease(), "printf remote-fixture")
    info = reg._processes[-1]
    assert info.remote and info.shell_executable == "/bin/sh"
    assert dispatched == ["printf remote-fixture"]
    entry, = await entries(reg)
    assert_facts(entry, "sh", None)
    assert "effective_shell=sh" in reg._output_page(info, b"", 0, 4000, 8000, preview=True)
    restored = ProcessRegistry(retention_dir=tmp_path, command_shell="bash")
    restored_entry, = await entries(restored)
    assert_facts(restored_entry, "sh", None)
    assert restored._processes[-1].restored
    assert await restored.shutdown() == 0


async def test_real_remote_supervisor_shell_identity_is_sh(tmp_path):
    """Execute the real remote supervisor locally with an inert natural exit.

    No network or guessed remote process signals. Its child shell records its
    kernel executable before exiting; the supervisor must settle naturally.
    """
    from src.tools.process_manager import _REMOTE_SUPERVISOR

    os.mkfifo(tmp_path / "in", 0o600)
    guard = (
        "import os\n"
        "_probe=os.killpg\n"
        "def probe_only(pgid,sig):\n"
        " if sig: raise AssertionError('fixture attempted a signal')\n"
        " return _probe(pgid,0)\n"
        "os.killpg=probe_only\n"
        "def no_signal(*args): raise AssertionError('fixture attempted a signal')\n"
        "os.kill=no_signal\n"
    )
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-c", guard + _REMOTE_SUPERVISOR, str(tmp_path), "fixture",
        base64.b64encode(b"readlink /proc/$$/exe").decode(), "30",
        stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    output, _ = await asyncio.wait_for(proc.communicate(), 15)
    assert proc.returncode == 0, output.decode()
    assert os.path.samefile((tmp_path / "out").read_text().strip(), "/bin/sh")
    outcome = json.loads((tmp_path / "exit.json").read_text())
    assert outcome["empty"] and outcome["group_empty"]
