"""B3 caller parity with real, harmless local subprocess execution.

Only Discord delivery and unused external services are fakes. Admission,
governance, leases, shell selection, supervision, output capture, workflow
dispatch and scheduled execution are real. Every persistent path is temporary.
"""
from __future__ import annotations

import asyncio
import json
import re
from dataclasses import MISSING, fields
from types import SimpleNamespace

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.discord.background_task import BackgroundTask, run_background_task
from src.discord.native_tools.registry import NativeToolDispatcher
from src.discord.tool_loop import ToolLoopDeps, ToolLoopRunner
from src.permissions.host_access import HostAccessManager
from src.permissions.manager import PermissionManager
from src.scheduler.scheduler import Scheduler
from src.tools.executor import ToolExecutor
from src.tools.hosts import HostRegistry
from src.tools.process_manager import ProcessRegistry
from src.tools.registry import get_tool_definitions
from src.tools.skill_context import SkillContext
from src.tools.skill_manager import SkillManager
from tests.fakes import FakeChannel
from tests.test_native_agents_tasks import _tools
from tests.test_scheduled_events import _handlers

USER = "4242"
HOST = "shell-test-local"
ROUTES = (
    "run_command", "run_command_multi", "manage_process", "validate_action", "scheduled_workflow",
    "background_task", "delegate_task", "skill_context", "scheduled_check",
)
POSIX_PROBE = (
    'if [ -n "${BASH_VERSION-}" ]; then printf shell-probe-bash; '
    'else printf shell-probe-sh; fi'
)
BASH_PROBE = '[[ -n "${BASH_VERSION-}" ]] && printf shell-probe-bash'


@pytest.mark.parametrize("mode", ["sh", "bash"])
async def test_timeout_clean_term_handler_is_still_failed(runtime, mode):
    import shlex
    import sys

    runtime.config.command_shell = mode
    script = (
        "import signal,sys,time; "
        "signal.signal(signal.SIGTERM,lambda *_:sys.exit(0)); "
        "print('ready',flush=True); time.sleep(30)"
    )
    command = f"exec {shlex.quote(sys.executable)} -c {shlex.quote(script)}"
    code, output = await runtime.executor._exec_command(
        "127.0.0.1", command, timeout=1, use_workspace=True, use_command_shell=True,
    )
    assert code == 1 and output.raw_returncode == 0
    assert output.termination_reason == "timeout"
    # The public setting accepts a positive one-second timeout; execute uses
    # real admission, handler dispatch and owned process settlement.
    runtime.config.tool_timeouts["run_command"] = 1
    runtime.executor._command_shell_config = lambda: runtime.config.command_shell
    result = await runtime.executor.execute(
        "run_command", {"host": HOST, "command": command}, user_id=USER,
    )
    assert not result.ok
    assert "timed out" in result.output
    from src.tools.command_shell import format_command_result
    from src.tools.execution_outcome import ToolFailure
    from src.tools.post_validation import Check, _evaluate

    formatted = format_command_result(code, output)
    assert isinstance(formatted, ToolFailure)
    assert "timed out (exit 0)" in formatted
    assert _evaluate(Check(type="command", target=command), code, output)[0] == "fail"


@pytest.fixture
async def runtime(tmp_path, monkeypatch):
    # Cwd isolation also contains legacy relative diagnostic paths. Workspace
    # and data are siblings, never overlapping protected runtime data.
    monkeypatch.chdir(tmp_path)
    workspace = tmp_path / "workspace"
    workspace.mkdir(mode=0o700)
    data = tmp_path / "data"
    data.mkdir(mode=0o700)
    config = ToolsConfig(
        hosts={HOST: ToolHost(address="127.0.0.1")},
        default_host=HOST,
        local_working_dir=str(workspace),
        audit_log_path=str(data / "audit.jsonl"),
        recovery={"enabled": False},
        branch_freshness={"enabled": False},
    )
    hosts = HostRegistry(config.hosts, default_host=HOST, trust_dir=data / "trust")
    permissions = PermissionManager(
        {USER: "admin"}, overrides_path=str(data / "permissions.json"),
    )
    access = HostAccessManager(str(data / "host-access.json"), available_hosts=[HOST])
    await access.set_user(USER, [HOST], HOST)
    executor = ToolExecutor(
        config, memory_path=str(data / "memory.json"),
        permission_manager=permissions, host_access_manager=access, host_registry=hosts,
    )
    skills = SkillManager(str(data / "skills"), executor)
    channel = FakeChannel(id=555)
    state = SimpleNamespace(background_tasks={}, background_tasks_max=50)
    catalog = SimpleNamespace(merged_definitions=get_tool_definitions)
    native = NativeToolDispatcher(
        owners={}, skill_manager=skills, tool_catalog=catalog,
        prompt_builder=None, channel_state=state,
    )
    # Construct the real dispatch runner. Conversation/LLM dependencies are
    # intentionally unused: these tests dispatch commands, not model turns.
    deps = {
        field.name: None for field in fields(ToolLoopDeps)
        if field.default is MISSING and field.default_factory is MISSING
    }
    deps.update(
        get_config=lambda: SimpleNamespace(tools=config),
        get_default_system_prompt=lambda: "", get_context_compressor=lambda: None,
        tool_executor=executor, native_tools=native, tool_catalog=catalog,
        skill_manager=skills, permissions=permissions, channel_state=state,
    )
    loop = ToolLoopRunner(ToolLoopDeps(**deps))
    events = _handlers(
        tool_executor=executor, tool_loop=loop, get_channel=lambda _: channel,
    )
    agents = _tools(
        tool_executor=executor, skill_manager=skills, channel_state=state,
        tool_catalog=catalog, llm_gateway=SimpleNamespace(active_client=None),
        get_knowledge_store=lambda: None, embedder=None, audit=None,
    )
    value = SimpleNamespace(
        executor=executor, config=config, skills=skills, channel=channel,
        events=events, agents=agents, state=state, data=data,
    )
    try:
        yield value
    finally:
        for task in state.background_tasks.values():
            if task._asyncio_task and not task._asyncio_task.done():
                await task.request_cancel()
                await asyncio.gather(task._asyncio_task, return_exceptions=True)
        registry = getattr(executor, "_process_registry", None)
        if registry is not None:
            assert isinstance(registry, ProcessRegistry)
            await registry.shutdown()
        assert not hosts.has_active_leases(HOST)


async def _scheduled(runtime, action, command):
    scheduler = Scheduler(str(runtime.data / "schedules.json"))
    scheduler._callback = runtime.events._on_scheduled_task
    payload = {"host": HOST, "command": command}
    if action == "check":
        arguments = {"tool_name": "run_command", "tool_input": payload}
    else:
        arguments = {"steps": [{"tool_name": "run_command", "tool_input": payload}]}
    schedule = await scheduler.add(
        "shell caller probe", action, str(runtime.channel.id),
        requester_id=USER, run_at="2999-01-01T00:00:00Z", **arguments,
    )
    result = await scheduler.run_now(schedule["id"])
    history = await scheduler.history.query()
    assert len(history) == 1
    assert history[0]["status"] == result["status"]
    return "\n".join(runtime.channel.sent_texts), result["status"] == "success"


async def _call(runtime, route, command, expected):
    executor = runtime.executor
    if route == "run_command":
        result = await executor.execute(
            route, {"host": HOST, "command": command}, user_id=USER,
        )
        return result.output, result.ok
    if route == "run_command_multi":
        result = await executor.execute(
            route, {"hosts": [HOST], "command": command}, user_id=USER,
        )
        return result.output, result.ok
    if route == "manage_process":
        started = await executor.execute(
            route, {"action": "start", "host": HOST, "command": command}, user_id=USER,
        )
        assert started.ok, started.output
        pid = int(re.search(r"\(PID (\d+)\)", started.output)[1])
        info = executor._process_registry.output_info(pid)
        # Wait for actual exit and pipe drainage, not a timing guess. Preserve
        # the production watchers and their real kernel cleanup behavior.
        await asyncio.wait_for(asyncio.gather(info._exit_task, info._reader_task), 10)
        polled = await executor.execute(
            route, {"action": "poll", "pid": pid}, user_id=USER,
        )
        assert polled.ok, polled.output
        assert info.session_confirmed_empty
        assert info.status == ("completed" if info.exit_code == 0 else "failed")
        assert "effective_shell=" not in started.output
        # Start echoes command text, which is not execution evidence. Only
        # poll's captured stdout may satisfy the probe assertions below.
        return polled.output, info.exit_code == 0
    if route == "validate_action":
        result = await executor.execute(route, {
            "format": "json", "default_host": HOST, "checks": [{
                "type": "command", "target": command,
                "compare": "equals", "expected": expected,
            }],
        }, user_id=USER)
        assert result.ok, result.output
        report = json.loads(result.output)
        check = report["checks"][0]
        assert check["status"] in {"pass", "fail"}
        # Comparators see raw stdout, not the user-facing shell annotation.
        assert "effective_shell=" not in check["observed"]
        shell = "sh" if runtime.config.command_shell == "sh" else "bash"
        assert check["effective_shell"] == shell
        return check["observed"], report["verdict"] == "pass"
    if route in {"scheduled_workflow", "scheduled_check"}:
        return await _scheduled(
            runtime, "workflow" if route == "scheduled_workflow" else "check", command,
        )
    if route in {"background_task", "delegate_task"}:
        steps = [{"tool_name": "run_command", "tool_input": {"host": HOST, "command": command}}]
        if route == "delegate_task":
            message = SimpleNamespace(channel=runtime.channel, author=SimpleNamespace(id=int(USER)))
            started = await runtime.agents._handle_delegate_task(
                message, {"description": "shell caller probe", "steps": steps},
            )
            assert "Background task started" in started
            task = next(iter(runtime.state.background_tasks.values()))
            await asyncio.wait_for(asyncio.shield(task._asyncio_task), 10)
        else:
            task = BackgroundTask(
                task_id="shell-probe", description="shell caller probe", steps=steps,
                channel=runtime.channel, requester="shell-test", requester_id=USER,
            )
            await run_background_task(task, executor, runtime.skills)
        assert len(task.results) == 1
        assert task.results[0].status == ("ok" if task.status == "completed" else "error")
        return task.results[0].output, task.status == "completed"
    assert route == "skill_context"
    context = SkillContext(
        skill_name="shell_caller_probe", tool_executor=executor,
        memory_path=str(runtime.data / "skill-memory.json"), requester_id=USER,
    )
    output = await context.run_on_host(HOST, command)
    return output, not output.startswith("Command failed")


@pytest.mark.parametrize("route", ROUTES)
@pytest.mark.parametrize("mode", ["auto", "bash", "sh"])
@pytest.mark.parametrize("syntax", ["posix", "bash-only"])
async def test_real_command_shell_caller_parity(runtime, route, mode, syntax):
    runtime.config.command_shell = mode
    shell = "sh" if mode == "sh" else "bash"
    expected = f"shell-probe-{shell}" if syntax == "posix" else "shell-probe-bash"
    command = POSIX_PROBE if syntax == "posix" else BASH_PROBE
    output, succeeded = await _call(runtime, route, command, expected)
    assert succeeded is (syntax == "posix" or shell == "bash"), output
    if succeeded:
        assert expected in output
        assert "shell-probe-" + ("bash" if shell == "sh" else "sh") not in output
    else:
        assert "not found" in output
        assert "shell-probe-bash\n" not in output
    assert "effective_shell=" not in output


async def test_live_callable_controls_new_calls_and_preserves_completed_job_shell(runtime):
    executor = runtime.executor
    # Mirror wiring's live config callback while deliberately leaving the
    # executor snapshot at the opposite setting.
    runtime.config.command_shell = "sh"
    live = SimpleNamespace(command_shell="bash")
    executor._command_shell_config = lambda: live.command_shell
    first, ok = await _call(runtime, "manage_process", POSIX_PROBE, "shell-probe-bash")
    assert ok and "shell-probe-bash" in first
    old = next(iter(executor._process_registry._processes.values()))
    live.command_shell = "sh"
    foreground, ok = await _call(runtime, "run_command", POSIX_PROBE, "shell-probe-sh")
    assert ok and "shell-probe-sh" in foreground
    second, ok = await _call(runtime, "manage_process", POSIX_PROBE, "shell-probe-sh")
    assert ok and "shell-probe-sh" in second
    old_poll = await executor.execute(
        "manage_process", {"action": "poll", "pid": old.pid}, user_id=USER,
    )
    assert old_poll.ok
    assert "effective_shell=" not in old_poll.output
    assert "shell-probe-bash" in old_poll.output
    assert old.effective_shell == "bash"


async def test_shell_hot_reload_does_not_change_a_running_process(runtime):
    executor = runtime.executor
    live = SimpleNamespace(command_shell="bash")
    executor._command_shell_config = lambda: live.command_shell
    # stdin is the synchronization boundary. The shell cannot complete until
    # the test releases it with a real manage_process write, without sleeps.
    started = await executor.execute("manage_process", {
        "action": "start", "host": HOST,
        "command": 'IFS= read -r release; printf "shell-probe-%s" "${BASH_VERSION:+bash}"',
    }, user_id=USER)
    assert started.ok, started.output
    pid = int(re.search(r"\(PID (\d+)\)", started.output)[1])
    info = executor._process_registry.output_info(pid)
    assert info.process.returncode is None
    assert info.effective_shell == "bash"
    live.command_shell = "sh"
    output, ok = await _call(runtime, "run_command", POSIX_PROBE, "shell-probe-sh")
    assert ok and output == "shell-probe-sh"
    assert info.process.returncode is None
    polled = await executor.execute("manage_process", {"action": "poll", "pid": pid}, user_id=USER)
    assert polled.ok and "effective_shell=" not in polled.output
    written = await executor.execute("manage_process", {
        "action": "write", "pid": pid, "input_text": "release\n",
    }, user_id=USER)
    assert written.ok, written.output
    await asyncio.wait_for(asyncio.gather(info._exit_task, info._reader_task), 10)
    assert info.exit_code == 0 and info.session_confirmed_empty
    finished = await executor.execute(
        "manage_process", {"action": "poll", "pid": pid}, user_id=USER,
    )
    assert finished.ok
    assert "shell-probe-bash" in finished.output
    assert "effective_shell=" not in finished.output
