"""DevOps handler domain — git_ops, kubectl, docker_ops, terraform_ops
(RFC-004 P5, wave 2).

Bodies moved VERBATIM from executor.py; the only mechanical adjustment is
lazy relative imports re-anchored one level (``.git_ops`` → ``..git_ops``
etc.).
"""

from __future__ import annotations

from ..tool_text import _truncate_lines
from .deps import HandlerBase


class DevOpsTools(HandlerBase):
    async def _handle_git_ops(self, inp: dict) -> str | tuple[str, int]:
        from ..git_ops import ALLOWED_ACTIONS, build_git_command

        action = inp.get("action", "")
        if action not in ALLOWED_ACTIONS:
            return f"Unknown git action: {action}. Allowed: {', '.join(sorted(ALLOWED_ACTIONS))}"

        host = inp.get("host", "")
        resolved = self._resolve_host(host)
        if not resolved:
            return f"Unknown or disallowed host: {host}"
        address, ssh_user, _os = resolved

        params = inp.get("params") or {}

        try:
            cmds = build_git_command(action, params)
        except ValueError as e:
            return f"git_ops error: {e}"

        if action == "push":
            # action == 'push' always builds the 2-element list form.
            freshness_cmd, push_cmd = cmds  # type: ignore[str-unpack]
            allowed, denial, _ = self._govern_command(push_cmd, host)
            if not allowed:
                return denial
            code, output = await self._exec_command(
                address,
                freshness_cmd,
                ssh_user,
            )
            if code != 0:
                return f"Branch freshness check failed (exit {code}):\n{output}", code
            if output.strip().startswith("STALE:"):
                return f"Push blocked — {output.strip().split(':', 1)[1].strip()}", 1
            code, output = await self._exec_command(
                address,
                push_cmd,
                ssh_user,
            )
            if code != 0:
                return f"Push failed (exit {code}):\n{_truncate_lines(output)}", code
            return (
                _truncate_lines(output) if output.strip() else "Push completed successfully."
            ), 0
        else:
            cmd = cmds
            allowed, denial, _ = self._govern_command(cmd, host)
            if not allowed:
                return denial
            code, output = await self._exec_command(address, cmd, ssh_user)
            if code != 0:
                return f"git {action} failed (exit {code}):\n{_truncate_lines(output)}", code
            return (
                _truncate_lines(output)
                if output.strip()
                else f"git {action} completed successfully."
            ), 0

    async def _handle_kubectl(self, inp: dict) -> str | tuple[str, int]:
        from ..kubectl_ops import ALLOWED_ACTIONS as KUBECTL_ACTIONS
        from ..kubectl_ops import build_kubectl_command

        action = inp.get("action", "")
        if action not in KUBECTL_ACTIONS:
            return (
                f"Unknown kubectl action: {action}. Allowed: {', '.join(sorted(KUBECTL_ACTIONS))}"
            )

        host = inp.get("host", "")
        resolved = self._resolve_host(host)
        if not resolved:
            return f"Unknown or disallowed host: {host}"
        address, ssh_user, _os = resolved

        params = inp.get("params") or {}

        try:
            cmd = build_kubectl_command(action, params)
        except ValueError as e:
            return f"kubectl error: {e}"

        allowed, denial, _ = self._govern_command(cmd, host)
        if not allowed:
            return denial

        code, output = await self._exec_command(address, cmd, ssh_user)
        if code != 0:
            return f"kubectl {action} failed (exit {code}):\n{_truncate_lines(output)}", code
        return (
            _truncate_lines(output)
            if output.strip()
            else f"kubectl {action} completed successfully."
        ), 0

    async def _handle_docker_ops(self, inp: dict) -> str | tuple[str, int]:
        from ..docker_ops import ALLOWED_ACTIONS as DOCKER_ACTIONS
        from ..docker_ops import build_docker_command

        action = inp.get("action", "")
        if action not in DOCKER_ACTIONS:
            return f"Unknown docker action: {action}. Allowed: {', '.join(sorted(DOCKER_ACTIONS))}"

        host = inp.get("host", "")
        resolved = self._resolve_host(host)
        if not resolved:
            return f"Unknown or disallowed host: {host}"
        address, ssh_user, _os = resolved

        params = inp.get("params") or {}

        try:
            cmd = build_docker_command(action, params)
        except ValueError as e:
            return f"docker_ops error: {e}"

        allowed, denial, _ = self._govern_command(cmd, host)
        if not allowed:
            return denial

        code, output = await self._exec_command(address, cmd, ssh_user)
        if code != 0:
            return f"docker {action} failed (exit {code}):\n{_truncate_lines(output)}", code
        return (
            _truncate_lines(output)
            if output.strip()
            else f"docker {action} completed successfully."
        ), 0

    async def _handle_terraform_ops(self, inp: dict) -> str | tuple[str, int]:
        from ..terraform_ops import ALLOWED_ACTIONS as TF_ACTIONS
        from ..terraform_ops import build_terraform_command

        action = inp.get("action", "")
        if action not in TF_ACTIONS:
            return f"Unknown terraform action: {action}. Allowed: {', '.join(sorted(TF_ACTIONS))}"

        host = inp.get("host", "")
        resolved = self._resolve_host(host)
        if not resolved:
            return f"Unknown or disallowed host: {host}"
        address, ssh_user, _os = resolved

        params = inp.get("params") or {}

        try:
            cmd = build_terraform_command(action, params)
        except ValueError as e:
            return f"terraform_ops error: {e}"

        allowed, denial, _ = self._govern_command(cmd, host)
        if not allowed:
            return denial

        code, output = await self._exec_command(address, cmd, ssh_user)
        if code != 0:
            return f"terraform {action} failed (exit {code}):\n{_truncate_lines(output)}", code
        return (
            _truncate_lines(output)
            if output.strip()
            else f"terraform {action} completed successfully."
        ), 0
