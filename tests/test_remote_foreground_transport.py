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
from src.tools.execution_outcome import DispatchEvidence, dispatch_evidence
from src.tools.executor import ToolExecutor
from src.tools.remote_foreground import MISSING_PYTHON_NOTICE, remote_foreground_command
from tests.test_remote_foreground_coordinator import running, wait_until

pytestmark = pytest.mark.skipif(sys.platform != "linux", reason="inspects /proc")

FAKE_SSH = r'''
import json, os, signal, stat, subprocess, sys, threading, time
with open(os.environ["ODIN_FAKE_SSH_LOG"], "a") as fh:
    fh.write(json.dumps({"argv": sys.argv[1:],
                         "stdin_pipe": stat.S_ISFIFO(os.fstat(0).st_mode)}) + "\n")
# One step of the plan per connection: run (default), connect-refused (nothing
# is dispatched), reset-after-start (the command runs, then the link drops) or
# ignore-term (a client that ignores TERM until it is killed).
behavior = "run"
plan = os.environ.get("ODIN_FAKE_SSH_PLAN")
if plan and os.path.exists(plan):
    with open(plan) as fh:
        steps = fh.read().split()
    if steps:
        behavior = steps[0]
        with open(plan, "w") as fh:
            fh.write("\n".join(steps[1:]))
if behavior == "connect-refused":
    sys.stderr.write("ssh: connect to host remote.test port 22: Connection refused\n")
    sys.exit(255)
if behavior == "ignore-term":
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
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
if behavior == "reset-after-start":
    time.sleep(0.5)
    sys.stderr.write("client_loop: send disconnect: Connection reset by peer\n")
    sys.stderr.flush()
    os._exit(255)
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


async def _run_with_evidence(command, **kwargs):
    evidence = DispatchEvidence()
    token = dispatch_evidence.set(evidence)
    try:
        return (*await _run(command, **kwargs), evidence.uncertain)
    finally:
        dispatch_evidence.reset(token)


class FakePool:
    """The pool's connection phase, scripted: acquire() says whether a master is up."""

    def __init__(self, acquired):
        self.acquired = list(acquired)
        self.acquire_calls = 0
        self.released = 0

    def is_connected(self, *_args, **_kwargs):
        return False

    async def acquire(self, *_args, **_kwargs):
        self.acquire_calls += 1
        return self.acquired.pop(0)

    def get_ssh_args(self, host, command, *_args, **_kwargs):
        return ["ssh", "-o", "ControlMaster=auto", f"odin@{host}", command]

    def release(self, *_args, **_kwargs):
        self.released += 1

    async def ensure_master_registered(self, *_args, **_kwargs):
        return True


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


async def test_a_timed_out_command_is_never_sent_twice(fake_ssh, sleeps, tmp_path):
    duration = sleeps()
    marker = tmp_path / "ran"
    code, output = await _run(
        f"echo ran >> {marker}; sleep {duration}", timeout=1, max_retries=3
    )
    assert code == 1 and "timed out" in output
    assert len(fake_ssh.calls) == 1
    assert marker.read_text() == "ran\n"
    assert await asyncio.to_thread(wait_until, lambda: not running("sleep", duration))


async def test_a_connection_lost_after_dispatch_is_never_sent_twice(fake_ssh, tmp_path,
                                                                     monkeypatch):
    plan = tmp_path / "plan"
    plan.write_text("reset-after-start\nrun\n")
    monkeypatch.setenv("ODIN_FAKE_SSH_PLAN", str(plan))
    marker = tmp_path / "ran"
    code, output, uncertain = await _run_with_evidence(
        f"echo ran >> {marker}; sleep 2; echo done", max_retries=3
    )
    assert code == 255 and "Connection reset" in output and uncertain
    assert len(fake_ssh.calls) == 1
    assert marker.read_text() == "ran\n"


@pytest.mark.parametrize("pooled", [False, True])
async def test_the_commands_own_connect_failure_lines_never_cause_a_second_run(
    fake_ssh, tmp_path, pooled
):
    """Review F1: a command's own nested ssh failure looks exactly like ssh's."""
    marker = tmp_path / "ran"
    pool = FakePool([True, True, True]) if pooled else None
    code, output, uncertain = await _run_with_evidence(
        f"echo effect >> {marker}; "
        "echo 'ssh: connect to host 127.0.0.1 port 9: Connection refused' >&2; exit 255",
        max_retries=3, retry_base_delay=0.01, pool=pool,
    )
    assert code == 255 and "Connection refused" in output and uncertain
    assert len(fake_ssh.calls) == 1
    assert marker.read_text() == "effect\n"


@pytest.mark.parametrize("diagnostic", [
    "client_loop: send disconnect: Broken pipe",
    "Connection to remote.test closed by remote host.",
    "mux_client_request_session: read from master failed: Broken pipe",
    "",
])
async def test_any_255_after_dispatch_is_uncertain_whatever_the_text(fake_ssh, tmp_path,
                                                                      diagnostic):
    """Review 12: 255 is ssh's lost-channel status and a command's possible exit."""
    marker = tmp_path / "ran"
    say = f"echo {diagnostic!r} >&2; " if diagnostic else ""
    code, _, uncertain = await _run_with_evidence(
        f"echo effect >> {marker}; {say}exit 255", max_retries=3, retry_base_delay=0.01
    )
    assert code == 255 and uncertain
    assert len(fake_ssh.calls) == 1
    assert marker.read_text() == "effect\n"


@pytest.mark.parametrize(("command", "expected"), [
    ("echo 'client_loop: send disconnect: Broken pipe' >&2; exit 7", 7),
    ("echo 'Broken pipe'; exit 0", 0),
])
async def test_settled_results_stay_definite(fake_ssh, command, expected):
    code, _, uncertain = await _run_with_evidence(command, max_retries=3)
    assert (code, uncertain) == (expected, False)
    assert len(fake_ssh.calls) == 1


async def test_a_direct_connect_failure_is_returned_once_and_uncertain(fake_ssh, tmp_path,
                                                                      monkeypatch):
    plan = tmp_path / "plan"
    plan.write_text("connect-refused\nrun\n")
    monkeypatch.setenv("ODIN_FAKE_SSH_PLAN", str(plan))
    code, output, uncertain = await _run_with_evidence(
        "echo ok", max_retries=3, retry_base_delay=0.01
    )
    assert code == 255 and "Connection refused" in output and uncertain
    assert len(fake_ssh.calls) == 1


async def test_only_the_masters_connection_phase_is_retried(fake_ssh, tmp_path):
    pool = FakePool([False, True])
    marker = tmp_path / "ran"
    code, output, uncertain = await _run_with_evidence(
        f"echo ran >> {marker}; echo ok", max_retries=3, retry_base_delay=0.01, pool=pool
    )
    assert (code, output, uncertain) == (0, "ok\n", False)
    assert pool.acquire_calls == 2 and pool.released == 1
    assert len(fake_ssh.calls) == 1
    assert marker.read_text() == "ran\n"


async def test_without_a_master_the_command_is_still_sent_once(fake_ssh, tmp_path):
    pool = FakePool([False, False])
    code, output = await _run("echo ok", max_retries=2, retry_base_delay=0.01, pool=pool)
    assert (code, output) == (0, "ok\n")
    assert pool.acquire_calls == 2 and pool.released == 0
    assert len(fake_ssh.calls) == 1


@pytest.mark.parametrize("streamed", [False, True])
async def test_cleanup_survives_a_second_cancellation(fake_ssh, sleeps, tmp_path, monkeypatch,
                                                      streamed):
    """Review A1: the client is reaped before the cancellation propagates."""
    plan = tmp_path / "plan"
    plan.write_text("ignore-term\n")
    monkeypatch.setenv("ODIN_FAKE_SSH_PLAN", str(plan))
    duration = sleeps()

    async def on_output(_line):
        return None

    task = asyncio.create_task(
        _run(f"sleep {duration}", timeout=60, on_output=on_output if streamed else None)
    )
    assert await asyncio.to_thread(wait_until, lambda: running("sleep", duration))
    task.cancel()
    await asyncio.sleep(0.5)  # inside the client's TERM grace
    task.cancel()
    if streamed:
        await asyncio.sleep(0.5)  # the streamed path also has an outer cleanup
        task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    (proc,) = fake_ssh.procs
    assert proc.returncode is not None and proc.stdin.is_closing()
    assert await asyncio.to_thread(wait_until, lambda: not running("sleep", duration))


async def test_other_callers_keep_their_timeout_retry(fake_ssh, sleeps):
    duration = sleeps()
    code, output = await _run(
        f"sleep {duration}", end_with_channel=False, timeout=1, max_retries=2,
        retry_base_delay=0.01,
    )
    assert code == 1 and "timed out" in output
    assert len(fake_ssh.calls) == 2


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


class _FailingReader:
    """A client stdout whose read fails after a moment (a reader failure)."""

    async def read(self, *_args):
        await asyncio.sleep(1.0)
        raise OSError(5, "injected read failure")


@pytest.mark.parametrize(("entry", "streamed"), [
    ("cancel", False), ("timeout", False), ("reader-error", False),
    ("cancel", True), ("timeout", True),
])
def test_the_shutdown_drain_still_reaps_a_client_whose_cleanup_began(
    fake_ssh, sleeps, tmp_path, monkeypatch, entry, streamed
):
    """Review 12: Odin's real all-task drain cancels the cleanup task itself."""
    import logging

    import src.tools.process_manager as pm
    from src.__main__ import _finalize_loop

    plan = tmp_path / "plan"
    plan.write_text("ignore-term\n")
    monkeypatch.setenv("ODIN_FAKE_SSH_PLAN", str(plan))
    if entry == "reader-error":
        spawn = asyncio.create_subprocess_exec

        async def failing_reader_spawn(*args, **kwargs):
            proc = await spawn(*args, **kwargs)
            if args and args[0] == "ssh":
                proc.stdout = _FailingReader()
            return proc

        monkeypatch.setattr(asyncio, "create_subprocess_exec", failing_reader_spawn)
    duration = sleeps()

    async def on_output(_line):
        return None

    loop = asyncio.new_event_loop()
    task = loop.create_task(_run(
        f"sleep {duration}", timeout=1 if entry == "timeout" else 60, max_retries=1,
        on_output=on_output if streamed else None,
    ))
    deadline = time.monotonic() + 10
    while not running("sleep", duration) and time.monotonic() < deadline:
        loop.run_until_complete(asyncio.sleep(0.1))
    assert running("sleep", duration)
    if entry == "cancel":
        task.cancel()
    # The cleanup starts (now, at the 1 s timeout, or at the 1 s read failure)
    # and sits in the TERM grace of a client that ignores TERM.
    loop.run_until_complete(asyncio.sleep(1.6))
    (proc,) = fake_ssh.procs
    assert proc.returncode is None and not task.done()

    reaper = pm.AdoptedZombieReaper()
    reaper.drain_at_teardown = lambda: (0, True)
    assert _finalize_loop(loop, reaper, logging.getLogger("test")) is None
    assert task.done() and proc.returncode is not None
    assert wait_until(lambda: not running("sleep", duration))


@pytest.mark.parametrize("streamed", [False, True])
def test_cleanup_begun_in_the_final_batch_still_reaps_through_the_drain(
    fake_ssh, sleeps, tmp_path, monkeypatch, streamed
):
    """Review 14: a reader error lands in the batch that completes the service,
    so the loop stops right as cleanup begins; the drain still ends in a reap."""
    import logging

    import src.tools.process_manager as pm
    from src.__main__ import _finalize_loop

    plan = tmp_path / "plan"
    plan.write_text("ignore-term\n")
    monkeypatch.setenv("ODIN_FAKE_SSH_PLAN", str(plan))
    loop = asyncio.new_event_loop()
    read_edge = loop.create_future()
    reader_ready = asyncio.Event()

    class BrokenReader:
        async def read(self, *_args):
            reader_ready.set()
            await read_edge
            raise OSError(5, "reader error in the service's final batch")

    spawn = asyncio.create_subprocess_exec

    async def broken_spawn(*args, **kwargs):
        proc = await spawn(*args, **kwargs)
        if args and args[0] == "ssh":
            proc.stdout = BrokenReader()
        return proc

    monkeypatch.setattr(asyncio, "create_subprocess_exec", broken_spawn)
    duration = sleeps()

    async def on_output(_line):
        return None

    shutdown_gate = loop.create_future()

    async def shutdown():
        await shutdown_gate

    shutdown_task = loop.create_task(shutdown())

    async def service():
        await shutdown_task  # main.run() awaits its shutdown the same way

    service_task = loop.create_task(service())
    operation = loop.create_task(_run(
        f"sleep {duration}", timeout=60, max_retries=1,
        on_output=on_output if streamed else None,
    ))
    loop.run_until_complete(reader_ready.wait())
    # The reader error is delivered right behind the service's completion.
    shutdown_task.add_done_callback(lambda _: read_edge.set_result(None))
    shutdown_gate.set_result(None)
    loop.run_until_complete(service_task)
    assert not operation.done()

    reaper = pm.AdoptedZombieReaper()
    reaper.drain_at_teardown = lambda: (0, True)
    assert _finalize_loop(loop, reaper, logging.getLogger("test")) is None
    (proc,) = fake_ssh.procs
    assert operation.done() and proc.returncode is not None
    assert wait_until(lambda: not running("sleep", duration))


@pytest.mark.parametrize("repeated", [False, True])
async def test_cancelling_a_tool_call_ends_the_remote_command(fake_ssh, sleeps, tmp_path,
                                                              monkeypatch, repeated):
    """The path kill_agent takes: the in-flight tool call's task is cancelled."""
    if repeated:
        plan = tmp_path / "plan"
        plan.write_text("ignore-term\n")
        monkeypatch.setenv("ODIN_FAKE_SSH_PLAN", str(plan))
    duration = sleeps()
    executor = _executor()
    task = asyncio.create_task(
        executor.execute("run_command", {"host": "remote", "command": f"sleep {duration}"})
    )
    assert await asyncio.to_thread(wait_until, lambda: running("sleep", duration))
    task.cancel()
    if repeated:
        await asyncio.sleep(0.5)
        task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert all(proc.returncode is not None for proc in fake_ssh.procs)
    assert await asyncio.to_thread(wait_until, lambda: not running("sleep", duration))
