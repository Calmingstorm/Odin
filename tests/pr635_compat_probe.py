"""Standalone read-only compatibility/latency probe for two development trees.

Run with Python: this-file TREE MODE SCRATCH. Never point TREE at a live install.
Only scratch files and harmless sleep/printf fixtures are used.
"""
from __future__ import annotations

import asyncio
import json
import os
import shlex
import statistics
import sys
import time
from pathlib import Path


async def main():
    tree, mode, scratch = sys.argv[1:]
    sys.path.insert(0, tree)
    from src.config.schema import ToolHost, ToolsConfig
    from src.tools import local_supervisor
    from src.tools.executor import ToolExecutor
    from src.tools.skill_context import SkillContext
    from src.tools.ssh import run_local_command

    root = Path(scratch)
    root.mkdir(exist_ok=True, mode=0o700)
    os.chdir(root)
    workspace = root / "workspace"
    workspace.mkdir(exist_ok=True, mode=0o700)
    data = root / "data"
    data.mkdir(exist_ok=True, mode=0o700)
    config = ToolsConfig(
        hosts={"local": ToolHost(address="127.0.0.1")}, default_host="local",
        local_working_dir=str(workspace), audit_log_path=str(data / "audit.jsonl"),
        recovery={"enabled": False}, branch_freshness={"enabled": False},
    )
    if hasattr(config, "command_shell"):
        config.command_shell = mode
    executor = ToolExecutor(config, memory_path=str(data / "memory.json"))
    records = {}

    async def record(name, method, args):
        raw = await method(args)
        text, code = raw if isinstance(raw, tuple) else (raw, None)
        recovery = ToolExecutor._check_recoverable(text)
        records[name] = [code, str(text), recovery.value if recovery else None]

    try:
        for name, method, args in (
            ("command", executor.system_tools._handle_run_command,
             {"host": "local", "command": "printf 'payload λ\\nMARKER200\\n'"}),
            ("multi", executor.system_tools._handle_run_command_multi,
             {"hosts": ["local"], "command": "printf 'payload λ\\nMARKER200\\n'"}),
            ("missing", executor.files_docs_tools._handle_read_file,
             {"host": "local", "path": str(root / "missing")}),
        ):
            await record(name, method, args)
        unreadable = root / "unreadable"
        unreadable.write_text("private fixture")
        unreadable.chmod(0)
        try:
            assert os.geteuid() != 0, "run this probe as the unprivileged development user"
            await record("unreadable", executor.files_docs_tools._handle_read_file,
                         {"host": "local", "path": str(unreadable)})
        finally:
            unreadable.chmod(0o600)
        # Harmless fixture utility forces a host transport failure before the
        # patch runner launches. No target file is changed.
        bin_dir = root / "bin"
        bin_dir.mkdir(exist_ok=True)
        utility = bin_dir / "mktemp"
        utility.write_text("#!/bin/sh\nprintf 'fixture mktemp failed' >&2\nexit 7\n")
        utility.chmod(0o700)
        old_path = os.environ["PATH"]
        os.environ["PATH"] = str(bin_dir) + os.pathsep + old_path
        try:
            await record("patch-host-failure", executor.files_docs_tools._handle_apply_patch, {
                "host": "local", "root": str(root), "patch_text":
                "*** Begin Patch\n*** Add File: unused.txt\n+fixture\n*** End Patch",
            })
        finally:
            os.environ["PATH"] = old_path
        assert not (root / "unused.txt").exists()
        await record("script-exit", executor.system_tools._handle_run_script, {
            "host": "local", "script": "printf payload; exit 7", "interpreter": "sh",
        })
        context = SkillContext(skill_name="probe", tool_executor=executor)
        records["skill"] = await context.run_on_host("local", "printf 'payload\\nMARKER200'")
        # Force transport's deadline only, so outer executor admission cannot
        # race it and alter the legacy comparison.
        actual_exec = executor._exec_command

        async def short_exec(*args, **kwargs):
            return await actual_exec(*args, **kwargs, timeout=1)

        executor._exec_command = short_exec
        await record("script-timeout", executor.system_tools._handle_run_script, {
            "host": "local", "script": "sleep 30", "interpreter": "sh",
        })
        curl = bin_dir / "curl"
        curl.write_text("#!/bin/sh\nexec sleep 30\n")
        curl.chmod(0o700)
        os.environ["PATH"] = str(bin_dir) + os.pathsep + old_path
        try:
            await record("http-timeout", executor.browser_web_tools._handle_http_probe, {
                "host": "local", "url": "http://fixture.invalid",
            })
        finally:
            os.environ["PATH"] = old_path
        executor._exec_command = actual_exec
        # Exact descendant identity is observed through a marker, never guessed.
        marker = root / "survivor.pid"
        marker.unlink(missing_ok=True)
        source = (
            f"import os,time; open({str(marker)!r},'w').write(str(os.getpid())); time.sleep(30)"
        )
        command = "nohup " + shlex.join([sys.executable, "-c", source])
        command += " >/dev/null 2>&1 & printf started"
        kwargs = {"command_shell": mode} if hasattr(config, "command_shell") else {}
        assert (await run_local_command(command, **kwargs))[0] == 0
        async with asyncio.timeout(5):
            while not marker.exists() or not marker.read_text():
                await asyncio.sleep(.01)
        await asyncio.sleep(4)
        records["survives_4s"] = Path(f"/proc/{int(marker.read_text())}").exists()
        # No settlement waits on the measured foreground path.
        samples = []
        for index in range(45):
            start = time.perf_counter()
            assert await run_local_command("printf harmless", **kwargs) == (0, "harmless")
            duration = (time.perf_counter() - start) * 1000
            if index >= 5:
                samples.append(duration)
        records["latency_ms"] = {
            "median": statistics.median(samples), "mean": statistics.mean(samples),
            "stdev": statistics.stdev(samples), "n": len(samples),
        }
    finally:
        await local_supervisor.shutdown_local_supervisors()
    print(json.dumps(records, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(main())
