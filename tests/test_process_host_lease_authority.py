"""Host-lease authority over managed processes: H2, H3 and L1.

Three related defects, all about a job outliving the authority that started it:

* **H2** -- a force-revoked host left LOCAL jobs executing. Only remote records
  were killed, while local ones merely had their output expired, so the effect
  survived the revoke and the caller lost even the ability to watch it.
* **H3** -- a post-start authorization recheck that denied the caller returned an
  error while the process it had just created kept running.
* **L1** -- stdin writes were governed without the bound host, so per-host strict
  overrides did not apply to interactive input the way they do to start/kill.

These tests drive REAL local processes through a REAL HostRegistry, disposed of
inside the test. Nothing here is destructive: jobs are sleeps and blocking
reads, and the assertions are about kill/lease bookkeeping, not about data.
"""
from __future__ import annotations

import os
import shlex
import sys
import time
from types import SimpleNamespace

import pytest
import pytest_asyncio

from src.config.schema import ToolHost
from src.tools.handlers.system import SystemTools
from src.tools.hosts import HostRegistry
from src.tools.output_authorization import request_host_authorizer
from src.tools.process_manager import ProcessInfo, ProcessRegistry
from src.tools.risk_classifier import CommandGovernor

SLEEP_JOB = shlex.join([sys.executable, "-c", "import time; time.sleep(300)"])
BLOCKING_READ = "cat >> /dev/null"


@pytest.fixture(autouse=True)
def no_background(monkeypatch):
    """No detached lifetime/expiry tasks; every job here settles in-test."""
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())


@pytest.fixture
def hosts(tmp_path):
    return HostRegistry(
        {"prod": ToolHost(address="127.0.0.1"), "dev": ToolHost(address="127.0.0.1")},
        trust_dir=tmp_path / "trust",
    )


@pytest_asyncio.fixture
async def registry(tmp_path):
    reg = ProcessRegistry(workspace=str(tmp_path), retention_dir=tmp_path / "evidence")
    reg._schedule_output_expiry = lambda info: None  # no 24-hour timers in tests
    try:
        yield reg
    finally:
        for info in list(reg._processes.values()):
            info.status = "killed"
        await reg.shutdown()


def make_handler(hosts, registry, governor=None, state=None):
    """A SystemTools handler wired to the real registries, without an executor."""
    state = state if state is not None else {"allowed": True, "user": "owner"}
    handler = SystemTools.__new__(SystemTools)
    handler._deps = SimpleNamespace(
        config=lambda: SimpleNamespace(),
        current_user_id=lambda: state["user"],
        host_registry=lambda: hosts,
    )
    handler._process_registry = lambda: registry
    handler._resolve_host = lambda alias: (
        hosts.get(alias, targetable_only=True).legacy_tuple()
        if hosts.get(alias, targetable_only=True) else None
    )
    handler._acquire_host = lambda alias: hosts.acquire(alias)

    def govern(command, host=None):
        if governor is None:
            return True, "", ""
        check = governor.check(command, host=host)
        return (check.allowed, check.denial_message(), "")

    handler._govern_command = govern
    return handler, state


async def start_local(registry, hosts, *, alias="prod", command=SLEEP_JOB, owner="owner"):
    """Start a real local job holding a real generation lease, as the handler does."""
    lease = hosts.acquire(alias)
    assert lease is not None, f"host {alias!r} must be targetable"
    result = await registry.start(
        "127.0.0.1", command, owner_id=owner, host_alias=alias, host_lease=lease,
    )
    assert "Process started" in result, result
    pid = int(result.split("PID ")[1].split(")")[0])
    return pid, registry._processes[pid], lease


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def pid_for_alias(registry, alias):
    return next(
        pid for pid, info in registry._processes.items()
        if (info.host_alias or info.host) == alias
    )


# ---------------------------------------------------------------------------
# H2 -- force-revoke must terminate local jobs, not just expire their output
# ---------------------------------------------------------------------------


class TestForceRevokeTerminatesLocalJobs:
    async def test_running_local_job_is_terminated_and_the_kill_is_proven(
        self, hosts, registry
    ):
        pid, info, _lease = await start_local(registry, hosts)
        assert pid_alive(pid)

        summary = await registry.force_revoke_host("prod")

        assert summary == {"attempted": 1, "killed": 1, "unknown": 0}
        assert not pid_alive(pid), "a revoked host must not leave a local job running"
        assert info.status == "killed"
        assert info.process is not None and info.process.returncode is not None

    async def test_a_local_job_is_not_merely_output_expired(self, hosts, registry):
        """The original H2 symptom: the record was expired, the process lived on."""
        pid, info, _lease = await start_local(registry, hosts)

        await registry.force_revoke_host("prod")

        assert info.output_revoked is True
        assert not pid_alive(pid), "expiring output is not terminating the effect"

    async def test_unprovable_termination_is_reported_unknown_not_killed(
        self, hosts, registry, monkeypatch
    ):
        async def unproven(_info, timeout=8.0):
            return False

        monkeypatch.setattr(registry, "_kill_group_until_gone", unproven)
        _pid, info, _lease = await start_local(registry, hosts)

        summary = await registry.force_revoke_host("prod")

        assert summary == {"attempted": 1, "killed": 0, "unknown": 1}
        assert info.status != "killed", "unproven termination must not claim a kill"

    async def test_only_running_jobs_bound_to_the_alias_are_attempted(
        self, hosts, registry
    ):
        await start_local(registry, hosts, alias="dev")
        running_pid, _running, _l = await start_local(registry, hosts)
        done_pid, done, _l2 = await start_local(registry, hosts, command="true")
        await registry.poll(done_pid, wait_seconds=10)
        assert done.status != "running"

        summary = await registry.force_revoke_host("prod")

        assert summary["attempted"] == 1, "only the running prod job may be attempted"
        assert summary["killed"] == 1
        assert not pid_alive(running_pid)
        assert registry._processes[pid_for_alias(registry, "dev")].status == "running"

    async def test_host_alias_is_matched_for_local_records(self, hosts, registry):
        """Local records carry the alias on host_alias, not on host."""
        _pid, info, _lease = await start_local(registry, hosts)
        assert info.host == "127.0.0.1" and info.host_alias == "prod"

        assert (await registry.force_revoke_host("prod"))["attempted"] == 1
        # The address must NOT be treated as an alias, or a revoke of
        # "127.0.0.1" would kill every local job on every alias.
        assert (await registry.force_revoke_host("127.0.0.1"))["attempted"] == 0

    async def test_restored_evidence_is_expired_but_never_terminated(
        self, hosts, registry, monkeypatch
    ):
        async def must_not_run(_info, timeout=8.0):
            raise AssertionError("restored evidence is read-only evidence")

        monkeypatch.setattr(registry, "_kill_group_until_gone", must_not_run)
        info = ProcessInfo(
            pid=987654, command="(retained output)", host="127.0.0.1",
            start_time=time.time(), status="running", restored=True,
            host_alias="prod", output_tail=b"fixture\n",
            total_output_bytes=8, retained_bytes=8,
        )
        registry._processes[987654] = info

        summary = await registry.force_revoke_host("prod")

        assert summary == {"attempted": 0, "killed": 0, "unknown": 0}
        assert info.output_revoked is True, "evidence still follows the revoked host"

    async def test_output_is_revoked_for_local_records_on_the_alias(
        self, hosts, registry
    ):
        _pid, info, _lease = await start_local(registry, hosts)
        assert info.output_revoked is False

        await registry.force_revoke_host("prod")

        assert info.output_revoked is True
        assert info.output_tail == b""


# ---------------------------------------------------------------------------
# H2 -- the generation lease: held while running, released on every exit
# ---------------------------------------------------------------------------


class TestGenerationLeaseLifecycle:
    async def test_start_holds_the_lease_for_the_jobs_whole_life(
        self, hosts, registry
    ):
        pid, info, lease = await start_local(registry, hosts)

        # The lease is what lets a revoke see this generation at all. A start
        # that dropped it would leave the alias with no live reference.
        assert info.host_lease is lease
        assert hosts.has_active_leases("prod")
        assert pid_alive(pid)

    async def test_expiring_output_never_releases_a_running_jobs_lease(
        self, hosts, registry
    ):
        _pid, info, lease = await start_local(registry, hosts)

        registry._expire_output(info)

        assert info.output_revoked is True
        assert info.host_lease is lease, (
            "a running job must keep the reference that makes it revocable"
        )
        assert hosts.has_active_leases("prod")

    async def test_settlement_releases_the_lease(self, hosts, registry):
        pid, info, lease = await start_local(registry, hosts, command="true")
        assert info.host_lease is lease

        await registry.poll(pid, wait_seconds=10)

        assert info.status == "completed"
        assert info.host_lease is None
        assert not hosts.has_active_leases("prod")
        assert sum(hosts._lease_counts.values()) == 0

    async def test_kill_releases_the_lease(self, hosts, registry):
        pid, info, lease = await start_local(registry, hosts)

        assert "killed" in await registry.kill(pid)

        assert info.host_lease is None
        assert lease._released
        assert sum(hosts._lease_counts.values()) == 0

    async def test_force_revoke_releases_the_lease_it_terminated(
        self, hosts, registry
    ):
        _pid, info, lease = await start_local(registry, hosts)

        await registry.force_revoke_host("prod")

        assert lease._released
        assert info.host_lease is None
        assert sum(hosts._lease_counts.values()) == 0

    async def test_shutdown_releases_every_lease(self, hosts, registry):
        _pid, _info, first = await start_local(registry, hosts)
        _pid2, _info2, second = await start_local(registry, hosts, alias="dev")

        await registry.shutdown()

        assert first._released and second._released
        assert sum(hosts._lease_counts.values()) == 0

    async def test_cleanup_releases_a_lease_left_on_an_aged_record(
        self, hosts, registry
    ):
        # A terminal, aged record with no live lifecycle tasks is what cleanup
        # sweeps. The lease is the belt-and-braces case: nothing else would
        # release it if a settlement path had ever been missed.
        lease = hosts.acquire("prod")
        info = ProcessInfo(
            pid=31337, command="(fixture)", host="127.0.0.1", start_time=time.time(),
            status="completed", exit_code=0, finished_at=time.time() - 90000,
            host_alias="prod", host_lease=lease,
        )
        registry._processes[31337] = info

        assert registry.cleanup() == 1

        assert lease._released
        assert sum(hosts._lease_counts.values()) == 0

    async def test_refused_start_releases_the_reference(self, hosts, registry, monkeypatch):
        from src.tools import process_manager as pm

        lease = hosts.acquire("prod")
        monkeypatch.setattr(pm, "MAX_CONCURRENT", 0)

        result = await registry.start(
            "127.0.0.1", SLEEP_JOB, host_alias="prod", host_lease=lease,
        )

        assert "Cannot start" in result
        assert lease._released, "a start that never spawned must not keep the reference"
        assert sum(hosts._lease_counts.values()) == 0
        assert not registry._processes

    async def test_spawn_failure_releases_the_reference(
        self, hosts, registry, monkeypatch
    ):
        lease = hosts.acquire("prod")

        async def broken(*_args, **_kwargs):
            raise OSError("spawn refused")

        monkeypatch.setattr(
            "src.tools.local_supervisor.create_supervised_shell", broken
        )

        result = await registry.start(
            "127.0.0.1", SLEEP_JOB, host_alias="prod", host_lease=lease,
        )

        assert "Failed to start" in result
        assert lease._released
        assert sum(hosts._lease_counts.values()) == 0

    async def test_unusable_workspace_releases_the_reference(
        self, hosts, registry, tmp_path, monkeypatch
    ):
        from src.tools import process_manager as pm
        from src.tools.workspace import WorkspaceError

        lease = hosts.acquire("prod")

        def unusable():
            raise WorkspaceError("workspace is not a directory")

        monkeypatch.setattr(registry, "_resolve_workspace", unusable)

        result = await registry.start(
            "127.0.0.1", SLEEP_JOB, host_alias="prod", host_lease=lease,
        )

        assert "cannot start background process" in result
        assert lease._released
        assert sum(hosts._lease_counts.values()) == 0
        assert pm  # imported for parity with the other refusal paths

    async def test_handler_holds_the_lease_from_start_to_settlement(
        self, hosts, registry
    ):
        handler, _state = make_handler(hosts, registry)

        result = await handler._handle_manage_process(
            {"action": "start", "host": "prod", "command": SLEEP_JOB}
        )

        assert result[1] == 0, result
        pid = int(result[0].split("PID ")[1].split(")")[0])
        info = registry._processes[pid]
        assert info.host_lease is not None
        assert info.host_alias == "prod"
        assert hosts.has_active_leases("prod")

        assert "killed" in await registry.kill(pid)
        assert sum(hosts._lease_counts.values()) == 0


# ---------------------------------------------------------------------------
# H3 -- a post-start denial settles the process it denied
# ---------------------------------------------------------------------------


class TestPostStartDenialIsATransaction:
    @staticmethod
    def deny_after_start(registry, state, monkeypatch):
        """Flip the grants while dispatch is in flight, so the recheck fails."""
        real_start = registry.start

        async def start_then_revoke_grants(*args, **kwargs):
            result = await real_start(*args, **kwargs)
            state["allowed"] = False
            return result

        monkeypatch.setattr(registry, "start", start_then_revoke_grants)
        return request_host_authorizer.set(lambda alias: state["allowed"])

    async def test_denial_terminates_the_generation_it_denied(
        self, hosts, registry, monkeypatch
    ):
        handler, state = make_handler(hosts, registry)
        token = self.deny_after_start(registry, state, monkeypatch)
        try:
            output, code = await handler._handle_manage_process(
                {"action": "start", "host": "prod", "command": SLEEP_JOB}
            )
        finally:
            request_host_authorizer.reset(token)

        assert code == 1
        assert "access denied after start" in output
        assert "was terminated" in output
        assert "outcome_unknown" not in output
        info = next(iter(registry._processes.values()))
        assert not pid_alive(info.pid), "a denied caller must not leave a live process"
        assert info.status == "killed"

    async def test_unprovable_termination_is_reported_as_an_unknown_outcome(
        self, hosts, registry, monkeypatch
    ):
        handler, state = make_handler(hosts, registry)

        async def unproven(_info, timeout=8.0):
            return False

        token = self.deny_after_start(registry, state, monkeypatch)
        monkeypatch.setattr(registry, "_kill_group_until_gone", unproven)
        try:
            output, code = await handler._handle_manage_process(
                {"action": "start", "host": "prod", "command": SLEEP_JOB}
            )
        finally:
            request_host_authorizer.reset(token)

        assert code == 1
        assert "access denied after start" in output
        assert "outcome_unknown=true" in output
        assert "was terminated" not in output

    async def test_denial_leaves_no_host_reference_held(
        self, hosts, registry, monkeypatch
    ):
        handler, state = make_handler(hosts, registry)
        token = self.deny_after_start(registry, state, monkeypatch)
        try:
            await handler._handle_manage_process(
                {"action": "start", "host": "prod", "command": SLEEP_JOB}
            )
        finally:
            request_host_authorizer.reset(token)

        assert sum(hosts._lease_counts.values()) == 0
        assert next(iter(registry._processes.values())).host_lease is None

    async def test_denied_start_consumes_no_host_reference(self, hosts, registry):
        handler, _state = make_handler(hosts, registry)
        token = request_host_authorizer.set(lambda alias: False)
        try:
            output, code = await handler._handle_manage_process(
                {"action": "start", "host": "prod", "command": SLEEP_JOB}
            )
        finally:
            request_host_authorizer.reset(token)

        assert code == 1 and "access denied" in output
        assert sum(hosts._lease_counts.values()) == 0
        assert not registry._processes

    async def test_generation_lookup_is_exact_not_positional(
        self, hosts, registry, monkeypatch
    ):
        """Termination addresses the generation, never a recycled handle."""
        _pid, other, other_lease = await start_local(registry, hosts)

        assert await registry.terminate_generation("f" * 32) is True
        assert other.status == "running", (
            "an unknown generation must not touch a live local job"
        )
        assert other_lease is other.host_lease


# ---------------------------------------------------------------------------
# L1 -- stdin writes are governed against the process's bound host
# ---------------------------------------------------------------------------


class TestWriteGovernanceUsesTheBoundHost:
    @pytest.fixture
    def governor(self):
        return CommandGovernor(host_overrides={"prod": "strict"})

    async def test_strict_host_blocks_high_risk_stdin(self, hosts, registry, governor):
        seen: list[str | None] = []
        handler, _state = make_handler(hosts, registry, governor)
        real_govern = handler._govern_command

        def govern(command, host=None):
            seen.append(host)
            return real_govern(command, host)

        handler._govern_command = govern
        pid, _info, _lease = await start_local(
            registry, hosts, alias="prod", command=BLOCKING_READ
        )

        output, code = await handler._handle_manage_process(
            {"action": "write", "pid": pid, "input_text": "systemctl restart nginx"}
        )

        assert code == 1
        assert "Blocked" in output and "strict" in output
        assert seen == ["prod"]

    async def test_non_strict_host_allows_the_same_stdin(self, hosts, registry, governor):
        handler, _state = make_handler(hosts, registry, governor)
        pid, _info, _lease = await start_local(
            registry, hosts, alias="dev", command=BLOCKING_READ
        )

        output, code = await handler._handle_manage_process(
            {"action": "write", "pid": pid, "input_text": "systemctl restart nginx"}
        )

        assert code == 0, output
        assert output.startswith("Wrote")

    async def test_request_cannot_choose_the_policy_host(self, hosts, registry, governor):
        """The record's bound host decides, never a field the caller supplies."""
        seen: list[str | None] = []
        handler, _state = make_handler(hosts, registry, governor)
        real_govern = handler._govern_command

        def govern(command, host=None):
            seen.append(host)
            return real_govern(command, host)

        handler._govern_command = govern
        pid, _info, _lease = await start_local(
            registry, hosts, alias="prod", command=BLOCKING_READ
        )

        output, code = await handler._handle_manage_process(
            {"action": "write", "pid": pid, "input_text": "systemctl restart nginx",
             "host": "dev"}
        )

        assert seen == ["prod"], "stdin policy follows the process, not the request"
        assert code == 1 and "Blocked" in output

    async def test_alias_without_an_override_still_applies_global_policy(
        self, hosts, registry, governor
    ):
        """A non-strict alias must not weaken the GLOBAL rules for stdin."""
        seen: list[str | None] = []
        handler, _state = make_handler(hosts, registry, governor)
        real_govern = handler._govern_command

        def govern(command, host=None):
            seen.append(host)
            return real_govern(command, host)

        handler._govern_command = govern
        pid, _info, _lease = await start_local(
            registry, hosts, alias="dev", command=BLOCKING_READ
        )

        output, code = await handler._handle_manage_process(
            {"action": "write", "pid": pid, "input_text": "rm -rf /"}
        )

        assert seen == ["dev"], "the bound alias is still what is judged"
        assert code == 1
        assert "Blocked" in output, output

    async def test_denied_stdin_sends_no_bytes(self, hosts, registry, governor):
        handler, _state = make_handler(hosts, registry, governor)
        pid, info, _lease = await start_local(
            registry, hosts, alias="prod", command=BLOCKING_READ
        )

        output, code = await handler._handle_manage_process(
            {"action": "write", "pid": pid, "input_text": "rm -rf /"}
        )

        assert code == 1
        assert "rm -rf" not in await registry.poll(pid)
        assert info.status == "running"
