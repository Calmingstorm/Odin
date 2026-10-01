"""Local shell selection. No cached alias discovery or execution-based probes."""
from __future__ import annotations

import os
import shutil
import signal
from dataclasses import dataclass


@dataclass(frozen=True)
class ShellChoice:
    name: str
    executable: str


def resolve_local_shell(mode: str = "auto") -> ShellChoice:
    """Resolve anew on the actual local execution target, before dispatch."""
    if mode not in {"auto", "bash", "sh"}:
        raise ValueError("tools.command_shell must be auto, bash or sh")
    if mode != "sh":
        bash = shutil.which("bash")
        if bash:
            return ShellChoice("bash", os.path.abspath(bash))
        if mode == "bash":
            raise FileNotFoundError(
                "tools.command_shell=bash: bash is unavailable; command not executed"
            )
    return ShellChoice("sh", "/bin/sh")


def shell_environment(choice: ShellChoice, env=None) -> dict[str, str]:
    values = dict(os.environ if env is None else env)
    if choice.name == "bash":
        for key in list(values):
            if key in {"BASH_ENV", "ENV", "SHELLOPTS", "BASHOPTS"} or key.startswith("BASH_FUNC_"):
                del values[key]
    return values


def signal_name(returncode: int | None) -> str | None:
    if returncode is None or returncode >= 0:
        return None
    try:
        return signal.Signals(-returncode).name
    except ValueError:
        return f"signal {-returncode}"


class CommandOutput(str):
    """Preserve the tuple API without deriving outcomes from untrusted stdout."""
    effective_shell: str
    termination_reason: str | None
    raw_returncode: int | None

    def __new__(cls, text: str, *, shell: str, reason: str | None = None,
                returncode: int | None = None):
        value = super().__new__(cls, text)
        value.effective_shell = shell
        value.termination_reason = reason
        value.raw_returncode = returncode
        return value


def raw_command_result(code: int, output: str) -> str:
    """Legacy host transport text; optional metadata never changes its bytes."""
    if code == 0:
        return output
    text = f"Command failed (exit {code}):\n{output}"
    if isinstance(output, CommandOutput):
        return CommandOutput(text, shell=output.effective_shell,
                             reason=output.termination_reason, returncode=output.raw_returncode)
    return text


def format_command_result(
    code: int, output: str, *, label: str = "Command",
) -> str:
    reason = getattr(output, "termination_reason", None)
    raw = getattr(output, "raw_returncode", code)
    if reason == "timeout":
        text = f"{label} timed out (exit {raw if raw is not None else code}):\n{output}"
    elif code != 0:
        text = f"{label} failed (exit {code}):\n{output}"
    else:
        text = str(output)
    details = []
    if sig := signal_name(raw):
        details.append(f"signal={sig}")
    if reason:
        details.append(f"termination_reason={reason}")
    if details:
        text += "\n[command execution] " + " ".join(details)
    from .execution_outcome import ToolFailure

    if reason == "timeout" or code != 0 or isinstance(output, ToolFailure):
        value = ToolFailure(
            text, uncertain_outcome=getattr(output, "uncertain_outcome", False),
        )
        for name in ("effective_shell", "termination_reason", "raw_returncode"):
            if hasattr(output, name):
                setattr(value, name, getattr(output, name))
        return value
    return text


def apply_shell_contracts(definitions: list[dict], mode: str = "auto") -> list[dict]:
    try:
        choice = resolve_local_shell(mode)
        local = f"{choice.name} ({choice.executable})"
    except FileNotFoundError:
        local = "bash unavailable: local commands refuse before execution"
    clauses = {
        "run_command": (
            f" Local effective shell: {local}; tools.command_shell={mode}. "
            "Remote foreground uses the remote account's login shell. "
            "No automatic pipefail or errexit."
        ),
        "run_command_multi": (
            f" Local effective shell: {local}; "
            "remote foreground uses the remote account's login shell."
        ),
        "manage_process": (
            f" New local jobs use {local}; tools.command_shell={mode}. "
            "Remote background jobs use /bin/sh. Each job records its shell at creation; "
            "config changes never change running jobs or cleanup."
        ),
        "run_script": (
            " Script language is its explicit interpreter (default bash), "
            "not tools.command_shell. The local command wrapper always uses /bin/sh; "
            "remote wrappers use the remote account's login shell."
        ),
        "validate_action": (
            f" Local type=command checks use {local}; tools.command_shell={mode}. "
            "Code-built non-command probes always use /bin/sh locally, independent of this setting."
        ),
    }
    return [
        {**tool, "description": tool["description"] + clauses.get(tool["name"], "")}
        for tool in definitions
    ]
