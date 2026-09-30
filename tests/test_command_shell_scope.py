"""Scope correction: real harmless processes, kernel shell identity and exact bytes.

The observer prefixes a POSIX readlink to a private file before the *unaltered*
tool-built command, and delegates to the real supervisor. No backend is faked.
Only validation's report clock is fixed to make its serialized bytes comparable.
"""
from __future__ import annotations

import asyncio
import itertools
import json
import os
import shlex
from types import SimpleNamespace

import pytest
from aiohttp import web

from src.tools import local_supervisor, post_validation
from src.tools.skill_context import SkillContext
from src.tools.ssh import run_local_command
from tests.test_command_shell_callers import HOST, USER
from tests.test_command_shell_callers import runtime as _runtime


@pytest.fixture
async def runtime(tmp_path, monkeypatch):
    async for value in _runtime.__wrapped__(tmp_path, monkeypatch):
        yield value


@pytest.fixture
def shells(tmp_path, monkeypatch):
    actual = local_supervisor.create_supervised_shell
    evidence = []
    identities = itertools.count()

    async def observe(command, **kwargs):
        # Reserve before awaiting startup: validation probes fan out concurrently.
        path = tmp_path / f"shell-exe-{next(identities)}"
        probe = (f"readlink /proc/$$/exe > {shlex.quote(str(path))}; "
                 f"cat /proc/$$/cmdline > {shlex.quote(str(path) + '.argv')}; ")
        full_command = probe + command
        proc = await actual(full_command, **kwargs)
        evidence.append((proc, path, full_command))
        return proc

    monkeypatch.setattr(local_supervisor, "create_supervised_shell", observe)
    return evidence


def assert_posix(evidence):
    assert evidence
    assert len({path for _, path, _ in evidence}) == len(evidence)
    for proc, path, full_command in evidence:
        assert proc.shell_executable == "/bin/sh"
        assert proc.effective_shell == "sh"
        assert os.path.samefile(path.read_text().strip(), "/bin/sh")
        argv = path.with_name(path.name + ".argv").read_bytes().split(b"\0")
        assert argv[:2] == [b"/bin/sh", b"-c"]
        assert argv[2] == full_command.encode()
        assert proc._settled.done() and proc._settled.result() is True
        assert proc._worker.returncode == 0


@pytest.mark.parametrize("mode", ["auto", "bash"])
@pytest.mark.parametrize("tool", ["read_file", "apply_patch", "run_script", "validate_action"])
async def test_internal_tools_use_actual_sh_and_identical_bytes(
    runtime, tmp_path, monkeypatch, shells, mode, tool,
):
    # Poison config discovery: internal execution must not even consult it.
    def configured():
        raise AssertionError("internal transport consulted raw-command shell config")

    runtime.executor._command_shell_config = configured
    monkeypatch.setattr(post_validation, "time", SimpleNamespace(monotonic=lambda: 100.0))
    source = tmp_path / "scope.txt"
    source.write_text("λ\tvalue\nlast")
    if tool == "read_file":
        args = {"host": HOST, "path": str(source), "raw": True}
    elif tool == "apply_patch":
        args = {"host": HOST, "root": str(tmp_path), "patch_text":
                "*** Begin Patch\n*** Update File: scope.txt\n@@\n"
                "-λ\tvalue\n+new λ\n*** End Patch\n"}
    elif tool == "run_script":
        # Bash script under POSIX wrapper: explicit interpreter remains bash.
        args = {"host": HOST, "interpreter": "bash",
                "script": '[[ -n "$BASH_VERSION" ]] && printf "λ\\tvalue\\nlast"'}
    else:
        args = {"default_host": HOST, "format": "json", "checks": [
            {"type": "process", "target": "odin_scope_safe_missing_process_9d830"},
        ]}
    results = []
    for setting in ("sh", mode):
        runtime.config.command_shell = setting
        if tool == "apply_patch":
            source.write_text("λ\tvalue\nlast")
        result = await runtime.executor.execute(tool, args, user_id=USER)
        assert result.ok, result.output
        results.append(result.output.encode("utf-8"))
    assert results[0] == results[1]
    assert b"effective_shell" not in results[1] or tool == "validate_action"
    if tool == "validate_action":
        report = json.loads(results[1])
        assert report["checks"][0]["effective_shell"] is None
        assert report["checks"][0]["observed"] == "ABSENT"
    assert_posix(shells)


@pytest.mark.parametrize("mode", ["auto", "bash"])
@pytest.mark.parametrize("explicit_host", [False, True])
async def test_http_probe_wrapper_stays_sh(runtime, monkeypatch, shells, mode, explicit_host):
    runtime.config.command_shell = mode
    runtime.executor._command_shell_config = lambda: pytest.fail("HTTP probe consulted config")
    app = web.Application()

    async def respond(request):
        return web.Response(text="scope payload λ\n")

    app.router.add_get("/", respond)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    try:
        port = site._server.sockets[0].getsockname()[1]
        args = {"url": f"http://127.0.0.1:{port}/"}
        if explicit_host:
            args["host"] = HOST
        result = await runtime.executor.execute("http_probe", args, user_id=USER)
        assert result.ok, result.output
        assert "scope payload λ" in result.output
        assert "effective_shell" not in result.output
        assert_posix(shells)
    finally:
        await runner.cleanup()


async def test_shared_runner_and_supervisor_default_to_sh(shells):
    code, output = await run_local_command("printf 'λ\\tvalue\\nlast'; exit 7")
    assert code == output.raw_returncode == 7
    assert output == "λ\tvalue\nlast"
    assert output.effective_shell == "sh"
    proc = await local_supervisor.create_supervised_shell(
        "printf exact", stdout=asyncio.subprocess.PIPE,
    )
    assert await proc.communicate() == (b"exact", None)
    assert await proc.terminate_tree(grace=.05)
    assert_posix(shells)


@pytest.mark.parametrize("mode", ["auto", "bash", "sh"])
async def test_transport_only_skill_embedder_explicitly_opts_in(runtime, mode):
    runtime.config.command_shell = mode

    class Embedder:
        async def _run_on_host(self, alias, command, **kwargs):
            assert kwargs == {"use_workspace": True, "use_command_shell": True}
            return await runtime.executor._run_on_host(
                alias, command, user_id=USER, **kwargs,
            )

    context = SkillContext(
        skill_name="transport_probe", tool_executor=Embedder(),
        memory_path=str(runtime.data / "embedder-memory.json"), requester_id=USER,
    )
    output = await context.run_on_host(
        HOST, 'if [ -n "${BASH_VERSION-}" ]; then printf bash; else printf sh; fi',
    )
    expected = "sh" if mode == "sh" else "bash"
    assert output == expected
    assert output.effective_shell == expected
    assert output.raw_returncode == 0


@pytest.mark.parametrize("mode", ["auto", "bash"])
async def test_non_command_validation_probes_keep_posix_bytes(
    runtime, tmp_path, monkeypatch, shells, mode,
):
    # Fixture-only utilities avoid requiring systemd/journal services.
    # Probe construction, POSIX wrapper, subprocesses and evaluation are real.
    for name, body in (
        ("systemctl", "printf active"),
        ("journalctl", 'case " $* " in *" -q "*) printf "fixture log\\n";; esac'),
        ("curl", "printf 200"),
    ):
        binary = tmp_path / name
        binary.write_text("#!/bin/sh\n" + body + "\n")
        binary.chmod(0o700)
    monkeypatch.setenv("PATH", str(tmp_path) + os.pathsep + os.environ["PATH"])
    monkeypatch.setattr(post_validation, "time", SimpleNamespace(monotonic=lambda: 100.0))
    runtime.executor._command_shell_config = lambda: pytest.fail("probe consulted config")
    args = {"default_host": HOST, "format": "json", "checks": [
        {"type": "http", "target": "http://fixture.test"},
        {"type": "port", "target": "127.0.0.1:0"},
        {"type": "service", "target": "fixture.service"},
        {"type": "log_present", "target": "fixture log"},
        {"type": "log_absent", "target": "absent-fixture-pattern"},
    ]}
    outputs = []
    for setting in ("sh", mode):
        runtime.config.command_shell = setting
        result = await runtime.executor.execute("validate_action", args, user_id=USER)
        assert result.ok, result.output
        outputs.append(result.output.encode())
    assert outputs[0] == outputs[1]
    checks = json.loads(outputs[1])["checks"]
    assert [c["status"] for c in checks] == ["pass", "fail", "pass", "pass", "pass"]
    assert all(c["effective_shell"] is None for c in checks)
    assert_posix(shells)


async def test_internal_local_target_process_transport_keeps_sh(runtime, shells):
    runtime.executor._command_shell_config = lambda: pytest.fail("transport consulted config")
    lease = runtime.executor.host_registry.acquire(HOST)
    with lease:
        code, output = await runtime.executor._exec_remote_target(
            lease.target, "printf 'exact λ\\n'; exit 7", 10,
        )
    assert code == output.raw_returncode == 7
    assert output == "exact λ\n"
    assert output.effective_shell == "sh"
    assert_posix(shells)


@pytest.mark.parametrize("mode", ["auto", "bash"])
@pytest.mark.parametrize("explicit_host", [False, True])
async def test_http_probe_wrapper_exact_byte_parity(
    runtime, tmp_path, monkeypatch, shells, mode, explicit_host,
):
    # Real-network timing is inherently variable. A disposable curl executable
    # emits stable transport bytes; the separate test exercises real HTTP.
    binary = tmp_path / "curl"
    binary.write_text("#!/bin/sh\nprintf 'HTTP fixture λ\\n\\nstatus_code: 200\\n'\n")
    binary.chmod(0o700)
    monkeypatch.setenv("PATH", str(tmp_path) + os.pathsep + os.environ["PATH"])
    runtime.executor._command_shell_config = lambda: pytest.fail("HTTP consulted config")
    args = {"url": "http://fixture.test/"}
    if explicit_host:
        args["host"] = HOST
    outputs = []
    for setting in ("sh", mode):
        runtime.config.command_shell = setting
        result = await runtime.executor.execute("http_probe", args, user_id=USER)
        assert result.ok, result.output
        outputs.append(result.output.encode())
    # Public _truncate_lines has always removed the final newline.
    assert outputs == ["HTTP fixture λ\n\nstatus_code: 200".encode()] * 2
    assert_posix(shells)
