"""Docker operations helper for the docker_ops tool.

Builds safe docker/docker-compose commands for ps, run, exec, logs,
build, pull, stop, rm, inspect, stats, compose_up, compose_down,
compose_ps, compose_logs — with shell injection protection.
"""

from __future__ import annotations

import shlex

ALLOWED_ACTIONS = frozenset({
    "ps", "run", "exec", "logs", "build", "pull", "stop", "rm",
    "inspect", "stats", "compose_up", "compose_down", "compose_ps",
    "compose_logs",
})

_MAX_LOG_LINES = 500
_DEFAULT_LOG_LINES = 100


def _sq(value: str) -> str:
    return shlex.quote(value)


def build_docker_command(action: str, params: dict) -> str:
    """Build a shell command for a docker action.

    All user-provided values are passed through shlex.quote().
    """
    if action not in ALLOWED_ACTIONS:
        raise ValueError(
            f"Unknown docker action: {action}. "
            f"Allowed: {', '.join(sorted(ALLOWED_ACTIONS))}"
        )
    builder = _BUILDERS.get(action)
    if builder is None:
        raise ValueError(f"No builder for action: {action}")
    return builder(params)


def _build_ps(params: dict) -> str:
    all_containers = params.get("all", False)
    filter_str = params.get("filter", "")
    format_str = params.get("format", "")

    parts = ["docker", "ps"]
    if all_containers:
        parts.append("-a")
    if filter_str:
        parts += ["--filter", _sq(filter_str)]
    if format_str:
        parts += ["--format", _sq(format_str)]
    return " ".join(parts)


def _build_run(params: dict) -> str:
    image = params.get("image", "")
    if not image:
        raise ValueError("run requires 'image'")
    command = params.get("command", "")
    name = params.get("name", "")
    detach = params.get("detach", False)
    rm = params.get("rm", False)
    env = params.get("env") or {}
    ports = params.get("ports") or []
    volumes = params.get("volumes") or []
    network = params.get("network", "")
    extra_args = params.get("extra_args", "")

    parts = ["docker", "run"]
    if detach:
        parts.append("-d")
    if rm:
        parts.append("--rm")
    if name:
        parts += ["--name", _sq(name)]
    if network:
        parts += ["--network", _sq(network)]
    for k, v in (env.items() if isinstance(env, dict) else []):
        parts += ["-e", _sq(f"{k}={v}")]
    for p in (ports if isinstance(ports, list) else []):
        parts += ["-p", _sq(str(p))]
    for v in (volumes if isinstance(volumes, list) else []):
        parts += ["-v", _sq(str(v))]
    if extra_args:
        parts.append(extra_args)
    parts.append(_sq(image))
    if command:
        parts += ["sh", "-c", _sq(command)]
    return " ".join(parts)


def _build_exec(params: dict) -> str:
    container = params.get("container", "")
    if not container:
        raise ValueError("exec requires 'container'")
    command = params.get("command", "")
    if not command:
        raise ValueError("exec requires 'command'")
    workdir = params.get("workdir", "")
    env = params.get("env") or {}
    user = params.get("user", "")

    parts = ["docker", "exec"]
    if workdir:
        parts += ["-w", _sq(workdir)]
    if user:
        parts += ["-u", _sq(user)]
    for k, v in (env.items() if isinstance(env, dict) else []):
        parts += ["-e", _sq(f"{k}={v}")]
    parts.append(_sq(container))
    parts += ["sh", "-c", _sq(command)]
    return " ".join(parts)


def _build_logs(params: dict) -> str:
    container = params.get("container", "")
    if not container:
        raise ValueError("logs requires 'container'")
    tail = params.get("tail")
    since = params.get("since", "")
    follow = params.get("follow", False)
    timestamps = params.get("timestamps", False)

    parts = ["docker", "logs"]

    if follow:
        parts.append("--follow")
    if timestamps:
        parts.append("--timestamps")
    if since:
        parts += ["--since", _sq(since)]

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

    parts.append(_sq(container))
    return " ".join(parts)


def _build_build(params: dict) -> str:
    path = params.get("path", ".")
    tag = params.get("tag", "")
    dockerfile = params.get("dockerfile", "")
    no_cache = params.get("no_cache", False)
    build_args = params.get("build_args") or {}
    target = params.get("target", "")

    parts = ["docker", "build"]
    if tag:
        parts += ["-t", _sq(tag)]
    if dockerfile:
        parts += ["-f", _sq(dockerfile)]
    if target:
        parts += ["--target", _sq(target)]
    if no_cache:
        parts.append("--no-cache")
    for k, v in (build_args.items() if isinstance(build_args, dict) else []):
        parts += ["--build-arg", _sq(f"{k}={v}")]
    parts.append(_sq(path))
    return " ".join(parts)


def _build_pull(params: dict) -> str:
    image = params.get("image", "")
    if not image:
        raise ValueError("pull requires 'image'")
    parts = ["docker", "pull", _sq(image)]
    return " ".join(parts)


def _build_stop(params: dict) -> str:
    container = params.get("container", "")
    if not container:
        raise ValueError("stop requires 'container'")
    timeout = params.get("timeout")

    parts = ["docker", "stop"]
    if timeout is not None:
        try:
            t = int(timeout)
            if t >= 0:
                parts += ["-t", str(t)]
        except (TypeError, ValueError):
            pass
    parts.append(_sq(container))
    return " ".join(parts)


def _build_rm(params: dict) -> str:
    container = params.get("container", "")
    if not container:
        raise ValueError("rm requires 'container'")
    force = params.get("force", False)
    volumes = params.get("volumes", False)

    parts = ["docker", "rm"]
    if force:
        parts.append("-f")
    if volumes:
        parts.append("-v")
    parts.append(_sq(container))
    return " ".join(parts)


def _build_inspect(params: dict) -> str:
    target = params.get("target", "")
    if not target:
        raise ValueError("inspect requires 'target' (container or image name/ID)")
    format_str = params.get("format", "")

    parts = ["docker", "inspect"]
    if format_str:
        parts += ["--format", _sq(format_str)]
    parts.append(_sq(target))
    return " ".join(parts)


def _build_stats(params: dict) -> str:
    container = params.get("container", "")
    no_stream = params.get("no_stream", True)
    format_str = params.get("format", "")

    parts = ["docker", "stats"]
    if no_stream:
        parts.append("--no-stream")
    if format_str:
        parts += ["--format", _sq(format_str)]
    if container:
        parts.append(_sq(container))
    return " ".join(parts)


def _compose_file_flags(params: dict) -> list[str]:
    """Build docker compose -f flags from params."""
    flags: list[str] = []
    file = params.get("file", "")
    if file:
        flags += ["-f", _sq(file)]
    return flags


def _build_compose_up(params: dict) -> str:
    services = params.get("services") or []
    detach = params.get("detach", True)
    build = params.get("build", False)
    force_recreate = params.get("force_recreate", False)
    project = params.get("project", "")

    parts = ["docker", "compose"]
    parts += _compose_file_flags(params)
    if project:
        parts += ["-p", _sq(project)]
    parts.append("up")
    if detach:
        parts.append("-d")
    if build:
        parts.append("--build")
    if force_recreate:
        parts.append("--force-recreate")
    for s in (services if isinstance(services, list) else []):
        parts.append(_sq(str(s)))
    return " ".join(parts)


def _build_compose_down(params: dict) -> str:
    remove_volumes = params.get("remove_volumes", False)
    remove_images = params.get("remove_images", "")
    project = params.get("project", "")

    parts = ["docker", "compose"]
    parts += _compose_file_flags(params)
    if project:
        parts += ["-p", _sq(project)]
    parts.append("down")
    if remove_volumes:
        parts.append("-v")
    if remove_images:
        allowed = {"all", "local"}
        if remove_images in allowed:
            parts += ["--rmi", remove_images]
    return " ".join(parts)


def _build_compose_ps(params: dict) -> str:
    services = params.get("services") or []
    format_str = params.get("format", "")
    project = params.get("project", "")

    parts = ["docker", "compose"]
    parts += _compose_file_flags(params)
    if project:
        parts += ["-p", _sq(project)]
    parts.append("ps")
    if format_str:
        parts += ["--format", _sq(format_str)]
    for s in (services if isinstance(services, list) else []):
        parts.append(_sq(str(s)))
    return " ".join(parts)


def _build_compose_logs(params: dict) -> str:
    services = params.get("services") or []
    tail = params.get("tail")
    follow = params.get("follow", False)
    timestamps = params.get("timestamps", False)
    project = params.get("project", "")

    parts = ["docker", "compose"]
    parts += _compose_file_flags(params)
    if project:
        parts += ["-p", _sq(project)]
    parts.append("logs")

    if follow:
        parts.append("--follow")
    if timestamps:
        parts.append("--timestamps")

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

    for s in (services if isinstance(services, list) else []):
        parts.append(_sq(str(s)))
    return " ".join(parts)


_BUILDERS = {
    "ps": _build_ps,
    "run": _build_run,
    "exec": _build_exec,
    "logs": _build_logs,
    "build": _build_build,
    "pull": _build_pull,
    "stop": _build_stop,
    "rm": _build_rm,
    "inspect": _build_inspect,
    "stats": _build_stats,
    "compose_up": _build_compose_up,
    "compose_down": _build_compose_down,
    "compose_ps": _build_compose_ps,
    "compose_logs": _build_compose_logs,
}
