"""B3's harmless before/after shell matrix, using real, privately owned jobs.

No operational commands, live configuration, remote hosts or workstation sessions
are touched. Every long-lived fixture is contained by its own supervisor/registry;
cleanup signals never target a guessed numeric PID or an unrelated process group.
The parallel policy discovers this module through its ProcessRegistry/subprocess
imports and serializes it with the other process-and-timing tests.
"""
from __future__ import annotations

import asyncio
import json
import os
import shlex
import signal
import sys
from contextlib import asynccontextmanager

import pytest

from src.tools import command_shell, local_supervisor, local_supervisor_worker, process_manager
from src.tools.command_shell import resolve_local_shell
from src.tools.process_manager import ProcessRegistry
from src.tools.ssh import run_local_command


@pytest.fixture(params=["sh", "bash"])
def shell(request):
    # Bash absence is tested separately. On the supported Linux test host both
    # shells are required: do not silently skip half of the qualification matrix.
    return resolve_local_shell(request.param)


def python_command(source, *, exec_command=False):
    command = shlex.join([sys.executable, "-u", "-c", source])
    return "exec " + command if exec_command else command


@asynccontextmanager
async def supervised(shell, command, **kwargs):
    proc = await local_supervisor.create_supervised_shell(
        command, shell_choice=shell, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE, **kwargs,
    )
    try:
        assert proc.effective_shell == shell.name
        assert proc.shell_executable == shell.executable
        yield proc
    finally:
        assert await proc.terminate_tree(grace=.05)
        assert await asyncio.wait_for(asyncio.shield(proc._settled), 5)
        assert proc._worker.returncode == 0
        assert not os.path.exists(f"/proc/{proc._worker.pid}")


@asynccontextmanager
async def registry(tmp_path, shell_mode):
    reg = ProcessRegistry(
        workspace=str(tmp_path), retention_dir=tmp_path / "retained",
        command_shell=shell_mode,
    )
    try:
        yield reg
    finally:
        await reg.shutdown()
        for info in reg._processes.values():
            assert info.session_confirmed_empty
            if info.spool is not None:
                info.spool.close()


async def settled(info):
    await asyncio.wait_for(asyncio.shield(info._exit_task), 10)
    await asyncio.wait_for(asyncio.shield(info._reader_task), 10)
    assert info.session_confirmed_empty
    assert await asyncio.wait_for(asyncio.shield(info.process._settled), 5)


async def observed_output(info, text):
    async with asyncio.timeout(5):
        while text not in "".join(info.output_buffer):
            assert info.status == "running", (info.status, info.output_buffer)
            await asyncio.sleep(.01)


POSIX_CASES = [
    pytest.param("printf '%s|%s\\n' 'space ; $literal' \"double quoted\"",
                 "space ; $literal|double quoted\n", 0, id="quoting"),
    pytest.param("x=abcdef; printf '%s|%s|%s\\n' \"${x#abc}\" \"${x%def}\" \"$((3+4))\"",
                 "def|abc|7\n", 0, id="posix-expansion"),
    pytest.param("printf '%s\\n' 'a\\nb'", "a\\nb\n", 0, id="printf-literal"),
    pytest.param("printf 'a\\nb\\n'", "a\nb\n", 0, id="printf-escapes"),
    pytest.param("echo ordinary text", "ordinary text\n", 0, id="echo-ordinary"),
    pytest.param("false | true", "", 0, id="pipeline-no-implicit-pipefail"),
    pytest.param("true | false", "", 1, id="pipeline-last-status"),
    pytest.param("false; printf survived", "survived", 0, id="no-implicit-errexit"),
    pytest.param("printf '%s\\n' alpha beta | cat", "alpha\nbeta\n", 0, id="pipeline-output"),
]


@pytest.mark.parametrize("command, expected, code", POSIX_CASES)
async def test_posix_output_and_status(shell, command, expected, code):
    result, output = await run_local_command(command, command_shell=shell.name)
    assert (result, str(output)) == (code, expected)
    assert output.effective_shell == shell.name
    assert output.raw_returncode == code
    assert output.termination_reason is None


async def test_echo_backslash_is_shell_specific_not_rewritten(shell):
    result, output = await run_local_command("echo 'a\\nb'", command_shell=shell.name)
    assert result == 0
    # Debian's /bin/sh (dash) expands backslashes; Bash's default echo does not.
    expected = "a\nb\n" if shell.name == "sh" else "a\\nb\n"
    assert output == expected


@pytest.mark.parametrize("command, bash_output", [
    pytest.param("x=abcdef; printf '%s' \"${x:1:3}\"", "bcd", id="substring"),
    pytest.param("[[ abc == a* ]] && printf match", "match", id="double-brackets"),
    pytest.param("a=(one 'two words'); printf '%s' \"${a[1]}\"", "two words", id="array"),
    pytest.param("set -o pipefail; false | true", "", id="explicit-pipefail"),
])
async def test_bash_only_syntax_never_retried_under_another_shell(shell, command, bash_output):
    code, output = await run_local_command(command, command_shell=shell.name)
    assert output.effective_shell == shell.name
    if shell.name == "bash":
        assert output == bash_output
        assert code == (1 if "pipefail" in command else 0)
    else:
        assert code != 0
        messages = ("not found", "bad substitution", "syntax", "illegal option")
        assert any(message in output.lower() for message in messages)


@pytest.mark.parametrize("command, code, message", [
    pytest.param("odin_b3_harmless_missing_command", 127, "not found", id="missing-command"),
    pytest.param("if then", 2, "syntax", id="syntax-error"),
])
async def test_execution_errors_are_not_success_or_retries(shell, command, code, message):
    result, output = await run_local_command(command, command_shell=shell.name)
    assert result == output.raw_returncode == code
    assert message in output.lower()
    assert output.effective_shell == shell.name
    assert output.termination_reason is None


@pytest.mark.parametrize("form", ["simple", "explicit-exec", "compound", "pipeline"])
async def test_simple_exec_compound_and_pipeline_identities(shell, form):
    producer = python_command("import os; print(os.getpid()); raise SystemExit(23)",
                              exec_command=form == "explicit-exec")
    command = {
        "simple": producer,
        "explicit-exec": producer,
        "compound": producer + "; exit 23",
        "pipeline": producer + " | cat",
    }[form]
    async with supervised(shell, command) as proc:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), 5)
        producer_pid = int(stdout)
        assert stderr == b""
        assert proc.returncode == (0 if form == "pipeline" else 23)
        if form == "explicit-exec" or (form == "simple" and shell.name == "bash"):
            assert producer_pid == proc.pid
        elif form in {"compound", "pipeline"}:
            assert producer_pid != proc.pid


@pytest.mark.parametrize(
    "detached, holds_stdout", [(False, True), (False, False), (True, True), (True, False)],
)
async def test_early_leader_exit_does_not_claim_descendant_cleanup(shell, detached, holds_stdout):
    source = (
        "import os,time\n"
        "r,w=os.pipe()\n"
        "child=os.fork()\n"
        "if child == 0:\n"
        " os.close(r)\n"
        + (" os.setsid()\n" if detached else "")
        + " print(os.getpid(), flush=True)\n"
        + ("" if holds_stdout else
           " fd=os.open(os.devnull,os.O_WRONLY); os.dup2(fd,1); os.dup2(fd,2); os.close(fd)\n")
        + " os.write(w,b'R'); os.close(w); time.sleep(30); os._exit(0)\n"
        "os.close(w); os.read(r,1); os.close(r); os._exit(23)\n"
    )
    async with supervised(shell, python_command(source)) as proc:
        child = int(await asyncio.wait_for(proc.stdout.readline(), 5))
        assert await asyncio.wait_for(proc.wait(), 5) == 23
        assert os.path.exists(f"/proc/{child}")
        assert not proc._settled.done()
        drainage = asyncio.create_task(proc.communicate())
        try:
            if not holds_stdout:
                assert await asyncio.wait_for(asyncio.shield(drainage), 5) == (b"", b"")
                assert not proc._settled.done()
            assert await proc.terminate_tree(grace=.05)
            assert await asyncio.wait_for(drainage, 5) == (b"", b"")
            assert not os.path.exists(f"/proc/{child}")
            assert proc.returncode == 23
        finally:
            if not drainage.done():
                await proc.terminate_tree(grace=.05)
                await asyncio.wait_for(drainage, 5)


async def test_rapid_exits_remain_individually_owned(shell):
    async def run(code):
        async with supervised(shell, f"printf '{code}'; exit {code}") as proc:
            assert await asyncio.wait_for(proc.communicate(), 5) == (str(code).encode(), b"")
            assert proc.returncode == code
            return proc.pid, proc._worker.pid
    identities = await asyncio.gather(*(run(code) for code in range(8)))
    assert len({worker for _, worker in identities}) == 8


async def test_live_stdin_and_eof(shell):
    command = 'printf "ready\\n"; IFS= read -r line; printf "<%s>\\n" "$line"; cat; exit 29'
    async with supervised(shell, command, stdin=asyncio.subprocess.PIPE) as proc:
        assert await asyncio.wait_for(proc.stdout.readline(), 5) == b"ready\n"
        proc.stdin.write(b"space \\ literal\n")
        await proc.stdin.drain()
        assert await asyncio.wait_for(proc.communicate(b"second line\n"), 5) == (
            b"<space \\ literal>\nsecond line\n", b"",
        )
        assert proc.returncode == 29


async def test_closed_stdin_reader_does_not_crash_owner(shell):
    async with supervised(shell, "exec 0<&-; printf 'closed\\n'; sleep 30",
                          stdin=asyncio.subprocess.PIPE) as proc:
        assert await asyncio.wait_for(proc.stdout.readline(), 5) == b"closed\n"
        # Prove the live transport really detects the closed reader BEFORE
        # cleanup, not merely that a write races successfully with termination.
        proc.stdin.write(b"x" * (256 * 1024))
        with pytest.raises((BrokenPipeError, ConnectionResetError)):
            await asyncio.wait_for(proc.stdin.drain(), 5)
        # communicate owns the failed transport and still drains output.
        communication = asyncio.create_task(proc.communicate(b"x" * (256 * 1024)))
        try:
            await proc.terminate_tree(grace=.05)
            assert await asyncio.wait_for(communication, 5) == (b"", b"")
        finally:
            if not communication.done():
                await proc.terminate_tree(grace=.05)
                await asyncio.wait_for(communication, 5)


async def test_shell_sigterm_handler_gets_grace_and_keeps_its_exit_status(shell):
    command = "trap 'printf handled; exit 37' TERM; printf 'ready\\n'; while :; do read line; done"
    async with supervised(shell, command, stdin=asyncio.subprocess.PIPE) as proc:
        assert await asyncio.wait_for(proc.stdout.readline(), 5) == b"ready\n"
        assert await proc.terminate_tree(grace=1)
        assert await asyncio.wait_for(proc.communicate(), 5) == (b"handled", b"")
        assert proc.returncode == 37


async def test_sigterm_immune_job_is_escalated_to_raw_sigkill(shell):
    command = python_command(
        "import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); "
        "print('ready'); time.sleep(30)",
        exec_command=True,
    )
    async with supervised(shell, command) as proc:
        assert await asyncio.wait_for(proc.stdout.readline(), 5) == b"ready\n"
        assert await proc.terminate_tree(grace=.05)
        assert proc.returncode == -signal.SIGKILL


@pytest.mark.parametrize("death_signal", [signal.SIGTERM, signal.SIGKILL])
async def test_signal_death_is_not_normalized_to_a_positive_exit(shell, death_signal):
    command = python_command(
        f"import os,signal; print('before'); os.kill(os.getpid(), {int(death_signal)})",
        exec_command=True,
    )
    code, text = await run_local_command(command, command_shell=shell.name)
    assert code == text.raw_returncode == -death_signal
    assert text == "before\n"
    assert text.termination_reason is None
    assert text.effective_shell == shell.name


@pytest.mark.parametrize("streaming", [False, True])
async def test_foreground_cancellation_settles_exact_owned_job(shell, monkeypatch, streaming):
    spawned = []
    ready = asyncio.Event()
    actual = local_supervisor.create_supervised_shell

    async def capture(*args, **kwargs):
        proc = await actual(*args, **kwargs)
        spawned.append(proc)
        return proc

    async def output(text):
        if "ready" in text:
            ready.set()

    monkeypatch.setattr(local_supervisor, "create_supervised_shell", capture)
    command = python_command("import time; print('ready'); time.sleep(30)", exec_command=True)
    task = asyncio.create_task(run_local_command(
        command, timeout=30, on_output=output if streaming else None, command_shell=shell.name,
    ))
    try:
        async with asyncio.timeout(5):
            if streaming:
                await ready.wait()
            else:
                while not spawned:
                    await asyncio.sleep(.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert len(spawned) == 1
        proc = spawned[0]
        assert await asyncio.wait_for(asyncio.shield(proc._settled), 5)
        assert proc.returncode == -signal.SIGTERM
        assert not os.path.exists(f"/proc/{proc._worker.pid}")
    finally:
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        for proc in spawned:
            assert await proc.terminate_tree(grace=.05)


@pytest.mark.parametrize("streaming", [False, True])
async def test_timeout_is_not_command_failure_and_retains_raw_signal(shell, streaming):
    chunks = []

    async def output(text):
        chunks.append(text)

    command = python_command(
        "import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); "
        "print('ready'); time.sleep(30)",
        exec_command=True,
    )
    code, text = await run_local_command(command, timeout=1, command_shell=shell.name,
                                          on_output=output if streaming else None)
    assert code == 1 and text.raw_returncode == -signal.SIGKILL
    assert text.termination_reason == "timeout"
    assert text.effective_shell == shell.name
    assert "timed out" in text
    if streaming:
        assert "ready\n" in chunks


async def test_background_stdin_and_cancellation_disclose_shell(tmp_path, shell):
    async with registry(tmp_path, shell.name) as reg:
        result = await reg.start(
            "localhost", "printf 'ready\\n'; read line; printf '<%s>\\n' \"$line\"; read finish",
        )
        assert "effective_shell=" not in result
        info = next(iter(reg._processes.values()))
        await observed_output(info, "ready")
        assert "Wrote" in await reg.write(info.pid, "reply\n")
        await observed_output(info, "<reply>")
        assert "killed" in await reg.kill(info.pid)
        await settled(info)
        assert info.termination_reason == "cancellation"
        assert info.exit_code == -signal.SIGTERM
        assert info.effective_shell == shell.name
        assert info.shell_executable == shell.executable


async def test_background_timeout_retains_its_reason(tmp_path, shell):
    async with registry(tmp_path, shell.name) as reg:
        await reg.start("localhost", "printf 'ready\\n'; read line")
        info = next(iter(reg._processes.values()))
        await observed_output(info, "ready")
        # Invoke the actual owning lifetime callback after an explicit readiness
        # barrier, rather than patching the shared event-loop clock or sleeping
        # for the production one-hour deadline.
        await reg._enforce_lifetime(info, 0)
        await settled(info)
        assert info.termination_reason == "timeout"
        assert info.exit_code == -signal.SIGTERM


@pytest.mark.parametrize("detached", [False, True])
async def test_background_early_exit_reaps_stdout_holding_descendant(tmp_path, shell, detached):
    source = (
        "import os,time\n"
        "r,w=os.pipe()\n"
        "child=os.fork()\n"
        "if child == 0:\n"
        " os.close(r)\n"
        + (" os.setsid()\n" if detached else "")
        + " print(os.getpid(),flush=True); os.write(w,b'R'); os.close(w); "
        "time.sleep(30); os._exit(0)\n"
        "os.close(w); os.read(r,1); os.close(r); os._exit(23)\n"
    )
    async with registry(tmp_path, shell.name) as reg:
        await reg.start("localhost", python_command(source))
        info = next(iter(reg._processes.values()))
        await settled(info)
        child = int("".join(info.output_buffer).strip())
        assert not os.path.exists(f"/proc/{child}")
        assert info.exit_code == 23
        assert info.status == "failed"
        assert info.termination_reason is None


@pytest.mark.parametrize(
    "hostile", ["BASH_ENV", "ENV", "SHELLOPTS", "BASHOPTS", "function", "startup-files", "all"],
)
async def test_bash_startup_is_noninteractive_and_inherited_state_is_sanitized(
    tmp_path, monkeypatch, hostile,
):
    bash = resolve_local_shell("bash")
    startup = tmp_path / "hostile-startup"
    startup.write_text("printf 'HOSTILE_STARTUP\\n'; export ODIN_B3_STARTUP=loaded\n")
    for name in (".bashrc", ".bash_profile", ".bash_login", ".profile"):
        (tmp_path / name).write_text(startup.read_text())
    values = {
        "BASH_ENV": str(startup), "ENV": str(startup),
        "SHELLOPTS": "errexit:pipefail:nounset", "BASHOPTS": "xpg_echo:extglob",
        "BASH_FUNC_printf%%": "() { builtin printf 'HOSTILE_FUNCTION\\n'; }",
    }
    keys = {"function": ["BASH_FUNC_printf%%"], "startup-files": []}.get(hostile, [hostile])
    if hostile == "all":
        keys = list(values)
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("ODIN_B3_PRESERVE", "space ; $literal")
    for key in keys:
        monkeypatch.setenv(key, values[key])
    source = (
        "import os,json; "
        "print(json.dumps({k:v for k,v in os.environ.items() if k in "
        "['BASH_ENV','ENV','SHELLOPTS','BASHOPTS','BASH_FUNC_printf%%','ODIN_B3_PRESERVE','ODIN_B3_STARTUP']}))"
    )
    command = (
        "case $- in *i*|*m*|*e*|*u*) exit 71;; esac; "
        "shopt -q login_shell && exit 72; shopt -q xpg_echo && exit 73; "
        "false | true; printf '%s\\n' 'a\\nb'; false; printf survived; "
        + python_command(source)
    )
    async with supervised(bash, command) as proc:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), 5)
        assert proc.returncode == 0
        assert stderr == b""
        assert stdout.startswith(b"a\\nb\nsurvived")
        inherited = json.loads(stdout.split(b"survived", 1)[1])
        assert inherited == {"ODIN_B3_PRESERVE": "space ; $literal"}
    # Sanitizing one invocation must not mutate Odin's inherited environment.
    assert all(os.environ[key] == values[key] for key in keys)


async def test_sh_rollback_preserves_inherited_environment(tmp_path):
    sh = resolve_local_shell("sh")
    env = {**os.environ, "BASH_ENV": "unused-for-noninteractive-sh", "ODIN_B3_PRESERVE": "kept"}
    async with supervised(sh, 'printf "%s|%s" "$BASH_ENV" "$ODIN_B3_PRESERVE"', env=env) as proc:
        assert await asyncio.wait_for(proc.communicate(), 5) == (
            b"unused-for-noninteractive-sh|kept", b"",
        )


@pytest.mark.parametrize("mode", ["auto", "bash", "sh"])
async def test_bash_absence_falls_back_only_in_auto_before_execution(tmp_path, monkeypatch, mode):
    monkeypatch.setattr(command_shell.shutil, "which", lambda name: None)
    marker = tmp_path / "executed"
    command = "printf harmless > " + shlex.quote(str(marker))
    if mode == "bash":
        with pytest.raises(FileNotFoundError, match="bash is unavailable; command not executed"):
            resolve_local_shell(mode)
        code, output = await run_local_command(command, command_shell=mode)
        assert code == 1
        assert "bash is unavailable" in output
        assert not marker.exists()
        async with registry(tmp_path, mode) as reg:
            result = await reg.start("localhost", command)
            assert result == (
                "Error: tools.command_shell=bash: bash is unavailable; command not executed")
            assert not reg._processes
            assert not marker.exists()
    else:
        choice = resolve_local_shell(mode)
        assert (choice.name, choice.executable) == ("sh", "/bin/sh")
        code, output = await run_local_command(command, command_shell=mode)
        assert code == 0
        assert output.effective_shell == "sh"
        assert marker.read_text() == "harmless"
        async with registry(tmp_path, mode) as reg:
            result = await reg.start("localhost", command)
            assert "effective_shell=" not in result
            info = next(iter(reg._processes.values()))
            await settled(info)
            assert info.effective_shell == "sh"
            assert info.shell_executable == "/bin/sh"


@pytest.mark.parametrize("initial, changed", [("sh", "bash"), ("bash", "sh")])
async def test_config_changes_only_new_jobs_and_records_keep_creation_shell(
    tmp_path, initial, changed,
):
    mode = initial
    async with registry(tmp_path, lambda: mode) as reg:
        await reg.start("localhost", 'printf "ready\\n"; read line; printf "%s" "$line"')
        first = next(iter(reg._processes.values()))
        await observed_output(first, "ready")
        mode = changed
        result = await reg.start("localhost", "printf second")
        second = list(reg._processes.values())[-1]
        assert "effective_shell=" not in result
        assert second.effective_shell == changed
        assert first.effective_shell == initial
        assert first.shell_executable == resolve_local_shell(initial).executable
        assert "Wrote" in await reg.write(first.pid, "unchanged\n")
        await settled(first)
        await settled(second)
        assert first.exit_code == second.exit_code == 0
        await reg.start("localhost", "printf 'third-ready\\n'; read line")
        third = list(reg._processes.values())[-1]
        await observed_output(third, "third-ready")
        # Restoration is output-only and must never call current discovery.
        reg._command_shell = lambda: "invalid-current-config"
        assert "killed" in await reg.kill(third.pid)
        await settled(third)
        assert third.effective_shell == changed
        assert third.termination_reason == "cancellation"
        restored = ProcessRegistry(
            retention_dir=tmp_path / "retained", command_shell="invalid-current-config",
        )
        assert restored._processes[first.pid].effective_shell == initial
        assert restored._processes[second.pid].effective_shell == changed
        assert restored._processes[first.pid].shell_executable == first.shell_executable
        assert "unchanged" in await restored.poll(first.pid)
        assert f"effective_shell={initial}" in await restored.poll(first.pid)
        assert await restored.shutdown() == 0


async def test_real_pinned_identity_rejects_reused_start_id(shell, monkeypatch):
    """The kernel PID is real; only the post-pin reuse observation is injected.

    No synthetic PID is ever signalled or waited on. This exercises production
    Worker.reap's start-ID gate using a pidfd for our exact owned live shell.
    """
    async with supervised(shell, "printf 'ready\\n'; read line",
                          stdin=asyncio.subprocess.PIPE) as proc:
        assert await asyncio.wait_for(proc.stdout.readline(), 5) == b"ready\n"
        parent, start = local_supervisor_worker.stat(proc.pid)
        assert parent == proc._worker.pid
        fd = os.pidfd_open(proc.pid)
        control, peer = local_supervisor_worker.socket.socketpair()
        worker = local_supervisor_worker.Worker(control)
        worker.owner = parent
        worker.leader = None
        worker.pins = {(proc.pid, start): local_supervisor_worker.Pin(proc.pid, start, fd)}
        worker.selector.register(fd, local_supervisor_worker.selectors.EVENT_READ)

        def forbidden_wait(*args, **kwargs):
            raise AssertionError("start-ID reuse must not redirect waitid")

        try:
            with monkeypatch.context() as patch:
                patch.setattr(local_supervisor_worker, "stat", lambda pid: (parent, start + 1))
                patch.setattr(local_supervisor_worker, "dead", lambda pin: True)
                patch.setattr(os, "waitid", forbidden_wait)
                worker.reap()
                assert not worker.pins
                assert fd not in worker.selector.get_map()
                assert not worker.failed
            with pytest.raises(OSError):
                os.fstat(fd)
            # Our real original shell is still alive, untouched by stale data.
            assert local_supervisor_worker.stat(proc.pid) == (parent, start)
        finally:
            if worker.pins:
                os.close(fd)
            worker.selector.close()
            control.close()
            peer.close()


async def test_shutdown_veto_does_not_equate_real_leader_exit_with_proof(
    tmp_path, shell, monkeypatch,
):
    # Start a real job, then deny only its cleanup *verdict*. The finalizer runs
    # the unpatched, exact-ownership cleanup. Nothing live outside this fixture
    # can be signalled; this never changes the global restart policy.
    async with registry(tmp_path, shell.name) as reg:
        await reg.start("localhost", "printf 'ready\\n'; read line")
        info = next(iter(reg._processes.values()))
        await observed_output(info, "ready")
        original = info.process.terminate_tree

        async def unproven(grace=3):
            await original(grace=grace)
            return False

        with monkeypatch.context() as patch:
            patch.setattr(info.process, "terminate_tree", unproven)
            with pytest.raises(process_manager.ProcessCleanupError, match=str(info.pid)):
                await reg.shutdown()
            assert info.process.returncode == -signal.SIGTERM
            assert info.session_confirmed_empty is False
            assert info.status == "unknown"
        assert await reg.terminate_generation(info.generation)
        assert info.session_confirmed_empty


async def test_pending_real_spawn_reserves_capacity_until_lifecycle_is_installed(
    tmp_path, shell, monkeypatch,
):
    entered, release = asyncio.Event(), asyncio.Event()
    actual = local_supervisor.create_supervised_shell
    spawned = []

    async def held_launch(*args, **kwargs):
        proc = await actual(*args, **kwargs)
        spawned.append(proc)
        entered.set()
        try:
            await release.wait()
        except BaseException:
            await proc.terminate_tree(grace=.05)
            raise
        return proc

    monkeypatch.setattr(process_manager, "MAX_CONCURRENT", 1)
    monkeypatch.setattr(local_supervisor, "create_supervised_shell", held_launch)
    async with registry(tmp_path, shell.name) as reg:
        task = asyncio.create_task(reg.start("localhost", "printf 'ready\\n'; read line"))
        try:
            await asyncio.wait_for(entered.wait(), 5)
            assert reg._pending_starts == 1
            assert "Cannot start" in await reg.start("localhost", "printf must-not-run")
            assert len(spawned) == 1
            release.set()
            assert "Process started" in await asyncio.wait_for(task, 5)
            assert reg._pending_starts == 0
            info = next(iter(reg._processes.values()))
            await observed_output(info, "ready")
            assert reg._active_count() == 1
            assert "killed" in await reg.kill(info.pid)
            await settled(info)
            assert reg._active_count() == 0
        finally:
            release.set()
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
            for proc in spawned:
                assert await proc.terminate_tree(grace=.05)


class FixtureLease:
    """Inert admission evidence around a real local execution, never a host API."""

    revoked = False

    def __init__(self):
        self.released = False

    def release(self):
        self.released = True


async def test_real_leader_exit_keeps_lease_until_cleanup_settlement(
    tmp_path, shell, monkeypatch,
):
    lease = FixtureLease()
    entered, release = asyncio.Event(), asyncio.Event()
    async with registry(tmp_path, shell.name) as reg:
        await reg.start("localhost", "printf 'ready\\n'; read line", host_lease=lease)
        info = next(iter(reg._processes.values()))
        await observed_output(info, "ready")
        original = info.process.terminate_tree

        async def held_settlement(grace=3):
            entered.set()
            await release.wait()
            return await original(grace=grace)

        with monkeypatch.context() as patch:
            patch.setattr(info.process, "terminate_tree", held_settlement)
            try:
                assert "Wrote" in await reg.write(info.pid, "finish\n")
                await asyncio.wait_for(entered.wait(), 5)
                assert info.process.returncode == 0
                assert info.status == "running"
                assert not info.session_confirmed_empty
                assert info.host_lease is lease
                assert not lease.released
                assert reg._active_count() == 1
                release.set()
                await settled(info)
                assert info.status == "completed"
                assert info.host_lease is None
                assert lease.released
                assert reg._active_count() == 0
            finally:
                release.set()


async def test_real_initial_persistence_failure_still_installs_and_settles_lifecycle(
    tmp_path, shell, monkeypatch,
):
    lease = FixtureLease()
    async with registry(tmp_path, shell.name) as reg:
        original = reg._persist_output
        first = True

        def initial_disk_failure(info):
            nonlocal first
            if first:
                first = False
                raise OSError("fixture initial record write failed")
            return original(info)

        monkeypatch.setattr(reg, "_persist_output", initial_disk_failure)
        with pytest.raises(OSError, match="fixture initial record write failed"):
            await reg.start("localhost", "printf 'ready\\n'; read line", host_lease=lease)
        assert reg._pending_starts == 0
        assert len(reg._processes) == 1
        info = next(iter(reg._processes.values()))
        assert info._reader_task is not None
        assert info._exit_task is not None
        await settled(info)
        assert lease.released
        assert info.host_lease is None
        assert info.process.returncode == -signal.SIGTERM
        assert reg._active_count() == 0
