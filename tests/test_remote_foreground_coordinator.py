"""The remote foreground coordinator and its bootstrap, run as real processes.

The coordinator runs here exactly as sshd would run it: its stdin is the
channel (a pipe the test holds open and closes to simulate the channel going
away) and its stdout is the channel's output. Commands are harmless sleeps,
echoes and byte generators, each identified by a unique argv so a leftover
can be found in /proc and cleaned up by pid.
"""
from __future__ import annotations

import ast
import base64
import hashlib
import os
import shutil
import signal
import subprocess
import sys
import time

import pytest

from src.tools import remote_foreground
from src.tools.remote_foreground import MISSING_PYTHON_NOTICE, remote_foreground_command

pytestmark = pytest.mark.skipif(sys.platform != "linux", reason="inspects /proc")

COORDINATOR = remote_foreground._COORDINATOR
GRACE = "0.3"


def _cmdline(pid: str) -> list[str]:
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as fh:
            return [part.decode() for part in fh.read().split(b"\0")[:-1]]
    except OSError:
        return []


def running(*argv: str) -> list[int]:
    """Live (non-zombie) processes whose argv is exactly *argv*."""
    found = []
    for entry in os.listdir("/proc"):
        if entry.isdigit() and _cmdline(entry) == list(argv):
            found.append(int(entry))
    return found


def children(pid: int) -> list[int]:
    """Every process, zombies included, whose parent is *pid*."""
    found = []
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        try:
            with open(f"/proc/{entry}/stat") as fh:
                fields = fh.read().rsplit(")", 1)[1].split()
        except OSError:
            continue
        if int(fields[1]) == pid:
            found.append(int(entry))
    return found


def wait_until(predicate, timeout=10.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return predicate()


@pytest.fixture
def sleeps():
    """Unique sleep durations; any still running at teardown are killed by pid."""
    used: list[str] = []

    def make() -> str:
        duration = f"{170 + len(used)}.{os.getpid() % 1000:03d}"
        used.append(duration)
        return duration

    yield make
    for duration in used:
        for pid in running("sleep", duration):
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


class Coordinator:
    """One coordinator, its channel (stdin) held open by the test."""

    def __init__(self, command, *, shell="/bin/sh", grace=GRACE, prelude="", env=None):
        channel_r, self.channel_w = os.pipe()
        self.proc = subprocess.Popen(
            [sys.executable, "-c", prelude + COORDINATOR, shell, command, grace],
            stdin=channel_r, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
        )
        os.close(channel_r)

    def close_channel(self):
        if self.channel_w is not None:
            os.close(self.channel_w)
            self.channel_w = None

    def finish(self, timeout=15):
        out, err = self.proc.communicate(timeout=timeout)
        self.close_channel()
        return self.proc.returncode, out, err

    def stop(self):
        self.close_channel()
        if self.proc.poll() is None:
            self.proc.kill()
        self.proc.wait()
        for stream in (self.proc.stdout, self.proc.stderr):
            stream.close()


@pytest.fixture
def coordinators():
    started: list[Coordinator] = []

    def make(*args, **kwargs) -> Coordinator:
        run = Coordinator(*args, **kwargs)
        started.append(run)
        return run

    yield make
    for run in started:
        run.stop()


# ---------------------------------------------------------------------------
# Normal completion
# ---------------------------------------------------------------------------


def test_output_keeps_its_write_order_and_the_exit_code(coordinators):
    code, out, err = coordinators("echo out-1; echo err-1 >&2; echo out-2; exit 7").finish()
    assert (code, out, err) == (7, b"out-1\nerr-1\nout-2\n", b"")


def test_a_signalled_command_reports_128_plus_the_signal(coordinators):
    code, _, _ = coordinators("kill -s TERM $$").finish()
    assert code == 143


def test_normal_background_work_keeps_running(coordinators, sleeps):
    duration = sleeps()
    started = time.monotonic()
    code, out, _ = coordinators(
        f"nohup sleep {duration} >/dev/null 2>&1 & echo started"
    ).finish()
    assert (code, out) == (0, b"started\n")
    assert time.monotonic() - started < 5
    assert running("sleep", duration)


def test_the_command_sees_only_the_standard_descriptors(coordinators):
    code, out, _ = coordinators("ls /proc/$$/fd").finish()
    assert (code, out.split()) == (0, [b"0", b"1", b"2"])


def test_a_slow_reader_gets_every_byte(coordinators):
    generate = (
        f"{shutil.which('python3') or sys.executable} -c "
        "'import sys; [sys.stdout.write(\"line %07d odin-integrity\\n\" % i) "
        "for i in range(200000)]'; exit 3"
    )
    expected = subprocess.run(["/bin/sh", "-c", generate], capture_output=True).stdout
    run = coordinators(generate)
    digest = hashlib.sha256()
    total = 0
    while True:
        chunk = run.proc.stdout.read1(32768)
        if not chunk:
            break
        digest.update(chunk)
        total += len(chunk)
        time.sleep(0.002)
    assert run.proc.wait(timeout=30) == 3
    assert total == len(expected) == 5_600_000
    assert digest.hexdigest() == hashlib.sha256(expected).hexdigest()


# ---------------------------------------------------------------------------
# The channel closes before the command settles
# ---------------------------------------------------------------------------


def test_a_closed_channel_ends_a_term_immune_group(coordinators, sleeps):
    duration = sleeps()
    run = coordinators(f"sh -c \"trap '' TERM; sleep {duration}\"; echo done", grace="1.5")
    assert wait_until(lambda: running("sleep", duration))
    run.close_channel()
    time.sleep(0.6)
    assert running("sleep", duration)  # TERM-immune: alive through the grace
    assert wait_until(lambda: not running("sleep", duration))  # then KILL
    assert run.proc.wait(timeout=10) == 129


def test_a_closed_channel_ends_the_child_holding_the_output(coordinators, sleeps):
    duration = sleeps()
    run = coordinators(f"(sleep {duration}; echo late) & echo early")
    assert wait_until(lambda: running("sleep", duration))
    run.close_channel()
    assert wait_until(lambda: not running("sleep", duration))
    code, out, _ = run.finish()
    assert (code, out) == (129, b"early\n")


def test_output_eof_alone_keeps_the_command_owned(coordinators, sleeps):
    duration = sleeps()
    run = coordinators(f"exec >/dev/null 2>&1; sleep {duration}")
    assert wait_until(lambda: running("sleep", duration))
    time.sleep(0.3)
    run.close_channel()
    assert wait_until(lambda: not running("sleep", duration))
    assert run.proc.wait(timeout=10) == 129


def test_a_saturated_reader_never_hides_the_closed_channel(coordinators):
    run = coordinators("yes odin-saturated")  # its output is never read
    assert wait_until(lambda: running("yes", "odin-saturated"))
    time.sleep(0.5)
    run.close_channel()
    assert wait_until(lambda: not running("yes", "odin-saturated"))
    assert run.proc.wait(timeout=10) == 129


def test_a_broken_output_side_ends_the_command(coordinators):
    run = coordinators("yes odin-broken-output")
    assert run.proc.stdout.read(1000)
    run.proc.stdout.close()
    assert wait_until(lambda: not running("yes", "odin-broken-output"))
    assert run.proc.wait(timeout=10) == 129


@pytest.mark.parametrize("stop", [signal.SIGTERM, signal.SIGHUP, signal.SIGINT, signal.SIGQUIT])
def test_a_stop_signal_ends_the_group_even_when_repeated(coordinators, sleeps, stop):
    duration = sleeps()
    run = coordinators(f"sh -c \"trap '' TERM; sleep {duration}\"", grace="1")
    assert wait_until(lambda: running("sleep", duration))
    run.proc.send_signal(stop)
    time.sleep(0.4)
    run.proc.send_signal(stop)  # during the grace: the escalation goes on
    assert wait_until(lambda: not running("sleep", duration))
    assert run.proc.wait(timeout=10) == 129


@pytest.mark.parametrize("seam", ["os.set_blocking", "select.select"])
def test_a_failure_after_spawn_still_ends_the_command(coordinators, sleeps, seam):
    duration = sleeps()
    module, name = seam.split(".")
    prelude = (
        f"import {module}\n"
        f"def _injected(*_a, **_k):\n    raise OSError(5, 'injected failure')\n"
        f"{module}.{name} = _injected\n"
    )
    run = coordinators(f"sleep {duration}", prelude=prelude)
    code, _, err = run.finish()
    assert code == 1 and b"injected failure" in err
    assert not running("sleep", duration)


def test_nothing_left_to_signal_never_breaks_the_cleanup(coordinators, sleeps):
    """macOS answers EPERM when only the unreaped leader is left in the group."""
    duration = sleeps()
    prelude = (
        "import os\n"
        "_killpg = os.killpg\n"
        "def _macos_killpg(group, sig):\n"
        "    _killpg(group, sig)\n"
        "    raise PermissionError(1, 'Operation not permitted')\n"
        "os.killpg = _macos_killpg\n"
    )
    run = coordinators(f"sleep {duration}", prelude=prelude)
    assert wait_until(lambda: running("sleep", duration))
    run.close_channel()
    code, _, err = run.finish()
    assert (code, err) == (129, b"")
    assert not running("sleep", duration)


# ---------------------------------------------------------------------------
# Settlement: after the command has exited with its output at EOF
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("loss", ["channel", "stop-signal"])
def test_settled_backlog_never_signals_background_work(coordinators, sleeps, loss):
    duration = sleeps()
    run = coordinators(
        f"nohup sleep {duration} >/dev/null 2>&1 & "
        "head -c 524288 /dev/zero | tr '\\0' a; exit 0"
    )  # 512 KiB of output that nobody reads yet
    assert wait_until(lambda: running("sleep", duration))
    assert wait_until(lambda: not children(run.proc.pid))  # leader exited and reaped
    if loss == "channel":
        run.close_channel()
    else:
        run.proc.send_signal(signal.SIGTERM)
    assert run.proc.wait(timeout=10) == 129
    assert running("sleep", duration)


def test_settled_backlog_is_delivered_in_full_when_read(coordinators, sleeps):
    duration = sleeps()
    run = coordinators(
        f"nohup sleep {duration} >/dev/null 2>&1 & head -c 524288 /dev/zero | tr '\\0' a; exit 3"
    )
    assert wait_until(lambda: not children(run.proc.pid))
    code, out, _ = run.finish()
    assert (code, out) == (3, b"a" * 524288)
    assert running("sleep", duration)


# ---------------------------------------------------------------------------
# The bootstrap: what the login shell actually receives
# ---------------------------------------------------------------------------

LOGIN_SHELLS = [s for s in ("/bin/sh", "/bin/bash", "/usr/bin/zsh") if os.path.exists(s)]


def _bootstrap(login_shell, command, *, env_path=None, bootstrap=None, home=None, timeout=30):
    env = {"PATH": env_path or os.environ["PATH"], "SHELL": login_shell, "LC_ALL": "C.UTF-8"}
    if home is not None:  # no personal startup files (zsh reads ~/.zshenv even for -c)
        env.update(HOME=str(home), ZDOTDIR=str(home))
    channel_r, channel_w = os.pipe()
    proc = subprocess.Popen(
        [login_shell, "-c", bootstrap or remote_foreground_command(command, grace=0.3)],
        stdin=channel_r, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
    )
    os.close(channel_r)
    try:
        out, err = proc.communicate(timeout=timeout)
    finally:
        os.close(channel_w)
    return proc.returncode, out, err


TRICKY = (
    "printf '%s\\n' \"it's \\\"quoted\\\"\" 'héllo ✓'; "
    "printf 'line one\\nline two\\n'; echo err-1 >&2; exit 5"
)


@pytest.mark.parametrize("login_shell", LOGIN_SHELLS)
def test_the_bootstrap_runs_the_command_exactly(login_shell):
    direct = subprocess.run([login_shell, "-c", TRICKY], capture_output=True)
    code, out, err = _bootstrap(login_shell, TRICKY)
    assert code == direct.returncode == 5
    # The coordinator merges stderr into stdout at the source, in write order.
    assert out == direct.stdout.replace(b"line two\n", b"line two\nerr-1\n")
    assert err == b""


@pytest.mark.parametrize("login_shell", LOGIN_SHELLS)
def test_without_python3_the_command_runs_once_after_a_notice(tmp_path, login_shell):
    marker = tmp_path / "ran"
    code, out, err = _bootstrap(
        login_shell, f"echo ran >> {marker}; echo out; exit 2",
        env_path=str(tmp_path / "empty"), home=tmp_path,
    )
    assert code == 2 and out == b"out\n"
    assert err.decode().strip() == MISSING_PYTHON_NOTICE
    assert marker.read_text() == "ran\n"


@pytest.mark.parametrize("login_shell", LOGIN_SHELLS)
@pytest.mark.parametrize("python3", [True, False])
def test_the_command_reads_an_empty_stdin_with_or_without_python3(tmp_path, login_shell, python3):
    """stdin is /dev/null either way, as before the coordinator. The channel's
    stdin (held open here, never written) would make a reader wait forever."""
    code, out, err = _bootstrap(
        login_shell, 'read line; echo "read=$? line=$line"',
        env_path=None if python3 else str(tmp_path / "empty"), home=tmp_path, timeout=10,
    )
    assert code == 0 and out == b"read=1 line=\n"
    assert (err.decode().strip() == MISSING_PYTHON_NOTICE) is not python3


@pytest.mark.parametrize("login_shell", LOGIN_SHELLS)
@pytest.mark.parametrize("broken", ["exits 1", "bad interpreter"])
def test_a_python3_that_fails_never_falls_back_to_a_second_run(tmp_path, login_shell, broken):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake = bin_dir / "python3"
    fake.write_text("#!/bin/sh\nexit 1\n" if broken == "exits 1" else "#!/nonexistent/odin\n")
    fake.chmod(0o755)
    marker = tmp_path / "ran"
    code, _, _ = _bootstrap(
        login_shell, f"echo ran >> {marker}", env_path=str(bin_dir), home=tmp_path
    )
    assert code != 0
    assert not marker.exists()


@pytest.mark.parametrize("login_shell", LOGIN_SHELLS)
@pytest.mark.parametrize("dev_tools", [False, True])
def test_the_macos_python3_stub_counts_only_with_developer_tools(tmp_path, login_shell,
                                                                 dev_tools):
    if shutil.which("python3", path="/usr/bin") != "/usr/bin/python3":
        pytest.skip("needs /usr/bin/python3 to stand in for the macOS stub")
    fake = tmp_path / "fakebin"
    fake.mkdir()
    (fake / "uname").write_text("#!/bin/sh\necho Darwin\n")
    (fake / "xcode-select").write_text(f"#!/bin/sh\nexit {0 if dev_tools else 2}\n")
    for tool in ("uname", "xcode-select"):
        (fake / tool).chmod(0o755)
    marker = tmp_path / "ran"
    code, out, err = _bootstrap(
        login_shell, f"echo ran >> {marker}; echo out; exit 2",
        env_path=f"{fake}:/usr/bin:/bin", home=tmp_path,
    )
    assert (code, out) == (2, b"out\n")
    assert marker.read_text() == "ran\n"
    assert (err.decode().strip() == MISSING_PYTHON_NOTICE) is not dev_tools


@pytest.mark.parametrize("login_shell", LOGIN_SHELLS)
def test_a_coordinator_that_fails_to_load_never_falls_back(tmp_path, login_shell, monkeypatch):
    broken = base64.b64encode(b"this is not python (").decode()
    monkeypatch.setattr(remote_foreground, "_ENCODED_COORDINATOR", broken)
    marker = tmp_path / "ran"
    code, _, err = _bootstrap(login_shell, f"echo ran >> {marker}")
    assert code != 0 and b"SyntaxError" in err
    assert not marker.exists()


def test_a_command_that_cannot_start_is_reported(coordinators):
    code, out, err = coordinators("true", shell="/nonexistent/shell").finish()
    assert code == 126 and out == b""
    assert b"odin: the command could not be started" in err


def test_the_coordinator_stays_python_36_compatible():
    ast.parse(COORDINATOR, feature_version=(3, 6))
    assert "from __future__" not in COORDINATOR


def test_the_bootstrap_quotes_the_command_once_and_never_shell_quotes_the_program():
    command = "echo 'a b' \"$HOME\" `x` ; exit 4"
    line = remote_foreground_command(command)
    assert line.startswith("odin_fg_command=")
    assert line.count("odin_fg_command") == 3  # set once, used in each branch
    assert remote_foreground._ENCODED_COORDINATOR in line
    assert COORDINATOR not in line
