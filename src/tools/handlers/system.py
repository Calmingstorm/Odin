"""System handler domain — run_command, run_script, run_command_multi,
manage_process (RFC-004 P4, wave 1).

Bodies moved VERBATIM from executor.py with two declared mechanical
adjustments (statement-identical otherwise, reviewable by AST diff):

- lazy relative imports re-anchored one level (``.x`` → ``..x``)
- manage_process's inline lazy-init of ``self._process_registry`` becomes
  ``registry = self._process_registry()`` — the registry itself still
  lazy-inits ON THE EXECUTOR (deps accessor), because the web API and
  graceful shutdown read ``tool_executor._process_registry`` directly.
"""

from __future__ import annotations

import asyncio
import base64
import os
import shlex

from ..branch_freshness import is_test_command, is_test_failure
from ..tool_text import _ERROR_RESULT_PREFIXES, _truncate_lines
from .deps import HandlerBase


class SystemTools(HandlerBase):
    async def _handle_run_command(self, inp: dict) -> str | tuple[str, int]:
        command = inp.get("command")
        host = inp.get("host")
        if not command:
            return "Error: 'command' is required for run_command."
        if not host:
            host = self._resolve_default_host(self._current_user_id)
            if not host:
                return "Error: 'host' is required for run_command."

        allowed, denial, governor_note = self._govern_command(command, host)
        if not allowed:
            return denial

        # Stream output if enabled for this tool
        on_output = None
        finish_cb = None
        if self.output_streamer and self.output_streamer.is_enabled("run_command"):
            _, on_output, finish_cb = self.output_streamer.create_callback(
                "run_command",
                channel_id=host,
            )

        resolved = self._resolve_host(host)
        if not resolved:
            if finish_cb:
                try:
                    await finish_cb()
                except Exception:
                    pass
            return f"Unknown or disallowed host: {host}"
        address, ssh_user, _os = resolved
        code, output = await self._exec_command(
            address,
            command,
            ssh_user,
            on_output=on_output,
            # run_command is THE tool the 2026-07-27 wipe came through.
            use_workspace=True,
        )
        if finish_cb:
            try:
                await finish_cb()
            except Exception:
                pass
        if code != 0:
            output = f"Command failed (exit {code}):\n{output}"
        output = _truncate_lines(output)
        if self._branch_freshness_enabled and is_test_command(command) and is_test_failure(output):
            output = await self._annotate_with_freshness(output, host, "run_command", command)
        text = f"{governor_note}{output}" if governor_note else output
        return text, code

    async def _handle_run_script(self, inp: dict) -> str | tuple[str, int]:
        """Write a script to a temp file, execute it, and clean up."""
        host = inp.get("host")
        script = inp.get("script")
        if not host:
            host = self._resolve_default_host(self._current_user_id)
            if not host:
                return "Error: 'host' is required for run_script."
        if not script:
            return "Error: 'script' is required for run_script."
        interpreter = inp.get("interpreter", "bash")

        allowed, denial, governor_note = self._govern_command(script, host)
        if not allowed:
            return denial

        # Map interpreter to file extension
        ext_map = {
            "bash": ".sh",
            "sh": ".sh",
            "python3": ".py",
            "python": ".py",
            "node": ".js",
            "ruby": ".rb",
            "perl": ".pl",
        }
        ext = ext_map.get(interpreter, ".sh")
        filename = inp.get("filename") or f"odin_script{ext}"

        # Sanitize interpreter to prevent injection
        allowed_interpreters = {"bash", "sh", "python3", "python", "node", "ruby", "perl"}
        if interpreter not in allowed_interpreters:
            return (
                f"Unsupported interpreter: {interpreter}. "
                f"Use one of: {', '.join(sorted(allowed_interpreters))}"
            )

        resolved = self._resolve_host(host)
        if not resolved:
            return f"Unknown or disallowed host: {host}"
        address, ssh_user, _os = resolved

        # Base64-encode script to avoid all quoting/heredoc issues
        encoded = base64.b64encode(script.encode()).decode()

        safe_filename = shlex.quote(os.path.basename(filename))
        # Write to temp file, execute, capture output, clean up
        cmd = (
            f"TMPF=$(mktemp /tmp/{safe_filename}.XXXXXXXX) && "
            f"echo '{encoded}' | base64 -d > \"$TMPF\" && "
            f'chmod +x "$TMPF" && '
            f'{interpreter} "$TMPF" 2>&1; EXIT=$?; '
            f'rm -f "$TMPF"; exit $EXIT'
        )

        # Stream output if enabled for this tool
        on_output = None
        finish_cb = None
        if self.output_streamer and self.output_streamer.is_enabled("run_script"):
            _, on_output, finish_cb = self.output_streamer.create_callback(
                "run_script",
                channel_id=host,
            )

        code, output = await self._exec_command(
            address,
            cmd,
            ssh_user,
            on_output=on_output,
            # run_script executes arbitrary user script text, same hazard.
            use_workspace=True,
        )
        if finish_cb:
            try:
                await finish_cb()
            except Exception:
                pass
        if code != 0:
            result = f"Script failed (exit {code}):\n{_truncate_lines(output)}"
            if (
                self._branch_freshness_enabled
                and is_test_command(script)
                and is_test_failure(result)
            ):
                result = await self._annotate_with_freshness(
                    result, host, "run_script", script[:120]
                )
            text = f"{governor_note}{result}" if governor_note else result
            return text, code
        output = _truncate_lines(output)
        text = f"{governor_note}{output}" if governor_note else output
        return text, 0

    # --- Multi-host tools ---

    async def _handle_run_command_multi(self, inp: dict) -> str | tuple[str, int]:
        hosts = inp["hosts"]
        command = inp["command"]

        if hosts == ["all"] or hosts == "all":
            if self._host_access and self._current_user_id:
                hosts = self._host_access.get_allowed_hosts(self._current_user_id)
            else:
                hosts = list(self.config.hosts.keys())

        # Per-host access + governor check before launching parallel tasks
        blocked_hosts = []
        allowed_hosts = []
        for h in hosts:
            if self._host_access and self._current_user_id:
                if not self._host_access.is_host_allowed(self._current_user_id, h):
                    blocked_hosts.append((h, f"Host access denied: {h}"))
                    continue
            allowed, denial, _ = self._govern_command(command, h)
            if not allowed:
                blocked_hosts.append((h, denial))
            else:
                allowed_hosts.append(h)

        async def _run_one(alias: str) -> tuple[str, bool]:
            raw = await self._run_on_host(alias, command, use_workspace=True)
            if isinstance(raw, tuple):
                text, code = raw[0], raw[1]
                host_err = code != 0
            else:
                text = raw
                # e.g. "Unknown or disallowed host: ..." / "Command failed ..."
                host_err = isinstance(raw, str) and raw.startswith(_ERROR_RESULT_PREFIXES)
            text = _truncate_lines(text)
            return f"### {alias}\n```\n{text.strip()}\n```", host_err

        tasks = [_run_one(h) for h in allowed_hosts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        parts = []
        any_run_error = False
        for h, r in zip(allowed_hosts, results):
            if isinstance(r, Exception):
                parts.append(f"### {h}\n```\nError: {r}\n```")
                any_run_error = True
            else:
                markdown, host_err = r  # type: ignore[misc]  # gather() excs are filtered above; cancellation propagates before this
                parts.append(markdown)
                any_run_error = any_run_error or host_err
        for h, denial in blocked_hosts:
            parts.append(f"### {h}\n```\n{denial}\n```")
        aggregate = "\n\n".join(parts)
        # Return a non-zero exit code when any host was preflight-denied
        # (host-access or governor), any host errored, or nothing ran. The
        # aggregate wraps per-host denials in markdown sections, so a
        # string-prefix check in execute() would miss them and report a refused
        # action as ok=True.
        exit_code = 1 if (blocked_hosts or any_run_error or not allowed_hosts) else 0
        return aggregate, exit_code

    # --- Process management ---

    async def _handle_manage_process(self, inp: dict) -> str:
        action = inp.get("action", "list")
        registry = self._process_registry()

        if action == "start":
            command = inp.get("command")
            host = inp.get("host")
            if not command:
                return "command is required for start action."
            if not host:
                return "host is required for start action."
            allowed, denial, _ = self._govern_command(command, host)
            if not allowed:
                return denial
            # Validate host against configured hosts
            resolved = self._resolve_host(host)
            if not resolved:
                return f"Unknown or disallowed host: {host}"
            # Periodic cleanup
            registry.cleanup()
            return await registry.start(host, command)

        elif action == "poll":
            pid = inp.get("pid")
            if pid is None:
                return "pid is required for poll action."
            return registry.poll(int(pid))

        elif action == "write":
            pid = inp.get("pid")
            text = inp.get("input_text", "")
            if pid is None:
                return "pid is required for write action."
            if not text:
                return "input_text is required for write action."
            # Writing to a managed process's stdin can drive an interactive
            # shell — govern the input as a command so a `rm -rf /`-class line
            # is caught, matching run_command.
            allowed, denial, _ = self._govern_command(text)
            if not allowed:
                return denial
            return await registry.write(int(pid), text)

        elif action == "kill":
            pid = inp.get("pid")
            if pid is None:
                return "pid is required for kill action."
            return await registry.kill(int(pid))

        elif action == "list":
            return registry.list_all()

        return f"Unknown action: {action}"
