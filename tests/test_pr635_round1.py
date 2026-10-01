"""Harmless foreground lifetime and legacy wire-contract regression probes."""
from __future__ import annotations

import asyncio
import shlex
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from src.tools import local_supervisor
from src.tools.command_shell import CommandOutput
from src.tools.execution_outcome import ToolFailure
from src.tools.executor import ToolExecutor
from src.tools.skill_context import SkillContext
from src.tools.ssh import run_local_command
from tests.test_command_shell_callers import HOST, USER
from tests.test_command_shell_callers import runtime as _runtime


@pytest.fixture
async def runtime(tmp_path, monkeypatch):
    async for value in _runtime.__wrapped__(tmp_path, monkeypatch):
        yield value


@pytest.fixture
async def owners(monkeypatch):
    spawned = []
    actual = local_supervisor.create_supervised_shell

    async def capture(*args, **kwargs):
        proc = await actual(*args, **kwargs)
        spawned.append(proc)
        return proc

    monkeypatch.setattr(local_supervisor, "create_supervised_shell", capture)
    try:
        yield spawned
    finally:
        for proc in spawned:
            assert await proc.terminate_tree(grace=.05)


def background_command(path, kind):
    source = (
        "import os,time; "
        + ("child=os.fork(); child and os._exit(0); os.setsid(); " if kind == "fork" else "")
        + f"open({str(path)!r},'w').write(str(os.getpid())); time.sleep(30)"
    )
    cmd = shlex.join([sys.executable, "-c", source])
    if kind == "fork":
        return cmd + " </dev/null >/dev/null 2>&1; printf started"
    prefix = "nohup " if kind == "nohup" else "setsid "
    return prefix + cmd + " </dev/null >/dev/null 2>&1 & printf started"


async def descendant(path):
    async with asyncio.timeout(5):
        while not path.exists() or not path.read_text():
            await asyncio.sleep(.01)
    pid = int(path.read_text())
    assert Path(f"/proc/{pid}").exists()
    return pid


@pytest.mark.parametrize("mode", ["sh", "auto", "bash"])
@pytest.mark.parametrize("route", ["run_command", "run_command_multi", "skill", "stream"])
@pytest.mark.parametrize("kind", ["nohup", "setsid", "fork"])
async def test_normal_foreground_never_terminates_descendant(
    runtime, owners, tmp_path, mode, route, kind,
):
    runtime.config.command_shell = mode
    path = tmp_path / "child.pid"
    command = background_command(path, kind)
    if route == "skill":
        context = SkillContext(
            skill_name="probe", tool_executor=runtime.executor, requester_id=USER,
        )
        output = await context.run_on_host(HOST, command)
    elif route == "stream":
        output_parts = []

        async def callback(text):
            output_parts.append(text)

        code, output = await run_local_command(command, command_shell=mode, on_output=callback)
        assert code == 0 and output_parts == ["started"]
    else:
        args = {"command": command}
        args.update({"hosts": [HOST]} if route.endswith("multi") else {"host": HOST})
        result = await runtime.executor.execute(route, args, user_id=USER)
        assert result.ok, result.output
        output = result.output
    assert output == (f"### {HOST}\n```\nstarted\n```" if route.endswith("multi") else "started")
    pid = await descendant(path)
    assert len(owners) == 1 and not owners[0]._settled.done()
    # The leader has returned while the exact descendant remains supervised.
    await asyncio.sleep(.05)
    assert Path(f"/proc/{pid}").exists()
    assert await owners[0].terminate_tree(grace=.05)
    assert not Path(f"/proc/{pid}").exists()


@pytest.mark.parametrize("mode", ["sh", "auto", "bash"])
@pytest.mark.parametrize("kind", ["nohup", "setsid", "fork"])
@pytest.mark.parametrize("ending", ["timeout", "cancel", "shutdown"])
async def test_abnormal_foreground_reaps_descendant(
    owners, tmp_path, monkeypatch, mode, kind, ending,
):
    path = tmp_path / "child.pid"
    command = background_command(path, kind)
    if ending != "shutdown":
        command += "; sleep 30"
    task = asyncio.create_task(run_local_command(
        command, timeout=1 if ending == "timeout" else 30, command_shell=mode,
    ))
    pid = await descendant(path)
    async with asyncio.timeout(5):
        while not owners:
            await asyncio.sleep(.01)
    if ending == "timeout":
        code, text = await task
        assert (code, str(text)) == (1, "Command timed out after 1 seconds")
    elif ending == "cancel":
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    else:
        assert (await task)[0] == 0
        # Only this fixture's private supervisors belong to this shutdown.
        monkeypatch.setattr(local_supervisor, "_active", set(owners))
        monkeypatch.setattr(local_supervisor, "_closing_loops", set())
        monkeypatch.setattr(local_supervisor, "_unverified_startup", False)
        await local_supervisor.shutdown_local_supervisors()
    assert owners[0]._settled.done() and owners[0]._settled.result()
    assert not Path(f"/proc/{pid}").exists()


@pytest.mark.parametrize("mode", ["sh", "auto", "bash"])
@pytest.mark.parametrize("route", ["run_command", "run_command_multi", "skill"])
async def test_success_wire_bytes_and_http_marker(runtime, owners, mode, route):
    runtime.config.command_shell = mode
    command = "printf 'body λ\\nMARKER200\\n'"
    expected = "body λ\nMARKER200"
    if route == "skill":
        context = SkillContext(
            skill_name="probe", tool_executor=runtime.executor, requester_id=USER,
        )
        output = await context.run_on_host(HOST, command)
        assert int(output.rpartition("\nMARKER")[2]) == 200
    else:
        args = {"command": command}
        args.update({"hosts": [HOST]} if route.endswith("multi") else {"host": HOST})
        result = await runtime.executor.execute(route, args, user_id=USER)
        assert result.ok
        output = result.output
        if route.endswith("multi"):
            expected = f"### {HOST}\n```\n{expected}\n```"
    assert output == expected


@pytest.mark.parametrize("mode", ["sh", "auto", "bash"])
@pytest.mark.parametrize("code,payload", [(7, "denied"), (1, "Command timed out after 30 seconds")])
async def test_internal_failure_wire_contract(runtime, mode, code, payload):
    runtime.config.command_shell = mode
    runtime.executor._exec_command = AsyncMock(return_value=(code, CommandOutput(
        payload, shell="sh", reason="timeout" if code == 1 else None,
        returncode=-15 if code == 1 else code,
    )))
    output, actual_code = await runtime.executor._run_on_host(HOST, "printf unused", user_id=USER)
    assert (actual_code, output) == (code, f"Command failed (exit {code}):\n{payload}")
    assert not isinstance(output, ToolFailure)


@pytest.mark.parametrize("mode", ["sh", "auto", "bash"])
async def test_script_timeout_and_failure_legacy_bytes(runtime, mode):
    runtime.config.command_shell = mode
    for code, text in [(7, "payload"), (1, "Command timed out after 30 seconds")]:
        runtime.executor._exec_command = AsyncMock(return_value=(code, CommandOutput(
            text, shell="sh", reason="timeout" if code == 1 else None,
            returncode=-15 if code == 1 else code,
        )))
        result = await runtime.executor.execute("run_script", {
            "host": HOST, "script": "printf unused", "interpreter": "sh",
        }, user_id=USER)
        assert not result.ok
        assert result.output == f"Script failed (exit {code}):\n{text}"
        assert ToolExecutor._check_recoverable(result.output) is None


def test_recovery_does_not_expand_to_typed_script_or_multi_errors():
    for text in (
        "Script failed (exit 1):\nPermission denied", "### local\n```\nPermission denied\n```",
    ):
        assert ToolExecutor._check_recoverable(ToolFailure(text)) is None


@pytest.mark.parametrize("mode", ["sh", "auto", "bash"])
@pytest.mark.parametrize("case", ["missing", "unreadable", "patch", "http"])
async def test_internal_handler_legacy_failures(runtime, tmp_path, mode, case):
    runtime.config.command_shell = mode
    messages = {
        "missing": (2, "/bin/sh: 1: cannot open fixture: No such file\n"),
        "unreadable": (2, "/bin/sh: 1: cannot open fixture: Permission denied\n"),
        "patch": (1, "fixture mktemp failed"),
        "http": (1, "Command timed out after 30 seconds"),
    }
    code, payload = messages[case]
    runtime.executor._exec_command = AsyncMock(return_value=(code, CommandOutput(
        payload, shell="sh", reason="timeout" if case == "http" else None,
        returncode=-15 if case == "http" else code,
    )))
    if case == "patch":
        tool = "apply_patch"
        args = {"host": HOST, "root": str(tmp_path), "patch_text":
                "*** Begin Patch\n*** Add File: unused\n+fixture\n*** End Patch"}
    elif case == "http":
        tool = "http_probe"
        args = {"host": HOST, "url": "http://fixture.invalid"}
    else:
        tool = "read_file"
        args = {"host": HOST, "path": str(tmp_path / "fixture")}
    result = await runtime.executor.execute(tool, args, user_id=USER)
    assert not result.ok
    text = result.output
    expected = payload if case == "http" else f"Command failed (exit {code}):\n{payload}"
    assert text == expected
    recovery = ToolExecutor._check_recoverable(text)
    assert (recovery.value if recovery else None) == (
        "permission_denied" if case == "unreadable" else None
    )


@pytest.mark.parametrize("mode", ["sh", "auto", "bash"])
async def test_legacy_skill_embedder_retains_failure_prefix(runtime, mode):
    runtime.config.command_shell = mode

    class Embedder:
        async def _run_on_host(self, alias, command, **kwargs):
            return await runtime.executor._run_on_host(alias, command, user_id=USER, **kwargs)

    context = SkillContext(skill_name="legacy", tool_executor=Embedder())
    runtime.executor._exec_command = AsyncMock(return_value=(7, CommandOutput(
        "payload", shell="bash", returncode=7,
    )))
    assert await context.run_on_host(HOST, "printf unused") == "Command failed (exit 7):\npayload"


def test_static_raw_command_contracts_leave_live_shell_sentence_to_catalog():
    from src.tools.defs.system_files import TOOLS_SECTION

    for tool in TOOLS_SECTION:
        if tool["name"] in {"run_command", "run_command_multi"}:
            assert "Command timed out" not in tool["description"]
            assert "Local commands run under" not in tool["description"]
