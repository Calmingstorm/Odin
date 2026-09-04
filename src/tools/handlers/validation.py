"""Validation handler domain — validate_action (RFC-004 P6, wave 3).

Body moved VERBATIM from executor.py; the lazy ``.post_validation`` import
re-anchored one level. The command governor is reached live through deps
(the body's ``getattr(self, "command_governor", None)`` sees the property).
"""

from __future__ import annotations

from ...odin_log import get_logger
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

        async def _exec(
            _address: str,
            command: str,
            _ssh_user: str,
            *,
            timeout: int,
            use_workspace: bool = False,
        ) -> tuple[int, str]:
            # Never mutate shared state here — concurrent checks would race.
            # _exec_command accepts a per-call timeout, which is honored
            # directly by the SSH/local primitives without touching self.
            if governor is not None:
                try:
                    decision = governor.check(command)
                except Exception as ge:
                    # Fail-closed on governor exceptions: we advertise
                    # command-type checks as going through the governor;
                    # silently bypassing it if the governor blows up would
                    # be exactly the "safe unless error path" foot-gun
                    # Odin flagged. Emit the error into the result so the
                    # operator sees it, and treat the check as errored.
                    log.exception("governor check raised for validation command")
                    return 1, f"validate_action: governor check raised {type(ge).__name__}: {ge}"
                if not decision.allowed:
                    return 1, f"governor-blocked: {decision.denial_message()}"
            # Forwarded per check from run_bundle: True only for type=command
            # (user-supplied text, a raw command route like run_command —
            # round 10); fixed-shape probes must keep pre-PR cwd semantics so
            # an unusable workspace cannot disable service/process/http/port
            # validation (round 11).
            # resolve_host returns the alias in its address slot deliberately,
            # so the generation-bound target is acquired here after the
            # per-check governor decision.
            alias = _address
            lease = self._acquire_host(alias)
            if lease is None:
                return 1, f"unknown host alias: {alias}"
            with lease:
                target = lease.target
                return await lease.run(
                    lambda: self._exec_command(
                        target.address,
                        command,
                        target.ssh_user,
                        timeout=timeout,
                        use_workspace=use_workspace,
                        target=target,
                    )
                )

        report = await run_bundle(
            raw_checks,
            bundle_name=bundle_name,
            default_host=default_host,
            resolve_host=lambda alias: (
                (alias, "", "") if self._resolve_host(alias) is not None else None
            ),
            exec_command=_exec,
            grace_seconds=grace_seconds,
            max_parallel=max_parallel,
        )

        if fmt == "json":
            return report_as_json(report)
        return format_report_summary(report)
