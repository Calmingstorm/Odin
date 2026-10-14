"""Declared target OS reaches validation through the real tool dispatch path.

All transports are inert. Publication hooks deliberately change both OS and
address so resolving metadata separately from the executing lease is detected.
"""

from __future__ import annotations

import asyncio
import json
import shlex
from unittest.mock import AsyncMock

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools.executor import ToolExecutor
from src.tools.hosts import HostRegistry
from src.tools.post_validation import (
    _LOG_PROBE_SCRIPT,
    _PROCESS_PROBE_SCRIPT,
    Check,
    _build_command,
)


def _executor(tmp_path, *, default="mac", access=None):
    hosts = {
        "mac": ToolHost(address="192.0.2.10", ssh_user="mac-user", os="macos"),
        "linux": ToolHost(address="192.0.2.20", ssh_user="linux-user", os="linux"),
        "localhost": ToolHost(address="127.0.0.1", os="linux"),
    }
    registry = HostRegistry(hosts, default_host=default, trust_dir=tmp_path / "trust")
    executor = ToolExecutor(
        config=ToolsConfig(), host_registry=registry, host_access_manager=access,
    )
    return executor, hosts


async def _validate(executor, checks, **kwargs):
    result = await executor.execute(
        "validate_action", {"format": "json", "checks": checks, **kwargs}, user_id="operator",
    )
    assert result.ok, result.output
    return json.loads(result.output)


@pytest.mark.parametrize(
    "check,output,status",
    [
        ({"type": "port", "target": "8080"}, "OPEN\n", "pass"),
        ({"type": "port", "target": "8080"}, "CLOSED\n", "fail"),
        ({"type": "service", "target": "com.example.fixture"}, "running\n", "pass"),
        ({"type": "service", "target": "com.example.fixture"}, "waiting\n", "fail"),
        ({"type": "service", "target": "gui/501/com.example.fixture",
          "expected": ["active", "waiting"], "compare": "status_in"}, "running\n", "pass"),
        ({"type": "service", "target": "com.example.fixture"},
         "SERVICE_CHECK_ERROR launchctl exit 3\n", "error"),
        ({"type": "log_present", "target": "unit=com.example.fixture:evidence"},
         "evidence\nLOG_READ_OK\n", "pass"),
        ({"type": "log_absent", "target": "evidence"}, "LOG_READ_OK\n", "pass"),
        ({"type": "log_absent", "target": "evidence"},
         "LOG_CHECK_ERROR invalid log ndjson\n", "error"),
    ],
)
async def test_macos_probe_and_evaluation_through_execute(tmp_path, check, output, status):
    executor, _ = _executor(tmp_path)
    transport = AsyncMock(return_value=(0, output))
    executor._exec_command = transport

    report = await _validate(executor, [dict(check, host="mac")])

    command = transport.await_args.args[1]
    assert command == _build_command(Check(**check), "macos")
    assert not any(binary in command for binary in ("systemctl", "journalctl", "timeout "))
    assert report["checks"][0]["status"] == status
    target = transport.await_args.kwargs["target"]
    assert target.os == "macos"
    assert transport.await_args.args[::2] == (target.address, target.ssh_user)
    assert not executor.host_registry.has_active_leases("mac")


async def test_mixed_hosts_default_overrides_and_linux_evaluation(tmp_path):
    executor, _ = _executor(tmp_path)
    seen = []

    async def transport(address, command, ssh_user, **kwargs):
        target = kwargs["target"]
        assert executor.host_registry.has_active_leases(target.alias)
        seen.append((target.alias, command, kwargs))
        return 0, "running\n" if target.os == "macos" else "active\n"

    executor._exec_command = transport
    report = await _validate(executor, [
        {"type": "service", "target": "fixture"},
        {"type": "service", "target": "fixture", "host": "linux"},
    ])
    assert report["verdict"] == "pass"
    assert [check["observed"] for check in report["checks"]] == ["running", "active"]
    assert seen[0][0] == "mac" and "launchctl print" in seen[0][1]
    assert seen[1][0:2] == ("linux", "systemctl is-active fixture 2>/dev/null || true")
    assert all(not call[2]["use_workspace"] and not call[2]["use_command_shell"] for call in seen)

    executor._exec_command = AsyncMock(return_value=(0, "running\n"))
    linux = await _validate(executor, [{"type": "service", "target": "fixture"}],
                            default_host="linux")
    assert linux["checks"][0]["status"] == "fail"
    assert linux["checks"][0]["error"] == "expected state 'active', got 'running'"


@pytest.mark.parametrize("default", ["", "linux"])
async def test_localhost_fallback_and_explicit_default_are_linux(tmp_path, default):
    executor, _ = _executor(tmp_path, default=default)
    executor._exec_command = AsyncMock(return_value=(0, "OPEN\n"))
    report = await _validate(executor, [{"type": "port", "target": "8080"}])
    assert report["verdict"] == "pass"
    assert report["checks"][0]["host"] == (default or "localhost")
    assert executor._exec_command.await_args.args[1] == (
        "timeout 20 bash -c 'cat < /dev/null > \"/dev/tcp/$1/$2\"' _ "
        "127.0.0.1 8080 && echo OPEN || echo CLOSED"
    )


@pytest.mark.parametrize(
    "check,command,output,status,error",
    [
        ({"type": "http", "target": "https://example.test"},
         "curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -L "
         "https://example.test || echo FAILED_$?", "200", "pass", ""),
        ({"type": "service", "target": "fixture"},
         "systemctl is-active fixture 2>/dev/null || true", "active\n", "pass", ""),
        ({"type": "service", "target": "fixture"},
         "systemctl is-active fixture 2>/dev/null || true", "running\n", "fail",
         "expected state 'active', got 'running'"),
        ({"type": "log_present", "target": "unit=fixture:evidence"},
         f"sh -c {shlex.quote(_LOG_PROBE_SCRIPT)} odin-log-check fixture 120 evidence",
         "evidence\nLOG_READ_OK\n", "pass", ""),
        ({"type": "log_absent", "target": "evidence"},
         f"sh -c {shlex.quote(_LOG_PROBE_SCRIPT)} odin-log-check '' 120 evidence",
         "LOG_READ_OK\n", "pass", ""),
        ({"type": "process", "target": "fixture"},
         f"sh -c {shlex.quote(_PROCESS_PROBE_SCRIPT)} odin-process-check fixture",
         "PRESENT\n", "pass", ""),
        ({"type": "command", "target": "printf fixture", "compare": "equals",
          "expected": "fixture"}, "printf fixture", "fixture", "pass", ""),
        ({"type": "command", "target": "printf fixture", "compare": "regex_match",
          "expected": "^fixture$"}, "printf fixture", "fixture", "pass", ""),
    ],
)
async def test_linux_probe_bytes_and_results_through_execute(
    tmp_path, check, command, output, status, error,
):
    executor, _ = _executor(tmp_path)
    executor._exec_command = AsyncMock(return_value=(0, output))
    report = await _validate(executor, [dict(check, host="linux")])
    assert executor._exec_command.await_args.args == ("192.0.2.20", command, "linux-user")
    kwargs = executor._exec_command.await_args.kwargs
    assert kwargs["timeout"] == 20
    assert kwargs["use_workspace"] is (check["type"] == "command")
    assert kwargs["use_command_shell"] is (check["type"] == "command")
    assert report["checks"][0]["status"] == status
    assert report["checks"][0]["error"] == error
    assert not executor.host_registry.has_active_leases("linux")


async def test_publication_during_governor_cannot_change_executing_target(tmp_path):
    executor, hosts = _executor(tmp_path)
    old = executor.host_registry.get("mac", targetable_only=True)
    executor.command_governor = object()
    seen = []

    def govern(command, alias):
        assert alias == "mac"
        seen.append(command)
        # Metadata selection and execution must already share the old lease.
        hosts["mac"] = ToolHost(address="192.0.2.30", ssh_user="new-user", os="linux")
        executor.host_registry.publish(hosts)
        return True, "", ""

    executor._govern_command = govern
    executor._exec_command = AsyncMock(return_value=(0, "running\n"))
    report = await _validate(executor, [{"type": "service", "target": "fixture"}])
    assert executor._exec_command.await_args.kwargs["target"] is old
    assert executor._exec_command.await_args.args == (old.address, seen[0], old.ssh_user)
    assert report["verdict"] == "pass"
    assert not executor.host_registry.has_active_leases("mac")


async def test_evaluation_retains_os_when_target_changes_during_transport(tmp_path):
    executor, hosts = _executor(tmp_path)

    async def transport(*args, **kwargs):
        assert kwargs["target"].os == "macos"
        hosts["mac"] = ToolHost(address="192.0.2.30", os="linux")
        executor.host_registry.publish(hosts)
        return 0, "running\n"

    executor._exec_command = transport
    report = await _validate(executor, [{"type": "service", "target": "fixture"}])
    assert report["verdict"] == "pass"
    assert not executor.host_registry.has_active_leases("mac")


async def test_concurrent_checks_on_same_alias_keep_separate_generations(tmp_path):
    executor, hosts = _executor(tmp_path)
    acquire = executor._acquire_host
    acquisitions = []
    entered = []
    both_entered = asyncio.Event()

    def acquire_and_publish(alias):
        lease = acquire(alias)
        acquisitions.append(lease.target)
        if len(acquisitions) == 1:
            hosts["mac"] = ToolHost(address="192.0.2.30", ssh_user="new-user", os="linux")
            executor.host_registry.publish(hosts)
        return lease

    async def transport(address, command, ssh_user, **kwargs):
        target = kwargs["target"]
        assert (address, ssh_user) == (target.address, target.ssh_user)
        assert command == _build_command(Check(type="service", target="fixture"), target.os)
        entered.append(target)
        if len(entered) == 2:
            both_entered.set()
        await asyncio.wait_for(both_entered.wait(), timeout=5)
        return 0, "running" if target.os == "macos" else "active"

    executor._acquire_host = acquire_and_publish
    executor._exec_command = transport
    report = await _validate(executor, [
        {"type": "service", "target": "fixture"},
        {"type": "service", "target": "fixture"},
    ])
    assert len(acquisitions) == 2
    assert [target.os for target in acquisitions] == ["macos", "linux"]
    assert acquisitions[0].generation != acquisitions[1].generation
    assert entered == acquisitions
    assert report["verdict"] == "pass"
    assert [check["observed"] for check in report["checks"]] == ["running", "active"]
    assert not executor.host_registry.has_active_leases("mac")


async def test_disallowed_host_is_not_bound_or_dispatched(tmp_path):
    class Access:
        def is_host_allowed(self, _user, _alias):
            return False

    executor, _ = _executor(tmp_path, access=Access())
    executor._exec_command = AsyncMock()
    report = await _validate(executor, [{"type": "service", "target": "fixture", "host": "mac"}],
                             default_host="mac")
    assert report["checks"][0]["status"] == "error"
    assert "unknown host alias" in report["checks"][0]["error"]
    executor._exec_command.assert_not_awaited()
    assert not executor.host_registry.has_active_leases("mac")


@pytest.mark.parametrize(
    "failure", ["unknown", "build", "governor", "governor-error", "transport", "timeout"],
)
async def test_check_errors_release_lease_and_do_not_dispatch_unauthorized_work(tmp_path, failure):
    executor, _ = _executor(tmp_path)
    check = {"type": "service", "target": "fixture", "host": "mac"}
    executor._exec_command = AsyncMock(return_value=(0, "running\n"))
    if failure == "unknown":
        check["host"] = "absent"
    elif failure == "build":
        check["target"] = "gui/invalid"
    elif failure == "governor":
        executor.command_governor = object()
        executor._govern_command = lambda *_: (False, "fixture denied", "")
    elif failure == "governor-error":
        executor.command_governor = object()

        def govern(*_args):
            raise RuntimeError("fixture governor unavailable")

        executor._govern_command = govern
    elif failure == "transport":
        executor._exec_command.side_effect = RuntimeError("fixture transport error")
    elif failure == "timeout":
        executor._exec_command.side_effect = TimeoutError
    report = await _validate(executor, [check])
    assert report["checks"][0]["status"] == "error"
    assert not executor.host_registry.has_active_leases("mac")
    assert executor._exec_command.await_count == (failure in {"transport", "timeout"})


@pytest.mark.parametrize("stop", ["cancel", "revoke"])
async def test_cancellation_or_force_revoke_releases_validation_lease(tmp_path, stop):
    executor, _ = _executor(tmp_path)
    entered = asyncio.Event()
    cancelled = asyncio.Event()

    async def transport(*_args, **_kwargs):
        entered.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    executor._exec_command = transport
    task = asyncio.create_task(_validate(executor, [{"type": "service", "target": "fixture"}]))
    await asyncio.wait_for(entered.wait(), timeout=5)
    assert executor.host_registry.has_active_leases("mac")
    if stop == "cancel":
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    else:
        assert executor.host_registry.force_revoke("mac") == 1
        report = await asyncio.wait_for(task, timeout=5)
        assert report["checks"][0]["status"] == "error"
        assert "outcome_unknown=true" in report["checks"][0]["error"]
    assert cancelled.is_set()
    assert not executor.host_registry.has_active_leases("mac")


async def test_force_revoke_during_admission_never_dispatches_probe(tmp_path):
    executor, _ = _executor(tmp_path)
    executor.command_governor = object()

    def govern(_command, _alias):
        assert executor.host_registry.force_revoke("mac") == 1
        return True, "", ""

    executor._govern_command = govern
    executor._exec_command = AsyncMock()
    report = await _validate(executor, [{"type": "service", "target": "fixture"}])
    assert report["checks"][0]["status"] == "error"
    assert "outcome_unknown=true" in report["checks"][0]["error"]
    executor._exec_command.assert_not_awaited()
    assert not executor.host_registry.has_active_leases("mac")


async def test_bundle_deadline_cancels_transport_before_releasing_lease(tmp_path):
    executor, _ = _executor(tmp_path)
    cancelled = asyncio.Event()

    async def transport(*_args, **_kwargs):
        try:
            await asyncio.Event().wait()
        finally:
            assert executor.host_registry.has_active_leases("mac")
            cancelled.set()

    executor._exec_command = transport
    report = await _validate(executor, [
        {"type": "service", "target": "fixture", "timeout_seconds": 1},
    ])
    assert report["checks"][0]["status"] == "error"
    assert report["checks"][0]["error"] == "timed out after 1s"
    assert cancelled.is_set()
    assert not executor.host_registry.has_active_leases("mac")
