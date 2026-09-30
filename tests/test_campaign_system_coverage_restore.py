"""Real handler admission/settlement against an inert process-registry seam."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools.handlers.system import SystemTools
from src.tools.hosts import HostRegistry
from src.tools.output_authorization import host_binding


@pytest.fixture
def system(tmp_path):
    hosts = HostRegistry({"fake": ToolHost(address="127.0.0.1", user="fixture")},
                         trust_dir=tmp_path / "trust")
    target = hosts.get("fake")
    info = SimpleNamespace(pid=123, generation="fixture-generation", host_alias="fake",
                           host="127.0.0.1", owner_id="reader", origin_channel="",
                           scope_id="", host_binding=host_binding(target),
                           host_identity=target.runtime_key)
    lease = SimpleNamespace(target=target, revoked=False, release=Mock())
    registry = SimpleNamespace(output_info=Mock(return_value=info), cleanup=Mock(),
                               start=AsyncMock(return_value="Process started (PID 123)"),
                               start_remote=AsyncMock(return_value="Process started (PID 123)"),
                               terminate_generation=AsyncMock(return_value=True),
                               write=AsyncMock(return_value="Wrote 1 byte"),
                               kill=AsyncMock(return_value="Killed process 123"),
                               list_all=Mock(return_value="fixture list"))

    async def poll(_pid, **kwargs):
        assert kwargs["authorized"](info)
        assert kwargs["acquire_output_lease"]() is lease
        return "fixture output"

    registry.poll = AsyncMock(side_effect=poll)
    handler = SystemTools.__new__(SystemTools)
    handler._deps = SimpleNamespace(process_registry=lambda: registry, host_registry=lambda: hosts,
                                    current_user_id=lambda: "reader", config=lambda: ToolsConfig(),
                                    host_access=lambda: None, branch_freshness_enabled=lambda: True,
                                    output_streamer=lambda: None)
    handler._resolve_host = Mock(return_value=("127.0.0.1", "fixture", "linux"))
    handler._acquire_host = Mock(return_value=lease)
    handler._resolve_default_host = Mock(return_value="fake")
    handler._govern_command = Mock(return_value=(True, "", ""))
    handler._exec_command = AsyncMock(return_value=(1, "FAILED test_fixture"))
    handler._annotate_with_freshness = AsyncMock(
        side_effect=lambda output, *a: output + "\nannotated")
    handler._run_on_host = AsyncMock(return_value=("output", 0))
    return handler, registry, info, lease


@pytest.mark.asyncio
@pytest.mark.parametrize("action,extra,expected", [
    ("start", {}, "command is required"),
    ("start", {"command": "fixture"}, "host is required"),
    ("poll", {}, "pid is required"),
    ("write", {}, "pid is required"),
    ("kill", {}, "pid is required"),
    ("unknown", {}, "Unknown action"),
])
async def test_process_missing_arguments(system, action, extra, expected):
    handler, registry, _, _ = system
    text, code = await handler._handle_manage_process({"action": action, **extra})
    assert code == 1 and expected in text
    registry.start.assert_not_awaited()
    registry.kill.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("wait", [True, "1", -1, 121, float("nan"), float("inf")])
async def test_invalid_wait_never_reaches_registry(system, wait):
    handler, registry, _, _ = system
    text, code = await handler._handle_manage_process({"action": "poll", "pid": 123,
                                                      "wait_seconds": wait})
    assert code == 1 and "wait_seconds must be" in text
    registry.poll.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("action,extra,result,code", [
    ("poll", {}, "fixture output", 0),
    ("write", {"input_text": "fixture"}, "Wrote 1 byte", 0),
    ("write", {}, "input_text is required for write action.", 1),
    ("kill", {}, "Killed process 123", 0),
    ("list", {}, "fixture list", 0),
])
async def test_process_actions_preserve_results(system, action, extra, result, code):
    handler, _, _, lease = system
    actual = await handler._handle_manage_process({"action": action, "pid": 123, **extra})
    assert actual == (result, code)
    if action == "poll":
        lease.release.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("action,answer", [("write", "Failed to write fixture"),
                                          ("kill", "Process 123 already exited"),
                                          ("poll", "No process with PID 123")])
async def test_registry_refusals_are_not_success(system, action, answer):
    handler, registry, _, _ = system
    getattr(registry, action).side_effect = None
    getattr(registry, action).return_value = answer
    result = await handler._handle_manage_process({"action": action, "pid": 123,
                                                   "input_text": "fixture"})
    assert result == (answer, 1)


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["poll", "write", "kill"])
async def test_other_owner_cannot_touch_process(system, action):
    handler, registry, info, _ = system
    info.owner_id = "other"
    assert await handler._handle_manage_process({"action": action, "pid": 123}) == (
        "Error: process access denied.", 1)
    getattr(registry, action).assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("remote", [False, True])
async def test_start_selects_correct_registry_transport(system, remote):
    handler, registry, _, lease = system
    if remote:
        handler._resolve_host.return_value = ("example.test", "fixture", "linux")
    assert await handler._handle_manage_process({"action": "start", "host": "fake",
                                                 "command": "fixture"}) == (
        "Process started (PID 123)", 0)
    selected = registry.start_remote if remote else registry.start
    selected.assert_awaited_once()
    assert selected.call_args.kwargs["host_binding"] == host_binding(lease.target)
    lease.release.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("revoked,missing", [(True, False), (False, True)])
async def test_invalid_start_lease_prevents_dispatch(system, revoked, missing):
    handler, registry, _, lease = system
    lease.revoked = revoked
    if missing:
        handler._acquire_host.return_value = None
    text, code = await handler._handle_manage_process({"action": "start", "host": "fake",
                                                       "command": "fixture"})
    assert code == 1
    assert "disallowed host" in text if missing else "access denied" in text
    registry.start.assert_not_awaited()
    if revoked:
        lease.release.assert_called_once()


@pytest.mark.asyncio
async def test_local_start_refusal_releases_unowned_lease(system):
    handler, registry, _, lease = system
    registry.start.return_value = "Cannot start fixture"
    result = await handler._handle_manage_process({"action": "start", "host": "fake",
                                                   "command": "fixture"})
    assert result == ("Cannot start fixture", 1)
    lease.release.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("released", [True, False])
async def test_start_revocation_settles_exact_generation(system, released):
    handler, registry, info, _ = system

    async def start(*a, **kw):
        info.owner_id = "revoked"
        return "Process started (PID 123)"

    registry.start.side_effect = start
    registry.terminate_generation.return_value = released
    text, code = await handler._handle_manage_process({"action": "start", "host": "fake",
                                                       "command": "fixture"})
    assert code == 1
    assert ("was terminated" if released else "outcome_unknown=true") in text
    registry.terminate_generation.assert_awaited_once_with("fixture-generation")


@pytest.mark.asyncio
async def test_default_command_and_failed_script_are_annotated(system):
    handler, _, _, _ = system
    command, code = await handler._handle_run_command({"command": "pytest tests/fixture.py"})
    assert code == 1 and command.endswith("annotated")
    script, code = await handler._handle_run_script({"script": "pytest tests/fixture.py"})
    assert code == 1 and script.startswith("Script failed") and script.endswith("annotated")
    assert handler._exec_command.await_count == 2


@pytest.mark.asyncio
async def test_all_hosts_multi_transport_failure_is_aggregate_failure(system):
    handler, _, _, _ = system
    handler._run_on_host.side_effect = RuntimeError("fixture transport failed")
    text, code = await handler._handle_run_command_multi({"hosts": ["all"], "command": "fixture"})
    assert code == 1 and "fixture transport failed" in text


@pytest.mark.asyncio
async def test_agent_images_stay_out_of_text_telemetry():
    from src.agents.tool_cycle import execute_cycle
    from src.tools.result_validator import ToolResult
    from tests.test_campaign_evidence_review import _agent

    agent = _agent()
    image = {"type": "image", "source": {"type": "base64", "data": "fixture-image"}}
    records = []
    await execute_cycle(agent, [{"id": "fixture", "name": "fixture", "input": {}}],
                        AsyncMock(return_value=ToolResult("image evidence", image_blocks=(image,))),
                        records, timeouts={}, default_timeout=10)
    assert records[0]["ok"] and records[0]["result"] == "image evidence"
    assert "fixture-image" not in str(records)
    assert agent.messages[1]["content"][1] == image
    assert "call fixture" in agent.messages[1]["content"][0]["text"]
