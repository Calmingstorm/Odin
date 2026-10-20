"""A remote job start that never reached its host is a definite, retryable failure.

Only a single, direct (non-multiplexed) SSH attempt can prove non-dispatch:
a retried or mux-fallback start may already have run the job.
"""
from __future__ import annotations

import time
from types import SimpleNamespace

import pytest

from src.config.schema import RetryConfig, ToolsConfig
from src.tools import ssh as ssh_module
from src.tools.executor import ToolExecutor
from src.tools.process_manager import ProcessRegistry
from src.tools.ssh import is_connect_stage_failure

TIMED_OUT = "ssh: connect to host 192.0.2.10 port 22: Connection timed out\n"


@pytest.mark.parametrize(
    "code,output",
    [
        (255, TIMED_OUT),
        (255, "ssh: connect to host mac.example port 2222: Connection refused"),
        (255, "ssh: connect to host 10.0.0.9 port 22: No route to host\r\n"),
        (255, "ssh: connect to host 10.0.0.9 port 22: Network is unreachable"),
        (255, "ssh: Could not resolve hostname nowhere.invalid: Name or service not known"),
        (255, "ssh: connect to host h port 22: Connection refused\n"
              "ssh: connect to host h port 22: Connection timed out\n"),
    ],
)
def test_connect_stage_failures_are_recognised(code, output):
    assert is_connect_stage_failure(code, output)


@pytest.mark.parametrize(
    "code,output",
    [
        (1, TIMED_OUT),
        (255, ""),
        (255, "Connection reset by peer"),
        (255, "kex_exchange_identification: read: Connection reset by peer"),
        (255, "Connection to 10.0.0.9 closed by remote host."),
        (255, "mux_client_request_session: read from master failed: Broken pipe"),
        (255, "Control socket connect(/tmp/s): No such file or directory\n" + TIMED_OUT),
        (255, TIMED_OUT + "remote output after dispatch"),
    ],
)
def test_anything_else_is_not_proof_of_non_dispatch(code, output):
    assert not is_connect_stage_failure(code, output)


class _Lease:
    def __init__(self) -> None:
        self.target = SimpleNamespace(alias="macbook")
        self.release_count = 0

    async def run(self, factory):
        assert self.release_count == 0
        return await factory()

    def release(self) -> None:
        self.release_count += 1


async def test_unreachable_host_start_is_definite_and_skips_teardown():
    teardown_calls = []

    async def remote_exec(_target, command, _timeout):
        teardown_calls.append(command)
        return 0, "{}"

    async def remote_exec_once(_target, _command, _timeout):
        return 255, TIMED_OUT

    registry = ProcessRegistry(remote_exec=remote_exec, remote_exec_once=remote_exec_once)
    lease = _Lease()

    started = time.monotonic()
    result = await registry.start_remote(lease, "sleep 45")

    assert result.startswith("Failed to start process: could not connect to macbook;")
    assert "nothing was started, so retrying is safe" in result
    assert "outcome_unknown" not in result
    assert teardown_calls == []
    assert lease.release_count == 1
    assert registry._pending_remote_reservations == 0
    assert registry._pending_starts == 0
    assert time.monotonic() - started < 5


async def test_ambiguous_start_failure_stays_unknown_with_teardown():
    teardown_calls = []

    async def remote_exec(_target, command, _timeout):
        teardown_calls.append(command)
        return 0, "{}"

    async def remote_exec_once(_target, _command, _timeout):
        return 255, "Connection reset by peer"

    lease = _Lease()
    result = await ProcessRegistry(
        remote_exec=remote_exec, remote_exec_once=remote_exec_once,
    ).start_remote(lease, "sleep 45")

    assert "outcome_unknown=true" in result
    assert len(teardown_calls) == 1
    assert lease.release_count == 1


class _FakeProcess:
    def __init__(self, code: int, output: str) -> None:
        self.returncode = code
        self.pid = 4242
        self._output = output.encode()

    async def communicate(self):
        return self._output, b""


def _executor_with(monkeypatch, replies):
    calls = []

    async def fake_exec(*args, **_kwargs):
        calls.append(args)
        code, output = replies[min(len(calls), len(replies)) - 1]
        return _FakeProcess(code, output)

    monkeypatch.setattr(ssh_module.asyncio, "create_subprocess_exec", fake_exec)

    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr(ssh_module.asyncio, "sleep", no_sleep)
    executor = ToolExecutor(config=ToolsConfig(ssh_retry=RetryConfig(max_retries=3)))
    target = SimpleNamespace(
        alias="macbook", address="192.0.2.10", ssh_user="odin", key_path="/k",
        known_hosts_path="/kh", port=22, host_key_alias="", runtime_key="rk", local=False,
    )
    return executor, target, calls


async def test_start_transport_is_one_direct_attempt(monkeypatch):
    executor, target, calls = _executor_with(monkeypatch, [(255, TIMED_OUT)])
    acquired = []
    if executor.ssh_pool is not None:
        async def acquire(*args, **kwargs):
            acquired.append(args)
            return True
        monkeypatch.setattr(executor.ssh_pool, "acquire", acquire)

    code, output = await executor._exec_remote_target_once(target, "start the job", 30)

    assert (code, output.strip()) == (255, TIMED_OUT.strip())
    assert len(calls) == 1
    argv = calls[0]
    assert argv[0] == "ssh"
    assert "ControlMaster=no" in argv and "ControlPath=none" in argv
    assert acquired == []


async def test_other_remote_operations_keep_their_retries(monkeypatch):
    executor, target, calls = _executor_with(monkeypatch, [(255, TIMED_OUT)])
    if executor.ssh_pool is not None:
        monkeypatch.setattr(executor, "ssh_pool", None)

    await executor._exec_remote_target(target, "poll the job", 30)

    assert len(calls) == 3


async def test_uncertain_first_attempt_is_never_relabelled_by_a_later_connect_failure(
    monkeypatch,
):
    # Under the retrying transport this sequence would end on a connect
    # failure even though the first attempt may have started the job.
    executor, target, calls = _executor_with(
        monkeypatch, [(255, "Connection reset by peer"), (255, TIMED_OUT)],
    )
    teardown = []

    async def remote_exec(_target, command, _timeout):
        teardown.append(command)
        return 0, "{}"

    registry = ProcessRegistry(
        remote_exec=remote_exec, remote_exec_once=executor._exec_remote_target_once,
    )
    lease = _Lease()
    lease.target = target

    result = await registry.start_remote(lease, "sleep 45")

    assert len(calls) == 1
    assert "outcome_unknown=true" in result
    assert "safe" not in result
    assert len(teardown) == 1
