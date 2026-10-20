# ruff: noqa: F811 - imported pytest fixtures.
"""Lease ownership across an agent's start, through the real handler and HostRegistry.

The registry owns the host lease from the moment a start is requested: every
refusal releases it, and a registered execution keeps it until its cleanup is
proven. The handler never infers ownership from a reply's wording. Inert
supervised shells (fixtures from test_process_host_lease_authority): no command
runs and no native process is signalled.
"""
from __future__ import annotations

import asyncio

from src.agents.execution_context import JobOrigin, bound_job_origin
from tests.test_process_host_lease_authority import (  # noqa: F401 (pytest fixtures)
    SLEEP_JOB,
    hosts,
    inert_transports,
    make_handler,
    no_background,
    registry,
)

AGENT = JobOrigin("agent-a", "root-a")
START = {"action": "start", "host": "prod", "command": SLEEP_JOB}


async def _start_as_agent(handler):
    with bound_job_origin(AGENT):
        return await handler._handle_manage_process(START)


def _delay_spawns(monkeypatch):
    from src.tools import local_supervisor

    actual = local_supervisor.create_supervised_shell
    entered, resume = asyncio.Event(), asyncio.Event()

    async def delayed(*args, **kwargs):
        entered.set()
        await resume.wait()
        return await actual(*args, **kwargs)

    monkeypatch.setattr(local_supervisor, "create_supervised_shell", delayed)
    return entered, resume


async def test_unverified_cleanup_of_a_fenced_start_keeps_the_hosts_reference(
    hosts, registry, monkeypatch
):
    entered, resume = _delay_spawns(monkeypatch)

    async def unverified(_info):
        return False

    monkeypatch.setattr(registry, "_terminate_bound_host_job", unverified)
    handler, _state = make_handler(hosts, registry)

    starting = asyncio.create_task(_start_as_agent(handler))
    await entered.wait()
    cleanup = registry.reap_agent_jobs({"agent-a"})
    resume.set()
    output, code = await starting

    assert code == 1 and "outcome_unknown=true" in output
    info = next(iter(registry._processes.values()))
    assert info.status == "unknown"
    assert info.host_lease is not None and not info.host_lease._released
    assert hosts.has_active_leases("prod")
    assert await cleanup.wait(timeout=5) == {"jobs": {}, "starts": ["unknown"]}


async def test_proven_cleanup_of_a_fenced_start_releases_the_reference(
    hosts, registry, monkeypatch
):
    entered, resume = _delay_spawns(monkeypatch)
    handler, _state = make_handler(hosts, registry)

    starting = asyncio.create_task(_start_as_agent(handler))
    await entered.wait()
    cleanup = registry.reap_agent_jobs({"agent-a"})
    resume.set()
    output, code = await starting

    assert code == 1 and output.endswith("process terminated.")
    assert await cleanup.wait(timeout=5) == {"jobs": {}, "starts": ["stopped"]}
    assert sum(hosts._lease_counts.values()) == 0


async def test_an_agents_running_job_is_stopped_with_its_reference(hosts, registry):
    handler, _state = make_handler(hosts, registry)
    output, code = await _start_as_agent(handler)
    assert code == 0, output
    pid = int(output.split("PID ")[1].split(")")[0])

    cleanup = registry.reap_agent_jobs({"agent-a"})

    assert await cleanup.wait(timeout=5) == {"jobs": {pid: "stopped"}, "starts": []}
    assert sum(hosts._lease_counts.values()) == 0


async def test_a_refusal_the_handler_cannot_see_still_releases_the_lease(hosts, registry):
    lease = hosts.acquire("prod")

    result = await registry.start("192.0.2.10", SLEEP_JOB, host_alias="prod", host_lease=lease)

    assert result.startswith("Error: remote process start requires")
    assert lease._released
    assert sum(hosts._lease_counts.values()) == 0
