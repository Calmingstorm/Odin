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


class ShellUnavailableError(FileNotFoundError):
    """An explicit shell setting refused dispatch, not a subprocess failure."""


def resolve_local_shell(mode: str = "auto") -> ShellChoice:
    """Resolve anew on the actual local execution target, before dispatch."""
    if mode not in {"auto", "bash", "sh"}:
        raise ValueError("tools.command_shell must be auto, bash or sh")
    if mode != "sh":
        bash = shutil.which("bash")
        if bash:
            return ShellChoice("bash", os.path.abspath(bash))
        if mode == "bash":
            raise ShellUnavailableError(
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
    if reason == "shell_unavailable":
        text = str(output)
    elif reason == "timeout":
        text = f"{label} timed out (exit {raw if raw is not None else code}):\n{output}"
    elif code != 0:
        text = f"{label} failed (exit {code}):\n{output}"
    else:
        text = str(output)
    details = []
    if sig := signal_name(raw):
        details.append(f"signal={sig}")
    if reason and reason != "shell_unavailable":
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
        command = f"Local commands run under {choice.name}"
        jobs = f"New local jobs run under {choice.name}"
        checks = f"Local command checks run under {choice.name}"
    except FileNotFoundError:
        command = "New local commands are refused because bash is required but not installed"
        jobs = "New local jobs are refused because bash is required but not installed"
        checks = "New local command checks are refused because bash is required but not installed"
    foreground = f"{command}; remote commands use the remote account's login shell."
    clauses = {
        "run_command": foreground,
        "run_command_multi": foreground,
        "manage_process": f"{jobs}; remote jobs run under /bin/sh.",
        "validate_action": f"{checks}; remote command checks use the remote account's login shell.",
    }
    # Replace our own decoration on cached catalogs, preserving the footer.
    markers = {
        "run_command": (" Local commands run under ", " New local commands are refused because "),
        "run_command_multi": (
            " Local commands run under ", " New local commands are refused because ",
        ),
        "manage_process": (" New local jobs run under ", " New local jobs are refused because "),
        "validate_action": (
            " Local command checks run under ", " New local command checks are refused because ",
        ),
    }
    result = []
    for tool in definitions:
        name = tool["name"]
        description = tool["description"]
        if name in clauses:
            body, separator, footer = description.partition("\n\n[affordances:")
            for marker in markers[name]:
                body = body.partition(marker)[0]
            description = body + " " + clauses[name] + separator + footer
        result.append({**tool, "description": description})
    return result
