"""Validation handler domain — validate_action (RFC-004 P6, wave 3).

The command governor is reached live through deps. Each check binds one host
lease before probe construction and keeps its OS and transport target together.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

from ...odin_log import get_logger
from ..hosts.registry import HostLease
from .deps import HandlerBase

log = get_logger("tools")


class ValidationTools(HandlerBase):
    @property
    def command_governor(self):
        return self._deps.command_governor()

    async def _handle_validate_action(self, inp: dict) -> str:
        from ..post_validation import (
            format_report_summary,
            report_as_json,
            run_bundle,
        )

        raw_checks = inp.get("checks")
        if not isinstance(raw_checks, list) or not raw_checks:
            return (
                "Error: 'checks' must be a non-empty list. See tool description for check schema."
            )

        bundle_name = str(inp.get("bundle_name") or "unnamed").strip()[:120]
        default_host = inp.get("default_host")
        default_host = str(default_host).strip() if default_host else None
        if not default_host:
            default_host = self._resolve_default_host(self._current_user_id) or None
        grace_seconds = int(inp.get("grace_seconds") or 0)
        grace_seconds = max(0, min(grace_seconds, 60))
        max_parallel = int(inp.get("max_parallel") or 12)
        fmt = str(inp.get("format") or "summary").strip().lower()

        governor = getattr(self, "command_governor", None)
        active_lease: ContextVar[HostLease | None] = ContextVar(
            "validation_host_lease", default=None,
        )

        @contextmanager
        def _bind_host(alias: str) -> Iterator[tuple[str, str, str] | None]:
            # Pin before building the OS-specific command. Acquiring after the
            # governor could execute an old-OS probe on a newly published host.
            lease = self._acquire_host(alias)
            if lease is None:
                yield None
                return
            with lease:
                token = active_lease.set(lease)
                try:
                    yield alias, "", lease.target.os
                finally:
                    active_lease.reset(token)

        async def _exec(
            _address: str,
            command: str,
            _ssh_user: str,
            *,
            timeout: int,
            use_workspace: bool = False,
            use_command_shell: bool = False,
        ) -> tuple[int, str]:
            lease = active_lease.get()
            if lease is None or lease.target.alias != _address:
                raise PermissionError(f"unbound validation host alias: {_address}")
            # Never mutate shared state here — concurrent checks would race.
            # _exec_command accepts a per-call timeout, which is honored
            # directly by the SSH/local primitives without touching self.
            if governor is not None:
                try:
                    # Use the shared run_command admission path: it carries
                    # the task-local requester tier and exact effective alias.
                    allowed, denial, _note = self._govern_command(command, _address)
                except Exception as ge:
                    # Fail-closed on governor exceptions: we advertise
                    # command-type checks as going through the governor;
                    # silently bypassing it if the governor blows up would
                    # be exactly the "safe unless error path" foot-gun
                    # Odin flagged. Emit the error into the result so the
                    # operator sees it, and treat the check as errored.
                    log.exception("governor check raised for validation command")
                    raise RuntimeError(
                        f"validate_action: governor check raised {type(ge).__name__}: {ge}"
                    ) from ge
                if not allowed:
                    raise PermissionError(f"governor-blocked: {denial}")
            # Forwarded per check from run_bundle: True only for type=command
            # (user-supplied text, a raw command route like run_command —
            # round 10); fixed-shape probes must keep pre-PR cwd semantics so
            # an unusable workspace cannot disable service/process/http/port
            # validation (round 11).
            # _bind_host returns the alias for governor admission, while this
            # task-local lease supplies BOTH metadata and exact transport target.
            # wait_for's child task inherits the context, never a shared alias map.
            target = lease.target
            return await lease.run(
                lambda: self._exec_command(
                    target.address,
                    command,
                    target.ssh_user,
                    timeout=timeout,
                    use_workspace=use_workspace,
                    target=target,
                    use_command_shell=use_command_shell,
                )
            )

        report = await run_bundle(
            raw_checks,
            bundle_name=bundle_name,
            default_host=default_host,
            resolve_host=self._resolve_host,
            bind_host=_bind_host,
            exec_command=_exec,
            grace_seconds=grace_seconds,
            max_parallel=max_parallel,
        )

        if fmt == "json":
            return report_as_json(report)
        return format_report_summary(report)
