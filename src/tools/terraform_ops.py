"""Terraform operations helper for the terraform_ops tool.

Builds safe terraform commands for init, plan, apply, output, show,
validate, fmt, state, workspace, import — with shell injection protection.
Apply ALWAYS requires a saved plan file; -auto-approve is never used.
"""

from __future__ import annotations

import shlex

ALLOWED_ACTIONS = frozenset({
    "init", "plan", "apply", "output", "show", "validate",
    "fmt", "state", "workspace", "import",
})


def _sq(value: str) -> str:
    return shlex.quote(value)


def _chdir_flag(params: dict) -> list[str]:
    wd = params.get("working_dir", "")
    if wd:
        return [f"-chdir={_sq(wd)}"]
    return []


def build_terraform_command(action: str, params: dict) -> str:
    """Build a shell command for a terraform action.

    All user-provided values are passed through shlex.quote().
    Apply ALWAYS requires a plan file — -auto-approve is never used.
    """
    if action not in ALLOWED_ACTIONS:
        raise ValueError(
            f"Unknown terraform action: {action}. "
            f"Allowed: {', '.join(sorted(ALLOWED_ACTIONS))}"
        )
    builder = _BUILDERS.get(action)
    if builder is None:
        raise ValueError(f"No builder for action: {action}")
    return builder(params)


def _build_init(params: dict) -> str:
    backend_config = params.get("backend_config") or {}
    upgrade = params.get("upgrade", False)
    reconfigure = params.get("reconfigure", False)
    migrate_state = params.get("migrate_state", False)

    parts = ["terraform"] + _chdir_flag(params) + ["init"]
    if upgrade:
        parts.append("-upgrade")
    if reconfigure:
        parts.append("-reconfigure")
    if migrate_state:
        parts.append("-migrate-state")
    for k, v in (backend_config.items() if isinstance(backend_config, dict) else []):
        parts.append(f"-backend-config={_sq(f'{k}={v}')}")
    parts.append("-input=false")
    return " ".join(parts)


def _build_plan(params: dict) -> str:
    out = params.get("out", "")
    destroy = params.get("destroy", False)
    var = params.get("var") or {}
    var_file = params.get("var_file", "")
    target = params.get("target") or []
    compact_warnings = params.get("compact_warnings", False)

    parts = ["terraform"] + _chdir_flag(params) + ["plan"]
    if destroy:
        parts.append("-destroy")
    for k, v in (var.items() if isinstance(var, dict) else []):
        parts.append(f"-var={_sq(f'{k}={v}')}")
    if var_file:
        parts.append(f"-var-file={_sq(var_file)}")
    for t in (target if isinstance(target, list) else []):
        parts.append(f"-target={_sq(str(t))}")
    if out:
        parts.append(f"-out={_sq(out)}")
    if compact_warnings:
        parts.append("-compact-warnings")
    parts.append("-input=false")
    return " ".join(parts)


def _build_apply(params: dict) -> str:
    plan_file = params.get("plan_file", "")
    if not plan_file:
        raise ValueError(
            "apply requires 'plan_file'. Run plan with out=<file> first, "
            "then apply the saved plan. -auto-approve is never used."
        )
    parts = ["terraform"] + _chdir_flag(params) + ["apply", "-input=false", _sq(plan_file)]
    return " ".join(parts)


def _build_output(params: dict) -> str:
    name = params.get("name", "")
    json_format = params.get("json", False)

    parts = ["terraform"] + _chdir_flag(params) + ["output"]
    if json_format:
        parts.append("-json")
    if name:
        parts.append(_sq(name))
    return " ".join(parts)


def _build_show(params: dict) -> str:
    plan_file = params.get("plan_file", "")
    json_format = params.get("json", False)

    parts = ["terraform"] + _chdir_flag(params) + ["show"]
    if json_format:
        parts.append("-json")
    if plan_file:
        parts.append(_sq(plan_file))
    return " ".join(parts)


def _build_validate(params: dict) -> str:
    json_format = params.get("json", False)

    parts = ["terraform"] + _chdir_flag(params) + ["validate"]
    if json_format:
        parts.append("-json")
    return " ".join(parts)


def _build_fmt(params: dict) -> str:
    check = params.get("check", False)
    diff = params.get("diff", False)
    recursive = params.get("recursive", False)
    path = params.get("path", "")

    parts = ["terraform"] + _chdir_flag(params) + ["fmt"]
    if check:
        parts.append("-check")
    if diff:
        parts.append("-diff")
    if recursive:
        parts.append("-recursive")
    if path:
        parts.append(_sq(path))
    return " ".join(parts)


def _build_state(params: dict) -> str:
    subaction = params.get("subaction", "list")
    allowed = {"list", "show", "mv", "rm", "pull"}
    if subaction not in allowed:
        raise ValueError(
            f"Unknown state subaction: {subaction}. "
            f"Allowed: {', '.join(sorted(allowed))}"
        )

    parts = ["terraform"] + _chdir_flag(params) + ["state", subaction]

    if subaction == "list":
        id_filter = params.get("id", "")
        if id_filter:
            parts.append(f"-id={_sq(id_filter)}")
    elif subaction == "show":
        address = params.get("address", "")
        if not address:
            raise ValueError("state show requires 'address'")
        parts.append(_sq(address))
    elif subaction == "mv":
        source = params.get("source", "")
        destination = params.get("destination", "")
        if not source or not destination:
            raise ValueError("state mv requires 'source' and 'destination'")
        parts += [_sq(source), _sq(destination)]
    elif subaction == "rm":
        address = params.get("address", "")
        if not address:
            raise ValueError("state rm requires 'address'")
        parts.append(_sq(address))

    return " ".join(parts)


def _build_workspace(params: dict) -> str:
    subaction = params.get("subaction", "list")
    allowed = {"list", "select", "new", "delete", "show"}
    if subaction not in allowed:
        raise ValueError(
            f"Unknown workspace subaction: {subaction}. "
            f"Allowed: {', '.join(sorted(allowed))}"
        )

    parts = ["terraform"] + _chdir_flag(params) + ["workspace", subaction]

    if subaction in ("select", "new", "delete"):
        name = params.get("name", "")
        if not name:
            raise ValueError(f"workspace {subaction} requires 'name'")
        parts.append(_sq(name))

    return " ".join(parts)


def _build_import(params: dict) -> str:
    address = params.get("address", "")
    if not address:
        raise ValueError("import requires 'address'")
    resource_id = params.get("id", "")
    if not resource_id:
        raise ValueError("import requires 'id'")
    var = params.get("var") or {}
    var_file = params.get("var_file", "")

    parts = ["terraform"] + _chdir_flag(params) + ["import"]
    for k, v in (var.items() if isinstance(var, dict) else []):
        parts.append(f"-var={_sq(f'{k}={v}')}")
    if var_file:
        parts.append(f"-var-file={_sq(var_file)}")
    parts.append("-input=false")
    parts += [_sq(address), _sq(resource_id)]
    return " ".join(parts)


_BUILDERS = {
    "init": _build_init,
    "plan": _build_plan,
    "apply": _build_apply,
    "output": _build_output,
    "show": _build_show,
    "validate": _build_validate,
    "fmt": _build_fmt,
    "state": _build_state,
    "workspace": _build_workspace,
    "import": _build_import,
}
