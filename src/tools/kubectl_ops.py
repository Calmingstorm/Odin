"""Kubectl operations helper for the kubectl tool.

Builds safe kubectl commands for get, describe, logs, apply, delete,
exec, rollout, scale, top, and config — with shell injection protection.
"""

from __future__ import annotations

import shlex

ALLOWED_ACTIONS = frozenset({
    "get", "describe", "logs", "apply", "delete", "exec",
    "rollout", "scale", "top", "config",
})

_MAX_LOG_LINES = 500
_DEFAULT_LOG_LINES = 100


def _sq(value: str) -> str:
    return shlex.quote(value)


def _common_flags(params: dict) -> list[str]:
    """Build common kubectl flags: --namespace, --context, --kubeconfig."""
    flags: list[str] = []
    ns = params.get("namespace", "")
    if ns:
        flags += ["-n", _sq(ns)]
    ctx = params.get("context", "")
    if ctx:
        flags += ["--context", _sq(ctx)]
    kubeconfig = params.get("kubeconfig", "")
    if kubeconfig:
        flags += ["--kubeconfig", _sq(kubeconfig)]
    return flags


def build_kubectl_command(action: str, params: dict) -> str:
    """Build a shell command for a kubectl action.

    Returns a single command string.  All user-provided values are
    passed through shlex.quote() for shell injection protection.
    """
    if action not in ALLOWED_ACTIONS:
        raise ValueError(
            f"Unknown kubectl action: {action}. "
            f"Allowed: {', '.join(sorted(ALLOWED_ACTIONS))}"
        )
    builder = _BUILDERS.get(action)
    if builder is None:
        raise ValueError(f"No builder for action: {action}")
    return builder(params)


def _build_get(params: dict) -> str:
    resource = params.get("resource", "")
    if not resource:
        raise ValueError("get requires 'resource' (e.g. pods, deployments, svc)")
    name = params.get("name", "")
    output = params.get("output", "")
    selector = params.get("selector", "")
    all_namespaces = params.get("all_namespaces", False)

    parts = ["kubectl", "get", _sq(resource)]
    parts += _common_flags(params)
    if name:
        parts.append(_sq(name))
    if all_namespaces:
        parts.append("--all-namespaces")
    if output:
        allowed_outputs = {"json", "yaml", "wide", "name", "jsonpath"}
        base_output = output.split("=")[0] if "=" in output else output
        if base_output in allowed_outputs:
            parts += ["-o", _sq(output)]
    if selector:
        parts += ["-l", _sq(selector)]
    return " ".join(parts)


def _build_describe(params: dict) -> str:
    resource = params.get("resource", "")
    if not resource:
        raise ValueError("describe requires 'resource'")
    name = params.get("name", "")

    parts = ["kubectl", "describe", _sq(resource)]
    parts += _common_flags(params)
    if name:
        parts.append(_sq(name))
    return " ".join(parts)


def _build_logs(params: dict) -> str:
    pod = params.get("pod", "")
    if not pod:
        raise ValueError("logs requires 'pod'")
    container = params.get("container", "")
    tail = params.get("tail")
    previous = params.get("previous", False)
    since = params.get("since", "")
    follow = params.get("follow", False)
    selector = params.get("selector", "")

    parts = ["kubectl", "logs"]
    parts += _common_flags(params)

    if selector:
        parts += ["-l", _sq(selector)]
    else:
        parts.append(_sq(pod))

    if container:
        parts += ["-c", _sq(container)]
    if previous:
        parts.append("--previous")
    if since:
        parts += ["--since", _sq(since)]
    if follow:
        parts.append("--follow")

    if tail is not None:
        try:
            t = int(tail)
            if t < 1:
                t = _DEFAULT_LOG_LINES
            t = min(t, _MAX_LOG_LINES)
        except (TypeError, ValueError):
            t = _DEFAULT_LOG_LINES
        parts += ["--tail", str(t)]
    else:
        parts += ["--tail", str(_DEFAULT_LOG_LINES)]
    return " ".join(parts)


def _build_apply(params: dict) -> str:
    file = params.get("file", "")
    kustomize = params.get("kustomize", "")
    dry_run = params.get("dry_run", False)

    if not file and not kustomize:
        raise ValueError("apply requires 'file' (path or URL) or 'kustomize' (directory)")

    parts = ["kubectl", "apply"]
    parts += _common_flags(params)
    if kustomize:
        parts += ["-k", _sq(kustomize)]
    else:
        parts += ["-f", _sq(file)]
    if dry_run:
        parts.append("--dry-run=client")
    return " ".join(parts)


def _build_delete(params: dict) -> str:
    resource = params.get("resource", "")
    if not resource:
        raise ValueError("delete requires 'resource'")
    name = params.get("name", "")
    selector = params.get("selector", "")
    force = params.get("force", False)
    grace_period = params.get("grace_period")

    parts = ["kubectl", "delete", _sq(resource)]
    parts += _common_flags(params)
    if name:
        parts.append(_sq(name))
    if selector:
        parts += ["-l", _sq(selector)]
    if force:
        parts.append("--force")
    if grace_period is not None:
        try:
            gp = int(grace_period)
            if gp >= 0:
                parts += ["--grace-period", str(gp)]
        except (TypeError, ValueError):
            pass
    return " ".join(parts)


def _build_exec(params: dict) -> str:
    pod = params.get("pod", "")
    if not pod:
        raise ValueError("exec requires 'pod'")
    command = params.get("command", "")
    if not command:
        raise ValueError("exec requires 'command'")
    container = params.get("container", "")

    parts = ["kubectl", "exec"]
    parts += _common_flags(params)
    parts.append(_sq(pod))
    if container:
        parts += ["-c", _sq(container)]
    parts += ["--", "sh", "-c", _sq(command)]
    return " ".join(parts)


def _build_rollout(params: dict) -> str:
    subaction = params.get("subaction", "status")
    allowed_subs = {"status", "restart", "undo", "history", "pause", "resume"}
    if subaction not in allowed_subs:
        raise ValueError(
            f"rollout subaction must be one of: {', '.join(sorted(allowed_subs))}"
        )
    resource = params.get("resource", "")
    if not resource:
        raise ValueError("rollout requires 'resource' (e.g. deployment/my-app)")

    parts = ["kubectl", "rollout", subaction]
    parts += _common_flags(params)
    parts.append(_sq(resource))
    return " ".join(parts)


def _build_scale(params: dict) -> str:
    resource = params.get("resource", "")
    if not resource:
        raise ValueError("scale requires 'resource' (e.g. deployment/my-app)")
    replicas = params.get("replicas")
    if replicas is None:
        raise ValueError("scale requires 'replicas'")
    try:
        r = int(replicas)
        if r < 0:
            raise ValueError("replicas must be >= 0")
    except (TypeError, ValueError) as e:
        if "replicas must be" in str(e):
            raise
        raise ValueError("replicas must be an integer") from e

    parts = ["kubectl", "scale"]
    parts += _common_flags(params)
    parts.append(_sq(resource))
    parts += ["--replicas", str(r)]
    return " ".join(parts)


def _build_top(params: dict) -> str:
    resource = params.get("resource", "")
    if not resource:
        resource = "pods"
    allowed_resources = {"pods", "nodes", "pod", "node"}
    if resource not in allowed_resources:
        raise ValueError(f"top resource must be 'pods' or 'nodes', got: {resource}")
    name = params.get("name", "")
    selector = params.get("selector", "")
    containers = params.get("containers", False)

    parts = ["kubectl", "top", resource]
    parts += _common_flags(params)
    if name:
        parts.append(_sq(name))
    if selector:
        parts += ["-l", _sq(selector)]
    if containers and resource in ("pods", "pod"):
        parts.append("--containers")
    return " ".join(parts)


def _build_config(params: dict) -> str:
    subaction = params.get("subaction", "get-contexts")
    allowed_subs = {"get-contexts", "use-context", "current-context", "view"}
    if subaction not in allowed_subs:
        raise ValueError(
            f"config subaction must be one of: {', '.join(sorted(allowed_subs))}"
        )

    parts = ["kubectl", "config", subaction]
    kubeconfig = params.get("kubeconfig", "")
    if kubeconfig:
        parts += ["--kubeconfig", _sq(kubeconfig)]

    if subaction == "use-context":
        ctx_name = params.get("context_name", "")
        if not ctx_name:
            raise ValueError("config use-context requires 'context_name'")
        parts.append(_sq(ctx_name))
    elif subaction == "view":
        parts.append("--minify")
    return " ".join(parts)


_BUILDERS = {
    "get": _build_get,
    "describe": _build_describe,
    "logs": _build_logs,
    "apply": _build_apply,
    "delete": _build_delete,
    "exec": _build_exec,
    "rollout": _build_rollout,
    "scale": _build_scale,
    "top": _build_top,
    "config": _build_config,
}
