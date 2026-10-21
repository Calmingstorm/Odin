"""User foreground commands on a remote host end when their SSH channel closes.

The transport half of the remote-foreground fix: ``run_ssh_command`` with
``end_with_channel`` sends the coordinator bootstrap, keeps the client's stdin
an open pipe it never writes, and gives the output and the exit one deadline;
the command tools and every validate_action probe opt in, nothing else does.

A stand-in ``ssh`` plays both the client and sshd: it runs the last argument
under the "remote" login shell and turns its own stdin EOF, or its own death,
into the remote command's stdin EOF, as a real channel does. That proves the
transport's plumbing with real processes; real SSH (direct and multiplexed)
and macOS are acceptance checks outside this suite.
"""
from __future__ import annotations

import asyncio
import functools
import json
import os
import sys
import time

import pytest

from src.config.schema import SSHPoolConfig, ToolHost, ToolsConfig
from src.tools import ssh
from src.tools.executor import ToolExecutor
from src.tools.remote_foreground import MISSING_PYTHON_NOTICE, remote_foreground_command
from tests.test_remote_foreground_coordinator import running, wait_until

pytestmark = pytest.mark.skipif(sys.platform != "linux", reason="inspects /proc")

FAKE_SSH = r'''
import json, os, stat, subprocess, sys, threading
with open(os.environ["ODIN_FAKE_SSH_LOG"], "a") as fh:
    fh.write(json.dumps({"argv": sys.argv[1:],
                         "stdin_pipe": stat.S_ISFIFO(os.fstat(0).st_mode)}) + "\n")
env = dict(os.environ)
if "ODIN_FAKE_REMOTE_PATH" in env:
    env["PATH"] = env["ODIN_FAKE_REMOTE_PATH"]
remote = subprocess.Popen([env.get("SHELL", "/bin/sh"), "-c", sys.argv[-1]],
                          stdin=subprocess.PIPE, env=env)


def channel():
    # As ssh does: local stdin EOF becomes the remote command's stdin EOF.
    try:
        while os.read(0, 4096):
            pass
    except OSError:
        pass
    remote.stdin.close()


threading.Thread(target=channel, daemon=True).start()
code = remote.wait()
sys.exit(128 - code if code < 0 else code)
'''


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


class Spawned:
    def __init__(self):
        self.calls: list[tuple[tuple, dict]] = []
        self.procs: list[asyncio.subprocess.Process] = []


@pytest.fixture
def fake_ssh(tmp_path, monkeypatch):
    script = tmp_path / "fake_ssh.py"
    script.write_text(FAKE_SSH)
    log = tmp_path / "ssh.log"
    monkeypatch.setenv("ODIN_FAKE_SSH_LOG", str(log))
    monkeypatch.setenv("SHELL", "/bin/sh")
    monkeypatch.setattr(
        ssh, "remote_foreground_command", functools.partial(remote_foreground_command, grace=0.3)
    )
    spawned = Spawned()
    real = asyncio.create_subprocess_exec

    async def spawn(*args, **kwargs):
        if args and args[0] == "ssh":
            spawned.calls.append((args, kwargs))
            proc = await real(sys.executable, str(script), *args[1:], **kwargs)
            spawned.procs.append(proc)
            return proc
        return await real(*args, **kwargs)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    spawned.log = log
    yield spawned
    for proc in spawned.procs:
        if proc.returncode is None:
            proc.kill()


def _logged(spawned):
    return [json.loads(line) for line in spawned.log.read_text().splitlines()]


@pytest.fixture
def sleeps():
    used: list[str] = []

    def make() -> str:
        duration = f"{150 + len(used)}.{os.getpid() % 1000:03d}"
        used.append(duration)
        return duration

    yield make
    for duration in used:
        for pid in running("sleep", duration):
            os.kill(pid, 9)


def _run(command, **kwargs):
    kwargs.setdefault("end_with_channel", True)
    return ssh.run_ssh_command("remote.test", command, "key", "known_hosts", **kwargs)


async def test_the_command_runs_under_the_coordinator_on_an_open_channel(fake_ssh):
    code, output = await _run(
        "tr '\\0' ' ' < /proc/$PPID/cmdline; echo; echo err >&2; exit 3"
    )
    assert code == 3
    parent, rest = output.split("\n", 1)
    assert "python3" in parent and "odin-fg" in parent  # the coordinator runs it
    assert rest == "err\n"
    (args, kwargs), = fake_ssh.calls
    assert kwargs["stdin"] == asyncio.subprocess.PIPE
    assert args[-1].startswith("odin_fg_command=")
    (entry,) = _logged(fake_ssh)
    assert entry["stdin_pipe"] is True


async def test_without_the_flag_the_command_is_sent_as_given(fake_ssh):
    code, output = await _run("echo plain", end_with_channel=False)
    assert (code, output) == (0, "plain\n")
    (args, kwargs), = fake_ssh.calls
    assert args[-1] == "echo plain"
    assert kwargs.get("stdin") is None


async def test_streamed_output_reaches_the_callback(fake_ssh):
    seen: list[str] = []

    async def on_output(line):
        seen.append(line)

    code, output = await _run("echo one; echo two; exit 4", on_output=on_output)
    assert (code, output, seen) == (4, "one\ntwo\n", ["one\n", "two\n"])


@pytest.mark.parametrize("streamed", [False, True])
async def test_cancelling_ends_the_remote_command(fake_ssh, sleeps, streamed):
    duration = sleeps()

    async def on_output(_line):
        return None

    task = asyncio.create_task(
        _run(f"sleep {duration}", timeout=60, on_output=on_output if streamed else None)
    )
    assert await asyncio.to_thread(wait_until, lambda: running("sleep", duration))
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert all(proc.returncode is not None for proc in fake_ssh.procs)
    assert all(proc.stdin.is_closing() for proc in fake_ssh.procs)
    assert await asyncio.to_thread(wait_until, lambda: not running("sleep", duration))


@pytest.mark.parametrize("streamed", [False, True])
async def test_a_timeout_ends_the_remote_command(fake_ssh, sleeps, streamed):
    duration = sleeps()

    async def on_output(_line):
        return None

    code, output = await _run(
        f"sleep {duration}", timeout=1, max_retries=1,
        on_output=on_output if streamed else None,
    )
    assert code == 1 and "timed out after 1 seconds" in output
    assert all(proc.returncode is not None for proc in fake_ssh.procs)
    assert await asyncio.to_thread(wait_until, lambda: not running("sleep", duration))


async def test_normal_completion_closes_the_channel_and_reaps_the_client(fake_ssh):
    code, _ = await _run("echo done")
    assert code == 0
    (proc,) = fake_ssh.procs
    assert proc.returncode == 0 and proc.stdin.is_closing()


async def test_a_host_without_python3_says_so_in_the_returned_output(fake_ssh, tmp_path,
                                                                     monkeypatch):
    monkeypatch.setenv("ODIN_FAKE_REMOTE_PATH", str(tmp_path / "no-python"))
    code, output = await _run("echo ran; exit 2")
    assert code == 2
    assert output.splitlines() == [MISSING_PYTHON_NOTICE, "ran"]


@pytest.mark.parametrize("single_deadline", [False, True])
async def test_one_deadline_covers_the_output_and_the_exit(single_deadline):
    # Output for 1.5 s, then the output closes while the process lingers.
    proc = await asyncio.create_subprocess_exec(
        "/bin/sh", "-c", "echo a; sleep 1.5; exec >&- 2>&-; sleep 5",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )

    async def on_output(_line):
        return None

    started = time.monotonic()
    code, output = await ssh._read_lines_with_callback(
        proc, 2, on_output, single_deadline=single_deadline
    )
    elapsed = time.monotonic() - started
    assert code == 1 and "timed out" in output
    if single_deadline:
        assert elapsed < 2.9
    else:
        assert elapsed > 3.2  # the historical separate exit wait


# ---------------------------------------------------------------------------
# Which callers opt in
# ---------------------------------------------------------------------------


def _executor():
    return ToolExecutor(config=ToolsConfig(
        hosts={
            "remote": ToolHost(address="remote.test", ssh_user="odin"),
            "remote2": ToolHost(address="remote2.test", ssh_user="odin"),
        },
        ssh_pool=SSHPoolConfig(enabled=False),
    ))


@pytest.fixture
def transport(monkeypatch):
    calls: list[dict] = []

    async def fake_run_ssh_command(**kwargs):
        calls.append(kwargs)
        return 0, "ok\n"

    monkeypatch.setattr("src.tools.executor.run_ssh_command", fake_run_ssh_command)
    return calls


@pytest.mark.parametrize(("tool", "tool_input"), [
    ("run_command", {"host": "remote", "command": "uptime"}),
    ("run_script", {"host": "remote", "script": "echo hi", "interpreter": "sh"}),
    ("run_command_multi", {"hosts": ["remote", "remote2"], "command": "uptime"}),
])
async def test_the_command_tools_opt_in(transport, tool, tool_input):
    await _executor().execute(tool, tool_input)
    assert transport and all(call.get("end_with_channel") is True for call in transport)
    if tool == "run_script":
        assert """trap 'rm -f "$TMPF"' EXIT""" in transport[0]["command"]


async def test_every_validation_probe_opts_in(transport):
    checks = [
        {"type": "command", "target": "true", "host": "remote"},
        {"type": "service", "target": "sshd", "host": "remote"},
        {"type": "process", "target": "sshd", "host": "remote"},
        {"type": "port", "target": "22", "host": "remote"},
        {"type": "http", "target": "http://127.0.0.1:9/", "host": "remote"},
        {"type": "log_absent", "target": "sshd", "expected": "panic", "host": "remote"},
        {"type": "log_present", "target": "sshd", "expected": "Started", "host": "remote"},
    ]
    await _executor().execute("validate_action", {"checks": checks})
    assert len(transport) >= len(checks)
    assert all(call.get("end_with_channel") is True for call in transport)


@pytest.mark.parametrize(("tool", "tool_input"), [
    ("read_file", {"host": "remote", "path": "/etc/hostname"}),
    ("apply_patch", {
        "host": "remote", "root": "/tmp",
        "patch_text": "*** Begin Patch\n*** Add File: odin-x.txt\n+x\n*** End Patch\n",
    }),
    ("manage_process", {"action": "start", "host": "remote", "command": "sleep 1"}),
])
async def test_file_and_job_tools_keep_their_transport(transport, tool, tool_input):
    await _executor().execute(tool, tool_input)
    assert transport and all("end_with_channel" not in call for call in transport)


async def test_a_local_command_keeps_its_own_supervisor(monkeypatch):
    seen: list[dict] = []

    async def fake_local(command, **kwargs):
        seen.append(kwargs)
        return 0, "ok"

    monkeypatch.setattr("src.tools.executor.run_local_command", fake_local)
    executor = ToolExecutor(config=ToolsConfig(
        hosts={"local": ToolHost(address="127.0.0.1", ssh_user="root")},
    ))
    await executor.execute("run_command", {"host": "local", "command": "uptime"})
    assert seen and "end_with_channel" not in seen[0]


async def test_cancelling_a_tool_call_ends_the_remote_command(fake_ssh, sleeps):
    """The path kill_agent takes: the in-flight tool call's task is cancelled."""
    duration = sleeps()
    executor = _executor()
    task = asyncio.create_task(
        executor.execute("run_command", {"host": "remote", "command": f"sleep {duration}"})
    )
    assert await asyncio.to_thread(wait_until, lambda: running("sleep", duration))
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert await asyncio.to_thread(wait_until, lambda: not running("sleep", duration))
