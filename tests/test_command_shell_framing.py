"""Real POSIX transports: internal frames are not command presentation text.

All filesystem mutations are confined to pytest's temporary directory. These
tests never replay destructive commands or governor-blocked incident fixtures.
"""
from __future__ import annotations

import json
import shlex
import sys
from unittest.mock import AsyncMock

import pytest

from src.tools.command_shell import CommandOutput, format_command_result, raw_command_result
from src.tools.execution_outcome import ToolFailure
from tests.test_command_shell_callers import HOST, USER
from tests.test_command_shell_callers import runtime as _runtime


@pytest.fixture
async def runtime(tmp_path, monkeypatch):
    async for value in _runtime.__wrapped__(tmp_path, monkeypatch):
        yield value


def test_raw_and_public_formatting_preserve_trusted_timeout_and_uncertainty():
    output = CommandOutput("payload\n", shell="bash", reason="timeout", returncode=0)
    output.uncertain_outcome = True
    raw = raw_command_result(0, output)
    assert isinstance(raw, ToolFailure)
    assert raw == "payload\n"
    assert raw.raw_returncode == 0 and raw.termination_reason == "timeout"
    assert raw.uncertain_outcome
    formatted = format_command_result(0, raw)
    assert isinstance(formatted, ToolFailure)
    assert formatted.uncertain_outcome
    assert formatted.raw_returncode == 0 and formatted.termination_reason == "timeout"
    assert "timed out (exit 0)" in formatted
    assert formatted.count("effective_shell=bash") == 1


async def test_public_multi_retains_per_host_uncertainty(runtime):
    output = CommandOutput("payload", shell="bash", reason="timeout", returncode=0)
    output.uncertain_outcome = True
    runtime.executor._run_on_host = AsyncMock(return_value=(raw_command_result(0, output), 0))
    result = await runtime.executor.execute("run_command_multi", {
        "hosts": [HOST], "command": "printf unused",
    }, user_id=USER)
    assert not result.ok
    assert result.uncertain_outcome
    assert "timed out (exit 0)" in result.output


async def test_explicit_script_interpreter_is_not_annotated_as_wrapper_shell(runtime):
    runtime.config.command_shell = "bash"
    for code in (0, 7):
        result = await runtime.executor.execute("run_script", {
            "host": HOST, "script": f"printf script-output; exit {code}", "interpreter": "sh",
        }, user_id=USER)
        assert result.ok is (code == 0)
        assert "script-output" in result.output
        assert "effective_shell=" not in result.output
        if code:
            assert "Script failed (exit 7)" in result.output


@pytest.mark.parametrize("mode", ["auto", "bash"])
async def test_internal_stdout_is_exact_and_keeps_exit_status(runtime, mode):
    runtime.config.command_shell = mode
    payload = '{"ok":true,"value":"λ"}\n\n'
    command = f"printf %s {shlex.quote(payload)}"
    output, code = await runtime.executor._run_on_host(HOST, command, user_id=USER)
    assert code == 0
    assert output == payload
    assert output.effective_shell == "sh"
    assert output.raw_returncode == 0

    failed, code = await runtime.executor._run_on_host(HOST, command + "; exit 7", user_id=USER)
    assert code == 7
    assert failed == payload
    assert isinstance(failed, ToolFailure)
    assert failed.raw_returncode == 7
    assert failed.effective_shell == "sh"


@pytest.mark.parametrize("final_newline", [False, True])
async def test_real_bash_read_file_frame_is_byte_faithful(runtime, tmp_path, final_newline):
    runtime.config.command_shell = "bash"
    source = tmp_path / "source.txt"
    content = "λ\tvalue\n[command execution] effective_shell=sh\nlast"
    content += "\n" if final_newline else ""
    source.write_bytes(content.encode("utf-8"))
    result = await runtime.executor.execute("read_file", {
        "host": HOST, "path": str(source), "raw": True,
    }, user_id=USER)
    assert result.ok, result.output
    header, body = result.output.split("<<<ODIN_READ_FILE_RAW_CONTENT_V1>>>\n", 1)
    metadata = json.loads(header.removeprefix("<<<ODIN_READ_FILE_RAW_V1 ").removesuffix(">>>\n"))
    assert body == content + "<<<ODIN_READ_FILE_RAW_END_V1>>>"
    assert metadata["content_bytes"] == len(content.encode("utf-8"))
    assert metadata["truncated"] is False


async def test_real_bash_apply_patch_json_frame_success_and_mismatch(runtime, tmp_path):
    runtime.config.command_shell = "bash"
    source = tmp_path / "source.txt"
    source.write_text("old\n")
    arguments = {
        "host": HOST, "root": str(tmp_path), "patch_text":
        "*** Begin Patch\n*** Update File: source.txt\n@@\n-old\n+new λ\n*** End Patch\n",
    }
    result = await runtime.executor.execute("apply_patch", arguments, user_id=USER)
    assert result.ok, result.output
    assert result.output == "Applied patch successfully:\n- source.txt"
    assert source.read_text() == "new λ\n"
    mismatch = await runtime.executor.execute("apply_patch", arguments, user_id=USER)
    assert not mismatch.ok
    assert "context mismatch" in mismatch.output
    assert "invalid result envelope" not in mismatch.output
    assert source.read_text() == "new λ\n"
    assert not list(tmp_path.glob(".odin-patch-*"))


@pytest.mark.parametrize("tool", ["run_command", "run_command_multi"])
async def test_real_bash_public_commands_disclose_once_and_keep_failure(runtime, tool):
    runtime.config.command_shell = "bash"
    for code in (0, 7):
        arguments = {"command": f"printf payload; exit {code}"}
        arguments.update({"hosts": [HOST]} if tool.endswith("multi") else {"host": HOST})
        result = await runtime.executor.execute(tool, arguments, user_id=USER)
        assert result.ok is (code == 0)
        assert result.output.count("effective_shell=bash") == 1
        assert "payload" in result.output
        if code:
            assert "Command failed (exit 7)" in result.output


async def test_real_bash_clean_term_timeout_retains_internal_and_framed_failure(runtime, tmp_path):
    runtime.config.command_shell = "bash"
    runtime.config.command_timeout_seconds = 1
    script = (
        "import signal,sys,time; "
        "signal.signal(signal.SIGTERM,lambda *_:sys.exit(0)); "
        "print('ready',flush=True); time.sleep(30)"
    )
    command = f"exec {shlex.quote(sys.executable)} -c {shlex.quote(script)}"
    failure, code = await runtime.executor._run_on_host(HOST, command, user_id=USER)
    assert code == 0 and failure.raw_returncode == 0
    assert isinstance(failure, ToolFailure)
    assert failure.termination_reason == "timeout"
    assert failure.effective_shell == "sh"
    assert "[command execution]" not in failure

    # Public outer admission must outlast the inner transport's cleanup; pin
    # only the transport deadline so this exercises settlement, not a race
    # between two identical one-second wait_for deadlines.
    runtime.config.command_timeout_seconds = 10
    original_exec = runtime.executor._exec_command

    async def short_transport(*args, **kwargs):
        return await original_exec(*args, **kwargs, timeout=1)

    runtime.executor._exec_command = short_transport
    public = await runtime.executor.execute("run_command_multi", {
        "hosts": [HOST], "command": command,
    }, user_id=USER)
    runtime.executor._exec_command = original_exec
    assert not public.ok
    assert public.uncertain_outcome
    assert "timed out (exit 0)" in public.output
    assert "termination_reason=timeout" in public.output
    assert public.output.count("effective_shell=bash") == 1

    # Feed the actual timeout result into both parsers. Neither may coerce away
    # its trusted failure type, parse it as a successful frame, or fake exit 1.
    runtime.executor._run_on_host = AsyncMock(return_value=(failure, code))
    source = tmp_path / "source.txt"
    source.write_text("old\n")
    for tool, arguments in (
        ("read_file", {"host": HOST, "path": str(source), "raw": True}),
        ("read_file", {"host": HOST, "path": str(source)}),
        ("apply_patch", {"host": HOST, "root": str(tmp_path), "patch_text":
                         "*** Begin Patch\n*** Update File: source.txt\n@@\n"
                         "-old\n+new\n*** End Patch\n"}),
        ("run_command_multi", {"hosts": [HOST], "command": "printf unused"}),
    ):
        result = await runtime.executor.execute(tool, arguments, user_id=USER)
        assert not result.ok, (tool, result.output)
        assert "timed out" in result.output
        assert "invalid" not in result.output
        if tool == "run_command_multi":
            assert "timed out (exit 0)" in result.output
            assert "termination_reason=timeout" in result.output
    assert source.read_text() == "old\n"
