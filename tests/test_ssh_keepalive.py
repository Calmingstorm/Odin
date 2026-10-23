"""#733: SSH keep-alive, and what a call dropped by it reports.

Without keep-alive, a host that stopped answering mid-command (a laptop gone
to sleep) held the call until its tool timeout. With it, ssh ends the session
after about 45 s of silence and exits 255. That call may have run, as a timed-
out one may have, so its outcome stays unknown and it is never sent again.

Measured on OpenSSH 9.6 (a loopback sshd whose session process was stopped):
a direct session prints ``Timeout, server <host> not responding.``; a pooled
session prints nothing, and by its exit the master has ended and removed its
socket.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.config.schema import ToolsConfig
from src.tools import ssh
from src.tools.execution_outcome import DispatchEvidence, dispatch_evidence
from src.tools.executor import ToolExecutor
from src.tools.ssh_options import KEEPALIVE_OPTIONS
from src.tools.ssh_pool import SSHConnectionPool

KEEPALIVE_LINE = "Timeout, server example.test not responding.\n"


def _proc(text="", returncode=0):
    return SimpleNamespace(
        returncode=returncode, pid=54321,
        wait=AsyncMock(return_value=returncode),
        communicate=AsyncMock(return_value=(text.encode(), None)),
    )


def _keepalive_options_in(argv) -> bool:
    joined = " ".join(map(str, argv))
    return "-o ServerAliveInterval=15 -o ServerAliveCountMax=3" in joined


class _Master:
    """A master Process: ended (returncode set) or still running."""

    def __init__(self, ended: bool):
        self.returncode = 255 if ended else None
        self._forever = asyncio.Event()

    async def wait(self):
        await self._forever.wait()


def _pool(master):
    return SimpleNamespace(
        is_connected=Mock(return_value=True),
        acquire=AsyncMock(return_value=True),
        get_ssh_args=Mock(return_value=["ssh", "example.test", "fixture"]),
        master_process=Mock(return_value=master),
        master_ended=SSHConnectionPool.master_ended,
        ensure_master_registered=AsyncMock(),
        release=Mock(),
    )


async def _run(monkeypatch, *procs, **kwargs):
    spawn = AsyncMock(side_effect=list(procs))
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr("src.tools.ssh.asyncio.sleep", AsyncMock())
    evidence = DispatchEvidence()
    token = dispatch_evidence.set(evidence)
    try:
        code, output = await ssh.run_ssh_command(
            "example.test", "fixture", "k", "kh", **kwargs)
    finally:
        dispatch_evidence.reset(token)
    return code, output, evidence.uncertain, spawn


# --- the options ---------------------------------------------------------

def test_the_shared_options_detect_a_silent_peer_in_about_45_seconds():
    assert KEEPALIVE_OPTIONS == (
        "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3")


async def test_one_shot_and_binary_reads_send_keepalives(monkeypatch):
    _, _, _, spawn = await _run(monkeypatch, _proc("ok\n"))
    assert _keepalive_options_in(spawn.await_args.args)

    reader = AsyncMock(return_value=_proc(""))
    monkeypatch.setattr(asyncio, "create_subprocess_exec", reader)
    await ssh.read_binary_file("example.test", "/f", max_bytes=10, ssh_key_path="k",
                               known_hosts_path="kh")
    assert _keepalive_options_in(reader.await_args.args)


async def test_the_pool_master_and_its_sessions_send_keepalives(tmp_path, monkeypatch):
    pool = SSHConnectionPool(socket_dir=str(tmp_path))
    session = pool.get_ssh_args("example.test", "fixture", "k", "kh", "odin")
    assert _keepalive_options_in(session)

    master = SimpleNamespace(returncode=255, pid=1, wait=AsyncMock(return_value=255))
    spawn = AsyncMock(return_value=master)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    await pool.acquire("example.test", "k", "kh", "odin")
    argv = spawn.await_args.args
    assert "-N" in argv and _keepalive_options_in(argv)  # the master owns the connection


# --- a call dropped by keep-alive ---------------------------------------

async def test_a_direct_session_dropped_by_keepalive_is_uncertain_and_never_resent(monkeypatch):
    code, output, uncertain, spawn = await _run(
        monkeypatch, _proc("started\n" + KEEPALIVE_LINE, 255), _proc("again\n"),
        max_retries=3)
    assert (code, uncertain, spawn.await_count) == (255, True, 1)
    assert output == "started\n" + KEEPALIVE_LINE  # ssh's own words, kept


async def test_a_pooled_session_whose_master_ended_is_uncertain_and_says_why(monkeypatch):
    code, output, uncertain, spawn = await _run(
        monkeypatch, _proc("started\n", 255), pool=_pool(_Master(ended=True)), max_retries=3)
    assert (code, uncertain, spawn.await_count) == (255, True, 1)
    assert output == (
        "started\nssh: the connection to example.test was lost during the command; "
        "its outcome is unknown.")


@pytest.mark.parametrize("earlier", [
    "Connection reset by peer\n", "ssh: connect to host x port 22: Connection timed out\n",
])
async def test_a_lost_connection_is_never_resent_whatever_the_command_printed(
    monkeypatch, earlier
):
    # The command's own output can carry text the retry patterns match.
    direct = earlier + KEEPALIVE_LINE
    code, output, uncertain, spawn = await _run(
        monkeypatch, _proc(direct, 255), _proc("again\n"), max_retries=3)
    assert (code, output, uncertain, spawn.await_count) == (255, direct, True, 1)
    code, output, uncertain, spawn = await _run(
        monkeypatch, _proc(earlier, 255), _proc("again\n"),
        pool=_pool(_Master(ended=True)), max_retries=3)
    assert (code, uncertain, spawn.await_count) == (255, True, 1)
    assert output.startswith(earlier) and output.endswith("its outcome is unknown.")


async def test_the_acquired_master_is_the_evidence_not_a_replacement(monkeypatch):
    # The acquired master ended; a replacement may hold the socket path now.
    pool = _pool(_Master(ended=True))
    pool.is_connected = Mock(return_value=True)
    _, _, uncertain, _ = await _run(monkeypatch, _proc("", 255), pool=pool)
    assert uncertain


async def test_a_session_that_became_its_own_master_reports_by_its_text(monkeypatch):
    # ControlMaster=auto after the acquired master vanished: the session's
    # own connection prints the keep-alive line, while the (other) acquired
    # master is still running.
    code, output, uncertain, _ = await _run(
        monkeypatch, _proc(KEEPALIVE_LINE, 255), pool=_pool(_Master(ended=False)))
    assert (code, output, uncertain) == (255, KEEPALIVE_LINE, True)


async def test_no_acquired_master_means_only_the_text_counts(monkeypatch):
    pool = _pool(_Master(ended=True))
    pool.acquire = AsyncMock(return_value=False)  # no master was established
    code, output, uncertain, _ = await _run(monkeypatch, _proc("", 255), pool=pool)
    assert (code, output, uncertain) == (255, "", False)
    pool.master_process.assert_not_called()
    code, output, uncertain, _ = await _run(monkeypatch, _proc(KEEPALIVE_LINE, 255), pool=pool)
    assert (code, uncertain) == (255, True)


class _Exiting:
    """A master whose exit is not reaped yet when its session ends."""

    returncode = None

    async def wait(self):
        await asyncio.sleep(0.01)
        self.returncode = 255
        return 255


async def test_a_master_still_being_reaped_counts_as_ended(monkeypatch):
    assert await SSHConnectionPool.master_ended(_Exiting())
    _, output, uncertain, _ = await _run(monkeypatch, _proc("", 255), pool=_pool(_Exiting()))
    assert uncertain and output.endswith("its outcome is unknown.")


async def test_a_pooled_command_that_exits_255_itself_stays_a_plain_failure(monkeypatch):
    # Its master is still running after the grace: the connection was fine.
    code, output, uncertain, spawn = await _run(
        monkeypatch, _proc("my own 255\n", 255), pool=_pool(_Master(ended=False)))
    assert (code, output, uncertain, spawn.await_count) == (255, "my own 255\n", False, 1)


async def test_a_pooled_session_without_a_master_of_ours_uses_only_the_text(monkeypatch):
    code, output, uncertain, _ = await _run(monkeypatch, _proc("", 255), pool=_pool(None))
    assert (code, output, uncertain) == (255, "", False)


async def test_a_connect_stage_failure_is_never_marked(monkeypatch):
    line = "ssh: connect to host example.test port 22: Connection timed out\n"
    code, output, uncertain, _ = await _run(monkeypatch, _proc(line, 255), max_retries=1)
    assert (code, output, uncertain) == (255, line, False)


async def test_a_foreground_command_through_a_lost_master_says_why(monkeypatch):
    proc = _proc("", 255)
    reader = asyncio.StreamReader()
    reader.feed_data(b"started\n")
    reader.feed_eof()
    proc.stdout = reader
    proc.stdin = SimpleNamespace(close=Mock())
    code, output, uncertain, spawn = await _run(
        monkeypatch, proc, pool=_pool(_Master(ended=True)), end_with_channel=True,
        max_retries=3)
    assert (code, uncertain, spawn.await_count) == (255, True, 1)
    assert output.endswith("ssh: the connection to example.test was lost during the command; "
                           "its outcome is unknown.")


async def test_a_patch_dropped_by_keepalive_keeps_an_unknown_outcome(tmp_path, monkeypatch):
    # The tool timeout this replaces left an effectful call's outcome unknown.
    exe = ToolExecutor(config=ToolsConfig(), memory_path=str(tmp_path / "memory.json"))
    spawn = AsyncMock(return_value=_proc(KEEPALIVE_LINE, 255))
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)

    async def handler(_):
        code, text = await ssh.run_ssh_command(
            "example.test", "fixture", "k", "kh", max_retries=3)
        return text, code

    exe._handle_apply_patch = handler
    result = await exe.execute("apply_patch", {})
    assert not result.ok and result.uncertain_outcome
    assert spawn.await_count == 1


@pytest.mark.parametrize("line", [
    "Timeout, server example.test not responding.",
    "x\nTimeout, server 10.0.0.5 not responding.\n",
])
def test_the_keepalive_line_is_recognized(line):
    assert ssh._KEEPALIVE_TIMEOUT_LINE.search(line)


def test_text_that_only_mentions_it_is_not():
    assert not ssh._KEEPALIVE_TIMEOUT_LINE.search("echo Timeout, server x not responding. ok")
